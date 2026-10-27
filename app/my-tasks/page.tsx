"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import MonthSelector from "@/components/MonthSelector";
import AssignGate, { useAssignUser } from "@/components/AssignGate";
import { REQUEST_TYPES } from "@/lib/priceTable";
import { NOTION_BRIDGE_URL, fetchNotionStatuses, pushTaskToNotion } from "@/lib/notionBridge";
import { AssignedTask, loadAssigned, notionPageId, projectDisplay, teamDisplay, updateAssigned } from "@/lib/taskAssign";

const THAI_MONTHS_SHORT = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 });
const formatThaiDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${THAI_MONTHS_SHORT[m - 1]} ${y + 543}`;
};
const PRIORITY_COLOR: Record<string, string> = { Low: "#6B7280", Normal: "#2563EB", High: "#D97706", Urgent: "#DC2626" };

/** Work status shown on each card, from the Notion "Status" property (plus our own "cancelled" when the page was trashed). */
function statusOf(t: AssignedTask): { label: string; fg: string; bg: string } {
  if (t.cancelled) return { label: "ยกเลิก", fg: "var(--danger)", bg: "var(--danger-bg)" };
  if (!t.notionUrl) return { label: "ยังไม่เข้า Notion", fg: "var(--text-secondary)", bg: "var(--bg-page)" };
  switch (t.notionStatus) {
    case "Not Started": return { label: "รอเริ่มงาน", fg: "var(--text-secondary)", bg: "var(--bg-page)" };
    case "Open":        return { label: "เปิดงานแล้ว", fg: "var(--warning)", bg: "var(--warning-bg)" };
    case "In Progress": return { label: "กำลังทำ", fg: "#1D4ED8", bg: "#EFF6FF" };
    case "Hold":        return { label: "พักไว้", fg: "var(--text-secondary)", bg: "var(--bg-page)" };
    case "Done":        return { label: "เสร็จแล้ว", fg: "var(--success)", bg: "var(--success-bg)" };
    case "Archived":    return { label: "เก็บถาวร", fg: "var(--text-secondary)", bg: "var(--bg-page)" };
    case "__notfound":  return { label: "ไม่พบใน Notion", fg: "var(--warning)", bg: "var(--warning-bg)" };
    default:            return { label: t.notionStatus ?? "ยังไม่ได้ตรวจสถานะ", fg: "var(--text-secondary)", bg: "var(--bg-page)" };
  }
}

type IconName = "list" | "doc" | "user" | "folder" | "tag" | "calendar" | "target" | "link" | "paperclip" | "notion" | "info";
const ICON_PATHS: Record<IconName, string> = {
  list: "M6 5h11M6 10h11M6 15h11M3 5h.01M3 10h.01M3 15h.01",
  doc: "M5 2.5h6.5L15 6v11.5H5v-15ZM11 2.5V6h4M7.5 10h5M7.5 13h5",
  user: "M10 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM4 17c0-3 2.7-5 6-5s6 2 6 5",
  folder: "M2.5 5.5A1.5 1.5 0 0 1 4 4h3.5l1.5 2H16a1.5 1.5 0 0 1 1.5 1.5V14A1.5 1.5 0 0 1 16 15.5H4A1.5 1.5 0 0 1 2.5 14V5.5Z",
  tag: "M3 3h6l8 8-6 6-8-8V3ZM6.5 6.5h.01",
  calendar: "M4 5h12v11H4V5ZM4 8.5h12M7 3v3M13 3v3",
  target: "M10 17.5a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15ZM10 13.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM10 10h.01",
  link: "M8.5 11.5a3 3 0 0 0 4.2 0l2.6-2.6a3 3 0 0 0-4.2-4.2l-.9.9M11.5 8.5a3 3 0 0 0-4.2 0l-2.6 2.6a3 3 0 0 0 4.2 4.2l.9-.9",
  paperclip: "M15.5 9.5 10 15a3.5 3.5 0 0 1-5-5l6-6a2.3 2.3 0 0 1 3.3 3.3l-6 6a1.2 1.2 0 0 1-1.7-1.7L11 6.5",
  notion: "M8 3.5H4.5v12h12V12M11 3.5h5.5V9M16.5 3.5 9 11",
  info: "M10 17.5a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15ZM10 9v4.5M10 6.5h.01",
};
function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

function MyTasks() {
  const { user, isSuperAdmin } = useAssignUser();
  const [showAll, setShowAll] = useState(false);
  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [tick, setTick]   = useState(0);
  const [open, setOpen]   = useState<string | null>(null);
  const [pushing, setPushing] = useState<string | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState(false);

  /** Read each task's current Notion status; a page moved to trash cancels the task and returns its credit. */
  function checkStatuses(y = year, m = month) {
    const sent = loadAssigned(y, m).filter((t) => !t.cancelled && notionPageId(t.notionUrl));
    if (!NOTION_BRIDGE_URL || sent.length === 0) return;
    setChecking(true);
    setCheckError(false);
    fetchNotionStatuses(sent.map((t) => notionPageId(t.notionUrl)!))
      .then((results) => {
        const at = new Date().toISOString();
        for (const t of sent) {
          const r = results[notionPageId(t.notionUrl)!];
          if (!r) continue;
          if (r.inTrash) updateAssigned(y, m, t.id, { cancelled: true, cancelledAt: at, notionStatus: r.status ?? undefined, notionCheckedAt: at });
          else if (r.notFound) updateAssigned(y, m, t.id, { notionStatus: "__notfound", notionCheckedAt: at });
          else if (r.status) updateAssigned(y, m, t.id, { notionStatus: r.status, notionCheckedAt: at });
        }
        setTick((n) => n + 1);
      })
      .catch(() => setCheckError(true))
      .finally(() => setChecking(false));
  }

  // refresh statuses whenever the month changes
  useEffect(() => { checkStatuses(year, month); }, [year, month]); // eslint-disable-line react-hooks/exhaustive-deps

  // tick forces a re-read after a cancel
  void tick;
  // everything I created, whichever team it was filed under
  const tasks: AssignedTask[] = loadAssigned(year, month)
    .filter((t) => (isSuperAdmin && showAll) || t.creatorEmail === user.email || t.createdByEmail === user.email)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)); // newest first
  // credits used, split by the team they were charged to (biggest first)
  const byTeam = [...tasks.filter((t) => !t.cancelled).reduce((m, t) => {
    const e = m.get(t.teamCreator) ?? { credit: 0, count: 0 };
    return m.set(t.teamCreator, { credit: e.credit + t.useCredit, count: e.count + 1 });
  }, new Map<string, { credit: number; count: number }>())]
    .map(([team, e]) => ({ team, credit: Math.round(e.credit * 100) / 100, count: e.count }))
    .sort((a, b) => b.credit - a.credit);

  function sendToNotion(t: AssignedTask) {
    setPushing(t.id);
    setPushError(null);
    pushTaskToNotion(t)
      .then(({ url }) => {
        updateAssigned(t.year, t.month, t.id, { notionUrl: url, notionPushedAt: new Date().toISOString() });
        setTick((n) => n + 1);
      })
      .catch(() => setPushError(t.id))
      .finally(() => setPushing(null));
  }


  const renderTask = (t: AssignedTask) => {
        const expanded = open === t.id;
        return (
          <li key={t.id} data-cancelled={t.cancelled || undefined} className="rounded-2xl border overflow-hidden data-[cancelled]:opacity-70 transition-shadow transition-colors hover:shadow-[0_8px_24px_-8px_rgba(232,81,30,0.35)] border-[var(--border)] hover:border-[rgba(232,81,30,0.35)]" style={{ background: "var(--bg-card)" }}>
            <button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : t.id)}
              className="group w-full text-left p-4 sm:p-5 flex items-start justify-between gap-4 cursor-pointer">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  {(() => { const st = statusOf(t); return (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-2 py-0.5" style={{ background: st.bg, color: st.fg }}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: "currentColor" }} aria-hidden />{st.label}
                    </span>
                  ); })()}
                  <span className="text-xs font-semibold rounded-md px-2 py-0.5"
                    style={{ background: `${PRIORITY_COLOR[t.priority] ?? "#6B7280"}1A`, color: PRIORITY_COLOR[t.priority] ?? "#6B7280" }}>{t.priority}</span>
                  <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{teamDisplay(t.teamCreator)} · {t.company}</span>
                </div>
                <p className={`text-base font-bold ${t.cancelled ? "line-through" : ""}`} style={{ color: "var(--text-primary)" }}>{t.title}</p>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" style={{ color: "var(--text-secondary)" }}>
                  <span className="inline-flex items-center gap-1.5"><Icon name="calendar" size={14} />ต้องการ {formatThaiDate(t.needBy)}</span>
                  <span className="inline-flex items-center gap-1.5"><Icon name="target" size={14} />ใช้งานจริง {formatThaiDate(t.useDate)}</span>
                  <span className="inline-flex items-center gap-1.5"><Icon name="user" size={14} />{t.createdBy}{showAll && t.creatorEmail ? ` · ${t.creatorEmail}` : ""}</span>
                </p>
              </div>
              <div className="shrink-0 flex flex-col items-end gap-2">
                <div className="text-right">
                  <p className={`text-lg font-black leading-none ${t.cancelled ? "line-through" : ""}`} style={{ color: t.cancelled ? "var(--text-muted)" : "var(--accent)" }}>{fmt(t.useCredit)}</p>
                  <p className="text-[10px] font-bold mt-0.5" style={{ color: t.cancelled ? "var(--success)" : "var(--text-muted)" }}>{t.cancelled ? "คืนเครดิตแล้ว" : "M Coin"}</p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-bold transition-colors group-hover:border-[var(--accent)] group-hover:text-[var(--accent)]"
                  style={{ borderColor: "var(--border)", background: "var(--bg-card)", color: "var(--text-secondary)" }}>
                  {expanded ? "ซ่อนรายละเอียด" : "ดูรายละเอียด"}
                  <svg viewBox="0 0 10 10" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
                    style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform .15s" }} aria-hidden>
                    <path d="M1.5 3.5 5 7l3.5-3.5" />
                  </svg>
                </span>
              </div>
            </button>

            {expanded && (
              <div className="border-t px-4 sm:px-5 py-5 flex flex-col gap-6 text-sm" style={{ borderColor: "var(--border)" }}>

                <Group icon="list" title="รายการงานและเครดิต">
                  <ul className="rounded-xl border divide-y" style={{ borderColor: "var(--border)" }}>
                    {t.lines.map((l, i) => (
                      <li key={i} className="flex items-start justify-between gap-4 px-3.5 py-2.5" style={{ borderColor: "var(--border)" }}>
                        <span className="min-w-0">
                          <span className="font-medium">{l.code} · {l.name}</span>
                          <span className="block text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                            {REQUEST_TYPES.find((r) => r.key === l.requestType)?.label} × {l.qty} ชิ้น
                          </span>
                        </span>
                        <span className="num font-semibold shrink-0">{fmt(l.credit)}</span>
                      </li>
                    ))}
                    <li className="flex items-center justify-between gap-4 px-3.5 py-2.5 rounded-b-xl" style={{ background: "var(--accent-light)", borderColor: "var(--border)" }}>
                      <span className="font-semibold">รวมเครดิตที่ใช้</span>
                      <span className="num font-bold" style={{ color: "var(--accent-strong)" }}>{fmt(t.useCredit)} M Coin</span>
                    </li>
                  </ul>
                </Group>

                <Group icon="doc" title="รายละเอียดงาน">
                  <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-3">
                    <Fact icon="user" label="เจ้าของงาน / ทีม">{t.owner} · {teamDisplay(t.teamCreator)}</Fact>
                    <Fact icon="folder" label="โปรเจกต์">{t.projects.map(projectDisplay).join(", ")}</Fact>
                    <Fact icon="tag" label="ประเภทของงาน">{t.workTypes.join(", ")}</Fact>
                  </dl>
                  <dl className="flex flex-col gap-4 mt-4">
                    <Fact icon="target" label="วัตถุประสงค์"><span className="whitespace-pre-wrap">{t.objective}</span></Fact>
                    <Fact icon="link" label="ลิงก์ไฟล์งานและความต้องการ"><span className="whitespace-pre-wrap break-words">{t.link}</span></Fact>
                    {t.refFiles.length > 0 && <Fact icon="paperclip" label="ไฟล์ตัวอย่างอ้างอิง">{t.refFiles.map((f) => f.name).join(", ")}</Fact>}
                  </dl>
                </Group>

                <Group icon="notion" title="สถานะใน Notion">
                  {t.cancelled && (
                    <p className="mb-2 text-sm font-semibold" style={{ color: "var(--danger)" }}>
                      งานนี้ถูกลบ (ย้ายไปถังขยะ) ใน Notion จึงเปลี่ยนเป็น "ยกเลิก" และคืนเครดิต {fmt(t.useCredit)} M Coin ให้ทีมแล้ว
                    </p>
                  )}
                  {t.notionCheckedAt && (
                    <p className="mb-2 text-xs" style={{ color: "var(--text-secondary)" }}>
                      สถานะล่าสุด: {statusOf(t).label}{t.notionStatus && !t.notionStatus.startsWith("__") ? ` (${t.notionStatus})` : ""} · ตรวจเมื่อ {new Date(t.notionCheckedAt).toLocaleString("th-TH")}
                    </p>
                  )}
                  {t.notionUrl ? (
                    <a href={t.notionUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-shadow hover:shadow-sm"
                      style={{ borderColor: "var(--border)", color: "var(--accent-strong)" }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--success)" }} aria-hidden />
                      ส่งแล้ว · เปิดใน Notion ↗
                    </a>
                  ) : NOTION_BRIDGE_URL ? (
                    <div className="flex items-center gap-3 flex-wrap">
                      <button type="button" disabled={pushing === t.id} onClick={() => sendToNotion(t)}
                        className="rounded-lg border px-3 py-2 text-xs font-semibold transition-shadow hover:shadow-sm disabled:opacity-50"
                        style={{ borderColor: "var(--accent-strong)", color: "var(--accent-strong)" }}>
                        {pushing === t.id ? "กำลังส่ง…" : "ส่งเข้า Notion"}
                      </button>
                      {pushError === t.id && (
                        <span className="text-xs font-semibold" style={{ color: "var(--danger)" }} role="alert">ส่งเข้า Notion ไม่สำเร็จ · ลองอีกครั้ง หากยังไม่ได้ให้แจ้งทีมดูแลระบบ</span>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm" style={{ color: "var(--text-secondary)" }}>ยังไม่ได้ส่งเข้า Notion</p>
                  )}
                </Group>

                <div className="border-t pt-4 flex flex-col gap-2 text-xs" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
                  <p className="num">ส่งรีเควสเมื่อ {new Date(t.createdAt).toLocaleString("th-TH")}{t.creatorEmail ? ` · ${t.creatorEmail}` : ""}</p>
                  <p className="inline-flex items-start gap-1.5">
                    <span className="mt-0.5 shrink-0"><Icon name="info" size={14} /></span>
                    <span>ต้องการยกเลิกหรือแก้ไขงานนี้ กรุณาติดต่อ <b>Lead Team Multimedia</b></span>
                  </p>
                </div>
              </div>
            )}
          </li>
        );
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.15em] mb-2" style={{ color: "var(--accent)" }}>Assign Task · งานของฉัน</p>
          <h1 className="text-3xl sm:text-4xl font-black leading-none tracking-tight" style={{ color: "var(--text-primary)" }}>
            งานของ<span style={{ color: "var(--accent)" }}>ฉัน</span>
          </h1>
          <p className="text-sm mt-2" style={{ color: "var(--text-muted)" }}>
            งานทั้งหมดที่คุณส่งรีเควส เรียงจากใหม่ไปเก่า · ข้อมูลเก็บในเบราว์เซอร์เครื่องนี้ (ยังไม่แชร์ข้ามเครื่อง)
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {isSuperAdmin && (
            <label className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold cursor-pointer select-none"
              style={{ borderColor: showAll ? "var(--accent)" : "var(--border)", background: "var(--bg-card)", color: showAll ? "var(--accent)" : "var(--text-secondary)" }}>
              <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="accent-[var(--accent)]" />
              ดูงานของทุกคน (Super admin)
            </label>
          )}
          {NOTION_BRIDGE_URL && (
            <button type="button" onClick={() => checkStatuses()} disabled={checking}
              className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition-colors hover:bg-black/5 disabled:opacity-60"
              style={{ borderColor: checkError ? "var(--danger-line)" : "var(--border)", background: "var(--bg-card)", color: checkError ? "var(--danger)" : "var(--text-secondary)" }}>
              <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden
                className={checking ? "animate-spin" : ""}><path d="M16 10a6 6 0 1 1-1.8-4.3M16 4v3.5h-3.5" /></svg>
              {checking ? "กำลังตรวจสถานะ…" : checkError ? "ตรวจสถานะไม่สำเร็จ · ลองใหม่" : "ตรวจสถานะจาก Notion"}
            </button>
          )}
          <MonthSelector year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); setOpen(null); }} />
        </div>
      </div>

      {(
        <>
          <div className="flex flex-wrap gap-3 mb-6">
            {byTeam.map((b) => (
              <Stat key={b.team} label={`เครดิตที่ใช้ · ทีม ${teamDisplay(b.team)}`} value={fmt(b.credit)} unit="M Coin" note={`${b.count} งาน`} accent />
            ))}
          </div>

          {tasks.length === 0 ? (
            <div className="rounded-2xl border px-5 py-10 text-center" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
              <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>คุณยังไม่ได้ส่งรีเควสใน {THAI_MONTHS_SHORT[month - 1]} {year + 543}</p>
              <Link href="/new-task" className="inline-block rounded-xl px-5 py-2.5 text-sm font-bold text-white" style={{ background: "var(--accent)" }}>+ ส่งรีเควสใหม่</Link>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {tasks.map((t) => renderTask(t))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, unit, accent, note }: { label: string; value: string; unit?: string; accent?: boolean; note?: string }) {
  return (
    <div className="rounded-xl border px-4 py-3 min-w-[150px]" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
      <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{label}</p>
      <p className="flex items-baseline gap-1.5 mt-0.5">
        <span className="num text-2xl font-bold" style={{ color: accent ? "var(--accent-strong)" : "var(--text-primary)" }}>{value}</span>
        {unit && <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{unit}</span>}
      </p>
      {note && <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>{note}</p>}
    </div>
  );
}

function Group({ icon, title, children }: { icon: IconName; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="flex items-center gap-2 mb-2.5 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
        <span className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "var(--accent-light)", color: "var(--accent-strong)" }}>
          <Icon name={icon} size={16} />
        </span>
        {title}
      </h3>
      <div style={{ color: "var(--text-primary)" }}>{children}</div>
    </section>
  );
}

function Fact({ icon, label, children }: { icon: IconName; label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-xs mb-0.5" style={{ color: "var(--text-secondary)" }}>
        <Icon name={icon} size={14} />{label}
      </dt>
      <dd className="pl-5" style={{ color: "var(--text-primary)" }}>{children}</dd>
    </div>
  );
}

export default function MyTasksPage() {
  return (
    <AssignGate active="mine">
      <MyTasks />
    </AssignGate>
  );
}
