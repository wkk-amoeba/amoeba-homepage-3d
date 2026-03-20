# CLAUDE.md - 프로젝트 컨텍스트

## 프로젝트 개요
Three.js 기반 3D 파티클 홈페이지. 스크롤에 따라 파티클 클라우드로 다양한 형태를 렌더링하며, 진입 → 고정 → 퇴장 애니메이션 패턴을 사용.

## 기술 스택
- **프레임워크**: Vite + TypeScript
- **3D 렌더링**: Three.js
- **버텍스 사전 추출**: @gltf-transform/core + draco3dgltf (빌드 타임)
- **스타일링**: Tailwind CSS

## ⚠️ 씬 번호 체계 (필독 — 가장 자주 혼동되는 부분)

**총 씬 수: 4개 (01, 02, 03, 04). Sphere가 씬 2개(01 원, 02 위성)를 차지한다.**

**씬 번호는 사용자가 보는 스크롤 순서 기준이며, `models[]` 배열 인덱스와 1:1 대응하지 않는다.**
**models[] 배열은 3개뿐이지만, 씬은 4개다. Sphere(models[0])가 씬 01과 02 두 개를 담당하기 때문이다.**

씬 01, 02는 **프로그래밍으로 생성**되며 3D 파일이 아님. 씬 03 이후부터 3D 파일(GLB/FBX) 사용.

| 씬 번호 | 이름 | 소스 | models[] 인덱스 | 파티클 생성 방식 | 파티클 수 설정 |
|---------|------|------|----------------|-----------------|---------------|
| **01** | Sphere (원) | `sphereUnified.ts` | `models[0]` | **프로그래밍** — GLB .bin을 초기 좌표로 로드하지만, `sphereUnified.ts`의 `shapeUpdater`가 매 프레임 위치를 완전히 덮어씀 (deform/breathing 효과) | `models[0].particleCount` 또는 .bin 버텍스 수 |
| **02** | 위성 (Satellite) | `sphereUnified.ts` | `models[0]` (동일) | **프로그래밍** — 씬 01과 같은 shape의 서브섹션. `sphereUnified.ts`가 metaball orbital/linear split으로 파티클 위치를 계산 | 씬 01과 동일 (같은 shape) |
| **03** | Gyro | `inception_gyro.glb` | `models[1]` | **3D 파일** — GLB .bin 로드 | `models[1].particleCount` 또는 .bin 버텍스 수 |
| **04** | Human (걷기 사람) | `Walking.fbx` | `models[2]` | **3D 파일** — FBX 런타임 스키닝, `fbxWalking.ts`가 매 프레임 본 변환 적용 | FBX 버텍스 수 |

### 씬 01-02 구조 (sphereUnified.ts 서브섹션)

씬 01과 02는 `models[0]` (Sphere) 하나의 shape 안에서 스크롤 위치에 따라 서브섹션으로 나뉨:

```
models[0] sectionSpan 범위 내:
├── [0.0, subSection1=0.2]       → 씬 01: Deform (breathing/crumple)
├── [subSection1, subSection2=0.4] → 전환: Deform → Orbital
├── [subSection2, 1.0]            → 씬 02: Metaball Orbital + Linear Split
```

**핵심: 씬 01과 02는 같은 shape(models[0])의 파티클을 공유하므로 파티클 수를 독립적으로 설정할 수 없다.** `models[0].particleCount`를 설정하면 01, 02 모두에 적용됨.

### 씬 번호 vs models[] 인덱스 매핑 요약

```
씬 01, 02 → models[0] (Sphere) — 프로그래밍 생성, sphereUnified.ts
씬 03     → models[1] (Gyro)   — 3D 파일
씬 04     → models[2] (Human)  — 3D 파일 (FBX)
```

## 파티클 수 관리 (activeCount 시스템)

ParticleMorpher는 단일 파티클 풀을 사용하되, 각 shape마다 고유한 `activeCount`를 가짐.

