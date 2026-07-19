// sart-common/sart.js — "무심코 누르는 순간"(SART, Sustained Attention to Response Task). 청소년·성인 공유.
//
// 숫자 1~9가 하나씩 빠르게 지나간다(같은 숫자 연속 없음). 3이 아니면 누르고, 3이면 그대로 둔다.
// Go/No-go 와 구조는 닮았지만 목적이 다르다 — '충동을 참는지'가 아니라 '반복되는 흐름 속에서
//   주의가 얼마나 이어지는지(잠깐 딴생각으로 흐르는지)'를 본다. 텍스트는 '놓침·딴생각·흐름' 어휘만.
//
// 타이밍: 숫자 250ms → 마스크 800ms(총 1050ms/시행), 이 구간까지 응답 인정. 청소년·성인 동일
//   (자동성 유도가 핵심이라 늦추면 과제 성격이 깨진다). 화면 크기만 성인 1.5×.
//
// 엔진 훅: mainTrials/practiceTrials(생성기, 순서=자극이라 orderByConstraint 회피) + playTrial(빠른 스트림) +
//   sessionAcc 기본(진짜 오답 있는 과제 → 정확도 경고 ON) + conditionKeys ['input'](숫자는 언어무관, RT 잼).
//
// 자극(숫자)은 무채색 검정. accent(마음챙김 자보라)는 UI(버튼·배너 강조어·차트)에만.

import { runTask, QA } from '../core/engine.js';

const TARGET = 3;
const GO_DIGITS = [1, 2, 4, 5, 6, 7, 8, 9]; // 3(목표) 제외
const STIM_MS = 250;      // 숫자 노출
const TOTAL_MS = 1050;    // 시행 전체(숫자 250 + 마스크 800). 이 구간까지 응답 인정.
const MASK = '✳';         // 숫자를 덮는 마스크(비숫자, 무채색)
const FB_MS = 500;
const TARGET_RATE = 0.11; // 목표(3) 빈도 ≈ 11%

const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const themeAccent = () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#5C4A73';
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const sd = (a) => { if (a.length < 2) return null; const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); };

// 숫자열 생성: 목표(3)를 구간별로 하나씩 흩어(≈11%·연속 없음), 나머지는 go 숫자(직전과 다른 값).
function buildStream(N, nTargets) {
  const seq = new Array(N).fill(null);
  const seg = N / nTargets;
  const used = new Set();
  for (let k = 0; k < nTargets; k++) {
    let pos, guard = 0;
    do { pos = Math.floor(k * seg + Math.random() * seg); guard++; } while ((pos < 0 || pos >= N || used.has(pos) || seq[pos - 1] === TARGET || seq[pos + 1] === TARGET) && guard < 50);
    if (pos < 0 || pos >= N || used.has(pos)) { pos = seq.indexOf(null); }
    used.add(pos); seq[pos] = TARGET;
  }
  let prev = null;
  for (let i = 0; i < N; i++) {
    if (seq[i] === TARGET) { prev = TARGET; continue; }
    let d; do { d = GO_DIGITS[Math.floor(Math.random() * GO_DIGITS.length)]; } while (d === prev);
    seq[i] = d; prev = d;
  }
  return seq;
}

// 이번 회차 go 반응시간 궤적(extraHtml). 반복 속 '흔들림/흐름'을 보여줌. 색 var(--accent), 라벨 t(), 판정문구 없음.
function rtSparkline(rts, t) {
  if (rts.length < 2) return '';
  const W = 320, H = 96, padL = 40, padR = 10, padT = 12, padB = 22;
  let min = Math.min(...rts), max = Math.max(...rts);
  if (min === max) { min -= 50; max += 50; }
  const x = (i) => padL + (i * (W - padL - padR)) / (rts.length - 1);
  const y = (v) => H - padB - ((v - min) / (max - min)) * (H - padT - padB);
  const pts = rts.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const yTicks = `<text x="4" y="${y(max) + 4}" class="axis">${Math.round(max)}</text>` +
                 `<text x="4" y="${y(min) + 4}" class="axis">${Math.round(min)}</text>`;
  const xLabel = `<text x="${(padL + W - padR) / 2}" y="${H - 4}" text-anchor="middle" class="axis">${t('rtAxis')}</text>`;
  return `<div class="sart-spark"><h3 class="graph-title">${t('rtTrend')}</h3>` +
    `<svg viewBox="0 0 ${W} ${H}" class="graph" role="img" aria-label="${t('rtTrend')}">` +
    `<polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2"/>${yTicks}${xLabel}</svg></div>`;
}

