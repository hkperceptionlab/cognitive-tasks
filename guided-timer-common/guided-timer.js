// guided-timer-common/guided-timer.js — 가이드 명상 타이머(Guided sitting timer). 실천 계열 4번째·마지막.
// 청소년·성인 앱이 startGuidedTimer(opts) 로 공유한다.
//
// 앞의 세 실천 과제와 같은 기준: 엔진 시행-채점 구조 안 씀(runTask 안 씀), core/i18n.js 만 재사용,
// 판정 어휘 금지, '결과' 아니라 '완료 확인', localStorage 아무것도 안 씀(언어선택 제외), 계열색 practice 재사용.
// 엔진 코어는 무수정(색은 호흡세기 때 이미 등록됨).
//
// ★ 넷 중 가장 단순한 구조: 특정 기법(세기·훑기·마음 보내기) 없이 '정해진 시간 동안 안내와 함께 조용히
//   앉아 있는' 범용 타이머. 자기보고·부위 순서·대상 선택 없음. 세션 중 조작은 음소거 토글뿐.
//
// ★ 시각 예외(DESIGN.md — 앞의 세 예외와 또 다른 네 번째 근거): 숫자·원형 게이지 같은 기계적 진행 표시를
//   완전히 대신하는, '자연의 시간 감각'으로 표현한 진행 지표. 연꽃처럼 '단계'가 있어 단계마다 바뀌는 게
//   아니라, 정해진 단계 없이 경과 비율(elapsed/total)에 매끄럽게 연동되는 '연속적' 변화가 연꽃과의 핵심 차이.
//   ★ 그리고 이번이 처음으로 성인·청소년 그림 '내용 자체'가 다르다(앞 셋은 계열색 명도만 달랐음):
//     성인=일출(어두운 하늘→해가 떠오르며 그라데이션으로 밝아짐, 차분한 톤),
//     청소년=밤하늘에 별이 하나씩 켜짐(발견하는 재미, 조금 더 생동감).
//   취향이 아니라 '명상 진입의 정서적 톤을 연령대에 맞춘 것'이 근거(DESIGN.md 문서화).
//   ★ 무채색 원칙 예외: 하늘·해·별은 실채색(잔상 데모와 같은 결) — 그림이 표현하려는 것(새벽·밤하늘)이
//     무채색으로는 성립 안 되므로 당연한 예외. accent(계열색)는 UI(버튼·언어탭)에만.
//
// ★ 소리: 시작·끝 종소리(호흡세기 Web Audio 합성 재사용, 음높이로 시작/끝 구분, AudioContext 는 길이선택
//   클릭 핸들러 안에서 생성=자동재생 정책 회피) + 약 90초 간격의 짧은 음성 리마인더(텍스트도 잠깐 표시 후
//   페이드). 리마인더는 단계 전환이 아니라 순수 타이머 기반이라 바디스캔/연꽃급 onend 안전장치 불필요.

import { LANG_NAMES, LANG_STORAGE_KEY, detectLang } from '../core/i18n.js';

const QA = (() => { try { return new URLSearchParams(location.search).get('qa') === '1'; } catch { return false; } })();

const LENGTHS = [5, 10, 15];                      // 세션 길이(분)
const lenMs = (m) => (QA ? 3000 : m * 60000);     // QA 는 전환·진행·자동종료만 빠르게(구조·UI 동일)

// 리마인더 스케줄(ms). 시작 종소리와 안 겹치게 첫 리마인더는 조금 뒤, 끝 종소리와 안 겹치게 종료 직전 GUARD 는 건너뜀.
const R_FIRST = QA ? 700 : 20000;
const R_INTERVAL = QA ? 700 : 90000;
const R_GUARD = QA ? 250 : 15000;                 // 남은 시간이 이보다 적으면 리마인더 안 띄움(종료 종소리와 분리)
const R_SHOW_MS = QA ? 350 : 4500;                // 리마인더 텍스트 표시 후 페이드아웃까지
const R_COUNT = 5;                                // 순환할 리마인더 문구 수(r0..r4). 기법을 가리키는 문구는 두지 않음.

const START_FREQ = 220;                           // 시작 종소리 기본음
const END_FREQ = 174.61;                          // 끝 종소리(더 낮게 — 시작과 구분)

