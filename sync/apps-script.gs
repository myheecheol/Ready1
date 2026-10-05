/**
 * 주간학습 안내 — 기기 간 동기화용 Apps Script
 *
 * 1) 구글 스프레드시트를 새로 만들고, 확장 프로그램 → Apps Script를 열어요.
 * 2) Code.gs 내용을 모두 지우고 이 코드를 붙여넣어요.
 * 3) 아래 SECRET을 나만 아는 비밀번호로 바꾸고 저장해요. (앱 설정에 같은 값을 넣어요)
 * 4) 배포 → 새 배포 → 유형: 웹 앱, 실행: 나, 액세스 권한: 모든 사용자 → 배포
 * 5) 나온 웹 앱 주소(…/exec)를 앱 설정 → 기기 간 동기화에 붙여넣어요.
 *
 * 코드를 고친 뒤에는 배포 → 배포 관리 → 수정(연필) → 버전: 새 버전 → 배포 해야 반영돼요.
 */
const SECRET = '여기에-비밀번호를-적으세요';

const SHEET_NAME = 'data';
const CHUNK = 40000; // 셀 하나에 5만 자까지 들어가서, 긴 내용은 나눠 저장

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.getRange(1, 1, 1, 4).setValues([['id', 'updatedAt', 'deleted', 'json']]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function keyOk_(k) {
  return SECRET && SECRET !== '여기에-비밀번호를-적으세요' && k === SECRET;
}

/* 읽기: since(ms) 이후에 바뀐 문서만 돌려줌 */
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (!keyOk_(p.key)) return out_({ ok: false, error: 'key' });
  const since = Number(p.since || 0);
  const now = Date.now();
  const sh = sheet_();
  const last = sh.getLastRow();
  const rows = last > 1 ? sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues() : [];
  const docs = [];
  rows.forEach(function (r) {
    const t = Number(r[1]);
    if (!r[0] || !(t > since)) return;
    let data = null;
    if (r[2] !== true) {
      const json = r.slice(3).map(String).filter(function (s) { return s; }).map(function (s) { return s.slice(1); }).join('');
      try { data = JSON.parse(json); } catch (err) { return; }
    }
    docs.push({ id: String(r[0]), t: t, data: data });
  });
  return out_({ ok: true, now: now, docs: docs });
}

/* 쓰기: { key, ops: [{ id, data }] } — data가 null이면 삭제 표시 */
function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, error: 'bad_json' }); }
  if (!keyOk_(body.key)) return out_({ ok: false, error: 'key' });
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return out_({ ok: false, error: 'busy' });
  try {
    const sh = sheet_();
    const last = sh.getLastRow();
    const ids = last > 1 ? sh.getRange(2, 1, last - 1, 1).getValues().map(function (r) { return String(r[0]); }) : [];
    let t = Date.now();
    const ts = {};
    (body.ops || []).forEach(function (op) {
      const id = String(op.id || '');
      if (!/^[\w.:-]{1,100}$/.test(id)) return;
      t += 1;
      const json = op.data == null ? '' : JSON.stringify(op.data);
      const chunks = [];
      // 앞에 '|'를 붙여 시트가 수식(=…)이나 숫자로 바꾸지 않게 함
      for (let i = 0; i < json.length; i += CHUNK) chunks.push('|' + json.slice(i, i + CHUNK));
      let idx = ids.indexOf(id);
      if (idx < 0) { ids.push(id); idx = ids.length - 1; }
      const width = Math.max(4, 3 + chunks.length, sh.getLastColumn());
      if (width > sh.getMaxColumns()) sh.insertColumnsAfter(sh.getMaxColumns(), width - sh.getMaxColumns());
      const row = [id, t, op.data == null].concat(chunks);
      while (row.length < width) row.push('');
      sh.getRange(idx + 2, 1, 1, width).setValues([row]);
      ts[id] = t;
    });
    return out_({ ok: true, now: t, ts: ts });
  } finally {
    lock.releaseLock();
  }
}
