"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  AssignSession, GOOGLE_CLIENT_ID, clearSession, isSuperAdmin, loadSession, saveSession, sessionFromCredential,
} from "@/lib/assignSession";
import { fetchAllowedUsers } from "@/lib/sheetUsers";

export interface AuthUser {
  user: AssignSession;
  /** team from the users sheet, if the sheet has one for this person */
  sheetTeam?: string;
  /** display name of this person in the users sheet */
  sheetName?: string;
  /** everyone on the allowlist (for the "สร้างโดย" picker) */
  people: { email: string; name: string }[];
  /** super admin: no PIN, sees everything */
  isSuperAdmin: boolean;
  signOut: () => void;
}

/** What the rest of the app (nav bar etc.) can know about the sign-in state. */
export type AuthState =
  | { status: "loading" | "signed-out" | "checking" | "denied" | "error"; user?: AssignSession; signOut: () => void }
  | ({ status: "allowed" } & AuthUser);

const Ctx = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside <AuthProvider>");
  return v;
}

/** For pages that render only after sign-in succeeded (everything under <AuthProvider>). */
export function useAssignUser(): AuthUser {
  const v = useAuth();
  if (v.status !== "allowed") throw new Error("useAssignUser called before sign-in finished");
  return v;
}

// ── Google Identity Services ──
interface GoogleId {
  initialize: (cfg: { client_id: string; callback: (r: { credential: string }) => void }) => void;
  renderButton: (el: HTMLElement, opts: Record<string, string | number>) => void;
  disableAutoSelect?: () => void;
}
declare global {
  interface Window { google?: { accounts: { id: GoogleId } } }
}

function loadGsi(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    const existing = document.querySelector<HTMLScriptElement>("script[data-gsi]");
    const s = existing ?? document.createElement("script");
    s.addEventListener("load", () => resolve());
    s.addEventListener("error", () => reject(new Error("gsi")));
    if (!existing) {
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.dataset.gsi = "1";
      document.head.appendChild(s);
    }
  });
}

