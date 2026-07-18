// rotation-common/rotation.js — 머릿속에서 돌리기(Mental Rotation, Shepard & Metzler). 청소년·성인 공유.
//
// 글자(R/F/G 무작위)가 정상인지 거울상(좌우 뒤집힘)인지 고른다. 글자는 0·60·120·180° 기울어 있다.
// 핵심: 각도가 커질수록 반응시간이 직선으로 늘어남 → 그 '기울기'가 측정치. 단 직선성(R²)이 먼저다.
//
// 스트룹·사이먼과 같은 기본 엔진 경로(단일 자극·단일 응답). 회전은 renderStimulus 의 CSS transform.
// 계열 spatial(번트 오렌지). conditionKeys ['input'](라틴 문자라 언어 무관). sessionAcc 기본값 유지
// (정확도가 낮으면 기울기가 무의미해 저정확도 경고가 필요 — Stop-signal 과 반대).

import { runTask, QA } from '../core/engine.js';

const ANGLES = [0, 60, 120, 180];
const LETTERS = ['R', 'F', 'G'];

// 각도별 perAngle 시행: 정상:거울상 1:1. 글자 무작위, 60·120° 는 회전방향(±) 무작위(집계는 직립기준 각도).
function buildMainPool(perAngle) {
  const pool = [];
  for (const angle of ANGLES) {
    for (let k = 0; k < perAngle; k++) {
      const mirror = k >= perAngle / 2; // 앞 절반 정상, 뒤 절반 거울상 → 이후 orderByConstraint 가 섞음
      const sign = angle === 0 || angle === 180 ? 1 : (Math.random() < 0.5 ? 1 : -1);
      pool.push({
        condition: String(angle), angle, sign, mirror,
        letter: LETTERS[Math.floor(Math.random() * LETTERS.length)],
        correct: mirror ? 'mirror' : 'normal',
      });
    }
  }
  return pool;
}

// 연습 8개: 4각도 전부(표준 MR 실험처럼 본시행 전에 전 각도 범위를 익힌다 —
// 어려운 각도를 본시행에서 처음 보면 오류가 '난이도'가 아니라 '생소함'에서 온다). 정상·거울상 섞음.
function buildPracticePool() {
  const pool = [];
  for (const angle of ANGLES) {
    for (let k = 0; k < 2; k++) {
      const mirror = k >= 1;
      const sign = angle === 0 || angle === 180 ? 1 : (Math.random() < 0.5 ? 1 : -1);
      pool.push({ condition: String(angle), angle, sign, mirror, letter: LETTERS[Math.floor(Math.random() * LETTERS.length)], correct: mirror ? 'mirror' : 'normal' });
    }
  }
  return pool;
}

// 자극: 기울인(±각도) + 정상/거울상(scaleX) 글자. 봇이 판별할 수 있게 class 로 노출.
function renderStimulus(trial, el, scale, t) {
  el.innerHTML =
    `<span class="rot-glyph" style="display:inline-block;font-weight:800;` +
    `transform:rotate(${trial.angle * trial.sign}deg) scaleX(${trial.mirror ? -1 : 1})">${trial.letter}</span>`;
}

// 응답 버튼: 정상 / 거울상 (글자가 아니라 판정이라 라벨은 언어별, 단 기울기엔 영향 없는 상수).
function renderChoice(choice, btn, scale, t) {
  btn.textContent = t('choice_' + choice.id);
  btn.style.background = 'var(--accent)';
  btn.style.color = '#fff';
}

