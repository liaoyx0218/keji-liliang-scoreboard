export type ArkImageResult = {
  url?: string;
  b64_json?: string;
};

export type ArkModelAttempt = {
  model: string;
  size?: string;
};

export type GenerateImageOptions = {
  apiKey: string;
  model: string;
  prompt: string;
  /** e.g. "2560x1440" (横版) or "2K" */
  size?: string;
  fetchImpl?: typeof fetch;
};

export type GenerateImageFallbackOptions = {
  apiKey: string;
  prompt: string;
  models: ArkModelAttempt[];
  fetchImpl?: typeof fetch;
};

export type ArkConfig = {
  apiKey: string;
  model: string;
  fallbackModel?: string;
  models: ArkModelAttempt[];
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
      size: opts.size ?? "2560x1440",
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

/** Try models in order; only throw after all attempts fail. */
export async function generateArkImageWithFallback(
  opts: GenerateImageFallbackOptions
): Promise<ArkImageResult> {
  if (!opts.models.length) {
    throw new Error("ARK_GENERATE_FAILED:NO_MODELS");
  }
  let lastError: Error | undefined;
  for (const attempt of opts.models) {
    try {
      return await generateArkImage({
        apiKey: opts.apiKey,
        model: attempt.model,
        prompt: opts.prompt,
        size: attempt.size,
        fetchImpl: opts.fetchImpl,
      });
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastError ?? new Error("ARK_GENERATE_FAILED");
}

export function getArkConfigFromEnv(env: NodeJS.ProcessEnv = process.env): ArkConfig | null {
  const apiKey = (env.ARK_API_KEY ?? "").trim();
  const model = (env.ARK_IMAGE_MODEL ?? "").trim();
  if (!apiKey || !model) return null;

  const size = (env.ARK_IMAGE_SIZE ?? "2560x1440").trim() || "2560x1440";
  const fallbackModel = (env.ARK_IMAGE_MODEL_FALLBACK ?? "").trim();
  const fallbackSize =
    (env.ARK_IMAGE_SIZE_FALLBACK ?? env.ARK_IMAGE_SIZE ?? "2560x1440").trim() || "2560x1440";

  const models: ArkModelAttempt[] = [{ model, size }];
  if (fallbackModel && fallbackModel !== model) {
    models.push({ model: fallbackModel, size: fallbackSize });
  }

  return {
    apiKey,
    model,
    ...(fallbackModel && fallbackModel !== model ? { fallbackModel } : {}),
    models,
  };
}
