// qa/check.mjs — 인지과제 회귀 점검. 엔진을 고칠 때마다 `npm run check` 로 돌린다.
//
// 4개 앱(스트룹 청소년/성인, Go/No-go 청소년/성인) 각각을 헤드리스 Chrome 으로
// 실제 플레이하며 자동으로 확인한다:
//   1) 시행이 끝나 결과 화면(요약)에 도달하는가
//   2) 정답만 낸 세션의 정확도(acc)가 100% 인가
//        → isCorrect 훅 검증. 특히 Go/No-go 의 'No-go 는 안 누름(timedOut)=정답' 이 깨지면 여기서 떨어진다.
//   3) 다른 언어로 한 기록이 그래프에서 걸러지는가
//        → 같은 조건(lang·input) 세션만 그리고, 다른 조건은 '다른 조건 N회 미표시' 로 안내되는가.
//
// 봇은 '유능한 사용자'를 흉내낸다: 스트룹은 잉크색 버튼을, Go/No-go 는 원에만 응답.
// 외부 다운로드 없음 — 설치된 Chrome + puppeteer-core. 모듈 로딩 때문에 정적 서버를 띄운다.
//
// 종료 코드: 전부 통과=0, 하나라도 실패=1 (CI/자동화용).

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..'); // cognitive-tasks/
const PORT = 8791;
const RESPOND_MS = 350;      // 자극 후 응답까지 대기(유효 RT 200~3000ms 안, 제한시간 전)
const RUN_TIMEOUT = 240000;  // 한 회차 최대 대기(ms) — gonogo-youth(66시행)가 가장 김

// 설치된 Chrome 자동 탐색
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.LOCALAPPDATA && process.env.LOCALAPPDATA.replace(/\\/g, '/') + '/Google/Chrome/Application/chrome.exe',
].filter(Boolean).find((p) => fs.existsSync(p));
if (!CHROME) { console.error('설치된 Chrome 을 찾지 못했습니다.'); process.exit(2); }

const APPS = [
  { id: 'stroop-youth',  dir: 'stroop-youth',  kind: 'default' },
  { id: 'stroop-adults', dir: 'stroop-adults', kind: 'default' },
  { id: 'gonogo-youth',  dir: 'gonogo-youth',  kind: 'default' },
  { id: 'gonogo-adults', dir: 'gonogo-adults', kind: 'default' },
  { id: 'corsi-youth',   dir: 'corsi-youth',   kind: 'corsi'   },
  { id: 'corsi-adults',  dir: 'corsi-adults',  kind: 'corsi'   },
  { id: 'digitspan-youth',  dir: 'digitspan-youth',  kind: 'digitspan' },
  { id: 'digitspan-adults', dir: 'digitspan-adults', kind: 'digitspan' },
  { id: 'srt-youth',  dir: 'srt-youth',  kind: 'srt' },
  { id: 'srt-adults', dir: 'srt-adults', kind: 'srt' },
  { id: 'simon-youth',  dir: 'simon-youth',  kind: 'simon' },
  { id: 'simon-adults', dir: 'simon-adults', kind: 'simon' },
  { id: 'stopsignal-youth',  dir: 'stopsignal-youth',  kind: 'stopsignal' },
  { id: 'stopsignal-adults', dir: 'stopsignal-adults', kind: 'stopsignal' },
  { id: 'rotation-youth',  dir: 'rotation-youth',  kind: 'rotation' },
  { id: 'rotation-adults', dir: 'rotation-adults', kind: 'rotation' },
  { id: 'nback-youth',  dir: 'nback-youth',  kind: 'nback' },
  { id: 'nback-adults', dir: 'nback-adults', kind: 'nback' },
  { id: 'jnd-youth',  dir: 'jnd-youth',  kind: 'jnd' },
  { id: 'jnd-adults', dir: 'jnd-adults', kind: 'jnd' },
  { id: 'vsearch-youth',  dir: 'vsearch-youth',  kind: 'vsearch' },
  { id: 'vsearch-adults', dir: 'vsearch-adults', kind: 'vsearch' },
  { id: 'muller-lyer-youth',  dir: 'muller-lyer-youth',  kind: 'muller-lyer' },
  { id: 'muller-lyer-adults', dir: 'muller-lyer-adults', kind: 'muller-lyer' },
  { id: 'ebbinghaus-youth',  dir: 'ebbinghaus-youth',  kind: 'ebbinghaus' },
  { id: 'ebbinghaus-adults', dir: 'ebbinghaus-adults', kind: 'ebbinghaus' },
  { id: 'sart-youth',  dir: 'sart-youth',  kind: 'sart' },
  { id: 'sart-adults', dir: 'sart-adults', kind: 'sart' },
  { id: 'ablink-youth',  dir: 'ablink-youth',  kind: 'ablink' },
  { id: 'ablink-adults', dir: 'ablink-adults', kind: 'ablink' },
  { id: 'blindspot', dir: 'blindspot', kind: 'blindspot' },
  { id: 'necker-cube', dir: 'necker-cube', kind: 'necker' },
  { id: 'afterimage', dir: 'afterimage', kind: 'afterimage' },
  { id: 'inattentional-blindness', dir: 'inattentional-blindness', kind: 'ib' },
  { id: 'emo-stroop-youth',  dir: 'emo-stroop-youth',  kind: 'emo-stroop' },
  { id: 'emo-stroop-adults', dir: 'emo-stroop-adults', kind: 'emo-stroop' },
  { id: 'emo-dotprobe-youth',  dir: 'emo-dotprobe-youth',  kind: 'emo-dotprobe' },
  { id: 'emo-dotprobe-adults', dir: 'emo-dotprobe-adults', kind: 'emo-dotprobe' },
];

// 범위 지정: `node check.mjs`(전체) / `node check.mjs digitspan`(접두사 일치) / `node check.mjs stroop gonogo`.
const ARGS = process.argv.slice(2);
const SELECTED = APPS.filter((a) => ARGS.length === 0 || ARGS.some((x) => a.id.startsWith(x)));

// 동시에 검사할 앱(=브라우저 인스턴스) 수. 시행의 대부분은 점등·응시·대기 '설정시간'이라
// CPU가 놀아 병렬로 겹치면 크게 빨라지지만, 코어 수를 넘기면(예: 8코어에 12개) 정적서버·자원이
// 초과돼 navigation 이 abort 된다. 그래서 코어 수(8)에 맞춘다. 범위 지정 시엔 min(PARALLEL, 선택 수).
const PARALLEL = 8;
const QA_SPAN = 3;    // QA 축약 모드에서 적응형 최대 길이(=성공 시 스팬)
const QA_TRIALS = 4;  // 그때 본시행 수: 길이 2·3 각 2회 = 4

// 모든 검사는 ?qa=1 축약 모드로 연다(시행 수만 최소, 판정·UI 는 실제와 동일).
const urlFor = (dir, lang) => `http://localhost:${PORT}/${dir}/?lang=${lang}&qa=1`;

// ── 정적 서버 (file:// 은 ES module 로딩이 막혀서 필요) ──────────────
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon',
};
function startServer() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(ROOT, p);
    if (!path.resolve(file).startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end('404'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise((r) => server.listen(PORT, () => r(server)));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 페이지 안에서 도는 자동 응답기 (브라우저 컨텍스트로 주입) ─────────
// 시행마다 한 번만 응답한다(진행표시 텍스트로 중복 방지). 연습·본시행 모두 처리.
//   Go/No-go → 원(circle)=RESPOND_MS 뒤 누름, 사각형(rect)=참음.
//   스트룹    → 잉크색과 같은 배경색 버튼을 RESPOND_MS 뒤 누름(정답).
function installResponder(respondMs) {
  window.__seen = new Set();
  window.__responder = setInterval(() => {
    const pad = document.getElementById('cog-pad');
    const stim = document.getElementById('cog-stimulus');
    const prog = document.getElementById('cog-progress');
    if (!pad || !stim || pad.hidden || !pad.classList.contains('live')) return;
    const key = prog ? prog.textContent : String(Date.now());
    if (window.__seen.has(key)) return;
    window.__seen.add(key);

    const press = () => {
      const p = document.getElementById('cog-pad');
      if (!p || !p.classList.contains('live')) return; // 이미 사라졌으면(시간초과) 포기
      const s = document.getElementById('cog-stimulus');
      // Go/No-go: SVG 도형이면 원에만 응답
      if (s.querySelector('svg')) {
        if (!s.querySelector('svg circle')) return; // 사각형 = 참기
        const btn = p.querySelector('.choice');
        if (btn) btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }));
        return;
      }
      // 스트룹: 잉크색(글자색)과 같은 배경색 버튼
      const ink = getComputedStyle(s).color;
      const target = [...p.querySelectorAll('.choice')]
        .find((b) => getComputedStyle(b).backgroundColor === ink);
      if (target) target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }));
    };
    setTimeout(press, respondMs);
  }, 20);
}

// ── 결과 화면 판독 (브라우저 컨텍스트) ───────────────────────────────
function readResults() {
  const panel = document.getElementById('cog-panel');
  const graphNotes = [...panel.querySelectorAll('.graph-note')].map((n) => n.textContent.trim());
  return {
    graphs: panel.querySelectorAll('.cog-graph svg').length,
    circles: panel.querySelectorAll('.cog-graph svg circle').length,      // 그려진 데이터 점(회차×시리즈)
    legendItems: panel.querySelectorAll('.cog-graph .legend .lg').length, // 시리즈 개수(+속빈 범례)
    hollowLegend: panel.querySelectorAll('.cog-graph .legend .lg i.hollow').length,
    graphNotes,
    condLine: (panel.querySelector('.condition-line') || {}).textContent || '',
    topNotes: [...panel.querySelectorAll('.top-note')].map((n) => n.textContent.trim()),
  };
}

// ── 한 회차 플레이 ───────────────────────────────────────────────────
async function playRun(browser, url, { clearId } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });

  await page.goto(url, { waitUntil: 'load' });
  if (clearId) {
    await page.evaluate((id) => { try { localStorage.removeItem('cog:' + id + ':sessions'); } catch {} }, clearId);
    await page.reload({ waitUntil: 'load' });
  }
  await page.waitForSelector('#cog-action', { timeout: 15000 });
  await page.evaluate(installResponder, RESPOND_MS);

  const t0 = Date.now();
  let reachedResults = false;
  while (Date.now() - t0 < RUN_TIMEOUT) {
    const st = await page.evaluate(() => {
      const panel = document.getElementById('cog-panel');
      const visible = panel && !panel.hidden;
      return {
        visible,
        hasSummary: !!(panel && panel.querySelector('.summary')),
        hasAction: !!(panel && panel.querySelector('#cog-action')),
      };
    });
    if (st.visible && st.hasSummary) { reachedResults = true; break; } // 결과 도달 → 'again' 은 절대 누르지 않음
    if (st.visible && st.hasAction && !st.hasSummary) {                // 인트로/본시행 시작 버튼
      await page.click('#cog-action').catch(() => {});
      await sleep(120);
    }
    await sleep(100);
  }

  const data = reachedResults ? await page.evaluate(readResults) : null;
  return { page, errors, reachedResults, data };
}

async function readSessions(page, id) {
  return page.evaluate((id) => {
    try { return JSON.parse(localStorage.getItem('cog:' + id + ':sessions') || '[]'); } catch { return []; }
  }, id);
}

// ── 한 앱 점검(회차 A: ko 처음부터 / 회차 B: en, A의 ko 기록이 걸러져야 함) ──
async function checkApp(browser, app) {
  const checks = [];
  const add = (name, pass, detail) => checks.push({ name, pass, detail });

  // 회차 A — ko, 기존 기록 초기화하고 처음부터
  const A = await playRun(browser, urlFor(app.dir, 'ko'), { clearId: app.id });
  add('결과 화면 도달', A.reachedResults, A.reachedResults ? 'ok' : `${RUN_TIMEOUT}ms 내 요약 없음`);
  add('JS 에러 없음', A.errors.length === 0, A.errors.length ? A.errors.slice(0, 3).join(' / ') : 'none');
  if (A.reachedResults) {
    const last = (await readSessions(A.page, app.id)).slice(-1)[0];
    add('정답 판정 = 정확도 100%', !!last && last.acc === 1,
      last ? `acc=${Math.round((last.acc ?? 0) * 100)}%` : '세션 없음');
  }
  await A.page.close();

  // 회차 B — en. 저장소를 지우지 않아 A의 ko 세션이 남아있고, 그래프에서 걸러져야 한다.
  const B = await playRun(browser, urlFor(app.dir, 'en'), {});
  if (!B.reachedResults) {
    add('다른 언어 기록이 그래프에서 걸러짐', false, 'B 회차 결과 미도달');
  } else {
    const sess = await readSessions(B.page, app.id);
    const cur = sess.slice(-1)[0];
    const same = (s) => (s.lang || cur.lang) === cur.lang && (s.input || null) === (cur.input || null);
    const mine = sess.filter(same).length;      // 현재 조건(en·mouse) 세션 수
    const hidden = sess.length - mine;          // 다른 조건(ko) 세션 수
    const d = B.data;
    const seriesCount = d.legendItems - d.hollowLegend;             // 시리즈 개수
    const plotted = seriesCount > 0 ? d.circles / seriesCount : NaN; // 그래프에 실제로 그려진 회차 수
    const setupOk = hidden > 0;                                     // ko 세션이 실제로 있어 걸러질 상황
    const plottedOk = Number.isInteger(plotted) && plotted === mine; // 다른 언어가 안 섞였는가
    const noteOk = d.graphNotes.some((n) => n.includes(String(hidden))); // '다른 조건 N회 미표시' 안내
    add('다른 언어 기록이 그래프에서 걸러짐', setupOk && plottedOk && noteOk,
      `세션 ${sess.length}(내조건 ${mine}/다른조건 ${hidden}) · 그래프에 ${Number.isInteger(plotted) ? plotted : '?'}회차 · 안내 ${noteOk ? '표시' : '없음'}`);
  }
  await B.page.close();

  return { id: app.id, checks };
}

