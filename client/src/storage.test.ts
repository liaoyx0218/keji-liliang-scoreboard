import { it, expect, beforeEach } from "vitest";
import { loadBinding, saveBinding, clearBinding } from "./storage";

beforeEach(() => localStorage.clear());

it("round-trips binding", () => {
  saveBinding({ sessionId: "s", groupId: "g", resetAt: "t1" });
  expect(loadBinding("s")).toEqual({ sessionId: "s", groupId: "g", resetAt: "t1" });
  clearBinding("s");
  expect(loadBinding("s")).toBeNull();
});
