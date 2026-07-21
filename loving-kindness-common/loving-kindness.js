// loving-kindness-common/loving-kindness.js — 자애·감사 명상(Loving-Kindness & Gratitude). 실천 계열 3번째.
// 청소년·성인 앱이 startLovingKindness(opts) 로 공유한다.
//
// 호흡세기(1번째)·바디스캔(2번째)과 같은 기준: 엔진 시행-채점 구조 안 씀(runTask 안 씀), core/i18n.js 만
// 재사용, 판정 어휘 금지, '결과' 아니라 '완료 확인', localStorage 아무것도 안 씀(언어선택 제외), 계열색
// practice 재사용. 엔진 코어는 무수정(색은 호흡세기 때 이미 등록됨).
//
// ★ 바디스캔과 같은 "자기보고 없음 → 완전 자동 진행" 패턴: 대상(이름)도 감사 내용도 입력받지 않는다.
//   전부 '마음속으로 떠올려보세요' 텍스트+TTS 안내뿐. 세션 중 사용자 조작은 음소거 토글 + (4단계에 한해)
//   건너뛰기 버튼뿐. 완료 화면도 점수·자기보고 지표 없이 총 시간·거쳐온 단계 수(5, 고정)만.
//
// ★ 시각 예외(DESIGN.md 문서화 — 앞의 두 예외와 또 다른 세 번째 근거): 연꽃은 자애의 단계 확장을
//   '펴지는 것'이라는 은유로 보여주는 진행 상태의 시각적 서사다. 호흡세기 싱잉볼('장식이지만 호흡 표시
//   기능')도, 바디스캔 실루엣('안내 자체의 기능')도 아니다. 사람 형태 아님·얼굴 없음·평면 선화(앞의 두
//   과제와 같은 원칙). 무채색 봉오리로 시작해 단계마다 꽃잎 1장씩 accent 로 열리고, 마지막 감사 단계에서는
//   다 핀 꽃의 중심부가 밝아진다(새 요소 추가 없이 기존 꽃 재활용 = '감사는 자애의 연장선').
//
// ★ 안내 전달: 바디스캔과 동일한 TTS 엔진을 그대로 재사용한다(speechSynthesis + 텍스트 동시 표시,
//   다음 단계 전환 = TTS onend 와 단계별 최소 시간 중 '더 늦은 쪽', TTS_CAP_MS 안전 상한을 처음부터 포함,
//   음성 없음·미지원·음소거는 조용히 최소 시간만으로 폴백). 첫 발화는 길이선택 클릭 핸들러 안에서 트리거.

import { LANG_NAMES, LANG_STORAGE_KEY, detectLang } from '../core/i18n.js';

const QA = (() => { try { return new URLSearchParams(location.search).get('qa') === '1'; } catch { return false; } })();

const LENGTHS = [5, 10, 15];                    // 세션 길이(분)
// 인트로(안착)·아웃트로(마무리) 예약 시간. QA 는 전환·자동종료만 빠르게 검증(구조는 실제와 동일).
const INTRO_MS = QA ? 150 : 15000;
const OUTRO_MS = QA ? 150 : 15000;
// TTS 안전 상한(바디스캔에서 도입): onend 가 유실되는 브라우저 특성(헤드리스, 긴 발화 끊김 등) 대비.
// 말하기 시작했는데 onend 가 이 시간 안에 안 오면 강제로 '끝난 것'으로 처리해 세션이 멈추지 않게 한다.
// 정상 브라우저에선 onend 가 최소시간보다 먼저 와 이 상한은 닿지 않는다('더 늦은 쪽' 규칙 유지).
const TTS_CAP_MS = QA ? 250 : 30000;

// 자애 확장 4단계 + 감사 전환 1단계 = 총 5단계. petals = 그 단계까지 누적으로 열린 꽃잎 수(0~4),
// core = 꽃 중심부 발광 여부(마지막 감사 단계에서만). skippable = 4단계(어려운 사람)만 건너뛰기 허용.
const STAGES = [
  { key: 's_self',       petals: 1, core: false },
  { key: 's_close',      petals: 2, core: false },
  { key: 's_neutral',    petals: 3, core: false },
  { key: 's_difficult',  petals: 4, core: false, skippable: true },
  { key: 's_gratitude',  petals: 4, core: true },
];