const STAR_N = 9;                                 // 청소년 밤하늘 별 개수
// 별 위치(viewBox 240×240 하늘 영역). 켜지는 순서 = 배열 순서.
const STAR_POS = [[42, 52], [78, 30], [112, 62], [150, 40], [186, 92], [56, 112], [96, 132], [138, 106], [206, 138]];

// 일출 키프레임: 경과 비율 p 에서 하늘 3색·해 색·땅 색을 보간. 실채색(무채색 예외).
const SKY_KF = [
  { p: 0.00, top: '#0b1030', mid: '#16204a', bot: '#2a2f63', sun: '#ff7a3c', ground: '#0c1226' },
  { p: 0.40, top: '#3a3566', mid: '#7a5578', bot: '#c58072', sun: '#ff9a50', ground: '#22293a' },
  { p: 0.75, top: '#6f86b0', mid: '#e2a771', bot: '#ffce8f', sun: '#ffc070', ground: '#39492f' },
  { p: 1.00, top: '#8ec5ec', mid: '#cfe6f5', bot: '#ffe6bd', sun: '#ffe6a8', ground: '#4a5f4d' },
];
const SUN_Y0 = 250, SUN_Y1 = 78;                  // 해 cy: 수평선 아래(가림) → 하늘 위

// ── 앱별 옵션 + 세션 상태 ─────────────────────────────────
let appId = 'guided-timer';
let accent = '#4A6B4D';
let toneScale = 1;
let tone = 'std';
let scene = 'sunrise';       // 'sunrise'(성인) | 'stars'(청소년)
let lang = detectLang();

let root = null;
let stage = 'intro';         // 'intro' | 'length' | 'session' | 'done'
let sessionMs = 0;
let sessionStart = 0;
let rafId = 0;
let nextReminderAt = 0;      // 다음 리마인더 예정 시각(경과 ms)
let reminderIdx = 0;
let reminderHideTimer = 0;
let sceneRefs = null;        // 세션 진입 시 캐시한 SVG 요소들(매 프레임 querySelector 회피)
let audioCtx = null;
let bellRing = null;         // 지금 울리는 종의 마스터 게인(음소거로 즉시 잦아들게)
let muted = false;

const t = (k) => {
  const s = STRINGS[lang] || STRINGS.ko;
  const tk = tone === 'easy' ? s[k + '_easy'] : undefined;
  return tk ?? s[k] ?? STRINGS.ko[k] ?? k;
};

// ── 종소리(Web Audio 합성, 호흡세기 playBowl 재사용 — 기본음만 인자로) ──────────
async function playBell(base) {
  if (muted) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { console.error('[bell] no AudioContext ctor'); return; }
    if (!audioCtx) audioCtx = new AC();                          // 제스처(길이 클릭) 안에서 최초 생성
    if (audioCtx.state === 'suspended') await audioCtx.resume(); // resume 완료 뒤 스케줄
    if (muted) return;                                           // await 사이 음소거됐을 수 있음
    const ctx = audioCtx, now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);
    bellRing = master;
    // 비조화 배음(배수 1 / 2.76 / 5.40) — 싱잉볼 특유의 긴 울림.
    [{ m: 1, g: 0.5, d: 5.0 }, { m: 2.76, g: 0.26, d: 4.0 }, { m: 5.40, g: 0.14, d: 3.0 }]
      .forEach((p) => {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = base * p.m;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(p.g, now + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, now + p.d);
        o.connect(g); g.connect(master);
        o.start(now);
        o.stop(now + p.d + 0.1);
      });
  } catch (e) { console.error('[bell] error:', e); }
}
function silenceBell() {
  if (!bellRing || !audioCtx) return;
  try {
    const now = audioCtx.currentTime;
    bellRing.gain.cancelScheduledValues(now);
    bellRing.gain.setValueAtTime(bellRing.gain.value, now);
    bellRing.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
  } catch {}
}

