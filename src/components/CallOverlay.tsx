/**
 * CallOverlay.tsx — Call UI overlay for PawMatch (W2).
 *
 * Pure presentational: renders the state object produced by useCall.
 * Fixed-position overlay, so it can NEVER shift the chat pane layout.
 *
 * Video robustness (VIDEOFIX): the remote and local <video> elements are
 * ALWAYS mounted during video calls (every phase), never created lazily when
 * a stream arrives — so stream attach can never race element creation, and
 * the caller sees their own camera while the phone is still ringing
 * (WhatsApp parity). A "Connecting…" overlay covers the remote area until a
 * video track actually arrives; if a stream arrives with no video tracks, an
 * honest "Video unavailable" note shows instead of a black box.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Volume2,
  SwitchCamera,
  PictureInPicture2,
  ScreenShare,
  Loader2,
} from 'lucide-react';
import type { CallState, FlipCameraResult, ScreenShareResult } from '../lib/useCall';

interface CallOverlayProps {
  call: CallState;
  onAccept: () => void;
  onDecline: () => void;
  onEnd: () => void;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onFlipCamera: () => Promise<FlipCameraResult>;
  onToggleScreenShare: () => Promise<ScreenShareResult>;
  onSetAudioOutput: (deviceId: string) => void;
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

/** One round in-call control button (48px touch target). */
function ControlButton({
  label,
  title,
  onClick,
  disabled = false,
  active = false,
  children,
  testId,
}: {
  label: string;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={title}
      data-testid={testId}
      className={`flex h-12 w-12 items-center justify-center rounded-full transition ${
        active
          ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
      } disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-slate-100`}
    >
      {children}
    </button>
  );
}

