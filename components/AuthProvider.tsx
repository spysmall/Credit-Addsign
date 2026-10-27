"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  AssignSession, GOOGLE_CLIENT_ID, clearSession, isSuperAdmin, loadSession, saveSession, sessionFromCredential,
} from "@/lib/assignSession";
import { fetchAllowedUsers } from "@/lib/sheetUsers";
import { IS_BETA } from "@/lib/appEnv";
import { syncWebTasks } from "@/lib/taskAssign";

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
  /** bumps whenever tasks from the shared "Web Tasks" sheet change this browser's copy — use as an effect dependency */
  tasksVersion: number;
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
        window.google.accounts.id.renderButton(ref.current, { theme: "outline", size: "large", text: "signin_with", shape: "pill", locale: "th",
          // Google caps the button at 400px; fill the container up to that
          width: Math.min(400, Math.max(200, Math.floor(ref.current.getBoundingClientRect().width))) });
      })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  if (failed) return <p className="text-sm font-semibold" style={{ color: "#DC2626" }}>โหลดปุ่ม Google ไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วรีเฟรชหน้า</p>;
  return <div ref={ref} className="w-full min-h-[44px] [&>div]:w-full" />;
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
  const [tasksVersion, setTasksVersion] = useState(0);

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

  // once signed in, pull tasks submitted on other devices (and push ones only this browser has)
  const allowed = access.status === "allowed";
  useEffect(() => {
    if (!allowed) return;
    let alive = true;
    syncWebTasks().then((n) => { if (alive && n > 0) setTasksVersion((v) => v + 1); }).catch(() => {});
    return () => { alive = false; };
  }, [allowed]);

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

  // full-screen split layout for every not-signed-in state: brand panel left, message + action right
  const card = (title: string, desc: React.ReactNode, action?: React.ReactNode, tone: "default" | "warn" = "default") => (
    <div className="min-h-screen grid grid-rows-[auto_1fr] lg:grid-rows-1 lg:grid-cols-[1.1fr_1fr]" style={{ background: "var(--bg-card)" }}>
      <aside className="relative overflow-hidden text-white px-6 py-6 sm:px-10 sm:py-8 lg:px-14 lg:py-12 flex flex-col"
        style={{ background: [
          "radial-gradient(110% 75% at 100% 100%, #E8511E 0%, rgba(232,81,30,0.55) 35%, rgba(232,81,30,0) 70%)",
          "radial-gradient(60% 45% at 90% 0%, rgba(255,138,99,0.28) 0%, rgba(255,138,99,0) 70%)",
          "linear-gradient(160deg, #141414 0%, #1C1410 50%, #3A1608 100%)",
        ].join(", ") }}>
        <div className="relative flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl flex items-center justify-center font-black" style={{ background: "#fff", color: "var(--accent-strong)" }}>M</span>
          <span className="font-bold tracking-wide">Multimedia</span>
          {IS_BETA && <span className="rounded px-1.5 py-0.5 text-[11px] font-bold leading-none" style={{ background: "#FCD34D", color: "#1A1A1A" }}>BETA</span>}
        </div>
        <div className="relative hidden lg:block mt-auto mb-auto">
          <h2 className="text-5xl font-bold leading-[1.1] tracking-tight">Design Credit<br />System</h2>
          <p className="mt-4 text-base" style={{ color: "rgba(255,255,255,0.8)" }}>ส่งรีเควสงาน · ดูเครดิตทีม · ติดตามสถานะงาน</p>
          <ul className="mt-8 flex flex-wrap gap-2 text-sm">
            {["คิดเครดิตจากตารางราคาอัตโนมัติ", "หักจากถังรวมของทีมทันที", "เห็นสถานะงานจาก Notion"].map((t) => (
              <li key={t} className="rounded-full border px-3.5 py-1.5 backdrop-blur-sm" style={{ background: "rgba(255,255,255,0.1)", borderColor: "rgba(255,255,255,0.18)" }}>{t}</li>
            ))}
          </ul>
        </div>
        <p className="relative hidden lg:block text-xs" style={{ color: "rgba(255,255,255,0.7)" }}>Team Multimedia</p>
      </aside>
      <main className="flex items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-sm">
          {tone === "warn" && (
            <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl text-xl" style={{ background: "var(--warning-bg)" }} aria-hidden>!</span>
          )}
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>{title}</h1>
          <div className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{desc}</div>
          {action && <div className="mt-8 flex flex-col items-stretch gap-3">{action}</div>}
          {tone === "default" && (
            <p className="mt-10 border-t pt-4 text-xs" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
              ยังไม่มีสิทธิ์ใช้งาน? ติดต่อ Lead Team Multimedia
            </p>
          )}
        </div>
      </main>
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
    body = <div className="min-h-screen" style={{ background: "var(--bg-page)" }} />;
  } else if (session === null) {
    state = { status: "signed-out", signOut };
    body = card("ยินดีต้อนรับ",
      "เข้าสู่ระบบด้วยบัญชี Google ที่ลงทะเบียนไว้ในรายชื่อ Notion",
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
        <button type="button" onClick={() => setRetry((r) => r + 1)} className="btn-primary rounded-xl px-5 py-2.5 text-sm font-bold">ลองใหม่</button>
        <button type="button" onClick={signOut} className="rounded-xl border px-5 py-2.5 text-sm font-bold" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>ออกจากระบบ</button>
      </div>, "warn");
  } else if (access.status === "denied") {
    state = { status: "denied", user: session, signOut };
    body = card("ยังไม่มีสิทธิ์เข้าใช้งาน",
      "บัญชีนี้ยังไม่อยู่ในรายชื่อผู้ใช้ของระบบ (Email Notion)",
      <DeniedPanel session={session} onRetry={() => setRetry((r) => r + 1)} onSignOut={signOut} />, "warn");
  } else {
    state = { status: "allowed", user: session, sheetTeam: access.team, sheetName: access.name, people: access.people, isSuperAdmin: isSuperAdmin(session.email), tasksVersion, signOut };
    body = children;
  }

  return (
    <Ctx.Provider value={state}>
      {state.status === "allowed" && header}
      {body}
    </Ctx.Provider>
  );
}

