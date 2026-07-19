// afterimage/afterimage.js — 잔상(negative afterimage) 데모 "눈이 지쳐서 보이는 색"(가칭). 지각 그룹D 3번째.
//
// 맹점·네커 큐브에서 확정한 독립-데모 패턴 그대로: 시행 구조 없음, runTask 안 씀, core/i18n.js 만
// 재사용하고 자체 셸을 그린다. 엔진 변경 없음. 점수·시간-능력·비교·게임화·정답/오답 문구 없음.
//
// ★ 색 원칙 예외(의도적): 다른 과제는 '자극=무채색, accent=UI'였지만, 이 데모는 '색 자체가 자극'이라
//   응시 패치(빨강·초록·파랑)를 채도 높은 실제 색으로 하드코딩한다 — UI 장식이 아니라 측정 대상.
//   accent(perception 청록 #0E7C86)는 버튼·언어탭 같은 UI 에만 그대로 쓴다.
//
// 현상: 채도 높은 색을 오래 응시 → 그 색 원추세포가 피로(순응) → 흰/회색을 보면 피로/비피로 세포의
//   반응 차이를 뇌가 '반대색'으로 해석(대립과정). 맹점(물리적 빈틈)·네커(해석 모호)와 또 다른 결 =
//   '감각기관 자체가 시간에 따라 반응을 바꾸는 것'(순응/피로) — 설명 섹션에서 셋을 나란히 대비.

import { LANG_NAMES, LANG_STORAGE_KEY, detectLang } from '../core/i18n.js';

const ACCENT = '#0E7C86';
const GRAY = '#d9d9d9';   // 관찰 단계 배경(중간 밝기 회색 — 잔상이 잘 보이는 톤).
const QA = new URLSearchParams(location.search).get('qa') === '1';
const FIXATE_MS = QA ? 800 : 15000; // 응시 15초(QA는 0.8초로 전환만 빠르게 검증 — 판정·자극 불변).
// 채도 높은 자극 색(예외) + 보고용 보색 키.
const COLORS = {
  red:   { hex: '#ff0000', comp: 'cyan' },
  green: { hex: '#00b200', comp: 'magenta' },
  blue:  { hex: '#0a1aff', comp: 'yellow' },
};

let lang = detectLang();
let stage = 'select';     // 'select' | 'fixate' | 'observe' | 'explain'
let color = 'red';
let root = null, timerRAF = 0;

const t = (k) => (STRINGS[lang] && STRINGS[lang][k]) || STRINGS.ko[k] || k;

