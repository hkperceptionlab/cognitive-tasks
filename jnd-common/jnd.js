// jnd-common/jnd.js — 변별 역치("차이가 보이는 순간"). 청소년·성인 앱이 공유.
//
// 좌우 두 원. 기준 크기는 같고 한쪽만 더 큼(어느 쪽이 큰지는 무작위). 더 큰 원을 누른다.
// 크기 차이 비율을 계단식으로 조절하며 "차이를 느끼는 최소 지점"(JND, 변별 역치)을 찾는다.
//   계단식(Stop-signal의 반전기준 accelerated 재사용, 조절 변수만 SSD→크기차이 비율로 교체):
//   정반응(큰 쪽 맞힘)→차이 줄임(어렵게) / 오반응→차이 늘림(쉽게). 첫 반전 전 8%p, 이후 4%p, [2%,60%].
//   종료: 반전 6회 또는 시행 상한(청소년 24 / 성인 40). JND=반전 지점 평균('수렴'이라 부르지 않음).
//   반전 0회로 끝난 회차는 JND를 "—"+note 로 게이트(요약·그래프 둘 다).
//
// 엔진 훅: playTrial(커스텀 구동기) + mainTrials(계단식 제너레이터, 적응 종료) +
//   sessionAcc()=>null(계단식이라 정확도 경고 끔) + conditionKeys []( RT를 안 재고 자기 페이스라
//   입력 방식이 역치에 개입할 근거 없음 → 세션을 입력으로 나누지 않음) + analyze.extraHtml(궤적 스파크라인).
//
// 자극(원)은 중립 회색. accent(청록)는 UI(언어 버튼·그래프·스파크라인) 전용 — 색은 단서가 아니다.

import { runTask, QA } from '../core/engine.js';

// 계단식 상수(비율, 0.40 = 기준 대비 +40%).
const DIFF_START = 0.40, STEP_BIG = 0.08, STEP_SMALL = 0.04, DIFF_MIN = 0.02, DIFF_MAX = 0.60;
const MAX_REVERSALS = 6;   // 이만큼 반전하면 종료(표본 한계: 실제 연구는 8~12회 이상)
const FB_MS = 500;         // 연습 피드백 표시 시간
const DOT_GREY = '#6b6f76'; // 자극 색(중립 회색, #fafafa 위 대비 충분·색약 안전)

function injectStyles() {
  if (document.getElementById('jnd-style')) return;
  const el = document.createElement('style');
  el.id = 'jnd-style';
  el.textContent = `
.jnd-wrap{position:relative;width:100%;min-height:56vh;display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:1.8rem;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.jnd-rule{font-size:calc(1rem * var(--scale));line-height:1.5;color:var(--fg);background:#eef1f4;
  border:1px solid #dfe3e8;border-radius:12px;padding:.6rem .95rem;text-align:center;max-width:23rem}
.jnd-rule b{color:var(--accent)}
.jnd-fix{font-size:calc(2.4rem * var(--scale));color:var(--muted);font-weight:700;
  min-height:calc(2.6rem * var(--scale));display:flex;align-items:center}
.jnd-arena{--base:min(20vw,26vmin);--bigmul:1;display:flex;align-items:center;justify-content:center;
  gap:clamp(1rem,6vw,3rem);max-width:100%;min-height:calc(var(--base) * var(--scale) * 1.62)}
.jnd-dot{width:calc(var(--base) * var(--scale));height:calc(var(--base) * var(--scale));
  border-radius:50%;border:none;background:${DOT_GREY};cursor:pointer;padding:0;flex:0 0 auto;touch-action:manipulation}
.jnd-dot.big{width:calc(var(--base) * var(--scale) * var(--bigmul));height:calc(var(--base) * var(--scale) * var(--bigmul))}
.jnd-dot:active{filter:brightness(.9)}
.jnd-dot[disabled]{cursor:default}
.jnd-status{min-height:calc(1.7rem * var(--scale));font-size:calc(1.15rem * var(--scale));font-weight:800}
.jnd-status.ok{color:#2e7d32}.jnd-status.no{color:#c62828}
.jnd-spark{margin:.2rem 0 .4rem}`;                 /* 궤적 스파크라인. 축색은 엔진 .graph .axis(var(--muted)) */
  document.head.appendChild(el);
}

const themeAccent = () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#0E7C86';

