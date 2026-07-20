// muller-lyer-common/muller-lyer.js — 뮐러-라이어 착시(조정법). 청소년·성인 앱이 공유.
//
// 위: 표준선(양끝 화살표 = 착시 유발자, 길이 고정·회차마다 지터). 아래: 비교선(양끝 중립 캡, 왜곡 없음).
// 참가자가 −/+(또는 방향키)로 비교선 길이를 조절해 "위 선과 같은 길이"로 맞춘다. 정답은 없다.
//   오차 = (맞춘 길이 − 실제 길이) / 실제 길이 (%). 부호 유지: +는 길게, −는 짧게 맞춤.
//   핀 조건은 시행 내 조건(세션 조건 아님) → analyze 에서 series 두 줄로 분리(스트룹 일치/불일치처럼).
//
// 확장 지점만 사용(엔진 무수정): 커스텀 playTrial + 정적 buildMainPool(적응 아님) +
//   analyze(오차 지표·게이트·스파크라인) + sessionAcc:()=>null(착시는 크게 속는 게 정상 →
//   오차 크기로 저정확도 경고 켜지지 않게). conditionKeys []: 스텝 조정이라 입력수단이
//   정밀도에 개입할 원리적 경로 없음(자유 드래그였다면 ['input']). 자극은 무채색, accent 는 UI 전용.

import { runTask, QA } from '../core/engine.js';
import { errorPct, summarize, errorSparkline } from '../perception-error/score.js';

const LINE_GREY = '#6b6f76';           // 자극 색(중립 회색, JND 와 동일)
const SHORT_COLOR = '#6FB3B8';         // '안쪽 화살표' 계열색(청록 밝은 톤) — accent(#0E7C86)와 구분
const CX = 200, TOP_Y = 76, BOT_Y = 146, CAP = 9;   // viewBox 0 0 400 200 기준 좌표
const FIN_DX = 23, FIN_DY = 16;        // 핀 길이 ~28, 각도 ~35°
const STEP = 6;                        // 한 번 누를 때 길이 변화(입력수단 무관 고정)
const STD_MIN = 180, STD_MAX = 280;    // 표준선 실제 길이 지터 범위
const COMP_MIN = 80, COMP_MAX = 330;   // 비교선 조절 한계(viewBox 안에 들어오게)
const STROKE = `stroke="${LINE_GREY}" stroke-width="3" stroke-linecap="round"`;

const themeAccent = () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#0E7C86';
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rand = (a, b) => a + Math.random() * (b - a);

// 한쪽 끝의 핀 두 개. finKind='short'(안쪽=짧아 보임) / 'long'(바깥=길어 보임).
function endFins(ex, y, isLeft, finKind) {
  const toward = isLeft ? 1 : -1;                       // 선 중심을 향하는 x 방향
  const dir = finKind === 'short' ? toward : -toward;   // 안쪽이면 중심 쪽, 바깥이면 반대
  const fx = ex + dir * FIN_DX;
  return `<line x1="${ex}" y1="${y}" x2="${fx}" y2="${y - FIN_DY}" ${STROKE}/>` +
         `<line x1="${ex}" y1="${y}" x2="${fx}" y2="${y + FIN_DY}" ${STROKE}/>`;
}
function standardSVG(len, y, finKind) {
  const x1 = CX - len / 2, x2 = CX + len / 2;
  return `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" ${STROKE}/>` +
    endFins(x1, y, true, finKind) + endFins(x2, y, false, finKind);
}
function comparisonSVG(len, y) {                          // 중립 캡(수직 짧은 획) — 왜곡 없음
  const x1 = CX - len / 2, x2 = CX + len / 2;
  return `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" ${STROKE}/>` +
    `<line x1="${x1}" y1="${y - CAP}" x2="${x1}" y2="${y + CAP}" ${STROKE}/>` +
    `<line x1="${x2}" y1="${y - CAP}" x2="${x2}" y2="${y + CAP}" ${STROKE}/>`;
}

function injectStyles() {
  if (document.getElementById('ml-style')) return;
  const el = document.createElement('style');
  el.id = 'ml-style';
  el.textContent = `
.ml-wrap{position:relative;width:100%;min-height:56vh;display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:1.4rem;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.ml-rule{font-size:calc(1rem * var(--scale));line-height:1.5;color:var(--fg);background:#eef1f4;
  border:1px solid #dfe3e8;border-radius:12px;padding:.6rem .95rem;text-align:center;max-width:24rem}
.ml-rule b{color:var(--accent)}
.ml-arena{width:min(94vw, calc(27rem * var(--scale)))}
.ml-svg{width:100%;height:auto;display:block}
.ml-controls{display:flex;flex-wrap:wrap;gap:.6rem;justify-content:center;align-items:center}
.ml-btn{font-size:calc(1.05rem * var(--scale));font-weight:700;padding:.6rem 1.1rem;border-radius:12px;
  border:2px solid var(--accent);background:#fff;color:var(--accent);cursor:pointer;
  min-width:calc(5.5rem * var(--scale));touch-action:manipulation;user-select:none}
.ml-btn:active{filter:brightness(.94)}
.ml-confirm{background:var(--accent);color:#fff;border-color:var(--accent)}
.ml-hint{font-size:calc(.85rem * var(--scale));color:var(--muted);text-align:center}`;
  document.head.appendChild(el);
}

