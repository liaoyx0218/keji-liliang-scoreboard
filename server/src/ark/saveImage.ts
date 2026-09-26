import fs from "node:fs";
import path from "node:path";
import { generateArkImage } from "./images.js";

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
  fetchImpl?: typeof fetch;
  generate?: typeof generateArkImage;
};

export async function generateAndSavePosterImage(deps: PosterGenerateDeps): Promise<void> {
  const generate = deps.generate ?? generateArkImage;
  const result = await generate({
    apiKey: deps.apiKey,
    model: deps.model,
    prompt: deps.prompt,
    size: deps.size,
    fetchImpl: deps.fetchImpl,
  });
  await downloadImageToFile(result, deps.destPath, deps.fetchImpl);
}