// ── 연꽃 SVG(평면 선화, 얼굴·사람 형태 없음). 봉오리(무채색)로 시작, 꽃잎 1장씩 열림, 중심부 발광 ──
const CX = 120, CY = 152;                        // 꽃 밑동(회전 중심)
const PETAL = 'M0,0 C-17,-34 -15,-74 0,-104 C15,-74 17,-34 0,0Z';        // 앞 꽃잎(끝이 위, 길이 104)
const PETAL_BACK = 'M0,0 C-21,-28 -19,-58 0,-82 C19,-58 21,-28 0,0Z';    // 뒤 꽃잎(짧고 넓음, 항상 무채색)
const FRONT_ROT = [-50, -17, 17, 50];            // 단계마다 왼→오 순서로 1장씩 accent(꽃잎 index 0~3)
const BACK_ROT = [-34, 0, 34];                   // 장식용 뒤 꽃잎(봉오리 몸통 = 항상 무채색)

// ── 앱별 옵션 + 세션 상태 ─────────────────────────────────
let appId = 'loving-kindness';
let accent = '#4A6B4D';
let toneScale = 1;
let tone = 'std';
let lang = detectLang();

let root = null;
let stage = 'intro';        // 'intro' | 'length' | 'session' | 'done'
let chosenMin = 0;          // 선택한 세션 길이(분)
let plannedTotalMs = 0;     // 계획된 총 시간(진행바·QA 표시용)
let segments = [];          // {petals, core, skippable, text:()=>string, minMs, endFrac}
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

// ── TTS (바디스캔과 동일) ───────────────────────────────────
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
  const sessionMs = QA ? (INTRO_MS + STAGES.length * 120 + OUTRO_MS) : chosenMin * 60000;
  const bodyMs = Math.max(0, sessionMs - INTRO_MS - OUTRO_MS);
  const perStage = QA ? 120 : Math.max(1, Math.round(bodyMs / STAGES.length));
  segments = [];
  segments.push({ petals: 0, core: false, skippable: false, text: () => t('introSpeak'), minMs: INTRO_MS });
  STAGES.forEach((s) => segments.push({ petals: s.petals, core: s.core, skippable: !!s.skippable, text: () => t(s.key), minMs: perStage }));
  segments.push({ petals: 4, core: true, skippable: false, text: () => t('outroSpeak'), minMs: OUTRO_MS });
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
// 4단계(어려운 사람) 건너뛰기: 현재 세그먼트를 즉시 끝내고 다음(감사)으로. 진행 중 TTS 는 중단.
function skipSegment() {
  if (!cur) return;
  const next = cur.i + 1;
  try { if (ttsAvailable()) speechSynthesis.cancel(); } catch {}
  playSegment(next);   // segToken 증가로 스킵된 세그먼트의 대기 콜백은 스테일 처리됨
}

// 현재 세그먼트를 화면에 반영(전체 재렌더 없이 in-place — 꽃 유지·집중 안 끊김).
function updateSegmentView(seg) {
  const svg = root.querySelector('.lk-lotus');
  if (svg) {
    svg.querySelectorAll('.lk-petal').forEach((p) => {
      p.classList.toggle('on', Number(p.dataset.petal) < seg.petals);
    });
    const core = svg.querySelector('.lk-core');
    if (core) core.classList.toggle('on', !!seg.core);
  }
  const guide = root.querySelector('.lk-guide');
  if (guide) guide.textContent = seg.text();
  const skip = root.querySelector('.lk-skip');
  if (skip) skip.hidden = !seg.skippable;
  const fill = root.querySelector('.lk-progress-fill');
  if (fill) { fill.style.transition = `width ${seg.minMs}ms linear`; fill.style.width = (seg.endFrac * 100) + '%'; }
}