function injectStyles() {
  if (document.getElementById('sart-style')) return;
  const el = document.createElement('style');
  el.id = 'sart-style';
  el.textContent = `
.sart-wrap{position:relative;width:100%;min-height:56vh;display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:2rem;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.sart-rule{font-size:calc(1.05rem * var(--scale));line-height:1.5;color:var(--fg);background:#f0edf4;
  border:1px solid #e2dcec;border-radius:12px;padding:.55rem .95rem;text-align:center}
.sart-rule b{color:var(--accent)}
.sart-digit{font-size:calc(clamp(4.5rem,30vw,9rem) * var(--scale));font-weight:800;line-height:1;color:#111;
  min-height:calc(clamp(4.5rem,30vw,9rem) * var(--scale));display:flex;align-items:center}
.sart-digit.mask{color:var(--muted);font-weight:600}
.sart-btn{min-width:calc(9rem * var(--scale));min-height:calc(4rem * var(--scale));border:none;border-radius:16px;
  background:var(--accent);color:#fff;font-size:calc(1.4rem * var(--scale));font-weight:800;cursor:pointer;
  box-shadow:0 2px 10px rgba(0,0,0,.18);touch-action:manipulation}
.sart-btn:active{transform:scale(.97)}
.sart-status{min-height:calc(1.6rem * var(--scale));font-size:calc(1.1rem * var(--scale));font-weight:800}
.sart-status.ok{color:#2e7d32}.sart-status.no{color:#c62828}
.sart-spark{margin:.2rem 0 .4rem}`;
  document.head.appendChild(el);
}

function analyze(records, t) {
  const targets = records.filter((r) => r.isTarget);
  const gos = records.filter((r) => !r.isTarget);
  // 핵심: 목표(3)를 놓쳐 눌러버린 비율.
  const missPress = targets.filter((r) => r.pressed).length;
  const targetErrRate = targets.length ? missPress / targets.length : null;
  // go 정확도(눌러야 할 때 누른 비율).
  const goHit = gos.filter((r) => r.pressed).length;
  const goAcc = gos.length ? goHit / gos.length : null;
  // 보너스: 정상 반응 RT의 흔들림(표준편차). 유효 go RT(누름·200~1050) 기준.
  const goRts = gos.filter((r) => r.pressed && r.rt != null && r.rt >= 200 && r.rt <= TOTAL_MS).map((r) => r.rt);
  const rtSd = sd(goRts);
  const overall = records.length ? records.filter((r) => r.isCorrect).length / records.length : 0;

  const topNotes = [t('taskNote'), t('sampleNote')];
  if (records.length && overall < 0.9) topNotes.push(t('lowAccuracy'));

  // QA 자동점검용: 봇이 판정값을 읽어 오류율·정확도를 확인(?qa=1 에서만 노출).
  if (QA) window.__sartLast = {
    targetErr: targetErrRate == null ? null : Math.round(targetErrRate * 100),
    goAcc: goAcc == null ? null : Math.round(goAcc * 100),
    rtSd: rtSd == null ? null : Math.round(rtSd),
    overall: Math.round(overall * 100), nTargets: targets.length,
  };

  const pct = (v) => (v == null ? '—' : Math.round(v * 100));
  const msv = (v) => (v == null ? '—' : Math.round(v));
  return {
    topNotes,
    series: [
      { key: 'targetErr', label: t('targetErr'), value: targetErrRate == null ? null : Math.round(targetErrRate * 100), color: themeAccent(), group: 'err' },
      { key: 'rtSd', label: t('rtSd'), value: rtSd == null ? null : Math.round(rtSd), color: '#9e9e9e', group: 'sd' },
    ],
    summary: [
      { label: t('targetErr'), value: pct(targetErrRate), unit: '%', count: targets.length },
      { label: t('goAcc'), value: pct(goAcc), unit: '%', count: gos.length },
      { label: t('rtSd'), value: msv(rtSd), unit: 'ms', count: goRts.length },
    ],
    extraHtml: rtSparkline(goRts, t),
  };
}

