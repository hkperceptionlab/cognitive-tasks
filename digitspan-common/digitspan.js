// digitspan-common/digitspan.js — 숫자 거꾸로(Digit Span Backward). 청소년·성인 앱이 공유.
//
// 코시와 같은 엔진 확장 훅을 그대로 쓴다:
//   · mainTrials()  = async generator (적응형 계단식, 코시와 동일 규칙)
//   · playTrial()   = 한 시행 내부(숫자 순차 표시 → 0~9 키패드로 '거꾸로' 입력)
//   · sessionAcc()  = null (스팬 과제라 정확도 개념 없음)
//
// 앱마다 다른 것: id, scale, showOn(숫자 표시 시간), gap(숫자 간 간격).
//   startDigitSpan({ id, scale, showOn, gap, accent })

import { runTask, QA } from '../core/engine.js';

const MAX_LEN = QA ? 3 : 9; // QA 축약: 적응형 최대 길이만 3으로 (판정·진행은 동일)
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// 길이 len 시행: 0~9 무작위, 단 같은 숫자 연속 금지.
function makeTrial(len) {
  const seq = [];
  let prev = -1;
  for (let i = 0; i < len; i++) {
    let d;
    do { d = Math.floor(Math.random() * 10); } while (d === prev);
    seq.push(d);
    prev = d;
  }
  return { len, sequence: seq };
}

function injectStyles() {
  if (document.getElementById('ds-style')) return;
  const el = document.createElement('style');
  el.id = 'ds-style';
  el.textContent = `
.ds-wrap{position:relative;width:min(92vw,380px);margin:0 auto;text-align:center}
.ds-display{height:calc(clamp(3.4rem,22vw,6rem) * var(--scale));display:flex;align-items:center;
  justify-content:center;font-size:calc(clamp(3rem,20vw,5.4rem) * var(--scale));font-weight:800;
  line-height:1;color:var(--accent);font-variant-numeric:tabular-nums}
.ds-pad{display:grid;grid-template-columns:repeat(3,1fr);gap:calc(.55rem * var(--scale));
  max-width:min(84vw,340px);margin:1rem auto 0}
.ds-wrap:not(.recall) .ds-pad{opacity:.3;pointer-events:none} /* 숫자 표시 중엔 키패드 클릭 무시 */
.ds-key{min-height:calc(3.2rem * var(--scale));border:none;border-radius:14px;background:#fff;
  color:var(--fg);font-size:calc(1.5rem * var(--scale));font-weight:700;cursor:pointer;
  box-shadow:0 2px 6px rgba(0,0,0,.14);touch-action:manipulation;font-variant-numeric:tabular-nums}
.ds-key:active{transform:scale(.96)}
.ds-key.k0{grid-column:2} /* 0 은 마지막 줄 가운데 */
.ds-key.hit{background:var(--accent);color:#fff}
.ds-fb{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
  font-size:min(38vw,150px);font-weight:800;pointer-events:none}
.ds-fb.ok{color:#2e7d32}
.ds-fb.no{color:#c62828}`;
  document.head.appendChild(el);
}

