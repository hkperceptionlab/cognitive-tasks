// gonogo-common/gonogo.js — Go/No-go 과제 정의(청소년·성인 앱이 공유).
// 도형이 하나씩 나온다: 원(Go)=최대한 빨리 누르기 / 사각형(No-go)=누르지 말고 참기.
// 색이 아니라 '도형'이 신호이므로 두 도형은 같은 색으로 그린다(색 이름 불필요).

import { runTask } from '../core/engine.js';

// 응답 버튼은 하나뿐: '누르기'. Go 반응용.
const SHAPE_COLOR = '#3949ab';
const CHOICES = [{ id: 'go' }];

// 본시행 풀: Go 75% / No-go 25%.
//   청소년 {go:45, nogo:15} = 60
//   성인   {go:30, nogo:10} = 40
// correct 는 기록용 표식일 뿐, 실제 정답 판정은 아래 isCorrect 훅이 한다
// (No-go 는 '안 누름(timedOut)'이 정답이라 버튼 일치로는 표현할 수 없음).
function buildMainPool({ go, nogo }) {
  const pool = [];
  for (let i = 0; i < go; i++) pool.push({ condition: 'go', correct: 'go' });
  for (let i = 0; i < nogo; i++) pool.push({ condition: 'nogo', correct: 'nogo' });
  return pool;
}

// 연습 6개(Go 4 · No-go 2 섞음, 기록 안 함). 참는 법을 익히도록 No-go 를 포함.
function buildPracticePool() {
  return [
    { condition: 'go', correct: 'go' },
    { condition: 'go', correct: 'go' },
    { condition: 'nogo', correct: 'nogo' },
    { condition: 'go', correct: 'go' },
    { condition: 'nogo', correct: 'nogo' },
    { condition: 'go', correct: 'go' },
  ];
}

// 정답 판정 훅:
//   Go   → 제한시간 안에 눌렀으면 정답
//   No-go → 누르지 않았으면(timedOut) 정답
function isCorrect(trial, resp) {
  return trial.condition === 'nogo'
    ? resp.timedOut
    : (!resp.timedOut && resp.choiceId === 'go');
}

// 자극: 원(Go) 또는 사각형(No-go). 크기는 1em → .stimulus 의 font-size(var(--stim),
// 배율 반영)를 따라가므로 청소년/성인 배율이 그대로 적용된다.
function renderStimulus(trial, el, t) {
  const shape = trial.condition === 'go'
    ? `<circle cx="50" cy="50" r="44" fill="${SHAPE_COLOR}"/>`
    : `<rect x="8" y="8" width="84" height="84" rx="10" fill="${SHAPE_COLOR}"/>`;
  el.innerHTML =
    `<svg viewBox="0 0 100 100" width="1.4em" height="1.4em" style="display:block"` +
    ` role="img" aria-label="${t('shape_' + trial.condition)}">${shape}</svg>`;
}

// 하나뿐인 응답 버튼: 강조색으로 칠하고 '누르기' 라벨.
function renderChoice(choice, btn, scale, t) {
  btn.style.background = SHAPE_COLOR;
  btn.style.color = '#ffffff';
  btn.textContent = t('press');
}

// ── 결과 계산 ────────────────────────────────────────────
// Go 평균 반응시간: 엔진이 표시한 rtValid(시간초과·오답·이상치·첫시행 제외) Go 시행만.
function goRtStats(records) {
  const rs = records.filter((r) => r.rtValid && r.condition === 'go').map((r) => r.rt);
  const mean = rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null;
  return { mean, count: rs.length };
}
// 비율(정답 수 / 전체) 을 조건별로.
function rateOf(records, cond) {
  const rs = records.filter((r) => r.condition === cond);
  const ok = rs.filter((r) => r.isCorrect).length;
  return { rate: rs.length ? ok / rs.length : null, count: rs.length };
}

