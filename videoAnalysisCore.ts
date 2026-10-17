/**
 * videoAnalysisCore.ts — pure, DOM/supabase-free logic for video symptom
 * analysis. Kept import-free of the Vite client so headless unit tests
 * (tsx) can exercise it without a browser.
 */

export const VIDEO_MAX_FRAMES = 6;
export const VIDEO_FRAME_MAX_DIM = 1000;
export const VIDEO_FRAME_JPEG_QUALITY = 0.85;
export const VIDEO_FRAME_MAX_BASE64 = 1_500_000;
export const VIDEO_MAX_BYTES = 100 * 1024 * 1024;
export const VIDEO_GUIDANCE_SECONDS = 60;

export interface ExtractedFrame {
  base64: string;
  mimeType: 'image/jpeg';
  atSec: number;
}

export interface VideoObservedSign {
  sign: string;
  region: string;
  confidence: 'low' | 'medium' | 'high';
}

export type VideoTriageHint = 'monitor' | 'vet_soon' | 'vet_today' | 'emergency';

export interface VideoAnalysisResult {
  observedSigns: VideoObservedSign[];
  triageHint: VideoTriageHint;
  sequenceNote: string;
  vetQuestions: string[];
  disclaimer: string;
  servedBy?: string;
}

/** Typed failure: the rule-based check always completes anyway. */
export class VideoAnalysisError extends Error {
  retryable: boolean;
  constructor(message: string, retryable = false) {
    super(message);
    this.name = 'VideoAnalysisError';
    this.retryable = retryable;
  }
}

const VIDEO_NAME_RE = /\.(mp4|m4v|mov|webm|mkv|avi|3gp|ogv)$/i;

function isVideoFile(file: File): boolean {
  if (file.type.startsWith('video/')) return true;
  return VIDEO_NAME_RE.test(file.name);
}

/** Friendly rejection before any expensive work. */
export function validateVideoFile(file: File): void {
  if (!isVideoFile(file)) {
    throw new VideoAnalysisError(
      `"${file.name}" is not a video file. Please choose an MP4, WebM or MOV clip.`,
      false,
    );
  }
  if (file.size > VIDEO_MAX_BYTES) {
    throw new VideoAnalysisError(
      `That video is ${(file.size / (1024 * 1024)).toFixed(1)} MB — the limit is 100 MB. Please use a shorter clip.`,
      false,
    );
  }
}

/** One-line summary of a video analysis for the history entry's photoNote. */
export function videoNoteSummary(analysis: VideoAnalysisResult): string {
  const signs = analysis.observedSigns ?? [];
  const signText =
    signs.length === 0
      ? 'no visible abnormalities noted across frames'
      : signs
          .slice(0, 3)
          .map((s) => `${s.sign}${s.region ? ` (${s.region})` : ''}`)
          .join('; ');
  const seq = analysis.sequenceNote ? ` ${analysis.sequenceNote}` : '';
  return `Video: AI observations across sampled frames — ${signText}.${seq} Triage hint: ${analysis.triageHint}. Informational only, not a diagnosis.`;
}
