import { describe, expect, it, vi } from "vitest";
import { generateArkImage, getArkConfigFromEnv } from "./images.js";

describe("ark images", () => {
  it("getArkConfigFromEnv requires both key and model", () => {
    expect(getArkConfigFromEnv({})).toBeNull();
    expect(getArkConfigFromEnv({ ARK_API_KEY: "k" })).toBeNull();
    expect(getArkConfigFromEnv({ ARK_API_KEY: "k", ARK_IMAGE_MODEL: "m" })).toEqual({
      apiKey: "k",
      model: "m",
    });
  });

  it("generateArkImage posts and returns url", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ url: "https://example.com/a.png" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    const r = await generateArkImage({
      apiKey: "k",
      model: "m",
      prompt: "手抄报",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(r.url).toBe("https://example.com/a.png");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