const med = (a) => {
  if (!a.length) return null;
  const s = a.slice().sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const themeAccent = () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#A04A15';

// (각도, 중앙값RT) 점들로 최소제곱 회귀 → { slope(ms/도), intercept, r2 }. 점 2개 미만이면 null.
function linreg(pts) {
  const n = pts.length;
  if (n < 2) return null;
  const mx = pts.reduce((s, p) => s + p.x, 0) / n;
  const my = pts.reduce((s, p) => s + p.y, 0) / n;
  let sxx = 0, sxy = 0, syy = 0;
  pts.forEach((p) => { sxx += (p.x - mx) ** 2; sxy += (p.x - mx) * (p.y - my); syy += (p.y - my) ** 2; });
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  const r2 = syy === 0 ? 1 : (sxy * sxy) / (sxx * syy);
  return { slope, intercept: my - slope * mx, r2 };
}

// extraHtml: x=각도, y=RT 산점도 + 회귀직선. 색 var(--accent), 라벨 t(), 판정 문구 없음.
function rotationChart(points, reg, t) {
  if (!points.length) return '';
  const W = 320, H = 148, padL = 44, padR = 12, padT = 14, padB = 34;
  const ys = points.map((p) => p.y);
  let ymin = Math.min(...ys), ymax = Math.max(...ys);
  if (reg) { ymin = Math.min(ymin, reg.intercept); ymax = Math.max(ymax, reg.intercept + reg.slope * 180); }
  if (ymin === ymax) { ymin -= 50; ymax += 50; }
  const x = (a) => padL + (a / 180) * (W - padL - padR);
  const y = (v) => H - padB - ((v - ymin) / (ymax - ymin)) * (H - padT - padB);
  const line = reg
    ? `<line x1="${x(0)}" y1="${y(reg.intercept)}" x2="${x(180)}" y2="${y(reg.intercept + reg.slope * 180)}" stroke="var(--accent)" stroke-width="2" opacity="0.55"/>`
    : '';
  const dots = points.map((p) => `<circle cx="${x(p.x)}" cy="${y(p.y)}" r="4" fill="var(--accent)"/>`).join('');
  const xticks = ANGLES.map((a) => `<text x="${x(a)}" y="${H - 14}" text-anchor="middle" class="axis">${a}</text>`).join('');
  const yticks = `<text x="4" y="${y(ymax) + 4}" class="axis">${Math.round(ymax)}</text><text x="4" y="${y(ymin) + 4}" class="axis">${Math.round(ymin)}</text>`;
  const xlabel = `<text x="${(padL + W - padR) / 2}" y="${H - 2}" text-anchor="middle" class="axis">${t('angleAxis')}</text>`;
  return `<div class="rot-chart"><h3 class="graph-title">${t('rotTrend')}</h3>` +
    `<svg viewBox="0 0 ${W} ${H}" class="graph" role="img" aria-label="${t('rotTrend')}">${line}${dots}${xticks}${yticks}${xlabel}</svg></div>`;
}

// 회전 속도(역수)를 보여줄 최소 직선 적합도. 유의검정 아님 — 점이 4개(각도별 중앙값)뿐이라
// R² 자체가 불안정하고 4점 F검정은 엄밀하지 않다. '직선이 분산의 절반 이상을 설명'하는 판단 컷(임의값).
const R2_MIN = 0.5;
// 각도 정확도가 이 이하이면 2지선다 우연(50%)에 가까워 그 각도의 RT는 해석 불가로 본다(판단 컷).
const CHANCE_ACC = 0.625;

function analyze(records, t) {
  const ms = (v) => (v == null ? '—' : Math.round(v));
  const overall = records.length ? records.filter((r) => r.isCorrect).length / records.length : 0;
  // 각도별: 정확도를 각 줄에 표시. 중앙값 RT는 '정답 시행만'(오답·시간초과 제외).
  //   ※ 2지선다라 찍어도 50% 맞고 그 절반이 '정답'으로 통과하므로, 이 필터는 완전한 안전장치가
  //     아니다. 그래서 우연 수준 각도를 아래에서 사실로 표시한다(해석은 사용자에게).
  const rows = [];
  const points = [];
  const nearChance = [];
  for (const angle of ANGLES) {
    // 엔진 기본 record 는 커스텀 필드(angle)를 안 담고 condition(=각도 문자열)만 담는다.
    const at = records.filter((r) => r.condition === String(angle));
    const accA = at.length ? at.filter((r) => r.isCorrect).length / at.length : null;
    const goodRts = at.filter((r) => r.isCorrect && r.rt != null && r.rt >= 200).map((r) => r.rt);
    const m = med(goodRts);
    if (m != null) points.push({ x: angle, y: m });
    if (accA != null && accA <= CHANCE_ACC) nearChance.push(angle + '°');
    rows.push({ label: t('angleAcc', { a: angle, p: accA == null ? '—' : Math.round(accA * 100) }), value: ms(m), unit: 'ms', count: goodRts.length });
  }
  const reg = linreg(points);           // 유효 각도점 2개 미만이면 null
  const slope = reg ? reg.slope : null; // ms/도
  const r2 = reg ? reg.r2 : null;
  // 회전 속도(역수)는 '직선이 실제로 맞을 때'만: 양의 기울기 + R²≥컷. 아니면 '—'.
  // (안내문이 "직선을 안 이루면 기울기 숫자는 의미 없음"이라 했으니 그 파생값을 발표하지 않는다.)
  const speedOk = slope != null && slope > 0 && r2 != null && r2 >= R2_MIN;
  const degPerSec = speedOk ? 1000 / slope : null;

  const topNotes = [t('taskNote'), t('sampleNote')];
  if (records.length && overall < 0.9) topNotes.push(t('lowAccuracy'));
  if (points.length < 2) topNotes.push(t('fewPointsNote'));       // 각도점 부족 → 기울기 자체 불가
  else if (!speedOk) topNotes.push(t('speedGateNote'));           // 직선을 안 이뤄 회전 속도 불가
  if (nearChance.length) topNotes.push(t('chanceNote', { a: nearChance.join(', ') }));

  return {
    topNotes,
    // 추세 그래프도 요약과 같은 R² 게이트를 건다: 직선이 안 맞으면(R²<컷) 이 회차의 기울기는
    // 신뢰할 수 없으므로 점을 아예 안 찍는다(null → 미표시·선 끊김). 요약에서 막은 값을 그래프에서
    // 통과시키면 게이트가 무의미하고, 속빈점('정답률 낮음')에 두 번째 뜻을 붙이면 범례가 헷갈린다.
    series: [{ key: 'slope', label: t('slope'), value: r2 != null && r2 >= R2_MIN ? slope : null, color: themeAccent(), group: 'slope' }],
    summary: [
      ...rows,
      { label: t('accuracy'), value: Math.round(overall * 100), unit: '%' },
      { label: t('slope'), value: slope == null ? '—' : slope.toFixed(1), unit: t('slopeUnit') },
      { label: t('rSquared'), value: r2 == null ? '—' : r2.toFixed(2), unit: '' }, // R²를 기울기 바로 옆에
      { label: t('rotSpeed'), value: degPerSec == null ? '—' : Math.round(degPerSec), unit: t('rotSpeedUnit') },
    ],
    extraHtml: rotationChart(points, reg, t),
  };
}

export function startRotation({ id, perAngle, timeLimitMs, scale = 1, accent }) {
  const per = QA ? 2 : perAngle; // QA 축약: 각도 4개는 유지, 각도당 시행 수만 줄임
  runTask({
    id,
    mount: 'app',
    scale,
    family: 'spatial',          // 번트 오렌지
    accent,
    conditionKeys: ['input'],   // 라틴 문자라 언어 무관(버튼 라벨은 각도-무관 상수 → 기울기에 영향 없음)
    timeLimitMs,
    practiceCount: 8,
    choices: [{ id: 'normal' }, { id: 'mirror' }],
    buildPracticePool,
    buildMainPool: () => buildMainPool(per),
    renderStimulus,
    renderChoice,
    analyze,
    strings: STRINGS,
  });
}

const STRINGS = {
  ko: {
    title: '머릿속에서 돌리기',
    howto: '글자가 <b>정상</b>인지 <b>거울상</b>(좌우 뒤집힘)인지 고르세요.<br>글자가 기울어 있어도 머릿속에서 <i>돌려서</i> 판단하세요. 방향(각도)은 묻지 않습니다.',
    choice_normal: '정상', choice_mirror: '거울상',
    angleAcc: '{a}° (정답 {p}%)',
    slope: '기울기', slopeUnit: 'ms/도',
    rotSpeed: '회전 속도', rotSpeedUnit: '도/초',
    rSquared: 'R² (직선 적합도)',
    rotTrend: '각도별 반응시간', angleAxis: '각도(°)',
    taskNote: '각도가 커질수록 반응시간이 늘어나면, 머릿속에서 도형을 실제로 돌려 맞춰보고 있다는 신호입니다. 기울기는 얼마나 빨리 돌리는지를 봅니다. 다만 점들이 직선을 이루지 않으면(R²가 낮으면) 기울기 숫자는 의미가 없습니다.',
    sampleNote: '각도당 시행이 8개(성인 12개)뿐이라 기울기·R²가 회차마다 크게 달라질 수 있습니다. 정밀한 측정이 아닙니다.',
    fewPointsNote: '유효 응답(정답)이 있는 각도가 2개 미만이라 기울기를 계산할 수 없습니다.',
    speedGateNote: '점들이 직선을 이루지 않아 회전 속도를 계산할 수 없습니다.',
    chanceNote: '{a}는 정답과 오답이 반반(우연 수준 50%)에 가까워, 그 각도의 반응시간은 해석하기 어렵습니다.',
    diffInputReason: '입력 방식(키·터치·마우스)에 따라 버튼 누르는 속도가 달라 반응시간에 영향을 줄 수 있습니다(기울기에는 영향이 적습니다).',
  },
  en: {
    title: 'Turning It in Your Head',
    howto: 'Choose whether the letter is <b>normal</b> or <b>mirrored</b> (flipped left–right).<br>Even when it is tilted, <i>rotate</i> it in your head to decide. The angle is not asked.',
    choice_normal: 'Normal', choice_mirror: 'Mirror',
    angleAcc: '{a}° (correct {p}%)',
    slope: 'Slope', slopeUnit: 'ms/deg',
    rotSpeed: 'Rotation speed', rotSpeedUnit: 'deg/s',
    rSquared: 'R² (fit to a line)',
    rotTrend: 'Reaction time by angle', angleAxis: 'angle (°)',
    taskNote: 'If reaction time rises as the angle grows, that is a sign you are actually rotating the shape in your head to compare. The slope shows how fast you rotate. But if the points do not fall on a line (low R²), the slope number is meaningless.',
    sampleNote: 'There are only 8 trials per angle (12 for adults), so the slope and R² can vary a lot from run to run. This is not a precise measurement.',
    fewPointsNote: 'Fewer than two angles have a valid (correct) response, so the slope cannot be computed.',
    speedGateNote: 'The points do not fall on a line, so rotation speed cannot be computed.',
    chanceNote: 'At {a}, correct and wrong answers are near 50/50 (chance level), so reaction time at that angle is hard to interpret.',
    diffInputReason: 'How you respond (key, touch, mouse) changes how fast you press, so it can affect reaction time (it has little effect on the slope).',
  },
  zh: {
    title: '在脑中旋转',
    howto: '判断字母是<b>正常</b>还是<b>镜像</b>（左右翻转）。<br>即使字母是倾斜的，也请在脑中<i>旋转</i>后再判断。不问角度。',
    choice_normal: '正常', choice_mirror: '镜像',
    angleAcc: '{a}°（正确 {p}%）',
    slope: '斜率', slopeUnit: 'ms/度',
    rotSpeed: '旋转速度', rotSpeedUnit: '度/秒',
    rSquared: 'R²（直线拟合）',
    rotTrend: '各角度反应时间', angleAxis: '角度(°)',
    taskNote: '如果角度越大反应时间越长，说明你在脑中真的把图形旋转过来比较。斜率反映你旋转得多快。但如果这些点不成一条直线（R² 低），斜率数字就没有意义。',
    sampleNote: '每个角度只有 8 个试次（成人 12 个），所以斜率和 R² 每次差别很大。这不是精确测量。',
    fewPointsNote: '有效（正确）反应的角度少于两个，无法计算斜率。',
    speedGateNote: '这些点不成一条直线，因此无法计算旋转速度。',
    chanceNote: '在 {a}，正确与错误接近各半（随机水平 50%），因此该角度的反应时间难以解读。',
    diffInputReason: '不同的响应方式（按键、触摸、鼠标）会影响你按下的速度，可能影响反应时间（对斜率影响较小）。',
  },
  es: {
    title: 'Girarlo en la Mente',
    howto: 'Elige si la letra es <b>normal</b> o <b>reflejada</b> (invertida izquierda–derecha).<br>Aunque esté inclinada, <i>gírala</i> en tu mente para decidir. No se pregunta el ángulo.',
    choice_normal: 'Normal', choice_mirror: 'Espejo',
    angleAcc: '{a}° (correcto {p}%)',
    slope: 'Pendiente', slopeUnit: 'ms/grado',
    rotSpeed: 'Velocidad de giro', rotSpeedUnit: 'grados/s',
    rSquared: 'R² (ajuste a una recta)',
    rotTrend: 'Tiempo de reacción por ángulo', angleAxis: 'ángulo (°)',
    taskNote: 'Si el tiempo de reacción sube al aumentar el ángulo, es señal de que estás girando la figura en tu mente para compararla. La pendiente muestra lo rápido que giras. Pero si los puntos no forman una recta (R² bajo), el número de la pendiente no significa nada.',
    sampleNote: 'Solo hay 8 ensayos por ángulo (12 en adultos), así que la pendiente y el R² varían mucho entre rondas. No es una medición precisa.',
    fewPointsNote: 'Menos de dos ángulos tienen una respuesta válida (correcta), así que la pendiente no puede calcularse.',
    speedGateNote: 'Los puntos no forman una recta, así que la velocidad de giro no puede calcularse.',
    chanceNote: 'En {a}, las respuestas correctas e incorrectas están cerca del 50/50 (nivel de azar), así que el tiempo de reacción en ese ángulo es difícil de interpretar.',
    diffInputReason: 'Cómo respondes (tecla, táctil, ratón) cambia lo rápido que pulsas, así que puede afectar el tiempo de reacción (afecta poco a la pendiente).',
  },
};
