import React, { useEffect, useState } from 'react';
import {
  Stethoscope,
  AlertTriangle,
  Clock,
  Activity,
  HeartPulse,
  Calendar,
  MapPin,
  Trash2,
  History as HistoryIcon,
  CheckCircle2,
  Eye,
  Home,
  ChevronRight,
  Info,
  Siren,
  Sparkles,
  Camera,
  Video as VideoIcon,
  Film,
  Upload,
  X,
} from 'lucide-react';
import { Pet, AnyUser } from '../types';
import {
  CheckerSpecies,
  DurationId,
  SeverityId,
  UrgencyLevel,
  CheckResult,
  symptomsForSpecies,
  evaluateCheck,
  urgencyLabel as urgencyLabelFor,
  DISCLAIMER,
  DURATION_OPTIONS,
  SEVERITY_OPTIONS,
  SymptomCheckHistoryEntry,
  loadSymptomHistory,
  addSymptomHistoryEntry,
  deleteSymptomHistoryEntry,
  clearSymptomHistory,
} from '../lib/symptomRules';
import { ImageUploader } from './ImageUploader';
import {
  analyzePetPhoto,
  dataUrlToParts,
  photoNoteSummary,
  PhotoAnalysisError,
  PhotoAnalysisResult,
} from '../lib/photoAnalysis';
import {
  analyzeVideo,
  extractVideoFrames,
  getVideoDurationSec,
  validateVideoFile,
  videoNoteSummary,
  VideoAnalysisError,
  VideoAnalysisResult,
  VIDEO_MAX_FRAMES,
  VIDEO_GUIDANCE_SECONDS,
} from '../lib/videoAnalysis';

interface SymptomCheckerProps {
  currentUser: AnyUser | null;
  pets: Pet[];
  /** Open the Pet Care booking modal with prefilled values. */
  onRequestBooking: (prefill: { petName: string; reason: string }) => void;
  /** Deep-link to the Services directory (vets). */
  onNavigateToServices: () => void;
}

const URGENCY_STYLES: Record<UrgencyLevel, { badge: string; icon: React.ReactNode }> = {
  monitor: {
    badge: 'bg-emerald-100 text-emerald-800 border border-emerald-300',
    icon: <Home className="w-6 h-6" />,
  },
  vet24h: {
    badge: 'bg-amber-100 text-amber-800 border border-amber-300',
    icon: <Clock className="w-6 h-6" />,
  },
  vetToday: {
    badge: 'bg-orange-100 text-orange-800 border border-orange-300',
    icon: <Activity className="w-6 h-6" />,
  },
  emergency: {
    badge: 'bg-red-100 text-red-800 border border-red-300',
    icon: <Siren className="w-6 h-6" />,
  },
};

const SPECIES_TABS: CheckerSpecies[] = ['dog', 'cat', 'bird', 'rabbit', 'other'];

/**
 * Video picker for the checker's Step 5 (phase 3). The raw file is NEVER
 * uploaded anywhere — only on-device frame sampling reads it.
 */
const SymptomVideoPicker: React.FC<{
  file: File | null;
  objectUrl: string;
  durationSec: number;
  processing: boolean;
  error: string | null;
  onFiles: (files: FileList | null) => void;
  onRemove: () => void;
}> = ({ file, objectUrl, durationSec, processing, error, onFiles, onRemove }) => {
  const inputRef = React.useRef<HTMLInputElement>(null);
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 space-y-2.5">
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        onChange={(e) => {
          void onFiles(e.target.files);
          e.target.value = ''; // allow re-picking the same file
        }}
        className="sr-only"
        data-testid="symptom-video-input"
        aria-label="Choose a video clip"
      />
      {file && objectUrl ? (
        <>
          <div className="relative rounded-xl overflow-hidden bg-black max-w-sm">
            <video
              src={objectUrl}
              controls
              muted
              playsInline
              preload="metadata"
              data-testid="symptom-video-preview"
              className="w-full max-h-56"
            />
            <button
              type="button"
              onClick={onRemove}
              aria-label="Remove video"
              data-testid="symptom-video-remove"
              className="absolute top-2 right-2 p-1.5 bg-slate-900/70 hover:bg-rose-600 text-white rounded-full transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <Film className="w-4 h-4 text-teal-700 shrink-0" />
            <span>
              {Math.round(durationSec)}s clip · {VIDEO_MAX_FRAMES} frames will be sampled across it
            </span>
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={processing}
            className="px-3 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white font-bold text-xs rounded-xl flex items-center gap-2 transition-colors"
          >
            {processing ? (
              <>
                <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin shrink-0" />
                Processing video…
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                Choose a different clip
              </>
            )}
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={processing}
            data-testid="symptom-video-choose"
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 border-2 border-dashed border-emerald-300 hover:border-emerald-500 bg-emerald-50/60 hover:bg-emerald-50 text-emerald-800 font-bold text-xs rounded-xl transition-colors disabled:opacity-60"
          >
            {processing ? (
              <>
                <span className="w-4 h-4 rounded-full border-2 border-emerald-600 border-t-transparent animate-spin shrink-0" />
                Processing video…
              </>
            ) : (
              <>
                <VideoIcon className="w-4 h-4" />
                Choose a video clip
              </>
            )}
          </button>
          <p className="text-[10px] text-slate-400 leading-relaxed">
            MP4, WebM or MOV · up to 100 MB. Only {VIDEO_MAX_FRAMES} still frames are sampled
            on your device and analyzed.
          </p>
        </>
      )}
      {error && (
        <p role="alert" className="text-[11px] text-rose-600 font-medium" data-testid="symptom-video-error">
          {error}
        </p>
      )}
    </div>
  );
};

