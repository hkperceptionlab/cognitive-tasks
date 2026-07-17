// srt-common/srt.js — 단순 반응속도(Simple Reaction Time). 청소년·성인 앱이 공유.
//
// 판단도 선택도 없다. 회색 원이 초록으로 바뀌면 최대한 빨리 아무 곳이나 누른다.
//   · 자극 전 누름           = 조기 반응(false start) → 무효, "너무 빨랐습니다"만 짧게
//   · 반응시간 150ms 미만    = 예측 → 무효(사람 신경전달상 그보다 빠를 수 없음)
//   · 제한시간 내 안 누름     = 시간초과 → 무효
// 대기 시간은 [1000,4000]ms 무작위(리듬 예측 방지).
//
// 엔진 훅: playTrial(커스텀 구동기), conditionKeys:['input'](언어 무관), sessionAcc:null.
// 앱마다 다른 것: id, trials(시행 수), timeLimitMs, scale.

import { runTask, QA } from '../core/engine.js';

const WAIT = [1000, 4000]; // 자극 대기 무작위 범위 — 예측 방지
const MIN_RT = 150;        // 이보다 빠르면 예측 → 무효
const FB_MS = 700;         // 무효 안내(조기/시간초과) 표시 시간

function injectStyles() {
  if (document.getElementById('srt-style')) return;
  const el = document.createElement('style');
  el.id = 'srt-style';
  el.textContent = `
.srt-wrap{position:relative;width:100%;min-height:56vh;display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:1.2rem;cursor:pointer;
  touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.srt-circle{width:calc(clamp(7rem,42vw,12rem) * var(--scale));aspect-ratio:1/1;border-radius:50%;
  background:#bdbdbd;box-shadow:0 2px 12px rgba(0,0,0,.18);transition:background .04s,transform .04s}
.srt-circle.go{background:#2e9e4f;transform:scale(1.04)}
.srt-msg{min-height:1.7rem;font-size:1.1rem;font-weight:700;color:var(--muted)}
.srt-msg.warn{color:#c62828}`;
  document.head.appendChild(el);
}

