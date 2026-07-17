// core/engine.js — 인지과제 공통 엔진. 14개 과제가 이 위에 얹힌다.
//
// 과제는 아래 형태의 config 를 넘겨 runTask(config) 를 호출한다:
//   {
//     id, mount,
//     practiceCount,
//     timeLimitMs,                          // 문항당 제한시간(ms). null 이면 제한 없음.
//     scale,                                // 글자·버튼 배율 (1 = 기본)
//     buildPracticePool(): trial[]          // 연습용 (기록 안 함)
//     buildMainPool(): trial[]              // 각 trial 은 .condition, .correct 를 가진다
//     choices: [{ id, ... }],               // 응답 버튼 정의(없으면 pad 안 씀 — 코시처럼 자극판이 응답면)
//     renderStimulus(trial, el, scale, t),  // 자극을 el 에 그린다
//     renderChoice(choice, btnEl, scale, t),// 버튼을 그린다
//     isCorrect?(trial, resp): bool,        // 정답 판정(선택). resp={choiceId,timedOut,rt}.
//                                           // 생략 시 기본: 눌러서 correct 와 일치해야 정답.
//                                           // Go/No-go 처럼 '안 누름(timedOut)이 정답'인 과제용 훅.
//     analyze(records, t): { series:[{key,label,value,color}], summary:[{label,value,unit}] },
//     timing: { fixation:[min,max], isi:[min,max], feedbackMs },
//     strings: { ko:{...}, en:{...}, zh:{...}, es:{...} },
//
//     ── 적응형·다중자극/응답 과제용 확장 훅(선택; 없으면 위 기본 경로와 100% 동일) ──
//     mainTrials(): async generator                 // 정적 buildMainPool 대신. 시행을 yield 하고
//                                                   // 엔진이 그 결과 outcome 을 .next(outcome) 로 되돌린다
//                                                   // (성공 여부로 다음 시행을 정하는 계단식 등). 코시·숫자거꾸로.
//     practiceTrials(): async generator             // 연습용 적응형 소스(선택)
//     playTrial(trial, ctx, phase): {record,outcome}// 한 시행 내부를 과제가 소유(순차 다중 자극·순서 다중 응답).
//                                                   // ctx={host,scale,timing,timeLimitMs,t,delay,pickMs,
//                                                   //      stampAfterPaint,setProgress(fn)}. 생략 시 기본 구동기.
//     sessionAcc(records): number|null              // 세션 정확도 재정의(선택). 스팬형은 null 로 저정확도 경고 끔.
//   }
//
// trial  = { condition, correct, ...taskData }
// record = { condition, correct, choiceId, rt, timedOut, isCorrect, rtValid }  (커스텀 구동기는 자유 형식)
// outcome= { success, ... }  // 적응형 소스(mainTrials)의 yield 로 되돌아가는 시행 결과

import { ENGINE_STRINGS, LANG_NAMES, detectLang, LANG_STORAGE_KEY } from './i18n.js';

const STORAGE_PREFIX = 'cog:';
const MAX_STORED = 60;

// ── 유틸 ────────────────────────────────────────────────
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// [min,max] 범위면 그 안에서 무작위 정수, 숫자면 그대로 (매 시행 jitter 용)
const pickMs = (v) => (Array.isArray(v) ? Math.round(v[0] + Math.random() * (v[1] - v[0])) : v);

// 자극이 실제로 '그려진 뒤'의 시각을 찍는다.
// rAF 콜백은 페인트 '전'에 실행되므로 한 번으로는 부족하다. rAF 를 두 번 겹쳐
// 첫 프레임이 페인트된 다음 프레임에서 performance.now() 로 기록한다 (Date.now 금지).
const stampAfterPaint = () =>
  new Promise((r) =>
    requestAnimationFrame(() => requestAnimationFrame(() => r(performance.now())))
  );

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 같은 조건 3연속 금지. 남은 개수로 가중한 그리디로 조건 순서를 만든다.
function sequenceConditions(counts) {
  const conds = Object.keys(counts);
  const remaining = { ...counts };
  let total = conds.reduce((s, k) => s + remaining[k], 0);
  const seq = [];
  while (total > 0) {
    const n = seq.length;
    const twoSame = n >= 2 && seq[n - 1] === seq[n - 2];
    let elig = conds.filter((c) => remaining[c] > 0 && !(twoSame && c === seq[n - 1]));
    if (elig.length === 0) elig = conds.filter((c) => remaining[c] > 0); // 안전장치
    const w = elig.reduce((s, c) => s + remaining[c], 0);
    let r = Math.random() * w;
    let pick = elig[0];
    for (const c of elig) {
      r -= remaining[c];
      if (r <= 0) { pick = c; break; }
    }
    seq.push(pick);
    remaining[pick]--;
    total--;
  }
  return seq;
}

