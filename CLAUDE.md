# CLAUDE.md - 프로젝트 컨텍스트

## 프로젝트 개요
Three.js 기반 3D 파티클 홈페이지. 스크롤에 따라 GLB 모델을 파티클 클라우드로 렌더링하며, 진입 → 고정 → 퇴장 애니메이션 패턴을 사용.

## 기술 스택
- **프레임워크**: Vite + TypeScript
- **3D 렌더링**: Three.js
- **모델 로딩**: GLTFLoader + DRACOLoader
- **스타일링**: Tailwind CSS

## 핵심 아키텍처

```
src/
├── config/
│   └── sceneConfig.ts       # 중앙 설정 (스크롤, 모델, 애니메이션)
├── scene/
│   ├── SceneManager.ts      # 씬 관리자 (진입점)
│   ├── ParticleBackground.ts
│   ├── ScrollHintParticles.ts
│   └── shapes/
│       └── ModelShape.ts    # 3D 모델 → 파티클 변환 및 애니메이션
├── utils/
│   ├── scrollManager.ts     # 스크롤 상태 관리
│   └── circleTexture.ts
└── main.ts
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
모든 GLB 모델은 로딩 시 바운딩 박스 기반으로 **8 유닛**으로 정규화됨.
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
npm run dev      # 개발 서버
npm run build    # 프로덕션 빌드
npm run preview  # 빌드 미리보기
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
3. `index.html`에 섹션 추가
4. `scrollConfig.modelCount` 업데이트

## 주의사항
- 모델 크기는 정규화되므로 `scale: 1.0`으로 시작
- `scrollManager`는 `sceneConfig` 값을 직접 참조 (동기화 유지)
- 파티클 크기: `0.03` (PointsMaterial.size)