// ── 음성 리마인더(단순 TTS, onend 게이트 없음 — 진행을 막지 않음) ──────────────
function ttsAvailable() {
  return typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined';
}
function pickVoice() {
  try {
    const voices = speechSynthesis.getVoices() || [];
    return voices.find((v) => v.lang && v.lang.toLowerCase().startsWith(lang)) || null;
  } catch { return null; }
}
function speakReminder(text) {
  if (muted || !ttsAvailable()) return;
  const voice = pickVoice();
  if (!voice) return;                              // 해당 언어 음성 없음 → 텍스트만(정상)
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice; u.lang = voice.lang; u.rate = 0.86;
    speechSynthesis.speak(u);
  } catch {}
}
function fireReminder() {
  const phrase = t('r' + (reminderIdx % R_COUNT));
  reminderIdx++;
  const el = root && root.querySelector('.gt-reminder');
  if (el) {
    el.textContent = phrase;
    el.classList.add('show');
    clearTimeout(reminderHideTimer);
    reminderHideTimer = setTimeout(() => el.classList.remove('show'), R_SHOW_MS);
  }
  speakReminder(phrase);
}

// ── 색 보간 ────────────────────────────────────────────────
function hexToRgb(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
function lerpColor(a, b, f) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return `rgb(${Math.round(A[0] + (B[0] - A[0]) * f)},${Math.round(A[1] + (B[1] - A[1]) * f)},${Math.round(A[2] + (B[2] - A[2]) * f)})`;
}
function skyAt(p) {
  let i = 0;
  while (i < SKY_KF.length - 2 && p > SKY_KF[i + 1].p) i++;
  const a = SKY_KF[i], b = SKY_KF[i + 1];
  const f = b.p === a.p ? 0 : (p - a.p) / (b.p - a.p);
  return {
    top: lerpColor(a.top, b.top, f), mid: lerpColor(a.mid, b.mid, f), bot: lerpColor(a.bot, b.bot, f),
    sun: lerpColor(a.sun, b.sun, f), ground: lerpColor(a.ground, b.ground, f),
  };
}

// ── 그림 SVG ────────────────────────────────────────────────
function sceneSVG() {
  if (scene === 'stars') return starsSVG();
  return sunriseSVG();
}
function sunriseSVG() {
  return `<svg viewBox="0 0 240 240" class="gt-sky" data-scene="sunrise" role="img" aria-label="${t('skyAlt_sunrise')}">
    <defs><linearGradient id="gt-skygrad" x1="0" y1="0" x2="0" y2="170" gradientUnits="userSpaceOnUse">
      <stop class="s-top" offset="0" stop-color="${SKY_KF[0].top}"/>
      <stop class="s-mid" offset="0.55" stop-color="${SKY_KF[0].mid}"/>
      <stop class="s-bot" offset="1" stop-color="${SKY_KF[0].bot}"/>
    </linearGradient></defs>
    <rect x="0" y="0" width="240" height="240" fill="url(#gt-skygrad)"/>
    <circle class="gt-sunglow" cx="120" cy="${SUN_Y0}" r="46" fill="${SKY_KF[0].sun}" opacity="0.22"/>
    <circle class="gt-sun" cx="120" cy="${SUN_Y0}" r="28" fill="${SKY_KF[0].sun}"/>
    <rect class="gt-ground" x="0" y="165" width="240" height="75" fill="${SKY_KF[0].ground}"/>
  </svg>`;
}
function starsSVG() {
  const stars = STAR_POS.map(([x, y], i) => {
    const d = `M${x},${y - 6} L${x + 1.6},${y - 1.6} L${x + 6},${y} L${x + 1.6},${y + 1.6} L${x},${y + 6} L${x - 1.6},${y + 1.6} L${x - 6},${y} L${x - 1.6},${y - 1.6} Z`;
    return `<path class="gt-star" data-star="${i}" d="${d}"/>`;
  }).join('');
  return `<svg viewBox="0 0 240 240" class="gt-sky" data-scene="stars" role="img" aria-label="${t('skyAlt_stars')}">
    <defs><linearGradient id="gt-nightgrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0a1030"/><stop offset="1" stop-color="#241a3e"/>
    </linearGradient></defs>
    <rect width="240" height="240" fill="url(#gt-nightgrad)"/>
    <path class="gt-moon" d="M186,40 A21,21 0 1,0 186,82 A26,26 0 0,1 186,40 Z" fill="#f2ecd0" opacity="0.85"/>
    <path class="gt-hills" d="M0,206 Q60,182 120,202 T240,196 L240,240 L0,240 Z" fill="#150f31" opacity="0.92"/>
    ${stars}
  </svg>`;
}

