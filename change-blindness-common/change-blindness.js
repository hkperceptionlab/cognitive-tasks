// change-blindness-common/change-blindness.js — 변화맹(플리커 패러다임). 청소년·성인 앱이 공유.
//
// 무채색 도형 배열 A ↔ A′ 가 번갈아 깜빡인다. 딱 한 도형만 '크기'가 달라진다.
//   no-blank: A→A′ 바로 교체 → 바뀌는 자리에 깜빡임(transient)이 튀어 즉시 탐지(팝아웃, 대조군).
//   blank   : A→빈 화면(마스크)→A′ → transient 가 가려져 못 봄 = 변화맹.
// 바뀌는 도형을 찾아 클릭. 채점 = '제3의 방식': 탐지시간(찾은 시행만 중앙값) + 탐지율(찾은 비율).
//   ★"못 찾음"은 오류가 아니라 현상 — blank 미탐지는 절대 신뢰도 게이트 안 함.
//   신뢰도 축 = no-blank(팝아웃) 탐지율(sessionAcc): 팝아웃조차 못 맞히면 과제 미수행(무작위 클릭 포함).
//   score.js(부호 오차) 안 씀 — 이건 RT·탐지율 계열(vsearch에 가까움).
//
// 엔진 재사용: vsearch 흩뿌림(거부표집)만 차용. 응답은 2지선다 아니라 '항목 클릭'(dataset 히트).
//   커스텀 playTrial(플리커 루프+제한시간+못찾겠어요) + 정적 buildMainPool(blank/no-blank 균형).
//   conditionKeys ['input']: 주 지표가 탐지 RT(찾아서 클릭)라 입력수단 개입(vsearch·회전 논리). lang 제외.
//   자극 전부 무채색, accent 는 UI 전용. 바뀌는 도형 표식(data-changed)은 QA 봇에만(사람 DOM엔 없음).

import { runTask, QA } from '../core/engine.js';

const ITEM_GREY = '#6b6f76';                                   // 자극 색(중립 회색)
const DISPLAY_MS = QA ? 140 : 560;                             // 한 프레임(A 또는 A′) 표시
const BLANK_MS = QA ? 90 : 240;                                // blank 조건 마스크 시간
const LIMIT_MS = QA ? 3000 : 25000;                            // 한 시행 제한시간(초과=미탐지)
const FB_MS = 600, ITI_MS = 500;                              // 연습 피드백 / 시행 간 간격
const SIZE_PAIR = [28, 44];                                    // 바뀌는 도형의 두 크기(px, scale 전; 차이 살릴 만큼·둘 다 방해자 범위 내)

const themeAccent = () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#0E7C86';
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// 거부표집 흩뿌림(vsearch식): 정규화 좌표, setsize 에 맞춰 최소간격 자동·못 채우면 완화.
//   arena 가 4:3 이라 세로 1단위는 픽셀상 0.75배 → 거리 계산에 y 를 ARENA_AR(0.75)로 눌러
//   가로·세로가 픽셀상 균일 간격이 되게 한다(안 그러면 세로 이웃이 겹침).
const ARENA_AR = 0.75;
function scatter(n) {
  const pts = []; let min = 0.62 / Math.sqrt(n), guard = 0;
  while (pts.length < n) {
    guard++;
    const x = 0.09 + Math.random() * 0.82, y = 0.10 + Math.random() * 0.80;
    if (pts.every((p) => Math.hypot(p.x - x, (p.y - y) * ARENA_AR) >= min)) pts.push({ x, y });
    if (guard > 250) { guard = 0; min *= 0.9; }
  }
  return pts;
}

