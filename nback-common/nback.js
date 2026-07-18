// nback-common/nback.js — 이어서 기억하기(N-back). 청소년·성인 공유.
//
// 이 앱의 목적은 '훈련'이 아니라 '전시'다. 브레인트레이닝 산업이 판 바로 그 과제를 두고,
// 왜 그 훈련 효과가 다른 능력으로 넘어가지 않는지를 결과 화면에서 사실로 보여준다.
//   · 점수·등급·IQ·기억용량·'좋다/나쁘다'·비교 문구 전부 없음.
//   · d' 같은 '한 점수'로 뭉치지 않는다 — 적중률·오경보율 두 숫자를 같은 무게로 나란히.
//   · "이 과제를 잘하게 되는 것과 기억력이 좋아지는 것은 다르다"를 근거와 함께 사실로 진술.
//
// 엔진 확장 훅 위에 얹는다(엔진 불변):
//   · mainTrials()  = async generator. 블록(n=1→2→3) 순서대로 시행을 내보낸다. 셔플하면 안 되므로
//                     buildMainPool(orderByConstraint 셔플)을 쓰지 않는다 — N-back은 '순서가 곧 자극'.
//                     각 블록 앞에 인트로·연습 시행을 접어 넣는다(엔진 페이즈로는 블록별 연습이 안 됨).
//   · playTrial()   = 한 시행 내부를 소유. 자극 스트림(글자 표시 500ms → 블랭크 → 응답창)을
//                     host 안에서 자체 타이머로 돌린다. 응답은 단일 '일치' 버튼(표적일 때만 누름, 표준).
//   · sessionAcc()  = null (정답률 개념 대신 적중/오경보 두 율로 봄 → 저정확도 경고를 끔).
//
// 앱마다 다른 것: id, blocks(청소년 [1,2] / 성인 [1,2,3]), scale.
//   startNback({ id, blocks, scale })

import { runTask, QA } from '../core/engine.js';

// 자음만(모음·혼동 글자 B/P/I/O 제외). 위치가 아니라 글자라 코시 격자·사이먼 좌우와 시각적으로 안 겹친다.
const LETTERS = ['C', 'H', 'K', 'L', 'Q', 'R', 'S', 'T'];
const TARGET_RATE = 0.3;                 // 채점 대상 중 표적 비율(약 30%)
const SCORED = QA ? 6 : 20;              // 블록당 채점 시행 수 (QA 축약: 블록은 유지, 개수만 줄임)
const PRACTICE_SCORED = QA ? 2 : 4;      // 블록당 연습 시행 수(피드백, 기록 안 함)
const STIM_MS = QA ? 180 : 500;          // 글자 표시 시간
const SOA_MS = QA ? 500 : 2500;          // 자극 시작~다음 자극(응답창). 글자 뒤 (SOA-STIM)ms 는 블랭크.
const FEEDBACK_MS = QA ? 150 : 600;      // 연습 피드백 표시 시간

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const randLetter = () => LETTERS[Math.floor(Math.random() * LETTERS.length)];
const randLetterExcept = (avoid) => {
  let c;
  do { c = randLetter(); } while (c === avoid);
  return c;
};
function pickSubset(arr, k) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, k);
}

// 한 블록 스트림 생성. 앞 n개는 버퍼(판단 대상 아님 — n개 전이 아직 없음).
// 나머지 scoredCount개 중 약 targetRate 를 표적(글자[i]==글자[i-n])으로, 정상 실행에선 표적·비표적
// 각각 최소 1개를 보장(분모 0 방지). 비표적은 n개 전 글자와 '다른' 글자로 확정한다.
function buildStream(n, scoredCount, targetRate) {
  const seq = [];
  for (let i = 0; i < n; i++) seq.push({ letter: randLetter(), buffer: true, isTarget: false });
  let numT = Math.round(scoredCount * targetRate);
  numT = Math.max(1, Math.min(scoredCount - 1, numT)); // 1 ≤ 표적 ≤ scoredCount-1 (양쪽 분모 > 0)
  const targetSet = new Set(pickSubset([...Array(scoredCount).keys()], numT));
  for (let j = 0; j < scoredCount; j++) {
    const idx = n + j;                    // 스트림 내 실제 위치
    const back = seq[idx - n].letter;     // n개 전 글자
    if (targetSet.has(j)) seq.push({ letter: back, buffer: false, isTarget: true });
    else seq.push({ letter: randLetterExcept(back), buffer: false, isTarget: false });
  }
  return seq;
}

