// inattentional-blindness/inattentional-blindness.js — 부주의맹 데모 "보고도 못 본 순간". 지각 그룹D 4번째(마지막).
//
// 맹점·네커·잔상에서 확정한 독립-데모 패턴 그대로: 시행 구조 없음, runTask 안 씀, core/i18n.js 만
// 재사용하고 자체 셸을 그린다. 엔진 파일 한 줄도 수정 안 함. 점수·경과시간·비교·게임화·정답/오답 문구 없음.
//
// ★ 이 데모만의 원칙(설계 승인): 부주의맹은 '평생 1회'만 효과가 있다 — 놓친 자극을 알고 나면 다음엔
//   절대 못 놓친다. 그래서 '재시작' 개념이 성립하지 않는다. 완료 기록(localStorage)이 있으면 데모를
//   다시 재생하지 않고 곧바로 설명(revisit)으로 간다. 리셋/기록삭제 UI는 만들지 않는다(정직함 원칙).
//
// ★ 색 원칙(다른 과제와 동일, 잔상 같은 예외 아님): 모든 자극 무채색. 표적(원)·방해(사각형)·예상 밖
//   자극(삼각형)의 구별은 색이 아니라 '형태·크기·궤적'으로만 한다. accent(perception 청록 #0E7C86)는
//   버튼·언어탭 같은 UI 에만 쓴다.
//
// 현상: 주의를 한 곳(세기)에 쏟는 동안, 눈에 다 들어온 뻔한 것을 못 알아채는 것. 정상적인 뇌 작동.
//   맹점(물리적 빈틈)·네커(해석 모호)·잔상(감각세포 순응)과 또 다른 결 = '정보는 다 왔는데 주의가
//   딴 데 있어 못 챙김'(주의 배분) — 설명 섹션에서 넷을 나란히 대비.

import { LANG_NAMES, LANG_STORAGE_KEY, detectLang } from '../core/i18n.js';

const ACCENT = '#0E7C86';
const QA = new URLSearchParams(location.search).get('qa') === '1';

// counting 단계 총 길이/자극 타이밍(QA는 전환·등장만 빠르게 검증 — 판정·설계 불변).
const COUNT_MS = QA ? 2400 : 16000;   // 카운팅 과제 전체 길이(~16초).
const TRI_START = QA ? 900 : 6500;    // 예상 밖 삼각형이 등장하는 시각(중반).
const TRI_DUR = QA ? 700 : 3500;      // 삼각형이 화면을 가로지르는 시간(~3.5초).

// 완료 기록 — cog:* 키들과 충돌 없는 별도 네임스페이스.
const IB_KEY = 'ib_demo_completed';
const isDone = () => { try { return localStorage.getItem(IB_KEY) === '1'; } catch { return false; } };
const markDone = () => { try { localStorage.setItem(IB_KEY, '1'); } catch {} };

let lang = detectLang();
// 첫 방문: intro → counting → answer → sawCheck → result (result 진입 시 markDone() 1회).
// 재방문(완료 기록 있음): revisit(설명만) — counting/자극/카운트 입력을 아예 렌더하지 않는다.
let stage = isDone() ? 'revisit' : 'intro';
let saw = null;        // sawCheck 응답: 'yes' | 'no'
let answerVal = 0;     // 미끼 과제 응답(채점 안 함).
let SCHED = null;      // counting 자극 스케줄(intro→counting 진입 때 생성).
let root = null, countRAF = 0, revealRAF = 0;

const t = (k) => (STRINGS[lang] && STRINGS[lang][k]) || STRINGS.ko[k] || k;

