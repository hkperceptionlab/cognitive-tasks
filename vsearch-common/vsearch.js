// vsearch-common/vsearch.js — 시각 탐색("찾아지는 순간", Treisman feature vs conjunction). 청소년·성인 공유.
//
// 화면에 도형이 흩어져 있다(격자 아님, 최소 간격 확보). "빨간 원이 있나요?"에 있음/없음 응답(2지선다).
//   특징 탐색: 방해자극 = 파란 원만 → 빨간 원이 '튀어' 보임(항목 수와 무관하게 빠름, 기울기≈0).
//   결합 탐색: 방해자극 = 빨간 네모 + 파란 원 → 색·모양 어느 것도 단독 단서가 안 됨(하나씩 훑음, 기울기↑).
//   두 조건을 블록으로 분리(생성기로 순서 제어 — orderByConstraint 섞기 회피). 조건은 trial 메타데이터.
//
// 엔진 훅: mainTrials(블록 생성기) + practiceTrials(두 조건×항목수 전부) + playTrial(흩뿌린 자극+2지선다+제한시간) +
//   analyze(조건별 RT-항목수 회귀, R²<0.5면 기울기 게이트 — rotation 패턴 재사용) + conditionKeys ['input'].
//   sessionAcc 기본값(정확도 경고 ON — 스팬/JND와 달리 진짜 오답이 있는 과제).
//
// 자극 색은 과제 정의상 빨강/파랑(고정). accent(청록)는 UI(버튼·차트·배너 강조어)에만.

import { runTask, QA } from '../core/engine.js';

const SEARCH_TYPES = ['feature', 'conjunction'];
const SET_SIZES = [4, 8, 16, 24];       // 4점: 회귀에 필요한 최소(도형회전 4각도와 같은 이유)
const RESP_LIMIT = 8000;                // 응답 제한(ms). 초과 = 오답(무응답 방치 방지)
const FB_MS = 550;
const RED = '#d32f2f', BLUE = '#3949ab'; // 목표=빨간 원. 방해=파란 원 / 빨간 네모.
const R2_MIN = 0.5;                     // 직선 적합 판단 컷(rotation과 동일 — 4점이라 F검정 부적절)
const CHANCE_ACC = 0.625;               // 이하이면 2지선다 우연(50%)에 가까워 그 칸은 해석 불가

const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const med = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const themeAccent = () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#0E7C86';

function injectStyles() {
  if (document.getElementById('vs-style')) return;
  const el = document.createElement('style');
  el.id = 'vs-style';
  el.textContent = `
.vs-wrap{position:relative;width:100%;display:flex;flex-direction:column;align-items:center;
  gap:1.1rem;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.vs-rule{font-size:calc(1.05rem * var(--scale));line-height:1.5;color:var(--fg);background:#eef1f4;
  border:1px solid #dfe3e8;border-radius:12px;padding:.55rem .95rem;text-align:center}
.vs-rule b{color:var(--accent)}
.vs-fix{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:calc(2.4rem * var(--scale));
  color:var(--muted);font-weight:700}
.vs-arena{position:relative;width:min(92vw,460px);height:min(50vh,440px);border-radius:16px;
  background:#fff;box-shadow:inset 0 0 0 1px #ececec}
.vs-item{position:absolute;box-sizing:border-box}
.vs-pad{display:flex;gap:1.2rem}
.vs-btn{min-width:calc(6.2rem * var(--scale));min-height:calc(3.4rem * var(--scale));border:none;border-radius:14px;
  background:var(--accent);color:#fff;font-size:calc(1.25rem * var(--scale));font-weight:800;cursor:pointer;
  box-shadow:0 2px 8px rgba(0,0,0,.16);touch-action:manipulation}
.vs-btn:active{transform:scale(.97)}
.vs-btn[disabled]{opacity:.4;cursor:default}
.vs-status{min-height:calc(1.6rem * var(--scale));font-size:calc(1.1rem * var(--scale));font-weight:800}
.vs-status.ok{color:#2e7d32}.vs-status.no{color:#c62828}
.vs-chart{margin:.2rem 0 .4rem}
.vs-grid{margin:.6rem 0;border-collapse:collapse;font-size:.92rem;width:100%}
.vs-grid th,.vs-grid td{border:1px solid #e0e0e0;padding:.35rem .2rem;text-align:center}
.vs-grid th{color:var(--muted);font-weight:700}
.vs-grid td.chance{color:#c62828;font-weight:800}
.vs-grid caption{font-weight:700;color:var(--accent);margin-bottom:.3rem}`;
  document.head.appendChild(el);
}

