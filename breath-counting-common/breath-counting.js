// breath-counting-common/breath-counting.js — 호흡세기(Levinson 2014, breath counting). 실천 계열 1번째.
// 청소년·성인 앱이 startBreathCounting(opts) 로 공유한다.
//
// 실천 계열은 '측정'이 아니라 '훈련/개입 체험'이다. 엔진(core/engine.js)의 시행-채점 구조를 쓰지 않는다
// (runTask 안 씀). 그룹D 독립 데모 패턴 그대로: core/i18n.js 만 재사용하고 자체 셸을 그린다.
//   · 정답/오답 판정 없음 — 왼/오른 버튼이 실제 호흡과 맞는지 앱은 알 방법이 없다(자기보고).
//   · localStorage 에 아무것도 안 남긴다 — 스트릭·세션 간 비교·최근기록 없음(실천 계열 전체 원칙).
//   · '결과'가 아니라 '완료 확인' — 좋다/나쁘다/정상/비정상 문구 금지. '놓침·알아차림' 어휘만.
//
// ★ 시각 예외(문서화): 지각 계열의 '자극은 무채색, accent는 UI 전용' 원칙은 '판단 대상 자극'에
//   적용되던 것이고, 이 과제엔 판단 대상 자극이 없다(체험 도구이지 측정 도구가 아님). 그래서 싱잉볼
//   일러스트를 쓴다 — 원칙 위반이 아니라 적용 범위 밖. 싱잉볼은 장식이 아니라 '호흡 표시 기능'(누를
//   때마다 물결). 사람 형태 아님, 색은 accent 계열에서 자유, 외부 이미지 없이 SVG 로 직접 그린다.
//
// 과제(Levinson 2014): 자연스럽게 숨쉬며 속으로 셈. 1~8=왼쪽 버튼, 9=오른쪽 버튼(누르면 1로 리셋).
//   세다 놓쳤음을 스스로 알아차리면 '놓쳤어요'(self-caught) 버튼 → 1로 리셋, 그 시점만 기록.
//   세션 길이 3/5/10분 자기 선택. 시간 다 되면 자동 종료.

import { LANG_NAMES, LANG_STORAGE_KEY, detectLang } from '../core/i18n.js';

const QA = (() => { try { return new URLSearchParams(location.search).get('qa') === '1'; } catch { return false; } })();

const LENGTHS = [3, 5, 10];                       // 선택 가능한 세션 길이(분)
// 분→ms. QA 는 전환·자동종료만 빠르게 검증한다(자극·판정·UI 는 실제와 동일, 시간만 축약).
const lenMs = (m) => (QA ? 2200 : m * 60000);

// ── 앱별 옵션(youth/adults 셸이 넘긴다) + 세션 상태 ─────────────────
let appId = 'breath-counting';
let accent = '#4A6B4D';
let toneScale = 1;          // 버튼·싱잉볼 배율(청소년 1.15, 성인 1)
let tone = 'std';           // 'easy'(청소년 쉬운 말) | 'std'(성인 표준)
let lang = detectLang();

let root = null;
let stage = 'intro';        // 'intro' | 'length' | 'session' | 'done'
let sessionMs = 0;          // 이번 세션 길이(ms)
let cycles = [];           // '한 사이클 완료'(화면 톡) 시점들(세션 시작부터의 ms offset). 화면 표시=개수.
let selfCaught = [];        // '놓쳤어요' 누른 시점들. 점수 아님. (cycles 와 별개 계열)
let sessionStart = 0;       // performance.now() 기준 세션 시작 시각
let rafId = 0;              // 타이머 RAF 핸들
// 싱잉볼 소리(순수 부가 요소). 세션 시작 클릭 핸들러 안에서만 재생(자동재생 정책 회피). 저장 안 함.
let audioCtx = null;        // 최초 세션 시작 클릭 때 생성, 이후 재사용
let bowlRing = null;        // 지금 울리는 볼의 마스터 게인(음소거로 즉시 잦아들게 하려고 보관)
let muted = false;          // 세션마다 기본값 false(소리 켜짐). localStorage 안 씀.

// tone 인식 t(): key+'_easy' 가 있으면 청소년 문구, 없으면 표준(성인) 문구로 폴백.
const t = (k) => {
  const s = STRINGS[lang] || STRINGS.ko;
  const tk = tone === 'easy' ? s[k + '_easy'] : undefined;
  return tk ?? s[k] ?? STRINGS.ko[k] ?? k;
};

