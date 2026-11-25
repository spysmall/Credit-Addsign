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

// Every request is a POST carrying a Firebase ID token (see "Security" below); GET is closed.
function doGet() {
  return json_({ ok: false, error: "unauthenticated" });
}

// POST body: { month, teams }           → save distribution %
// POST body: { action:"saveNote", month, note } → save note
// POST body: { action:"saveRemaining", month, rows } → save remaining-credit snapshot
function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: "bad request" }); }

  // who is calling: a verified Google account on the allowlist, else nothing happens
  var me = caller_(body.token);
  if (!me) return json_({ ok: false, error: "unauthenticated" });
  var admin = SUPER_ADMINS.indexOf(me) >= 0;
  if (!admin && !isAllowed_(me)) return json_({ ok: false, error: "forbidden" });

  // POST { action:"csv", sheet:<key> } → { ok, csv } — one whitelisted tab, read with the owner's access
  if (body.action === "csv") {
    if (!SHEETS.hasOwnProperty(body.sheet)) return json_({ ok: false, error: "unknown sheet" });
    try { return json_({ ok: true, csv: cachedCsv_(body.sheet) }); }
    catch (err) { return json_({ ok: false, error: String(err.message || err) }); }
  }

  if (body.action === "notionStatus") {
    var ids = (Array.isArray(body.ids) ? body.ids : []).map(function (x) { return String(x).replace(/-/g, ""); })
      .filter(function (x) { return /^[0-9a-f]{32}$/i.test(x); }).slice(0, 50);
    try { return json_({ results: notionStatuses_(ids) }); }
    catch (err) { return json_({ error: String(err.message || err) }); }
  }

  if (body.action === "designerLoad") {
    try { return json_({ results: designerLoad_() }); }
    catch (err) { return json_({ error: String(err.message || err) }); }
  }

  // credit plan, notes and the remaining snapshot change everyone's numbers → super admin only
  if (!admin && (body.action === "saveRemaining" || body.action === "saveNote" || !body.action)) {
    return json_({ ok: false, error: "forbidden" });
  }

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
    forgetCsv_("note");
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
  forgetCsv_("dist");

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

// Notion user id for an email, cached 10 min.
// Notion's /users lists only workspace members (guests are missing), so the member sheet fills the rest.
function notionUserId_(email) {
  if (!email) return null;
  var cache = CacheService.getScriptCache();
  var hit = cache.get("notion-users");
  var map;
  if (hit) map = JSON.parse(hit);
  else {
    map = {};
    try {
      var rows = sheetValues_("members"); // "User ID Notion - Out Team in Media": อีเมล + Notion User ID
      var h = rows[0] || [];
      var ei = -1, ii = -1;
      h.forEach(function (x, i) {
        var s = String(x).trim();
        if (ei < 0 && /^(อีเมล|email)/i.test(s)) ei = i;
        if (/^notion user id$/i.test(s)) ii = i;
      });
      if (ei >= 0 && ii >= 0) rows.slice(1).forEach(function (r) {
        var e = String(r[ei] || "").trim().toLowerCase(), id = String(r[ii] || "").trim();
        if (e.indexOf("@") > 0 && /^[0-9a-f-]{32,36}$/i.test(id)) map[e] = id;
      });
    } catch (err) { /* sheet unreachable: Notion's own list below still works */ }
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
  // ผู้รับผิดชอบ (Multimedia designer): by e-mail, else the id from the member list
  var aid = notionUserId_(str_(t.assigneeEmail, 200)) || (/^[0-9a-f-]{32,36}$/i.test(str_(t.assigneeNotionId, 40)) ? t.assigneeNotionId : null);
  if (aid) props["Assignee"] = { people: [{ id: aid }] };
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

// Each Notion Assignee's queue: unfinished tasks and the latest due date among them, cached 2 min
function designerLoad_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get("designer-load");
  if (hit) return JSON.parse(hit);
  var db = notionConf_().db, out = {}, cursor = null;
  do {
    var body = { page_size: 100, filter: { or: ["Not Started", "Open", "In Progress"].map(function (s) { return { property: "Status", status: { equals: s } }; }) } };
    if (cursor) body.start_cursor = cursor;
    var r = notion_("post", "/databases/" + db + "/query", body);
    r.results.forEach(function (p) {
      var people = (p.properties && p.properties.Assignee && p.properties.Assignee.people) || [];
      var d = p.properties && p.properties["Due (กำหนดส่งงาน)"] && p.properties["Due (กำหนดส่งงาน)"].date;
      var due = d ? String(d.end || d.start).slice(0, 10) : null;
      people.forEach(function (u) {
        var q = out[u.id] || (out[u.id] = { open: 0, lastDue: null });
        q.open++;
        if (due && (!q.lastDue || due > q.lastDue)) q.lastDue = due;
      });
    });
    cursor = r.has_more ? r.next_cursor : null;
  } while (cursor);
  cache.put("designer-load", JSON.stringify(out), 120);
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Firebase: copy the allowlist (users sheet → column Email) into Firestore "allowedUsers", which
// firestore.rules checks before anyone may read or write requests. Runs every hour.
//
// Setup (once): put lib/appsscript.json in the project (Project Settings → "Show appsscript.json",
// then paste), run installAllowedUsersTrigger() once from the editor and approve the permissions.
// ─────────────────────────────────────────────────────────────────────────────

var FIREBASE_PROJECT = "mm-credit-addsign";

function installAllowedUsersTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "syncAllowedUsers") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("syncAllowedUsers").timeBased().everyHours(1).create();
  syncAllowedUsers();
}

