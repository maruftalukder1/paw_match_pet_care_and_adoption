/**
 * CallOverlay.tsx — Call UI overlay for PawMatch (W2).
 *
 * Pure presentational: renders the state object produced by useCall.
 * Fixed-position overlay, so it can NEVER shift the chat pane layout.
 */
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff } from 'lucide-react';
import type { CallState } from '../lib/useCall';

interface CallOverlayProps {
  call: CallState;
  onAccept: () => void;
  onDecline: () => void;
  onEnd: () => void;
  onToggleMute: () => void;
  onToggleCamera: () => void;
}

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

function initialOf(name: string): string {
  const t = (name || '?').trim();
  return t ? t[0].toUpperCase() : '?';
}

function Avatar({
  name,
  size = 'md',
  pulse = false,
}: {
  name: string;
  size?: 'md' | 'lg';
  pulse?: boolean;
}) {
  const dims = size === 'lg' ? 'h-24 w-24 text-4xl' : 'h-16 w-16 text-2xl';
  return (
    <div className="relative inline-flex">
      {pulse && (
        <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/40" />
      )}
      <div
        className={`relative flex ${dims} items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 font-bold text-white shadow-lg`}
      >
        {initialOf(name)}
      </div>
    </div>
  );
}

function Equalizer() {
  const bars = [0, 1, 2, 3, 4];
  return (
    <div className="flex h-8 items-end justify-center gap-1.5" aria-hidden="true">
      {bars.map((i) => (
        <span
          key={i}
          className="w-1.5 origin-bottom rounded-full bg-emerald-500"
          style={{
            height: '100%',
            animation: 'pm-eq 1.1s ease-in-out infinite',
            animationDelay: `${i * 0.15}s`,
          }}
        />
      ))}
    </div>
  );
}

