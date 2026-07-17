// simon-common/simon.js — 사이먼 효과(Simon Effect). 청소년·성인 앱이 공유.
//
// 좌우 한쪽에 파랑/노랑 원이 뜬다. '색'으로 답한다(파랑=왼쪽 버튼, 노랑=오른쪽 버튼).
// 위치는 무시해야 하지만 못 무시한다 → 위치와 답이 반대면(불일치) 느려진다.
//   일치(congruent)   : 파랑이 왼쪽 / 노랑이 오른쪽 (자극 위치 = 응답 버튼 위치)
//   불일치(incongruent): 파랑이 오른쪽 / 노랑이 왼쪽
// 일치:불일치 = 1:1(위치가 예측 단서가 되지 않도록), 위치·색 모두 좌우 균등.
//
// 스트룹과 같은 기본 엔진 경로(단일 자극·단일 응답). 억제 계열(파랑).
// 버튼은 '색 이름'이 아니라 '색 자체'(언어 무관) → conditionKeys 에서 lang 을 뺀다.

import { runTask, QA } from '../core/engine.js';

const COLORS = { blue: '#1e88e5', yellow: '#fdd835' };

// 4가지 조합(파랑-왼/노랑-오=일치, 파랑-오/노랑-왼=불일치)을 균등 생성. count 는 4의 배수.
function buildMainPool(count) {
  const per = Math.max(1, Math.floor(count / 4));
  const combos = [
    { color: 'blue', side: 'left', condition: 'congruent' },
    { color: 'yellow', side: 'right', condition: 'congruent' },
    { color: 'blue', side: 'right', condition: 'incongruent' },
    { color: 'yellow', side: 'left', condition: 'incongruent' },
  ];
  const pool = [];
  combos.forEach((c) => { for (let i = 0; i < per; i++) pool.push({ ...c, correct: c.color }); });
  return pool;
}

// 연습 4개(일치·불일치 섞음, 기록 안 함)
function buildPracticePool() {
  return [
    { color: 'blue', side: 'left', condition: 'congruent', correct: 'blue' },
    { color: 'yellow', side: 'left', condition: 'incongruent', correct: 'yellow' },
    { color: 'blue', side: 'right', condition: 'incongruent', correct: 'blue' },
    { color: 'yellow', side: 'right', condition: 'congruent', correct: 'yellow' },
  ];
}

// 자극: 좌/우 한쪽에 색 원. 위치는 넓은 컨테이너 안에서 flex-start/flex-end 로.
function renderStimulus(trial, el, scale, t) {
  const hex = COLORS[trial.color];
  const justify = trial.side === 'left' ? 'flex-start' : 'flex-end';
  el.innerHTML =
    `<div style="display:flex;align-items:center;width:min(78vw,440px);justify-content:${justify}">` +
    `<div class="simon-dot" data-color="${trial.color}" data-side="${trial.side}" ` +
    `style="width:1.3em;height:1.3em;border-radius:50%;background:${hex};box-shadow:0 2px 8px rgba(0,0,0,.2)"></div>` +
    `</div>`;
}

// 버튼: 색 이름 대신 '색 자체'로 칠한다(언어 무관). 시각장애 지원용 aria-label 만 색 이름.
function renderChoice(choice, btn, scale, t) {
  btn.style.background = COLORS[choice.id];
  btn.style.color = 'transparent';
  btn.textContent = '';
  btn.setAttribute('aria-label', t('color_' + choice.id));
}

// 조건별 평균·유효 문항 수: 엔진이 표시한 rtValid 시행만.
function condStats(records, cond) {
  const rs = records.filter((r) => r.rtValid && r.condition === cond).map((r) => r.rt);
  return { mean: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null, count: rs.length };
}

// 결과: 정확도, 일치·불일치 평균 RT, 사이먼 효과(불일치−일치, 평균 기준).
// ※ '중앙값 효과'는 안 쓴다: 두 조건 중앙값의 '차'는 각 중앙값의 표본노이즈가 합쳐져
//   조건당 ~15개에선 견고하지 않고 부호까지 뒤집힌다(SRT 의 단일분포 중앙값과 다름).
function analyze(records, t) {
  const correct = records.filter((r) => r.isCorrect).length;
  const acc = records.length ? correct / records.length : 0;
  const cong = condStats(records, 'congruent');
  const incong = condStats(records, 'incongruent');
  const effectMean = cong.mean != null && incong.mean != null ? incong.mean - cong.mean : null;
  const ms = (v) => (v == null ? '—' : Math.round(v));
  const topNotes = [t('taskNote'), t('handNote')];
  if (records.length && acc < 0.9) topNotes.push(t('lowAccuracy'));
  return {
    topNotes,
    series: [
      { key: 'congruent', label: t('rtCongruent'), value: cong.mean, color: '#43a047', group: 'rt' },
      { key: 'incongruent', label: t('rtIncongruent'), value: incong.mean, color: '#e53935', group: 'rt' },
      { key: 'simonEffect', label: t('simonEffect'), value: effectMean, color: '#3949ab', group: 'effect' },
    ],
    summary: [
      { label: t('accuracy'), value: Math.round(acc * 100), unit: '%' },
      { label: t('rtCongruent'), value: ms(cong.mean), unit: 'ms', count: cong.count },
      { label: t('rtIncongruent'), value: ms(incong.mean), unit: 'ms', count: incong.count },
      { label: t('simonEffect'), value: ms(effectMean), unit: 'ms' },
    ],
  };
}

