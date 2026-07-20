// time-reproduction-common/time-reproduction.js — 시간재현(재현/누르기). 청소년·성인 앱이 공유.
//
// 회색 도형이 D초 동안 보였다 사라진다 → 참가자가 "본 만큼" 버튼을 누르고 있다가 뗀다(hold).
// 재현시간(누른 시간)과 실제 D의 차이(오차)가 시간 지각을 보여준다. 정답은 없다.
//   ★착시가 아니다 — 조정법(ML·EB)이 아니라 재현, 공간이 아니라 시간. score.js 는 그대로 재사용.
//   오차 = (재현 − 실제) / 실제 (%). 부호 유지: +는 길게, −는 짧게 재현.
//   기준 간격 2/4/6초 세 개를 한 세션에 섞어 잰다 → conditionKeys 아니라 analyze 내부 group 축으로 분리
//   (비에로르트: 짧은 간격은 길게·긴 간격은 짧게 재현하는 경향 — 여러 간격이라야 보인다).
//
// conditionKeys ['input']: 재현치는 두 시각(누름·뗌)의 차이라 입력 고정지연은 상쇄되지만,
//   press/release 비대칭·누르기 운동전략이 입력수단마다 달라 시간(=측정값)을 체계적으로 밀 수 있다
//   → 세션 비교를 같은 입력끼리로 묶는다(JND·조정의 [] 논리는 "시간이 곧 측정값"이라 여기 안 통함).
//   lang 은 제외(자극이 도형·버튼뿐, 언어가 시간 측정에 개입 안 함).
// sessionAcc:()=>null + 순응 게이트(거의 즉시 뗀 시행 과반)만, 오차 크기로는 게이트 안 함.

import { runTask, QA } from '../core/engine.js';
import { errorPct, summarize, errorSparkline } from '../perception-error/score.js';

const STIM_GREY = '#6b6f76';                                  // 자극 색(중립 회색)
const INTERVAL_COLORS = ['#0E7C86', '#4FA3A8', '#93C7CB'];    // 짧은→긴 간격, 청록 명도 단계
const INTERVALS = QA ? [400, 800, 1200] : [2000, 4000, 6000]; // QA 는 시간축 축약(실초는 검사가 너무 느림; SART·ablink 선례)
const TOO_SHORT_MS = 300;                                     // 이보다 짧으면 '즉시 뗌'(안 함) — 순응 게이트용
const GETREADY_MS = 600, GAP_MS = 500;                        // 준비 대기 / 단계 사이 간격

const themeAccent = () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#0E7C86';

function injectStyles() {
  if (document.getElementById('tr-style')) return;
  const el = document.createElement('style');
  el.id = 'tr-style';
  el.textContent = `
.tr-wrap{position:relative;width:100%;min-height:56vh;display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:1.6rem;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.tr-rule{font-size:calc(1rem * var(--scale));line-height:1.5;color:var(--fg);background:#eef1f4;
  border:1px solid #dfe3e8;border-radius:12px;padding:.6rem .95rem;text-align:center;max-width:24rem}
.tr-rule b{color:var(--accent)}
.tr-stage{min-height:calc(150px * var(--scale));display:flex;align-items:center;justify-content:center}
.tr-stim{width:calc(120px * var(--scale));height:calc(120px * var(--scale));border-radius:18px;
  background:transparent;border:3px solid #cfd4da;transition:none}          /* 소거 상태 = 흐린 윤곽(자리 유지) */
.tr-stim.on{background:${STIM_GREY};border-color:${STIM_GREY}}              /* 점등 = 채운 회색(경과시간 표시 없음) */
.tr-hold{font-size:calc(1.15rem * var(--scale));font-weight:800;padding:.85rem 1.6rem;border-radius:14px;
  border:2px solid var(--accent);background:var(--accent);color:#fff;cursor:pointer;
  min-width:calc(11rem * var(--scale));touch-action:manipulation;user-select:none}
.tr-hold:active{filter:brightness(.94)}
.tr-hint{font-size:calc(.85rem * var(--scale));color:var(--muted);text-align:center}`;
  document.head.appendChild(el);
}