// 조건별로 묶어 셔플한 뒤, 제약을 지키는 조건 순서에 실제 trial 을 배치.
function orderByConstraint(pool) {
  const groups = {};
  for (const tr of pool) (groups[tr.condition] ||= []).push(tr);
  const counts = {};
  for (const k in groups) {
    groups[k] = shuffle(groups[k]);
    counts[k] = groups[k].length;
  }
  const seq = sequenceConditions(counts);
  const idx = {};
  for (const k in groups) idx[k] = 0;
  return seq.map((c) => groups[c][idx[c]++]);
}

// ── 저장소 (기기를 떠나지 않음) ─────────────────────────
function loadSessions(id) {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_PREFIX + id + ':sessions') || '[]');
  } catch {
    return [];
  }
}
function saveSessions(id, sessions) {
  try {
    localStorage.setItem(STORAGE_PREFIX + id + ':sessions', JSON.stringify(sessions));
  } catch {
    /* 저장 불가(사생활 모드 등) 시 조용히 무시 */
  }
}

// analyze 에 넘기기 전, RT 평균에 쓸 수 있는 시행만 rtValid=true 로 표시한다.
//  - 시간초과 제외
//  - 오답 제외 (정확도 계산엔 여전히 포함)
//  - RT 200ms 미만 / 3000ms 초과 무효
//  - 본시행 첫 시행 제외
function markRtValidity(records) {
  records.forEach((r, i) => {
    r.rtValid =
      !r.timedOut && r.isCorrect && r.rt != null && r.rt >= 200 && r.rt <= 3000 && i > 0;
  });
}

// ── 조건(비교 가능성) 판단 — 모든 차원을 한 곳에서 ──────────
// 세션 비교 기준이 되는 조건 차원. 새 차원(예: 기기 종류)이 생기면
// 여기 배열에만 추가하면 필터·안내가 함께 따라간다. 차원별 필터를 따로 만들지 말 것.
const CONDITION_KEYS = ['lang', 'input'];
const FEW_TRIALS = 8; // 유효 문항이 이보다 적으면 '값이 흔들린다' 경고
const LOW_ACC = 0.9;  // 정답률이 이보다 낮은 회차는 그래프에서 속 빈 점 + 선 미연결 (상단 경고와 같은 기준)

// 세션에서 조건을 뽑는다. 구버전 세션엔 input 이 없어 null.
function conditionOf(session, curLang) {
  return { lang: session.lang || curLang, input: session.input || null };
}
// 두 조건이 '어느 차원에서' 다른지 반환(빈 배열이면 완전히 같아 비교 가능).
// 비교 가능 여부와 그 이유(어떤 차원이 다른지)를 이 함수 하나로 판단한다.
function conditionDiffs(a, b) {
  return CONDITION_KEYS.filter((k) => a[k] !== b[k]);
}
// 이번 세션의 대표 입력 방식: 응답들 중 가장 많이 쓰인 것(시간초과 응답은 입력 없음).
function dominantInput(records) {
  const counts = {};
  records.forEach((r) => { if (r.inputType) counts[r.inputType] = (counts[r.inputType] || 0) + 1; });
  let best = null, bestN = 0;
  for (const k in counts) if (counts[k] > bestN) { best = k; bestN = counts[k]; }
  return best;
}