// 세션 진입 시 그림 요소를 한 번 캐시(매 프레임 조회 회피).
function cacheSceneRefs() {
  const svg = root.querySelector('.gt-sky');
  if (!svg) { sceneRefs = null; return; }
  if (scene === 'stars') {
    sceneRefs = { svg, stars: [...svg.querySelectorAll('.gt-star')] };
  } else {
    sceneRefs = {
      svg,
      top: svg.querySelector('.s-top'), mid: svg.querySelector('.s-mid'), bot: svg.querySelector('.s-bot'),
      sun: svg.querySelector('.gt-sun'), glow: svg.querySelector('.gt-sunglow'), ground: svg.querySelector('.gt-ground'),
    };
  }
}
// 경과 비율 p(0~1)를 그림에 반영.
function updateScene(p) {
  if (!sceneRefs) return;
  if (scene === 'stars') {
    sceneRefs.stars.forEach((el, i) => el.classList.toggle('on', p >= (i + 0.5) / STAR_N));
    return;
  }
  const c = skyAt(p);
  sceneRefs.top.setAttribute('stop-color', c.top);
  sceneRefs.mid.setAttribute('stop-color', c.mid);
  sceneRefs.bot.setAttribute('stop-color', c.bot);
  const cy = SUN_Y0 + (SUN_Y1 - SUN_Y0) * p;
  sceneRefs.sun.setAttribute('cy', cy); sceneRefs.sun.setAttribute('fill', c.sun);
  sceneRefs.glow.setAttribute('cy', cy); sceneRefs.glow.setAttribute('fill', c.sun);
  sceneRefs.ground.setAttribute('fill', c.ground);
}