// ── 코시 점검 (적응형·다중자극/응답이라 별도 봇) ──────────────────────
// 코시는 자극판이 응답 표면이라 응답기가 다르다. 두 방향을 모두 실측한다:
//   · 정답봇  : 점등 순서를 관찰해 그대로 탭 → 길이 2→…→9 상승, 스팬 9 (정상 진행)
//   · 오답봇  : 첫 블록을 일부러 틀림 → 즉시 실패, 같은 길이 2연속 실패로 종료, 스팬 0
// 정답봇만 돌리면 '오답이 안 잡히는' 회귀를, 오답봇만 돌리면 '정상 진행이 깨진' 회귀를 놓친다.
function installCorsiBot(mistakeFirst) {
  const st = { seq: [], lastLit: null, wasRecall: false, responded: false };
  const S = (ms) => new Promise((r) => setTimeout(r, ms));
  const tap = (idx) => {
    const el = document.querySelector('.corsi-board .corsi-block[data-idx="' + idx + '"]');
    if (el) el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }));
  };
  window.__corsiTimer = setInterval(async () => {
    const board = document.querySelector('.corsi-board');
    const panel = document.getElementById('cog-panel');
    if (panel && !panel.hidden && panel.querySelector('.summary')) return;
    if (!board) return;
    const recall = board.classList.contains('recall');
    const lit = board.querySelector('.corsi-block.lit');
    if (!recall) {
      if (lit) { const i = Number(lit.dataset.idx); if (st.lastLit !== i) { st.seq.push(i); st.lastLit = i; } }
      else st.lastLit = null;
    }
    if (recall && !st.responded) {
      st.responded = true;
      const seq = st.seq.slice();
      if (mistakeFirst) tap((seq[0] + 1) % 9);              // 첫 탭부터 오답 → 즉시 실패
      else for (const i of seq) { tap(i); await S(90); }    // 순서대로 정답
    }
    if (st.wasRecall && !recall) { st.seq = []; st.lastLit = null; st.responded = false; }
    st.wasRecall = recall;
  }, 40);
}

async function playCorsi(browser, url, id, mistakeFirst) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate((i) => { try { localStorage.removeItem('cog:' + i + ':sessions'); } catch {} }, id);
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#cog-action', { timeout: 15000 });
  await page.evaluate(installCorsiBot, mistakeFirst);
  const t0 = Date.now();
  let reached = false;
  while (Date.now() - t0 < RUN_TIMEOUT) {
    const st = await page.evaluate(() => {
      const panel = document.getElementById('cog-panel');
      return { visible: panel && !panel.hidden, hasSummary: !!(panel && panel.querySelector('.summary')),
        hasAction: !!(panel && panel.querySelector('#cog-action')) };
    });
    if (st.visible && st.hasSummary) { reached = true; break; }
    if (st.visible && st.hasAction && !st.hasSummary) { await page.click('#cog-action').catch(() => {}); await sleep(120); }
    await sleep(100);
  }
  const sess = (await readSessions(page, id)).slice(-1)[0] || null;
  await page.close();
  return { errors, reached, span: sess ? sess.values.span : null, trialCount: sess ? sess.trialCount : null };
}

async function checkCorsi(browser, app) {
  const checks = [];
  const add = (name, pass, detail) => checks.push({ name, pass, detail });

  // 정답봇 — 정상 진행(축약 모드에서 최대 길이까지 상승)
  const ok = await playCorsi(browser, urlFor(app.dir, 'ko'), app.id, false);
  add('정답봇 결과 도달', ok.reached, ok.reached ? 'ok' : `${RUN_TIMEOUT}ms 내 요약 없음`);
  add('정답봇 JS 에러 없음', ok.errors.length === 0, ok.errors.length ? ok.errors.slice(0, 3).join(' / ') : 'none');
  add(`정답봇 적응형 스팬=${QA_SPAN}(2→…→${QA_SPAN})`, ok.span === QA_SPAN && ok.trialCount === QA_TRIALS, `span=${ok.span}·trials=${ok.trialCount}`);

  // 오답봇 — 첫 블록 오답 → 즉시 실패·행 없음(스팬 0, 2시행)
  const no = await playCorsi(browser, urlFor(app.dir, 'ko'), app.id, true);
  add('오답봇 즉시 실패·행 없음', no.reached && no.errors.length === 0 && no.span === 0 && no.trialCount === 2,
    `도달=${no.reached}·에러${no.errors.length}·span=${no.span}·trials=${no.trialCount}`);

  return { id: app.id, checks };
}

// ── 숫자 거꾸로 점검 (코시와 같은 적응형·다중응답, 단 응답은 '거꾸로') ──────
// 정답봇  : 제시된 숫자를 관찰해 '거꾸로' 키패드 입력 → 길이 2→…→9, 스팬 9
// 오답봇  : 일부러 '바로'(정순) 입력 → 거꾸로가 아니므로 즉시 실패, 스팬 0
//          (정답봇만 돌리면 '뒤집기 로직이 깨진' 회귀를, 오답봇만 돌리면 '정상 진행 깨짐'을 놓침)
function installDigitSpanBot(doReverse) {
  const st = { shown: [], inShow: false, wasRecall: false, responded: false };
  const S = (ms) => new Promise((r) => setTimeout(r, ms));
  const tap = (d) => {
    const el = document.querySelector('.ds-pad .ds-key[data-digit="' + d + '"]');
    if (el) el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }));
  };
  window.__dsTimer = setInterval(async () => {
    const wrap = document.querySelector('.ds-wrap');
    const panel = document.getElementById('cog-panel');
    if (panel && !panel.hidden && panel.querySelector('.summary')) return;
    if (!wrap) return;
    const recall = wrap.classList.contains('recall');
    const disp = (wrap.querySelector('.ds-display') || {}).textContent || '';
    if (!recall) {
      if (disp !== '') { if (!st.inShow) { st.shown.push(Number(disp)); st.inShow = true; } }
      else st.inShow = false;
    }
    if (recall && !st.responded) {
      st.responded = true;
      const order = doReverse ? st.shown.slice().reverse() : st.shown.slice();
      for (const d of order) { tap(d); await S(90); }
    }
    if (st.wasRecall && !recall) { st.shown = []; st.inShow = false; st.responded = false; }
    st.wasRecall = recall;
  }, 30);
}

async function playDigitSpan(browser, url, id, doReverse) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate((i) => { try { localStorage.removeItem('cog:' + i + ':sessions'); } catch {} }, id);
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#cog-action', { timeout: 15000 });
  await page.evaluate(installDigitSpanBot, doReverse);
  const t0 = Date.now();
  let reached = false;
  while (Date.now() - t0 < RUN_TIMEOUT) {
    const st = await page.evaluate(() => {
      const panel = document.getElementById('cog-panel');
      return { visible: panel && !panel.hidden, hasSummary: !!(panel && panel.querySelector('.summary')),
        hasAction: !!(panel && panel.querySelector('#cog-action')) };
    });
    if (st.visible && st.hasSummary) { reached = true; break; }
    if (st.visible && st.hasAction && !st.hasSummary) { await page.click('#cog-action').catch(() => {}); await sleep(120); }
    await sleep(100);
  }
  const sess = (await readSessions(page, id)).slice(-1)[0] || null;
  await page.close();
  return { errors, reached, span: sess ? sess.values.span : null, trialCount: sess ? sess.trialCount : null };
}

async function checkDigitSpan(browser, app) {
  const checks = [];
  const add = (name, pass, detail) => checks.push({ name, pass, detail });

  // 정답봇 — 거꾸로 입력, 정상 진행(축약 모드 최대 길이까지)
  const ok = await playDigitSpan(browser, urlFor(app.dir, 'ko'), app.id, true);
  add('정답봇(거꾸로) 결과 도달', ok.reached, ok.reached ? 'ok' : `${RUN_TIMEOUT}ms 내 요약 없음`);
  add('정답봇 JS 에러 없음', ok.errors.length === 0, ok.errors.length ? ok.errors.slice(0, 3).join(' / ') : 'none');
  add(`정답봇 적응형 스팬=${QA_SPAN}(2→…→${QA_SPAN})`, ok.span === QA_SPAN && ok.trialCount === QA_TRIALS, `span=${ok.span}·trials=${ok.trialCount}`);

  // 오답봇 — '바로'(정순) 입력 → 거꾸로가 아니라 즉시 실패(스팬 0, 2시행). 뒤집기 로직 회귀 가드.
  const no = await playDigitSpan(browser, urlFor(app.dir, 'ko'), app.id, false);
  add('오답봇(정순=거꾸로 아님) 즉시 실패', no.reached && no.errors.length === 0 && no.span === 0 && no.trialCount === 2,
    `도달=${no.reached}·에러${no.errors.length}·span=${no.span}·trials=${no.trialCount}`);

  return { id: app.id, checks };
}

// ── 단순 반응속도 점검 (판단 없음 — 초록으로 바뀌면 누르기) ──────────────
// 정답봇: 초록 뒤 350ms 누름 → 유효(중앙값 ~350). 오답 3종을 각각 실측:
//   early        : 자극(초록) 전에 누름 → 조기 반응으로 잡히는가
//   anticipation : 초록 뒤 100ms(=<150ms) 누름 → 예측으로 무효 처리되는가
//   noPress      : 아예 안 누름 → 시간초과로 잡히고 행(hang) 없이 끝나는가
// 시행 경계는 진행표시(cog-progress) 변화로, 자극은 .srt-circle.go 로 감지.
function installSRTBot(strategy) {
  const st = { prog: '', greenAt: 0, pressedThis: false };
  const press = () => { const w = document.querySelector('.srt-wrap'); if (w) w.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' })); };
  window.__srtTimer = setInterval(() => {
    const panel = document.getElementById('cog-panel');
    if (panel && !panel.hidden && panel.querySelector('.summary')) return;
    const circle = document.querySelector('.srt-circle');
    const progEl = document.getElementById('cog-progress');
    if (!circle || !progEl) return;
    const prog = progEl.textContent;
    if (prog !== st.prog) {               // 새 시행(진행표시 변화)
      st.prog = prog; st.pressedThis = false; st.greenAt = 0;
      if (strategy === 'early') {         // 대기 중(최소 1000ms) 조기 누름
        st.pressedThis = true;
        setTimeout(press, 400);
      }
    }
    const go = circle.classList.contains('go');
    if (go && !st.greenAt) {              // 초록 상승엣지
      st.greenAt = performance.now();
      if (!st.pressedThis && (strategy === 'correct' || strategy === 'anticipation')) {
        st.pressedThis = true;
        setTimeout(press, strategy === 'correct' ? 350 : 100); // 100ms → <150 예측
      }
    }
    if (!go && st.greenAt) st.greenAt = 0;
    // noPress: 아무 것도 안 누름
  }, 25);
}

async function playSRT(browser, url, id, strategy) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate((i) => { try { localStorage.removeItem('cog:' + i + ':sessions'); } catch {} }, id);
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#cog-action', { timeout: 15000 });
  await page.evaluate(installSRTBot, strategy);
  const t0 = Date.now();
  let reached = false;
  while (Date.now() - t0 < RUN_TIMEOUT) {
    const st = await page.evaluate(() => {
      const panel = document.getElementById('cog-panel');
      return { visible: panel && !panel.hidden, hasSummary: !!(panel && panel.querySelector('.summary')),
        hasAction: !!(panel && panel.querySelector('#cog-action')) };
    });
    if (st.visible && st.hasSummary) { reached = true; break; }
    if (st.visible && st.hasAction && !st.hasSummary) { await page.click('#cog-action').catch(() => {}); await sleep(120); }
    await sleep(100);
  }
  // 요약 값을 순서대로 읽는다: [중앙값, 평균, 최소, 조기, 시간초과].
  // 값은 <b> 의 첫 텍스트노드(예: "365 ms"/"—")만 — 뒤의 (N문항) count 스팬의 숫자를 잡지 않도록.
  const vals = reached ? await page.evaluate(() =>
    [...document.querySelectorAll('#cog-panel .summary .row b')].map((b) => {
      const txt = b.firstChild ? b.firstChild.textContent : b.textContent;
      const m = txt.match(/-?\d+/); return m ? parseInt(m[0], 10) : null;
    })) : [];
  await page.close();
  return { errors, reached, vals };
}

async function checkSRT(browser, app) {
  const checks = [];
  const add = (name, pass, detail) => checks.push({ name, pass, detail });
  const url = (s) => urlFor(app.dir, 'ko');

  const c = await playSRT(browser, url(), app.id, 'correct');
  add('정답봇 결과 도달', c.reached, c.reached ? 'ok' : `${RUN_TIMEOUT}ms 내 요약 없음`);
  add('정답봇 JS 에러 없음', c.errors.length === 0, c.errors.length ? c.errors.slice(0, 3).join(' / ') : 'none');
  add('정답봇 유효 반응(중앙값 150~1500ms·조기0·초과0)',
    c.reached && c.vals[0] != null && c.vals[0] >= 150 && c.vals[0] <= 1500 && c.vals[3] === 0 && c.vals[4] === 0,
    `중앙값=${c.vals[0]}·조기=${c.vals[3]}·초과=${c.vals[4]}`);

  const e = await playSRT(browser, url(), app.id, 'early');
  add('조기 반응 잡힘(조기≥1·유효0)',
    e.reached && e.errors.length === 0 && e.vals[3] >= 1 && e.vals[0] === null, `조기=${e.vals[3]}·중앙값=${e.vals[0]}`);

  const a = await playSRT(browser, url(), app.id, 'anticipation');
  add('예측(100ms) 무효(조기≥1·유효0)',
    a.reached && a.errors.length === 0 && a.vals[3] >= 1 && a.vals[0] === null, `조기=${a.vals[3]}·중앙값=${a.vals[0]}`);

  const n = await playSRT(browser, url(), app.id, 'noPress');
  add('안 누름=시간초과·행 없음(초과≥1·유효0)',
    n.reached && n.errors.length === 0 && n.vals[4] >= 1 && n.vals[0] === null, `초과=${n.vals[4]}·도달=${n.reached}`);

  return { id: app.id, checks };
}

