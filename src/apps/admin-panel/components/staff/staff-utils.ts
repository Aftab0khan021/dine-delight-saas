export type StaffRole = "restaurant_admin" | "user";

export async function sha256Hex(input: string) {
  const enc = new TextEncoder();
  const bytes = enc.encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const arr = Array.from(new Uint8Array(digest));
  return arr.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function buildInviteToken() {
  return crypto.randomUUID();
}
