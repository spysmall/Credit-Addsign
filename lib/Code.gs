/**
 * Google Apps Script — Credit Distribution Sync
 *
 * วิธี deploy:
 *  1. เปิด Google Sheet → Extensions → Apps Script
 *  2. วางโค้ดนี้ใน Code.gs แล้ว Save
 *  3. Deploy → New deployment → Type: Web App
 *     Execute as: Me | Who has access: Anyone
 *  4. Copy Web App URL → ใส่ใน .env.local:
 *     NEXT_PUBLIC_DIST_SCRIPT_URL=https://script.google.com/macros/s/YOUR_ID/exec
 *
 * Tabs: "Credit Distribution", "Note Plan", "Remaining", "Web Tasks" (created on first use)
 *
 * Sheet structure (tab ชื่อ "Credit Distribution"):
 *  A: month      (e.g. "2026-7")
 *  B: team_id    (e.g. "cb-mkt-perf")
 *  C: pct        (number)
 *  D: updated_at (ISO timestamp)
 */

var SHEET_NAME           = "Credit Distribution";
var NOTE_SHEET_NAME      = "Note Plan";
var REMAINING_SHEET_NAME = "Remaining";
var TASK_SHEET_NAME      = "Web Tasks";

function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(["month", "team_id", "pct", "updated_at"]);
  }
  return sheet;
}

function getNoteSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(NOTE_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(NOTE_SHEET_NAME);
    sheet.appendRow(["month", "note", "updated_at"]);
  }
  return sheet;
}

function getRemainingSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(REMAINING_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(REMAINING_SHEET_NAME);
    sheet.appendRow(["month", "priority", "company", "team", "credit", "used", "remaining", "remaining_pct", "task_count", "updated_at"]);
  }
  // Force column A (month, e.g. "2026-7") to plain text so Sheets doesn't
  // silently auto-convert it to a Date, which would break key matching below.
  sheet.getRange("A:A").setNumberFormat("@");
  return sheet;
}

// One row per task submitted on the web (Assign Task). The site reads this tab through the
// public gviz CSV, so the submitter, "สร้างโดย" and the owner see the task on any device.
function getTaskSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(TASK_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(TASK_SHEET_NAME);
    sheet.appendRow(["id", "year_month", "creator_email", "created_by_email", "owner_email", "cancelled", "updated_at", "json"]);
  }
  sheet.getRange("A:B").setNumberFormat("@"); // keep ids and "2026-10" as text
  return sheet;
}

// Normalize a cell value to a "YYYY-M" string — handles the case where an
// older row's month cell was auto-converted to a Date by Sheets.
function monthKey_(v) {
  if (Object.prototype.toString.call(v) === "[object Date]") {
    return v.getFullYear() + "-" + (v.getMonth() + 1);
  }
  return String(v);
}