// 이번 회차 크기차이 궤적 스파크라인(extraHtml). 값은 %, 색은 var(--accent), 라벨은 t(), 판정문구 없음.
function jndSparkline(diffsPct, t) {
  if (diffsPct.length < 2) return '';
  const W = 320, H = 96, padL = 40, padR = 10, padT = 12, padB = 22;
  let min = Math.min(...diffsPct), max = Math.max(...diffsPct);
  if (min === max) { min -= 2; max += 2; }
  const x = (i) => padL + (i * (W - padL - padR)) / (diffsPct.length - 1);
  const y = (v) => H - padB - ((v - min) / (max - min)) * (H - padT - padB);
  const pts = diffsPct.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const dots = diffsPct.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="3" fill="var(--accent)"/>`).join('');
  const yTicks = `<text x="4" y="${y(max) + 4}" class="axis">${Math.round(max)}</text>` +
                 `<text x="4" y="${y(min) + 4}" class="axis">${Math.round(min)}</text>`;
  const xLabel = `<text x="${(padL + W - padR) / 2}" y="${H - 4}" text-anchor="middle" class="axis">${t('trialAxis')}</text>`;
  return `<div class="jnd-spark"><h3 class="graph-title">${t('jndTrend')}</h3>` +
    `<svg viewBox="0 0 ${W} ${H}" class="graph" role="img" aria-label="${t('jndTrend')}">` +
    `<polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2.5"/>${dots}${yTicks}${xLabel}</svg></div>`;
}

