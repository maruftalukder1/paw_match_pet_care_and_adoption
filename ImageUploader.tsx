/**
 * ImageUploader — reusable image input: file upload OR image-URL link.
 *
 * ## API
 * ```tsx
 * <ImageUploader
 *   value={form.photoUrl}                  // current image: data-URL or remote URL ('' = none)
 *   onChange={(dataUrl) => set('photoUrl', dataUrl)}  // (dataUrl: string | '') => void
 *   label="Photo"                          // optional field label (default: "Photo")
 *   compact                                  // optional: smaller paddings/thumbnail for dense layouts
 * />
 * ```
 *
 * ## Behaviour
 * - Two tabs: **Upload** (file picker) and **Link** (paste an image URL).
 * - Upload pipeline: validates the file (must be an image, ≤ 8 MB), reads it
 *   with FileReader, then downscales on a `<canvas>` so the longest side is
 *   ≤ 1000 px and exports a **JPEG data URL (quality 0.85)**. Always JPEG —
 *   that is what keeps the value small enough for localStorage. Transparent
 *   PNGs are composited onto a white matte so they don't come out black.
 * - Friendly inline errors for non-image files and oversize files; a spinner
 *   state while the image is being processed.
 * - Live preview thumbnail with a remove button (clears to `''`).
 * - Accessible: real `<label htmlFor>`, `aria-describedby` on the error,
 *   keyboard-usable tabs/buttons, focus rings in the app's emerald theme.
 *
 * ## Reuse notes (for profile-avatar / lost&found workers)
 * - The component owns ALL of the file → data-URL work. Hosts only store the
 *   returned string in their form state and persist it like any other field.
 * - For avatars, prefer `compact` so the widget fits a smaller panel.
 */
import React, { useId, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ImagePlus, Link2, X, AlertCircle, Loader2, Upload } from 'lucide-react';

export interface ImageUploaderProps {
  /** Current image: JPEG data-URL (from upload) or a remote http(s)/data URL. `''` = no image. */
  value?: string;
  /** Called with the new image value, or `''` when the image is removed. */
  onChange: (dataUrl: string | '') => void;
  /** Field label shown above the widget. */
  label?: string;
  /** Compact layout for dense panels (e.g. avatar pickers). */
  compact?: boolean;
}

/** Longest side of an uploaded image after downscaling. */
export const IMAGE_UPLOADER_MAX_DIM = 1000;
/** Files larger than this are rejected before any processing. */
export const IMAGE_UPLOADER_MAX_BYTES = 8 * 1024 * 1024;
/** JPEG quality used for the exported data URL. */
export const IMAGE_UPLOADER_JPEG_QUALITY = 0.85;

type Tab = 'upload' | 'link';

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read the selected file.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('That file could not be decoded as an image.'));
    img.src = dataUrl;
  });
}

/**
 * Downscale `img` so its longest side is ≤ maxDim (no-op if already smaller)
 * and export a JPEG data URL. A white matte is painted first so transparent
 * PNGs don't render as black in the JPEG.
 */
export async function downscaleToJpegDataUrl(
  img: HTMLImageElement,
  maxDim = IMAGE_UPLOADER_MAX_DIM,
  quality = IMAGE_UPLOADER_JPEG_QUALITY
): Promise<string> {
  const { naturalWidth: w, naturalHeight: h } = img;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const targetW = Math.max(1, Math.round(w * scale));
  const targetH = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Image processing is not available in this browser.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, targetW, targetH);
  ctx.drawImage(img, 0, 0, targetW, targetH);
  return canvas.toDataURL('image/jpeg', quality);
}

const IMAGE_NAME_RE = /\.(png|jpe?g|gif|webp|bmp|avif|svg)$/i;

function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  // Some browsers report an empty MIME type — fall back to the extension.
  return IMAGE_NAME_RE.test(file.name);
}

