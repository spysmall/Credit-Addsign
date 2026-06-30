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
 * Sheet structure (tab ชื่อ "Credit Distribution"):
 *  A: month      (e.g. "2026-7")
 *  B: team_id    (e.g. "cb-mkt-perf")
 *  C: pct        (number)
 *  D: updated_at (ISO timestamp)
 */

var SHEET_NAME           = "Credit Distribution";
var NOTE_SHEET_NAME      = "Note Plan";
var REMAINING_SHEET_NAME = "Remaining";

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
  return sheet;
}

// GET ?month=2026-7              → [{team_id, pct}, ...]
// GET ?action=getNote&month=...  → {note: "..."}
function doGet(e) {
  var params = e.parameter || {};
  var month  = params.month || "";
  var action = params.action || "";

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

  if (body.action === "saveRemaining") {
    var rs   = getRemainingSheet();
    var rd   = rs.getDataRange().getValues();
    var now3 = new Date().toISOString();
    var rows = body.rows || [];

    // Index existing rows by month|priority|company|team → sheet row number, so
    // matching rows get updated in place instead of deleted + re-appended.
    var index = {};
    for (var i = 1; i < rd.length; i++) {
      var existingKey = rd[i][0] + "|" + rd[i][1] + "|" + rd[i][2] + "|" + rd[i][3];
      index[existingKey] = i + 1;
    }

    for (var m = 0; m < rows.length; m++) {
      var r = rows[m];
      var key = body.month + "|" + r.priority + "|" + r.company + "|" + r.team;
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
