/**
 * MessageAttachment.tsx — renders chat message attachments (W3).
 *
 * `AttachmentContent` handles image / audio / file attachments inside the
 * message bubble and call-log pills (rendered by ChatSystem in a centered
 * full-width row, outside the bubble layout).
 */
import React, { useState } from 'react';
import { FileText, Phone, Video, X } from 'lucide-react';
import type { MessageAttachment } from '../types';

/** Tiny local mm:ss formatter (same output as App's formatCallDuration). */
function fmtDur(sec?: number): string {
  const s = Math.max(0, Math.round(sec ?? 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Human-readable file size. */
function fmtSize(bytes?: number): string {
  if (bytes == null || Number.isNaN(bytes)) return '';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function callLogLabel(a: MessageAttachment): string {
  const kindLabel = a.callType === 'video' ? 'Video' : 'Audio';
  if (a.outcome === 'missed') return `${kindLabel} call · missed`;
  if (a.outcome === 'declined') return `${kindLabel} call · declined`;
  if (typeof a.durationSec === 'number') return `${kindLabel} call · ${fmtDur(a.durationSec)}`;
  return `${kindLabel} call`;
}

export const AttachmentContent: React.FC<{ attachment: MessageAttachment }> = ({
  attachment,
}) => {
  const [lightboxOpen, setLightboxOpen] = useState(false);

  // --- call log: centered pill (ChatSystem renders it outside the bubble) ---
  if (attachment.kind === 'calllog') {
    const Icon = attachment.callType === 'video' ? Video : Phone;
    const missed = attachment.outcome === 'missed' || attachment.outcome === 'declined';
    return (
      <span
        className={`mx-auto inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-bold shadow-xs ${
          missed
            ? 'bg-rose-50 text-rose-700 border border-rose-200'
            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
        }`}
      >
        <Icon className="w-3.5 h-3.5" />
        {callLogLabel(attachment)}
      </span>
    );
  }

  // --- safety: never render a broken element ---
  if (!attachment.dataUrl) return null;

  if (attachment.kind === 'image') {
    return (
      <>
        <img
          src={attachment.dataUrl}
          alt="Shared photo"
          onClick={() => setLightboxOpen(true)}
          className="rounded-xl max-w-[240px] cursor-zoom-in block"
        />
        {lightboxOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4"
            onClick={() => setLightboxOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Photo viewer"
          >
            <button
              type="button"
              onClick={() => setLightboxOpen(false)}
              aria-label="Close photo viewer"
              className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={attachment.dataUrl}
              alt="Shared photo (full size)"
              onClick={(e) => e.stopPropagation()}
              className="max-h-[90vh] max-w-[92vw] rounded-2xl object-contain shadow-2xl"
            />
          </div>
        )}
      </>
    );
  }

  if (attachment.kind === 'audio') {
    return (
      <div className="flex items-center gap-2 min-w-0">
        <audio
          controls
          preload="metadata"
          src={attachment.dataUrl}
          className="max-w-[220px] h-9"
        />
        {typeof attachment.durationSec === 'number' && (
          <span className="text-[10px] font-bold opacity-80 shrink-0 tabular-nums">
            {fmtDur(attachment.durationSec)}
          </span>
        )}
      </div>
    );
  }

  // file
  return (
    <div className="flex items-center gap-2.5 min-w-0 max-w-[240px] rounded-xl bg-black/10 px-3 py-2">
      <FileText className="w-6 h-6 shrink-0 opacity-70" />
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-bold truncate">{attachment.name || 'File'}</div>
        <div className="text-[10px] opacity-70">{fmtSize(attachment.sizeBytes)}</div>
      </div>
      <a
        href={attachment.dataUrl}
        download={attachment.name || 'download'}
        className="shrink-0 text-[11px] font-bold underline underline-offset-2 hover:opacity-80"
      >
        Download
      </a>
    </div>
  );
};