function injectStyles() {
  if (document.getElementById('ai-style')) return;
  const el = document.createElement('style');
  el.id = 'ai-style';
  el.textContent = `
:root{--ai-accent:${ACCENT}}
*{box-sizing:border-box}
html,body{margin:0}
.ai-root{min-height:100dvh;display:flex;flex-direction:column;background:#fafafa;color:#212121;
  font-family:system-ui,-apple-system,'Segoe UI',Roboto,'Noto Sans KR',sans-serif;
  padding-bottom:calc(1rem + env(safe-area-inset-bottom))}
.ai-top{padding:.7rem 1rem;display:flex;justify-content:flex-end}
.ai-langbar{display:flex;gap:.3rem;flex-wrap:wrap}
.langbtn{border:1px solid #d0d0d0;background:#fff;color:#757575;border-radius:999px;
  padding:.28rem .7rem;font-size:.82rem;font-weight:600;cursor:pointer;touch-action:manipulation}
.langbtn.on{background:var(--ai-accent);color:#fff;border-color:var(--ai-accent)}
.ai-stage{flex:1;display:flex;align-items:flex-start;justify-content:center;padding:1rem}
.ai-card{width:100%;max-width:560px;text-align:center}
.ai-title{font-size:1.5rem;margin:.3rem 0 .5rem}
.ai-lead{color:#555;margin:.2rem 0 1rem;line-height:1.6}
.ai-instruction{line-height:1.7;text-align:left;background:#eef4f3;border:1px solid #dbe9e7;
  border-radius:12px;padding:.85rem 1rem;margin:0 0 1.2rem}
.ai-instruction b{color:var(--ai-accent)}
/* 색 선택 스와치 — 자극색(채도 높은 실제 색). */
.ai-swatches{display:flex;gap:1rem;justify-content:center;flex-wrap:wrap;margin:.6rem 0}
.ai-color{border:none;border-radius:14px;width:calc(28vw);max-width:120px;height:calc(28vw);max-height:120px;
  cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.18);touch-action:manipulation}
.ai-color:active{transform:scale(.96)}
.ai-swatch-labels{display:flex;gap:1rem;justify-content:center;flex-wrap:wrap;margin:.2rem 0 0;color:#555;font-size:.9rem}
.ai-swatch-labels span{width:calc(28vw);max-width:120px;text-align:center}
/* 응시/관찰 공유 패치 — in-place 로 배경만 색↔회색 (재렌더 없이, 흰 프레임 방지). 고정점 유지. */
.ai-patch{width:min(80vw,320px);height:min(80vw,320px);border-radius:12px;margin:1.2rem auto;
  display:flex;align-items:center;justify-content:center}
.ai-fix{font-size:2rem;font-weight:800;color:#222;line-height:1}
.ai-hint{font-weight:700;font-size:1.1rem;margin:.4rem 0}
.ai-bar{width:min(80vw,320px);height:10px;border-radius:999px;background:#e4e4e4;margin:.6rem auto 0;overflow:hidden}
.ai-bar-fill{height:100%;width:0%;background:var(--ai-accent);border-radius:999px}
.ai-q{font-size:1.15rem;font-weight:800;margin:.6rem 0 .7rem}
.ai-btns{display:flex;flex-direction:column;gap:.6rem;max-width:22rem;margin:0 auto}
.ai-report{border:2px solid var(--ai-accent);background:#fff;color:var(--ai-accent);border-radius:12px;
  font-size:1.02rem;font-weight:700;padding:.75rem 1rem;min-height:3rem;cursor:pointer;touch-action:manipulation}
.ai-report.soft{border-color:#c9c9c9;color:#777}
.ai-report:active{transform:translateY(1px)}
.ai-explain-body{line-height:1.8;text-align:left;margin:0 0 1.1rem}
.ai-explain-body b{color:var(--ai-accent)}
.ai-honesty{color:#757575;font-size:.92rem;line-height:1.6;text-align:left;margin:0 0 1rem}
.ai-honesty b{color:#555}
.ai-vs{line-height:1.75;text-align:left;background:#f4f1f6;border:1px solid #e6e0ec;border-radius:12px;
  padding:.8rem 1rem;margin:0 0 1.4rem}
.ai-vs b{color:var(--ai-accent)}
.ai-back{border:none;border-radius:12px;background:var(--ai-accent);color:#fff;font-size:1.05rem;font-weight:700;
  padding:.8rem 1.4rem;min-height:3.2rem;cursor:pointer;touch-action:manipulation}
.ai-footer{padding:.8rem 1rem;text-align:center;color:#9e9e9e;font-size:.82rem;border-top:1px solid #eee}`;
  document.head.appendChild(el);
}

function langbarHTML() {
  return Object.keys(LANG_NAMES).filter((l) => STRINGS[l])
    .map((l) => `<button class="langbtn${l === lang ? ' on' : ''}" data-lang="${l}">${LANG_NAMES[l]}</button>`).join('');
}

function selectHTML() {
  const sw = Object.keys(COLORS).map((c) => `<button class="ai-color" data-c="${c}" style="background:${COLORS[c].hex}" aria-label="${t('color_' + c)}"></button>`).join('');
  const labels = Object.keys(COLORS).map((c) => `<span>${t('color_' + c)}</span>`).join('');
  return `
    <h1 class="ai-title">${t('title')}</h1>
    <p class="ai-lead">${t('selectLead')}</p>
    <div class="ai-instruction">${t('selectInstruction')}</div>
    <div class="ai-swatches">${sw}</div>
    <div class="ai-swatch-labels">${labels}</div>`;
}