// ── 세션 타이머(rAF): 경과 비율로 그림 갱신 + 리마인더 발화. p>=1 이면 자동 종료. ──
function startSessionTimer() {
  cancelTimer();
  cacheSceneRefs();
  reminderIdx = 0;
  nextReminderAt = R_FIRST;
  const tick = (now) => {
    const elapsed = now - sessionStart;
    const p = Math.min(1, elapsed / sessionMs);
    updateScene(p);
    if (elapsed >= nextReminderAt) {
      if (sessionMs - elapsed > R_GUARD) fireReminder(); // 종료 직전(GUARD)엔 리마인더 안 띄움
      nextReminderAt += R_INTERVAL;
    }
    if (p >= 1) { rafId = 0; finishSession(); return; }
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}
function cancelTimer() { if (rafId) { cancelAnimationFrame(rafId); rafId = 0; } clearTimeout(reminderHideTimer); }
function stopSession() {
  cancelTimer();
  try { if (ttsAvailable()) speechSynthesis.cancel(); } catch {}
  silenceBell();
}
function finishSession() {
  cancelTimer();
  try { if (ttsAvailable()) speechSynthesis.cancel(); } catch {}
  playBell(END_FREQ);                              // 끝 종소리(시작과 다른 음높이)
  stage = 'done';
  render();
}

function injectStyles() {
  if (document.getElementById('gt-style')) return;
  const el = document.createElement('style');
  el.id = 'gt-style';
  el.textContent = `
:root{--gt-accent:${accent};--gt-scale:${toneScale}}
*{box-sizing:border-box}
html,body{margin:0}
.gt-root{min-height:100dvh;display:flex;flex-direction:column;background:#fafafa;color:#212121;
  font-family:system-ui,-apple-system,'Segoe UI',Roboto,'Noto Sans KR',sans-serif;
  padding-bottom:calc(1rem + env(safe-area-inset-bottom))}
.gt-top{padding:.7rem 1rem;display:flex;justify-content:flex-end}
.gt-langbar{display:flex;gap:.3rem;flex-wrap:wrap}
.langbtn{border:1px solid #d0d0d0;background:#fff;color:#757575;border-radius:999px;
  padding:.28rem .7rem;font-size:.82rem;font-weight:600;cursor:pointer;touch-action:manipulation}
.langbtn.on{background:var(--gt-accent);color:#fff;border-color:var(--gt-accent)}
.gt-mute{margin-right:auto;border:1px solid #d0d0d0;background:#fff;border-radius:999px;
  width:2.1rem;height:2.1rem;font-size:1rem;line-height:1;cursor:pointer;padding:0;
  display:flex;align-items:center;justify-content:center;touch-action:manipulation}
.gt-mute.on{background:#eef2ee;border-color:var(--gt-accent)}
.gt-stage{flex:1;display:flex;align-items:flex-start;justify-content:center;padding:1rem}
.gt-card{width:100%;max-width:560px;text-align:center}
.gt-title{font-size:calc(1.5rem * var(--gt-scale));margin:.3rem 0 .6rem}
.gt-lead{color:#555;line-height:1.6;margin:.2rem 0 1rem}
.gt-instruction{line-height:1.75;text-align:left;background:#eef2ee;border:1px solid #dde6dd;
  border-radius:12px;padding:.9rem 1.05rem;margin:0 0 1.2rem;font-size:calc(1rem * var(--gt-scale))}
.gt-instruction b{color:var(--gt-accent)}
.gt-note{color:#888;font-size:.9rem;margin:.6rem 0 0;line-height:1.5}
.gt-primary{border:none;border-radius:12px;background:var(--gt-accent);color:#fff;
  font-size:calc(1.1rem * var(--gt-scale));font-weight:700;padding:.85rem 1.5rem;
  min-height:calc(3.2rem * var(--gt-scale));cursor:pointer;touch-action:manipulation}
.gt-primary:active{transform:translateY(1px)}
.gt-lengths{display:flex;flex-direction:column;gap:.8rem;max-width:22rem;margin:1.2rem auto 0}
.gt-len{border:2px solid var(--gt-accent);background:#fff;color:var(--gt-accent);border-radius:14px;
  font-size:calc(1.15rem * var(--gt-scale));font-weight:700;padding:1rem;min-height:3.4rem;
  cursor:pointer;touch-action:manipulation}
.gt-len:active{background:var(--gt-accent);color:#fff}
/* 세션: 그림 + 리마인더 텍스트(숫자·게이지 없음) */
.gt-scenewrap{margin:.6rem auto .4rem;width:min(80vw,calc(340px * var(--gt-scale)))}
.gt-sky{width:100%;height:auto;display:block;border-radius:18px}
.gt-star{fill:#39406a;transition:fill .9s ease}
.gt-star.on{fill:#ffe9a8;animation:gt-twinkle 3.2s ease-in-out infinite}
@keyframes gt-twinkle{0%,100%{opacity:.72}50%{opacity:1}}
.gt-reminder{min-height:3.2rem;margin:1rem auto .2rem;max-width:24rem;line-height:1.6;
  font-size:calc(1.1rem * var(--gt-scale));color:#556;opacity:0;transition:opacity .6s ease}
.gt-reminder.show{opacity:1}
@media (prefers-reduced-motion:reduce){.gt-star.on{animation:none}.gt-reminder{transition:none}}
/* 완료 확인(그림 없음 — 세션 전용) */
.gt-facts{margin:1rem auto;max-width:24rem;text-align:left}
.gt-facts .row{display:flex;justify-content:space-between;padding:.65rem .2rem;
  border-bottom:1px solid #eee;font-size:1.05rem}
.gt-facts .row b{font-variant-numeric:tabular-nums}
.gt-footer{padding:.9rem 1rem;text-align:center;color:#9e9e9e;font-size:.82rem;border-top:1px solid #eee}`;
  document.head.appendChild(el);
}

function langbarHTML() {
  return Object.keys(LANG_NAMES).filter((l) => STRINGS[l])
    .map((l) => `<button class="langbtn${l === lang ? ' on' : ''}" data-lang="${l}">${LANG_NAMES[l]}</button>`).join('');
}
function introHTML() {
  return `
    <h1 class="gt-title">${t('title')}</h1>
    <p class="gt-lead">${t('lead')}</p>
    <div class="gt-instruction">${t('instruction')}</div>
    <button class="gt-primary" data-act="toLength">${t('choose')}</button>`;
}
function lengthHTML() {
  const btns = LENGTHS.map((m) => `<button class="gt-len" data-min="${m}">${t('minutes').replace('{n}', m)}</button>`).join('');
  return `
    <h1 class="gt-title">${t('lengthTitle')}</h1>
    <p class="gt-lead">${t('lengthLead')}</p>
    <div class="gt-lengths">${btns}</div>
    <p class="gt-note">${t('soundNote')}</p>`;
}
function sessionHTML() {
  return `
    <div class="gt-scenewrap">${sceneSVG()}</div>
    <p class="gt-reminder" aria-live="polite"></p>`;
}
function doneHTML() {
  const totalMin = Math.round(sessionMs / 60000);
  return `
    <h1 class="gt-title">${t('doneTitle')}</h1>
    <p class="gt-lead">${t('doneLead')}</p>
    <div class="gt-facts">
      <div class="row"><span>${t('factTime')}</span><b>${QA ? fmtTime(sessionMs) : t('minutes').replace('{n}', totalMin)}</b></div>
    </div>
    <button class="gt-primary" data-act="restart">${t('again')}</button>`;
}
function fmtTime(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
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
  const muteBtn = inSession
    ? `<button class="gt-mute${muted ? ' on' : ''}" data-act="mute" aria-pressed="${muted}" ` +
      `aria-label="${t(muted ? 'soundOff' : 'soundOn')}" title="${t(muted ? 'soundOff' : 'soundOn')}">${muted ? '🔇' : '🔔'}</button>`
    : '';
  const langbar = inSession ? '' : `<div class="gt-langbar">${langbarHTML()}</div>`;
  root.innerHTML = `
    <header class="gt-top">${muteBtn}${langbar}</header>
    <main class="gt-stage"><div class="gt-card">${body}</div></main>
    <footer class="gt-footer">${t('disclaimer')}</footer>`;

  root.querySelectorAll('.langbtn').forEach((b) => b.addEventListener('click', () => {
    lang = b.dataset.lang; try { localStorage.setItem(LANG_STORAGE_KEY, lang); } catch {} render();
  }));

  if (stage === 'intro') {
    root.querySelector('[data-act="toLength"]').addEventListener('click', () => { stage = 'length'; render(); });
  } else if (stage === 'length') {
    root.querySelectorAll('.gt-len').forEach((b) => b.addEventListener('click', () => {
      sessionMs = lenMs(Number(b.dataset.min));
      muted = false;                     // 매 세션 기본값: 소리 켜짐(저장 안 함)
      sessionStart = performance.now();  // 세션 시작 시각(언어바 숨김이라 재렌더로 안 흔들림)
      playBell(START_FREQ);              // 시작 종소리 — 이 클릭 핸들러 안에서(자동재생 정책 회피)
      stage = 'session'; render();       // 세션 셸 렌더 + startSessionTimer 는 아래 session 분기
    }));
  } else if (stage === 'session') {
    const muteBtn2 = root.querySelector('[data-act="mute"]');
    if (muteBtn2) muteBtn2.addEventListener('click', () => {
      muted = !muted;
      if (muted) { silenceBell(); try { if (ttsAvailable()) speechSynthesis.cancel(); } catch {} }
      muteBtn2.classList.toggle('on', muted);
      muteBtn2.textContent = muted ? '🔇' : '🔔';
      const lbl = t(muted ? 'soundOff' : 'soundOn');
      muteBtn2.setAttribute('aria-pressed', String(muted));
      muteBtn2.setAttribute('aria-label', lbl); muteBtn2.setAttribute('title', lbl);
    });
    startSessionTimer();
  } else {
    root.querySelector('[data-act="restart"]').addEventListener('click', () => {
      stopSession(); stage = 'intro'; render();
    });
  }
}

// ── 진입점 ──
export function startGuidedTimer(opts = {}) {
  appId = opts.id || appId;
  accent = opts.accent || accent;
  toneScale = opts.scale || toneScale;
  tone = opts.tone || tone;
  scene = opts.scene || scene;
  lang = detectLang();
  stage = 'intro'; muted = false;
  try { if (ttsAvailable()) speechSynthesis.getVoices(); } catch {} // 음성 목록 워밍
  injectStyles();
  root = document.createElement('div');
  root.className = 'gt-root';
  document.getElementById('app').appendChild(root);
  render();
}

// ── 문자열(4언어). '_easy'=청소년 쉬운 말. 판정 어휘 금지 — 기법 지시 없이 '지금 상태를 부드럽게 상기'만. ──
const STRINGS = {
  ko: {
    title: '고요한 시간',
    lead: '특별한 방법 없이, 정해진 시간 동안 안내와 함께 조용히 앉아 있는 시간입니다.',
    instruction: '편안히 <b>앉거나 누워</b> 눈을 감아도 좋습니다. 셀 것도, 떠올릴 것도 없어요 — 그저 <b>정해진 시간 동안 가만히 머물면</b> 됩니다. 화면의 그림이 <b>시간이 흐르며 천천히 완성</b>되고, 시작과 끝에 낮은 종소리가 한 번씩 울립니다. 가끔 짧은 안내가 떠올랐다 사라져요. 맞고 틀림은 없습니다.',
    instruction_easy: '편하게 <b>앉거나 누워</b> 눈을 감아도 돼요. 셀 것도, 떠올릴 것도 없어요 — 그냥 <b>정해진 시간 동안 가만히 있으면</b> 돼요. 화면 그림이 <b>시간이 지나며 천천히 완성</b>되고, 시작과 끝에 종소리가 한 번씩 울려요. 가끔 짧은 안내가 잠깐 떠올라요. 잘하고 못하고는 없어요.',
    choose: '시작하기',
    lengthTitle: '얼마나 할까요?',
    lengthLead: '천천히 머물 시간을 골라 주세요.',
    minutes: '{n}분',
    soundNote: '시작·끝에 종소리가 울리고, 가끔 목소리로 짧게 안내해요. 소리는 세션 화면에서 언제든 끌 수 있어요(꺼도 그림과 글은 계속돼요).',
    skyAlt_sunrise: '시간이 흐르며 해가 떠오르는 하늘 그림',
    skyAlt_stars: '시간이 흐르며 별이 하나씩 켜지는 밤하늘 그림',
    r0: '그대로 머물러 보세요.',
    r1: '지금 이 순간에 머물러도 좋습니다.',
    r2: '몸의 감각을 가만히 느껴 보세요.',
    r3: '생각이 떠오르면 그저 흘려보내도 괜찮습니다.',
    r4: '편안하게, 서두르지 않아도 됩니다.',
    soundOn: '소리 켜짐 (누르면 음소거)', soundOff: '음소거됨 (누르면 소리)',
    doneTitle: '마쳤습니다',
    doneLead: '수고하셨어요. 아래는 사실만 담은 기록입니다.',
    factTime: '함께한 시간',
    again: '다시 하기',
    disclaimer: '이것은 검사가 아니라 연습입니다. 아무 기록도 기기에 저장되지 않습니다.',
  },
  en: {
    title: 'A Quiet Time',
    lead: 'No special technique — just a set span of time to sit quietly, with gentle guidance.',
    instruction: 'Sit or lie down <b>comfortably</b>, eyes closed if you like. Nothing to count, nothing to picture — just <b>stay still for the set time</b>. The image on screen <b>slowly completes as time passes</b>, and a soft chime sounds once at the start and once at the end. A short reminder appears now and then, and fades. There is no right or wrong.',
    instruction_easy: 'Sit or lie down <b>comfortably</b>, eyes closed if you like. Nothing to count, nothing to picture — just <b>stay still for the set time</b>. The picture <b>slowly completes as time passes</b>, and a chime sounds once at the start and once at the end. A short note pops up now and then. There is no good or bad here.',
    choose: 'Get started',
    lengthTitle: 'How long?',
    lengthLead: 'Choose your time to stay a while.',
    minutes: '{n} min',
    soundNote: 'A chime sounds at the start and end, and a voice gives short reminders now and then. You can turn sound off anytime on the session screen (the picture and text continue).',
    skyAlt_sunrise: 'a sky where the sun rises as time passes',
    skyAlt_stars: 'a night sky where stars light up one by one as time passes',
    r0: 'Just stay as you are.',
    r1: 'It is fine to rest in this moment.',
    r2: 'Gently notice the sensations in your body.',
    r3: 'If thoughts arise, you can simply let them pass.',
    r4: 'At ease — there is no need to hurry.',
    soundOn: 'Sound on (tap to mute)', soundOff: 'Muted (tap for sound)',
    doneTitle: 'Done',
    doneLead: 'Nicely done. Below is a record of the facts only.',
    factTime: 'Time together',
    again: 'Do it again',
    disclaimer: 'This is a practice, not a test. Nothing is saved on your device.',
  },
  zh: {
    title: '安静的时光',
    lead: '没有特别的方法——只是在一段设定的时间里，伴着轻声引导安静地坐着。',
    instruction: '<b>舒服地</b>坐着或躺下，愿意的话可以闭上眼。不用数，也不用想什么——只要<b>在设定的时间里静静待着</b>就好。屏幕上的画会<b>随着时间慢慢完成</b>，开始和结束时各响一声低低的钟声。偶尔会有一句简短的提示浮现又淡去。没有对错。',
    instruction_easy: '<b>舒服地</b>坐着或躺下，愿意就闭上眼。不用数，也不用想——就<b>在设定的时间里静静待着</b>。画面会<b>随着时间慢慢完成</b>，开始和结束各响一声钟。偶尔会有一句简短的话浮现一下。这里没有做得好不好。',
    choose: '开始',
    lengthTitle: '做多久？',
    lengthLead: '选一段可以慢慢待着的时间。',
    minutes: '{n}分钟',
    soundNote: '开始和结束会响钟声，偶尔用语音做简短引导。在练习画面里随时可以关声音（关了画和字也一直在）。',
    skyAlt_sunrise: '随时间太阳升起的天空图',
    skyAlt_stars: '随时间星星一颗颗亮起的夜空图',
    r0: '就这样待着就好。',
    r1: '停留在此刻也很好。',
    r2: '轻轻感受身体的感觉。',
    r3: '念头浮现时，让它自然流过就好。',
    r4: '放松，不用着急。',
    soundOn: '声音开（点按静音）', soundOff: '已静音（点按开声）',
    doneTitle: '完成了',
    doneLead: '辛苦了。下面只是如实的记录。',
    factTime: '一起度过的时间',
    again: '再来一次',
    disclaimer: '这是练习，不是检查。什么都不会保存在你的设备上。',
  },
  es: {
    title: 'Un Rato en Calma',
    lead: 'Sin técnica especial — solo un tiempo fijado para sentarte en silencio, con una guía suave.',
    instruction: 'Siéntate o acuéstate <b>cómodamente</b>, con los ojos cerrados si quieres. Nada que contar, nada que imaginar — solo <b>quédate quieto durante el tiempo fijado</b>. La imagen en pantalla <b>se completa despacio a medida que pasa el tiempo</b>, y suena una campana suave al inicio y otra al final. De vez en cuando aparece un breve recordatorio y se desvanece. No hay acierto ni error.',
    instruction_easy: 'Siéntate o acuéstate <b>cómodamente</b>, con los ojos cerrados si quieres. Nada que contar ni imaginar — solo <b>quédate quieto durante el tiempo fijado</b>. La imagen <b>se completa despacio con el tiempo</b>, y suena una campana al inicio y al final. De vez en cuando aparece una frase breve. Aquí no hay hacerlo bien o mal.',
    choose: 'Empezar',
    lengthTitle: '¿Cuánto tiempo?',
    lengthLead: 'Elige tu tiempo para quedarte un rato.',
    minutes: '{n} min',
    soundNote: 'Suena una campana al inicio y al final, y una voz da recordatorios breves de vez en cuando. Puedes silenciar el sonido cuando quieras en la pantalla de la sesión (la imagen y el texto siguen).',
    skyAlt_sunrise: 'un cielo donde el sol se eleva a medida que pasa el tiempo',
    skyAlt_stars: 'un cielo nocturno donde las estrellas se encienden una a una con el tiempo',
    r0: 'Solo quédate como estás.',
    r1: 'Está bien descansar en este momento.',
    r2: 'Nota con suavidad las sensaciones de tu cuerpo.',
    r3: 'Si surgen pensamientos, puedes simplemente dejarlos pasar.',
    r4: 'Con calma, no hay prisa.',
    soundOn: 'Sonido activado (toca para silenciar)', soundOff: 'Silenciado (toca para activar)',
    doneTitle: 'Terminado',
    doneLead: 'Bien hecho. Abajo solo hay un registro de los hechos.',
    factTime: 'Tiempo juntos',
    again: 'Hacerlo otra vez',
    disclaimer: 'Esto es una práctica, no un examen. No se guarda nada en tu dispositivo.',
  },
};