// GET ?month=2026-7              → [{team_id, pct}, ...]
// GET ?action=getNote&month=...  → {note: "..."}
function doGet(e) {
  var params = e.parameter || {};
  var month  = params.month || "";
  var action = params.action || "";

  if (action === "notionStatus") {
    var ids = String(params.ids || "").split(",").map(function (x) { return x.replace(/-/g, ""); })
      .filter(function (x) { return /^[0-9a-f]{32}$/i.test(x); }).slice(0, 50);
    try { return json_({ results: notionStatuses_(ids) }); }
    catch (err) { return json_({ error: String(err.message || err) }); }
  }

  if (action === "getNote") {
    var ns   = getNoteSheet();
    var nd   = ns.getDataRange().getValues();
    var note = "";
    for (var i = 1; i < nd.length; i++) {
      if (String(nd[i][0]) === month) { note = String(nd[i][1]); } // no break → last row wins
    }
    return ContentService
      .createTextOutput(JSON.stringify({ note: note }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Default: distribution rows
  var sheet  = getSheet();
  var data   = sheet.getDataRange().getValues();
  var result = [];
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === month) {
      result.push({ team_id: String(data[i][1]), pct: Number(data[i][2]) });
    }
  }
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// POST body: { month, teams }           → save distribution %
// POST body: { action:"saveNote", month, note } → save note
// POST body: { action:"saveRemaining", month, rows } → save remaining-credit snapshot
function doPost(e) {
  var body = JSON.parse(e.postData.contents);

  // POST body: { action:"createNotionTask", task } → create the Notion page (once per task id)
  if (body.action === "createNotionTask") {
    return json_(createNotionTask_(body.task));
  }

  // POST body: { action:"saveTask", task } → insert or update the task row (matched by id)
  if (body.action === "saveTask") {
    var t = body.task || {};
    if (!t.id) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: "missing id" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var ts = getTaskSheet();
      var td = ts.getDataRange().getValues();
      var row = [
        String(t.id), t.year + "-" + t.month,
        t.creatorEmail || "", t.createdByEmail || "", t.ownerEmail || "",
        t.cancelled ? "TRUE" : "", t.updatedAt || new Date().toISOString(),
        JSON.stringify(t),
      ];
      var at = 0;
      for (var i = 1; i < td.length; i++) { if (String(td[i][0]) === String(t.id)) { at = i + 1; break; } }
      if (at) {
        // never let an older copy overwrite a newer one
        if (String(td[at - 1][6]) > String(row[6])) at = -1;
        else ts.getRange(at, 1, 1, row.length).setValues([row]);
      } else {
        ts.appendRow(row);
      }
    } finally {
      lock.releaseLock();
    }
    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (body.action === "saveRemaining") {
    var rs   = getRemainingSheet();
    var now3 = new Date().toISOString();
    var rows = body.rows || [];

    // Delete legacy rows with old CRI group name (exact match, no ", Other" suffix)
    var legacyName = "CRI, Aztek, Topfiar";
    var legacy = rs.getDataRange().getValues();
    for (var i = legacy.length - 1; i >= 1; i--) {
      if (String(legacy[i][2]) === legacyName || String(legacy[i][3]) === legacyName) {
        rs.deleteRow(i + 1);
      }
    }

    var rd   = rs.getDataRange().getValues();

    // Index existing rows by month|priority|company|team → sheet row number, so
    // matching rows get updated in place instead of deleted + re-appended.
    var index = {};
    for (var i = 1; i < rd.length; i++) {
      var existingKey = monthKey_(rd[i][0]) + "|" + rd[i][1] + "|" + rd[i][2] + "|" + rd[i][3];
      index[existingKey] = i + 1;
    }

    for (var m = 0; m < rows.length; m++) {
      var r = rows[m];
      var key = monthKey_(body.month) + "|" + r.priority + "|" + r.company + "|" + r.team;
      var values = [
        body.month, r.priority, r.company, r.team,
        r.credit, r.used, r.remaining, r.remainingPct, r.taskCount, now3
      ];
      if (index[key]) {
        rs.getRange(index[key], 1, 1, values.length).setValues([values]);
      } else {
        rs.appendRow(values);
        index[key] = rs.getLastRow();
      }
    }

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (body.action === "saveNote") {
    var ns   = getNoteSheet();
    var nd   = ns.getDataRange().getValues();
    var now  = new Date().toISOString();
    // Delete existing row for this month
    for (var i = nd.length - 1; i >= 1; i--) {
      if (String(nd[i][0]) === body.month) { ns.deleteRow(i + 1); }
    }
    ns.appendRow([body.month, body.note || "", now]);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Default: save distribution %
  var month  = body.month;
  var teams  = body.teams;
  var sheet  = getSheet();
  var data   = sheet.getDataRange().getValues();
  var now    = new Date().toISOString();

  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]) === month) { sheet.deleteRow(i + 1); }
  }
  for (var j = 0; j < teams.length; j++) {
    sheet.appendRow([month, teams[j].id, teams[j].pct, now]);
  }

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─────────────────────────────────────────────────────────────────────────────
// Notion: create Assign-Task pages and read their status, so the deployed site can do what
// scripts/notion-bridge.mjs does locally. The token never reaches the browser.
//
// Setup (once): Project Settings → Script properties
//   NOTION_TOKEN        = the integration token (same as NOTION_TOKEN in .env.local)
//   NOTION_ALL_TASK_DB  = the All Task database id (same as in .env.local)
// Then Deploy → Manage deployments → edit → New version (approve the "external requests" permission).
//
//   POST { action:"createNotionTask", task }   → { ok, id, url } | { ok:false, error }
//   GET  ?action=notionStatus&ids=<id>,<id>     → { results: { [id]: { status, inTrash, notFound? } } }
// ─────────────────────────────────────────────────────────────────────────────

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function notionConf_() {
  var p = PropertiesService.getScriptProperties();
  var token = p.getProperty("NOTION_TOKEN");
  var db = (p.getProperty("NOTION_ALL_TASK_DB") || "").replace(/-/g, "");
  if (!token || !db) throw new Error("NOTION_TOKEN / NOTION_ALL_TASK_DB script properties are not set");
  return { token: token, db: db };
}

function notion_(method, path, body) {
  var conf = notionConf_();
  var opts = {
    method: method,
    headers: { Authorization: "Bearer " + conf.token, "Notion-Version": "2022-06-28" },
    contentType: "application/json",
    muteHttpExceptions: true,
  };
  if (body) opts.payload = JSON.stringify(body);
  var res = UrlFetchApp.fetch("https://api.notion.com/v1" + path, opts);
  var data = JSON.parse(res.getContentText() || "{}");
  if (res.getResponseCode() >= 300) {
    var err = new Error(data.message || ("Notion " + res.getResponseCode()));
    err.status = res.getResponseCode();
    throw err;
  }
  return data;
}

// select / multi-select options of the database, cached 10 min
function notionOptions_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get("notion-options");
  if (hit) return JSON.parse(hit);
  var db = notion_("get", "/databases/" + notionConf_().db);
  var out = {};
  Object.keys(db.properties).forEach(function (name) {
    var p = db.properties[name];
    if (p.type === "select" || p.type === "multi_select") out[name] = p[p.type].options.map(function (o) { return o.name; });
  });
  cache.put("notion-options", JSON.stringify(out), 600);
  return out;
}

