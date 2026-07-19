// blindspot/blindspot.js — 맹점 데모 "감쪽같이 사라지는 자리"(가칭). 지각 그룹D의 엔진-밖 1회성 데모.
//
// 시행(trial) 구조가 없다: 엔진의 runTask(시행-응답-판정 루프)를 쓰지 않고, core/i18n.js 의
// 언어 감지·전환·이름만 재사용해 화면 하나를 직접 그린다. 점수·시간·비교·게임화 없음.
//
// 화면: 왼쪽 십자가(+) · 오른쪽 검은 점(무채색). 간격은 화면 폭의 큰 비율(가장자리 근처) —
//   기기마다 사라지는 거리가 달라 "정확한 측정이 아니라 대략의 체험"임을 안내문에 명시.
//   배치(십자가 왼·점 오)는 오른쪽 눈용(왼눈을 가림)이 표준. 반대편 눈 토글로 좌우 반전.
//   "사라졌나요?" 예/아니오는 시행이 아니라 1회성 체크 → 곧바로 '무엇/왜' 설명으로 이어짐.
//
// accent(perception 청록 #0E7C86)는 UI(언어바·버튼·강조어)에만. 십자가·점은 검정.

import { LANG_NAMES, LANG_STORAGE_KEY, detectLang } from '../core/i18n.js';

const ACCENT = '#0E7C86';
let lang = detectLang();
let eye = 'right';   // 'right' = 오른쪽 눈으로 봄(왼눈 가림) → 십자가 왼·점 오. 'left' = 반대.
let view = 'demo';   // 'demo' | 'explain'
let sawIt = false;   // 예/아니오(설명 도입 문구만 다르게, 판정 아님)
let root = null;

const t = (k) => (STRINGS[lang] && STRINGS[lang][k]) || STRINGS.ko[k] || k;

function injectStyles() {
  if (document.getElementById('bs-style')) return;
  const el = document.createElement('style');
  el.id = 'bs-style';
  el.textContent = `
:root{--bs-accent:${ACCENT}}
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
.bs-stage{flex:1;display:flex;align-items:flex-start;justify-content:center;padding:1rem}
.bs-card{width:100%;max-width:620px;text-align:center}
.bs-title{font-size:1.5rem;margin:.3rem 0 .5rem}
.bs-lead{color:#555;margin:.2rem 0 1rem}
.bs-instruction{line-height:1.75;text-align:left;background:#eef4f3;border:1px solid #dbe9e7;
  border-radius:12px;padding:.85rem 1rem;margin:0 0 1rem}
.bs-instruction b{color:var(--bs-accent)}
/* 십자가-점 간격의 '물리적' 크기를 제한하려고 max-width 를 px 로 고정한다. 폰(좁은 화면)에선
   96vw 로 화면폭 따라 줄고, 데스크탑(넓은 화면)에선 이 상한(≈폰 물리폭)에 걸려 더 안 커진다.
   비율(vw)만 쓰면 큰 화면에서 물리 간격이 커져 사라지는 거리가 정상 시청거리를 벗어난다(데스크탑 실측 버그). */
.bs-arena{position:relative;width:96vw;max-width:400px;height:clamp(110px,26vw,150px);
  margin:1rem auto;background:#fff;border-radius:14px;box-shadow:inset 0 0 0 1px #ececec}
.bs-cross{position:absolute;top:50%;transform:translate(-50%,-50%);font-size:2.6rem;font-weight:700;color:#111;line-height:1}
.bs-dot{position:absolute;top:50%;transform:translate(-50%,-50%);width:22px;height:22px;border-radius:50%;background:#111}
.bs-note{color:#757575;font-size:.9rem;margin:.5rem 0 1.2rem;line-height:1.5}
.bs-q{font-size:1.2rem;font-weight:800;margin:.4rem 0 .7rem}
.bs-btns{display:flex;gap:.8rem;justify-content:center;margin:.4rem 0}
.bs-btn{border:none;border-radius:12px;background:var(--bs-accent);color:#fff;font-size:1.1rem;font-weight:700;
  padding:.8rem 1.4rem;min-height:3.2rem;cursor:pointer;touch-action:manipulation}
.bs-btn.ghost{background:#fff;color:var(--bs-accent);border:2px solid var(--bs-accent)}
.bs-btn:active{transform:translateY(1px)}
.bs-toggle{margin-top:1.3rem;background:none;border:none;color:var(--bs-accent);
  text-decoration:underline;font-size:.95rem;cursor:pointer;touch-action:manipulation}
.bs-explain-lead{font-size:1.1rem;font-weight:700;margin:.4rem 0 1rem}
.bs-explain{line-height:1.8;text-align:left;margin:0 0 1.4rem}
.bs-explain b{color:var(--bs-accent)}
.bs-footer{padding:.8rem 1rem;text-align:center;color:#9e9e9e;font-size:.82rem;border-top:1px solid #eee}`;
  document.head.appendChild(el);
}