function injectStyles() {
  if (document.getElementById('cb-style')) return;
  const el = document.createElement('style');
  el.id = 'cb-style';
  el.textContent = `
.cb-wrap{position:relative;width:100%;min-height:56vh;display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:1.2rem;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.cb-rule{font-size:calc(1rem * var(--scale));line-height:1.5;color:var(--fg);background:#eef1f4;
  border:1px solid #dfe3e8;border-radius:12px;padding:.55rem .9rem;text-align:center;max-width:24rem}
.cb-rule b{color:var(--accent)}
.cb-arena{position:relative;width:min(94vw, calc(30rem * var(--scale)));aspect-ratio:4 / 3;
  background:#e8ebee;border:1px solid #dfe3e8;border-radius:12px;overflow:hidden;touch-action:manipulation}
.cb-arena.cb-blank .cb-item{visibility:hidden}       /* 마스크 = 항목만 숨김(균일 회색 arena 바탕이 마스크) */
.cb-item{position:absolute;transform:translate(-50%,-50%);border:none;background:${ITEM_GREY};padding:0;cursor:pointer;touch-action:manipulation}
.cb-square{border-radius:4px}
.cb-circle{border-radius:50%}
.cb-diamond{border-radius:4px}
.cb-diamond{transform:translate(-50%,-50%) rotate(45deg)}
.cb-item:active{filter:brightness(.88)}
.cb-giveup{font-size:calc(.95rem * var(--scale));font-weight:700;padding:.5rem 1rem;border-radius:10px;
  border:2px solid var(--muted);background:#fff;color:var(--muted);cursor:pointer}
.cb-status{min-height:calc(1.5rem * var(--scale));font-size:calc(1.1rem * var(--scale));font-weight:800}
.cb-status.ok{color:#2e7d32}.cb-status.no{color:#c62828}`;
  document.head.appendChild(el);
}