export function startJnd({ id, trialCap, scale = 1, accent }) {
  injectStyles();
  const CAP = QA ? 8 : trialCap;         // QA 축약: 시행 상한만 줄임(판정·자극·UI 불변)
  const MAX_REV = QA ? 3 : MAX_REVERSALS;
  let wrap = null, ruleEl = null, fixEl = null, arena = null, statusEl = null, dots = [];
  let seqCounter = 0;

  function ensure(host) {
    if (wrap && host.contains(wrap)) return;
    host.innerHTML = '';
    wrap = document.createElement('div');
    wrap.className = 'jnd-wrap';
    ruleEl = document.createElement('div'); ruleEl.className = 'jnd-rule';       // 상시 안내(매 시행)
    fixEl = document.createElement('div'); fixEl.className = 'jnd-fix';           // 응시점
    arena = document.createElement('div'); arena.className = 'jnd-arena';         // 두 원
    dots = ['left', 'right'].map((side) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'jnd-dot'; b.dataset.side = side; b.disabled = true;
      b.setAttribute('aria-label', side);
      arena.appendChild(b);
      return b;
    });
    statusEl = document.createElement('div'); statusEl.className = 'jnd-status';   // 연습 피드백(원과 다른 자리)
    wrap.append(ruleEl, fixEl, arena, statusEl);
    host.appendChild(wrap);
  }
  const setDotsActive = (on) => dots.forEach((b) => { b.disabled = !on; });
  const showStim = (on) => { arena.style.visibility = on ? 'visible' : 'hidden'; };

  async function playTrial(trial, ctx, phase) {
    const { host, t, stampAfterPaint, delay, pickMs } = ctx;
    ensure(host);
    ruleEl.innerHTML = t('ruleLine');
    if (phase === 'main') ctx.setProgress(() => `${t('mainLabel')} ${trial.n}`);

    // 1) 응시점(원 숨김)
    showStim(false); fixEl.textContent = '+'; statusEl.textContent = ''; statusEl.className = 'jnd-status';
    setDotsActive(false);
    await delay(pickMs([400, 700]));
    fixEl.textContent = '';

    // 2) 두 원 표시 — 한쪽만 (1+diff)배. 자기 페이스(제한시간 없음): 누를 때까지 유지.
    arena.style.setProperty('--bigmul', String(1 + trial.diff));
    dots.forEach((d) => d.classList.toggle('big', d.dataset.side === trial.biggerSide));
    // 봇/디버그가 시행을 '보고' 구분할 수 있게 시행 시퀀스만 노출(정답 아님 — 큰 쪽은 원 크기로 봄).
    arena.dataset.seq = String(++seqCounter);
    showStim(true); setDotsActive(true);

    const resp = await new Promise((resolve) => {
      let done = false, t0 = 0;
      const cleanup = () => { dots.forEach((b) => b.removeEventListener('pointerdown', onDown)); window.removeEventListener('keydown', onKey); };
      const finish = (p) => { if (done) return; done = true; cleanup(); resolve(p); };
      const pick = (side, inputType) => finish({ side, rt: t0 ? performance.now() - t0 : 0, inputType });
      const onDown = (e) => pick(e.currentTarget.dataset.side, e.pointerType || 'mouse');
      const onKey = (e) => { if (e.key === 'ArrowLeft') pick('left', 'keyboard'); else if (e.key === 'ArrowRight') pick('right', 'keyboard'); };
      dots.forEach((b) => b.addEventListener('pointerdown', onDown));
      window.addEventListener('keydown', onKey);
      stampAfterPaint().then((tp) => { if (!done) t0 = tp; });
    });

    setDotsActive(false);
    const correct = resp.side === trial.biggerSide;

    // 연습만 피드백 — '원 자리'가 아니라 '상태줄'에(자극과 확실히 구분). 본시행은 무피드백.
    if (phase === 'practice') {
      statusEl.className = 'jnd-status ' + (correct ? 'ok' : 'no');
      statusEl.textContent = correct ? t('fbOk') : t('fbNo');
      await delay(FB_MS);
      statusEl.textContent = ''; statusEl.className = 'jnd-status';
    }

    dots.forEach((d) => d.classList.remove('big'));
    showStim(false);
    const record = phase === 'main'
      ? { diff: trial.diff, biggerSide: trial.biggerSide, chosenSide: resp.side, correct, rt: resp.rt, inputType: resp.inputType || null }
      : null;
    await delay(pickMs([400, 700]));
    return { record, outcome: { correct } };
  }

  // 계단식(반전 기준 accelerated): 정반응→차이 줄임(down), 오반응→차이 늘림(up).
  // 첫 반전 전까지 큰 스텝(8%p)으로 빠르게 접근, 그 후 작은 스텝(4%p). 반전 MAX_REV회 또는 상한서 종료.
  async function* mainTrials() {
    let diff = DIFF_START, step = STEP_BIG, last = null, reversals = 0, n = 0;
    while (n < CAP && reversals < MAX_REV) {
      n++;
      const biggerSide = Math.random() < 0.5 ? 'left' : 'right';
      const o = yield { diff, biggerSide, n };
      const move = o && o.correct ? 'down' : 'up';
      if (last !== null && move !== last) { reversals++; if (step === STEP_BIG) step = STEP_SMALL; }
      diff = move === 'down' ? Math.max(DIFF_MIN, diff - step) : Math.min(DIFF_MAX, diff + step);
      last = move;
    }
  }

  // 연습: 큰 차이(잘 보임)로 규칙 익히기.
  function buildPracticePool() {
    return Array.from({ length: 4 }, () => ({ diff: 0.40, biggerSide: Math.random() < 0.5 ? 'left' : 'right' }));
  }

  function analyze(records, t) {
    const diffs = records.map((r) => r.diff);                 // 궤적(비율)
    const moves = records.map((r) => (r.correct ? 'down' : 'up'));
    // JND = '반전 지점' 크기차이의 평균(표준 계단식 문턱 추정). 방향(down/up)이 바뀌는 시행의 diff 를 모은다.
    // 방향이 한 번도 안 바뀌면(계속 정답 또는 계속 오답) 반전이 없어 역치를 추정할 수 없다.
    const reversalDiffs = [];
    for (let i = 1; i < records.length; i++) if (moves[i] !== moves[i - 1]) reversalDiffs.push(records[i].diff);
    const jnd = reversalDiffs.length ? reversalDiffs.reduce((a, b) => a + b, 0) / reversalDiffs.length : null; // 비율
    const noReversal = records.length >= 2 && reversalDiffs.length === 0;
    const jndPct = jnd == null ? null : +(jnd * 100).toFixed(1);
    const pct = (v) => (v == null ? '—' : (v * 100).toFixed(1));

    const topNotes = [t('taskNote'), t('jndNote')];
    if (noReversal) topNotes.push(t('noReversalNote'));      // 반전 없음 = 사실 진술(판정 아님)

    // QA 자동점검용: 분모/게이트 상태를 노출(반전0→null 게이트, 클램프 도달 등).
    if (QA) window.__jndLast = {
      jnd: jndPct, reversals: reversalDiffs.length,
      finalDiff: diffs.length ? +(diffs[diffs.length - 1] * 100).toFixed(1) : null,
      n: records.length, diffs: diffs.map((d) => +(d * 100).toFixed(1)),
    };

    return {
      topNotes,
      // 요약서 막은 걸 그래프서 통과시키지 않도록, 반전0이면 series 값도 null(교훈3: 요약·그래프 같은 게이트).
      series: [{ key: 'jnd', label: t('jnd'), value: jndPct, color: themeAccent() }],
      summary: [
        { label: t('jnd'), value: pct(jnd), unit: '%' },
        { label: t('reversals'), value: reversalDiffs.length, unit: '' },
        { label: t('trials'), value: records.length, unit: '' },
      ],
      extraHtml: jndSparkline(diffs.map((d) => d * 100), t),
    };
  }

  runTask({
    id,
    mount: 'app',
    scale,
    family: 'perception',        // 청록
    accent,
    conditionKeys: [],           // RT 아닌 역치·자기 페이스 → 입력 방식이 개입할 근거 없음. 세션 안 나눔.
    choices: [],                 // 두 원을 host 에 직접 그림
    buildPracticePool,
    mainTrials,
    playTrial,
    analyze,
    sessionAcc: () => null,      // 계단식이라 '정확도'는 ~수렴값 → 저정확도 경고 끔
    strings: STRINGS,
  });
}