// ── 사이먼 점검 (스트룹과 같은 기본 경로 — 색 버튼 2개, 좌우 자극) ──────────
// color   : 도형 색과 같은 버튼(정답봇) → 정확도 100%, 사이먼 효과 ~0(봇은 위치에 안 끌림)
// position: 도형이 있는 쪽 버튼(색 무시) → 일치 정답·불일치 오답 = 정확도 정확히 50%,
//           불일치 유효RT 없음('—'), 저정확도 경고 뜸
// fixed   : 항상 한 버튼(파랑) → 색이 반반이라 정확도 50%, 저정확도 경고 뜸(무작위/부주의 대역)
function installSimonBot(strategy) {
  window.__seen = new Set();
  window.__simonTimer = setInterval(() => {
    const pad = document.getElementById('cog-pad');
    const stim = document.getElementById('cog-stimulus');
    const prog = document.getElementById('cog-progress');
    if (!pad || !stim || pad.hidden || !pad.classList.contains('live')) return;
    if (!stim.querySelector('.simon-dot')) return;
    const key = prog ? prog.textContent : String(Date.now());
    if (window.__seen.has(key)) return;
    window.__seen.add(key);
    setTimeout(() => {
      const p = document.getElementById('cog-pad');
      if (!p || !p.classList.contains('live')) return;
      const dot = document.getElementById('cog-stimulus').querySelector('.simon-dot');
      if (!dot) return;
      const buttons = [...p.querySelectorAll('.choice')]; // [0]=왼쪽(파랑), [1]=오른쪽(노랑)
      let target;
      if (strategy === 'color') target = buttons.find((b) => b.dataset.choice === dot.dataset.color);
      else if (strategy === 'fixed') target = buttons[0];
      else { // position: 도형이 화면 중앙보다 왼쪽이면 왼쪽 버튼
        const r = dot.getBoundingClientRect();
        target = (r.left + r.width / 2) < window.innerWidth / 2 ? buttons[0] : buttons[1];
      }
      if (target) target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }));
    }, 350);
  }, 20);
}

async function playSimon(browser, url, id, strategy) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate((i) => { try { localStorage.removeItem('cog:' + i + ':sessions'); } catch {} }, id);
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#cog-action', { timeout: 15000 });
  await page.evaluate(installSimonBot, strategy);
  const t0 = Date.now();
  let reached = false;
  while (Date.now() - t0 < RUN_TIMEOUT) {
    const st = await page.evaluate(() => {
      const panel = document.getElementById('cog-panel');
      return { visible: panel && !panel.hidden, hasSummary: !!(panel && panel.querySelector('.summary')),
        hasAction: !!(panel && panel.querySelector('#cog-action')) };
    });
    if (st.visible && st.hasSummary) { reached = true; break; }
    if (st.visible && st.hasAction && !st.hasSummary) { await page.click('#cog-action').catch(() => {}); await sleep(120); }
    await sleep(100);
  }
  const acc = reached ? ((await readSessions(page, id)).slice(-1)[0] || {}).acc : null;
  const info = reached ? await page.evaluate(() => {
    const panel = document.getElementById('cog-panel');
    const rowVal = (i) => { const b = panel.querySelectorAll('.summary .row b')[i];
      const txt = b && b.firstChild ? b.firstChild.textContent : (b ? b.textContent : '');
      const m = txt.match(/-?\d+/); return m ? parseInt(m[0], 10) : null; };
    return { topNotes: panel.querySelectorAll('.top-note').length, incong: rowVal(2) }; // 요약 3행째=불일치 RT
  }) : { topNotes: 0, incong: null };
  await page.close();
  return { errors, reached, acc, topNotes: info.topNotes, incong: info.incong };
}

async function checkSimon(browser, app) {
  const checks = [];
  const add = (name, pass, detail) => checks.push({ name, pass, detail });

  // 색봇(정답) — 색으로 정확히 답함
  const c = await playSimon(browser, urlFor(app.dir, 'ko'), app.id, 'color');
  add('색봇 결과 도달', c.reached, c.reached ? 'ok' : `${RUN_TIMEOUT}ms 내 요약 없음`);
  add('색봇 JS 에러 없음', c.errors.length === 0, c.errors.length ? c.errors.slice(0, 3).join(' / ') : 'none');
  add('색봇 정확도 100%(위치에 안 끌림)', c.reached && c.acc === 1, `acc=${Math.round((c.acc ?? 0) * 100)}%·경고배너=${c.topNotes}`);

  // 위치봇 — 위치대로 누름(색 무시): 일치 정답·불일치 오답 → 정확도 정확히 50%·불일치RT 없음·경고
  const p = await playSimon(browser, urlFor(app.dir, 'ko'), app.id, 'position');
  add('위치봇: 정확도 50%·불일치 RT 없음·저정확도 경고',
    p.reached && p.errors.length === 0 && p.acc === 0.5 && p.incong === null && p.topNotes >= 3,
    `acc=${Math.round((p.acc ?? 0) * 100)}%·불일치RT=${p.incong}·경고배너=${p.topNotes}`);

  // 저정확도봇(한 버튼 고정) — 색 반반이라 50% → 저정확도 경고 뜨는가
  const f = await playSimon(browser, urlFor(app.dir, 'ko'), app.id, 'fixed');
  add('저정확도 경고 뜸(정확도<90%)',
    f.reached && f.errors.length === 0 && f.acc < 0.9 && f.topNotes >= 3,
    `acc=${Math.round((f.acc ?? 0) * 100)}%·경고배너=${f.topNotes}`);

  return { id: app.id, checks };
}

// ── 멈추기(Stop-signal) 점검 ───────────────────────────────────────────
// correct : 화살표 표시 350ms 후, 이미 빨강(멈춤 신호)이면 참고 아니면 방향대로 누름
//           → stop 은 SSD 낮을 때만 멈춤 성공 → 계단식이 양방향으로 움직여 성공률 0<..<100.
// wrong   : 빨강을 무시하고 항상 방향대로 누름 → stop 전부 실패(성공률 0), SSD 계속 하강.
function installStopBot(strategy) {
  window.__seen = new Set();
  window.__ssTimer = setInterval(() => {
    const panel = document.getElementById('cog-panel');
    if (panel && !panel.hidden && panel.querySelector('.summary')) return;
    const arrow = document.querySelector('.ss-arrow');
    const prog = document.getElementById('cog-progress');
    if (!arrow || !arrow.dataset.dir) return;         // 화살표 표시 중일 때만
    const key = (prog ? prog.textContent : '') + '|' + arrow.dataset.dir;
    if (window.__seen.has(key)) return;
    window.__seen.add(key);
    setTimeout(() => {
      const a = document.querySelector('.ss-arrow');
      if (!a || !a.dataset.dir) return;
      if (strategy === 'correct' && a.classList.contains('stop')) return; // 멈춤 신호 보이면 참음
      const btn = document.querySelector('.ss-key[data-dir="' + a.dataset.dir + '"]');
      if (btn && !btn.disabled) btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }));
    }, 350);
  }, 20);
}

async function playStop(browser, url, id, strategy) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate((i) => { try { localStorage.removeItem('cog:' + i + ':sessions'); } catch {} }, id);
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#cog-action', { timeout: 15000 });
  await page.evaluate(installStopBot, strategy);
  const t0 = Date.now();
  let reached = false;
  while (Date.now() - t0 < RUN_TIMEOUT) {
    const st = await page.evaluate(() => {
      const panel = document.getElementById('cog-panel');
      return { visible: panel && !panel.hidden, hasSummary: !!(panel && panel.querySelector('.summary')),
        hasAction: !!(panel && panel.querySelector('#cog-action')) };
    });
    if (st.visible && st.hasSummary) { reached = true; break; }
    if (st.visible && st.hasAction && !st.hasSummary) { await page.click('#cog-action').catch(() => {}); await sleep(120); }
    await sleep(100);
  }
  const info = reached ? await page.evaluate(() => {
    const panel = document.getElementById('cog-panel');
    const val = (i) => { const b = panel.querySelectorAll('.summary .row b')[i];
      const txt = b && b.firstChild ? b.firstChild.textContent : (b ? b.textContent : '');
      const m = txt.match(/-?\d+/); return m ? parseInt(m[0], 10) : null; };
    return { goMedian: val(0), stopRate: val(2), spark: !!panel.querySelector('.ss-spark svg') };
  }) : { goMedian: null, stopRate: null, spark: false };
  await page.close();
  return { errors, reached, ...info };
}

async function checkStopSignal(browser, app) {
  const checks = [];
  const add = (name, pass, detail) => checks.push({ name, pass, detail });

  const c = await playStop(browser, urlFor(app.dir, 'ko'), app.id, 'correct');
  add('정답봇 결과 도달', c.reached, c.reached ? 'ok' : `${RUN_TIMEOUT}ms 내 요약 없음`);
  add('정답봇 JS 에러 없음', c.errors.length === 0, c.errors.length ? c.errors.slice(0, 3).join(' / ') : 'none');
  add('Go RT 기록·멈춤 계단식 수렴(0<성공률<100)',
    c.reached && c.goMedian != null && c.goMedian >= 100 && c.stopRate != null && c.stopRate > 0 && c.stopRate < 100,
    `GoRT=${c.goMedian}·멈춤성공률=${c.stopRate}%`);
  add('SSD 궤적 스파크라인(extraHtml) 렌더', c.reached && c.spark, `spark=${c.spark}`);

  const w = await playStop(browser, urlFor(app.dir, 'ko'), app.id, 'wrong');
  add('오답봇(stop 무시): 멈춤 성공률 0·행 없음',
    w.reached && w.errors.length === 0 && w.goMedian != null && w.stopRate === 0,
    `도달=${w.reached}·에러${w.errors.length}·GoRT=${w.goMedian}·멈춤성공률=${w.stopRate}%`);

  return { id: app.id, checks };
}

// ── 잔상 데모(afterimage) 점검 — 판정 없는 데모. 색선택→응시→(타이머 자동전환)→관찰→설명 스모크 ──
// 주관적 잔상 지각은 QA 대상 아님. '타이머가 실제로 끝나고 회색으로 전환되며 고정점이 유지되는지'만 본다.
async function checkAfterimage(browser, app) {
  const checks = [];
  const add = (n, p, d) => checks.push({ name: n, pass: p, detail: d });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  await page.goto(urlFor(app.dir, 'ko'), { waitUntil: 'load' }); // urlFor 이 ?qa=1 → FIXATE_MS=800
  await sleep(150);
  const sel = await page.evaluate(() => ({
    colors: document.querySelectorAll('.ai-color').length,
    instr: ((document.querySelector('.ai-instruction') || {}).textContent || '').length,
    langs: document.querySelectorAll('.langbtn').length,
  }));
  add('색 선택 화면·색버튼 3·안내문', sel.colors === 3 && sel.instr > 20, JSON.stringify(sel));
  add('언어 버튼 4개', sel.langs === 4, `langbtn=${sel.langs}`);
  await page.click('.ai-color[data-c="red"]').catch(() => {});
  await sleep(100);
  const fx = await page.evaluate(() => {
    const p = document.querySelector('.ai-patch');
    return { patch: !!p, bg: p ? getComputedStyle(p).backgroundColor : null, bar: !!document.querySelector('.ai-bar-fill'), fix: !!document.querySelector('.ai-fix') };
  });
  add('응시 단계: 빨강 패치·고정점·타이머 바', fx.patch && /255,\s*0,\s*0/.test(fx.bg || '') && fx.bar && fx.fix, JSON.stringify(fx));
  await sleep(1200); // QA 타이머(0.8초) 종료 + 여유
  const ob = await page.evaluate(() => {
    const p = document.querySelector('.ai-patch');
    return { patch: !!p, gray: p ? getComputedStyle(p).backgroundColor : null, reports: document.querySelectorAll('.ai-report').length, fix: !!document.querySelector('.ai-fix') };
  });
  add('타이머 자동 전환→관찰(회색 패치·고정점 유지·보고버튼 5)', ob.patch && /217,\s*217,\s*217/.test(ob.gray || '') && ob.reports === 5 && ob.fix, JSON.stringify(ob));
  await page.click('.ai-report[data-r="cyan"]').catch(() => {});
  await sleep(120);
  const ex = await page.evaluate(() => ({ has: ((document.querySelector('.ai-explain-body') || {}).textContent || '').length > 40, vs: !!document.querySelector('.ai-vs'), patchGone: !document.querySelector('.ai-patch') }));
  add('보고→설명(원리·이전 대비)·데모 벗어남', ex.has && ex.vs && ex.patchGone, JSON.stringify(ex));
  add('JS 에러 없음', errors.length === 0, errors.length ? errors.slice(0, 3).join(' / ') : 'none');
  await page.close();
  return { id: app.id, checks };
}

