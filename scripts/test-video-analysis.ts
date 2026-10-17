/* Headless unit sanity for src/lib/videoAnalysisCore.ts (tsx, no browser needed).
 * Covers the pure/testable parts: file validation, the videoNoteSummary
 * format, and constants. The supabase-bound analyzeVideo() and the
 * browser-only frame decoder are exercised in symptom-video-e2e.cjs with a
 * real webm clip (they cannot run here — no DOM, no Vite env).
 *
 * Note: the >6-frames client guard lives in analyzeVideo(), which imports
 * the Vite-only supabaseClient — it is covered in the e2e instead (scenario
 * stubs return HTTP 400 behavior is server-enforced anyway).
 */
import {
  validateVideoFile,
  videoNoteSummary,
  VideoAnalysisError,
  VIDEO_MAX_FRAMES,
  VIDEO_MAX_BYTES,
  VIDEO_GUIDANCE_SECONDS,
  type VideoAnalysisResult,
} from '../src/lib/videoAnalysisCore';

let failures = 0;
const check = (label: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`);
  if (!ok) failures++;
};

const fakeFile = (name: string, type: string, size: number) =>
  ({ name, type, size }) as unknown as File;

(async () => {
  check('constants: max 6 frames', VIDEO_MAX_FRAMES === 6);
  check('constants: video cap 100 MB', VIDEO_MAX_BYTES === 100 * 1024 * 1024);
  check('constants: guidance 60 s', VIDEO_GUIDANCE_SECONDS === 60);

  // 1. non-video file rejected with a typed, non-retryable error
  try {
    validateVideoFile(fakeFile('photo.jpg', 'image/jpeg', 1000));
    check('validateVideoFile rejects image file', false);
  } catch (e) {
    check(
      'validateVideoFile rejects image file',
      e instanceof VideoAnalysisError && e.retryable === false,
    );
  }
  // 2. oversize video rejected
  try {
    validateVideoFile(fakeFile('huge.mp4', 'video/mp4', VIDEO_MAX_BYTES + 1));
    check('validateVideoFile rejects >100 MB clip', false);
  } catch (e) {
    check(
      'validateVideoFile rejects >100 MB clip',
      e instanceof VideoAnalysisError && String((e as Error).message).includes('100 MB'),
    );
  }
  // 3. extension fallback when the browser reports no MIME type
  try {
    validateVideoFile(fakeFile('clip.mov', '', 1000));
    check('validateVideoFile accepts .mov with empty MIME', true);
  } catch {
    check('validateVideoFile accepts .mov with empty MIME', false);
  }

  // 4. history summary format
  const analysis: VideoAnalysisResult = {
    observedSigns: [
      { sign: 'Slight limp', region: 'left front leg', confidence: 'medium' },
    ],
    triageHint: 'vet_soon',
    sequenceNote: 'the limp is more pronounced in the later frames',
    vetQuestions: ['Is it constant?'],
    disclaimer: 'server-enforced',
  };
  const note = videoNoteSummary(analysis);
  check('videoNoteSummary starts with "Video:"', note.startsWith('Video:'));
  check('videoNoteSummary carries sequenceNote', note.includes('more pronounced in the later frames'));
  check('videoNoteSummary carries triage hint', note.includes('vet_soon'));
  check('videoNoteSummary carries disclaimer line', note.includes('Informational only, not a diagnosis'));
  const empty = videoNoteSummary({
    observedSigns: [],
    triageHint: 'monitor',
    sequenceNote: '',
    vetQuestions: [],
    disclaimer: '',
  });
  check('videoNoteSummary empty signs fallback', empty.includes('no visible abnormalities noted across frames'));

  console.log(failures === 0 ? '\nALL VIDEO-UNIT CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
