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

var SHEET_NAME = "Credit Distribution";

function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(["month", "team_id", "pct", "updated_at"]);
  }
  return sheet;
}

// GET ?month=2026-7 → [{team_id, pct}, ...]
function doGet(e) {
  var month = (e.parameter && e.parameter.month) ? e.parameter.month : "";
  var sheet = getSheet();
  var data = sheet.getDataRange().getValues();
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

// POST body: { month: "2026-7", teams: [{id, pct}, ...] }
function doPost(e) {
  var body = JSON.parse(e.postData.contents);
  var month = body.month;
  var teams = body.teams;
  var sheet = getSheet();
  var data = sheet.getDataRange().getValues();

  // Delete existing rows for this month (bottom to top)
  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]) === month) {
      sheet.deleteRow(i + 1);
    }
  }

  // Append updated rows
  var now = new Date().toISOString();
  for (var j = 0; j < teams.length; j++) {
    sheet.appendRow([month, teams[j].id, teams[j].pct, now]);
  }

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
