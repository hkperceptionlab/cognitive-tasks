// body-scan-common/body-scan.js — 바디스캔(Body Scan Meditation). 실천 계열 2번째.
// 청소년·성인 앱이 startBodyScan(opts) 로 공유한다.
//
// 호흡세기(실천 1번째)와 같은 기준: 엔진 시행-채점 구조 안 씀(runTask 안 씀), core/i18n.js 만 재사용,
// 판정 어휘 금지, '결과' 아니라 '완료 확인', localStorage 아무것도 안 씀(언어선택 제외), 계열색 practice 재사용.
// 엔진 코어는 이번엔 무수정(색은 이미 등록됨).
//
// ★ 호흡세기와의 구조 차이: 자기보고(self-caught)가 없다. 안내를 따라 시간에 맞춰 자동으로 다음 부위로
//   넘어간다 → 세션 중 사용자 조작은 음소거 토글뿐. 완료 화면도 점수·자기보고 지표 없이 총 시간·부위 수만.
//
// ★ 시각 예외(DESIGN.md 문서화 — 호흡세기와 다른 근거): 호흡세기 싱잉볼은 '장식이지만 호흡 표시 기능'
//   이었고, 바디스캔 실루엣은 '몸의 위치를 보여주는 것이 안내 자체의 기능'이라 필요하다. 옆으로 누운 측면
//   단순 선화(안내 문구 '편안히 누워도 좋다'와 자세 일치), 얼굴 표정 없음, 성별·나이·체형 디테일 배제
//   (캐릭터 아니라 '부위 표시 다이어그램'). SVG 직접 렌더.
//
// ★ 안내 전달: Web Speech API(speechSynthesis)로 각 부위 문구를 읽어주고 동시에 화면 텍스트로도 항상 표시.
//   다음 부위로 넘어가는 시점 = TTS onend 와 부위별 최소 시간 중 '더 늦은 쪽'. TTS 실패·미지원·해당 언어
//   음성 없음이면 조용히 최소 시간만으로 폴백(호흡세기 playBowl try/catch 패턴). 첫 발화는 길이선택 클릭
//   핸들러 안에서 트리거(사용자 제스처 없이는 speechSynthesis 가 막힘). rate 0.88(명상 톤), pitch 기본.

import { LANG_NAMES, LANG_STORAGE_KEY, detectLang } from '../core/i18n.js';

const QA = (() => { try { return new URLSearchParams(location.search).get('qa') === '1'; } catch { return false; } })();

const LENGTHS = [5, 10, 15];                    // 세션 길이(분)
// 인트로(안착)·아웃트로(마무리) 예약 시간. QA 는 전환·자동종료만 빠르게 검증(구조는 실제와 동일).
const INTRO_MS = QA ? 150 : 15000;
const OUTRO_MS = QA ? 150 : 15000;
// TTS 안전 상한: onend 가 유실되는 브라우저 특성(헤드리스, 일부 브라우저의 긴 발화 끊김 등) 대비.
// 말하기 시작했는데 onend 가 이 시간 안에 안 오면 강제로 '끝난 것'으로 처리해 세션이 멈추지 않게 한다.
// 정상 브라우저에선 onend 가 최소시간보다 먼저 와 이 상한은 닿지 않는다('더 늦은 쪽' 규칙 유지).
const TTS_CAP_MS = QA ? 250 : 30000;

// 스캔 순서(총 14단계). regions = 실루엣에서 강조할 부위 그룹 id(들). 'ALL'=온몸 전체.
const PARTS = [
  { key: 'p_feet',      regions: ['feet'] },
  { key: 'p_calves',    regions: ['calves'] },
  { key: 'p_knees',     regions: ['knees'] },
  { key: 'p_thighs',    regions: ['thighs'] },
  { key: 'p_pelvis',    regions: ['pelvis'] },
  { key: 'p_belly',     regions: ['belly'] },
  { key: 'p_chest',     regions: ['chest'] },
  { key: 'p_hands',     regions: ['hands'] },
  { key: 'p_arms',      regions: ['arms'] },
  { key: 'p_shoulders', regions: ['shoulders'] },
  { key: 'p_neck',      regions: ['neck'] },
  { key: 'p_face',      regions: ['face'] },
  { key: 'p_crown',     regions: ['crown'] },
  { key: 'p_whole',     regions: ['ALL'] },
];

