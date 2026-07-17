// corsi-common/corsi.js — 코시 블록 두들기기(Corsi block-tapping). 청소년·성인 앱이 공유.
//
// 엔진의 확장 훅 위에 얹는 첫 과제:
//   · mainTrials()  = async generator (적응형 계단식). buildMainPool 을 쓰지 않는다.
//   · playTrial()   = 한 시행 내부를 소유(9블록 판을 순차 점등 + 순서대로 탭 수집).
//   · sessionAcc()  = null (스팬 과제라 '정확도' 개념이 없어 저정확도 경고를 끈다).
//
// 앱마다 다른 것: id, scale(블록 크기), flashOn(점등 시간), flashGap(점등 간 간격).
//   startCorsi({ id, scale, flashOn, flashGap })

import { runTask, QA } from '../core/engine.js';

// 9블록 '고정 불규칙' 배치. 격자가 아니라 불규칙이어야 위치를 언어로 외우지 못하고
// 순수 시공간 기억을 잰다(Corsi 원판이 불규칙했던 이유). 정규화 좌표(0~1), 블록 중심 기준.
// 성인 블록(scale 1.5 → 폭 0.24)에도 겹치지 않도록 중심 간 최소거리 ≈0.30 을 확보했다.
const POSITIONS = [
  [0.13, 0.16], [0.44, 0.14], [0.78, 0.18],
  [0.24, 0.44], [0.58, 0.40], [0.86, 0.48],
  [0.15, 0.74], [0.47, 0.72], [0.78, 0.80],
];
const MAX_LEN = QA ? 3 : 9; // QA 축약: 적응형 최대 길이만 3으로 (판정·진행은 동일)

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
// 길이 len 시행: 서로 다른 블록 인덱스를 무작위 순서로 뽑는다(한 시행에 같은 블록 반복 없음).
const makeTrial = (len) => ({ len, sequence: shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8]).slice(0, len) });

function injectStyles() {
  if (document.getElementById('corsi-style')) return;
  const el = document.createElement('style');
  el.id = 'corsi-style';
  el.textContent = `
.corsi-board{position:relative;width:min(88vw,360px);aspect-ratio:1/1;margin:0 auto;
  touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.corsi-board.recall{cursor:pointer}
.corsi-block{position:absolute;border-radius:14%;background:#c7cfe0;
  box-shadow:0 1px 3px rgba(0,0,0,.18);transition:background .06s,transform .06s}
.corsi-board.recall .corsi-block{cursor:pointer}
.corsi-block.lit{background:var(--accent);transform:scale(1.06);box-shadow:0 3px 10px rgba(0,0,0,.28)}
.corsi-block.tap{background:var(--accent);opacity:.55}
/* 재현(recall) 단계가 아니면 블록 클릭을 완전히 무시한다 — 점등 중 클릭이 응답으로 새는 것 방지 */
.corsi-board:not(.recall) .corsi-block{pointer-events:none}
/* 시행 종료 표시(300ms): 성공/실패만. 어디서 틀렸는지·정답은 절대 드러내지 않는다 */
.corsi-fb{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
  font-size:min(38vw,150px);font-weight:800;pointer-events:none}
.corsi-fb.ok{color:#2e7d32}
.corsi-fb.no{color:#c62828}`;
  document.head.appendChild(el);
}

