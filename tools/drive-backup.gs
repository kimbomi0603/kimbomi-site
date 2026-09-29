/**
 * 김보미.com 기록 → 구글 드라이브 자동 보관 (Google Apps Script)
 * 2026-09-29 신설. 저장소 사본: kimbomi-site/tools/drive-backup.gs
 *
 * 하는 일
 *   한 시간마다 김보미.com 에 쌓인 기록을 읽어, 이 스크립트가 있는 드라이브 폴더
 *   「김보미닷컴 기록 보관」의 스프레드시트 「김보미닷컴 기록 보관」에 탭별로 덧붙인다.
 *   한 번 들어간 줄은 지우지 않는다(사이트에서 지운 제보·게시물도 여기에는 남는다).
 *   대상: AI 봄이·더불이·재정 도우미 대화 / 제보센터 / 생각 나누기 / 서명 / 후원 약정 /
 *         이생망 공유방 / 명예의 전당 / 시민 의견 수집 / 더불이 지식자료 / 김보미생각 글
 *
 * 처음 한 번만 (2분)
 *   1) 왼쪽 톱니바퀴(프로젝트 설정) → 맨 아래 「스크립트 속성」 → 「스크립트 속성 추가」
 *        속성: ADMIN_KEY    값: 김보미.com 관리자 비밀키
 *   2) 위쪽 함수 목록에서 setup 을 고르고 ▶실행 → 권한 승인(본인 구글 계정)
 *   끝. 그 뒤로는 매시간 자동으로 돈다. 관리자 키를 바꾸면 1)의 값도 바꿔 주세요.
 *
 * 원칙
 *   · 사이트에서 받은 값만 그대로 적는다. 값을 만들거나 고치지 않는다.
 *   · 관리자 키는 스크립트 속성에만 둔다(코드·시트에 적지 않는다).
 *   · 셀 한 칸은 5만 자가 한도라, 그보다 긴 글(지식자료 등)은 잘렸다고 표시한다.
 */
var SITE = 'https://www.xn--4k0b53xuva.com';
var FOLDER_ID = '1dKXD-pzXt1w0rC9mWOYMowgjuI-S4KpB';   // 「김보미닷컴 기록 보관」 폴더
var BOOK_NAME = '김보미닷컴 기록 보관';
var P = PropertiesService.getScriptProperties();

function t_(v) {
  if (v === undefined || v === null || v === '') return '';
  var d = (typeof v === 'number') ? new Date(v) : new Date(String(v));
  return isNaN(d.getTime()) ? String(v) : Utilities.formatDate(d, 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
}
function c_(s) {   /* 셀에 넣을 글: 수식으로 읽히지 않게, 5만 자 한도 표시 */
  if (s === undefined || s === null) return '';
  if (typeof s !== 'string') s = (typeof s === 'object') ? JSON.stringify(s) : String(s);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s.length > 49000 ? s.slice(0, 49000) + ' …[셀 한도로 여기서 잘림 — 전문은 관리자 화면]' : s;
}
function md5_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, s, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
}
function strip_(x) { var o = {}; for (var k in x) if (k !== '_raw') o[k] = x[k]; return o; }

var CHAT_COLS = ['시각', '대화번호', '보던 페이지', '질문', '답변', '답변 실패', '모델'];
function chatRow_(x) { return [t_(x.ts), x.sid, x.page, x.q, x.a, x.fail ? '예' : '', x.model]; }