function stopSession() {
  segToken++;                       // 대기 중인 콜백 무효화
  clearTimeout(segTimer); clearTimeout(ttsSafety); segTimer = 0; ttsSafety = 0;
  cur = null;
  try { if (ttsAvailable()) speechSynthesis.cancel(); } catch {}
}
function finishSession() { stopSession(); stage = 'done'; render(); }

// ── 연꽃 SVG(무채색 봉오리 → 단계별 꽃잎 개화 → 중심부 발광). 표정·사람 형태 없음, 평면 선화 ──
function lotusSVG() {
  const back = BACK_ROT
    .map((r) => `<path class="lk-petal-back" transform="translate(${CX} ${CY}) rotate(${r})" d="${PETAL_BACK}"/>`)
    .join('');
  const front = FRONT_ROT
    .map((r, i) => `<path class="lk-petal" data-petal="${i}" transform="translate(${CX} ${CY}) rotate(${r})" d="${PETAL}"/>`)
    .join('');
  return `<svg viewBox="0 0 240 210" class="lk-lotus" role="img" aria-label="${t('lotusAlt')}">`
    + `<ellipse class="lk-pad" cx="${CX}" cy="174" rx="62" ry="12"/>`
    + back + front
    + `<circle class="lk-core" cx="${CX}" cy="${CY}" r="21"/>`
    + `</svg>`;
}