// ── 부주의맹 데모(inattentional-blindness) 점검 — 판정 없는 데모. 두 경로만 스모크 ──
// 부주의맹은 '처음 볼 때만' 효과가 있어, 완료 기록(ib_demo_completed)이 있으면 counting 을 재생하지
// 않고 곧바로 설명(revisit)으로 간다. 주관적 지각(놓쳤는지)은 QA 대상 아님 — 분기 두 개만 확인:
//   1) 완료 기록 없음 → intro 진입(시작 버튼·안내문 있고, counting/자극은 아직 아님)
//   2) ib_demo_completed='1' 세팅+새로고침 → revisit 직행(counting/stage-box·시작 버튼 렌더 안 됨)
async function checkIb(browser, app) {
  const checks = [];
  const add = (n, p, d) => checks.push({ name: n, pass: p, detail: d });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });

  // 경로 1 — 완료 기록을 지우고 처음부터: intro 진입해야 한다.
  await page.goto(urlFor(app.dir, 'ko'), { waitUntil: 'load' });
  await page.evaluate(() => { try { localStorage.removeItem('ib_demo_completed'); } catch {} });
  await page.reload({ waitUntil: 'load' });
  await sleep(150);
  const intro = await page.evaluate(() => ({
    start: !!document.querySelector('[data-act="start"]'),
    instr: ((document.querySelector('.ib-instruction') || {}).textContent || '').length,
    counting: !!document.querySelector('.ib-stage-box'),   // 아직 렌더되면 안 됨
    langs: document.querySelectorAll('.langbtn').length,
  }));
  add('첫 방문: intro 진입(시작 버튼·안내문, counting 아직 아님)',
    intro.start && intro.instr > 20 && !intro.counting, JSON.stringify(intro));
  add('언어 버튼 4개', intro.langs === 4, `langbtn=${intro.langs}`);

  // 경로 2 — 완료 기록을 세팅하고 새로고침: revisit 로 직행(counting 렌더 안 됨).
  await page.evaluate(() => { try { localStorage.setItem('ib_demo_completed', '1'); } catch {} });
  await page.reload({ waitUntil: 'load' });
  await sleep(150);
  const rev = await page.evaluate(() => ({
    explain: ((document.querySelector('.ib-explain-body') || {}).textContent || '').length,
    vs: !!document.querySelector('.ib-vs'),
    counting: !!document.querySelector('.ib-stage-box'),   // revisit 엔 없어야 함
    start: !!document.querySelector('[data-act="start"]'), // intro 도 아님
  }));
  add('완료 기록 → revisit 직행(설명 표시·counting/intro 렌더 안 됨)',
    rev.explain > 40 && rev.vs && !rev.counting && !rev.start, JSON.stringify(rev));
  add('JS 에러 없음', errors.length === 0, errors.length ? errors.slice(0, 3).join(' / ') : 'none');
  await page.close();
  return { id: app.id, checks };
}

// ── 정서 스트룹(emo-stroop) 점검 — 색 명명 정답=잉크색과 같은 배경색 버튼. 두 게이트 독립 확인 ──
// 정답봇: 전부 정답 → 경고 안 뜸 + 간섭 숫자. 오답봇: 조건당 첫 본시행 1개만 오답 → 정확도<90%(경고 O)
// 이지만 조건별 유효시행은 ≥6 유지 → 간섭도 숫자(정확도 게이트와 정서효과 게이트가 안 섞임을 못박음).
// 아무때나봇: 무작위 응답 → JS 에러 없이 끝까지. 판정값은 window.__emoLast(analyze QA 노출)로 직접 단언.
function installEmoStroopBot(strategy) {
  window.__seen = new Set();
  window.__wrongDone = new Set();
  window.__emoTimer = setInterval(() => {
    const pad = document.getElementById('cog-pad');
    const stim = document.getElementById('cog-stimulus');
    const prog = document.getElementById('cog-progress');
    if (!pad || !stim || pad.hidden || !pad.classList.contains('live')) return;
    const key = prog ? prog.textContent : String(Date.now());
    if (window.__seen.has(key)) return;
    window.__seen.add(key);
    const cond = stim.dataset.cond || '', phase = stim.dataset.phase || '';
    let wrongThis = false;
    if (strategy === 'wrong' && phase === 'main' && cond && !window.__wrongDone.has(cond)) {
      window.__wrongDone.add(cond); wrongThis = true; // 조건당 정확히 1오답 → 정확도<90%, 유효≥6 유지
    }
    setTimeout(() => {
      const p = document.getElementById('cog-pad');
      if (!p || !p.classList.contains('live')) return;
      const ink = getComputedStyle(document.getElementById('cog-stimulus')).color;
      const btns = [...p.querySelectorAll('.choice')];
      const correctBtn = btns.find((b) => getComputedStyle(b).backgroundColor === ink);
      const wrongBtn = btns.find((b) => getComputedStyle(b).backgroundColor !== ink);
      let target = correctBtn;
      if (strategy === 'anytime') target = btns[Math.floor(Math.random() * btns.length)];
      else if (strategy === 'wrong' && wrongThis) target = wrongBtn;
      if (target) target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }));
    }, 350); // 페이지 컨텍스트 주입이라 RESPOND_MS(모듈 상수) 못 씀 — Simon·Stop 봇처럼 350 하드코딩
  }, 20);
}

async function playEmoStroop(browser, url, id, strategy) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate((i) => { try { localStorage.removeItem('cog:' + i + ':sessions'); } catch {} }, id);
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#cog-action', { timeout: 15000 });
  await page.evaluate(installEmoStroopBot, strategy);
  const t0 = Date.now();
  let reached = false;
  while (Date.now() - t0 < RUN_TIMEOUT) {
    const st = await page.evaluate(() => {
      const panel = document.getElementById('cog-panel');
      return { visible: panel && !panel.hidden, hasSummary: !!(panel && panel.querySelector('.summary')),
        hasAction: !!(panel && panel.querySelector('#cog-action')) };
    });
    if (st.visible && st.hasSummary) { reached = true; break; }
    if (st.visible && st.hasAction && !st.hasSummary) { await page.click('#cog-action').catch(() => {}); await sleep(120); }
    await sleep(100);
  }
  const last = reached ? await page.evaluate(() => window.__emoLast || null) : null;
  await page.close();
  return { errors, reached, last };
}

async function checkEmoStroop(browser, app) {
  const checks = [];
  const add = (n, p, d) => checks.push({ name: n, pass: p, detail: d });

  const c = await playEmoStroop(browser, urlFor(app.dir, 'ko'), app.id, 'correct');
  add('정답봇 결과 도달', c.reached, c.reached ? 'ok' : `${RUN_TIMEOUT}ms 내 요약 없음`);
  add('정답봇 JS 에러 없음', c.errors.length === 0, c.errors.length ? c.errors.slice(0, 3).join(' / ') : 'none');
  add('정답봇: 정확도 경고 안 뜸 + 간섭 숫자 표시',
    !!c.last && c.last.lowAcc === false && c.last.negInt != null && c.last.posInt != null,
    c.last ? `경고=${c.last.lowAcc}·부정간섭=${c.last.negInt}·긍정간섭=${c.last.posInt}·유효[${c.last.neuCount},${c.last.posCount},${c.last.negCount}]` : '값 없음');

  const w = await playEmoStroop(browser, urlFor(app.dir, 'ko'), app.id, 'wrong');
  add('오답봇 결과 도달·JS 에러 없음', w.reached && w.errors.length === 0, `도달=${w.reached}·에러${w.errors.length}`);
  add('오답봇: 정확도<90% 경고 O · 간섭 표시 O (두 게이트 독립)',
    !!w.last && w.last.acc < 0.9 && w.last.lowAcc === true && w.last.negInt != null && w.last.posInt != null,
    w.last ? `정확도=${Math.round(w.last.acc * 100)}%·경고=${w.last.lowAcc}·부정간섭=${w.last.negInt}·긍정간섭=${w.last.posInt}` : '값 없음');

  const a = await playEmoStroop(browser, urlFor(app.dir, 'ko'), app.id, 'anytime');
  add('아무때나봇: JS 에러 없이 결과 도달', a.reached && a.errors.length === 0, `도달=${a.reached}·에러${a.errors.length}`);

  return { id: app.id, checks };
}

// ── 정서 점탐사(emo-dotprobe) 점검 — 프로브가 나온 쪽을 맞히는 위치 응답. 두 게이트 독립 확인 ──
// 정답봇: 항상 프로브쪽(arena.dataset.probe) → 경고 안 뜸 + 편향 숫자. 오답봇: 셀당 첫 본시행 1개만
// 반대쪽 → 정확도<90%(경고 O)이나 셀별 유효 ≥6 유지 → 편향도 숫자(정확도 게이트와 편향 게이트 독립).
// 아무때나봇: 무작위 좌/우 → JS 에러 없이 끝까지. 판정값은 window.__dpLast(analyze QA 노출)로 직접 단언.
function installEmoDotprobeBot(strategy) {
  window.__seen = new Set();
  window.__wrongDone = new Set();
  window.__dpTimer = setInterval(() => {
    const arena = document.querySelector('.dp-arena');
    const btns = [...document.querySelectorAll('.dp-btn')];
    if (!arena || !btns.length || btns.every((b) => b.disabled)) return; // 응답창 아닐 때(응시·단어·피드백)
    const seq = arena.dataset.seq || '';
    if (!seq || window.__seen.has(seq)) return;
    window.__seen.add(seq);
    const probe = arena.dataset.probe || '', cell = arena.dataset.cell || '', phase = arena.dataset.phase || '';
    let wrongThis = false;
    if (strategy === 'wrong' && phase === 'main' && cell && !window.__wrongDone.has(cell)) {
      window.__wrongDone.add(cell); wrongThis = true; // 셀당 정확히 1오답 → 정확도<90%, 유효≥6 유지
    }
    setTimeout(() => {
      const bs = [...document.querySelectorAll('.dp-btn')];
      if (!bs.length || bs.every((b) => b.disabled)) return; // 이미 지나감(시간초과)
      const otherSide = probe === 'left' ? 'right' : 'left';
      let side = probe;
      if (strategy === 'anytime') side = Math.random() < 0.5 ? 'left' : 'right';
      else if (strategy === 'wrong' && wrongThis) side = otherSide;
      const b = bs.find((x) => x.dataset.side === side);
      if (b && !b.disabled) b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }));
    }, 350); // 페이지 컨텍스트라 RESPOND_MS 못 씀 — 350 하드코딩
  }, 20);
}

async function playEmoDotprobe(browser, url, id, strategy) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate((i) => { try { localStorage.removeItem('cog:' + i + ':sessions'); } catch {} }, id);
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#cog-action', { timeout: 15000 });
  await page.evaluate(installEmoDotprobeBot, strategy);
  const t0 = Date.now();
  let reached = false;
  while (Date.now() - t0 < RUN_TIMEOUT) {
    const st = await page.evaluate(() => {
      const panel = document.getElementById('cog-panel');
      return { visible: panel && !panel.hidden, hasSummary: !!(panel && panel.querySelector('.summary')),
        hasAction: !!(panel && panel.querySelector('#cog-action')) };
    });
    if (st.visible && st.hasSummary) { reached = true; break; }
    if (st.visible && st.hasAction && !st.hasSummary) { await page.click('#cog-action').catch(() => {}); await sleep(120); }
    await sleep(100);
  }
  const last = reached ? await page.evaluate(() => window.__dpLast || null) : null;
  await page.close();
  return { errors, reached, last };
}

async function checkEmoDotprobe(browser, app) {
  const checks = [];
  const add = (n, p, d) => checks.push({ name: n, pass: p, detail: d });

  const c = await playEmoDotprobe(browser, urlFor(app.dir, 'ko'), app.id, 'correct');
  add('정답봇 결과 도달', c.reached, c.reached ? 'ok' : `${RUN_TIMEOUT}ms 내 요약 없음`);
  add('정답봇 JS 에러 없음', c.errors.length === 0, c.errors.length ? c.errors.slice(0, 3).join(' / ') : 'none');
  add('정답봇: 정확도 경고 안 뜸 + 편향 숫자 표시',
    !!c.last && c.last.lowAcc === false && c.last.negBias != null && c.last.posBias != null,
    c.last ? `경고=${c.last.lowAcc}·부정편향=${c.last.negBias}·긍정편향=${c.last.posBias}·유효=${JSON.stringify(c.last.counts)}` : '값 없음');

  const w = await playEmoDotprobe(browser, urlFor(app.dir, 'ko'), app.id, 'wrong');
  add('오답봇 결과 도달·JS 에러 없음', w.reached && w.errors.length === 0, `도달=${w.reached}·에러${w.errors.length}`);
  add('오답봇: 정확도<90% 경고 O · 편향 표시 O (두 게이트 독립)',
    !!w.last && w.last.acc < 0.9 && w.last.lowAcc === true && w.last.negBias != null && w.last.posBias != null,
    w.last ? `정확도=${Math.round(w.last.acc * 100)}%·경고=${w.last.lowAcc}·부정편향=${w.last.negBias}·긍정편향=${w.last.posBias}` : '값 없음');

  const a = await playEmoDotprobe(browser, urlFor(app.dir, 'ko'), app.id, 'anytime');
  add('아무때나봇: JS 에러 없이 결과 도달', a.reached && a.errors.length === 0, `도달=${a.reached}·에러${a.errors.length}`);

  return { id: app.id, checks };
}

// ── 네커 큐브 데모(necker-cube) 점검 — 판정 없는 데모라 로드·요소·버튼 동작만(스모크) ──
async function checkNeckerCube(browser, app) {
  const checks = [];
  const add = (n, p, d) => checks.push({ name: n, pass: p, detail: d });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  await page.goto(urlFor(app.dir, 'ko'), { waitUntil: 'load' });
  await sleep(150);
  const st = await page.evaluate(() => ({
    instr: ((document.querySelector('.nc-instruction') || {}).textContent || '').length,
    cube: !!document.querySelector('.nc-cube'),
    lines: document.querySelectorAll('.nc-cube line').length,
    reports: document.querySelectorAll('.nc-report').length,
    toEx: !!document.querySelector('.nc-toexplain'),
    langs: document.querySelectorAll('.langbtn').length,
  }));
  add('화면 로드·안내문·큐브(12선)·보고버튼2·설명버튼', st.instr > 20 && st.cube && st.lines === 12 && st.reports === 2 && st.toEx, JSON.stringify(st));
  add('언어 버튼 4개', st.langs === 4, `langbtn=${st.langs}`);
  await page.click('.nc-report[data-opt="a"]').catch(() => {});
  await sleep(80);
  const c1 = await page.evaluate(() => ({ count: !!document.querySelector('.nc-count'), cube: !!document.querySelector('.nc-cube') }));
  add('보고 버튼→카운트 표시·큐브 유지(관찰 안 끊김)', c1.count && c1.cube, JSON.stringify(c1));
  await page.click('.nc-toexplain').catch(() => {});
  await sleep(120);
  const ex = await page.evaluate(() => ({ has: ((document.querySelector('.nc-explain') || {}).textContent || '').length > 40, vs: !!document.querySelector('.nc-vs'), cubeGone: !document.querySelector('.nc-cube') }));
  add('설명 버튼→원리 설명(맹점 대비)·데모 벗어남', ex.has && ex.vs && ex.cubeGone, JSON.stringify(ex));
  add('JS 에러 없음', errors.length === 0, errors.length ? errors.slice(0, 3).join(' / ') : 'none');
  await page.close();
  return { id: app.id, checks };
}