// (항목수, 중앙값RT) 점들 최소제곱 회귀 → {slope(ms/항목), intercept, r2}. 점 2개 미만이면 null. (rotation과 동일)
function linreg(pts) {
  const n = pts.length;
  if (n < 2) return null;
  const mx = pts.reduce((s, p) => s + p.x, 0) / n;
  const my = pts.reduce((s, p) => s + p.y, 0) / n;
  let sxx = 0, sxy = 0, syy = 0;
  pts.forEach((p) => { sxx += (p.x - mx) ** 2; sxy += (p.x - mx) * (p.y - my); syy += (p.y - my) ** 2; });
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  const r2 = syy === 0 ? 1 : (sxy * sxy) / (sxx * syy);
  return { slope, intercept: my - slope * mx, r2 };
}

// extraHtml: x=항목수, y=RT 산점도 + 회귀직선. 색 var(--accent), 라벨 t(), 판정 문구 없음.
function vsChart(title, points, reg, t) {
  const W = 320, H = 150, padL = 46, padR = 12, padT = 14, padB = 34, XMAX = 24;
  if (!points.length) {
    return `<div class="vs-chart"><h3 class="graph-title">${title}</h3>` +
      `<svg viewBox="0 0 ${W} ${H}" class="graph"><text x="${W / 2}" y="${H / 2}" text-anchor="middle" class="axis">—</text></svg></div>`;
  }
  const ys = points.map((p) => p.y);
  let ymin = Math.min(...ys), ymax = Math.max(...ys);
  if (reg) { ymin = Math.min(ymin, reg.intercept + reg.slope * 4); ymax = Math.max(ymax, reg.intercept + reg.slope * XMAX); }
  if (ymin === ymax) { ymin -= 50; ymax += 50; }
  const x = (s) => padL + (s / XMAX) * (W - padL - padR);
  const y = (v) => H - padB - ((v - ymin) / (ymax - ymin)) * (H - padT - padB);
  const line = reg
    ? `<line x1="${x(4)}" y1="${y(reg.intercept + reg.slope * 4)}" x2="${x(XMAX)}" y2="${y(reg.intercept + reg.slope * XMAX)}" stroke="var(--accent)" stroke-width="2" opacity="0.55"/>`
    : '';
  const dots = points.map((p) => `<circle cx="${x(p.x)}" cy="${y(p.y)}" r="4" fill="var(--accent)"/>`).join('');
  const xticks = SET_SIZES.map((s) => `<text x="${x(s)}" y="${H - 14}" text-anchor="middle" class="axis">${s}</text>`).join('');
  const yticks = `<text x="4" y="${y(ymax) + 4}" class="axis">${Math.round(ymax)}</text><text x="4" y="${y(ymin) + 4}" class="axis">${Math.round(ymin)}</text>`;
  const xlabel = `<text x="${(padL + W - padR) / 2}" y="${H - 2}" text-anchor="middle" class="axis">${t('setsizeAxis')}</text>`;
  return `<div class="vs-chart"><h3 class="graph-title">${title}</h3>` +
    `<svg viewBox="0 0 ${W} ${H}" class="graph" role="img" aria-label="${title}">${line}${dots}${xticks}${yticks}${xlabel}</svg></div>`;
}

// 조건×항목수 정답률 표. 우연(50%)에 가까운 칸(≤CHANCE_ACC)을 빨강으로 드러낸다.
function accuracyGrid(accByCell, t) {
  const head = `<tr><th></th>${SET_SIZES.map((s) => `<th>${s}</th>`).join('')}</tr>`;
  const rows = SEARCH_TYPES.map((c) => {
    const tds = SET_SIZES.map((s) => {
      const a = accByCell[c + ':' + s];
      if (a == null) return `<td>—</td>`;
      const cls = a <= CHANCE_ACC ? ' class="chance"' : '';
      return `<td${cls}>${Math.round(a * 100)}</td>`;
    }).join('');
    return `<tr><th>${t(c + 'Name')}</th>${tds}</tr>`;
  }).join('');
  return `<table class="vs-grid"><caption>${t('accGridTitle')}</caption>${head}${rows}</table>`;
}

