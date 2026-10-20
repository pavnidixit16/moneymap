import { describe, expect, it } from "vitest";
import { formatINR, paiseToInput, parseRupees } from "./money";

describe("parseRupees", () => {
  it.each([
    ["649", 64900],
    ["1,23,456.5", 12345650],
    ["₹ 1,200.05", 120005],
    ["Rs. 99", 9900],
    ["0", 0],
  ])("%s -> %d paise", (input, paise) => {
    expect(parseRupees(input)).toBe(paise);
  });

  it.each(["", "abc", "-5", "1.234", "1e5", "12.3.4"])("rejects %j", (input) => {
    expect(parseRupees(input)).toBeNull();
  });
});

describe("formatINR", () => {
  it("uses Indian digit grouping", () => {
    expect(formatINR(3105100)).toBe("₹31,051");
    expect(formatINR(10000000)).toBe("₹1,00,000");
    expect(formatINR(64950)).toBe("₹649.50");
    expect(formatINR(-120000)).toBe("-₹1,200");
  });

  it("round-trips through the input format", () => {
    expect(parseRupees(paiseToInput(64950))).toBe(64950);
    expect(paiseToInput(3105100)).toBe("31051");
  });
});
