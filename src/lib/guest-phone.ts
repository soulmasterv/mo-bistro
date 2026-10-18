/** Native tel links work with Android/iOS dialers; normalize recognized Egyptian mobiles. */
export function guestDialHref(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const input = value.trim().replace(/[\u0660-\u0669]/g, c => String(c.charCodeAt(0) - 0x660)).replace(/[\u06f0-\u06f9]/g, c => String(c.charCodeAt(0) - 0x6f0));
  if (!input || !/^[+\d\s().-]+$/.test(input)) return null;
  let number = input.replace(/[\s().-]/g, "");
  if (/^01[0125]\d{8}$/.test(number)) number = "+20" + number.slice(1);
  if (number.startsWith("00")) number = "+" + number.slice(2);
  if (number.startsWith("+")) return /^\+[1-9]\d{7,14}$/.test(number) ? "tel:" + number : null;
  return /^0\d{8,10}$/.test(number) ? "tel:" + number : null;
}
