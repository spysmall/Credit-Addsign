"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import PriceCombobox from "@/components/PriceCombobox";
import PersonCombobox, { Person } from "@/components/PersonCombobox";
import AssignGate, { useAssignUser } from "@/components/AssignGate";
import { NOTION_ENABLED, pushTaskToNotion } from "@/lib/notionBridge";
import { getSavedTeam, saveTeam } from "@/lib/assignSession";
import { loadDistConfig, DistConfig } from "@/lib/distribution";
import { fetchDistFromSheet } from "@/lib/sheetDistribution";
import { fetchAllTaskUsage, fetchTeamActivity, TeamUsage } from "@/lib/sheetTasks";
import { fetchLeaveHours } from "@/lib/sheetLeave";
import { teamTotalCredits } from "@/lib/workdays";
import {
  PriceItem, REQUEST_TYPES, RequestTypeKey, fetchPriceTable, lineCredit, unitCredit, workTypeOf,
} from "@/lib/priceTable";
import {
  AssignedTask, COMPANY_OPTIONS, PRIORITIES, PROJECTS, TEAM_OPTIONS, WORK_TYPES,
  addAssigned, isMyTask, loadAssigned, newTaskId, projectDisplay, recentTeamCounts, resolveCard, updateAssigned, webCreditByCompany, teamAvailability, teamDisplay, teamGroup, webUsedForGroup,
} from "@/lib/taskAssign";

const THAI_MONTHS_SHORT = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
const MAX_FILES = 20;
const MAX_BYTES = 100 * 1024 * 1024;

interface LineDraft { id: number; code: string; requestType: RequestTypeKey; qty: number }

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 });
const isoToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const inputCls = "w-full rounded-xl border px-4 py-3 text-base sm:text-sm outline-none transition-all focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--accent-light)]";
const inputStyle = { background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text-primary)" } as const;