var SETS = [
  { tab: 'AI 봄이 대화', chat: 'bomi' },
  { tab: '더불이 대화', chat: 'dobuli' },
  { tab: '재정 도우미 대화', chat: 'fin' },
  { tab: '제보센터', url: '/api/admin?action=reportlist', cols: ['접수 시각', '분류', '내용', '지역', '연락 방법', 'id'],
    row: function (x) { return [t_(x.ts), x.category, x.content, x.region, x.contact, x.id]; }, key: function (x) { return 'r' + x.id; } },
  { tab: '생각 나누기', url: '/api/admin?action=thoughts', cols: ['작성 시각', '이름', '지역', '내용'],
    row: function (x) { return [t_(x.date), x.name, x.region, x.msg]; }, key: function (x) { return md5_(x._raw || JSON.stringify(x)); } },
  { tab: '서명', url: '/api/admin?action=signlist', cols: ['서명 시각', '이름', '지역', '이메일', '소식 수신 동의', '가처분 연명'],
    row: function (x) { return [t_(x.ts), x.name, x.region, x.email, x.news ? '동의' : '', x.injunction ? '예' : '']; }, key: function (x) { return md5_(x._raw || JSON.stringify(x)); } },
  { tab: '후원 약정', url: '/api/admin?action=pledgelist', cols: ['시각', '이름', '이메일', '인스타그램'],
    row: function (x) { return [t_(x.ts), x.name, x.email, x.instagram]; }, key: function (x) { return md5_(x._raw || JSON.stringify(x)); } },
  { tab: '이생망 공유방', url: '/api/stories?action=all', cols: ['작성 시각', '방', '닉네임', '내용', 'id'],
    row: function (x) { return [t_(x.ts), x.room, x.nick, x.content, x.id]; }, key: function (x) { return 's' + x.room + ':' + x.id; } },
  { tab: '명예의 전당', url: '/api/scores?action=all', cols: ['시각', '응원 한마디', '점수', '키워드', '도전 횟수', 'id'],
    row: function (x) { return [t_(x.ts), x.msg, x.score, (x.keywords || []).join(', '), x.runCount, x.id]; }, key: function (x) { return 'g' + x.id; } },
  { tab: '시민 의견 수집', url: '/api/admin?action=suggestions', cols: ['시각', '주제', '의견'],
    row: function (x) { return [t_(x.ts), x.topic, x.q]; }, key: function (x) { return md5_(JSON.stringify(x)); } },
  { tab: '더불이 지식자료', url: '/api/admin?action=listknowledge', cols: ['등록 시각', '파일 이름', '내용'],
    row: function (x) { return [t_(x.ts), x.filename, x.content]; }, key: function (x) { return md5_(JSON.stringify(x)); } },
  { tab: '김보미생각 글', url: '/api/posts?action=all', cols: ['발행 시각', '상태', '제목', '본문', 'id', '수정 시각'],
    row: function (x) { return [t_(x.publishAt), x.state, x.title, x.body, x.id, t_(x.updatedAt)]; }, key: function (x) { return 'p' + x.id + '@' + (x.updatedAt || ''); } }
];

function get_(path) {
  var key = P.getProperty('ADMIN_KEY');
  if (!key) throw new Error('스크립트 속성 ADMIN_KEY 가 없습니다 — 프로젝트 설정에서 넣어 주세요');
  var r = UrlFetchApp.fetch(SITE + path, { headers: { 'x-admin-key': key }, muteHttpExceptions: true, followRedirects: true });
  var code = r.getResponseCode();
  if (code === 401 || code === 403) throw new Error('관리자 키가 맞지 않습니다(' + code + ') — 스크립트 속성 ADMIN_KEY 확인');
  if (code >= 400) throw new Error(path + ' 응답 ' + code);
  var j = JSON.parse(r.getContentText());
  if (j && j.ok === false) throw new Error(path + ' 실패: ' + (j.error || ''));
  return j;
}

function book_() {
  var id = P.getProperty('BOOK_ID'), ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create(BOOK_NAME);
    DriveApp.getFileById(ss.getId()).moveTo(DriveApp.getFolderById(FOLDER_ID));
    P.setProperty('BOOK_ID', ss.getId());
  }
  return ss;
}
function sheet_(ss, name, cols) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold').setBackground('#eaf1fb');
    sh.setFrozenRows(1);
  }
  return sh;
}
function append_(sh, rows) {
  if (!rows.length) return;
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows.map(function (r) { return r.map(c_); }));
}

