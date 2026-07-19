// emo-dotprobe-common/emo-dotprobe.js — 정서 점탐사(Emotional Dot-Probe). 청소년·성인 공유. 마음챙김 계열 4번째(최종).
//
// 좌우에 두 단어(정서 하나 + 중립 하나)를 잠깐 보여준 뒤, 한쪽에 점(프로브)이 나타나면 그 쪽을 최대한
// 빨리 누른다. 정서 단어 쪽에 점이 뜨는 '일치' 시행이 반대쪽 '불일치'보다 빠르면, 주의가 정서 단어
// 쪽으로 살짝 끌린 것 → 편향 = 불일치RT − 일치RT (긍정·부정 분리). 양수=쏠림, 음수=반대.
//
// ★ 단어 재사용: 정서 스트룹의 24칸 WORD_DATA 를 import(단일 출처). 여기선 무채색 텍스트로 좌우 제시.
// ★ 엔진 재사용: vsearch 구조(커스텀 playTrial + 생성기 + host 직접 버튼 + 방향키 + ctx 헬퍼). stroop
//   choices 경로가 아님. family=mindfulness(자보라), conditionKeys ['lang','input'].
// ★ 임상 어휘 전면 배제(§0.1): "정서 쪽으로 빨리/느리게 = 성향/우울/불안"으로 읽히면 안 된다. 편향
//   방향/크기는 정상 결과라 경고로 안 묶고(§6), '회피/과각성' 같은 해석어도 안 쓴다.
// ★ 두 게이트 독립(§0.3): A=위치응답 정확도(<90% 경고=신뢰도 축) / B=편향 게이트(셀당 유효≥6일 때만
//   숫자, 요약·그래프 동일). 서로 안 섞인다.

import { runTask, QA } from '../core/engine.js';
import { WORD_DATA } from '../emo-stroop-common/emo-stroop.js'; // 24칸 매트릭스 단일 출처 재사용

const VALENCES = ['positive', 'negative'];
const SIDES = ['left', 'right'];
const ABBR = { positive: 'pos', negative: 'neg' };
const WORD_MS = 500;       // 단어쌍 노출(고전 dot-probe 표준). 타이밍은 자극 성격이라 QA에서도 안 줄임.
const RESP_LIMIT = 2500;   // 프로브 응답창(자기종료). 초과=무효(엔진 rtValid 200~3000 안).
const FB_MS = 550;
const MIN_VALID = 6;       // 편향값은 (정서가×일치/불일치) 각 셀 유효 ≥ 이때만(스트룹 게이트와 동일).
const other = (s) => (s === 'left' ? 'right' : 'left');

const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// WORD_DATA → t() 키(w_<set>_<ab>_<i>) 주입: 단어를 ctx.t 로 현재언어 조회(정서 스트룹과 동일 패턴).
function injectWords(strings) {
  for (const set of ['youth', 'adults'])
    for (const ab of ['pos', 'neg', 'neu'])
      for (const lang of ['ko', 'en', 'es', 'zh'])
        WORD_DATA[set][ab][lang].forEach((w, i) => { strings[lang]['w_' + set + '_' + ab + '_' + i] = w; });
}

function injectStyles() {
  if (document.getElementById('dp-style')) return;
  const el = document.createElement('style');
  el.id = 'dp-style';
  el.textContent = `
.dp-wrap{position:relative;width:100%;display:flex;flex-direction:column;align-items:center;
  gap:1.1rem;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.dp-rule{font-size:calc(1.05rem * var(--scale));line-height:1.5;color:var(--fg);background:#f4f1f6;
  border:1px solid #e6e0ec;border-radius:12px;padding:.55rem .95rem;text-align:center}
.dp-rule b{color:var(--accent)}
.dp-arena{position:relative;width:min(92vw,460px);height:min(30vh,200px);border-radius:16px;
  background:#fff;box-shadow:inset 0 0 0 1px #ececec}
.dp-fix{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
  font-size:calc(2.2rem * var(--scale));color:var(--muted);font-weight:700}
.dp-slot{position:absolute;top:50%;transform:translate(-50%,-50%);width:42%;text-align:center;
  font-size:calc(1.35rem * var(--scale));font-weight:700;color:#212121;word-break:keep-all}
.dp-slot.left{left:25%}.dp-slot.right{left:75%}
.dp-probe{position:absolute;top:50%;transform:translate(-50%,-50%);
  width:calc(1.1rem * var(--scale));height:calc(1.1rem * var(--scale));border-radius:50%;background:#212121;display:none}
.dp-probe.left{left:25%;display:block}.dp-probe.right{left:75%;display:block}
.dp-pad{display:flex;gap:1.2rem}
.dp-btn{min-width:calc(6.4rem * var(--scale));min-height:calc(3.4rem * var(--scale));border:none;border-radius:14px;
  background:var(--accent);color:#fff;font-size:calc(1.25rem * var(--scale));font-weight:800;cursor:pointer;
  box-shadow:0 2px 8px rgba(0,0,0,.16);touch-action:manipulation}
.dp-btn:active{transform:scale(.97)}
.dp-btn[disabled]{opacity:.4;cursor:default}
.dp-status{min-height:calc(1.6rem * var(--scale));font-size:calc(1.1rem * var(--scale));font-weight:800}
.dp-status.ok{color:#2e7d32}.dp-status.no{color:#c62828}`;
  document.head.appendChild(el);
}

