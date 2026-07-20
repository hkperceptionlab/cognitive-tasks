// perception-error/score.js — 그룹B(착시·시간재현) 공용 오차 채점.
// "정답이 하나로 안 떨어지고, 실제값과 지각/재현값의 차이(오차)를 재는" 과제들이 공유.
// 순수 함수만 — 엔진(runTask)·DOM 무관. 각 과제의 *-common 이 import 해서
// analyze/playTrial 안에서 호출한다. JND 의 sessionAcc:()=>null 선례의 연장선이되,
// 역치(경계값)가 아니라 '부호 있는 오차(방향+크기)'를 다룬다.
//
// 원칙:
//  - 항상 부호 있는 값(지각/재현 − 실제)을 다룬다. 절대값 표시 여부는 과제가 정함.
//  - 신뢰도/경고 축은 여기 없다(v3 원칙4). 착시는 크게 속는 게 정상 →
//    오차의 크기·방향으로 신뢰도를 판단하지 않는다. 순응 게이트는 각 과제가
//    "지시 이행" 신호로만 topNotes 에 건다.

// 부호 있는 오차(같은 단위). perceived=지각/재현/설정값, actual=실제값.
export function signedError(perceived, actual) {
  return perceived - actual;
}

// 실제값 대비 백분율 오차(부호 유지). 자극 크기 지터·기기 해상도에 독립적인 비교 단위.
export function errorPct(perceived, actual) {
  return actual === 0 ? null : ((perceived - actual) / actual) * 100;
}

// 부호 있는 값들의 요약.
//   mean    = 편향(방향 포함) — 착시가 어느 쪽으로 얼마나 밀었는가
//   meanAbs = 정밀도(방향 무관) — 실제와 얼마나 벌어졌는가
//   sd, n
// 유효값이 없으면 전부 null(요약·그래프를 같은 게이트로 — 교훈3).
export function summarize(values) {
  const xs = values.filter((v) => v != null && isFinite(v));
  const n = xs.length;
  if (n === 0) return { mean: null, meanAbs: null, sd: null, n: 0 };
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const meanAbs = xs.reduce((a, b) => a + Math.abs(b), 0) / n;
  const sd = n > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
  return { mean, meanAbs, sd, n };
}

// 이번 회차 오차 궤적 스파크라인(extraHtml). JND 스파크라인 확장 —
// 핵심 차이: 0 기준선(점선)을 그려 과대(+)/과소(−)가 0 기준 어느 쪽인지 보이게 한다.
// 조정 과제는 시행 순서가 조건 셔플이라 '수렴 궤적'이 아니므로 점만 찍고 잇지 않는다
// (JND 계단식과 구분 — 거긴 순서가 의미라 선으로 이었다).
//   entries: [{ value, color }]  value=부호 있는 오차, color=조건색(핀 안/바깥 등)
//   opts:    { title, xLabel }   이미 번역된 문자열
export function errorSparkline(entries, { title, xLabel }) {
  const pts = entries.filter((e) => e.value != null && isFinite(e.value));
  if (pts.length < 2) return '';
  const vals = pts.map((e) => e.value);
  let min = Math.min(0, ...vals), max = Math.max(0, ...vals);   // 0 을 반드시 범위에 포함
  if (min === max) { min -= 1; max += 1; }
  const W = 320, H = 104, padL = 46, padR = 10, padT = 12, padB = 22;
  const x = (i) => padL + (i * (W - padL - padR)) / (pts.length - 1);
  const y = (v) => H - padB - ((v - min) / (max - min)) * (H - padT - padB);
  const y0 = y(0);
  const zeroLine = `<line x1="${padL}" y1="${y0}" x2="${W - padR}" y2="${y0}" ` +
    `stroke="var(--muted)" stroke-width="1" stroke-dasharray="3 3"/>`;
  const dots = pts.map((e, i) => `<circle cx="${x(i)}" cy="${y(e.value)}" r="3.5" fill="${e.color}"/>`).join('');
  const yTicks =
    `<text x="4" y="${y(max) + 4}" class="axis">${Math.round(max)}</text>` +
    `<text x="4" y="${y0 + 4}" class="axis">0</text>` +
    `<text x="4" y="${y(min) + 4}" class="axis">${Math.round(min)}</text>`;
  const xLab = `<text x="${(padL + W - padR) / 2}" y="${H - 4}" text-anchor="middle" class="axis">${xLabel}</text>`;
  return `<div class="perr-spark" style="margin:.2rem 0 .4rem"><h3 class="graph-title">${title}</h3>` +
    `<svg viewBox="0 0 ${W} ${H}" class="graph" role="img" aria-label="${title}">` +
    `${zeroLine}${dots}${yTicks}${xLab}</svg></div>`;
}
