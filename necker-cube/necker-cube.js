// necker-cube/necker-cube.js — 네커 큐브 데모 "가만히 있는데 자꾸 뒤집히는 것"(가칭). 지각 그룹D 2번째.
//
// 맹점(blindspot/)에서 확정한 독립-데모 패턴 그대로: 시행 구조 없음, runTask 안 씀,
// core/i18n.js 의 언어 감지·전환만 재사용하고 자체 셸을 그린다. 엔진 변경 없음. 점수·시간·비교 없음.
//
// 현상: 선으로만 그린 정육면체(와이어프레임)는 어느 면이 앞인지 단서가 없어, 뇌가 두 해석 중
//   하나를 강제로 고른다. 두 해석이 대칭이라 확정하지 못하고 계속 뒤집힌다(양안정성).
//   ★ 핵심: 음영·숨은선 제거·원근 왜곡을 '일부러 안 넣어' 진짜 애매하게 만든다(단서를 넣으면 착시가 깨짐).
//   맹점('안 보이는 것')과 대비 — 여긴 다 보이는데 뇌가 '무엇을 보는지'를 확정 못 하는 것.
//
// 큐브 선(자극)은 무채색(#2b2b2b) 하드코딩. accent(perception 청록 #0E7C86)는 UI(버튼·언어탭)에만.

import { LANG_NAMES, LANG_STORAGE_KEY, detectLang } from '../core/i18n.js';

const ACCENT = '#0E7C86';
const LINE = '#2b2b2b';   // 큐브 선 — 무채색, 단서 없는 균일 두께.
let lang = detectLang();
let view = 'demo';        // 'demo' | 'explain'
let count = 0;            // 자기 보고 버튼 누른 횟수(점수 아님 — 판정 문구 금지).
let root = null;

const t = (k) => (STRINGS[lang] && STRINGS[lang][k]) || STRINGS.ko[k] || k;

// 네커 큐브 SVG: 같은 크기 정사각형 둘(하나는 왼-아래, 하나는 오른-위로 offset)을 네 모서리로 연결.
// 12개 모서리 전부 같은 두께로 그린다(숨은선 제거·음영 없음) → 어느 면이 앞인지 알 수 없어 애매하다.
function cubeSVG() {
  const L = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  // 정사각형 1(왼-아래): (25,60)-(115,60)-(115,150)-(25,150)
  // 정사각형 2(오른-위, +50,-38): (75,22)-(165,22)-(165,112)-(75,112)
  const sq1 = L(25, 60, 115, 60) + L(115, 60, 115, 150) + L(115, 150, 25, 150) + L(25, 150, 25, 60);
  const sq2 = L(75, 22, 165, 22) + L(165, 22, 165, 112) + L(165, 112, 75, 112) + L(75, 112, 75, 22);
  const conn = L(25, 60, 75, 22) + L(115, 60, 165, 22) + L(115, 150, 165, 112) + L(25, 150, 75, 112);
  return `<svg viewBox="0 0 200 180" class="nc-cube" role="img" aria-label="wireframe cube">` +
    `<g fill="none" stroke="${LINE}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${sq1}${sq2}${conn}</g></svg>`;
}