export function startChangeBlindness({ id, setsize, trialCap, scale = 1, accent }) {
  injectStyles();
  const CAP = QA ? 4 : trialCap;         // QA 축약: 시행 수(타이밍도 위 상수에서 축약, 자극·판정 불변)
  let wrap = null, ruleEl = null, arena = null, giveBtn = null, statusEl = null;
  let seqCounter = 0;

  function ensure(host) {
    if (wrap && host.contains(wrap)) return;
    host.innerHTML = '';
    wrap = document.createElement('div'); wrap.className = 'cb-wrap';
    ruleEl = document.createElement('div'); ruleEl.className = 'cb-rule';
    arena = document.createElement('div'); arena.className = 'cb-arena';
    giveBtn = document.createElement('button'); giveBtn.type = 'button'; giveBtn.className = 'cb-giveup';
    statusEl = document.createElement('div'); statusEl.className = 'cb-status';
    wrap.append(ruleEl, arena, giveBtn, statusEl);
    host.appendChild(wrap);
  }

  // ── 장면 생성: 흩뿌린 무채색 도형 setsize 개, 딱 하나만 두 크기(sa↔sb)를 오간다. ──
  //   방해자 크기에 두 크기(sa·sb)의 '쌍둥이'를 각각 최소 2개씩 심어, 어느 프레임에서도
  //   바뀌는 도형이 '유일한 극단'(제일 크거나 작음)이 안 되게 한다 → 정지 화면만 보고 찾는 꼼수 차단.
  //   변화(transient)로만 찾을 수 있어야 진짜 변화맹이 체험된다.
  function buildScene() {
    arena.innerHTML = '';
    const pts = scatter(setsize);
    const types = ['square', 'circle', 'diamond'];
    const ci = Math.floor(Math.random() * setsize);
    // 방해자 크기 풀: sa·sb 쌍둥이 각 2개 + 나머지는 [26,44] 무작위, 셔플.
    const nD = setsize - 1, dsizes = [];
    const twins = Math.min(2, nD >> 1);
    for (let k = 0; k < twins; k++) { dsizes.push(SIZE_PAIR[0], SIZE_PAIR[1]); }
    while (dsizes.length < nD) dsizes.push(26 + Math.round(Math.random() * 18));
    for (let k = dsizes.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [dsizes[k], dsizes[j]] = [dsizes[j], dsizes[k]]; }
    let di = 0;
    const els = []; let changedEl = null;
    pts.forEach((p, i) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'cb-item cb-' + types[Math.floor(Math.random() * types.length)];
      el.dataset.idx = String(i);
      el.style.left = (p.x * 100).toFixed(2) + '%';
      el.style.top = (p.y * 100).toFixed(2) + '%';
      if (i === ci) {
        const pair = Math.random() < 0.5 ? SIZE_PAIR : [SIZE_PAIR[1], SIZE_PAIR[0]];
        el.dataset.sa = String(Math.round(pair[0] * scale));
        el.dataset.sb = String(Math.round(pair[1] * scale));
        if (QA) el.dataset.changed = '1';         // 봇 전용: 사람이 보는 DOM엔 표식 없음(교훈5)
        changedEl = el;
      } else {
        const s = String(Math.round(dsizes[di++] * scale));  // 방해자: 두 프레임 동일(=변화 없음, transient 없음)
        el.dataset.sa = s; el.dataset.sb = s;
      }
      el.style.width = el.style.height = el.dataset.sa + 'px';
      arena.appendChild(el); els.push(el);
    });
    if (QA) arena.dataset.seq = String(++seqCounter);
    return { els, changedEl };
  }

  const applyFrame = (changedEl, frame) => { const px = frame ? changedEl.dataset.sb : changedEl.dataset.sa; changedEl.style.width = changedEl.style.height = px + 'px'; };

  async function playTrial(trial, ctx, phase) {
    const { host, t, delay, stampAfterPaint } = ctx;
    ensure(host);
    ruleEl.innerHTML = t('ruleLine');
    giveBtn.textContent = t('giveUp');
    statusEl.textContent = ''; statusEl.className = 'cb-status';
    const { els, changedEl } = buildScene();
    const blank = trial.condition === 'blank';
    arena.classList.remove('cb-blank');
    const state = { done: false, t0: 0 };

    const resp = await new Promise((resolve) => {
      const finish = (o) => { if (state.done) return; state.done = true; cleanup(); resolve(o); };
      const onShape = (e) => finish({ detected: true, correct: e.currentTarget === changedEl, rt: state.t0 ? performance.now() - state.t0 : 0, inputType: e.pointerType || 'mouse' });
      const onGive = () => finish({ detected: false, correct: false, gaveUp: true, rt: state.t0 ? performance.now() - state.t0 : 0 });
      const timer = setTimeout(() => finish({ detected: false, correct: false, timedOut: true, rt: LIMIT_MS }), LIMIT_MS);
      function cleanup() { els.forEach((el) => el.removeEventListener('pointerdown', onShape)); giveBtn.removeEventListener('click', onGive); clearTimeout(timer); }
      els.forEach((el) => el.addEventListener('pointerdown', onShape));
      giveBtn.addEventListener('click', onGive);
      stampAfterPaint().then((tp) => { if (!state.done) state.t0 = tp; });
      // ── 플리커 루프: A(sa) → [blank] → A′(sb) → [blank] → … 클릭·시간초과 때까지. ──
      (async () => {
        let frame = 0;
        while (!state.done) {
          applyFrame(changedEl, frame); arena.classList.remove('cb-blank');
          await delay(DISPLAY_MS);
          if (state.done) break;
          if (blank) { arena.classList.add('cb-blank'); await delay(BLANK_MS); }
          frame ^= 1;
        }
      })();
    });

    arena.classList.add('cb-blank');
    const correct = resp.detected && resp.correct;
    if (phase === 'practice') {
      statusEl.className = 'cb-status ' + (correct ? 'ok' : 'no');
      statusEl.textContent = correct ? t('fbOk') : (resp.detected ? t('fbNo') : t('fbMiss'));
      await delay(FB_MS);
    }
    const record = phase === 'main' ? {
      condition: trial.condition, detected: resp.detected, correct, isCorrect: correct,
      rt: Math.round(resp.rt), timedOut: !!resp.timedOut, gaveUp: !!resp.gaveUp,
      inputType: resp.inputType || null, setsize,
    } : null;
    arena.innerHTML = ''; statusEl.textContent = '';
    await delay(ITI_MS);
    return { record, outcome: { correct } };
  }

  // 정적 풀: blank/no-blank 균형(각 CAP/2), 순서 섞기는 엔진 orderByConstraint.
  function buildMainPool() {
    const per = Math.max(1, Math.round(CAP / 2));
    const trials = [];
    ['noblank', 'blank'].forEach((c) => { for (let i = 0; i < per; i++) trials.push({ condition: c }); });
    return trials;
  }

  // 연습 2: 두 조건 한 번씩(팝아웃·변화맹 모두 체험).
  function buildPracticePool() { return [{ condition: 'noblank' }, { condition: 'blank' }]; }

  function stat(records, key) {
    const rs = records.filter((r) => r.condition === key);
    const det = rs.filter((r) => r.correct);
    return { n: rs.length, detN: det.length, rate: rs.length ? det.length / rs.length : null, med: det.length ? median(det.map((r) => r.rt)) : null };
  }

  function analyze(records, t) {
    const acc = themeAccent();
    const nb = stat(records, 'noblank'), bl = stat(records, 'blank');
    const blankEffect = (nb.med != null && bl.med != null) ? bl.med - nb.med : null;

    const topNotes = [t('taskNote'), t('methodNote')];
    if (bl.n > 0 && bl.detN === 0) topNotes.push(t('blankMissedNote'));   // 현상: blank 전멸(변화맹 강함) — 게이트 아님
    if (nb.rate != null && nb.rate < 0.5) topNotes.push(t('lowEngageNote')); // 신뢰도: 팝아웃도 자주 놓침

    const pct = (v) => (v == null ? '—' : Math.round(v * 100));
    const ms = (v) => (v == null ? '—' : Math.round(v));

    if (QA) window.__cbLast = { nbRate: nb.rate, blRate: bl.rate, nbMed: nb.med == null ? null : Math.round(nb.med), blMed: bl.med == null ? null : Math.round(bl.med), blankEffect: blankEffect == null ? null : Math.round(blankEffect), n: records.length };

    return {
      topNotes,
      // 세션 추세 = 조건별 탐지시간 2줄(빈화면이 벌리는 간격). 전멸 조건은 null(요약·그래프 같은 게이트).
      series: [
        { key: 'nbRT', label: t('rtNoblank'), value: nb.med == null ? null : Math.round(nb.med), color: '#93C7CB' },
        { key: 'blRT', label: t('rtBlank'), value: bl.med == null ? null : Math.round(bl.med), color: acc },
      ],
      summary: [
        { label: t('rtNoblank'), value: ms(nb.med), unit: 'ms', count: nb.detN },
        { label: t('rateNoblank'), value: pct(nb.rate), unit: '%', count: nb.n },
        { label: t('rtBlank'), value: ms(bl.med), unit: 'ms', count: bl.detN },
        { label: t('rateBlank'), value: pct(bl.rate), unit: '%', count: bl.n },
        { label: t('blankEffect'), value: ms(blankEffect), unit: 'ms' },
        { label: t('trials'), value: records.length, unit: '' },
      ],
    };
  }

  runTask({
    id, mount: 'app', scale,
    family: 'perception', accent,
    conditionKeys: ['input'], choices: [],
    practiceCount: 2,
    buildPracticePool, buildMainPool, playTrial, analyze,
    // 신뢰도 축 = no-blank(팝아웃) 탐지율. blank 미탐지(현상)는 여기 안 들어감.
    sessionAcc: (recs) => { const nb = recs.filter((r) => r.condition === 'noblank'); return nb.length ? nb.filter((r) => r.correct).length / nb.length : null; },
    strings: STRINGS,
  });
}