export function startTimeReproduction({ id, trialCap, scale = 1, accent }) {
  injectStyles();
  const CAP = QA ? 6 : trialCap;         // QA 축약: 시행 수(자극·판정·UI 불변, 시간축만 위 INTERVALS 에서 축약)
  let wrap = null, ruleEl = null, stim = null, holdBtn = null, hintEl = null;
  let seqCounter = 0;                     // QA 봇이 시행을 구분하는 시퀀스(연습 포함)

  function ensure(host) {
    if (wrap && host.contains(wrap)) return;
    host.innerHTML = '';
    wrap = document.createElement('div'); wrap.className = 'tr-wrap';
    ruleEl = document.createElement('div'); ruleEl.className = 'tr-rule';
    const stage = document.createElement('div'); stage.className = 'tr-stage';
    stim = document.createElement('div'); stim.className = 'tr-stim';
    stage.appendChild(stim);
    holdBtn = document.createElement('button'); holdBtn.type = 'button'; holdBtn.className = 'tr-hold';
    hintEl = document.createElement('div'); hintEl.className = 'tr-hint';
    wrap.append(ruleEl, stage, holdBtn, hintEl);
    host.appendChild(wrap);
  }

  async function playTrial(trial, ctx, phase) {
    const { host, t, delay } = ctx;
    ensure(host);
    hintEl.textContent = t('hint');
    holdBtn.textContent = t('holdBtn');
    const qa = QA ? { seq: ++seqCounter, phase, intervalMs: trial.intervalMs, stage: 'present', active: true } : null;
    if (qa) window.__trTrial = qa;

    // 1) 제시: 준비 → 도형 점등(intervalMs) → 소거. 버튼 숨김(그냥 보기만).
    ruleEl.innerHTML = t('ruleWatch');
    holdBtn.style.visibility = 'hidden';
    stim.classList.remove('on');
    await delay(GETREADY_MS);
    stim.classList.add('on');
    await delay(trial.intervalMs);
    stim.classList.remove('on');
    await delay(GAP_MS);

    // 2) 재현: 버튼(또는 스페이스) 누르고 있다가 뗀다. 누르는 동안 도형 점등(경과시간 단서 없음).
    ruleEl.innerHTML = t('ruleRepro');
    holdBtn.style.visibility = 'visible';
    if (qa) qa.stage = 'reproduce';

    const resp = await new Promise((resolve) => {
      let started = false, done = false, t0 = 0, itype = 'mouse';
      const start = (type) => { if (started || done) return; started = true; itype = type; t0 = performance.now(); stim.classList.add('on'); };
      const end = () => { if (!started || done) return; done = true; const ms = performance.now() - t0; stim.classList.remove('on'); cleanup(); resolve({ ms, itype }); };
      const onDown = (e) => { e.preventDefault(); start(e.pointerType || 'mouse'); };
      const onUp = () => end();
      const onKeyDown = (e) => { if ((e.code === 'Space' || e.key === ' ') && !e.repeat) { e.preventDefault(); start('keyboard'); } };
      const onKeyUp = (e) => { if (e.code === 'Space' || e.key === ' ') { e.preventDefault(); end(); } };
      function cleanup() {
        holdBtn.removeEventListener('pointerdown', onDown);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
      }
      // 뗌은 버튼 밖에서 일어나도 잡히게 window 에 건다(드래그로 버튼 벗어나도 정확).
      holdBtn.addEventListener('pointerdown', onDown);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
    });

    holdBtn.style.visibility = 'hidden';
    if (qa) qa.active = false;
    const reproMs = Math.round(resp.ms);
    const record = phase === 'main' ? {
      intervalMs: trial.intervalMs, condition: String(trial.intervalMs),
      reproMs, signedErrMs: reproMs - trial.intervalMs, errPct: errorPct(reproMs, trial.intervalMs),
      inputType: resp.itype,
    } : null;
    await delay(GAP_MS);
    return { record, outcome: { correct: true } };   // 정답 없음 — outcome 은 형식상(sessionAcc null 로 무효)
  }

  // 정적 풀: 세 간격 균형(각 CAP/3), 순서 섞기는 엔진 orderByConstraint.
  function buildMainPool() {
    const per = Math.max(1, Math.round(CAP / INTERVALS.length));
    const trials = [];
    INTERVALS.forEach((ms) => { for (let i = 0; i < per; i++) trials.push({ intervalMs: ms, condition: String(ms) }); });
    return trials;
  }

  // 연습 2: 짧은·중간 간격으로 재현 방식(누르고 있기) 익히기.
  function buildPracticePool() {
    return [INTERVALS[0], INTERVALS[1]].map((ms) => ({ intervalMs: ms, condition: String(ms) }));
  }

  function analyze(records, t) {
    const acc = themeAccent();
    const intervals = [...new Set(records.map((r) => r.intervalMs))].sort((a, b) => a - b);
    const overall = summarize(records.map((r) => r.errPct));          // 전체 부호오차(세션 그래프용 단일값)
    const perInterval = intervals.map((ms) => ({ ms, s: summarize(records.filter((r) => r.intervalMs === ms).map((r) => r.errPct)) }));
    const r1 = (v) => (v == null ? null : +v.toFixed(1));
    const sgn = (v) => (v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(1));

    // 순응 게이트: 거의 즉시 뗀(< TOO_SHORT_MS) 시행이 과반이면 note. 오차 크기·방향으로는 게이트 안 함.
    const tooShortN = records.filter((r) => r.reproMs < TOO_SHORT_MS).length;
    const tooShort = records.length >= 2 && tooShortN > records.length / 2;

    const topNotes = [t('taskNote'), t('methodNote')];
    if (tooShort) topNotes.push(t('shortReproNote'));

    if (QA) window.__trLast = {
      overall: r1(overall.mean), n: records.length, tooShort,
      byInterval: perInterval.map((p) => ({ ms: p.ms, mean: r1(p.s.mean), n: p.s.n })),
    };

    const summary = perInterval.map((p) => ({ label: t('secLabel', { s: p.ms / 1000 }), value: sgn(p.s.mean), unit: '%', count: p.s.n }));
    summary.push({ label: t('overall'), value: sgn(overall.mean), unit: '%' });
    summary.push({ label: t('trials'), value: records.length, unit: '' });

    return {
      topNotes,
      series: [{ key: 'overallBias', label: t('overall'), value: r1(overall.mean), color: acc }],  // 세션 추세=전체 1줄
      summary,
      extraHtml: errorSparkline(
        records.map((r) => ({ value: r.errPct, color: INTERVAL_COLORS[intervals.indexOf(r.intervalMs)] || acc })),
        { title: t('trend'), xLabel: t('trialAxis') },
      ),
    };
  }

  runTask({
    id, mount: 'app', scale,
    family: 'perception', accent,
    conditionKeys: ['input'], choices: [],
    practiceCount: 2,
    buildPracticePool, buildMainPool, playTrial, analyze,
    sessionAcc: () => null,
    strings: STRINGS,
  });
}