export const SymptomChecker: React.FC<SymptomCheckerProps> = ({
  currentUser,
  pets,
  onRequestBooking,
  onNavigateToServices,
}) => {
  const userId = currentUser?.id || 'guest';
  const myPets = pets.filter((p) => p.ownerId === currentUser?.id || !currentUser);

  const [petId, setPetId] = useState<string>('manual');
  const [species, setSpecies] = useState<CheckerSpecies>('dog');
  const [petName, setPetName] = useState('');
  const [symptomIds, setSymptomIds] = useState<string[]>([]);
  const [duration, setDuration] = useState<DurationId | ''>('');
  const [severity, setSeverity] = useState<SeverityId | ''>('');
  const [result, setResult] = useState<CheckResult | null>(null);
  const [resultSummary, setResultSummary] = useState<{ petName: string; species: CheckerSpecies } | null>(null);
  const [history, setHistory] = useState<SymptomCheckHistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  // ---- Phase-2 photo analysis (optional, never blocks the check) ----
  const [photoDataUrl, setPhotoDataUrl] = useState('');
  const [photoAnalysis, setPhotoAnalysis] = useState<PhotoAnalysisResult | null>(null);
  /** 'idle' | 'analyzing' | 'done' | 'unavailable' — failures always degrade to 'unavailable'. */
  const [photoStatus, setPhotoStatus] = useState<'idle' | 'analyzing' | 'done' | 'unavailable'>('idle');
  const [photoUnavailableReason, setPhotoUnavailableReason] = useState('');
  // ---- Phase-3 video analysis (optional, never blocks the check) ----
  /** The video file is never uploaded anywhere — only sampled frames leave the device. */
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoObjectUrl, setVideoObjectUrl] = useState('');
  const [videoDurationSec, setVideoDurationSec] = useState(0);
  const [videoAnalysis, setVideoAnalysis] = useState<VideoAnalysisResult | null>(null);
  const [videoStatus, setVideoStatus] = useState<'idle' | 'analyzing' | 'done' | 'unavailable'>('idle');
  const [videoUnavailableReason, setVideoUnavailableReason] = useState('');
  const [videoError, setVideoError] = useState<string | null>(null);
  const [videoProcessing, setVideoProcessing] = useState(false);
  /** Photo / video pane selection. Media kinds are alternatives: attaching
   *  one clears the other, and the tab always shows the attached kind. */
  const [mediaTab, setMediaTab] = useState<'photo' | 'video'>('photo');

  useEffect(() => {
    setHistory(loadSymptomHistory(userId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const availableSymptoms = symptomsForSpecies(species);

  const toggleSymptom = (id: string) =>
    setSymptomIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );

  /** Clears the result and any AI-analysis state, but keeps attached media. */
  const clearResultState = () => {
    setResult(null);
    setResultSummary(null);
    setSymptomIds([]);
    setDuration('');
    setSeverity('');
    setPhotoAnalysis(null);
    setPhotoStatus('idle');
    setPhotoUnavailableReason('');
    setVideoAnalysis(null);
    setVideoStatus('idle');
    setVideoUnavailableReason('');
  };

  const resetCheckState = () => {
    clearResultState();
    setPhotoDataUrl('');
    clearVideoAttachment();
  };

  const clearVideoAttachment = () => {
    setVideoFile(null);
    setVideoObjectUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return '';
    });
    setVideoDurationSec(0);
    setVideoAnalysis(null);
    setVideoStatus('idle');
    setVideoUnavailableReason('');
    setVideoError(null);
  };

  /** Attaching a photo clears any attached video (one check = one kind of media). */
  const handlePhotoChange = (v: string | '') => {
    setPhotoDataUrl(v);
    setPhotoAnalysis(null);
    setPhotoStatus('idle');
    setPhotoUnavailableReason('');
    if (v) {
      clearVideoAttachment();
      setMediaTab('photo');
    }
  };

  const handleVideoFiles = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setVideoError(null);
    try {
      validateVideoFile(file);
    } catch (e) {
      setVideoError(e instanceof VideoAnalysisError ? e.message : 'That video could not be used.');
      return;
    }
    setVideoProcessing(true);
    try {
      const durationSec = await getVideoDurationSec(file);
      // Attach the video and clear any attached photo (alternatives).
      clearVideoAttachment();
      setPhotoDataUrl('');
      setPhotoAnalysis(null);
      setPhotoStatus('idle');
      setPhotoUnavailableReason('');
      setVideoFile(file);
      setVideoObjectUrl(URL.createObjectURL(file));
      setVideoDurationSec(durationSec);
      setMediaTab('video');
    } catch (e) {
      setVideoError(e instanceof VideoAnalysisError ? e.message : 'That video could not be used.');
    } finally {
      setVideoProcessing(false);
    }
  };

  const selectMediaTab = (tab: 'photo' | 'video') => {
    setMediaTab(tab);
    // Switching to Photo with a video attached clears the video (alternatives).
    if (tab === 'photo' && videoFile) clearVideoAttachment();
  };

  const selectPet = (id: string) => {
    setPetId(id);
    clearResultState();
    if (id === 'manual') {
      setPetName('');
      return;
    }
    const pet = pets.find((p) => p.id === id);
    if (pet) {
      setSpecies(pet.species as CheckerSpecies);
      setPetName(pet.name);
    }
  };

  const selectSpecies = (s: CheckerSpecies) => {
    setSpecies(s);
    clearResultState();
  };

  const canCheck = symptomIds.length > 0 && duration !== '' && severity !== '';

  const handleCheck = async () => {
    if (!canCheck) return;
    const r = evaluateCheck({
      species,
      petName: petName || (petId !== 'manual' ? petName : ''),
      symptomIds,
      duration: duration as DurationId,
      severity: severity as SeverityId,
    });
    // The rule-based result ALWAYS completes first — the photo path can only
    // add information on top of it, never block or fail it.
    setResult(r);
    setResultSummary({ petName: petName || `My ${species}`, species });
    setPhotoAnalysis(null);
    setVideoAnalysis(null);

    const labels0 = r.symptoms.map((s) => s.label);
    let videoAnalysisLocal: VideoAnalysisResult | null = null;

    if (videoFile) {
      // ---- Phase-3 video path: frames are sampled on-device; the raw video
      // never leaves the device. The rule-based result above stands either way.
      setVideoStatus('analyzing');
      setVideoUnavailableReason('');
      try {
        const { frames, durationSec: dur } = await extractVideoFrames(videoFile);
        videoAnalysisLocal = await analyzeVideo({
          framesBase64: frames.map((f) => f.base64),
          mimeType: 'image/jpeg',
          species,
          symptoms: labels0,
          durationSec: dur,
        });
        setVideoAnalysis(videoAnalysisLocal);
        setVideoStatus('done');
      } catch (e) {
        const msg = e instanceof VideoAnalysisError ? e.message : 'video analysis request failed';
        console.warn('[SymptomChecker] video analysis failed:', msg);
        setVideoStatus('unavailable');
        setVideoUnavailableReason('Video analysis isn’t available right now — your check above is unaffected.');
      }
    }

    let analysis: PhotoAnalysisResult | null = null;
    if (photoDataUrl) {
      const parts = dataUrlToParts(photoDataUrl);
      if (!parts) {
        // A pasted link (not an uploaded image) cannot be sent to the
        // function as bytes — say so honestly instead of failing silently.
        setPhotoStatus('unavailable');
        setPhotoUnavailableReason(
          'Photo analysis works with uploaded images — links can’t be analyzed right now.',
        );
        console.warn('[SymptomChecker] photo analysis skipped: link URLs cannot be sent as image bytes.');
      } else {
        setPhotoStatus('analyzing');
        setPhotoUnavailableReason('');
        try {
          const labels = r.symptoms.map((s) => s.label);
          analysis = await analyzePetPhoto({
            imageBase64: parts.base64,
            mimeType: parts.mimeType,
            species,
            symptoms: labels,
          });
          setPhotoAnalysis(analysis);
          setPhotoStatus('done');
        } catch (e) {
          // ANY failure degrades honestly; the rule-based check above stands.
          const msg = e instanceof PhotoAnalysisError ? e.message : 'photo analysis request failed';
          console.warn('[SymptomChecker] photo analysis failed:', msg);
          setPhotoStatus('unavailable');
          setPhotoUnavailableReason('Photo analysis isn’t available right now — your check above is unaffected.');
        }
      }
    }

    // Emergency escalation: an emergency hint from EITHER AI path can only
    // ESCALATE the displayed band — it never de-escalates the rule engine.
    const escalated =
      (analysis?.triageHint === 'emergency' || videoAnalysisLocal?.triageHint === 'emergency') &&
      r.urgency !== 'emergency';
    const labels = r.symptoms.map((s) => s.label);
    const photoNote = videoAnalysisLocal
      ? videoNoteSummary(videoAnalysisLocal)
      : analysis
        ? photoNoteSummary(analysis)
        : undefined;
    setHistory(
      addSymptomHistoryEntry(userId, {
        petName: petName || `My ${species}`,
        species,
        symptomIds,
        symptomLabels: labels,
        duration: duration as DurationId,
        severity: severity as SeverityId,
        urgency: escalated ? 'emergency' : r.urgency,
        urgencyLabel: escalated ? urgencyLabelFor('emergency') : r.urgencyLabel,
        photoNote,
      }),
    );
  };

  const handleDeleteEntry = (id: string) =>
    setHistory(deleteSymptomHistoryEntry(userId, id));

  const handleClearHistory = () => setHistory(clearSymptomHistory(userId));

  /** Phase-2/3 escalation: an emergency AI hint only ever ESCALATES — never de-escalates. */
  const aiEscalates = Boolean(
    ((photoAnalysis && photoAnalysis.triageHint === 'emergency') ||
      (videoAnalysis && videoAnalysis.triageHint === 'emergency')) &&
      result &&
      result.urgency !== 'emergency',
  );
  /** Which AI media drove the escalation (photo/video) — for the banner wording. */
  const aiEscalatedByVideo = Boolean(videoAnalysis && videoAnalysis.triageHint === 'emergency');
  const showEmergencyBanner = Boolean(result && (result.isEmergency || aiEscalates));
  const displayUrgency: UrgencyLevel = aiEscalates ? 'emergency' : (result?.urgency ?? 'monitor');
  const displayUrgencyStyle = URGENCY_STYLES[displayUrgency];
  const displayUrgencyLabel = aiEscalates ? urgencyLabelFor('emergency') : (result?.urgencyLabel ?? '');

  const bookWithCheck = () => {
    if (!result || !resultSummary) return;
    onRequestBooking({
      petName: resultSummary.petName,
      reason: `Symptom check follow-up (${result.urgencyLabel}): ${result.symptoms
        .map((s) => s.label)
        .join(', ')}`,
    });
  };

  return (
    <div data-testid="symptom-checker" className="space-y-6">
      {/* ---- Hero banner (top of Pet Care) ---- */}
      <div className="bg-gradient-to-br from-teal-700 via-emerald-700 to-teal-800 rounded-3xl p-6 sm:p-8 text-white shadow-lg relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center gap-5 relative z-10">
          <div className="w-16 h-16 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center shrink-0 symptom-hero-float">
            <Stethoscope className="w-8 h-8 text-white" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight">
              Pet Symptom Checker
            </h2>
            <p className="text-teal-100 text-xs sm:text-sm mt-1 max-w-2xl">
              Answer a few questions about your pet's symptoms and get safe,
              species-aware next steps — <strong>general guidance only, not a diagnosis</strong>.
            </p>
            <div className="mt-3 flex items-start gap-2 bg-black/20 rounded-xl p-3 text-[11px] sm:text-xs text-teal-50">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{DISCLAIMER}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() =>
              document
                .getElementById('symptom-checker-form')
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }
            className="px-6 py-3 bg-white text-teal-800 font-extrabold text-sm rounded-xl shadow hover:bg-teal-50 transition-colors flex items-center gap-2 shrink-0"
          >
            <HeartPulse className="w-5 h-5" />
            <span>Check Symptoms</span>
          </button>
        </div>
      </div>

      {/* ---- The checker form ---- */}
      <div
        id="symptom-checker-form"
        className="bg-white rounded-3xl border border-slate-200 shadow-xs p-6 sm:p-8 space-y-6"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-extrabold text-slate-900 text-lg flex items-center gap-2">
            <Activity className="w-5 h-5 text-teal-700" />
            <span>Start a Symptom Check</span>
          </h3>
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-teal-700"
            data-testid="symptom-history-toggle"
          >
            <HistoryIcon className="w-4 h-4" />
            <span>History ({history.length})</span>
          </button>
        </div>

        {/* History */}
        {historyOpen && (
          <div
            data-testid="symptom-history"
            className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-800">
                Past Checks {currentUser ? `— ${currentUser.name}` : '— guest'}
              </h4>
              {history.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearHistory}
                  className="text-[11px] font-bold text-rose-600 hover:text-rose-800"
                  data-testid="symptom-history-clear"
                >
                  Clear all
                </button>
              )}
            </div>
            {history.length === 0 ? (
              <p className="text-xs text-slate-500">No checks yet. Run your first check below.</p>
            ) : (
              <ul className="space-y-2">
                {history.map((h) => (
                  <li
                    key={h.id}
                    data-testid={`symptom-history-item-${h.id}`}
                    className="bg-white rounded-xl border border-slate-200 p-3 flex items-start justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="font-bold text-slate-900">
                        {h.petName} <span className="font-medium text-slate-500 capitalize">· {h.species}</span>
                      </div>
                      <div className="text-slate-500 mt-0.5">{h.symptomLabels.join(', ')}</div>
                      {h.photoNote && (
                        <div
                          className="text-violet-700 mt-1 flex items-start gap-1"
                          data-testid={`symptom-history-photo-${h.id}`}
                        >
                          <Camera className="w-3.5 h-3.5 shrink-0 mt-px" />
                          <span className="line-clamp-2">{h.photoNote}</span>
                        </div>
                      )}
                      <div className="text-slate-400 mt-0.5">
                        {new Date(h.ts).toLocaleString()} · {h.severity} ·{' '}
                        <span className="font-bold">{h.urgencyLabel}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteEntry(h.id)}
                      aria-label="Delete this check"
                      className="text-slate-400 hover:text-rose-600 shrink-0"
                      data-testid={`symptom-history-delete-${h.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Step 1: pet / species */}
        <div>
          <div className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
            1 · Which pet is this about?
          </div>
          {currentUser && myPets.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {myPets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => selectPet(p.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-colors ${
                    petId === p.id
                      ? 'bg-teal-700 text-white border-teal-700'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-teal-400'
                  }`}
                >
                  {p.name} <span className="font-medium opacity-70 capitalize">· {p.species}</span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => selectPet('manual')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-colors ${
                  petId === 'manual'
                    ? 'bg-teal-700 text-white border-teal-700'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-teal-400'
                }`}
              >
                Another pet…
              </button>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {SPECIES_TABS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => selectSpecies(s)}
                disabled={petId !== 'manual'}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold capitalize border transition-colors ${
                  species === s && petId === 'manual'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400 disabled:opacity-40'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          {petId === 'manual' && (
            <input
              type="text"
              value={petName}
              onChange={(e) => setPetName(e.target.value)}
              placeholder="Pet's name (optional)"
              className="mt-2 w-full max-w-xs py-2 px-3 rounded-xl border border-slate-200 text-xs"
            />
          )}
        </div>

        {/* Step 2: symptoms */}
        <div>
          <div className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
            2 · Select the symptoms <span className="text-slate-400 font-medium normal-case">(pick all that apply)</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {availableSymptoms.map((s) => {
              const active = symptomIds.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleSymptom(s.id)}
                  aria-pressed={active}
                  data-testid={`symptom-option-${s.id}`}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-colors flex items-center gap-1.5 ${
                    active
                      ? s.redFlag
                        ? 'bg-red-600 text-white border-red-600'
                        : 'bg-teal-600 text-white border-teal-600'
                      : s.redFlag
                        ? 'bg-red-50 text-red-800 border-red-200 hover:border-red-400'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-teal-400'
                  }`}
                >
                  {s.redFlag && <AlertTriangle className="w-3.5 h-3.5" />}
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 3: duration */}
        <div>
          <div className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
            3 · How long has this been going on?
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {DURATION_OPTIONS.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setDuration(d.id)}
                data-testid={`symptom-duration-${d.id}`}
                className={`px-3 py-2.5 rounded-xl text-xs font-bold border transition-colors flex items-center justify-center gap-1.5 ${
                  duration === d.id
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Step 4: severity */}
        <div>
          <div className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
            4 · How severe does it seem?
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {SEVERITY_OPTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSeverity(s.id)}
                data-testid={`symptom-severity-${s.id}`}
                className={`px-3 py-2.5 rounded-xl text-left border transition-colors ${
                  severity === s.id
                    ? s.id === 'severe'
                      ? 'bg-red-600 text-white border-red-600'
                      : s.id === 'moderate'
                        ? 'bg-amber-500 text-white border-amber-500'
                        : 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'
                }`}
              >
                <div className="text-xs font-extrabold">{s.label}</div>
                <div className={`text-[11px] mt-0.5 ${severity === s.id ? 'opacity-90' : 'text-slate-500'}`}>
                  {s.hint}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Step 5: optional photo OR video (phase 2 / phase 3) */}
        <div data-testid="symptom-photo-step">
          <div className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
            5 · Add a photo or video{' '}
            <span className="text-slate-400 font-medium normal-case">(optional — AI observations)</span>
          </div>
          <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit mb-3" role="tablist" aria-label="Media type">
            <button
              type="button"
              role="tab"
              aria-selected={mediaTab === 'photo'}
              data-testid="symptom-media-tab-photo"
              onClick={() => selectMediaTab('photo')}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors flex items-center gap-1.5 ${
                mediaTab === 'photo' ? 'bg-teal-600 text-white shadow-xs' : 'text-slate-500 hover:text-teal-700 hover:bg-teal-50'
              }`}
            >
              <Camera className="w-3.5 h-3.5" /> Photo
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mediaTab === 'video'}
              data-testid="symptom-media-tab-video"
              onClick={() => selectMediaTab('video')}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors flex items-center gap-1.5 ${
                mediaTab === 'video' ? 'bg-teal-600 text-white shadow-xs' : 'text-slate-500 hover:text-teal-700 hover:bg-teal-50'
              }`}
            >
              <VideoIcon className="w-3.5 h-3.5" /> Video
            </button>
          </div>

          {mediaTab === 'photo' ? (
            <div data-testid="symptom-photo-pane">
              <ImageUploader
                value={photoDataUrl}
                onChange={handlePhotoChange}
                label="Pet photo"
                compact
              />
              <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                A clearer photo works best. Your check always completes from the rules below —
                the AI photo observations only add extra detail when the analysis service is available.
              </p>
            </div>
          ) : (
            <div data-testid="symptom-video-pane">
              <SymptomVideoPicker
                file={videoFile}
                objectUrl={videoObjectUrl}
                durationSec={videoDurationSec}
                processing={videoProcessing}
                error={videoError}
                onFiles={handleVideoFiles}
                onRemove={clearVideoAttachment}
              />
              <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                <strong className="text-slate-700">Privacy:</strong> your video stays on your device —
                only a few sampled still frames are analyzed, never the video file.
              </p>
              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                Short clips work best (around {VIDEO_GUIDANCE_SECONDS} seconds). Sampling can miss things
                that happen between frames — this is not continuous video analysis.
              </p>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => void handleCheck()}
          disabled={!canCheck}
          data-testid="symptom-check-button"
          className="w-full py-3.5 bg-teal-700 hover:bg-teal-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-extrabold text-sm rounded-xl shadow transition-colors flex items-center justify-center gap-2"
        >
          <HeartPulse className="w-5 h-5" />
          <span>Check Symptoms</span>
        </button>
        {!canCheck && (
          <p className="text-[11px] text-slate-400 text-center -mt-3">
            Select at least one symptom, a duration and a severity to run the check.
          </p>
        )}
      </div>

      {/* ---- Result ---- */}
      {result && resultSummary && (
        <div data-testid="symptom-result" className="space-y-5">
          {/* Emergency banner — ABOVE everything, pulsing.
              Shown for rule-engine emergencies AND for AI-escalated emergencies. */}
          {showEmergencyBanner && (
            <div
              data-testid="symptom-emergency-banner"
              className="symptom-emergency-banner rounded-2xl p-5 text-white shadow-xl"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-8 h-8 shrink-0 animate-bounce" />
                <div>
                  <div className="font-extrabold text-lg tracking-tight">
                    EMERGENCY — this can be life-threatening
                  </div>
                  <p className="text-sm font-semibold mt-1 text-red-50">
                    Contact a veterinarian or an emergency clinic immediately. Do not wait to see
                    if it improves.
                  </p>
                  {result.emergencyReasons.length > 0 && (
                    <ul className="mt-2 space-y-1 text-[13px] text-red-50">
                      {result.emergencyReasons.map((r, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <ChevronRight className="w-4 h-4 shrink-0 mt-0.5" />
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {aiEscalates && (
                    <p className="mt-2 text-[13px] font-bold text-red-50">
                      The AI {aiEscalatedByVideo ? 'video' : 'photo'} analysis spotted a possible
                      emergency sign — see the AI {aiEscalatedByVideo ? 'video' : 'photo'} observations
                      below.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Urgency card */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-6 sm:p-8 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
              <div>
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Result for {resultSummary.petName}
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-slate-700">{displayUrgencyStyle.icon}</span>
                  <span className="text-xl font-extrabold text-slate-900">
                    {displayUrgencyLabel}
                  </span>
                </div>
              </div>
              <span
                className={`px-3 py-1.5 rounded-full text-xs font-extrabold w-fit ${displayUrgencyStyle.badge}`}
              >
                {displayUrgencyLabel}
              </span>
            </div>

            <p className="text-sm text-slate-700 leading-relaxed bg-slate-50 border border-slate-100 rounded-2xl p-4">
              {result.summaryGuidance}
            </p>

            {/* Per-symptom guidance cards */}
            <div className="space-y-3">
              {result.symptoms.map((s) => (
                <div
                  key={s.id}
                  className="rounded-2xl border border-slate-200 p-4 space-y-2.5"
                >
                  <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
                    {s.label}
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    <strong className="text-slate-700">What it can mean: </strong>
                    {s.guidance.whatItCanMean}
                  </p>
                  <div className="grid sm:grid-cols-2 gap-2 text-xs">
                    <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                      <div className="font-bold text-emerald-800 mb-1 flex items-center gap-1">
                        <Home className="w-3.5 h-3.5" /> Safe steps at home
                      </div>
                      <ul className="list-disc list-inside space-y-1 text-slate-600">
                        {s.guidance.homeSteps.map((h, i) => (
                          <li key={i}>{h}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                      <div className="font-bold text-amber-800 mb-1 flex items-center gap-1">
                        <Eye className="w-3.5 h-3.5" /> Watch for
                      </div>
                      <ul className="list-disc list-inside space-y-1 text-slate-600">
                        {s.guidance.watchFor.map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* ---- AI photo observations (phase 2) ---- */}
            {photoStatus === 'analyzing' && (
              <div
                data-testid="symptom-photo-analyzing"
                className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-xs text-sky-900 flex items-center gap-2"
              >
                <span className="w-4 h-4 rounded-full border-2 border-sky-500 border-t-transparent animate-spin shrink-0" />
                <span>
                  <strong>Analyzing your photo…</strong> Your rule-based result above is ready —
                  the AI observations will appear here shortly.
                </span>
              </div>
            )}
            {photoStatus === 'unavailable' && (
              <div
                data-testid="symptom-photo-unavailable"
                className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 flex items-start gap-2"
              >
                <Info className="w-4 h-4 shrink-0 mt-0.5 text-slate-400" />
                <span>{photoUnavailableReason || 'Photo analysis isn’t available right now.'}</span>
              </div>
            )}
            {photoStatus === 'done' && photoAnalysis && (
              <div
                data-testid="symptom-photo-analysis"
                className="rounded-2xl border border-violet-200 bg-violet-50/60 p-4 sm:p-5 space-y-3"
              >
                <div className="font-extrabold text-violet-900 text-sm flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  AI photo observations
                </div>
                <p className="text-[11px] text-violet-800 font-semibold">
                  Informational only — not a diagnosis, not veterinary advice.
                </p>
                {(photoAnalysis.observedSigns ?? []).length === 0 ? (
                  <p className="text-xs text-slate-600">
                    Nothing unusual was visible in this photo. Keep watching your pet and
                    re-run the check if anything changes.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {(photoAnalysis.observedSigns ?? []).map((s, i) => (
                      <li
                        key={i}
                        className="bg-white rounded-xl border border-violet-100 p-3 text-xs"
                      >
                        <div className="font-bold text-slate-900">{s.sign}</div>
                        {(s.region || s.confidence) && (
                          <div className="text-slate-500 mt-0.5">
                            {s.region && <span>Location: {s.region}</span>}
                            {s.region && s.confidence && <span> · </span>}
                            {s.confidence && <span className="capitalize">Confidence: {s.confidence}</span>}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {(photoAnalysis.vetQuestions ?? []).length > 0 && (
                  <div className="text-xs">
                    <div className="font-bold text-slate-700 mb-1">Questions to ask your vet</div>
                    <ul className="list-disc list-inside space-y-1 text-slate-600">
                      {(photoAnalysis.vetQuestions ?? []).map((q, i) => (
                        <li key={i}>{q}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="flex items-start gap-2 text-[11px] text-slate-500">
                  <Info className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{photoAnalysis.disclaimer}</span>
                </div>
              </div>
            )}

            {/* ---- AI video observations (phase 3) ---- */}
            {videoStatus === 'analyzing' && (
              <div
                data-testid="symptom-video-analyzing"
                className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-xs text-sky-900 flex items-center gap-2"
              >
                <span className="w-4 h-4 rounded-full border-2 border-sky-500 border-t-transparent animate-spin shrink-0" />
                <span>
                  <strong>Sampling frames and analyzing your video…</strong> Your rule-based result above
                  is ready — the AI video observations will appear here shortly.
                </span>
              </div>
            )}
            {videoStatus === 'unavailable' && (
              <div
                data-testid="symptom-video-unavailable"
                className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 flex items-start gap-2"
              >
                <Info className="w-4 h-4 shrink-0 mt-0.5 text-slate-400" />
                <span>{videoUnavailableReason || 'Video analysis isn’t available right now.'}</span>
              </div>
            )}
            {videoStatus === 'done' && videoAnalysis && (
              <div
                data-testid="symptom-video-analysis"
                className="rounded-2xl border border-violet-200 bg-violet-50/60 p-4 sm:p-5 space-y-3"
              >
                <div className="font-extrabold text-violet-900 text-sm flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  AI video observations
                </div>
                <p className="text-[11px] text-violet-800 font-semibold">
                  Informational only — not a diagnosis, not veterinary advice. Observed across
                  sampled frames; your video itself never left your device.
                </p>
                {(videoAnalysis.observedSigns ?? []).length === 0 ? (
                  <p className="text-xs text-slate-600">
                    Nothing unusual was visible in the sampled frames. Keep watching your pet and
                    re-run the check if anything changes.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {(videoAnalysis.observedSigns ?? []).map((s, i) => (
                      <li
                        key={i}
                        className="bg-white rounded-xl border border-violet-100 p-3 text-xs"
                      >
                        <div className="font-bold text-slate-900">{s.sign}</div>
                        {(s.region || s.confidence) && (
                          <div className="text-slate-500 mt-0.5">
                            {s.region && <span>Location: {s.region}</span>}
                            {s.region && s.confidence && <span> · </span>}
                            {s.confidence && <span className="capitalize">Confidence: {s.confidence}</span>}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {videoAnalysis.sequenceNote && (
                  <div
                    data-testid="symptom-video-sequence-note"
                    className="bg-white rounded-xl border border-violet-100 p-3 text-xs text-slate-700 flex items-start gap-2"
                  >
                    <Film className="w-4 h-4 shrink-0 mt-0.5 text-violet-600" />
                    <span>
                      <strong>Across the clip: </strong>
                      {videoAnalysis.sequenceNote}
                    </span>
                  </div>
                )}
                {(videoAnalysis.vetQuestions ?? []).length > 0 && (
                  <div className="text-xs">
                    <div className="font-bold text-slate-700 mb-1">Questions to ask your vet</div>
                    <ul className="list-disc list-inside space-y-1 text-slate-600">
                      {(videoAnalysis.vetQuestions ?? []).map((q, i) => (
                        <li key={i}>{q}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="flex items-start gap-2 text-[11px] text-slate-500">
                  <Info className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{videoAnalysis.disclaimer}</span>
                </div>
              </div>
            )}

            {/* Vet recommendation */}
            <div className="rounded-2xl bg-teal-50 border border-teal-200 p-4 sm:p-5 space-y-3">
              <div className="font-extrabold text-teal-900 text-sm flex items-center gap-2">
                <Stethoscope className="w-4 h-4" />
                Vet consultation recommended
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">{result.vetRecommendation}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={bookWithCheck}
                  data-testid="symptom-book-appointment"
                  className="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl flex items-center gap-2 transition-colors"
                >
                  <Calendar className="w-4 h-4" />
                  <span>Book a Vet Appointment</span>
                </button>
                <button
                  type="button"
                  onClick={onNavigateToServices}
                  className="px-4 py-2.5 bg-white border border-teal-300 text-teal-800 font-bold text-xs rounded-xl flex items-center gap-2 hover:bg-teal-50 transition-colors"
                >
                  <MapPin className="w-4 h-4" />
                  <span>Find Vets & Clinics</span>
                </button>
              </div>
            </div>

            {/* Disclaimer on every result */}
            <div className="flex items-start gap-2 bg-slate-50 border border-slate-200 rounded-xl p-3 text-[11px] text-slate-500">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{DISCLAIMER}</span>
            </div>

            <button
              type="button"
              onClick={resetCheckState}
              className="w-full py-2.5 border border-slate-200 text-slate-600 font-bold text-xs rounded-xl hover:bg-slate-50"
            >
              Start a New Check
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
