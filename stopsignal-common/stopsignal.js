// stopsignal-common/stopsignal.js — 멈추기 과제(Stop-signal). 청소년·성인 앱이 공유.
//
// Go 시행(75%): 화살표 방향의 버튼/방향키로 반응(응답창 1000ms).
// Stop 시행(25%): 화살표 표시 후 SSD 경과 시 화살표가 빨강(멈춤 신호) → 반응 안 해야 성공.
//   SSD 계단식: 멈췄으면 +50(어렵게), 못 멈췄으면 −50(쉽게), [0,850]. ~50% 수렴이 설계 의도.
// Go/No-go(행동을 '시작 안 함')와 달리 이건 '이미 시작한 행동을 멈춤'(action cancellation).
//
// 엔진 훅: playTrial(두 단계 커스텀 구동기) + mainTrials(SSD 계단식 제너레이터) +
//   sessionAcc()=>null(50% 성공이 정상) + conditionKeys ['input'](화살표는 언어 무관) +
//   analyze.extraHtml(이번 회차 SSD 궤적 스파크라인).

import { runTask, QA } from '../core/engine.js';

const RESP_WINDOW = 1000; // 화살표 표시 후 응답 허용 시간
// SSD 계단식: 첫 반전(방향 바뀜)까지 큰 스텝(100)으로 빠르게 접근, 그 후 작은 스텝(50)으로 미세조정.
// 표준 accelerated staircase(반전 기준 스텝 축소). 시행 수는 안 늘리고 초기 접근만 빠르게.
const SSD_START = 250, SSD_STEP = 50, SSD_STEP_BIG = 100, SSD_MIN = 0, SSD_MAX = 850;
const FB_MS = 500;        // 연습 피드백 표시 시간

function injectStyles() {
  if (document.getElementById('ss-style')) return;
  const el = document.createElement('style');
  el.id = 'ss-style';
  el.textContent = `
.ss-wrap{position:relative;width:100%;min-height:52vh;display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:2.2rem;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.ss-arrow{font-size:calc(clamp(4rem,26vw,8rem) * var(--scale));font-weight:800;line-height:1;color:var(--fg)}
.ss-arrow.fix{color:var(--muted);font-weight:600}
.ss-arrow.stop{color:#d32f2f}               /* 멈춤 신호(빨강) — 자극 신호색(SRT 초록처럼) */
.ss-arrow.ok{color:#2e7d32}.ss-arrow.no{color:#c62828}
.ss-pad{display:flex;gap:1.4rem}
.ss-key{width:calc(5.2rem * var(--scale));min-height:calc(4.2rem * var(--scale));border:none;border-radius:16px;
  background:var(--accent);color:#fff;font-size:calc(2.1rem * var(--scale));font-weight:800;cursor:pointer;
  box-shadow:0 2px 8px rgba(0,0,0,.18);touch-action:manipulation}
.ss-key:active{transform:scale(.96)}
.ss-key[disabled]{opacity:.35;cursor:default}
.ss-spark{margin:.2rem 0 .4rem}`;               /* SSD 스파크라인. 축색은 엔진 .graph .axis(var(--muted)) */
  document.head.appendChild(el);
}