// ── 스타일 주입 (모든 과제 공통 UI) ─────────────────────
function injectStyles() {
  if (document.getElementById('cog-engine-style')) return;
  const css = `
:root{--bg:#fafafa;--fg:#212121;--muted:#757575;--card:#fff;--accent:#3949ab;--scale:1;
  --stim:calc(clamp(2.6rem,15vw,5rem) * var(--scale));
  --btn-h:calc(4.4rem * var(--scale));--pad-fs:calc(1.15rem * var(--scale));}
*{box-sizing:border-box}
html,body{margin:0}
.app-root{min-height:100dvh;display:flex;flex-direction:column;background:var(--bg);
  color:var(--fg);font-family:system-ui,-apple-system,'Segoe UI',Roboto,'Noto Sans KR',sans-serif;
  padding-bottom:calc(3.4rem + env(safe-area-inset-bottom));}
.top{padding:.7rem 1rem;min-height:2.4rem;display:flex;align-items:center;
  justify-content:space-between;gap:.5rem;flex-wrap:wrap}
.progress{font-size:.95rem;color:var(--muted);letter-spacing:.02em}
.langbar{display:flex;gap:.3rem;margin-left:auto;flex-wrap:wrap}
.langbtn{border:1px solid #d0d0d0;background:#fff;color:var(--muted);border-radius:999px;
  padding:calc(.28rem * var(--scale)) calc(.7rem * var(--scale));
  font-size:calc(.82rem * var(--scale));font-weight:600;cursor:pointer;touch-action:manipulation}
.langbtn.on{background:var(--accent);color:#fff;border-color:var(--accent)}
.stage{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding:1rem;text-align:center}
.stimulus{font-size:var(--stim);font-weight:800;line-height:1;letter-spacing:.02em}
.stimulus.fixation{color:var(--muted);font-weight:600}
.stimulus.ok{color:#2e7d32}.stimulus.no{color:#c62828}
.stimulus.to{color:var(--muted);font-size:2rem;font-weight:600}
.host{width:100%;max-width:520px;display:flex;align-items:center;justify-content:center}
.host[hidden]{display:none}
.panel{width:100%;max-width:520px}
.panel-card{background:var(--card);border-radius:16px;padding:1.4rem;
  box-shadow:0 1px 3px rgba(0,0,0,.08);text-align:center}
.panel-card h1{font-size:1.6rem;margin:.2rem 0 .8rem}
.panel-card h2{font-size:1.3rem;margin:.2rem 0 .6rem}
.howto{line-height:1.6;margin:.6rem 0}
.meta{color:var(--muted);font-size:.9rem;margin:.6rem 0}
.summary{margin:1rem 0;text-align:left}
.summary .row{display:flex;justify-content:space-between;padding:.6rem .2rem;
  border-bottom:1px solid #eee;font-size:1.05rem}
.summary .row b{font-variant-numeric:tabular-nums}
.summary .cnt{font-weight:600;color:var(--muted);font-size:.85em;margin-left:.35em}
.summary .few{color:#c62828;font-size:.8rem;margin:-.15rem .2rem .5rem;text-align:right}
.condition-line{margin:.9rem 0 0;font-size:.92rem;color:var(--fg);text-align:center;font-weight:600}
.top-note{background:#fff3cd;color:#7a5b00;border:1px solid #ffe69c;border-radius:10px;
  padding:.6rem .8rem;margin:.2rem 0 .8rem;font-size:.9rem;line-height:1.45;text-align:left}
.cog-graph{margin-bottom:.3rem}
.graph-title{font-size:1rem;color:var(--muted);margin:1rem 0 .4rem;font-weight:600}
.graph{width:100%;height:auto}
.graph .axis{fill:var(--muted);font-size:10px}
.legend{display:flex;flex-wrap:wrap;gap:.35rem .9rem;justify-content:center;
  margin:.2rem 0 .5rem;font-size:.82rem;color:var(--fg)}
.legend .lg{display:inline-flex;align-items:center;gap:.35rem}
.legend i{width:.85rem;height:.85rem;border-radius:2px;display:inline-block;flex:none}
.legend i.hollow{background:transparent;border:2px solid var(--muted);border-radius:50%}
.graph-note{font-size:.82rem;color:var(--muted);line-height:1.55;margin:.7rem 0 0;text-align:left}
.switches{margin-top:1rem;font-size:.9rem;color:var(--muted)}
.switches a{color:var(--accent);text-decoration:none}
.action{margin-top:1rem;width:100%;min-height:3.4rem;border:none;border-radius:12px;
  background:var(--accent);color:#fff;font-size:1.15rem;font-weight:700;cursor:pointer;
  touch-action:manipulation}
.action:active{transform:translateY(1px)}
.pad{display:grid;grid-template-columns:1fr 1fr;gap:.8rem;padding:1rem;
  max-width:560px;margin:0 auto;width:100%}
/* display:grid 가 UA 의 [hidden]{display:none} 을 덮으므로 명시적으로 숨긴다.
   (응답 패드는 인트로·결과 화면에 나오면 안 됨) */
.pad[hidden]{display:none}
.pad:not(.live){opacity:.4}
.pad:not(.live) .choice{pointer-events:none}
.choice{min-height:min(var(--btn-h),20dvh);border:none;border-radius:16px;font-size:var(--pad-fs);
  font-weight:700;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.15);touch-action:manipulation}
.choice:active{transform:scale(.97)}
.disclaimer{position:fixed;bottom:0;left:0;right:0;
  padding:.5rem 1rem calc(.5rem + env(safe-area-inset-bottom));
  background:rgba(250,250,250,.95);border-top:1px solid #e0e0e0;color:var(--muted);
  font-size:.8rem;text-align:center;backdrop-filter:blur(4px)}`;
  const el = document.createElement('style');
  el.id = 'cog-engine-style';
  el.textContent = css;
  document.head.appendChild(el);
}