/* AI 대화: 최신순 목록이라 전체 건수에서 이미 옮긴 건수를 빼 새 것만 가져온다 */
function backupChat_(ss, s) {
  var sh = sheet_(ss, s.tab, CHAT_COLS);
  var done = Number(P.getProperty('n_' + s.chat) || 0);
  var first = get_('/api/chat?action=chatlog&bot=' + s.chat + '&offset=0&limit=1000');
  var total = Number(first.total || 0);
  if (total < done) { done = total; }                 /* 목록이 줄었다면(정상이라면 없음) 다시 맞춤 */
  var need = total - done, got = [];
  var items = first.items || [];
  got = got.concat(items.slice(0, Math.min(need, items.length)));
  var off = items.length;
  while (got.length < need) {
    var j = get_('/api/chat?action=chatlog&bot=' + s.chat + '&offset=' + off + '&limit=1000');
    var shift = Number(j.total || 0) - total;          /* 가져오는 사이 새로 쌓인 만큼 밀린다 */
    var part = (j.items || []).slice(Math.max(0, shift));
    if (!part.length) break;
    got = got.concat(part.slice(0, need - got.length));
    off += (j.items || []).length;
  }
  got.reverse();                                      /* 오래된 것부터 적는다 */
  append_(sh, got.map(chatRow_));
  P.setProperty('n_' + s.chat, String(done + got.length));
  return got.length;
}

/* 나머지 기록: 이미 적은 줄의 키(맨 끝 '키' 열)와 비교해 새 줄만 덧붙인다 */
function backupList_(ss, s) {
  var cols = s.cols.concat(['원문(JSON)', '키']);
  var sh = sheet_(ss, s.tab, cols);
  var j = get_(s.url);
  var items = j.items || [];
  var last = sh.getLastRow(), seen = {};
  if (last > 1) sh.getRange(2, cols.length, last - 1, 1).getValues().forEach(function (r) { seen[r[0]] = 1; });
  var rows = [];
  items.slice().reverse().forEach(function (x) {
    var k = s.key(x); if (seen[k]) return; seen[k] = 1;
    rows.push(s.row(x).concat([JSON.stringify(strip_(x)), k]));
  });
  append_(sh, rows);
  return rows.length;
}

function backup() {
  var lock = LockService.getScriptLock(); if (!lock.tryLock(30000)) return;
  var ss = book_(), log = [], err = [];
  try {
    SETS.forEach(function (s) {
      try { var n = s.chat ? backupChat_(ss, s) : backupList_(ss, s); if (n) log.push(s.tab + ' ' + n); }
      catch (e) { err.push(s.tab + ': ' + e.message); }
    });
    var lg = sheet_(ss, '보관 기록', ['실행 시각', '새로 옮긴 줄', '오류']);
    append_(lg, [[t_(Date.now()), log.join(' · ') || '새 기록 없음', err.join(' / ')]]);
    var d0 = ss.getSheetByName('Sheet1') || ss.getSheetByName('시트1'); if (d0 && ss.getSheets().length > 1) ss.deleteSheet(d0);
    if (err.length) notify_(err);
  } finally { lock.releaseLock(); }
}

/* 키 오류 등은 하루 한 번만 메일로 알린다 */
function notify_(err) {
  var today = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
  if (P.getProperty('notified') === today) return;
  P.setProperty('notified', today);
  MailApp.sendEmail(Session.getEffectiveUser().getEmail(), '[김보미.com] 기록 보관 오류',
    '구글 드라이브 기록 보관 중 오류가 났습니다.\n\n' + err.join('\n') + '\n\n보관 시트: ' + book_().getUrl());
}

function setup() {
  book_();
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'backup') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('backup').timeBased().everyHours(1).create();
  backup();
  Logger.log('준비 끝 — 보관 시트: ' + book_().getUrl());
}
