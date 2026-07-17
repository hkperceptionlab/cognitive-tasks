// stroop-common/stroop.js — 스트룹 과제 정의(청소년·성인 앱이 공유).
// 색 이름·자극 생성·결과 계산·문자열이 두 앱에서 동일하다.

import { runTask, QA } from '../core/engine.js';

// 색 4개: 빨강 파랑 노랑 검정 (on: 버튼 위 글자 대비색)
export const COLORS = [
  { id: 'red',    hex: '#e53935', on: '#ffffff' },
  { id: 'blue',   hex: '#1e88e5', on: '#ffffff' },
  { id: 'yellow', hex: '#fdd835', on: '#212121' },
  { id: 'black',  hex: '#212121', on: '#ffffff' },
];
const byId = (id) => COLORS.find((c) => c.id === id);

// 자극 생성: 일치 congruent개 · 불일치 incongruent개를 만든다.
// 잉크색을 4색에 round-robin 으로 돌려 최대한 고르게 분배(총량이 4의 배수가
// 아니어도 됨). 정답은 항상 잉크색.
//   청소년 {10,14} → 색분배 3·3·2·2 / 4·4·3·3 = 24 (시간압박 있어 시간초과로 유효문항이 더 빠짐)
//   성인   {12,20} → 3·3·3·3 / 5·5·5·5 = 32
function buildMainPool({ congruent, incongruent }) {
  const pool = [];
  // 일치: 잉크=단어=같은 색
  for (let k = 0; k < congruent; k++) {
    const c = COLORS[k % COLORS.length];
    pool.push({ condition: 'congruent', inkColor: c.id, wordColor: c.id, correct: c.id });
  }
  // 불일치: 잉크는 round-robin, 단어색은 그 잉크와 다른 색을 순환시켜 다양하게
  for (let k = 0; k < incongruent; k++) {
    const c = COLORS[k % COLORS.length];
    const others = COLORS.filter((o) => o.id !== c.id);
    const w = others[Math.floor(k / COLORS.length) % others.length];
    pool.push({ condition: 'incongruent', inkColor: c.id, wordColor: w.id, correct: c.id });
  }
  return pool;
}

// 연습 5개 (일치·불일치 섞음, 기록 안 함)
function buildPracticePool() {
  return [
    { condition: 'congruent',   inkColor: 'red',    wordColor: 'red',    correct: 'red' },
    { condition: 'incongruent', inkColor: 'blue',   wordColor: 'yellow', correct: 'blue' },
    { condition: 'congruent',   inkColor: 'yellow', wordColor: 'yellow', correct: 'yellow' },
    { condition: 'incongruent', inkColor: 'black',  wordColor: 'red',    correct: 'black' },
    { condition: 'incongruent', inkColor: 'red',    wordColor: 'blue',   correct: 'red' },
  ];
}

// 자극: 단어는 wordColor 의 이름, 잉크는 inkColor. 정답은 잉크색.
function renderStimulus(trial, el, scale, t) {
  el.textContent = t('word_' + trial.wordColor);
  el.style.color = byId(trial.inkColor).hex;
}

// 버튼: 색으로 칠하고 색 이름을 얹는다.
function renderChoice(choice, btn, scale, t) {
  btn.style.background = choice.hex;
  btn.style.color = choice.on;
  btn.textContent = t('word_' + choice.id);
}

// 조건별 평균 RT와 유효 문항 수: 엔진이 표시한 rtValid 시행만 사용
function condStats(records, cond) {
  const rs = records.filter((r) => r.rtValid && r.condition === cond).map((r) => r.rt);
  const mean = rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null;
  return { mean, count: rs.length };
}