const STRINGS = {
  ko: {
    title: '차이가 보이는 순간',
    howto: '좌우에 원이 두 개 나옵니다. 크기가 <b>더 큰 쪽</b>을 누르세요(또는 방향키 ← →).<br>맞히면 두 원의 차이가 점점 줄어듭니다 — <i>차이가 겨우 보이는 지점</i>까지 따라갑니다.',
    ruleLine: '<b>더 큰 원</b>을 누르세요',
    jnd: '변별 역치(크기 차이)',
    reversals: '반전 횟수',
    trials: '시행 수',
    jndTrend: '크기 차이 변화',
    trialAxis: '시행',
    taskNote: '이 과제는 두 크기의 차이를 “겨우 느낄 수 있는 최소 지점”(변별 역치, JND)을 봅니다. 값이 작을수록 더 작은 차이도 구별했다는 뜻입니다.',
    jndNote: '변별 역치는 반전 지점들의 평균으로 얻은 거친 추정입니다. 이 앱은 반전 6회에서 멈추지만, 실제 연구는 반전을 8~12회 이상 씁니다. 그래서 이 값은 회차마다 크게 달라집니다.',
    noReversalNote: '이 회차에는 방향이 한 번도 바뀌지 않아(계속 맞히거나 계속 틀림) 차이가 한쪽 끝까지만 갔고, 변별 역치를 추정할 수 없습니다.',
    fbOk: '✓ 맞아요',
    fbNo: '✗ 아니에요',
  },
  en: {
    title: 'When the Difference Shows',
    howto: 'Two circles appear, left and right. Press the <b>larger</b> one (or arrow key ← →).<br>Each time you are right the two get closer in size — following you down to <i>the smallest difference you can still see.</i>',
    ruleLine: 'Press the <b>larger circle</b>',
    jnd: 'Discrimination threshold (size difference)',
    reversals: 'Reversals',
    trials: 'Trials',
    jndTrend: 'Size difference over trials',
    trialAxis: 'trial',
    taskNote: 'This task looks for the smallest size difference you can just barely tell apart (the discrimination threshold, JND). A smaller value means you could tell apart a smaller difference.',
    jndNote: 'The threshold is a rough estimate from the average of the reversal points. This app stops at 6 reversals, but real studies use 8–12 or more. So this value varies a lot from run to run.',
    noReversalNote: 'In this run the direction never changed (always right, or always wrong), so the difference only ran to one end and the threshold cannot be estimated.',
    fbOk: '✓ Correct',
    fbNo: '✗ Not that one',
  },
  zh: {
    title: '差异显现的一刻',
    howto: '左右出现两个圆。请按<b>更大</b>的那个（或方向键 ← →）。<br>每答对一次，两个圆的大小就更接近——一路跟到<i>你还能看出的最小差异</i>。',
    ruleLine: '请按<b>更大的圆</b>',
    jnd: '辨别阈限（大小差异）',
    reversals: '反转次数',
    trials: '试次数',
    jndTrend: '大小差异随试次变化',
    trialAxis: '试次',
    taskNote: '这个任务寻找你刚好能分辨的最小大小差异（辨别阈限，JND）。数值越小，说明你能分辨的差异越小。',
    jndNote: '该阈限是由反转点的平均值得到的粗略估计。本应用在 6 次反转时停止，而真正的研究会使用 8～12 次以上。因此这个数值每次差别很大。',
    noReversalNote: '本次方向从未改变（一直答对或一直答错），差异只走到了一端，无法估计阈限。',
    fbOk: '✓ 对了',
    fbNo: '✗ 不是这个',
  },
  es: {
    title: 'Cuando Se Nota la Diferencia',
    howto: 'Aparecen dos círculos, izquierda y derecha. Pulsa el <b>más grande</b> (o tecla de flecha ← →).<br>Cada acierto acerca sus tamaños — siguiéndote hasta <i>la menor diferencia que aún puedes ver.</i>',
    ruleLine: 'Pulsa el <b>círculo más grande</b>',
    jnd: 'Umbral de discriminación (diferencia de tamaño)',
    reversals: 'Reversiones',
    trials: 'Ensayos',
    jndTrend: 'Diferencia de tamaño por ensayos',
    trialAxis: 'ensayo',
    taskNote: 'Esta tarea busca la menor diferencia de tamaño que apenas puedes distinguir (el umbral de discriminación, JND). Un valor más pequeño significa que distinguiste una diferencia menor.',
    jndNote: 'El umbral es una estimación aproximada a partir del promedio de los puntos de reversión. Esta app se detiene en 6 reversiones, pero los estudios reales usan 8–12 o más. Por eso este valor varía mucho entre rondas.',
    noReversalNote: 'En esta ronda la dirección nunca cambió (siempre acierto o siempre error), así que la diferencia solo llegó a un extremo y el umbral no puede estimarse.',
    fbOk: '✓ Correcto',
    fbNo: '✗ Ese no',
  },
};