// 신호탐지 집계(순수 함수 — 예외를 던지지 않고, 분모 0이면 율을 null 로). QA에서 window.__nbackStats 로 노출해
// '표적 0개/비표적 0개/빈 배열'에서도 흰 화면(예외) 없이 '—'가 되는지 자동 점검한다.
function nbackStats(records) {
  const byN = {};
  (records || []).forEach((r) => { (byN[r.n] || (byN[r.n] = [])).push(r); });
  return Object.keys(byN).map(Number).sort((a, b) => a - b).map((n) => {
    const rs = byN[n];
    const targets = rs.filter((r) => r.isTarget);
    const nontargets = rs.filter((r) => !r.isTarget);
    const hits = targets.filter((r) => r.pressed).length;
    const fas = nontargets.filter((r) => r.pressed).length;
    return {
      n,
      hitRate: targets.length ? hits / targets.length : null,       // 표적 0개 → null(→ '—')
      faRate: nontargets.length ? fas / nontargets.length : null,   // 비표적 0개 → null(→ '—')
      nTargets: targets.length,
      nNontargets: nontargets.length,
    };
  });
}

function injectStyles() {
  if (document.getElementById('nback-style')) return;
  const el = document.createElement('style');
  el.id = 'nback-style';
  el.textContent = `
.nb-stage{display:flex;flex-direction:column;align-items:center;gap:1rem;width:100%;max-width:460px;margin:0 auto}
/* 상시 규칙 — 블록 내내 화면 위에 보인다(사람이 무엇을 할지 항상 알 수 있게) */
.nb-rule{font-size:calc(1rem * var(--scale));line-height:1.5;color:var(--fg);background:#eef3ef;
  border:1px solid #d5e2d9;border-radius:12px;padding:.6rem .85rem;text-align:center;width:100%}
.nb-rule b{color:var(--accent)}
/* 자극 글자는 '항상 중립색'(검정). 정오 표시로 오해되지 않도록 색을 절대 바꾸지 않는다 */
.nb-letter{height:var(--stim);display:flex;align-items:center;justify-content:center;
  font-size:var(--stim);font-weight:800;line-height:1;letter-spacing:.02em;color:var(--fg)}
/* 상태줄: 버퍼 안내(회색)와 연습 피드백(초록/빨강)을 '글자와 다른 자리·다른 크기'로 표시 */
.nb-status{min-height:1.5rem;font-size:calc(1rem * var(--scale));font-weight:700;text-align:center}
.nb-status.wait{color:var(--muted);font-weight:600}
.nb-status.ok{color:#2e7d32}.nb-status.no{color:#c62828}
.nb-match{min-width:min(70vw,320px);min-height:min(var(--btn-h),18dvh);border:none;border-radius:16px;
  background:var(--accent);color:#fff;font-size:var(--pad-fs);font-weight:700;cursor:pointer;
  box-shadow:0 2px 6px rgba(0,0,0,.15);touch-action:manipulation;-webkit-tap-highlight-color:transparent;
  transition:opacity .12s}
.nb-match:active{transform:scale(.97)}
.nb-match.waiting{opacity:.4}
.nb-intro{background:var(--card);border-radius:16px;padding:1.4rem;box-shadow:0 1px 3px rgba(0,0,0,.08);
  text-align:center;width:100%;max-width:460px;margin:0 auto}
.nb-intro h2{font-size:1.35rem;margin:.2rem 0 .7rem;color:var(--accent)}
.nb-intro p{line-height:1.6;margin:.4rem 0 1rem}
/* 인트로 예시: 실제 글자열 + 일치 쌍 강조 + 캡션 */
.nb-example{background:#f4f7f5;border-radius:12px;padding:.8rem;margin:0 0 1.1rem}
.nb-ex-row{display:flex;flex-wrap:wrap;justify-content:center;gap:.4rem;margin-bottom:.5rem}
.nb-ex{display:inline-flex;align-items:center;justify-content:center;min-width:2.1rem;height:2.1rem;
  border-radius:8px;background:#fff;border:1px solid #d5e2d9;font-weight:800;font-size:1.15rem;color:var(--fg)}
.nb-ex.hit{background:var(--accent);border-color:var(--accent);color:#fff}
.nb-ex-cap{font-size:.9rem;line-height:1.5;color:var(--muted)}
.nb-ex-cap b{color:var(--accent)}
.nb-intro-btn{width:100%;min-height:3.4rem;border:none;border-radius:12px;background:var(--accent);
  color:#fff;font-size:1.15rem;font-weight:700;cursor:pointer;touch-action:manipulation}
.nb-intro-btn:active{transform:translateY(1px)}
.nb-chart,.nb-refs{margin-top:.3rem}`;
  document.head.appendChild(el);
}