function syncAllowedUsers() {
  var rows = sheetValues_("users");
  var head = rows[0] || [];
  var col = function (re) { for (var i = 0; i < head.length; i++) if (re.test(String(head[i]).trim())) return i; return -1; };
  var emailIdx = col(/^email/i), nickIdx = col(/^ชื่อเล่น$/), teamIdx = col(/^(ทีม|team)$/i);
  if (emailIdx < 0) throw new Error("users sheet has no Email column");

  var wanted = {};
  for (var r = 1; r < rows.length; r++) {
    var email = String(rows[r][emailIdx] || "").trim().toLowerCase();
    if (email.indexOf("@") < 0) continue;
    wanted[email] = {
      name: nickIdx >= 0 ? String(rows[r][nickIdx] || "").trim() : "",
      team: teamIdx >= 0 ? String(rows[r][teamIdx] || "").trim() : "",
    };
  }
  // a broken sheet must not lock everyone out
  if (Object.keys(wanted).length === 0) throw new Error("users sheet returned no emails — nothing synced");

  var base = "projects/" + FIREBASE_PROJECT + "/databases/(default)/documents";
  var api = "https://firestore.googleapis.com/v1/";
  var headers = { Authorization: "Bearer " + ScriptApp.getOAuthToken() };

  // what is there now
  var existing = {};
  var pageToken = "";
  do {
    var res = UrlFetchApp.fetch(api + base + "/allowedUsers?pageSize=300&mask.fieldPaths=name" + (pageToken ? "&pageToken=" + pageToken : ""),
      { headers: headers, muteHttpExceptions: true });
    if (res.getResponseCode() >= 300) throw new Error("Firestore list: " + res.getContentText());
    var page = JSON.parse(res.getContentText() || "{}");
    (page.documents || []).forEach(function (d) { existing[decodeURIComponent(d.name.split("/").pop())] = true; });
    pageToken = page.nextPageToken || "";
  } while (pageToken);

  // upsert everyone on the sheet, delete everyone who left it
  var now = new Date().toISOString();
  var writes = [];
  Object.keys(wanted).forEach(function (email) {
    writes.push({ update: {
      name: base + "/allowedUsers/" + email,
      fields: { email: { stringValue: email }, name: { stringValue: wanted[email].name }, team: { stringValue: wanted[email].team }, updatedAt: { stringValue: now } },
    } });
  });
  Object.keys(existing).forEach(function (email) {
    if (!wanted[email]) writes.push({ "delete": base + "/allowedUsers/" + email });
  });
  for (var i = 0; i < writes.length; i += 400) {
    var commit = UrlFetchApp.fetch(api + base + ":commit", {
      method: "post", contentType: "application/json", headers: headers, muteHttpExceptions: true,
      payload: JSON.stringify({ writes: writes.slice(i, i + 400) }),
    });
    if (commit.getResponseCode() >= 300) throw new Error("Firestore commit: " + commit.getContentText());
  }
  Logger.log("allowedUsers synced: " + Object.keys(wanted).length + " emails");
}