export function startSimon({ id, timeLimitMs, scale = 1, accent }) {
  const count = QA ? 8 : 32; // QA 축약: 시행 수만(일치4·불일치4). 판정·자극·UI 는 그대로.
  runTask({
    id,
    mount: 'app',
    scale,
    family: 'inhibition',       // 파랑 (스트룹·Go/No-go 와 같은 계열)
    accent,
    conditionKeys: ['input'],   // 언어는 이 과제와 무관(자극=색·위치, 버튼=색) → 입력 방식만 조건
    timeLimitMs,
    practiceCount: 4,
    choices: [{ id: 'blue' }, { id: 'yellow' }], // [왼쪽=파랑, 오른쪽=노랑]
    buildPracticePool,
    buildMainPool: () => buildMainPool(count),
    renderStimulus,
    renderChoice,
    analyze,
    strings: STRINGS,
  });
}

const STRINGS = {
  ko: {
    title: '사이먼 과제',
    howto: '도형의 <b>색</b>과 같은 색 버튼을 누르세요. (<b>파랑=왼쪽</b>, <b>노랑=오른쪽</b>)<br>도형이 어느 쪽에 나와도 <i>위치는 무시</i>하세요.',
    color_blue: '파랑', color_yellow: '노랑',
    rtCongruent: '일치 평균 반응시간',
    rtIncongruent: '불일치 평균 반응시간',
    simonEffect: '사이먼 효과',
    taskNote: '이 과제에서 방해하는 것은 자극의 위치입니다. 색을 판단하려면 자극을 봐야 하고, 보면 위치도 같이 들어옵니다. 스트룹은 글자를 안 보면 피할 수 있지만, 이건 못 피합니다.',
    handNote: '이 실험은 당신이 어떤 손으로 누르는지 알 수 없습니다. 마우스로 한 손을 쓰면 실험실에서 재는 것과 다른 것을 잽니다.',
    diffInputReason: '입력 방식(마우스·터치)에 따라 손 배치가 달라져 사이먼 효과를 직접 비교하기 어렵습니다.',
  },
  en: {
    title: 'Simon Task',
    howto: 'Press the button with the same <b>color</b> as the shape. (<b>blue = left</b>, <b>yellow = right</b>)<br>Wherever the shape appears, <i>ignore its position</i>.',
    color_blue: 'Blue', color_yellow: 'Yellow',
    rtCongruent: 'Congruent mean RT',
    rtIncongruent: 'Incongruent mean RT',
    simonEffect: 'Simon effect',
    taskNote: 'What interferes here is the position of the stimulus. To judge the color you must look at it, and when you look, the position comes in too. In Stroop you can avoid the word by not reading it; here you cannot avoid it.',
    handNote: 'This experiment cannot know which hand you press with. If you use one hand on a mouse, it measures something different from what a lab measures.',
    diffInputReason: 'Different input methods (mouse, touch) place the hands differently, so the Simon effect is hard to compare directly.',
  },
  zh: {
    title: '西蒙任务',
    howto: '按下与图形<b>颜色</b>相同的按钮。（<b>蓝=左</b>，<b>黄=右</b>）<br>无论图形出现在哪一侧，<i>都忽略它的位置</i>。',
    color_blue: '蓝', color_yellow: '黄',
    rtCongruent: '一致条件平均反应时间',
    rtIncongruent: '不一致条件平均反应时间',
    simonEffect: '西蒙效应',
    taskNote: '这里干扰你的是刺激的位置。要判断颜色就得看它，一看，位置也一起进来了。斯特鲁普可以靠不读字来回避，而这个无法回避。',
    handNote: '本实验无法知道你用哪只手按。如果你用一只手操作鼠标，所测的与实验室所测的并不相同。',
    diffInputReason: '不同的输入方式（鼠标、触摸）手的摆位不同，因此西蒙效应难以直接比较。',
  },
  es: {
    title: 'Tarea de Simon',
    howto: 'Pulsa el botón del mismo <b>color</b> que la figura. (<b>azul = izquierda</b>, <b>amarillo = derecha</b>)<br>Aparezca donde aparezca la figura, <i>ignora su posición</i>.',
    color_blue: 'Azul', color_yellow: 'Amarillo',
    rtCongruent: 'TR medio congruente',
    rtIncongruent: 'TR medio incongruente',
    simonEffect: 'Efecto Simon',
    taskNote: 'Lo que interfiere aquí es la posición del estímulo. Para juzgar el color tienes que mirarlo, y al mirarlo, la posición también entra. En Stroop puedes evitar la palabra si no la lees; aquí no puedes evitarlo.',
    handNote: 'Este experimento no puede saber con qué mano pulsas. Si usas una mano con el ratón, mide algo distinto de lo que mide un laboratorio.',
    diffInputReason: 'Los distintos métodos de entrada (ratón, táctil) colocan las manos de forma diferente, así que el efecto Simon es difícil de comparar directamente.',
  },
};
