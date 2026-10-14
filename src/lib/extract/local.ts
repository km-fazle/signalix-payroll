import path from "node:path";

import type { Worker } from "tesseract.js";

import { extractReceiptText } from "@/lib/extract/receipt-text";
import type { ModelExtraction } from "@/lib/extract/interpret";

let workerPromise: Promise<Worker> | null = null;
let queue: Promise<unknown> = Promise.resolve();

async function worker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import("tesseract.js");
      const created = await createWorker("eng", 1, {
        cachePath: path.join(process.cwd(), ".ocr-cache"),
        logger: () => undefined,
        errorHandler: () => undefined,
      });
      await created.setParameters({ user_defined_dpi: "300" });
      return created;
    })().catch((error: unknown) => {
      workerPromise = null;
      throw error;
    });
  }
  return workerPromise;
}

export async function extractLocally(image: Buffer): Promise<ModelExtraction> {
  const run = queue.then(async () => {
    const engine = await worker();
    const result = await engine.recognize(image);
    return extractReceiptText(result.data.text ?? "");
  });
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