export function startCorsi({ id, scale = 1, flashOn = 700, flashGap = 400, accent }) {
  injectStyles();
  const blockFrac = 0.16 * scale;          // 블록 폭(판 대비). 성인 scale 1.5 → 0.24
  let board = null, blocks = [];

  // host 안에 9블록 판을 (처음 한 번) 만든다. 위치는 고정.
  function ensureBoard(host) {
    if (board && host.contains(board)) return;
    host.innerHTML = '';
    board = document.createElement('div');
    board.className = 'corsi-board';
    blocks = POSITIONS.map(([x, y], i) => {
      const b = document.createElement('div');
      b.className = 'corsi-block';
      b.dataset.idx = i;
      b.style.left = `${(x - blockFrac / 2) * 100}%`;
      b.style.top = `${(y - blockFrac / 2) * 100}%`;
      b.style.width = `${blockFrac * 100}%`;
      b.style.height = `${blockFrac * 100}%`;
      board.appendChild(b);
      return b;
    });
    host.appendChild(board);
  }

  function clearMarks() {
    board.classList.remove('recall');
    blocks.forEach((b) => b.classList.remove('lit', 'tap'));
    board.querySelectorAll('.corsi-fb').forEach((el) => el.remove());
  }

  // 시행 종료 표시(300ms). 판 위에 ✓/✗ 만 잠깐 띄운다(위치·정답 노출 없음).
  const END_FB_MS = 300;
  function showFeedback(success) {
    return new Promise((resolve) => {
      const fb = document.createElement('div');
      fb.className = 'corsi-fb ' + (success ? 'ok' : 'no');
      fb.textContent = success ? '✓' : '✗';
      board.appendChild(fb);
      setTimeout(() => { fb.remove(); resolve(); }, END_FB_MS);
    });
  }

  // 순서대로 탭을 받되, 코시 규칙대로 하나라도 어긋나면 '즉시 실패'로 끝낸다.
  // 전부 순서대로 맞아야 성공. 첫 탭이든 중간이든(중복 탭 포함) 어긋나는 즉시 종료하므로
  // 오답인데 시행이 늘어지지 않는다. 입력 방식(pointerType)도 기록.
  // 반환: { success, taps, inputs }
  function collectTaps(seq, onTap) {
    return new Promise((resolve) => {
      const taps = [], inputs = [];
      let pos = 0; // 다음에 맞아야 할 순서 위치
      const onDown = (e) => {
        const idx = Number(e.currentTarget.dataset.idx);
        taps.push(idx);
        inputs.push(e.pointerType || 'mouse');
        const el = e.currentTarget;
        el.classList.add('tap');
        setTimeout(() => el.classList.remove('tap'), 140);
        if (onTap) onTap(taps.length); // 진행표시 갱신용(몇 개 눌렀는지)
        const stop = (success) => {
          blocks.forEach((b) => b.removeEventListener('pointerdown', onDown));
          resolve({ success, taps, inputs });
        };
        if (idx === seq[pos]) {                 // 이번 순서 맞음
          pos++;
          if (pos >= seq.length) stop(true);    // 끝까지 순서대로 → 성공
        } else {
          stop(false);                          // 순서 어긋남 → 즉시 실패
        }
      };
      blocks.forEach((b) => b.addEventListener('pointerdown', onDown));
    });
  }

  const dominant = (arr) => {
    const c = {};
    arr.forEach((k) => { c[k] = (c[k] || 0) + 1; });
    let best = null, n = 0;
    for (const k in c) if (c[k] > n) { best = k; n = c[k]; }
    return best;
  };

  // 한 시행: 판 준비 → 순차 점등(다중 자극) → 순서 탭 수집(다중 응답) → 판정.
  async function playTrial(trial, ctx, phase) {
    const { host, timing, t } = ctx;
    ensureBoard(host);
    clearMarks();
    const len = trial.len;

    // 1) 기억 단계: 잠깐 정지 후 순서대로 점등
    ctx.setProgress(() => `${t('lenLabel')} ${len} · ${t('watch')}`);
    await delay(ctx.pickMs(timing.fixation));
    for (const idx of trial.sequence) {
      blocks[idx].classList.add('lit');
      await delay(timing.flashOn);
      blocks[idx].classList.remove('lit');
      await delay(timing.flashGap);
    }

    // 2) 재현 단계: 같은 순서로 탭. 진행표시에 '몇 개 눌렀는지'를 보여줘,
    //    길이마다 시행이 다른데도 사용자가 얼마나 남았는지 알 수 있게 한다.
    const showCount = (c) => ctx.setProgress(() => `${t('recall')} · ${c} / ${len}`);
    showCount(0);
    board.classList.add('recall');
    const { success, inputs } = await collectTaps(trial.sequence, showCount);
    board.classList.remove('recall');

    // 3) 시행 종료 표시(연습·본시행 공통, 300ms): 성공=✓ / 실패=✗ 만.
    //    코시는 시행마다 길이가 달라 '왜 끝났는지'가 안 보이면 고장으로 오인 → 표시가 필요.
    //    단, 어디서 틀렸는지·정답 순서는 절대 드러내지 않는다(학습 방지). 스트룹·Go/No-go 본시행은 무피드백 유지.
    await showFeedback(success);

    await delay(ctx.pickMs(timing.isi));
    const record = phase === 'main'
      ? { length: len, success, isCorrect: success, inputType: dominant(inputs) }
      : null;
    return { record, outcome: { success } };
  }

  // 적응형 계단식: 길이 2 시작 → 같은 길이 2회 중 1회라도 성공하면 +1,
  // 같은 길이 2회 다 실패하면 종료. 최대 9.
  async function* mainTrials() {
    for (let len = 2; len <= MAX_LEN; len++) {
      let anySuccess = false;
      for (let attempt = 0; attempt < 2; attempt++) {
        const outcome = yield makeTrial(len);
        if (outcome && outcome.success) anySuccess = true;
      }
      if (!anySuccess) return;
    }
  }

  // 연습: 길이 2 두 번(규칙 학습용, 기록 안 함)
  async function* practiceTrials() {
    yield makeTrial(2);
    if (!QA) yield makeTrial(2); // QA 는 연습 1회만
  }

  // 그래프 시리즈 색도 계열 강조색(--accent)을 따른다(색을 따로 하드코딩하지 않음).
  const themeAccent = () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#1D6F4F';

  function analyze(records, t) {
    const ok = records.filter((r) => r.success);
    const span = ok.length ? Math.max(...ok.map((r) => r.length)) : 0;
    const total = ok.length;
    return {
      summary: [
        { label: t('span'), value: span, unit: t('spanUnit') },
        { label: t('totalSuccess'), value: total, unit: t('trialsUnit') },
      ],
      series: [
        { key: 'span', label: t('span'), value: span, color: themeAccent(), group: 'span' },
      ],
      topNotes: [t('taskNote')],
    };
  }

  runTask({
    id,
    mount: 'app',
    scale,
    family: 'memory',            // 기억 계열 → 진한 초록 (색은 엔진 FAMILY_COLORS 한 곳에서)
    accent,                      // 앱이 index.html 에서 예외 지정 시 그 색이 우선
    choices: [],                 // 응답 버튼 없음 — 자극판 자체가 응답 표면
    timing: { fixation: [400, 600], isi: [500, 700], feedbackMs: 650, flashOn, flashGap },
    practiceTrials,
    mainTrials,
    playTrial,
    analyze,
    sessionAcc: () => null,      // 스팬 과제 — '정확도'가 없어 저정확도 경고/속빈점을 끔
    strings: STRINGS,
  });
}

