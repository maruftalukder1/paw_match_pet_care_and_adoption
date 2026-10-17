/**
 * dataAdapter.ts — One interface for messaging + notifications persistence,
 * with two implementations:
 *
 *   1. LocalAdapter   — today's behavior: everything lives in React state
 *      and (where applicable) localStorage on this device only. Zero setup.
 *   2. SupabaseAdapter — shared Postgres + Realtime. Cross-device messaging
 *      works: when user A sends a message, user B's browser receives it
 *      through a Realtime channel without reloading.
 *
 * The app picks Supabase automatically when VITE_SUPABASE_URL and
 * VITE_SUPABASE_ANON_KEY are set, otherwise it silently falls back to local.
 * Components never touch `supabase` directly — they only see this adapter.
 *
 * NOTE: the Supabase path is fully wired but CANNOT be verified without a
 * live project (Maruf must create one and set the env vars). Anything under
 * the "Supabase" branches is marked and listed in AUDIT.md as
 * "needs live keys to verify". The local path is tested and is the
 * production default today.
 */
import { supabase, isSupabaseEnabled } from './supabaseClient';
import type {
  Conversation,
  ChatMessage,
  AppNotification,
  MessageAttachment,
  Pet,
  AdoptionApplication,
  LostFoundReport,
  MedicalRecord,
  VaccinationRecord,
  VetAppointment,
} from '../types';

export interface MessagingSnapshot {
  conversations: Conversation[];
  messages: ChatMessage[];
  notifications: AppNotification[];
}

/** Realtime pet events broadcast on the 'pawmatch-pets' channel. */
export type PetRealtimeEvent =
  | { type: 'insert'; pet: Pet; petId?: string }
  | { type: 'update'; pet: Pet; petId?: string }
  | { type: 'delete'; pet?: Pet; petId: string };

export interface DataAdapter {
  /** 'supabase' when live keys exist, else 'local'. */
  readonly mode: 'supabase' | 'local';
  /** Load the messaging snapshot for a user (null = nothing remote, keep seeds). */
  loadInitial(userId: string): Promise<MessagingSnapshot | null>;
  /** Persist one outgoing chat message. */
  persistMessage(msg: ChatMessage): Promise<void>;
  /** Create/update a conversation row. */
  persistConversation(conv: Conversation): Promise<void>;
  /**
   * Persist a conversation together with its first message in a safe order
   * (conversation row is awaited BEFORE the message insert). This exists
   * because chat_messages.conversation_id has a FOREIGN KEY to
   * conversations(id): firing both writes concurrently lets the message
   * win the race, which the DB rejects (PostgREST 409 / code 23503) and
   * silently drops the first message while the conversation row (with its
   * last_message preview) survives — the "empty thread" bug.
   * Transient network/5xx failures are retried once; a final failure
   * rejects so the UI can show a failed-send state (never silent loss).
   */
  persistConversationWithMessage(conv: Conversation, msg: ChatMessage): Promise<void>;
  /**
   * Load one conversation's full message history from the server,
   * oldest-first. Returns null in local mode (caller keeps local state).
   * Used when a thread is opened so a fresh device/origin always shows the
   * real persisted history rather than whatever is in local state.
   */
  loadMessages(conversationId: string): Promise<ChatMessage[] | null>;
  /**
   * Load a single conversation row from the server (null when missing, or
   * in local mode). Used when a realtime message arrives for a conversation
   * this client has never seen (created on another device).
   */
  loadConversation(conversationId: string): Promise<Conversation | null>;
  /** Persist one notification. */
  persistNotification(n: AppNotification): Promise<void>;
  /**
   * Mark the reader's incoming messages in a conversation as read, in LIVE
   * mode. Scoped to rows where receiver_id = readerId, so a reader can only
   * ever acknowledge their own incoming messages — never anyone else's.
   * In local mode this is a no-op (localStorage sync in App owns it).
   */
  markConversationRead(conversationId: string, readerId: string): Promise<void>;
  /**
   * Subscribe to new chat messages from OTHER clients, plus read-receipt
   * UPDATEs on chat_messages rows. `onRead` fires for rows whose is_read
   * flipped false -> true; callers must only apply it to their own sent
   * messages (receipts only within the conversation's participants).
   * Returns an unsubscribe function. In local mode this is a no-op.
   */
  subscribeMessages(
    onMessage: (msg: ChatMessage) => void,
    onRead?: (msg: ChatMessage) => void
  ): () => void;
  /** Load the full pet list from the shared DB (null = nothing remote, keep seeds). */
  loadPets(): Promise<Pet[] | null>;
  /** Persist a newly created pet (INSERT by id). */
  persistPetCreate(pet: Pet): Promise<void>;
  /** Persist pet edits (upsert by id, so a missing row is recreated). */
  persistPetUpdate(pet: Pet): Promise<void>;
  /** Persist a pet deletion (real DELETE; RLS allows it in the demo project). */
  persistPetDelete(petId: string): Promise<void>;
  /**
   * Subscribe to pet INSERT/UPDATE/DELETE from OTHER clients.
   * Returns an unsubscribe function. In local mode this is a no-op.
   */
  subscribePets(onEvent: (e: PetRealtimeEvent) => void): () => void;

