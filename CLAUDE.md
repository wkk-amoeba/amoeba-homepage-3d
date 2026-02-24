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
│   └── sceneConfig.ts       # 중앙 설정 (스크롤, 모델, 애니메이션)
├── scene/
│   ├── SceneManager.ts      # 씬 관리자 (진입점)
│   ├── IntroModels.ts       # 인트로 파티클 모델
│   ├── ParticleBackground.ts
│   ├── ScrollHintParticles.ts
│   └── shapes/
│       └── ModelShape.ts    # 파티클 렌더링 및 스크롤 애니메이션
├── utils/
│   ├── scrollManager.ts     # 스크롤 상태 관리
│   └── circleTexture.ts
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
균일 샘플링 (최대 15,000개)                ↓ 또는 scale×0.6 (IntroModels)
  ↓                                      PointsMaterial (원형 텍스처)
원점 중심 정렬                              ↓
  ↓                                      THREE.Points → scene.add()
Float32Array → .bin 저장                    ↓
                                         매 프레임 스크롤 기반 애니메이션
```

### 빌드 타임: `scripts/extract-vertices.mjs`

`npm run prebuild` 또는 `npm run build` 시 자동 실행.

1. **GLB 읽기**: `@gltf-transform/core`의 `NodeIO`로 GLB 파일 로드
2. **Draco 디코딩**: `KHRDracoMeshCompression` 확장으로 압축 해제
3. **월드 매트릭스 적용**: 노드 트리를 재귀 순회하며 TRS → 4x4 매트릭스 누적, 각 버텍스에 적용
4. **균일 샘플링**: `step = totalVertexCount / min(15000, total)` 간격으로 추출
5. **원점 정렬**: 바운딩 박스 중심을 원점으로 이동
6. **바이너리 저장**: `Float32Array` → `public/models/vertices/<name>.bin`

### 런타임: `ModelShape.ts` / `IntroModels.ts`

1. **fetch**: `.glb` 경로에서 `.bin` 경로를 유도하여 바이너리 로드
2. **디바이스 서브샘플링**: `getParticleMultiplier()`로 모바일(50%), 저사양(70%) 대응
3. **정규화**: ModelShape는 8유닛 정규화 + 모델별 scale, IntroModels는 `config.scale × 0.6`
4. **렌더링**: `THREE.Points` + `PointsMaterial` (원형 그라데이션 텍스처)

### 바이너리 포맷 (.bin)

```
포맷: Raw Float32Array (little-endian)
레이아웃: [x0, y0, z0, x1, y1, z1, ..., xN, yN, zN]
버텍스당: 12 bytes (3 × Float32)
최대 크기: 15,000 × 12 = ~176 KB
속성: 월드 매트릭스 적용됨, 원점 중심 정렬됨, 크기 정규화 안됨
```

## 주요 설정값 (sceneConfig.ts)

### 스크롤 타이밍
```typescript
scrollConfig = {
  introEnd: 0.1,         // 인트로 종료 지점
  sectionStart: 0.1,     // 모델 섹션 시작
  sectionGap: 0.15,      // 섹션 간격 (15%)
  sectionDuration: 0.13, // 각 섹션 지속 (13%)
  previewOffset: 0.04,   // 프리뷰 시작 오프셋
  modelCount: 6,
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

## 모델 정규화
사전 추출된 .bin 파일은 원점 중심 정렬만 되어 있음.
`ModelShape`에서 런타임에 바운딩 박스 기반 **8 유닛** 정규화 수행.
개별 `scale` 값은 미세 조정용.

```typescript
// ModelShape.ts
const targetSize = 8;
const normalizeScale = targetSize / maxDimension;
```

## 애니메이션 타입
| 타입 | 설명 |
|------|------|
| `left-to-center` | 좌하단 → 중앙 → 우상단 |
| `right-to-center` | 우하단 → 중앙 → 좌상단 |
| `zoom-through` | 뒤 → 중앙 → 앞으로 통과 |
| `curve-zoom` | 우하단 → 중앙 → 좌상단+뒤 |
| `scatter-to-form` | 우중단 → 중앙 → 좌상단+앞 |

## 개발 명령어
```bash
npm run prebuild  # GLB → .bin 버텍스 추출
npm run dev       # 개발 서버
npm run build     # prebuild + tsc + vite build
npm run preview   # 빌드 미리보기
```

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
- 파티클 크기: `0.03` (PointsMaterial.size)
- GLB 변경 시 반드시 `npm run prebuild` 재실행
- `extract-vertices.mjs`의 MODELS 배열과 `sceneConfig.ts`의 models 배열을 동기화 유지
