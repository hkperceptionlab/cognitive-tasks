// ebbinghaus-common/ebbinghaus.js — 에빙하우스 착시(조정법). 청소년·성인 앱이 공유.
//
// 왼쪽: 표준 = 가운데 원(●) + 둘러싼 6개 유도원(착시유발자, 지름 고정·회차마다 지터).
// 오른쪽: 비교 = 원 하나(중립, 둘러싼 원 없음). −/+(또는 방향키)로 지름을 조절해
//   "왼쪽 가운데 원과 같은 크기"로 맞춘다. 정답은 없다. 뮐러-라이어와 같은 조정법·score.js 재사용.
//   오차 = (맞춘 지름 − 실제 지름) / 실제 지름 (%). 부호 유지: +는 크게, −는 작게 맞춤.
//   맥락(작은/큰 유도원)은 시행 내 조건 → analyze 에서 series 두 줄로 분리(뮐러-라이어 핀조건과 동형).
//
// 확장 지점만 사용(엔진 무수정): 커스텀 playTrial + 정적 buildMainPool + analyze +
//   sessionAcc:()=>null(착시는 크게 속는 게 정상). conditionKeys []: 스텝 조정이라 입력수단이
//   정밀도에 개입할 원리적 경로 없음. 자극(원)은 전부 무채색, accent 는 UI 전용.

import { runTask, QA } from '../core/engine.js';
import { errorPct, summarize, errorSparkline } from '../perception-error/score.js';

const CIRC_GREY = '#6b6f76';           // 자극 색(중립 회색, JND 원·ML 선과 동일)
const LARGE_COLOR = '#6FB3B8';         // '큰 원 맥락' 계열색(청록 밝은 톤) — accent(#0E7C86)와 구분
const CY = 125, STD_CX = 132, COMP_CX = 382;        // viewBox 0 0 490 250 기준 좌표(좌우 배치)
const N_INDUCER = 6;                   // 유도원 개수(두 맥락 고정 — 크기·거리만 조작, 개수 혼입 배제)
const STEP = 3;                        // 한 번 누를 때 반지름 변화(입력수단 무관 고정)
const STD_R_MIN = 20, STD_R_MAX = 28;  // 표준 가운데 원 반지름 지터
const COMP_R_MIN = 12, COMP_R_MAX = 60;// 비교 원 반지름 조절 한계(viewBox 안·표준과 안 겹침)
// 유도원 반지름은 표적 지터[20,28]과 확실히 분리해야 착시가 뒤집히지 않는다:
//   작은 유도원 8(< 20) / 큰 유도원 34(> 28). 링 간격도 각각 다르게(작은 유도원 가까이·큰 유도원 멀리).
const INDUCER_R = { small: 8, large: 34 }, RING_GAP = { small: 8, large: 18 };

const themeAccent = () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#0E7C86';
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rand = (a, b) => a + Math.random() * (b - a);
const circle = (cx, cy, r) => `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r}" fill="${CIRC_GREY}"/>`;

// 표준: 가운데 원 + 유도원 링. ctx='small'(작은 유도원 가까이=커 보임) / 'large'(큰 유도원 멀리=작아 보임).
function standardSVG(stdR, ctx) {
  const inducerR = INDUCER_R[ctx];
  const ringR = stdR + inducerR + RING_GAP[ctx];                 // 유도원이 가운데 원과 안 겹치게 gap 확보
  let s = circle(STD_CX, CY, stdR);
  for (let i = 0; i < N_INDUCER; i++) {
    const a = (-90 + i * (360 / N_INDUCER)) * Math.PI / 180;     // 하나를 12시 방향부터
    s += circle(STD_CX + ringR * Math.cos(a), CY + ringR * Math.sin(a), inducerR);
  }
  return s;
}
const comparisonSVG = (compR) => circle(COMP_CX, CY, compR);      // 중립(둘러싼 원 없음)

