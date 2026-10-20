// Rupee input and display. Amounts are stored as integer paise everywhere.

// "1,23,456.50", "₹ 1200", "649" -> paise. Returns null for anything that is not a
// non-negative amount with at most two decimals.
export function parseRupees(input: string): number | null {
  const cleaned = input.replace(/[₹,\s]/g, "").replace(/^rs\.?/i, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, fraction = ""] = cleaned.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

const wholeRupees = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
const withPaise = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// 3105100 -> "₹31,051"; 64950 -> "₹649.50"; negative values keep their sign.
export function formatINR(paise: number): string {
  return paise % 100 === 0 ? wholeRupees.format(paise / 100) : withPaise.format(paise / 100);
}

// Value for a rupee input field: 3105100 -> "31051", 64950 -> "649.50".
export function paiseToInput(paise: number): string {
  return paise % 100 === 0 ? String(paise / 100) : (paise / 100).toFixed(2);
}