export default function CallOverlay({
  call,
  onAccept,
  onDecline,
  onEnd,
  onToggleMute,
  onToggleCamera,
  onFlipCamera,
  onToggleScreenShare,
  onSetAudioOutput,
}: CallOverlayProps) {
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  // Dedicated sink for VOICE calls: the remote <video> below only renders in
  // the video-call branch, so without this audio-call users could NEVER hear
  // the other side (stream attached to a non-existent element).
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  // Autoplay-policy fallback flag: set when a play() is rejected, cleared per
  // call/phase so each new call gets a fresh attempt.
  const [needsTapToPlay, setNeedsTapToPlay] = useState(false);
  // Async in-call actions (flip camera / screen share): which is running, and
  // the last transient error to show under the control bar.
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const actionErrorTimer = useRef<number | null>(null);
  // Picture-in-picture state for the remote video.
  const [isPiP, setIsPiP] = useState(false);

  // Platform support probes (computed once).
  const sinkSupported = useMemo(
    () =>
      typeof HTMLMediaElement !== 'undefined' &&
      'setSinkId' in HTMLMediaElement.prototype,
    [],
  );
  const pipSupported = useMemo(
    () => typeof document !== 'undefined' && !!document.pictureInPictureEnabled,
    [],
  );
  const shareSupported = useMemo(() => {
    try {
      const md = navigator.mediaDevices as MediaDevices & {
        getDisplayMedia?: unknown;
      };
      return !!md?.getDisplayMedia;
    } catch {
      return false;
    }
  }, []);

  const playWithTapFallback = (el: HTMLMediaElement) => {
    el.play().catch(() => setNeedsTapToPlay(true));
  };

  const handleTapToPlay = () => {
    const el =
      call.callType === 'video' ? remoteVideoRef.current : remoteAudioRef.current;
    if (!el) return;
    el.play().then(
      () => setNeedsTapToPlay(false),
      () => {} // still blocked — leave the button up
    );
  };

  useEffect(() => {
    setNeedsTapToPlay(false);
  }, [call.phase, call.callType]);

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

  // Route remote audio to the chosen output device where the browser allows
  // it (Chrome/Edge desktop + Android). No-op everywhere else — the machine
  // keeps the choice, the overlay applies it to whichever remote element is
  // live.
  const applySink = useCallback(
    (el: HTMLMediaElement | null) => {
      if (!el || !sinkSupported) return;
      const id = call.audioOutputDeviceId;
      if (!id) return;
      try {
        const withSink = el as HTMLMediaElement & {
          setSinkId: (deviceId: string) => Promise<void>;
        };
        const p = withSink.setSinkId(id);
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch {
        /* keep the browser default routing */
      }
    },
    [sinkSupported, call.audioOutputDeviceId],
  );

  // Attach remote stream to the ALWAYS-MOUNTED <video> (video calls). The
  // element exists in every phase, so attach can never race its creation.
  useEffect(() => {
    const el = remoteVideoRef.current;
    if (!el) return;
    const isVideoCall = call.callType === 'video';
    el.srcObject = isVideoCall ? call.remoteStream : null;
    applySink(el);
    if (isVideoCall && call.remoteStream) playWithTapFallback(el);
  }, [call.remoteStream, call.phase, call.callType, applySink]);

  // Attach remote stream to the dedicated <audio> element for VOICE calls.
  // Keep it empty on video calls so the same stream never plays twice.
  useEffect(() => {
    const el = remoteAudioRef.current;
    if (!el) return;
    const isAudioCall = call.callType === 'audio';
    el.srcObject = isAudioCall ? call.remoteStream : null;
    applySink(el);
    if (isAudioCall && call.remoteStream) playWithTapFallback(el);
  }, [call.remoteStream, call.phase, call.callType, applySink]);

  // Attach local stream to the ALWAYS-MOUNTED PiP <video> (video calls).
  // Explicit play() — the autoPlay attribute alone is not reliable on all
  // mobile browsers.
  useEffect(() => {
    const el = localVideoRef.current;
    if (!el) return;
    const show = call.callType === 'video' ? call.localStream : null;
    el.srcObject = show;
    if (show) el.play().catch(() => {});
  }, [call.localStream, call.phase, call.callType]);

  // Detach streams when the overlay closes / phase changes so nothing leaks.
  useEffect(() => {
    return () => {
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
      if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
      if (localVideoRef.current) localVideoRef.current.srcObject = null;
    };
  }, [call.phase]);

  // Track PiP state; always leave PiP when the call ends.
  useEffect(() => {
    const onLeave = () => setIsPiP(false);
    document.addEventListener('leavepictureinpicture', onLeave);
    return () => document.removeEventListener('leavepictureinpicture', onLeave);
  }, []);
  useEffect(() => {
    if (call.phase === 'idle') {
      setIsPiP(false);
      if (document.pictureInPictureElement) {
        document.exitPictureInPicture().catch(() => {});
      }
    }
  }, [call.phase]);

  // Render NOTHING when idle and no error — the chat pane is untouched.
  if (call.phase === 'idle' && !call.error) return null;

  const isVideo = call.callType === 'video';
  const remoteVideoTracks = call.remoteStream?.getVideoTracks() ?? [];
  const hasRemoteVideo = remoteVideoTracks.length > 0;
  const remoteHasNoVideo = !!call.remoteStream && remoteVideoTracks.length === 0;
  const localVideoTracks = call.localStream?.getVideoTracks() ?? [];
  const hasLocalVideo = localVideoTracks.length > 0;
  const localCameraVisible = hasLocalVideo && !call.cameraOff;

  // ---- in-call option handlers ----
  const flashActionError = (msg: string) => {
    setActionError(msg);
    if (actionErrorTimer.current) window.clearTimeout(actionErrorTimer.current);
    actionErrorTimer.current = window.setTimeout(() => setActionError(null), 3500);
  };

  const runAction = async (name: 'flip' | 'share', fn: () => Promise<string>) => {
    if (busyAction) return;
    setBusyAction(name);
    setActionError(null);
    try {
      const r = await fn();
      if (r === 'unsupported') {
        flashActionError(
          name === 'flip'
            ? 'Flipping the camera is not available on this device.'
            : 'Screen sharing needs a desktop browser.',
        );
      } else if (r === 'failed') {
        flashActionError('Could not do that — please try again.');
      }
      // 'cancelled' (user dismissed the picker) stays silent by design.
    } finally {
      setBusyAction(null);
    }
  };

  // Speaker/output cycling (WhatsApp-style): tap moves to the next known
  // output. Honest limits: needs setSinkId support AND 2+ outputs; phones
  // typically expose a single "Default" route, so the button then explains
  // itself instead of pretending.
  const outs = call.audioOutputs;
  const currentOut = outs.find((o) => o.deviceId === call.audioOutputDeviceId) ?? null;
  const canCycleOutput = sinkSupported && outs.length > 1;
  const speakerTitle = !sinkSupported
    ? 'Choosing the speaker is not available in this browser — use your device volume controls'
    : outs.length === 0
      ? 'Looking for audio outputs…'
      : canCycleOutput
        ? `Sound plays on: ${currentOut?.label ?? 'default output'}. Tap to switch output.`
        : `Sound plays on: ${currentOut?.label ?? 'the default output'}`;
  const cycleAudioOutput = () => {
    if (!canCycleOutput) return;
    const idx = outs.findIndex((o) => o.deviceId === call.audioOutputDeviceId);
    const next = outs[(idx + 1) % outs.length];
    if (next) onSetAudioOutput(next.deviceId);
  };

  const togglePiP = async () => {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        const el = remoteVideoRef.current;
        if (!el || !hasRemoteVideo) return;
        await el.requestPictureInPicture();
        setIsPiP(true);
      }
    } catch {
      flashActionError('Picture-in-picture was blocked by the browser.');
    }
  };

  // ---- video stage (outgoing / incoming / in-call for video calls) ----
  const renderVideoStage = (statusLabel: string | null) => (
    <div className="relative h-72 w-full overflow-hidden bg-slate-900">
      {/* Remote video: always mounted — attach can never race creation. */}
      <video
        ref={remoteVideoRef}
        autoPlay
        playsInline
        className={`absolute inset-0 h-full w-full object-cover ${
          hasRemoteVideo ? '' : 'invisible'
        }`}
      />
      {!hasRemoteVideo && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <Avatar name={call.peerName} pulse />
          <p className="text-sm text-slate-300">{statusLabel ?? 'Connecting…'}</p>
          {remoteHasNoVideo && (
            <p className="text-xs font-semibold text-amber-300">
              Video unavailable from {call.peerName}
            </p>
          )}
        </div>
      )}
      <div className="absolute left-3 top-3 rounded-full bg-black/50 px-3 py-1 text-xs font-semibold text-white">
        {call.peerName} · {fmt(dispSecs)}
      </div>
      {call.isScreenSharing && (
        <div className="absolute right-3 top-3 rounded-full bg-emerald-500/90 px-3 py-1 text-xs font-semibold text-white">
          Sharing screen
        </div>
      )}
      {/* Local preview PiP — always mounted for video calls, so the caller
          sees their own camera while the phone is still ringing. */}
      <div className="absolute bottom-3 right-3 h-28 w-20 overflow-hidden rounded-xl border-2 border-white/70 bg-slate-800 shadow-lg">
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className={`h-full w-full object-cover ${localCameraVisible ? '' : 'invisible'}`}
        />
        {!localCameraVisible && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-1 text-center"
            title={call.cameraOff ? 'Camera is off' : 'Camera turns on when the call starts'}
          >
            <VideoOff className="h-5 w-5 text-slate-500" />
            {!hasLocalVideo && (
              <span className="text-[9px] leading-tight text-slate-400">Camera off</span>
            )}
          </div>
        )}
      </div>
    </div>
  );

  const renderBody = () => {
    // Error view (busy / no answer / media failure / connection lost).
    if (call.error) {
      return (
        <motion.div
          key="error"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
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
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.2 }}
          className="flex flex-col"
        >
          {isVideo ? (
            renderVideoStage('Ringing…')
          ) : (
            <div className="flex flex-col items-center px-8 pt-10 text-center">
              <Avatar name={call.peerName} size="lg" pulse />
            </div>
          )}
          <div className="flex flex-col items-center px-8 py-6 text-center">
            <h3 className="text-lg font-bold text-slate-800">Calling {call.peerName}…</h3>
            <p className="mt-1 text-sm text-slate-500">
              {isVideo ? 'Video call' : 'Voice call'} · {fmt(dispSecs)}
            </p>
            <button
              type="button"
              onClick={onEnd}
              className="mt-5 rounded-full bg-red-500 px-8 py-2.5 text-sm font-semibold text-white shadow-lg shadow-red-500/30 transition hover:bg-red-600"
            >
              Cancel
            </button>
          </div>
        </motion.div>
      );
    }

    if (call.phase === 'incoming') {
      return (
        <motion.div
          key="incoming"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.2 }}
          className="flex flex-col"
        >
          {isVideo ? (
            renderVideoStage('Incoming video call')
          ) : (
            <div className="flex flex-col items-center px-8 pt-10 text-center">
              <div className="relative">
                <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/30" />
                <span
                  className="absolute inset-0 animate-ping rounded-full bg-emerald-400/20"
                  style={{ animationDelay: '0.5s' }}
                />
                <Avatar name={call.peerName} size="lg" />
              </div>
            </div>
          )}
          <div className="flex flex-col items-center px-8 py-6 text-center">
            <h3 className="text-lg font-bold text-slate-800">
              Incoming {isVideo ? 'video' : 'voice'} call
            </h3>
            <p className="mt-1 text-sm text-slate-500">from {call.peerName}</p>
            <div className="mt-5 flex items-center gap-5">
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
          </div>
        </motion.div>
      );
    }

    // in-call — WhatsApp-style layout + control bar.
    return (
      <motion.div
        key="in-call"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.2 }}
        className="flex flex-col"
      >
        {isVideo ? (
          renderVideoStage(null)
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

        {/* WhatsApp-style control bar — wraps on narrow phones. */}
        <div className="flex flex-wrap items-center justify-center gap-3 px-6 py-5">
          <ControlButton
            label={call.muted ? 'Unmute microphone' : 'Mute microphone'}
            title={call.muted ? 'Unmute' : 'Mute'}
            onClick={onToggleMute}
            active={call.muted}
            testId="call-mute"
          >
            {call.muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </ControlButton>

          <ControlButton
            label="Switch audio output"
            title={speakerTitle}
            onClick={cycleAudioOutput}
            disabled={!canCycleOutput}
            active={!!currentOut}
            testId="call-speaker"
          >
            <Volume2 className="h-5 w-5" />
          </ControlButton>

          {isVideo && (
            <ControlButton
              label="Flip camera"
              title={
                call.isScreenSharing
                  ? 'Stop screen sharing to flip the camera'
                  : 'Flip camera (front/back)'
              }
              onClick={() => runAction('flip', onFlipCamera)}
              disabled={busyAction !== null || call.isScreenSharing}
              testId="call-flip"
            >
              {busyAction === 'flip' ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <SwitchCamera className="h-5 w-5" />
              )}
            </ControlButton>
          )}

          {isVideo && pipSupported && (
            <ControlButton
              label="Picture-in-picture"
              title="Watch in a floating window"
              onClick={togglePiP}
              active={isPiP}
              testId="call-pip"
            >
              <PictureInPicture2 className="h-5 w-5" />
            </ControlButton>
          )}

          {isVideo && shareSupported && (
            <ControlButton
              label={call.isScreenSharing ? 'Stop sharing screen' : 'Share screen'}
              title={call.isScreenSharing ? 'Stop sharing your screen' : 'Share your screen'}
              onClick={() => runAction('share', onToggleScreenShare)}
              disabled={busyAction !== null}
              active={call.isScreenSharing}
              testId="call-share"
            >
              {busyAction === 'share' ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <ScreenShare className="h-5 w-5" />
              )}
            </ControlButton>
          )}

          {isVideo && (
            <ControlButton
              label={call.cameraOff ? 'Turn camera on' : 'Turn camera off'}
              title={call.cameraOff ? 'Camera on' : 'Camera off'}
              onClick={onToggleCamera}
              active={call.cameraOff}
              testId="call-camera"
            >
              {call.cameraOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
            </ControlButton>
          )}

          <button
            type="button"
            onClick={onEnd}
            aria-label="End call"
            title="End call"
            data-testid="call-end"
            className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 text-white shadow-lg shadow-red-500/30 transition hover:bg-red-600"
          >
            <PhoneOff className="h-6 w-6" />
          </button>
        </div>

        {actionError && (
          <p className="px-8 pb-4 text-center text-xs font-semibold text-red-600" role="alert">
            {actionError}
          </p>
        )}
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
      {/* Remote audio sink for voice calls (invisible). Mounted for the whole
          dialog so it exists across phases; kept empty on video calls to avoid
          double audio with the remote <video>. */}
      <audio ref={remoteAudioRef} autoPlay className="hidden" />
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 14 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="w-[min(430px,94vw)] overflow-hidden rounded-3xl bg-white shadow-2xl"
      >
        <AnimatePresence mode="wait">{renderBody()}</AnimatePresence>
        {needsTapToPlay && !call.error && (
          <div className="flex justify-center px-8 pb-5">
            <button
              type="button"
              onClick={handleTapToPlay}
              className="flex items-center gap-2 rounded-full bg-amber-100 px-5 py-2.5 text-sm font-semibold text-amber-800 shadow transition hover:bg-amber-200"
            >
              <span aria-hidden="true">🔊</span> Tap for sound
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