// ── 결과 계산(순수 함수, 최상위) ─────────────────────────────────────
function cellStats(records, valence, congruent) {
  const rs = records.filter((r) => r.rtValid && r.valence === valence && r.congruent === congruent).map((r) => r.rt);
  const mean = rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null;
  return { mean, count: rs.length };
}

function analyze(records, t) {
  const acc = records.length ? records.filter((r) => r.isCorrect).length / records.length : 0;
  const C = {};
  for (const v of VALENCES) for (const cong of [true, false]) C[`${v}_${cong}`] = cellStats(records, v, cong);
  // 게이트 B(편향): 일치·불일치 두 셀 각각 유효 ≥ MIN_VALID 일 때만 숫자. 같은 null 이 요약·그래프에 동일 적용(교훈3).
  const gate = (a, b) => a.mean != null && b.mean != null && a.count >= MIN_VALID && b.count >= MIN_VALID;
  const bias = {}; // 편향 = 불일치RT − 일치RT (양수=정서 쪽으로 더 빨리 = 주의 쏠림)
  for (const v of VALENCES) bias[v] = gate(C[`${v}_true`], C[`${v}_false`]) ? C[`${v}_false`].mean - C[`${v}_true`].mean : null;
  const ms = (x) => (x == null ? '—' : Math.round(x));
  // 게이트 A(위치응답 정확도)만 신뢰도 축. 편향 방향/크기는 정상 결과라 경고로 안 묶음(§6·§0.3) → 두 게이트 독립.
  const topNotes = records.length && acc < 0.9 ? [t('lowAccuracy')] : [];
  if (QA) window.__dpLast = {
    acc, negBias: bias.negative, posBias: bias.positive,
    counts: Object.fromEntries(Object.entries(C).map(([k, c]) => [k, c.count])), lowAcc: topNotes.length > 0,
  };
  return {
    topNotes,
    series: [
      { key: 'neg_cong',   label: t('rtNegCong'),   value: C.negative_true.mean,  color: '#8a8a8a', group: 'rt' },
      { key: 'neg_incong', label: t('rtNegIncong'), value: C.negative_false.mean, color: '#e53935', group: 'rt' },
      { key: 'pos_cong',   label: t('rtPosCong'),   value: C.positive_true.mean,  color: '#8a8a8a', group: 'rt' },
      { key: 'pos_incong', label: t('rtPosIncong'), value: C.positive_false.mean, color: '#2e9e4f', group: 'rt' },
      { key: 'negBias',    label: t('negBias'),     value: bias.negative, color: '#5C4A73', group: 'bias' },
      { key: 'posBias',    label: t('posBias'),     value: bias.positive, color: '#5C4A73', group: 'bias' },
    ],
    summary: [
      { label: t('accuracy'),    value: Math.round(acc * 100), unit: '%' },
      { label: t('rtNegCong'),   value: ms(C.negative_true.mean),  unit: 'ms', count: C.negative_true.count },
      { label: t('rtNegIncong'), value: ms(C.negative_false.mean), unit: 'ms', count: C.negative_false.count },
      { label: t('negBias'),     value: ms(bias.negative), unit: 'ms' },
      { label: t('rtPosCong'),   value: ms(C.positive_true.mean),  unit: 'ms', count: C.positive_true.count },
      { label: t('rtPosIncong'), value: ms(C.positive_false.mean), unit: 'ms', count: C.positive_false.count },
      { label: t('posBias'),     value: ms(bias.positive), unit: 'ms' },
    ],
    extraHtml: `<p style="margin:1rem 0 0;padding:.8rem 1rem;background:#f4f1f6;border:1px solid #e6e0ec;border-radius:12px;line-height:1.7;text-align:left;color:#555;font-size:.95rem">${t('valenceNote')}</p>`,
  };
}

