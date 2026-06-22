import { describe, expect, it } from "vitest";
import { readDefaultApprovalBypass } from "./approval-bypass";

describe("approval bypass defaults", () => {
  it("bypasses approval by default for pet-driven local testing", () => {
    expect(readDefaultApprovalBypass({})).toBe(true);
  });

  it.each(["0", "false", "strict", "ask"])(
    "lets %s disable the default bypass",
    (value) => {
      expect(readDefaultApprovalBypass({ SKFIY_BYPASS_APPROVAL: value })).toBe(false);
    }
  );

  it.each(["1", "true", "bypass", "anything-else"])(
    "keeps %s in bypass mode",
    (value) => {
      expect(readDefaultApprovalBypass({ SKFIY_BYPASS_APPROVAL: value })).toBe(true);
    }
  );
});
