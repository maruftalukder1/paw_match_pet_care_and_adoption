import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { Header } from './components/Header';
import { LandingPage } from './components/LandingPage';
import { PetListings } from './components/PetListings';
import { PetDetailsModal } from './components/PetDetailsModal';
import { MatchmakerView } from './components/MatchmakerView';
import { AdoptionModal } from './components/AdoptionModal';
import { ChatSystem } from './components/ChatSystem';
import { LostFoundView } from './components/LostFoundView';
import { PetCareView } from './components/PetCareView';
import { UserDashboard } from './components/UserDashboard';
import { LocalServicesView } from './components/LocalServicesView';
import { AuthModal, type AuthMode as AuthModalMode } from './components/AuthModal';
import { ChatLoginGate } from './components/ChatLoginGate';
import { LazyPawFallback } from './components/LazyPawFallback';

/**
 * Code-split views that are never on the first-paint path (home/pets/chat).
 * Lazy chunks load only when the user navigates to them; Suspense wraps them
 * at their activeTab render sites below. Props and JSX structure unchanged.
 * (MatchmakerView stays eager — 17.7KB source, below the split threshold.)
 */
const ProfileView = lazy(() => import('./components/ProfileView'));
const AdminDashboard = lazy(() => import('./components/AdminDashboard'));

import {
  SEED_USERS,
  SEED_PETS,
  SEED_APPLICATIONS,
  SEED_LOST_FOUND,
  SEED_CONVERSATIONS,
  SEED_MESSAGES,
  SEED_MEDICAL_RECORDS,
  SEED_VACCINATIONS,
  SEED_SERVICES,
  SEED_NOTIFICATIONS,
} from './data/seedData';

import {
  Pet,
  AnyUser,
  AdoptionApplication,
  LostFoundReport,
  Conversation,
  ChatMessage,
  MessageAttachment,
  MedicalRecord,
  VaccinationRecord,
  VetAppointment,
  ServiceItem,
  ServiceBooking,
  AppNotification,
  ActivityLog,
} from './types';

import { nowISO, todayISO } from './utils/time';
import { exportCsv } from './utils/csv';
import { auditLogColumns, userColumns, petColumns, applicationColumns } from './utils/csvExports';
import { dataAdapter } from './lib/dataAdapter';
import { fetchUserByEmail, updateUserRow, userRowForDb, isLiveAuth } from './lib/authFlow';
import { supabase } from './lib/supabaseClient';
import { isRecoveryHashLink } from './utils/auth';
import { ToastViewport, ToastItem } from './components/Toast';
import { CallProvider } from './lib/CallContext';

/**
 * Safe localStorage loader — a corrupt value must never crash the app.
 * Returns the fallback when the key is missing or unparsable.
 */
function loadState<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    console.warn(`[PawMatch] Could not parse localStorage key "${key}" — using defaults.`);
    return fallback;
  }
}

/**
 * Renders a call duration in seconds as m:ss (e.g. 75 -> "1:15").
 * Exported so the call overlay / call-log workers can reuse it.
 */
export function formatCallDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
/** Local alias used by the attachment preview helpers below. */
const fmtDuration = formatCallDuration;

/** Human-readable preview line for a call-log attachment. */
function callLogText(a: MessageAttachment): string {
  const kindLabel = a.callType === 'video' ? 'Video' : 'Audio';
  let suffix = '';
  if (a.outcome === 'missed') suffix = ' · missed';
  else if (a.outcome === 'declined') suffix = ' · declined';
  else if (typeof a.durationSec === 'number') suffix = ` · ${fmtDuration(a.durationSec)}`;
  return `${kindLabel} call${suffix}`;
}

/**
 * Preview string for an attachment-only message (used for conversation
 * previews and notification bodies when the text content is empty).
 */
function attachmentPreviewText(a: MessageAttachment): string {
  switch (a.kind) {
    case 'image':
      return '📷 Photo';
    case 'audio':
      return '🎤 Voice message';
    case 'file':
      return `📎 ${a.name || 'File'}`;
    case 'calllog':
      return callLogText(a);
    default:
      return '';
  }
}