function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({
  value = '',
  onChange,
  label = 'Photo',
  compact = false,
}) => {
  const inputId = useId();
  const linkInputId = useId();
  const errorId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<Tab>('upload');
  const [linkText, setLinkText] = useState(value.startsWith('data:') ? '' : value);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const pickFile = () => fileRef.current?.click();

  const handleFiles = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setError(null);
    if (!isImageFile(file)) {
      setError(
        `“${file.name}” is not an image file. Please choose a JPG, PNG, GIF or WebP image.`
      );
      return;
    }
    if (file.size > IMAGE_UPLOADER_MAX_BYTES) {
      setError(
        `That image is ${formatBytes(file.size)} — the limit is 8 MB. Please choose a smaller file.`
      );
      return;
    }
    setProcessing(true);
    try {
      const raw = await readFileAsDataUrl(file);
      const img = await loadImage(raw);
      const jpeg = await downscaleToJpegDataUrl(img);
      onChange(jpeg);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong while processing the image.');
    } finally {
      setProcessing(false);
      // Reset so the same file can be picked again after an error.
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const applyLink = () => {
    const url = linkText.trim();
    if (!url) {
      setError('Paste an image URL first, or switch to Upload.');
      return;
    }
    if (!/^(https?:\/\/|data:image\/)/i.test(url)) {
      setError('That doesn’t look like an image link — it should start with http:// or https://.');
      return;
    }
    setError(null);
    onChange(url);
  };

  const remove = () => {
    setError(null);
    setLinkText('');
    onChange('');
  };

  const thumbSize = compact ? 'h-20 w-20' : 'h-28 w-28';

  const tabBtn = (t: Tab, text: string) => (
    <button
      key={t}
      type="button"
      role="tab"
      aria-selected={tab === t}
      onClick={() => {
        setTab(t);
        setError(null);
      }}
      className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
        tab === t
          ? 'bg-emerald-600 text-white shadow-xs'
          : 'text-slate-500 hover:text-emerald-700 hover:bg-emerald-50'
      }`}
    >
      {text}
    </button>
  );

  return (
    <div>
      <label
        htmlFor={inputId}
        className="block text-xs font-semibold text-slate-700 mb-1"
      >
        {label}
      </label>

      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit mb-2" role="tablist" aria-label={`${label} input method`}>
        {tabBtn('upload', 'Upload')}
        {tabBtn('link', 'Link')}
      </div>

      <div className="flex items-start gap-3">
        {/* Preview thumbnail */}
        <div
          className={`${thumbSize} shrink-0 rounded-xl border-2 border-dashed overflow-hidden relative flex items-center justify-center ${
            value ? 'border-emerald-300' : 'border-slate-300 bg-slate-50'
          }`}
        >
          {value ? (
            <>
              <img src={value} alt={`${label} preview`} className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={remove}
                aria-label={`Remove ${label.toLowerCase()}`}
                className="absolute top-1 right-1 p-1 bg-slate-900/70 hover:bg-rose-600 text-white rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <ImagePlus className="w-6 h-6 text-slate-300" aria-hidden="true" />
          )}
        </div>

        {/* Input side */}
        <div className="flex-1 min-w-0">
          {tab === 'upload' ? (
            <>
              <input
                ref={fileRef}
                id={inputId}
                type="file"
                accept="image/*"
                aria-describedby={error ? errorId : undefined}
                onChange={(e) => void handleFiles(e.target.files)}
                className="sr-only"
              />
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={pickFile}
                disabled={processing}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 border-2 border-dashed border-emerald-300 hover:border-emerald-500 bg-emerald-50/60 hover:bg-emerald-50 text-emerald-800 font-bold text-xs rounded-xl transition-colors disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                {processing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    Processing image…
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" aria-hidden="true" />
                    Choose an image
                  </>
                )}
              </motion.button>
              <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
                JPG, PNG, GIF or WebP · up to 8 MB · resized to ≤ 1000 px so it stays fast.
              </p>
            </>
          ) : (
            <>
              <div className="flex gap-2">
                <input
                  id={linkInputId}
                  type="url"
                  inputMode="url"
                  value={linkText}
                  onChange={(e) => setLinkText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      applyLink();
                    }
                  }}
                  aria-describedby={error ? errorId : undefined}
                  placeholder="https://…"
                  className="w-full text-xs py-2 px-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.95 }}
                  onClick={applyLink}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                >
                  <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
                  Use link
                </motion.button>
              </div>
              <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
                Paste a direct link to an image (must start with http:// or https://).
              </p>
            </>
          )}

          {error && (
            <p
              id={errorId}
              role="alert"
              className="flex items-start gap-1.5 text-[11px] text-rose-600 font-medium mt-2 leading-snug"
            >
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" aria-hidden="true" />
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