const themeAccent = () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#1D6F4F';

// extraHtml: x=몇 개 전(n), y=율(0~100% 고정축). 적중률(var(--accent))·오경보율(var(--muted)) 두 선.
// 부하가 커질수록 적중이 내려가고 오경보가 올라가 '무너지는' 모습이 한 그림에 보인다.
function nbackChart(blocks, t) {
  if (!blocks.length) return '';
  const W = 320, H = 172, padL = 34, padR = 14, padT = 14, padB = 42;
  const ns = blocks.map((b) => b.n);
  const minN = Math.min(...ns), maxN = Math.max(...ns);
  const x = (n) => (maxN === minN ? padL + (W - padL - padR) / 2 : padL + ((n - minN) / (maxN - minN)) * (W - padL - padR));
  const y = (v) => H - padB - (v / 100) * (H - padT - padB);
  const draw = (key, color) => {
    const pts = blocks.filter((b) => b[key] != null).map((b) => ({ x: x(b.n), y: y(b[key] * 100) }));
    const poly = pts.length > 1 ? `<polyline points="${pts.map((p) => `${p.x},${p.y}`).join(' ')}" fill="none" stroke="${color}" stroke-width="2.5"/>` : '';
    const dots = pts.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="4" fill="${color}"/>`).join('');
    return poly + dots;
  };
  const hit = draw('hitRate', 'var(--accent)');
  const fa = draw('faRate', 'var(--muted)');
  const xticks = blocks.map((b) => `<text x="${x(b.n)}" y="${H - 24}" text-anchor="middle" class="axis">${b.n}</text>`).join('');
  const yticks = `<text x="6" y="${y(100) + 4}" class="axis">100</text><text x="6" y="${y(0) + 4}" class="axis">0</text>`;
  const xlabel = `<text x="${(padL + W - padR) / 2}" y="${H - 6}" text-anchor="middle" class="axis">${t('loadAxis')}</text>`;
  const legend = `<div class="legend"><span class="lg"><i style="background:var(--accent)"></i>${t('hitRate')}</span>` +
    `<span class="lg"><i style="background:var(--muted)"></i>${t('faRate')}</span></div>`;
  return `<div class="nb-chart"><h3 class="graph-title">${t('loadChart')}</h3>${legend}` +
    `<svg viewBox="0 0 ${W} ${H}" class="graph" role="img" aria-label="${t('loadChart')}">${hit}${fa}${xticks}${yticks}${xlabel}</svg></div>`;
}

// 블록 인트로용 예시: 길이 n+1 글자열에서 '첫 글자'와 'n개 뒤(마지막)'가 같아 표적이 되는 실제 예.
// 예 1개 전="A A", 2개 전="A B A", 3개 전="A B C A" — 사용자가 든 예("A B A")와 같은 형식.
function exampleHtml(n, t) {
  const fill = ['B', 'C', 'D', 'E'];
  const arr = ['A'];
  for (let i = 1; i < n; i++) arr.push(fill[i - 1]);
  arr.push('A');                       // 마지막 = n개 전(=첫 글자)과 같음 → 표적
  const matchIdx = new Set([0, n]);
  const chips = arr.map((c, i) => `<span class="nb-ex${matchIdx.has(i) ? ' hit' : ''}">${c}</span>`).join('');
  return `<div class="nb-example"><div class="nb-ex-row">${chips}</div>` +
    `<div class="nb-ex-cap">${t('exampleCaption', { n })}</div></div>`;
}

// 근거·참고문헌. 전부 '2차 문헌 확인, 원문 미확인'으로 표시(사용자가 나중에 원문 확인).
function refsBlock(t) {
  return `<div class="nb-refs"><h3 class="graph-title">${t('refsTitle')}</h3><p class="graph-note">${t('refsBody')}</p></div>`;
}

function analyze(records, t) {
  const blocks = nbackStats(records);
  const pct = (r) => (r == null ? '—' : Math.round(r * 100));
  const summary = [];
  // 블록마다 적중률·오경보율 두 줄을 같은 무게로(같은 .row). 한 점수로 뭉치지 않는다.
  blocks.forEach((b) => {
    summary.push({ label: t('hitRow', { n: b.n }), value: pct(b.hitRate), unit: '%', count: b.nTargets });
    summary.push({ label: t('faRow', { n: b.n }), value: pct(b.faRate), unit: '%', count: b.nNontargets });
  });
  const maxB = blocks.length ? blocks[blocks.length - 1] : null; // 가장 어려운 블록(최대 n)
  const hitMax = maxB ? maxB.hitRate : null;
  const faMax = maxB ? maxB.faRate : null;
  const nLabel = maxB ? maxB.n : '';

  return {
    topNotes: [t('taskNote'), t('transferNote'), t('sampleNote')],
    // 최근 회차 그래프: 최대 부하에서의 적중·오경보. 회차마다 값이 올라가도 그것은 '익숙해짐'이지
    // 기억력 향상이 아님을 graphNote(과제 재정의)가 사실로 말한다.
    series: [
      { key: 'hitMax', label: t('hitRateAtLoad', { n: nLabel }), value: hitMax == null ? null : Math.round(hitMax * 100), color: themeAccent(), group: 'rate' },
      { key: 'faMax', label: t('faRateAtLoad', { n: nLabel }), value: faMax == null ? null : Math.round(faMax * 100), color: '#8a8a8a', group: 'rate' },
    ],
    summary,
    extraHtml: nbackChart(blocks, t) + refsBlock(t),
  };
}

export function startNback({ id, blocks, scale = 1, accent }) {
  injectStyles();
  const BLOCKS = blocks;            // QA에서도 블록은 그대로 유지(개수·타이밍만 축약)
  if (QA) window.__nbackStats = nbackStats; // 분모 0/빈 배열 가드 자동점검용(QA 전용 노출)

  let stageEl = null, ruleEl = null, letterEl = null, statusEl = null, matchBtn = null;
  let seqCounter = 0;

  function ensureStage(host) {
    if (stageEl && host.contains(stageEl)) return;
    host.innerHTML = '';
    stageEl = document.createElement('div');
    stageEl.className = 'nb-stage';
    ruleEl = document.createElement('div');       // 상시 규칙(블록 내내)
    ruleEl.className = 'nb-rule';
    letterEl = document.createElement('div');      // 자극 글자(항상 중립색)
    letterEl.className = 'nb-letter';
    statusEl = document.createElement('div');      // 버퍼 안내 / 연습 피드백(글자와 다른 자리)
    statusEl.className = 'nb-status';
    matchBtn = document.createElement('button');
    matchBtn.type = 'button';
    matchBtn.className = 'nb-match';
    stageEl.append(ruleEl, letterEl, statusEl, matchBtn);
    host.appendChild(stageEl);
  }

  // 블록 인트로: 규칙 재안내 + '시작' 탭 대기. host 안에서 그린다(인트로 후 스트림은 판을 새로 만든다).
  async function playIntro(trial, ctx) {
    const { t, host } = ctx;
    stageEl = null;
    host.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'nb-intro';
    card.innerHTML = `<h2>${t('blockTitle', { n: trial.n })}</h2><p>${t('blockBody', { n: trial.n })}</p>` +
      exampleHtml(trial.n, t) +
      `<button type="button" class="nb-intro-btn">${t('blockStart')}</button>`;
    host.appendChild(card);
    ctx.setProgress(() => t('backLabel', { n: trial.n }));
    await new Promise((resolve) => {
      card.querySelector('.nb-intro-btn').addEventListener('pointerdown', resolve, { once: true });
    });
    return { record: null, outcome: {} };
  }

  // 스트림 한 자극: 글자 표시 500ms → 블랭크 → 고정 SOA 끝까지 응답창. 첫 누름만 기록.
  async function playStream(trial, ctx, phase) {
    const { t } = ctx;
    ensureStage(ctx.host);
    matchBtn.textContent = t('matchBtn');
    ruleEl.innerHTML = t('ruleLine', { n: trial.n });   // 상시 규칙(현재 블록 n)
    ctx.setProgress(() => t('backLabel', { n: trial.n }) + (trial.feedback ? ' · ' + t('practiceTag') : ''));

    // 봇/디버그가 스트림을 '보고' 판단할 수 있게 데이터 노출(정답 자체가 아니라 글자·위치만 — 사람이 보는 것과 동일).
    const seq = ++seqCounter;
    stageEl.dataset.seq = String(seq);
    stageEl.dataset.n = String(trial.n);
    stageEl.dataset.pos = String(trial.pos);
    stageEl.dataset.letter = trial.letter;
    stageEl.dataset.scored = trial.scored ? '1' : '0';

    // 버퍼(첫 n개)는 아직 비교할 글자가 없다 → 안내 + 버튼 흐리게(눌러도 채점 안 됨).
    if (trial.buffer) {
      statusEl.className = 'nb-status wait';
      statusEl.textContent = t('bufferNotice');
      matchBtn.classList.add('waiting');
    } else {
      statusEl.className = 'nb-status';
      statusEl.textContent = '';
      matchBtn.classList.remove('waiting');
    }

    letterEl.textContent = trial.letter;   // 중립색 유지(색 안 바꿈)

    // 응답 리스너를 t0 찍기 전에 붙여 첫 프레임 반응도 놓치지 않는다. 응답창=SOA 전체.
    let pressT = null, pressType = null;
    const onDown = (e) => { if (pressT == null) { pressT = performance.now(); pressType = e.pointerType || 'mouse'; } };
    const onKey = (e) => { if ((e.key === ' ' || e.key === 'Enter') && pressT == null) { pressT = performance.now(); pressType = 'keyboard'; } };
    matchBtn.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);

    const t0 = await ctx.stampAfterPaint();
    await delay(STIM_MS);
    letterEl.textContent = '';                 // 블랭크(글자는 사라지고 응답창은 이어짐)
    await delay(SOA_MS - STIM_MS);

    matchBtn.removeEventListener('pointerdown', onDown);
    window.removeEventListener('keydown', onKey);

    const pressed = pressT != null;
    const rt = pressed ? pressT - t0 : null;
    const isCorrect = trial.buffer ? null : (trial.isTarget ? pressed : !pressed);

    // 연습만 피드백 — '글자 자리'가 아니라 '상태줄'에 글+색으로(자극 글자와 확실히 구분). 본시행은 무피드백.
    if (trial.feedback) {
      statusEl.className = 'nb-status ' + (isCorrect ? 'ok' : 'no');
      statusEl.textContent = isCorrect ? t('fbOk') : t('fbNo');
      await delay(FEEDBACK_MS);
      statusEl.className = 'nb-status';
      statusEl.textContent = '';
    }

    // 버퍼(첫 n개)·연습은 기록하지 않는다. 본시행의 채점 시행만 자유형식 record 로.
    const record = (phase === 'main' && trial.scored)
      ? { n: trial.n, isTarget: trial.isTarget, pressed, isCorrect, rt, inputType: pressed ? pressType : null }
      : null;
    return { record, outcome: {} };
  }

  function playTrial(trial, ctx, phase) {
    return trial.type === 'intro' ? playIntro(trial, ctx) : playStream(trial, ctx, phase);
  }

  // 블록(n=1→2→3) 순서대로: [인트로] → [연습 스트림(피드백)] → [채점 스트림]. 각 스트림의 앞 n개는 버퍼.
  async function* mainTrials() {
    for (const n of BLOCKS) {
      yield { type: 'intro', n };
      const pr = buildStream(n, PRACTICE_SCORED, TARGET_RATE);
      for (let i = 0; i < pr.length; i++) {
        const s = pr[i];
        yield { type: 'stream', n, pos: i, letter: s.letter, isTarget: s.isTarget, buffer: s.buffer, scored: false, feedback: !s.buffer };
      }
      const mn = buildStream(n, SCORED, TARGET_RATE);
      for (let i = 0; i < mn.length; i++) {
        const s = mn[i];
        yield { type: 'stream', n, pos: i, letter: s.letter, isTarget: s.isTarget, buffer: s.buffer, scored: !s.buffer, feedback: false };
      }
    }
  }

  // 연습·인트로를 본시행 스트림에 접어 넣으므로 엔진 연습 페이즈는 비운다(블록별 연습이 엔진 페이즈로는 안 됨).
  async function* practiceTrials() { /* 비어 있음 — 블록별 연습은 mainTrials 안에 있다 */ }

  runTask({
    id,
    mount: 'app',
    scale,
    family: 'memory',            // 기억 계열(진한 초록). 단, 안내문에서 '동적 갱신' vs 코시·숫자거꾸로 '정적 저장'을 구분.
    accent,
    conditionKeys: ['input'],    // 라틴 글자라 언어 무관(응답은 위치·언어와 무관한 단일 버튼)
    choices: [],                 // 엔진 응답패드 안 씀 — host 안 '일치' 버튼을 과제가 소유
    timeLimitMs: null,
    practiceTrials,
    mainTrials,
    playTrial,
    analyze,
    sessionAcc: () => null,      // 정답률 대신 적중/오경보 두 율로 봄 → 저정확도 경고·속빈점 끔
    strings: STRINGS,
  });
}

const STRINGS = {
  ko: {
    title: '이어서 기억하기',
    howto: '글자가 하나씩 계속 나옵니다.<br><b>몇 개 전</b>에 나온 글자와 <b>같으면</b> ‘일치’를 누르고, 다르면 누르지 마세요.<br>‘몇 개 전’은 블록마다 달라지며, 시작 전에 안내합니다.',
    mainIntro: '이제 시작합니다. 블록마다 규칙을 다시 안내하고 짧게 연습한 뒤 이어집니다.',
    blockTitle: '{n}개 전과 같은 글자',
    blockBody: '글자가 하나씩 계속 나옵니다. 지금 나온 글자가 <b>{n}개 전</b>에 나온 글자와 <b>같으면</b> ‘일치’를 누르고, 다르면 그냥 두세요.<br>먼저 짧게 연습합니다.',
    blockStart: '시작',
    matchBtn: '일치',
    ruleLine: '<b>{n}개 전</b>과 같은 글자가 나오면 ‘일치’, 다르면 그냥 두세요',
    bufferNotice: '아직 비교할 글자가 없어요 — 지켜보세요',
    fbOk: '✓ 맞아요',
    fbNo: '✗ 아니에요',
    exampleCaption: '마지막 <b>A</b>는 <b>{n}개 전</b>의 A와 같으니 ‘일치’를 누릅니다',
    backLabel: '{n}개 전',
    practiceTag: '연습',
    hitRow: '{n}개 전 · 적중률',
    faRow: '{n}개 전 · 오경보율',
    hitRate: '적중률',
    faRate: '오경보율',
    hitRateAtLoad: '적중률 ({n}개 전)',
    faRateAtLoad: '오경보율 ({n}개 전)',
    loadChart: '부하(몇 개 전)에 따른 반응',
    loadAxis: '몇 개 전 (n)',
    refsTitle: '근거와 참고문헌',
    refsBody: '아래는 모두 2차 문헌으로 확인했으며 원문은 아직 확인하지 않았습니다.<br>· Jaeggi 외 (2008): N-back 훈련이 유동지능을 높였다는 원 주장.<br>· Redick 외 (2013): 같은 설계를 다시 했을 때 그 효과가 재현되지 않음.<br>· Melby-Lervåg & Hulme (2013): 여러 연구를 모은 메타분석에서 다른 능력으로의 전이가 확인되지 않음.<br>· 미국 FTC (2016): Lumosity가 근거 없는 두뇌향상 광고로 200만 달러에 합의.',
    taskNote: '이 과제는 계속 들어오는 글자를 머릿속에서 밀어내고 새로 채우며 따라가는 것을 봅니다(동적 갱신). 코시·숫자 거꾸로처럼 한 번 담아두었다 꺼내는 것(정적 저장)과는 다른 종류입니다.',
    transferNote: '이 과제를 잘하게 되는 것과 기억력이 좋아지는 것은 다릅니다. 연습하면 이 과제 자체는 늘지만, 그 향상이 다른 기억이나 지능으로 넘어간다(전이)는 주장은 대규모 재현 연구에서 확인되지 않았습니다.',
    sampleNote: '블록마다 표적이 몇 개뿐이라 적중률·오경보율이 회차마다 크게 흔들릴 수 있습니다. 정밀한 측정이 아닙니다.',
    graphNote: '회차를 거듭하면 이 값이 좋아질 수 있습니다. 그러나 그것은 이 과제에 익숙해진 것이지, 기억력이 좋아진 것이 아닙니다(위 참고문헌).',
    diffInputReason: '마우스·터치 등 입력 방식에 따라 버튼 누르는 속도가 달라 결과에 영향을 줄 수 있습니다.',
  },
  en: {
    title: 'Keeping Up in Memory',
    howto: 'Letters keep appearing one at a time.<br>If a letter is the <b>same as one shown a few steps back</b>, press “Match”; otherwise don’t press.<br>How many steps back changes each block, and is explained before it starts.',
    mainIntro: 'Now it begins. Each block re-explains the rule and gives a short practice first.',
    blockTitle: 'Same as {n} back',
    blockBody: 'Letters keep appearing one at a time. If the current letter is the <b>same as the one {n} back</b>, press “Match”; otherwise leave it.<br>A short practice comes first.',
    blockStart: 'Start',
    matchBtn: 'Match',
    ruleLine: 'If a letter is the <b>same as {n} back</b>, press “Match”; otherwise leave it',
    bufferNotice: 'Nothing to compare yet — just watch',
    fbOk: '✓ Correct',
    fbNo: '✗ Not this one',
    exampleCaption: 'The last <b>A</b> is the same as the A <b>{n} back</b>, so press “Match”',
    backLabel: '{n} back',
    practiceTag: 'practice',
    hitRow: '{n} back · hit rate',
    faRow: '{n} back · false-alarm rate',
    hitRate: 'Hit rate',
    faRate: 'False-alarm rate',
    hitRateAtLoad: 'Hit rate ({n} back)',
    faRateAtLoad: 'False-alarm rate ({n} back)',
    loadChart: 'Response by load (how many back)',
    loadAxis: 'how many back (n)',
    refsTitle: 'Basis and references',
    refsBody: 'All of the below were checked in secondary sources; the originals have not yet been checked.<br>· Jaeggi et al. (2008): the original claim that N-back training raised fluid intelligence.<br>· Redick et al. (2013): the effect did not replicate when the design was repeated.<br>· Melby-Lervåg & Hulme (2013): a meta-analysis found no transfer to other abilities.<br>· US FTC (2016): Lumosity settled for $2M over unsupported brain-improvement ads.',
    taskNote: 'This task looks at keeping up with incoming letters by pushing old ones out and taking new ones in (dynamic updating). It is a different kind from Corsi or Digit-Span-Backward, where you store something once and pull it back out (static storage).',
    transferNote: 'Getting good at this task and having a better memory are not the same thing. With practice you do improve at this task itself, but the claim that the improvement carries over (transfers) to other memory or intelligence has not held up in large replication studies.',
    sampleNote: 'Each block has only a few targets, so the hit and false-alarm rates can swing a lot from run to run. This is not a precise measurement.',
    graphNote: 'These values may rise over repeated runs. But that is you getting familiar with this task, not your memory improving (see references above).',
    diffInputReason: 'How you press (mouse, touch, etc.) changes how fast you respond, so it can affect the result.',
  },
  zh: {
    title: '一路跟着记',
    howto: '字母会一个接一个不断出现。<br>如果某个字母和<b>前面某个位置</b>的相同，就按“相同”；不同则不要按。<br>“几个之前”每个区块不同，开始前会说明。',
    mainIntro: '现在开始。每个区块都会重新说明规则并先做简短练习。',
    blockTitle: '和 {n} 个之前相同',
    blockBody: '字母会一个接一个不断出现。如果当前字母和 <b>{n} 个之前</b>的相同，就按“相同”，不同就不要按。<br>先做简短练习。',
    blockStart: '开始',
    matchBtn: '相同',
    ruleLine: '如果字母和 <b>{n} 个之前</b>相同就按“相同”，不同就不要按',
    bufferNotice: '还没有可比较的字母 — 先看着',
    fbOk: '✓ 对了',
    fbNo: '✗ 不是这个',
    exampleCaption: '最后的 <b>A</b> 和 <b>{n} 个之前</b>的 A 相同，所以按“相同”',
    backLabel: '{n} 个之前',
    practiceTag: '练习',
    hitRow: '{n} 个之前 · 命中率',
    faRow: '{n} 个之前 · 误报率',
    hitRate: '命中率',
    faRate: '误报率',
    hitRateAtLoad: '命中率（{n} 个之前）',
    faRateAtLoad: '误报率（{n} 个之前）',
    loadChart: '随负荷（几个之前）的反应',
    loadAxis: '几个之前 (n)',
    refsTitle: '依据与参考文献',
    refsBody: '以下均通过二手文献核实，原文尚未核对。<br>· Jaeggi 等 (2008)：N-back 训练提高流体智力的原始主张。<br>· Redick 等 (2013)：重复同样设计时该效应未能重现。<br>· Melby-Lervåg & Hulme (2013)：汇总多项研究的元分析未发现向其他能力的迁移。<br>· 美国 FTC (2016)：Lumosity 因缺乏依据的健脑广告以 200 万美元和解。',
    taskNote: '这个任务考察你把不断进来的字母不断挤出旧的、放入新的、一路跟上的能力（动态更新）。它和科西方块、倒背数字那种存一次再取出来（静态存储）是不同的类型。',
    transferNote: '把这个任务做好，和记忆力变好，是两回事。练习会让你在这个任务本身上进步，但这种进步会“迁移”到其他记忆或智力的说法，在大型重复研究中并未成立。',
    sampleNote: '每个区块的目标只有几个，所以命中率和误报率每次差别很大。这不是精确测量。',
    graphNote: '多次重复后这些数值可能上升。但那是你对这个任务更熟悉了，而不是记忆力变好了（见上方参考文献）。',
    diffInputReason: '用鼠标还是触摸等不同输入方式会影响你按下的速度，可能影响结果。',
  },
  es: {
    title: 'Seguir el Ritmo en la Memoria',
    howto: 'Van apareciendo letras una a una, sin parar.<br>Si una letra es <b>igual a otra mostrada unos pasos atrás</b>, pulsa “Igual”; si no, no pulses.<br>Cuántos pasos atrás cambia en cada bloque, y se explica antes de empezar.',
    mainIntro: 'Ahora empieza. Cada bloque vuelve a explicar la regla y hace una práctica breve primero.',
    blockTitle: 'Igual que {n} atrás',
    blockBody: 'Van apareciendo letras una a una. Si la letra actual es <b>igual a la de {n} atrás</b>, pulsa “Igual”; si no, déjala.<br>Primero una práctica breve.',
    blockStart: 'Empezar',
    matchBtn: 'Igual',
    ruleLine: 'Si una letra es <b>igual que {n} atrás</b>, pulsa “Igual”; si no, déjala',
    bufferNotice: 'Aún no hay con qué comparar — solo observa',
    fbOk: '✓ Correcto',
    fbNo: '✗ Este no',
    exampleCaption: 'La última <b>A</b> es igual que la A de <b>{n} atrás</b>, así que pulsa “Igual”',
    backLabel: '{n} atrás',
    practiceTag: 'práctica',
    hitRow: '{n} atrás · tasa de aciertos',
    faRow: '{n} atrás · tasa de falsas alarmas',
    hitRate: 'Tasa de aciertos',
    faRate: 'Tasa de falsas alarmas',
    hitRateAtLoad: 'Tasa de aciertos ({n} atrás)',
    faRateAtLoad: 'Tasa de falsas alarmas ({n} atrás)',
    loadChart: 'Respuesta según la carga (cuántas atrás)',
    loadAxis: 'cuántas atrás (n)',
    refsTitle: 'Base y referencias',
    refsBody: 'Todo lo siguiente se verificó en fuentes secundarias; los originales aún no se han comprobado.<br>· Jaeggi et al. (2008): la afirmación original de que entrenar N-back subía la inteligencia fluida.<br>· Redick et al. (2013): el efecto no se replicó al repetir el diseño.<br>· Melby-Lervåg & Hulme (2013): un metaanálisis no halló transferencia a otras capacidades.<br>· FTC de EE. UU. (2016): Lumosity pagó 2 millones de dólares por anuncios de mejora cerebral sin respaldo.',
    taskNote: 'Esta tarea observa cómo sigues el ritmo de las letras que entran, empujando las viejas y metiendo las nuevas (actualización dinámica). Es de otro tipo que Corsi o Dígitos al Revés, donde guardas algo una vez y lo vuelves a sacar (almacenamiento estático).',
    transferNote: 'Volverse bueno en esta tarea y tener mejor memoria no son lo mismo. Con práctica mejoras en esta tarea, pero la afirmación de que esa mejora se transfiere a otra memoria o inteligencia no se ha sostenido en grandes estudios de replicación.',
    sampleNote: 'Cada bloque tiene solo unos pocos objetivos, así que las tasas de aciertos y falsas alarmas varían mucho entre rondas. No es una medición precisa.',
    graphNote: 'Estos valores pueden subir a lo largo de las rondas. Pero eso es que te familiarizas con esta tarea, no que tu memoria mejore (ver referencias arriba).',
    diffInputReason: 'Cómo pulsas (ratón, táctil, etc.) cambia lo rápido que respondes, así que puede afectar el resultado.',
  },
};