// ── 싱잉볼 SVG(선화·평면, 사람 형태 아님) + 물결 레이어 ────────────
// 물결(.bc-ripple)은 render 때가 아니라 '숨을 셀 때'만 rippleAt() 으로 하나씩 append 된다.
function bowlSVG() {
  // viewBox 240×200. 볼 입구(타원)=중심(120,78). 물결은 이 중심에서 퍼진다.
  return `<svg viewBox="0 0 240 200" class="bc-bowl" role="img" aria-label="${t('bowlAlt')}">
    <g class="bc-ripples"></g>
    <g fill="none" stroke="${accent}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
      <path d="M44,78 C44,148 82,182 120,182 C158,182 196,148 196,78" fill="${accent}22"/>
      <ellipse cx="120" cy="78" rx="76" ry="17" fill="#fafafa"/>
      <ellipse cx="120" cy="78" rx="60" ry="12" stroke-width="2" opacity=".5"/>
      <path d="M96,188 C104,194 136,194 144,188" stroke-width="3"/>
    </g>
  </svg>`;
}

// 물결 하나를 볼 입구 중심에서 퍼뜨린다. 각 물결은 자기 element 라 빠른 연타도 겹쳐 보인다.
function rippleAt() {
  const g = root && root.querySelector('.bc-ripples');
  if (!g) return;
  const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  c.setAttribute('cx', '120');
  c.setAttribute('cy', '78');
  c.setAttribute('r', '16');
  c.setAttribute('class', 'bc-ripple');
  c.addEventListener('animationend', () => c.remove());
  g.appendChild(c);
  // 안전장치: 혹시 animationend 가 안 오면 시간 뒤 제거(누적 방지).
  setTimeout(() => c.remove(), 1800);
}

// ── 싱잉볼 소리(Web Audio 합성, 외부 오디오 파일 없음) ──────────────────────
// 실제 싱잉볼은 '비조화(inharmonic) 배음'이 겹쳐 길게 울리다 서서히 잦아든다. 기본음 + 배음 2개를
// 살짝 어긋난 배수(≈2.76·5.40)로 겹치고, 각기 다른 길이의 긴 지수 감쇠(3~5초)를 준다. 세션 시작 순간만.
// AudioContext 는 이 함수 안에서(=.bc-len 클릭 핸들러 안에서) 처음 생성된다 — 자동재생 정책 회피.
async function playBowl() {
  if (muted) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { console.error('[bowl] no AudioContext ctor'); return; }
    if (!audioCtx) audioCtx = new AC();                        // 제스처 안에서 생성(자동재생 정책 충족)
    console.log('[bowl] state before resume:', audioCtx.state, 'currentTime:', audioCtx.currentTime);
    if (audioCtx.state === 'suspended') await audioCtx.resume(); // ★ resume 완료를 기다린 뒤 스케줄
    console.log('[bowl] state after resume:', audioCtx.state);
    setTimeout(() => console.log('[bowl] state +150ms:', audioCtx.state, 'currentTime:', audioCtx.currentTime), 150);
    if (muted) return;                                         // await 사이에 음소거됐을 수 있음
    const ctx = audioCtx, now = ctx.currentTime;               // resume 이후의 실제 시각으로 스케줄
    const master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);
    bowlRing = master;                               // silenceBowl 이 참조하는 그 노드
    // {주파수Hz, 최대게인, 감쇠초}. 배수 1 / 2.76 / 5.40 = 싱잉볼 특유의 비조화 배음.
    [{ f: 220, g: 0.5, d: 5.0 }, { f: 607, g: 0.26, d: 4.0 }, { f: 1188, g: 0.14, d: 3.0 }]
      .forEach((p) => {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = p.f;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(p.g, now + 0.02);   // 막대로 친 순간(빠른 어택)
        g.gain.exponentialRampToValueAtTime(0.0001, now + p.d); // 긴 지수 감쇠(서서히 사라짐)
        o.connect(g); g.connect(master);
        o.start(now);
        o.stop(now + p.d + 0.1);
      });
    console.log('[bowl] scheduled 3 oscillators at now=', now, 'ctx.state=', ctx.state);
  } catch (e) { console.error('[bowl] error:', e); } // 조용히 삼키지 않고 콘솔에 남김(F12 확인용)
}