// Notion user id for an email, cached 10 min
function notionUserId_(email) {
  if (!email) return null;
  var cache = CacheService.getScriptCache();
  var hit = cache.get("notion-users");
  var map;
  if (hit) map = JSON.parse(hit);
  else {
    map = {};
    var cursor = null;
    do {
      var r = notion_("get", "/users?page_size=100" + (cursor ? "&start_cursor=" + cursor : ""));
      r.results.forEach(function (u) { if (u.type === "person" && u.person && u.person.email) map[u.person.email.toLowerCase()] = u.id; });
      cursor = r.has_more ? r.next_cursor : null;
    } while (cursor);
    cache.put("notion-users", JSON.stringify(map), 600);
  }
  return map[String(email).toLowerCase()] || null;
}

function richText_(text) {
  var out = [];
  for (var i = 0; i < text.length; i += 1900) out.push({ type: "text", text: { content: text.slice(i, i + 1900) } });
  return out;
}

function str_(v, max) { return typeof v === "string" ? v.slice(0, max || 2000) : ""; }
function list_(v) { return Array.isArray(v) ? v.filter(function (x) { return typeof x === "string"; }).slice(0, 30) : []; }
function isDate_(v) { return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v); }

// same mapping as buildProperties() in scripts/notion-bridge.mjs
function notionTaskProps_(t) {
  var options = notionOptions_();
  function pick(prop, value) {
    if (!options[prop] || options[prop].indexOf(value) < 0) throw new Error('"' + value + '" is not an option of "' + prop + '" in Notion');
    return value;
  }
  function multi(prop, values) { return values.map(function (v) { return { name: pick(prop, v) }; }); }

  var title = str_(t.title, 200).trim();
  if (!title) throw new Error("title is required");
  if (!isDate_(t.needBy) || !isDate_(t.useDate)) throw new Error("needBy/useDate must be YYYY-MM-DD");
  var credit = Number(t.useCredit);
  if (!isFinite(credit) || credit < 0) throw new Error("useCredit must be a number >= 0");

  var props = {
    Name: { title: [{ type: "text", text: { content: title } }] },
    Priority: { select: { name: pick("Priority", str_(t.priority, 20)) } },
    "Project Name": { multi_select: multi("Project Name", list_(t.projects)) },
    "Team Create": { multi_select: multi("Team Create", t.teamCreator ? [str_(t.teamCreator, 50)] : []) },
    Company: { multi_select: multi("Company", t.company ? [str_(t.company, 50)] : []) },
    "ประเภทของงาน": { multi_select: multi("ประเภทของงาน", list_(t.workTypes)) },
    "ชื่อเจ้าของงาน [ex. GP : Name]": { rich_text: richText_(str_(t.owner, 500)) },
    "Objective/วัตถุประสงค์ของชิ้นงาน": { rich_text: richText_(str_(t.objective, 6000)) },
    "สรุปจำนวนชิ้นงานทั้งหมดที่ต้องทำ (เพื่อความเข้าใจตรงกัน)": { rich_text: richText_(str_(t.summary, 6000)) },
    Description: { rich_text: richText_(str_(t.link, 6000)) },
    "Due (กำหนดส่งงาน)": { date: { start: t.needBy } },
    "วันที่ต้องใช้งานจริง": { date: { start: t.useDate } },
    Credit: { number: credit },
    Status: { status: { name: "Not Started" } },
    aiMove: { select: { name: "newTask" } }, // same trigger the Notion form sets
  };
  var uid = notionUserId_(str_(t.createdByEmail, 200) || str_(t.creatorEmail, 200));
  if (uid) props["Created by"] = { people: [{ id: uid }] };
  return props;
}

function createNotionTask_(t) {
  if (!t || typeof t.id !== "string") return { ok: false, error: "missing task id" };
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    // one Notion page per task, even if the button is pressed twice
    var store = PropertiesService.getScriptProperties();
    var done = store.getProperty("notion-task:" + t.id);
    if (done) return JSON.parse(done);
    var page = notion_("post", "/pages", { parent: { database_id: notionConf_().db }, properties: notionTaskProps_(t) });
    var result = { ok: true, id: page.id, url: page.url };
    store.setProperty("notion-task:" + t.id, JSON.stringify(result));
    return result;
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  } finally {
    lock.releaseLock();
  }
}

function notionStatuses_(ids) {
  var results = {};
  ids.forEach(function (id) {
    try {
      var page = notion_("get", "/pages/" + id);
      var st = page.properties && page.properties.Status && page.properties.Status.status;
      results[id] = { status: st ? st.name : null, inTrash: !!(page.in_trash || page.archived) };
    } catch (err) {
      results[id] = err.status === 404 ? { status: null, inTrash: false, notFound: true } : { status: null, inTrash: false, error: String(err.message) };
    }
  });
  return results;
}