export default function App() {
  // App navigation state
  const [activeTab, setActiveTab] = useState<string>('home');
  const [searchFilterQuery, setSearchFilterQuery] = useState<string>('');
  const [activeConversationId, setActiveConversationId] = useState<string>('conv-1');

  // App-wide toast feedback (auto-dismissing, transform/opacity animations only)
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);
  const showToast = useCallback(
    (message: string, kind: 'success' | 'info' = 'success') => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev.slice(-2), { id, message, kind }]);
      window.setTimeout(() => dismissToast(id), 3200);
    },
    [dismissToast]
  );

  // ---- MSGFIX: failed-send tracking -------------------------------------
  // Ids of own messages whose LIVE write ultimately failed. Kept in React
  // state (not localStorage) so a reload re-derives truth from the server.
  // The thread shows these with a visible "Not sent — retry" affordance;
  // a message is NEVER silently dropped in live mode.
  const [failedMessageIds, setFailedMessageIds] = useState<Set<string>>(new Set());
  const failedMessageIdsRef = useRef<Set<string>>(failedMessageIds);
  failedMessageIdsRef.current = failedMessageIds;

  const markMessageFailed = useCallback(
    (msgId: string) => {
      setFailedMessageIds((prev) => (prev.has(msgId) ? prev : new Set(prev).add(msgId)));
      showToast('⚠️ Message failed to send — tap the message to retry', 'info');
    },
    [showToast]
  );
  const clearMessageFailed = useCallback((msgId: string) => {
    setFailedMessageIds((prev) => {
      if (!prev.has(msgId)) return prev;
      const next = new Set(prev);
      next.delete(msgId);
      return next;
    });
  }, []);

  // Primary Domain State with LocalStorage Persistence
  const [users, setUsers] = useState<AnyUser[]>(() => loadState('pawmatch_users', SEED_USERS));

  const [currentUser, setCurrentUser] = useState<AnyUser | null>(() => {
    // Explicit logged-out marker set by handleLogout: logout must stick,
    // even on the published page where storage is fresh per session.
    try {
      if (localStorage.getItem('pawmatch_logged_out') === '1') return null;
    } catch {
      /* storage unavailable — fall through */
    }
    let raw: string | null = null;
    try {
      raw = localStorage.getItem('pawmatch_current_user');
    } catch {
      /* ignore */
    }
    // First-ever visit starts LOGGED OUT — no demo account is silently
    // assumed. Explicit logins restore from the saved session; explicit
    // logout stays sticky via the marker checked above.
    if (!raw) return null;
    try {
      return (JSON.parse(raw) as AnyUser | null) ?? null;
    } catch {
      return null;
    }
  });

  // Ref mirror of currentUser.id for the realtime subscription closures
  // (the subscribe effect mounts once, so it must not read stale state).
  const currentUserIdRef = useRef<string | undefined>(currentUser?.id);
  currentUserIdRef.current = currentUser?.id;

  const [pets, setPets] = useState<Pet[]>(() => loadState('pawmatch_pets', SEED_PETS));

  const [applications, setApplications] = useState<AdoptionApplication[]>(() =>
    loadState('pawmatch_applications', SEED_APPLICATIONS)
  );

  const [lostFound, setLostFound] = useState<LostFoundReport[]>(() =>
    loadState('pawmatch_lost_found', SEED_LOST_FOUND)
  );

  const [conversations, setConversations] = useState<Conversation[]>(() =>
    loadState('pawmatch_conversations', SEED_CONVERSATIONS)
  );

  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    loadState('pawmatch_messages', SEED_MESSAGES)
  );

  const [medicalRecords, setMedicalRecords] = useState<MedicalRecord[]>(() =>
    loadState('pawmatch_med_records', SEED_MEDICAL_RECORDS)
  );

  const [vaccinations, setVaccinations] = useState<VaccinationRecord[]>(() =>
    loadState('pawmatch_vaccinations', SEED_VACCINATIONS)
  );

  const [appointments, setAppointments] = useState<VetAppointment[]>(() =>
    loadState('pawmatch_appointments', [
      {
        id: 'appt-1',
        petId: 'pet-1',
        petName: 'Bruno',
        vetId: 'u-vet-1',
        vetName: 'Dr. Sarah Bennett',
        clinicName: 'Central Care Vet Clinic',
        date: '2024-10-15',
        timeSlot: '10:00 AM',
        reason: 'Annual Vaccination Booster & Health Check',
        status: 'Scheduled',
      },
    ])
  );

  const [services] = useState<ServiceItem[]>(SEED_SERVICES);
  const [serviceBookings, setServiceBookings] = useState<ServiceBooking[]>(() =>
    loadState('pawmatch_service_bookings', [])
  );

  // Favorites are stored per user id so one device can hold several accounts.
  const [favoriteMap, setFavoriteMap] = useState<Record<string, string[]>>(() =>
    loadState('pawmatch_favorites', { 'u-adopter-1': ['pet-1', 'pet-2'] })
  );
  const favorites = favoriteMap[currentUser?.id ?? 'guest'] ?? [];

  const [notifications, setNotifications] = useState<AppNotification[]>(() =>
    loadState('pawmatch_notifications', SEED_NOTIFICATIONS)
  );

  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>(() =>
    loadState('pawmatch_activity_logs', [
      {
        id: 'log-1',
        timestamp: '2024-10-05 10:24',
        actor: 'Rahim Chowdhury',
        action: 'Adoption Application Submitted',
        details: 'Submitted formal application for Bruno (Labrador Retriever).',
      },
      {
        id: 'log-2',
        timestamp: '2024-10-05 09:30',
        actor: 'Shelter Dhaka',
        action: 'Adoption Application Approved',
        details: 'Approved Sara Khan for Luna (Persian Cat). Pet status updated to Adopted.',
      },
    ])
  );

  // Modals state
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authInitialMode, setAuthInitialMode] = useState<AuthModalMode>('login');
  const [authOpenKey, setAuthOpenKey] = useState(0);
  const [selectedPet, setSelectedPet] = useState<Pet | null>(null);
  const [petToApply, setPetToApply] = useState<Pet | null>(null);

  /** Open the auth modal straight into a specific step (login default). */
  const openAuth = (mode: AuthModalMode = 'login') => {
    setAuthInitialMode(mode);
    setAuthOpenKey((k) => k + 1);
    setIsAuthOpen(true);
  };

  // Sync every slice to local storage (fallback layer persists ALL state)
  useEffect(() => {
    localStorage.setItem('pawmatch_users', JSON.stringify(users));
  }, [users]);

  useEffect(() => {
    localStorage.setItem('pawmatch_current_user', JSON.stringify(currentUser));
  }, [currentUser]);

  useEffect(() => {
    localStorage.setItem('pawmatch_pets', JSON.stringify(pets));
  }, [pets]);

  useEffect(() => {
    localStorage.setItem('pawmatch_applications', JSON.stringify(applications));
  }, [applications]);

  useEffect(() => {
    localStorage.setItem('pawmatch_messages', JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    localStorage.setItem('pawmatch_conversations', JSON.stringify(conversations));
  }, [conversations]);

  useEffect(() => {
    localStorage.setItem('pawmatch_notifications', JSON.stringify(notifications));
  }, [notifications]);

  useEffect(() => {
    localStorage.setItem('pawmatch_lost_found', JSON.stringify(lostFound));
  }, [lostFound]);

  useEffect(() => {
    localStorage.setItem('pawmatch_med_records', JSON.stringify(medicalRecords));
  }, [medicalRecords]);

  useEffect(() => {
    localStorage.setItem('pawmatch_vaccinations', JSON.stringify(vaccinations));
  }, [vaccinations]);

  useEffect(() => {
    localStorage.setItem('pawmatch_appointments', JSON.stringify(appointments));
  }, [appointments]);

  useEffect(() => {
    localStorage.setItem('pawmatch_service_bookings', JSON.stringify(serviceBookings));
  }, [serviceBookings]);

  useEffect(() => {
    localStorage.setItem('pawmatch_favorites', JSON.stringify(favoriteMap));
  }, [favoriteMap]);

  useEffect(() => {
    localStorage.setItem('pawmatch_activity_logs', JSON.stringify(activityLogs));
  }, [activityLogs]);

  // ---- Password-recovery link handling (live mode only) -----------------
  // The Supabase recovery email links back to this app with
  // `#access_token=...&type=recovery`. supabase-js consumes the fragment
  // and fires PASSWORD_RECOVERY once the recovery session exists; the
  // synchronous fragment check covers the case where that event fired
  // before this subscription attached. Either way the user lands on the
  // set-new-password screen — never on a dead end.
  useEffect(() => {
    if (!supabase) return;
    const cleanHash = () => {
      try {
        window.history.replaceState(
          null,
          '',
          window.location.pathname + window.location.search
        );
      } catch {
        /* ignore */
      }
    };
    if (isRecoveryHashLink(window.location.hash)) {
      cleanHash();
      openAuth('recovery');
      return;
    }
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        cleanHash();
        openAuth('recovery');
      }
    });
    return () => {
      data.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Supabase: initial load (live mode only) -------------------------
  // In live mode the shared DB is the source of truth for messaging so a
  // fresh visitor sees the same demo conversations as everyone else.
  useEffect(() => {
    if (dataAdapter.mode !== 'supabase' || !currentUser) return;
    let cancelled = false;
    dataAdapter
      .loadInitial(currentUser.id)
      .then((snap) => {
        if (cancelled || !snap) return;
        setConversations(snap.conversations);
        setMessages(snap.messages);
        setNotifications(snap.notifications);
      })
      .catch((err) => {
        console.error('[PawMatch] Failed to load from Supabase, keeping local data:', err);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Supabase: initial pet load (live mode only) -----------------------
  // Mirrors the messaging bootstrap: in live mode the shared DB is the source
  // of truth for pet listings, so a pet added on one device appears on all.
  // The 15 seed pets exist in the DB, so first live boot renders identically.
  // `livePetsLoading` drives the shimmer skeleton on the Find Pets grid so
  // the list never flashes empty while the shared list is being fetched.
  const [livePetsLoading, setLivePetsLoading] = useState(false);
  useEffect(() => {
    if (dataAdapter.mode !== 'supabase') return;
    let cancelled = false;
    setLivePetsLoading(true);
    dataAdapter
      .loadPets()
      .then((livePets) => {
        if (cancelled || !livePets) return;
        // Realtime inserts that arrived before the load finished could
        // already be in state — dedupe by id so nothing is lost or doubled.
        setPets((prev) => {
          const liveIds = new Set(livePets.map((p) => p.id));
          const extra = prev.filter((p) => !liveIds.has(p.id));
          return [...extra, ...livePets];
        });
      })
      .catch((err) => {
        console.error('[PawMatch] Failed to load pets from Supabase, keeping local data:', err);
      })
      .finally(() => {
        if (!cancelled) setLivePetsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- Supabase: realtime incoming messages + read receipts -------------
  useEffect(() => {
    if (dataAdapter.mode !== 'supabase') return;
    const unsubscribe = dataAdapter.subscribeMessages(
      (incoming) => {
        setMessages((prev) => {
          // Skip our own echo — the sender already added it optimistically.
          if (prev.some((m) => m.id === incoming.id)) return prev;
          return [...prev, incoming];
        });
        setConversations((prev) => {
          if (!prev.some((c) => c.id === incoming.conversationId)) {
            // MSGFIX: this conversation was created on another device (e.g.
            // a new user's first message to Admin) — fetch it once so the
            // thread shows up instead of being dropped silently.
            dataAdapter
              .loadConversation(incoming.conversationId)
              .then((conv) => {
                if (!conv) return;
                setConversations((p) =>
                  p.some((c) => c.id === conv.id) ? p : [conv, ...p]
                );
              })
              .catch((err) =>
                console.error('[PawMatch] Failed to load incoming conversation:', err)
              );
            return prev;
          }
          return prev.map((c) =>
            c.id === incoming.conversationId
              ? {
                  ...c,
                  lastMessage: incoming.content,
                  lastMessageTime: incoming.createdAt ?? c.lastMessageTime,
                  lastMessageAt: incoming.createdAt ?? c.lastMessageAt,
                }
              : c
          );
        });
      },
      // Read receipt: the OTHER participant opened the conversation and our
      // message flipped is_read. Only ever applied to OUR OWN sent messages
      // (never incoming ones), so receipts stay within the participants.
      (readMsg) => {
        const myId = currentUserIdRef.current;
        if (!myId || readMsg.senderId !== myId) return;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === readMsg.id && !m.isRead ? { ...m, isRead: true } : m
          )
        );
      }
    );
    return unsubscribe;
  }, []);

  // ---- MSGFIX: thread-open server refresh (live mode only) ----------------
  // When a thread is opened, pull its history from the server so a fresh
  // device/origin always renders the real persisted messages — never an
  // empty shell left over from a failed write. Server rows win; local
  // messages still flagged failed (user can retry) are preserved.
  useEffect(() => {
    if (dataAdapter.mode !== 'supabase' || !activeConversationId) return;
    let cancelled = false;
    dataAdapter
      .loadMessages(activeConversationId)
      .then((rows) => {
        if (cancelled || !rows) return;
        setMessages((prev) => {
          const serverIds = new Set(rows.map((r) => r.id));
          const failed = failedMessageIdsRef.current;
          const preserved = prev.filter(
            (m) =>
              m.conversationId === activeConversationId &&
              failed.has(m.id) &&
              !serverIds.has(m.id)
          );
          return [
            ...prev.filter((m) => m.conversationId !== activeConversationId),
            ...rows,
            ...preserved,
          ];
        });
      })
      .catch((err) =>
        console.error('[PawMatch] Failed to refresh thread from server:', err)
      );
    return () => {
      cancelled = true;
    };
  }, [activeConversationId]);

  // ---- Supabase: realtime pet insert/update/delete ----------------------
  // Merges remote changes into the shared `pets` state every consumer reads,
  // so no consumer component needs edits. Dedupe is by id: an INSERT for an
  // id we already applied optimistically is a no-op, and a DELETE racing a
  // local optimistic delete removes by id without resurrecting the row.
  useEffect(() => {
    if (dataAdapter.mode !== 'supabase') return;
    const unsubscribe = dataAdapter.subscribePets((e) => {
      if (e.type === 'insert' || e.type === 'update') {
        const incoming = e.pet!;
        setPets((prev) => {
          if (prev.some((p) => p.id === incoming.id)) {
            // Replace by id — preserves state order and clears any stale
            // `unsynced` marker now that the row is confirmed server-side.
            return prev.map((p) => (p.id === incoming.id ? incoming : p));
          }
          return [incoming, ...prev];
        });
      } else if (e.type === 'delete' && e.petId) {
        setPets((prev) => prev.filter((p) => p.id !== e.petId));
      }
    });
    return unsubscribe;
  }, []);

  // ---- Supabase: initial load for applications / lost-found / healthcare -
  // Full live-sync round: in live mode the shared DB is the source of truth
  // for these slices, exactly like pets above. The DB holds the same seed
  // rows, so first live boot renders identically. Locally created rows that
  // exist in state but not yet in the DB (e.g. added while offline) are
  // preserved by the merge — nothing is ever dropped.
  useEffect(() => {
    if (dataAdapter.mode !== 'supabase') return;
    let cancelled = false;
    dataAdapter
      .loadApplications()
      .then((live) => {
        if (cancelled || !live) return;
        setApplications((prev) => {
          const ids = new Set(live.map((a) => a.id));
          return [...prev.filter((a) => !ids.has(a.id)), ...live];
        });
      })
      .catch((err) =>
        console.error('[PawMatch] Failed to load applications from Supabase, keeping local data:', err)
      );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (dataAdapter.mode !== 'supabase') return;
    let cancelled = false;
    dataAdapter
      .loadLostFound()
      .then((live) => {
        if (cancelled || !live) return;
        setLostFound((prev) => {
          const ids = new Set(live.map((r) => r.id));
          return [...prev.filter((r) => !ids.has(r.id)), ...live];
        });
      })
      .catch((err) =>
        console.error('[PawMatch] Failed to load lost-found reports from Supabase, keeping local data:', err)
      );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (dataAdapter.mode !== 'supabase') return;
    let cancelled = false;
    dataAdapter
      .loadHealthcare()
      .then((live) => {
        if (cancelled || !live) return;
        setMedicalRecords((prev) => {
          const ids = new Set(live.medical.map((m) => m.id));
          return [...prev.filter((m) => !ids.has(m.id)), ...live.medical];
        });
        setVaccinations((prev) => {
          const ids = new Set(live.vaccinations.map((v) => v.id));
          return [...prev.filter((v) => !ids.has(v.id)), ...live.vaccinations];
        });
        setAppointments((prev) => {
          const ids = new Set(live.appointments.map((a) => a.id));
          return [...prev.filter((a) => !ids.has(a.id)), ...live.appointments];
        });
      })
      .catch((err) =>
        console.error('[PawMatch] Failed to load healthcare data from Supabase, keeping local data:', err)
      );
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- Supabase: realtime applications / lost-found / healthcare --------
  // Merge remote INSERT/UPDATE events by id into each slice, mirroring the
  // pets subscription above. Events for ids already in state replace the
  // local row (server truth wins); unknown ids are prepended. No DELETE
  // events: these slices expose no delete flow (no anon DELETE policy —
  // see FULLSYNC.md), so nothing can resurrect here.
  useEffect(() => {
    if (dataAdapter.mode !== 'supabase') return;
    const unsubApps = dataAdapter.subscribeApplications((incoming) => {
      setApplications((prev) =>
        prev.some((a) => a.id === incoming.id)
          ? prev.map((a) => (a.id === incoming.id ? incoming : a))
          : [incoming, ...prev]
      );
    });
    const unsubLost = dataAdapter.subscribeLostFound((incoming) => {
      setLostFound((prev) =>
        prev.some((r) => r.id === incoming.id)
          ? prev.map((r) => (r.id === incoming.id ? incoming : r))
          : [incoming, ...prev]
      );
    });
    const unsubHealth = dataAdapter.subscribeHealthcare((slice, row) => {
      if (slice === 'medical') {
        const incoming = row as MedicalRecord;
        setMedicalRecords((prev) =>
          prev.some((m) => m.id === incoming.id)
            ? prev.map((m) => (m.id === incoming.id ? incoming : m))
            : [incoming, ...prev]
        );
      } else if (slice === 'vaccination') {
        const incoming = row as VaccinationRecord;
        setVaccinations((prev) =>
          prev.some((v) => v.id === incoming.id)
            ? prev.map((v) => (v.id === incoming.id ? incoming : v))
            : [incoming, ...prev]
        );
      } else {
        const incoming = row as VetAppointment;
        setAppointments((prev) =>
          prev.some((a) => a.id === incoming.id)
            ? prev.map((a) => (a.id === incoming.id ? incoming : a))
            : [incoming, ...prev]
        );
      }
    });
    return () => {
      unsubApps();
      unsubLost();
      unsubHealth();
    };
  }, []);

  const pushNotification = useCallback((n: AppNotification) => {
    setNotifications((prev) => [n, ...prev]);
    if (dataAdapter.mode === 'supabase') {
      dataAdapter.persistNotification(n).catch((err) => {
        console.error('[PawMatch] Notification persist failed:', err);
      });
    }
  }, []);

  // Handlers
  const handleToggleFavorite = (petId: string) => {
    const scope = currentUser?.id ?? 'guest';
    const current = favoriteMap[scope] ?? [];
    const exists = current.includes(petId);
    const targetPet = pets.find((p) => p.id === petId);

    if (exists) {
      setFavoriteMap((prev) => ({ ...prev, [scope]: current.filter((id) => id !== petId) }));
      if (targetPet) showToast(`${targetPet.name} removed from favorites`, 'info');
    } else {
      if (targetPet) {
        pushNotification({
          id: `notif-${Date.now()}`,
          userId: scope,
          title: 'Saved to Favorites',
          message: `${targetPet.name} has been added to your favorites list.`,
          timestamp: nowISO(),
          type: 'match',
          isRead: false,
        });
        showToast(`${targetPet.name} added to favorites`);
      }
      setFavoriteMap((prev) => ({ ...prev, [scope]: [...current, petId] }));
    }
  };

  const handleApplyForAdoption = (pet: Pet) => {
    setSelectedPet(null);
    // Adoption applications carry the applicant's identity — guests log in first.
    if (!currentUser) {
      openAuth('login');
      showToast('Log in to apply for adoption', 'info');
      return;
    }
    setPetToApply(pet);
  };

  const handleSubmitApplication = (app: AdoptionApplication, notifyAdminInChat: boolean = true) => {
    setApplications((prev) => [app, ...prev]);

    // Full live-sync round: the application row is persisted to the shared
    // DB (idempotent upsert on id). Optimistic UI stays; on failure the user
    // gets an honest toast and the application stays local-only (same
    // discipline as pet creates) — never a silent pretend-success.
    if (dataAdapter.mode === 'supabase') {
      dataAdapter.persistApplicationCreate(app).catch((err) => {
        console.error('[PawMatch] Application persist failed:', err);
        showToast("Couldn't sync the application to the server — kept locally", 'info');
      });
    }

    // Add activity log
    const newLog: ActivityLog = {
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
      actor: app.applicantName,
      action: 'Application Submitted',
      details: `Submitted adoption application for ${app.petName}.`,
    };
    setActivityLogs((l) => [newLog, ...l]);

    const now = nowISO();

    // Add Notification for applicant
    const applicantNotif: AppNotification = {
      id: `notif-${Date.now()}`,
      userId: currentUser?.id || 'guest',
      title: 'Application Received',
      message: `Your application for ${app.petName} has been recorded and submitted for guardian review.`,
      timestamp: now,
      type: 'application',
      isRead: false,
    };

    // Add Notification for Admin supervisor
    const adminNotif: AppNotification = {
      id: `notif-${Date.now() + 1}`,
      userId: 'u-admin-1',
      title: `Adoption Application: ${app.petName}`,
      message: `${app.applicantName} applied to adopt ${app.petName} (${app.petBreed}). Review pending.`,
      timestamp: now,
      type: 'application',
      isRead: false,
    };

    pushNotification(applicantNotif);
    pushNotification(adminNotif);

    // If also messaging Admin, create a conversation & message directly to Admin
    if (notifyAdminInChat) {
      const adminId = 'u-admin-1';
      const myId = currentUser?.id || app.applicantId;
      const myName = app.applicantName;
      const convId = `conv-app-${Date.now()}`;

      const appConv: Conversation = {
        id: convId,
        participantIds: [myId, adminId],
        participantNames: [myName, 'Admin Supervisor (Adoption Desk)'],
        petId: app.petId,
        lastMessage: `Hello Admin, I have submitted an adoption application for ${app.petName} (${app.petBreed}).`,
        lastMessageTime: now,
        lastMessageAt: now,
        unreadCount: 1,
      };

      const appMsg: ChatMessage = {
        id: `msg-${Date.now() + 2}`,
        conversationId: convId,
        senderId: myId,
        senderName: myName,
        receiverId: adminId,
        content: `Hello Admin! I have just submitted my adoption application for ${app.petName} (${app.petBreed}). Reason: "${app.reason}". Please let me know if you need any additional verification!`,
        timestamp: now,
        createdAt: now,
        isRead: false, // Unread for Admin
      };

      setConversations((prev) => [appConv, ...prev]);
      setMessages((prev) => [...prev, appMsg]);
      if (dataAdapter.mode === 'supabase') {
        // MSGFIX: conversation row is awaited BEFORE the message insert —
        // the reverse order let the message win the race and die on the
        // chat_messages.conversation_id foreign key (409/23503), which the
        // old fire-and-forget .catch(console.error) swallowed silently.
        dataAdapter
          .persistConversationWithMessage(appConv, appMsg)
          .then(() => clearMessageFailed(appMsg.id))
          .catch((e) => {
            console.error('[PawMatch] Failed to persist application chat:', e);
            markMessageFailed(appMsg.id);
          });
      }
    }

    showToast(`Application for ${app.petName} submitted`);
  };

  // Feature Module 5: On approval, other applications for that pet are auto-rejected and pet becomes Adopted
  const handleApproveApplication = (appId: string) => {
    const targetApp = applications.find((a) => a.id === appId);
    if (!targetApp) return;

    // 1. Update application status
    const affected: Array<{ id: string; status: AdoptionApplication['status']; reviewNotes?: string }> = [];
    setApplications((prev) =>
      prev.map((a) => {
        if (a.id === appId) {
          affected.push({ id: a.id, status: 'Approved' });
          return { ...a, status: 'Approved', updatedAt: todayISO() };
        }
        // Auto-reject competing applications for the same pet
        if (a.petId === targetApp.petId && (a.status === 'Submitted' || a.status === 'Under Review')) {
          affected.push({
            id: a.id,
            status: 'Rejected',
            reviewNotes: 'Position filled by another approved applicant.',
          });
          return {
            ...a,
            status: 'Rejected',
            reviewNotes: 'Position filled by another approved applicant.',
            updatedAt: todayISO(),
          };
        }
        return a;
      })
    );

    // Full live-sync round: persist every affected status change (the
    // approval AND its auto-rejects) so applicants see the decision on any
    // device. A rejected batch throws and the admin is told — no silent
    // divergence between devices.
    if (dataAdapter.mode === 'supabase' && affected.length > 0) {
      dataAdapter.persistApplicationStatuses(affected).catch((err) => {
        console.error('[PawMatch] Application status persist failed:', err);
        showToast("Couldn't sync the review decision — statuses kept locally", 'info');
      });
    }

    // 2. Update Pet Status to Adopted
    setPets((prev) =>
      prev.map((p) => (p.id === targetApp.petId ? { ...p, status: 'Adopted' } : p))
    );
    if (dataAdapter.mode === 'supabase') {
      const adopted = pets.find((p) => p.id === targetApp.petId);
      if (adopted) {
        dataAdapter.persistPetUpdate({ ...adopted, status: 'Adopted' }).catch((err) => {
          console.error('[PawMatch] Pet Adopted status persist failed:', err);
        });
      }
    }

    // 3. Log Activity
    const newLog: ActivityLog = {
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
      actor: currentUser?.name || 'Administrator',
      action: 'Adoption Finalized',
      details: `Approved ${targetApp.applicantName} for ${targetApp.petName}. Auto-rejected other candidates.`,
    };
    setActivityLogs((l) => [newLog, ...l]);
  };

  const handleRejectApplication = (appId: string) => {
    setApplications((prev) =>
      prev.map((a) =>
        a.id === appId ? { ...a, status: 'Rejected', updatedAt: todayISO() } : a
      )
    );
    if (dataAdapter.mode === 'supabase') {
      dataAdapter
        .persistApplicationStatuses([{ id: appId, status: 'Rejected' }])
        .catch((err) => {
          console.error('[PawMatch] Application reject persist failed:', err);
          showToast("Couldn't sync the rejection — status kept locally", 'info');
        });
    }
  };

  const handleToggleUserStatus = (userId: string) => {
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, isActive: !u.isActive } : u))
    );
  };

  // Persisted security update for a user (failed attempts, lock, password reset)
  const handleUpdateUser = (updated: AnyUser) => {
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
  };

  // ---- Profile edits (name, phone, address, bio, avatar) ----------------
  // Local: the users[] + currentUser setters above persist to localStorage
  // via the app's sync effects. Live: also mirror the editable profile
  // fields into the public.users row. Password hashes and auth-managed
  // fields are NEVER part of this write.
  const mirrorProfileToSupabase = useCallback((u: AnyUser) => {
    (async () => {
      try {
        const existing = await fetchUserByEmail(u.email);
        if (!existing) return; // no remote row to mirror into — local save is enough
        const row = userRowForDb(u);
        delete row.password_hash; // never touch credentials on profile saves
        delete row.security_question;
        delete row.security_answer;
        await updateUserRow(existing.id, {
          name: row.name,
          phone: row.phone,
          profile_json: row.profile_json,
        });
      } catch (err) {
        console.error('[PawMatch] Profile mirror to Supabase failed (kept local):', err);
      }
    })();
  }, []);

  const handleUpdateProfile = (updated: AnyUser) => {
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    setCurrentUser(updated);
    if (updated.authManaged && isLiveAuth()) {
      mirrorProfileToSupabase(updated);
    }
    showToast('Profile updated');
  };

  // --- Auth session markers (logout must stick across reloads) ---
  const clearLoggedOutMarker = () => {
    try {
      localStorage.removeItem('pawmatch_logged_out');
    } catch {
      /* ignore */
    }
  };
  const handleLoginUser = (u: AnyUser) => {
    clearLoggedOutMarker();
    setCurrentUser(u);
  };
  const handleRegisterUser = (u: AnyUser) => {
    clearLoggedOutMarker();
    setUsers((prev) => [...prev, u]);
    setCurrentUser(u);
  };
  const handleLogout = () => {
    setCurrentUser(null);
    setActiveTab('home');
    try {
      localStorage.setItem('pawmatch_logged_out', '1');
    } catch {
      /* ignore */
    }
  };

  // Mark only the CURRENT user's notifications as read (never touch others')
  const handleMarkAllNotificationsRead = () => {
    const scope = currentUser?.id ?? 'guest';
    setNotifications((prev) =>
      prev.map((n) => (n.userId === scope ? { ...n, isRead: true } : n))
    );
  };

  // Mark conversation and its messages as read
  const handleSelectConversation = (convId: string) => {
    const myId = currentUser?.id;
    const hadUnread = messages.some(
      (m) => m.conversationId === convId && m.receiverId === myId && !m.isRead
    );
    setActiveConversationId(convId);
    setMessages((prev) =>
      prev.map((m) =>
        m.conversationId === convId && m.receiverId === currentUser?.id
          ? { ...m, isRead: true }
          : m
      )
    );
    setConversations((prev) =>
      prev.map((c) => (c.id === convId ? { ...c, unreadCount: 0 } : c))
    );
    // Live mode: persist the read state so the SENDER's screen flips to ✓✓
    // via the realtime UPDATE on chat_messages. Local path untouched —
    // the localStorage sync effect above owns local persistence.
    if (dataAdapter.mode === 'supabase' && myId && hadUnread) {
      dataAdapter.markConversationRead(convId, myId).catch((err) => {
        console.error('[PawMatch] Mark-read persist failed:', err);
      });
    }
  };

  const buildInitialMessage = (
    convId: string,
    receiverId: string,
    receiverLabel: string,
    content: string,
    petId?: string
  ): { conv: Conversation; msg: ChatMessage; notif: AppNotification } => {
    const myId = currentUser?.id || 'u-adopter-1';
    const myName = currentUser?.name || 'Jaann Rahman';
    const now = nowISO();

    const conv: Conversation = {
      id: convId,
      participantIds: [myId, receiverId],
      participantNames: [myName, receiverLabel],
      petId,
      lastMessage: content,
      lastMessageTime: now,
      lastMessageAt: now,
      unreadCount: 1,
    };

    const msg: ChatMessage = {
      id: `msg-${Date.now()}`,
      conversationId: convId,
      senderId: myId,
      senderName: myName,
      receiverId,
      content,
      timestamp: now,
      createdAt: now,
      isRead: false,
    };

    const notif: AppNotification = {
      id: `notif-${Date.now()}`,
      userId: receiverId,
      title: `New Message from ${myName}`,
      message: content.length > 60 ? content.substring(0, 60) + '...' : content,
      timestamp: now,
      type: 'message',
      isRead: false,
    };

    return { conv, msg, notif };
  };

  const persistChatObjects = (conv: Conversation, msg: ChatMessage, notif: AppNotification) => {
    setConversations((prev) => [conv, ...prev]);
    setMessages((prev) => [...prev, msg]);
    pushNotification(notif);
    if (dataAdapter.mode === 'supabase') {
      // MSGFIX: safe-ordered write (conversation first, awaited). A final
      // failure now surfaces as a failed-send state instead of vanishing.
      dataAdapter
        .persistConversationWithMessage(conv, msg)
        .then(() => clearMessageFailed(msg.id))
        .catch((e) => {
          console.error('[PawMatch] Failed to persist new-conversation chat:', e);
          markMessageFailed(msg.id);
        });
    }
  };

  // Start direct chat with Admin about a pet or general adoption
  const handleStartMessageToAdmin = (pet?: Pet) => {
    // Messaging needs a real account — guests go to the login modal
    // instead of silently chatting as the demo user. The pet detail sheet
    // is closed first so the login modal is actually visible (it renders
    // earlier in the DOM than the detail modal at the same z-index).
    if (selectedPet) setSelectedPet(null);
    if (!currentUser) {
      openAuth('login');
      showToast('Log in to message the Admin', 'info');
      return;
    }
    const adminId = 'u-admin-1';
    const myId = currentUser.id;

    const targetConv = conversations.find(
      (c) =>
        c.participantIds.includes(myId) &&
        c.participantIds.includes(adminId) &&
        (!pet || c.petId === pet.id)
    );

    const initialText = pet
      ? `Hi Admin! I want to adopt ${pet.name} (${pet.breed}). Could you guide me through the adoption process and approval?`
      : `Hi Admin! I have an inquiry about adopting a pet through PawMatch.`;

    if (!targetConv) {
      const { conv, msg, notif } = buildInitialMessage(
        `conv-admin-${Date.now()}`,
        adminId,
        'Admin Supervisor (Adoption Desk)',
        initialText,
        pet?.id
      );
      persistChatObjects(conv, msg, notif);
      setActiveConversationId(conv.id);
      handleSelectConversation(conv.id);
    } else {
      setActiveConversationId(targetConv.id);
      handleSelectConversation(targetConv.id);
    }
    setActiveTab('chat');
  };

  // Start chat with any specific user
  const handleStartChatWithUser = (targetUser: AnyUser) => {
    if (!currentUser) {
      openAuth('login');
      showToast('Log in to start a conversation', 'info');
      return;
    }
    const myId = currentUser.id;

    const targetConv = conversations.find(
      (c) => c.participantIds.includes(myId) && c.participantIds.includes(targetUser.id)
    );

    if (!targetConv) {
      const { conv, msg, notif } = buildInitialMessage(
        `conv-${Date.now()}`,
        targetUser.id,
        `${targetUser.name} (${targetUser.role})`,
        `Hi ${targetUser.name}! Nice to connect on PawMatch.`
      );
      persistChatObjects(conv, msg, notif);
      setActiveConversationId(conv.id);
    } else {
      setActiveConversationId(targetConv.id);
    }
    setActiveTab('chat');
  };

  // Start chat with pet owner / shelter
  const handleStartMessageFromPet = (pet: Pet) => {
    setSelectedPet(null);
    if (!currentUser) {
      openAuth('login');
      showToast('Log in to message the pet guardian', 'info');
      return;
    }
    const myId = currentUser.id;

    const targetConv = conversations.find(
      (c) =>
        c.participantIds.includes(myId) &&
        (c.petId === pet.id || c.participantIds.includes(pet.ownerId))
    );

    if (!targetConv) {
      const { conv, msg, notif } = buildInitialMessage(
        `conv-${Date.now()}`,
        pet.ownerId,
        `${pet.name}'s Guardian (${pet.ownerName})`,
        `Hi! I am interested in adopting ${pet.name} (${pet.breed}). Is ${pet.name} available for a visit?`,
        pet.id
      );
      persistChatObjects(conv, msg, notif);
      setActiveConversationId(conv.id);
      handleSelectConversation(conv.id);
    } else {
      setActiveConversationId(targetConv.id);
      handleSelectConversation(targetConv.id);
    }
    setActiveTab('chat');
  };

  const handleSendMessage = (conversationId: string, content: string, attachment?: MessageAttachment) => {
    const currentConv = conversations.find((c) => c.id === conversationId);
    if (!currentConv) return;
    // Guests never reach the chat UI (login gate); never send as the demo user.
    if (!currentUser) return;

    const myId = currentUser.id;
    const myName = currentUser.name;

    // Accurately resolve other participant ID
    const receiverId =
      currentConv.participantIds.find((id) => id !== myId) ||
      (currentConv.participantIds[0] === myId ? currentConv.participantIds[1] : currentConv.participantIds[0]);

    const now = nowISO();

    // Preview text for conversation rows and notifications: real content when
    // present, otherwise an attachment summary (📷 Photo, 🎤 Voice message, ...).
    const previewText = content || (attachment ? attachmentPreviewText(attachment) : '');

    const newMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      conversationId,
      senderId: myId,
      senderName: myName,
      receiverId,
      content,
      timestamp: now,
      createdAt: now,
      isRead: false, // Must be unread for receiver
      attachment,
    };

    setMessages((prev) => [...prev, newMsg]);

    setConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId
          ? { ...c, lastMessage: previewText, lastMessageTime: now, lastMessageAt: now }
          : c
      )
    );

    // Notify receiver (they read it themselves in live mode via Realtime)
    const notif: AppNotification = {
      id: `notif-${Date.now()}`,
      userId: receiverId,
      title: `New Message from ${myName}`,
      message: previewText.length > 60 ? previewText.substring(0, 60) + '...' : previewText,
      timestamp: now,
      type: 'message',
      isRead: false,
    };
    pushNotification(notif);

    showToast('Message sent');

    if (dataAdapter.mode === 'supabase') {
      const conv = conversations.find((c) => c.id === conversationId);
      if (conv) {
        const updated = { ...conv, lastMessage: previewText, lastMessageTime: now, lastMessageAt: now };
        // MSGFIX: the message write must durably land — a failure now
        // marks the bubble failed with a retry instead of disappearing.
        // The conversation-preview write is cosmetic; its failure is logged.
        dataAdapter
          .persistMessage(newMsg)
          .then(() => clearMessageFailed(newMsg.id))
          .catch((e) => {
            console.error('[PawMatch] Failed to persist message:', e);
            markMessageFailed(newMsg.id);
          });
        dataAdapter
          .persistConversation(updated)
          .catch((e) => console.error('[PawMatch] Failed to persist conversation preview:', e));
      }
    }

    // NOTE (v2): the old fake shelter auto-reply was removed on purpose.
    // In live (Supabase) mode the real person on the other device replies.
    // In demo mode no fake reply is fabricated — the conversation simply
    // waits, and the chat UI says so honestly.
  };

  // MSGFIX: retry a failed send. Re-runs the exact same safe-ordered write
  // (conversation first, then message); the bubble leaves the failed state
  // on success, and returns to it on another ultimate failure.
  const retryFailedMessage = useCallback(
    (msgId: string) => {
      if (dataAdapter.mode !== 'supabase') return;
      const msg = messages.find((m) => m.id === msgId);
      if (!msg) return;
      clearMessageFailed(msgId);
      const conv = conversations.find((c) => c.id === msg.conversationId);
      // Always retry through the idempotent conversation+message path:
      // the conversation upsert is a no-op if it already exists, and the
      // message upsert cannot duplicate even if the original write
      // actually landed but its response was lost.
      const attempt = conv
        ? dataAdapter.persistConversationWithMessage(conv, msg)
        : dataAdapter.persistMessage(msg);
      attempt
        .then(() => clearMessageFailed(msgId))
        .catch((e) => {
          console.error('[PawMatch] Retry of failed message failed:', e);
          markMessageFailed(msgId);
        });
    },
    [messages, conversations, clearMessageFailed, markMessageFailed]
  );

  // DEV-ONLY test hook (stripped from production builds by import.meta.env.DEV):
  // lets the headless scroll-stability test inject an incoming message exactly
  // the way the Supabase realtime subscription would (setMessages append).
  // Used to verify the "message received while scrolled up" behavior.
  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__pawInjectReceived = (
      conversationId: string,
      content: string
    ): boolean => {
      const targetId = conversationId || activeConversationId;
      const conv = conversations.find((c) => c.id === targetId);
      if (!conv || !currentUser) return false;
      const otherId =
        conv.participantIds.find((id) => id !== currentUser.id) ?? 'u-admin-1';
      const otherName =
        conv.participantNames[conv.participantIds.indexOf(otherId)] ?? 'Them';
      const now = nowISO();
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-test-${Date.now()}`,
          conversationId: targetId,
          senderId: otherId,
          senderName: otherName,
          receiverId: currentUser.id,
          content,
          timestamp: now,
          createdAt: now,
          isRead: false,
        },
      ]);
      return true;
    };
  }

  const handleBookAppointment = (appt: VetAppointment) => {
    setAppointments((prev) => [appt, ...prev]);

    // Full live-sync round: the booking is persisted to the shared DB.
    if (dataAdapter.mode === 'supabase') {
      dataAdapter.persistAppointmentCreate(appt).catch((err) => {
        console.error('[PawMatch] Appointment persist failed:', err);
        showToast("Couldn't sync the appointment — kept locally", 'info');
      });
    }

    showToast(`Appointment booked with ${appt.vetName}`);

    pushNotification({
      id: `notif-${Date.now()}`,
      userId: currentUser?.id || 'guest',
      title: 'Appointment Scheduled',
      message: `Confirmed appointment with ${appt.vetName} for ${appt.petName} on ${appt.date} at ${appt.timeSlot}.`,
      timestamp: nowISO(),
      type: 'health',
      isRead: false,
    });
  };

  // ---- Healthcare records (full live-sync round) -------------------------
  // The app previously showed seed medical/vaccination data read-only; the
  // vet/shelter dashboard forms below add records which now persist to the
  // shared DB in live mode (insert-only: the policies grant anon INSERT for
  // medical_records and vaccinations, no UPDATE/DELETE — edits of existing
  // rows are a dashboard-SQL follow-up, flagged in FULLSYNC.md).
  const handleAddMedicalRecord = (rec: MedicalRecord) => {
    setMedicalRecords((prev) => [rec, ...prev]);
    if (dataAdapter.mode === 'supabase') {
      dataAdapter.persistMedicalCreate(rec).catch((err) => {
        console.error('[PawMatch] Medical record persist failed:', err);
        showToast("Couldn't sync the medical record — kept locally", 'info');
      });
    }
    showToast(`Medical record added for ${rec.petName}`);
  };

  const handleAddVaccination = (vac: VaccinationRecord) => {
    setVaccinations((prev) => [vac, ...prev]);
    if (dataAdapter.mode === 'supabase') {
      dataAdapter.persistVaccinationCreate(vac).catch((err) => {
        console.error('[PawMatch] Vaccination persist failed:', err);
        showToast("Couldn't sync the vaccination — kept locally", 'info');
      });
    }
    showToast(`Vaccination recorded for ${vac.petName}`);
  };

  const handleUpdateAppointmentStatus = (id: string, status: VetAppointment['status']) => {
    setAppointments((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
    if (dataAdapter.mode === 'supabase') {
      dataAdapter.persistAppointmentStatus(id, status).catch((err) => {
        console.error('[PawMatch] Appointment status persist failed:', err);
        showToast("Couldn't sync the appointment status — kept locally", 'info');
      });
    }
    showToast(`Appointment ${status.toLowerCase()}`);
  };

  const handleAddLostFoundReport = (report: LostFoundReport) => {
    setLostFound((prev) => [report, ...prev]);

    // Full live-sync round: the report (photo included, as photo_url) is
    // persisted to the shared DB. Optimistic UI + honest toast on failure.
    if (dataAdapter.mode === 'supabase') {
      dataAdapter.persistLostFoundCreate(report).catch((err) => {
        console.error('[PawMatch] Lost-found report persist failed:', err);
        showToast("Couldn't sync the report to the server — kept locally", 'info');
      });
    }

    pushNotification({
      id: `notif-${Date.now()}`,
      userId: currentUser?.id || 'guest',
      title: 'Report Broadcasted',
      message: `Your ${report.type} pet report for ${report.petName} has been distributed to local shelters.`,
      timestamp: nowISO(),
      type: 'lost_found',
      isRead: false,
    });
  };

  const handleResolveLostFound = (id: string) => {
    setLostFound((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: 'Resolved' } : r))
    );
    if (dataAdapter.mode === 'supabase') {
      dataAdapter.persistLostFoundResolve(id).catch((err) => {
        console.error('[PawMatch] Lost-found resolve persist failed:', err);
        showToast("Couldn't sync the resolution — status kept locally", 'info');
      });
    }
  };

  const handleBookService = (booking: ServiceBooking) => {
    setServiceBookings((prev) => [booking, ...prev]);

    showToast(`Booked: ${booking.serviceTitle}`);

    pushNotification({
      id: `notif-${Date.now()}`,
      userId: currentUser?.id || 'guest',
      title: 'Service Booked',
      message: `Reserved ${booking.serviceTitle} for ${booking.petName} on ${booking.bookingDate}.`,
      timestamp: nowISO(),
      type: 'booking',
      isRead: false,
    });
  };

  // ---- Pet Management (Pranty's module: add / edit / delete) ------------
  // In live mode every write is optimistic: state updates immediately for an
  // instant UI, then the adapter persists to the shared DB. On server failure
  // the pet stays local with an `unsynced` flag (visible as a "Not synced"
  // badge on its card) and the user gets an honest toast. In local mode the
  // code path below is untouched (adapter.mode gate) — behavior identical.
  const markPetUnsynced = (petId: string) => {
    setPets((prev) => prev.map((p) => (p.id === petId ? { ...p, unsynced: true } : p)));
    showToast("Couldn't sync to the server — kept locally", 'info');
  };

  const handleAddPet = (pet: Pet) => {
    setPets((prev) => [pet, ...prev]);
    if (dataAdapter.mode === 'supabase') {
      dataAdapter.persistPetCreate(pet).catch((err) => {
        console.error('[PawMatch] Pet create persist failed:', err);
        markPetUnsynced(pet.id);
      });
    }
    showToast(`${pet.name} added to listings`);
  };

  const handleUpdatePet = (pet: Pet) => {
    setPets((prev) => prev.map((p) => (p.id === pet.id ? { ...pet, unsynced: false } : p)));
    if (dataAdapter.mode === 'supabase') {
      dataAdapter.persistPetUpdate(pet).catch((err) => {
        console.error('[PawMatch] Pet update persist failed:', err);
        markPetUnsynced(pet.id);
      });
    }
    showToast(`${pet.name}'s listing updated`);
  };

  const handleDeletePet = (petId: string) => {
    // Capture the row before removing it so a failed server delete can
    // restore it (kept locally + `unsynced` flag).
    let doomed: Pet | undefined;
    setPets((prev) => {
      doomed = prev.find((p) => p.id === petId);
      return prev.filter((p) => p.id !== petId);
    });
    // Clean up favorites referencing the deleted pet
    setFavoriteMap((prev) => {
      const next: Record<string, string[]> = {};
      for (const [uid, ids] of Object.entries(prev)) {
        next[uid] = ids.filter((id) => id !== petId);
      }
      return next;
    });
    if (dataAdapter.mode === 'supabase' && doomed) {
      const restore = doomed;
      dataAdapter.persistPetDelete(petId).catch((err) => {
        console.error('[PawMatch] Pet delete persist failed:', err);
        // Server delete failed: put the pet back locally, flagged unsynced.
        setPets((prev) =>
          prev.some((p) => p.id === petId) ? prev : [{ ...restore, unsynced: true }, ...prev]
        );
        showToast("Couldn't sync the deletion — pet kept locally", 'info');
      });
    }
  };

  const handleExportReport = () => {
    exportCsv('PawMatch_Audit_Log.csv', auditLogColumns, activityLogs);
    showToast('Audit log exported as CSV');
  };

  const handleExportUsers = () => {
    exportCsv('PawMatch_Users.csv', userColumns, users);
    showToast('User directory exported as CSV');
  };

  const handleExportPets = () => {
    exportCsv('PawMatch_Pets.csv', petColumns, pets);
    showToast('Pet listings exported as CSV');
  };

  const handleExportApplications = () => {
    exportCsv('PawMatch_Applications.csv', applicationColumns, applications);
    showToast('Adoption applications exported as CSV');
  };

  // Accurately compute conversation-level unread counts and metadata directly from
  // individual message objects' 'isRead' status rather than relying on stale conversation counters
  const computedConversations: Conversation[] = React.useMemo(() => {
    return conversations.map((conv) => {
      const convMessages = messages.filter((m) => m.conversationId === conv.id);

      // Count unread messages strictly based on individual message objects with isRead === false
      const unreadCount = convMessages.filter(
        (m) => m.receiverId === currentUser?.id && !m.isRead
      ).length;

      const lastMsg = convMessages.length > 0 ? convMessages[convMessages.length - 1] : null;

      return {
        ...conv,
        unreadCount,
        lastMessage: lastMsg ? lastMsg.content : conv.lastMessage,
        lastMessageTime: lastMsg ? lastMsg.createdAt || lastMsg.timestamp : conv.lastMessageAt || conv.lastMessageTime,
        lastMessageAt: lastMsg ? lastMsg.createdAt || lastMsg.timestamp : conv.lastMessageAt || conv.lastMessageTime,
      };
    });
  }, [conversations, messages, currentUser?.id]);

  // Calculate actual unread message count across the entire inbox from individual message 'isRead' status
  const unreadMessagesCount = React.useMemo(() => {
    return messages.filter(
      (m) => m.receiverId === currentUser?.id && !m.isRead
    ).length;
  }, [messages, currentUser?.id]);

  // FIX (v2): notifications are scoped to the current user — the badge and
  // the dropdown must never count or show other users' notifications.
  const notifScope = currentUser?.id ?? 'guest';
  const myNotifications = React.useMemo(
    () => notifications.filter((n) => n.userId === notifScope),
    [notifications, notifScope]
  );
  const unreadNotificationsCount = myNotifications.filter((n) => !n.isRead).length;

  return (
    <CallProvider
      currentUser={
        currentUser
          ? {
              id: currentUser.id,
              name: currentUser.name,
              avatar: currentUser.avatar || currentUser.avatarUrl,
            }
          : null
      }
      conversations={computedConversations}
      onCallLog={(convId, att) => handleSendMessage(convId, '', att)}
      onIncomingAccepted={(convId) => {
        // Ring-anywhere accept: land on the chat tab with this conversation open.
        setActiveConversationId(convId);
        setActiveTab('chat');
      }}
    >
    <div className="min-h-screen flex flex-col bg-[#f8fafc] text-slate-800">
      {/* Top Bar Header */}
      <Header
        currentUser={currentUser}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        unreadMessagesCount={unreadMessagesCount}
        unreadNotificationsCount={unreadNotificationsCount}
        notifications={myNotifications}
        onOpenAuth={() => openAuth('login')}
        onLogout={handleLogout}
        favoritesCount={favorites.length}
        onMarkNotificationsRead={handleMarkAllNotificationsRead}
        dataMode={dataAdapter.mode}
      />

      {/* Main View Port — keyed wrapper plays a calm crossfade+rise
          transition every time the user switches tabs (visual only). */}
      <main className="flex-1">
        <div key={activeTab} className="pm-view-enter">
        {activeTab === 'home' && (
          <LandingPage
            pets={pets}
            applications={applications}
            users={users}
            services={services}
            onSelectPet={(p) => setSelectedPet(p)}
            onNavigateTab={(tab) => setActiveTab(tab)}
            onSearchQuery={(q) => {
              setSearchFilterQuery(q);
              setActiveTab('pets');
            }}
            favorites={favorites}
            onToggleFavorite={handleToggleFavorite}
          />
        )}

        {activeTab === 'pets' && (
          <PetListings
            pets={pets}
            currentUser={currentUser}
            onSelectPet={(p) => setSelectedPet(p)}
            favorites={favorites}
            onToggleFavorite={handleToggleFavorite}
            initialQuery={searchFilterQuery}
            loading={livePetsLoading}
          />
        )}

        {activeTab === 'matchmaker' && (
          <MatchmakerView
            pets={pets}
            currentUser={currentUser}
            onSelectPet={(p) => setSelectedPet(p)}
            favorites={favorites}
            onToggleFavorite={handleToggleFavorite}
          />
        )}

        {activeTab === 'lost_found' && (
          <LostFoundView
            reports={lostFound}
            currentUser={currentUser}
            onAddReport={handleAddLostFoundReport}
            onResolveReport={handleResolveLostFound}
          />
        )}

        {activeTab === 'pet_care' && (
          <PetCareView
            medicalRecords={medicalRecords}
            vaccinations={vaccinations}
            appointments={appointments}
            onBookAppointment={handleBookAppointment}
            onUpdateAppointmentStatus={handleUpdateAppointmentStatus}
            currentUser={currentUser}
            pets={pets}
            onNavigateTab={setActiveTab}
          />
        )}

        {activeTab === 'services' && (
          <LocalServicesView
            services={services}
            bookings={serviceBookings}
            onBookService={handleBookService}
            currentUser={currentUser}
          />
        )}

        {activeTab === 'dashboard' && currentUser && (
          <UserDashboard
            currentUser={currentUser}
            pets={pets}
            applications={applications}
            favorites={favorites}
            unreadMessagesCount={unreadMessagesCount}
            onSelectPet={(p) => setSelectedPet(p)}
            onNavigateTab={(tab) => setActiveTab(tab)}
            onToggleFavorite={handleToggleFavorite}
            onAddPet={handleAddPet}
            onUpdatePet={handleUpdatePet}
            onDeletePet={handleDeletePet}
          />
        )}

        {activeTab === 'profile' && currentUser && (
          <Suspense fallback={<LazyPawFallback label="Loading your profile…" />}>
          <ProfileView
            currentUser={currentUser}
            pets={pets}
            applications={applications}
            favorites={favorites}
            onSaveProfile={handleUpdateProfile}
            onSelectPet={(p) => setSelectedPet(p)}
            onNavigateTab={(tab) => setActiveTab(tab)}
            onToggleFavorite={handleToggleFavorite}
          />
          </Suspense>
        )}

        {activeTab === 'chat' && currentUser && (
          <ChatSystem
            currentUser={currentUser}
            conversations={computedConversations}
            messages={messages}
            onSendMessage={handleSendMessage}
            onSelectConversation={handleSelectConversation}
            activeConversationId={activeConversationId}
            allUsers={users}
            onStartChatWithAdmin={() => handleStartMessageToAdmin()}
            onStartChatWithUser={handleStartChatWithUser}
            dataMode={dataAdapter.mode}
            pushToast={(msg) => showToast(msg, 'info')}
            failedMessageIds={failedMessageIds}
            onRetryMessage={retryFailedMessage}
          />
        )}

        {/* Messaging needs an account: guests get a clear login prompt,
            never someone else's conversations. */}
        {activeTab === 'chat' && !currentUser && (
          <ChatLoginGate onLogin={() => openAuth('login')} />
        )}

        {activeTab === 'admin' && currentUser?.role === 'admin' && (
          <Suspense fallback={<LazyPawFallback label="Loading admin dashboard…" />}>
          <AdminDashboard
            users={users}
            pets={pets}
            applications={applications}
            lostFound={lostFound}
            activityLogs={activityLogs}
            conversations={computedConversations}
            messages={messages}
            onApproveApplication={handleApproveApplication}
            onRejectApplication={handleRejectApplication}
            onToggleUserStatus={handleToggleUserStatus}
            onExportReport={handleExportReport}
            onExportUsers={handleExportUsers}
            onExportPets={handleExportPets}
            onExportApplications={handleExportApplications}
            onNavigateToChat={(convId) => {
              if (convId) handleSelectConversation(convId);
              setActiveTab('chat');
            }}
          />
          </Suspense>
        )}
        </div>
      </main>

      {/* Modals */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onLogin={handleLoginUser}
        onRegister={handleRegisterUser}
        onUpdateUser={handleUpdateUser}
        users={users}
        initialMode={authInitialMode}
        openKey={authOpenKey}
      />

      <PetDetailsModal
        pet={selectedPet}
        onClose={() => setSelectedPet(null)}
        currentUser={currentUser}
        onApplyForAdoption={handleApplyForAdoption}
        onStartMessage={handleStartMessageFromPet}
        onMessageAdmin={(pet) => handleStartMessageToAdmin(pet)}
        isFavorite={selectedPet ? favorites.includes(selectedPet.id) : false}
        onToggleFavorite={handleToggleFavorite}
        medicalRecords={medicalRecords}
        vaccinations={vaccinations}
        onAddMedicalRecord={handleAddMedicalRecord}
        onAddVaccination={handleAddVaccination}
        ownerVerified={(() => {
          if (!selectedPet) return false;
          const owner = users.find((u) => u.id === selectedPet.ownerId);
          return !!owner && owner.role === 'shelter' && (owner as { verified?: boolean }).verified === true;
        })()}
      />

      <AdoptionModal
        pet={petToApply}
        currentUser={currentUser}
        onClose={() => setPetToApply(null)}
        onSubmitApplication={handleSubmitApplication}
      />

      {/* Rich Footer — refined rhythm: airier columns, larger brand mark */}
      <footer className="border-t border-slate-200 bg-gradient-to-b from-white via-slate-50/60 to-slate-100/70 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-14 grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-10 text-xs">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2.5 mb-4">
              <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white flex items-center justify-center shadow-md">
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden="true"><path d="M12 13.2c-2.6 0-5.1 2-5.1 4.3 0 1.5 1.1 2.6 2.7 2.6 1 0 1.7-.4 2.4-.4s1.4.4 2.4.4c1.6 0 2.7-1.1 2.7-2.6 0-2.3-2.5-4.3-5.1-4.3zM6.2 8.2c-1.1 0-2 1.4-2 3 0 1.5.8 2.7 1.9 2.7.9 0 1.6-.7 1.9-1.7.3 1 .9 1.7 1.9 1.7-.3-1.2-.5-2.6-.5-3.3 0-1.4-1.4-2.4-3.2-2.4zm11.6 0c-1.8 0-3.2 1-3.2 2.4 0 .7-.2 2.1-.5 3.3 1 0 1.6-.7 1.9-1.7.3 1 1 1.7 1.9 1.7 1.1 0 1.9-1.2 1.9-2.7 0-1.6-.9-3-2-3z"/></svg>
              </span>
              <span className="font-extrabold text-slate-900 text-base tracking-tight">PawMatch</span>
            </div>
            <p className="text-slate-500 leading-relaxed max-w-xs">
              Local Pet Care & Adoption Matchmaker — zero-surrender ethical pet guardianship
              and community rescue across Dhaka.
            </p>
          </div>

          <nav aria-label="Footer Explore">
            <h4 className="font-bold text-slate-900 text-[11px] uppercase tracking-wider mb-4">Explore</h4>
            <ul className="space-y-2.5 text-slate-500">
              {[
                ['home', 'Home'],
                ['pets', 'Find Pets'],
                ['matchmaker', 'Matchmaker'],
                ['lost_found', 'Lost & Found'],
                ['pet_care', 'Pet Care & Vets'],
                ['services', 'Services'],
              ].map(([tab, label]) => (
                <li key={tab}>
                  <button
                    onClick={() => {
                      setActiveTab(tab);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="hover:text-emerald-700 transition-colors"
                  >
                    {label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Footer Support">
            <h4 className="font-bold text-slate-900 text-[11px] uppercase tracking-wider mb-4">Support</h4>
            <ul className="space-y-2.5 text-slate-500">
              <li>
                <button
                  onClick={() => {
                    setActiveTab('home');
                    window.setTimeout(
                      () => document.getElementById('faq')?.scrollIntoView({ behavior: 'smooth' }),
                      120
                    );
                  }}
                  className="hover:text-emerald-700 transition-colors"
                >
                  FAQ
                </button>
              </li>
              <li>
                <button
                  onClick={() => {
                    setActiveTab('pets');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="hover:text-emerald-700 transition-colors"
                >
                  Adoption Guide
                </button>
              </li>
              <li>
                <button
                  onClick={() => {
                    setActiveTab('lost_found');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="hover:text-emerald-700 transition-colors"
                >
                  Report a Lost Pet
                </button>
              </li>
              <li>
                <button
                  onClick={() => {
                    setActiveTab('chat');
                    handleStartMessageToAdmin();
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="hover:text-emerald-700 transition-colors"
                >
                  Contact PawMatch Admin
                </button>
              </li>
            </ul>
          </nav>

          <div>
            <h4 className="font-bold text-slate-900 text-[11px] uppercase tracking-wider mb-4">Credits</h4>
            <ul className="space-y-2.5 text-slate-500">
              <li>
                Animated icon styling inspired by{' '}
                <a
                  href="https://www.flaticon.com/animated-icons"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-slate-700"
                >
                  Flaticon animated icons
                </a>
              </li>
              <li>Pet photography via Unsplash</li>
              <li>Built with React, Vite & Supabase</li>
              <li className="text-slate-400">CSE1290 Software Development — Team 5</li>
            </ul>
          </div>
        </div>

        <div className="border-t border-slate-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-slate-400">
            <span>PawMatch · Local Pet Care & Adoption Matchmaker Platform</span>
            <span>Every listing shows what is on record — nothing invented.</span>
          </div>
        </div>
      </footer>

      {/* App-wide toast feedback */}
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </div>
    </CallProvider>
  );
}