export function startSART({ id, trials, scale = 1, accent }) {
  injectStyles();
  const N = QA ? 18 : trials;
  const nTargets = Math.max(2, Math.round(N * TARGET_RATE)); // 목표 최소 2(오류율 분모 확보)
  let wrap = null, ruleEl = null, digitEl = null, btn = null, statusEl = null;
  let seqCounter = 0;

  function ensure(host) {
    if (wrap && host.contains(wrap)) return;
    host.innerHTML = '';
    wrap = document.createElement('div'); wrap.className = 'sart-wrap';
    ruleEl = document.createElement('div'); ruleEl.className = 'sart-rule';
    digitEl = document.createElement('div'); digitEl.className = 'sart-digit';
    btn = document.createElement('button'); btn.type = 'button'; btn.className = 'sart-btn';
    statusEl = document.createElement('div'); statusEl.className = 'sart-status';
    wrap.append(ruleEl, digitEl, btn, statusEl);
    host.appendChild(wrap);
  }

  async function playTrial(trial, ctx, phase) {
    const { host, t, stampAfterPaint, delay } = ctx;
    ensure(host);
    ruleEl.innerHTML = t('ruleLine');
    btn.textContent = t('tapBtn');
    // 진행표시: 본시행은 "본시행 N", 연습은 "연습". 연습에도 설정해야 재시작 후 이전 회차의 낡은 라벨이 안 남는다.
    ctx.setProgress(() => (phase === 'main' ? `${t('mainLabel')} ${trial.n}` : t('practiceLabel')));

    // 응답 리스너를 자극 페인트 전에 부착(첫 프레임 반응도 인정). 응답창 = 전체 1050ms(숫자+마스크).
    let pressT = null, pressType = null;
    const onDown = (e) => { if (pressT == null) { pressT = performance.now(); pressType = e.pointerType || 'mouse'; } };
    const onKey = (e) => { if ((e.key === ' ' || e.key === 'Enter') && pressT == null) { pressT = performance.now(); pressType = 'keyboard'; } };
    btn.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);

    digitEl.textContent = String(trial.digit); digitEl.className = 'sart-digit';
    statusEl.textContent = ''; statusEl.className = 'sart-status';
    // 봇/디버그가 시행을 '보고' 구분(사람이 보는 숫자 그대로). QA(?qa=1)에서만 노출 — 실제 사용자 DOM엔 없음.
    if (QA) { wrap.dataset.seq = String(++seqCounter); wrap.dataset.digit = String(trial.digit); }
    const t0 = await stampAfterPaint();
    await delay(STIM_MS);
    digitEl.textContent = MASK; digitEl.className = 'sart-digit mask';   // 마스크로 덮음
    await delay(TOTAL_MS - STIM_MS);
    digitEl.textContent = ''; digitEl.className = 'sart-digit';

    btn.removeEventListener('pointerdown', onDown);
    window.removeEventListener('keydown', onKey);

    const pressed = pressT != null;
    const isTarget = trial.digit === TARGET;
    const isCorrect = isTarget ? !pressed : pressed; // 3=안 누름이 정답, 그 외=누름이 정답
    const rt = pressed ? pressT - t0 : null;

    if (phase === 'practice') { // 연습만 피드백(상태줄). 본시행 무피드백.
      statusEl.className = 'sart-status ' + (isCorrect ? 'ok' : 'no');
      statusEl.textContent = isCorrect ? t('fbOk') : t('fbNo');
      await delay(FB_MS);
      statusEl.textContent = ''; statusEl.className = 'sart-status';
    }

    const record = phase === 'main'
      ? { condition: isTarget ? 'target' : 'go', digit: trial.digit, isTarget, pressed, isCorrect, rt, inputType: pressed ? pressType : null }
      : null;
    return { record, outcome: { success: isCorrect } };
  }

  // 본시행: 미리 만든 숫자열(순서=자극)을 그대로 흘린다.
  async function* mainTrials() {
    const seq = buildStream(N, nTargets);
    for (let i = 0; i < seq.length; i++) yield { digit: seq[i], n: i + 1 };
  }

  // 연습: 짧게, 단 목표(3) 최소 2회 포함(본시행에서 3을 처음 만나지 않게).
  async function* practiceTrials() {
    const len = QA ? 6 : 12;
    const nt = 2;
    const seq = buildStream(len, nt);
    for (const d of seq) yield { digit: d };
  }

  runTask({
    id,
    mount: 'app',
    scale,
    family: 'mindfulness',      // 차분한 자보라
    accent,
    conditionKeys: ['input'],   // 숫자는 언어무관(그 자체로 동일) · RT 잼 → 입력만
    choices: [],                // 반응 버튼을 host 에 직접 그림
    practiceTrials,
    mainTrials,
    playTrial,
    analyze,                    // sessionAcc 미지정 → 엔진 기본(정확도 경고 ON)
    strings: STRINGS,
  });
}

