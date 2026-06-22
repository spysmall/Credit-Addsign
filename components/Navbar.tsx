"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/credit-origin", label: "ที่มาของเครดิต" },
  { href: "/credit-assign", label: "Credit Distribution" },
  { href: "/summary", label: "สรุปภาพรวม", disabled: true },
];

export default function Navbar() {
  const pathname = usePathname();

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
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            if (item.disabled) {
              return (
                <span key={item.href}
                  className="hidden sm:inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{ color: "#3A3A3A", cursor: "not-allowed" }}>
                  {item.label}
                </span>
              );
            }
            return (
              <Link key={item.href} href={item.href}
                className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={active
                  ? { background: "var(--accent)", color: "#fff" }
                  : { color: "#888", background: "transparent" }}>
                {item.label}
              </Link>
            );
          })}
        </nav>

      </div>
    </header>
  );
}