// ── 맹점 데모(blindspot) 점검 — 판정 없는 데모라 로드·요소·버튼 동작만(스모크) ──
async function checkBlindspot(browser, app) {
  const checks = [];
  const add = (n, p, d) => checks.push({ name: n, pass: p, detail: d });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  await page.goto(urlFor(app.dir, 'ko'), { waitUntil: 'load' });
  await sleep(150);
  const st = await page.evaluate(() => ({
    instr: ((document.querySelector('.bs-instruction') || {}).textContent || '').length,
    cross: (document.querySelector('.bs-cross') || {}).textContent === '+',
    dot: !!document.querySelector('.bs-dot'),
    yes: !!document.querySelector('.bs-btn[data-a="yes"]'),
    no: !!document.querySelector('.bs-btn[data-a="no"]'),
    toggle: !!document.querySelector('.bs-toggle'),
    langs: document.querySelectorAll('.langbtn').length,
  }));
  add('화면 로드·안내문·십자가·점·버튼 존재', st.instr > 20 && st.cross && st.dot && st.yes && st.no && st.toggle, JSON.stringify(st));
  add('언어 버튼 4개', st.langs === 4, `langbtn=${st.langs}`);
  await page.click('.bs-btn[data-a="yes"]').catch(() => {});
  await sleep(150);
  const ex = await page.evaluate(() => ({ has: ((document.querySelector('.bs-explain') || {}).textContent || '').length > 40, gone: !document.querySelector('.bs-arena') }));
  add('예 클릭→설명(맹점 원리) 전환', ex.has && ex.gone, JSON.stringify(ex));
  await page.click('.bs-btn[data-act="again"]').catch(() => {});
  await sleep(120);
  const b = await page.evaluate(() => document.querySelector('.bs-cross').style.left);
  await page.click('.bs-toggle').catch(() => {});
  await sleep(120);
  const a = await page.evaluate(() => document.querySelector('.bs-cross').style.left);
  add('반대편 눈 토글로 배치 반전', b !== a && !!a, `cross ${b} → ${a}`);
  add('JS 에러 없음', errors.length === 0, errors.length ? errors.slice(0, 3).join(' / ') : 'none');
  await page.close();
  return { id: app.id, checks };
}

// ── 주의 순간멈춤(Attentional Blink) 점검 ──────────────────────────────
// 봇은 `.ab-wrap[data-t1/data-t2]`(?qa=1 전용, 사람이 스트림에서 얻는 정보)를 읽어 Q1·Q2 응답.
//   correct: 숫자·X유무 그대로 → 근접·여유·캐치 다 정답률 높음.
//   wrong  : 항상 다르게 → 숫자·T2 종합 정답률 낮음.
//   anytime: 무작위 → 숫자 우연(~12.5%, 8지선다)·T2 종합 우연(~50%).
function installAblinkBot(strategy) {
  window.__seen = new Set();
  window.__abTimer = setInterval(() => {
    const panel = document.getElementById('cog-panel');
    if (panel && !panel.hidden && panel.querySelector('.summary')) return;
    const wrap = document.querySelector('.ab-wrap');
    const resp = document.querySelector('.ab-response');
    if (!wrap || !resp || resp.hidden || !resp.dataset.q) return;   // 응답 페이즈일 때만
    const seq = wrap.dataset.seq || '', q = resp.dataset.q;
    const key = seq + '|' + q;
    if (window.__seen.has(key)) return;
    window.__seen.add(key);
    setTimeout(() => {
      const r = document.querySelector('.ab-response');
      if (!r || r.hidden || r.dataset.q !== q) return;
      if (q === '1') {
        const t1 = parseInt(wrap.dataset.t1, 10);
        let d;
        if (strategy === 'correct') d = t1;
        else if (strategy === 'wrong') d = (t1 === 9 ? 8 : t1 + 1);   // 확실히 다른 숫자
        else { const o = [2,3,4,5,6,7,8,9]; d = o[Math.floor(Math.random() * o.length)]; }
        const b = r.querySelector('.ab-q1btn[data-digit="' + d + '"]');
        if (b) b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }));
      } else {
        const t2 = wrap.dataset.t2;                                   // 'present'|'absent'
        let ans;
        if (strategy === 'correct') ans = t2;
        else if (strategy === 'wrong') ans = (t2 === 'present' ? 'absent' : 'present');
        else ans = (Math.random() < 0.5 ? 'present' : 'absent');
        const b = r.querySelector('.ab-q2btn[data-resp="' + ans + '"]');
        if (b) b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }));
      }
    }, 150);
  }, 20);
}

async function playAblink(browser, url, id, strategy) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 900, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate((i) => { try { localStorage.removeItem('cog:' + i + ':sessions'); } catch {} }, id);
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#cog-action', { timeout: 15000 });
  await page.evaluate(installAblinkBot, strategy);
  const t0 = Date.now();
  let reached = false;
  while (Date.now() - t0 < RUN_TIMEOUT) {
    const st = await page.evaluate(() => {
      const panel = document.getElementById('cog-panel');
      return { visible: panel && !panel.hidden, hasSummary: !!(panel && panel.querySelector('.summary')),
        hasAction: !!(panel && panel.querySelector('#cog-action')) };
    });
    if (st.visible && st.hasSummary) { reached = true; break; }
    if (st.visible && st.hasAction && !st.hasSummary) { await page.click('#cog-action').catch(() => {}); await sleep(120); }
    await sleep(100);
  }
  const info = reached ? await page.evaluate(() => {
    const panel = document.getElementById('cog-panel');
    const last = window.__ablinkLast || {};
    return { t1Acc: last.t1Acc == null ? null : last.t1Acc, near: last.near == null ? null : last.near,
      far: last.far == null ? null : last.far, catch: last.catch == null ? null : last.catch,
      t2Overall: last.t2Overall == null ? null : last.t2Overall, overall: last.overall == null ? null : last.overall,
      chart: !!panel.querySelector('.ab-bars') };
  }) : { t1Acc: null, near: null, far: null, catch: null, t2Overall: null, overall: null, chart: false };
  await page.close();
  return { errors, reached, ...info };
}

async function checkAblink(browser, app) {
  const checks = [];
  const add = (name, pass, detail) => checks.push({ name, pass, detail });

  const c = await playAblink(browser, urlFor(app.dir, 'ko'), app.id, 'correct');
  add('정답봇 결과 도달', c.reached, c.reached ? 'ok' : `${RUN_TIMEOUT}ms 내 요약 없음`);
  add('정답봇 JS 에러 없음', c.errors.length === 0, c.errors.length ? c.errors.slice(0, 3).join(' / ') : 'none');
  add('정답봇: 숫자·근접·여유·캐치 정답률 높음·차트',
    c.reached && c.t1Acc != null && c.t1Acc >= 90 && c.near != null && c.near >= 90 && c.far != null && c.far >= 90 && c.catch != null && c.catch >= 90 && c.chart,
    `숫자=${c.t1Acc}%·근접=${c.near}%·여유=${c.far}%·캐치=${c.catch}%·차트=${c.chart}`);

  const w = await playAblink(browser, urlFor(app.dir, 'ko'), app.id, 'wrong');
  add('오답봇: 숫자·T2 종합 정답률 낮음',
    w.reached && w.errors.length === 0 && w.t1Acc != null && w.t1Acc <= 10 && w.t2Overall != null && w.t2Overall <= 10,
    `도달=${w.reached}·에러${w.errors.length}·숫자=${w.t1Acc}%·T2종합=${w.t2Overall}%`);

  const a = await playAblink(browser, urlFor(app.dir, 'ko'), app.id, 'anytime');
  add('아무때나봇: 숫자 우연(~12.5%)·T2 종합 우연(~50%)',
    a.reached && a.errors.length === 0 && a.t1Acc != null && a.t1Acc < 50 && a.t2Overall != null && a.t2Overall > 10 && a.t2Overall < 90,
    `숫자=${a.t1Acc}%·T2종합=${a.t2Overall}%`);

  return { id: app.id, checks };
}

// ── SART("무심코 누르는 순간") 점검 ────────────────────────────────────
// 봇은 `.sart-wrap[data-digit]`(?qa=1에서만 노출된, 사람이 보는 숫자)을 읽어 3이 아니면 누른다.
//   correct : 3만 빼고 누름 → 3 오류율0·반응정확도~100·RT흔들림 산출.
//   wrong   : 3에도 누름 → 3 오류율100(놓쳐 누름)·반응정확도~100.
//   anytime : 무작위 → 반응정확도 중간대(우연). 흰 화면 없음.
function installSARTBot(strategy) {
  window.__seen = new Set();
  window.__sartTimer = setInterval(() => {
    const panel = document.getElementById('cog-panel');
    if (panel && !panel.hidden && panel.querySelector('.summary')) return;
    const wrap = document.querySelector('.sart-wrap');
    if (!wrap || !wrap.dataset.seq) return;
    const key = wrap.dataset.seq;
    if (window.__seen.has(key)) return;
    window.__seen.add(key);
    const digit = parseInt(wrap.dataset.digit, 10);
    let press;
    if (strategy === 'correct') press = digit !== 3;
    else if (strategy === 'wrong') press = true;
    else press = Math.random() < 0.5;
    if (press) {
      const delay = 200 + Math.random() * 120; // RT>=200 유효 + 약간의 흔들림(RT SD 산출)
      setTimeout(() => { const b = document.querySelector('.sart-btn'); if (b) b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' })); }, delay);
    }
  }, 15);
}

async function playSART(browser, url, id, strategy) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate((i) => { try { localStorage.removeItem('cog:' + i + ':sessions'); } catch {} }, id);
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#cog-action', { timeout: 15000 });
  await page.evaluate(installSARTBot, strategy);
  const t0 = Date.now();
  let reached = false;
  while (Date.now() - t0 < RUN_TIMEOUT) {
    const st = await page.evaluate(() => {
      const panel = document.getElementById('cog-panel');
      return { visible: panel && !panel.hidden, hasSummary: !!(panel && panel.querySelector('.summary')),
        hasAction: !!(panel && panel.querySelector('#cog-action')) };
    });
    if (st.visible && st.hasSummary) { reached = true; break; }
    if (st.visible && st.hasAction && !st.hasSummary) { await page.click('#cog-action').catch(() => {}); await sleep(120); }
    await sleep(100);
  }
  const info = reached ? await page.evaluate(() => {
    const panel = document.getElementById('cog-panel');
    const last = window.__sartLast || {};
    return { targetErr: last.targetErr == null ? null : last.targetErr, goAcc: last.goAcc == null ? null : last.goAcc,
      rtSd: last.rtSd == null ? null : last.rtSd, overall: last.overall == null ? null : last.overall,
      spark: !!panel.querySelector('.sart-spark svg') };
  }) : { targetErr: null, goAcc: null, rtSd: null, overall: null, spark: false };
  await page.close();
  return { errors, reached, ...info };
}

async function checkSART(browser, app) {
  const checks = [];
  const add = (name, pass, detail) => checks.push({ name, pass, detail });

  const c = await playSART(browser, urlFor(app.dir, 'ko'), app.id, 'correct');
  add('정답봇 결과 도달', c.reached, c.reached ? 'ok' : `${RUN_TIMEOUT}ms 내 요약 없음`);
  add('정답봇 JS 에러 없음', c.errors.length === 0, c.errors.length ? c.errors.slice(0, 3).join(' / ') : 'none');
  add('정답봇: 3 오류율 0·반응정확도 높음·흔들림(RT SD) 산출·스파크',
    c.reached && c.targetErr === 0 && c.goAcc != null && c.goAcc >= 90 && c.rtSd != null && c.spark,
    `3오류율=${c.targetErr}%·반응정확도=${c.goAcc}%·RT흔들림=${c.rtSd}ms·spark=${c.spark}`);

  const w = await playSART(browser, urlFor(app.dir, 'ko'), app.id, 'wrong');
  add('오답봇: 3에도 반응→3 오류율 100·반응정확도 높음',
    w.reached && w.errors.length === 0 && w.targetErr === 100 && w.goAcc != null && w.goAcc >= 90,
    `도달=${w.reached}·에러${w.errors.length}·3오류율=${w.targetErr}%·반응정확도=${w.goAcc}%`);

  const a = await playSART(browser, urlFor(app.dir, 'ko'), app.id, 'anytime');
  add('아무때나봇: 무작위→반응정확도 중간대(우연, 완벽 아님)·흰 화면 없음',
    a.reached && a.errors.length === 0 && a.goAcc != null && a.goAcc > 10 && a.goAcc < 90,
    `도달=${a.reached}·에러${a.errors.length}·반응정확도=${a.goAcc}%·3오류율=${a.targetErr}%`);

  return { id: app.id, checks };
}

// ── 시각 탐색(Visual Search) 점검 ──────────────────────────────────────
// 봇은 `.vs-item[data-target="1"]`(빨간 원)이 있는지 '보고'(사람이 보는 것과 동일) 있음/없음 응답.
//   correct : 정확히 응답. 특징=일정 지연(항목수 무관→기울기 평탄) / 결합=항목수 비례 지연(직렬→양의 기울기).
//   wrong   : 늘 반대 → 정확도 0 → '있음·정답' 시행 없어 두 기울기 게이트 "—".
//   anytime : 무작위 → 우연(50%) 정확도 → 우연 수준 칸 경고, 흰 화면 없음.
function installVSearchBot(strategy) {
  window.__seen = new Set();
  window.__vsTimer = setInterval(() => {
    const panel = document.getElementById('cog-panel');
    if (panel && !panel.hidden && panel.querySelector('.summary')) return;
    const arena = document.querySelector('.vs-arena');
    const btns = [...document.querySelectorAll('.vs-btn')];
    if (!arena || btns.length < 2 || btns.some((b) => b.disabled)) return; // 응답 활성일 때만
    const key = arena.dataset.seq || '';
    if (!key || window.__seen.has(key)) return;
    window.__seen.add(key);
    const hasTarget = !!arena.querySelector('.vs-item[data-target="1"]');
    const type = arena.dataset.type;
    const ss = parseInt(arena.dataset.setsize, 10) || 4;
    let resp, delay = 300;
    if (strategy === 'correct') { resp = hasTarget ? 'present' : 'absent'; delay = type === 'conjunction' ? 250 + ss * 18 : 300; }
    else if (strategy === 'wrong') { resp = hasTarget ? 'absent' : 'present'; }
    else { resp = Math.random() < 0.5 ? 'present' : 'absent'; }
    setTimeout(() => {
      const b = [...document.querySelectorAll('.vs-btn')].find((x) => x.dataset.resp === resp);
      if (b && !b.disabled) b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }));
    }, delay);
  }, 20);
}

