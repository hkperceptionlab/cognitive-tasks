// ablink-common/ablink.js — "깜빡 놓치는 순간"(Attentional Blink). 청소년·성인 공유. 마음챙김 계열.
//
// 자음 글자가 화면 중앙에 아주 빠르게 하나씩 지나간다(항목당 100ms, 간격 없음). 그 안에 숫자 하나(T1)와
// 글자 X(T2)가 숨어 있다. 스트림이 끝나면 두 가지를 묻는다: (1) 숫자가 뭐였나(8지선다) (2) X가 있었나(있음/없음).
// 스트림 진행 중엔 응답 UI 없음(그냥 보기만). 빠른 흐름 속에서 두 번째 것을 얼마나 알아채는지를 본다.
//
// 세 조건(정적 buildMainPool, orderByConstraint 로 섞임 — 블록 분리 불필요):
//   근접(near, lag2) · 여유(far, lag8) — 둘 다 X 존재, 핵심 비교. 캐치(catch) — X 없음(응답 편향 통제).
//
// 엔진 훅: buildMainPool/buildPracticePool(정적 → 엔진이 진행 라벨 자동 설정, 낡은 라벨 버그 구조적 회피) +
//   playTrial(corsi 패턴: 보여주기 await → 응답받기 await) + conditionKeys [](자기 페이스 정답률, JND와 같은 논리).
//   sessionAcc 미지정 → 엔진 기본(record.isCorrect = T1&&T2 종합 정확도, 일반 경고).
//
// 자극(글자·숫자)은 무채색 검정. accent(마음챙김 자보라)는 UI(버튼·배너 강조어·차트)에만.

import { runTask, QA } from '../core/engine.js';

const LAG_NEAR = 2, LAG_FAR = 8;
const ITEM_MS = 100;                 // 항목당 노출(간격 없음). 속도 자체가 현상 → 청소년·성인 동일.
const STREAM_MIN = 14, STREAM_MAX = 18;
const T1_MIN = 5, T1_MAX = 7;        // T1 위치(0-index) = 6~8번째
const DISTRACTORS = ['B','C','D','F','G','H','J','K','L','M','N','P','R','S','T','V','W','Z']; // 자음, X·모음 제외
const T1_DIGITS = [2,3,4,5,6,7,8,9]; // 8지선다
const FB_MS = 600;

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const themeAccent = () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#5C4A73';

// 한 시행 스트림 생성. condition: 'near'|'far'|'catch'. 캐치는 T2 자리에 X 대신 다른 자음.
function buildTrial(condition, lag) {
  const t1Index = T1_MIN + Math.floor(Math.random() * (T1_MAX - T1_MIN + 1));
  const t2Index = t1Index + lag;
  const trailing = 2 + Math.floor(Math.random() * 3); // 2~4
  const length = Math.max(STREAM_MIN, Math.min(STREAM_MAX, t2Index + trailing));
  const t1Value = T1_DIGITS[Math.floor(Math.random() * T1_DIGITS.length)];
  const t2Present = condition !== 'catch';
  const stream = new Array(length).fill(null);
  stream[t1Index] = String(t1Value);
  if (t2Present) stream[t2Index] = 'X';
  // 나머지(+캐치의 T2 자리)는 자음, 직전과 다른 글자로 채움.
  let prev = null;
  for (let i = 0; i < length; i++) {
    if (stream[i] !== null) { prev = stream[i]; continue; }
    let d; do { d = DISTRACTORS[Math.floor(Math.random() * DISTRACTORS.length)]; } while (d === prev);
    stream[i] = d; prev = d;
  }
  return { condition, lag, length, t1Index, t1Value, t2Index, t2Present, stream };
}