export function startEmoDotprobe({ id, wordSet, reps, scale = 1 }) {
  injectStyles();
  injectWords(STRINGS);
  const R = QA ? 4 : reps; // QA 도 편향 게이트(≥6) 검증 위해 셀당 충분히(reps4 → (정서가×일치/불일치)셀당 8)
  let wrap = null, ruleEl = null, arena = null, fixEl = null, probeEl = null, slotL = null, slotR = null, statusEl = null, btns = [];
  let seq = 0;

  function ensure(host) {
    if (wrap && host.contains(wrap)) return;
    host.innerHTML = '';
    wrap = document.createElement('div'); wrap.className = 'dp-wrap';
    ruleEl = document.createElement('div'); ruleEl.className = 'dp-rule';
    arena = document.createElement('div'); arena.className = 'dp-arena';
    fixEl = document.createElement('div'); fixEl.className = 'dp-fix';
    slotL = document.createElement('div'); slotL.className = 'dp-slot left';
    slotR = document.createElement('div'); slotR.className = 'dp-slot right';
    probeEl = document.createElement('div'); probeEl.className = 'dp-probe';
    arena.append(fixEl, slotL, slotR, probeEl);
    const pad = document.createElement('div'); pad.className = 'dp-pad';
    btns = SIDES.map((side) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'dp-btn'; b.dataset.side = side; b.disabled = true;
      pad.appendChild(b);
      return b;
    });
    statusEl = document.createElement('div'); statusEl.className = 'dp-status';
    wrap.append(ruleEl, arena, pad, statusEl);
    host.appendChild(wrap);
  }
  const setSlots = (l, r) => { slotL.textContent = l; slotR.textContent = r; };
  const showProbe = (side) => { probeEl.className = 'dp-probe' + (side ? ' ' + side : ''); };
  const setBtns = (on) => btns.forEach((b) => { b.disabled = !on; });

  async function playTrial(trial, ctx, phase) {
    const { host, t, delay, pickMs, stampAfterPaint } = ctx;
    ensure(host);
    ruleEl.innerHTML = t('ruleLine');
    btns[0].textContent = t('leftBtn'); btns[1].textContent = t('rightBtn');
    ctx.setProgress(() => (phase === 'main' ? `${t('mainLabel')} ${trial.n}` : t('practiceLabel')));

    // 1) 응시점(+)
    setSlots('', ''); showProbe(null); setBtns(false);
    fixEl.textContent = '+'; statusEl.textContent = ''; statusEl.className = 'dp-status';
    await delay(pickMs([500, 700]));
    fixEl.textContent = '';

    // 2) 두 단어(무채색) 좌우 제시 500ms — 정서단어는 emoSide, 중립은 반대쪽
    const leftKey  = trial.emoSide === 'left'  ? trial.emoKey : trial.neuKey;
    const rightKey = trial.emoSide === 'right' ? trial.emoKey : trial.neuKey;
    setSlots(t(leftKey), t(rightKey));
    await delay(WORD_MS);
    setSlots('', ''); // 단어 제거

    // 3) 프로브(점) 한쪽 + 응답창(자기종료, 초과=무효)
    showProbe(trial.probeSide);
    arena.dataset.seq = String(++seq);
    if (QA) { arena.dataset.probe = trial.probeSide; arena.dataset.cell = trial.condition || 'prac'; arena.dataset.phase = phase; }
    setBtns(true);

    const resp = await new Promise((resolve) => {
      let done = false, t0 = 0, timer = null;
      const cleanup = () => { btns.forEach((b) => b.removeEventListener('pointerdown', onDown)); window.removeEventListener('keydown', onKey); if (timer) clearTimeout(timer); };
      const finish = (p) => { if (done) return; done = true; cleanup(); resolve(p); };
      const pick = (side, it) => finish({ side, rt: t0 ? performance.now() - t0 : 0, inputType: it, timedOut: false });
      const onDown = (e) => pick(e.currentTarget.dataset.side, e.pointerType || 'mouse');
      const onKey = (e) => { if (e.key === 'ArrowLeft') pick('left', 'keyboard'); else if (e.key === 'ArrowRight') pick('right', 'keyboard'); };
      btns.forEach((b) => b.addEventListener('pointerdown', onDown));
      window.addEventListener('keydown', onKey);
      stampAfterPaint().then((tp) => { if (done) return; t0 = tp; timer = setTimeout(() => finish({ side: null, rt: null, inputType: null, timedOut: true }), RESP_LIMIT); });
    });

    setBtns(false); showProbe(null);
    const said = resp.timedOut ? null : resp.side;
    const isCorrect = !resp.timedOut && said === trial.probeSide; // 프로브가 나온 쪽을 맞혔나(위치 응답)

    if (phase === 'practice') {
      statusEl.className = 'dp-status ' + (isCorrect ? 'ok' : 'no');
      statusEl.textContent = isCorrect ? t('fbOk') : t('fbNo');
      await delay(FB_MS);
      statusEl.textContent = ''; statusEl.className = 'dp-status';
    }

    const record = phase === 'main' ? {
      condition: trial.condition, valence: trial.valence, congruent: trial.congruent, probeSide: trial.probeSide,
      said, rt: resp.timedOut ? null : resp.rt, timedOut: resp.timedOut, isCorrect, inputType: resp.inputType || null,
    } : null;
    await delay(pickMs([400, 700]));
    return { record, outcome: { success: isCorrect } };
  }

  // 본시행: 정서가(2)×일치/불일치(2)×정서단어위치 L/R(2) = 8칸을 R회 → 셔플. 좌우·일치 강제 50:50.
  async function* mainTrials() {
    const cells = [];
    for (const valence of VALENCES)
      for (const congruent of [true, false])
        for (const emoSide of SIDES)
          for (let k = 0; k < R; k++) cells.push({ valence, congruent, emoSide, k });
    shuffle(cells);
    let n = 0;
    for (const c of cells) {
      const ab = ABBR[c.valence];
      n++;
      yield {
        valence: c.valence, congruent: c.congruent, emoSide: c.emoSide, n,
        probeSide: c.congruent ? c.emoSide : other(c.emoSide),          // 일치=정서쪽 / 불일치=중립쪽
        emoKey: `w_${wordSet}_${ab}_${c.k % WORD_DATA[wordSet][ab].ko.length}`,
        neuKey: `w_${wordSet}_neu_${c.k % WORD_DATA[wordSet].neu.ko.length}`,
        condition: `${ab}_${c.congruent ? 'cong' : 'incong'}`,
      };
    }
  }

  // 연습: 중립+중립 쌍만(정서 단어 사전노출 금지). 프로브 위치 응답 메커닉만 익힌다.
  async function* practiceTrials() {
    const nc = WORD_DATA[wordSet].neu.ko.length;
    const cells = shuffle([
      { emoSide: 'left', congruent: true }, { emoSide: 'right', congruent: false },
      { emoSide: 'right', congruent: true }, { emoSide: 'left', congruent: false },
    ]);
    for (const [i, c] of cells.entries()) {
      if (QA && i >= 2) return; // QA 연습 2개
      yield {
        practice: true, emoSide: c.emoSide, probeSide: c.congruent ? c.emoSide : other(c.emoSide),
        emoKey: `w_${wordSet}_neu_${(i * 2) % nc}`, neuKey: `w_${wordSet}_neu_${(i * 2 + 1) % nc}`,
      };
    }
  }

  runTask({
    id,
    mount: 'app',
    scale,
    family: 'mindfulness',       // 자보라 (이미 있는 계열색 — 엔진 변경 없음)
    conditionKeys: ['lang', 'input'], // 단어 언어의존→lang, RT→input. 일치/불일치·정서가는 trial 메타데이터.
    choices: [],                 // 좌/우 버튼을 host 에 직접 그림
    practiceTrials,
    mainTrials,
    playTrial,
    analyze,
    strings: STRINGS,            // sessionAcc 미지정 → 엔진 기본(정확도 경고 ON)
  });
}