function analyze(records, t) {
  const overall = records.length ? records.filter((r) => r.isCorrect).length / records.length : 0;
  const topNotes = [t('taskNote'), t('sampleNote')];
  const series = [];
  const summaryRows = [];
  const charts = [];
  const nearChanceCells = [];
  const accByCell = {};

  // 정답률 표(있음+없음 모두 포함) — 찍기가 섞인 칸을 드러낸다.
  for (const c of SEARCH_TYPES) {
    for (const s of SET_SIZES) {
      const cell = records.filter((r) => r.searchType === c && r.setsize === s);
      const a = cell.length ? cell.filter((r) => r.isCorrect).length / cell.length : null;
      accByCell[c + ':' + s] = a;
      if (a != null && a <= CHANCE_ACC) nearChanceCells.push(`${t(c + 'Name')}·${s}`);
    }
  }

  // 조건별 회귀: '있음 + 정답' 시행만, 항목수별 중앙값 RT. R²<컷이면 기울기 게이트(요약·그래프 둘 다).
  for (const c of SEARCH_TYPES) {
    const points = [];
    for (const s of SET_SIZES) {
      const cell = records.filter((r) => r.searchType === c && r.setsize === s && r.present && r.isCorrect && r.rt != null && r.rt >= 200);
      const m = med(cell.map((r) => r.rt));
      if (m != null) points.push({ x: s, y: m });
    }
    const reg = linreg(points);
    const slope = reg ? reg.slope : null;
    const r2 = reg ? reg.r2 : null;
    const gateOk = slope != null && r2 != null && r2 >= R2_MIN;
    // R²<0.5면 기울기를 요약·그래프·산점도선 '모두' 막는다(0반전 게이트와 같은 원칙, 사용자 확정).
    const shownSlope = gateOk ? slope : null;
    series.push({ key: 'slope_' + c, label: t(c + 'Slope'), value: shownSlope, color: c === 'conjunction' ? themeAccent() : '#9e9e9e', group: 'slope' });
    summaryRows.push({ label: t(c + 'Slope'), value: shownSlope == null ? '—' : shownSlope.toFixed(1), unit: t('slopeUnit') });
    summaryRows.push({ label: t(c + 'R2'), value: r2 == null ? '—' : r2.toFixed(2), unit: '' }); // R²는 그대로 보여 '왜 —인지' 드러냄
    if (points.length < 2) topNotes.push(t('fewPointsNote', { c: t(c + 'Name') }));
    else if (!gateOk) topNotes.push(t('slopeGateNote', { c: t(c + 'Name') }));
    charts.push(vsChart(t(c + 'Chart'), points, gateOk ? reg : null, t)); // 게이트 시 회귀선 빼고 점만(오해 방지)
  }

  if (records.length && overall < 0.9) topNotes.push(t('lowAccuracy'));
  if (nearChanceCells.length) topNotes.push(t('chanceNote', { cells: nearChanceCells.join(', ') }));

  if (QA) window.__vsLast = {
    overall: +(overall * 100).toFixed(1),
    slopes: Object.fromEntries(series.map((s) => [s.key.replace('slope_', ''), s.value == null ? null : +s.value.toFixed(2)])),
    accByCell: Object.fromEntries(Object.entries(accByCell).map(([k, v]) => [k, v == null ? null : +(v * 100).toFixed(1)])),
    nearChance: nearChanceCells.length,
  };

  return {
    topNotes,
    series,
    summary: [...summaryRows, { label: t('accuracy'), value: Math.round(overall * 100), unit: '%' }],
    extraHtml: charts.join('') + accuracyGrid(accByCell, t),
  };
}

