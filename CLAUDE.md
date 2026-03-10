# CLAUDE.md - 프로젝트 컨텍스트

## 프로젝트 개요
Three.js 기반 3D 파티클 홈페이지. 스크롤에 따라 GLB 모델을 파티클 클라우드로 렌더링하며, 진입 → 고정 → 퇴장 애니메이션 패턴을 사용.

## 기술 스택
- **프레임워크**: Vite + TypeScript
- **3D 렌더링**: Three.js
- **버텍스 사전 추출**: @gltf-transform/core + draco3dgltf (빌드 타임)
- **스타일링**: Tailwind CSS

## 핵심 아키텍처

```
scripts/
└── extract-vertices.mjs    # GLB → .bin 사전 추출 스크립트

public/models/
├── *.glb                    # 원본 3D 모델 (빌드 타임 전용)
└── vertices/
    └── *.bin                # 사전 추출된 버텍스 바이너리 (런타임 사용)

src/
├── config/
│   └── sceneConfig.ts       # 중앙 설정 (스크롤, 모델, 파티클, 애니메이션)
├── scene/
│   ├── SceneManager.ts      # 씬 관리자 (진입점)
│   ├── ParticleBackground.ts # 배경 원통형 파티클
│   └── shapes/
│       ├── ModelShape.ts    # 개별 모델 파티클 렌더링 및 스크롤 애니메이션
│       ├── ParticleMorpher.ts # 다중 shape 간 파티클 모핑 (스크롤 전환)
│       └── index.ts
├── debug/
│   └── DebugPanel.ts        # lil-gui 디버그 패널
├── utils/
│   ├── scrollManager.ts     # 스크롤 상태 관리
│   ├── circleTexture.ts
│   └── shapeGenerators.ts
└── main.ts
```

## GLB → 파티클 파이프라인

### 전체 흐름

```
[빌드 타임]                              [런타임]
GLB 파일                                 .bin 파일
  ↓ @gltf-transform (Node.js)             ↓ fetch() + ArrayBuffer
Draco 디코딩                             Float32Array
  ↓                                        ↓ 디바이스별 서브샘플링
노드 트리 순회 + 월드 매트릭스 적용       BufferGeometry
  ↓                                        ↓ 8유닛 정규화 (ModelShape)
균일 샘플링 (최대 15,000개)              PointsMaterial (커스텀 depth 셰이더)
  ↓                                        ↓
원점 중심 정렬                           THREE.Points → scene.add()
  ↓                                        ↓
Float32Array → .bin 저장                 매 프레임 스크롤 + 마우스 인터랙션 (CPU)
```

### 빌드 타임: `scripts/extract-vertices.mjs`

`npm run prebuild` 또는 `npm run build` 시 자동 실행.

1. **GLB 읽기**: `@gltf-transform/core`의 `NodeIO`로 GLB 파일 로드
2. **Draco 디코딩**: `KHRDracoMeshCompression` 확장으로 압축 해제
3. **월드 매트릭스 적용**: 노드 트리를 재귀 순회하며 TRS → 4x4 매트릭스 누적, 각 버텍스에 적용
4. **균일 샘플링**: `step = totalVertexCount / min(15000, total)` 간격으로 추출
5. **원점 정렬**: 바운딩 박스 중심을 원점으로 이동
6. **바이너리 저장**: `Float32Array` → `public/models/vertices/<name>.bin`

### 런타임: `ModelShape.ts`

1. **fetch**: `.glb` 경로에서 `.bin` 경로를 유도하여 바이너리 로드
2. **디바이스 서브샘플링**: `getParticleMultiplier()`로 모바일(50%), 저사양(70%) 대응
3. **정규화**: 8유닛 정규화 + 모델별 scale 적용
4. **렌더링**: `THREE.Points` + `PointsMaterial` (원형 그라데이션 텍스처 + depth 기반 크기 셰이더)
5. **마우스 인터랙션**: dome 영역 내 scatter/attract, orbit, size effect, parallax 회전

### ParticleMorpher.ts