// ─────────────────────────────────────────────────────────────────────────────
// Security: the site sends the signed-in person's Firebase ID token with every request.
// Google checks the token (accounts:lookup), then the e-mail must be on the users sheet allowlist.
// The sheets themselves can then be shared with nobody: this script reads them as the owner.
// ─────────────────────────────────────────────────────────────────────────────

var FIREBASE_API_KEY = "AIzaSyBQmJXDLBcsIciI3LqFE0PYkqprnKFxJ8c"; // public web key (same as lib/firebase.ts)
var SUPER_ADMINS = ["pattrawutthippapart@gmail.com"];              // same as lib/assignSession.ts

// e-mail of the token's owner (lower-case), or null when the token is missing, forged or expired
function caller_(token) {
  if (typeof token !== "string" || token.length < 100 || token.length > 4096) return null;
  var cache = CacheService.getScriptCache();
  var key = "idt:" + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token));
  var hit = cache.get(key);
  if (hit) return hit === "-" ? null : hit;
  var res = UrlFetchApp.fetch("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + FIREBASE_API_KEY, {
    method: "post", contentType: "application/json", payload: JSON.stringify({ idToken: token }), muteHttpExceptions: true,
  });
  var email = null;
  if (res.getResponseCode() === 200) {
    var u = (JSON.parse(res.getContentText() || "{}").users || [])[0];
    if (u && u.email && u.emailVerified) email = String(u.email).trim().toLowerCase();
  }
  cache.put(key, email || "-", email ? 300 : 60); // ID tokens live 1 h; re-check every 5 min
  return email;
}

// the users sheet's "Email" column, cached 5 min
function isAllowed_(email) {
  var cache = CacheService.getScriptCache();
  var hit = cache.get("allowed-emails");
  var set;
  if (hit) set = JSON.parse(hit);
  else {
    set = {};
    var rows = sheetValues_("users"), head = rows[0] || [], ei = -1;
    for (var i = 0; i < head.length; i++) if (/^email/i.test(String(head[i]).trim())) { ei = i; break; }
    if (ei >= 0) rows.slice(1).forEach(function (r) {
      var e = String(r[ei] || "").trim().toLowerCase();
      if (e.indexOf("@") > 0) set[e] = 1;
    });
    try { cache.put("allowed-emails", JSON.stringify(set), 300); } catch (err) { /* too big to cache: read again next time */ }
  }
  return !!set[email];
}

// The only tabs the site may read (key → spreadsheet + tab). Anything else is refused.
var SHEETS = {
  users:     { id: "1nHjuzBhl3cNjuAhVMzpylW5CQuT9PggzRsoNL-m0JXU", gid: 1388053801 }, // User ID Discord - Out Team (allowlist)
  members:   { id: "1nHjuzBhl3cNjuAhVMzpylW5CQuT9PggzRsoNL-m0JXU", gid: 445999363 },  // User ID Notion - Out Team in Media
  discord:   { id: "1nHjuzBhl3cNjuAhVMzpylW5CQuT9PggzRsoNL-m0JXU", gid: 1381351958 }, // [New] User ID Discord
  allTask:   { id: "1b1snrd3X-mM1lhoI_qOgEVX8UG49RKzhTXneFyeW4oY", name: "[sum] All Task(in Notion)" },
  taskUsage: { id: "1b1snrd3X-mM1lhoI_qOgEVX8UG49RKzhTXneFyeW4oY", gid: 1206331278 },
  dist:      { id: "1b1snrd3X-mM1lhoI_qOgEVX8UG49RKzhTXneFyeW4oY", name: "Credit Distribution" },
  note:      { id: "1b1snrd3X-mM1lhoI_qOgEVX8UG49RKzhTXneFyeW4oY", name: "Note Plan" },
  webTasks:  { id: "1b1snrd3X-mM1lhoI_qOgEVX8UG49RKzhTXneFyeW4oY", name: "Web Tasks" },
  leave:     { id: "1jIzyt15EL5DaODqTG-e7D2pSWbsqETG6gsq60yhR_zY", name: "leave" },
  price:     { id: "1kLSiFsWjUO51agYd3rtpRjviL1S4zO6YYl12tV5zgXE", gid: 338340518 },
};