// 결과: 정확도(전체), 조건별 평균 RT(유효 문항 수 포함), 스트룹 효과 = 불일치 − 일치
// series 의 group: 'rt'(일치·불일치, 같은 축) / 'effect'(스트룹 효과, 별도 축)
function analyze(records, t) {
  const correct = records.filter((r) => r.isCorrect).length;
  const acc = records.length ? correct / records.length : 0;
  const cong = condStats(records, 'congruent');
  const incong = condStats(records, 'incongruent');
  const effect = cong.mean != null && incong.mean != null ? incong.mean - cong.mean : null;
  const ms = (v) => (v == null ? '—' : Math.round(v));
  // 정답률 90% 미만이면 결과 상단에 경고(반응시간 신뢰도 낮음)
  const topNotes = records.length && acc < 0.9 ? [t('lowAccuracy')] : [];
  return {
    topNotes,
    series: [
      { key: 'congruent',    label: t('rtCongruent'),   value: cong.mean,   color: '#43a047', group: 'rt' },
      { key: 'incongruent',  label: t('rtIncongruent'), value: incong.mean, color: '#e53935', group: 'rt' },
      { key: 'stroopEffect', label: t('stroopEffect'),  value: effect,      color: '#3949ab', group: 'effect' },
    ],
    summary: [
      { label: t('accuracy'),      value: Math.round(acc * 100), unit: '%' },
      { label: t('rtCongruent'),   value: ms(cong.mean),   unit: 'ms', count: cong.count },
      { label: t('rtIncongruent'), value: ms(incong.mean), unit: 'ms', count: incong.count },
      { label: t('stroopEffect'),  value: ms(effect),      unit: 'ms' },
    ],
  };
}

const STRINGS = {
  ko: {
    title: '스트룹 과제',
    howto: '글자의 <b>색</b>에 해당하는 버튼을 누르세요.<br>글자가 <i>뜻하는</i> 색이 아니라, 실제로 <i>칠해진</i> 색입니다.',
    stroopEffect: '스트룹 효과',
    rtCongruent: '일치 평균 반응시간',
    rtIncongruent: '불일치 평균 반응시간',
    word_red: '빨강', word_blue: '파랑', word_yellow: '노랑', word_black: '검정',
  },
  en: {
    title: 'Stroop Task',
    howto: 'Press the button matching the <b>ink color</b> of the word.<br>Not what the word <i>says</i> — the color it is <i>painted</i>.',
    stroopEffect: 'Stroop effect',
    rtCongruent: 'Congruent mean RT',
    rtIncongruent: 'Incongruent mean RT',
    word_red: 'Red', word_blue: 'Blue', word_yellow: 'Yellow', word_black: 'Black',
  },
  zh: {
    title: '斯特鲁普任务',
    howto: '请按下与文字<b>颜色</b>相符的按钮。<br>不是文字所<i>表示</i>的颜色，而是实际<i>显示</i>的颜色。',
    stroopEffect: '斯特鲁普效应',
    rtCongruent: '一致条件平均反应时间',
    rtIncongruent: '不一致条件平均反应时间',
    word_red: '红', word_blue: '蓝', word_yellow: '黄', word_black: '黑',
  },
  es: {
    title: 'Tarea de Stroop',
    howto: 'Pulsa el botón que corresponde al <b>color de la tinta</b> de la palabra.<br>No lo que la palabra <i>dice</i>, sino el color con que está <i>pintada</i>.',
    stroopEffect: 'Efecto Stroop',
    rtCongruent: 'TR medio congruente',
    rtIncongruent: 'TR medio incongruente',
    word_red: 'Rojo', word_blue: 'Azul', word_yellow: 'Amarillo', word_black: 'Negro',
  },
};

// 앱마다 다른 것: id, 문항 수, 제한시간, 배율
export function startStroop({ id, mainCounts, timeLimitMs, scale }) {
  // QA 축약: 문항 수만 최소로(일치 2·불일치 2 = 4). 판정·자극·UI 는 그대로.
  const counts = QA ? { congruent: 2, incongruent: 2 } : mainCounts;
  runTask({
    id,
    mount: 'app',
    practiceCount: 5,
    timeLimitMs,
    scale,
    choices: COLORS,
    buildPracticePool,
    buildMainPool: () => buildMainPool(counts),
    renderStimulus,
    renderChoice,
    analyze,
    strings: STRINGS,
  });
}
