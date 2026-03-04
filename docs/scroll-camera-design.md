# 스크롤 & 카메라 설계 논의

## 현재 구조

### 카메라

고정 위치. 스크롤에 따라 움직이지 않음.

```
카메라: position(0, 0, 8), FOV 45°, 정면을 바라봄
```

### 스크롤 → 애니메이션 매핑

스크롤 진행도(0.0~1.0)를 기준으로 각 모델에 구간을 할당.
모델이 해당 구간에서 파티클 scatter → reform(형성) → scatter(퇴장).

```
스크롤 0%                                        100%
├─ 모델0 ─────┤
          ├─ 모델1 ─────┤
                    ├─ 모델2 ─────┤
```

인트로 구간 없이 첫 모델이 즉시 시작. 3개 모델이 35% 간격으로 배치.

각 모델 구간 내부:

```
│ 진입 20% │      고정 60%      │ 퇴장 20% │
│ scatter→form │  형태 유지+패럴랙스 │ form→scatter │
│ 파티클 모임   │  마우스 인터랙션    │ 파티클 흩어짐  │
```

### 애니메이션 방식 (scatter-reform)

모델 오브젝트는 `(0, 0, 2)`에 고정. 이동 애니메이션 없음.
파티클이 랜덤 방향에서 모여서 형태를 만들고, 퇴장 시 다시 흩어짐.

- **진입**: 각 파티클이 구형 랜덤 위치(거리 5~15)에서 원래 위치로 모임 (easeOutQuad)
- **고정**: 형태 유지. 마우스 인터랙션 (scatter, orbit, size effect, parallax)
- **퇴장**: 원래 위치에서 다시 랜덤 방향으로 흩어짐 (easeInQuad)
- **첫 모델 예외**: 스크롤 최상단(0%)에서 scatter 없이 즉시 형태 표시

### 현재 방식의 특징

- **고정 위치**: 모든 모델이 `(0, 0, 2)`에 위치, 이동 없음
- **카메라 고정**: 카메라는 항상 `(0, 0, 8)`에서 정면을 바라봄
- **scatter-reform**: 파티클의 흩어짐/모임으로 전환 연출
- **마우스 인터랙션**: dome 영역 내 scatter, orbit, size effect, parallax 회전

---

## 대안 설계 옵션

### 옵션 A: L자형 (스크롤 후 줌인)

```
스크롤 0%─────────────70%  70%──────────100%
    │                  │         │
    │  모델들이 Y축     │   카메라가 Z축으로
    │  방향으로 순차     │   앞으로 이동
    │  등장/퇴장        │   (줌인 효과)
    │                  │         │
    ▼                  ▼         ▼ (Z축)

구간1 (0%~70%): 기존처럼 모델 순차 표시
구간2 (70%~100%): 마지막 모델에 카메라가 줌인 또는
                  카메라 자체가 Z축으로 전진
```

**구현 방법**:
- `SceneManager.animate()`에서 scrollProgress > 0.7이면 카메라 z 위치를 보간
- 또는 마지막 모델의 sectionDuration을 길게 잡고 고정 단계에서 scale을 키움

### 옵션 B: 카메라 레일 (스크롤 = 카메라 경로)

```
스크롤이 곧 카메라의 3D 경로:

0%: 카메라(0, 0, 8)   → 정면에서 시작
30%: 카메라(0, 0, 5)   → 살짝 다가감
60%: 카메라(2, 1, 3)   → 옆으로 이동
100%: 카메라(0, 0, -5)  → 객체를 통과

모델들은 고정 위치에 배치, 카메라가 이동하며 지나감
```

**구현 방법**:
- 카메라 경로를 `THREE.CatmullRomCurve3`로 정의
- scrollProgress를 curve.getPointAt()에 매핑
- 모델은 월드 공간에 고정 배치

### 옵션 C: 하이브리드 (객체 이동 + 카메라 이동)

```
0%~60%: 현재처럼 객체가 등장/퇴장 (카메라 고정)
60%~100%: 카메라가 특정 방향으로 이동하며 공간을 탐험
         배경 파티클이 스쳐 지나가는 효과
```

### 옵션 D: 연속 줌 (고정 단계 제거)

```
현재:  등장(20%) → 정지(60%) → 퇴장(20%)
변경:  등장(50%) → 퇴장(50%)  (정지 없이 계속 이동)

스크롤하면 객체가 계속 Z축으로 다가오다가 지나감
멈추는 구간 없이 연속적인 흐름
```

**구현 방법**:
- `animationPhases.holdRatio`를 0으로 설정
- 모든 모델 animation을 zoom-through로 통일
- enterRatio: 0.5, exitRatio: 0.5

---

## 변경 시 영향 범위

| 변경 사항 | 영향 파일 |
|-----------|----------|
| 카메라 이동 추가 | `SceneManager.ts` (animate에 카메라 업데이트 추가) |
| 카메라 경로 | `sceneConfig.ts` (경로 포인트 정의), `SceneManager.ts` |
| 애니메이션 페이즈 변경 | `sceneConfig.ts` (animationPhases 수정만으로 가능) |
| 마우스 인터랙션 조정 | `ModelShape.ts` (scatter/orbit/size 로직), `sceneConfig.ts` (particleConfig) |
| 모델 추가 | `sceneConfig.ts` (models 배열 + scrollConfig.modelCount) |

## 현재 설정값 참고

```typescript
// sceneConfig.ts
scrollConfig = {
  introEnd: 0,             // 인트로 없음
  sectionStart: 0,         // 첫 모델 즉시 시작
  sectionGap: 0.35,        // 35% 간격 (3개 모델 균등 배분)
  sectionDuration: 0.30,   // 30% 지속
  previewOffset: 0,        // 프리뷰 없음
  modelCount: 3,
};

animationPhases = {
  enterRatio: 0.2,   // 이 값들만 바꿔도 느낌이 달라짐
  holdRatio: 0.6,
  exitRatio: 0.2,
};

// SceneManager.ts
camera.position.set(0, 0, 8);  // 고정
camera.fov = 45;
```