// 실루엣 부위 그룹(회색 조립). 강조 시 그 그룹만 accent. 그리는 순서(뒤→앞): 팔→어깨→몸통→다리→…→머리.
const REGION_ORDER = ['arms', 'shoulders', 'chest', 'belly', 'pelvis', 'thighs', 'knees', 'calves', 'feet', 'hands', 'neck', 'face', 'crown'];
const REGIONS = {
  arms:      '<rect x="146" y="130" width="128" height="15" rx="8"/>',
  shoulders: '<rect x="118" y="70" width="30" height="60" rx="15"/>',
  chest:     '<rect x="140" y="74" width="62" height="54" rx="12"/>',
  belly:     '<rect x="200" y="78" width="58" height="48" rx="12"/>',
  pelvis:    '<rect x="256" y="76" width="58" height="54" rx="13"/>',
  thighs:    '<rect x="310" y="80" width="66" height="20" rx="9"/><rect x="310" y="104" width="66" height="20" rx="9"/>',
  knees:     '<circle cx="382" cy="90" r="11"/><circle cx="382" cy="114" r="11"/>',
  calves:    '<rect x="392" y="82" width="52" height="17" rx="8"/><rect x="392" y="105" width="52" height="17" rx="8"/>',
  feet:      '<ellipse cx="450" cy="90" rx="15" ry="9"/><ellipse cx="450" cy="114" rx="15" ry="9"/>',
  hands:     '<ellipse cx="284" cy="137" rx="13" ry="11"/>',
  neck:      '<rect x="96" y="88" width="26" height="26" rx="6"/>',
  face:      '<ellipse cx="68" cy="100" rx="32" ry="30"/>',
  crown:     '<ellipse cx="40" cy="100" rx="14" ry="22"/>',
};

// ── 앱별 옵션 + 세션 상태 ─────────────────────────────────
let appId = 'body-scan';
let accent = '#4A6B4D';
let toneScale = 1;
let tone = 'std';
let lang = detectLang();

let root = null;
let stage = 'intro';        // 'intro' | 'length' | 'session' | 'done'
let chosenMin = 0;          // 선택한 세션 길이(분)
let plannedTotalMs = 0;     // 계획된 총 시간(진행바·QA 표시용)
let segments = [];          // {parts:[regionId|'ALL'], text:()=>string, minMs, endFrac}
let cur = null;             // 현재 세그먼트 진행 상태 {token,i,minDone,ttsDone}
let segToken = 0;           // 세그먼트 토큰(스테일 콜백 무효화)
let segTimer = 0;
let ttsSafety = 0;          // TTS onend 유실 대비 안전 타이머
let muted = false;          // 세션마다 기본값 false(소리 켜짐). 저장 안 함.

const t = (k) => {
  const s = STRINGS[lang] || STRINGS.ko;
  const tk = tone === 'easy' ? s[k + '_easy'] : undefined;
  return tk ?? s[k] ?? STRINGS.ko[k] ?? k;
};

// ── TTS ───────────────────────────────────────────────────
function ttsAvailable() {
  return typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined';
}
// 현재 UI 언어와 일치하는 음성 탐색(ko→ko-KR 등). 없으면 null(→ 텍스트만).
function pickVoice() {
  try {
    const voices = speechSynthesis.getVoices() || [];
    return voices.find((v) => v.lang && v.lang.toLowerCase().startsWith(lang)) || null;
  } catch { return null; }
}
// text 를 읽는다. 실제로 말하기 시작하면 true(끝나면 onDone), 아니면 false(호출자는 최소 시간만 사용).
function speak(text, onDone) {
  if (muted || !ttsAvailable()) return false;
  const voice = pickVoice();
  if (!voice) return false;                    // 해당 언어 음성 없음 → 텍스트만(정상 폴백, 에러 아님)
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice;
    u.lang = voice.lang;
    u.rate = 0.88;                             // 명상 톤(표준보다 살짝 느리게). pitch 기본.
    const myToken = segToken;
    u.onend = () => { if (myToken === segToken) onDone(); };
    u.onerror = () => { if (myToken === segToken) onDone(); }; // 에러도 '끝난 것'으로 처리(폴백)
    speechSynthesis.speak(u);
    return true;
  } catch { return false; }
}

// ── 세그먼트(안내 단위) 구성 및 진행 ─────────────────────────
function buildSegments() {
  const sessionMs = QA ? (INTRO_MS + PARTS.length * 120 + OUTRO_MS) : chosenMin * 60000;
  const bodyMs = Math.max(0, sessionMs - INTRO_MS - OUTRO_MS);
  const perPart = QA ? 120 : Math.max(1, Math.round(bodyMs / PARTS.length));
  segments = [];
  segments.push({ parts: [], text: () => t('introSpeak'), minMs: INTRO_MS });
  PARTS.forEach((p) => segments.push({ parts: p.regions, text: () => t(p.key), minMs: perPart }));
  segments.push({ parts: ['ALL'], text: () => t('outroSpeak'), minMs: OUTRO_MS });
  const total = segments.reduce((s, x) => s + x.minMs, 0) || 1;
  plannedTotalMs = total;
  let acc = 0;
  segments.forEach((s) => { acc += s.minMs; s.endFrac = acc / total; });
}