function injectStyles() {
  if (document.getElementById('ab-style')) return;
  const el = document.createElement('style');
  el.id = 'ab-style';
  el.textContent = `
.ab-wrap{position:relative;width:100%;min-height:56vh;display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:1.6rem;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.ab-rule{font-size:calc(1.05rem * var(--scale));line-height:1.5;color:var(--fg);background:#f0edf4;
  border:1px solid #e2dcec;border-radius:12px;padding:.55rem .95rem;text-align:center}
.ab-rule b{color:var(--accent)}
.ab-item{font-size:calc(clamp(4rem,26vw,8rem) * var(--scale));font-weight:800;line-height:1;color:#111;
  min-height:calc(clamp(4rem,26vw,8rem) * var(--scale));display:flex;align-items:center}
.ab-response{display:flex;flex-direction:column;align-items:center;gap:1.1rem;width:100%}
.ab-prompt{font-size:calc(1.3rem * var(--scale));font-weight:800;color:var(--fg)}
.ab-prompt b{color:var(--accent)}
.ab-q1grid{display:grid;grid-template-columns:repeat(4,1fr);gap:.7rem;max-width:calc(20rem * var(--scale))}
.ab-pad{display:flex;gap:1.2rem}
.ab-btn{border:none;border-radius:14px;background:var(--accent);color:#fff;font-weight:800;cursor:pointer;
  box-shadow:0 2px 8px rgba(0,0,0,.16);touch-action:manipulation}
.ab-q1btn{width:calc(3.6rem * var(--scale));height:calc(3.6rem * var(--scale));font-size:calc(1.6rem * var(--scale))}
.ab-q2btn{min-width:calc(6.2rem * var(--scale));min-height:calc(3.4rem * var(--scale));font-size:calc(1.25rem * var(--scale))}
.ab-btn:active{transform:scale(.96)}
.ab-status{min-height:calc(1.6rem * var(--scale));font-size:calc(1.1rem * var(--scale));font-weight:800}
.ab-status.ok{color:#2e7d32}.ab-status.no{color:#c62828}
.ab-chart{margin:.4rem 0}
.ab-bars{display:flex;gap:1.6rem;align-items:flex-end;justify-content:center;height:120px;margin:.4rem 0}
.ab-bar{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%}
.ab-bar .bar{width:calc(3rem * var(--scale));background:var(--accent);border-radius:8px 8px 0 0}
.ab-bar .val{font-weight:800;margin-bottom:.2rem;color:var(--fg)}
.ab-bar .lab{margin-top:.35rem;font-size:.9rem;color:var(--muted)}
.ab-catch{text-align:center;color:var(--muted);font-size:.92rem;margin-top:.2rem}`;
  document.head.appendChild(el);
}

// 근접·여유 T2 정답률 2-막대(+캐치 보조). 색 var(--accent), 라벨 t(), 판정문구 없음.
function abChart(near, far, catchAcc, t) {
  const bar = (label, v) => {
    const h = v == null ? 0 : Math.round(v * 100);
    return `<div class="ab-bar"><div class="val">${v == null ? '—' : h + '%'}</div>` +
      `<div class="bar" style="height:${h}%"></div><div class="lab">${label}</div></div>`;
  };
  const catchLine = catchAcc == null ? '' :
    `<div class="ab-catch">${t('catchLabel')}: ${Math.round(catchAcc * 100)}%</div>`;
  return `<div class="ab-chart"><h3 class="graph-title">${t('t2Title')}</h3>` +
    `<div class="ab-bars">${bar(t('near'), near)}${bar(t('far'), far)}</div>${catchLine}</div>`;
}