function injectStyles() {
  if (document.getElementById('lk-style')) return;
  const el = document.createElement('style');
  el.id = 'lk-style';
  el.textContent = `
:root{--lk-accent:${accent};--lk-scale:${toneScale}}
*{box-sizing:border-box}
html,body{margin:0}
.lk-root{min-height:100dvh;display:flex;flex-direction:column;background:#fafafa;color:#212121;
  font-family:system-ui,-apple-system,'Segoe UI',Roboto,'Noto Sans KR',sans-serif;
  padding-bottom:calc(1rem + env(safe-area-inset-bottom))}
.lk-top{padding:.7rem 1rem;display:flex;justify-content:flex-end}
.lk-langbar{display:flex;gap:.3rem;flex-wrap:wrap}
.langbtn{border:1px solid #d0d0d0;background:#fff;color:#757575;border-radius:999px;
  padding:.28rem .7rem;font-size:.82rem;font-weight:600;cursor:pointer;touch-action:manipulation}
.langbtn.on{background:var(--lk-accent);color:#fff;border-color:var(--lk-accent)}
.lk-mute{margin-right:auto;border:1px solid #d0d0d0;background:#fff;border-radius:999px;
  width:2.1rem;height:2.1rem;font-size:1rem;line-height:1;cursor:pointer;padding:0;
  display:flex;align-items:center;justify-content:center;touch-action:manipulation}
.lk-mute.on{background:#eef2ee;border-color:var(--lk-accent)}
.lk-stage{flex:1;display:flex;align-items:flex-start;justify-content:center;padding:1rem}
.lk-card{width:100%;max-width:560px;text-align:center}
.lk-title{font-size:calc(1.5rem * var(--lk-scale));margin:.3rem 0 .6rem}
.lk-lead{color:#555;line-height:1.6;margin:.2rem 0 1rem}
.lk-instruction{line-height:1.75;text-align:left;background:#eef2ee;border:1px solid #dde6dd;
  border-radius:12px;padding:.9rem 1.05rem;margin:0 0 1.2rem;font-size:calc(1rem * var(--lk-scale))}
.lk-instruction b{color:var(--lk-accent)}
.lk-note{color:#888;font-size:.9rem;margin:.6rem 0 0;line-height:1.5}
.lk-primary{border:none;border-radius:12px;background:var(--lk-accent);color:#fff;
  font-size:calc(1.1rem * var(--lk-scale));font-weight:700;padding:.85rem 1.5rem;
  min-height:calc(3.2rem * var(--lk-scale));cursor:pointer;touch-action:manipulation}
.lk-primary:active{transform:translateY(1px)}
.lk-lengths{display:flex;flex-direction:column;gap:.8rem;max-width:22rem;margin:1.2rem auto 0}
.lk-len{border:2px solid var(--lk-accent);background:#fff;color:var(--lk-accent);border-radius:14px;
  font-size:calc(1.15rem * var(--lk-scale));font-weight:700;padding:1rem;min-height:3.4rem;
  cursor:pointer;touch-action:manipulation}
.lk-len:active{background:var(--lk-accent);color:#fff}
/* 세션: 연꽃 + 안내 텍스트 + (4단계) 건너뛰기 + 진행바 */
.lk-lotuswrap{margin:.2rem auto .4rem;width:min(78vw,calc(300px * var(--lk-scale)))}
.lk-lotus{width:100%;height:auto;display:block}
.lk-pad{fill:#eceeec}
.lk-petal-back{fill:#eceeec;stroke:#d8ddd8;stroke-width:1.2}
.lk-petal{fill:#e6e9e6;stroke:#c2c8c2;stroke-width:1.5;transition:fill .8s ease,fill-opacity .8s ease,stroke .8s ease}
.lk-petal.on{fill:var(--lk-accent);fill-opacity:.5;stroke:var(--lk-accent)}
.lk-core{fill:#dfe3df;stroke:#c2c8c2;stroke-width:1.5;transition:fill .8s ease,fill-opacity .8s ease,stroke .8s ease}
.lk-core.on{fill:var(--lk-accent);fill-opacity:.72;stroke:var(--lk-accent)}
.lk-guide{font-size:calc(1.15rem * var(--lk-scale));line-height:1.7;color:var(--fg,#212121);
  min-height:6.5rem;margin:.4rem auto .6rem;max-width:26rem}
.lk-skip{border:1px solid #cfd6cf;background:#fff;color:#6d7a6d;border-radius:999px;
  font-size:calc(.92rem * var(--lk-scale));font-weight:600;padding:.5rem 1.1rem;margin:0 auto 1rem;
  cursor:pointer;touch-action:manipulation}
.lk-skip[hidden]{display:none}
.lk-progress{width:100%;max-width:26rem;height:6px;background:#e6e9e6;border-radius:999px;margin:0 auto;overflow:hidden}
.lk-progress-fill{height:100%;width:0;background:var(--lk-accent);border-radius:999px}
@media (prefers-reduced-motion:reduce){.lk-petal,.lk-core{transition:none}.lk-progress-fill{transition:none!important}}
/* 완료 확인 */
.lk-facts{margin:1rem auto;max-width:24rem;text-align:left}
.lk-facts .row{display:flex;justify-content:space-between;padding:.65rem .2rem;
  border-bottom:1px solid #eee;font-size:1.05rem}
.lk-facts .row b{font-variant-numeric:tabular-nums}
.lk-footer{padding:.9rem 1rem;text-align:center;color:#9e9e9e;font-size:.82rem;border-top:1px solid #eee}`;
  document.head.appendChild(el);
}

function langbarHTML() {
  return Object.keys(LANG_NAMES).filter((l) => STRINGS[l])
    .map((l) => `<button class="langbtn${l === lang ? ' on' : ''}" data-lang="${l}">${LANG_NAMES[l]}</button>`).join('');
}