export function startSRT({ id, trials, timeLimitMs, scale = 1, accent }) {
  injectStyles();
  const count = QA ? 2 : trials; // QA 축약: 시행 수만 줄임(대기·판정·UI 는 그대로)
  let wrap = null, circle = null, msg = null;

  function ensure(host) {
    if (wrap && host.contains(wrap)) return;
    host.innerHTML = '';
    wrap = document.createElement('div');
    wrap.className = 'srt-wrap';
    circle = document.createElement('div');
    circle.className = 'srt-circle';
    msg = document.createElement('div');
    msg.className = 'srt-msg';
    wrap.appendChild(circle);
    wrap.appendChild(msg);
    host.appendChild(wrap);
  }

  const pickWait = () => Math.round(WAIT[0] + Math.random() * (WAIT[1] - WAIT[0]));

  // 한 시행: 회색 대기 → 초록 자극 → 반응. 조기/예측/시간초과는 무효 처리.
  async function playTrial(trial, ctx, phase) {
    const { host, timeLimitMs: limit, t, stampAfterPaint, delay } = ctx;
    ensure(host);
    circle.classList.remove('go');
    msg.textContent = '';
    msg.classList.remove('warn');

    const outcome = await new Promise((resolve) => {
      let state = 'wait', greenT = 0, done = false, goTimer = null, limitTimer = null;
      const finish = (payload) => {
        if (done) return;
        done = true;
        wrap.removeEventListener('pointerdown', onDown);
        window.removeEventListener('keydown', onKey);
        if (goTimer) clearTimeout(goTimer);
        if (limitTimer) clearTimeout(limitTimer);
        resolve(payload);
      };
      const press = (inputType) => {
        if (state !== 'go') { finish({ kind: 'early', rt: null, inputType }); return; } // 자극 전 = 조기
        const rt = performance.now() - greenT;
        finish({ kind: rt < MIN_RT ? 'early' : 'valid', rt, inputType }); // <150 = 예측(무효)
      };
      const onDown = (e) => press(e.pointerType || 'mouse');
      const onKey = (e) => {
        if (e.repeat || ['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
        press('keyboard');
      };
      wrap.addEventListener('pointerdown', onDown);
      window.addEventListener('keydown', onKey);

      goTimer = setTimeout(async () => {
        if (done) return;
        circle.classList.add('go');
        greenT = await stampAfterPaint(); // 초록이 실제로 페인트된 뒤 시각(rAF 이중)
        state = 'go';
        limitTimer = setTimeout(() => finish({ kind: 'timeout', rt: null, inputType: null }), limit);
      }, pickWait());
    });

    // 무효(조기/시간초과)만 아주 짧게 안내 — 어디서 틀렸는지 설명 없음. 유효는 무피드백.
    circle.classList.remove('go');
    if (outcome.kind === 'early') { msg.textContent = t('tooFast'); msg.classList.add('warn'); await delay(FB_MS); }
    else if (outcome.kind === 'timeout') { msg.textContent = t('timeout'); msg.classList.add('warn'); await delay(FB_MS); }
    msg.textContent = '';
    msg.classList.remove('warn');
    await delay(300 + Math.round(Math.random() * 200)); // 시행 간 짧은 공백

    const valid = outcome.kind === 'valid';
    const record = phase === 'main'
      ? { kind: outcome.kind, rt: valid ? outcome.rt : null, valid, inputType: outcome.inputType || null }
      : null;
    return { record, outcome: { success: valid } };
  }

  const buildMainPool = () => Array.from({ length: count }, () => ({ condition: 'react' }));
  const buildPracticePool = () => [{ condition: 'react' }]; // 연습 1회(규칙만 익힘)

  const themeAccent = () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#6B2D5C';
  const median = (a) => {
    if (!a.length) return null;
    const s = a.slice().sort((x, y) => x - y);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };

  // 요약 순서 = [중앙값, 평균, 최소, 조기, 시간초과]. (qa/check.mjs 가 이 순서로 읽는다)
  function analyze(records, t) {
    const rts = records.filter((r) => r.valid && r.rt != null).map((r) => r.rt);
    const early = records.filter((r) => r.kind === 'early').length;
    const timeouts = records.filter((r) => r.kind === 'timeout').length;
    const mean = rts.length ? rts.reduce((a, b) => a + b, 0) / rts.length : null;
    const med = median(rts);
    const min = rts.length ? Math.min(...rts) : null;
    const ms = (v) => (v == null ? '—' : Math.round(v));
    return {
      topNotes: [t('taskNote')],
      // 중앙값(강조·accent)과 평균(회색)을 같은 축에 나란히 → 딴생각 한 번에 평균만 튀는 게 보인다.
      series: [
        { key: 'median', label: t('median'), value: med,  color: themeAccent(), group: 'rt' },
        { key: 'mean',   label: t('mean'),   value: mean, color: '#9e9e9e',     group: 'rt' },
      ],
      summary: [
        { label: t('median'),       value: ms(med),  unit: 'ms', count: rts.length },
        { label: t('mean'),         value: ms(mean), unit: 'ms' },
        { label: t('minRt'),        value: ms(min),  unit: 'ms' },
        { label: t('earlyCount'),   value: early,    unit: t('timesUnit') },
        { label: t('timeoutCount'), value: timeouts, unit: t('timesUnit') },
      ],
    };
  }

  runTask({
    id,
    mount: 'app',
    scale,
    family: 'speed',            // 진한 자주 (억제 파랑·기억 초록과 구분)
    accent,
    conditionKeys: ['input'],   // 언어는 이 과제와 무관 → 입력 방식만 조건
    choices: [],                // 아무 키/화면 누르기 — 커스텀 구동기가 처리
    timeLimitMs,                // 초록 후 이 시간 안에 안 누르면 시간초과(무효)
    buildPracticePool,
    buildMainPool,
    playTrial,
    analyze,
    sessionAcc: () => null,     // '정확도'가 애매 → 끔. 조기·시간초과 횟수를 요약에 직접 보여줌.
    strings: STRINGS,
  });
}

const STRINGS = {
  ko: {
    title: '단순 반응속도',
    howto: '회색 원이 <b>초록으로 바뀌면</b> 최대한 <b>빨리</b> 아무 곳이나 누르세요.<br>바뀌기 전에 누르면 무효입니다.',
    tooFast: '너무 빨랐습니다',
    median: '중앙값 반응시간',
    mean: '평균 반응시간',
    minRt: '최소 반응시간',
    earlyCount: '조기 반응',
    timeoutCount: '시간초과',
    timesUnit: '회',
    taskNote: '이 과제에는 판단이 없습니다. 그래서 여기 나온 시간이 다른 실험들의 반응시간에 전부 들어 있습니다.',
    diffInputReason: '이 과제는 색 변화에 반응하는 것이라 언어와 무관합니다. 다만 마우스는 커서를 옮길 필요가 없어도 클릭 자체가 느립니다.',
  },
  en: {
    title: 'Simple Reaction Time',
    howto: 'When the gray circle <b>turns green</b>, press anywhere as <b>fast</b> as you can.<br>Pressing before it turns green does not count.',
    tooFast: 'Too fast',
    median: 'Median RT',
    mean: 'Mean RT',
    minRt: 'Fastest RT',
    earlyCount: 'Early responses',
    timeoutCount: 'Timeouts',
    timesUnit: '',
    taskNote: 'There is no decision in this task. So the time you see here is contained inside the reaction time of every other experiment.',
    diffInputReason: 'This task is a reaction to a color change, so it does not depend on language. But a mouse click itself is slower even when you do not have to move the cursor.',
  },
  zh: {
    title: '简单反应时',
    howto: '当灰色圆圈<b>变绿</b>时，尽快按任意处。<br>变绿前按下无效。',
    tooFast: '太快了',
    median: '反应时中位数',
    mean: '反应时平均',
    minRt: '最快反应时',
    earlyCount: '过早反应',
    timeoutCount: '超时',
    timesUnit: '次',
    taskNote: '这个任务没有判断。所以这里的时间，包含在其他所有实验的反应时之中。',
    diffInputReason: '这个任务是对颜色变化做出反应，与语言无关。但即使不需要移动光标，用鼠标点击本身也更慢。',
  },
  es: {
    title: 'Tiempo de Reacción Simple',
    howto: 'Cuando el círculo gris <b>se ponga verde</b>, pulsa en cualquier lugar lo más <b>rápido</b> posible.<br>Pulsar antes no cuenta.',
    tooFast: 'Demasiado rápido',
    median: 'TR mediana',
    mean: 'TR media',
    minRt: 'TR más rápido',
    earlyCount: 'Respuestas anticipadas',
    timeoutCount: 'Tiempos agotados',
    timesUnit: '',
    taskNote: 'En esta tarea no hay ninguna decisión. Por eso el tiempo que ves aquí está dentro del tiempo de reacción de todos los demás experimentos.',
    diffInputReason: 'Esta tarea reacciona a un cambio de color, así que no depende del idioma. Pero un clic de ratón en sí es más lento aunque no tengas que mover el cursor.',
  },
};
