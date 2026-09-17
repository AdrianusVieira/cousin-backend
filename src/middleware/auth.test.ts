import { describe, expect, it } from "vitest";

import { isAllowedUser } from "./auth.js";

const ALLOWED = "00000000-0000-4000-8000-000000000001";

describe("isAllowedUser()", () => {
  it("should accept a user id on the allowlist", () => {
    expect(isAllowedUser(ALLOWED)).toBe(true);
  });

  it("should reject a valid-looking id that is not on the allowlist", () => {
    expect(isAllowedUser("11111111-1111-4111-8111-111111111111")).toBe(false);
  });

  it("should reject an empty subject", () => {
    expect(isAllowedUser("")).toBe(false);
  });
});