function introHTML() {
  return `
    <h1 class="lk-title">${t('title')}</h1>
    <p class="lk-lead">${t('lead')}</p>
    <div class="lk-instruction">${t('instruction')}</div>
    <button class="lk-primary" data-act="toLength">${t('choose')}</button>`;
}
function lengthHTML() {
  const btns = LENGTHS.map((m) => `<button class="lk-len" data-min="${m}">${t('minutes').replace('{n}', m)}</button>`).join('');
  return `
    <h1 class="lk-title">${t('lengthTitle')}</h1>
    <p class="lk-lead">${t('lengthLead')}</p>
    <div class="lk-lengths">${btns}</div>
    <p class="lk-note">${t('soundNote')}</p>`;
}
function sessionHTML() {
  return `
    <div class="lk-lotuswrap">${lotusSVG()}</div>
    <p class="lk-guide" aria-live="polite"></p>
    <button class="lk-skip" data-act="skip" hidden>${t('skip')}</button>
    <div class="lk-progress"><div class="lk-progress-fill"></div></div>`;
}
function doneHTML() {
  return `
    <h1 class="lk-title">${t('doneTitle')}</h1>
    <p class="lk-lead">${t('doneLead')}</p>
    <div class="lk-facts">
      <div class="row"><span>${t('factTime')}</span><b>${QA ? fmtTime(plannedTotalMs) : t('minutes').replace('{n}', chosenMin)}</b></div>
      <div class="row"><span>${t('factStages')}</span><b>${STAGES.length}</b></div>
    </div>
    <button class="lk-primary" data-act="restart">${t('again')}</button>`;
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
  // 세션 화면에선 언어바 숨김(집중 방해·재렌더 경로 제거 — 호흡세기·바디스캔과 동일 근거). 대신 음소거 토글.
  const muteBtn = inSession
    ? `<button class="lk-mute${muted ? ' on' : ''}" data-act="mute" aria-pressed="${muted}" ` +
      `aria-label="${t(muted ? 'soundOff' : 'soundOn')}" title="${t(muted ? 'soundOff' : 'soundOn')}">${muted ? '🔇' : '🔔'}</button>`
    : '';
  const langbar = inSession ? '' : `<div class="lk-langbar">${langbarHTML()}</div>`;
  root.innerHTML = `
    <header class="lk-top">${muteBtn}${langbar}</header>
    <main class="lk-stage"><div class="lk-card">${body}</div></main>
    <footer class="lk-footer">${t('disclaimer')}</footer>`;

  root.querySelectorAll('.langbtn').forEach((b) => b.addEventListener('click', () => {
    lang = b.dataset.lang; try { localStorage.setItem(LANG_STORAGE_KEY, lang); } catch {} render();
  }));

  if (stage === 'intro') {
    root.querySelector('[data-act="toLength"]').addEventListener('click', () => { stage = 'length'; render(); });
  } else if (stage === 'length') {
    root.querySelectorAll('.lk-len').forEach((b) => b.addEventListener('click', () => {
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
    const skipBtn = root.querySelector('[data-act="skip"]');
    if (skipBtn) skipBtn.addEventListener('click', () => skipSegment());
    playSegment(0);                   // 첫 발화 = 이 호출 스택(length 클릭 제스처) 안 → 자동재생 정책 충족
  } else {
    root.querySelector('[data-act="restart"]').addEventListener('click', () => {
      stopSession(); stage = 'intro'; render();
    });
  }
}

// ── 진입점 ──
export function startLovingKindness(opts = {}) {
  appId = opts.id || appId;
  accent = opts.accent || accent;
  toneScale = opts.scale || toneScale;
  tone = opts.tone || tone;
  lang = detectLang();
  stage = 'intro'; muted = false; cur = null;
  try { if (ttsAvailable()) speechSynthesis.getVoices(); } catch {} // 음성 목록 워밍(비동기 로드 유도)
  injectStyles();
  root = document.createElement('div');
  root.className = 'lk-root';
  document.getElementById('app').appendChild(root);
  render();
}

// ── 문자열(4언어). '_easy'=청소년 쉬운 말(없으면 표준 폴백). 판정 어휘 금지: 자기보고·점수 없음. ──
// 이름 등 개인정보 입력 없음 — 전부 '마음속으로만'. 4단계(어려운 사람)는 강제하지 않고 건너뛸 수 있음을 안내.
const STRINGS = {
  ko: {
    title: '자애·감사 명상',
    lead: '나 자신에서 시작해 다른 사람에게로 따뜻한 마음을 넓혀 보내고, 마지막에 오늘의 고마움을 떠올리는 연습입니다.',
    instruction: '편안히 <b>앉거나 누워</b> 눈을 감아도 좋습니다. 안내에 따라 <b>나 자신에서 시작해</b> 조금씩 넓혀 따뜻한 마음을 보내고, 마지막에는 <b>오늘 감사한 것</b>을 떠올려 봅니다. 이름을 적거나 말할 필요 없이 <b>마음속으로만</b> 떠올리면 됩니다. <b>자동으로</b> 다음으로 넘어가니 아무것도 누를 필요 없어요. 맞고 틀림은 없습니다.',
    instruction_easy: '편하게 <b>앉거나 누워</b> 눈을 감아도 돼요. 안내를 따라 <b>나에게서 시작해</b> 다른 사람에게로 따뜻한 마음을 보내고, 마지막엔 <b>고마운 것</b>을 떠올려 봐요. 아무것도 쓰거나 말하지 않고 <b>마음속으로만</b> 하면 돼요. <b>자동으로</b> 넘어가니 아무것도 안 눌러도 돼요. 잘하고 못하고는 없어요.',
    choose: '시작하기',
    lengthTitle: '얼마나 할까요?',
    lengthLead: '천천히 할 시간을 골라 주세요.',
    minutes: '{n}분',
    soundNote: '목소리로도 안내해 드려요. 소리는 세션 화면에서 언제든 끌 수 있어요(꺼도 글은 계속 보여요).',
    introSpeak: '편안한 자세로 앉거나 누워, 눈을 감아도 좋습니다. 몇 번 천천히 숨을 쉬며 지금 이 자리에 마음을 가만히 내려놓습니다.',
    s_self: '먼저 나 자신에게 따뜻한 마음을 보냅니다. 마음속으로 가만히 되뇌어 봅니다. 내가 평안하기를, 내가 건강하기를, 내가 편안하기를.',
    s_close: '이제 아끼는 사람 한 명을 마음속에 떠올립니다. 그 사람을 향해 같은 마음을 보냅니다. 그가 평안하기를, 그가 건강하기를, 그가 편안하기를.',
    s_neutral: '오늘 스쳐 지나간, 잘 알지 못하는 누군가를 떠올려 봅니다. 그 사람에게도 같은 바람을 보냅니다. 그도 평안하기를, 그도 편안하기를.',
    s_difficult: '마음이 조금 불편한 사람을 떠올려 봅니다. 어렵다면 지금은 건너뛰어도 괜찮습니다. 할 수 있는 만큼만, 그에게도 평안을 빌어 봅니다. 그도 편안해지기를.',
    s_gratitude: '이제 오늘 감사한 것 세 가지를 천천히 떠올려 봅니다. 작고 사소한 것이어도 좋습니다. 그 고마움이 마음에 머무는 것을 가만히 느껴 봅니다.',
    outroSpeak: '이 따뜻한 마음을 잠시 그대로 간직합니다. 준비가 되면 천천히 눈을 뜨고, 몸을 부드럽게 움직여 봅니다.',
    skip: '이 단계 건너뛰기',
    soundOn: '소리 켜짐 (누르면 음소거)', soundOff: '음소거됨 (누르면 소리)',
    lotusAlt: '단계에 따라 피어나는 연꽃 그림',
    doneTitle: '마쳤습니다',
    doneLead: '수고하셨어요. 아래는 사실만 담은 기록입니다.',
    factTime: '함께한 시간',
    factStages: '거쳐온 단계',
    again: '다시 하기',
    disclaimer: '이것은 검사가 아니라 연습입니다. 아무 기록도 기기에 저장되지 않습니다.',
  },
  en: {
    title: 'Loving-Kindness & Gratitude',
    lead: 'A practice of sending warmth outward — starting with yourself, widening to others, and closing with what you are grateful for today.',
    instruction: 'Sit or lie down <b>comfortably</b>, eyes closed if you like. Guided <b>from yourself outward</b>, send warm wishes step by step, and at the end bring to mind <b>what you are grateful for today</b>. No need to write or say any names — just hold them <b>in your mind</b>. It <b>moves on by itself</b> — nothing to tap. There is no right or wrong.',
    instruction_easy: 'Sit or lie down <b>comfortably</b>, eyes closed if you like. Following the guide <b>starting with yourself</b>, send warm wishes to others, and at the end think of <b>something you are thankful for</b>. Nothing to write or say — just do it <b>in your mind</b>. It <b>moves on by itself</b> — you don’t press anything. There is no good or bad here.',
    choose: 'Get started',
    lengthTitle: 'How long?',
    lengthLead: 'Choose your time to take it slowly.',
    minutes: '{n} min',
    soundNote: 'A voice guides you too. You can turn sound off anytime on the session screen (the text stays either way).',
    introSpeak: 'Sit or lie down comfortably, and close your eyes if you like. Take a few slow breaths and let your mind settle here, in this moment.',
    s_self: 'First, send warmth to yourself. Quietly repeat in your mind: may I be at peace, may I be well, may I be at ease.',
    s_close: 'Now bring to mind someone you care about. Send the same wishes toward them: may they be at peace, may they be well, may they be at ease.',
    s_neutral: 'Think of someone you barely know — someone you simply passed by today. Offer them the same wish: may they too be at peace, may they be at ease.',
    s_difficult: 'Now bring to mind someone you feel a little uneasy with. If this feels hard, it is okay to skip it for now. As much as you can, wish them peace too: may they also find ease.',
    s_gratitude: 'Now slowly bring to mind three things you are grateful for today. Small, ordinary things are just fine. Feel that gratitude quietly resting in your heart.',
    outroSpeak: 'Hold this warmth with you for a moment. When you are ready, slowly open your eyes and gently move your body.',
    skip: 'Skip this step',
    soundOn: 'Sound on (tap to mute)', soundOff: 'Muted (tap for sound)',
    lotusAlt: 'a lotus that opens as the steps go on',
    doneTitle: 'Done',
    doneLead: 'Nicely done. Below is a record of the facts only.',
    factTime: 'Time together',
    factStages: 'Steps taken',
    again: 'Do it again',
    disclaimer: 'This is a practice, not a test. Nothing is saved on your device.',
  },
  zh: {
    title: '慈心与感恩',
    lead: '从自己开始，把温暖的心意一点点扩展到别人，最后想一想今天值得感恩的事。',
    instruction: '<b>舒服地</b>坐着或躺下，愿意的话可以闭上眼。跟着引导<b>从自己开始</b>，一步步把温暖的心意送出去，最后想一想<b>今天值得感恩的事</b>。不用写下或说出任何名字，只在<b>心里</b>想着就好。它会<b>自动进入下一步</b>，不用按任何东西。没有对错。',
    instruction_easy: '<b>舒服地</b>坐着或躺下，愿意就闭上眼。跟着引导<b>先从自己开始</b>，把温暖送给别人，最后想一想<b>感谢的事</b>。什么都不用写、不用说，只在<b>心里</b>做就好。它会<b>自己往下走</b>，你什么都不用按。这里没有做得好不好。',
    choose: '开始',
    lengthTitle: '做多久？',
    lengthLead: '选一段可以慢慢来的时间。',
    minutes: '{n}分钟',
    soundNote: '也会用语音引导你。在练习画面里随时可以关声音（关了字也一直在）。',
    introSpeak: '舒服地坐着或躺下，愿意的话闭上眼睛。慢慢地呼吸几次，让心安住在此刻。',
    s_self: '先把温暖送给自己。在心里轻轻默念：愿我平安，愿我健康，愿我自在。',
    s_close: '现在想起一个你在意的人。把同样的心意送给他：愿他平安，愿他健康，愿他自在。',
    s_neutral: '想一个你并不熟识、今天只是擦身而过的人。也把同样的祝愿送给他：愿他也平安，愿他也自在。',
    s_difficult: '现在想起一个让你心里有点不舒服的人。如果觉得难，现在跳过也没关系。就在你做得到的范围里，也为他送上一份平安：愿他也能自在一些。',
    s_gratitude: '现在慢慢想起今天值得感恩的三件事。再小、再平常的事也可以。静静感受这份感谢停留在心里。',
    outroSpeak: '让这份温暖再停留一会儿。准备好之后，慢慢睁开眼睛，轻轻活动一下身体。',
    skip: '跳过这一步',
    soundOn: '声音开（点按静音）', soundOff: '已静音（点按开声）',
    lotusAlt: '随着步骤慢慢绽放的莲花图',
    doneTitle: '完成了',
    doneLead: '辛苦了。下面只是如实的记录。',
    factTime: '一起度过的时间',
    factStages: '走过的步骤',
    again: '再来一次',
    disclaimer: '这是练习，不是检查。什么都不会保存在你的设备上。',
  },
  es: {
    title: 'Bondad Amorosa y Gratitud',
    lead: 'Una práctica de enviar calidez hacia afuera: empezando por ti, ampliándola a otros, y cerrando con aquello que hoy agradeces.',
    instruction: 'Siéntate o acuéstate <b>cómodamente</b>, con los ojos cerrados si quieres. Guiado <b>empezando por ti mismo</b>, envía buenos deseos poco a poco, y al final trae a la mente <b>lo que hoy agradeces</b>. No hace falta escribir ni decir ningún nombre — solo tenlos <b>en tu mente</b>. <b>Avanza solo</b> — nada que pulsar. No hay acierto ni error.',
    instruction_easy: 'Siéntate o acuéstate <b>cómodamente</b>, con los ojos cerrados si quieres. Siguiendo la guía <b>empezando por ti</b>, envía calidez a otros, y al final piensa en <b>algo que agradeces</b>. Nada que escribir ni decir — solo hazlo <b>en tu mente</b>. <b>Avanza solo</b> — no pulsas nada. Aquí no hay hacerlo bien o mal.',
    choose: 'Empezar',
    lengthTitle: '¿Cuánto tiempo?',
    lengthLead: 'Elige tu tiempo para ir despacio.',
    minutes: '{n} min',
    soundNote: 'Una voz también te guía. Puedes silenciarla cuando quieras en la pantalla de la sesión (el texto siempre queda).',
    introSpeak: 'Siéntate o acuéstate cómodamente, y cierra los ojos si quieres. Respira despacio unas veces y deja que tu mente se asiente aquí, en este momento.',
    s_self: 'Primero, envíate calidez a ti mismo. Repite en silencio en tu mente: que esté en paz, que esté bien, que esté tranquilo.',
    s_close: 'Ahora trae a la mente a alguien que te importa. Envíale los mismos deseos: que esté en paz, que esté bien, que esté tranquilo.',
    s_neutral: 'Piensa en alguien que apenas conoces, alguien con quien solo te cruzaste hoy. Ofrécele el mismo deseo: que también esté en paz, que esté tranquilo.',
    s_difficult: 'Ahora trae a la mente a alguien con quien te sientes algo incómodo. Si esto se siente difícil, está bien saltarlo por ahora. En la medida que puedas, deséale paz también: que él también encuentre tranquilidad.',
    s_gratitude: 'Ahora, despacio, trae a la mente tres cosas que agradeces hoy. Las cosas pequeñas y sencillas también valen. Siente esa gratitud descansando en tu corazón.',
    outroSpeak: 'Guarda esta calidez contigo un momento. Cuando estés listo, abre despacio los ojos y mueve suavemente el cuerpo.',
    skip: 'Saltar este paso',
    soundOn: 'Sonido activado (toca para silenciar)', soundOff: 'Silenciado (toca para activar)',
    lotusAlt: 'una flor de loto que se abre a medida que avanzan los pasos',
    doneTitle: 'Terminado',
    doneLead: 'Bien hecho. Abajo solo hay un registro de los hechos.',
    factTime: 'Tiempo juntos',
    factStages: 'Pasos recorridos',
    again: 'Hacerlo otra vez',
    disclaimer: 'Esto es una práctica, no un examen. No se guarda nada en tu dispositivo.',
  },
};