// ── 최근 7회 다중 선그래프 (외부 라이브러리 없이 SVG) ────
// series: [{ key, label, color }]  세션값은 d.values[key] (구버전은 d.primary 로 호환)
function drawGraph(el, sessions, series, t) {
  const data = sessions.slice(-7);
  // 세션에서 특정 시리즈 값 꺼내기 (구버전 primary 형식 호환)
  const val = (d, key) => {
    if (d.values && key in d.values) return d.values[key];
    if (d.primary && d.primary.key === key) return d.primary.value;
    return null;
  };
  const valid = (v) => v != null && isFinite(v);
  // 정답률 낮은 회차: 속 빈 점으로 그리고 선으로 잇지 않는다(믿기 어려운 값이므로).
  const isLow = (d) => d.acc != null && d.acc < LOW_ACC;

  // 모든 시리즈 값으로 공통 Y 범위 (모두 ms 단위라 함께 두는 것이 정직)
  const allVals = [];
  data.forEach((d) => series.forEach((s) => { const v = val(d, s.key); if (valid(v)) allVals.push(v); }));
  if (allVals.length === 0) {
    el.innerHTML = `<p class="meta">${t('noHistory')}</p>`;
    return;
  }
  let min = Math.min(...allVals), max = Math.max(...allVals);
  if (min === max) { min -= 1; max += 1; }

  const W = 340, H = 184, padL = 34, padR = 16, padT = 12, padB = 34;
  const x = (i) =>
    data.length === 1 ? padL + (W - padL - padR) / 2 : padL + (i * (W - padL - padR)) / (data.length - 1);
  const y = (v) => H - padB - ((v - min) / (max - min)) * (H - padT - padB);

  // 같은 날 여러 번이면 시각을 덧붙여 라벨 겹침 방지
  const md = (dt) => `${dt.getMonth() + 1}/${dt.getDate()}`;
  const dayCount = {};
  data.forEach((d) => { const k = md(new Date(d.date)); dayCount[k] = (dayCount[k] || 0) + 1; });

  // 시리즈별 선 + 점. 값이 없거나 정답률이 낮은 지점에서 선이 끊긴다(연결하지 않음).
  // 정답률 낮은 회차의 점은 속 빈 원(테두리만)으로, 정상 회차는 꽉 찬 원으로 그린다.
  const lines = series
    .map((s) => {
      const segs = [];
      let cur = [];
      data.forEach((d, i) => {
        const v = val(d, s.key);
        if (!valid(v) || isLow(d)) { if (cur.length) { segs.push(cur); cur = []; } }
        else cur.push(`${x(i)},${y(v)}`);
      });
      if (cur.length) segs.push(cur);
      const polys = segs
        .map((pts) => `<polyline points="${pts.join(' ')}" fill="none" stroke="${s.color}" stroke-width="2.5"/>`)
        .join('');
      const dots = data
        .map((d, i) => {
          const v = val(d, s.key);
          if (!valid(v)) return '';
          return isLow(d)
            ? `<circle cx="${x(i)}" cy="${y(v)}" r="3.5" fill="#fff" stroke="${s.color}" stroke-width="1.8"/>`
            : `<circle cx="${x(i)}" cy="${y(v)}" r="3.5" fill="${s.color}"/>`;
        })
        .join('');
      return polys + dots;
    })
    .join('');

  // 가장자리 라벨은 안쪽으로 정렬해 뷰박스 밖으로 잘리지 않게 한다
  // (첫 점=왼쪽정렬, 끝 점=오른쪽정렬, 나머지=가운데). 특히 H:MM 라벨이 오른쪽에서 잘리던 문제.
  const anchorFor = (i) =>
    data.length === 1 ? 'middle' : i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle';
  const xLabels = data
    .map((d, i) => {
      const dt = new Date(d.date);
      const k = md(dt);
      const a = anchorFor(i);
      if (dayCount[k] > 1) {
        const hh = dt.getHours(), mm = String(dt.getMinutes()).padStart(2, '0');
        return `<text x="${x(i)}" y="${H - 20}" text-anchor="${a}" class="axis">${k}</text>` +
               `<text x="${x(i)}" y="${H - 8}" text-anchor="${a}" class="axis">${hh}:${mm}</text>`;
      }
      return `<text x="${x(i)}" y="${H - 12}" text-anchor="${a}" class="axis">${k}</text>`;
    })
    .join('');

  // Y축 최소·최대 눈금 (ms 감각)
  const yTicks =
    `<text x="4" y="${y(max) + 4}" class="axis">${Math.round(max)}</text>` +
    `<text x="4" y="${y(min) + 4}" class="axis">${Math.round(min)}</text>`;

  // 표시된 데이터에 정답률 낮은 회차가 있으면 범례에 '정답률 낮음'(속 빈 원)을 덧붙인다.
  const anyLow = data.some((d) => isLow(d));
  const legend =
    `<div class="legend">` +
    series.map((s) => `<span class="lg"><i style="background:${s.color}"></i>${s.label}</span>`).join('') +
    (anyLow ? `<span class="lg"><i class="hollow"></i>${t('lowAccLegend')}</span>` : '') +
    `</div>`;

  el.innerHTML =
    legend +
    `<svg viewBox="0 0 ${W} ${H}" class="graph" role="img" aria-label="${t('lastSessions')}">${lines}${xLabels}${yTicks}</svg>`;
}