const STRINGS = {
  ko: {
    title: '무심코 누르는 순간',
    howto: '숫자가 하나씩 빠르게 지나갑니다.<br><b>3이 아니면 누르고, 3이 나오면 그대로 두세요.</b><br>반복되는 흐름 속에서 주의가 얼마나 이어지는지 봅니다.',
    ruleLine: '<b>3이 아니면</b> 누르기 · <b>3이면</b> 그대로',
    tapBtn: '누르기',
    targetErr: '3을 놓쳐 누른 비율',
    goAcc: '반응 정확도',
    rtSd: '반응 흔들림',
    rtTrend: '반응 시간의 흐름',
    rtAxis: '반응한 순서',
    taskNote: '같은 동작이 반복되면 손이 저절로 움직여, 3이 지나가는 것을 무심코 놓치기 쉽습니다. 이 과제는 그 반복 속에서 주의가 얼마나 이어지는지, 잠깐 딴생각으로 흐르는지를 봅니다.',
    sampleNote: '3이 나오는 횟수가 많지 않아, 놓쳐 누른 비율은 회차마다 크게 달라질 수 있습니다. 정밀한 측정이 아닙니다.',
    fbOk: '✓ 맞아요',
    fbNo: '✗ 아니에요',
    diffInputReason: '입력 방식(키·터치·마우스)에 따라 누르는 속도가 달라 반응 시간에 영향을 줄 수 있습니다.',
  },
  en: {
    title: 'When You Press Without Noticing',
    howto: 'Numbers go by one at a time, quickly.<br><b>Press for anything but 3; when 3 appears, just let it pass.</b><br>It looks at how well your attention stays with a repeating flow.',
    ruleLine: 'Press <b>if not 3</b> · <b>if 3</b>, leave it',
    tapBtn: 'Press',
    targetErr: 'Pressed on 3 (missed it)',
    goAcc: 'Response accuracy',
    rtSd: 'Response wobble',
    rtTrend: 'Flow of response time',
    rtAxis: 'response order',
    taskNote: 'When the same action repeats, the hand starts moving on its own, and it is easy to let a 3 slip by without noticing. This task looks at how well your attention stays with the repeating flow, and whether it drifts off for a moment.',
    sampleNote: '3 does not appear many times, so the "pressed on 3" rate can vary a lot from run to run. This is not a precise measurement.',
    fbOk: '✓ Correct',
    fbNo: '✗ Not this one',
    diffInputReason: 'How you respond (key, touch, mouse) changes how fast you press, so it can affect response time.',
  },
  zh: {
    title: '不经意按下的瞬间',
    howto: '数字一个接一个快速经过。<br><b>不是 3 就按，出现 3 就让它过去。</b><br>看你的注意力在重复的流动中能保持多久。',
    ruleLine: '<b>不是 3</b> 就按 · <b>是 3</b> 就放着',
    tapBtn: '按',
    targetErr: '对 3 按下（漏看）比例',
    goAcc: '反应正确率',
    rtSd: '反应起伏',
    rtTrend: '反应时间的流动',
    rtAxis: '反应顺序',
    taskNote: '当同一个动作不断重复，手会自己动起来，很容易在不经意间让 3 溜过去。这个任务看的是你的注意力在重复流动中能保持多久，会不会有片刻飘到别处。',
    sampleNote: '3 出现的次数不多，所以“对 3 按下”的比例每次差别很大。这不是精确测量。',
    fbOk: '✓ 对了',
    fbNo: '✗ 不是这个',
    diffInputReason: '不同的输入方式（按键、触摸、鼠标）会影响你按下的速度，可能影响反应时间。',
  },
  es: {
    title: 'Cuando Pulsas Sin Darte Cuenta',
    howto: 'Los números pasan uno a uno, rápido.<br><b>Pulsa con cualquiera menos el 3; cuando salga un 3, déjalo pasar.</b><br>Observa cuánto se mantiene tu atención en un flujo que se repite.',
    ruleLine: 'Pulsa <b>si no es 3</b> · <b>si es 3</b>, déjalo',
    tapBtn: 'Pulsar',
    targetErr: 'Pulsaste en el 3 (se te pasó)',
    goAcc: 'Precisión de respuesta',
    rtSd: 'Oscilación de respuesta',
    rtTrend: 'Flujo del tiempo de respuesta',
    rtAxis: 'orden de respuesta',
    taskNote: 'Cuando la misma acción se repite, la mano empieza a moverse sola, y es fácil dejar pasar un 3 sin darte cuenta. Esta tarea observa cuánto se mantiene tu atención en el flujo repetido, y si se va por un momento.',
    sampleNote: 'El 3 no aparece muchas veces, así que la tasa de "pulsar en el 3" varía mucho entre rondas. No es una medición precisa.',
    fbOk: '✓ Correcto',
    fbNo: '✗ Este no',
    diffInputReason: 'Cómo respondes (tecla, táctil, ratón) cambia lo rápido que pulsas, así que puede afectar el tiempo de respuesta.',
  },
};
