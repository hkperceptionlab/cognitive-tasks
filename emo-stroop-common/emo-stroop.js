// emo-stroop-common/emo-stroop.js — 정서 스트룹(Emotional Stroop). 청소년·성인 앱이 공유. 마음챙김 계열.
//
// 색-단어 스트룹(stroop-common)과 같은 엔진 경로(runTask)·잉크 버튼 메커니즘을 재사용한다.
// 다른 점: 단어가 '색 이름'이 아니라 '정서가(긍정/부정/중립) 태그된 단어'이고, 일치/불일치 조작이
// 없다 — condition = 정서가. 잉크색은 단어와 무관하게 round-robin(정서가와 직교)으로 배정하고,
// '정서가가 색 명명 반응을 얼마나 지연시키는가'(간섭)를 잰다.
//
// ★ 잉크색(빨강/파랑/노랑/검정)은 무채색 원칙의 '예외'가 아니라 과제 설계상 필수 요소다:
//   색 명명 반응 자체가 과제이고, 측정 대상은 잉크색이 아니라 '단어의 정서가'다. (잔상처럼 '색이 곧
//   자극'인 경우와 구분 — 여기선 색은 반응 유도용 도구, 정서가가 측정 대상.)
//
// ★ 임상 어휘 전면 배제(§0.1): "부정 단어에 느림 = 우울/불안/성향"으로 읽히면 안 된다. 결과 문구는
//   정상 반응임을 강조하고 진단 언어를 쓰지 않는다. 정확도(색 명명)만 신뢰도 축이고, 정서 효과의
//   방향/크기는 '정상 결과'라 경고로 묶지 않는다(§6).

import { runTask, QA } from '../core/engine.js';

// 잉크 4색 — 색 명명 반응 유도용. 색-단어 스트룹과 동일(버튼 위 글자 대비색 on).
export const COLORS = [
  { id: 'red',    hex: '#e53935', on: '#ffffff' },
  { id: 'blue',   hex: '#1e88e5', on: '#ffffff' },
  { id: 'yellow', hex: '#fdd835', on: '#212121' },
  { id: 'black',  hex: '#212121', on: '#ffffff' },
];
const byId = (id) => COLORS.find((c) => c.id === id);

const CONDS = ['neutral', 'positive', 'negative']; // 저장되는 condition 값
const ABBR = { neutral: 'neu', positive: 'pos', negative: 'neg' };

// 단어 데이터: [연령][정서가][언어]. 같은 인덱스 i 는 4언어에서 같은 정서가로 보정됨(직역 아님).
// 청소년판은 자해·죽음·심각한 가정불화 등을 정서 강도와 무관하게 배제(안전성 기준).
// export: 정서 점탐사(emo-dotprobe)가 같은 매트릭스를 단일 출처로 재사용한다(import).
export const WORD_DATA = {
  youth: {
    pos: { ko: ['합격', '친구', '칭찬', '방학', '선물', '소풍'], en: ['passed', 'friend', 'praise', 'vacation', 'gift', 'picnic'],
           es: ['aprobado', 'amigo', 'elogio', 'vacaciones', 'regalo', 'excursión'], zh: ['及格', '朋友', '表扬', '放假', '礼物', '郊游'] },
    neg: { ko: ['실수', '낙제', '창피', '외톨이', '놀림', '꾸중'], en: ['mistake', 'failing', 'embarrassed', 'left out', 'teased', 'scolded'],
           es: ['error', 'reprobado', 'vergüenza', 'excluido', 'burla', 'regaño'], zh: ['错误', '不及格', '丢脸', '孤单', '嘲笑', '挨骂'] },
    neu: { ko: ['책상', '연필', '창문', '신발', '우산', '접시'], en: ['desk', 'pencil', 'window', 'shoe', 'umbrella', 'plate'],
           es: ['escritorio', 'lápiz', 'ventana', 'zapato', 'paraguas', 'plato'], zh: ['书桌', '铅笔', '窗户', '鞋子', '雨伞', '盘子'] },
  },
  adults: {
    pos: { ko: ['승진', '월급', '휴가', '보너스', '여행', '성공', '결혼', '축하'], en: ['promotion', 'salary', 'vacation', 'bonus', 'travel', 'success', 'wedding', 'celebration'],
           es: ['ascenso', 'sueldo', 'vacaciones', 'bono', 'viaje', 'éxito', 'boda', 'celebración'], zh: ['升职', '工资', '休假', '奖金', '旅行', '成功', '结婚', '庆祝'] },
    neg: { ko: ['해고', '빚', '실직', '파산', '이혼', '체납', '과로', '압류'], en: ['fired', 'debt', 'unemployed', 'bankruptcy', 'divorce', 'overdue', 'overwork', 'repossession'],
           es: ['despido', 'deuda', 'desempleo', 'quiebra', 'divorcio', 'impago', 'sobrecarga', 'embargo'], zh: ['解雇', '债务', '失业', '破产', '离婚', '欠款', '过劳', '扣押'] },
    neu: { ko: ['서류', '열쇠', '의자', '봉투', '계단', '전등', '벽돌', '상자'], en: ['document', 'key', 'chair', 'envelope', 'stairs', 'lamp', 'brick', 'box'],
           es: ['documento', 'llave', 'silla', 'sobre', 'escalera', 'lámpara', 'ladrillo', 'caja'], zh: ['文件', '钥匙', '椅子', '信封', '楼梯', '电灯', '砖头', '箱子'] },
  },
};