function injectStyles() {
  if (document.getElementById('eb-style')) return;
  const el = document.createElement('style');
  el.id = 'eb-style';
  el.textContent = `
.eb-wrap{position:relative;width:100%;min-height:56vh;display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:1.4rem;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.eb-rule{font-size:calc(1rem * var(--scale));line-height:1.5;color:var(--fg);background:#eef1f4;
  border:1px solid #dfe3e8;border-radius:12px;padding:.6rem .95rem;text-align:center;max-width:24rem}
.eb-rule b{color:var(--accent)}
.eb-arena{width:min(94vw, calc(30rem * var(--scale)))}
.eb-svg{width:100%;height:auto;display:block}
.eb-controls{display:flex;flex-wrap:wrap;gap:.6rem;justify-content:center;align-items:center}
.eb-btn{font-size:calc(1.05rem * var(--scale));font-weight:700;padding:.6rem 1.1rem;border-radius:12px;
  border:2px solid var(--accent);background:#fff;color:var(--accent);cursor:pointer;
  min-width:calc(5.5rem * var(--scale));touch-action:manipulation;user-select:none}
.eb-btn:active{filter:brightness(.94)}
.eb-confirm{background:var(--accent);color:#fff;border-color:var(--accent)}
.eb-hint{font-size:calc(.85rem * var(--scale));color:var(--muted);text-align:center}`;
  document.head.appendChild(el);
}

