import { createWorker } from "tesseract.js";
// English trained data bundled as a normal npm dependency (not fetched from
// a CDN at runtime) — see README.md in this folder for why.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const engTrainedData = require("@tesseract.js-data/eng") as { langPath: string; gzip: boolean };

let workerPromise: ReturnType<typeof createWorker> | null = null;

/** Lazily creates and reuses one Tesseract worker for the process's lifetime — spinning one up costs real time. */
async function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker("eng", 1, {
      langPath: engTrainedData.langPath,
      gzip: engTrainedData.gzip,
      cachePath: engTrainedData.langPath,
    });
  }
  return workerPromise;
}

export interface OcrResult {
  text: string;
  confidence: number; // 0-100, Tesseract's mean confidence for the page
}

/** Runs OCR on a single rasterized page image (PNG/JPEG buffer). Fully offline — no external API calls. */
export async function recognizeImage(imageBuffer: Buffer): Promise<OcrResult> {
  const worker = await getWorker();
  const { data } = await worker.recognize(imageBuffer);
  return { text: data.text, confidence: data.confidence };
}

export async function recognizeImages(imageBuffers: Buffer[]): Promise<OcrResult[]> {
  const results: OcrResult[] = [];
  for (const buf of imageBuffers) {
    results.push(await recognizeImage(buf));
  }
  return results;
}

export async function shutdownOcr(): Promise<void> {
  if (workerPromise) {
    const worker = await workerPromise;
    await worker.terminate();
    workerPromise = null;
  }
}
