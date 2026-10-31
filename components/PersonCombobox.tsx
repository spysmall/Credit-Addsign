"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

export interface Person { email: string; name: string }

// drops Thai tone marks / vowel signs so spelling variants still match
const norm = (s: string) => s.toLowerCase().replace(/[็-๎]/g, "").replace(/\s+/g, " ").trim();

/** "somchai@gmail.com" → "so•••@gmail.com" — lets people tell same-named users apart without exposing full emails */
const mask = (email: string) => {
  const [u, d] = email.split("@");
  return `${u.slice(0, 2)}•••@${d}`;
};

export default function PersonCombobox({ people, value, onChange, invalid, placeholder, inputClassName, inputStyle }: {
  people: Person[];
  value: Person | null;
  onChange: (p: Person) => void;
  invalid?: boolean;
  placeholder?: string;
  inputClassName: string;
  inputStyle: React.CSSProperties;
}) {
  const id = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [typing, setTyping] = useState(false);
  const [active, setActive] = useState(0);

  const results = useMemo(() => {
    const q = norm(typing ? query : "");
    if (!q) return people;
    const tokens = q.split(" ");
    return people.filter((p) => { const h = norm(p.name); return tokens.every((t) => h.includes(t)); });
  }, [people, query, typing]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) { setOpen(false); setTyping(false); }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function pick(p: Person) {
    onChange(p);
    setOpen(false);
    setTyping(false);
    setQuery("");
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(results.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter" && open) { e.preventDefault(); if (results[active]) pick(results[active]); }
    else if (e.key === "Escape") { setOpen(false); setTyping(false); }
  }

  return (
    <div ref={wrapRef} className="relative">
      <input
        role="combobox" aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list"
        aria-activedescendant={open && results[active] ? `${id}-opt-${active}` : undefined}
        aria-invalid={invalid || undefined}
        autoComplete="off" spellCheck={false}
        className={inputClassName} style={inputStyle} placeholder={placeholder}
        value={typing ? query : value?.name ?? ""}
        onFocus={(e) => { setOpen(true); setActive(0); e.target.select(); }}
        onChange={(e) => { setQuery(e.target.value); setTyping(true); setOpen(true); setActive(0); }}
        onKeyDown={onKeyDown}
      />
      {open && (
        <ul id={`${id}-list`} role="listbox" ref={listRef}
          className="absolute z-30 left-0 right-0 mt-1 max-h-64 overflow-auto rounded-xl border shadow-lg py-1"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          {results.length === 0 ? (
            <li className="px-3.5 py-3 text-sm" style={{ color: "var(--text-muted)" }}>ไม่พบ “{query}” ในรายชื่อผู้ใช้</li>
          ) : results.map((p, i) => (
            <li key={p.email} id={`${id}-opt-${i}`} role="option" aria-selected={p.email === value?.email} data-idx={i}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => { e.preventDefault(); pick(p); }}
              className="px-3.5 py-2 cursor-pointer text-sm flex items-baseline justify-between gap-3"
              style={{ background: i === active ? "var(--accent-light)" : "transparent", color: "var(--text-primary)" }}>
              <span className="min-w-0 truncate">{p.name}</span>
              <span className="text-[11px] shrink-0" style={{ color: "var(--text-muted)" }}>{mask(p.email)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