function playSegment(i) {
  const token = ++segToken;
  clearTimeout(segTimer); clearTimeout(ttsSafety);
  if (i >= segments.length) { finishSession(); return; }
  cur = { token, i, minDone: false, ttsDone: false };
  const seg = segments[i];
  updateSegmentView(seg);
  // TTS: 시작하면 onend 를 기다리고, 아니면(음소거·미지원·음성없음) 대기 없음.
  const spoke = speak(seg.text(), () => { clearTimeout(ttsSafety); if (cur && cur.token === token) { cur.ttsDone = true; maybeAdvance(); } });
  if (!spoke) cur.ttsDone = true;
  // ★ 말하기 시작했는데 onend 가 안 오는 경우의 상한(정상 브라우저에선 onend 가 최소시간보다 먼저 와 닿지 않음).
  else ttsSafety = setTimeout(() => { if (cur && cur.token === token) { cur.ttsDone = true; maybeAdvance(); } }, TTS_CAP_MS);
  // 최소 시간 backstop
  segTimer = setTimeout(() => { if (cur && cur.token === token) { cur.minDone = true; maybeAdvance(); } }, seg.minMs);
  maybeAdvance(); // 둘 다 이미 충족된 경우(예: QA 짧은 minMs + 음성 없음) 대비
}
// 최소 시간과 TTS 종료 '둘 다' 되면 다음으로(= 더 늦은 쪽에서 진행).
function maybeAdvance() {
  if (cur && cur.minDone && cur.ttsDone) playSegment(cur.i + 1);
}

// 현재 세그먼트를 화면에 반영(전체 재렌더 없이 in-place — 실루엣 유지·집중 안 끊김).
function updateSegmentView(seg) {
  const svg = root.querySelector('.bsil');
  if (svg) {
    const all = seg.parts.includes('ALL');
    svg.querySelectorAll('.bsil-region').forEach((g) => {
      g.classList.toggle('on', all || seg.parts.includes(g.dataset.part));
    });
  }
  const guide = root.querySelector('.bs-guide');
  if (guide) guide.textContent = seg.text();
  const fill = root.querySelector('.bs-progress-fill');
  if (fill) { fill.style.transition = `width ${seg.minMs}ms linear`; fill.style.width = (seg.endFrac * 100) + '%'; }
}

function stopSession() {
  segToken++;                       // 대기 중인 콜백 무효화
  clearTimeout(segTimer); clearTimeout(ttsSafety); segTimer = 0; ttsSafety = 0;
  cur = null;
  try { if (ttsAvailable()) speechSynthesis.cancel(); } catch {}
}
function finishSession() { stopSession(); stage = 'done'; render(); }

// ── 실루엣 SVG(옆으로 누운 측면 단순 선화, 표정·성별·체형 디테일 없음) ──────────
function silhouetteSVG() {
  const groups = REGION_ORDER
    .map((id) => `<g class="bsil-region" data-part="${id}">${REGIONS[id]}</g>`)
    .join('');
  return `<svg viewBox="0 0 470 200" class="bsil" role="img" aria-label="${t('silAlt')}">${groups}</svg>`;
}

