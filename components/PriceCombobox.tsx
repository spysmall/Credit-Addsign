"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { thaiKeywords, type PriceItem } from "@/lib/priceTable";

// drops Thai tone marks / vowel signs so "โลโก้" matches "โลโก", "แบนเนอร์" matches "แบนเนอ"
const norm = (s: string) => s.toLowerCase().replace(/[\u0E47-\u0E4E]/g, "").replace(/\s+/g, " ").trim();
const label = (p: PriceItem) => `${p.code} · ${p.name}`;

function isSubsequence(needle: string, hay: string) {
  let i = 0;
  for (const ch of hay) if (ch === needle[i] && ++i === needle.length) return true;
  return needle.length === 0;
}

/** Rank items for a typed query: every word must appear; falls back to loose letter-order matching. */
function search(items: PriceItem[], query: string): PriceItem[] {
  const q = norm(query);
  if (!q) return items;
  const tokens = q.split(" ");
  const hayOf = (p: PriceItem) => norm(`${p.code} ${p.name} ${p.unit} ${p.category} ${thaiKeywords(p)}`);
  const strict = items
    .filter((p) => { const h = hayOf(p); return tokens.every((t) => h.includes(t)); })
    .map((p) => {
      const code = p.code.toLowerCase(), name = norm(p.name);
      const score = code === q ? 0 : code.startsWith(q) ? 1 : name.startsWith(q) ? 2 : name.includes(q) ? 3 : 4;
      return { p, score };
    })
    .sort((a, b) => a.score - b.score)
    .map((x) => x.p);
  if (strict.length) return strict;
  const compact = q.replace(/\s/g, "");
  return items.filter((p) => isSubsequence(compact, norm(`${p.code} ${p.name} ${thaiKeywords(p)}`).replace(/\s/g, "")));
}

export default function PriceCombobox({ items, value, onChange, disabled, placeholder, invalid, inputClassName, inputStyle }: {
  items: PriceItem[];
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
  placeholder?: string;
  invalid?: boolean;
  inputClassName: string;
  inputStyle: React.CSSProperties;
}) {
  const id = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [typing, setTyping] = useState(false); // false → input shows the selected item
  const [active, setActive] = useState(0);

  const selected = items.find((p) => p.code === value);
  const results = useMemo(() => search(items, typing ? query : ""), [items, query, typing]);

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

  function pick(p: PriceItem) {
    onChange(p.code);
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

  let lastCat = "";
  return (
    <div ref={wrapRef} className="relative">
      <input
        role="combobox" aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list"
        aria-activedescendant={open && results[active] ? `${id}-opt-${active}` : undefined}
        aria-invalid={invalid || undefined}
        disabled={disabled} autoComplete="off" spellCheck={false}
        className={inputClassName} style={inputStyle}
        placeholder={placeholder}
        value={typing ? query : selected ? label(selected) : ""}
        onFocus={(e) => { setOpen(true); setActive(0); e.target.select(); }}
        onChange={(e) => { setQuery(e.target.value); setTyping(true); setOpen(true); setActive(0); }}
        onKeyDown={onKeyDown}
      />
      {open && !disabled && (
        <ul id={`${id}-list`} role="listbox" ref={listRef}
          className="absolute z-30 left-0 right-0 mt-1 max-h-72 overflow-auto rounded-xl border shadow-lg py-1"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          {results.length === 0 ? (
            <li className="px-3.5 py-3 text-sm" style={{ color: "var(--text-muted)" }}>ไม่พบงานที่ตรงกับ “{query}”</li>
          ) : results.map((p, i) => {
            const header = p.category !== lastCat && !typing ? p.category : "";
            lastCat = p.category;
            return (
              <li key={p.code} role="presentation">
                {header && (
                  <p className="px-3.5 pt-2 pb-1 text-[10px] font-black uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{header}</p>
                )}
                <div id={`${id}-opt-${i}`} role="option" aria-selected={p.code === value} data-idx={i}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => { e.preventDefault(); pick(p); }}
                  className="px-3.5 py-2 cursor-pointer text-sm flex items-baseline gap-2"
                  style={{ background: i === active ? "var(--accent-light)" : "transparent", color: "var(--text-primary)" }}>
                  <span className="text-xs font-black shrink-0" style={{ color: "var(--accent)" }}>{p.code}</span>
                  <span className="min-w-0">
                    {p.name}
                    {p.unit && <span className="block text-xs" style={{ color: "var(--text-muted)" }}>{p.unit}</span>}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
