import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Send,
  Phone,
  Video,
  MoreVertical,
  Paperclip,
  Search,
  ShieldCheck,
  MessageSquare,
  PlusCircle,
  X,
  Check,
  CheckCheck,
  Info,
  Radio,
  Mic,
  ImagePlus,
  FileText
} from 'lucide-react';
import { Conversation, ChatMessage, AnyUser, MessageAttachment } from '../types';
import { sortByTimeAsc, formatTime, humanizeTimestamp, dayLabel } from '../utils/time';
import { useCallContext } from '../lib/CallContext';
import { useTyping } from '../lib/useTyping';
import { AttachmentContent } from './MessageAttachment';
import { downscaleToJpegDataUrl } from './ImageUploader';

interface ChatSystemProps {
  currentUser: AnyUser | null;
  conversations: Conversation[];
  messages: ChatMessage[];
  onSendMessage: (conversationId: string, content: string, attachment?: MessageAttachment) => void;
  onSelectConversation?: (conversationId: string) => void;
  /** Optional toast feedback; falls back to a no-op when not provided. */
  pushToast?: (msg: string) => void;
  activeConversationId?: string;
  allUsers?: AnyUser[];
  onStartChatWithAdmin?: () => void;
  onStartChatWithUser?: (user: AnyUser) => void;
  /** 'live' (Supabase) or 'local' (demo). Controls the honesty banner. */
  dataMode?: 'supabase' | 'local';
  /**
   * MSGFIX: ids of own messages whose live write failed. Failed own bubbles
   * render a "Not sent — retry" affordance instead of the sent ticks.
   */
  failedMessageIds?: Set<string>;
  /** Retry a failed send (App re-runs the safe-ordered write). */
  onRetryMessage?: (msgId: string) => void;
}

/** Name of the OTHER participant, resolved by id (not by fragile name match). */
function otherParticipant(conv: Conversation, myId?: string): string {
  if (!myId) return conv.participantNames[0] || 'Unknown';
  const idx = conv.participantIds.findIndex((id) => id === myId);
  if (idx === -1) return conv.participantNames[0] || 'Unknown';
  return conv.participantNames[1 - idx] || conv.participantNames[0] || 'Unknown';
}

/** Id of the OTHER participant, resolved by id (for presence lookup). */
function otherParticipantId(conv: Conversation, myId?: string): string {
  if (!myId) return conv.participantIds[0] || '';
  const idx = conv.participantIds.findIndex((id) => id === myId);
  if (idx === -1) return conv.participantIds[0] || '';
  return conv.participantIds[1 - idx] || conv.participantIds[0] || '';
}