// WORD_DATA 를 STRINGS 의 t() 키로 펼침: 키 = `w_<set>_<ab>_<i>`. renderStimulus 가 t() 로 조회하므로
// 언어 전환 시 엔진의 자극 재현(engine.js line 450)이 새 언어 단어로 자동 갱신된다(같은 정서가 유지).
function injectWords(strings) {
  for (const set of ['youth', 'adults'])
    for (const ab of ['pos', 'neg', 'neu'])
      for (const lang of ['ko', 'en', 'es', 'zh'])
        WORD_DATA[set][ab][lang].forEach((w, i) => { strings[lang]['w_' + set + '_' + ab + '_' + i] = w; });
}

// 각 조건(중립·긍정·부정)에 nPerCond 시행. 잉크색은 k%4 로 세 조건 모두 동일 분포(잉크 교란을 조건
// 간 동일하게 → 순수 정서가 효과만 조건차로 남음). 정답=항상 잉크색. 단어는 k%wordCount 로 순환.
function buildMainPool(nPerCond, wordSet) {
  const pool = [];
  for (const cond of CONDS) {
    const ab = ABBR[cond];
    const wordCount = WORD_DATA[wordSet][ab].ko.length;
    for (let k = 0; k < nPerCond; k++) {
      const ink = COLORS[k % COLORS.length];
      pool.push({ condition: cond, wordKey: `w_${wordSet}_${ab}_${k % wordCount}`, inkColor: ink.id, correct: ink.id });
    }
  }
  return pool; // 엔진 orderByConstraint 가 셔플(같은 조건 3연속 금지)
}

// 연습 5개: 전부 중립 단어(색 명명 메커닉만 익힘 — 정서 단어 사전 노출/점화 방지).
function buildPracticePool(wordSet) {
  const pool = [];
  const wordCount = WORD_DATA[wordSet].neu.ko.length;
  for (let k = 0; k < 5; k++) {
    const ink = COLORS[k % COLORS.length];
    pool.push({ condition: 'neutral', wordKey: `w_${wordSet}_neu_${k % wordCount}`, inkColor: ink.id, correct: ink.id, practice: true });
  }
  return pool;
}

// 자극: 단어(정서가 태그)를 t() 로 조회해 잉크색으로 표시. 정답은 잉크색.
function renderStimulus(trial, el, scale, t) {
  el.textContent = t(trial.wordKey);
  el.style.color = byId(trial.inkColor).hex;
  // QA 전용: 오답봇이 조건당 1오답을 결정론적으로 내도록 조건·페이즈 노출(실사용엔 안 붙음).
  if (QA) { el.dataset.cond = trial.condition; el.dataset.phase = trial.practice ? 'practice' : 'main'; }
}
// 버튼: 색으로 칠하고 색 이름을 얹는다(색-단어 스트룹과 동일).
function renderChoice(choice, btn, scale, t) {
  btn.style.background = choice.hex;
  btn.style.color = choice.on;
  btn.textContent = t('word_' + choice.id);
}

// 조건별 평균 RT와 유효 문항 수: 엔진이 표시한 rtValid(시간초과·오답·이상치·첫시행 제외) 시행만.
function condStats(records, cond) {
  const rs = records.filter((r) => r.rtValid && r.condition === cond).map((r) => r.rt);
  const mean = rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null;
  return { mean, count: rs.length };
}

