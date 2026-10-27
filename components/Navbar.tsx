"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/components/AuthProvider";
import { IS_BETA } from "@/lib/appEnv";

const DROPDOWN_ITEMS = [
  { href: "/credit-origin", label: "Information" },
  { href: "/credit-assign", label: "Credit Distribution" },
  { href: "/summary", label: "Summary" },
];

export default function Navbar() {
  const pathname = usePathname();
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const dashboardActive  = pathname === "/dashboard";
  const assignActive     = pathname === "/new-task" || pathname === "/my-tasks";
  const dropdownActive   = DROPDOWN_ITEMS.some((i) => pathname === i.href);
  const activeLabel      = DROPDOWN_ITEMS.find((i) => pathname === i.href)?.label;

  const superAdmin = auth.status === "allowed" && auth.isSuperAdmin;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <header style={{ background: "var(--bg-dark)", borderBottom: "1px solid var(--border-dark)" }}
      className="sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">

        {/* Logo */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div style={{ background: "var(--accent)" }}
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0">
            <span className="text-white font-black text-sm tracking-tighter">M</span>
          </div>
          <div className="hidden sm:block">
            <p className="text-white font-bold text-sm leading-none tracking-wide flex items-center gap-1.5">
              Multimedia
              {IS_BETA && (
                <span className="rounded px-1.5 py-0.5 text-[11px] font-bold leading-none" style={{ background: "#FCD34D", color: "#1A1A1A" }}
                  title="เวอร์ชันทดสอบ · ข้อมูลอ่านจากชีตจริง แต่ไม่บันทึกกลับ">BETA</span>
              )}
            </p>
            <p style={{ color: "var(--text-muted)" }} className="text-[11px] leading-tight mt-0.5">Design Credit System</p>
          </div>
        </div>

        {/* Nav */}
        {auth.status === "allowed" && (
        <nav className="flex items-center gap-0.5 sm:gap-1" aria-label="เมนูหลัก">

          {/* Dashboard */}
          <Link href="/dashboard"
            className="inline-flex items-center h-10 px-2.5 sm:px-3 rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap transition-colors"
            aria-current={dashboardActive ? "page" : undefined}
            style={dashboardActive
              ? { background: "var(--accent)", color: "#fff" }
              : { color: "#888", background: "transparent" }}>
            Dashboard
          </Link>

          {/* Assign task (public) */}
          <Link href="/new-task"
            className="inline-flex items-center h-10 px-2.5 sm:px-3 rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap transition-colors"
            aria-current={assignActive ? "page" : undefined}
            style={assignActive
              ? { background: "var(--accent)", color: "#fff" }
              : { color: "#888", background: "transparent" }}>
            Assign Task
          </Link>

          {/* Admin dropdown — Super admin only */}
          {superAdmin && (
          <div className="relative" ref={ref}>
            <button
              onClick={() => setOpen((v) => !v)}
              onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
              aria-haspopup="menu" aria-expanded={open}
              className="inline-flex items-center gap-1 sm:gap-1.5 h-10 px-2.5 sm:px-3 rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap transition-colors"
              style={dropdownActive
                ? { background: "var(--accent)", color: "#fff" }
                : { color: "#888", background: "transparent" }}>
              {dropdownActive ? activeLabel : "Admin"}
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"
                style={{ opacity: 0.7, transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>
                <path d="M1 3l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>

            {open && (
              <div role="menu" className="absolute right-0 top-full mt-1.5 w-52 rounded-xl border shadow-lg overflow-hidden"
                style={{ background: "var(--bg-card)", borderColor: "var(--border)", zIndex: 100 }}>
                {DROPDOWN_ITEMS.map((item) => {
                  const active = pathname === item.href;
                  return (
                    <Link key={item.href} href={item.href}
                      onClick={() => setOpen(false)}
                      role="menuitem" aria-current={active ? "page" : undefined}
                      className="flex items-center min-h-11 px-4 text-sm font-semibold transition-colors"
                      style={active
                        ? { color: "var(--accent)", background: "var(--accent-light)" }
                        : { color: "var(--text-secondary)", background: "transparent" }}>
                      {active && <span className="w-1.5 h-1.5 rounded-full mr-2 shrink-0" style={{ background: "var(--accent)" }} />}
                      {!active && <span className="w-1.5 h-1.5 mr-2 shrink-0" />}
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
          )}

          {/* Signed-in user */}
          <div className="flex items-center gap-1 sm:gap-2 pl-1.5 sm:pl-2 ml-0.5 sm:ml-1 border-l" style={{ borderColor: "var(--border-dark)" }}>
            {auth.user.picture ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={auth.user.picture} alt="" width={28} height={28} referrerPolicy="no-referrer" className="w-7 h-7 rounded-full shrink-0" />
            ) : (
              <span className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-xs font-black" style={{ background: "var(--accent)", color: "#fff" }} aria-hidden>
                {Array.from(auth.user.name)[0]?.toUpperCase()}
              </span>
            )}
            <span className="hidden lg:block text-xs font-semibold max-w-[140px] truncate" style={{ color: "#bbb" }} title={auth.user.email}>{auth.user.name}</span>
            <button type="button" onClick={auth.signOut} title="ออกจากระบบ" aria-label="ออกจากระบบ"
              className="w-10 h-10 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10" style={{ color: "#888" }}>
              <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M8 3.5H5.5A1.5 1.5 0 0 0 4 5v10a1.5 1.5 0 0 0 1.5 1.5H8" />
                <path d="M12.5 6.5 16 10l-3.5 3.5M16 10H8.5" />
              </svg>
            </button>
          </div>
        </nav>
        )}
      </div>
    </header>
  );
}
