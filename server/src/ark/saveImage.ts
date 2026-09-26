import fs from "node:fs";
import path from "node:path";
import {
  generateArkImage,
  generateArkImageWithFallback,
  type ArkModelAttempt,
} from "./images.js";

export async function downloadImageToFile(
  source: { url?: string; b64_json?: string },
  destPath: string,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  let buf: Buffer;
  if (source.b64_json) {
    buf = Buffer.from(source.b64_json, "base64");
  } else if (source.url) {
    const res = await fetchImpl(source.url);
    if (!res.ok) throw new Error(`ARK_DOWNLOAD_FAILED:${res.status}`);
    buf = Buffer.from(await res.arrayBuffer());
  } else {
    throw new Error("ARK_EMPTY_IMAGE");
  }
  fs.writeFileSync(destPath, buf);
}

export type PosterGenerateDeps = {
  apiKey: string;
  model: string;
  prompt: string;
  destPath: string;
  size?: string;
  /** Preferred: try these models in order (flash → fallback). */
  models?: ArkModelAttempt[];
  fetchImpl?: typeof fetch;
  generate?: typeof generateArkImage;
  generateWithFallback?: typeof generateArkImageWithFallback;
};

export async function generateAndSavePosterImage(deps: PosterGenerateDeps): Promise<void> {
  const models =
    deps.models?.length ?
      deps.models
    : [{ model: deps.model, size: deps.size }];

  const generateWithFallback = deps.generateWithFallback ?? generateArkImageWithFallback;
  const result =
    deps.generate ?
      await deps.generate({
        apiKey: deps.apiKey,
        model: models[0]!.model,
        prompt: deps.prompt,
        size: models[0]!.size,
        fetchImpl: deps.fetchImpl,
      })
    : await generateWithFallback({
        apiKey: deps.apiKey,
        prompt: deps.prompt,
        models,
        fetchImpl: deps.fetchImpl,
      });

  await downloadImageToFile(result, deps.destPath, deps.fetchImpl);
}