const MIN_VALID = 6; // 간섭값은 두 구성 조건 각각 유효시행 이만큼일 때만(파생값 게이트)

// 결과: 정확도(전체) + 조건별 평균 RT + 정서 간섭 2개(부정−중립, 긍정−중립).
// series group: 'rt'(중립·긍정·부정, 같은 축) / 'interference'(간섭 2개, 별도 축).
function analyze(records, t) {
  const acc = records.length ? records.filter((r) => r.isCorrect).length / records.length : 0;
  const neu = condStats(records, 'neutral');
  const pos = condStats(records, 'positive');
  const neg = condStats(records, 'negative');
  // 게이트: 두 조건 평균 존재 AND 두 조건 각각 유효시행 ≥ MIN_VALID. 실패 시 간섭값 null.
  // 같은 null 값이 요약(ms→"—")과 그래프(점 안 찍힘)에 동일하게 흘러가 일관성 보장(교훈3).
  const gate = (a, b) => a.mean != null && b.mean != null && a.count >= MIN_VALID && b.count >= MIN_VALID;
  const negInt = gate(neg, neu) ? neg.mean - neu.mean : null;
  const posInt = gate(pos, neu) ? pos.mean - neu.mean : null;
  const ms = (v) => (v == null ? '—' : Math.round(v));
  // 색 명명 정확도만 신뢰도 축. 정서 효과의 방향/크기는 정상 결과라 경고 안 함(§6·§0.1).
  const topNotes = records.length && acc < 0.9 ? [t('lowAccuracy')] : [];
  // QA 전용: 판정값을 직접 노출(DOM 파싱 대신 계산값으로 단언). 두 게이트 독립 검증용.
  if (QA) window.__emoLast = { acc, negInt, posInt, neuCount: neu.count, posCount: pos.count, negCount: neg.count, lowAcc: topNotes.length > 0 };
  return {
    topNotes,
    series: [
      { key: 'neutral',   label: t('rtNeutral'),  value: neu.mean, color: '#8a8a8a', group: 'rt' },
      { key: 'positive',  label: t('rtPositive'), value: pos.mean, color: '#2e9e4f', group: 'rt' },
      { key: 'negative',  label: t('rtNegative'), value: neg.mean, color: '#e53935', group: 'rt' },
      { key: 'negInterf', label: t('negInterference'), value: negInt, color: '#5C4A73', group: 'interference' },
      { key: 'posInterf', label: t('posInterference'), value: posInt, color: '#5C4A73', group: 'interference' },
    ],
    summary: [
      { label: t('accuracy'),        value: Math.round(acc * 100), unit: '%' },
      { label: t('rtNeutral'),       value: ms(neu.mean), unit: 'ms', count: neu.count },
      { label: t('rtPositive'),      value: ms(pos.mean), unit: 'ms', count: pos.count },
      { label: t('rtNegative'),      value: ms(neg.mean), unit: 'ms', count: neg.count },
      { label: t('negInterference'), value: ms(negInt), unit: 'ms' },
      { label: t('posInterference'), value: ms(posInt), unit: 'ms' },
    ],
    // B④ 승인된 해석 문구(임상 어휘 배제)를 결과에 삽입. en/es/zh 는 커밋 전 별도 승인 예정.
    extraHtml: `<p style="margin:1rem 0 0;padding:.8rem 1rem;background:#f4f1f6;border:1px solid #e6e0ec;border-radius:12px;line-height:1.7;text-align:left;color:#555;font-size:.95rem">${t('valenceNote')}</p>`,
  };
}