여러 GLB shape를 동시에 로드하고, 스크롤 위치에 따라 파티클이 한 형태에서 다른 형태로 모핑되는 기능.
동일한 파티클 풀로 여러 shape 간 전환을 부드럽게 연출.

### 바이너리 포맷 (.bin)

```
포맷: Raw Float32Array (little-endian)
레이아웃: [x0, y0, z0, x1, y1, z1, ..., xN, yN, zN]
버텍스당: 12 bytes (3 × Float32)
최대 크기: 15,000 × 12 = ~176 KB
속성: 월드 매트릭스 적용됨, 원점 중심 정렬됨, 크기 정규화 안됨
```

## 주요 설정값 (sceneConfig.ts)

### 모델 목록
```typescript
models = [
  { id: 0, name: 'Sphere', modelPath: '/models/high_shpere.glb', scale: 0.36, position: [-1.5, 0.3, 0] },
  { id: 1, name: 'Box',    modelPath: '/models/high_cube.glb',   scale: 0.27, position: [0.8, -0.7, 0] },
  { id: 2, name: 'Cone',   modelPath: '/models/high_cone.glb',   scale: 0.315, position: [0, 0, 0] },
]
```

### 스크롤 타이밍
```typescript
scrollConfig = {
  introEnd: 0,             // 인트로 없음
  sectionStart: 0,         // 첫 모델 즉시 시작
  sectionGap: 0.35,        // 35% 간격 (3개 모델 균등 배분)
  sectionDuration: 0.35,   // 35% 지속 (sectionGap과 동일 → 갭 없음)
  previewOffset: 0,        // 프리뷰 없음
  modelCount: 3,
}
```

### 애니메이션 페이즈
```typescript
animationPhases = {
  enterRatio: 0.2,   // 진입: 20%
  holdRatio: 0.6,    // 고정: 60%
  exitRatio: 0.2,    // 퇴장: 20%
}
```

### 파티클 설정 (particleConfig)

| 키 | 기본값 | 설명 |
|----|--------|------|
| `size` | 0.02 | 파티클 기본 크기 |
| `depthNearMul` | 1.7 | 가까운 파티클 크기 배율 |
| `depthFarMul` | 0.8 | 먼 파티클 크기 배율 |
| `mode` | `'dots'` | `'dots'` \| `'tetrahedron'` |
| `mouseRadius` | 0.3 | 돔 반경 (로컬 유닛) |
| `activationRadius` | 2.0 | 마우스 효과 활성 반경 (월드 유닛) |
| `mouseAttract` | false | true=모임(attract), false=밀어냄(scatter) |
| `mouseStrength` | 0.5 | 마우스 인터랙션 강도 |
| `microNoiseAmp` | 0.007 | 파티클 미세 공전 반지름 (0=비활성) — **CPU** |
| `microNoiseSpeed` | 3.0 | 미세 공전 속도 (rad/s) — **CPU** |
| `springEnabled` | true | 스프링 물리 on/off — **CPU** |
| `springStiffness` | 20 | 강성 |
| `springDamping` | 15 | 감쇠 |
| `mouseSizeEffect` | true | 근접 시 파티클 확대 효과 |
| `mouseSizeStrength` | 0.8 | 최대 확대 배율 |
| `orbitSpeed` | 6.0 | 마우스 근처 공전 속도 (rad/s) |
| `orbitStrength` | 1.0 | 공전 반경 배율 |
| `parallaxStrength` | 0.5 | 패럴랙스 최대 회전 (라디안) |
| `scatterScale` | 0.03 | 진입/퇴장 scatter 범위 배율 |
| `lightEnabled` | true | 가짜 라이팅 on/off |
| `lightDirection` | [-0.7, 0.9, 0.7] | 광원 방향 |
| `lightAmbient` | 0.05 | 최소 밝기 |
| `lightDiffuse` | 1.0 | 확산광 강도 |
| `transitionRotation` | true | 전환 시 회전 효과 on/off |
| `transitionRotationSpeed` | 3.0 | 전환 회전 속도 (rad/s) |
| `showDomeDebug` | false | 돔 영역 디버그 원 표시 |