// counting 자극 스케줄을 미리 생성한다 — 표적(원) 참값을 알 수 있게(점수엔 안 씀).
function buildSchedule() {
  const flashes = [];
  const gap = QA ? 190 : 680;      // 도형 사이 평균 간격.
  const dur = QA ? 120 : 440;      // 각 도형이 보이는 시간.
  let time = QA ? 200 : 800;
  while (time < COUNT_MS - dur - 200) {
    const shape = Math.random() < 0.5 ? 'circle' : 'square';
    flashes.push({
      shape,
      xPct: 4 + Math.random() * 80,   // 컨테이너 폭 기준 좌상단 위치.
      yPct: 4 + Math.random() * 74,
      sizePct: 10 + Math.random() * 3,
      t0: time,
      t1: time + dur,
    });
    time += gap * (0.75 + Math.random() * 0.5);
  }
  return {
    flashes,
    tri: { t0: TRI_START, t1: TRI_START + TRI_DUR },
    targetCount: flashes.filter((f) => f.shape === 'circle').length,
  };
}

function injectStyles() {
  if (document.getElementById('ib-style')) return;
  const el = document.createElement('style');
  el.id = 'ib-style';
  el.textContent = `
:root{--ib-accent:${ACCENT}}
*{box-sizing:border-box}
html,body{margin:0}
.ib-root{min-height:100dvh;display:flex;flex-direction:column;background:#fafafa;color:#212121;
  font-family:system-ui,-apple-system,'Segoe UI',Roboto,'Noto Sans KR',sans-serif;
  padding-bottom:calc(1rem + env(safe-area-inset-bottom))}
.ib-top{padding:.7rem 1rem;display:flex;justify-content:flex-end}
.ib-langbar{display:flex;gap:.3rem;flex-wrap:wrap}
.langbtn{border:1px solid #d0d0d0;background:#fff;color:#757575;border-radius:999px;
  padding:.28rem .7rem;font-size:.82rem;font-weight:600;cursor:pointer;touch-action:manipulation}
.langbtn.on{background:var(--ib-accent);color:#fff;border-color:var(--ib-accent)}
.ib-stage{flex:1;display:flex;align-items:flex-start;justify-content:center;padding:1rem}
.ib-card{width:100%;max-width:560px;text-align:center}
.ib-title{font-size:1.5rem;margin:.3rem 0 .5rem}
.ib-lead{color:#555;margin:.2rem 0 1rem;line-height:1.6}
.ib-instruction{line-height:1.7;text-align:left;background:#eef4f3;border:1px solid #dbe9e7;
  border-radius:12px;padding:.85rem 1rem;margin:0 0 1.2rem}
.ib-instruction b{color:var(--ib-accent)}
/* counting 무대 — 무채색 도형이 무작위 위치에 잠깐 나타났다 사라진다. */
.ib-hint{font-weight:700;font-size:1.12rem;margin:.2rem 0 .7rem}
.ib-stage-box{position:relative;width:min(92vw,480px);height:min(62vh,460px);margin:0 auto;
  background:#f0f0f0;border:1px solid #e2e2e2;border-radius:14px;overflow:hidden}
.ib-flash{position:absolute;width:11%;aspect-ratio:1;background:#5f5f5f}
.ib-circle{border-radius:50%}
.ib-square{border-radius:4px}
/* 예상 밖 자극 — 크게, 다른 형태, 매끄러운 수평 이동. 무채색(밝기만 다름). */
.ib-triangle{position:absolute;top:40%;width:26%;aspect-ratio:1;background:#8a8a8a;
  clip-path:polygon(0 0,100% 50%,0 100%)}
.ib-bar{width:min(92vw,480px);height:10px;border-radius:999px;background:#e4e4e4;margin:.8rem auto 0;overflow:hidden}
.ib-bar-fill{height:100%;width:0%;background:var(--ib-accent);border-radius:999px}
/* answer 스테퍼 — 미끼 응답(채점 없음). */
.ib-stepper{display:flex;align-items:center;justify-content:center;gap:1.2rem;margin:1.2rem 0}
.ib-step{width:3.4rem;height:3.4rem;border-radius:50%;border:2px solid var(--ib-accent);background:#fff;
  color:var(--ib-accent);font-size:1.8rem;font-weight:800;line-height:1;cursor:pointer;touch-action:manipulation}
.ib-step:active{transform:translateY(1px)}
.ib-count{min-width:3.5rem;font-size:2.6rem;font-weight:800;color:#212121}
/* sawCheck / result 버튼 */
.ib-btns{display:flex;flex-direction:column;gap:.6rem;max-width:22rem;margin:1rem auto 0}
.ib-report{border:2px solid var(--ib-accent);background:#fff;color:var(--ib-accent);border-radius:12px;
  font-size:1.05rem;font-weight:700;padding:.8rem 1rem;min-height:3.2rem;cursor:pointer;touch-action:manipulation}
.ib-report:active{transform:translateY(1px)}
/* result 공개 — 지나간 삼각형을 다시 보여준다. */
.ib-mini-stage{position:relative;width:min(92vw,480px);height:min(34vh,220px);margin:.4rem auto 1rem;
  background:#f0f0f0;border:1px solid #e2e2e2;border-radius:14px;overflow:hidden}
.ib-replay{border:none;border-radius:10px;background:#eef4f3;color:var(--ib-accent);border:1px solid #dbe9e7;
  font-size:.95rem;font-weight:700;padding:.55rem 1.1rem;cursor:pointer;touch-action:manipulation;margin-bottom:1.2rem}
.ib-explain-body{line-height:1.8;text-align:left;margin:0 0 1.1rem}
.ib-explain-body b{color:var(--ib-accent)}
.ib-vs{line-height:1.75;text-align:left;background:#f4f1f6;border:1px solid #e6e0ec;border-radius:12px;
  padding:.8rem 1rem;margin:0 0 1.2rem}
.ib-vs b{color:var(--ib-accent)}
.ib-honesty{color:#757575;font-size:.92rem;line-height:1.6;text-align:left;margin:0 0 1rem}
.ib-honesty b{color:#555}
.ib-back{border:none;border-radius:12px;background:var(--ib-accent);color:#fff;font-size:1.05rem;font-weight:700;
  padding:.85rem 1.4rem;min-height:3.2rem;cursor:pointer;touch-action:manipulation;margin-top:.4rem}
.ib-back:active{transform:translateY(1px)}
.ib-footer{padding:.8rem 1rem;text-align:center;color:#9e9e9e;font-size:.82rem;border-top:1px solid #eee}`;
  document.head.appendChild(el);
}

