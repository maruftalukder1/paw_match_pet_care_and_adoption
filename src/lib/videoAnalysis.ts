/**
 * videoAnalysis.ts — client wrapper for the `analyze-video` Edge Function.
 *
 * PRIVACY: the raw video never leaves the device. The browser extracts up to
 * 6 still frames from the clip (<video> + canvas, downscaled like the photo
 * uploader) and only those frames are sent to the Edge Function, which holds
 * the GEMINI_API_KEY server secret and returns observations-only JSON.
 * This module is the single call site; every failure is converted into a
 * VideoAnalysisError so the checker can degrade honestly without ever
 * blocking or failing the rule-based check.
 */
import { supabase, isSupabaseEnabled } from './supabaseClient';
import {
  VIDEO_MAX_FRAMES,
  VIDEO_FRAME_MAX_DIM,
  VIDEO_FRAME_JPEG_QUALITY,
  VIDEO_FRAME_MAX_BASE64,
  validateVideoFile,
  VideoAnalysisError,
  type ExtractedFrame,
  type VideoAnalysisResult,
} from './videoAnalysisCore';

// Re-export the shared surface so hosts import from this module only.
export * from './videoAnalysisCore';

export interface AnalyzeVideoInput {
  /** 1..VIDEO_MAX_FRAMES extracted frames, chronological. */
  framesBase64: string[];
  mimeType: string;
  species: string;
  symptoms: string[];
  durationSec: number;
}

function loadVideoMetadata(file: File): Promise<{ video: HTMLVideoElement; durationSec: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'auto';
    video.playsInline = true;
    const cleanup = () => {
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
    };
    video.onloadedmetadata = () => {
      const durationSec = Number.isFinite(video.duration) ? video.duration : 0;
      if (!durationSec || durationSec <= 0) {
        cleanup();
        reject(new VideoAnalysisError('That video has no readable duration — please try another clip.', false));
        return;
      }
      resolve({ video, durationSec });
    };
    video.onerror = () => {
      cleanup();
      reject(
        new VideoAnalysisError(
          'That video could not be decoded in this browser — please try an MP4 or WebM clip.',
          false,
        ),
      );
    };
    video.src = url;
  });
}

function seekTo(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      video.onseeked = null;
      video.onerror = null;
      reject(new VideoAnalysisError('Sampling frames from that video timed out — please try a shorter clip.', false));
    }, 15000);
    video.onseeked = () => {
      window.clearTimeout(timer);
      video.onseeked = null;
      video.onerror = null;
      resolve();
    };
    video.onerror = () => {
      window.clearTimeout(timer);
      video.onseeked = null;
      video.onerror = null;
      reject(new VideoAnalysisError('That video could not be sampled in this browser.', false));
    };
    try {
      video.currentTime = Math.min(Math.max(0, t), Math.max(0, video.duration - 0.05));
    } catch (e) {
      window.clearTimeout(timer);
      reject(
        new VideoAnalysisError(
          e instanceof Error ? e.message : 'That video could not be sampled in this browser.',
          false,
        ),
      );
    }
  });
}

function frameToJpeg(video: HTMLVideoElement): string {
  const vw = video.videoWidth || 640;
  const vh = video.videoHeight || 360;
  const scale = Math.min(1, VIDEO_FRAME_MAX_DIM / Math.max(vw, vh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(vw * scale));
  canvas.height = Math.max(1, Math.round(vh * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new VideoAnalysisError('Image processing is not available in this browser.', false);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', VIDEO_FRAME_JPEG_QUALITY);
  const base64 = dataUrl.split(',', 2)[1] ?? '';
  if (!base64) throw new VideoAnalysisError('Sampling a frame from that video failed.', false);
  if (base64.length > VIDEO_FRAME_MAX_BASE64) {
    throw new VideoAnalysisError('A sampled frame was too large — please try a shorter clip.', false);
  }
  return base64;
}

/**
 * Extract up to VIDEO_MAX_FRAMES still frames spread evenly across the clip.
 * Frames are JPEG base64, longest side ≤ 1000 px, in chronological order.
 * Throws VideoAnalysisError (typed) on any failure — the caller degrades
 * honestly and the rule-based check is never blocked.
 */
export async function extractVideoFrames(
  file: File,
  frameCount: number = VIDEO_MAX_FRAMES,
): Promise<{ frames: ExtractedFrame[]; durationSec: number }> {
  validateVideoFile(file);
  const { video, durationSec } = await loadVideoMetadata(file);
  try {
    const n = Math.max(1, Math.min(VIDEO_MAX_FRAMES, Math.floor(frameCount)));
    const frames: ExtractedFrame[] = [];
    for (let i = 0; i < n; i++) {
      // Sample at the center of each equal slice so frames spread across
      // the whole clip, not just its start.
      const t = (durationSec * (i + 0.5)) / n;
      await seekTo(video, t);
      frames.push({ base64: frameToJpeg(video), mimeType: 'image/jpeg', atSec: t });
    }
    return { frames, durationSec };
  } finally {
    video.removeAttribute('src');
    video.load();
  }
}

/** Lightweight duration probe (for the preview line) without extracting frames. */
export async function getVideoDurationSec(file: File): Promise<number> {
  validateVideoFile(file);
  const { video, durationSec } = await loadVideoMetadata(file);
  video.removeAttribute('src');
  video.load();
  return durationSec;
}

/**
 * Invoke the Edge Function with extracted frames. Resolves with sanitized
 * observations, rejects with VideoAnalysisError on ANY failure (function not
 * deployed, secret missing, network, bad payload). Never throws anything else.
 */
export async function analyzeVideo(
  input: AnalyzeVideoInput,
): Promise<VideoAnalysisResult> {
  if (input.framesBase64.length === 0 || input.framesBase64.length > VIDEO_MAX_FRAMES) {
    throw new VideoAnalysisError(
      `video analysis needs 1 to ${VIDEO_MAX_FRAMES} sampled frames`,
      false,
    );
  }
  if (!isSupabaseEnabled || !supabase) {
    throw new VideoAnalysisError(
      'video analysis is not available (the app is in offline mode)',
      false,
    );
  }
  try {
    const { data, error } = await supabase.functions.invoke('analyze-video', {
      body: input,
    });
    if (error) {
      throw new VideoAnalysisError(
        error.message || 'video analysis request failed',
        true,
      );
    }
    if (!data || typeof data !== 'object') {
      throw new VideoAnalysisError(
        'video analysis returned an unreadable response',
        true,
      );
    }
    const d = data as Record<string, unknown>;
    if (typeof d.error === 'string' && d.error.length > 0) {
      throw new VideoAnalysisError(d.error, d.retryable === true);
    }
    return data as VideoAnalysisResult;
  } catch (e) {
    if (e instanceof VideoAnalysisError) throw e;
    throw new VideoAnalysisError(
      e instanceof Error ? e.message : 'video analysis request failed',
      true,
    );
  }
}