function langbarHTML() {
  return Object.keys(LANG_NAMES).filter((l) => STRINGS[l])
    .map((l) => `<button class="langbtn${l === lang ? ' on' : ''}" data-lang="${l}">${LANG_NAMES[l]}</button>`).join('');
}

// 십자가·점 배치. 가장자리 근처(큰 간격)라 사라지는 거리가 자연스럽다. eye='right'면 십자가 왼·점 오.
function arenaHTML() {
  const crossLeft = eye === 'right';
  const crossPct = crossLeft ? 7 : 93;
  const dotPct = crossLeft ? 91 : 9;
  return `<div class="bs-arena" aria-hidden="true">` +
    `<div class="bs-cross" style="left:${crossPct}%">+</div>` +
    `<div class="bs-dot" style="left:${dotPct}%"></div></div>`;
}

function demoHTML() {
  return `
    <h1 class="bs-title">${t('title')}</h1>
    <p class="bs-lead">${t('lead')}</p>
    <div class="bs-instruction">${eye === 'right' ? t('howRight') : t('howLeft')}</div>
    ${arenaHTML()}
    <p class="bs-note">${t('approxNote')}</p>
    <div class="bs-q">${t('question')}</div>
    <div class="bs-btns">
      <button class="bs-btn" data-a="yes">${t('yes')}</button>
      <button class="bs-btn ghost" data-a="no">${t('no')}</button>
    </div>
    <button class="bs-toggle" data-act="toggle">${eye === 'right' ? t('toggleToLeft') : t('toggleToRight')}</button>`;
}

function explainHTML() {
  return `
    <h1 class="bs-title">${t('explainTitle')}</h1>
    <p class="bs-explain-lead">${sawIt ? t('explainYes') : t('explainNo')}</p>
    <div class="bs-explain">${t('explainBody')}</div>
    <button class="bs-btn" data-act="again">${t('tryAgain')}</button>`;
}

function render() {
  root.innerHTML = `
    <header class="bs-top"><div class="bs-langbar">${langbarHTML()}</div></header>
    <main class="bs-stage"><div class="bs-card">${view === 'demo' ? demoHTML() : explainHTML()}</div></main>
    <footer class="bs-footer">${t('disclaimer')}</footer>`;
  root.querySelectorAll('.langbtn').forEach((b) => b.addEventListener('click', () => {
    lang = b.dataset.lang; try { localStorage.setItem(LANG_STORAGE_KEY, lang); } catch {} render();
  }));
  const yes = root.querySelector('.bs-btn[data-a="yes"]');
  if (yes) yes.addEventListener('click', () => { sawIt = true; view = 'explain'; render(); });
  const no = root.querySelector('.bs-btn[data-a="no"]');
  if (no) no.addEventListener('click', () => { sawIt = false; view = 'explain'; render(); });
  const tog = root.querySelector('.bs-toggle');
  if (tog) tog.addEventListener('click', () => { eye = eye === 'right' ? 'left' : 'right'; render(); });
  const again = root.querySelector('.bs-btn[data-act="again"]');
  if (again) again.addEventListener('click', () => { view = 'demo'; render(); });
}

