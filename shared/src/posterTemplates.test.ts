import { describe, expect, it } from "vitest";
import {
  buildPosterPrompt,
  getPosterTemplate,
  normalizePosterFields,
  seqToPosterRole,
} from "./posterTemplates.js";

describe("posterTemplates", () => {
  it("maps seq 1-9 to theme roles", () => {
    expect(seqToPosterRole(1)).toBe("origin");
    expect(seqToPosterRole(2)).toBe("tech");
    expect(seqToPosterRole(3)).toBe("dream");
    expect(getPosterTemplate(1).theme).toBe("yi");
    expect(getPosterTemplate(4).theme).toBe("shi");
    expect(getPosterTemplate(7).theme).toBe("zhu");
    expect(getPosterTemplate(1).defaults.title).toContain("衣服");
    expect(getPosterTemplate(5).role).toBe("tech");
  });

  it("normalizePosterFields trims and caps", () => {
    expect(normalizePosterFields(null)).toBeNull();
    expect(normalizePosterFields({ title: "  A  ", body: "b" })).toEqual({
      title: "A",
      subtitle: "",
      body: "b",
      summary: "",
    });
  });

  it("buildPosterPrompt includes title and layout", () => {
    const t = getPosterTemplate(1);
    const prompt = buildPosterPrompt(t, t.defaults, `"衣"时光溯源队`);
    expect(prompt).toContain(t.defaults.title);
    expect(prompt).toContain("手抄报");
    expect(prompt).toContain("时光溯源队");
  });
});