function langbarHTML() {
  return Object.keys(LANG_NAMES).filter((l) => STRINGS[l])
    .map((l) => `<button class="langbtn${l === lang ? ' on' : ''}" data-lang="${l}">${LANG_NAMES[l]}</button>`).join('');
}

// ── 화면별 마크업 ──────────────────────────────────────────────
function introHTML() {
  return `
    <h1 class="ib-title">${t('title')}</h1>
    <p class="ib-lead">${t('introLead')}</p>
    <div class="ib-instruction">${t('introInstruction')}</div>
    <button class="ib-back" data-act="start">${t('startBtn')}</button>`;
}
function countingHTML() {
  return `
    <div class="ib-hint">${t('countHint')}</div>
    <div class="ib-stage-box"><div class="ib-triangle" style="display:none"></div></div>
    <div class="ib-bar"><div class="ib-bar-fill"></div></div>`;
}
function answerHTML() {
  return `
    <h1 class="ib-title">${t('answerTitle')}</h1>
    <p class="ib-lead">${t('answerLead')}</p>
    <div class="ib-stepper">
      <button class="ib-step" data-d="-1" aria-label="-1">−</button>
      <div class="ib-count">${answerVal}</div>
      <button class="ib-step" data-d="1" aria-label="+1">+</button>
    </div>
    <button class="ib-back" data-act="submitAnswer">${t('next')}</button>`;
}
function sawCheckHTML() {
  return `
    <h1 class="ib-title">${t('sawTitle')}</h1>
    <p class="ib-lead">${t('sawLead')}</p>
    <div class="ib-btns">
      <button class="ib-report" data-saw="yes">${t('sawYes')}</button>
      <button class="ib-report" data-saw="no">${t('sawNo')}</button>
    </div>`;
}
function resultHTML() {
  const missed = saw === 'no';
  const reveal = missed
    ? `<div class="ib-mini-stage"><div class="ib-triangle ib-triangle-reveal" style="display:none"></div></div>
       <button class="ib-replay" data-act="replay">${t('replay')}</button>`
    : '';
  return `
    <h1 class="ib-title">${t(missed ? 'resultMissTitle' : 'resultSawTitle')}</h1>
    <div class="ib-explain-body">${t(missed ? 'resultMissBody' : 'resultSawBody')}</div>
    ${reveal}
    <div class="ib-explain-body">${t('explainBody')}</div>
    <div class="ib-vs">${t('vsPrevious')}</div>
    <p class="ib-honesty">${t('honestyNote')}</p>`;
}
function revisitHTML() {
  return `
    <h1 class="ib-title">${t('revisitTitle')}</h1>
    <div class="ib-explain-body">${t('revisitBody')}</div>
    <div class="ib-explain-body">${t('explainBody')}</div>
    <div class="ib-vs">${t('vsPrevious')}</div>
    <p class="ib-honesty">${t('revisitHonesty')}</p>`;
}

