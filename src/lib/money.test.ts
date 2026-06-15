import { describe, expect, it } from "vitest";
import { fromCents, toCents } from "./money.js";

describe("toCents", () => {
  it("parses whole numbers", () => {
    expect(toCents("100")).toBe(10000);
  });

  it("parses two decimal places", () => {
    expect(toCents("1234.56")).toBe(123456);
  });

  it("pads a single decimal place", () => {
    expect(toCents("10.5")).toBe(1050);
  });

  it("parses negative amounts", () => {
    expect(toCents("-50.25")).toBe(-5025);
  });

  it("rejects invalid strings", () => {
    expect(() => toCents("12.345")).toThrow();
    expect(() => toCents("abc")).toThrow();
  });
});

describe("fromCents", () => {
  it("formats whole numbers", () => {
    expect(fromCents(10000)).toBe("100.00");
  });

  it("formats cents", () => {
    expect(fromCents(123456)).toBe("1234.56");
  });

  it("formats negative amounts", () => {
    expect(fromCents(-5025)).toBe("-50.25");
  });

  it("round-trips through toCents", () => {
    expect(fromCents(toCents("999.99"))).toBe("999.99");
  });
});