export function startEbbinghaus({ id, trialCap, scale = 1, accent }) {
  injectStyles();
  const CAP = QA ? 4 : trialCap;         // QA 축약: 시행 수만 줄임(자극·판정·UI 불변)
  let wrap = null, ruleEl = null, svg = null, hintEl = null, btnSmall = null, btnLarge = null, btnConfirm = null;
  let seqCounter = 0;                     // QA 봇이 시행을 구분하는 시퀀스(연습 포함)

  const mkBtn = (cls) => { const b = document.createElement('button'); b.type = 'button'; b.className = cls; return b; };

  function ensure(host) {
    if (wrap && host.contains(wrap)) return;
    host.innerHTML = '';
    wrap = document.createElement('div'); wrap.className = 'eb-wrap';
    ruleEl = document.createElement('div'); ruleEl.className = 'eb-rule';
    const arena = document.createElement('div'); arena.className = 'eb-arena';
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 490 250'); svg.setAttribute('class', 'eb-svg'); svg.setAttribute('role', 'img');
    arena.appendChild(svg);
    const controls = document.createElement('div'); controls.className = 'eb-controls';
    btnSmall = mkBtn('eb-btn'); btnLarge = mkBtn('eb-btn'); btnConfirm = mkBtn('eb-btn eb-confirm');
    controls.append(btnSmall, btnLarge, btnConfirm);
    hintEl = document.createElement('div'); hintEl.className = 'eb-hint';
    wrap.append(ruleEl, arena, controls, hintEl);
    host.appendChild(wrap);
  }

  async function playTrial(trial, ctx, phase) {
    const { host, t, delay } = ctx;
    ensure(host);
    ruleEl.innerHTML = t('ruleLine');
    hintEl.textContent = t('adjustHint');
    btnSmall.textContent = t('btnSmaller'); btnLarge.textContent = t('btnLarger'); btnConfirm.textContent = t('btnConfirm');
    svg.setAttribute('aria-label', t('title'));

    let compR = trial.startR, nAdjust = 0;
    // QA 전용: 봇이 표준·비교 지름을 '본다'(정답 노출 아님 — 사람도 화면에서 두 원을 본다). 자극·판정 불변.
    const qa = QA ? { seq: ++seqCounter, phase, ctx: trial.ctx, stdD: 2 * trial.stdR, compD: 2 * compR, active: true } : null;
    if (qa) window.__ebTrial = qa;
    const draw = () => {
      svg.innerHTML = standardSVG(trial.stdR, trial.ctx) + comparisonSVG(compR);
      if (qa) qa.compD = 2 * compR;
    };
    draw();
    const t0 = performance.now();

    const resp = await new Promise((resolve) => {
      let done = false, holdTimer = null, holdInt = null;
      const step = (dir) => {
        const next = clamp(compR + dir * STEP, COMP_R_MIN, COMP_R_MAX);
        if (next !== compR) { compR = next; nAdjust++; draw(); }
      };
      const endHold = () => { clearTimeout(holdTimer); clearInterval(holdInt); holdTimer = holdInt = null; };
      const startHold = (dir) => { step(dir); holdTimer = setTimeout(() => { holdInt = setInterval(() => step(dir), 110); }, 320); };
      const onSmallDown = (e) => { e.preventDefault(); startHold(-1); };
      const onLargeDown = (e) => { e.preventDefault(); startHold(1); };
      const onKey = (e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); step(-1); }
        else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); step(1); }
        else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); finish(); }
      };
      const HOLD_END = ['pointerup', 'pointercancel', 'pointerleave'];
      function cleanup() {
        window.removeEventListener('keydown', onKey);
        btnSmall.removeEventListener('pointerdown', onSmallDown);
        btnLarge.removeEventListener('pointerdown', onLargeDown);
        HOLD_END.forEach((ev) => { btnSmall.removeEventListener(ev, endHold); btnLarge.removeEventListener(ev, endHold); });
        btnConfirm.removeEventListener('click', finish);
      }
      function finish() { if (done) return; done = true; endHold(); cleanup(); if (qa) qa.active = false; resolve({ compR, nAdjust }); }
      window.addEventListener('keydown', onKey);
      btnSmall.addEventListener('pointerdown', onSmallDown);
      btnLarge.addEventListener('pointerdown', onLargeDown);
      HOLD_END.forEach((ev) => { btnSmall.addEventListener(ev, endHold); btnLarge.addEventListener(ev, endHold); });
      btnConfirm.addEventListener('click', finish);
    });

    const durationMs = Math.round(performance.now() - t0);
    const stdD = 2 * trial.stdR, compD = 2 * resp.compR;
    const record = phase === 'main' ? {
      ctx: trial.ctx, condition: trial.ctx,
      stdD, compSet: compD, startD: 2 * trial.startR,
      signedErr: compD - stdD, errPct: errorPct(compD, stdD),
      nAdjust: resp.nAdjust, durationMs,
    } : null;

    svg.innerHTML = '';
    await delay(350);
    return { record, outcome: { correct: true } };   // 정답 없음 — outcome 은 형식상(sessionAcc null 로 무효)
  }

  // 정적 풀: 맥락 균형(small/large 각 절반), 표준 지름 지터, 시작 지름은 랜덤 방향(과/부족)으로.
  function buildMainPool() {
    const per = Math.max(1, Math.round(CAP / 2));
    const trials = [];
    ['small', 'large'].forEach((ctx) => {
      for (let i = 0; i < per; i++) {
        const stdR = Math.round(rand(STD_R_MIN, STD_R_MAX));
        const sign = Math.random() < 0.5 ? -1 : 1;
        const startR = Math.round(clamp(stdR + sign * rand(12, 22), COMP_R_MIN, COMP_R_MAX));
        trials.push({ ctx, condition: ctx, stdR, startR });
      }
    });
    return trials;                                   // 순서 섞기·조건 분산은 엔진 orderByConstraint 가 처리
  }

  function buildPracticePool() {
    return ['small', 'large'].map((ctx) => {
      const sign = Math.random() < 0.5 ? -1 : 1;
      return { ctx, condition: ctx, stdR: 24, startR: Math.round(clamp(24 + sign * 16, COMP_R_MIN, COMP_R_MAX)) };
    });
  }

  function analyze(records, t) {
    const acc = themeAccent();
    const sSmall = summarize(records.filter((r) => r.ctx === 'small').map((r) => r.errPct));
    const sLarge = summarize(records.filter((r) => r.ctx === 'large').map((r) => r.errPct));
    const biasSmall = sSmall.mean, biasLarge = sLarge.mean;
    const mag = (biasSmall != null && biasLarge != null) ? biasSmall - biasLarge : null;  // 착시 크기(총 스프레드)
    const r1 = (v) => (v == null ? null : +v.toFixed(1));
    const sgn = (v) => (v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(1));

    // 순응 게이트: '지시 이행'에만. 조정 거의 안 한 시행이 과반이면 note(현상 아님, 오차 크기로는 게이트 안 함).
    const noAdj = records.filter((r) => r.nAdjust === 0).length;
    const unadjusted = records.length >= 2 && noAdj > records.length / 2;

    const topNotes = [t('taskNote'), t('methodNote')];
    if (unadjusted) topNotes.push(t('unadjustedNote'));

    if (QA) window.__ebLast = { biasSmall: r1(biasSmall), biasLarge: r1(biasLarge), mag: r1(mag), n: records.length, nSmall: sSmall.n, nLarge: sLarge.n, unadjusted };

    return {
      topNotes,
      // 요약서 막힌 값(null)은 그래프서도 null(같은 게이트) — biasSmall/Large 는 부호값(음수 가능).
      series: [
        { key: 'biasSmall', label: t('biasSmall'), value: r1(biasSmall), color: acc },
        { key: 'biasLarge', label: t('biasLarge'), value: r1(biasLarge), color: LARGE_COLOR },
      ],
      summary: [
        { label: t('illusionMag'), value: mag == null ? '—' : mag.toFixed(1), unit: '%p' },
        { label: t('biasSmall'), value: sgn(biasSmall), unit: '%', count: sSmall.n },
        { label: t('biasLarge'), value: sgn(biasLarge), unit: '%', count: sLarge.n },
        { label: t('trials'), value: records.length, unit: '' },
      ],
      extraHtml: errorSparkline(
        records.map((r) => ({ value: r.errPct, color: r.ctx === 'small' ? acc : LARGE_COLOR })),
        { title: t('trend'), xLabel: t('trialAxis') },
      ),
    };
  }

  runTask({
    id, mount: 'app', scale,
    family: 'perception', accent,
    conditionKeys: [], choices: [],
    practiceCount: 2,
    buildPracticePool, buildMainPool, playTrial, analyze,
    sessionAcc: () => null,
    strings: STRINGS,
  });
}

