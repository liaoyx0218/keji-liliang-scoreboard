import { describe, it, expect } from "vitest";
import { seqToGroupName } from "./groupName.js";

describe("seqToGroupName", () => {
  it("maps 1..10 to 组一..组十", () => {
    expect(seqToGroupName(1)).toBe("组一");
    expect(seqToGroupName(2)).toBe("组二");
    expect(seqToGroupName(10)).toBe("组十");
  });
  it("maps 11 and 20", () => {
    expect(seqToGroupName(11)).toBe("组十一");
    expect(seqToGroupName(20)).toBe("组二十");
  });
});