/** Shown when the signed-in Google account is not on the allowlist sheet. */
function DeniedPanel({ session, onRetry, onSignOut }: { session: AssignSession; onRetry: () => void; onSignOut: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(session.email).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
  };
  return (
    <>
      {/* the account that was refused */}
      <div className="flex items-center gap-3 rounded-2xl border px-4 py-3" style={{ borderColor: "var(--border)", background: "var(--bg-page)" }}>
        {session.picture ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={session.picture} alt="" width={40} height={40} referrerPolicy="no-referrer" className="h-10 w-10 shrink-0 rounded-full" />
        ) : (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold text-white" style={{ background: "var(--accent)" }} aria-hidden>
            {Array.from(session.name)[0]?.toUpperCase()}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{session.name}</span>
          <span className="block truncate text-xs" style={{ color: "var(--text-secondary)" }}>{session.email}</span>
        </span>
        <button type="button" onClick={copy} className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold transition-colors hover:bg-black/5"
          style={{ color: copied ? "var(--success)" : "var(--text-secondary)" }}>
          {copied ? "✓ คัดลอกแล้ว" : "คัดลอกอีเมล"}
        </button>
      </div>

      {/* how to get access */}
      <ol className="mt-2 flex flex-col gap-2.5 text-sm" style={{ color: "var(--text-secondary)" }}>
        {[
          <>ส่งอีเมลด้านบนให้ <b style={{ color: "var(--text-primary)" }}>Lead Team Multimedia</b></>,
          <>Lead เพิ่มอีเมลนี้ในชีตรายชื่อผู้ใช้ (คอลัมน์ Email Notion)</>,
          <>กด <b style={{ color: "var(--text-primary)" }}>ตรวจสิทธิ์อีกครั้ง</b> — ไม่ต้องล็อกอินใหม่</>,
        ].map((t, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <span className="num mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ background: "var(--accent-light)", color: "var(--accent-strong)" }}>{i + 1}</span>
            <span>{t}</span>
          </li>
        ))}
      </ol>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={onRetry} className="btn-primary flex-1 rounded-xl px-5 py-2.5 text-sm font-bold">ตรวจสิทธิ์อีกครั้ง</button>
        <button type="button" onClick={onSignOut} className="flex-1 rounded-xl border px-5 py-2.5 text-sm font-bold transition-colors hover:bg-black/5"
          style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>ใช้บัญชีอื่น</button>
      </div>
    </>
  );
}