const STRINGS = {
  ko: {
    title: '주변이 바꾸는 크기',
    howto: '왼쪽에는 가운데 원과 그것을 둘러싼 원들이, 오른쪽에는 원 하나가 있습니다. <b>오른쪽 원</b>의 크기를 조절해 <b>왼쪽 가운데 원과 같은 크기</b>로 맞추세요. 정답은 없습니다 — 보이는 대로 맞추면 됩니다.',
    ruleLine: '오른쪽 원을 <b>왼쪽 가운데 원과 같은 크기</b>로 맞추세요',
    btnSmaller: '− 작게', btnLarger: '+ 크게', btnConfirm: '✓ 이거예요',
    adjustHint: '← → 방향키로도 조절 · Enter 로 확정',
    illusionMag: '착시 크기', biasSmall: '작은 원에 둘러싸임(커 보임)', biasLarge: '큰 원에 둘러싸임(작아 보임)',
    trials: '시행 수', trend: '이번 회차 오차(0 = 실제와 같음)', trialAxis: '시행',
    taskNote: '같은 크기의 원도 주변을 둘러싼 원들의 크기에 따라 다르게 보입니다. 이는 사람의 시각 시스템이 정상적으로 작동한 결과이며, 오차의 크기는 능력이나 성향의 문제가 아닙니다.',
    methodNote: '오차 = (맞춘 지름 − 실제 지름) ÷ 실제 지름. 양수(+)는 실제보다 크게, 음수(−)는 작게 맞췄다는 뜻입니다.',
    unadjustedNote: '이 회차에는 크기를 거의 조절하지 않은 시행이 많아, 값을 해석하기 어렵습니다.',
  },
  en: {
    title: 'The Size the Surroundings Change',
    howto: 'On the left is a center circle ringed by other circles; on the right is a single circle. Adjust the <b>right circle</b> until it looks the <b>same size as the center circle on the left</b>. There is no right answer — just match what you see.',
    ruleLine: 'Make the right circle the <b>same size as the left center circle</b>',
    btnSmaller: '− Smaller', btnLarger: '+ Larger', btnConfirm: '✓ This one',
    adjustHint: 'Arrow keys ← → also adjust · Enter to confirm',
    illusionMag: 'Illusion size', biasSmall: 'Ringed by small circles (looks larger)', biasLarge: 'Ringed by large circles (looks smaller)',
    trials: 'Trials', trend: 'This run’s error (0 = same as actual)', trialAxis: 'trial',
    taskNote: 'A circle of the same size can look different depending on the size of the circles around it. This is your visual system working normally; the size of the error is not a matter of ability or disposition.',
    methodNote: 'Error = (diameter you set − actual diameter) ÷ actual diameter. Positive (+) means you set it larger than actual, negative (−) smaller.',
    unadjustedNote: 'In this run many trials were barely adjusted, so the values are hard to interpret.',
  },
  zh: {
    title: '周围改变的大小',
    howto: '左边是一个中心圆和围绕它的一圈圆，右边是一个圆。调整<b>右边的圆</b>，使它看起来和<b>左边中心圆一样大</b>。没有标准答案——按你看到的来就好。',
    ruleLine: '把右边的圆调成<b>和左边中心圆一样大</b>',
    btnSmaller: '− 变小', btnLarger: '+ 变大', btnConfirm: '✓ 就这样',
    adjustHint: '方向键 ← → 也可调整 · Enter 确认',
    illusionMag: '错觉大小', biasSmall: '被小圆围绕（看起来更大）', biasLarge: '被大圆围绕（看起来更小）',
    trials: '试次数', trend: '本次误差（0＝与实际相同）', trialAxis: '试次',
    taskNote: '相同大小的圆，会因周围圆的大小而看起来不同。这是人的视觉系统正常运作的结果，误差的大小并不代表能力或倾向。',
    methodNote: '误差 =（你设定的直径 − 实际直径）÷ 实际直径。正数(+)表示设得比实际大，负数(−)表示更小。',
    unadjustedNote: '本次有许多试次几乎没有调整，数值难以解释。',
  },
  es: {
    title: 'El Tamaño que Cambia el Entorno',
    howto: 'A la izquierda hay un círculo central rodeado de otros círculos; a la derecha, un solo círculo. Ajusta el <b>círculo de la derecha</b> hasta que parezca del <b>mismo tamaño que el círculo central de la izquierda</b>. No hay respuesta correcta — solo iguala lo que ves.',
    ruleLine: 'Haz que el círculo de la derecha tenga el <b>mismo tamaño que el círculo central de la izquierda</b>',
    btnSmaller: '− Más pequeño', btnLarger: '+ Más grande', btnConfirm: '✓ Este',
    adjustHint: 'Las flechas ← → también ajustan · Enter para confirmar',
    illusionMag: 'Tamaño de la ilusión', biasSmall: 'Rodeado de círculos pequeños (parece más grande)', biasLarge: 'Rodeado de círculos grandes (parece más pequeño)',
    trials: 'Ensayos', trend: 'Error de esta ronda (0 = igual al real)', trialAxis: 'ensayo',
    taskNote: 'Un círculo del mismo tamaño puede verse distinto según el tamaño de los círculos que lo rodean. Es tu sistema visual funcionando con normalidad; el tamaño del error no es cuestión de capacidad ni de disposición.',
    methodNote: 'Error = (diámetro que fijaste − diámetro real) ÷ diámetro real. Positivo (+) significa que lo fijaste más grande que el real; negativo (−), más pequeño.',
    unadjustedNote: 'En esta ronda muchos ensayos apenas se ajustaron, así que los valores son difíciles de interpretar.',
  },
};
