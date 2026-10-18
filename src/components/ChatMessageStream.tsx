/**
 * ChatMessageStream.tsx — the scrollable message list for a conversation.
 *
 * FRAME-DROP FIX (VIDEOFIX): this component is wrapped in React.memo so that
 * typing in the composer (which re-renders ChatSystem on EVERY keystroke via
 * setInputText) does NOT re-render the whole message list. Before the split,
 * each keystroke re-rendered every bubble — including photo/file attachments
 * and framer-motion wrappers — which is what made typing stutter on phones.
 * Now keystrokes re-render only the composer; this list re-renders only when
 * its own props actually change (new/changed messages, read receipts, the
 * new-message pill).
 */
import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, CheckCheck } from 'lucide-react';
import type { ChatMessage, AnyUser } from '../types';
import { formatTime } from '../utils/time';
import { AttachmentContent } from './MessageAttachment';

export type MessageStreamEntry =
  | { type: 'day'; label: string }
  | { type: 'msg'; msg: ChatMessage };

interface ChatMessageStreamProps {
  entries: MessageStreamEntry[];
  messageCount: number;
  currentUser: AnyUser | null | undefined;
  allUsers: AnyUser[];
  failedMessageIds: Set<string> | undefined;
  onRetryMessage: ((msgId: string) => void) | undefined;
  showNewIndicator: boolean;
  unseenCount: number;
  onJumpToLatest: () => void;
  streamRef: React.RefObject<HTMLDivElement | null>;
  onScroll: () => void;
}

function ChatMessageStream({
  entries,
  messageCount,
  currentUser,
  allUsers,
  failedMessageIds,
  onRetryMessage,
  showNewIndicator,
  unseenCount,
  onJumpToLatest,
  streamRef,
  onScroll,
}: ChatMessageStreamProps) {
  const renderSenderAvatar = (senderId: string, senderName: string) => {
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
    <div className="relative flex-1 min-h-0 flex flex-col">
      <div
        ref={streamRef}
        onScroll={onScroll}
        data-testid="chat-stream"
        className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-4 bg-slate-50/40"
      >
        {messageCount === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No messages in this conversation yet. Send a greeting to start chatting!
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {entries.map((entry) =>
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
              animate={{ opacity: 1, y: 8 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              onClick={onJumpToLatest}
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
  );
}

export default React.memo(ChatMessageStream);