async function playVSearch(browser, url, id, strategy) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 880, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate((i) => { try { localStorage.removeItem('cog:' + i + ':sessions'); } catch {} }, id);
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#cog-action', { timeout: 15000 });
  await page.evaluate(installVSearchBot, strategy);
  const t0 = Date.now();
  let reached = false;
  while (Date.now() - t0 < RUN_TIMEOUT) {
    const st = await page.evaluate(() => {
      const panel = document.getElementById('cog-panel');
      return { visible: panel && !panel.hidden, hasSummary: !!(panel && panel.querySelector('.summary')),
        hasAction: !!(panel && panel.querySelector('#cog-action')) };
    });
    if (st.visible && st.hasSummary) { reached = true; break; }
    if (st.visible && st.hasAction && !st.hasSummary) { await page.click('#cog-action').catch(() => {}); await sleep(120); }
    await sleep(100);
  }
  const info = reached ? await page.evaluate(() => {
    const panel = document.getElementById('cog-panel');
    const last = window.__vsLast || {};
    return {
      overall: last.overall == null ? null : last.overall,
      slopes: last.slopes || {},
      nearChance: last.nearChance == null ? null : last.nearChance,
      charts: panel.querySelectorAll('.vs-chart svg').length,
      grid: !!panel.querySelector('.vs-grid'),
    };
  }) : { overall: null, slopes: {}, nearChance: null, charts: 0, grid: false };
  await page.close();
  return { errors, reached, ...info };
}

async function checkVSearch(browser, app) {
  const checks = [];
  const add = (name, pass, detail) => checks.push({ name, pass, detail });

  const c = await playVSearch(browser, urlFor(app.dir, 'ko'), app.id, 'correct');
  add('정답봇 결과 도달', c.reached, c.reached ? 'ok' : `${RUN_TIMEOUT}ms 내 요약 없음`);
  add('정답봇 JS 에러 없음', c.errors.length === 0, c.errors.length ? c.errors.slice(0, 3).join(' / ') : 'none');
  const feat = c.slopes.feature, conj = c.slopes.conjunction;
  add('정답봇: 결합 기울기>0(직렬)·특징은 평탄(작거나 게이트)·정확도 높음·차트2·정답률표',
    c.reached && c.overall != null && c.overall >= 90 && conj != null && conj > 8 && (feat == null || feat < conj) && c.charts >= 2 && c.grid,
    `정확도=${c.overall}%·특징기울기=${feat}·결합기울기=${conj}·차트=${c.charts}·표=${c.grid}`);

  const w = await playVSearch(browser, urlFor(app.dir, 'ko'), app.id, 'wrong');
  add('오답봇: 정확도 낮음·있음정답 없어 두 기울기 "—"(게이트)',
    w.reached && w.errors.length === 0 && w.overall != null && w.overall < 50 && w.slopes.feature == null && w.slopes.conjunction == null,
    `도달=${w.reached}·에러${w.errors.length}·정확도=${w.overall}%·특징=${w.slopes.feature}·결합=${w.slopes.conjunction}`);

  const a = await playVSearch(browser, urlFor(app.dir, 'ko'), app.id, 'anytime');
  // 16시행 무작위는 정확히 50%를 못 박으므로(노이즈), '완벽도 전무도 아님(0<정확도<100) + 우연칸 발생'으로
  // 판정 — 이게 아무때나봇을 정답봇(100·우연칸0)·오답봇(0)과 구분하는 견고한 불변식.
  add('아무때나봇: 완벽도 전무도 아님(0<정확도<100)·우연칸 경고·흰 화면 없음',
    a.reached && a.errors.length === 0 && a.overall != null && a.overall > 0 && a.overall < 100 && a.nearChance != null && a.nearChance > 0,
    `도달=${a.reached}·에러${a.errors.length}·정확도=${a.overall}%·우연칸=${a.nearChance}`);

  return { id: app.id, checks };
}

// ── 변별 역치(JND) 점검 ────────────────────────────────────────────────
// 봇은 두 원의 '보이는 크기'(getBoundingClientRect)를 읽어 큰 쪽을 안다(정답 노출 아님, 사람이 보는 것과 동일).
//   correct : 항상 큰 쪽 → 반전 없이 차이가 계속 좁아져 MIN(2%) 클램프, JND '—'(0반전 게이트).
//   wrong   : 항상 작은 쪽 → 차이가 계속 넓어져 MAX(60%) 클램프, JND '—'.
//   anytime : 무작위 → 반전이 생기면 JND 숫자(0회면 '—'), 게이트 일관·흰 화면 없음.
function installJndBot(strategy) {
  window.__seen = new Set();
  window.__jndTimer = setInterval(() => {
    const panel = document.getElementById('cog-panel');
    if (panel && !panel.hidden && panel.querySelector('.summary')) return;
    const arena = document.querySelector('.jnd-arena');
    const dots = [...document.querySelectorAll('.jnd-dot')];
    if (!arena || dots.length < 2 || dots.some((d) => d.disabled)) return; // 응답 활성일 때만
    const key = arena.dataset.seq || '';                                   // 시행 시퀀스로 구분(연습 포함)
    if (!key || window.__seen.has(key)) return;
    window.__seen.add(key);
    setTimeout(() => {
      const ds = [...document.querySelectorAll('.jnd-dot')];
      if (ds.length < 2 || ds.some((d) => d.disabled)) return;
      const w = ds.map((d) => d.getBoundingClientRect().width);
      const bigIdx = w[0] >= w[1] ? 0 : 1, smallIdx = 1 - bigIdx;
      let idx;
      if (strategy === 'correct') idx = bigIdx;
      else if (strategy === 'wrong') idx = smallIdx;
      else idx = Math.random() < 0.5 ? 0 : 1;
      ds[idx].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }));
    }, 250);
  }, 20);
}

async function playJnd(browser, url, id, strategy) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate((i) => { try { localStorage.removeItem('cog:' + i + ':sessions'); } catch {} }, id);
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#cog-action', { timeout: 15000 });
  await page.evaluate(installJndBot, strategy);
  const t0 = Date.now();
  let reached = false;
  while (Date.now() - t0 < RUN_TIMEOUT) {
    const st = await page.evaluate(() => {
      const panel = document.getElementById('cog-panel');
      return { visible: panel && !panel.hidden, hasSummary: !!(panel && panel.querySelector('.summary')),
        hasAction: !!(panel && panel.querySelector('#cog-action')) };
    });
    if (st.visible && st.hasSummary) { reached = true; break; }
    if (st.visible && st.hasAction && !st.hasSummary) { await page.click('#cog-action').catch(() => {}); await sleep(120); }
    await sleep(100);
  }
  const info = reached ? await page.evaluate(() => {
    const panel = document.getElementById('cog-panel');
    const row0 = panel.querySelector('.summary .row b');
    const jndText = row0 ? (row0.firstChild ? row0.firstChild.textContent : row0.textContent).trim() : '';
    const last = window.__jndLast || {};
    return { jndText, spark: !!panel.querySelector('.jnd-spark svg'),
      reversals: last.reversals == null ? null : last.reversals,
      finalDiff: last.finalDiff == null ? null : last.finalDiff,
      jndNum: last.jnd == null ? null : last.jnd };
  }) : { jndText: '', spark: false, reversals: null, finalDiff: null, jndNum: null };
  await page.close();
  return { errors, reached, ...info };
}

async function checkJnd(browser, app) {
  const checks = [];
  const add = (name, pass, detail) => checks.push({ name, pass, detail });

  const c = await playJnd(browser, urlFor(app.dir, 'ko'), app.id, 'correct');
  add('정답봇 결과 도달', c.reached, c.reached ? 'ok' : `${RUN_TIMEOUT}ms 내 요약 없음`);
  add('정답봇 JS 에러 없음', c.errors.length === 0, c.errors.length ? c.errors.slice(0, 3).join(' / ') : 'none');
  add('정답봇: 반전0→차이 좁아져 MIN(2%) 클램프·JND "—"·스파크',
    c.reached && c.reversals === 0 && c.finalDiff != null && c.finalDiff <= 2.01 && c.jndText === '—' && c.spark,
    `반전=${c.reversals}·최종차이=${c.finalDiff}%·JND=${c.jndText}·spark=${c.spark}`);

  const w = await playJnd(browser, urlFor(app.dir, 'ko'), app.id, 'wrong');
  add('오답봇: 반전0→차이 넓어져 MAX(60%) 클램프·JND "—"',
    w.reached && w.errors.length === 0 && w.reversals === 0 && w.finalDiff != null && w.finalDiff >= 59.99 && w.jndText === '—',
    `도달=${w.reached}·에러${w.errors.length}·반전=${w.reversals}·최종차이=${w.finalDiff}%·JND=${w.jndText}`);

  const a = await playJnd(browser, urlFor(app.dir, 'ko'), app.id, 'anytime');
  const gateOk = a.reversals != null &&
    ((a.reversals > 0 && a.jndText !== '—' && a.jndNum != null) || (a.reversals === 0 && a.jndText === '—'));
  add('아무때나봇: 반전>0이면 JND 숫자·0이면 "—"(게이트 일관)·흰 화면 없음',
    a.reached && a.errors.length === 0 && gateOk && a.spark,
    `도달=${a.reached}·에러${a.errors.length}·반전=${a.reversals}·JND=${a.jndText}·spark=${a.spark}`);

  return { id: app.id, checks };
}

// ── 뮐러-라이어 착시(조정법) 점검 ──────────────────────────────────────
// 정답이 없는 조정 과제(오차 채점). 봇은 window.__mlTrial 로 표준·비교 길이를 '본다'(사람도 화면에서 봄).
//   match    : 비교선을 표준 실제 길이로 맞춰 오차≈0 → 착시크기(mag)≈0, 값 산출·스파크 확인(채점 배관 검증).
//   noadjust : 조정 없이 바로 확정 → nAdjust=0 과반 → 순응 게이트 note. 단 값(mag)은 여전히 산출
//              (게이트는 '조정 이행'에만, 오차 크기로는 안 걸림 — 지시 §0-3 불변식).
//   random   : 몇 스텝만 조정 후 확정 → 두 조건 유효·게이트 안 걸림·흰 화면 없음.
function installMullerLyerBot(strategy) {
  window.__seen = new Set();
  window.__mlTimer = setInterval(() => {
    const panel = document.getElementById('cog-panel');
    if (panel && !panel.hidden && panel.querySelector('.summary')) return;   // 결과 도달
    const st = window.__mlTrial;
    const btns = [...document.querySelectorAll('.ml-controls .ml-btn')];
    const btnShort = btns[0], btnLong = btns[1];
    const btnConfirm = document.querySelector('.ml-confirm');
    if (!st || !st.active || !btnShort || !btnLong || !btnConfirm) return;
    if (window.__seen.has(st.seq)) return;
    window.__seen.add(st.seq);
    const press = (b) => {
      b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }));
      b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse' }));
    };
    (async () => {
      if (strategy === 'match') {
        let guard = 0;
        while (st.active && Math.abs(st.compLen - st.stdLen) > 4 && guard < 120) {
          press(st.stdLen - st.compLen > 0 ? btnLong : btnShort);
          guard++;
          await new Promise((r) => setTimeout(r, 0));
        }
      } else if (strategy === 'random') {
        const n = 2 + Math.floor(Math.random() * 6), b = Math.random() < 0.5 ? btnShort : btnLong;
        for (let i = 0; i < n; i++) press(b);
      } // 'noadjust' → 조정 없이 바로 확정
      if (st.active) btnConfirm.click();
    })();
  }, 20);
}

async function playMullerLyer(browser, url, id, strategy) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate((i) => { try { localStorage.removeItem('cog:' + i + ':sessions'); } catch {} }, id);
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#cog-action', { timeout: 15000 });
  await page.evaluate(installMullerLyerBot, strategy);
  const t0 = Date.now();
  let reached = false;
  while (Date.now() - t0 < RUN_TIMEOUT) {
    const st = await page.evaluate(() => {
      const panel = document.getElementById('cog-panel');
      return { visible: panel && !panel.hidden, hasSummary: !!(panel && panel.querySelector('.summary')),
        hasAction: !!(panel && panel.querySelector('#cog-action')) };
    });
    if (st.visible && st.hasSummary) { reached = true; break; }
    if (st.visible && st.hasAction && !st.hasSummary) { await page.click('#cog-action').catch(() => {}); await sleep(120); }
    await sleep(100);
  }
  const info = reached ? await page.evaluate(() => {
    const panel = document.getElementById('cog-panel');
    const row0 = panel.querySelector('.summary .row b');
    const magText = row0 ? (row0.firstChild ? row0.firstChild.textContent : row0.textContent).trim() : '';
    const last = window.__mlLast || {};
    return { magText, spark: !!panel.querySelector('.perr-spark svg'),
      biasLong: last.biasLong ?? null, biasShort: last.biasShort ?? null, mag: last.mag ?? null,
      n: last.n ?? null, nLong: last.nLong ?? null, nShort: last.nShort ?? null, unadjusted: !!last.unadjusted };
  }) : { magText: '', spark: false, biasLong: null, biasShort: null, mag: null, n: null, nLong: null, nShort: null, unadjusted: false };
  await page.close();
  return { errors, reached, ...info };
}

