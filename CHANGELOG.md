# 개발 변경 내역

## 2026-02-03: 스크롤 애니메이션 및 3D 모델 개선

### 1. 스크롤 애니메이션 패턴 변경

**변경 전:**
```
│ sectionStart ────────────────────── sectionEnd │
│     ↓         continuous movement          ↓   │
│  [============================================] │
```
- 오브젝트가 계속 움직여서 제대로 감상할 시간이 없음

**변경 후:**
```
│ sectionStart ────────────────────── sectionEnd │
│     ↓                                      ↓   │
│  [진입 20%][────고정 60%────][퇴장 20%]        │
│   천천히      중앙에서 정지     천천히          │
│   등장       (약간 회전만)     사라짐          │
```

**수정 파일:**
- `src/config/sceneConfig.ts`: `animationPhases` 설정 추가
- `src/scene/shapes/ModelShape.ts`: 3단계 애니메이션 로직 구현

**주요 코드:**
```typescript
export const animationPhases = {
  enterRatio: 0.2,   // 진입: 20%
  holdRatio: 0.6,    // 고정: 60%
  exitRatio: 0.2,    // 퇴장: 20%
};
```

---

### 2. 인트로 모델 제거 및 스크롤 힌트 파티클 추가

**변경 내용:**
- 처음에 3D 객체가 모여있다가 흩어지는 `IntroModels` 제거
- 아래 방향 화살표(▼) 형태의 스크롤 힌트 파티클로 대체
- HTML의 bounce 화살표 주석 처리

**새 파일:**
- `src/scene/ScrollHintParticles.ts`

**파티클 구성:**
- 50개: 흩어진 배경 파티클
- 15개: 화살표 V자 형태 (▼)
- 15개: 화살표 줄기 (세로선)

**수정 파일:**
- `src/scene/SceneManager.ts`: `IntroModels` → `ScrollHintParticles` 교체
- `index.html`: HTML bounce 화살표 주석 처리

---

### 3. HTML 섹션 업데이트

**변경 내용:**
기존 도형 기반 섹션을 6개 3D 모델에 맞게 수정

| 번호 | 모델명 | 애니메이션 |
|------|--------|------------|
| 01 | Fighter Plane | left-to-center |
| 02 | Henchman | scatter-to-form |
| 03 | Syringe Gun | right-to-center |
| 04 | Porsche 911 | zoom-through |
| 05 | BMW M2 | curve-zoom |
| 06 | GAZ-69 | left-to-center |

**수정 파일:**
- `index.html`: 6개 섹션 타이틀 및 설명 업데이트

---

### 4. 스크롤 타이밍 동기화

**문제:**
3D 모델과 텍스트 표시 시점 불일치

**해결:**
`scrollManager`가 `sceneConfig`의 설정값을 직접 참조하도록 수정

**수정 파일:**
- `src/utils/scrollManager.ts`
- `src/config/sceneConfig.ts`

**스크롤 설정:**
```typescript
export const scrollConfig = {
  introEnd: 0.1,
  sectionStart: 0.1,
  sectionGap: 0.15,        // 15% 간격 (6개 모델용)
  sectionDuration: 0.13,   // 13% 지속
  previewOffset: 0.04,
  modelCount: 6,
};
```

**스크롤 타임라인:**
```
0%        10%       25%       40%       55%       70%       85%      100%
│         │         │         │         │         │         │         │
▼         ▼         ▼         ▼         ▼         ▼         ▼         ▼
[INTRO]   [Model 0] [Model 1] [Model 2] [Model 3] [Model 4] [Model 5] [END]
          │진입│고정│퇴장│
```

---

### 5. 3D 모델 크기 정규화

**문제:**
모델마다 원본 크기가 달라서 일부 모델이 너무 크거나 작게 표시됨

**해결:**
바운딩 박스 기반 정규화 구현

**정규화 흐름:**
```
GLB 로드 → 바운딩 박스 계산 → 중앙 정렬 → 8 유닛으로 정규화 → 개별 scale 적용
```

**수정 파일:**
- `src/scene/shapes/ModelShape.ts`

**주요 코드:**
```typescript
geometry.computeBoundingBox();
if (geometry.boundingBox) {
  // 중앙 정렬
  const center = new THREE.Vector3();
  geometry.boundingBox.getCenter(center);
  geometry.translate(-center.x, -center.y, -center.z);

  // 바운딩 박스 크기 계산
  const size = new THREE.Vector3();
  geometry.boundingBox.getSize(size);
  const maxDimension = Math.max(size.x, size.y, size.z);

  // 목표 크기로 정규화 (8 유닛)
  const targetSize = 8;
  const normalizeScale = targetSize / maxDimension;
  geometry.scale(normalizeScale, normalizeScale, normalizeScale);

  // 개별 모델 스케일 적용 (미세 조정용)
  geometry.scale(this.data.scale, this.data.scale, this.data.scale);
}
```

---

## 파일 구조

```
src/
├── config/
│   └── sceneConfig.ts       # 중앙 설정 (스크롤, 모델, 애니메이션)
├── scene/
│   ├── SceneManager.ts      # 씬 관리자
│   ├── ParticleBackground.ts
│   ├── ScrollHintParticles.ts  # 스크롤 힌트 (NEW)
│   └── shapes/
│       ├── index.ts
│       └── ModelShape.ts    # 3D 모델 로더 및 애니메이션
├── utils/
│   ├── scrollManager.ts     # 스크롤 상태 관리
│   └── circleTexture.ts
├── main.ts
└── style.css
```

---

## 성능 설정

```typescript
export const PERFORMANCE_CONFIG = {
  maxVerticesPerModel: 15000,  // 모델당 최대 버텍스 수
  enableFrustumCulling: true,
};

// 디바이스별 파티클 수 조절
// 모바일: 50%, 저사양: 70%, 일반: 100%
```