const STRINGS = {
  ko: {
    title: '느낀 만큼의 시간',
    howto: '회색 도형이 잠깐 나타났다 사라집니다. 사라진 뒤, 그것이 <b>보였던 시간만큼</b> 버튼을 누르고 계세요. 정답은 없습니다 — 느낀 만큼 누르면 됩니다.',
    ruleWatch: '얼마나 오래 보이는지 <b>잘 보세요</b>',
    ruleRepro: '본 시간만큼 <b>누르고 계세요</b>',
    holdBtn: '⏺ 누르고 있기',
    hint: '스페이스바를 눌러도 됩니다 · 본 시간만큼 누른 뒤 떼세요',
    secLabel: '{s}초 간격', overall: '전체 평균 오차', trials: '시행 수',
    trend: '이번 회차 오차(0 = 실제와 같음)', trialAxis: '시행',
    taskNote: '사람의 시간 감각은 정확한 시계가 아니라, 간격의 길이·주의·상황에 따라 체계적으로 조금씩 어긋납니다. 짧은 간격은 길게, 긴 간격은 짧게 재현하는 경향이 흔합니다. 이 오차는 누구에게나 나타나는 정상적인 특성이며, 시간 감각의 좋고 나쁨을 재는 것이 아닙니다.',
    methodNote: '오차 = (재현한 시간 − 실제 시간) ÷ 실제 시간. 양수(+)는 실제보다 길게, 음수(−)는 짧게 재현했다는 뜻입니다.',
    shortReproNote: '이 회차에는 거의 누르자마자 뗀 시행이 많아, 값을 해석하기 어렵습니다.',
  },
  en: {
    title: 'The Time You Felt',
    howto: 'A grey shape appears briefly, then disappears. After it goes, hold the button down for <b>as long as it was showing</b>. There is no right answer — just hold for as long as it felt.',
    ruleWatch: '<b>Watch</b> how long it stays',
    ruleRepro: '<b>Hold</b> for as long as it showed',
    holdBtn: '⏺ Hold',
    hint: 'You can also use the spacebar · hold, then release after that long',
    secLabel: '{s}s interval', overall: 'Overall mean error', trials: 'Trials',
    trend: 'This run’s error (0 = same as actual)', trialAxis: 'trial',
    taskNote: 'Your sense of time is not a precise clock; it drifts a little, systematically, with the length of the interval, attention, and situation. Short intervals are often reproduced as longer, and long ones as shorter. This error appears in everyone and is normal — it is not a measure of being good or bad at time.',
    methodNote: 'Error = (time you reproduced − actual time) ÷ actual time. Positive (+) means you reproduced it longer than actual, negative (−) shorter.',
    shortReproNote: 'In this run many trials were released almost immediately, so the values are hard to interpret.',
  },
  zh: {
    title: '你感受到的时间',
    howto: '灰色图形短暂出现后消失。消失后，请按住按钮<b>与它出现的时间一样长</b>。没有标准答案——按你感受到的时长即可。',
    ruleWatch: '<b>注意看</b>它出现多久',
    ruleRepro: '<b>按住</b>与它出现一样长的时间',
    holdBtn: '⏺ 按住',
    hint: '也可以用空格键 · 按住，到那么长后松开',
    secLabel: '{s}秒间隔', overall: '总体平均误差', trials: '试次数',
    trend: '本次误差（0＝与实际相同）', trialAxis: '试次',
    taskNote: '人的时间感并不是精确的钟表，而是会随间隔长短、注意力和情境系统地略有偏差。短的间隔常被再现得更长，长的被再现得更短。这种误差人人都有，是正常特性，并不代表时间感的好坏。',
    methodNote: '误差 =（你再现的时间 − 实际时间）÷ 实际时间。正数(+)表示再现得比实际长，负数(−)表示更短。',
    shortReproNote: '本次有许多试次几乎一按就松，数值难以解释。',
  },
  es: {
    title: 'El Tiempo que Sentiste',
    howto: 'Una figura gris aparece un momento y desaparece. Cuando se vaya, mantén pulsado el botón <b>tanto tiempo como estuvo visible</b>. No hay respuesta correcta — solo mantén lo que sentiste.',
    ruleWatch: '<b>Fíjate</b> cuánto dura',
    ruleRepro: '<b>Mantén pulsado</b> tanto como estuvo visible',
    holdBtn: '⏺ Mantener',
    hint: 'También puedes usar la barra espaciadora · mantén y suelta tras ese tiempo',
    secLabel: 'Intervalo de {s}s', overall: 'Error medio total', trials: 'Ensayos',
    trend: 'Error de esta ronda (0 = igual al real)', trialAxis: 'ensayo',
    taskNote: 'Tu sentido del tiempo no es un reloj preciso; se desvía un poco, de forma sistemática, según la duración del intervalo, la atención y la situación. Los intervalos cortos suelen reproducirse más largos, y los largos más cortos. Este error aparece en todo el mundo y es normal — no mide si eres bueno o malo con el tiempo.',
    methodNote: 'Error = (tiempo que reprodujiste − tiempo real) ÷ tiempo real. Positivo (+) significa que lo reprodujiste más largo que el real; negativo (−), más corto.',
    shortReproNote: 'En esta ronda muchos ensayos se soltaron casi de inmediato, así que los valores son difíciles de interpretar.',
  },
};