// 핵심 지표: No-go 억제 성공률 + Go 평균 반응시간. 함께 Go 정확도도 보여준다.
// series group: 'rt'(Go 반응시간, ms 축) / 'rate'(성공률·정확도, 0~100% 축) — 축 분리.
function analyze(records, t) {
  const go = goRtStats(records);
  const goAcc = rateOf(records, 'go');       // Go 정확도(제때 눌렀는가)
  const inhib = rateOf(records, 'nogo');     // No-go 억제 성공률(안 눌렀는가)
  const pct = (v) => (v == null ? '—' : Math.round(v * 100));
  const ms = (v) => (v == null ? '—' : Math.round(v));

  // 이 과제가 무엇을 보여주는지에 대한 안내(항상). + Go 정확도 낮으면 반응시간 신뢰도 경고.
  const topNotes = [t('taskNote')];
  if (goAcc.count && goAcc.rate != null && goAcc.rate < 0.9) topNotes.push(t('lowAccuracy'));

  return {
    topNotes,
    series: [
      { key: 'goRt',       label: t('goRt'),       value: go.mean,
        color: '#43a047', group: 'rt' },
      { key: 'inhibition', label: t('inhibition'), value: inhib.rate == null ? null : inhib.rate * 100,
        color: '#3949ab', group: 'rate' },
      { key: 'goAccuracy', label: t('goAccuracy'), value: goAcc.rate == null ? null : goAcc.rate * 100,
        color: '#8e24aa', group: 'rate' },
    ],
    summary: [
      { label: t('goRt'),       value: ms(go.mean),      unit: 'ms', count: go.count },
      { label: t('inhibition'), value: pct(inhib.rate),  unit: '%',  count: inhib.count },
      { label: t('goAccuracy'), value: pct(goAcc.rate),  unit: '%',  count: goAcc.count },
    ],
  };
}

const STRINGS = {
  ko: {
    title: 'Go / No-go 과제',
    howto: '<b>원</b>이 나오면 최대한 <b>빨리</b> 버튼을 누르세요.<br>' +
           '<b>사각형</b>이 나오면 <i>누르지 말고 참으세요.</i>',
    press: '누르기',
    goRt: 'Go 평균 반응시간',
    inhibition: 'No-go 억제 성공률',
    goAccuracy: 'Go 정확도',
    shape_go: '원', shape_nogo: '사각형',
    taskNote: '이 과제는 이미 시작된 반응을 멈추는 능력을 보여줍니다. 스트룹과는 다른 종류의 억제입니다.',
  },
  en: {
    title: 'Go / No-go Task',
    howto: 'When a <b>circle</b> appears, press the button as <b>fast</b> as you can.<br>' +
           'When a <b>square</b> appears, <i>hold back — do not press.</i>',
    press: 'Press',
    goRt: 'Go mean reaction time',
    inhibition: 'No-go inhibition rate',
    goAccuracy: 'Go accuracy',
    shape_go: 'circle', shape_nogo: 'square',
    taskNote: 'This task shows your ability to stop a response that has already begun. It is a different kind of inhibition from the Stroop task.',
  },
  zh: {
    title: 'Go / No-go 任务',
    howto: '出现<b>圆形</b>时，请<b>尽快</b>按下按钮。<br>' +
           '出现<b>方形</b>时，<i>请忍住，不要按。</i>',
    press: '按',
    goRt: 'Go 平均反应时间',
    inhibition: 'No-go 抑制成功率',
    goAccuracy: 'Go 正确率',
    shape_go: '圆形', shape_nogo: '方形',
    taskNote: '这个任务展示你停止一个已经开始的反应的能力。它与斯特鲁普任务是不同类型的抑制。',
  },
  es: {
    title: 'Tarea Go / No-go',
    howto: 'Cuando aparezca un <b>círculo</b>, pulsa el botón lo más <b>rápido</b> que puedas.<br>' +
           'Cuando aparezca un <b>cuadrado</b>, <i>contente y no pulses.</i>',
    press: 'Pulsar',
    goRt: 'Tiempo de reacción medio Go',
    inhibition: 'Tasa de inhibición No-go',
    goAccuracy: 'Precisión Go',
    shape_go: 'círculo', shape_nogo: 'cuadrado',
    taskNote: 'Esta tarea muestra tu capacidad de detener una respuesta que ya ha comenzado. Es un tipo de inhibición distinto al de la tarea de Stroop.',
  },
};

// 앱마다 다른 것: id, 문항 수, 제한시간(자극이 머무는 시간), 배율
export function startGoNogo({ id, mainCounts, timeLimitMs, scale }) {
  runTask({
    id,
    mount: 'app',
    practiceCount: 6,
    timeLimitMs,
    scale,
    choices: CHOICES,
    isCorrect,
    buildPracticePool,
    buildMainPool: () => buildMainPool(mainCounts),
    // 엔진의 renderStimulus 시그니처는 (trial, el, scale, t) — scale 은 --stim(em)로 흡수하므로 무시.
    renderStimulus: (trial, el, scale, t) => renderStimulus(trial, el, t),
    renderChoice,
    analyze,
    strings: STRINGS,
  });
}