// 응시(fixate)와 관찰(observe)은 같은 .ai-patch 를 공유한다. fixate 로 그리고, 타이머 끝나면
// 재렌더 없이 배경색만 회색으로 바꾸고 컨트롤만 교체한다(고정점·패치 DOM 유지 → 흰 프레임 없음).
function fixateHTML() {
  return `
    <div class="ai-patch" style="background:${COLORS[color].hex}"><div class="ai-fix">+</div></div>
    <div class="ai-controls">
      <div class="ai-hint">${t('fixateHint')}</div>
      <div class="ai-bar"><div class="ai-bar-fill"></div></div>
    </div>`;
}
function observeControlsHTML() {
  return `
    <div class="ai-q">${t('observeQ')}</div>
    <div class="ai-btns">
      <button class="ai-report" data-r="cyan">${t('report_cyan')}</button>
      <button class="ai-report" data-r="magenta">${t('report_magenta')}</button>
      <button class="ai-report" data-r="yellow">${t('report_yellow')}</button>
      <button class="ai-report soft" data-r="unsure">${t('report_unsure')}</button>
      <button class="ai-report soft" data-r="none">${t('report_none')}</button>
    </div>`;
}
function observeHTML() { // 언어 전환 등으로 observe 를 통째로 그릴 때(이미 회색이라 색 깜빡임 없음)
  return `<div class="ai-patch" style="background:${GRAY}"><div class="ai-fix">+</div></div>` +
    `<div class="ai-controls">${observeControlsHTML()}</div>`;
}
function explainHTML() {
  return `
    <h1 class="ai-title">${t('explainTitle')}</h1>
    <div class="ai-explain-body">${t('explainBody')}</div>
    <p class="ai-honesty">${t('honestyNote')}</p>
    <div class="ai-vs">${t('vsPrevious')}</div>
    <button class="ai-back" data-act="restart">${t('tryAgain')}</button>`;
}

function transitionToObserve() {
  // 재렌더 금지 — 패치 배경만 회색으로, 컨트롤만 교체(고정점 그대로, 흰 프레임 없음).
  stage = 'observe';
  const patch = root.querySelector('.ai-patch');
  const controls = root.querySelector('.ai-controls');
  if (patch) patch.style.background = GRAY;
  if (controls) { controls.innerHTML = observeControlsHTML(); bindReports(controls); }
}

function bindReports(scope) {
  scope.querySelectorAll('.ai-report').forEach((b) => b.addEventListener('click', () => { stage = 'explain'; render(); }));
}

function startTimer() {
  const fill = root.querySelector('.ai-bar-fill');
  const start = performance.now();
  const tick = (now) => {
    const p = Math.min(1, (now - start) / FIXATE_MS);
    if (fill) fill.style.width = (p * 100) + '%';
    if (p < 1) timerRAF = requestAnimationFrame(tick);
    else { timerRAF = 0; transitionToObserve(); }
  };
  timerRAF = requestAnimationFrame(tick);
}

function render() {
  if (timerRAF) { cancelAnimationFrame(timerRAF); timerRAF = 0; }
  let body;
  if (stage === 'select') body = selectHTML();
  else if (stage === 'fixate') body = fixateHTML();
  else if (stage === 'observe') body = observeHTML();
  else body = explainHTML();
  root.innerHTML = `
    <header class="ai-top"><div class="ai-langbar">${langbarHTML()}</div></header>
    <main class="ai-stage"><div class="ai-card">${body}</div></main>
    <footer class="ai-footer">${t('disclaimer')}</footer>`;
  root.querySelectorAll('.langbtn').forEach((b) => b.addEventListener('click', () => {
    lang = b.dataset.lang; try { localStorage.setItem(LANG_STORAGE_KEY, lang); } catch {} render();
  }));
  if (stage === 'select') {
    root.querySelectorAll('.ai-color').forEach((b) => b.addEventListener('click', () => { color = b.dataset.c; stage = 'fixate'; render(); }));
  } else if (stage === 'fixate') {
    startTimer();
  } else if (stage === 'observe') {
    bindReports(root);
  } else {
    const back = root.querySelector('.ai-back');
    if (back) back.addEventListener('click', () => { stage = 'select'; render(); });
  }
}