export const ChatSystem: React.FC<ChatSystemProps> = ({
  currentUser,
  conversations,
  messages,
  onSendMessage,
  onSelectConversation,
  activeConversationId: initialActiveId,
  allUsers = [],
  onStartChatWithAdmin,
  onStartChatWithUser,
  dataMode = 'local',
  pushToast = () => {},
  failedMessageIds,
  onRetryMessage,
}) => {
  const isAdmin = currentUser?.role === 'admin';
  const [adminViewMode, setAdminViewMode] = useState<'inbox' | 'all'>('inbox');
  const [showNewChatModal, setShowNewChatModal] = useState(false);

  // Conversations relevant to current user
  const visibleConversations = React.useMemo(() => {
    if (!currentUser) return conversations;
    if (isAdmin) {
      if (adminViewMode === 'inbox') {
        // Direct messages where Admin is a participant
        return conversations.filter((c) =>
          c.participantIds.includes(currentUser.id) || c.participantIds.includes('u-admin-1')
        );
      }
      // 'all': Show all conversations for admin oversight
      return conversations;
    }
    // Regular users only see conversations where they are a participant
    return conversations.filter((c) =>
      c.participantIds.includes(currentUser.id)
    );
  }, [conversations, currentUser, isAdmin, adminViewMode]);

  const [selectedConvId, setSelectedConvId] = useState<string>(() => {
    if (initialActiveId && visibleConversations.some((c) => c.id === initialActiveId)) {
      return initialActiveId;
    }
    return visibleConversations[0]?.id || '';
  });

  const [inputText, setInputText] = useState('');
  const [searchContact, setSearchContact] = useState('');
  const messagesStreamRef = useRef<HTMLDivElement>(null);

  // --- Call system: single App-level machine via CallContext (ring-anywhere).
  // The overlay now lives at the App root; this view only starts calls and
  // reads presence. Buttons/UX are unchanged.
  const { canCall, startCall, onlineIds, presenceLive } = useCallContext();

  /** Real presence only — never seeded/faked; unknown/offline reads as offline. */
  const isPeerOnline = (peerId: string): boolean =>
    presenceLive && peerId !== '' && onlineIds.has(peerId);

  const handleCallButton = (kind: 'audio' | 'video') => {
    if (!selectedConvId) return;
    if (!canCall) {
      pushToast('Calls need the live connection');
      return;
    }
    const result = startCall(selectedConvId, kind);
    if (result === 'busy-local') pushToast('You are already in a call');
    else if (result === 'unavailable') pushToast('Calls need the live connection');
  };

  // --- Typing indicators (worker 3): throttled 'typing' broadcasts on
  // `typing:<conversationId>` channels, mirroring the useCall broadcast
  // idiom. Local mode: no-op (no events, no channels). UI indicators use
  // fixed-height slots and never touch the scroll machinery.
  const { typingPeers, notifyTyping, notifyStopped } = useTyping({
    currentUser: currentUser ? { id: currentUser.id, name: currentUser.name } : null,
    conversations,
  });

  // --- Composer attachments (W3): attach popover + voice recording ---
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  type RecPhase = 'idle' | 'recording' | 'preview';
  const [recPhase, setRecPhase] = useState<RecPhase>('idle');
  const [recSecs, setRecSecs] = useState(0);
  const [recDataUrl, setRecDataUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recChunksRef = useRef<Blob[]>([]);
  const recBlobRef = useRef<Blob | null>(null);
  const recMimeRef = useRef('');
  const recStreamRef = useRef<MediaStream | null>(null);
  const recTimerRef = useRef<number | null>(null);
  const recSecsRef = useRef(0);
  const recDurationRef = useRef(0);
  const discardOnStopRef = useRef(false);

  const MAX_REC_SECS = 180; // 3-minute cap
  const MAX_FILE_BYTES = 2 * 1024 * 1024;
  const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

  // --- Scroll-stability machinery (feedback fix round) ---
  /** True while the user sits near the bottom of the stream (within ~120px). */
  const stickToBottomRef = useRef(true);
  /** Set when the user just sent a message; the next render scrolls instantly. */
  const justSentRef = useRef(false);
  /** Guards so parent state-identity churn can never ping-pong the select effects. */
  const appliedInitialIdRef = useRef<string | undefined>(undefined);
  const prevSelectedRef = useRef<string>('');
  const prevConvIdRef = useRef<string>('');
  const prevSigRef = useRef<string>('');
  const [showNewIndicator, setShowNewIndicator] = useState(false);
  const [unseenCount, setUnseenCount] = useState(0);

  // When initialActiveId or visibleConversations updates.
  // GUARD: apply a given initialActiveId exactly once. The parent's
  // handleSelectConversation always produces new array identities, which used
  // to recompute visibleConversations and refire this effect endlessly
  // (58 smooth-scrollTo re-triggers per send — the chat "jumping" bug).
  useEffect(() => {
    if (initialActiveId && appliedInitialIdRef.current !== initialActiveId) {
      appliedInitialIdRef.current = initialActiveId;
      setSelectedConvId(initialActiveId);
      if (onSelectConversation) {
        onSelectConversation(initialActiveId);
      }
    } else if (!initialActiveId && !visibleConversations.some((c) => c.id === selectedConvId)) {
      if (visibleConversations.length > 0) {
        const firstId = visibleConversations[0].id;
        setSelectedConvId(firstId);
        if (onSelectConversation) {
          onSelectConversation(firstId);
        }
      }
    }
  }, [initialActiveId, visibleConversations]);

  // Mark selected conversation as read upon viewing.
  // GUARD: only on a genuine selection change, never on parent re-renders.
  useEffect(() => {
    if (selectedConvId && selectedConvId !== prevSelectedRef.current) {
      prevSelectedRef.current = selectedConvId;
      if (onSelectConversation) {
        onSelectConversation(selectedConvId);
      }
    }
  }, [selectedConvId]);

  const activeConversation = conversations.find((c) => c.id === selectedConvId);
  // Real presence for the open thread's peer (live channel only; local mode → no label).
  const activePeerId = activeConversation
    ? otherParticipantId(activeConversation, currentUser?.id)
    : '';
  const activePeerOnline = isPeerOnline(activePeerId);

  // v2: messages sorted by REAL timestamp — new messages from other users
  // (Supabase realtime) land in the correct position, not just appended.
  const currentMessages = React.useMemo(
    () =>
      sortByTimeAsc(
        messages.filter((m) => m.conversationId === selectedConvId),
        (m) => m.createdAt || m.timestamp
      ),
    [messages, selectedConvId]
  );

  // Cheap signature of the active message list. The auto-scroll effect keys off
  // THIS, so parent array-identity churn (mark-as-read, toast state, etc.)
  // never re-triggers a scroll.
  const activeSig = `${selectedConvId}|${currentMessages.length}|${currentMessages[currentMessages.length - 1]?.id ?? ''}`;

  // Track whether the user is parked near the bottom of the stream.
  const updateStickiness = () => {
    const el = messagesStreamRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    stickToBottomRef.current = nearBottom;
    if (nearBottom) {
      setShowNewIndicator(false);
      setUnseenCount(0);
    }
  };

  const jumpToLatest = () => {
    const el = messagesStreamRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    stickToBottomRef.current = true;
    setShowNewIndicator(false);
    setUnseenCount(0);
  };

  // Smart auto-scroll — pane-internal ONLY, never touches window scrolling.
  // - Switching conversation: jump straight to the bottom (no animation).
  // - Own sent message: jump straight to the bottom.
  // - Incoming while near bottom (~120px): gentle smooth scroll.
  // - Incoming while reading history: do NOT scroll; show the tap-to-jump pill.
  useEffect(() => {
    const el = messagesStreamRef.current;
    const convChanged = prevConvIdRef.current !== selectedConvId;
    const prevSig = prevSigRef.current;
    prevConvIdRef.current = selectedConvId;
    prevSigRef.current = activeSig;
    if (convChanged) {
      setShowNewIndicator(false);
      setUnseenCount(0);
      justSentRef.current = false;
      if (el && currentMessages.length > 0) {
        el.scrollTop = el.scrollHeight;
        stickToBottomRef.current = true;
      }
      return;
    }
    if (!el || prevSig === activeSig) return; // nothing meaningful changed
    const arrived = justSentRef.current;
    justSentRef.current = false;
    if (arrived) {
      el.scrollTop = el.scrollHeight;
      stickToBottomRef.current = true;
      setShowNewIndicator(false);
      setUnseenCount(0);
    } else if (stickToBottomRef.current) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    } else {
      setUnseenCount((c) => c + 1);
      setShowNewIndicator(true);
    }
  }, [activeSig, selectedConvId]);

  // Close the attach popover on Escape.
  useEffect(() => {
    if (!attachMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAttachMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [attachMenuOpen]);

  // Unmount: never leave the recorder or mic stream running.
  useEffect(() => {
    return () => {
      if (recTimerRef.current !== null) {
        window.clearInterval(recTimerRef.current);
      }
      const rec = mediaRecorderRef.current;
      if (rec && rec.state !== 'inactive') {
        try {
          rec.stop();
        } catch {
          /* ignore */
        }
      }
      if (recStreamRef.current) {
        for (const t of recStreamRef.current.getTracks()) {
          try {
            t.stop();
          } catch {
            /* ignore */
          }
        }
      }
    };
  }, []);

  // Group consecutive messages under day separators
  const messagesWithDayBreaks = React.useMemo(() => {
    const out: Array<{ type: 'day'; label: string } | { type: 'msg'; msg: ChatMessage }> = [];
    let lastDay = '';
    for (const msg of currentMessages) {
      const day = dayLabel(msg.createdAt || msg.timestamp);
      if (day !== lastDay) {
        out.push({ type: 'day', label: day });
        lastDay = day;
      }
      out.push({ type: 'msg', msg });
    }
    return out;
  }, [currentMessages]);

  const handleSelectConv = (convId: string) => {
    // Leaving the conversation: the receiver gets one 'stopped' event.
    notifyStopped();
    setSelectedConvId(convId);
    if (onSelectConversation) {
      onSelectConversation(convId);
    }
  };

  // Typing broadcast: the hook throttles to ≤1 event / 800 ms. Local mode is
  // a no-op; when the input empties a single 'stopped' goes out.
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setInputText(v);
    if (selectedConvId) notifyTyping(selectedConvId, v.trim().length > 0);
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !selectedConvId) return;
    // Mark that WE sent this — the auto-scroll effect jumps straight to the
    // bottom on the next render (no animation, no layout shift).
    justSentRef.current = true;
    notifyStopped(); // sending ends our typing state
    onSendMessage(selectedConvId, inputText.trim());
    setInputText('');
  };

  // --- Photo attachment: file → JPEG data URL (maxDim 1200, q 0.85) ---
  const handlePhotoPick = (files: FileList | null) => {
    const file = files?.[0];
    setAttachMenuOpen(false);
    if (!file || !selectedConvId) return;
    if (file.size > MAX_PHOTO_BYTES) {
      pushToast('Photo too large (max 8 MB)');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = async () => {
        try {
          const dataUrl = await downscaleToJpegDataUrl(img, 1200, 0.85);
          justSentRef.current = true;
          onSendMessage(selectedConvId, '', {
            kind: 'image',
            dataUrl,
            mime: 'image/jpeg',
            sizeBytes: file.size,
          });
        } catch {
          pushToast('Could not process that photo.');
        }
      };
      img.onerror = () => pushToast('That file could not be read as a photo.');
      img.src = reader.result as string;
    };
    reader.onerror = () => pushToast('Could not read that file.');
    reader.readAsDataURL(file);
  };

  // --- File attachment: any file ≤ 2 MB, sent as data URL ---
  const handleFilePick = (files: FileList | null) => {
    const file = files?.[0];
    setAttachMenuOpen(false);
    if (!file || !selectedConvId) return;
    if (file.size > MAX_FILE_BYTES) {
      pushToast('File too large (max 2 MB)');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      justSentRef.current = true;
      onSendMessage(selectedConvId, '', {
        kind: 'file',
        dataUrl: reader.result as string,
        name: file.name,
        mime: file.type || 'application/octet-stream',
        sizeBytes: file.size,
      });
    };
    reader.onerror = () => pushToast('Could not read that file.');
    reader.readAsDataURL(file);
  };

  // --- Voice recording ---
  const AUDIO_MIMES = ['audio/webm', 'audio/mp4', 'audio/ogg'];

  const stopRecTimer = () => {
    if (recTimerRef.current !== null) {
      window.clearInterval(recTimerRef.current);
      recTimerRef.current = null;
    }
  };

  const stopRecStream = () => {
    if (recStreamRef.current) {
      for (const t of recStreamRef.current.getTracks()) {
        try {
          t.stop();
        } catch {
          /* already stopped */
        }
      }
      recStreamRef.current = null;
    }
  };

  const startRecording = async () => {
    if (!selectedConvId || recPhase !== 'idle') return;
    if (typeof MediaRecorder === 'undefined') {
      pushToast('Voice recording is not supported in this browser.');
      return;
    }
    const mime = AUDIO_MIMES.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
    if (!mime) {
      pushToast('Voice recording is not supported in this browser.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recStreamRef.current = stream;
      const rec = new MediaRecorder(stream, { mimeType: mime });
      recMimeRef.current = mime;
      recChunksRef.current = [];
      recBlobRef.current = null;
      discardOnStopRef.current = false;
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) recChunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        stopRecTimer();
        stopRecStream();
        if (discardOnStopRef.current) {
          discardOnStopRef.current = false;
          setRecPhase('idle');
          setRecSecs(0);
          setRecDataUrl(null);
          recBlobRef.current = null;
          return;
        }
        const blob = new Blob(recChunksRef.current, { type: recMimeRef.current });
        recDurationRef.current = recSecsRef.current;
        if (blob.size === 0) {
          setRecPhase('idle');
          setRecSecs(0);
          return;
        }
        recBlobRef.current = blob;
        const reader = new FileReader();
        reader.onload = () => {
          setRecDataUrl(reader.result as string);
          setRecPhase('preview');
        };
        reader.onerror = () => {
          pushToast('Could not process the recording.');
          setRecPhase('idle');
          setRecSecs(0);
          recBlobRef.current = null;
        };
        reader.readAsDataURL(blob);
      };
      rec.start();
      mediaRecorderRef.current = rec;
      recSecsRef.current = 0;
      setRecSecs(0);
      setRecPhase('recording');
      recTimerRef.current = window.setInterval(() => {
        recSecsRef.current += 1;
        setRecSecs(recSecsRef.current);
        if (recSecsRef.current >= MAX_REC_SECS) {
          // 3-minute cap: auto-stop into the preview step.
          try {
            mediaRecorderRef.current?.stop();
          } catch {
            /* ignore */
          }
        }
      }, 1000);
    } catch {
      pushToast('Could not access the microphone — please allow microphone access and try again.');
    }
  };

  /** Stop the recorder; onstop routes into the preview step. */
  const stopRecordingToPreview = () => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== 'inactive') {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    } else {
      setRecPhase('idle');
      setRecSecs(0);
    }
  };

  /** Cancel while recording: discard everything, no preview. */
  const cancelRecording = () => {
    discardOnStopRef.current = true;
    stopRecordingToPreview();
  };

  /** Discard from the preview step. */
  const discardRecording = () => {
    setRecPhase('idle');
    setRecSecs(0);
    setRecDataUrl(null);
    recBlobRef.current = null;
    recDurationRef.current = 0;
  };

  /** Send the recorded voice message. */
  const sendRecording = () => {
    const blob = recBlobRef.current;
    if (!blob || !recDataUrl || !selectedConvId) return;
    justSentRef.current = true;
    onSendMessage(selectedConvId, '', {
      kind: 'audio',
      dataUrl: recDataUrl,
      mime: recMimeRef.current || 'audio/webm',
      sizeBytes: blob.size,
      durationSec: recDurationRef.current,
    });
    discardRecording();
  };

  function fmtRecSecs(s: number): string {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  }

  const filteredConversations = visibleConversations.filter((c) =>
    c.participantNames.some((name) =>
      name.toLowerCase().includes(searchContact.toLowerCase())
    )
  );

  // Available users to start new chat with (excluding current user)
  const availableUsersToChat = allUsers.filter(
    (u) => u.id !== currentUser?.id
  );

  /**
   * Sender avatar for chat bubbles — same resolution order and chip style as
   * the header user menu: `avatar ?? avatarUrl ?? initial letter`.
   * Pure render helper; touches nothing in the scroll machinery.
   */

  /**
   * Animated "typing…" dots (continuous bounce — clearly visible, not
   * hover-only, per user preference). Rendered only inside fixed-height
   * slots (header line, row preview line), so the dots can never shift
   * layout or trigger the scroll machinery.
   */
  const renderTypingDots = () => (
    <span className="inline-flex items-center gap-[3px]" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-bounce"
          style={{ animationDelay: `${i * 160}ms` }}
        />
      ))}
    </span>
  );  const renderSenderAvatar = (senderId: string, senderName: string) => {
    const sender: AnyUser | null | undefined =
      senderId === currentUser?.id ? currentUser : allUsers.find((u) => u.id === senderId);
    const src = sender?.avatar || sender?.avatarUrl || '';
    const label = sender?.name || senderName || 'User';
    const initial = (label.charAt(0) || '?').toUpperCase();
    return src ? (
      <img
        src={src}
        alt={label}
        referrerPolicy="no-referrer"
        className="w-7 h-7 rounded-full object-cover border border-slate-200 shrink-0"
      />
    ) : (
      <span
        aria-hidden="true"
        className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-extrabold border border-emerald-700 shrink-0"
      >
        {initial}
      </span>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* NOTE: the call overlay now renders once at the App root (CallProvider)
          so invites ring on any screen; nothing is mounted here. */}

      {/* Honesty banner: demo mode stays on this browser; live mode is shared */}
      {dataMode === 'local' ? (
        <div className="mb-4 flex items-center gap-2.5 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-2.5">
          <Info className="w-4 h-4 shrink-0" />
          <span>
            <strong>Demo mode:</strong> messages stay on this browser only. Connect Supabase
            to message real users across devices.
          </span>
        </div>
      ) : (
        <div className="mb-4 flex items-center gap-2.5 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-2.5">
          <Radio className="w-4 h-4 shrink-0 animate-pulse" />
          <span>
            <strong>Live:</strong> messages sync in real time across all connected devices.
          </span>
        </div>
      )}

      {/* Stable shell: fixed height on desktop AND mobile. Everything inside
          scrolls within its own pane — the page never moves while chatting. */}
      <div
        data-testid="chat-shell"
        className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col md:grid md:grid-cols-12 h-[calc(100dvh-215px)] min-h-[480px] md:h-[calc(100dvh-190px)] md:min-h-[560px] md:max-h-[820px]"
      >
        {/* Left Column: Conversations List */}
        <div className="md:col-span-4 border-r border-slate-200 flex flex-col bg-slate-50/50 min-h-0 min-w-0 shrink-0 max-h-[40%] md:max-h-none">
          <div className="p-4 border-b border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <motion.div
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 18 }}
                  className="p-1.5 rounded-xl bg-emerald-100 text-emerald-700"
                >
                  <MessageSquare className="w-4 h-4" />
                </motion.div>
                <h2 className="font-extrabold text-slate-900 text-lg">Messages</h2>
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                  {visibleConversations.length}
                </span>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-1.5">
                {!isAdmin && onStartChatWithAdmin && (
                  <button
                    onClick={onStartChatWithAdmin}
                    className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100/70 hover:bg-emerald-200/70 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                    title="Message PawMatch Admin"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Message Admin</span>
                  </button>
                )}

                <button
                  onClick={() => setShowNewChatModal(true)}
                  className="p-1.5 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                  title="Start a new conversation"
                >
                  <PlusCircle className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Admin view switch: My Inquiries vs All Platform Chats */}
            {isAdmin && (
              <div className="flex bg-slate-200/70 p-0.5 rounded-xl text-xs font-bold">
                <button
                  onClick={() => setAdminViewMode('inbox')}
                  className={`flex-1 py-1 px-2 rounded-lg transition-all ${
                    adminViewMode === 'inbox'
                      ? 'bg-white text-emerald-800 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Direct Inquiries ({conversations.filter((c) => c.participantIds.includes('u-admin-1')).length})
                </button>
                <button
                  onClick={() => setAdminViewMode('all')}
                  className={`flex-1 py-1 px-2 rounded-lg transition-all ${
                    adminViewMode === 'all'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All Chats ({conversations.length})
                </button>
              </div>
            )}

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                value={searchContact}
                onChange={(e) => setSearchContact(e.target.value)}
                placeholder="Search conversations..."
                className="w-full text-xs py-2 pl-8 pr-3 bg-white rounded-xl border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Conversations Scrollable List */}
          <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-100">
            {filteredConversations.length === 0 ? (
              <div className="p-8 text-center space-y-3">
                <motion.div
                  animate={{ y: [0, -6, 0] }}
                  transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }}
                  className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto"
                >
                  <MessageSquare className="w-6 h-6" />
                </motion.div>
                <div className="text-xs font-bold text-slate-700">No active conversations</div>
                <p className="text-[11px] text-slate-500">
                  {isAdmin
                    ? 'No user inquiries received yet.'
                    : 'Start a conversation with Admin or a shelter about adopting a pet!'}
                </p>
                {!isAdmin && onStartChatWithAdmin && (
                  <button
                    onClick={onStartChatWithAdmin}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Message Admin Helpdesk</span>
                  </button>
                )}
              </div>
            ) : (
              filteredConversations.map((conv) => {
                const otherName = otherParticipant(conv, currentUser?.id);
                const peerId = otherParticipantId(conv, currentUser?.id);
                // Real presence only — green when the live channel says online,
                // grey otherwise. Never seeded, never invented.
                const peerOnline = isPeerOnline(peerId);
                const isSelected = conv.id === selectedConvId;

                // Check if there are real unread messages for current user in this conv
                const unreadInThisConv = messages.filter(
                  (m) => m.conversationId === conv.id && m.receiverId === currentUser?.id && !m.isRead
                ).length;

                return (
                  <motion.button
                    key={conv.id}
                    whileTap={{ scale: 0.985 }}
                    onClick={() => handleSelectConv(conv.id)}
                    className={`w-full p-4 text-left flex items-start gap-3 transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-50/80 border-l-4 border-emerald-600'
                        : 'hover:bg-slate-100/60'
                    }`}
                  >
                    <div className="relative shrink-0">
                      <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-sm shadow-xs">
                        {otherName.charAt(0)}
                      </div>
                      {/* Presence dot: green = online on the live channel,
                          grey = offline/unknown. Local mode shows grey. */}
                      <span
                        title={peerOnline ? 'Online' : 'Offline'}
                        aria-label={peerOnline ? 'Online' : 'Offline'}
                        className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${
                          peerOnline ? 'bg-emerald-500' : 'bg-slate-300'
                        }`}
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span className={`text-xs truncate ${unreadInThisConv > 0 ? 'font-extrabold text-slate-900' : 'font-bold text-slate-800'}`}>
                            {otherName}
                          </span>
                          {presenceLive && (
                            <span
                              className={`text-[10px] font-semibold shrink-0 ${
                                peerOnline ? 'text-emerald-600' : 'text-slate-400'
                              }`}
                            >
                              {peerOnline ? 'Online' : 'Offline'}
                            </span>
                          )}
                        </span>
                        <span className="text-[10px] text-slate-400 shrink-0">
                          {humanizeTimestamp(conv.lastMessageAt || conv.lastMessageTime)}
                        </span>
                      </div>

                      {/* Typing preview: swaps the preview TEXT only, inside the
                          same single-line truncate slot — the row height
                          cannot change and nothing scrolls. */}
                      <p className={`text-[11px] truncate mt-0.5 ${unreadInThisConv > 0 ? 'font-semibold text-slate-900' : 'text-slate-500'}`}>
                        {typingPeers[conv.id] ? (
                          <span
                            className="inline-flex items-center gap-1 text-emerald-600 font-bold"
                            data-testid={`typing-row-${conv.id}`}
                          >
                            {renderTypingDots()}
                            <span>typing…</span>
                          </span>
                        ) : (
                          conv.lastMessage
                        )}
                      </p>

                      {conv.petId && (
                        <span className="inline-block mt-1 text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded">
                          Adoption Inquiry
                        </span>
                      )}
                    </div>

                    {unreadInThisConv > 0 && (
                      <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                        className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0 animate-pulse"
                      >
                        {unreadInThisConv}
                      </motion.span>
                    )}
                  </motion.button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Chat Conversation Stream */}
        <div className="md:col-span-8 flex flex-col flex-1 bg-white min-h-0 min-w-0 border-t border-slate-200 md:border-t-0">
          {activeConversation ? (
            <>
              {/* Chat Header */}
              <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-white">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-sm shadow-xs">
                    {otherParticipant(activeConversation, currentUser?.id).charAt(0)}
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900 leading-tight">
                      {otherParticipant(activeConversation, currentUser?.id)}
                    </h3>
                    {/* Typing slot: fixed height (h-4) so the animated dots can
                        never shift the header layout. Shows "typing…" when the
                        other participant is typing in THIS conversation;
                        otherwise the normal status line. Never scrolls. */}
                    <div
                      className="h-4 flex items-center text-[11px]"
                      data-testid="typing-header"
                    >
                      {typingPeers[selectedConvId] ? (
                        <span
                          className="flex items-center gap-1.5 text-emerald-600 font-bold"
                          title={`${typingPeers[selectedConvId].senderName} is typing`}
                        >
                          {renderTypingDots()}
                          <span>typing…</span>
                        </span>
                      ) : presenceLive ? (
                        // Real presence only: the old line claimed "Online — messages
                        // sync live" for everyone in live mode. Local mode: no label.
                        <span className="flex items-center gap-1.5">
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              activePeerOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'
                            }`}
                          />
                          <span
                            className={
                              activePeerOnline
                                ? 'text-emerald-600 font-semibold'
                                : 'text-slate-400'
                            }
                          >
                            {activePeerOnline ? 'Online' : 'Offline'}
                          </span>
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 text-slate-500">
                  <button
                    type="button"
                    onClick={() => handleCallButton('audio')}
                    className={`p-2 rounded-lg transition-colors cursor-pointer ${
                      canCall ? 'hover:bg-slate-100' : 'opacity-50'
                    }`}
                    title={canCall ? 'Audio Call' : 'Calls need the live connection'}
                    aria-disabled={!canCall}
                  >
                    <Phone className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCallButton('video')}
                    className={`p-2 rounded-lg transition-colors cursor-pointer ${
                      canCall ? 'hover:bg-slate-100' : 'opacity-50'
                    }`}
                    title={canCall ? 'Video Call' : 'Calls need the live connection'}
                    aria-disabled={!canCall}
                  >
                    <Video className="w-4 h-4" />
                  </button>
                  <button
                    className="p-2 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                    title="Options"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Messages Stream — fixed flex slot, scrolls internally only.
                  Never touches window scrolling. */}
              <div className="relative flex-1 min-h-0 flex flex-col">
                <div
                  ref={messagesStreamRef}
                  onScroll={updateStickiness}
                  data-testid="chat-stream"
                  className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-4 bg-slate-50/40"
                >
                  {currentMessages.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-400">
                      No messages in this conversation yet. Send a greeting to start chatting!
                    </div>
                  ) : (
                    <AnimatePresence initial={false}>
                      {messagesWithDayBreaks.map((entry) =>
                        entry.type === 'day' ? (
                          <div key={`day-${entry.label}`} className="flex justify-center">
                            <span className="text-[10px] font-bold text-slate-500 bg-slate-200/70 px-3 py-1 rounded-full">
                              {entry.label}
                            </span>
                          </div>
                        ) : entry.msg.attachment?.kind === 'calllog' ? (
                          // Call-log pills live outside the bubble layout:
                          // a centered full-width row.
                          <motion.div
                            key={entry.msg.id}
                            initial={{ opacity: 0, y: 10, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{ duration: 0.22, ease: 'easeOut' }}
                            className="flex justify-center"
                          >
                            <AttachmentContent attachment={entry.msg.attachment} />
                          </motion.div>
                        ) : (
                          <motion.div
                            key={entry.msg.id}
                            initial={{ opacity: 0, y: 10, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{ duration: 0.22, ease: 'easeOut' }}
                            className={`flex ${entry.msg.senderId === currentUser?.id ? 'justify-end' : 'justify-start'}`}
                          >
                            <div
                              className={`flex items-end gap-2 ${entry.msg.senderId === currentUser?.id ? 'flex-row-reverse' : 'flex-row'}`}
                            >
                              {renderSenderAvatar(entry.msg.senderId, entry.msg.senderName)}
                              <div
                                className={`flex flex-col ${entry.msg.senderId === currentUser?.id ? 'items-end' : 'items-start'}`}
                              >
                                {entry.msg.senderId !== currentUser?.id && (
                                  <span className="text-[10px] text-slate-500 font-bold mb-1 pl-1">
                                    {entry.msg.senderName}
                                  </span>
                                )}
                                <div
                                  className={`max-w-xs sm:max-w-md px-4 py-2.5 rounded-2xl text-xs leading-relaxed shadow-xs ${
                                    entry.msg.senderId === currentUser?.id
                                      ? 'bg-emerald-600 text-white rounded-br-xs'
                                      : 'bg-white text-slate-800 border border-slate-200 rounded-bl-xs'
                                  }`}
                                >
                                  {entry.msg.content && (
                                    <div className={entry.msg.attachment ? 'mb-2' : undefined}>
                                      {entry.msg.content}
                                    </div>
                                  )}
                                  {entry.msg.attachment && (
                                    <AttachmentContent attachment={entry.msg.attachment} />
                                  )}
                                </div>
                                {/* Read receipts: OWN messages show ✓ (sent) or
                                    ✓✓ in emerald (read by the other side).
                                    Incoming messages show no ticks.
                                    MSGFIX: a message whose live write failed
                                    shows "⚠ Not sent — retry" instead. */}
                                <div className="flex items-center gap-1 mt-1 text-[10px] text-slate-400">
                                  <span>{formatTime(entry.msg.createdAt || entry.msg.timestamp)}</span>
                                  {entry.msg.senderId === currentUser?.id && (
                                    failedMessageIds?.has(entry.msg.id) ? (
                                      <button
                                        type="button"
                                        onClick={() => onRetryMessage?.(entry.msg.id)}
                                        title="Tap to retry sending"
                                        data-testid={`msg-failed-${entry.msg.id}`}
                                        className="inline-flex items-center gap-1 text-red-600 font-extrabold hover:underline cursor-pointer"
                                      >
                                        ⚠ Not sent — retry
                                      </button>
                                    ) : entry.msg.isRead ? (
                                      <span title="Read" data-testid={`msg-read-${entry.msg.id}`} className="inline-flex">
                                        <CheckCheck className="w-3 h-3 text-emerald-600" />
                                      </span>
                                    ) : (
                                      <span title="Sent" data-testid={`msg-sent-${entry.msg.id}`} className="inline-flex">
                                        <Check className="w-3 h-3 text-slate-400" />
                                      </span>
                                    )
                                  )}
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        )
                      )}
                    </AnimatePresence>
                  )}
                </div>

                {/* "New messages ↓" pill — appears only when the user is reading
                    history and a message arrives. Transform/opacity animation
                    only: it never shifts layout. */}
                <AnimatePresence>
                  {showNewIndicator && (
                    <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
                      <motion.button
                        type="button"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 8 }}
                        transition={{ duration: 0.18, ease: 'easeOut' }}
                        onClick={jumpToLatest}
                        data-testid="chat-new-indicator"
                        className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-slate-900/90 px-3.5 py-1.5 text-[11px] font-bold text-white shadow-lg cursor-pointer hover:bg-slate-800"
                      >
                        <span aria-hidden="true">↓</span>
                        <span>{unseenCount > 1 ? `${unseenCount} new messages` : 'New message'}</span>
                      </motion.button>
                    </div>
                  )}
                </AnimatePresence>
              </div>

              {/* Input Bar — fixed min-h so the recording bar never shifts layout */}
              <form
                onSubmit={handleSend}
                className="relative p-3 sm:p-4 border-t border-slate-200 bg-white flex items-center gap-2 min-h-[60px]"
              >
                <button
                  type="button"
                  onClick={() => setAttachMenuOpen((v) => !v)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
                  title="Attach photo/document"
                  aria-label="Attach photo or file"
                  aria-expanded={attachMenuOpen}
                >
                  <Paperclip className="w-4 h-4" />
                </button>

                {recPhase === 'idle' && (
                  <button
                    type="button"
                    onClick={startRecording}
                    className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
                    title="Record voice message"
                    aria-label="Record voice message"
                    data-testid="chat-mic"
                  >
                    <Mic className="w-4 h-4" />
                  </button>
                )}

                {recPhase !== 'idle' ? (
                  /* Recording / preview bar — lives inside the fixed-height
                     input row, so the bar never grows or shrinks. */
                  <div className="flex-1 flex items-center gap-2 min-w-0" data-testid="chat-recording-bar">
                    {recPhase === 'recording' ? (
                      <>
                        <span className="relative flex h-3 w-3 shrink-0" aria-hidden="true">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
                        </span>
                        <span
                          className="text-xs font-extrabold text-slate-800 tabular-nums"
                          data-testid="chat-rec-timer"
                        >
                          {fmtRecSecs(recSecs)}
                        </span>
                        <span className="text-[11px] text-slate-500 truncate">
                          Recording voice message…
                        </span>
                        <div className="flex-1" />
                        <button
                          type="button"
                          onClick={cancelRecording}
                          title="Cancel recording"
                          aria-label="Cancel recording"
                          className="p-2 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={stopRecordingToPreview}
                          title="Stop and preview"
                          aria-label="Stop and preview"
                          className="p-2 text-emerald-700 bg-emerald-100 hover:bg-emerald-200 rounded-lg cursor-pointer"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        {recDataUrl && (
                          <audio controls src={recDataUrl} className="h-9 max-w-[200px] min-w-0" />
                        )}
                        <span className="text-[10px] font-bold text-slate-500 tabular-nums shrink-0">
                          {fmtRecSecs(recDurationRef.current)}
                        </span>
                        <div className="flex-1" />
                        <button
                          type="button"
                          onClick={discardRecording}
                          className="px-3 py-2 text-[11px] font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                        >
                          Discard
                        </button>
                        <button
                          type="button"
                          onClick={sendRecording}
                          data-testid="chat-rec-send"
                          className="px-4 py-2 text-[11px] font-extrabold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl cursor-pointer"
                        >
                          Send
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      value={inputText}
                      data-testid="chat-input"
                      onChange={handleInputChange}
                      placeholder={`Reply as ${currentUser?.name || 'You'}...`}
                      className="flex-1 text-xs py-2.5 px-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />

                    <motion.button
                      type="submit"
                      aria-label="Send message"
                      title="Send message"
                      data-testid="chat-send"
                      disabled={!inputText.trim()}
                      whileTap={{ scale: 0.88 }}
                      whileHover={inputText.trim() ? { scale: 1.06 } : undefined}
                      className="p-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl transition-colors shadow-xs cursor-pointer disabled:cursor-not-allowed"
                    >
                      <Send className="w-4 h-4" />
                    </motion.button>
                  </>
                )}

                {/* Attach popover: sits above the input bar, inside the chat
                    shell's stacking context; click-catcher + Escape close it. */}
                {attachMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-30"
                      onClick={() => setAttachMenuOpen(false)}
                      aria-hidden="true"
                    />
                    <div className="absolute bottom-full left-3 mb-2 z-40 w-48 rounded-2xl border border-slate-200 bg-white shadow-xl p-1.5">
                      <button
                        type="button"
                        onClick={() => photoInputRef.current?.click()}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                      >
                        <ImagePlus className="w-4 h-4 text-emerald-600" />
                        <span>Photo</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                      >
                        <FileText className="w-4 h-4 text-slate-500" />
                        <span>File</span>
                        <span className="ml-auto text-[10px] font-medium text-slate-400">≤ 2 MB</span>
                      </button>
                    </div>
                  </>
                )}

                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  aria-hidden="true"
                  tabIndex={-1}
                  onChange={(e) => {
                    handlePhotoPick(e.target.files);
                    e.target.value = '';
                  }}
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  aria-hidden="true"
                  tabIndex={-1}
                  onChange={(e) => {
                    handleFilePick(e.target.files);
                    e.target.value = '';
                  }}
                />
              </form>
            </>
          ) : (
            <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-8 text-center text-slate-400 space-y-3">
              <motion.div
                animate={{ y: [0, -8, 0], rotate: [0, -4, 4, 0] }}
                transition={{ repeat: Infinity, duration: 3.2, ease: 'easeInOut' }}
                className="w-16 h-16 rounded-3xl bg-slate-100 flex items-center justify-center"
              >
                <MessageSquare className="w-7 h-7" />
              </motion.div>
              <h3 className="font-bold text-slate-700 text-sm">Select a Conversation</h3>
              <p className="text-xs text-slate-500 max-w-sm">
                Choose a conversation from the left, or initiate a new chat with Admin or a pet guardian.
              </p>
              {!isAdmin && onStartChatWithAdmin && (
                <button
                  onClick={onStartChatWithAdmin}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  Message Admin Helpdesk
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* New Chat Modal */}
      {showNewChatModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 relative space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-extrabold text-slate-900">Start a Conversation</h3>
              <button
                onClick={() => setShowNewChatModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Select a member, shelter, or administrator to start messaging:
            </p>

            <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-2xl">
              {availableUsersToChat.map((user) => (
                <button
                  key={user.id}
                  onClick={() => {
                    setShowNewChatModal(false);
                    if (user.role === 'admin' && onStartChatWithAdmin) {
                      onStartChatWithAdmin();
                    } else if (onStartChatWithUser) {
                      onStartChatWithUser(user);
                    }
                  }}
                  className="w-full p-3 text-left flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-xs">
                      {user.name.charAt(0)}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        {user.name}
                        {user.role === 'admin' && (
                          <span className="text-[9px] bg-rose-100 text-rose-700 px-1.5 py-0.2 rounded font-extrabold">
                            ADMIN
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 capitalize">
                        {user.role} · {user.location?.area || 'Dhaka'}
                      </div>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-emerald-700">Chat →</span>
                </button>
              ))}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};