### 인트로 애니메이션 설정 (introConfig)
```typescript
introConfig = {
  enabled: true,          // 인트로 애니메이션 on/off
  duration: 2.0,          // 인트로 지속 시간 (초)
  delay: 0.3,             // 페이지 로드 후 대기 시간 (초)
  scatterDistance: [5, 15], // 흩어진 파티클 거리 범위
}
```

페이지 로드 시 파티클이 3D 공간에 흩어진 상태에서 시작하여 `duration` 동안 easeOutCubic으로 첫 번째 오브젝트 형태로 모임. `delay` 동안은 흩어진 상태 유지. 기존 scatter 오프셋과 전환 회전 효과를 재사용.

### 배경 파티클 설정 (backgroundConfig)
```typescript
backgroundConfig = {
  enabled: true,
  count: 240,
  radius: 10,       // 원통 반경
  height: 13,       // 원통 높이 (Y축)
  minRadius: 1,     // 카메라 근처 빈 영역
  size: 0.05,
  opacity: 0.6,
  rotationSpeed: 0.02,
}
```

## 모델 정규화
사전 추출된 .bin 파일은 원점 중심 정렬만 되어 있음.
`ModelShape`에서 런타임에 바운딩 박스 기반 **8 유닛** 정규화 수행.
개별 `scale` 값은 미세 조정용.

```typescript
// ModelShape.ts
const targetSize = 8;
const normalizeScale = targetSize / maxDimension;
```

## 애니메이션 방식
모델 오브젝트는 `(0, 0, 2)`에 고정. 이동 애니메이션 없음.
파티클의 scatter/reform으로 전환 연출.

| 페이즈 | 동작 |
|--------|------|
| 진입 (20%) | 파티클이 랜덤 위치(거리 5~15)에서 원래 형태로 모임 (easeOutQuad) |
| 고정 (60%) | 형태 유지. 마우스 인터랙션 (scatter/attract, orbit, size, parallax) |
| 퇴장 (20%) | 파티클이 다시 랜덤 방향으로 흩어짐 (easeInQuad) |

첫 모델은 스크롤 최상단(0%)에서 scatter 없이 즉시 형태 표시.

## 성능 설정
```typescript
PERFORMANCE_CONFIG = {
  maxVerticesPerModel: 15000,  // 모델당 최대 버텍스
  enableFrustumCulling: true,
}

// 디바이스별 파티클 수
// 모바일(<768px): 50%
// 저사양(코어<=4): 70%
// 일반: 100%
```

**CPU 집약적 연산** (매 프레임 JS 루프, 파티클 수만큼 반복):
- `microNoiseAmp > 0`: per-particle sin/cos 미세 공전
- `springEnabled`: 스프링 물리 (velocity, damping 계산)
- 마우스 interact: scatter/attract/orbit 오프셋 계산
- 계산 결과를 `BufferAttribute.needsUpdate = true`로 GPU에 업로드

## 개발 명령어
```bash
npm run prebuild  # GLB → .bin 버텍스 추출
npm run dev       # 개발 서버
npm run build     # prebuild + tsc + vite build
npm run preview   # 빌드 미리보기
```

## 모델 추가 방법
1. GLB 파일을 `public/models/`에 추가
2. `sceneConfig.ts`의 `models` 배열에 등록
3. `scripts/extract-vertices.mjs`의 `MODELS` 배열에 등록
4. `npm run prebuild` 실행하여 .bin 생성
5. `index.html`에 섹션 추가
6. `scrollConfig.modelCount` 업데이트

## 주의사항
- 모델 크기는 정규화되므로 `scale: 1.0`으로 시작
- `scrollManager`는 `sceneConfig` 값을 직접 참조 (동기화 유지)
- 파티클 크기: `0.02` (particleConfig.size)
- GLB 변경 시 반드시 `npm run prebuild` 재실행
- `extract-vertices.mjs`의 MODELS 배열과 `sceneConfig.ts`의 models 배열을 동기화 유지
- per-particle 연산은 모두 클라이언트 브라우저 CPU에서 실행됨