- **풀 크기**: `max(모든 shape의 particleCount)` — 현재 15,000 기준
- **activeCount**: 각 shape의 실제 유효 파티클 수. 초과 파티클은 `sizeMultiplier=0`으로 숨김
- **per-shape particleCount 설정**: `sceneConfig.ts`의 `models[].particleCount`로 지정. 미지정 시 .bin 파일 버텍스 수 사용
- **전환 시**: 파티클 수가 다른 shape 간 전환 시 초과 파티클이 scatter에서 fade in/out

```typescript
// sceneConfig.ts에서 파티클 수 설정 예시
{ id: 0, name: 'Sphere', particleCount: 15000, ... },  // 씬 01-02: 15k
```

## 핵심 아키텍처

```
scripts/
└── extract-vertices.mjs    # GLB → .bin 사전 추출 스크립트

public/models/
├── *.glb                    # 원본 3D 모델 (빌드 타임 전용)
├── Walking.fbx              # Mixamo 걷기 애니메이션 FBX (런타임 로드)
└── vertices/
    └── *.bin                # 사전 추출된 버텍스 바이너리 (런타임 사용)

src/
├── config/
│   └── sceneConfig.ts       # 중앙 설정 (스크롤, 모델, 파티클, 애니메이션)
├── scene/
│   ├── SceneManager.ts      # 씬 관리자 (진입점)
│   ├── ParticleBackground.ts # 배경 원통형 파티클
│   ├── HumanParticleScene.ts # 독립 FBX 걷기 파티클 씬 (human.html용)
│   └── shapes/
│       ├── ParticleMorpher.ts # 다중 shape 간 파티클 모핑 (스크롤 전환) + activeCount 관리
│       └── index.ts
├── debug/
│   └── DebugPanel.ts        # lil-gui 디버그 패널
├── utils/
│   ├── scrollManager.ts     # 스크롤 상태 관리
│   ├── sphereUnified.ts     # 씬 01-02: Sphere 서브섹션 (deform + metaball orbital)
│   ├── sphereMath.ts        # 공유 수학 함수 (noise, metaball field, satellite 헬퍼)
│   ├── sphereDeform.ts      # 씬 01: Sphere deform 효과 타입 정의
│   ├── sphereMetaball.ts    # 씬 02: Metaball orbital 효과 타입 정의
│   ├── fbxWalking.ts        # 씬 04: FBX 걷기 애니메이션 파티클 업데이터
│   ├── circleTexture.ts
│   └── shapeGenerators.ts
├── main.ts                  # 메인 페이지 (index.html)
├── human.ts                 # 독립 걷기 사람 페이지 (human.html)
└── experiment.ts            # 실험 페이지 — 4개 shape + 걷기 사람 (experiment.html)
```

## GLB → 파티클 파이프라인

### 전체 흐름

```
[빌드 타임]                              [런타임]
GLB 파일                                 .bin 파일
  ↓ @gltf-transform (Node.js)             ↓ fetch() + ArrayBuffer
Draco 디코딩                             Float32Array
  ↓                                        ↓ activeCount 기반 서브샘플링
노드 트리 순회 + 월드 매트릭스 적용       BufferGeometry
  ↓                                        ↓ 8유닛 정규화 (ParticleMorpher)
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

### ParticleMorpher.ts

다중 shape를 단일 파티클 풀로 관리하며, 스크롤 위치에 따라 모핑.

- **activeCount**: 각 ShapeTarget이 실제 사용하는 파티클 수. 풀 크기(max) 이하
- `setShapeUpdater(idx, callback)`: 특정 shape에 매 프레임 호출되는 애니메이션 콜백 등록 (씬 01-02의 sphereUnified, 씬 04의 fbxWalking)
- `ready: Promise<void>`: shape 로딩 완료 시 resolve되는 프로미스
- `precomputedPositions`: ModelData에 런타임 주입 가능한 Float32Array 지원

### FBX 걷기 애니메이션 파이프라인 (씬 04)

```
[런타임]
Walking.fbx → FBXLoader
  ↓