export function startMullerLyer({ id, trialCap, scale = 1, accent }) {
  injectStyles();
  const CAP = QA ? 4 : trialCap;         // QA 축약: 시행 수만 줄임(자극·판정·UI 불변)
  let wrap = null, ruleEl = null, svg = null, hintEl = null, btnShort = null, btnLong = null, btnConfirm = null;
  let seqCounter = 0;                     // QA 봇이 시행을 구분하는 시퀀스(연습 포함)

  const mkBtn = (cls) => { const b = document.createElement('button'); b.type = 'button'; b.className = cls; return b; };

  function ensure(host) {
    if (wrap && host.contains(wrap)) return;
    host.innerHTML = '';
    wrap = document.createElement('div'); wrap.className = 'ml-wrap';
    ruleEl = document.createElement('div'); ruleEl.className = 'ml-rule';
    const arena = document.createElement('div'); arena.className = 'ml-arena';
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 400 200'); svg.setAttribute('class', 'ml-svg'); svg.setAttribute('role', 'img');
    arena.appendChild(svg);
    const controls = document.createElement('div'); controls.className = 'ml-controls';
    btnShort = mkBtn('ml-btn'); btnLong = mkBtn('ml-btn'); btnConfirm = mkBtn('ml-btn ml-confirm');
    controls.append(btnShort, btnLong, btnConfirm);
    hintEl = document.createElement('div'); hintEl.className = 'ml-hint';
    wrap.append(ruleEl, arena, controls, hintEl);
    host.appendChild(wrap);
  }

  async function playTrial(trial, ctx, phase) {
    const { host, t, delay } = ctx;
    ensure(host);
    ruleEl.innerHTML = t('ruleLine');
    hintEl.textContent = t('adjustHint');
    btnShort.textContent = t('btnShorter'); btnLong.textContent = t('btnLonger'); btnConfirm.textContent = t('btnConfirm');
    svg.setAttribute('aria-label', t('title'));

    let compLen = trial.startLen, nAdjust = 0;
    // QA 전용: 봇이 표준·비교 길이를 '본다'(정답 노출 아님 — 사람도 화면에서 두 선을 본다). 자극·판정 불변.
    const qa = QA ? { seq: ++seqCounter, phase, finKind: trial.finKind, stdLen: trial.stdLen, compLen, active: true } : null;
    if (qa) window.__mlTrial = qa;
    const draw = () => {
      svg.innerHTML = standardSVG(trial.stdLen, TOP_Y, trial.finKind) + comparisonSVG(compLen, BOT_Y);
      if (qa) qa.compLen = compLen;
    };
    draw();
    const t0 = performance.now();

    const resp = await new Promise((resolve) => {
      let done = false, holdTimer = null, holdInt = null;
      const step = (dir) => {
        const next = clamp(compLen + dir * STEP, COMP_MIN, COMP_MAX);
        if (next !== compLen) { compLen = next; nAdjust++; draw(); }
      };
      const endHold = () => { clearTimeout(holdTimer); clearInterval(holdInt); holdTimer = holdInt = null; };
      const startHold = (dir) => { step(dir); holdTimer = setTimeout(() => { holdInt = setInterval(() => step(dir), 110); }, 320); };
      const onShortDown = (e) => { e.preventDefault(); startHold(-1); };
      const onLongDown = (e) => { e.preventDefault(); startHold(1); };
      const onKey = (e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); step(-1); }
        else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); step(1); }
        else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); finish(); }
      };
      const HOLD_END = ['pointerup', 'pointercancel', 'pointerleave'];
      function cleanup() {
        window.removeEventListener('keydown', onKey);
        btnShort.removeEventListener('pointerdown', onShortDown);
        btnLong.removeEventListener('pointerdown', onLongDown);
        HOLD_END.forEach((ev) => { btnShort.removeEventListener(ev, endHold); btnLong.removeEventListener(ev, endHold); });
        btnConfirm.removeEventListener('click', finish);
      }
      function finish() { if (done) return; done = true; endHold(); cleanup(); if (qa) qa.active = false; resolve({ compLen, nAdjust }); }
      window.addEventListener('keydown', onKey);
      btnShort.addEventListener('pointerdown', onShortDown);
      btnLong.addEventListener('pointerdown', onLongDown);
      HOLD_END.forEach((ev) => { btnShort.addEventListener(ev, endHold); btnLong.addEventListener(ev, endHold); });
      btnConfirm.addEventListener('click', finish);
    });

    const durationMs = Math.round(performance.now() - t0);
    const record = phase === 'main' ? {
      finKind: trial.finKind, condition: trial.finKind,
      stdLen: trial.stdLen, compSet: resp.compLen, startLen: trial.startLen,
      signedErr: resp.compLen - trial.stdLen, errPct: errorPct(resp.compLen, trial.stdLen),
      nAdjust: resp.nAdjust, durationMs,
    } : null;

    svg.innerHTML = '';
    await delay(350);
    return { record, outcome: { correct: true } };   // 정답 없음 — outcome 은 형식상(sessionAcc null 로 무효)
  }

  // 정적 풀: 핀 조건 균형(long/short 각 절반), 표준 길이 지터, 시작 길이는 랜덤 방향(과/부족)으로.
  function buildMainPool() {
    const per = Math.max(1, Math.round(CAP / 2));
    const trials = [];
    ['long', 'short'].forEach((kind) => {
      for (let i = 0; i < per; i++) {
        const stdLen = Math.round(rand(STD_MIN, STD_MAX));
        const sign = Math.random() < 0.5 ? -1 : 1;
        const startLen = Math.round(clamp(stdLen + sign * rand(45, 80), COMP_MIN, COMP_MAX));
        trials.push({ finKind: kind, condition: kind, stdLen, startLen });
      }
    });
    return trials;                                   // 순서 섞기·조건 분산은 엔진 orderByConstraint 가 처리
  }

  function buildPracticePool() {
    return ['long', 'short'].map((kind) => {
      const sign = Math.random() < 0.5 ? -1 : 1;
      return { finKind: kind, condition: kind, stdLen: 230, startLen: Math.round(clamp(230 + sign * 60, COMP_MIN, COMP_MAX)) };
    });
  }

  function analyze(records, t) {
    const acc = themeAccent();
    const sLong = summarize(records.filter((r) => r.finKind === 'long').map((r) => r.errPct));
    const sShort = summarize(records.filter((r) => r.finKind === 'short').map((r) => r.errPct));
    const biasLong = sLong.mean, biasShort = sShort.mean;
    const mag = (biasLong != null && biasShort != null) ? biasLong - biasShort : null;  // 착시 크기(총 스프레드)
    const r1 = (v) => (v == null ? null : +v.toFixed(1));
    const sgn = (v) => (v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(1));

    // 순응 게이트: '지시 이행'에만. 조정 거의 안 한 시행이 과반이면 note(현상 아님, 오차 크기로는 게이트 안 함).
    const noAdj = records.filter((r) => r.nAdjust === 0).length;
    const unadjusted = records.length >= 2 && noAdj > records.length / 2;

    const topNotes = [t('taskNote'), t('methodNote')];
    if (unadjusted) topNotes.push(t('unadjustedNote'));

    if (QA) window.__mlLast = { biasLong: r1(biasLong), biasShort: r1(biasShort), mag: r1(mag), n: records.length, nLong: sLong.n, nShort: sShort.n, unadjusted };

    return {
      topNotes,
      // 요약서 막힌 값(null)은 그래프서도 null(같은 게이트) — biasLong/Short 는 부호값(음수 가능).
      series: [
        { key: 'biasLong', label: t('biasLong'), value: r1(biasLong), color: acc },
        { key: 'biasShort', label: t('biasShort'), value: r1(biasShort), color: SHORT_COLOR },
      ],
      summary: [
        { label: t('illusionMag'), value: mag == null ? '—' : mag.toFixed(1), unit: '%p' },
        { label: t('biasLong'), value: sgn(biasLong), unit: '%', count: sLong.n },
        { label: t('biasShort'), value: sgn(biasShort), unit: '%', count: sShort.n },
        { label: t('trials'), value: records.length, unit: '' },
      ],
      extraHtml: errorSparkline(
        records.map((r) => ({ value: r.errPct, color: r.finKind === 'long' ? acc : SHORT_COLOR })),
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
    title: '화살표가 바꾸는 길이',
    howto: '위·아래에 선이 하나씩 있습니다. <b>아래 선</b>의 길이를 조절해 <b>위 선과 같은 길이</b>로 맞추세요. 정답은 없습니다 — 보이는 대로 맞추면 됩니다.',
    ruleLine: '아래 선을 <b>위 선과 같은 길이</b>로 맞추세요',
    btnShorter: '− 짧게', btnLonger: '+ 길게', btnConfirm: '✓ 이거예요',
    adjustHint: '← → 방향키로도 조절 · Enter 로 확정',
    illusionMag: '착시 크기', biasLong: '바깥 화살표(길어 보임)', biasShort: '안쪽 화살표(짧아 보임)',
    trials: '시행 수', trend: '이번 회차 오차(0 = 실제와 같음)', trialAxis: '시행',
    taskNote: '같은 길이의 선도 양끝 화살표 방향에 따라 다르게 보입니다. 이는 사람의 시각 시스템이 정상적으로 작동한 결과이며, 오차의 크기는 능력이나 성향의 문제가 아닙니다.',
    methodNote: '오차 = (맞춘 길이 − 실제 길이) ÷ 실제 길이. 양수(+)는 실제보다 길게, 음수(−)는 짧게 맞췄다는 뜻입니다.',
    unadjustedNote: '이 회차에는 길이를 거의 조절하지 않은 시행이 많아, 값을 해석하기 어렵습니다.',
  },
  en: {
    title: 'The Length the Arrows Change',
    howto: 'There are two lines, one above the other. Adjust the <b>lower line</b> until it looks the <b>same length as the upper line</b>. There is no right answer — just match what you see.',
    ruleLine: 'Make the lower line the <b>same length as the upper line</b>',
    btnShorter: '− Shorter', btnLonger: '+ Longer', btnConfirm: '✓ This one',
    adjustHint: 'Arrow keys ← → also adjust · Enter to confirm',
    illusionMag: 'Illusion size', biasLong: 'Outward fins (looks longer)', biasShort: 'Inward fins (looks shorter)',
    trials: 'Trials', trend: 'This run’s error (0 = same as actual)', trialAxis: 'trial',
    taskNote: 'Two lines of the same length can look different depending on the arrowheads at their ends. This is your visual system working normally; the size of the error is not a matter of ability or disposition.',
    methodNote: 'Error = (length you set − actual length) ÷ actual length. Positive (+) means you set it longer than actual, negative (−) shorter.',
    unadjustedNote: 'In this run many trials were barely adjusted, so the values are hard to interpret.',
  },
  zh: {
    title: '箭头改变的长度',
    howto: '上下各有一条线。调整<b>下面那条线</b>的长度，使它看起来和<b>上面那条一样长</b>。没有标准答案——按你看到的来就好。',
    ruleLine: '把下面的线调成<b>和上面的线一样长</b>',
    btnShorter: '− 变短', btnLonger: '+ 变长', btnConfirm: '✓ 就这样',
    adjustHint: '方向键 ← → 也可调整 · Enter 确认',
    illusionMag: '错觉大小', biasLong: '向外箭头（看起来更长）', biasShort: '向内箭头（看起来更短）',
    trials: '试次数', trend: '本次误差（0＝与实际相同）', trialAxis: '试次',
    taskNote: '相同长度的线，会因两端箭头的方向而看起来不同。这是人的视觉系统正常运作的结果，误差的大小并不代表能力或倾向。',
    methodNote: '误差 =（你设定的长度 − 实际长度）÷ 实际长度。正数(+)表示设得比实际长，负数(−)表示更短。',
    unadjustedNote: '本次有许多试次几乎没有调整，数值难以解释。',
  },
  es: {
    title: 'La Longitud que Cambian las Flechas',
    howto: 'Hay dos líneas, una arriba y otra abajo. Ajusta la <b>línea inferior</b> hasta que parezca de la <b>misma longitud que la superior</b>. No hay respuesta correcta — solo iguala lo que ves.',
    ruleLine: 'Haz que la línea inferior tenga la <b>misma longitud que la superior</b>',
    btnShorter: '− Más corta', btnLonger: '+ Más larga', btnConfirm: '✓ Esta',
    adjustHint: 'Las flechas ← → también ajustan · Enter para confirmar',
    illusionMag: 'Tamaño de la ilusión', biasLong: 'Aletas hacia afuera (parece más larga)', biasShort: 'Aletas hacia adentro (parece más corta)',
    trials: 'Ensayos', trend: 'Error de esta ronda (0 = igual a la real)', trialAxis: 'ensayo',
    taskNote: 'Dos líneas de igual longitud pueden verse distintas según las puntas de flecha en sus extremos. Es tu sistema visual funcionando con normalidad; el tamaño del error no es cuestión de capacidad ni de disposición.',
    methodNote: 'Error = (longitud que fijaste − longitud real) ÷ longitud real. Positivo (+) significa que la fijaste más larga que la real; negativo (−), más corta.',
    unadjustedNote: 'En esta ronda muchos ensayos apenas se ajustaron, así que los valores son difíciles de interpretar.',
  },
};