// accuracy·lowAccuracy 문구는 엔진 i18n 이 제공(색-단어 스트룹과 동일). 여기선 과제 고유 문구만 정의.
const STRINGS = {
  ko: {
    title: '정서 스트룹',
    howto: '글자의 <b>색</b>에 해당하는 버튼을 누르세요.<br>단어의 <i>뜻</i>이 아니라, 실제로 <i>칠해진</i> 색입니다.',
    rtNeutral: '중립 단어 반응시간', rtPositive: '긍정 단어 반응시간', rtNegative: '부정 단어 반응시간',
    negInterference: '부정 간섭(부정−중립)', posInterference: '긍정 간섭(긍정−중립)',
    word_red: '빨강', word_blue: '파랑', word_yellow: '노랑', word_black: '검정',
    valenceNote: '조건별 평균 반응시간과, 중립 단어 대비 정서 단어에서의 차이를 보여드려요. 부정 단어에 조금 느려지는 건 많은 사람에게서 나타나는 <b>흔한 정상 반응</b>이에요. 그날의 컨디션·단어 친숙도·화면 환경 등 여러 이유로 달라지고, <b>특정 성향이나 우울·불안 같은 상태를 진단하지 않습니다.</b> 이건 검사가 아니라 체험이에요.',
  },
  en: {
    title: 'Emotional Stroop',
    howto: 'Press the button matching the <b>ink color</b> of the word.<br>Not what the word <i>means</i> — the color it is <i>painted</i>.',
    rtNeutral: 'Neutral-word RT', rtPositive: 'Positive-word RT', rtNegative: 'Negative-word RT',
    negInterference: 'Negative interference (neg − neutral)', posInterference: 'Positive interference (pos − neutral)',
    word_red: 'Red', word_blue: 'Blue', word_yellow: 'Yellow', word_black: 'Black',
    valenceNote: 'This shows your average reaction time in each condition and the difference between emotional and neutral words. Being a little slower on negative words is a <b>common, normal response</b> seen in many people. It varies with your mood that day, how familiar the words are, your screen, and more, and it <b>does not diagnose any trait or condition such as depression or anxiety.</b> This is an experience, not a test.',
  },
  es: {
    title: 'Stroop Emocional',
    howto: 'Pulsa el botón que corresponde al <b>color de la tinta</b> de la palabra.<br>No lo que la palabra <i>significa</i>, sino el color con que está <i>pintada</i>.',
    rtNeutral: 'TR palabra neutra', rtPositive: 'TR palabra positiva', rtNegative: 'TR palabra negativa',
    negInterference: 'Interferencia negativa (neg − neutra)', posInterference: 'Interferencia positiva (pos − neutra)',
    word_red: 'Rojo', word_blue: 'Azul', word_yellow: 'Amarillo', word_black: 'Negro',
    valenceNote: 'Esto muestra tu tiempo de reacción medio en cada condición y la diferencia entre las palabras emocionales y las neutras. Ser un poco más lento con las palabras negativas es una <b>reacción normal y común</b> en muchas personas. Varía según tu ánimo del día, lo familiares que te resulten las palabras, tu pantalla y más, y <b>no diagnostica ningún rasgo ni estado como la depresión o la ansiedad.</b> Esto es una experiencia, no un examen.',
  },
  zh: {
    title: '情绪斯特鲁普',
    howto: '请按下与文字<b>颜色</b>相符的按钮。<br>不是文字所<i>表示</i>的意思，而是实际<i>显示</i>的颜色。',
    rtNeutral: '中性词反应时间', rtPositive: '积极词反应时间', rtNegative: '消极词反应时间',
    negInterference: '消极干扰（消极−中性）', posInterference: '积极干扰（积极−中性）',
    word_red: '红', word_blue: '蓝', word_yellow: '黄', word_black: '黑',
    valenceNote: '这里显示你在各条件下的平均反应时间，以及情绪词相对中性词的差异。对消极词稍慢一些，是许多人身上都会出现的<b>常见的正常反应</b>。它会因当天的状态、对词语的熟悉程度、屏幕环境等多种原因而不同，<b>并不诊断抑郁、焦虑等任何倾向或状态。</b>这是体验，不是检查。',
  },
};
injectWords(STRINGS); // WORD_DATA → t() 키 주입

// 앱마다 다른 것: id, wordSet, 조건당 문항 수, 제한시간, 배율.
export function startEmoStroop({ id, wordSet, mainCountPerCond, timeLimitMs, scale }) {
  // QA 축약: 조건당 8문항(=24). 간섭 게이트(≥6 유효)를 QA에서 실제로 검증하려면 조건당 충분한 시행 필요.
  const n = QA ? 8 : mainCountPerCond;
  runTask({
    id,
    mount: 'app',
    family: 'mindfulness',
    conditionKeys: ['lang', 'input'], // RT 과제 + 언어 의존 단어 → 둘 다 유지(관성 아닌 판단)
    practiceCount: 5,
    timeLimitMs,
    scale,
    choices: COLORS,
    buildPracticePool: () => buildPracticePool(wordSet),
    buildMainPool: () => buildMainPool(n, wordSet),
    renderStimulus,
    renderChoice,
    analyze,
    strings: STRINGS,
  });
}