// ── counting 애니메이션(단일 rAF가 도형 점멸 + 삼각형 활주 + 진행바를 모두 구동) ──
function startCounting() {
  const box = root.querySelector('.ib-stage-box');
  const fill = root.querySelector('.ib-bar-fill');
  const tri = root.querySelector('.ib-triangle');
  const nodes = SCHED.flashes.map((f) => {
    const n = document.createElement('div');
    n.className = 'ib-flash ' + (f.shape === 'circle' ? 'ib-circle' : 'ib-square');
    n.style.width = f.sizePct + '%';
    n.style.left = f.xPct + '%';
    n.style.top = f.yPct + '%';
    n.style.display = 'none';
    box.appendChild(n);
    return n;
  });
  const start = performance.now();
  const tick = (now) => {
    const e = now - start;
    for (let i = 0; i < nodes.length; i++) {
      const f = SCHED.flashes[i];
      nodes[i].style.display = (e >= f.t0 && e < f.t1) ? 'block' : 'none';
    }
    if (tri) {
      if (e >= SCHED.tri.t0 && e < SCHED.tri.t1) {
        const p = (e - SCHED.tri.t0) / (SCHED.tri.t1 - SCHED.tri.t0);
        tri.style.display = 'block';
        tri.style.left = (p * 130 - 30) + '%'; // 왼쪽 밖(-30%)에서 오른쪽 밖(100%)으로 활주.
      } else {
        tri.style.display = 'none';
      }
    }
    if (fill) fill.style.width = Math.min(100, (e / COUNT_MS) * 100) + '%';
    if (e < COUNT_MS) { countRAF = requestAnimationFrame(tick); }
    else { countRAF = 0; stage = 'answer'; render(); }
  };
  countRAF = requestAnimationFrame(tick);
}

// result에서 지나간 삼각형을 한 번(또는 재생 버튼으로 반복) 다시 보여준다.
function playTriangleReveal() {
  const tri = root.querySelector('.ib-triangle-reveal');
  if (!tri) return;
  if (revealRAF) { cancelAnimationFrame(revealRAF); revealRAF = 0; }
  const dur = QA ? 700 : 3200;
  const start = performance.now();
  const tick = (now) => {
    const p = Math.min(1, (now - start) / dur);
    tri.style.display = 'block';
    tri.style.left = (p * 130 - 30) + '%';
    if (p < 1) { revealRAF = requestAnimationFrame(tick); }
    else { revealRAF = 0; }
  };
  revealRAF = requestAnimationFrame(tick);
}

