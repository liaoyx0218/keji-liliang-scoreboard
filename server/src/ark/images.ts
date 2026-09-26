export type ArkImageResult = {
  url?: string;
  b64_json?: string;
};

export type GenerateImageOptions = {
  apiKey: string;
  model: string;
  prompt: string;
  /** e.g. "1440x2560" or "2K" */
  size?: string;
  fetchImpl?: typeof fetch;
};

export async function generateArkImage(opts: GenerateImageOptions): Promise<ArkImageResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const res = await fetchImpl("https://ark.cn-beijing.volces.com/api/v3/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model,
      prompt: opts.prompt,
      size: opts.size ?? "2K",
      response_format: "url",
      watermark: false,
    }),
  });

  const text = await res.text();
  let body: {
    error?: { message?: string; code?: string };
    data?: Array<{ url?: string; b64_json?: string }>;
  };
  try {
    body = JSON.parse(text) as typeof body;
  } catch {
    throw new Error(`ARK_BAD_RESPONSE:${res.status}`);
  }

  if (!res.ok) {
    const msg = body.error?.message || body.error?.code || `HTTP_${res.status}`;
    throw new Error(`ARK_GENERATE_FAILED:${msg}`);
  }

  const first = body.data?.[0];
  if (!first?.url && !first?.b64_json) {
    throw new Error("ARK_EMPTY_IMAGE");
  }
  return { url: first.url, b64_json: first.b64_json };
}

export function getArkConfigFromEnv(env: NodeJS.ProcessEnv = process.env) {
  const apiKey = (env.ARK_API_KEY ?? "").trim();
  const model = (env.ARK_IMAGE_MODEL ?? "").trim();
  if (!apiKey || !model) return null;
  return { apiKey, model };
}