const STRINGS = {
  ko: {
    title: '코시 블록',
    howto: '블록이 <b>하나씩 순서대로</b> 켜집니다.<br>같은 순서로 블록을 누르세요.',
    lenLabel: '길이',
    watch: '순서를 기억하세요',
    recall: '같은 순서로 누르세요',
    span: '코시 스팬',
    spanUnit: '칸',
    totalSuccess: '성공한 시행',
    trialsUnit: '회',
    taskNote: '이 과제는 시공간 순서를 기억하는 용량을 보여줍니다. 스트룹·Go/No-go와 달리 억제가 아니라 기억을 잽니다.',
    // 조건 필터 안내(엔진 기본은 반응시간 기준이라 코시엔 안 맞음 → 재정의)
    diffLangReason: '블록 위치를 기억하는 과제라 언어는 결과에 거의 영향을 주지 않습니다.',
    diffInputReason: '마우스·터치 등 입력 방식에 따라 블록을 정확히 누르는 난이도가 달라 결과에 영향을 줄 수 있습니다.',
  },
  en: {
    title: 'Corsi Blocks',
    howto: 'The blocks light up <b>one by one, in order</b>.<br>Tap the blocks in the same order.',
    lenLabel: 'Length',
    watch: 'Remember the order',
    recall: 'Tap in the same order',
    span: 'Corsi span',
    spanUnit: 'blocks',
    totalSuccess: 'Correct trials',
    trialsUnit: '',
    taskNote: 'This task shows how much visuospatial order you can hold. Unlike Stroop and Go/No-go, it measures memory, not inhibition.',
    diffLangReason: 'This task relies on remembering block positions, so language has little effect on the result.',
    diffInputReason: 'How you tap (mouse, touch, etc.) changes how precisely you hit the blocks, so it can affect the result.',
  },
  zh: {
    title: '科西方块',
    howto: '方块会<b>逐个按顺序</b>亮起。<br>请按相同的顺序点击方块。',
    lenLabel: '长度',
    watch: '记住顺序',
    recall: '按相同顺序点击',
    span: '科西广度',
    spanUnit: '格',
    totalSuccess: '成功的试次',
    trialsUnit: '次',
    taskNote: '这个任务展示你能记住的视空间顺序容量。与斯特鲁普和 Go/No-go 不同，它测量的是记忆，而不是抑制。',
    diffLangReason: '这个任务靠记住方块位置，语言对结果几乎没有影响。',
    diffInputReason: '用鼠标还是触摸等不同输入方式，会影响点准方块的难度，可能影响结果。',
  },
  es: {
    title: 'Bloques de Corsi',
    howto: 'Los bloques se iluminan <b>uno a uno, en orden</b>.<br>Toca los bloques en el mismo orden.',
    lenLabel: 'Longitud',
    watch: 'Recuerda el orden',
    recall: 'Toca en el mismo orden',
    span: 'Amplitud de Corsi',
    spanUnit: 'bloques',
    totalSuccess: 'Ensayos correctos',
    trialsUnit: '',
    taskNote: 'Esta tarea muestra cuánto orden visuoespacial puedes retener. A diferencia de Stroop y Go/No-go, mide la memoria, no la inhibición.',
    diffLangReason: 'Esta tarea depende de recordar posiciones de bloques, así que el idioma influye poco en el resultado.',
    diffInputReason: 'Cómo tocas (ratón, táctil, etc.) cambia la precisión al pulsar los bloques, así que puede influir en el resultado.',
  },
};