const STRINGS = {
  ko: {
    title: '눈이 지쳐서 보이는 색',
    selectLead: '한 가지 색을 한참 응시했다가 회색 화면을 보면, 원래 색의 <b>반대색</b>이 잠깐 떠올라요. 색 하나를 골라 직접 해봅시다.',
    selectInstruction: '아래에서 응시할 색을 하나 고르세요. 고른 뒤 나오는 <b>가운데 점</b>을 눈을 움직이지 말고 계속 바라보는 게 중요해요.',
    color_red: '빨강', color_green: '초록', color_blue: '파랑',
    fixateHint: '가운데 + 를 계속 응시하세요',
    observeQ: '지금 가운데에 무슨 색이 보이나요?',
    report_cyan: '청록(시안) 기운이 보여요',
    report_magenta: '분홍/마젠타 기운이 보여요',
    report_yellow: '노랑 기운이 보여요',
    report_unsure: '잘 모르겠어요',
    report_none: '아무 색도 안 보여요',
    explainTitle: '왜 반대색이 보일까?',
    explainBody: '한 가지 색을 오래 보면, 그 색을 감지하는 <b>원추세포가 지쳐서(순응)</b> 반응이 약해져요. 그 상태에서 흰색·회색을 보면 지친 세포와 안 지친 세포의 <b>반응 차이</b>가 남는데, 우리 시각은 색을 “빨강↔초록”, “파랑↔노랑” 같은 <b>반대쌍</b>으로 처리하기 때문에, 그 차이가 원래 색의 <b>반대색</b>으로 느껴집니다(대립과정 이론).',
    honestyNote: '이때 보이는 색은 사람마다 조금씩 다르게 느껴지고, 화면 밝기나 개인차에 따라 <b>잘 안 보일 수도 있어요.</b> 안 보인다고 이상한 게 아니에요.',
    vsPrevious: '<b>맹점</b>은 “거기에 정보가 없어서”(물리적 빈틈), <b>네커 큐브</b>는 “정보가 애매해서”(해석의 모호함) 생겼죠. 잔상은 또 다른 결이에요 — <b>눈의 감각세포 자체가 시간이 지나며 반응을 바꾸는 것</b>(순응·피로)입니다.',
    tryAgain: '다른 색으로 다시',
    disclaimer: '이 데모는 검사가 아니라 체험입니다.',
  },
  en: {
    title: 'The Color From Tired Eyes',
    selectLead: 'Stare at one color for a while, then look at gray, and the <b>opposite color</b> briefly appears. Pick a color and try it.',
    selectInstruction: 'Choose a color to stare at below. Afterwards, keep looking at the <b>dot in the center</b> without moving your eyes — that part matters.',
    color_red: 'Red', color_green: 'Green', color_blue: 'Blue',
    fixateHint: 'Keep staring at the + in the center',
    observeQ: 'What color do you see in the center now?',
    report_cyan: 'A cyan / teal tint',
    report_magenta: 'A pink / magenta tint',
    report_yellow: 'A yellow tint',
    report_unsure: 'Not sure',
    report_none: 'No color at all',
    explainTitle: 'Why do you see the opposite color?',
    explainBody: 'Staring at one color <b>tires the cone cells</b> that detect it (adaptation), so their response weakens. When you then look at white or gray, a <b>difference remains</b> between the tired and the un-tired cells. Because vision handles color in <b>opposing pairs</b> — red↔green, blue↔yellow — that difference is felt as the <b>opposite</b> of the original color (opponent-process theory).',
    honestyNote: 'The color you see feels a bit different for each person, and depending on screen brightness and individual differences it <b>may not show up well.</b> Not seeing it is nothing to worry about.',
    vsPrevious: 'The <b>blind spot</b> came from “no information there” (a physical gap); the <b>Necker cube</b> from “ambiguous information” (an unstable reading). The afterimage is a third kind — <b>the sensing cells of the eye themselves change their response over time</b> (adaptation / fatigue).',
    tryAgain: 'Try another color',
    disclaimer: 'This is an experience, not a test.',
  },
  zh: {
    title: '眼睛累了才看见的颜色',
    selectLead: '盯着一种颜色看一会儿，再看灰色屏幕，就会短暂浮现出原色的<b>相反色</b>。选一个颜色亲自试试。',
    selectInstruction: '在下面选一种要盯着看的颜色。之后请盯住出现的<b>中间那个点</b>，眼睛不要移动——这一点很重要。',
    color_red: '红', color_green: '绿', color_blue: '蓝',
    fixateHint: '一直盯住中间的 +',
    observeQ: '现在中间看到了什么颜色？',
    report_cyan: '有青色的感觉',
    report_magenta: '有粉/品红的感觉',
    report_yellow: '有黄色的感觉',
    report_unsure: '说不清',
    report_none: '什么颜色都没看到',
    explainTitle: '为什么会看到相反色？',
    explainBody: '长时间盯着一种颜色，会让感知它的<b>视锥细胞变累（适应）</b>，反应变弱。此时再看白色或灰色，累了的细胞和没累的细胞之间会留下<b>反应差</b>。而视觉是按“红↔绿”“蓝↔黄”这样的<b>对立成对</b>来处理颜色的，于是这个差被感觉成原色的<b>相反色</b>（对立过程理论）。',
    honestyNote: '这时看到的颜色因人而异，而且根据屏幕亮度和个人差异，<b>也可能不太看得出来。</b>看不到并不奇怪。',
    vsPrevious: '<b>盲点</b>是“那里没有信息”（物理空缺），<b>内克尔立方体</b>是“信息含糊”（解读不定）。余像是第三种——<b>眼睛的感光细胞本身随时间改变了反应</b>（适应／疲劳）。',
    tryAgain: '换个颜色再来',
    disclaimer: '这是体验，不是检查。',
  },
  es: {
    title: 'El Color de los Ojos Cansados',
    selectLead: 'Mira fijamente un color un rato y luego mira gris: aparece brevemente el <b>color opuesto</b> del original. Elige un color y pruébalo.',
    selectInstruction: 'Elige abajo un color para mirar. Después, mantén la vista en el <b>punto del centro</b> sin mover los ojos — esa parte importa.',
    color_red: 'Rojo', color_green: 'Verde', color_blue: 'Azul',
    fixateHint: 'Sigue mirando el + del centro',
    observeQ: '¿Qué color ves ahora en el centro?',
    report_cyan: 'Un tono cian / turquesa',
    report_magenta: 'Un tono rosa / magenta',
    report_yellow: 'Un tono amarillo',
    report_unsure: 'No estoy seguro',
    report_none: 'Ningún color',
    explainTitle: '¿Por qué ves el color opuesto?',
    explainBody: 'Mirar un color fijamente <b>cansa las células cono</b> que lo detectan (adaptación) y su respuesta se debilita. Al mirar luego blanco o gris, queda una <b>diferencia</b> entre las células cansadas y las que no. Como la visión procesa el color en <b>pares opuestos</b> — rojo↔verde, azul↔amarillo —, esa diferencia se siente como el <b>opuesto</b> del color original (teoría del proceso oponente).',
    honestyNote: 'El color que ves se siente un poco distinto en cada persona y, según el brillo de la pantalla y las diferencias individuales, <b>puede que no se vea bien.</b> No verlo no tiene nada de raro.',
    vsPrevious: 'El <b>punto ciego</b> venía de “no hay información ahí” (un hueco físico); el <b>cubo de Necker</b>, de “información ambigua” (una lectura inestable). La posimagen es un tercer tipo — <b>las propias células sensoras del ojo cambian su respuesta con el tiempo</b> (adaptación / fatiga).',
    tryAgain: 'Probar otro color',
    disclaimer: 'Esto es una experiencia, no un examen.',
  },
};

// 초기화(STRINGS 선언 뒤 — const 는 호이스팅되지 않아 render 전에 정의돼 있어야 한다).
injectStyles();
root = document.createElement('div');
root.className = 'ai-root';
document.getElementById('app').appendChild(root);
render();
