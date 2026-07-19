# 부주의맹 데모 "보고도 못 본 순간" — 설계·인수인계 (빌드 대기)

지각 그룹D 4번째(마지막). HANDOFF v3/v4 합의 + 이번 세션에서 사용자 승인 완료.
**아직 빌드 안 됨** — 이 문서 기준으로 다음 세션에 구현한다. 추가 논의 불필요.

## 왜 이 설계인가 (배경)
부주의맹은 **평생 1회만** 효과가 있다 — 놓친 자극을 알고 나면 다음엔 절대 못 놓친다.
그래서 "재시작" 개념 자체가 성립하지 않는다. 완료 기록이 있으면 데모를 **다시 재생하지
않고** 곧바로 설명으로 간다. 리셋/기록삭제 UI는 만들지 않는다(정직함 원칙 v4 §5-1).

## 파일 구조 (그룹D 표준 그대로 — 사용자 확인)
`inattentional-blindness/` 단일 폴더. 기존 3데모(맹점·네커·잔상)와 동일하게:
`inattentional-blindness.js`(스타일 JS 주입) + `index.html` + `sw.js` + `manifest.webmanifest` + `icons/icon.svg`.
- **별도 style.css 안 만듦** — JS 주입 방식(3데모 표준)으로 통일하기로 사용자와 합의.
- `core/i18n.js`만 import(언어감지·전환·푸터), **엔진 파일 한 줄도 수정 안 함**, runTask 안 씀.
- 계열색 perception `#0E7C86` 재사용. sw.js는 blindspot/necker/afterimage와 동일 cache-first 템플릿(APP='inattentional-blindness', PRECACHE에 앱로컬 js + ../core/i18n.js).

## ★ 승인된 localStorage 판별·화면 분기 로직 (그대로 구현)
```javascript
import { LANG_NAMES, LANG_STORAGE_KEY, detectLang } from '../core/i18n.js';

const IB_KEY = 'ib_demo_completed';   // cog:* 키들과 충돌 없음(별도 네임스페이스)
const isDone = () => { try { return localStorage.getItem(IB_KEY) === '1'; } catch { return false; } };
const markDone = () => { try { localStorage.setItem(IB_KEY, '1'); } catch {} };

let stage = isDone() ? 'revisit' : 'intro';
// 첫 방문:  intro → counting → answer → sawCheck → result   (result 진입 시 markDone() 1회)
// 재방문:   revisit(설명만). counting/자극/카운트 입력 렌더 함수를 아예 호출하지 않음.
// 리셋 버튼 없음.
```
render()가 stage로 분기: revisit / intro / counting / answer / sawCheck / result.

## 화면별 설계
- **intro**: 카운팅 과제 안내 + "시작" 버튼. (예상 밖 자극에 대한 언급 절대 없음 — 미끼여야 함)
- **counting**: 무채색 도형 플래시(원·사각형이 무작위 위치에 잠깐 나타났다 사라짐, ~16초).
  "**원**이 몇 번 나타나는지 세어 주세요"(원=표적, 사각형=방해). 진행 타이머(막대바, 점수 아님).
  스케줄을 미리 생성해 표적(원) 참값을 안다. 끝나면 자동으로 answer로.
- **★예상 밖 자극**: counting 도중(~중반, 예: t≈6~10초) **큰 회색 삼각형이 화면을 가로질러
  활주**(~3.5초). **형태·크기·궤적으로 구별(색 아님)** — 플래시 도형보다 훨씬 크고, 다른 형태,
  매끄러운 수평 이동. 전부 무채색(밝기 차이는 허용, 색상 대비 금지).
- **answer**: "몇 번 나타났나요?" 숫자 입력(스테퍼나 버튼). **미끼 과제 응답 — 채점 없음.**
- **sawCheck**: "방금 화면에서 (원래 과제와 무관한) **다른 것**을 보셨나요?" 예/아니오.
- **result**(진입 시 `markDone()` 1회):
  - 놓침(아니오): 무엇이 지나갔는지 **공개**(삼각형 궤적 다시 보여줌) + 현상 설명. **판정 언어 금지**
    ("못 봤다=집중력 부족" 절대 금지 — 정상 뇌 작동임을 강조).
  - 봤음(예): "이미 알았거나 우연히 봤을 수 있어요 — 이 데모는 **처음 볼 때만** 의미가 있어요" + 설명.
- **revisit**(완료 기록 있음): "이 데모는 한 번만 효과가 있어 **다시 보여드리지 않아요**" + 부주의맹
  현상 설명 + 왜 재현이 안 되는지. **정직함 문구**: "기록은 이 브라우저에만 남아요. 다른 기기에선
  다시 볼 수 있지만, **이미 알게 된 이상 다음엔 놓치지 않을 거예요**"(‘완벽히 1회’라고 과장 금지).

## 설명 내용 + 4-way 대비
부주의맹 = **주의를 한 곳(세기)에 쏟는 동안, 눈에 다 들어온 뻔한 것을 못 알아채는 것**. 정상적인
뇌 작동. 앞의 셋과 나란히: 맹점=거기 정보 없음(물리 빈틈) / 네커=정보 애매(해석 모호) /
잔상=감각세포가 시간따라 반응 바꿈(순응) / **부주의맹=정보는 다 왔는데 주의가 딴 데 있어 못 챙김
(주의 배분)**. 이걸로 그룹D 4개가 "왜 못 보나/헷갈리나"의 서로 다른 층을 다 짚는다.

## 원칙 (기존 유지)
- 자극 무채색(색이 측정 대상 아님 → 잔상 같은 예외 불필요). 표적·자극 구별은 **형태/크기/궤적**.
- 점수·경과시간·비교·게임화·정답/오답 문구 **금지**. 판정 언어 금지.
- i18n ko/en/es/zh 4언어, t() 사용.

## QA (판정 없는 스모크만 — 코드 주석에도 명시)
로드·요소 존재·타이머/자극 등장 타이밍 동작·콘솔 에러 0. **주관적 지각(놓쳤는지)은 QA 대상 아님.**
분기 검증: 완료 기록 없을 때 intro 진입 / `ib_demo_completed`='1'이면 revisit 직행(counting 렌더
안 됨) — 두 경로 다 스모크로 확인. kind:'ib' 정도로 check.mjs에 추가.

## 다음 세션 TODO
1. `inattentional-blindness.js` 구현(위 분기 + intro/counting/answer/sawCheck/result/revisit + 자극 스케줄·삼각형 활주 애니메이션 + STRINGS 4언어).
2. index.html·sw.js·manifest·icon(그룹D 템플릿 복사).
3. qa/check.mjs에 스모크(kind:'ib'): 첫방문 경로 + 완료기록 세팅 후 revisit 직행 확인.
4. README 링크 추가. 전체 QA(30앱) 통과 확인.
5. **브라우저 눈확인 — 결과화면만 말고 counting 진행 화면·삼각형 등장 타이밍도.**
6. 커밋·푸시 + 메모리 갱신(그룹D 4/4 완료).
