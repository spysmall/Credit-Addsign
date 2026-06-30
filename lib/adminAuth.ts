/**
 * Lightweight client-side PIN gate for the Admin section (Information,
 * Credit Distribution, Summary). This is NOT real security — the PIN lives
 * in the public repo source. It only deters casual browsing.
 */

const ADMIN_PIN = "258456";
const STORAGE_KEY = "admin-unlocked";

export function isAdminUnlocked(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY) === "true";
}

export function tryUnlockAdmin(pin: string): boolean {
  if (pin === ADMIN_PIN) {
    localStorage.setItem(STORAGE_KEY, "true");
    return true;
  }
  return false;
}