SkinnedMesh + AnimationMixer (root motion 제거: Hips X/Z = 0)
  ↓
초기 프레임 추출 → precomputedPositions로 ParticleMorpher에 전달
  ↓
매 프레임 shapeUpdater 콜백:
  mixer.update(delta) → skeleton.update()
  → applyBoneTransform() → matrixWorld 적용
  → 정규화(8유닛 * scale) → shapeTarget.positions 덮어쓰기
```

### 바이너리 포맷 (.bin)

```
포맷: Raw Float32Array (little-endian)
레이아웃: [x0, y0, z0, x1, y1, z1, ..., xN, yN, zN]
버텍스당: 12 bytes (3 × Float32)
최대 크기: 15,000 × 12 = ~176 KB
속성: 월드 매트릭스 적용됨, 원점 중심 정렬됨, 크기 정규화 안됨
```

## 주요 설정값 (sceneConfig.ts)

### 모델 목록 (현재)
```typescript
models = [
  { id: 0, name: 'Sphere', modelPath: '/models/high_shpere.glb', scale: 0.36, sectionSpan: 1, ... },
  { id: 1, name: 'Gyro', modelPath: '/models/inception_gyro.glb', scale: 0.6, sectionSpan: 1,
    spinTop: { tilt: 0, spinSpeed: 0.3, precessionSpeed: 0.4, nutationAmp: 0.2793, nutationSpeed: 1.5, pivotY: -4 }, ... },
  { id: 2, name: 'Human', scale: 0.35, ... },  // precomputedPositions 런타임 주입
]
```

### 애니메이션 페이즈
```typescript
animationPhases = {
  enterRatio: 0.3,   // 진입: 30%
  holdRatio: 0.4,    // 고정: 40%
  exitRatio: 0.3,    // 퇴장: 30%
}
```

### 인트로 애니메이션 설정 (introConfig)
```typescript
introConfig = {
  enabled: true,
  duration: 2.0,          // 인트로 지속 시간 (초)
  delay: 0,               // 페이지 로드 후 대기 시간 (초)
  scatterDistance: [5, 15],
  rotationTurns: -2,      // 인트로 중 자전 회전수
}
```

## 모델 정규화
사전 추출된 .bin 파일은 원점 중심 정렬만 되어 있음.
`ParticleMorpher`에서 런타임에 바운딩 박스 기반 **8 유닛** 정규화 수행 (activeCount 범위만 대상).
개별 `scale` 값은 미세 조정용.

## 애니메이션 방식
모델 오브젝트는 `(0, 0, 2)`에 고정. 이동 애니메이션 없음.
파티클의 scatter/reform으로 전환 연출.

| 페이즈 | 동작 |
|--------|------|
| 진입 (30%) | 파티클이 랜덤 위치에서 원래 형태로 모임 |
| 고정 (40%) | 형태 유지. 마우스 인터랙션 (scatter/attract, orbit, size, parallax) |
| 퇴장 (30%) | 파티클이 다시 랜덤 방향으로 흩어짐 |

## 성능 설정
```typescript
PERFORMANCE_CONFIG = {
  maxVerticesPerModel: 15000,  // 모델당 기본 최대 버텍스 (particleCount 미지정 시)
  enableFrustumCulling: true,
}