function GoogleButton({ onCredential }: { onCredential: (credential: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onCredential);
  const [failed, setFailed] = useState(false);
  useEffect(() => { cb.current = onCredential; }, [onCredential]);

  useEffect(() => {
    let alive = true;
    loadGsi()
      .then(() => {
        if (!alive || !ref.current || !window.google) return;
        window.google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: (r) => cb.current(r.credential) });
        window.google.accounts.id.renderButton(ref.current, { theme: "outline", size: "large", text: "signin_with", shape: "pill", locale: "th", width: 280 });
      })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  if (failed) return <p className="text-sm font-semibold" style={{ color: "#DC2626" }}>โหลดปุ่ม Google ไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วรีเฟรชหน้า</p>;
  return <div ref={ref} className="min-h-[44px] flex justify-center" />;
}

// ── Provider: the whole site requires Google sign-in with an allow-listed email ──
type Access =
  | { status: "checking" }
  | { status: "allowed"; team?: string; name?: string; people: { email: string; name: string }[] }
  | { status: "denied" }
  | { status: "error" };

export default function AuthProvider({ header, children }: { header?: React.ReactNode; children: React.ReactNode }) {
  const [session, setSession] = useState<AssignSession | null | undefined>(undefined); // undefined = not read yet
  const [access, setAccess]   = useState<Access>({ status: "checking" });
  const [badLogin, setBadLogin] = useState(false);
  const [retry, setRetry]     = useState(0);

  useEffect(() => { setSession(loadSession()); }, []);

  useEffect(() => {
    if (!session) return;
    let alive = true;
    setAccess({ status: "checking" });
    fetchAllowedUsers()
      .then((m) => {
        if (!alive) return;
        const u = m.get(session.email);
        const people = [...m].map(([email, v]) => ({ email, name: v.name ?? email.split("@")[0] }))
          .sort((a, b) => a.name.localeCompare(b.name, "th"));
        setAccess(u || isSuperAdmin(session.email)
          ? { status: "allowed", team: u?.team, name: u?.name, people }
          : { status: "denied" });
      })
      .catch(() => {
        if (!alive) return;
        // a super admin must never be locked out by a sheet outage
        setAccess(isSuperAdmin(session.email) ? { status: "allowed", people: [] } : { status: "error" });
      });
    return () => { alive = false; };
  }, [session, retry]);

  const onCredential = useCallback((credential: string) => {
    const s = sessionFromCredential(credential);
    if (!s) { setBadLogin(true); return; }
    setBadLogin(false);
    saveSession(s);
    setSession(s);
  }, []);

  const signOut = useCallback(() => {
    clearSession();
    setSession(null);
    window.google?.accounts.id.disableAutoSelect?.();
  }, []);

  const card = (title: string, desc: React.ReactNode, action?: React.ReactNode) => (
    <div style={{ background: "var(--bg-page)", minHeight: "calc(100vh - 56px)" }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="max-w-md mx-auto mt-10 rounded-2xl border p-6 sm:p-8 text-center flex flex-col items-center gap-4"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl" style={{ background: "var(--accent-light)" }}>🔒</div>
          <h1 className="text-xl font-black" style={{ color: "var(--text-primary)" }}>{title}</h1>
          <div className="text-sm" style={{ color: "var(--text-secondary)" }}>{desc}</div>
          {action}
        </div>
      </div>
    </div>
  );

  let state: AuthState;
  let body: React.ReactNode;

  if (!GOOGLE_CLIENT_ID) {
    state = { status: "error", signOut };
    body = card("ยังไม่ได้ตั้งค่า Google Login",
      <>ตั้งค่า <code className="font-mono text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--bg-page)" }}>NEXT_PUBLIC_GOOGLE_CLIENT_ID</code> ใน <code className="font-mono text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--bg-page)" }}>.env.local</code> แล้วรีสตาร์ท dev server</>);
  } else if (session === undefined) {
    state = { status: "loading", signOut };
    body = <div style={{ background: "var(--bg-page)", minHeight: "calc(100vh - 56px)" }} />;
  } else if (session === null) {
    state = { status: "signed-out", signOut };
    body = card("เข้าสู่ระบบด้วย Google",
      "ต้องเข้าสู่ระบบด้วยบัญชี Google ที่ลงทะเบียนไว้ในรายชื่อ (Email Notion) จึงจะดูข้อมูลในระบบนี้ได้",
      <>
        <GoogleButton onCredential={onCredential} />
        {badLogin && <p className="text-xs font-semibold" style={{ color: "#DC2626" }} role="alert">เข้าสู่ระบบไม่สำเร็จ ลองใหม่อีกครั้ง</p>}
      </>);
  } else if (access.status === "checking") {
    state = { status: "checking", user: session, signOut };
    body = card("กำลังตรวจสอบสิทธิ์…", session.email);
  } else if (access.status === "error") {
    state = { status: "error", user: session, signOut };
    body = card("ตรวจสอบสิทธิ์ไม่สำเร็จ", "โหลดรายชื่อผู้ใช้จากชีตไม่ได้ ลองใหม่อีกครั้ง",
      <div className="flex gap-2">
        <button type="button" onClick={() => setRetry((r) => r + 1)} className="rounded-xl px-5 py-2.5 text-sm font-bold text-white" style={{ background: "var(--accent)" }}>ลองใหม่</button>
        <button type="button" onClick={signOut} className="rounded-xl border px-5 py-2.5 text-sm font-bold" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>ออกจากระบบ</button>
      </div>);
  } else if (access.status === "denied") {
    state = { status: "denied", user: session, signOut };
    body = card("บัญชีนี้ยังไม่มีสิทธิ์ใช้งาน",
      <><b>{session.email}</b> ไม่อยู่ในรายชื่อผู้ใช้ ติดต่อ Lead เพื่อเพิ่มอีเมลนี้ หรือเข้าสู่ระบบด้วยบัญชีอื่น</>,
      <button type="button" onClick={signOut} className="rounded-xl px-5 py-2.5 text-sm font-bold text-white" style={{ background: "var(--accent)" }}>ออกจากระบบ</button>);
  } else {
    state = { status: "allowed", user: session, sheetTeam: access.team, sheetName: access.name, people: access.people, isSuperAdmin: isSuperAdmin(session.email), signOut };
    body = children;
  }

  return (
    <Ctx.Provider value={state}>
      {header}
      {body}
    </Ctx.Provider>
  );
}
