import { describe, expect, it, vi } from "vitest";
import {
  generateArkImage,
  generateArkImageWithFallback,
  getArkConfigFromEnv,
} from "./images.js";

describe("ark images", () => {
  it("getArkConfigFromEnv requires both key and model", () => {
    expect(getArkConfigFromEnv({})).toBeNull();
    expect(getArkConfigFromEnv({ ARK_API_KEY: "k" })).toBeNull();
    expect(getArkConfigFromEnv({ ARK_API_KEY: "k", ARK_IMAGE_MODEL: "m" })).toEqual({
      apiKey: "k",
      model: "m",
      models: [{ model: "m", size: "2560x1440" }],
    });
  });

  it("getArkConfigFromEnv includes fallback model when set", () => {
    expect(
      getArkConfigFromEnv({
        ARK_API_KEY: "k",
        ARK_IMAGE_MODEL: "flash",
        ARK_IMAGE_MODEL_FALLBACK: "lite",
        ARK_IMAGE_SIZE: "1K",
        ARK_IMAGE_SIZE_FALLBACK: "2K",
      })
    ).toEqual({
      apiKey: "k",
      model: "flash",
      fallbackModel: "lite",
      models: [
        { model: "flash", size: "1K" },
        { model: "lite", size: "2K" },
      ],
    });
  });

  it("generateArkImage posts and returns url", async () => {
    const fetchImpl = vi.fn(
      async () =>
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
    const body = JSON.parse(String((fetchImpl.mock.calls[0][1] as RequestInit).body));
    expect(body.size).toBe("2560x1440");
  });

  it("generateArkImageWithFallback uses primary then fallback on failure", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "limit" } }), {
          status: 429,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ url: "https://example.com/fallback.png" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

    const r = await generateArkImageWithFallback({
      apiKey: "k",
      prompt: "手抄报",
      models: [
        { model: "flash", size: "1K" },
        { model: "lite", size: "2K" },
      ],
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(r.url).toBe("https://example.com/fallback.png");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const first = JSON.parse(String((fetchImpl.mock.calls[0][1] as RequestInit).body));
    const second = JSON.parse(String((fetchImpl.mock.calls[1][1] as RequestInit).body));
    expect(first.model).toBe("flash");
    expect(first.size).toBe("1K");
    expect(second.model).toBe("lite");
    expect(second.size).toBe("2K");
  });

  it("generateArkImageWithFallback stops on first success", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ data: [{ url: "https://example.com/ok.png" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
    );
    const r = await generateArkImageWithFallback({
      apiKey: "k",
      prompt: "手抄报",
      models: [
        { model: "flash", size: "1K" },
        { model: "lite", size: "2K" },
      ],
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(r.url).toBe("https://example.com/ok.png");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