async function checkMullerLyer(browser, app) {
  const checks = [];
  const add = (name, pass, detail) => checks.push({ name, pass, detail });

  const m = await playMullerLyer(browser, urlFor(app.dir, 'ko'), app.id, 'match');
  add('맞춤봇 결과 도달', m.reached, m.reached ? 'ok' : `${RUN_TIMEOUT}ms 내 요약 없음`);
  add('맞춤봇 JS 에러 없음', m.errors.length === 0, m.errors.length ? m.errors.slice(0, 3).join(' / ') : 'none');
  add('맞춤봇: 두 조건 유효·오차≈0이라 착시크기≈0·스파크(채점 배관)',
    m.reached && m.nLong > 0 && m.nShort > 0 && m.mag != null && Math.abs(m.mag) < 8 && m.magText !== '—' && m.spark,
    `n=${m.nLong}/${m.nShort}·바깥=${m.biasLong}·안쪽=${m.biasShort}·착시=${m.mag}·spark=${m.spark}`);

  const u = await playMullerLyer(browser, urlFor(app.dir, 'ko'), app.id, 'noadjust');
  add('무조정봇: 순응 게이트 발동·그래도 값은 산출(오차 크기로는 안 걸림)',
    u.reached && u.errors.length === 0 && u.unadjusted === true && u.mag != null,
    `도달=${u.reached}·에러${u.errors.length}·게이트=${u.unadjusted}·착시=${u.mag}`);

  const r = await playMullerLyer(browser, urlFor(app.dir, 'ko'), app.id, 'random');
  add('랜덤봇: 두 조건 유효·게이트 안 걸림·흰 화면 없음',
    r.reached && r.errors.length === 0 && r.nLong > 0 && r.nShort > 0 && r.unadjusted === false && r.spark,
    `도달=${r.reached}·에러${r.errors.length}·n=${r.nLong}/${r.nShort}·게이트=${r.unadjusted}·spark=${r.spark}`);

  return { id: app.id, checks };
}

// ── 에빙하우스 착시(조정법) 점검 ──────────────────────────────────────
// 뮐러-라이어와 동형(조정법 오차채점). 봇은 window.__ebTrial 로 표준·비교 지름을 '본다'.
//   match=지름 맞춰 오차≈0→착시크기≈0·값산출·스파크 / noadjust=바로확정→게이트 O·값은 산출
//   / random=몇스텝만→두조건 유효·게이트 X·흰 화면 없음.
function installEbbinghausBot(strategy) {
  window.__seen = new Set();
  window.__ebTimer = setInterval(() => {
    const panel = document.getElementById('cog-panel');
    if (panel && !panel.hidden && panel.querySelector('.summary')) return;
    const st = window.__ebTrial;
    const btns = [...document.querySelectorAll('.eb-controls .eb-btn')];
    const btnSmall = btns[0], btnLarge = btns[1];
    const btnConfirm = document.querySelector('.eb-confirm');
    if (!st || !st.active || !btnSmall || !btnLarge || !btnConfirm) return;
    if (window.__seen.has(st.seq)) return;
    window.__seen.add(st.seq);
    const press = (b) => {
      b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }));
      b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse' }));
    };
    (async () => {
      if (strategy === 'match') {
        let guard = 0;
        while (st.active && Math.abs(st.compD - st.stdD) > 4 && guard < 120) {
          press(st.stdD - st.compD > 0 ? btnLarge : btnSmall);
          guard++;
          await new Promise((r) => setTimeout(r, 0));
        }
      } else if (strategy === 'random') {
        const n = 2 + Math.floor(Math.random() * 6), b = Math.random() < 0.5 ? btnSmall : btnLarge;
        for (let i = 0; i < n; i++) press(b);
      } // 'noadjust' → 조정 없이 바로 확정
      if (st.active) btnConfirm.click();
    })();
  }, 20);
}

async function playEbbinghaus(browser, url, id, strategy) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate((i) => { try { localStorage.removeItem('cog:' + i + ':sessions'); } catch {} }, id);
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#cog-action', { timeout: 15000 });
  await page.evaluate(installEbbinghausBot, strategy);
  const t0 = Date.now();
  let reached = false;
  while (Date.now() - t0 < RUN_TIMEOUT) {
    const st = await page.evaluate(() => {
      const panel = document.getElementById('cog-panel');
      return { visible: panel && !panel.hidden, hasSummary: !!(panel && panel.querySelector('.summary')),
        hasAction: !!(panel && panel.querySelector('#cog-action')) };
    });
    if (st.visible && st.hasSummary) { reached = true; break; }
    if (st.visible && st.hasAction && !st.hasSummary) { await page.click('#cog-action').catch(() => {}); await sleep(120); }
    await sleep(100);
  }
  const info = reached ? await page.evaluate(() => {
    const panel = document.getElementById('cog-panel');
    const row0 = panel.querySelector('.summary .row b');
    const magText = row0 ? (row0.firstChild ? row0.firstChild.textContent : row0.textContent).trim() : '';
    const last = window.__ebLast || {};
    return { magText, spark: !!panel.querySelector('.perr-spark svg'),
      biasSmall: last.biasSmall ?? null, biasLarge: last.biasLarge ?? null, mag: last.mag ?? null,
      n: last.n ?? null, nSmall: last.nSmall ?? null, nLarge: last.nLarge ?? null, unadjusted: !!last.unadjusted };
  }) : { magText: '', spark: false, biasSmall: null, biasLarge: null, mag: null, n: null, nSmall: null, nLarge: null, unadjusted: false };
  await page.close();
  return { errors, reached, ...info };
}

async function checkEbbinghaus(browser, app) {
  const checks = [];
  const add = (name, pass, detail) => checks.push({ name, pass, detail });

  const m = await playEbbinghaus(browser, urlFor(app.dir, 'ko'), app.id, 'match');
  add('맞춤봇 결과 도달', m.reached, m.reached ? 'ok' : `${RUN_TIMEOUT}ms 내 요약 없음`);
  add('맞춤봇 JS 에러 없음', m.errors.length === 0, m.errors.length ? m.errors.slice(0, 3).join(' / ') : 'none');
  add('맞춤봇: 두 조건 유효·오차≈0이라 착시크기≈0·스파크(채점 배관)',
    m.reached && m.nSmall > 0 && m.nLarge > 0 && m.mag != null && Math.abs(m.mag) < 8 && m.magText !== '—' && m.spark,
    `n=${m.nSmall}/${m.nLarge}·작은맥락=${m.biasSmall}·큰맥락=${m.biasLarge}·착시=${m.mag}·spark=${m.spark}`);

  const u = await playEbbinghaus(browser, urlFor(app.dir, 'ko'), app.id, 'noadjust');
  add('무조정봇: 순응 게이트 발동·그래도 값은 산출(오차 크기로는 안 걸림)',
    u.reached && u.errors.length === 0 && u.unadjusted === true && u.mag != null,
    `도달=${u.reached}·에러${u.errors.length}·게이트=${u.unadjusted}·착시=${u.mag}`);

  const r = await playEbbinghaus(browser, urlFor(app.dir, 'ko'), app.id, 'random');
  add('랜덤봇: 두 조건 유효·게이트 안 걸림·흰 화면 없음',
    r.reached && r.errors.length === 0 && r.nSmall > 0 && r.nLarge > 0 && r.unadjusted === false && r.spark,
    `도달=${r.reached}·에러${r.errors.length}·n=${r.nSmall}/${r.nLarge}·게이트=${r.unadjusted}·spark=${r.spark}`);

  return { id: app.id, checks };
}

// ── 도형 회전(Mental Rotation) 점검 ────────────────────────────────────
// 봇은 자극 글자의 transform 행렬식 부호로 거울상 여부를 '본다'(정답 노출 아님, 변환에서 읽음).
//   correct    : 판별해 정확히 누름. 각도 무관 일정 지연 → 기울기≈0 (봇은 안 돌리니 이 과제의 대조군).
//   normalOnly : 늘 '정상' → 정상 정답·거울상 오답 = 정확도 50% → 저정확도 경고.
//   wrong      : 판별을 뒤집어 항상 오답 → 각도별 유효 0개 → 회귀 불가('—'), 흰 화면 방지 확인.
function installRotationBot(strategy) {
  window.__seen = new Set();
  window.__rotTimer = setInterval(() => {
    const pad = document.getElementById('cog-pad');
    const stim = document.getElementById('cog-stimulus');
    const prog = document.getElementById('cog-progress');
    if (!pad || !stim || pad.hidden || !pad.classList.contains('live')) return;
    const g = stim.querySelector('.rot-glyph');
    if (!g) return;
    const key = prog ? prog.textContent : '';
    if (window.__seen.has(key)) return;
    window.__seen.add(key);
    // 자극 변환에서 거울상 여부(행렬식 부호)와 직립기준 각도(회전각의 절댓값)를 읽는다.
    const m = new DOMMatrix(getComputedStyle(g).transform);
    const mirrored = (m.a * m.d - m.b * m.c) < 0;
    const angle = Math.round(Math.abs(Math.atan2(-m.c, m.d) * 180 / Math.PI));
    const snap = [0, 60, 120, 180].reduce((b, a) => (Math.abs(a - angle) < Math.abs(b - angle) ? a : b), 0);
    let id, delay = 350;
    if (strategy === 'correct') id = mirrored ? 'mirror' : 'normal';
    else if (strategy === 'normalOnly') id = 'normal';
    else if (strategy === 'wrong') id = mirrored ? 'normal' : 'mirror';       // 뒤집어 항상 오답
    else if (strategy === 'rotator') { id = mirrored ? 'mirror' : 'normal'; delay = 250 + snap * 2; }   // 각도에 비례 → 깨끗한 직선(R² 높음)
    else { id = mirrored ? 'mirror' : 'normal'; delay = { 0: 300, 60: 420, 120: 330, 180: 400 }[snap]; } // shaped: 양의 기울기지만 비직선(R² 낮음)
    setTimeout(() => {
      const p = document.getElementById('cog-pad');
      if (!p || !p.classList.contains('live')) return;
      const btn = p.querySelector('.choice[data-choice="' + id + '"]');
      if (btn) btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }));
    }, delay);
  }, 20);
}

async function playRotation(browser, url, id, strategy) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 900, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate((i) => { try { localStorage.removeItem('cog:' + i + ':sessions'); } catch {} }, id);
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#cog-action', { timeout: 15000 });
  await page.evaluate(installRotationBot, strategy);
  const t0 = Date.now();
  let reached = false;
  while (Date.now() - t0 < RUN_TIMEOUT) {
    const st = await page.evaluate(() => {
      const panel = document.getElementById('cog-panel');
      return { visible: panel && !panel.hidden, hasSummary: !!(panel && panel.querySelector('.summary')),
        hasAction: !!(panel && panel.querySelector('#cog-action')) };
    });
    if (st.visible && st.hasSummary) { reached = true; break; }
    if (st.visible && st.hasAction && !st.hasSummary) { await page.click('#cog-action').catch(() => {}); await sleep(120); }
    await sleep(100);
  }
  // 요약 순서: [0..3]=각도별(정확도+RT), [4]=전체 정확도, [5]=기울기, [6]=R², [7]=회전속도
  const info = reached ? await page.evaluate(() => {
    const panel = document.getElementById('cog-panel');
    const txt = (i) => { const b = panel.querySelectorAll('.summary .row b')[i]; return b && b.firstChild ? b.firstChild.textContent.trim() : (b ? b.textContent.trim() : ''); };
    const num = (s) => { const m = s.match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : null; };
    const g = (i) => (txt(i).includes('—') ? null : num(txt(i)));
    return { acc: num(txt(4)), slope: g(5), r2: g(6), rotSpeed: g(7), chart: !!panel.querySelector('.rot-chart svg'), notes: panel.querySelectorAll('.top-note').length };
  }) : { acc: null, slope: null, r2: null, rotSpeed: null, chart: false, notes: 0 };
  // 추세 그래프에 찍히는 값(series 'slope')을 저장 세션에서 읽는다. R²<컷이면 null(=그래프 미표시).
  const trendSlope = reached ? await page.evaluate((i) => {
    try { const s = JSON.parse(localStorage.getItem('cog:' + i + ':sessions') || '[]').slice(-1)[0]; return s && s.values ? (s.values.slope === null ? null : s.values.slope) : undefined; } catch { return undefined; }
  }, id) : undefined;
  await page.close();
  return { errors, reached, trendSlope, ...info };
}

async function checkRotation(browser, app) {
  const checks = [];
  const add = (name, pass, detail) => checks.push({ name, pass, detail });

  const c = await playRotation(browser, urlFor(app.dir, 'ko'), app.id, 'correct');
  add('정답봇 결과 도달', c.reached, c.reached ? 'ok' : `${RUN_TIMEOUT}ms 내 요약 없음`);
  add('정답봇 JS 에러 없음', c.errors.length === 0, c.errors.length ? c.errors.slice(0, 3).join(' / ') : 'none');
  add('정답봇 정확도 100%·기울기≈0(대조군)·그래프',
    c.reached && c.acc === 100 && c.slope != null && Math.abs(c.slope) < 2 && c.chart,
    `acc=${c.acc}%·기울기=${c.slope}ms/도·그래프=${c.chart}`);

  // R² 게이트(요약+그래프): 비직선(양의 기울기, R² 낮음) → 회전속도 '—' AND 추세점도 안 찍힘(null).
  const s = await playRotation(browser, urlFor(app.dir, 'ko'), app.id, 'shaped');
  add('R² 게이트: 비직선→회전속도 "—"·추세점도 없음(기울기·R²는 남음)',
    s.reached && s.errors.length === 0 && s.slope != null && s.slope > 0 && s.r2 != null && s.r2 < 0.5 && s.rotSpeed === null && s.trendSlope === null,
    `기울기=${s.slope}·R²=${s.r2}·회전속도=${s.rotSpeed}·추세점=${s.trendSlope}`);

  // 반대(구멍 아님 확인): 깨끗한 직선(R² 높음) → 회전속도 표시 AND 추세에 기울기 찍힘.
  const r = await playRotation(browser, urlFor(app.dir, 'ko'), app.id, 'rotator');
  add('고 R²: 회전속도 표시·추세점 찍힘',
    r.reached && r.errors.length === 0 && r.r2 != null && r.r2 >= 0.5 && r.rotSpeed != null && r.trendSlope != null,
    `R²=${r.r2}·회전속도=${r.rotSpeed}·추세점=${r.trendSlope}`);

  const n = await playRotation(browser, urlFor(app.dir, 'ko'), app.id, 'normalOnly');
  add('저정확도봇: 정확도<90%·경고 뜸',
    n.reached && n.errors.length === 0 && n.acc != null && n.acc < 90 && n.notes >= 3,
    `acc=${n.acc}%·경고배너=${n.notes}`);

  const w = await playRotation(browser, urlFor(app.dir, 'ko'), app.id, 'wrong');
  add('오답봇(각도 유효 0): 기울기 "—"·행 없음',
    w.reached && w.errors.length === 0 && w.acc === 0 && w.slope === null,
    `도달=${w.reached}·acc=${w.acc}%·기울기=${w.slope}`);

  return { id: app.id, checks };
}