export default function CallOverlay({
  call,
  onAccept,
  onDecline,
  onEnd,
  onToggleMute,
  onToggleCamera,
}: CallOverlayProps) {
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);

  // Display-only seconds timer. The machine tracks seconds silently in a ref
  // (for calllog duration + DEV diag) without re-rendering, so this overlay —
  // the only place that shows the ticking clock — runs its own 1s timer and
  // the App-level provider never re-renders once per second during a call.
  const [dispSecs, setDispSecs] = useState(0);
  useEffect(() => {
    setDispSecs(0);
    if (call.phase === 'outgoing' || call.phase === 'in-call') {
      const t = window.setInterval(() => setDispSecs((s) => s + 1), 1000);
      return () => window.clearInterval(t);
    }
  }, [call.phase]);

  // Attach remote stream to the <video> element.
  useEffect(() => {
    const el = remoteVideoRef.current;
    if (el) el.srcObject = call.remoteStream;
  }, [call.remoteStream, call.phase]);

  // Attach local stream to the PiP <video> element.
  useEffect(() => {
    const el = localVideoRef.current;
    if (el) el.srcObject = call.localStream;
  }, [call.localStream, call.phase]);

  // Detach streams when the overlay closes / phase changes so nothing leaks.
  useEffect(() => {
    return () => {
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
      if (localVideoRef.current) localVideoRef.current.srcObject = null;
    };
  }, [call.phase]);

  // Render NOTHING when idle and no error — the chat pane is untouched.
  if (call.phase === 'idle' && !call.error) return null;

  const isVideo = call.callType === 'video';

  const renderBody = () => {
    // Error view (busy / no answer / media failure / connection lost).
    if (call.error) {
      return (
        <motion.div
          key="error"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          className="flex flex-col items-center px-8 py-10 text-center"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
            <PhoneOff className="h-7 w-7 text-red-500" />
          </div>
          <p className="mt-4 text-base font-semibold text-slate-800">{call.error}</p>
          <p className="mt-2 text-sm text-slate-500">
            Tip: you can send a voice message instead.
          </p>
          <button
            type="button"
            onClick={onEnd}
            className="mt-6 rounded-full bg-slate-800 px-8 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            End
          </button>
        </motion.div>
      );
    }

    if (call.phase === 'outgoing') {
      return (
        <motion.div
          key="outgoing"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          className="flex flex-col items-center px-8 py-10 text-center"
        >
          <Avatar name={call.peerName} size="lg" pulse />
          <h3 className="mt-5 text-lg font-bold text-slate-800">Calling {call.peerName}…</h3>
          <p className="mt-1 text-sm text-slate-500">
            {isVideo ? 'Video call' : 'Voice call'} · {fmt(dispSecs)}
          </p>
          <button
            type="button"
            onClick={onEnd}
            className="mt-7 rounded-full bg-red-500 px-8 py-2.5 text-sm font-semibold text-white shadow-lg shadow-red-500/30 transition hover:bg-red-600"
          >
            Cancel
          </button>
        </motion.div>
      );
    }

    if (call.phase === 'incoming') {
      return (
        <motion.div
          key="incoming"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          className="flex flex-col items-center px-8 py-10 text-center"
        >
          <div className="relative">
            <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/30" />
            <span
              className="absolute inset-0 animate-ping rounded-full bg-emerald-400/20"
              style={{ animationDelay: '0.5s' }}
            />
            <Avatar name={call.peerName} size="lg" />
          </div>
          <h3 className="mt-5 text-lg font-bold text-slate-800">
            Incoming {isVideo ? 'video' : 'voice'} call
          </h3>
          <p className="mt-1 text-sm text-slate-500">from {call.peerName}</p>
          <div className="mt-7 flex items-center gap-5">
            <button
              type="button"
              onClick={onDecline}
              aria-label="Decline call"
              className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 text-white shadow-lg shadow-red-500/30 transition hover:bg-red-600"
            >
              <PhoneOff className="h-6 w-6" />
            </button>
            <button
              type="button"
              onClick={onAccept}
              aria-label="Accept call"
              className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-600"
            >
              <Phone className="h-6 w-6" />
            </button>
          </div>
        </motion.div>
      );
    }

    // in-call
    return (
      <motion.div
        key="in-call"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.2 }}
        className="flex flex-col"
      >
        {isVideo ? (
          <div className="relative h-72 w-full overflow-hidden bg-slate-900">
            {call.remoteStream ? (
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                <Avatar name={call.peerName} pulse />
                <p className="text-sm text-slate-300">Connecting…</p>
              </div>
            )}
            <div className="absolute left-3 top-3 rounded-full bg-black/50 px-3 py-1 text-xs font-semibold text-white">
              {call.peerName} · {fmt(dispSecs)}
            </div>
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="absolute bottom-3 right-3 h-28 w-20 rounded-xl border-2 border-white/70 bg-slate-800 object-cover shadow-lg"
            />
          </div>
        ) : (
          <div className="flex flex-col items-center px-8 pb-2 pt-10 text-center">
            <Avatar name={call.peerName} size="lg" pulse />
            <h3 className="mt-4 text-lg font-bold text-slate-800">{call.peerName}</h3>
            <p className="mt-1 text-sm tabular-nums text-slate-500">{fmt(dispSecs)}</p>
            <div className="mt-4">
              <Equalizer />
            </div>
          </div>
        )}

        {/* controls row */}
        <div className="flex items-center justify-center gap-4 px-8 py-6">
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={call.muted ? 'Unmute microphone' : 'Mute microphone'}
            title={call.muted ? 'Unmute' : 'Mute'}
            className={`flex h-12 w-12 items-center justify-center rounded-full transition ${
              call.muted
                ? 'bg-red-100 text-red-600'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {call.muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>
          {isVideo && (
            <button
              type="button"
              onClick={onToggleCamera}
              aria-label={call.cameraOff ? 'Turn camera on' : 'Turn camera off'}
              title={call.cameraOff ? 'Camera on' : 'Camera off'}
              className={`flex h-12 w-12 items-center justify-center rounded-full transition ${
                call.cameraOff
                  ? 'bg-red-100 text-red-600'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {call.cameraOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
            </button>
          )}
          <button
            type="button"
            onClick={onEnd}
            aria-label="End call"
            title="End call"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500 text-white shadow-lg shadow-red-500/30 transition hover:bg-red-600"
          >
            <PhoneOff className="h-5 w-5" />
          </button>
        </div>
      </motion.div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Call"
    >
      <style>{`@keyframes pm-eq { 0%, 100% { transform: scaleY(0.25); } 50% { transform: scaleY(1); } }`}</style>
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 14 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="w-[min(430px,94vw)] overflow-hidden rounded-3xl bg-white shadow-2xl"
      >
        <AnimatePresence mode="wait">{renderBody()}</AnimatePresence>
      </motion.div>
    </div>
  );
}