function analyze(records, t) {
  const t1Correct = records.filter((r) => r.t1Correct);
  const t1Acc = records.length ? t1Correct.length / records.length : null;
  // T2 정답률: 'T1 정답 시행만', 조건별.
  const condT2 = (c) => {
    const cell = records.filter((r) => r.condition === c && r.t1Correct);
    return cell.length ? cell.filter((r) => r.t2Correct).length / cell.length : null;
  };
  const near = condT2('near'), far = condT2('far'), catchAcc = condT2('catch');
  const overall = records.length ? records.filter((r) => r.isCorrect).length / records.length : 0;

  const topNotes = [t('taskNote'), t('sampleNote')];
  // 신뢰도 축 = T1(숫자 = '스트림을 봤나'). T1이 낮으면 경고. T2(특히 근접)의 낮음은 이 과제가 재려는
  // 현상(깜빡임) 자체라 경고 대상 아님 — 종합으로 묶으면 정상 결과를 비정상 수행으로 오해석하게 됨.
  if (t1Acc != null && t1Acc < 0.7) topNotes.push(t('lowWatchNote'));
  // 캐치("X 없을 때 맞힘")가 낮으면 습관적으로 '있음'을 눌렀을 가능성 안내(해석 도움말, 판정 아님·새 게이트 없음).
  if (catchAcc != null && catchAcc < 0.7) topNotes.push(t('catchLowNote'));
  // 반대 방향 편향: 근접·여유 둘 다 아주 낮은데 캐치가 아주 높으면 '항상 없음'이라 답했을 가능성(해석 도움말).
  if (near != null && far != null && near < 0.15 && far < 0.15 && catchAcc != null && catchAcc >= 0.9) topNotes.push(t('alwaysNoNote'));

  const pct = (v) => (v == null ? '—' : Math.round(v * 100));
  if (QA) window.__ablinkLast = {
    t1Acc: t1Acc == null ? null : Math.round(t1Acc * 100),
    near: near == null ? null : Math.round(near * 100),
    far: far == null ? null : Math.round(far * 100),
    catch: catchAcc == null ? null : Math.round(catchAcc * 100),
    t2Overall: records.length ? Math.round(records.filter((r) => r.t2Correct).length / records.length * 100) : null,
    overall: Math.round(overall * 100),
  };

  return {
    topNotes,
    series: [
      { key: 'near', label: t('near'), value: near == null ? null : Math.round(near * 100), color: themeAccent(), group: 't2' },
      { key: 'far', label: t('far'), value: far == null ? null : Math.round(far * 100), color: '#9e9e9e', group: 't2' },
    ],
    summary: [
      { label: t('t1Acc'), value: pct(t1Acc), unit: '%', count: records.length },
      { label: t('nearT2'), value: pct(near), unit: '%', count: records.filter((r) => r.condition === 'near' && r.t1Correct).length },
      { label: t('farT2'), value: pct(far), unit: '%', count: records.filter((r) => r.condition === 'far' && r.t1Correct).length },
      { label: t('catchT2'), value: pct(catchAcc), unit: '%', count: records.filter((r) => r.condition === 'catch' && r.t1Correct).length },
    ],
    extraHtml: abChart(near, far, catchAcc, t),
  };
}