export function startDigitSpan({ id, scale = 1, showOn = 800, gap = 200, accent }) {
  injectStyles();
  let wrap = null, display = null, keys = [];

  function ensureBoard(host) {
    if (wrap && host.contains(wrap)) return;
    host.innerHTML = '';
    wrap = document.createElement('div');
    wrap.className = 'ds-wrap';
    display = document.createElement('div');
    display.className = 'ds-display';
    wrap.appendChild(display);
    const pad = document.createElement('div');
    pad.className = 'ds-pad';
    keys = [];
    // 1~9 그리고 0 (전화 배열: 마지막 줄 가운데 0)
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 0].forEach((n) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ds-key' + (n === 0 ? ' k0' : '');
      b.dataset.digit = n;
      b.textContent = String(n);
      pad.appendChild(b);
      keys[n] = b;
    });
    wrap.appendChild(pad);
    host.appendChild(wrap);
  }

  function clearMarks() {
    wrap.classList.remove('recall');
    display.textContent = '';
    keys.forEach((b) => b && b.classList.remove('hit'));
    wrap.querySelectorAll('.ds-fb').forEach((el) => el.remove());
  }

  // 거꾸로 입력을 순서대로 받되, 하나라도 어긋나면 즉시 실패(코시와 동일한 증분 판정).
  // target = 제시 순서를 뒤집은 배열. 되돌리기 없음(누르면 확정).
  function collectDigits(target, onTap) {
    return new Promise((resolve) => {
      const taps = [], inputs = [];
      let pos = 0;
      const onDown = (e) => {
        const d = Number(e.currentTarget.dataset.digit);
        taps.push(d);
        inputs.push(e.pointerType || 'mouse');
        const el = e.currentTarget;
        el.classList.add('hit');
        setTimeout(() => el.classList.remove('hit'), 140);
        if (onTap) onTap(taps.length);
        const stop = (success) => {
          keys.forEach((b) => b && b.removeEventListener('pointerdown', onDown));
          resolve({ success, taps, inputs });
        };
        if (d === target[pos]) { pos++; if (pos >= target.length) stop(true); }
        else stop(false);
      };
      keys.forEach((b) => b && b.addEventListener('pointerdown', onDown));
    });
  }

  const dominant = (arr) => {
    const c = {};
    arr.forEach((k) => { c[k] = (c[k] || 0) + 1; });
    let best = null, n = 0;
    for (const k in c) if (c[k] > n) { best = k; n = c[k]; }
    return best;
  };

  const END_FB_MS = 300;
  function showFeedback(success) {
    return new Promise((resolve) => {
      const fb = document.createElement('div');
      fb.className = 'ds-fb ' + (success ? 'ok' : 'no');
      fb.textContent = success ? '✓' : '✗';
      wrap.appendChild(fb);
      setTimeout(() => { fb.remove(); resolve(); }, END_FB_MS);
    });
  }

  // 한 시행: 숫자 순차 표시(다중 자극) → 거꾸로 키패드 입력(순서 다중 응답) → 판정.
  async function playTrial(trial, ctx, phase) {
    const { host, timing, t } = ctx;
    ensureBoard(host);
    clearMarks();
    const seq = trial.sequence;
    const len = seq.length;

    // 1) 기억 단계: 숫자를 하나씩 순서대로
    ctx.setProgress(() => `${t('lenLabel')} ${len} · ${t('watch')}`);
    await delay(ctx.pickMs(timing.fixation));
    for (const d of seq) {
      display.textContent = String(d);
      await delay(timing.showOn);
      display.textContent = '';
      await delay(timing.gap);
    }

    // 2) 재현 단계: 거꾸로 입력. 진행표시에 '몇 개 눌렀는지'.
    const target = seq.slice().reverse();
    const showCount = (c) => ctx.setProgress(() => `${t('recall')} · ${c} / ${len}`);
    showCount(0);
    wrap.classList.add('recall');
    const { success, inputs } = await collectDigits(target, showCount);
    wrap.classList.remove('recall');

    // 3) 종료 표시(연습·본시행 공통, 300ms): 성공=✓/실패=✗. 위치·정답 절대 노출 안 함.
    await showFeedback(success);

    await delay(ctx.pickMs(timing.isi));
    const record = phase === 'main'
      ? { length: len, success, isCorrect: success, inputType: dominant(inputs) }
      : null;
    return { record, outcome: { success } };
  }

  async function* mainTrials() {
    for (let len = 2; len <= MAX_LEN; len++) {
      let anySuccess = false;
      for (let attempt = 0; attempt < 2; attempt++) {
        const outcome = yield makeTrial(len);
        if (outcome && outcome.success) anySuccess = true;
      }
      if (!anySuccess) return;
    }
  }

  async function* practiceTrials() {
    yield makeTrial(2);
    if (!QA) yield makeTrial(2); // QA 는 연습 1회만
  }

  const themeAccent = () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#1D6F4F';

  function analyze(records, t) {
    const ok = records.filter((r) => r.success);
    const span = ok.length ? Math.max(...ok.map((r) => r.length)) : 0;
    const total = ok.length;
    return {
      summary: [
        { label: t('span'), value: span, unit: t('spanUnit') },
        { label: t('totalSuccess'), value: total, unit: t('trialsUnit') },
      ],
      series: [
        { key: 'span', label: t('span'), value: span, color: themeAccent(), group: 'span' },
      ],
      topNotes: [t('taskNote')],
    };
  }

  runTask({
    id,
    mount: 'app',
    scale,
    family: 'memory',            // 기억 계열 → 진한 초록
    accent,                      // 앱이 index.html 에서 예외 지정 시 우선
    choices: [],                 // 응답 버튼 없음 — 키패드를 host 에 직접 그림
    timing: { fixation: [400, 600], isi: [500, 700], feedbackMs: 650, showOn, gap },
    practiceTrials,
    mainTrials,
    playTrial,
    analyze,
    sessionAcc: () => null,
    strings: STRINGS,
  });
}

