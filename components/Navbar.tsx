"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect, FormEvent } from "react";
import { isAdminUnlocked, tryUnlockAdmin } from "@/lib/adminAuth";

const DROPDOWN_ITEMS = [
  { href: "/credit-origin", label: "Information" },
  { href: "/credit-assign", label: "Credit Distribution" },
  { href: "/summary", label: "Summary" },
];

export default function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const dashboardActive  = pathname === "/dashboard";
  const dropdownActive   = DROPDOWN_ITEMS.some((i) => pathname === i.href);
  const activeLabel      = DROPDOWN_ITEMS.find((i) => pathname === i.href)?.label;

  useEffect(() => {
    if (isAdminUnlocked()) setUnlocked(true);
  }, []);

  function closeDropdown() {
    setOpen(false);
    setPin("");
    setError(false);
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) closeDropdown();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handlePinSubmit(e: FormEvent) {
    e.preventDefault();
    if (tryUnlockAdmin(pin)) {
      setUnlocked(true);
      setError(false);
    } else {
      setError(true);
      setPin("");
    }
  }

  return (
    <header style={{ background: "var(--bg-dark)", borderBottom: "1px solid var(--border-dark)" }}
      className="sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">

        {/* Logo */}
        <div className="flex items-center gap-3">
          <div style={{ background: "var(--accent)" }}
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0">
            <span className="text-white font-black text-sm tracking-tighter">M</span>
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-none tracking-wide">Multimedia</p>
            <p style={{ color: "var(--text-muted)" }} className="text-[11px] leading-tight mt-0.5">Design Credit System</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex items-center gap-1">

          {/* Dashboard */}
          <Link href="/dashboard"
            className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
            style={dashboardActive
              ? { background: "var(--accent)", color: "#fff" }
              : { color: "#888", background: "transparent" }}>
            Dashboard
          </Link>

          {/* Admin dropdown */}
          <div className="relative" ref={ref}>
            <button
              onClick={() => setOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
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
              <div className="absolute right-0 top-full mt-1.5 w-48 rounded-xl border shadow-lg overflow-hidden"
                style={{ background: "var(--bg-card)", borderColor: "var(--border)", zIndex: 100 }}>
                {unlocked ? (
                  DROPDOWN_ITEMS.map((item) => {
                    const active = pathname === item.href;
                    return (
                      <Link key={item.href} href={item.href}
                        onClick={() => setOpen(false)}
                        className="flex items-center px-4 py-2.5 text-xs font-semibold transition-all"
                        style={active
                          ? { color: "var(--accent)", background: "var(--accent-light)" }
                          : { color: "var(--text-secondary)", background: "transparent" }}>
                        {active && <span className="w-1.5 h-1.5 rounded-full mr-2 shrink-0" style={{ background: "var(--accent)" }} />}
                        {!active && <span className="w-1.5 h-1.5 mr-2 shrink-0" />}
                        {item.label}
                      </Link>
                    );
                  })
                ) : (
                  <form onSubmit={handlePinSubmit} className="p-3">
                    <input
                      type="password"
                      inputMode="numeric"
                      autoFocus
                      value={pin}
                      onChange={(e) => { setPin(e.target.value); setError(false); }}
                      className="w-full px-2.5 py-1.5 rounded-lg text-xs border mb-2"
                      style={{ borderColor: error ? "#e11d48" : "var(--border)", background: "var(--bg-page)", color: "var(--text-primary)" }}
                      placeholder="PIN"
                    />
                    {error && <p className="text-[11px] mb-2" style={{ color: "#e11d48" }}>รหัสไม่ถูกต้อง</p>}
                    <button type="submit"
                      className="w-full py-1.5 rounded-lg text-xs font-semibold"
                      style={{ background: "var(--accent)", color: "#fff" }}>
                      ยืนยัน
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>

        </nav>
      </div>
    </header>
  );
}