function injectStyles() {
  if (document.getElementById('nc-style')) return;
  const el = document.createElement('style');
  el.id = 'nc-style';
  el.textContent = `
:root{--nc-accent:${ACCENT}}
*{box-sizing:border-box}
html,body{margin:0}
.nc-root{min-height:100dvh;display:flex;flex-direction:column;background:#fafafa;color:#212121;
  font-family:system-ui,-apple-system,'Segoe UI',Roboto,'Noto Sans KR',sans-serif;
  padding-bottom:calc(1rem + env(safe-area-inset-bottom))}
.nc-top{padding:.7rem 1rem;display:flex;justify-content:flex-end}
.nc-langbar{display:flex;gap:.3rem;flex-wrap:wrap}
.langbtn{border:1px solid #d0d0d0;background:#fff;color:#757575;border-radius:999px;
  padding:.28rem .7rem;font-size:.82rem;font-weight:600;cursor:pointer;touch-action:manipulation}
.langbtn.on{background:var(--nc-accent);color:#fff;border-color:var(--nc-accent)}
.nc-stage{flex:1;display:flex;align-items:flex-start;justify-content:center;padding:1rem}
.nc-card{width:100%;max-width:560px;text-align:center}
.nc-title{font-size:1.5rem;margin:.3rem 0 .5rem}
.nc-lead{color:#555;margin:.2rem 0 1rem}
.nc-instruction{line-height:1.75;text-align:left;background:#eef4f3;border:1px solid #dbe9e7;
  border-radius:12px;padding:.85rem 1rem;margin:0 0 .7rem}
.nc-instruction b{color:var(--nc-accent)}
.nc-fair{color:#757575;font-size:.9rem;margin:0 0 1rem;line-height:1.5}
.nc-fair b{color:#555}
.nc-cubewrap{background:#fff;border-radius:14px;box-shadow:inset 0 0 0 1px #ececec;padding:1.2rem;margin:.4rem auto 1rem}
.nc-cube{width:min(70vw,280px);height:auto;display:block;margin:0 auto}
.nc-q{font-size:1.1rem;font-weight:800;margin:.6rem 0 .7rem}
.nc-btns{display:flex;flex-direction:column;gap:.7rem;max-width:24rem;margin:0 auto}
.nc-report{border:2px solid var(--nc-accent);background:#fff;color:var(--nc-accent);border-radius:12px;
  font-size:1.05rem;font-weight:700;padding:.8rem 1rem;min-height:3.2rem;cursor:pointer;touch-action:manipulation}
.nc-report.pressed{background:var(--nc-accent);color:#fff}
.nc-count{color:#757575;font-size:.9rem;margin:1rem 0 .4rem}
.nc-toexplain{margin-top:1.1rem;background:none;border:none;color:var(--nc-accent);
  text-decoration:underline;font-size:.98rem;cursor:pointer;touch-action:manipulation}
.nc-explain-lead{font-size:1.05rem;font-weight:700;margin:.4rem 0 1rem;line-height:1.6}
.nc-explain{line-height:1.8;text-align:left;margin:0 0 1.2rem}
.nc-explain b{color:var(--nc-accent)}
.nc-vs{line-height:1.75;text-align:left;background:#f4f1f6;border:1px solid #e6e0ec;border-radius:12px;
  padding:.8rem 1rem;margin:0 0 1.4rem}
.nc-vs b{color:var(--nc-accent)}
.nc-back{border:none;border-radius:12px;background:var(--nc-accent);color:#fff;font-size:1.05rem;font-weight:700;
  padding:.8rem 1.4rem;min-height:3.2rem;cursor:pointer;touch-action:manipulation}
.nc-footer{padding:.8rem 1rem;text-align:center;color:#9e9e9e;font-size:.82rem;border-top:1px solid #eee}`;
  document.head.appendChild(el);
}

function langbarHTML() {
  return Object.keys(LANG_NAMES).filter((l) => STRINGS[l])
    .map((l) => `<button class="langbtn${l === lang ? ' on' : ''}" data-lang="${l}">${LANG_NAMES[l]}</button>`).join('');
}

function demoHTML() {
  const countLine = count > 0 ? `<div class="nc-count">${t('countLabel').replace('{n}', count)}</div>` : '';
  return `
    <h1 class="nc-title">${t('title')}</h1>
    <p class="nc-lead">${t('lead')}</p>
    <div class="nc-instruction">${t('instruction')}</div>
    <p class="nc-fair">${t('notFair')}</p>
    <div class="nc-cubewrap">${cubeSVG()}</div>
    <div class="nc-q">${t('reportQ')}</div>
    <div class="nc-btns">
      <button class="nc-report" data-opt="a">${t('optA')}</button>
      <button class="nc-report" data-opt="b">${t('optB')}</button>
    </div>
    ${countLine}
    <button class="nc-toexplain" data-act="explain">${t('toExplain')} →</button>`;
}

function explainHTML() {
  return `
    <h1 class="nc-title">${t('explainTitle')}</h1>
    <div class="nc-explain">${t('explainBody')}</div>
    <div class="nc-vs">${t('vsBlindspot')}</div>
    <button class="nc-back" data-act="back">${t('backToDemo')}</button>`;
}

