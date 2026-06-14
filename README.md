# 🎲 Yacht 전략 도우미

> MDP(마르코프 결정 과정) 기반 Yacht 다이스 게임 최적 전략 추천 PWA

---

## 데모

👉 **[배포 링크]** *(GitHub Pages URL 입력)*

---

## 소개

Backward Induction으로 사전에 계산된 Value Table을 이용해 현재 게임 상태에서 취해야 할 **정확한 최적 행동**을 추천합니다.

- 최적 전략 기대 점수: **191.77점**
- 추천 반응 속도: 즉각 (테이블 조회)
- 서버 없음 (완전 정적 배포)
- 오프라인 동작 지원 (PWA)

---

## 게임 규칙

| 카테고리 | 조건 | 점수 |
|----------|------|------|
| Ones ~ Sixes | 해당 숫자의 합 | 합산 |
| Upper Bonus | Ones~Sixes 합 ≥ 63 | +35 |
| Choice | 항상 | 5개 합산 |
| Poker | 같은 눈 4개 이상 | 5개 합산 |
| Full House | 3개 + 2개 (또는 5개 동일) | 5개 합산 |
| Small Straight | 연속 4개 이상 | 15점 |
| Large Straight | 연속 5개 | 30점 |
| Yacht | 5개 동일 | 50점 |

---

## 사용법

**1. 주사위 설정**
- 주사위를 클릭하면 값이 1→2→...→6→1 순으로 바뀝니다
- 🎲 랜덤 굴림 버튼으로 임의 결과 입력 가능

**2. 남은 굴림 횟수 선택**
- `2회`: 첫 굴림 직후 (라운드 시작)
- `1회`: 한 번 더 굴릴 수 있음
- `0회`: 반드시 카테고리에 기록해야 함

**3. 스코어카드 설정**
- 이미 사용한 카테고리에 체크
- Upper 누적 점수 입력 (Ones~Sixes 기록한 점수 합산)

**4. 추천 확인**
- 상단에 최적 행동이 즉시 표시됩니다

---

## 알고리즘

### MDP 구조

```
State  = (dice, rolls_left, scorecard, upper_sum)
Action = keep 선택 (rolls_left > 0)
         카테고리 선택 (rolls_left = 0)
```

### Value Table

Backward Induction으로 3개의 Value Table을 사전 계산합니다.

```
V0[sc, us, dice] : rolls_left=0 에서의 최적 기대 점수
V1[sc, us, dice] : rolls_left=1 에서의 최적 기대 점수
V2[sc, us, dice] : rolls_left=2 에서의 최적 기대 점수
```

계산 순서 (핵심):

```
for n_remaining = 1 → 12:
    V0[sc] 계산  →  Σⱼ T_empty[j] × V2[new_sc, nu, j] 참조
    V1[sc] 계산  →  max_K Σⱼ T[dice,K,j] × V0[sc,us,j]
    V2[sc] 계산  →  max_K Σⱼ T[dice,K,j] × V1[sc,us,j]
```

### 데이터 크기

| 파일 | 크기 | 내용 |
|------|------|------|
| `meta.json` | 2.0 MB | 주사위·점수 메타데이터 |
| `rl0.bin.gz` | 1.1 MB | rolls_left=0 최적 행동 테이블 |
| `rl1.bin.gz` | 1.6 MB | rolls_left=1 최적 행동 테이블 |
| `rl2.bin.gz` | 1.3 MB | rolls_left=2 최적 행동 테이블 |
| **합계** | **6.0 MB** | |

### 상태 공간

| 요소 | 크기 | 설명 |
|------|------|------|
| dice 조합 | 252 | C(10,5), 멀티셋 |
| scorecard | 4,095 | 2¹²-1 |
| upper_sum | 64 | 0~63 (클리핑) |
| rolls_left | 3 | 0, 1, 2 |
| 유효 상태 수 | ~1.35억 | scorecard·upper_sum 독립 X |

---

## 로컬 실행

별도 서버 없이 정적 파일 서빙만 하면 됩니다.

```bash
# Python
python3 -m http.server 8080

# Node.js
npx serve .
```

브라우저에서 `http://localhost:8080` 접속

---

## 기술 스택

- **전략 계산**: Python, NumPy (Backward Induction)
- **프론트엔드**: Vanilla JS, CSS (프레임워크 없음)
- **오프라인**: Service Worker (PWA)
- **배포**: GitHub Pages (서버 비용 없음)

---

## 라이선스

MIT