export function startAblink({ id, reps, scale = 1, accent }) {
  injectStyles();
  const R = QA ? 3 : reps;                 // 조건(근접·여유)당 시행. QA 축약.
  const CATCH = Math.max(1, Math.round(R / 2));
  let wrap = null, ruleEl = null, itemEl = null, responseEl = null, statusEl = null;
  let seqCounter = 0;

  function ensure(host) {
    if (wrap && host.contains(wrap)) return;
    host.innerHTML = '';
    wrap = document.createElement('div'); wrap.className = 'ab-wrap';
    ruleEl = document.createElement('div'); ruleEl.className = 'ab-rule';
    itemEl = document.createElement('div'); itemEl.className = 'ab-item';
    responseEl = document.createElement('div'); responseEl.className = 'ab-response'; responseEl.hidden = true;
    statusEl = document.createElement('div'); statusEl.className = 'ab-status';
    wrap.append(ruleEl, itemEl, responseEl, statusEl);
    host.appendChild(wrap);
  }

  // 질문 한 개: responseEl 을 채우고 클릭까지 await. selector 로 버튼 종류 구분.
  function ask(qNum, html, btnSel, valueOf) {
    return new Promise((resolve) => {
      responseEl.dataset.q = String(qNum);
      responseEl.innerHTML = html;
      responseEl.hidden = false;
      const onDown = (e) => {
        const b = e.target.closest(btnSel);
        if (!b) return;
        responseEl.removeEventListener('pointerdown', onDown);
        resolve({ value: valueOf(b), inputType: e.pointerType || 'mouse' });
      };
      responseEl.addEventListener('pointerdown', onDown);
    });
  }

  async function playTrial(trial, ctx, phase) {
    const { host, t } = ctx;
    ensure(host);

    // 1) 보여주기: RSVP 스트림(항목당 100ms, 간격 없음). 응답 UI 숨김.
    ruleEl.innerHTML = t('ruleLine'); ruleEl.hidden = false;
    responseEl.hidden = true; statusEl.textContent = ''; statusEl.className = 'ab-status';
    for (let i = 0; i < trial.stream.length; i++) {
      itemEl.textContent = trial.stream[i];
      await delay(ITEM_MS);
    }
    itemEl.textContent = '';
    ruleEl.hidden = true;

    // 봇/디버그 노출(?qa=1 에서만): 사람이 스트림에서 얻는 정보와 동일(숫자·X 유무).
    if (QA) { wrap.dataset.seq = String(++seqCounter); wrap.dataset.t1 = String(trial.t1Value); wrap.dataset.t2 = trial.t2Present ? 'present' : 'absent'; wrap.dataset.cond = trial.condition; }

    // 2) 응답받기 — Q1(숫자 8지선다) → Q2(X 있음/없음). 자기 페이스(클릭까지 대기).
    const q1html = `<div class="ab-prompt">${t('q1')}</div><div class="ab-q1grid">` +
      T1_DIGITS.map((d) => `<button type="button" class="ab-btn ab-q1btn" data-digit="${d}">${d}</button>`).join('') + `</div>`;
    const a1 = await ask(1, q1html, '.ab-q1btn', (b) => parseInt(b.dataset.digit, 10));
    const t1Correct = a1.value === trial.t1Value;

    const q2html = `<div class="ab-prompt">${t('q2')}</div><div class="ab-pad">` +
      `<button type="button" class="ab-btn ab-q2btn" data-resp="present">${t('present')}</button>` +
      `<button type="button" class="ab-btn ab-q2btn" data-resp="absent">${t('absent')}</button></div>`;
    const a2 = await ask(2, q2html, '.ab-q2btn', (b) => b.dataset.resp);
    const t2Correct = a2.value === (trial.t2Present ? 'present' : 'absent');

    responseEl.hidden = true; responseEl.innerHTML = '';
    const isCorrect = t1Correct && t2Correct;

    if (phase === 'practice') { // 연습만 종합 피드백. 본시행 무피드백.
      statusEl.className = 'ab-status ' + (isCorrect ? 'ok' : 'no');
      statusEl.textContent = isCorrect ? t('fbOk') : t('fbNo');
      await delay(FB_MS);
      statusEl.textContent = ''; statusEl.className = 'ab-status';
    }

    const record = phase === 'main'
      ? { condition: trial.condition, lag: trial.lag, t2Present: trial.t2Present, t1Correct, t2Correct, isCorrect, inputType: a2.inputType || a1.inputType || null }
      : null;
    return { record, outcome: { success: isCorrect } };
  }

  // 정적 풀: 근접 R + 여유 R + 캐치 CATCH. 엔진 orderByConstraint 가 condition 으로 섞음(같은 조건 3연속 회피).
  function buildMainPool() {
    const pool = [];
    for (let k = 0; k < R; k++) pool.push(buildTrial('near', LAG_NEAR));
    for (let k = 0; k < R; k++) pool.push(buildTrial('far', LAG_FAR));
    for (let k = 0; k < CATCH; k++) pool.push(buildTrial('catch', Math.random() < 0.5 ? LAG_NEAR : LAG_FAR));
    return pool;
  }
  // 연습: 세 조건 각 1회(근접·여유 필수 + 캐치). 정적이라 엔진이 "연습 n/total" 라벨 자동 설정.
  function buildPracticePool() {
    return [buildTrial('near', LAG_NEAR), buildTrial('far', LAG_FAR), buildTrial('catch', Math.random() < 0.5 ? LAG_NEAR : LAG_FAR)];
  }

  runTask({
    id,
    mount: 'app',
    scale,
    family: 'mindfulness',       // 자보라 (이미 있는 계열색 — 엔진 변경 없음)
    accent,
    conditionKeys: [],           // 자기 페이스 정답률 → 입력 방식이 개입할 근거 없음(JND와 같은 논리)
    choices: [],                 // 응답 버튼을 host 안에서 과제가 그림
    practiceCount: 3,            // 연습 세 조건 전부(정적 → 엔진이 라벨 자동)
    buildPracticePool,
    buildMainPool,
    playTrial,
    analyze,
    // 신뢰도 축 = T1(스트림을 봤나). 그래프 속빈점·저정확도 판단이 T1 기준을 따른다(깜빡=낮은 T2는 정상이라 제외).
    sessionAcc: (records) => (records.length ? records.filter((r) => r.t1Correct).length / records.length : null),
    strings: STRINGS,
  });
}