function render() {
  root.innerHTML = `
    <header class="nc-top"><div class="nc-langbar">${langbarHTML()}</div></header>
    <main class="nc-stage"><div class="nc-card">${view === 'demo' ? demoHTML() : explainHTML()}</div></main>
    <footer class="nc-footer">${t('disclaimer')}</footer>`;
  root.querySelectorAll('.langbtn').forEach((b) => b.addEventListener('click', () => {
    lang = b.dataset.lang; try { localStorage.setItem(LANG_STORAGE_KEY, lang); } catch {} render();
  }));
  if (view === 'demo') {
    // 자기 보고: 큐브를 다시 그리지 않고(관찰이 끊기지 않게) 카운트 텍스트만 갱신한다.
    root.querySelectorAll('.nc-report').forEach((b) => b.addEventListener('click', () => {
      count += 1;
      let c = root.querySelector('.nc-count');
      if (!c) { c = document.createElement('div'); c.className = 'nc-count'; root.querySelector('.nc-btns').after(c); }
      c.textContent = t('countLabel').replace('{n}', count);
      b.classList.add('pressed'); setTimeout(() => b.classList.remove('pressed'), 150);
    }));
    const ex = root.querySelector('.nc-toexplain');
    if (ex) ex.addEventListener('click', () => { view = 'explain'; render(); });
  } else {
    const back = root.querySelector('.nc-back');
    if (back) back.addEventListener('click', () => { view = 'demo'; render(); });
  }
}