// ── 이어서 기억하기(N-back) 점검 ───────────────────────────────────────
// 이 과제의 진짜 대조군은 '아무 때나 누르는 봇'이다. 정확도(한 숫자)만 보면 그럴싸해 보이지만
// 적중률·오경보율 두 숫자로 보면 오경보가 함께 높아 실력이 아님이 드러난다. 네 봇을 실측한다:
//   correct : 관찰한 글자로 n개 전을 스스로 계산해 표적에만 누름 → 적중 100%·오경보 0%(두 숫자 갈라짐).
//   anytime : 자극마다 60% 확률로 누름 → 적중도 오경보도 함께 높음(두 숫자 안 갈라짐 = UI가 잡아내야 함).
//   always  : 모든 자극에 누름 → 적중 100%·오경보 100%(오경보가 100%로 크게 보이는가).
//   never   : 하나도 안 누름 → 적중 0%·오경보 0%(흰 화면 없이 '0'으로 뜨는가).
// 봇은 화면에 노출된 글자·위치(data-*)만 읽어 사람이 보는 정보로 판단한다(정답 자체를 읽지 않음).
// 블록 인트로 '시작' 버튼(.nb-intro-btn)과 엔진 패널 버튼(#cog-action)도 눌러 진행시킨다.
function installNbackBot(strategy) {
  const st = { hist: [], seen: -1 };
  window.__nbTimer = setInterval(() => {
    const panel = document.getElementById('cog-panel');
    if (panel && !panel.hidden && panel.querySelector('.summary')) return; // 결과 도달 → 멈춤
    const intro = document.querySelector('.nb-intro-btn');
    if (intro) { intro.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' })); return; }
    const stage = document.querySelector('.nb-stage');
    if (!stage || !stage.dataset.seq) return;
    const seq = Number(stage.dataset.seq);
    if (seq === st.seen) return;         // 같은 자극 한 번만 처리
    st.seen = seq;
    const n = Number(stage.dataset.n);
    const pos = Number(stage.dataset.pos);
    const letter = stage.dataset.letter;
    if (pos === 0) st.hist = [];         // 스트림(연습/채점) 시작마다 n-back 이력 초기화
    st.hist[pos] = letter;
    const isTarget = pos >= n && st.hist[pos - n] === letter; // 관찰로 계산(사람과 동일한 판단)
    let press = false;
    if (strategy === 'correct') press = isTarget;
    else if (strategy === 'always') press = true;
    else if (strategy === 'anytime') press = Math.random() < 0.6;
    else press = false;                  // never
    if (press) setTimeout(() => {
      const btn = document.querySelector('.nb-match');
      if (btn) btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }));
    }, 60);
  }, 15);
}

async function playNback(browser, url, id, strategy) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 900, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate((i) => { try { localStorage.removeItem('cog:' + i + ':sessions'); } catch {} }, id);
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#cog-action', { timeout: 15000 });
  await page.evaluate(installNbackBot, strategy);
  const t0 = Date.now();
  let reached = false;
  while (Date.now() - t0 < RUN_TIMEOUT) {
    const st = await page.evaluate(() => {
      const panel = document.getElementById('cog-panel');
      return { visible: panel && !panel.hidden, hasSummary: !!(panel && panel.querySelector('.summary')),
        hasAction: !!(panel && panel.querySelector('#cog-action')) };
    });
    if (st.visible && st.hasSummary) { reached = true; break; }
    if (st.visible && st.hasAction && !st.hasSummary) { await page.click('#cog-action').catch(() => {}); await sleep(120); }
    await sleep(100);
  }
  // 요약 행: 블록마다 [적중률, 오경보율] 두 줄이 순서대로. 짝수번째=적중, 홀수번째=오경보.
  // 값은 <b> 첫 텍스트노드(예 "80 %"/"—")만 — 뒤 (N문항) count 숫자를 잡지 않도록.
  const info = reached ? await page.evaluate(() => {
    const panel = document.getElementById('cog-panel');
    const rows = [...panel.querySelectorAll('.summary .row')].map((r) => {
      const b = r.querySelector('b');
      const txt = b && b.firstChild ? b.firstChild.textContent : (b ? b.textContent : '');
      const m = txt.match(/-?\d+/);
      return txt.includes('—') ? null : (m ? parseInt(m[0], 10) : null);
    });
    const hits = rows.filter((_, i) => i % 2 === 0);
    const fas = rows.filter((_, i) => i % 2 === 1);
    return {
      hits, fas,
      nBlocks: hits.length,
      chart: !!panel.querySelector('.nb-chart svg'),
      refs: !!panel.querySelector('.nb-refs'),
      topNotes: panel.querySelectorAll('.top-note').length,
      hasNaN: /NaN/.test(panel.innerHTML),
    };
  }) : { hits: [], fas: [], nBlocks: 0, chart: false, refs: false, topNotes: 0, hasNaN: true };
  // 분모 0/빈 배열 가드: 순수 함수 nbackStats(QA에서 window 노출)가 예외 없이 null(→'—')을 내는지.
  const guard = reached ? await page.evaluate(() => {
    try {
      const f = window.__nbackStats;
      if (typeof f !== 'function') return { ok: false, why: 'no hook' };
      const empty = f([]);
      const zeroT = f([{ n: 1, isTarget: false, pressed: false }, { n: 1, isTarget: false, pressed: true }]); // 표적 0개
      const zeroNT = f([{ n: 2, isTarget: true, pressed: true }]);                                            // 비표적 0개
      return {
        ok: Array.isArray(empty) && empty.length === 0
          && zeroT[0].hitRate === null && zeroT[0].faRate !== null
          && zeroNT[0].faRate === null && zeroNT[0].hitRate !== null,
      };
    } catch (e) { return { ok: false, why: String(e) }; }
  }) : { ok: false, why: '결과 미도달' };
  await page.close();
  return { errors, reached, ...info, guard };
}

async function checkNback(browser, app) {
  const checks = [];
  const add = (name, pass, detail) => checks.push({ name, pass, detail });
  const allEq = (a, v) => a.length > 0 && a.every((x) => x === v);
  const blocks = app.id.includes('adults') ? 3 : 2; // 성인 n=1,2,3 / 청소년 n=1,2

  // correct: 두 숫자가 갈라진다 — 적중 전부 100%·오경보 전부 0%. 블록 수·차트·참고문헌·경고 3개.
  const c = await playNback(browser, urlFor(app.dir, 'ko'), app.id, 'correct');
  add('정답봇 결과 도달', c.reached, c.reached ? 'ok' : `${RUN_TIMEOUT}ms 내 요약 없음`);
  add('정답봇 JS 에러 없음', c.errors.length === 0, c.errors.length ? c.errors.slice(0, 3).join(' / ') : 'none');
  add(`정답봇: 블록 ${blocks}개·적중 100%·오경보 0%(두 숫자 갈라짐)·차트·참고문헌`,
    c.reached && c.nBlocks === blocks && allEq(c.hits, 100) && allEq(c.fas, 0) && c.chart && c.refs && c.topNotes >= 3 && !c.hasNaN,
    `블록=${c.nBlocks}·적중=[${c.hits}]·오경보=[${c.fas}]·차트=${c.chart}·참고=${c.refs}·경고=${c.topNotes}`);
  add('분모 0/빈 배열 가드(흰 화면 없음)', c.guard.ok, c.guard.ok ? 'null→"—"' : ('실패: ' + (c.guard.why || '')));

  // anytime: 적중도 오경보도 함께 높다 — 오경보가 0에 묻히지 않아야 UI가 대조군을 잡아낸 것.
  const a = await playNback(browser, urlFor(app.dir, 'ko'), app.id, 'anytime');
  const faElevated = a.fas.filter((x) => x != null && x >= 20).length; // 오경보가 실제로 올라온 블록 수
  add('아무때나봇: 오경보율이 0에 안 묻힘(두 숫자 안 갈라짐)',
    a.reached && a.errors.length === 0 && !a.hasNaN && faElevated >= 1 && a.hits.some((x) => x != null && x > 0),
    `적중=[${a.hits}]·오경보=[${a.fas}]·오경보≥20인 블록=${faElevated}`);

  // always: 적중 100%·오경보 100% — 오경보가 100으로 '크게' 뜨는가(묻히면 UI 실패).
  const al = await playNback(browser, urlFor(app.dir, 'ko'), app.id, 'always');
  add('항상봇: 적중 100%·오경보 100%(오경보 100으로 표시)',
    al.reached && al.errors.length === 0 && !al.hasNaN && allEq(al.hits, 100) && allEq(al.fas, 100),
    `적중=[${al.hits}]·오경보=[${al.fas}]`);

  // never: 적중 0%·오경보 0% — 흰 화면 없이 양쪽 0으로 뜨는가.
  const nv = await playNback(browser, urlFor(app.dir, 'ko'), app.id, 'never');
  add('절대안누름봇: 적중 0%·오경보 0%(흰 화면 없음)',
    nv.reached && nv.errors.length === 0 && !nv.hasNaN && allEq(nv.hits, 0) && allEq(nv.fas, 0),
    `도달=${nv.reached}·적중=[${nv.hits}]·오경보=[${nv.fas}]`);

  return { id: app.id, checks };
}

// ── 실행 ─────────────────────────────────────────────────────────────
if (SELECTED.length === 0) {
  console.error(`일치하는 앱이 없습니다: "${ARGS.join(' ')}". 예: digitspan / stroop gonogo / corsi-youth`);
  process.exit(2);
}

const checkOne = (browser, app) =>
  app.kind === 'corsi' ? checkCorsi(browser, app)
    : app.kind === 'digitspan' ? checkDigitSpan(browser, app)
      : app.kind === 'srt' ? checkSRT(browser, app)
        : app.kind === 'simon' ? checkSimon(browser, app)
          : app.kind === 'stopsignal' ? checkStopSignal(browser, app)
          : app.kind === 'rotation' ? checkRotation(browser, app)
          : app.kind === 'nback' ? checkNback(browser, app)
          : app.kind === 'jnd' ? checkJnd(browser, app)
          : app.kind === 'vsearch' ? checkVSearch(browser, app)
          : app.kind === 'muller-lyer' ? checkMullerLyer(browser, app)
          : app.kind === 'ebbinghaus' ? checkEbbinghaus(browser, app)
          : app.kind === 'sart' ? checkSART(browser, app)
          : app.kind === 'ablink' ? checkAblink(browser, app)
          : app.kind === 'blindspot' ? checkBlindspot(browser, app)
          : app.kind === 'necker' ? checkNeckerCube(browser, app)
          : app.kind === 'afterimage' ? checkAfterimage(browser, app)
          : app.kind === 'ib' ? checkIb(browser, app)
          : app.kind === 'emo-stroop' ? checkEmoStroop(browser, app)
          : app.kind === 'emo-dotprobe' ? checkEmoDotprobe(browser, app)
            : checkApp(browser, app);

const server = await startServer();
// 진짜 병렬을 위해 브라우저 '인스턴스'를 여러 개 띄운다. 한 브라우저의 여러 페이지는 CDP 명령이
// 직렬화돼 병렬 효과가 약하다. 각 워커가 자기 브라우저를 갖고 SELECTED 를 나눠 처리한다.
const nBrowsers = Math.min(PARALLEL, SELECTED.length);
const browsers = await Promise.all(Array.from({ length: nBrowsers }, () =>
  puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] })));

let allPass = true;
try {
  console.log(`▶ ${SELECTED.length}개 앱 검사 (브라우저 ${nBrowsers}개 병렬, ?qa=1 축약 모드)…`);
  const results = new Array(SELECTED.length);
  let next = 0;
  const worker = async (browser) => {
    while (next < SELECTED.length) {
      const idx = next++;
      // 한 앱이 깨져도(예: navigation abort) 전체 실행을 죽이지 않고 그 앱만 FAIL 로 보고.
      try {
        results[idx] = await checkOne(browser, SELECTED[idx]);
      } catch (e) {
        results[idx] = { id: SELECTED[idx].id, checks: [{ name: '검사 실행', pass: false, detail: 'ERROR: ' + (e && e.message ? e.message : e) }] };
      }
    }
  };
  await Promise.all(browsers.map((b) => worker(b)));

  // 결과는 SELECTED 순서대로 출력(병렬 완료 순서와 무관하게 읽기 쉽게)
  for (const r of results) {
    console.log(`\n▶ ${r.id}`);
    for (const c of r.checks) {
      if (!c.pass) allPass = false;
      console.log(`   ${c.pass ? '✅ PASS' : '❌ FAIL'}  ${c.name} — ${c.detail}`);
    }
  }
} finally {
  await Promise.all(browsers.map((b) => b.close().catch(() => {})));
  server.close();
}

console.log('\n' + '='.repeat(50));
console.log(allPass ? '전체 통과 ✅' : '실패 항목 있음 ❌ (위 FAIL 확인)');
process.exit(allPass ? 0 : 1);