// 음소거를 켜면, 지금 울리는 볼을 짧게 페이드아웃해 즉시 잦아들게 한다.
function silenceBowl() {
  if (!bowlRing || !audioCtx) return;
  try {
    const now = audioCtx.currentTime;
    bowlRing.gain.cancelScheduledValues(now);
    bowlRing.gain.setValueAtTime(bowlRing.gain.value, now);
    bowlRing.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
  } catch {}
}

function injectStyles() {
  if (document.getElementById('bc-style')) return;
  const el = document.createElement('style');
  el.id = 'bc-style';
  el.textContent = `
:root{--bc-accent:${accent};--bc-scale:${toneScale}}
*{box-sizing:border-box}
html,body{margin:0}
.bc-root{min-height:100dvh;display:flex;flex-direction:column;background:#fafafa;color:#212121;
  font-family:system-ui,-apple-system,'Segoe UI',Roboto,'Noto Sans KR',sans-serif;
  padding-bottom:calc(1rem + env(safe-area-inset-bottom))}
.bc-top{padding:.7rem 1rem;display:flex;justify-content:flex-end}
.bc-langbar{display:flex;gap:.3rem;flex-wrap:wrap}
.langbtn{border:1px solid #d0d0d0;background:#fff;color:#757575;border-radius:999px;
  padding:.28rem .7rem;font-size:.82rem;font-weight:600;cursor:pointer;touch-action:manipulation}
.langbtn.on{background:var(--bc-accent);color:#fff;border-color:var(--bc-accent)}
.bc-mute{margin-right:auto;border:1px solid #d0d0d0;background:#fff;border-radius:999px;
  width:2.1rem;height:2.1rem;font-size:1rem;line-height:1;cursor:pointer;padding:0;
  display:flex;align-items:center;justify-content:center;touch-action:manipulation}
.bc-mute.on{background:#eef2ee;border-color:var(--bc-accent)}
.bc-stage{flex:1;display:flex;align-items:flex-start;justify-content:center;padding:1rem}
.bc-card{width:100%;max-width:560px;text-align:center}
.bc-title{font-size:calc(1.5rem * var(--bc-scale));margin:.3rem 0 .6rem}
.bc-lead{color:#555;line-height:1.6;margin:.2rem 0 1rem}
.bc-instruction{line-height:1.75;text-align:left;background:#eef2ee;border:1px solid #dde6dd;
  border-radius:12px;padding:.9rem 1.05rem;margin:0 0 1.2rem;font-size:calc(1rem * var(--bc-scale))}
.bc-instruction b{color:var(--bc-accent)}
.bc-primary{border:none;border-radius:12px;background:var(--bc-accent);color:#fff;
  font-size:calc(1.1rem * var(--bc-scale));font-weight:700;padding:.85rem 1.5rem;
  min-height:calc(3.2rem * var(--bc-scale));cursor:pointer;touch-action:manipulation}
.bc-primary:active{transform:translateY(1px)}
/* 세션 길이 선택 */
.bc-lengths{display:flex;flex-direction:column;gap:.8rem;max-width:22rem;margin:1.2rem auto 0}
.bc-len{border:2px solid var(--bc-accent);background:#fff;color:var(--bc-accent);border-radius:14px;
  font-size:calc(1.15rem * var(--bc-scale));font-weight:700;padding:1rem;min-height:3.4rem;
  cursor:pointer;touch-action:manipulation}
.bc-len:active{background:var(--bc-accent);color:#fff}
/* 세션 화면 */
.bc-timer{font-variant-numeric:tabular-nums;font-size:calc(1.4rem * var(--bc-scale));font-weight:700;
  color:#555;margin:.2rem 0 .4rem;letter-spacing:.02em}
.bc-bowlwrap{position:relative;margin:.2rem auto .4rem;width:min(70vw,calc(300px * var(--bc-scale)))}
.bc-bowl{width:100%;height:auto;display:block;overflow:visible}
.bc-ripple{fill:none;stroke:var(--bc-accent);stroke-width:2.5;opacity:.45;
  animation:bc-ripple 1.5s ease-out forwards}
@keyframes bc-ripple{from{r:16px;opacity:.5}to{r:96px;opacity:0}}
@media (prefers-reduced-motion:reduce){.bc-ripple{animation-duration:.5s}}
.bc-count{font-variant-numeric:tabular-nums;font-size:calc(3.2rem * var(--bc-scale));font-weight:800;
  color:var(--bc-accent);line-height:1;min-height:calc(3.4rem * var(--bc-scale));margin:.2rem 0 1rem}
.bc-counthint{color:#888;font-size:.95rem;margin:.2rem 0 0}
/* 큰 터치존: 정확한 버튼을 찾을 필요 없이 카드 대부분을 아우르는 하나의 탭 영역(눈 감고도 가능). */
.bc-tapzone{display:block;width:100%;border:1.5px dashed #cfd8cf;background:#f4f7f4;border-radius:20px;
  padding:1.1rem 1rem 1.6rem;margin:0 0 1rem;cursor:pointer;touch-action:manipulation;
  -webkit-tap-highlight-color:transparent;min-height:58dvh;text-align:center;color:inherit;font:inherit}
.bc-tapzone:active{background:#eef2ee}
.bc-sparklegend{display:flex;gap:1.2rem;justify-content:center;font-size:.8rem;color:#757575;margin:.35rem 0 0}
.bc-sparklegend i{display:inline-block;width:.85rem;height:.5rem;vertical-align:middle;margin-right:.35rem;border-radius:2px}
.bc-sparklegend i.up{background:#9aa79a}
.bc-sparklegend i.down{background:var(--bc-accent)}
.bc-caught{border:1.5px solid #b7c2b7;background:#fff;color:#556;border-radius:12px;
  font-size:calc(.98rem * var(--bc-scale));font-weight:600;padding:.75rem 1rem;min-height:3rem;
  width:100%;max-width:26rem;cursor:pointer;touch-action:manipulation}
.bc-caught:active{background:#eef2ee}
.bc-caught.pulse{border-color:var(--bc-accent);color:var(--bc-accent)}
/* 완료 확인 */
.bc-facts{margin:1rem auto;max-width:24rem;text-align:left}
.bc-facts .row{display:flex;justify-content:space-between;padding:.65rem .2rem;
  border-bottom:1px solid #eee;font-size:1.05rem}
.bc-facts .row b{font-variant-numeric:tabular-nums}
.bc-sparktitle{font-size:.95rem;color:#757575;margin:1.1rem 0 .4rem;font-weight:600}
.bc-spark{width:100%;height:auto}
.bc-spark .axis{fill:#9e9e9e;font-size:10px}
.bc-sparknote{font-size:.82rem;color:#9e9e9e;line-height:1.5;margin:.5rem 0 0;text-align:left}
.bc-footer{padding:.9rem 1rem;text-align:center;color:#9e9e9e;font-size:.82rem;border-top:1px solid #eee}`;
  document.head.appendChild(el);
}