export function startVSearch({ id, reps, scale = 1, accent }) {
  injectStyles();
  const REPS = QA ? 1 : reps;      // QA 축약: 칸당 1회(16시행). 판정·자극·UI 불변.
  let wrap = null, ruleEl = null, fixEl = null, arena = null, statusEl = null, btns = [];
  let seq = 0;

  function ensure(host) {
    if (wrap && host.contains(wrap)) return;
    host.innerHTML = '';
    wrap = document.createElement('div'); wrap.className = 'vs-wrap';
    ruleEl = document.createElement('div'); ruleEl.className = 'vs-rule';
    arena = document.createElement('div'); arena.className = 'vs-arena';
    fixEl = document.createElement('div'); fixEl.className = 'vs-fix';
    arena.appendChild(fixEl);
    const pad = document.createElement('div'); pad.className = 'vs-pad';
    btns = ['present', 'absent'].map((resp) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'vs-btn'; b.dataset.resp = resp; b.disabled = true;
      pad.appendChild(b);
      return b;
    });
    statusEl = document.createElement('div'); statusEl.className = 'vs-status';
    wrap.append(ruleEl, arena, pad, statusEl);
    host.appendChild(wrap);
  }
  const setBtns = (on) => btns.forEach((b) => { b.disabled = !on; });

  // 항목 위치: arena 안 무작위, 최소 간격(겹침 방지). 거부 표집.
  function placeCenters(count, W, H, D) {
    const pad = D * 0.7, minD = D * 1.35;
    const pts = [];
    for (let i = 0; i < count; i++) {
      let placed = null;
      for (let attempt = 0; attempt < 300 && !placed; attempt++) {
        const cx = pad + D / 2 + Math.random() * (W - 2 * pad - D);
        const cy = pad + D / 2 + Math.random() * (H - 2 * pad - D);
        if (pts.every((p) => Math.hypot(p.cx - cx, p.cy - cy) >= minD)) placed = { cx, cy };
      }
      pts.push(placed || { cx: pad + D / 2 + Math.random() * (W - 2 * pad - D), cy: pad + D / 2 + Math.random() * (H - 2 * pad - D) });
    }
    return pts;
  }

  function renderField(trial) {
    // 이전 항목 제거(고정점은 유지).
    [...arena.querySelectorAll('.vs-item')].forEach((n) => n.remove());
    const W = arena.clientWidth, H = arena.clientHeight;
    const D = Math.round(Math.min(28, Math.max(16, W * 0.06)) * scale);
    const centers = placeCenters(trial.setsize, W, H, D);
    // 역할 배정: 목표(있음이면 1개=빨간 원). 방해자극은 조건에 따라.
    const roles = [];
    const targetIdx = trial.present ? Math.floor(Math.random() * trial.setsize) : -1;
    for (let i = 0; i < trial.setsize; i++) {
      if (i === targetIdx) { roles.push({ shape: 'circle', color: RED, target: true }); continue; }
      if (trial.searchType === 'feature') roles.push({ shape: 'circle', color: BLUE, target: false });
      else roles.push(null); // 결합: 아래에서 빨강네모/파랑원 반씩
    }
    if (trial.searchType === 'conjunction') {
      const distractorIdx = roles.map((r, i) => (r === null ? i : -1)).filter((i) => i >= 0);
      shuffle(distractorIdx);
      distractorIdx.forEach((idx, k) => {
        roles[idx] = k < distractorIdx.length / 2
          ? { shape: 'square', color: RED, target: false }
          : { shape: 'circle', color: BLUE, target: false };
      });
    }
    centers.forEach((pt, i) => {
      const r = roles[i];
      const it = document.createElement('div');
      it.className = 'vs-item';
      it.style.width = it.style.height = D + 'px';
      it.style.left = (pt.cx - D / 2) + 'px';
      it.style.top = (pt.cy - D / 2) + 'px';
      it.style.background = r.color;
      it.style.borderRadius = r.shape === 'circle' ? '50%' : '14%';
      if (r.target) it.dataset.target = '1';          // 봇/디버그가 '봄'(사람이 보는 것과 동일: 빨간 원)
      arena.appendChild(it);
    });
  }
  const clearField = () => [...arena.querySelectorAll('.vs-item')].forEach((n) => n.remove());

  async function playTrial(trial, ctx, phase) {
    const { host, t, stampAfterPaint, delay, pickMs } = ctx;
    ensure(host);
    ruleEl.innerHTML = t('ruleLine');
    btns[0].textContent = t('present'); btns[1].textContent = t('absent');
    if (phase === 'main') ctx.setProgress(() => `${t('mainLabel')} ${trial.n}`);

    // 1) 응시점(빈 arena 중앙)
    fixEl.textContent = '+'; statusEl.textContent = ''; statusEl.className = 'vs-status'; setBtns(false);
    clearField();
    await delay(pickMs([400, 700]));
    fixEl.textContent = '';

    // 2) 자극 배치 + 응답창(제한시간 8s, 초과=오답)
    renderField(trial);
    arena.dataset.type = trial.searchType; arena.dataset.setsize = String(trial.setsize); arena.dataset.seq = String(++seq);
    setBtns(true);

    const resp = await new Promise((resolve) => {
      let done = false, t0 = 0, timer = null;
      const cleanup = () => { btns.forEach((b) => b.removeEventListener('pointerdown', onDown)); window.removeEventListener('keydown', onKey); if (timer) clearTimeout(timer); };
      const finish = (p) => { if (done) return; done = true; cleanup(); resolve(p); };
      const pick = (r, inputType) => finish({ resp: r, rt: t0 ? performance.now() - t0 : 0, inputType, timedOut: false });
      const onDown = (e) => pick(e.currentTarget.dataset.resp, e.pointerType || 'mouse');
      const onKey = (e) => { if (e.key === 'ArrowLeft') pick('present', 'keyboard'); else if (e.key === 'ArrowRight') pick('absent', 'keyboard'); };
      btns.forEach((b) => b.addEventListener('pointerdown', onDown));
      window.addEventListener('keydown', onKey);
      stampAfterPaint().then((tp) => { if (done) return; t0 = tp; timer = setTimeout(() => finish({ resp: null, rt: null, inputType: null, timedOut: true }), RESP_LIMIT); });
    });

    setBtns(false);
    const said = resp.timedOut ? null : resp.resp;
    const isCorrect = !resp.timedOut && ((said === 'present') === trial.present); // 시간초과=오답

    if (phase === 'practice') {
      statusEl.className = 'vs-status ' + (isCorrect ? 'ok' : 'no');
      statusEl.textContent = isCorrect ? t('fbOk') : t('fbNo');
      await delay(FB_MS);
      statusEl.textContent = ''; statusEl.className = 'vs-status';
    }

    clearField();
    const record = phase === 'main' ? {
      condition: trial.searchType, searchType: trial.searchType, setsize: trial.setsize, present: trial.present,
      said, rt: resp.timedOut ? null : resp.rt, timedOut: resp.timedOut, isCorrect, inputType: resp.inputType || null,
    } : null;
    await delay(pickMs([400, 700]));
    return { record, outcome: { success: isCorrect } };
  }

  // 본시행: 두 조건을 블록으로(생성기로 순서 제어). 각 블록 안 칸(항목수×있음/없음)은 섞음.
  async function* mainTrials() {
    let n = 0;
    for (const searchType of SEARCH_TYPES) {
      const cells = [];
      for (const setsize of SET_SIZES) for (const present of [true, false]) for (let k = 0; k < REPS; k++) cells.push({ searchType, setsize, present });
      shuffle(cells);
      for (const c of cells) { n++; yield { ...c, n }; }
    }
  }

  // 연습: 두 조건 × 항목수 전부 최소 1회(본시행에서 처음 보는 항목수가 없게). 있음/없음 번갈아.
  async function* practiceTrials() {
    if (QA) { yield { searchType: 'feature', setsize: 4, present: true }; yield { searchType: 'conjunction', setsize: 4, present: true }; return; }
    const cells = [];
    let flip = true;
    for (const searchType of SEARCH_TYPES) for (const setsize of SET_SIZES) { cells.push({ searchType, setsize, present: flip }); flip = !flip; }
    for (const c of shuffle(cells)) yield c;
  }

  runTask({
    id,
    mount: 'app',
    scale,
    family: 'perception',       // 청록 (이미 있는 계열색 — 엔진 변경 없음)
    accent,
    conditionKeys: ['input'],   // RT(기울기)를 재므로 입력 속도가 개입 → 언어는 빼고 입력만(rotation과 같은 논리)
    choices: [],                // 있음/없음 버튼을 host 에 직접 그림
    practiceTrials,
    mainTrials,
    playTrial,
    analyze,
    strings: STRINGS,           // sessionAcc 미지정 → 엔진 기본(정확도 경고 ON)
  });
}