const STRINGS = {
  ko: {
    title: '숫자 거꾸로',
    howto: '숫자가 <b>하나씩 순서대로</b> 나옵니다.<br>끝나면 <b>거꾸로</b> 눌러 입력하세요. (예: 3·7·1 → 1·7·3)',
    lenLabel: '길이',
    watch: '순서를 기억하세요',
    recall: '거꾸로 누르세요',
    span: '역방향 숫자 스팬',
    spanUnit: '자리',
    totalSuccess: '성공한 시행',
    trialsUnit: '회',
    taskNote: '이 과제는 순서를 붙들고 있으면서 동시에 뒤집는 능력을 보여줍니다. 코시가 위치를 기억한다면, 이것은 소리를 기억합니다.',
    // 조건 안내 — 코시와 다름: 숫자는 언어무관해 보이나 속으로 되뇌는 언어는 알 수 없다.
    diffLangReason: '화면의 숫자는 언어와 무관하지만, 속으로 되뇌는 언어는 사람마다 다릅니다. 이 앱은 그것을 알 수 없습니다.',
    diffInputReason: '마우스·터치 등 입력 방식에 따라 숫자를 누르는 속도·정확도가 달라 결과에 영향을 줄 수 있습니다.',
  },
  en: {
    title: 'Digit Span Backward',
    howto: 'Digits appear <b>one at a time, in order</b>.<br>Then enter them in <b>reverse</b> order. (e.g. 3·7·1 → 1·7·3)',
    lenLabel: 'Length',
    watch: 'Remember the order',
    recall: 'Enter in reverse',
    span: 'Backward digit span',
    spanUnit: 'digits',
    totalSuccess: 'Correct trials',
    trialsUnit: '',
    taskNote: 'This task shows your ability to hold a sequence in mind and reverse it at the same time. Where Corsi remembers positions, this remembers sounds.',
    diffLangReason: 'The digits on screen are language-neutral, but the language you rehearse them in silently differs from person to person, and this app cannot know it.',
    diffInputReason: 'How you tap (mouse, touch, etc.) changes the speed and precision of entering digits, so it can affect the result.',
  },
  zh: {
    title: '倒背数字',
    howto: '数字会<b>逐个按顺序</b>出现。<br>结束后请<b>倒序</b>输入。（例：3·7·1 → 1·7·3）',
    lenLabel: '长度',
    watch: '记住顺序',
    recall: '倒序输入',
    span: '倒背数字广度',
    spanUnit: '位',
    totalSuccess: '成功的试次',
    trialsUnit: '次',
    taskNote: '这个任务展示你一边记住顺序、一边把它倒过来的能力。科西记住的是位置，而这个记住的是声音。',
    diffLangReason: '屏幕上的数字与语言无关，但每个人在心里默念时用的语言不同，本应用无法得知。',
    diffInputReason: '用鼠标还是触摸等不同输入方式，会影响输入数字的速度和准确度，可能影响结果。',
  },
  es: {
    title: 'Dígitos Inversos',
    howto: 'Los dígitos aparecen <b>uno a uno, en orden</b>.<br>Luego introdúcelos en orden <b>inverso</b>. (p. ej. 3·7·1 → 1·7·3)',
    lenLabel: 'Longitud',
    watch: 'Recuerda el orden',
    recall: 'Introduce al revés',
    span: 'Amplitud de dígitos inversa',
    spanUnit: 'dígitos',
    totalSuccess: 'Ensayos correctos',
    trialsUnit: '',
    taskNote: 'Esta tarea muestra tu capacidad de retener una secuencia y a la vez invertirla. Donde Corsi recuerda posiciones, esta recuerda sonidos.',
    diffLangReason: 'Los dígitos en pantalla no dependen del idioma, pero la lengua en la que los repites mentalmente varía de una persona a otra, y esta app no puede saberlo.',
    diffInputReason: 'Cómo tocas (ratón, táctil, etc.) cambia la velocidad y precisión al introducir los dígitos, así que puede influir en el resultado.',
  },
};