function NewTaskForm() {
  const { user, sheetTeam, sheetName, people } = useAssignUser();
  const me: Person = { email: user.email, name: sheetName ?? user.name };
  const [recent] = useState(() => recentTeamCounts(30));
  const [frozenOrder, setFrozenOrder] = useState<string[] | null>(null);
  const [frozenCompanies, setFrozenCompanies] = useState<string[] | null>(null);
  const [webCompany] = useState(() => { const d = new Date(); return webCreditByCompany(d.getFullYear(), d.getMonth() + 1); });
  const companyRef = useRef<HTMLDivElement>(null);
  const [defaultTeam] = useState(() => sheetTeam ?? getSavedTeam(user.email) ?? "");
  const now = new Date();
  const [today] = useState(isoToday);
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  // ── data ──
  const [config, setConfig]   = useState<DistConfig>([]);
  const [usage, setUsage]     = useState<Record<string, TeamUsage>>({});
  const [leave, setLeave]     = useState<Record<string, number>>({});
  const [activity, setActivity] = useState<Record<string, number>>({});
  const [prices, setPrices]   = useState<PriceItem[]>([]);
  const [loadingData, setLoadingData]     = useState(true);
  const [priceError, setPriceError]       = useState(false);
  const [reloadKey, setReloadKey]         = useState(0);

  // ── form ──
  const [title, setTitle]           = useState("");
  const [priority, setPriority]     = useState("Normal");
  const [projects, setProjects]     = useState<string[]>([]);
  const [createdBy, setCreatedBy]   = useState<Person | null>(me);
  const [owner, setOwner]           = useState<Person | null>(me);
  const [teamCreator, setTeamCreator] = useState(defaultTeam);
  const [company, setCompany]       = useState("");
  const [lines, setLines]           = useState<LineDraft[]>([{ id: 1, code: "", requestType: "new", qty: 1 }]);
  const [typesExtra, setTypesExtra] = useState<string[]>([]);
  const [typesOff, setTypesOff]     = useState<string[]>([]);
  const [summaryDraft, setSummaryDraft] = useState("");
  const [summaryEdited, setSummaryEdited] = useState(false);
  const [link, setLink]             = useState("");
  const [objective, setObjective]   = useState("");
  const [needBy, setNeedBy]         = useState("");
  const [useDate, setUseDate]       = useState("");
  const [files, setFiles]           = useState<{ name: string; size: number }[]>([]);
  const [tried, setTried]           = useState(false);
  const [notice, setNotice]         = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  // confirmation popup after a successful submit
  const [done, setDone] = useState<{ task: AssignedTask; edited: boolean; remaining: number; notion: "off" | "pending" | "ok" | "error"; url?: string; error?: string } | null>(null);
  const [step, setStep]           = useState(1);
  // set when the page was opened as /new-task?edit=<id> for a request that hasn't reached Notion yet
  const [editing, setEditing] = useState<AssignedTask | null>(null);
  const formTop = useRef<HTMLDivElement>(null);
  const nextLineId = useRef(2);

  useEffect(() => {
    let alive = true;
    setLoadingData(true);
    setPriceError(false);

    const configP = fetchDistFromSheet(year, month)
      .then((sheetMap) => {
        const base = loadDistConfig(year, month);
        return sheetMap
          ? base.map((p) => ({
              ...p,
              companies: p.companies.map((c) => ({
                ...c,
                teams: c.teams.map((t) => (sheetMap[t.id] !== undefined ? { ...t, pct: sheetMap[t.id] } : t)),
              })),
            }))
          : base;
      })
      .catch(() => loadDistConfig(year, month));

    Promise.all([
      configP,
      fetchAllTaskUsage(year, month).catch(() => ({} as Record<string, TeamUsage>)),
      fetchLeaveHours(year, month).catch(() => ({} as Record<string, number>)),
      fetchPriceTable().catch(() => null),
      fetchTeamActivity(30).catch(() => ({} as Record<string, number>)),
    ]).then(([cfg, use, lv, pt, act]) => {
      if (!alive) return;
      setConfig(cfg);
      setUsage(use);
      setLeave(lv);
      setActivity(act);
      if (pt) setPrices(pt); else setPriceError(true);
      setLoadingData(false);
    });
    return () => { alive = false; };
  }, [year, month, reloadKey]);

  // Team options: busiest teams first (task sheet + web requests, last 30 days).
  // Order is frozen once the user picks, so buttons never move under the cursor.
  const sortedTeams = useMemo(() => {
    const score = (t: { label: string }) => (recent[t.label] ?? 0) + (activity[t.label] ?? 0);
    return TEAM_OPTIONS
      .map((t, i) => ({ t, i, s: score(t), own: sheetTeam === t.label ? 1 : 0 }))
      .sort((a, b) => b.own - a.own || b.s - a.s || a.i - b.i)
      .map((x) => x.t.label);
  }, [recent, activity, sheetTeam]);
  const teamOrder = frozenOrder ?? sortedTeams;

  // Company options: most credit used this month first (task sheet + web requests); frozen after the first pick.
  const sortedCompanies = useMemo(() => {
    const used = (label: string) => {
      const prefix = `${label.toUpperCase()}::`;
      const fromSheet = Object.entries(usage).filter(([k]) => k.startsWith(prefix)).reduce((s, [, v]) => s + v.used, 0);
      return fromSheet + (webCompany[label] ?? 0);
    };
    return COMPANY_OPTIONS
      .map((c, i) => ({ label: c.label, i, u: used(c.label) }))
      .sort((a, b) => b.u - a.u || a.i - b.i)
      .map((x) => x.label);
  }, [usage, webCompany]);
  const companyOrder = frozenCompanies ?? sortedCompanies;

  // Team already known (sheet or remembered) → it is pre-selected, so jump straight to the next question
  useEffect(() => {
    if (defaultTeam) companyRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [defaultTeam]);

  // ── derived ──
  const priceByCode = useMemo(() => new Map(prices.map((p) => [p.code, p])), [prices]);

  // task title is saved as "[Project, Project] name"
  const titlePrefix = projects.length ? `[${projects.map(projectDisplay).join(", ")}] ` : "";

  const lineCredits = lines.map((l) => lineCredit(priceByCode.get(l.code), l.requestType, l.qty));
  const useCredit = Math.round(lineCredits.reduce((s, v) => s + v, 0) * 100) / 100;

  const total    = teamTotalCredits(year, month, leave);
  // The credit check uses the team's combined pool across all companies ("ถังรวม");
  // the company only decides which dashboard card the spend is attributed to.
  const group    = teamCreator ? teamGroup(teamCreator) : null;
  const resolved = !loadingData && teamCreator && company ? resolveCard(config, company, teamCreator) : null;
  // while editing, the request's own old credit is still counted as used — give it back for the check
  const ownCredit = editing && teamGroup(editing.teamCreator) === group ? editing.useCredit : 0;
  const avail    = !loadingData && group ? teamAvailability(config, total, usage, group, webUsedForGroup(year, month, group) - ownCredit) : null;
  const shortfall = avail ? Math.max(0, Math.round((useCredit - avail.remaining) * 100) / 100) : 0;
  const notEnough = !!avail && useCredit > avail.remaining;

  const autoSummary = lines
    .map((l) => {
      const item = priceByCode.get(l.code);
      if (!item || !(l.qty > 0)) return "";
      const rt = REQUEST_TYPES.find((r) => r.key === l.requestType)?.label ?? "";
      return `• ${item.name} (${rt}) × ${l.qty} ชิ้น`;
    })
    .filter(Boolean)
    .join("\n");

  const summary = summaryEdited ? summaryDraft : autoSummary;

  // work types: auto-picked from the lines, user can add extras or switch auto ones off
  const autoTypes = [...new Set(lines.map((l) => (l.code ? workTypeOf(l.code) : "")).filter(Boolean))];
  const workTypes = [...new Set([...autoTypes.filter((t) => !typesOff.includes(t)), ...typesExtra])];
  const toggleType = (t: string) => {
    if (workTypes.includes(t)) {
      setTypesExtra((e) => e.filter((x) => x !== t));
      if (autoTypes.includes(t)) setTypesOff((o) => [...o, t]);
    } else {
      setTypesOff((o) => o.filter((x) => x !== t));
      if (!autoTypes.includes(t)) setTypesExtra((e) => [...e, t]);
    }
  };

  // ── validation ──
  const lineErrors = lines.map((l) => {
    const item = priceByCode.get(l.code);
    if (!item) return "เลือกงานจากตารางราคา";
    if (unitCredit(item, l.requestType) === null) return "งานนี้ไม่มีประเภทการขอที่เลือก";
    if (!(l.qty > 0)) return "จำนวนต้องมากกว่า 0";
    return "";
  });
  const totalFileBytes = files.reduce((s, f) => s + f.size, 0);
  const errors: Record<string, string> = {
    title:       title.trim() ? "" : "กรอกชื่อชิ้นงาน",
    projects:    projects.length ? "" : "เลือกอย่างน้อย 1 โปรเจกต์",
    createdBy:   createdBy ? "" : "เลือกผู้สร้างจากรายชื่อ",
    owner:       owner ? "" : "เลือกเจ้าของงานจากรายชื่อ",
    teamCreator: teamCreator ? "" : "เลือกทีมผู้สร้าง Task",
    company:     company ? "" : "เลือกบริษัท",
    lines:       lineErrors.some(Boolean) ? "ตรวจรายการงานให้ครบ" : "",
    workTypes:   workTypes.length ? "" : "เลือกประเภทของงานอย่างน้อย 1 อย่าง",
    summary:     summary.trim() ? "" : "กรอกสรุปจำนวนชิ้นงาน",
    link:        link.trim() ? "" : "ใส่ลิงก์ไฟล์งานหรือรายละเอียดความต้องการ",
    objective:   objective.trim() ? "" : "ระบุวัตถุประสงค์ของชิ้นงาน",
    needBy:      needBy ? "" : "เลือกวันที่ต้องการชิ้นงาน",
    useDate:     useDate ? "" : "เลือกวันที่ใช้งานจริง",
    files:       files.length > MAX_FILES ? `แนบได้ไม่เกิน ${MAX_FILES} ไฟล์`
               : totalFileBytes > MAX_BYTES ? "ขนาดไฟล์รวมเกิน 100 MB" : "",
  };
  const dateWarn = needBy && useDate && needBy > useDate ? "วันที่ต้องการชิ้นงานเลยวันที่ใช้งานจริง" : "";
  const firstError = Object.values(errors).find(Boolean);
  const canSubmit = !loadingData && !priceError && !firstError && !!resolved && !notEnough && useCredit > 0;
  const show = (k: string) => (tried && errors[k] ? errors[k] : "");

  // ── steps ──
  const STEPS = [
    { n: 1, title: "เจ้าของงาน" },
    { n: 2, title: "รายละเอียดงาน" },
    { n: 3, title: "รายการและเครดิต" },
    { n: 4, title: "กำหนดเวลา" },
  ];
  const stepKeys: Record<number, string[]> = {
    1: ["teamCreator", "company", "createdBy", "owner"],
    2: ["title", "projects", "objective", "link", "files"],
    3: ["lines", "workTypes", "summary"],
    4: ["needBy", "useDate"],
  };
  const stepOk = (n: number) =>
    !stepKeys[n].some((k) => errors[k]) && (n !== 3 || (useCredit > 0 && !notEnough));
  const canReach = (n: number) => STEPS.filter((x) => x.n < n).every((x) => stepOk(x.n));
  const blockMsg =
    step >= 3 && notEnough ? `เครดิตไม่พอ ขาดอีก ${fmt(shortfall)} M Coin — ลดจำนวนหรือเปลี่ยนรายการงาน`
    : stepKeys[step].map((k) => errors[k]).find(Boolean)
      ?? (step >= 3 && useCredit <= 0 ? "เพิ่มรายการงานที่มีเครดิตก่อน" : "");

  function goTo(n: number) {
    setTried(false);
    setStep(n);
    formTop.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function goNext() {
    if (!stepOk(step)) { setTried(true); return; }
    goTo(step + 1);
  }

  // ── actions ──
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const updateLine = (id: number, patch: Partial<LineDraft>) =>
    setLines((ls) => ls.map((l) => {
      if (l.id !== id) return l;
      const next = { ...l, ...patch };
      if (patch.code !== undefined && unitCredit(priceByCode.get(next.code), next.requestType) === null) next.requestType = "new";
      return next;
    }));

  function onFiles(list: FileList | null) {
    if (!list) return;
    setFiles((prev) => [...prev, ...Array.from(list).map((f) => ({ name: f.name, size: f.size }))]);
  }

  function resetForm() {
    setTitle(""); setPriority("Normal"); setProjects([]); setOwner(me); setTeamCreator(sheetTeam ?? getSavedTeam(user.email) ?? ""); setCompany("");
    setLines([{ id: nextLineId.current++, code: "", requestType: "new", qty: 1 }]);
    setTypesExtra([]); setTypesOff([]); setSummaryDraft(""); setSummaryEdited(false); setLink(""); setObjective("");
    setNeedBy(""); setUseDate(""); setFiles([]); setTried(false); setStep(1);
  }

  // open an existing request for editing (only mine, this month, not yet in Notion)
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("edit");
    if (!id) return;
    const t = loadAssigned(year, month).find((x) => x.id === id);
    if (!t || t.notionUrl || t.cancelled || t.deletedAt || !isMyTask(t, user.email)) {
      setNotice({ kind: "error", text: "แก้ไขงานนี้ไม่ได้ (ส่งเข้า Notion แล้ว, ถูกยกเลิก หรือไม่ใช่งานของเดือนนี้)" });
      return;
    }
    const prefix = t.projects.length ? `[${t.projects.map(projectDisplay).join(", ")}] ` : "";
    setEditing(t);
    setTitle(t.title.startsWith(prefix) ? t.title.slice(prefix.length) : t.title);
    setPriority(t.priority); setProjects(t.projects);
    setCreatedBy({ email: t.createdByEmail ?? "", name: t.createdBy });
    setOwner(t.ownerEmail ? { email: t.ownerEmail, name: t.owner.split(" : ").pop() ?? t.owner } : me);
    setTeamCreator(t.teamCreator); setCompany(t.company);
    setLines(t.lines.map((l) => ({ id: nextLineId.current++, code: l.code, requestType: l.requestType, qty: l.qty })));
    setTypesExtra(t.workTypes); setTypesOff([]);
    setSummaryDraft(t.summary); setSummaryEdited(true);
    setLink(t.link); setObjective(t.objective); setNeedBy(t.needBy); setUseDate(t.useDate); setFiles(t.refFiles);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function stopEditing() {
    setEditing(null);
    window.history.replaceState(null, "", window.location.pathname);
  }

  function submit() {
    setTried(true);
    setNotice(null);
    if (firstError || !resolved) return;
    // re-check against fresh storage so two open tabs can't overspend
    const fresh = teamAvailability(config, total, usage, group!, webUsedForGroup(year, month, group!) - ownCredit);
    if (useCredit > fresh.remaining) {
      setNotice({ kind: "error", text: `เครดิตไม่พอ — คงเหลือ ${fmt(fresh.remaining)} แต่งานนี้ใช้ ${fmt(useCredit)}` });
      return;
    }
    const task: AssignedTask = {
      id: editing?.id ?? newTaskId(),
      createdAt: editing?.createdAt ?? new Date().toISOString(),
      year, month,
      cardId: resolved.card.id,
      creatorEmail: user.email,
      title: `${titlePrefix}${title.trim()}`, priority, projects, createdBy: createdBy!.name, createdByEmail: createdBy!.email,
      // Notion keeps the "Team : Name" text; the email puts the task in the owner's "งานของฉัน"
      owner: `${teamDisplay(teamCreator)} : ${owner!.name}`, ownerEmail: owner!.email,
      refFiles: files, link: link.trim(), objective: objective.trim(), summary: summary.trim(),
      workTypes, useCredit, needBy, useDate, teamCreator, company,
      lines: lines.map((l, i) => {
        const item = priceByCode.get(l.code)!;
        return {
          code: l.code, name: item.name, requestType: l.requestType, qty: l.qty,
          unitCredit: unitCredit(item, l.requestType) ?? 0, credit: lineCredits[i],
        };
      }),
    };
    try {
      if (editing) updateAssigned(year, month, task.id, task);
      else addAssigned(task);
    } catch {
      setNotice({ kind: "error", text: "บันทึกไม่สำเร็จ (พื้นที่เบราว์เซอร์เต็มหรือถูกปิด)" });
      return;
    }
    if (editing) stopEditing();
    setDone({ task, edited: !!editing, remaining: Math.round((fresh.remaining - useCredit) * 100) / 100, notion: NOTION_ENABLED ? "pending" : "off" });
    if (NOTION_ENABLED) {
      pushTaskToNotion(task)
        .then(({ url }) => {
          updateAssigned(task.year, task.month, task.id, { notionUrl: url, notionPushedAt: new Date().toISOString() });
          setDone((d) => (d && d.task.id === task.id ? { ...d, notion: "ok", url } : d));
        })
        .catch((err: unknown) => setDone((d) => (d && d.task.id === task.id
          ? { ...d, notion: "error", error: err instanceof Error ? err.message : String(err) } : d)));
    }
    resetForm();
  }

  const afterRemaining = avail ? Math.round((avail.remaining - useCredit) * 100) / 100 : 0;
  const barPct = avail && avail.credit > 0 ? Math.max(0, Math.min(100, (avail.remaining / avail.credit) * 100)) : 0;

  return (
    <div>

        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] mb-1" style={{ color: "var(--text-secondary)" }}>Assign Task</p>
          <h1 className="text-3xl sm:text-4xl font-bold leading-tight tracking-tight" style={{ color: "var(--text-primary)" }}>
            {editing ? "แก้ไขรีเควส" : "ส่งรีเควสงาน"} <span className="num" style={{ color: "var(--accent-strong)" }}>{THAI_MONTHS_SHORT[month - 1]} {year + 543}</span>
          </h1>
          <p className="text-sm mt-2 max-w-2xl" style={{ color: "var(--text-secondary)" }}>
            ระบบคำนวณเครดิตจากตารางราคาและหักจากเครดิตของทีมทันที ถ้าเครดิตไม่พอจะส่งรีเควสไม่ได้
          </p>
        </div>

        {editing && (
          <div className="rounded-xl border px-4 py-3 mb-5 text-sm flex flex-wrap items-center justify-between gap-3"
            style={{ background: "var(--warning-bg)", borderColor: "var(--warning-line)", color: "var(--warning)" }}>
            <span>กำลังแก้ไข <b>{editing.title}</b> · บันทึกแล้วจะใช้แทนรีเควสเดิม (คืนเครดิตเดิม {fmt(editing.useCredit)} แล้วหักตามใหม่)</span>
            <button type="button" onClick={() => { stopEditing(); resetForm(); }} className="font-semibold underline underline-offset-2">ยกเลิกการแก้ไข</button>
          </div>
        )}

        {notice && (
          <div role="status" className="rounded-xl border px-4 py-3 mb-5 text-sm font-semibold flex items-center justify-between gap-3"
            style={notice.kind === "ok"
              ? { background: "var(--success-bg)", borderColor: "var(--success-line)", color: "var(--success)" }
              : { background: "var(--danger-bg)", borderColor: "var(--danger-line)", color: "var(--danger)" }}>
            <span>{notice.kind === "ok" ? "✓ " : "⚠ "}{notice.text}</span>
            {notice.kind === "ok" && (
              <Link href="/my-tasks" className="underline shrink-0 text-xs">ดูในงานของฉัน</Link>
            )}
          </div>
        )}

        {priceError && (
          <div className="rounded-xl border px-4 py-3 mb-5 text-sm flex items-center justify-between gap-3"
            style={{ background: "var(--danger-bg)", borderColor: "var(--danger-line)", color: "var(--danger)" }}>
            <span>โหลดตารางราคาไม่สำเร็จ จึงยังแอดงานไม่ได้</span>
            <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="underline font-semibold shrink-0">ลองใหม่</button>
          </div>
        )}

        {/* Stepper — own full-width row */}
        <div ref={formTop} className="surface scroll-mt-20 mb-5 px-5 py-3.5 sm:px-6">
          <div className="md:hidden">
            <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              <span className="num" style={{ color: "var(--text-secondary)" }}>ขั้นที่ {step}/{STEPS.length}</span>
              <span> · {STEPS.find((x) => x.n === step)?.title}</span>
            </p>
            <div className="mt-2 flex gap-1" aria-hidden>
              {STEPS.map((st) => (
                <span key={st.n} className="h-1 flex-1 rounded-full" style={{ background: st.n <= step ? "var(--accent-strong)" : "var(--border)" }} />
              ))}
            </div>
          </div>
          <ol className="hidden md:flex items-center gap-1.5 w-full" aria-label="ขั้นตอนการแจ้งงาน">
            {STEPS.map((st, i) => {
              const current = st.n === step;
              const done = st.n < step && stepOk(st.n);
              const reachable = st.n < step || canReach(st.n);
              return (
                <li key={st.n} className={`flex items-center gap-1.5 ${i < STEPS.length - 1 ? "flex-1" : ""}`}>
                  <button type="button" disabled={!reachable} onClick={() => goTo(st.n)}
                    aria-current={current ? "step" : undefined}
                    className="flex items-center gap-2 rounded-xl px-1 py-1 disabled:cursor-not-allowed">
                    <span className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all"
                      style={current ? { background: "var(--accent-strong)", color: "#fff", boxShadow: "0 0 0 4px var(--accent-light)" }
                        : done ? { background: "var(--success)", color: "#fff" }
                        : { background: "var(--bg-card)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
                      {done ? "✓" : st.n}
                    </span>
                    <span className="text-xs font-semibold"
                      style={{ color: current ? "var(--text-primary)" : "var(--text-muted)" }}>{st.title}</span>
                  </button>
                  {i < STEPS.length - 1 && <span className="flex-1 h-0.5 rounded-full" style={{ background: done ? "var(--success)" : "var(--border)" }} />}
                </li>
              );
            })}
          </ol>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 items-start">

          {/* ── Form ── */}
          <form onSubmit={(e) => { e.preventDefault(); if (step < 4) goNext(); else submit(); }} noValidate className="flex flex-col gap-5">

            {step === 1 && <Section step="1" title="เจ้าของงาน" desc="เลือกทีมและบริษัท ระบบจะใช้ตัดเครดิต">
              <Field label="ทีมสร้างบรีฟงาน" required error={show("teamCreator")} hint={sheetTeam ? "ทีมของคุณตามรายชื่อผู้ใช้ (เปลี่ยนไม่ได้)" : "ทีมผู้สร้าง Task งานนี้ · ระบบจะจำทีมที่เลือกไว้ให้ครั้งหน้า"}>
                <Chips options={teamOrder} value={teamCreator} lockedTo={sheetTeam} display={teamDisplay} grid
                  onPick={(t) => { setFrozenOrder(teamOrder); setTeamCreator(t); saveTeam(user.email, t); }} />
              </Field>
              <Field label="งานของบริษัท" required error={show("company")}>
                <div ref={companyRef}>
                  <Chips options={companyOrder} value={company} onPick={(c) => { setFrozenCompanies(companyOrder); setCompany(c); }} grid cols={4} />
                </div>
              </Field>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="สร้างโดย" required error={show("createdBy")} hint="ดึงจากบัญชีที่ล็อกอิน · พิมพ์ชื่อเพื่อเปลี่ยนเป็นคนอื่น">
                  <PersonCombobox people={people} value={createdBy} onChange={setCreatedBy} invalid={tried && !!errors.createdBy}
                    placeholder="พิมพ์ค้นหาชื่อ" inputClassName={inputCls} inputStyle={inputStyle} />
                </Field>
                <Field label="เจ้าของงาน" required error={show("owner")} hint="คนที่ใช้งานชิ้นนี้ · งานจะขึ้นใน “งานของฉัน” ของเขาด้วย">
                  <PersonCombobox people={people} value={owner} onChange={setOwner} invalid={tried && !!errors.owner}
                    placeholder="พิมพ์ค้นหาชื่อ" inputClassName={inputCls} inputStyle={inputStyle} />
                </Field>
              </div>
            </Section>}

            {step === 2 && <Section step="2" title="รายละเอียดงาน">
              <Field label="ชื่อโปรเจกต์" required error={show("projects")} hint="เลือกได้หลายโปรเจกต์ · ชื่อโปรเจกต์จะขึ้นหน้าชื่อชิ้นงานให้อัตโนมัติ">
                <Chips multi searchable display={projectDisplay} options={PROJECTS} value={projects} onPick={(v) => setProjects((p) => toggle(p, v))} />
              </Field>
              <Field label="ชื่อชิ้นงาน" required error={show("title")} hint="รูปแบบ [ชื่อโปรเจกต์] ชื่อชิ้นงาน — พิมพ์เฉพาะชื่อชิ้นงาน">
                <div className="flex items-center rounded-xl border px-3.5 transition-colors focus-within:border-[var(--accent)]" style={inputStyle}>
                  {titlePrefix && (
                    <span className="shrink-0 max-w-[60%] truncate text-sm font-semibold mr-1.5 py-2.5" style={{ color: "var(--accent-strong)" }} title={titlePrefix}>{titlePrefix}</span>
                  )}
                  <input className="flex-1 min-w-0 bg-transparent py-2.5 text-base sm:text-sm outline-none" style={{ color: "var(--text-primary)" }}
                    value={title} onChange={(e) => setTitle(e.target.value)} placeholder={titlePrefix ? "" : "เลือกโปรเจกต์ก่อน แล้วพิมพ์ชื่อชิ้นงาน"} />
                </div>
              </Field>
              <Field label="ความเร่งด่วน" required>
                <Chips options={[...PRIORITIES]} value={priority} onPick={setPriority} />
              </Field>
              <Field label="วัตถุประสงค์ของชิ้นงาน" required error={show("objective")} hint="ใช้ทำอะไร/ทำเพื่ออะไร/ใช้ที่ไหน เพื่อให้ออกแบบได้ตรงโจทย์มากขึ้น">
                <textarea rows={3} className={inputCls} style={inputStyle} value={objective} onChange={(e) => setObjective(e.target.value)} />
              </Field>
              <Field label="Link ไฟล์งาน & ความต้องการและรายละเอียดของตัวงาน" required error={show("link")} hint="หากต้องการไฟล์ .PSD .AI และอื่นๆ โปรดระบุเป็นรายละเอียดเพิ่มเติม">
                <textarea rows={3} className={inputCls} style={inputStyle} value={link} onChange={(e) => setLink(e.target.value)} />
              </Field>
              <Field label="Ref ตัวอย่างงาน (ถ้ามี)" error={show("files")} hint={`ไม่เกิน ${MAX_FILES} ไฟล์ รวมไม่เกิน 100 MB · รอบนี้เก็บเฉพาะชื่อไฟล์`}>
                <label className="inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold cursor-pointer hover:opacity-80"
                  style={{ borderColor: "var(--border)", background: "var(--bg-card)", color: "var(--text-secondary)" }}>
                  อัปโหลดไฟล์
                  <input type="file" multiple className="sr-only" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
                </label>
                {files.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {files.map((f, i) => (
                      <li key={`${f.name}-${i}`} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs"
                        style={{ background: "var(--bg-page)", color: "var(--text-secondary)" }}>
                        {f.name}
                        <button type="button" aria-label={`ลบ ${f.name}`} onClick={() => setFiles((fs) => fs.filter((_, j) => j !== i))}
                          className="font-bold hover:opacity-70">×</button>
                      </li>
                    ))}
                  </ul>
                )}
              </Field>
            </Section>}

            {step === 3 && <Section step="3" title="รายการงานและเครดิต" desc="เพิ่มทีละรายการ ระบบคำนวณเครดิตจากตารางราคาให้ทันที">
              <div className="flex flex-col gap-3">
                {lines.map((l, i) => {
                  const item = priceByCode.get(l.code);
                  return (
                    <div key={l.id} className="rounded-2xl border p-4 flex flex-col gap-3.5"
                      style={{ borderColor: tried && lineErrors[i] ? "var(--danger)" : "var(--border)", background: "var(--bg-page)" }}>
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-muted)" }}>รายการที่ {i + 1} · งาน</label>
                          <PriceCombobox items={prices} value={l.code} invalid={tried && !!lineErrors[i]}
                            onChange={(code) => updateLine(l.id, { code })} disabled={priceError || loadingData}
                            placeholder={loadingData ? "กำลังโหลดตารางราคา…" : "พิมพ์ค้นหางาน เช่น แบนเนอร์, banner, โลโก้, M3"}
                            inputClassName={inputCls} inputStyle={inputStyle} />
                        </div>
                        {lines.length > 1 && (
                          <button type="button" aria-label={`ลบรายการที่ ${i + 1}`} onClick={() => setLines((ls) => ls.filter((x) => x.id !== l.id))}
                            className="mt-6 w-11 h-11 sm:w-9 sm:h-9 rounded-lg border text-lg leading-none hover:opacity-70 shrink-0"
                            style={{ borderColor: "var(--border)", background: "var(--bg-card)", color: "var(--text-secondary)" }}>×</button>
                        )}
                      </div>

                      <div>
                        <p className="text-xs font-medium mb-1.5" style={{ color: "var(--text-muted)" }}>ประเภทการขอ</p>
                        <div className="flex flex-wrap gap-1.5">
                          {REQUEST_TYPES.map((rt) => {
                            const unit = unitCredit(item, rt.key);
                            const disabled = !item || unit === null;
                            const active = l.requestType === rt.key && !disabled;
                            return (
                              <button type="button" key={rt.key} disabled={disabled} aria-pressed={active}
                                title={disabled && item ? "งานนี้ไม่มีให้ขอแบบนี้" : rt.hint}
                                onClick={() => updateLine(l.id, { requestType: rt.key })}
                                className="rounded-lg border px-3 min-h-10 sm:min-h-0 sm:py-1.5 text-xs font-semibold transition-all disabled:opacity-35 disabled:cursor-not-allowed"
                                style={active
                                  ? { background: "var(--accent-strong)", borderColor: "var(--accent-strong)", color: "#fff" }
                                  : { background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text-secondary)" }}>
                                {rt.label}{unit !== null && item ? <span className="opacity-70"> · {fmt(unit)}</span> : null}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="flex items-end justify-between gap-3 flex-wrap">
                        <div>
                          <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-muted)" }}>จำนวน (ชิ้น)</label>
                          <div className="inline-flex items-center rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
                            <button type="button" aria-label="ลดจำนวน" onClick={() => updateLine(l.id, { qty: Math.max(1, l.qty - 1) })}
                              className="w-11 h-11 sm:w-9 sm:h-9 font-bold hover:bg-black/5">−</button>
                            <input type="number" min={1} inputMode="numeric" value={l.qty} aria-label="จำนวนชิ้น"
                              onChange={(e) => updateLine(l.id, { qty: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                              className="w-14 h-11 sm:h-9 text-center text-base sm:text-sm font-bold outline-none bg-transparent" style={{ color: "var(--text-primary)" }} />
                            <button type="button" aria-label="เพิ่มจำนวน" onClick={() => updateLine(l.id, { qty: l.qty + 1 })}
                              className="w-11 h-11 sm:w-9 sm:h-9 font-bold hover:bg-black/5">+</button>
                          </div>
                        </div>
                        <p className="num text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>
                          {item && unitCredit(item, l.requestType) !== null ? `${fmt(unitCredit(item, l.requestType)!)} × ${l.qty} = ` : ""}
                          <span style={{ color: "var(--accent-strong)" }}>{fmt(lineCredits[i])} M Coin</span>
                        </p>
                      </div>
                      {tried && lineErrors[i] && <p className="text-xs font-semibold" style={{ color: "var(--danger)" }}>{lineErrors[i]}</p>}
                    </div>
                  );
                })}
                <button type="button" onClick={() => setLines((ls) => [...ls, { id: nextLineId.current++, code: "", requestType: "new", qty: 1 }])}
                  className="self-start rounded-xl border border-dashed px-4 py-2 text-sm font-semibold hover:opacity-80"
                  style={{ borderColor: "var(--accent-strong)", color: "var(--accent-strong)" }}>
                  + เพิ่มรายการงาน
                </button>
              </div>

              <Field label="ประเภทของงาน" required error={show("workTypes")} hint="เลือกให้อัตโนมัติจากรายการงาน แก้ไขได้">
                <Chips multi options={WORK_TYPES} value={workTypes} onPick={toggleType} />
              </Field>
              <Field label="สรุปจำนวนชิ้นงานทั้งหมดที่ต้องทำ" required error={show("summary")}
                hint={summaryEdited ? "แก้ไขเองอยู่" : "สร้างอัตโนมัติจากรายการงาน แก้ไขเพิ่มเติมได้"}>
                <textarea rows={4} className={inputCls} style={inputStyle} value={summary}
                  onChange={(e) => { setSummaryDraft(e.target.value); setSummaryEdited(true); }} />
                {summaryEdited && (
                  <button type="button" onClick={() => setSummaryEdited(false)}
                    className="mt-1.5 text-xs font-semibold underline" style={{ color: "var(--accent)" }}>สร้างใหม่จากรายการงาน</button>
                )}
              </Field>
              <Field label="เครดิตที่ใช้" hint="คำนวณให้อัตโนมัติ ไม่ต้องกรอก">
                <div className="rounded-xl px-3.5 py-2.5 text-sm font-bold num" style={{ background: "var(--accent-light)", color: "var(--accent-strong)" }}>
                  {fmt(useCredit)} M Coin
                </div>
              </Field>
            </Section>}

            {step === 4 && <Section step="4" title="กำหนดเวลา">
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="กำหนดเวลาที่ต้องการชิ้นงาน" required error={show("needBy")}>
                  <input type="date" min={today} className={inputCls} style={inputStyle} value={needBy} onChange={(e) => setNeedBy(e.target.value)} />
                </Field>
                <Field label="วันที่ต้องใช้งานจริง" required error={show("useDate")}>
                  <input type="date" min={today} className={inputCls} style={inputStyle} value={useDate} onChange={(e) => setUseDate(e.target.value)} />
                </Field>
              </div>
              {dateWarn && <p className="text-xs font-semibold" style={{ color: "var(--warning)" }}>⚠ {dateWarn}</p>}
            </Section>}

            <div className="flex flex-col gap-2 pb-2 max-lg:sticky max-lg:bottom-0 max-lg:z-20 max-lg:-mx-4 max-lg:px-4 max-lg:pt-3 max-lg:pb-[max(0.75rem,env(safe-area-inset-bottom))] max-lg:border-t max-lg:bg-[var(--bg-page)]" style={{ borderColor: "var(--border)" }}>
              {avail && (
                <p className="lg:hidden flex justify-between gap-3 text-xs font-semibold num" aria-live="polite"
                  style={{ color: notEnough ? "var(--danger)" : "var(--text-secondary)" }}>
                  <span>คงเหลือ {fmt(Math.max(0, avail.remaining))} M Coin</span>
                  <span>{notEnough ? `ขาด ${fmt(shortfall)}` : `งานนี้ใช้ ${fmt(useCredit)}`}</span>
                </p>
              )}
              <div className="flex items-center justify-between gap-3">
                {step > 1 ? (
                  <button type="button" onClick={() => goTo(step - 1)}
                    className="rounded-xl border px-5 py-3 text-sm font-bold hover:opacity-80"
                    style={{ borderColor: "var(--border)", background: "var(--bg-card)", color: "var(--text-secondary)" }}>
                    ← ย้อนกลับ
                  </button>
                ) : <span />}
                {step < 4 ? (
                  <button type="submit"
                    className="btn-primary max-sm:flex-1 rounded-xl px-7 py-3 text-sm font-semibold">
                    ถัดไป →
                  </button>
                ) : (
                  <button type="submit" disabled={tried && !canSubmit}
                    className="btn-primary max-sm:flex-1 rounded-xl px-7 py-3 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed">
                    {editing ? "บันทึกการแก้ไข" : "ส่งรีเควส"} · ใช้ {fmt(useCredit)} M Coin
                  </button>
                )}
              </div>
              {tried && (step < 4 ? !stepOk(step) : !canSubmit) && (
                <p className="text-xs font-semibold text-right" style={{ color: "var(--danger)" }} role="alert">
                  {blockMsg || firstError || ""}
                </p>
              )}
            </div>
          </form>

          {/* ── Credit panel ── */}
          <aside className="lg:sticky lg:top-20 flex flex-col gap-4">
            <div className="surface-dark p-6" aria-live="polite">
              <p className="text-sm mb-1" style={{ color: "rgba(255,255,255,0.7)" }}>เครดิตคงเหลือของทีม</p>
              {loadingData ? (
                <p className="text-sm" style={{ color: "rgba(255,255,255,0.7)" }}>กำลังโหลดข้อมูลเครดิต…</p>
              ) : !avail ? (
                <p className="text-sm" style={{ color: "rgba(255,255,255,0.7)" }}>เลือกทีมสร้างบรีฟงาน เพื่อดูเครดิตที่ใช้ได้</p>
              ) : (
                <>
                  <p className="text-xs mb-3" style={{ color: "rgba(255,255,255,0.7)" }}>ทีม {teamDisplay(teamCreator)} · รวมทุกบริษัท{group ? ` (${group})` : ""}</p>
                  <div className="flex items-end gap-2">
                    <span className="num text-5xl font-bold leading-none tracking-tight" style={{ color: notEnough ? "#FCA5A5" : "#fff" }}>{fmt(Math.max(0, avail.remaining))}</span>
                    <span className="text-sm font-bold mb-0.5" style={{ color: "rgba(255,255,255,0.7)" }}>M Coin</span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden mt-4" style={{ background: "rgba(255,255,255,0.12)" }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${barPct}%`, background: notEnough ? "#FCA5A5" : "linear-gradient(90deg,#FF8A63,#E8511E)" }} />
                  </div>
                  <dl className="mt-4 text-xs flex flex-col gap-1.5" style={{ color: "rgba(255,255,255,0.7)" }}>
                    <Row k="เครดิตของทีมเดือนนี้ (ทุกบริษัท)" v={fmt(avail.credit)} />
                    <Row k="ใช้ไปแล้ว (ชีตงาน)" v={fmt(avail.sheetUsed)} />
                    <Row k="ใช้ไปแล้ว (แอดผ่านเว็บ)" v={fmt(avail.webUsed)} />
                    <Row k="งานนี้ใช้" v={`− ${fmt(useCredit)}`} accent />
                    <div className="h-px my-1" style={{ background: "rgba(255,255,255,0.15)" }} />
                    <Row k="คงเหลือหลังแอด" v={fmt(afterRemaining)} bold danger={notEnough} />
                  </dl>
                  {notEnough && (
                    <p className="mt-3 rounded-lg px-3 py-2 text-xs font-semibold" style={{ background: "rgba(248,113,113,0.15)", color: "#FCA5A5" }} role="alert">
                      เครดิตไม่พอ: ขาดอีก {fmt(shortfall)} M Coin · ลดจำนวนชิ้นหรือเปลี่ยนรายการงาน
                    </p>
                  )}
                  <p className="mt-3 text-xs leading-snug" style={{ color: "rgba(255,255,255,0.65)" }}>
                    ใช้เกินส่วนของแต่ละบริษัทได้ แต่รวมกันต้องไม่เกินถังรวมของทีม
                  </p>
                  {avail.credit === 0 && (
                    <p className="mt-3 text-xs" style={{ color: "#FCD34D" }}>ทีมนี้ยังไม่ได้รับจัดสรรเครดิตเดือนนี้ — ให้ Lead ตั้งใน Credit Distribution</p>
                  )}
                </>
              )}
            </div>
          </aside>
        </div>

      {done && <SubmittedDialog done={done} onClose={() => { setDone(null); window.scrollTo({ top: 0, behavior: "smooth" }); }} />}
    </div>
  );
}

export default function NewTaskPage() {
  return (
    <AssignGate active="request">
      <NewTaskForm />
    </AssignGate>
  );
}

/* ── small UI pieces ── */

function Section({ step: _step, title, desc, children }: { step: string; title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="surface p-5 sm:p-7 flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] mb-1" style={{ color: "var(--accent-strong)" }}>ขั้นที่ {_step}</p>
          <h2 className="text-lg font-bold leading-tight" style={{ color: "var(--text-primary)" }}>{title}</h2>
          {desc && <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>{desc}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({ label, required, hint, error, children }: {
  label: string; required?: boolean; hint?: string; error?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
        {label}{required && <span style={{ color: "var(--danger)" }} aria-hidden> *</span>}
      </p>
      {hint && <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>{hint}</p>}
      {children}
      {error && <p className="text-xs font-semibold mt-1.5" style={{ color: "var(--danger)" }} role="alert">{error}</p>}
    </div>
  );
}

function Chips({ options, value, onPick, multi, lockedTo, display, grid, cols = 7, searchable }: {
  options: string[]; value: string | string[]; onPick: (v: string) => void; multi?: boolean; lockedTo?: string;
  display?: (v: string) => string;
  /** large equal-width buttons, 7 per row on desktop */
  grid?: boolean;
  /** columns per row on desktop when `grid` is set */
  cols?: 4 | 7;
  /** adds a search box that hides options that do not match what is typed (selected ones stay visible) */
  searchable?: boolean;
}) {
  const [q, setQ] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const isOn = (o: string) => (Array.isArray(value) ? value.includes(o) : value === o);
  const needle = q.toLowerCase().replace(/[\u0E47-\u0E4E]/g, "").replace(/\s+/g, "");
  const visible = !searchable || !needle
    ? options
    : options.filter((o) => isOn(o) || (display ? display(o) : o).toLowerCase().replace(/[\u0E47-\u0E4E]/g, "").replace(/\s+/g, "").includes(needle));
  return (
    <div>
      {searchable && (
        <div onClick={() => searchRef.current?.focus()}
          className="mb-2 flex flex-wrap items-center gap-1.5 rounded-xl border px-2.5 py-2 cursor-text transition-colors focus-within:border-[var(--accent)]"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          {(Array.isArray(value) ? value : value ? [value] : []).map((v) => (
            <span key={v} className="inline-flex items-center gap-1 rounded-lg pl-2.5 pr-1 py-1 text-xs font-semibold text-white" style={{ background: "var(--accent-strong)" }}>
              {display ? display(v) : v}
              <button type="button" aria-label={`เอา ${display ? display(v) : v} ออก`} onClick={(e) => { e.stopPropagation(); onPick(v); }}
                className="w-5 h-5 rounded-md leading-none hover:bg-white/25">×</button>
            </span>
          ))}
          <input ref={searchRef} type="search" value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Backspace" && !q && Array.isArray(value) && value.length) onPick(value[value.length - 1]);
            }}
            placeholder={Array.isArray(value) && value.length ? "พิมพ์เพื่อค้นหาเพิ่ม" : "พิมพ์เพื่อค้นหา"}
            aria-label="ค้นหาตัวเลือก" autoComplete="off"
            className="flex-1 min-w-[140px] bg-transparent px-1 py-1 text-base sm:text-sm outline-none"
            style={{ color: "var(--text-primary)" }} />
        </div>
      )}
    <div className={grid ? `grid ${cols === 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3 sm:grid-cols-4 md:grid-cols-7"} auto-rows-fr gap-2` : "flex flex-wrap gap-1.5"} role={multi ? "group" : "radiogroup"}>
      {visible.map((o) => {
        const on = isOn(o);
        return (
          <button type="button" key={o} aria-pressed={multi ? on : undefined}
            onClick={() => {
              onPick(o);
              if (searchable) {
                setQ("");
                if (window.matchMedia("(pointer: fine)").matches) searchRef.current?.focus();
              }
            }}
            disabled={!!lockedTo && o !== lockedTo}
            role={multi ? undefined : "radio"} aria-checked={multi ? undefined : on}
            className={`${on ? "chip-on" : "hover:border-[var(--text-muted)]"} rounded-xl border font-semibold transition-all disabled:opacity-35 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)] ${grid ? "px-1 min-h-12 flex items-center justify-center text-center text-[13px] leading-tight" : "px-3 min-h-10 sm:min-h-0 sm:py-1.5 text-xs"}`}
            style={on
              ? { background: "var(--accent-strong)", borderColor: "var(--accent-strong)", color: "#fff" }
              : { background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text-secondary)" }}>
            {display ? display(o) : o}
          </button>
        );
      })}
    </div>
      {searchable && visible.length === 0 && (
        <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>ไม่พบ “{q}”</p>
      )}
    </div>
  );
}

function Row({ k, v, accent, bold, danger }: { k: string; v: string; accent?: boolean; bold?: boolean; danger?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt>{k}</dt>
      <dd className={bold ? "font-bold text-sm num" : "font-semibold num"}
        style={{ color: danger ? "#FCA5A5" : accent ? "var(--accent)" : bold ? "#fff" : undefined }}>{v}</dd>
    </div>
  );
}

/** Confirmation popup after a request is submitted: what was charged and where it went in Notion. */
function SubmittedDialog({ done, onClose }: {
  done: { task: AssignedTask; edited: boolean; remaining: number; notion: "off" | "pending" | "ok" | "error"; url?: string; error?: string };
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const { task, notion } = done;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: "rgba(20,20,20,0.55)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="submitted-title" className="surface w-full max-w-md p-6 sm:p-7">
        {/* one status for the whole request: saved, then created in Notion (or why not) */}
        {(() => {
          const st = notion === "pending" ? { bg: "var(--bg-page)", fg: "var(--text-secondary)", label: "กำลังสร้าง Task ใน Notion…" }
            : notion === "error" ? { bg: "var(--warning-bg)", fg: "var(--warning)", label: "บันทึกแล้ว · ยังไม่เข้า Notion" }
            : notion === "ok" ? { bg: "var(--success-bg)", fg: "var(--success)", label: "สร้างเรียบร้อยแล้ว" }
            : { bg: "var(--success-bg)", fg: "var(--success)", label: "บันทึกเรียบร้อยแล้ว" };
          return (
            <span className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold" style={{ background: st.bg, color: st.fg }} role="status">
              {notion === "pending"
                ? <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
                : <span aria-hidden>{notion === "error" ? "!" : "✓"}</span>}
              {st.label}
            </span>
          );
        })()}
        <h2 id="submitted-title" className="mt-4 text-2xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>{done.edited ? "บันทึกการแก้ไขแล้ว" : "ส่งรีเควสแล้ว"}</h2>
        <p className="mt-1 text-sm font-semibold break-words" style={{ color: "var(--text-secondary)" }}>{task.title}</p>

        <dl className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-xl px-4 py-3" style={{ background: "var(--accent-light)" }}>
            <dt className="text-xs" style={{ color: "var(--accent-strong)" }}>หักเครดิต</dt>
            <dd className="num text-xl font-bold" style={{ color: "var(--accent-strong)" }}>{fmt(task.useCredit)} <span className="text-xs font-medium">M Coin</span></dd>
          </div>
          <div className="rounded-xl px-4 py-3" style={{ background: "var(--bg-page)" }}>
            <dt className="text-xs" style={{ color: "var(--text-secondary)" }}>คงเหลือของทีม</dt>
            <dd className="num text-xl font-bold" style={{ color: "var(--text-primary)" }}>{fmt(Math.max(0, done.remaining))} <span className="text-xs font-medium">M Coin</span></dd>
          </div>
        </dl>

        {notion === "error" && (
          <p className="mt-4 text-sm" style={{ color: "var(--warning)" }}>
            ส่งเข้า Notion ไม่สำเร็จ{done.error ? ` (${done.error})` : ""} — ลองส่งใหม่ได้ที่ “งานของฉัน”
          </p>
        )}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
          {notion !== "off" && (
            done.url ? (
              <a href={done.url} target="_blank" rel="noopener noreferrer" className="btn-primary flex-1 rounded-xl px-5 py-3 text-center text-sm font-bold">
                เปิดใน Notion ↗
              </a>
            ) : (
              <span className="flex-1 rounded-xl px-5 py-3 text-center text-sm font-bold" aria-disabled="true"
                style={{ background: "var(--bg-page)", color: "var(--text-muted)" }}>
                {notion === "pending" ? "รอสร้างใน Notion…" : "ยังไม่มีลิงก์ Notion"}
              </span>
            )
          )}
          <button ref={closeRef} type="button" onClick={onClose}
            className="flex-1 rounded-xl border px-5 py-3 text-sm font-bold transition-colors hover:bg-black/5"
            style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
            ปิด
          </button>
        </div>
        <Link href="/my-tasks" className="mt-4 block text-center text-xs font-semibold underline underline-offset-2" style={{ color: "var(--text-secondary)" }}>
          ดูในงานของฉัน
        </Link>
      </div>
    </div>
  );
}