const STRINGS = {
  ko: {
    title: '감쪽같이 사라지는 자리',
    lead: '눈에는 아무것도 못 보는 작은 자리가 있어요. 직접 찾아봅시다.',
    howRight: '① <b>왼쪽 눈</b>을 손으로 가리고, <b>오른쪽 눈</b>으로 왼쪽의 <b>+</b>를 응시하세요.<br>② 화면을 얼굴에 가까이 댔다가 <b>천천히 멀리</b> 하면서, 오른쪽의 점을 곁눈으로 의식해 보세요.<br>③ 어느 거리에서 <b>점이 감쪽같이 사라지는</b> 순간이 있어요.',
    howLeft: '① <b>오른쪽 눈</b>을 손으로 가리고, <b>왼쪽 눈</b>으로 오른쪽의 <b>+</b>를 응시하세요.<br>② 화면을 얼굴에 가까이 댔다가 <b>천천히 멀리</b> 하면서, 왼쪽의 점을 곁눈으로 의식해 보세요.<br>③ 어느 거리에서 <b>점이 감쪽같이 사라지는</b> 순간이 있어요.',
    approxNote: '기기 화면 크기마다 사라지는 거리가 달라요. 정확한 측정이 아니라 대략의 체험입니다.',
    question: '점이 사라졌나요?',
    yes: '네, 사라졌어요',
    no: '아직요',
    toggleToLeft: '반대쪽 눈으로 해보기',
    toggleToRight: '오른쪽 눈으로 돌아가기',
    explainTitle: '방금 무슨 일이?',
    explainYes: '방금 점이 사라진 그 자리가 바로 눈의 <b>맹점</b>이에요.',
    explainNo: '거리를 조금씩 바꿔가며 다시 해보면 대부분 찾을 수 있어요. 아래는 무슨 일이 일어나는지에 대한 설명이에요.',
    explainBody: '눈 뒤쪽에서 <b>시신경이 망막을 뚫고 나가는 자리</b>에는 빛을 받아들이는 세포(광수용체)가 없어요. 그래서 바로 그 자리에 맺힌 상은 보이지 않습니다 — 그게 맹점이에요.<br><br>평소에 이 빈틈을 못 느끼는 건, 두 눈이 서로 가려 주고, 한 눈으로 볼 때도 <b>뇌가 주변 정보로 그 빈자리를 자연스럽게 채워</b> 넣기 때문이에요. 이 데모는 한 눈만 쓰고 점을 딱 그 자리에 맞춰, 평소엔 숨어 있던 빈틈을 잠깐 드러낸 거예요.',
    tryAgain: '다시 해보기',
    disclaimer: '이 데모는 검사가 아니라 체험입니다.',
  },
  en: {
    title: 'The Spot That Vanishes',
    lead: 'Your eye has a small spot that sees nothing. Let’s find it.',
    howRight: '① Cover your <b>left eye</b> with your hand and stare at the <b>+</b> on the left with your <b>right eye</b>.<br>② Hold the screen close, then <b>slowly move it away</b>, keeping the dot on the right in the corner of your eye.<br>③ At some distance the <b>dot vanishes completely</b>.',
    howLeft: '① Cover your <b>right eye</b> and stare at the <b>+</b> on the right with your <b>left eye</b>.<br>② Hold the screen close, then <b>slowly move it away</b>, keeping the dot on the left in the corner of your eye.<br>③ At some distance the <b>dot vanishes completely</b>.',
    approxNote: 'The distance where it vanishes depends on your screen size. This is a rough experience, not a precise measurement.',
    question: 'Did the dot vanish?',
    yes: 'Yes, it vanished',
    no: 'Not yet',
    toggleToLeft: 'Try the other eye',
    toggleToRight: 'Back to the right eye',
    explainTitle: 'What just happened?',
    explainYes: 'The spot where the dot vanished is your eye’s <b>blind spot</b>.',
    explainNo: 'Try again, slowly changing the distance — most people can find it. Here is what is going on.',
    explainBody: 'At the back of the eye, where the <b>optic nerve leaves the retina</b>, there are no light-sensing cells (photoreceptors). Anything whose image lands exactly there is not seen — that is the blind spot.<br><br>We normally never notice this gap: the two eyes cover for each other, and even with one eye the <b>brain quietly fills the gap with the surrounding pattern</b>. This demo uses just one eye and places the dot right on that spot, briefly revealing the gap that is usually hidden.',
    tryAgain: 'Try again',
    disclaimer: 'This is an experience, not a test.',
  },
  zh: {
    title: '悄悄消失的地方',
    lead: '你的眼睛里有一小块什么都看不见的地方。来找找看。',
    howRight: '① 用手<b>遮住左眼</b>，用<b>右眼</b>盯住左边的 <b>+</b>。<br>② 先把屏幕靠近脸，再<b>慢慢移远</b>，用余光留意右边的点。<br>③ 在某个距离，<b>那个点会完全消失</b>。',
    howLeft: '① 用手<b>遮住右眼</b>，用<b>左眼</b>盯住右边的 <b>+</b>。<br>② 先把屏幕靠近脸，再<b>慢慢移远</b>，用余光留意左边的点。<br>③ 在某个距离，<b>那个点会完全消失</b>。',
    approxNote: '消失的距离因屏幕大小而异。这是大致的体验，不是精确测量。',
    question: '点消失了吗？',
    yes: '是的，消失了',
    no: '还没',
    toggleToLeft: '换另一只眼试试',
    toggleToRight: '回到右眼',
    explainTitle: '刚才发生了什么？',
    explainYes: '点消失的那个地方，就是眼睛的<b>盲点</b>。',
    explainNo: '慢慢改变距离再试一次，大多数人都能找到。下面是原理。',
    explainBody: '在眼睛后部，<b>视神经穿出视网膜的地方</b>没有感光细胞（光感受器）。凡是成像正好落在那里的东西都看不见——这就是盲点。<br><br>平时我们察觉不到这个空缺：两只眼睛互相补上，而且即使只用一只眼，<b>大脑也会用周围的图案悄悄把空缺填上</b>。这个演示只用一只眼，把点正好放在那个位置，短暂地显出平时被隐藏的空缺。',
    tryAgain: '再试一次',
    disclaimer: '这是体验，不是检查。',
  },
  es: {
    title: 'El Punto Que Desaparece',
    lead: 'Tu ojo tiene un pequeño punto que no ve nada. Vamos a encontrarlo.',
    howRight: '① Tápate el <b>ojo izquierdo</b> con la mano y mira fijamente la <b>+</b> de la izquierda con el <b>ojo derecho</b>.<br>② Acerca la pantalla a la cara y luego <b>aléjala despacio</b>, atento al punto de la derecha con el rabillo del ojo.<br>③ A cierta distancia el <b>punto desaparece por completo</b>.',
    howLeft: '① Tápate el <b>ojo derecho</b> y mira fijamente la <b>+</b> de la derecha con el <b>ojo izquierdo</b>.<br>② Acerca la pantalla y luego <b>aléjala despacio</b>, atento al punto de la izquierda con el rabillo del ojo.<br>③ A cierta distancia el <b>punto desaparece por completo</b>.',
    approxNote: 'La distancia a la que desaparece depende del tamaño de tu pantalla. Es una experiencia aproximada, no una medición precisa.',
    question: '¿Desapareció el punto?',
    yes: 'Sí, desapareció',
    no: 'Todavía no',
    toggleToLeft: 'Probar con el otro ojo',
    toggleToRight: 'Volver al ojo derecho',
    explainTitle: '¿Qué acaba de pasar?',
    explainYes: 'El lugar donde el punto desapareció es el <b>punto ciego</b> de tu ojo.',
    explainNo: 'Inténtalo otra vez cambiando la distancia poco a poco — casi todos pueden encontrarlo. Aquí está lo que ocurre.',
    explainBody: 'En el fondo del ojo, donde el <b>nervio óptico sale de la retina</b>, no hay células sensibles a la luz (fotorreceptores). Todo lo que se proyecta justo ahí no se ve — ese es el punto ciego.<br><br>Normalmente no notamos este hueco: los dos ojos se cubren entre sí y, aun con un solo ojo, el <b>cerebro rellena el hueco con el patrón de alrededor</b> sin que te des cuenta. Esta demo usa un solo ojo y coloca el punto justo en ese lugar, revelando por un momento el hueco que suele estar oculto.',
    tryAgain: 'Intentar de nuevo',
    disclaimer: 'Esto es una experiencia, no un examen.',
  },
};

// 초기화(STRINGS 선언 뒤 — const 는 호이스팅되지 않아 render 전에 정의돼 있어야 한다).
injectStyles();
root = document.createElement('div');
root.className = 'bs-root';
document.getElementById('app').appendChild(root);
render();