const STRINGS = {
  ko: {
    title: '찾아지는 순간',
    howto: '흩어진 도형 중에 <b>빨간 원</b>이 있으면 ‘있음’, 없으면 ‘없음’을 누르세요(또는 방향키 ← 있음 / → 없음).<br>빠르고 정확하게 — 없을 때도 있습니다.',
    ruleLine: '<b>빨간 원</b>이 있나요?',
    present: '있음', absent: '없음',
    featureName: '특징', conjunctionName: '결합',
    featureSlope: '특징 탐색 기울기', conjunctionSlope: '결합 탐색 기울기',
    featureR2: '특징 R²', conjunctionR2: '결합 R²',
    featureChart: '특징 탐색: 항목 수별 반응시간', conjunctionChart: '결합 탐색: 항목 수별 반응시간',
    slopeUnit: 'ms/항목', accuracy: '전체 정답률',
    setsizeAxis: '항목 수', accGridTitle: '조건 × 항목 수 정답률(%)',
    taskNote: '방해 자극이 색 하나로만 다르면(특징 탐색) 빨간 원이 저절로 튀어 보여, 항목이 많아져도 찾는 시간이 거의 안 늘어납니다. 색과 모양을 함께 봐야 하면(결합 탐색) 하나씩 훑게 되어, 항목이 많을수록 느려집니다. 그 늘어나는 정도가 ‘기울기’입니다.',
    sampleNote: '항목 수당 시행이 몇 개뿐이라 기울기·R²가 회차마다 크게 달라질 수 있습니다. 정밀한 측정이 아닙니다.',
    fewPointsNote: '{c} 탐색은 유효한(있음·정답) 응답이 있는 항목 수가 2개 미만이라 기울기를 계산할 수 없습니다.',
    slopeGateNote: '{c} 탐색은 점들이 직선을 이루지 않아(R²가 낮아) 기울기를 신뢰할 수 없어 표시하지 않습니다.',
    chanceNote: '다음 칸은 정답률이 우연 수준(50%)에 가까워, 찍었을 가능성이 있어 해석하기 어렵습니다: {cells}.',
    fbOk: '✓ 맞아요', fbNo: '✗ 아니에요',
    diffInputReason: '입력 방식(키·터치·마우스)에 따라 버튼 누르는 속도가 달라 반응시간에 영향을 줄 수 있습니다(기울기에는 영향이 적습니다).',
  },
  en: {
    title: 'When It Is Found',
    howto: 'If there is a <b>red circle</b> among the scattered shapes, press “Present”; if not, press “Absent” (or arrow key ← Present / → Absent).<br>Fast and accurate — sometimes there is none.',
    ruleLine: 'Is there a <b>red circle</b>?',
    present: 'Present', absent: 'Absent',
    featureName: 'Feature', conjunctionName: 'Conjunction',
    featureSlope: 'Feature search slope', conjunctionSlope: 'Conjunction search slope',
    featureR2: 'Feature R²', conjunctionR2: 'Conjunction R²',
    featureChart: 'Feature search: RT by set size', conjunctionChart: 'Conjunction search: RT by set size',
    slopeUnit: 'ms/item', accuracy: 'Overall accuracy',
    setsizeAxis: 'set size', accGridTitle: 'Accuracy by condition × set size (%)',
    taskNote: 'When distractors differ by just one color (feature search), the red circle pops out, so adding more items barely changes the search time. When you must combine color and shape (conjunction search), you scan one by one, so more items means slower. How much slower is the “slope”.',
    sampleNote: 'There are only a few trials per set size, so the slope and R² can vary a lot from run to run. This is not a precise measurement.',
    fewPointsNote: '{c} search has fewer than two set sizes with a valid (present, correct) response, so the slope cannot be computed.',
    slopeGateNote: '{c} search: the points do not fall on a line (low R²), so the slope is not trustworthy and is not shown.',
    chanceNote: 'These cells have accuracy near chance (50%), so answers may have been guesses and are hard to interpret: {cells}.',
    fbOk: '✓ Correct', fbNo: '✗ Not this one',
    diffInputReason: 'How you respond (key, touch, mouse) changes how fast you press, so it can affect reaction time (it has little effect on the slope).',
  },
  zh: {
    title: '被找到的一刻',
    howto: '若散布的图形中有<b>红色圆形</b>，请按“有”；没有则按“无”（或方向键 ← 有 / → 无）。<br>又快又准——有时候并没有。',
    ruleLine: '有<b>红色圆形</b>吗？',
    present: '有', absent: '无',
    featureName: '特征', conjunctionName: '结合',
    featureSlope: '特征搜索斜率', conjunctionSlope: '结合搜索斜率',
    featureR2: '特征 R²', conjunctionR2: '结合 R²',
    featureChart: '特征搜索：各项目数反应时间', conjunctionChart: '结合搜索：各项目数反应时间',
    slopeUnit: 'ms/项', accuracy: '总正确率',
    setsizeAxis: '项目数', accGridTitle: '条件 × 项目数 正确率(%)',
    taskNote: '当干扰项只在一种颜色上不同（特征搜索）时，红色圆形会自己“跳”出来，所以项目再多，搜索时间几乎不变。若必须同时看颜色和形状（结合搜索），就要一个一个地看，项目越多越慢。变慢的程度就是“斜率”。',
    sampleNote: '每个项目数只有几个试次，所以斜率和 R² 每次差别很大。这不是精确测量。',
    fewPointsNote: '{c}搜索中，有有效（有目标且正确）反应的项目数少于两个，无法计算斜率。',
    slopeGateNote: '{c}搜索：这些点不成一条直线（R² 低），斜率不可靠，故不显示。',
    chanceNote: '以下格子的正确率接近随机水平（50%），可能是猜的，难以解读：{cells}。',
    fbOk: '✓ 对了', fbNo: '✗ 不是这个',
    diffInputReason: '不同的响应方式（按键、触摸、鼠标）会影响你按下的速度，可能影响反应时间（对斜率影响较小）。',
  },
  es: {
    title: 'Cuando Se Encuentra',
    howto: 'Si hay un <b>círculo rojo</b> entre las figuras dispersas, pulsa “Sí”; si no, pulsa “No” (o tecla de flecha ← Sí / → No).<br>Rápido y preciso — a veces no hay ninguno.',
    ruleLine: '¿Hay un <b>círculo rojo</b>?',
    present: 'Sí', absent: 'No',
    featureName: 'Rasgo', conjunctionName: 'Conjunción',
    featureSlope: 'Pendiente búsqueda por rasgo', conjunctionSlope: 'Pendiente búsqueda por conjunción',
    featureR2: 'R² rasgo', conjunctionR2: 'R² conjunción',
    featureChart: 'Búsqueda por rasgo: TR por nº de elementos', conjunctionChart: 'Búsqueda por conjunción: TR por nº de elementos',
    slopeUnit: 'ms/elem', accuracy: 'Precisión total',
    setsizeAxis: 'nº de elementos', accGridTitle: 'Precisión por condición × nº de elementos (%)',
    taskNote: 'Cuando los distractores difieren en un solo color (búsqueda por rasgo), el círculo rojo resalta solo, así que añadir más elementos apenas cambia el tiempo. Si hay que combinar color y forma (búsqueda por conjunción), miras uno a uno, así que más elementos significa más lento. Cuánto más lento es la “pendiente”.',
    sampleNote: 'Solo hay unos pocos ensayos por nº de elementos, así que la pendiente y el R² varían mucho entre rondas. No es una medición precisa.',
    fewPointsNote: 'La búsqueda por {c} tiene menos de dos tamaños con una respuesta válida (presente, correcta), así que la pendiente no puede calcularse.',
    slopeGateNote: 'Búsqueda por {c}: los puntos no forman una recta (R² bajo), así que la pendiente no es fiable y no se muestra.',
    chanceNote: 'Estas celdas tienen precisión cercana al azar (50%), así que las respuestas pueden ser adivinanzas y son difíciles de interpretar: {cells}.',
    fbOk: '✓ Correcto', fbNo: '✗ Este no',
    diffInputReason: 'Cómo respondes (tecla, táctil, ratón) cambia lo rápido que pulsas, así que puede afectar el tiempo de reacción (afecta poco a la pendiente).',
  },
};
