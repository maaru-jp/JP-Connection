// 複製此檔案內容到 Google Apps Script 編輯器，並將 SPREADSHEET_ID 改為你的試算表 ID
// 詳見 GoogleAppsScript.md

const SPREADSHEET_ID = '你的試算表ID';

// 依開團日、結團日與現在時間，決定回傳給前台的 status（試算表不改寫，僅覆寫 API 回傳）
// 開團日「中午 12:00（UTC）」起為正在開團；之前為即將開團；結團日後為已結團
function resolveStatusForApi(sheetStatus, startDate, endDate) {
  var now = new Date();

  if (startDate !== undefined && startDate !== null && String(startDate).trim() !== '') {
    var start = new Date(startDate);
    if (!isNaN(start.getTime())) {
      var ys = start.getUTCFullYear(), ms = start.getUTCMonth(), ds = start.getUTCDate();
      var startNoonUtc = new Date(Date.UTC(ys, ms, ds, 12, 0, 0, 0));
      if (now < startNoonUtc) return 'upcoming';
    }
  }

  var todayUtc = now.getUTCFullYear() * 10000 + now.getUTCMonth() * 100 + now.getUTCDate();
  if (endDate !== undefined && endDate !== null && String(endDate).trim() !== '') {
    var end = new Date(endDate);
    if (!isNaN(end.getTime())) {
      var endUtc = end.getUTCFullYear() * 10000 + end.getUTCMonth() * 100 + end.getUTCDate();
      if (todayUtc > endUtc) return 'ended';
    }
  }

  var s = String(sheetStatus || '').trim();
  if (s === 'upcoming' || s === '即將開團') return 'upcoming';
  if (s === 'ended' || s === '已結團') return 'ended';
  return 'ongoing';
}

// 只解析「表單格式」action=val&key=val，絕不把這類字串送進 JSON.parse
function parseFormBody(e) {
  var p = {};
  if (!e || typeof e !== 'object') return p;
  if (e.parameter && typeof e.parameter === 'object') {
    for (var k in e.parameter) if (e.parameter.hasOwnProperty(k)) p[k] = e.parameter[k];
  }
  if (!e.postData || !e.postData.contents) return p;
  var raw = String(e.postData.contents);
  var firstChar = raw.trim().charAt(0);
  if (firstChar === '{' || firstChar === '[') {
    try {
      var j = JSON.parse(raw);
      if (j.action === 'append' && j.row) return { action: 'append', row: j.row };
    } catch (err) {}
    return p;
  }
  if (raw.indexOf('=') === -1 || raw.indexOf('&') === -1) return p;
  var parts = raw.split('&');
  for (var i = 0; i < parts.length; i++) {
    var pair = parts[i].split('=');
    var key = decodeURIComponent(String(pair[0] || '').replace(/\+/g, ' '));
    var val = decodeURIComponent(String(pair[1] || '').replace(/\+/g, ' '));
    p[key] = val;
  }
  return p;
}