function langbarHTML() {
  return Object.keys(LANG_NAMES).filter((l) => STRINGS[l])
    .map((l) => `<button class="langbtn${l === lang ? ' on' : ''}" data-lang="${l}">${LANG_NAMES[l]}</button>`).join('');
}

function introHTML() {
  return `
    <h1 class="bc-title">${t('title')}</h1>
    <p class="bc-lead">${t('lead')}</p>
    <div class="bc-instruction">${t('instruction')}</div>
    <button class="bc-primary" data-act="toLength">${t('choose')}</button>`;
}

function lengthHTML() {
  const btns = LENGTHS.map((m) => `<button class="bc-len" data-min="${m}">${t('minutes').replace('{n}', m)}</button>`).join('');
  return `
    <h1 class="bc-title">${t('lengthTitle')}</h1>
    <p class="bc-lead">${t('lengthLead')}</p>
    <div class="bc-lengths">${btns}</div>`;
}

function sessionHTML() {
  // 큰 터치존 = 한 사이클 완료(화면 아무 곳이나 톡). 타이머·싱잉볼·사이클수·안내를 감싼 단일 button.
  // '놓쳤어요'는 밖에 별도 sibling 버튼(혼동·오집계 방지).
  return `
    <button class="bc-tapzone" data-act="cycle" aria-label="${t('tapAria')}">
      <div class="bc-timer" aria-live="off">${fmtTime(sessionMs)}</div>
      <div class="bc-bowlwrap">${bowlSVG()}</div>
      <div class="bc-count">${cycles.length}</div>
      <p class="bc-counthint">${t('tapHint')}</p>
    </button>
    <button class="bc-caught" data-act="caught">${t('caught')}</button>`;
}

