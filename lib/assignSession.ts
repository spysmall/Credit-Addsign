/**
 * Client-side Google sign-in session for the Assign pages.
 * NOTE: there is no backend, so the Google ID token is decoded but its signature is
 * NOT verified here. This gates the UI and attributes tasks; it is not server-side security.
 */

export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

/** Super admins: allowed in even if not on the users sheet, no PIN for the Admin pages, can see everyone's tasks. */
const SUPER_ADMINS = ["pattrawutthippapart@gmail.com"];
export const isSuperAdmin = (email: string) => SUPER_ADMINS.includes(email.trim().toLowerCase());

export interface AssignSession {
  email: string;
  name: string;
  picture?: string;
  expiresAt: number; // ms epoch
}

const SESSION_KEY = "credit-assign-session-v1";
const TEAM_KEY = (email: string) => `credit-assign-team-v1:${email}`;
const SESSION_DAYS = 7;

export function loadSession(): AssignSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as AssignSession;
    return s.expiresAt > Date.now() && s.email ? s : null;
  } catch {
    return null;
  }
}

export function saveSession(s: AssignSession) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

export function clearSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}

/** Decode the payload of a Google ID token (JWT). Returns null if it is malformed or the email is unverified. */
export function sessionFromCredential(credential: string): AssignSession | null {
  try {
    const part = credential.split(".")[1];
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    const json = new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
    const p = JSON.parse(json) as { email?: string; email_verified?: boolean; name?: string; picture?: string; aud?: string };
    if (!p.email || p.email_verified === false) return null;
    if (GOOGLE_CLIENT_ID && p.aud && p.aud !== GOOGLE_CLIENT_ID) return null;
    return {
      email: p.email.trim().toLowerCase(),
      name: p.name?.trim() || p.email,
      picture: p.picture,
      expiresAt: Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000,
    };
  } catch {
    return null;
  }
}

/** Team remembered from the last "Task Team Creator" choice (used when the sheet has no team for this user). */
export function getSavedTeam(email: string): string | null {
  try { return localStorage.getItem(TEAM_KEY(email)); } catch { return null; }
}

export function saveTeam(email: string, team: string) {
  try { localStorage.setItem(TEAM_KEY(email), team); } catch { /* ignore */ }
}