  /* ------- adoption applications (full live-sync round) ------- */
  /** Load all applications from the shared DB (null = keep local seeds). */
  loadApplications(): Promise<AdoptionApplication[] | null>;
  /**
   * Persist a newly submitted application (idempotent upsert on id, so an
   * ambiguous-failure retry can't duplicate it). Rejects on permanent
   * failure (FK violation etc.) so the caller surfaces it honestly.
   */
  persistApplicationCreate(app: AdoptionApplication): Promise<void>;
  /**
   * Persist admin status changes (approve/reject/under-review), one row per
   * id. Callers pass every affected row (approve also auto-rejects the
   * competing applications for the same pet); updates run sequentially and
   * a failed update throws so the UI can say which rows didn't land.
   */
  persistApplicationStatuses(
    updates: Array<{ id: string; status: AdoptionApplication['status']; reviewNotes?: string }>
  ): Promise<void>;
  /**
   * Subscribe to application INSERT/UPDATE from OTHER clients.
   * Returns an unsubscribe function. In local mode this is a no-op.
   */
  subscribeApplications(onEvent: (app: AdoptionApplication) => void): () => void;

  /* ------- lost & found reports (full live-sync round) ------- */
  /** Load all reports from the shared DB (null = keep local seeds). */
  loadLostFound(): Promise<LostFoundReport[] | null>;
  /** Persist a newly submitted report (idempotent upsert on id). */
  persistLostFoundCreate(report: LostFoundReport): Promise<void>;
  /** Mark a report Resolved. Rejects on failure so the UI surfaces it. */
  persistLostFoundResolve(id: string): Promise<void>;
  /** Subscribe to report INSERT/UPDATE from OTHER clients. */
  subscribeLostFound(onEvent: (report: LostFoundReport) => void): () => void;

  /* ------- healthcare (full live-sync round) ------- */
  /**
   * Load the healthcare slices from the shared DB (null = keep local seeds).
   * Vaccination status is recomputed client-side from nextDueDate
   * (src/utils/time.ts) — the DB stores no status.
   */
  loadHealthcare(): Promise<{
    medical: MedicalRecord[];
    vaccinations: VaccinationRecord[];
    appointments: VetAppointment[];
  } | null>;
  /** Persist a new medical record (idempotent upsert on id). */
  persistMedicalCreate(rec: MedicalRecord): Promise<void>;
  /** Persist a new vaccination entry (idempotent upsert on id). */
  persistVaccinationCreate(vac: VaccinationRecord): Promise<void>;
  /** Persist a newly booked appointment (idempotent upsert on id). */
  persistAppointmentCreate(appt: VetAppointment): Promise<void>;
  /** Persist an appointment status change (Scheduled/Completed/Cancelled). */
  persistAppointmentStatus(id: string, status: VetAppointment['status']): Promise<void>;
  /**
   * Subscribe to healthcare INSERT/UPDATE from OTHER clients. The callback
   * receives the slice name and the row so the caller merges by id.
   */
  subscribeHealthcare(
    onEvent: (
      slice: 'medical' | 'vaccination' | 'appointment',
      row: MedicalRecord | VaccinationRecord | VetAppointment
    ) => void
  ): () => void;
}