// 세션 내 시점 스파크라인(2-레인). 중앙 기준선 위=사이클 완료(muted), 아래='놓쳤어요'(accent).
// 표식만(세로선). 점수·비교 아님 — 많고 적음에 좋고 나쁨 없음.
function sparkSVG() {
  const W = 340, H = 74, padX = 10, mid = 40; // 중앙 기준선 y=40
  const X = (ms) => padX + Math.max(0, Math.min(1, ms / sessionMs)) * (W - 2 * padX);
  const axis = `<line x1="${padX}" y1="${mid}" x2="${W - padX}" y2="${mid}" stroke="#d8ddd8" stroke-width="1.5"/>`;
  const up = cycles.map((ms) => `<line x1="${X(ms)}" y1="${mid - 16}" x2="${X(ms)}" y2="${mid}" stroke="#9aa79a" stroke-width="2" stroke-linecap="round"/>`).join('');
  const down = selfCaught.map((ms) => `<line x1="${X(ms)}" y1="${mid}" x2="${X(ms)}" y2="${mid + 16}" stroke="${accent}" stroke-width="2.5" stroke-linecap="round"/>`).join('');
  const t0 = `<text x="${padX}" y="${H - 2}" text-anchor="start" class="axis">0:00</text>`;
  const t1 = `<text x="${W - padX}" y="${H - 2}" text-anchor="end" class="axis">${fmtTime(sessionMs)}</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" class="bc-spark" role="img" aria-label="${t('sparkTitle')}">${axis}${up}${down}${t0}${t1}</svg>`;
}

function doneHTML() {
  const totalMin = Math.round(sessionMs / 60000);
  const spark = (cycles.length || selfCaught.length)
    ? `<h3 class="bc-sparktitle">${t('sparkTitle')}</h3>${sparkSVG()}` +
      `<div class="bc-sparklegend"><span><i class="up"></i>${t('legendCycle')}</span>` +
      `<span><i class="down"></i>${t('legendCaught')}</span></div>` +
      `<p class="bc-sparknote">${t('sparkNote')}</p>`
    : '';
  return `
    <h1 class="bc-title">${t('doneTitle')}</h1>
    <p class="bc-lead">${t('doneLead')}</p>
    <div class="bc-facts">
      <div class="row"><span>${t('factTime')}</span><b>${QA ? fmtTime(sessionMs) : t('minutes').replace('{n}', totalMin)}</b></div>
      <div class="row"><span>${t('factCycles')}</span><b>${cycles.length}</b></div>
      <div class="row"><span>${t('factCaught')}</span><b>${selfCaught.length}</b></div>
    </div>
    ${spark}
    <button class="bc-primary" data-act="restart">${t('again')}</button>`;
}

