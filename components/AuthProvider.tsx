"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut as fbSignOut } from "firebase/auth";
import { AssignSession, clearSession, isSuperAdmin } from "@/lib/assignSession";
import { auth } from "@/lib/firebase";
import { subscribeWebTasks } from "@/lib/sheetWebTasks";
import { fetchAllowedUsers } from "@/lib/sheetUsers";
import { IS_BETA } from "@/lib/appEnv";
import { mergeRemoteTasks, uploadMissingTasks } from "@/lib/taskAssign";

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
  /** bumps whenever shared tasks (Firestore) change this browser's copy — use as an effect dependency */
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

// ── Google sign-in through Firebase Auth (identity is verified by Google, and Firestore rules trust it) ──
function GoogleButton({ onError }: { onError: (msg: string) => void }) {
  const [busy, setBusy] = useState(false);
  const signIn = async () => {
    setBusy(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(auth, provider);
    } catch (err) {
      const code = (err as { code?: string }).code ?? "";
      if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") {
        onError(code === "auth/popup-blocked" ? "เบราว์เซอร์บล็อกหน้าต่างล็อกอิน อนุญาต popup แล้วลองใหม่" : "เข้าสู่ระบบไม่สำเร็จ ลองใหม่อีกครั้ง");
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" onClick={signIn} disabled={busy}
      className="flex w-full items-center justify-center gap-3 rounded-full border px-5 py-3 text-sm font-semibold transition-colors hover:bg-black/5 disabled:opacity-60"
      style={{ borderColor: "var(--border)", background: "var(--bg-card)", color: "var(--text-primary)" }}>
      <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden>
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
      </svg>
      {busy ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบด้วย Google"}
    </button>
  );
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
  const [loginError, setLoginError] = useState<string | null>(null);
  const [retry, setRetry]     = useState(0);
  const [tasksVersion, setTasksVersion] = useState(0);
  const router = useRouter();

  // Firebase keeps the sign-in; the old Google-button session in localStorage is no longer used
  useEffect(() => {
    clearSession();
    let first = true;
    return onAuthStateChanged(auth, (u) => {
      const s: AssignSession | null = u?.email
        ? { email: u.email.trim().toLowerCase(), name: u.displayName || u.email, picture: u.photoURL ?? undefined, expiresAt: Number.MAX_SAFE_INTEGER }
        : null;
      // a fresh sign-in (not a page load that was already signed in) lands on the Dashboard;
      // links that carry their own target (?edit=…) are kept
      if (s && !first && !window.location.search) router.replace("/dashboard");
      first = false;
      setLoginError(null);
      setSession(s);
    });
  }, [router]);

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

  // once allowed, follow the shared tasks live; the first snapshot also uploads what only this browser has
  const allowed = access.status === "allowed";
  useEffect(() => {
    if (!allowed) return;
    let first = true;
    return subscribeWebTasks((tasks) => {
      if (mergeRemoteTasks(tasks) > 0) setTasksVersion((v) => v + 1);
      if (first) {
        first = false;
        uploadMissingTasks(new Set(tasks.map((t) => t.id)))
          .then((n) => { if (n > 0) setTasksVersion((v) => v + 1); })
          .catch(() => {});
      }
    });
  }, [allowed]);

  const signOut = useCallback(() => { void fbSignOut(auth); }, []);

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

  if (session === undefined) {
    state = { status: "loading", signOut };
    body = <div className="min-h-screen" style={{ background: "var(--bg-page)" }} />;
  } else if (session === null) {
    state = { status: "signed-out", signOut };
    body = card("ยินดีต้อนรับ",
      "เข้าสู่ระบบด้วยบัญชี Google ที่ลงทะเบียนไว้ในรายชื่อ Notion",
      <>
        <GoogleButton onError={setLoginError} />
        {loginError && <p className="text-xs font-semibold" style={{ color: "var(--danger)" }} role="alert">{loginError}</p>}
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