/* ------------------------------------------------------------------ */
/* Row <-> type mappers (DB is snake_case, app is camelCase)            */
/* ------------------------------------------------------------------ */

function rowToMessage(r: Record<string, unknown>): ChatMessage {
  const createdAt =
    typeof r.created_at === 'string' ? r.created_at : new Date().toISOString();
  // Attachment is stored as jsonb. Map null-safely: keep only plain objects
  // whose `kind` is a known attachment kind, copying only the known fields.
  let attachment: ChatMessage['attachment'];
  const raw = r.attachment;
  if (
    raw !== null &&
    typeof raw === 'object' &&
    !Array.isArray(raw) &&
    typeof (raw as Record<string, unknown>).kind === 'string' &&
    ['image', 'audio', 'file', 'calllog'].includes(
      (raw as Record<string, unknown>).kind as string
    )
  ) {
    const a = raw as Record<string, unknown>;
    const keep: MessageAttachment = { kind: a.kind as MessageAttachment['kind'] };
    if (typeof a.dataUrl === 'string') keep.dataUrl = a.dataUrl;
    if (typeof a.name === 'string') keep.name = a.name;
    if (typeof a.mime === 'string') keep.mime = a.mime;
    if (typeof a.sizeBytes === 'number') keep.sizeBytes = a.sizeBytes;
    if (typeof a.durationSec === 'number') keep.durationSec = a.durationSec;
    if (a.callType === 'audio' || a.callType === 'video') keep.callType = a.callType;
    if (
      a.outcome === 'completed' ||
      a.outcome === 'missed' ||
      a.outcome === 'declined'
    )
      keep.outcome = a.outcome;
    attachment = keep;
  }
  return {
    id: String(r.id),
    conversationId: String(r.conversation_id),
    senderId: String(r.sender_id),
    senderName: String(r.sender_name ?? ''),
    receiverId: String(r.receiver_id),
    content: String(r.content ?? ''),
    timestamp: createdAt, // legacy display field mirrors ISO in v2
    createdAt,
    isRead: Boolean(r.is_read),
    attachment,
  };
}

function rowToConversation(r: Record<string, unknown>): Conversation {
  const lastAt =
    typeof r.last_message_at === 'string' ? r.last_message_at : new Date().toISOString();
  const ids = (r.participant_ids ?? []) as string[];
  const names = (r.participant_names ?? []) as string[];
  return {
    id: String(r.id),
    participantIds: [ids[0] ?? '', ids[1] ?? ''] as [string, string],
    participantNames: [names[0] ?? '', names[1] ?? ''] as [string, string],
    petId: r.pet_id ? String(r.pet_id) : undefined,
    lastMessage: String(r.last_message ?? ''),
    lastMessageTime: lastAt, // legacy display field mirrors ISO in v2
    lastMessageAt: lastAt,
    unreadCount: 0, // recomputed client-side from messages
  };
}

function rowToNotification(r: Record<string, unknown>): AppNotification {
  const createdAt =
    typeof r.created_at === 'string' ? r.created_at : new Date().toISOString();
  return {
    id: String(r.id),
    userId: String(r.user_id),
    title: String(r.title ?? ''),
    message: String(r.message ?? ''),
    timestamp: createdAt,
    type: (r.type as AppNotification['type']) ?? 'message',
    isRead: Boolean(r.is_read),
  };
}

/* ------------------------------------------------------------------ */
/* Pet row <-> type mappers (pure module; re-exported for app use)       */
/* ------------------------------------------------------------------ */

import { rowToPet, petToRow } from './petMappers';
export { rowToPet, petToRow };

import {
  rowToApplication,
  applicationToRow,
  rowToLostFound,
  lostFoundToRow,
  rowToMedicalRecord,
  medicalRecordToRow,
  rowToVaccination,
  vaccinationToRow,
  rowToAppointment,
  appointmentToRow,
} from './fullSyncMappers';
export {
  rowToApplication,
  applicationToRow,
  rowToLostFound,
  lostFoundToRow,
  rowToMedicalRecord,
  medicalRecordToRow,
  rowToVaccination,
  vaccinationToRow,
  rowToAppointment,
  appointmentToRow,
};

/* ------------------------------------------------------------------ */
/* Local adapter — v1 behavior                                          */
/* ------------------------------------------------------------------ */

