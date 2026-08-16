// Browser-side Arabic OCR. onnxruntime-web + paddleocr are dynamically imported
// so they land in a separate chunk that only loads when an admin actually opens
// the photo-import tool — regular visitors never download them.
//
// Models + WASM are served from a CDN (jsDelivr) and cached in IndexedDB via
// modelCache. Everything runs on the user's machine; the image never leaves the
// browser, so there is zero server cost.

import { getModel, type FetchProgress } from './modelCache';
import { ARABIC_DICT } from './arabicDict';

// Bump this tag when swapping model files to invalidate the IndexedDB cache.
const MODEL_VERSION = 'ocr-v1';

// Pinned CDN locations. Overridable via OcrOptions for local dev/harness.
const DEFAULTS = {
  modelBaseUrl:
    'https://cdn.jsdelivr.net/gh/zantac/youth_scores_new@' + MODEL_VERSION + '/web/ocr-models/',
  // onnxruntime-web WASM binaries — pinned to the installed version so the JS
  // glue and the .wasm/.mjs loaders always match. Keep in sync with package.json.
  wasmBaseUrl: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/',
  detFile: 'multi_PP-OCRv3_det_mobile.onnx',
  recFile: 'arabic_PP-OCRv4_rec_mobile.onnx',
};

export interface OcrWord {
  text: string;
  conf: number;
  /** Bounding-box centre in image pixels. */
  cx: number;
  cy: number;
  /** Approximate glyph height in pixels (for row clustering). */
  h: number;
}

export interface OcrOptions {
  modelBaseUrl?: string;
  wasmBaseUrl?: string;
  version?: string;
  onProgress?: (p: FetchProgress) => void;
  onStage?: (stage: 'download' | 'init' | 'infer') => void;
}

// A single PaddleOcrService is reused across calls (models stay resident only
// while the tool is open in this tab).
let servicePromise: Promise<PaddleService> | null = null;

interface PaddleService {
  recognize(input: { width: number; height: number; data: Uint8Array }): Promise<RawResult[]>;
}
interface RawResult {
  text: string;
  confidence: number;
  box: number[][] | { x: number; y: number; width: number; height: number };
}

// onnxruntime-web's native (WASM) logger writes a benign "VerifyOutputSizes"
// warning straight to console.error — not gated by ort.env.logLevel, and it
// binds console.error when the module loads, so the filter must be installed
// BEFORE importing onnxruntime-web. Next.js's dev overlay otherwise treats the
// warning as a fatal error. We drop only that ORT line; everything else passes.
let consolePatched = false;
function filterOrtConsoleNoise() {
  if (consolePatched || typeof console === 'undefined') return;
  consolePatched = true;
  const isNoise = (args: unknown[]) =>
    args.some((a) => typeof a === 'string' && (a.includes('onnxruntime') || a.includes('VerifyOutputSizes')));
  (['error', 'warn'] as const).forEach((m) => {
    const orig = console[m].bind(console);
    console[m] = (...args: unknown[]) => { if (!isNoise(args)) orig(...args); };
  });
}

async function getService(opts: OcrOptions): Promise<PaddleService> {
  if (servicePromise) return servicePromise;
  servicePromise = (async () => {
    const version = opts.version ?? MODEL_VERSION;
    const modelBase = opts.modelBaseUrl ?? DEFAULTS.modelBaseUrl;

    filterOrtConsoleNoise();
    const ort = await import('onnxruntime-web');
    const { PaddleOcrService } = await import('paddleocr');

    ort.env.wasm.wasmPaths = opts.wasmBaseUrl ?? DEFAULTS.wasmBaseUrl;
    // Single-thread avoids the COOP/COEP header requirement (a static host like
    // gh-pages can't set those). WebGPU, when present, still accelerates.
    ort.env.wasm.numThreads = 1;
    // Silence the benign VerifyOutputSizes warning the detection model emits on
    // every run (dynamic output shape). At 'warning' it hits console.error and
    // Next.js's dev overlay treats it as a fatal error, which it is not.
    ort.env.logLevel = 'error';

    opts.onStage?.('download');
    const [det, rec] = await Promise.all([
      getModel(modelBase + DEFAULTS.detFile, `det@${version}`, opts.onProgress),
      getModel(modelBase + DEFAULTS.recFile, `rec@${version}`, opts.onProgress),
    ]);

    opts.onStage?.('init');
    // Model output classes = dict + space + blank; append the space token here.
    const dictionary = [...ARABIC_DICT, ' '];
    // onnxruntime-web's exported types are a superset of paddleocr's OrtModule
    // (broader InferenceSession.create overloads), so bridge the shapes here.
    const createOptions = {
      ort,
      detection: { modelBuffer: det },
      recognition: { modelBuffer: rec, charactersDictionary: dictionary, reverseText: true },
    } as unknown as Parameters<typeof PaddleOcrService.createInstance>[0];
    return (await PaddleOcrService.createInstance(createOptions)) as unknown as PaddleService;
  })();
  return servicePromise;
}

function centre(box: RawResult['box']): { cx: number; cy: number; h: number } {
  if (Array.isArray(box)) {
    let cx = 0, cy = 0, minY = Infinity, maxY = -Infinity;
    for (const p of box) {
      const x = p[0] ?? 0, y = p[1] ?? 0;
      cx += x; cy += y; minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    const n = box.length || 1;
    return { cx: cx / n, cy: cy / n, h: maxY - minY };
  }
  return { cx: box.x + box.width / 2, cy: box.y + box.height / 2, h: box.height };
}

/** Run OCR on decoded image pixels and return words with positions. */
export async function runOcr(
  image: { width: number; height: number; data: Uint8Array },
  opts: OcrOptions = {},
): Promise<OcrWord[]> {
  const svc = await getService(opts);
  opts.onStage?.('infer');
  const results = await svc.recognize(image);
  return results.map((r) => {
    const c = centre(r.box);
    return { text: r.text ?? '', conf: Number(r.confidence ?? 0), cx: c.cx, cy: c.cy, h: c.h };
  });
}

/**
 * Decode a File/Blob into RGBA pixels (browser only), upscaling small photos so
 * the detection model finds faint/small text — this markedly improves capture on
 * phone snaps of printed tables. Capped near ~1500px wide and ≤2.5× so a large
 * upload doesn't explode memory.
 */
export async function imageToPixels(
  file: Blob,
): Promise<{ width: number; height: number; data: Uint8Array }> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(2.5, Math.max(1, 1500 / bmp.width));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, w, h);
  const id = ctx.getImageData(0, 0, w, h);
  return { width: w, height: h, data: new Uint8Array(id.data.buffer) };
}