function render() {
  if (countRAF) { cancelAnimationFrame(countRAF); countRAF = 0; }
  if (revealRAF) { cancelAnimationFrame(revealRAF); revealRAF = 0; }
  if (stage === 'result') markDone();  // result 진입 시 1회(idempotent).

  let body;
  if (stage === 'revisit') body = revisitHTML();
  else if (stage === 'counting') body = countingHTML();
  else if (stage === 'answer') body = answerHTML();
  else if (stage === 'sawCheck') body = sawCheckHTML();
  else if (stage === 'result') body = resultHTML();
  else body = introHTML();

  root.innerHTML = `
    <header class="ib-top"><div class="ib-langbar">${langbarHTML()}</div></header>
    <main class="ib-stage"><div class="ib-card">${body}</div></main>
    <footer class="ib-footer">${t('disclaimer')}</footer>`;

  root.querySelectorAll('.langbtn').forEach((b) => b.addEventListener('click', () => {
    lang = b.dataset.lang; try { localStorage.setItem(LANG_STORAGE_KEY, lang); } catch {} render();
  }));

  if (stage === 'intro') {
    root.querySelector('[data-act="start"]').addEventListener('click', () => {
      SCHED = buildSchedule(); stage = 'counting'; render();
    });
  } else if (stage === 'counting') {
    startCounting();
  } else if (stage === 'answer') {
    root.querySelectorAll('.ib-step').forEach((b) => b.addEventListener('click', () => {
      answerVal = Math.max(0, Math.min(40, answerVal + Number(b.dataset.d)));
      const c = root.querySelector('.ib-count'); if (c) c.textContent = answerVal;
    }));
    root.querySelector('[data-act="submitAnswer"]').addEventListener('click', () => { stage = 'sawCheck'; render(); });
  } else if (stage === 'sawCheck') {
    root.querySelectorAll('.ib-report').forEach((b) => b.addEventListener('click', () => {
      saw = b.dataset.saw; stage = 'result'; render();
    }));
  } else if (stage === 'result') {
    if (saw === 'no') {
      playTriangleReveal();
      const rp = root.querySelector('[data-act="replay"]');
      if (rp) rp.addEventListener('click', playTriangleReveal);
    }
  }
  // revisit: 바인딩할 인터랙션 없음(설명만, 리셋 버튼 없음).
}