class LocalAdapter implements DataAdapter {
  readonly mode = 'local' as const;
  async loadInitial(): Promise<MessagingSnapshot | null> {
    return null; // keep seed + localStorage data
  }
  async persistMessage(): Promise<void> {
    /* localStorage sync happens in App via useEffect */
  }
  async persistConversation(): Promise<void> {}
  async persistConversationWithMessage(): Promise<void> {
    /* localStorage sync happens in App via useEffect */
  }
  async loadMessages(): Promise<ChatMessage[] | null> {
    return null; // keep local state
  }
  async loadConversation(): Promise<Conversation | null> {
    return null; // keep local state
  }
  async persistNotification(): Promise<void> {}
  async markConversationRead(): Promise<void> {}
  subscribeMessages(): () => void {
    return () => {};
  }
  async loadPets(): Promise<Pet[] | null> {
    return null; // keep seed + localStorage data
  }
  async persistPetCreate(): Promise<void> {}
  async persistPetUpdate(): Promise<void> {}
  async persistPetDelete(): Promise<void> {}
  subscribePets(): () => void {
    return () => {};
  }
  async loadApplications(): Promise<AdoptionApplication[] | null> {
    return null;
  }
  async persistApplicationCreate(): Promise<void> {}
  async persistApplicationStatuses(): Promise<void> {}
  subscribeApplications(): () => void {
    return () => {};
  }
  async loadLostFound(): Promise<LostFoundReport[] | null> {
    return null;
  }
  async persistLostFoundCreate(): Promise<void> {}
  async persistLostFoundResolve(): Promise<void> {}
  subscribeLostFound(): () => void {
    return () => {};
  }
  async loadHealthcare(): Promise<{
    medical: MedicalRecord[];
    vaccinations: VaccinationRecord[];
    appointments: VetAppointment[];
  } | null> {
    return null;
  }
  async persistMedicalCreate(): Promise<void> {}
  async persistVaccinationCreate(): Promise<void> {}
  async persistAppointmentCreate(): Promise<void> {}
  async persistAppointmentStatus(): Promise<void> {}
  subscribeHealthcare(): () => void {
    return () => {};
  }
}

/* ------------------------------------------------------------------ */
/* Supabase adapter — live shared backend                               */
/* ------------------------------------------------------------------ */

class SupabaseAdapter implements DataAdapter {
  readonly mode = 'supabase' as const;

  private client() {
    if (!supabase) throw new Error('Supabase client not configured');
    return supabase;
  }

  async loadInitial(userId: string): Promise<MessagingSnapshot | null> {
    const db = this.client();
    const [convRes, msgRes, notifRes] = await Promise.all([
      db.from('conversations').select('*').contains('participant_ids', [userId]),
      db.from('chat_messages').select('*').order('created_at', { ascending: true }),
      db.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(100),
    ]);
    if (convRes.error) throw convRes.error;
    if (msgRes.error) throw msgRes.error;

    const convIds = new Set((convRes.data ?? []).map((r: Record<string, unknown>) => String(r.id)));
    const messages = (msgRes.data ?? [])
      .filter((r: Record<string, unknown>) => convIds.has(String(r.conversation_id)))
      .map(rowToMessage);

    return {
      conversations: (convRes.data ?? []).map(rowToConversation),
      messages,
      notifications: (notifRes.data ?? []).map(rowToNotification),
    };
  }

  async persistMessage(msg: ChatMessage): Promise<void> {
    // W4 fix: only send the `attachment` key when the message actually has
    // one. The live chat_messages table may not have the jsonb column yet
    // (a parallel task owns the ALTER TABLE); sending the key with a null
    // value would fail the whole insert (PostgREST 42703), breaking even
    // plain-text live persistence. Conditional inclusion keeps text working
    // now and attachments working once the column lands.
    const { error } = await this.client().from('chat_messages').insert({
      id: msg.id,
      conversation_id: msg.conversationId,
      sender_id: msg.senderId,
      sender_name: msg.senderName,
      receiver_id: msg.receiverId,
      content: msg.content,
      is_read: msg.isRead,
      ...(msg.attachment ? { attachment: msg.attachment } : {}),
    });
    if (error) throw error;
  }