const STRINGS = {
  ko: {
    title: '깜빡 놓치는 순간',
    howto: '글자들이 아주 빠르게 하나씩 지나갑니다. 그 속에 <b>숫자 하나</b>와 <b>X</b>가 숨어 있어요.<br>끝나면 둘을 물어봅니다. 빠른 흐름 속에서 두 번째 것을 얼마나 알아채는지 봅니다.',
    ruleLine: '잘 보세요 — <b>숫자</b>와 <b>X</b>',
    q1: '숫자가 무엇이었나요?',
    q2: '<b>X</b>가 있었나요?',
    present: '있음', absent: '없음',
    near: '근접', far: '여유',
    t1Acc: '숫자 맞힘',
    nearT2: '근접(바로 뒤) X 맞힘',
    farT2: '여유(한참 뒤) X 맞힘',
    catchT2: 'X 없을 때 맞힘',
    catchLabel: 'X 없을 때 맞힘',
    t2Title: 'X를 알아챈 정도 (근접 vs 여유)',
    taskNote: '빠른 흐름 속에서 첫 번째(숫자)에 주의가 쏠리면, 바로 뒤따라오는 X를 잠깐 놓치기 쉽습니다 — 주의의 깜빡임입니다. 이 과제는 그 순간을 봅니다. 근접(바로 뒤)일수록 여유(한참 뒤)보다 놓치기 쉽습니다.',
    sampleNote: '조건당 시행이 몇 개뿐이라 정답률이 회차마다 크게 달라질 수 있습니다. 정밀한 측정이 아닙니다. “X 없을 때 맞힘”은 그냥 찍은 게 아닌지 보는 보조 지표입니다.',
    catchLowNote: '“X 없을 때 맞힘”이 낮게 나왔습니다. X가 없는데도 습관적으로 ‘있음’을 눌렀을 가능성이 있습니다. 그렇다면 위의 근접·여유 “X 맞힘” 값은 실제보다 높게 보일 수 있어, 조심해서 봐야 합니다.',
    lowWatchNote: '숫자를 자주 놓쳤습니다. 빠른 스트림을 제대로 보지 못했다면 아래 X 결과도 믿기 어렵습니다.',
    alwaysNoNote: '근접·여유의 “X 맞힘”이 둘 다 매우 낮은데 “X 없을 때 맞힘”은 매우 높습니다. X가 있어도 계속 ‘없음’이라고 답했을 가능성이 있습니다. 그렇다면 이 낮은 값은 진짜 깜빡임이 아니라 답하는 습관 때문일 수 있습니다.',
    fbOk: '✓ 맞아요',
    fbNo: '✗ 아니에요',
  },
  en: {
    title: 'The Moment You Blink Past It',
    howto: 'Letters go by one at a time, very fast. Hidden among them are <b>one digit</b> and an <b>X</b>.<br>At the end you are asked about both. It looks at how well you catch the second one in a fast flow.',
    ruleLine: 'Watch for the <b>digit</b> and the <b>X</b>',
    q1: 'What was the digit?',
    q2: 'Was there an <b>X</b>?',
    present: 'Yes', absent: 'No',
    near: 'Near', far: 'Far',
    t1Acc: 'Digit correct',
    nearT2: 'Near (right after) X correct',
    farT2: 'Far (well after) X correct',
    catchT2: 'Correct when no X',
    catchLabel: 'Correct when no X',
    t2Title: 'How well the X was caught (near vs far)',
    taskNote: 'In a fast flow, when your attention locks onto the first thing (the digit), the X that comes right after is easy to blink past — the attentional blink. This task looks at that moment. The nearer the X (right after), the easier it is to miss compared to far (well after).',
    sampleNote: 'There are only a few trials per condition, so accuracy can vary a lot from run to run. This is not a precise measurement. "Correct when no X" is a check that you were not just guessing.',
    catchLowNote: '"Correct when no X" came out low. You may have been pressing "Yes" out of habit even when there was no X. If so, the near/far "X correct" values above may look higher than they really are, so read them with caution.',
    lowWatchNote: 'You missed the digit often. If you were not really watching the fast stream, the X results below are hard to trust.',
    alwaysNoNote: 'Both near and far "X correct" are very low while "Correct when no X" is very high. You may have been answering "No" even when there was an X. If so, these low values may come from a response habit rather than a real blink.',
    fbOk: '✓ Correct',
    fbNo: '✗ Not quite',
  },
  zh: {
    title: '一晃就错过的瞬间',
    howto: '字母一个接一个飞快闪过。其中藏着<b>一个数字</b>和一个 <b>X</b>。<br>结束后会问你这两样。看你在飞快的流动中能多好地捕捉到第二个。',
    ruleLine: '留意<b>数字</b>和 <b>X</b>',
    q1: '数字是几？',
    q2: '出现过 <b>X</b> 吗？',
    present: '有', absent: '无',
    near: '近', far: '远',
    t1Acc: '数字答对',
    nearT2: '近（紧接着）X 答对',
    farT2: '远（隔一会）X 答对',
    catchT2: '无 X 时答对',
    catchLabel: '无 X 时答对',
    t2Title: '捕捉到 X 的程度（近 vs 远）',
    taskNote: '在飞快的流动中，注意力一旦锁定第一样（数字），紧随其后的 X 就很容易一晃错过——这就是注意瞬脱。这个任务看的正是那一刻。X 越近（紧接着），越容易漏掉；越远（隔一会）越容易看到。',
    sampleNote: '每个条件只有几个试次，所以正确率每次差别很大。这不是精确测量。“无 X 时答对”是用来看你是不是在瞎猜的辅助指标。',
    catchLowNote: '“无 X 时答对”偏低。可能你在没有 X 时也习惯性地按了“有”。若如此，上面近/远的“X 答对”数值可能显得比实际更高，需谨慎解读。',
    lowWatchNote: '你经常没看到数字。如果你没有真正盯着这飞快的字母流，下面的 X 结果也很难可信。',
    alwaysNoNote: '近和远的“X 答对”都很低，而“无 X 时答对”却很高。可能有 X 时你也一直答“无”。若如此，这些低数值可能来自答题习惯，而不是真正的瞬脱。',
    fbOk: '✓ 对了',
    fbNo: '✗ 不对',
  },
  es: {
    title: 'El Instante Que Se Te Escapa',
    howto: 'Las letras pasan una a una, muy rápido. Entre ellas se esconden <b>un dígito</b> y una <b>X</b>.<br>Al final se te pregunta por ambos. Observa cómo captas el segundo en un flujo rápido.',
    ruleLine: 'Atento al <b>dígito</b> y a la <b>X</b>',
    q1: '¿Qué dígito era?',
    q2: '¿Había una <b>X</b>?',
    present: 'Sí', absent: 'No',
    near: 'Cerca', far: 'Lejos',
    t1Acc: 'Dígito correcto',
    nearT2: 'Cerca (justo después) X correcta',
    farT2: 'Lejos (mucho después) X correcta',
    catchT2: 'Correcto cuando no hay X',
    catchLabel: 'Correcto cuando no hay X',
    t2Title: 'Cuánto se captó la X (cerca vs lejos)',
    taskNote: 'En un flujo rápido, cuando tu atención se fija en lo primero (el dígito), la X que viene justo después es fácil de pasar por alto — el parpadeo atencional. Esta tarea observa ese instante. Cuanto más cerca está la X (justo después), más fácil es perderla que cuando está lejos (mucho después).',
    sampleNote: 'Solo hay unos pocos ensayos por condición, así que la precisión varía mucho entre rondas. No es una medición precisa. "Correcto cuando no hay X" comprueba que no estabas simplemente adivinando.',
    catchLowNote: '"Correcto cuando no hay X" salió bajo. Puede que hayas pulsado "Sí" por costumbre aunque no hubiera X. Si es así, los valores de "X correcta" de cerca/lejos de arriba pueden parecer más altos de lo que realmente son, así que léelos con cautela.',
    lowWatchNote: 'Fallaste el dígito a menudo. Si no estabas mirando de verdad el flujo rápido, los resultados de X de abajo son difíciles de confiar.',
    alwaysNoNote: 'Tanto "X correcta" de cerca como de lejos son muy bajos, mientras que "Correcto cuando no hay X" es muy alto. Puede que hayas respondido "No" incluso cuando había una X. Si es así, estos valores bajos pueden deberse a un hábito de respuesta y no a un parpadeo real.',
    fbOk: '✓ Correcto',
    fbNo: '✗ No exacto',
  },
};