// the tab's cells as shown in the sheet ([] when the tab is gone)
function sheetValues_(key) {
  var s = SHEETS[key], ss = SpreadsheetApp.openById(s.id), sh = null;
  if (s.name) sh = ss.getSheetByName(s.name);
  else ss.getSheets().forEach(function (x) { if (x.getSheetId() === s.gid) sh = x; });
  return sh ? sh.getDataRange().getDisplayValues() : [];
}

// every field quoted, like the public gviz CSV the site used to read
function toCsv_(rows) {
  return rows.map(function (r) {
    return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(",");
  }).join("\n");
}

// a tab as CSV, cached 60 s in pieces (a cache entry holds at most 100 KB)
function cachedCsv_(key) {
  var cache = CacheService.getScriptCache(), n = Number(cache.get("csv:" + key) || 0);
  if (n > 0) {
    var keys = [];
    for (var i = 0; i < n; i++) keys.push("csv:" + key + ":" + i);
    var got = cache.getAll(keys);
    if (Object.keys(got).length === n) return keys.map(function (k) { return got[k]; }).join("");
  }
  var csv = toCsv_(sheetValues_(key)), parts = {}, size = 25000, count = 0;
  for (var j = 0; j < csv.length; j += size) parts["csv:" + key + ":" + count++] = csv.slice(j, j + size);
  try { cache.putAll(parts, 60); cache.put("csv:" + key, String(count), 60); } catch (err) { /* too big: serve uncached */ }
  return csv;
}

function forgetCsv_(key) { CacheService.getScriptCache().remove("csv:" + key); }

// Run once from the editor while the sheets are still public: compares what the site will now get
// with the public gviz CSV it used to read, tab by tab. Look at the Execution log.
function selfTestCsv() {
  Object.keys(SHEETS).forEach(function (key) {
    var s = SHEETS[key];
    var url = "https://docs.google.com/spreadsheets/d/" + s.id + "/gviz/tq?tqx=out:csv&" + (s.name ? "sheet=" + encodeURIComponent(s.name) : "gid=" + s.gid);
    var mine = Utilities.parseCsv(toCsv_(sheetValues_(key)));
    var theirs;
    try { theirs = Utilities.parseCsv(UrlFetchApp.fetch(url).getContentText()); } catch (err) { Logger.log(key + ": gviz unreachable (" + err + ")"); return; }
    var diffs = [];
    for (var r = 0; r < Math.max(mine.length, theirs.length) && diffs.length < 5; r++) {
      var a = mine[r] || [], b = theirs[r] || [];
      for (var c = 0; c < Math.max(a.length, b.length) && diffs.length < 5; c++) {
        if (String(a[c] || "") !== String(b[c] || "")) diffs.push("row " + (r + 1) + " col " + (c + 1) + ": new=" + JSON.stringify(a[c] || "") + " old=" + JSON.stringify(b[c] || ""));
      }
    }
    Logger.log(key + ": " + mine.length + " rows (gviz " + theirs.length + ")" + (diffs.length ? "\n  " + diffs.join("\n  ") : " — same"));
  });
}