const STRINGS = {
  ko: {
    title: '숫자를 세어 볼까요',
    introLead: '화면에 도형이 잠깐씩 나타났다 사라져요. 딱 한 가지만 집중해서 세면 됩니다.',
    introInstruction: '무채색 <b>원</b>과 <b>사각형</b>이 여기저기 잠깐씩 나타나요. 이 중에서 <b>원이 몇 번 나타나는지</b>만 세어 주세요. 사각형은 무시해도 됩니다. 약 16초 동안 진행돼요.',
    startBtn: '시작',
    countHint: '원이 몇 번 나타나는지 세어 주세요',
    answerTitle: '원은 몇 번 나타났나요?',
    answerLead: '기억나는 대로 입력해 주세요. 정답을 맞히는 게 목적이 아니에요.',
    next: '다음',
    sawTitle: '한 가지만 더 여쭤볼게요',
    sawLead: '방금 화면에서, 세던 원·사각형 말고 <b>다른 무언가</b>를 보셨나요?',
    sawYes: '네, 뭔가 다른 걸 봤어요',
    sawNo: '아니요, 못 봤어요',
    resultMissTitle: '큰 회색 삼각형이 지나갔어요',
    resultMissBody: '원을 세는 데 집중하는 동안, <b>큰 회색 삼각형 하나가 화면을 가로질러 천천히 지나갔습니다.</b> 눈에는 분명히 들어왔는데도 알아채지 못했을 수 있어요. 이건 집중력이 부족해서가 아니라, 뇌가 원래 정상적으로 작동하는 방식이에요. 아래에서 그 삼각형을 다시 보여드릴게요.',
    resultSawTitle: '삼각형을 알아채셨군요',
    resultSawBody: '원을 세는 동안 큰 회색 삼각형 하나가 화면을 가로질러 지나갔어요. 그걸 알아채셨네요. 다만 이 데모는 <b>처음 볼 때만</b> 제대로 의미가 있어요 — 이미 무언가 나타날 걸 알고 봤다면 놓치기 어렵거든요.',
    replay: '삼각형 다시 보기',
    explainBody: '이 현상을 <b>부주의맹(inattentional blindness)</b>이라고 해요. 주의를 한 곳(원 세기)에 집중하고 있으면, 눈에는 다 들어온 뻔한 것조차 <b>주의가 닿지 않아 알아채지 못하는</b> 겁니다. 눈이 나쁘거나 집중력이 부족한 게 아니라, 우리 뇌가 한정된 주의를 배분하는 <b>정상적인 방식</b>이에요.',
    vsPrevious: '앞의 셋과 나란히 보면 — <b>맹점</b>은 “거기에 정보가 없어서”(물리적 빈틈), <b>네커 큐브</b>는 “정보가 애매해서”(해석의 모호함), <b>잔상</b>은 “감각세포가 시간따라 반응을 바꿔서”(순응)였어요. <b>부주의맹</b>은 또 다른 결이에요 — <b>정보는 눈에 다 들어왔는데, 주의가 딴 데 있어서 못 챙긴 것</b>(주의 배분)입니다.',
    honestyNote: '이 데모는 <b>처음 볼 때 한 번만</b> 효과가 있어요. 무엇이 지나갔는지 알게 된 이상, 다음엔 자연스럽게 눈에 띌 거예요. 그래서 다시 재생하지 않습니다.',
    revisitTitle: '이 데모는 다시 보여드리지 않아요',
    revisitBody: '이전에 이 데모를 완료하셨네요. 부주의맹은 <b>처음 볼 때 딱 한 번만</b> 효과가 있어요 — 무엇이 지나가는지 이미 알고 나면, 다음엔 그것이 자연스럽게 눈에 들어오기 때문에 같은 경험을 다시 만들 수 없어요. 그래서 카운팅 과제를 다시 재생하지 않고, 현상 설명만 보여드립니다.',
    revisitHonesty: '이 기록은 <b>이 브라우저에만</b> 남아요. 다른 기기에선 다시 볼 수 있지만, 이미 알게 된 이상 다음엔 놓치기 어려울 거예요.',
    disclaimer: '이 데모는 검사가 아니라 체험입니다.',
  },
  en: {
    title: 'Let’s Count Some Shapes',
    introLead: 'Shapes will briefly appear and disappear on screen. You only need to focus on one thing.',
    introInstruction: 'Grayscale <b>circles</b> and <b>squares</b> will pop up here and there for a moment. Just count <b>how many times a circle appears</b>. You can ignore the squares. It runs for about 16 seconds.',
    startBtn: 'Start',
    countHint: 'Count how many times a circle appears',
    answerTitle: 'How many times did a circle appear?',
    answerLead: 'Enter your best guess. Getting the exact number right is not the point.',
    next: 'Next',
    sawTitle: 'Just one more question',
    sawLead: 'A moment ago, did you see <b>anything else</b> besides the circles and squares you were counting?',
    sawYes: 'Yes, I saw something else',
    sawNo: 'No, I didn’t',
    resultMissTitle: 'A large gray triangle went by',
    resultMissBody: 'While you were busy counting circles, <b>a large gray triangle slowly crossed the screen.</b> It landed right on your retina, yet you may not have noticed it at all. This isn’t a lack of focus — it’s exactly how a normal brain works. Here it is again below.',
    resultSawTitle: 'You noticed the triangle',
    resultSawBody: 'A large gray triangle crossed the screen while you counted circles, and you noticed it. That said, this demo really only matters the <b>first</b> time — once you expect something to appear, it’s hard to miss.',
    replay: 'Show the triangle again',
    explainBody: 'This is called <b>inattentional blindness</b>. When your attention is fixed on one thing (counting circles), even something obvious that reaches your eyes can go <b>unnoticed because attention never lands on it</b>. It’s not poor eyesight or weak focus — it’s the <b>normal way</b> the brain rations its limited attention.',
    vsPrevious: 'Alongside the previous three — the <b>blind spot</b> came from “no information there” (a physical gap); the <b>Necker cube</b> from “ambiguous information” (an unstable reading); the <b>afterimage</b> from “sensing cells changing their response over time” (adaptation). <b>Inattentional blindness</b> is a different kind — <b>the information reached your eyes, but attention was elsewhere, so it was never picked up</b> (attention allocation).',
    honestyNote: 'This demo works only <b>the first time</b>. Now that you know what went by, you’ll naturally spot it next time — so it won’t be replayed.',
    revisitTitle: 'We won’t show this demo again',
    revisitBody: 'You’ve completed this demo before. Inattentional blindness only works <b>the very first time</b> — once you know what crosses the screen, it naturally catches your eye, so the same experience can’t be recreated. That’s why we skip the counting task and show only the explanation.',
    revisitHonesty: 'This record stays <b>only in this browser</b>. On another device you could see it again, but now that you know, you’ll likely not miss it.',
    disclaimer: 'This is an experience, not a test.',
  },
  zh: {
    title: '一起来数数图形',
    introLead: '屏幕上会有图形短暂出现又消失。你只需要专注数一样东西。',
    introInstruction: '无彩色的<b>圆形</b>和<b>方形</b>会在各处短暂闪现。请只数<b>圆形出现了几次</b>，方形可以忽略。大约持续 16 秒。',
    startBtn: '开始',
    countHint: '请数圆形出现了几次',
    answerTitle: '圆形出现了几次？',
    answerLead: '凭印象填写即可，数得准不准并不是重点。',
    next: '下一步',
    sawTitle: '再问一个问题',
    sawLead: '刚才在屏幕上，除了你在数的圆形和方形，你有没有看到<b>别的东西</b>？',
    sawYes: '有，我看到了别的东西',
    sawNo: '没有，我没看到',
    resultMissTitle: '一个大灰色三角形经过了',
    resultMissBody: '在你专心数圆形的时候，<b>有一个大灰色三角形缓缓从屏幕上横穿而过。</b>它明明进入了你的视野，你却可能完全没注意到。这不是注意力不足，而是大脑本来正常的工作方式。下面再给你看一次那个三角形。',
    resultSawTitle: '你注意到了三角形',
    resultSawBody: '在你数圆形时，有一个大灰色三角形横穿了屏幕，你注意到了它。不过这个演示真正有意义的只是<b>第一次</b>——一旦你预期会有东西出现，就很难错过了。',
    replay: '再看一次三角形',
    explainBody: '这种现象叫做<b>非注意盲视（inattentional blindness）</b>。当注意力集中在一件事上（数圆形）时，即使是进入了眼睛的显眼东西，也可能<b>因为注意力没落在它上面而被忽略</b>。这不是视力差或专注力不够，而是大脑分配有限注意力的<b>正常方式</b>。',
    vsPrevious: '与前面三个并排看——<b>盲点</b>是“那里没有信息”（物理空缺），<b>内克尔立方体</b>是“信息含糊”（解读不定），<b>余像</b>是“感光细胞随时间改变反应”（适应）。<b>非注意盲视</b>是又一种——<b>信息已经进入眼睛，但注意力在别处，所以没被捕捉到</b>（注意力分配）。',
    honestyNote: '这个演示只在<b>第一次</b>有效。既然你已经知道经过的是什么，下次自然会看到——所以不会再重播。',
    revisitTitle: '这个演示不会再播放',
    revisitBody: '你之前已经完成过这个演示。非注意盲视只在<b>第一次</b>有效——一旦知道屏幕上会经过什么，它就会自然吸引你的目光，同样的体验无法重现。所以我们跳过数数任务，只展示现象说明。',
    revisitHonesty: '这条记录只保存在<b>这个浏览器里</b>。换一台设备你还能再看，但既然已经知道了，下次大概不会错过。',
    disclaimer: '这是体验，不是检查。',
  },
  es: {
    title: 'Vamos a Contar Figuras',
    introLead: 'Aparecerán y desaparecerán figuras en la pantalla por un instante. Solo tienes que concentrarte en una cosa.',
    introInstruction: 'Aparecerán <b>círculos</b> y <b>cuadrados</b> en escala de grises aquí y allá por un momento. Solo cuenta <b>cuántas veces aparece un círculo</b>. Puedes ignorar los cuadrados. Dura unos 16 segundos.',
    startBtn: 'Empezar',
    countHint: 'Cuenta cuántas veces aparece un círculo',
    answerTitle: '¿Cuántas veces apareció un círculo?',
    answerLead: 'Escribe tu mejor estimación. Acertar el número exacto no es lo importante.',
    next: 'Siguiente',
    sawTitle: 'Solo una pregunta más',
    sawLead: 'Hace un momento, ¿viste <b>alguna otra cosa</b> además de los círculos y cuadrados que contabas?',
    sawYes: 'Sí, vi algo más',
    sawNo: 'No, no lo vi',
    resultMissTitle: 'Pasó un gran triángulo gris',
    resultMissBody: 'Mientras contabas círculos, <b>un gran triángulo gris cruzó lentamente la pantalla.</b> Llegó a tu retina y aun así puede que no lo notaras en absoluto. Esto no es falta de concentración — es exactamente cómo funciona un cerebro normal. Aquí lo tienes de nuevo, abajo.',
    resultSawTitle: 'Notaste el triángulo',
    resultSawBody: 'Un gran triángulo gris cruzó la pantalla mientras contabas círculos, y lo notaste. Aun así, esta demo solo tiene sentido de verdad la <b>primera</b> vez — una vez que esperas que aparezca algo, es difícil que se te escape.',
    replay: 'Ver el triángulo otra vez',
    explainBody: 'Esto se llama <b>ceguera por falta de atención (inattentional blindness)</b>. Cuando tu atención está fija en una cosa (contar círculos), incluso algo evidente que llega a tus ojos puede pasar <b>desapercibido porque la atención nunca se posa en ello</b>. No es mala vista ni poca concentración — es la <b>manera normal</b> en que el cerebro reparte su atención limitada.',
    vsPrevious: 'Junto a los tres anteriores — el <b>punto ciego</b> venía de “no hay información ahí” (un hueco físico); el <b>cubo de Necker</b>, de “información ambigua” (una lectura inestable); la <b>posimagen</b>, de “las células sensoras cambian su respuesta con el tiempo” (adaptación). La <b>ceguera por inatención</b> es otro tipo — <b>la información llegó a tus ojos, pero la atención estaba en otra parte, así que no se registró</b> (reparto de la atención).',
    honestyNote: 'Esta demo funciona solo <b>la primera vez</b>. Ahora que sabes qué pasó, lo verás de forma natural la próxima vez — por eso no se reproduce de nuevo.',
    revisitTitle: 'No mostraremos esta demo otra vez',
    revisitBody: 'Ya completaste esta demo antes. La ceguera por inatención solo funciona la <b>primera vez</b> — una vez que sabes qué cruza la pantalla, capta tu mirada de forma natural, así que la misma experiencia no puede recrearse. Por eso omitimos la tarea de contar y mostramos solo la explicación.',
    revisitHonesty: 'Este registro queda <b>solo en este navegador</b>. En otro dispositivo podrías verlo de nuevo, pero ahora que lo sabes, es probable que no se te escape.',
    disclaimer: 'Esto es una experiencia, no un examen.',
  },
};

// 초기화(STRINGS 선언 뒤 — const 는 호이스팅되지 않아 render 전에 정의돼 있어야 한다).
injectStyles();
root = document.createElement('div');
root.className = 'ib-root';
document.getElementById('app').appendChild(root);
render();
