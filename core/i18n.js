// core/i18n.js — 언어 문자열 (모든 과제 공유). ko, en, zh, es.
// 과제별 문자열은 각 과제의 config.strings 로 넘겨서 병합한다.

// 지원 언어와 각 언어의 자기 이름(전환 링크 표시용)
export const LANG_NAMES = {
  ko: '한국어',
  en: 'English',
  zh: '中文',
  es: 'Español',
};

// 선택 언어를 기기에 저장/복원하는 키 (앱 간 공유)
export const LANG_STORAGE_KEY = 'cog:lang';

export const ENGINE_STRINGS = {
  ko: {
    start: '시작',
    mainIntro: '연습은 끝났습니다. 준비되면 본시행을 시작하세요.',
    mainStart: '본시행 시작',
    timeout: '시간 초과',
    finished: '끝났습니다',
    accuracy: '정확도',
    lastSessions: '최근 7회',
    graphNote: '이 선의 변화는 능력의 변화가 아닙니다. 이 과제에 익숙해진 정도일 뿐입니다.',
    lowAccuracy: '정답률이 낮으면 반응시간을 믿기 어렵습니다.',
    lowAccLegend: '정답률 낮음',
    otherCondBase: '다른 조건으로 한 기록 {n}회는 표시하지 않았습니다.',
    diffLangReason: '언어마다 단어 길이가 달라 반응시간을 직접 비교할 수 없습니다.',
    diffInputReason: '마우스는 커서를 옮겨야 하므로 터치나 키보드보다 느립니다.',
    trialCount: '{n}문항',
    fewTrials: '문항이 적어 이 값은 크게 흔들립니다.',
    input_mouse: '마우스', input_touch: '터치', input_pen: '펜', input_keyboard: '키보드',
    again: '다시 하기',
    practiceLabel: '연습',
    mainLabel: '본시행',
    noHistory: '아직 기록이 없습니다',
    // 화면 하단에 항상 고정 표시
    disclaimer: '이 결과는 검사가 아닙니다. 어제의 나와만 비교하세요.',
  },
  en: {
    start: 'Start',
    mainIntro: 'Practice is done. When you are ready, start the main run.',
    mainStart: 'Start main run',
    timeout: 'Too slow',
    finished: 'Finished',
    accuracy: 'Accuracy',
    lastSessions: 'Last 7',
    graphNote: 'A change in this line is not a change in ability. It only reflects how used to this task you have become.',
    lowAccuracy: 'When accuracy is low, the reaction times are hard to trust.',
    lowAccLegend: 'Low accuracy',
    otherCondBase: '{n} record(s) done under other conditions are not shown.',
    diffLangReason: 'Word length differs by language, so reaction times cannot be compared directly.',
    diffInputReason: 'A mouse must be moved to the target, so it is slower than touch or keyboard.',
    trialCount: '{n} trials',
    fewTrials: 'Few trials — this value is quite unstable.',
    input_mouse: 'Mouse', input_touch: 'Touch', input_pen: 'Pen', input_keyboard: 'Keyboard',
    again: 'Do it again',
    practiceLabel: 'Practice',
    mainLabel: 'Main',
    noHistory: 'No records yet',
    disclaimer: 'This is not a test. Compare only with yesterday’s you.',
  },
  zh: {
    start: '开始',
    mainIntro: '练习结束。准备好后开始正式测试。',
    mainStart: '开始正式测试',
    timeout: '太慢了',
    finished: '结束了',
    accuracy: '正确率',
    lastSessions: '最近7次',
    graphNote: '这条线的变化并不代表能力的变化，只是说明你对这个任务的熟悉程度。',
    lowAccuracy: '正确率较低时，反应时间难以采信。',
    lowAccLegend: '正确率低',
    otherCondBase: '有 {n} 次在其他条件下完成的记录未显示。',
    diffLangReason: '不同语言的词长不同，反应时间无法直接比较。',
    diffInputReason: '鼠标需要移动光标，因此比触摸或键盘更慢。',
    trialCount: '{n}题',
    fewTrials: '题目较少，此数值波动较大。',
    input_mouse: '鼠标', input_touch: '触摸', input_pen: '触控笔', input_keyboard: '键盘',
    again: '再做一次',
    practiceLabel: '练习',
    mainLabel: '正式',
    noHistory: '暂无记录',
    disclaimer: '这不是检查。只和昨天的自己比较。',
  },
  es: {
    start: 'Empezar',
    mainIntro: 'La práctica ha terminado. Cuando estés listo, comienza la ronda principal.',
    mainStart: 'Comenzar ronda principal',
    timeout: 'Muy lento',
    finished: 'Terminado',
    accuracy: 'Precisión',
    lastSessions: 'Últimas 7',
    graphNote: 'Un cambio en esta línea no es un cambio de capacidad. Solo refleja cuánto te has acostumbrado a esta tarea.',
    lowAccuracy: 'Cuando la precisión es baja, los tiempos de reacción no son fiables.',
    lowAccLegend: 'Precisión baja',
    otherCondBase: 'No se muestran {n} registro(s) hechos en otras condiciones.',
    diffLangReason: 'La longitud de las palabras varía según el idioma, así que los tiempos de reacción no son directamente comparables.',
    diffInputReason: 'El ratón debe moverse hasta el objetivo, por lo que es más lento que el toque o el teclado.',
    trialCount: '{n} ítems',
    fewTrials: 'Pocos ítems: este valor es bastante inestable.',
    input_mouse: 'Ratón', input_touch: 'Táctil', input_pen: 'Lápiz', input_keyboard: 'Teclado',
    again: 'Hacerlo otra vez',
    practiceLabel: 'Práctica',
    mainLabel: 'Principal',
    noHistory: 'Aún no hay registros',
    disclaimer: 'Esto no es un examen. Compárate solo con tu yo de ayer.',
  },
};

// 언어 결정: ?lang=xx > 저장된 선택 > navigator.language > 기본 ko
export function detectLang() {
  const supported = Object.keys(LANG_NAMES);
  const q = new URLSearchParams(location.search).get('lang');
  if (q && supported.includes(q)) return q;
  try {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    if (saved && supported.includes(saved)) return saved;
  } catch {}
  const nav = (navigator.language || 'ko').slice(0, 2).toLowerCase();
  return supported.includes(nav) ? nav : 'ko';
}
