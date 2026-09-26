import { describe, it, expect } from "vitest";
import {
  seqToGroupName,
  seqToTeamLabel,
  seqToTheme,
  seqToThemeLabel,
  stripThemePrefix,
} from "./groupName.js";

describe("seqToGroupName", () => {
  it("maps first nine to theme team names with quotes", () => {
    expect(seqToGroupName(1)).toBe('"衣"时光溯源队');
    expect(seqToGroupName(2)).toBe('"衣"科技赋能队');
    expect(seqToGroupName(3)).toBe('"衣"生活畅想队');
    expect(seqToGroupName(4)).toBe('"食"烟火寻踪队');
    expect(seqToGroupName(5)).toBe('"食"科技美味队');
    expect(seqToGroupName(6)).toBe('"食"舌尖畅想队');
    expect(seqToGroupName(7)).toBe('"住"安居寻迹队');
    expect(seqToGroupName(8)).toBe('"住"科技筑家队');
    expect(seqToGroupName(9)).toBe('"住"家园畅想队');
  });

  it("seqToTeamLabel omits theme prefix", () => {
    expect(seqToTeamLabel(1)).toBe("时光溯源队");
    expect(seqToTeamLabel(5)).toBe("科技美味队");
    expect(seqToTeamLabel(9)).toBe("家园畅想队");
  });

  it("stripThemePrefix removes quoted theme", () => {
    expect(stripThemePrefix('"衣"时光溯源队')).toBe("时光溯源队");
    expect(stripThemePrefix('"食"烟火寻踪队')).toBe("烟火寻踪队");
    expect(stripThemePrefix("时光溯源队")).toBe("时光溯源队");
  });

  it("maps theme helpers", () => {
    expect(seqToTheme(1)).toBe("yi");
    expect(seqToTheme(4)).toBe("shi");
    expect(seqToTheme(8)).toBe("zhu");
    expect(seqToThemeLabel(2)).toBe("衣");
  });
});