const STRINGS = {
  ko: {
    title: '가만히 있는데 자꾸 뒤집히는 것',
    lead: '선으로만 그린 정육면체예요. 계속 보고 있으면 앞뒤가 저절로 뒤바뀝니다.',
    instruction: '가만히 바라보세요. 어느 순간, 앞면이라고 생각했던 면이 <b>뒤로 넘어가듯</b> 느껴질 거예요. 억지로 바꾸려 하지 말고 그냥 두면 저절로 왔다 갔다 합니다.',
    notFair: '얼마나 자주 뒤집히는지는 사람마다 다르고, <b>잘하고 못하고의 문제가 아니에요.</b>',
    reportQ: '지금 어느 면이 앞으로 보이나요?',
    optA: '왼쪽 아래 면이 앞',
    optB: '오른쪽 위 면이 앞',
    countLabel: '지금까지 {n}번 눌렀어요',
    toExplain: '무슨 일이 일어나는 걸까?',
    explainTitle: '왜 자꾸 뒤집힐까?',
    explainBody: '이 정육면체는 <b>선으로만</b> 그려서, 어느 면이 앞이고 어느 면이 뒤인지 알려 주는 단서(그림자·가려짐·원근)가 하나도 없어요. 그런데 우리 뇌는 평면 그림을 늘 입체로 해석하려 하기 때문에, <b>둘 중 하나를 골라야</b> 합니다.<br><br>문제는 두 해석이 <b>완전히 대칭</b>이라 어느 쪽도 더 그럴듯하지 않다는 거예요. 그래서 뇌가 하나로 확정하지 못하고, 잠깐 이렇게 봤다가 잠깐 저렇게 봤다가 <b>계속 왔다 갔다</b> 합니다(양안정성).',
    vsBlindspot: '앞서 본 <b>맹점</b>이 “거기엔 아예 안 보이는 것”이었다면, 네커 큐브는 반대예요 — <b>다 잘 보이는데, 뇌가 “무엇을 보고 있는지”를 확정하지 못하는 것</b>이에요.',
    backToDemo: '다시 보기',
    disclaimer: '이 데모는 검사가 아니라 체험입니다.',
  },
  en: {
    title: 'It Keeps Flipping On Its Own',
    lead: 'A cube drawn with lines only. Keep looking and its front and back swap by themselves.',
    instruction: 'Just keep looking. At some point the face you thought was in front seems to <b>fall to the back</b>. Do not force it — leave it be and it flips back and forth on its own.',
    notFair: 'How often it flips differs from person to person, and it is <b>not about being good or bad at anything.</b>',
    reportQ: 'Which face looks like the front right now?',
    optA: 'Lower-left face is front',
    optB: 'Upper-right face is front',
    countLabel: 'You have tapped {n} time(s) so far',
    toExplain: 'What is going on?',
    explainTitle: 'Why does it keep flipping?',
    explainBody: 'This cube is drawn with <b>lines only</b>, so there is not a single cue (shadow, one part hiding another, perspective) telling you which face is front and which is back. But your brain always tries to read a flat drawing as a 3-D object, so it <b>has to choose one</b> of two readings.<br><br>The catch is that the two readings are <b>perfectly symmetric</b> — neither is more plausible. So the brain never settles on one; it sees it one way for a moment, then the other, <b>going back and forth</b> (bistability).',
    vsBlindspot: 'If the <b>blind spot</b> earlier was “something you simply cannot see there,” the Necker cube is the opposite — <b>you see everything perfectly, but your brain cannot pin down what it is looking at.</b>',
    backToDemo: 'Look again',
    disclaimer: 'This is an experience, not a test.',
  },
  zh: {
    title: '明明没动却一直翻转',
    lead: '一个只用线条画的正方体。一直看着，它的前后会自己对调。',
    instruction: '静静地看着。某一刻，你以为在前面的那个面会像<b>翻到后面</b>一样。别刻意去改，放着它就会自己来回翻。',
    notFair: '翻转的频率因人而异，<b>并不是做得好不好的问题。</b>',
    reportQ: '现在哪个面看起来在前面？',
    optA: '左下的面在前',
    optB: '右上的面在前',
    countLabel: '到目前为止你按了 {n} 次',
    toExplain: '这是怎么回事？',
    explainTitle: '为什么会一直翻转？',
    explainBody: '这个正方体<b>只用线条</b>画成，没有任何线索（阴影、遮挡、透视）告诉你哪个面在前、哪个面在后。可是大脑总想把平面图看成立体，于是它<b>必须在两种解读中选一个</b>。<br><br>问题是这两种解读<b>完全对称</b>，谁也不比谁更合理。所以大脑无法定下来，一会儿这样看，一会儿那样看，<b>来回切换</b>（双稳态）。',
    vsBlindspot: '如果之前的<b>盲点</b>是“那里根本看不见”，那么内克尔立方体正相反——<b>你什么都看得清清楚楚，但大脑无法确定自己看到的是什么。</b>',
    backToDemo: '再看一次',
    disclaimer: '这是体验，不是检查。',
  },
  es: {
    title: 'Se Voltea Solo Sin Parar',
    lead: 'Un cubo dibujado solo con líneas. Si sigues mirando, su frente y su fondo se intercambian solos.',
    instruction: 'Solo sigue mirando. En algún momento la cara que creías al frente parece <b>caer hacia atrás</b>. No lo fuerces — déjalo y se voltea de un lado a otro por sí solo.',
    notFair: 'La frecuencia con que se voltea varía de una persona a otra, y <b>no se trata de hacerlo bien o mal.</b>',
    reportQ: '¿Qué cara se ve al frente ahora mismo?',
    optA: 'La cara de abajo-izquierda al frente',
    optB: 'La cara de arriba-derecha al frente',
    countLabel: 'Has pulsado {n} vez/veces hasta ahora',
    toExplain: '¿Qué está pasando?',
    explainTitle: '¿Por qué se voltea sin parar?',
    explainBody: 'Este cubo está dibujado <b>solo con líneas</b>, así que no hay ni una sola pista (sombra, una parte tapando otra, perspectiva) que diga qué cara está delante y cuál detrás. Pero tu cerebro siempre intenta leer un dibujo plano como un objeto 3-D, así que <b>tiene que elegir una</b> de dos interpretaciones.<br><br>Lo curioso es que las dos interpretaciones son <b>perfectamente simétricas</b> — ninguna es más plausible. Así que el cerebro nunca se decide: lo ve de una forma un momento y luego de la otra, <b>yendo y viniendo</b> (biestabilidad).',
    vsBlindspot: 'Si el <b>punto ciego</b> de antes era “algo que simplemente no puedes ver ahí”, el cubo de Necker es lo contrario — <b>lo ves todo perfectamente, pero tu cerebro no logra fijar qué está mirando.</b>',
    backToDemo: 'Mirar otra vez',
    disclaimer: 'Esto es una experiencia, no un examen.',
  },
};

// 초기화(STRINGS 선언 뒤 — const 는 호이스팅되지 않아 render 전에 정의돼 있어야 한다).
injectStyles();
root = document.createElement('div');
root.className = 'nc-root';
document.getElementById('app').appendChild(root);
render();