  async persistConversation(conv: Conversation): Promise<void> {
    const { error } = await this.client().from('conversations').upsert(
      {
        id: conv.id,
        participant_ids: conv.participantIds,
        participant_names: conv.participantNames,
        pet_id: conv.petId ?? null,
        last_message: conv.lastMessage,
        last_message_at: conv.lastMessageAt,
      },
      { onConflict: 'id' }
    );
    if (error) throw error;
  }

  /**
   * MSGFIX: a write that previously failed silently is now impossible to
   * lose quietly. The conversation row is awaited BEFORE the message insert
   * (foreign-key safe order), transient failures are retried once, and a
   * final failure rejects so the caller must show a failed-send state.
   */
  async persistConversationWithMessage(conv: Conversation, msg: ChatMessage): Promise<void> {
    await this.withTransientRetry(() => this.persistConversation(conv));
    await this.withTransientRetry(() => this.upsertMessage(msg));
  }

  /**
   * Idempotent message write used by persistConversationWithMessage: an
   * insert-or-keep upsert on id, so a retry after an ambiguous failure
   * (write may have landed but the response was lost) cannot create
   * duplicates or die on 23505. Message content is immutable in this app,
   * so upsert is semantically identical to insert for new rows.
   */
  private async upsertMessage(msg: ChatMessage): Promise<void> {
    const { error } = await this.client()
      .from('chat_messages')
      .upsert(
        {
          id: msg.id,
          conversation_id: msg.conversationId,
          sender_id: msg.senderId,
          sender_name: msg.senderName,
          receiver_id: msg.receiverId,
          content: msg.content,
          is_read: msg.isRead,
          ...(msg.attachment ? { attachment: msg.attachment } : {}),
        },
        { onConflict: 'id' }
      );
    if (error) throw error;
  }

  async loadMessages(conversationId: string): Promise<ChatMessage[] | null> {
    const { data, error } = await this.client()
      .from('chat_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []).map((r: Record<string, unknown>) => rowToMessage(r));
  }

  async loadConversation(conversationId: string): Promise<Conversation | null> {
    const { data, error } = await this.client()
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .maybeSingle();
    if (error) throw error;
    return data ? rowToConversation(data as Record<string, unknown>) : null;
  }

  /**
   * Run an async write, retrying ONCE on transient failures (network
   * hiccups, 5xx). Permanent failures — constraint violations (235xx),
   * permission errors (42501), PostgREST/PGRST codes, malformed input
   * (22xxx/42xxx) — are never retried: retrying those can only repeat the
   * same rejection. The final error always propagates to the caller.
   */
  private async withTransientRetry<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (first) {
      if (!SupabaseAdapter.isTransientError(first)) throw first;
      console.warn('[PawMatch] Transient write failure, retrying once:', first);
      await new Promise((resolve) => setTimeout(resolve, 800));
      return await fn();
    }
  }

  private static isTransientError(err: unknown): boolean {
    const code = String((err as { code?: unknown })?.code ?? '');
    const message = String((err as { message?: unknown })?.message ?? err ?? '');
    // Permanent: FK/unique/permission errors, PostgREST query errors,
    // malformed-input classes. These will fail identically on retry.
    if (/^(235|42501|PGRST|22|42)/.test(code)) return false;
    // Transient: fetch/network failures, timeouts, 5xx, rate limits.
    return (
      /fetch failed|network|timeout|ECONN|ETIMEDOUT|EAI_AGAIN|5\d\d|too many requests|rate limit/i.test(
        message + ' ' + code
      ) || code === ''
    );
  }

  async persistNotification(n: AppNotification): Promise<void> {
    const { error } = await this.client().from('notifications').insert({
      id: n.id,
      user_id: n.userId,
      title: n.title,
      message: n.message,
      type: n.type,
      is_read: n.isRead,
    });
    if (error) throw error;
  }

  /**
   * Read-receipt write: flip is_read on the READER's incoming messages in
   * one conversation. The `receiver_id = readerId` filter means a client can
   * only ever acknowledge its own incoming messages — a malicious client
   * cannot forge receipts for anyone else's messages (and nothing else in
   * this app ever UPDATEs chat_messages rows).
   */
  async markConversationRead(conversationId: string, readerId: string): Promise<void> {
    const { error } = await this.client()
      .from('chat_messages')
      .update({ is_read: true })
      .eq('conversation_id', conversationId)
      .eq('receiver_id', readerId)
      .eq('is_read', false);
    if (error) throw error;
  }

