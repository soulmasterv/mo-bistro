/** Egyptian mobile numbers are stored in their local, 11-digit format. */
export const egyptianMobilePattern = /^01[0125][0-9]{8}$/;

export function normalizeEgyptianMobile(value: string): string {
  return value
    .replace(/[\s()-]/g, "")
    .replace(/^(?:\+20|0020|20)(?=1[0125]\d{8}$)/, "0");
}

/** Validate stored numbers without inventing a country code. */
export function guestDialHref(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const input = value.trim().replace(/[\u0660-\u0669]/g, c => String(c.charCodeAt(0) - 0x660)).replace(/[\u06f0-\u06f9]/g, c => String(c.charCodeAt(0) - 0x6f0));
  if (!input || !/^[+\d\s().-]+$/.test(input)) return null;
  let number = input.replace(/[\s().-]/g, "");
  if (number.startsWith("00")) number = "+" + number.slice(2);
  if (number.startsWith("+")) return /^\+[1-9]\d{7,14}$/.test(number) ? "tel:" + number : null;
  return /^0\d{8,10}$/.test(number) ? "tel:" + number : null;
}