// ── 메인 진입점 ─────────────────────────────────────────
export function runTask(config) {
  // 언어는 가변 상태: 상단 버튼으로 새로고침 없이 즉시 전환.
  let lang = detectLang();
  let es = ENGINE_STRINGS[lang];
  let ts = (config.strings && config.strings[lang]) || {};
  const t = (k, vars) => {
    let s = ts[k] ?? es[k] ?? k;
    if (vars) for (const p in vars) s = s.replace(`{${p}}`, vars[p]);
    return s;
  };

  // 문항당 제한시간(null=없음)과 글자·버튼 배율은 전적으로 config 가 정한다.
  const timeLimitMs = config.timeLimitMs == null ? Infinity : config.timeLimitMs;
  const scale = config.scale || 1;
  const timing = Object.assign(
    { fixation: [400, 800], isi: [300, 700], feedbackMs: 500 },
    config.timing || {}
  );

  document.documentElement.lang = lang;
  injectStyles();
  document.documentElement.style.setProperty('--scale', scale);

  const mount = document.getElementById(config.mount || 'app');
  mount.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'app-root';
  root.innerHTML = `
    <header class="top">
      <div id="cog-progress" class="progress" hidden></div>
      <div id="cog-langbar" class="langbar"></div>
    </header>
    <main class="stage">
      <div id="cog-stimulus" class="stimulus" hidden></div>
      <div id="cog-host" class="host" hidden></div>
      <section id="cog-panel" class="panel"></section>
    </main>
    <div id="cog-pad" class="pad" hidden></div>
    <footer class="disclaimer">${t('disclaimer')}</footer>`;
  mount.appendChild(root);

  const progress = root.querySelector('#cog-progress');
  const stimulus = root.querySelector('#cog-stimulus');
  const host = root.querySelector('#cog-host');       // 커스텀 시행 구동기(예: 코시 블록판)가 소유
  const panel = root.querySelector('#cog-panel');
  const pad = root.querySelector('#cog-pad');
  const langbar = root.querySelector('#cog-langbar');
  const footer = root.querySelector('.disclaimer');

  // 응답 버튼이 없는 과제(코시처럼 자극판 자체가 응답 표면)도 있으므로 choices 는 선택.
  const choices = config.choices || [];

  // 이 과제가 실제로 번역을 제공하는 언어만 노출 (엔진 문자열 ∩ 과제 문자열)
  const langs = Object.keys(LANG_NAMES).filter(
    (l) => ENGINE_STRINGS[l] && config.strings && config.strings[l]
  );

  // 현재 화면을 다시 그리는 함수(언어 전환 시 호출). 시행 중에는 null.
  let rerender = null;
  // 시행 진행 상태(언어 전환 시 진행표시·자극을 새 언어로 갱신하기 위함)
  let activePhase = null, activeN = 0, activeTotal = 0, activeTrial = null, showingStimulus = false;
  // 적응형 과제는 총 문항 수가 없어 진행표시를 과제가 정한다(예: "길이 3"). 언어 전환에도
  // 살아남도록 결과 문자열이 아니라 t 를 다시 읽는 함수를 저장한다. 정적 과제는 null.
  let activeTextFn = null;

  function buildLangBar() {
    langbar.innerHTML = langs
      .map((l) => `<button type="button" data-lang="${l}" class="langbtn${l === lang ? ' on' : ''}">${LANG_NAMES[l]}</button>`)
      .join('');
    langbar.querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', () => setLang(b.dataset.lang))
    );
  }

  // 새로고침 없이 언어 즉시 전환. 선택 언어는 저장해 다음 방문 때 복원.
  function setLang(l) {
    if (l === lang || !langs.includes(l)) return;
    lang = l;
    es = ENGINE_STRINGS[l];
    ts = (config.strings && config.strings[l]) || {};
    document.documentElement.lang = l;
    try { localStorage.setItem(LANG_STORAGE_KEY, l); } catch {}
    footer.textContent = t('disclaimer');
    buildLangBar();
    // 응답 버튼 라벨 갱신
    choices.forEach((ch, i) => config.renderChoice(ch, padButtons[i], scale, t));
    // 시행 중이면 진행표시도 새 언어로. 적응형(activeTextFn)은 그 함수를, 정적은 n/total 을.
    if (activeTextFn) progress.textContent = activeTextFn();
    else if (activePhase) progress.textContent = `${activePhase === 'practice' ? t('practiceLabel') : t('mainLabel')} ${activeN}/${activeTotal}`;
    if (showingStimulus && activeTrial) config.renderStimulus(activeTrial, stimulus, scale, t);
    // 패널 화면(인트로/결과 등) 다시 그리기
    if (rerender) rerender();
  }

  // 응답 버튼은 한 번만 만든다 (위치 학습이 시행 내내 일정하도록).
  const padButtons = [];
  choices.forEach((ch) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'choice';
    b.dataset.choice = ch.id;
    config.renderChoice(ch, b, scale, t);
    pad.appendChild(b);
    padButtons.push(b);
  });

  let records = [];

  // ── 화면 전환 ──
  function setPanel(html) {
    panel.innerHTML = html;
    panel.hidden = false;
    stimulus.hidden = true;
    host.hidden = true;
    pad.hidden = true;
    progress.hidden = true;
    activePhase = null;
    activeTrial = null;
    activeTextFn = null;
    showingStimulus = false;
  }
  // custom=true 면 기본 자극·응답패드 대신 host(과제가 소유)를 보여준다.
  function setTrialView(custom) {
    panel.hidden = true;
    stimulus.hidden = !!custom;
    pad.hidden = !!custom;
    host.hidden = !custom;
    progress.hidden = false;
    rerender = null; // 시행 중에는 패널 재렌더 없음
  }
  const showPad = (live) => pad.classList.toggle('live', live);
  function setProgress(phase, n, total) {
    activePhase = phase;
    activeN = n;
    activeTotal = total;
    activeTextFn = null;
    const label = phase === 'practice' ? t('practiceLabel') : t('mainLabel');
    progress.textContent = `${label} ${n}/${total}`;
  }
  // 적응형 과제용: 총 문항 수가 없을 때 과제가 진행표시를 직접 정한다.
  // fn 은 t 를 다시 읽으므로 언어 전환에도 올바르게 갱신된다.
  function setProgressText(phase, fn) {
    activePhase = phase;
    activeTextFn = fn;
    progress.textContent = fn();
  }

  // ── 응답 대기: pointerdown / 숫자키. limitMs 초과 시 timeout. ──
  function awaitResponse(limitMs) {
    return new Promise((resolve) => {
      let done = false;
      let timer = null;
      const finish = (payload) => {
        if (done) return;
        done = true;
        padButtons.forEach((b) => b.removeEventListener('pointerdown', onDown));
        window.removeEventListener('keydown', onKey);
        if (timer) clearTimeout(timer);
        resolve(payload);
      };
      const onDown = (e) => {
        const t1 = performance.now();
        // e.pointerType: 'mouse' | 'touch' | 'pen' (빈 문자열이면 마우스로 간주)
        finish({ choiceId: e.currentTarget.dataset.choice, t1, timedOut: false, inputType: e.pointerType || 'mouse' });
      };
      const onKey = (e) => {
        const i = parseInt(e.key, 10) - 1;
        if (i >= 0 && i < padButtons.length) {
          const t1 = performance.now();
          finish({ choiceId: padButtons[i].dataset.choice, t1, timedOut: false, inputType: 'keyboard' });
        }
      };
      padButtons.forEach((b) => b.addEventListener('pointerdown', onDown));
      window.addEventListener('keydown', onKey);
      if (isFinite(limitMs)) timer = setTimeout(() => finish({ choiceId: null, t1: null, timedOut: true, inputType: null }), limitMs);
    });
  }

  // ── 기본 시행 구동기: 자극 1개 → 응답 1개 (스트룹·Go/No-go 등 기존 과제) ──
  // 반환 { record, outcome }: record 는 본시행에서만(연습=null), outcome 은 적응형 소스로 되돌아간다.
  async function defaultPlayTrial(trial, phase) {
    activeTrial = trial;
    // 1) 응시점 (매 시행 무작위 길이)
    showingStimulus = false;
    stimulus.className = 'stimulus fixation';
    stimulus.textContent = '+';
    showPad(false);
    await delay(pickMs(timing.fixation));

    // 2) 자극 표시
    stimulus.className = 'stimulus';
    config.renderStimulus(trial, stimulus, scale, t);
    showingStimulus = true;
    showPad(true);
    // 응답 리스너를 t0 찍기 전에 붙인다 → 첫 프레임 안의 반응도 유실되지 않음.
    const respPromise = awaitResponse(timeLimitMs);
    // 자극이 실제로 페인트된 다음 프레임에서 t0 기록 (rAF 이중)
    const t0 = await stampAfterPaint();
    const resp = await respPromise;
    showPad(false);
    showingStimulus = false; // 응답 후에는 자극 단어를 언어전환 대상에서 제외

    let rt = null;
    if (!resp.timedOut) rt = resp.t1 - t0; // 페인트 전 반응이면 음수가 될 수 있으나, 분석 단계에서 무효 처리됨
    // 정답 판정은 config 가 재정의할 수 있다(기본 = 눌러서 correct 와 일치).
    // Go/No-go 처럼 '안 누름(timedOut)이 정답'인 과제는 이 훅으로 표현한다.
    const decideCorrect = config.isCorrect || ((tr, rp) => !rp.timedOut && rp.choiceId === tr.correct);
    const isCorrect = decideCorrect(trial, { choiceId: resp.choiceId, timedOut: resp.timedOut, rt });

    // 4) 연습에서만 피드백 (규칙 학습용). 본시행은 피드백 없음.
    // isCorrect 를 timedOut 보다 먼저 본다 → No-go 의 '바르게 참음'(timedOut=정답)도 ✓ 로 표시.
    // 스트룹 등은 timedOut 이 정답인 경우가 없어 동작이 바뀌지 않는다.
    if (phase === 'practice') {
      stimulus.className = 'stimulus ' + (isCorrect ? 'ok' : resp.timedOut ? 'to' : 'no');
      stimulus.textContent = isCorrect ? '✓' : resp.timedOut ? t('timeout') : '✗';
      await delay(timing.feedbackMs);
    }

    const record = phase === 'main' ? {
      condition: trial.condition,
      correct: trial.correct,
      choiceId: resp.choiceId,
      rt,
      timedOut: resp.timedOut,
      isCorrect,
      inputType: resp.inputType || null, // 이 응답에 쓰인 입력 방식
    } : null;

    // 5) 시행 간 공백 (매 시행 무작위 길이)
    stimulus.textContent = '';
    stimulus.className = 'stimulus';
    await delay(pickMs(timing.isi));
    return { record, outcome: { success: isCorrect } };
  }

  // 커스텀 구동기(config.playTrial)에 넘기는 원시 도구 모음. 엔진은 앱 껍데기·언어·저장·결과를
  // 계속 소유하고, 과제는 한 시행 내부(순차 다중 자극 제시·순서 다중 응답 등)만 host 안에서 그린다.
  //   config.playTrial(trial, ctx, phase) → { record, outcome }
  const trialCtx = {
    host, scale, timing, timeLimitMs, t,
    delay, pickMs, stampAfterPaint,
    setProgress: (fn) => setProgressText(activePhase || 'main', fn),
  };

  // 시행 소스 통일: 정적 배열(buildPool)이든 적응형 제너레이터(mainTrials/practiceTrials)든
  // 하나의 async 이터레이터로 다룬다. total=null 이면 적응형(총 문항 수 미정).
  function makeSource(phase) {
    const poolGen = (pool) => (async function* () { for (const tr of pool) yield tr; })();
    if (phase === 'practice') {
      if (config.practiceTrials) return { gen: config.practiceTrials(), total: null };
      const pool = shuffle(config.buildPracticePool()).slice(0, config.practiceCount || 5);
      return { gen: poolGen(pool), total: pool.length };
    }
    if (config.mainTrials) return { gen: config.mainTrials(), total: null };
    const pool = orderByConstraint(config.buildMainPool());
    return { gen: poolGen(pool), total: pool.length };
  }

  // 한 페이즈: 소스에서 시행을 하나씩 받아 구동기로 실행하고, 결과를 소스로 되돌린다(적응형).
  // 정적 과제는 기존과 동일하게 "본시행 n/total" 진행표시로 순회한다.
  async function runPhase(phase) {
    if (phase === 'main') records = [];
    const custom = !!config.playTrial;
    setTrialView(custom);
    activePhase = phase;
    const play = config.playTrial
      ? (tr) => config.playTrial(tr, trialCtx, phase)
      : (tr) => defaultPlayTrial(tr, phase);
    const { gen, total } = makeSource(phase);
    let i = 0;
    let step = await gen.next();
    while (!step.done) {
      i++;
      if (total != null) setProgress(phase, i, total); // 정적: 기존과 동일
      const { record, outcome } = await play(step.value);
      if (phase === 'main' && record) records.push(record);
      step = await gen.next(outcome);
    }
  }

  // ── 화면들 ──
  function showIntro() {
    rerender = showIntro;
    setPanel(`<div class="panel-card">
      <h1>${t('title')}</h1>
      <p class="howto">${t('howto')}</p>
      <button id="cog-action" class="action">${t('start')}</button>
    </div>`);
    panel.querySelector('#cog-action').addEventListener('click', beginPractice, { once: true });
  }

  async function beginPractice() {
    await runPhase('practice');
    showMainIntro();
  }

  function showMainIntro() {
    rerender = showMainIntro;
    setPanel(`<div class="panel-card">
      <h2>${t('mainIntro')}</h2>
      <button id="cog-action" class="action">${t('mainStart')}</button>
    </div>`);
    panel.querySelector('#cog-action').addEventListener('click', beginMain, { once: true });
  }

  async function beginMain() {
    await runPhase('main');
    showResults();
  }

  // 결과: 저장은 한 번만. 언어 전환 시에는 재계산(라벨만)·재그리기만 한다.
  // 이번 세션의 조건(lang·input)은 저장 시점에 고정한다 — 결과 화면에서 언어를
  // 바꿔도 그래프가 비교하는 '기준 조건'은 실제로 수행한 그때의 것을 유지한다.
  function showResults() {
    markRtValidity(records); // RT 평균 대상 시행만 표시 (시간초과·오답·이상치·첫시행 제외)
    const finished = records.slice();
    const res = config.analyze(finished, t);
    const values = {};
    (res.series || []).forEach((s) => { values[s.key] = s.value; });
    // 정확도(그래프 저정확도 표시용). 기본 = 정답 시행 비율. 스팬형(코시 등)처럼 정확도 개념이
    // 없는 과제는 config.sessionAcc 로 null 을 반환해 저정확도 경고/속빈점이 오발동하지 않게 한다.
    const acc = config.sessionAcc
      ? config.sessionAcc(finished)
      : (finished.length ? finished.filter((r) => r.isCorrect).length / finished.length : null);
    const sess = {
      date: new Date().toISOString(),
      values,
      lang,                              // 어떤 언어로 했는지
      input: dominantInput(finished),    // 대표 입력 방식(마우스/터치/펜/키보드)
      trialCount: finished.length,       // 이 세션의 본시행 문항 수
      acc,
    };
    let sessions = loadSessions(config.id);
    sessions.push(sess);
    if (sessions.length > MAX_STORED) sessions = sessions.slice(-MAX_STORED);
    saveSessions(config.id, sessions);

    const current = conditionOf(sess, lang); // 비교 기준 조건(고정)
    rerender = () => renderResults(config.analyze(finished, t), loadSessions(config.id), current);
    renderResults(res, loadSessions(config.id), current);
  }

  function renderResults(res, sessions, current) {
    // 요약 행: 조건별 유효 문항 수(count)와, 문항이 적으면 흔들림 경고를 함께.
    const rows = res.summary
      .map((s) => {
        const val = `${s.value}${s.value === '—' ? '' : ' ' + s.unit}`;
        const cnt = s.count != null ? `<span class="cnt">(${t('trialCount', { n: s.count })})</span>` : '';
        const few = s.count != null && s.count < FEW_TRIALS ? `<div class="few">${t('fewTrials')}</div>` : '';
        return `<div class="row"><span>${s.label}</span><b>${val}${cnt}</b></div>${few}`;
      })
      .join('');

    // 그래프는 '현재 조건과 같은' 세션만. 비교 가능 여부는 conditionDiffs 하나로 판단.
    const isMine = (s) => conditionDiffs(conditionOf(s, current.lang), current).length === 0;
    const mine = sessions.filter(isMine);
    const hidden = sessions.filter((s) => !isMine(s));
    // 숨긴 세션들이 '어느 차원에서' 다른지 모아 이유를 해당하는 것만 보여준다.
    const diffDims = new Set();
    hidden.forEach((s) => conditionDiffs(conditionOf(s, current.lang), current).forEach((d) => diffDims.add(d)));

    const habitNote = mine.length >= 2 ? `<p class="graph-note">${t('graphNote')}</p>` : '';
    let hiddenNote = '';
    if (hidden.length > 0) {
      // 차원별 사유 문구는 과제가 config.strings 로 재정의할 수 있다(엔진이 하드코딩하지 않음).
      // 예: 코시는 언어가 결과에 영향이 거의 없어 diffLangReason 을 자기 문구로 바꾼다.
      // 빈 문자열('')로 두면 그 차원의 사유는 아예 표시하지 않는다.
      let reasons = '';
      diffDims.forEach((d) => {
        const r = t('diff' + d[0].toUpperCase() + d.slice(1) + 'Reason'); // diffLangReason / diffInputReason
        if (r) reasons += `<br>${r}`;
      });
      hiddenNote = `<p class="graph-note">${t('otherCondBase', { n: hidden.length })}${reasons}</p>`;
    }

    // 하단 현재 조건: 언어 · 입력 방식
    const condParts = [LANG_NAMES[current.lang] || current.lang];
    if (current.input) condParts.push(t('input_' + current.input));
    const condLine = `<p class="condition-line">${condParts.join(' · ')}</p>`;

    // 그래프를 series 의 group 별로 나눠 그린다(위: 일치·불일치 RT / 아래: 스트룹 효과).
    // 값 크기가 크게 다른 시리즈를 한 축에 두면 작은 쪽이 안 보이므로 축을 분리한다.
    const series = res.series || [];
    const groups = [];
    series.forEach((s) => {
      const key = s.group || 'default';
      let g = groups.find((x) => x.group === key);
      if (!g) { g = { group: key, items: [] }; groups.push(g); }
      g.items.push(s);
    });
    const graphDivs = groups.map((_, i) => `<div class="cog-graph" data-gi="${i}"></div>`).join('');

    // 상단 경고(예: 정답률 낮음) — analyze 가 topNotes 로 넘긴 것만 표시
    const topNotes = (res.topNotes || []).map((n) => `<div class="top-note">${n}</div>`).join('');

    setPanel(`<div class="panel-card">
      <h2>${t('finished')}</h2>
      ${topNotes}
      <div class="summary">${rows}</div>
      <h3 class="graph-title">${t('lastSessions')}</h3>
      ${graphDivs}
      ${habitNote}
      ${hiddenNote}
      ${condLine}
      <button id="cog-action" class="action">${t('again')}</button>
    </div>`);
    groups.forEach((g, i) => drawGraph(panel.querySelector(`.cog-graph[data-gi="${i}"]`), mine, g.items, t));
    panel.querySelector('#cog-action').addEventListener('click', showIntro, { once: true });
  }

  buildLangBar();
  showIntro();
}
