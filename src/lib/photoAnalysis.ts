/**
 * photoAnalysis.ts — client wrapper for the `analyze-photo` Edge Function.
 *
 * The browser never talks to Gemini directly: the Edge Function holds the
 * GEMINI_API_KEY server secret and returns observations-only JSON. This
 * module is the single call site; every failure is converted into a
 * PhotoAnalysisError so the checker can degrade honestly without ever
 * blocking or failing the rule-based check.
 */
import { supabase, isSupabaseEnabled } from './supabaseClient';

export interface ObservedSign {
  sign: string;
  region: string;
  confidence: 'low' | 'medium' | 'high';
}

export type PhotoTriageHint = 'monitor' | 'vet_soon' | 'vet_today' | 'emergency';

export interface PhotoAnalysisResult {
  observedSigns: ObservedSign[];
  triageHint: PhotoTriageHint;
  vetQuestions: string[];
  /** Server-enforced; the client must never drop this from the UI. */
  disclaimer: string;
  servedBy?: string;
}

/** Typed failure: the rule-based check always completes anyway. */
export class PhotoAnalysisError extends Error {
  retryable: boolean;
  constructor(message: string, retryable = false) {
    super(message);
    this.name = 'PhotoAnalysisError';
    this.retryable = retryable;
  }
}

export interface AnalyzePetPhotoInput {
  /** Raw base64 bytes (no data: prefix). */
  imageBase64: string;
  mimeType: string;
  species: string;
  symptoms: string[];
}

/**
 * Split a data URL into { base64, mimeType }. Returns null for anything that
 * is not a base64 data URL (e.g. a remote http link — those cannot be sent
 * to the function as bytes).
 */
export function dataUrlToParts(
  dataUrl: string,
): { base64: string; mimeType: string } | null {
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/.exec(
    (dataUrl || '').trim(),
  );
  if (!m) return null;
  return { mimeType: m[1], base64: m[2] };
}

/**
 * Invoke the Edge Function. Resolves with sanitized observations, rejects
 * with PhotoAnalysisError on ANY failure (function not deployed, secret
 * missing, network, bad payload). Never throws anything else.
 */
export async function analyzePetPhoto(
  input: AnalyzePetPhotoInput,
): Promise<PhotoAnalysisResult> {
  if (!isSupabaseEnabled || !supabase) {
    throw new PhotoAnalysisError(
      'photo analysis is not available (the app is in offline mode)',
      false,
    );
  }
  try {
    const { data, error } = await supabase.functions.invoke('analyze-photo', {
      body: input,
    });
    if (error) {
      // supabase-js throws FunctionsHttpError / FunctionsFetchError;
      // older builds return them in `error`. Either way: typed failure.
      throw new PhotoAnalysisError(
        error.message || 'photo analysis request failed',
        true,
      );
    }
    if (!data || typeof data !== 'object') {
      throw new PhotoAnalysisError(
        'photo analysis returned an unreadable response',
        true,
      );
    }
    const d = data as Record<string, unknown>;
    if (typeof d.error === 'string' && d.error.length > 0) {
      throw new PhotoAnalysisError(d.error, d.retryable === true);
    }
    return data as PhotoAnalysisResult;
  } catch (e) {
    if (e instanceof PhotoAnalysisError) throw e;
    throw new PhotoAnalysisError(
      e instanceof Error ? e.message : 'photo analysis request failed',
      true,
    );
  }
}

/** One-line summary of an analysis for the history entry's photoNote. */
export function photoNoteSummary(analysis: PhotoAnalysisResult): string {
  const signs = analysis.observedSigns ?? [];
  const signText =
    signs.length === 0
      ? 'no visible abnormalities noted'
      : signs
          .slice(0, 3)
          .map((s) => `${s.sign}${s.region ? ` (${s.region})` : ''}`)
          .join('; ');
  return `AI photo observations: ${signText}. Triage hint: ${analysis.triageHint}. Informational only, not a diagnosis.`;
}