// 디바이스별 파티클 수 multiplier
// 모바일(<768px): 50%
// 저사양(코어<=4): 70%
// 일반: 100%
```

**CPU 최적화**: hold 시 activeCount만큼만 루프 (예: Sphere 15k). 비활성 파티클은 sizeMultiplier=0 감쇠만 처리.

## 멀티페이지 구성

| 페이지 | URL | 엔트리포인트 | 설명 |
| ------ | --- | ------------ | ---- |
| 메인 | `/` | `src/main.ts` | 씬 01~04 스크롤 전환 |
| 걷기 사람 | `/human.html` | `src/human.ts` | FBX 독립 뷰어 (OrbitControls, 사이드뷰) |
| 실험 | `/experiment.html` | `src/experiment.ts` | 4개 shape + 걷기 사람 + 디버그 패널 |
| 크로노그래피 | `/chronography.html` | - | 별도 페이지 |

Vite 멀티페이지 설정: `vite.config.ts`의 `rollupOptions.input`에 등록.

## 개발 명령어
```bash
npm run prebuild  # GLB → .bin 버텍스 추출
npm run dev       # 개발 서버
npm run build     # prebuild + tsc + vite build
npm run preview   # 빌드 미리보기
```

## 씬 02 위성(orbital2) 주요 설정 (`sphereUnified.ts` config)

```typescript
orbital2: {
  mainRadius: 1.00,        // 메인 구 반경
  satelliteRadius: 0.2,    // 위성 반경
  satelliteCount: 5,       // 위성 개수
  travelDistance: 2.0,     // 위성 왕복 이동 거리
  travelSpeed: 0.8,        // 위성 이동 속도
  threshold: 1.05,         // 메타볼 필드 임계값
},
orbital2MainParticleRatio: 0.80,  // 메인/위성 파티클 비율 (0~1)
orbital2MaxSatZ: -1.0,            // 위성 Z 제한 (음수=카메라 뒤로)
```

### 위성 파티클 레이마치 알고리즘
- **인터리브 할당**: 위성별 파티클을 `(i - mainStart) % satCount`로 분배하여 노말 방향 편향 방지
- **리니어 스캔 + 바이섹션**: 위성 중심에서 외부로 리니어 스캔(20스텝)하여 첫 번째 표면 교차점 탐색 → 바이섹션으로 정밀 위치 결정
- **스캔 범위**: `mainR * 3` — 위성이 메인 구 내부에 합쳐질 때 외부 표면까지 도달 가능
- **폴백**: 스캔 범위 내에서 교차점을 못 찾으면 `satR / √threshold`에 배치

## 씬 03 Gyro 팽이 회전 (spinTop)

`ParticleMorpher.ts`의 `computeSpinTopMatrix`에서 매 프레임 회전 행렬 계산:

- **자전(spin)**: Y축 자전, `spinSpeed` rad/s
- **세차(precession)**: 기울어진 축이 Y축 주위 회전, `precessionSpeed` rad/s
- **장동(nutation)**: 기울기가 `±nutationAmp` 범위로 사인파 흔들림
- **pivotY**: 회전 피벗 Y 오프셋 (음수=하단). 기본 0은 shape 중심, -4는 하단 꼭짓점 근처

```text
회전 합성: Ry(precession) × Rz(tilt + nutation) × Ry(spin)
피벗: effectiveCenter.y + pivotY
```

## 배경 파티클 (ParticleBackground)

- **독립 라이팅**: `backgroundConfig.lightAmbient/lightDiffuse` — 오브젝트 파티클과 별개
- **parallax**: 마우스 위치에 따른 배경 회전 (오브젝트 파티클과 동기)
- **exclusionRadius**: 오브젝트 실루엣 주변 파티클 제외 영역 (NDC 단위)

## 주의사항
- **씬 번호 ≠ models[] 인덱스**. 씬 01-02는 models[0] 하나를 공유
- 씬 01-02는 프로그래밍 생성 (sphereUnified.ts), 씬 03 이후는 3D 파일 사용
- 모델 크기는 정규화되므로 `scale: 1.0`으로 시작
- `scrollManager`는 `sceneConfig` 값을 직접 참조 (동기화 유지)
- GLB 변경 시 반드시 `npm run prebuild` 재실행
- `extract-vertices.mjs`의 MODELS 배열과 `sceneConfig.ts`의 models 배열을 동기화 유지
- per-particle 연산은 모두 클라이언트 브라우저 CPU에서 실행됨
- 각 shape의 파티클 수는 `models[].particleCount`로 개별 설정 가능 (씬 01-02는 같은 shape이므로 공유)