function injectStyles() {
  if (document.getElementById('bs-style')) return;
  const el = document.createElement('style');
  el.id = 'bs-style';
  el.textContent = `
:root{--bs-accent:${accent};--bs-scale:${toneScale}}
*{box-sizing:border-box}
html,body{margin:0}
.bs-root{min-height:100dvh;display:flex;flex-direction:column;background:#fafafa;color:#212121;
  font-family:system-ui,-apple-system,'Segoe UI',Roboto,'Noto Sans KR',sans-serif;
  padding-bottom:calc(1rem + env(safe-area-inset-bottom))}
.bs-top{padding:.7rem 1rem;display:flex;justify-content:flex-end}
.bs-langbar{display:flex;gap:.3rem;flex-wrap:wrap}
.langbtn{border:1px solid #d0d0d0;background:#fff;color:#757575;border-radius:999px;
  padding:.28rem .7rem;font-size:.82rem;font-weight:600;cursor:pointer;touch-action:manipulation}
.langbtn.on{background:var(--bs-accent);color:#fff;border-color:var(--bs-accent)}
.bs-mute{margin-right:auto;border:1px solid #d0d0d0;background:#fff;border-radius:999px;
  width:2.1rem;height:2.1rem;font-size:1rem;line-height:1;cursor:pointer;padding:0;
  display:flex;align-items:center;justify-content:center;touch-action:manipulation}
.bs-mute.on{background:#eef2ee;border-color:var(--bs-accent)}
.bs-stage{flex:1;display:flex;align-items:flex-start;justify-content:center;padding:1rem}
.bs-card{width:100%;max-width:560px;text-align:center}
.bs-title{font-size:calc(1.5rem * var(--bs-scale));margin:.3rem 0 .6rem}
.bs-lead{color:#555;line-height:1.6;margin:.2rem 0 1rem}
.bs-instruction{line-height:1.75;text-align:left;background:#eef2ee;border:1px solid #dde6dd;
  border-radius:12px;padding:.9rem 1.05rem;margin:0 0 1.2rem;font-size:calc(1rem * var(--bs-scale))}
.bs-instruction b{color:var(--bs-accent)}
.bs-note{color:#888;font-size:.9rem;margin:.6rem 0 0;line-height:1.5}
.bs-primary{border:none;border-radius:12px;background:var(--bs-accent);color:#fff;
  font-size:calc(1.1rem * var(--bs-scale));font-weight:700;padding:.85rem 1.5rem;
  min-height:calc(3.2rem * var(--bs-scale));cursor:pointer;touch-action:manipulation}
.bs-primary:active{transform:translateY(1px)}
.bs-lengths{display:flex;flex-direction:column;gap:.8rem;max-width:22rem;margin:1.2rem auto 0}
.bs-len{border:2px solid var(--bs-accent);background:#fff;color:var(--bs-accent);border-radius:14px;
  font-size:calc(1.15rem * var(--bs-scale));font-weight:700;padding:1rem;min-height:3.4rem;
  cursor:pointer;touch-action:manipulation}
.bs-len:active{background:var(--bs-accent);color:#fff}
/* 세션: 실루엣 + 안내 텍스트 + 진행바 */
.bs-silwrap{margin:.2rem auto .6rem;width:min(88vw,calc(430px * var(--bs-scale)))}
.bsil{width:100%;height:auto;display:block}
.bsil-region{fill:#e6e9e6;stroke:#c2c8c2;stroke-width:1.5;transition:fill .6s ease,stroke .6s ease}
.bsil-region.on{fill:var(--bs-accent);fill-opacity:.5;stroke:var(--bs-accent)}
.bs-guide{font-size:calc(1.15rem * var(--bs-scale));line-height:1.7;color:var(--fg,#212121);
  min-height:5.5rem;margin:.6rem auto 1rem;max-width:26rem}
.bs-progress{width:100%;max-width:26rem;height:6px;background:#e6e9e6;border-radius:999px;margin:0 auto;overflow:hidden}
.bs-progress-fill{height:100%;width:0;background:var(--bs-accent);border-radius:999px}
@media (prefers-reduced-motion:reduce){.bsil-region{transition:none}.bs-progress-fill{transition:none!important}}
/* 완료 확인 */
.bs-facts{margin:1rem auto;max-width:24rem;text-align:left}
.bs-facts .row{display:flex;justify-content:space-between;padding:.65rem .2rem;
  border-bottom:1px solid #eee;font-size:1.05rem}
.bs-facts .row b{font-variant-numeric:tabular-nums}
.bs-footer{padding:.9rem 1rem;text-align:center;color:#9e9e9e;font-size:.82rem;border-top:1px solid #eee}`;
  document.head.appendChild(el);
}

function langbarHTML() {
  return Object.keys(LANG_NAMES).filter((l) => STRINGS[l])
    .map((l) => `<button class="langbtn${l === lang ? ' on' : ''}" data-lang="${l}">${LANG_NAMES[l]}</button>`).join('');
}