  subscribeMessages(
    onMessage: (msg: ChatMessage) => void,
    onRead?: (msg: ChatMessage) => void
  ): () => void {
    const channel = this.client()
      .channel('pawmatch-chat')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        (payload) => {
          try {
            onMessage(rowToMessage(payload.new as Record<string, unknown>));
          } catch (err) {
            console.error('[PawMatch] Realtime message parse failed:', err);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chat_messages' },
        (payload) => {
          // Read receipt: only is_read flips are expected (this app never
          // edits message content). The old-row guard tolerates realtime
          // payloads whose replica identity omits `old` (fires anyway, the
          // caller applies it idempotently to its own sent messages only).
          try {
            const old = (payload.old ?? {}) as Record<string, unknown>;
            const next = rowToMessage(payload.new as Record<string, unknown>);
            if (next.isRead && !Boolean(old.is_read)) onRead?.(next);
          } catch (err) {
            console.error('[PawMatch] Realtime read-receipt parse failed:', err);
          }
        }
      )
      .subscribe((status, err) => {
        if (err) console.error('[PawMatch] Realtime subscribe error:', err);
        else console.info('[PawMatch] Realtime status:', status);
      });

    return () => {
      void this.client().removeChannel(channel);
    };
  }

  /* ---------------- pets (live path) ---------------- */

  async loadPets(): Promise<Pet[] | null> {
    const { data, error } = await this.client()
      .from('pets')
      .select('*')
      .order('date_added', { ascending: false, nullsFirst: false })
      .order('id', { ascending: true });
    if (error) throw error;
    if (!data) return null;
    return data.map((r: Record<string, unknown>) => rowToPet(r));
  }

  /**
   * Write a pet row with the `tags` column when the live table has it.
   * If the live table predates the tags migration, PostgREST rejects the
   * whole write (PGRST204 "Could not find the 'tags' column", or Postgres
   * 42703) — retry once without the tags key so the listing itself still
   * lands (tags stay local-only until the column exists).
   */
  private async writePetRow(
    row: Record<string, unknown>,
    mode: 'insert' | 'upsert'
  ): Promise<void> {
    const db = this.client();
    const attempt =
      mode === 'insert'
        ? await db.from('pets').insert(row)
        : await db.from('pets').upsert(row, { onConflict: 'id' });
    if (!attempt.error) return;
    const err = attempt.error;
    const missingTagsColumn =
      'tags' in row &&
      (err.code === 'PGRST204' || err.code === '42703') &&
      /'tags'/.test(String(err.message ?? ''));
    if (missingTagsColumn) {
      console.warn(
        '[PawMatch] pets.tags column missing on live DB, retrying write without tags.'
      );
      const { tags: _dropped, ...legacyRow } = row;
      const retry =
        mode === 'insert'
          ? await db.from('pets').insert(legacyRow)
          : await db.from('pets').upsert(legacyRow, { onConflict: 'id' });
      if (retry.error) throw retry.error;
      return;
    }
    throw err;
  }

  async persistPetCreate(pet: Pet): Promise<void> {
    await this.writePetRow(petToRow(pet), 'insert');
  }

  async persistPetUpdate(pet: Pet): Promise<void> {
    await this.writePetRow(petToRow(pet), 'upsert');
  }

  async persistPetDelete(petId: string): Promise<void> {
    const { error } = await this.client().from('pets').delete().eq('id', petId);
    if (error) throw error;
  }

  subscribePets(onEvent: (e: PetRealtimeEvent) => void): () => void {
    const parse =
      (type: 'insert' | 'update') =>
      (payload: { new: unknown }) => {
        try {
          onEvent({
            type,
            pet: rowToPet(payload.new as Record<string, unknown>),
          });
        } catch (err) {
          console.error('[PawMatch] Realtime pet parse failed:', err);
        }
      };
    const channel = this.client()
      .channel('pawmatch-pets')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'pets' },
        parse('insert')
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'pets' },
        parse('update')
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'pets' },
        (payload) => {
          try {
            onEvent({
              type: 'delete',
              petId: String((payload.old as Record<string, unknown>).id),
            });
          } catch (err) {
            console.error('[PawMatch] Realtime pet delete parse failed:', err);
          }
        }
      )
      .subscribe((status, err) => {
        if (err) console.error('[PawMatch] Realtime pets subscribe error:', err);
        else console.info('[PawMatch] Realtime pets status:', status);
      });

    return () => {
      void this.client().removeChannel(channel);
    };
  }

  /* ---------------- adoption applications (live path) ---------------- */

  async loadApplications(): Promise<AdoptionApplication[] | null> {
    const { data, error } = await this.client()
      .from('adoption_applications')
      .select('*')
      .order('submitted_at', { ascending: false, nullsFirst: false })
      .order('id', { ascending: true });
    if (error) throw error;
    if (!data) return null;
    return data.map((r: Record<string, unknown>) => rowToApplication(r));
  }

  async persistApplicationCreate(app: AdoptionApplication): Promise<void> {
    // Upsert on id (not insert): content is immutable in this app, so a
    // retry after an ambiguous failure can't duplicate the row (23505).
    // Errors throw through withTransientRetry: transient ones are retried
    // once, permanent ones (FK, permission, constraint) surface immediately.
    await this.withTransientRetry(async () => {
      const { error } = await this.client()
        .from('adoption_applications')
        .upsert(applicationToRow(app), { onConflict: 'id' });
      if (error) throw error;
    });
  }

  async persistApplicationStatuses(
    updates: Array<{ id: string; status: AdoptionApplication['status']; reviewNotes?: string }>
  ): Promise<void> {
    const db = this.client();
    const now = new Date().toISOString();
    for (const u of updates) {
      // MSGFIX discipline: a permanently failing row (permission, missing
      // row) rejects immediately so the caller can surface it — the batch
      // does not pretend partial success.
      await this.withTransientRetry(async () => {
        const { error } = await db
          .from('adoption_applications')
          .update({
            status: u.status,
            review_notes: u.reviewNotes ?? null,
            updated_at: now,
          })
          .eq('id', u.id);
        if (error) throw error;
      });
    }
  }

  subscribeApplications(onEvent: (app: AdoptionApplication) => void): () => void {
    const parse = (payload: { new: unknown }) => {
      try {
        onEvent(rowToApplication(payload.new as Record<string, unknown>));
      } catch (err) {
        console.error('[PawMatch] Realtime application parse failed:', err);
      }
    };
    const channel = this.client()
      .channel('pawmatch-applications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'adoption_applications' },
        parse
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'adoption_applications' },
        parse
      )
      .subscribe((status, err) => {
        if (err) console.error('[PawMatch] Realtime applications subscribe error:', err);
        else console.info('[PawMatch] Realtime applications status:', status);
      });
    return () => {
      void this.client().removeChannel(channel);
    };
  }

  /* ---------------- lost & found (live path) ---------------- */

  async loadLostFound(): Promise<LostFoundReport[] | null> {
    const { data, error } = await this.client()
      .from('lost_found_reports')
      .select('*')
      .order('created_at', { ascending: false, nullsFirst: false })
      .order('id', { ascending: true });
    if (error) throw error;
    if (!data) return null;
    return data.map((r: Record<string, unknown>) => rowToLostFound(r));
  }

  async persistLostFoundCreate(report: LostFoundReport): Promise<void> {
    await this.withTransientRetry(async () => {
      const { error } = await this.client()
        .from('lost_found_reports')
        .upsert(lostFoundToRow(report), { onConflict: 'id' });
      if (error) throw error;
    });
  }

  async persistLostFoundResolve(id: string): Promise<void> {
    await this.withTransientRetry(async () => {
      const { error } = await this.client()
        .from('lost_found_reports')
        .update({ status: 'Resolved' })
        .eq('id', id);
      if (error) throw error;
    });
  }

  subscribeLostFound(onEvent: (report: LostFoundReport) => void): () => void {
    const parse = (payload: { new: unknown }) => {
      try {
        onEvent(rowToLostFound(payload.new as Record<string, unknown>));
      } catch (err) {
        console.error('[PawMatch] Realtime lost-found parse failed:', err);
      }
    };
    const channel = this.client()
      .channel('pawmatch-lostfound')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'lost_found_reports' },
        parse
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'lost_found_reports' },
        parse
      )
      .subscribe((status, err) => {
        if (err) console.error('[PawMatch] Realtime lost-found subscribe error:', err);
        else console.info('[PawMatch] Realtime lost-found status:', status);
      });
    return () => {
      void this.client().removeChannel(channel);
    };
  }

  /* ---------------- healthcare (live path) ---------------- */

  async loadHealthcare(): Promise<{
    medical: MedicalRecord[];
    vaccinations: VaccinationRecord[];
    appointments: VetAppointment[];
  } | null> {
    const db = this.client();
    const [medRes, vacRes, apptRes] = await Promise.all([
      db.from('medical_records').select('*').order('date', { ascending: false, nullsFirst: false }),
      db.from('vaccinations').select('*').order('next_due_date', { ascending: true, nullsFirst: false }),
      db.from('vet_appointments').select('*').order('date', { ascending: true, nullsFirst: false }),
    ]);
    if (medRes.error) throw medRes.error;
    if (vacRes.error) throw vacRes.error;
    if (apptRes.error) throw apptRes.error;
    return {
      medical: (medRes.data ?? []).map((r: Record<string, unknown>) => rowToMedicalRecord(r)),
      vaccinations: (vacRes.data ?? []).map((r: Record<string, unknown>) => rowToVaccination(r)),
      appointments: (apptRes.data ?? []).map((r: Record<string, unknown>) => rowToAppointment(r)),
    };
  }

  async persistMedicalCreate(rec: MedicalRecord): Promise<void> {
    await this.withTransientRetry(async () => {
      const { error } = await this.client()
        .from('medical_records')
        .upsert(medicalRecordToRow(rec), { onConflict: 'id' });
      if (error) throw error;
    });
  }

  async persistVaccinationCreate(vac: VaccinationRecord): Promise<void> {
    await this.withTransientRetry(async () => {
      const { error } = await this.client()
        .from('vaccinations')
        .upsert(vaccinationToRow(vac), { onConflict: 'id' });
      if (error) throw error;
    });
  }

  async persistAppointmentCreate(appt: VetAppointment): Promise<void> {
    await this.withTransientRetry(async () => {
      const { error } = await this.client()
        .from('vet_appointments')
        .upsert(appointmentToRow(appt), { onConflict: 'id' });
      if (error) throw error;
    });
  }

  async persistAppointmentStatus(id: string, status: VetAppointment['status']): Promise<void> {
    await this.withTransientRetry(async () => {
      const { error } = await this.client()
        .from('vet_appointments')
        .update({ status })
        .eq('id', id);
      if (error) throw error;
    });
  }

  subscribeHealthcare(
    onEvent: (
      slice: 'medical' | 'vaccination' | 'appointment',
      row: MedicalRecord | VaccinationRecord | VetAppointment
    ) => void
  ): () => void {
    const mk =
      (slice: 'medical' | 'vaccination' | 'appointment', parse: (r: Record<string, unknown>) => MedicalRecord | VaccinationRecord | VetAppointment) =>
      (payload: { new: unknown }) => {
        try {
          onEvent(slice, parse(payload.new as Record<string, unknown>));
        } catch (err) {
          console.error(`[PawMatch] Realtime ${slice} parse failed:`, err);
        }
      };
    const channel = this.client()
      .channel('pawmatch-healthcare')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'medical_records' },
        mk('medical', rowToMedicalRecord)
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'vaccinations' },
        mk('vaccination', rowToVaccination)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'vet_appointments' },
        mk('appointment', rowToAppointment)
      )
      .subscribe((status, err) => {
        if (err) console.error('[PawMatch] Realtime healthcare subscribe error:', err);
        else console.info('[PawMatch] Realtime healthcare status:', status);
      });
    return () => {
      void this.client().removeChannel(channel);
    };
  }
}

/**
 * The adapter the app actually uses. Swap happens automatically:
 * live keys present -> SupabaseAdapter, otherwise LocalAdapter.
 */
export const dataAdapter: DataAdapter = isSupabaseEnabled
  ? new SupabaseAdapter()
  : new LocalAdapter();

/** Human label for UI badges ("Live" vs "Demo mode"). */
export const dataModeLabel = isSupabaseEnabled ? 'Live' : 'Demo mode';
