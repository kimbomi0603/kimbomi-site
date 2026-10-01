// 정부·국회 발표 모음 — 브레인허브와 김보미.com 이 같은 파일을 쓴다(두 저장소에 같은 내용으로 둔다).
// 인증키는 서버 환경변수에서만 읽고, 응답에 키가 섞여 나가지 않게 지운다.
//   DATA_GO_KR_KEY : 공공데이터포털 계정 키(정책브리핑·부처 보도자료·관보·성평등가족부)
//   ASSEMBLY_KEY   : 열린국회정보 인증키(발의법률안·입법예고·본회의 처리·국회 보도자료)
// 원칙: 원자료 값만 옮긴다. 제목·날짜·기관·원문 주소 외에 추정·가공 값을 만들지 않는다.

const env = (k) => (process.env[k] || '').trim();
const DKEY = () => env('DATA_GO_KR_KEY') || env('DATA_API_KEY') || env('G2B_API_KEY2') || env('G2B_API_KEY');
const AKEY = () => env('ASSEMBLY_KEY');

const kday = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10); // KST YYYY-MM-DD
const ymd = (ms) => kday(ms).replace(/-/g, '');
const normDate = (d) => {
  d = String(d || '').trim();
  let m = d.match(/^(\d{2})\/(\d{2})\/(\d{4})/); if (m) return m[3] + '-' + m[1] + '-' + m[2];
  m = d.match(/^(\d{4})[-./]?(\d{2})[-./]?(\d{2})/); return m ? m[1] + '-' + m[2] + '-' + m[3] : '';
};
const unent = (s) => String(s || '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, ' ')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&lsquo;|&rsquo;/g, "'").replace(/&ldquo;|&rdquo;/g, '"').replace(/&middot;/g, '·').replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const xf = (x, t) => { const m = x.match(new RegExp('<' + t + '>([\\s\\S]*?)</' + t + '>')); return m ? unent(m[1]) : ''; };
const xitems = (x, tag) => String(x || '').split('<' + (tag || 'item') + '>').slice(1);
const httpUrl = (u) => { u = String(u || '').trim(); if (!u) return ''; if (/^www\./.test(u)) u = 'https://' + u; return /^https?:\/\//.test(u) ? u : ''; };

function scrub(s) {
  for (const k of [DKEY(), AKEY()]) {
    if (!k) continue;
    s = s.split(k).join('***');
    try { const d = decodeURIComponent(k); if (d !== k) s = s.split(d).join('***'); } catch (e) { /* 그대로 */ }
  }
  return s;
}

async function get(url, ms) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms || 12000);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (policy-feed)', Accept: 'application/json,application/xml,text/xml,*/*' } });
    return { ok: r.ok, status: r.status, text: await r.text() };
  } finally { clearTimeout(t); }
}
function dataUrl(path, params) {
  const k = DKEY(); if (!k) return null;
  const u = new URL('https://apis.data.go.kr' + path);
  for (const [a, b] of Object.entries(params || {})) u.searchParams.set(a, String(b));
  return u.toString() + '&serviceKey=' + (/%[0-9A-Fa-f]{2}/.test(k) ? k : encodeURIComponent(k));
}
function asmUrl(code, params) {
  const k = AKEY(); if (!k) return null;
  const u = new URL('https://open.assembly.go.kr/portal/openapi/' + code);
  u.searchParams.set('KEY', k); u.searchParams.set('Type', 'json');
  for (const [a, b] of Object.entries(params || {})) u.searchParams.set(a, String(b));
  return u.toString();
}
async function asmRows(code, params) {
  const url = asmUrl(code, params); if (!url) throw new Error('no_key');
  const r = await get(url, 15000);
  const j = JSON.parse(r.text);
  if (j[code] && j[code][1]) return { total: (j[code][0].head[0] || {}).list_total_count, rows: j[code][1].row || [] };
  const res = j.RESULT || (j[code] && j[code][0] && j[code][0].head[1].RESULT) || {};
  if (res.CODE === 'INFO-200') return { total: 0, rows: [] };
  throw new Error((res.CODE || 'ERR') + ' ' + (res.MESSAGE || ''));
}

/* ── 출처 목록 ──
   g: gov(정부) | nas(국회), org: 화면에 보일 기관명, home: 원문 주소가 없을 때 갈 곳 */
const SOURCES = [
  { id: 'korea', g: 'gov', org: '정책브리핑(전 부처)', key: 'data', home: 'https://www.korea.kr/briefing/pressReleaseList.do',
    async run(days) {
      const out = []; const end = Date.now(); let start = end - Math.max(1, days - 1) * 86400e3;
      while (start <= end) {
        const s2 = Math.min(start + 2 * 86400e3, end);
        for (let page = 1; page <= 3; page++) {
          const url = dataUrl('/1371000/policyNewsService2/policyNewsList2', { startDate: ymd(start), endDate: ymd(s2), numOfRows: 100, pageNo: page });
          const r = await get(url, 15000); const its = xitems(r.text, 'NewsItem');
          for (const it of its) out.push({ id: 'korea:' + xf(it, 'NewsItemId'), date: normDate(xf(it, 'ApproveDate') || xf(it, 'ModifyDate')), title: xf(it, 'Title'), org: xf(it, 'MinisterCode') || '정책브리핑', url: httpUrl(xf(it, 'OriginalUrl')), sub: xf(it, 'SubTitle1').slice(0, 160), kind: xf(it, 'GroupingCode') });
          if (its.length < 100) break;
        }
        start += 3 * 86400e3;
      }
      return out;
    } },
  { id: 'msit', g: 'gov', org: '과학기술정보통신부', key: 'data', home: 'https://www.msit.go.kr/bbs/list.do?sCode=user&mPid=208&mId=307',
    async run() {
      const r = await get(dataUrl('/1721000/msitpressreleaseinfo/pressReleaseList', { pageNo: 1, numOfRows: 50 }));
      return xitems(r.text).map((it) => ({ id: 'msit:' + (xf(it, 'viewUrl').match(/nttSeqNo=(\d+)/) || [, xf(it, 'subject')])[1], date: normDate(xf(it, 'pressDt')), title: xf(it, 'subject'), org: '과학기술정보통신부', dept: xf(it, 'deptName'), url: httpUrl(xf(it, 'viewUrl')) }));
    } },
  { id: 'mss', g: 'gov', org: '중소벤처기업부', key: 'data', home: 'https://www.mss.go.kr/site/smba/ex/bbs/List.do?cbIdx=86',
    async run(days) {
      const r = await get(dataUrl('/1421000/mssPressService_v2/getPressList_v2', { pageNo: 1, numOfRows: 100, startDate: kday(Date.now() - (days - 1) * 86400e3), endDate: kday(Date.now()) }));
      return xitems(r.text).map((it) => ({ id: 'mss:' + xf(it, 'itemId'), date: normDate(xf(it, 'regDate')), title: xf(it, 'title'), org: '중소벤처기업부', dept: xf(it, 'writerPosition'), url: httpUrl(xf(it, 'viewUrl')) }));
    } },
  { id: 'mofa', g: 'gov', org: '외교부', key: 'data', home: 'https://www.mofa.go.kr/www/brd/m_4080/list.do',
    // 이 API 는 오래된 글부터 준다 → 전체 건수로 마지막 쪽을 계산해 최근 글을 받는다.
    async run() {
      const first = JSON.parse((await get(dataUrl('/1262000/pressRlsService/getPressRls', { pageNo: 1, numOfRows: 1, returnType: 'JSON' }))).text);
      const total = +first.response.body.totalCount || 0; const n = 50; const last = Math.max(1, Math.ceil(total / n));
      const rows = [];
      for (const pg of [last - 1, last]) {
        if (pg < 1) continue;
        const j = JSON.parse((await get(dataUrl('/1262000/pressRlsService/getPressRls', { pageNo: pg, numOfRows: n, returnType: 'JSON' }))).text);
        const it = j.response.body.items && j.response.body.items.item; if (it) rows.push(...[].concat(it));
      }
      return rows.map((x) => { const f = String(x.file_url || '').split(',')[0]; const seq = (f.match(/seq=(\d+)/) || [])[1];
        return { id: 'mofa:' + (seq || x.title), date: normDate(x.updt_date), title: unent(x.title), org: '외교부', url: seq ? 'https://www.mofa.go.kr/www/brd/m_4080/view.do?seq=' + seq : httpUrl(f) }; });
    } },
  { id: 'unikorea', g: 'gov', org: '통일부', key: 'data', home: 'https://www.unikorea.go.kr/unikorea/news/release/',
    async run() {
      const j = JSON.parse((await get(dataUrl('/1250000/nesdta/getNesdta', { pageNo: 1, numOfRows: 50, bgng_ymd: ymd(Date.now() - 400 * 86400e3), end_ymd: ymd(Date.now()) }))).text);
      return [].concat(j.items || []).map((x) => ({ id: 'unikorea:' + ((String(x.url).match(/cntId=(\d+)/) || [])[1] || x.sj), date: normDate(x.wrt_ymd), title: unent(x.sj), org: '통일부', dept: x.dept || '', url: httpUrl(x.url) }));
    } },
  { id: 'mogef', g: 'gov', org: '성평등가족부', key: 'data', home: 'https://www.mogef.go.kr/nw/enw/nw_enw_s001.do?mid=mda700',
    async run() {
      const out = [];
      const a = JSON.parse((await get(dataUrl('/1383000/mogefNew/nwEnwSelectList', { pageNo: 1, numOfRows: 50, type: 'json' }))).text);
      for (const x of [].concat(((a.body || [])[0] || {}).items ? a.body[0].items.item : [])) out.push({ id: 'mogef:' + ((String(x.viewUrl).match(/bbtSn=(\d+)/) || [])[1] || x.title), date: normDate(x.regDt), title: unent(x.title), org: '성평등가족부', kind: '정책뉴스', url: httpUrl(x.viewUrl) });
      const b = JSON.parse((await get(dataUrl('/1383000/policy/subjectList', { pageNo: 1, numOfRows: 30, type: 'json' }))).text);
      for (const x of [].concat(((b.body || [])[0] || {}).items ? b.body[0].items.item : [])) out.push({ id: 'mogefp:' + ((String(x.url).match(/bbtSn=(\d+)/) || [])[1] || x.title), date: normDate(x.regDt), title: unent(x.title), org: '성평등가족부', dept: x.deptNm || '', kind: '정책자료', url: httpUrl(x.url) });
      const c = JSON.parse((await get(dataUrl('/1383000/yhis/YouthNewsService/getYouthNewsList', { pageNo: 1, numOfRows: 30, type: 'json' }))).text);
      const ci = (((c.response || {}).body || {}).items || {}).item;
      for (const x of [].concat(ci || [])) out.push({ id: 'mogefy:' + x.pstNo, date: normDate(x.pstRegYmd), title: unent(x.pstTtlNm), org: x.operInstNm || '성평등가족부', kind: '청소년 ' + (x.pstClsfNm || ''), url: '', sub: unent(x.pstCn).slice(0, 160) });
      return out;
    } },
  { id: 'gwanbo', g: 'gov', org: '관보(행정안전부)', key: 'data', home: 'https://gwanbo.go.kr',
    // 관보 3종(전체 목록·입법예고·대통령공고). 제공 서버가 자주 「서비스 연결실패」를 낸다 → 실패해도 다른 출처는 그대로.
    async run(days) {
      const out = []; const from = ymd(Date.now() - Math.max(7, days) * 86400e3), to = ymd(Date.now());
      for (const [path, kind] of [['/1741000/ApiPblancLgsltService/getApiPblancLgsltList', '입법예고'], ['/1741000/ApiPredeceService/getApiPredeceList', '대통령공고'], ['/1741000/ApiTotalService/getApiTotalList', '관보']]) {
        const r = await get(dataUrl(path, { pageNo: 1, pageSize: 50, reqFrom: from, reqTo: to, type: 'json' }), 15000);
        if (!String(r.text || '').trim()) throw new Error('관보 제공 서버가 빈 응답을 줌(' + r.status + ')');
        let j; try { j = JSON.parse(r.text); } catch (e) { if (/SERVICETIMEOUT|연결실패/.test(r.text)) throw new Error('관보 제공 서버 연결 실패'); continue; }
        const list = []; (function walk(o) { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') { if (o.cntntSj || o.cntntSeqNo) list.push(o); else Object.values(o).forEach(walk); } })(j);
        for (const x of list) out.push({ id: 'gwanbo:' + (x.cntntSeqNo || x.cntntSj), date: normDate(x.pblcnDt || x.pblcnDe || x.regDt || ''), title: unent(x.cntntSj), org: x.insttNm || x.orgNm || '관보', kind, url: httpUrl(x.cntntUrl || x.pdfUrl || '') });
      }
      return out;
    } },
  { id: 'nabill', g: 'nas', org: '국회 발의법률안', key: 'asm', home: 'https://likms.assembly.go.kr/bill/main.do',
    async run() {
      const { rows } = await asmRows('nzmimeepazxkubdpn', { AGE: 22, pIndex: 1, pSize: 100 });
      return rows.map((x) => ({ id: 'nabill:' + x.BILL_ID, date: normDate(x.PROPOSE_DT), title: x.BILL_NAME, org: '국회', who: x.PROPOSER, dept: x.COMMITTEE || '', kind: x.PROC_RESULT || '계류', url: httpUrl(x.DETAIL_LINK), no: x.BILL_NO }));
    } },
  { id: 'nalgsl', g: 'nas', org: '국회 입법예고(진행 중)', key: 'asm', home: 'https://pal.assembly.go.kr/',
    async run() {
      const { rows } = await asmRows('nknalejkafmvgzmpt', { pIndex: 1, pSize: 200 });
      return rows.map((x) => ({ id: 'nalgsl:' + x.BILL_ID, date: '', until: normDate(x.NOTI_ED_DT), title: x.BILL_NAME, org: '국회', who: x.PROPOSER, dept: x.CURR_COMMITTEE || '', kind: '입법예고', url: httpUrl(x.LINK_URL), no: x.BILL_NO }));
    } },
  { id: 'naplen', g: 'nas', org: '국회 본회의 처리안건', key: 'asm', home: 'https://likms.assembly.go.kr/bill/main.do',
    async run() {
      const { rows } = await asmRows('nwbpacrgavhjryiph', { AGE: 22, pIndex: 1, pSize: 100 });
      return rows.map((x) => ({ id: 'naplen:' + x.BILL_ID, date: normDate(x.RGS_PROC_DT || x.PROPOSE_DT), title: x.BILL_NM, org: '국회 본회의', who: x.PROPOSER, dept: x.COMMITTEE_NM || '', kind: x.PROC_RESULT_CD || '', vote: x.VOTE_TCNT != null ? { all: x.VOTE_TCNT, yes: x.YES_TCNT, no: x.NO_TCNT, blank: x.BLANK_TCNT } : null, url: httpUrl(x.LINK_URL), no: x.BILL_NO }));
    } },
  { id: 'napress', g: 'nas', org: '국회 보도자료', key: 'asm', home: 'https://www.assembly.go.kr/portal/bbs/B0000051/list.do?menuNo=600101',
    async run() {
      const { rows } = await asmRows('ninnagrlaelvtzfnt', { pIndex: 1, pSize: 100 });
      return rows.map((x) => ({ id: 'napress:' + x.NUM, date: normDate(x.WRITE_DATE), title: unent(x.TITLE), org: x.BBS_TITLE || '국회', kind: '보도자료', url: httpUrl(x.CONTENT_URL) }));
    } },
];

// 한 출처 실행 — 실패해도 예외를 밖으로 던지지 않고 상태로 돌려준다.
async function runOne(s, days) {
  const t0 = Date.now();
  if ((s.key === 'data' && !DKEY()) || (s.key === 'asm' && !AKEY())) return { id: s.id, org: s.org, state: 'no_key', n: 0, ms: 0, items: [] };
  try {
    const items = (await s.run(days || 3)).filter((x) => x && x.title).map((x) => Object.assign({ src: s.id, g: s.g }, x, { url: x.url || '', home: s.home }));
    return { id: s.id, org: s.org, state: items.length ? 'ok' : 'empty', n: items.length, ms: Date.now() - t0, items };
  } catch (e) {
    return { id: s.id, org: s.org, state: 'error', n: 0, ms: Date.now() - t0, msg: scrub(String(e && e.message || e)).slice(0, 160), items: [] };
  }
}
async function runAll(opts) {
  opts = opts || {};
  const list = SOURCES.filter((s) => !opts.only || opts.only.includes(s.id) || opts.only.includes(s.g));
  const res = await Promise.all(list.map((s) => runOne(s, opts.days)));
  const seen = new Set(); const items = [];
  for (const r of res) for (const it of r.items) { if (seen.has(it.id)) continue; seen.add(it.id); items.push(it); }
  // 발표일 최신순. 진행 중 입법예고처럼 발표일이 원자료에 없는 것은 날짜를 만들지 않고 뒤에 둔다(마감일순).
  items.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(a.until || '').localeCompare(String(b.until || '')));
  return { at: new Date().toISOString(), status: res.map(({ items: _x, ...rest }) => rest), items };
}

/* ── 온통청년(김보미.com 만 키를 가진다) ── */
const YOUTH_OPS = { plcy: ['getPlcy', 'YOUTH_KEY'], space: ['getSpace', 'YOUTH_SPACE_KEY'], content: ['getContent', 'YOUTH_CONTENT_KEY'], way: ['getPolicyWay', 'YOUTH_WAY_KEY'], fcs: ['getBscPlanFcsAsmt', 'YOUTH_FCS_KEY'], asmt: ['getBscPlanAsmt', 'YOUTH_ASMT_KEY'] };
async function youth(op, q) {
  const d = YOUTH_OPS[op]; if (!d) throw new Error('unknown op');
  const key = env(d[1]) || (op === 'plcy' ? env('YOUTH_API_KEY') : ''); if (!key) return { state: 'no_key' };
  const u = new URL('https://www.youthcenter.go.kr/go/ythip/' + d[0]);
  u.searchParams.set('apiKeyNm', key); u.searchParams.set('rtnType', 'json');
  u.searchParams.set('pageNum', String(Math.max(1, +q.page || 1))); u.searchParams.set('pageSize', String(Math.min(100, Math.max(1, +q.size || 20))));
  for (const k of ['plcyKywdNm', 'plcyNm', 'zipCd', 'lclsfNm', 'mclsfNm', 'plcyNo', 'ctpvNm', 'sggNm']) if (q[k]) u.searchParams.set(k, String(q[k]).slice(0, 60));
  const r = await get(u.toString(), 15000);
  let j; try { j = JSON.parse(r.text); } catch (e) { return { state: 'error', msg: 'JSON 아님 ' + r.status }; }
  const s = scrub(JSON.stringify(j)).split(key).join('***');
  return { state: 'ok', data: JSON.parse(s) };
}

module.exports = { SOURCES, runAll, runOne, youth, YOUTH_OPS, normDate, kday };
