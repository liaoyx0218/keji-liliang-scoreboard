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

  it("buildPosterPrompt differs by role for same theme", () => {
    const a = getPosterTemplate(1);
    const b = getPosterTemplate(2);
    const c = getPosterTemplate(3);
    const pa = buildPosterPrompt(a, a.defaults, `"衣"时光溯源队`);
    const pb = buildPosterPrompt(b, b.defaults, `"衣"科技赋能队`);
    const pc = buildPosterPrompt(c, c.defaults, `"衣"生活畅想队`);
    expect(pa).toContain("时间线");
    expect(pb).toContain("技术卡片");
    expect(pc).toContain("未来");
    expect(pa).not.toEqual(pb);
    expect(pb).not.toEqual(pc);
    expect(pa).toContain("视觉差异");
  });
});