const STRINGS = {
  ko: {
    title: '보고도 놓치는 변화',
    howto: '도형들이 깜빡이며 계속 나옵니다. 그중 <b>딱 하나</b>가 크기가 달라지길 반복합니다. 그 도형을 찾아 누르세요. 사이에 빈 화면이 끼면 놀랄 만큼 찾기 어렵습니다 — 그게 이 과제가 보여주려는 것입니다.',
    ruleLine: '<b>바뀌는 도형</b>을 찾아 누르세요',
    giveUp: '못 찾겠어요',
    fbOk: '✓ 맞았어요', fbNo: '✗ 그건 아니에요', fbMiss: '이번엔 못 찾았네요',
    rtNoblank: '바로 바뀔 때 탐지시간', rateNoblank: '바로 바뀔 때 탐지율',
    rtBlank: '빈 화면 끼면 탐지시간', rateBlank: '빈 화면 끼면 탐지율',
    blankEffect: '빈 화면이 늦춘 시간', trials: '시행 수',
    taskNote: '두 장면이 번갈아 나오는데 사이에 빈 화면이 끼면, 큰 변화도 잘 못 알아챕니다. 뇌가 장면을 사진처럼 통째로 저장하지 않고 주의를 둔 곳만 갱신하기 때문입니다. 못 찾는 것은 관찰력이나 능력의 문제가 아니라 정상적인 시각 처리의 결과입니다.',
    methodNote: '탐지시간은 변화를 찾아 누를 때까지 걸린 시간(찾은 시행만), 탐지율은 제한시간 안에 찾은 비율입니다. 빈 화면이 없으면 변화가 깜빡여 금방 눈에 띄고, 빈 화면이 끼면 그 신호가 가려집니다.',
    blankMissedNote: '이 회차에는 빈 화면 조건에서 변화를 하나도 못 찾아 그 조건의 탐지시간을 낼 수 없습니다 — 변화맹이 강하게 나타난 경우입니다.',
    lowEngageNote: '빈 화면이 없을 때(변화가 바로 깜빡일 때)도 자주 못 찾았다면, 이 회차 값은 해석하기 어렵습니다.',
  },
  en: {
    title: 'The Change You Look Right Past',
    howto: 'Shapes keep flashing on and off. <b>Just one</b> of them keeps changing size. Find it and tap it. When a blank screen slips in between, it becomes surprisingly hard to spot — that is what this task is about.',
    ruleLine: 'Find and tap the <b>shape that changes</b>',
    giveUp: 'Can’t find it',
    fbOk: '✓ That’s it', fbNo: '✗ Not that one', fbMiss: 'Missed it this time',
    rtNoblank: 'Detection time, no blank', rateNoblank: 'Detection rate, no blank',
    rtBlank: 'Detection time, with blank', rateBlank: 'Detection rate, with blank',
    blankEffect: 'Slowdown from the blank', trials: 'Trials',
    taskNote: 'When two scenes alternate with a blank screen between them, even a large change is easy to miss. The brain does not store a scene like a photograph; it updates only where you attend. Missing it is not a lack of observation or ability — it is normal visual processing.',
    methodNote: 'Detection time is how long until you found and tapped the change (found trials only); detection rate is how often you found it within the time limit. Without a blank the change flickers and pops out; with a blank that signal is masked.',
    blankMissedNote: 'In this run the change was never found in the with-blank condition, so its detection time cannot be given — a strong case of change blindness.',
    lowEngageNote: 'If the change was often missed even without a blank (when it flickers directly), the values in this run are hard to interpret.',
  },
  zh: {
    title: '看着也会漏掉的变化',
    howto: '图形不断闪现。其中<b>只有一个</b>会反复改变大小。找到它并点击。当中间夹入空白画面时，会变得出奇地难找——这正是本任务要展示的。',
    ruleLine: '找出并点击<b>会变化的图形</b>',
    giveUp: '找不到',
    fbOk: '✓ 就是它', fbNo: '✗ 不是这个', fbMiss: '这次没找到',
    rtNoblank: '无空白时探测时间', rateNoblank: '无空白时探测率',
    rtBlank: '夹空白时探测时间', rateBlank: '夹空白时探测率',
    blankEffect: '空白造成的延迟', trials: '试次数',
    taskNote: '两个画面交替出现、中间夹入空白时，即使很大的变化也容易漏掉。大脑并不像照片那样整体保存场景，而只更新你注意到的地方。没找到不是观察力或能力的问题，而是正常视觉处理的结果。',
    methodNote: '探测时间是找到并点击变化所用的时间（仅找到的试次）；探测率是在限时内找到的比例。没有空白时变化会闪烁而突显；夹入空白则遮蔽了这个信号。',
    blankMissedNote: '本次在夹空白条件下一个都没找到，因此无法给出该条件的探测时间——这是变化盲很强的一次。',
    lowEngageNote: '如果连没有空白（变化直接闪烁）时也经常找不到，本次数值就难以解释。',
  },
  es: {
    title: 'El Cambio que Miras sin Ver',
    howto: 'Las figuras parpadean sin parar. <b>Solo una</b> cambia de tamaño una y otra vez. Encuéntrala y tócala. Cuando entre una pantalla en blanco, se vuelve sorprendentemente difícil de detectar — de eso trata esta tarea.',
    ruleLine: 'Encuentra y toca la <b>figura que cambia</b>',
    giveUp: 'No la encuentro',
    fbOk: '✓ Esa es', fbNo: '✗ Esa no', fbMiss: 'Esta vez no la viste',
    rtNoblank: 'Tiempo de detección, sin blanco', rateNoblank: 'Tasa de detección, sin blanco',
    rtBlank: 'Tiempo de detección, con blanco', rateBlank: 'Tasa de detección, con blanco',
    blankEffect: 'Retraso por el blanco', trials: 'Ensayos',
    taskNote: 'Cuando dos escenas se alternan con una pantalla en blanco entre ellas, hasta un cambio grande es fácil de pasar por alto. El cerebro no guarda la escena como una foto; solo actualiza donde prestas atención. No verlo no es falta de observación ni de capacidad — es procesamiento visual normal.',
    methodNote: 'El tiempo de detección es cuánto tardaste en encontrar y tocar el cambio (solo ensayos hallados); la tasa es con qué frecuencia lo hallaste dentro del límite. Sin blanco el cambio parpadea y resalta; con blanco esa señal queda enmascarada.',
    blankMissedNote: 'En esta ronda no se halló el cambio en la condición con blanco, así que no puede darse su tiempo de detección — un caso fuerte de ceguera al cambio.',
    lowEngageNote: 'Si el cambio se pasó por alto a menudo incluso sin blanco (cuando parpadea directamente), los valores de esta ronda son difíciles de interpretar.',
  },
};