// accuracy·lowAccuracy·mainLabel·practiceLabel·조건차 사유는 엔진 i18n 제공. 여기선 과제 고유 문구만.
const STRINGS = {
  ko: {
    title: '정서 점탐사',
    howto: '좌우에 단어 두 개가 <b>잠깐</b> 나타났다 사라진 뒤, 한쪽에 <b>점</b>이 생겨요.<br>점이 나타난 쪽을 최대한 빨리 누르세요 (또는 방향키 ← 왼쪽 / → 오른쪽).',
    ruleLine: '<b>점</b>이 나타난 쪽을 누르세요',
    leftBtn: '◀ 왼쪽', rightBtn: '오른쪽 ▶',
    rtNegCong: '부정·일치 반응시간', rtNegIncong: '부정·불일치 반응시간',
    rtPosCong: '긍정·일치 반응시간', rtPosIncong: '긍정·불일치 반응시간',
    negBias: '부정 편향(불일치−일치)', posBias: '긍정 편향(불일치−일치)',
    fbOk: '✓ 맞아요', fbNo: '✗ 아니에요',
    valenceNote: '편향 점수는 정서 단어가 있던 쪽에 점이 나타났을 때와 반대쪽일 때의 반응시간 차이예요. 양수면 정서 단어 쪽으로 <b>조금 더 빨리</b> 눈이 갔다는 뜻이고, 음수면 그 반대예요. <b>둘 다 흔하고</b>, 그날의 컨디션·단어·우연에 따라 쉽게 오갑니다. 이 값은 <b>특정 성향이나 우울·불안 같은 상태를 진단하지 않아요.</b> 검사가 아니라 체험입니다.',
  },
  en: {
    title: 'Emotional Dot-Probe',
    howto: 'Two words appear <b>briefly</b> on the left and right and then vanish; right after, a <b>dot</b> appears on one side.<br>Press the side where the dot appeared, as fast as you can (or arrow key ← Left / → Right).',
    ruleLine: 'Press the side where the <b>dot</b> appears',
    leftBtn: '◀ Left', rightBtn: 'Right ▶',
    rtNegCong: 'Negative · congruent RT', rtNegIncong: 'Negative · incongruent RT',
    rtPosCong: 'Positive · congruent RT', rtPosIncong: 'Positive · incongruent RT',
    negBias: 'Negative bias (incong − cong)', posBias: 'Positive bias (incong − cong)',
    fbOk: '✓ Correct', fbNo: '✗ Other side',
    valenceNote: 'The bias score is the difference in reaction time between when the dot appeared where the emotional word was and when it appeared on the opposite side. A positive value means your eyes went to the emotional-word side <b>a little faster</b>; a negative value means the opposite. <b>Both are common</b> and shift easily with your mood that day, the words, and chance. This value <b>does not diagnose any trait or condition such as depression or anxiety.</b> This is an experience, not a test.',
  },
  es: {
    title: 'Sonda de Punto Emocional',
    howto: 'Dos palabras aparecen <b>brevemente</b> a izquierda y derecha y desaparecen; justo después, un <b>punto</b> aparece en un lado.<br>Pulsa el lado donde apareció el punto, lo más rápido que puedas (o tecla de flecha ← Izquierda / → Derecha).',
    ruleLine: 'Pulsa el lado donde aparece el <b>punto</b>',
    leftBtn: '◀ Izquierda', rightBtn: 'Derecha ▶',
    rtNegCong: 'TR negativa · congruente', rtNegIncong: 'TR negativa · incongruente',
    rtPosCong: 'TR positiva · congruente', rtPosIncong: 'TR positiva · incongruente',
    negBias: 'Sesgo negativo (incong − cong)', posBias: 'Sesgo positivo (incong − cong)',
    fbOk: '✓ Correcto', fbNo: '✗ El otro lado',
    valenceNote: 'La puntuación de sesgo es la diferencia de tiempo de reacción entre cuando el punto apareció donde estaba la palabra emocional y cuando apareció en el lado opuesto. Un valor positivo significa que tus ojos fueron al lado de la palabra emocional <b>un poco más rápido</b>; uno negativo, lo contrario. <b>Ambos son comunes</b> y cambian fácilmente según tu ánimo del día, las palabras y el azar. Este valor <b>no diagnostica ningún rasgo ni estado como la depresión o la ansiedad.</b> Esto es una experiencia, no un examen.',
  },
  zh: {
    title: '情绪点探测',
    howto: '左右两侧<b>短暂</b>出现两个词后消失，紧接着一侧出现一个<b>圆点</b>。<br>请尽快按下圆点出现的那一侧（或方向键 ← 左 / → 右）。',
    ruleLine: '请按下<b>圆点</b>出现的那一侧',
    leftBtn: '◀ 左', rightBtn: '右 ▶',
    rtNegCong: '消极·一致 反应时间', rtNegIncong: '消极·不一致 反应时间',
    rtPosCong: '积极·一致 反应时间', rtPosIncong: '积极·不一致 反应时间',
    negBias: '消极偏向（不一致−一致）', posBias: '积极偏向（不一致−一致）',
    fbOk: '✓ 对了', fbNo: '✗ 另一侧',
    valenceNote: '偏向分数是圆点出现在情绪词那一侧与出现在相反一侧时的反应时间之差。正值表示你的目光<b>稍快</b>地移向了情绪词那一侧，负值则相反。<b>两者都很常见</b>，会随当天状态、词语和偶然而轻易变化。这个值<b>并不诊断抑郁、焦虑等任何倾向或状态。</b>这是体验，不是检查。',
  },
};
