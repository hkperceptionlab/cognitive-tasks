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
  { id: 'stroop-youth',  dir: 'stroop-youth'  },
  { id: 'stroop-adults', dir: 'stroop-adults' },
  { id: 'gonogo-youth',  dir: 'gonogo-youth'  },
  { id: 'gonogo-adults', dir: 'gonogo-adults' },
];

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
  const A = await playRun(browser, `http://localhost:${PORT}/${app.dir}/?lang=ko`, { clearId: app.id });
  add('결과 화면 도달', A.reachedResults, A.reachedResults ? 'ok' : `${RUN_TIMEOUT}ms 내 요약 없음`);
  add('JS 에러 없음', A.errors.length === 0, A.errors.length ? A.errors.slice(0, 3).join(' / ') : 'none');
  if (A.reachedResults) {
    const last = (await readSessions(A.page, app.id)).slice(-1)[0];
    add('정답 판정 = 정확도 100%', !!last && last.acc === 1,
      last ? `acc=${Math.round((last.acc ?? 0) * 100)}%` : '세션 없음');
  }
  await A.page.close();

  // 회차 B — en. 저장소를 지우지 않아 A의 ko 세션이 남아있고, 그래프에서 걸러져야 한다.
  const B = await playRun(browser, `http://localhost:${PORT}/${app.dir}/?lang=en`, {});
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

// ── 실행 ─────────────────────────────────────────────────────────────
const server = await startServer();
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

let allPass = true;
try {
  for (const app of APPS) {
    console.log(`\n▶ ${app.id} — 두 회차 자동 플레이 중… (수십 초 소요)`);
    const r = await checkApp(browser, app);
    for (const c of r.checks) {
      if (!c.pass) allPass = false;
      console.log(`   ${c.pass ? '✅ PASS' : '❌ FAIL'}  ${c.name} — ${c.detail}`);
    }
  }
} finally {
  await browser.close();
  server.close();
}

console.log('\n' + '='.repeat(50));
console.log(allPass ? '전체 통과 ✅' : '실패 항목 있음 ❌ (위 FAIL 확인)');
process.exit(allPass ? 0 : 1);
