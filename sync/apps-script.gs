/**
 * 주간학습 안내 — 기기 간 동기화 + 학생·학부모 페이지용 Apps Script
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

const VERSION = 2;
const SHEET_NAME = 'data';
const CHUNK = 40000;      // 셀 하나에 5만 자까지 들어가서, 긴 내용은 나눠 저장
const PAST_WEEKS = 4;     // 학생 화면 '아직 안 한 것'에 보여 줄 지난 주 수
const MAX_FAILS = 5;      // 학생 비밀번호를 이만큼 틀리면
const LOCK_SECONDS = 600; // 이 시간(초) 동안 그 학생 로그인 막기

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

function rows_(sh) {
  const last = sh.getLastRow();
  return last > 1 ? sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues() : [];
}

function parseRow_(r) {
  if (r[2] === true) return null;
  const json = r.slice(3).map(String).filter(function (s) { return s; }).map(function (s) { return s.slice(1); }).join('');
  try { return JSON.parse(json); } catch (err) { return undefined; }
}

function readDoc_(rows, id) {
  for (let i = 0; i < rows.length; i++) if (String(rows[i][0]) === id) return parseRow_(rows[i]);
  return null;
}

function writeDoc_(sh, ids, id, data, t) {
  const json = data == null ? '' : JSON.stringify(data);
  const chunks = [];
  // 앞에 '|'를 붙여 시트가 수식(=…)이나 숫자로 바꾸지 않게 함
  for (let i = 0; i < json.length; i += CHUNK) chunks.push('|' + json.slice(i, i + CHUNK));
  let idx = ids.indexOf(id);
  if (idx < 0) { ids.push(id); idx = ids.length - 1; }
  const width = Math.max(4, 3 + chunks.length, sh.getLastColumn());
  if (width > sh.getMaxColumns()) sh.insertColumnsAfter(sh.getMaxColumns(), width - sh.getMaxColumns());
  const row = [id, t, data == null].concat(chunks);
  while (row.length < width) row.push('');
  sh.getRange(idx + 2, 1, 1, width).setValues([row]);
}

function ids_(sh) {
  const last = sh.getLastRow();
  return last > 1 ? sh.getRange(2, 1, last - 1, 1).getValues().map(function (r) { return String(r[0]); }) : [];
}

/* 날짜: 'yyyy-MM-dd' 문자열로만 계산(시간대 영향 없음) */
function todayKST_() { return Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd'); }
function addDays_(s, n) {
  const p = s.split('-').map(Number);
  const d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
  return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2);
}
function mondayOf_(s) {
  const p = s.split('-').map(Number);
  const wd = new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay();
  return addDays_(s, -((wd + 6) % 7));
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.mode === 'student') return studentView_();
  if (!keyOk_(p.key)) return out_({ ok: false, error: 'key' });
  /* 교사 앱 동기화: since(ms) 이후에 바뀐 문서만 */
  const since = Number(p.since || 0);
  const now = Date.now();
  const docs = [];
  rows_(sheet_()).forEach(function (r) {
    const t = Number(r[1]);
    if (!r[0] || !(t > since)) return;
    const data = parseRow_(r);
    if (data === undefined) return;
    docs.push({ id: String(r[0]), t: t, data: data });
  });
  return out_({ ok: true, version: VERSION, now: now, docs: docs });
}

/* 학생·학부모 화면: 교사 앱이 게시한 'pub'에서 이번 주·다음 주만 꺼내 줌 (메모·출결·비밀번호는 없음) */
function studentView_() {
  const rows = rows_(sheet_());
  const pub = readDoc_(rows, 'pub');
  if (!pub) return out_({ ok: false, error: 'not_published' });
  const today = todayKST_();
  const mon = mondayOf_(today), next = addDays_(mon, 7), from = addDays_(mon, -7 * PAST_WEEKS);
  const weeks = {};
  [mon, next].forEach(function (ws) { if (pub.weeks && pub.weeks[ws]) weeks[ws] = pub.weeks[ws]; });
  const items = (pub.items || []).filter(function (it) { return it.ws >= from && it.ws <= next; });
  const itemIds = {};
  items.forEach(function (it) { itemIds[it.ws + '-' + it.j] = it.id; });
  const checks = {};
  rows.forEach(function (r) {
    const id = String(r[0]);
    if (id.indexOf('c-') !== 0 || r[2] === true) return;
    const itemId = itemIds[id.slice(2, 14)];   // c-2026-10-05-0-학생ID
    if (!itemId) return;
    (checks[itemId] = checks[itemId] || []).push(id.slice(15));
  });
  return out_({ ok: true, version: VERSION, today: today, thisWeek: mon, nextWeek: next,
    className: pub.className, students: pub.students || [], weeks: weeks, items: items, checks: checks, publishedAt: pub.at || 0 });
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, error: 'bad_json' }); }
  if (body.mode === 'login' || body.mode === 'check') return studentPost_(body);
  if (!keyOk_(body.key)) return out_({ ok: false, error: 'key' });
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return out_({ ok: false, error: 'busy' });
  try {
    const sh = sheet_();
    const ids = ids_(sh);
    let t = Date.now();
    const ts = {};
    (body.ops || []).forEach(function (op) {
      const id = String(op.id || '');
      if (!/^[\w.:-]{1,100}$/.test(id)) return;
      t += 1;
      writeDoc_(sh, ids, id, op.data, t);
      ts[id] = t;
    });
    return out_({ ok: true, now: t, ts: ts });
  } finally {
    lock.releaseLock();
  }
}

/* 학생 로그인·체크: 번호(학생ID) + 비밀번호 확인, 확정(잠금)된 항목은 못 바꿈 */
function studentPost_(body) {
  const sid = String(body.sid || '');
  if (!/^[\w-]{1,40}$/.test(sid)) return out_({ ok: false, error: 'student' });
  const cache = CacheService.getScriptCache();
  const failKey = 'fail-' + sid;
  const fails = Number(cache.get(failKey) || 0);
  if (fails >= MAX_FAILS) return out_({ ok: false, error: 'locked_out' });
  const rows = rows_(sheet_());
  const cfg = readDoc_(rows, 'config');
  const st = cfg && cfg.settings && (cfg.settings.students || []).filter(function (s) { return s.id === sid; })[0];
  if (!st || !st.pin || String(st.pin) !== String(body.pin || '')) {
    cache.put(failKey, String(fails + 1), LOCK_SECONDS);
    return out_({ ok: false, error: st && !st.pin ? 'no_pin' : 'pin', left: MAX_FAILS - fails - 1 });
  }
  cache.remove(failKey);
  if (body.mode === 'login') return out_({ ok: true, name: st.name });

  const pub = readDoc_(rows, 'pub');
  const item = pub && (pub.items || []).filter(function (it) { return it.id === body.item; })[0];
  if (!item) return out_({ ok: false, error: 'no_item' });
  const today = todayKST_(), mon = mondayOf_(today);
  if (item.ws < addDays_(mon, -7 * PAST_WEEKS) || item.ws > addDays_(mon, 7)) return out_({ ok: false, error: 'no_item' });
  if (item.locked) return out_({ ok: false, error: 'locked' });

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return out_({ ok: false, error: 'busy' });
  try {
    const sh = sheet_();
    const t = Date.now();
    writeDoc_(sh, ids_(sh), 'c-' + item.ws + '-' + item.j + '-' + sid, body.value ? { v: 1, by: 'student' } : null, t);
    return out_({ ok: true, t: t });
  } finally {
    lock.releaseLock();
  }
}
