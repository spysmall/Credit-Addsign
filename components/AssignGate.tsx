"use client";

import Link from "next/link";
import { useAssignUser } from "@/components/AuthProvider";

export { useAssignUser };

/** The "ส่งรีเควส / งานของฉัน" switcher — each page puts it on the right of its own title row. */
export function AssignTabs({ active }: { active: "request" | "mine" }) {
  const tab = (href: string, label: string, on: boolean) => (
    <Link href={href} aria-current={on ? "page" : undefined}
      className="inline-flex items-center min-h-10 px-5 rounded-full text-sm font-semibold transition-all"
      style={on ? { background: "var(--bg-dark)", color: "#fff", boxShadow: "0 6px 14px -6px rgba(0,0,0,.5)" } : { color: "var(--text-secondary)" }}>
      {label}
    </Link>
  );

  return (
    <nav className="inline-flex shrink-0 items-center gap-1 rounded-full border p-1" style={{ background: "var(--bg-card)", borderColor: "var(--border)", boxShadow: "var(--shadow-sm)" }} aria-label="เมนู Assign Task">
      {tab("/new-task", "ส่งรีเควส", active === "request")}
      {tab("/my-tasks", "งานของฉัน", active === "mine")}
    </nav>
  );
}

/** Shell for the Assign Task pages. Sign-in itself is handled site-wide by <AuthProvider>. */
export default function AssignGate({ children }: { active: "request" | "mine"; children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--bg-page)", minHeight: "calc(100vh - 56px)" }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {children}
      </div>
    </div>
  );
}