// 균등 스케줄(go×N + stop×M)을 무작위 섞기. 예측 방지.
function buildSchedule(nGo, nStop) {
  const a = Array(nGo).fill('go').concat(Array(nStop).fill('stop'));
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const themeAccent = () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#3949ab';
const med = (a) => {
  if (!a.length) return null;
  const s = a.slice().sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// 이번 회차 SSD 궤적 스파크라인(extraHtml). 색은 var(--accent), 라벨은 t()(4언어), 판정문구 없음.
function ssdSparkline(ssds, t) {
  if (ssds.length < 2) return '';
  const W = 320, H = 96, padL = 40, padR = 10, padT = 12, padB = 22;
  let min = Math.min(...ssds), max = Math.max(...ssds);
  if (min === max) { min -= 50; max += 50; }
  const x = (i) => padL + (i * (W - padL - padR)) / (ssds.length - 1);
  const y = (v) => H - padB - ((v - min) / (max - min)) * (H - padT - padB);
  const pts = ssds.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const dots = ssds.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="3" fill="var(--accent)"/>`).join('');
  const yTicks = `<text x="4" y="${y(max) + 4}" class="axis">${Math.round(max)}</text>` +
                 `<text x="4" y="${y(min) + 4}" class="axis">${Math.round(min)}</text>`;
  const xLabel = `<text x="${(padL + W - padR) / 2}" y="${H - 4}" text-anchor="middle" class="axis">${t('trialAxis')}</text>`;
  return `<div class="ss-spark"><h3 class="graph-title">${t('ssdTrend')}</h3>` +
    `<svg viewBox="0 0 ${W} ${H}" class="graph" role="img" aria-label="${t('ssdTrend')}">` +
    `<polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2.5"/>${dots}${yTicks}${xLabel}</svg></div>`;
}

export function startStopSignal({ id, goCount, stopCount, scale = 1, accent }) {
  injectStyles();
  const nGo = QA ? 6 : goCount;    // QA 축약: 시행 수만 줄임(딜레이·판정·UI 불변)
  const nStop = QA ? 4 : stopCount;
  let wrap = null, arrow = null, keys = [];

  function ensure(host) {
    if (wrap && host.contains(wrap)) return;
    host.innerHTML = '';
    wrap = document.createElement('div');
    wrap.className = 'ss-wrap';
    arrow = document.createElement('div');
    arrow.className = 'ss-arrow';
    const pad = document.createElement('div');
    pad.className = 'ss-pad';
    keys = ['left', 'right'].map((dir) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'ss-key'; b.dataset.dir = dir; b.disabled = true;
      b.textContent = dir === 'left' ? '◀' : '▶';
      b.setAttribute('aria-label', dir);
      pad.appendChild(b);
      return b;
    });
    wrap.appendChild(arrow); wrap.appendChild(pad);
    host.appendChild(wrap);
  }
  const setPadActive = (on) => keys.forEach((b) => { b.disabled = !on; });

  async function playTrial(trial, ctx, phase) {
    const { host, t, stampAfterPaint, delay, pickMs } = ctx;
    ensure(host);
    if (phase === 'main') ctx.setProgress(() => `${t('mainLabel')} ${trial.n} / ${trial.total}`);

    // 1) 응시점
    arrow.className = 'ss-arrow fix'; arrow.textContent = '+'; arrow.removeAttribute('data-dir'); setPadActive(false);
    await delay(pickMs([400, 700]));

    // 2) 화살표 표시
    arrow.className = 'ss-arrow'; arrow.dataset.dir = trial.dir;
    arrow.textContent = trial.dir === 'left' ? '←' : '→';
    setPadActive(true);

    const resp = await new Promise((resolve) => {
      let done = false, t0 = 0, stopTimer = null, endTimer = null;
      const cleanup = () => {
        keys.forEach((b) => b.removeEventListener('pointerdown', onDown));
        window.removeEventListener('keydown', onKey);
        if (stopTimer) clearTimeout(stopTimer);
        if (endTimer) clearTimeout(endTimer);
      };
      const finish = (p) => { if (done) return; done = true; cleanup(); resolve(p); };
      const respond = (dir, inputType) => finish({ responded: true, dir, rt: t0 ? performance.now() - t0 : 0, inputType });
      const onDown = (e) => respond(e.currentTarget.dataset.dir, e.pointerType || 'mouse');
      const onKey = (e) => { if (e.key === 'ArrowLeft') respond('left', 'keyboard'); else if (e.key === 'ArrowRight') respond('right', 'keyboard'); };
      keys.forEach((b) => b.addEventListener('pointerdown', onDown));
      window.addEventListener('keydown', onKey);
      stampAfterPaint().then((tp) => {
        if (done) return;
        t0 = tp;
        if (trial.type === 'stop') stopTimer = setTimeout(() => arrow.classList.add('stop'), trial.ssd);
        endTimer = setTimeout(() => finish({ responded: false }), RESP_WINDOW);
      });
    });

    setPadActive(false);
    arrow.classList.remove('stop');

    let record = null, outcome = {};
    if (trial.type === 'go') {
      const correct = resp.responded && resp.dir === trial.dir;
      if (phase === 'practice') { // 연습(go만)에서만 방향 피드백
        arrow.className = 'ss-arrow ' + (correct ? 'ok' : 'no');
        arrow.textContent = correct ? '✓' : '✗';
        await delay(FB_MS);
      }
      if (phase === 'main') record = { type: 'go', dir: trial.dir, correct, rt: resp.responded ? resp.rt : null, inputType: resp.inputType || null };
    } else {
      const stopped = !resp.responded;
      if (phase === 'main') record = { type: 'stop', ssd: trial.ssd, stopped, rt: resp.responded ? resp.rt : null, inputType: resp.inputType || null };
      outcome = { stopped };
    }

    // 3) 시행 간 간격(무작위)
    arrow.textContent = ''; arrow.className = 'ss-arrow'; arrow.removeAttribute('data-dir');
    await delay(pickMs([500, 800]));
    return { record, outcome };
  }

  // SSD 계단식(반전 기준 accelerated): 멈춤 성공→다음 SSD 올림(어렵게), 실패→내림(쉽게).
  // 첫 반전(방향 바뀜) 전까지는 큰 스텝(100)으로 빠르게 접근, 그 후 작은 스텝(50)으로 미세조정.
  async function* mainTrials() {
    const schedule = buildSchedule(nGo, nStop);
    const total = schedule.length;
    let ssd = SSD_START;
    let step = SSD_STEP_BIG;  // 첫 반전 전
    let lastMove = null;      // 'up'(성공→올림) | 'down'(실패→내림)
    for (let i = 0; i < schedule.length; i++) {
      const dir = Math.random() < 0.5 ? 'left' : 'right';
      if (schedule[i] === 'go') {
        yield { type: 'go', dir, n: i + 1, total };
      } else {
        const o = yield { type: 'stop', dir, ssd, n: i + 1, total };
        const move = o && o.stopped ? 'up' : 'down';
        if (lastMove !== null && move !== lastMove) step = SSD_STEP; // 첫 반전 이후 작은 스텝
        ssd = move === 'up' ? Math.min(SSD_MAX, ssd + step) : Math.max(SSD_MIN, ssd - step);
        lastMove = move;
      }
    }
  }

  // 연습: go만 8개(규칙·방향 익힘)
  function buildPracticePool() {
    return Array.from({ length: 8 }, () => ({ type: 'go', dir: Math.random() < 0.5 ? 'left' : 'right' }));
  }

  function analyze(records, t) {
    const go = records.filter((r) => r.type === 'go');
    const goRTs = go.filter((r) => r.correct && r.rt != null && r.rt >= 100).map((r) => r.rt);
    const goMedian = med(goRTs);
    const goMean = goRTs.length ? goRTs.reduce((a, b) => a + b, 0) / goRTs.length : null;
    const stop = records.filter((r) => r.type === 'stop');
    const stopSucc = stop.filter((r) => r.stopped).length;
    const stopRate = stop.length ? stopSucc / stop.length : null;
    const ssds = stop.map((r) => r.ssd);
    // 임계 SSD = '반전 지점' SSD들의 평균(표준 계단식 문턱 추정). 멈춤 성공→올림, 실패→내림의
    // 방향이 바뀌는 시행의 SSD를 모은다. 방향이 한 번도 안 바뀌면(단조) 반전이 없어 추정 불가.
    const moves = stop.map((r) => (r.stopped ? 'up' : 'down'));
    const reversalSSDs = [];
    for (let i = 1; i < stop.length; i++) if (moves[i] !== moves[i - 1]) reversalSSDs.push(stop[i].ssd);
    const thresholdSSD = reversalSSDs.length ? reversalSSDs.reduce((a, b) => a + b, 0) / reversalSSDs.length : null;
    const noReversal = stop.length >= 2 && reversalSSDs.length === 0; // 단조 상승/하강으로 끝난 회차
    const ssrt = goMean != null && thresholdSSD != null ? Math.max(0, goMean - thresholdSSD) : null; // 거친 추정
    const ms = (v) => (v == null ? '—' : Math.round(v));
    const topNotes = [t('taskNote'), t('ssrtNote')];
    if (noReversal) topNotes.push(t('noReversalNote')); // 반전 없음 = 사실 진술(판정 아님)
    return {
      topNotes,
      series: [
        { key: 'goMedian', label: t('goRt'), value: goMedian, color: '#9e9e9e', group: 'rt' },
        { key: 'ssrt', label: t('ssrt'), value: ssrt, color: themeAccent(), group: 'rt' },
      ],
      summary: [
        { label: t('goRt'), value: ms(goMedian), unit: 'ms', count: goRTs.length },
        { label: t('ssrt'), value: ms(ssrt), unit: 'ms' },
        { label: t('stopRate'), value: stopRate == null ? '—' : Math.round(stopRate * 100), unit: '%', count: stop.length },
        { label: t('reversalSsd'), value: ms(thresholdSSD), unit: 'ms', count: reversalSSDs.length },
      ],
      extraHtml: ssdSparkline(ssds, t),
    };
  }

  runTask({
    id,
    mount: 'app',
    scale,
    family: 'inhibition',       // 파랑 (스트룹·Go/No-go·사이먼과 같은 계열)
    accent,
    conditionKeys: ['input'],   // 화살표는 언어 무관 → 입력 방식만 조건
    choices: [],                // 좌/우 버튼을 host 에 직접 그림
    buildPracticePool,
    mainTrials,
    playTrial,
    analyze,
    sessionAcc: () => null,     // ~50% 멈춤 성공이 설계상 정상 → 정확도 경고 끔
    strings: STRINGS,
  });
}

const STRINGS = {
  ko: {
    title: '멈추기 과제',
    howto: '화살표 <b>방향</b>의 버튼(또는 방향키 ← →)을 누르세요.<br>화살표가 <b>빨간색</b>으로 바뀌면 <i>누르지 말고 멈추세요.</i>',
    goRt: 'Go 중앙값 반응시간',
    ssrt: '추정 SSRT',
    stopRate: '멈춤 성공률',
    reversalSsd: '반전 지점 평균 SSD',
    ssdTrend: 'SSD 변화',
    trialAxis: '멈춤 시행',
    taskNote: 'Go/No-go가 하려던 행동을 처음부터 시작하지 않는 것이라면, 이 과제는 이미 시작한 행동을 도중에 멈추는 것입니다.',
    ssrtNote: 'SSRT는 거친 추정입니다: 평균 Go 반응시간에서 반전 지점 SSD 평균을 뺀 값이며, 정밀한 적분법이 아닙니다. 이 앱의 멈춤 시행은 8개(성인 16개)뿐이라 SSD가 자리를 잡기에는 너무 적어, 이 숫자는 회차마다 크게 달라집니다. 실제 연구는 멈춤 시행을 50개 이상 씁니다.',
    noReversalNote: '이 회차에는 멈춤 시행에서 방향이 한 번도 바뀌지 않아(계속 성공 또는 계속 실패) SSD가 자리를 잡지 못했고, SSRT를 추정할 수 없습니다.',
    diffInputReason: '입력 방식(키·터치·마우스)에 따라 멈추는 속도가 달라 결과에 영향을 줄 수 있습니다.',
  },
  en: {
    title: 'Stopping Task',
    howto: 'Press the button (or arrow key ← →) in the <b>direction</b> of the arrow.<br>If the arrow turns <b>red</b>, <i>stop — do not press.</i>',
    goRt: 'Go median RT',
    ssrt: 'Estimated SSRT',
    stopRate: 'Stop success rate',
    reversalSsd: 'Mean SSD at reversals',
    ssdTrend: 'SSD over trials',
    trialAxis: 'stop trial',
    taskNote: 'If Go/No-go is about not starting an action you were about to make, this task is about stopping an action you have already started.',
    ssrtNote: 'SSRT here is a rough estimate: mean Go reaction time minus the mean SSD at reversals. It is not the precise integration method. This app uses only 8 stop trials (16 for adults) — too few for the SSD to settle, so this number varies a lot from run to run. Real studies use 50 or more stop trials.',
    noReversalNote: 'In this run the direction never reversed across the stop trials (always stopped, or never stopped), so the SSD did not settle and SSRT cannot be estimated.',
    diffInputReason: 'How you respond (key, touch, mouse) changes how fast you can stop, so it can affect the result.',
  },
  zh: {
    title: '停止任务',
    howto: '按下与箭头<b>方向</b>相同的按钮（或方向键 ← →）。<br>如果箭头变<b>红</b>，请<i>停住，不要按。</i>',
    goRt: 'Go 反应时中位数',
    ssrt: '估计 SSRT',
    stopRate: '停止成功率',
    reversalSsd: '反转点平均 SSD',
    ssdTrend: 'SSD 随试次变化',
    trialAxis: '停止试次',
    taskNote: 'Go/No-go 是不去开始一个本打算做出的动作，而这个任务是把已经开始的动作在中途停下来。',
    ssrtNote: '这里的 SSRT 是粗略估计：平均 Go 反应时间减去反转点 SSD 的平均值，并非精确的积分法。本应用只有 8 个停止试次（成人 16 个），太少，SSD 来不及稳定，因此这个数值每次差别很大。真正的研究会使用 50 个以上的停止试次。',
    noReversalNote: '本次停止试次中方向从未反转（一直成功或一直失败），SSD 未能稳定，无法估计 SSRT。',
    diffInputReason: '不同的响应方式（按键、触摸、鼠标）会影响你停止的速度，可能影响结果。',
  },
  es: {
    title: 'Tarea de Detención',
    howto: 'Pulsa el botón (o la tecla de flecha ← →) en la <b>dirección</b> de la flecha.<br>Si la flecha se pone <b>roja</b>, <i>detente, no pulses.</i>',
    goRt: 'TR mediana Go',
    ssrt: 'SSRT estimado',
    stopRate: 'Tasa de detención',
    reversalSsd: 'SSD medio en reversiones',
    ssdTrend: 'SSD por ensayos',
    trialAxis: 'ensayo de detención',
    taskNote: 'Si Go/No-go trata de no iniciar una acción que ibas a hacer, esta tarea trata de detener una acción que ya has empezado.',
    ssrtNote: 'El SSRT aquí es una estimación aproximada: el tiempo de reacción Go medio menos el SSD medio en las reversiones. No es el método de integración preciso. Esta app usa solo 8 ensayos de detención (16 en adultos), demasiado pocos para que el SSD se estabilice, así que este número varía mucho entre rondas. Los estudios reales usan 50 o más ensayos de detención.',
    noReversalNote: 'En esta ronda la dirección nunca se invirtió en los ensayos de detención (siempre se detuvo o nunca), así que el SSD no se estabilizó y el SSRT no puede estimarse.',
    diffInputReason: 'Cómo respondes (tecla, táctil, ratón) cambia lo rápido que puedes detenerte, así que puede influir en el resultado.',
  },
};