function doPost(e) {
  try {
    e = e || {};
    if (!SPREADSHEET_ID || SPREADSHEET_ID === '你的試算表ID') {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: '請在程式碼中設定 SPREADSHEET_ID 為你的試算表 ID' })).setMimeType(ContentService.MimeType.JSON);
    }
    var p = parseFormBody(e);
    if (String(p.action) === 'update') {
      var rowIndex = parseInt(p.rowIndex, 10);
      if (isNaN(rowIndex) || rowIndex < 2) {
        return ContentService.createTextOutput(JSON.stringify({ ok: false, error: '請提供有效的 rowIndex（從 2 起）' })).setMimeType(ContentService.MimeType.JSON);
      }
      var progressStr = p.progress || '[]';
      var values = [
        p.title || '',
        p.imageUrl || '',
        p.badge || '',
        p.startDate || '',
        p.endDate || '',
        p.registeredCount || '',
        p.status || '',
        progressStr,
        p.countdownTo || '',
        p.expectedShipDate || '',
        p.shipDelayDays !== undefined && p.shipDelayDays !== null && p.shipDelayDays !== '' ? String(p.shipDelayDays) : '',
        new Date().toISOString()
      ];
      var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      var sheet = ss.getSheets()[0];
      var lastRow = sheet.getLastRow();
      if (rowIndex > lastRow) {
        return ContentService.createTextOutput(JSON.stringify({ ok: false, error: '該列不存在' })).setMimeType(ContentService.MimeType.JSON);
      }
      sheet.getRange(rowIndex, 1, rowIndex, values.length).setValues([values]);
      return ContentService.createTextOutput(JSON.stringify({ ok: true, message: '已更新試算表第 ' + rowIndex + ' 列' })).setMimeType(ContentService.MimeType.JSON);
    }
    if (String(p.action) === 'append') {
      var progressStr = p.progress || '[]';
      var values = [
        p.title || '',
        p.imageUrl || '',
        p.badge || '',
        p.startDate || '',
        p.endDate || '',
        p.registeredCount || '',
        p.status || '',
        progressStr,
        p.countdownTo || '',
        p.expectedShipDate || '',
        p.shipDelayDays !== undefined && p.shipDelayDays !== null && p.shipDelayDays !== '' ? String(p.shipDelayDays) : '',
        new Date().toISOString()
      ];
      var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      var sheet = ss.getSheets()[0];
      sheet.appendRow(values);
      var rows = sheet.getLastRow();
      return ContentService.createTextOutput(JSON.stringify({ ok: true, sheetName: sheet.getName(), rows: rows, message: '已寫入試算表「' + sheet.getName() + '」，目前共 ' + rows + ' 列（含標題）' })).setMimeType(ContentService.MimeType.JSON);
    }
    if (p.row) {
      var row = typeof p.row === 'object' ? p.row : null;
      if (!row && typeof p.row === 'string') try { row = JSON.parse(p.row); } catch (err) {}
      if (row && row.title !== undefined) {
        var progressStr = JSON.stringify(row.progress || []);
        var values = [
          row.title || '', row.imageUrl || '', row.badge || '', row.startDate || '', row.endDate || '',
          row.registeredCount !== undefined && row.registeredCount !== null ? String(row.registeredCount) : '',
          row.status || '', progressStr, row.countdownTo || '', row.expectedShipDate || '',
          row.shipDelayDays !== undefined && row.shipDelayDays !== null && row.shipDelayDays !== '' ? String(row.shipDelayDays) : '',
          new Date().toISOString()
        ];
        var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheets()[0];
        sheet.appendRow(values);
        return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
      }
    }
    var raw = (e.postData && e.postData.contents) ? String(e.postData.contents) : '';
    if (raw.trim().charAt(0) === '{') {
      try {
        var params = JSON.parse(raw);
        if (params.action === 'append' && params.row) {
          var row = params.row;
          var progressStr = JSON.stringify(row.progress || []);
          var values = [
            row.title || '', row.imageUrl || '', row.badge || '', row.startDate || '', row.endDate || '',
            row.registeredCount !== undefined && row.registeredCount !== null ? String(row.registeredCount) : '',
            row.status || '', progressStr, row.countdownTo || '', row.expectedShipDate || '',
            row.shipDelayDays !== undefined && row.shipDelayDays !== null && row.shipDelayDays !== '' ? String(row.shipDelayDays) : '',
            new Date().toISOString()
          ];
          var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheets()[0];
          sheet.appendRow(values);
          return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
        }
      } catch (err) {}
    }
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'invalid action or no data' })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err.message) })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  try {
    var ee = e || {};
    var params = ee.parameter || {};
    if (params.action === 'test') {
      if (!SPREADSHEET_ID || SPREADSHEET_ID === '你的試算表ID') {
        return ContentService.createTextOutput(JSON.stringify({ ok: false, error: '請設定 SPREADSHEET_ID' })).setMimeType(ContentService.MimeType.JSON);
      }
      var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      var sheet = ss.getSheets()[0];
      var rows = sheet.getLastRow() || 0;
      return ContentService.createTextOutput(JSON.stringify({ ok: true, message: 'Apps Script 連線正常', sheetName: sheet.getName(), rows: rows })).setMimeType(ContentService.MimeType.JSON);
    }
    var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheets()[0];
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
    var headers = data[0];
    var rows = data.slice(1);
    var list = rows.map(function (row, i) {
      var id = 'row-' + (i + 2);
      var progress = [];
      try {
        progress = JSON.parse(row[7] || '[]');
      } catch (e) {}
      var rc = row[5];
      var registeredCount = (rc === '' || rc === undefined || rc === null) ? null : (parseInt(rc, 10) || 0);
      var sheetStatus = row[6] || 'ongoing';
      var status = resolveStatusForApi(sheetStatus, row[3], row[4]);
      var rawCountdown = row[8];
      var countdownTo = null;
      if (rawCountdown != null && rawCountdown !== '') {
        if (typeof rawCountdown === 'object' && rawCountdown.getTime) {
          countdownTo = rawCountdown.toISOString ? rawCountdown.toISOString() : String(rawCountdown);
        } else {
          countdownTo = String(rawCountdown).trim() || null;
        }
      }
      var expectedShipDate = null;
      var shipDelayDays = null;
      var rawListedAt = null;
      if (row.length > 11) {
        var rawShip = row[9];
        if (rawShip != null && rawShip !== '') {
          if (typeof rawShip === 'object' && rawShip.getTime) {
            expectedShipDate = rawShip.toISOString ? rawShip.toISOString().split('T')[0] : String(rawShip).trim();
          } else if (typeof rawShip === 'number') {
            var shipD = new Date((rawShip - 25569) * 86400 * 1000);
            if (!isNaN(shipD.getTime())) {
              var sm = shipD.getMonth() + 1, sd = shipD.getDate();
              expectedShipDate = shipD.getFullYear() + '-' + (sm < 10 ? '0' : '') + sm + '-' + (sd < 10 ? '0' : '') + sd;
            }
          } else {
            expectedShipDate = String(rawShip).trim() || null;
          }
        }
        var rawDelay = row[10];
        if (rawDelay !== undefined && rawDelay !== null && rawDelay !== '') {
          shipDelayDays = parseInt(String(rawDelay).trim(), 10);
          if (isNaN(shipDelayDays)) shipDelayDays = null;
        }
        rawListedAt = row[11];
      } else if (row.length > 10) {
        var rawShip = row[9];
        if (rawShip != null && rawShip !== '') {
          if (typeof rawShip === 'object' && rawShip.getTime) {
            expectedShipDate = rawShip.toISOString ? rawShip.toISOString().split('T')[0] : String(rawShip).trim();
          } else if (typeof rawShip === 'number') {
            var shipD2 = new Date((rawShip - 25569) * 86400 * 1000);
            if (!isNaN(shipD2.getTime())) {
              var sm2 = shipD2.getMonth() + 1, sd2 = shipD2.getDate();
              expectedShipDate = shipD2.getFullYear() + '-' + (sm2 < 10 ? '0' : '') + sm2 + '-' + (sd2 < 10 ? '0' : '') + sd2;
            }
          } else {
            expectedShipDate = String(rawShip).trim() || null;
          }
        }
        rawListedAt = row[10];
      }
      if (rawListedAt === null && row.length > 9) rawListedAt = row[9];
      var listedAt = null;
      if (rawListedAt != null && rawListedAt !== '') {
        if (typeof rawListedAt === 'object' && rawListedAt.getTime) {
          listedAt = rawListedAt.toISOString ? rawListedAt.toISOString() : String(rawListedAt);
        } else {
          listedAt = String(rawListedAt).trim() || null;
        }
      }
      return {
        id: id,
        title: row[0],
        imageUrl: row[1] || null,
        badge: row[2] || 'hot',
        startDate: row[3],
        endDate: row[4],
        registeredCount: registeredCount,
        status: status,
        progress: progress,
        countdownTo: countdownTo,
        expectedShipDate: expectedShipDate,
        shipDelayDays: shipDelayDays,
        listedAt: listedAt
      };
    });
    return ContentService.createTextOutput(JSON.stringify(list)).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
  }
}