function introHTML() {
  return `
    <h1 class="bs-title">${t('title')}</h1>
    <p class="bs-lead">${t('lead')}</p>
    <div class="bs-instruction">${t('instruction')}</div>
    <button class="bs-primary" data-act="toLength">${t('choose')}</button>`;
}
function lengthHTML() {
  const btns = LENGTHS.map((m) => `<button class="bs-len" data-min="${m}">${t('minutes').replace('{n}', m)}</button>`).join('');
  return `
    <h1 class="bs-title">${t('lengthTitle')}</h1>
    <p class="bs-lead">${t('lengthLead')}</p>
    <div class="bs-lengths">${btns}</div>
    <p class="bs-note">${t('soundNote')}</p>`;
}
function sessionHTML() {
  return `
    <div class="bs-silwrap">${silhouetteSVG()}</div>
    <p class="bs-guide" aria-live="polite"></p>
    <div class="bs-progress"><div class="bs-progress-fill"></div></div>`;
}
function doneHTML() {
  return `
    <h1 class="bs-title">${t('doneTitle')}</h1>
    <p class="bs-lead">${t('doneLead')}</p>
    <div class="bs-facts">
      <div class="row"><span>${t('factTime')}</span><b>${QA ? fmtTime(plannedTotalMs) : t('minutes').replace('{n}', chosenMin)}</b></div>
      <div class="row"><span>${t('factParts')}</span><b>${PARTS.length}</b></div>
    </div>
    <button class="bs-primary" data-act="restart">${t('again')}</button>`;
}
function fmtTime(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ── 렌더 ──
function render() {
  let body;
  if (stage === 'intro') body = introHTML();
  else if (stage === 'length') body = lengthHTML();
  else if (stage === 'session') body = sessionHTML();
  else body = doneHTML();

  const inSession = stage === 'session';
  // 세션 화면에선 언어바 숨김(집중 방해·재렌더 경로 제거 — 호흡세기와 동일 근거). 대신 음소거 토글.
  const muteBtn = inSession
    ? `<button class="bs-mute${muted ? ' on' : ''}" data-act="mute" aria-pressed="${muted}" ` +
      `aria-label="${t(muted ? 'soundOff' : 'soundOn')}" title="${t(muted ? 'soundOff' : 'soundOn')}">${muted ? '🔇' : '🔔'}</button>`
    : '';
  const langbar = inSession ? '' : `<div class="bs-langbar">${langbarHTML()}</div>`;
  root.innerHTML = `
    <header class="bs-top">${muteBtn}${langbar}</header>
    <main class="bs-stage"><div class="bs-card">${body}</div></main>
    <footer class="bs-footer">${t('disclaimer')}</footer>`;

  root.querySelectorAll('.langbtn').forEach((b) => b.addEventListener('click', () => {
    lang = b.dataset.lang; try { localStorage.setItem(LANG_STORAGE_KEY, lang); } catch {} render();
  }));

  if (stage === 'intro') {
    root.querySelector('[data-act="toLength"]').addEventListener('click', () => { stage = 'length'; render(); });
  } else if (stage === 'length') {
    root.querySelectorAll('.bs-len').forEach((b) => b.addEventListener('click', () => {
      chosenMin = Number(b.dataset.min);
      muted = false;                 // 매 세션 기본값: 소리 켜짐(저장 안 함)
      buildSegments();
      stage = 'session'; render();   // 세션 셸 렌더 + playSegment(0)은 아래 session 분기에서(=이 클릭 제스처 안)
    }));
  } else if (stage === 'session') {
    const muteBtn2 = root.querySelector('[data-act="mute"]');
    if (muteBtn2) muteBtn2.addEventListener('click', () => {
      muted = !muted;
      if (muted) {                    // 음소거: 즉시 멈추고 텍스트+최소시간만으로 진행
        try { if (ttsAvailable()) speechSynthesis.cancel(); } catch {}
        if (cur) { cur.ttsDone = true; maybeAdvance(); }
      }
      muteBtn2.classList.toggle('on', muted);
      muteBtn2.textContent = muted ? '🔇' : '🔔';
      const lbl = t(muted ? 'soundOff' : 'soundOn');
      muteBtn2.setAttribute('aria-pressed', String(muted));
      muteBtn2.setAttribute('aria-label', lbl); muteBtn2.setAttribute('title', lbl);
    });
    playSegment(0);                   // 첫 발화 = 이 호출 스택(length 클릭 제스처) 안 → 자동재생 정책 충족
  } else {
    root.querySelector('[data-act="restart"]').addEventListener('click', () => {
      stopSession(); stage = 'intro'; render();
    });
  }
}

// ── 진입점 ──
export function startBodyScan(opts = {}) {
  appId = opts.id || appId;
  accent = opts.accent || accent;
  toneScale = opts.scale || toneScale;
  tone = opts.tone || tone;
  lang = detectLang();
  stage = 'intro'; muted = false; cur = null;
  try { if (ttsAvailable()) speechSynthesis.getVoices(); } catch {} // 음성 목록 워밍(비동기 로드 유도)
  injectStyles();
  root = document.createElement('div');
  root.className = 'bs-root';
  document.getElementById('app').appendChild(root);
  render();
}

// ── 문자열(4언어). '_easy'=청소년 쉬운 말(없으면 표준 폴백). 판정 어휘 금지: '놓침·알아차림·느낌'만. ──
const STRINGS = {
  ko: {
    title: '바디스캔',
    lead: '몸의 각 부위에 차례로 주의를 옮기며, 지금 그곳의 감각을 그저 알아차리는 연습입니다.',
    instruction: '편하게 <b>눕거나 앉아</b> 눈을 감아도 좋습니다. 안내에 따라 <b>발끝부터 정수리까지</b> 주의를 옮기며, 각 부위의 감각을 바꾸려 하지 말고 그대로 느껴봅니다. <b>자동으로 다음 부위로</b> 넘어가니 아무것도 누를 필요 없어요. 맞고 틀림은 없습니다.',
    instruction_easy: '편하게 <b>눕거나 앉아</b> 눈을 감아도 돼요. 안내를 따라 <b>발끝부터 머리끝까지</b> 천천히 주의를 옮기며, 느껴지는 감각을 그대로 느껴봐요. <b>자동으로 다음으로</b> 넘어가니 아무것도 안 눌러도 돼요. 잘하고 못하고는 없어요.',
    choose: '시작하기',
    lengthTitle: '얼마나 할까요?',
    lengthLead: '천천히 할 시간을 골라 주세요.',
    minutes: '{n}분',
    soundNote: '목소리로도 안내해 드려요. 소리는 세션 화면에서 언제든 끌 수 있어요(꺼도 글은 계속 보여요).',
    introSpeak: '편안히 눕거나 앉아 눈을 감고, 몸 전체가 바닥에 닿아 있는 무게를 잠시 느껴봅니다.',
    p_feet: '두 발로 주의를 가져갑니다. 발바닥과 발가락에 어떤 감각이 있는지, 바꾸려 하지 말고 그대로 느껴봅니다.',
    p_calves: '종아리로 옮겨갑니다. 근육의 긴장이나 따뜻함, 아무 감각이 없다면 그것도 그대로 알아차립니다.',
    p_knees: '무릎으로 주의를 둡니다. 무릎 앞과 뒤, 관절 주변의 감각을 가만히 느껴봅니다.',
    p_thighs: '허벅지로 이동합니다. 바닥에 닿은 부분의 무게와 넓은 근육의 느낌을 살펴봅니다.',
    p_pelvis: '골반과 엉덩이로 주의를 가져갑니다. 몸을 받치고 있는 감각을 느껴봅니다.',
    p_belly: '배로 옮겨갑니다. 숨을 쉴 때마다 배가 부드럽게 오르내리는 것을 느껴봅니다.',
    p_chest: '가슴으로 주의를 둡니다. 호흡에 따라 가슴이 열리고 닫히는 움직임을 느껴봅니다.',
    p_hands: '두 손으로 주의를 가져갑니다. 손바닥과 손가락 끝의 감각을 하나씩 느껴봅니다.',
    p_arms: '팔로 옮겨갑니다. 손끝에서 어깨까지 이어지는 팔 전체의 무게를 느껴봅니다.',
    p_shoulders: '어깨로 주의를 둡니다. 혹시 힘이 들어가 있다면, 숨을 내쉬며 부드럽게 내려놓습니다.',
    p_neck: '목으로 이동합니다. 목과 그 주변의 감각을 조심스럽게 느껴봅니다.',
    p_face: '얼굴로 주의를 가져갑니다. 이마와 눈, 턱의 긴장을 알아차리고 편안하게 풀어줍니다.',
    p_crown: '머리 정수리로 주의를 둡니다. 머리 전체의 감각을 가만히 느껴봅니다.',
    p_whole: '이제 몸 전체를 한 번에 느껴봅니다. 발끝부터 정수리까지, 몸 전체가 함께 숨 쉬는 것을 느껴봅니다.',
    outroSpeak: '스캔을 마칩니다. 준비가 되면 천천히 손과 발을 움직이고, 편안하게 눈을 떠봅니다.',
    soundOn: '소리 켜짐 (누르면 음소거)', soundOff: '음소거됨 (누르면 소리)',
    silAlt: '몸 부위 안내 그림',
    doneTitle: '마쳤습니다',
    doneLead: '수고하셨어요. 아래는 사실만 담은 기록입니다.',
    factTime: '함께한 시간',
    factParts: '다녀온 부위',
    again: '다시 하기',
    disclaimer: '이것은 검사가 아니라 연습입니다. 아무 기록도 기기에 저장되지 않습니다.',
  },
  en: {
    title: 'Body Scan',
    lead: 'A practice of moving your attention part by part through the body, simply noticing the sensations there.',
    instruction: 'Lie down or sit <b>comfortably</b>, eyes closed if you like. Guided <b>from your feet to the crown of your head</b>, bring attention to each part and just feel it as it is, without trying to change anything. It <b>moves on by itself</b> — nothing to tap. There is no right or wrong.',
    instruction_easy: 'Lie down or sit <b>comfortably</b>, eyes closed if you like. Following the guide <b>from feet to head</b>, gently move your attention and feel whatever is there. It <b>moves on by itself</b> — you don’t press anything. There is no good or bad here.',
    choose: 'Get started',
    lengthTitle: 'How long?',
    lengthLead: 'Choose your time to take it slowly.',
    minutes: '{n} min',
    soundNote: 'A voice guides you too. You can turn sound off anytime on the session screen (the text stays either way).',
    introSpeak: 'Lie down or sit comfortably, close your eyes, and for a moment feel the weight of your whole body resting.',
    p_feet: 'Bring your attention to both feet. Notice any sensation in your soles and toes, without trying to change it.',
    p_calves: 'Move to your calves. Tension, warmth, or no sensation at all — whatever is there, simply notice it.',
    p_knees: 'Rest your attention on your knees. Gently feel the front, the back, and around the joints.',
    p_thighs: 'Move to your thighs. Notice the weight where they rest and the feel of the large muscles.',
    p_pelvis: 'Bring attention to your pelvis and hips. Feel the sensation of your body being supported.',
    p_belly: 'Move to your belly. Feel it rise and fall gently with each breath.',
    p_chest: 'Rest your attention on your chest. Feel it open and close with your breathing.',
    p_hands: 'Bring your attention to both hands. Feel your palms and fingertips, one by one.',
    p_arms: 'Move to your arms. Feel the whole weight of them, from fingertips up to the shoulders.',
    p_shoulders: 'Rest your attention on your shoulders. If they are tense, let them soften as you breathe out.',
    p_neck: 'Move to your neck. Carefully feel your neck and the area around it.',
    p_face: 'Bring attention to your face. Notice any tension in your forehead, eyes, and jaw, and let it ease.',
    p_crown: 'Rest your attention on the crown of your head. Quietly feel the sensations across your head.',
    p_whole: 'Now feel your whole body at once. From your toes to the crown of your head, feel it breathing as one.',
    outroSpeak: 'The scan is complete. When you are ready, slowly move your hands and feet, and gently open your eyes.',
    soundOn: 'Sound on (tap to mute)', soundOff: 'Muted (tap for sound)',
    silAlt: 'body-part guide figure',
    doneTitle: 'Done',
    doneLead: 'Nicely done. Below is a record of the facts only.',
    factTime: 'Time together',
    factParts: 'Parts visited',
    again: 'Do it again',
    disclaimer: 'This is a practice, not a test. Nothing is saved on your device.',
  },
  zh: {
    title: '身体扫描',
    lead: '把注意力一个部位一个部位地在身体里移动，只是觉察那里此刻的感觉。',
    instruction: '<b>舒服地</b>躺下或坐着，愿意的话可以闭上眼。跟着引导<b>从脚到头顶</b>，把注意力带到每个部位，不去改变，只是如实地去感受。它会<b>自动进入下一个部位</b>，不用按任何东西。没有对错。',
    instruction_easy: '<b>舒服地</b>躺下或坐着，愿意就闭上眼。跟着引导<b>从脚到头</b>慢慢移动注意力，感受那里的感觉。它会<b>自己往下走</b>，你什么都不用按。这里没有做得好不好。',
    choose: '开始',
    lengthTitle: '做多久？',
    lengthLead: '选一段可以慢慢来的时间。',
    minutes: '{n}分钟',
    soundNote: '也会用语音引导你。在练习画面里随时可以关声音（关了字也一直在）。',
    introSpeak: '舒服地躺下或坐着，闭上眼睛，先花一点时间感受整个身体贴在地面上的重量。',
    p_feet: '把注意力带到双脚。觉察脚掌和脚趾有什么感觉，不去改变它。',
    p_calves: '移到小腿。肌肉的紧绷、温热，或者没有任何感觉——无论是什么，只是觉察。',
    p_knees: '把注意力放在膝盖。轻轻感受膝盖前后和关节周围的感觉。',
    p_thighs: '移到大腿。感受贴着地面那部分的重量，以及大块肌肉的感觉。',
    p_pelvis: '把注意力带到骨盆和臀部。感受身体被支撑着的感觉。',
    p_belly: '移到腹部。感受每一次呼吸时肚子柔和地起伏。',
    p_chest: '把注意力放在胸口。感受它随着呼吸打开又合上。',
    p_hands: '把注意力带到双手。一个一个地感受手掌和指尖。',
    p_arms: '移到手臂。感受从指尖一直到肩膀，整条手臂的重量。',
    p_shoulders: '把注意力放在肩膀。如果有些用力，就在呼气时让它轻轻松开。',
    p_neck: '移到脖子。小心地感受脖子和它周围的感觉。',
    p_face: '把注意力带到脸。觉察额头、眼睛和下巴的紧绷，让它放松下来。',
    p_crown: '把注意力放在头顶。静静地感受整个头部的感觉。',
    p_whole: '现在把整个身体一次感受。从脚尖到头顶，感受整个身体一起呼吸。',
    outroSpeak: '扫描结束了。准备好之后，慢慢动一动手和脚，轻轻睁开眼睛。',
    soundOn: '声音开（点按静音）', soundOff: '已静音（点按开声）',
    silAlt: '身体部位引导图',
    doneTitle: '完成了',
    doneLead: '辛苦了。下面只是如实的记录。',
    factTime: '一起度过的时间',
    factParts: '走过的部位',
    again: '再来一次',
    disclaimer: '这是练习，不是检查。什么都不会保存在你的设备上。',
  },
  es: {
    title: 'Escaneo Corporal',
    lead: 'Una práctica de llevar la atención parte por parte a través del cuerpo, simplemente notando las sensaciones.',
    instruction: 'Acuéstate o siéntate <b>cómodamente</b>, con los ojos cerrados si quieres. Guiado <b>desde los pies hasta la coronilla</b>, lleva la atención a cada parte y siéntela tal como está, sin intentar cambiar nada. <b>Avanza solo</b> — nada que pulsar. No hay acierto ni error.',
    instruction_easy: 'Acuéstate o siéntate <b>cómodamente</b>, con los ojos cerrados si quieres. Siguiendo la guía <b>de los pies a la cabeza</b>, mueve la atención despacio y siente lo que haya. <b>Avanza solo</b> — no pulsas nada. Aquí no hay hacerlo bien o mal.',
    choose: 'Empezar',
    lengthTitle: '¿Cuánto tiempo?',
    lengthLead: 'Elige tu tiempo para ir despacio.',
    minutes: '{n} min',
    soundNote: 'Una voz también te guía. Puedes silenciarla cuando quieras en la pantalla de la sesión (el texto siempre queda).',
    introSpeak: 'Acuéstate o siéntate cómodamente, cierra los ojos y, por un momento, siente el peso de todo tu cuerpo apoyado.',
    p_feet: 'Lleva la atención a ambos pies. Nota cualquier sensación en las plantas y los dedos, sin intentar cambiarla.',
    p_calves: 'Pasa a las pantorrillas. Tensión, calor, o ninguna sensación — sea lo que sea, solo nótalo.',
    p_knees: 'Descansa la atención en las rodillas. Siente con suavidad el frente, la parte de atrás y alrededor de la articulación.',
    p_thighs: 'Pasa a los muslos. Nota el peso donde se apoyan y la sensación de los músculos grandes.',
    p_pelvis: 'Lleva la atención a la pelvis y las caderas. Siente cómo tu cuerpo está sostenido.',
    p_belly: 'Pasa al vientre. Siéntelo subir y bajar suavemente con cada respiración.',
    p_chest: 'Descansa la atención en el pecho. Siéntelo abrirse y cerrarse con la respiración.',
    p_hands: 'Lleva la atención a ambas manos. Siente las palmas y las yemas de los dedos, una a una.',
    p_arms: 'Pasa a los brazos. Siente todo su peso, desde las yemas hasta los hombros.',
    p_shoulders: 'Descansa la atención en los hombros. Si hay tensión, deja que se suelten al exhalar.',
    p_neck: 'Pasa al cuello. Siente con cuidado el cuello y la zona a su alrededor.',
    p_face: 'Lleva la atención a la cara. Nota la tensión en la frente, los ojos y la mandíbula, y déjala aflojar.',
    p_crown: 'Descansa la atención en la coronilla. Siente en silencio las sensaciones por toda la cabeza.',
    p_whole: 'Ahora siente todo el cuerpo a la vez. Desde los dedos de los pies hasta la coronilla, siéntelo respirar como uno solo.',
    outroSpeak: 'El escaneo ha terminado. Cuando estés listo, mueve despacio las manos y los pies, y abre suavemente los ojos.',
    soundOn: 'Sonido activado (toca para silenciar)', soundOff: 'Silenciado (toca para activar)',
    silAlt: 'figura guía de partes del cuerpo',
    doneTitle: 'Terminado',
    doneLead: 'Bien hecho. Abajo solo hay un registro de los hechos.',
    factTime: 'Tiempo juntos',
    factParts: 'Partes recorridas',
    again: 'Hacerlo otra vez',
    disclaimer: 'Esto es una práctica, no un examen. No se guarda nada en tu dispositivo.',
  },
};