// mm:ss
function fmtTime(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ── 세션 타이머: 남은 시간 텍스트만 갱신(볼·물결은 재렌더하지 않아 관찰이 안 끊긴다). 0 도달 시 자동 종료. ──
function startSessionTimer() {
  cancelTimer();
  // sessionStart 는 세션 진입 시 딱 한 번 찍는다(여기서 다시 찍지 않는다). 세션 화면에도 언어바가
  // 떠 있어 도중에 언어를 바꾸면 render()가 이 함수를 다시 부르는데, 그때 sessionStart 를 새로 찍으면
  // 타이머가 처음부터 다시 돌아 완료 화면의 '함께한 시간'이 실제와 어긋난다. 측정 과제들이 시행 도중
  // 언어 전환에도 타이밍을 잃지 않는 것과 같은 처리 — 언어바는 그대로 두고 시작 시각만 보존한다.
  const timerEl = root.querySelector('.bc-timer');
  const tick = (now) => {
    const remain = sessionMs - (now - sessionStart);
    if (remain <= 0) {
      if (timerEl) timerEl.textContent = fmtTime(0);
      rafId = 0;
      finishSession();
      return;
    }
    if (timerEl) timerEl.textContent = fmtTime(remain);
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}
function cancelTimer() { if (rafId) { cancelAnimationFrame(rafId); rafId = 0; } }

function finishSession() {
  cancelTimer();
  stage = 'done';
  render();
}

// ── 렌더 ──
function render() {
  cancelTimer();
  let body;
  if (stage === 'intro') body = introHTML();
  else if (stage === 'length') body = lengthHTML();
  else if (stage === 'session') body = sessionHTML();
  else body = doneHTML();

  const inSession = stage === 'session';
  // 세션(체험) 화면에서는 언어바를 숨긴다 — 집중을 방해하지 않도록, 또 세션 도중 언어 전환에 따른
  // 재렌더 경로 자체를 없앤다(측정 과제 엔진은 언어바를 늘 띄우지만, 이 과제는 체험 화면이라 다르게 둔다).
  // 대신 세션 화면에만 음소거 토글을 헤더에 둔다.
  const muteBtn = inSession
    ? `<button class="bc-mute${muted ? ' on' : ''}" data-act="mute" aria-pressed="${muted}" ` +
      `aria-label="${t(muted ? 'soundOff' : 'soundOn')}" title="${t(muted ? 'soundOff' : 'soundOn')}">${muted ? '🔇' : '🔔'}</button>`
    : '';
  const langbar = inSession ? '' : `<div class="bc-langbar">${langbarHTML()}</div>`;
  root.innerHTML = `
    <header class="bc-top">${muteBtn}${langbar}</header>
    <main class="bc-stage"><div class="bc-card">${body}</div></main>
    <footer class="bc-footer">${t('disclaimer')}</footer>`;

  root.querySelectorAll('.langbtn').forEach((b) => b.addEventListener('click', () => {
    lang = b.dataset.lang; try { localStorage.setItem(LANG_STORAGE_KEY, lang); } catch {} render();
  }));

  if (stage === 'intro') {
    root.querySelector('[data-act="toLength"]').addEventListener('click', () => { stage = 'length'; render(); });
  } else if (stage === 'length') {
    root.querySelectorAll('.bc-len').forEach((b) => b.addEventListener('click', () => {
      sessionMs = lenMs(Number(b.dataset.min));
      cycles = []; selfCaught = [];
      muted = false;                    // 매 세션 기본값: 소리 켜짐(저장 안 함).
      sessionStart = performance.now(); // 세션의 진짜 시작 시각(언어 전환 재렌더에도 이 값은 보존).
      playBowl();                       // 세션 시작 그 순간, 이 클릭 핸들러 안에서 딱 1번(자동재생 정책 회피).
      stage = 'session'; render();
    }));
  } else if (stage === 'session') {
    bindSession();
    startSessionTimer();
    const muteBtn = root.querySelector('[data-act="mute"]');
    if (muteBtn) muteBtn.addEventListener('click', () => {
      // 제자리에서 아이콘·상태만 갱신(재렌더 없음 → 볼·타이머 안 흔들림). 켜져 울리는 중이면 바로 잦아들게.
      muted = !muted;
      if (muted) silenceBowl();
      muteBtn.classList.toggle('on', muted);
      muteBtn.textContent = muted ? '🔇' : '🔔';
      const lbl = t(muted ? 'soundOff' : 'soundOn');
      muteBtn.setAttribute('aria-pressed', String(muted));
      muteBtn.setAttribute('aria-label', lbl);
      muteBtn.setAttribute('title', lbl);
    });
  } else {
    root.querySelector('[data-act="restart"]').addEventListener('click', () => {
      // 새 세션. 아무것도 저장하지 않으므로 초기 화면부터 다시.
      stage = 'intro'; cycles = []; selfCaught = []; render();
    });
  }
}

// 세션 화면 상호작용. 사이클 수만 직접 갱신(볼·물결 유지). 판정 없음.
function bindSession() {
  const countEl = root.querySelector('.bc-count');
  const zone = root.querySelector('[data-act="cycle"]');
  if (zone) zone.addEventListener('click', () => {
    cycles.push(performance.now() - sessionStart); // 한 사이클(1~9) 완료 시점 기록
    if (countEl) countEl.textContent = cycles.length;
    rippleAt();                                    // 물결은 항상 싱잉볼 중심(120,78)에서 — 터치 위치 무관
  });
  const caughtBtn = root.querySelector('[data-act="caught"]');
  caughtBtn.addEventListener('click', (e) => {
    e.stopPropagation();                           // 큰 터치존으로 전파 방지(사이클 오집계 차단)
    selfCaught.push(performance.now() - sessionStart); // 시점만 기록(진행 중이던 사이클은 사용자가 마음속 리셋; 완료 사이클 수는 안 깎음)
    caughtBtn.classList.add('pulse');
    setTimeout(() => caughtBtn.classList.remove('pulse'), 220);
  });
}

// ── 진입점 ──
export function startBreathCounting(opts = {}) {
  appId = opts.id || appId;
  accent = opts.accent || accent;
  toneScale = opts.scale || toneScale;
  tone = opts.tone || tone;
  lang = detectLang();
  stage = 'intro'; cycles = []; selfCaught = []; muted = false;
  injectStyles();
  root = document.createElement('div');
  root.className = 'bc-root';
  document.getElementById('app').appendChild(root);
  render();
}

// ── 문자열(4언어). '_easy' = 청소년 쉬운 말. 없으면 표준(성인) 문구로 폴백. ──
// 판정 어휘 금지: 좋다/나쁘다/정상/집중력/충동 등 금지. '놓침·알아차림·숨' 만 사용.
const STRINGS = {
  ko: {
    title: '호흡 세기',
    lead: '편안히 앉아 자연스럽게 숨을 쉬면서, 그 숨을 속으로 세어 보는 연습입니다.',
    instruction: '숨을 쉬며 <b>속으로 1부터 9까지</b> 세어 보세요. 버튼은 없어요 — 9까지 세어 <b>한 순환을 마치면 화면을 톡</b> 치면 됩니다(눈을 감고 아무 곳이나). 세다가 <b>놓쳤다는 걸 알아차리면</b> 아래 ‘놓쳤어요’를 눌러 주세요. 맞고 틀림은 없습니다.',
    instruction_easy: '숨을 쉬며 <b>마음속으로 1부터 9까지</b> 세어 봐요. 9까지 세어 <b>한 바퀴를 마치면 화면을 톡</b> 쳐요(눈 감고 아무 데나 괜찮아요). 세다가 <b>딴생각이 든 걸 알아차리면</b> 아래 버튼을 눌러요. 잘하고 못하고는 없어요.',
    choose: '시작하기',
    lengthTitle: '얼마나 할까요?',
    lengthLead: '자기 페이스로 고르세요.',
    minutes: '{n}분',
    tapAria: '한 순환(숨 1~9)을 마쳤으면 여기를 눌러주세요',
    tapHint: '9까지 세었으면 화면을 톡 — 아무 곳이나',
    caught: '놓쳤어요 (알아차림)',
    soundOn: '소리 켜짐 (누르면 음소거)', soundOff: '음소거됨 (누르면 소리)',
    bowlAlt: '싱잉볼',
    doneTitle: '마쳤습니다',
    doneLead: '수고하셨어요. 아래는 사실만 담은 기록입니다.',
    factTime: '함께한 시간',
    factCycles: '완료한 사이클 수',
    factCaught: '‘놓쳤어요’를 누른 횟수',
    sparkTitle: '이번 세션의 흐름',
    sparkNote: '위 눈금은 한 사이클을 마친 시점, 아래 눈금은 ‘놓쳤어요’를 누른 시점입니다. 많고 적음에 좋고 나쁨은 없습니다 — 그저 이번 시간의 흐름일 뿐입니다.',
    legendCycle: '사이클 완료', legendCaught: '알아차림(놓쳤어요)',
    again: '다시 하기',
    disclaimer: '이것은 검사가 아니라 연습입니다. 아무 기록도 기기에 저장되지 않습니다.',
  },
  en: {
    title: 'Breath Counting',
    lead: 'Sit comfortably, breathe naturally, and quietly count each breath.',
    instruction: 'Breathe and <b>count from 1 to 9 in your mind</b>. No buttons — when you reach 9 and <b>finish one cycle, tap the screen</b> (eyes closed, anywhere). Whenever you <b>notice you have lost count</b>, tap “lost count” below. There is no right or wrong.',
    instruction_easy: 'Breathe and <b>count 1 to 9 in your head</b>. When you reach 9 and <b>finish one round, tap the screen</b> (eyes closed, anywhere is fine). If you <b>notice your mind wandered</b>, tap the button below. There is no good or bad here.',
    choose: 'Get started',
    lengthTitle: 'How long?',
    lengthLead: 'Pick at your own pace.',
    minutes: '{n} min',
    tapAria: 'Tap here when you finish one cycle (breaths 1–9)',
    tapHint: 'Counted to 9? Tap the screen — anywhere',
    caught: 'I lost count (noticed)',
    soundOn: 'Sound on (tap to mute)', soundOff: 'Muted (tap for sound)',
    bowlAlt: 'singing bowl',
    doneTitle: 'Done',
    doneLead: 'Nicely done. Below is a record of the facts only.',
    factTime: 'Time together',
    factCycles: 'Cycles completed',
    factCaught: 'Times you tapped “lost count”',
    sparkTitle: 'The shape of this session',
    sparkNote: 'Top ticks mark when you finished a cycle; bottom ticks mark when you tapped “lost count.” More or fewer is neither good nor bad — just how this session went.',
    legendCycle: 'Cycle done', legendCaught: 'Noticed (lost count)',
    again: 'Do it again',
    disclaimer: 'This is a practice, not a test. Nothing is saved on your device.',
  },
  zh: {
    title: '数呼吸',
    lead: '舒服地坐着，自然地呼吸，在心里默默数每一次呼吸。',
    instruction: '一边呼吸，一边<b>在心里从1数到9</b>。没有按钮——数到9<b>完成一个循环后，点一下屏幕</b>（闭着眼、任意位置都行）。当你<b>察觉自己数丢了</b>，就点下面的“数丢了”。没有对错。',
    instruction_easy: '一边呼吸，一边<b>在心里从1数到9</b>。数到9<b>完成一圈后，点一下屏幕</b>（闭眼、随便哪里都行）。要是<b>发现自己走神了</b>，就点下面的按钮。这里没有做得好不好。',
    choose: '开始',
    lengthTitle: '做多久？',
    lengthLead: '按自己的节奏选。',
    minutes: '{n}分钟',
    tapAria: '完成一个循环（1~9次呼吸）后点这里',
    tapHint: '数到9了？点一下屏幕——任意位置',
    caught: '数丢了（察觉到）',
    soundOn: '声音开（点按静音）', soundOff: '已静音（点按开声）',
    bowlAlt: '颂钵',
    doneTitle: '完成了',
    doneLead: '辛苦了。下面只是如实的记录。',
    factTime: '一起度过的时间',
    factCycles: '完成的循环数',
    factCaught: '按“数丢了”的次数',
    sparkTitle: '这次练习的轨迹',
    sparkNote: '上方刻度是你完成一个循环的时刻，下方刻度是你按“数丢了”的时刻。多或少都无所谓好坏——只是这次的经过。',
    legendCycle: '循环完成', legendCaught: '察觉（数丢了）',
    again: '再来一次',
    disclaimer: '这是练习，不是检查。什么都不会保存在你的设备上。',
  },
  es: {
    title: 'Contar la Respiración',
    lead: 'Siéntate cómodo, respira con naturalidad y cuenta en silencio cada respiración.',
    instruction: 'Respira y <b>cuenta del 1 al 9 en tu mente</b>. Sin botones: al llegar a 9 y <b>completar un ciclo, toca la pantalla</b> (con los ojos cerrados, donde sea). Cuando <b>notes que perdiste la cuenta</b>, toca “perdí la cuenta” abajo. No hay acierto ni error.',
    instruction_easy: 'Respira y <b>cuenta del 1 al 9 en tu cabeza</b>. Al llegar a 9 y <b>completar una vuelta, toca la pantalla</b> (con los ojos cerrados, donde sea está bien). Si <b>notas que te distrajiste</b>, toca el botón de abajo. Aquí no hay hacerlo bien o mal.',
    choose: 'Empezar',
    lengthTitle: '¿Cuánto tiempo?',
    lengthLead: 'Elige a tu propio ritmo.',
    minutes: '{n} min',
    tapAria: 'Toca aquí al terminar un ciclo (respiraciones 1–9)',
    tapHint: '¿Contaste hasta 9? Toca la pantalla — donde sea',
    caught: 'Perdí la cuenta (me di cuenta)',
    soundOn: 'Sonido activado (toca para silenciar)', soundOff: 'Silenciado (toca para activar)',
    bowlAlt: 'cuenco tibetano',
    doneTitle: 'Terminado',
    doneLead: 'Bien hecho. Abajo solo hay un registro de los hechos.',
    factTime: 'Tiempo juntos',
    factCycles: 'Ciclos completados',
    factCaught: 'Veces que pulsaste “perdí la cuenta”',
    sparkTitle: 'El transcurso de esta sesión',
    sparkNote: 'Las marcas de arriba señalan cuándo terminaste un ciclo; las de abajo, cuándo pulsaste “perdí la cuenta”. Más o menos no es ni bueno ni malo: solo cómo fue esta sesión.',
    legendCycle: 'Ciclo hecho', legendCaught: 'Me di cuenta (perdí la cuenta)',
    again: 'Hacerlo otra vez',
    disclaimer: 'Esto es una práctica, no un examen. No se guarda nada en tu dispositivo.',
  },
};
