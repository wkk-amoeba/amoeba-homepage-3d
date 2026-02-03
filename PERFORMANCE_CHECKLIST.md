# 3D 성능 최적화 체크리스트

## 완료된 항목

- [x] **버텍스 샘플링** - 모델당 최대 15,000개로 제한 (`sceneConfig.ts`)
- [x] **Frustum Culling 활성화** - 화면 밖 오브젝트 렌더링 스킵

## 추가 최적화 옵션

### 코드 레벨 (난이도: 낮음)

- [ ] **DRACOLoader 싱글턴** - 로더 인스턴스 공유로 메모리 절약
- [ ] **순차 로딩** - 12개 모델 동시 로드 → 순차 로드로 메인 스레드 블로킹 해소
- [ ] **조건부 업데이트 강화** - 스크롤 범위 밖 모델 완전 비활성화

### 에셋 레벨 (난이도: 중간)

- [ ] **이미지 WebP 변환** - PNG → WebP로 30% 크기 감소
- [ ] **저폴리곤 모델 교체** - GAZ69(3MB), BMW(1.1MB) 등 고폴리곤 모델 교체

### 고급 최적화 (난이도: 높음)

- [ ] **WebWorker 버텍스 추출** - 메인 스레드 블로킹 완전 해소
- [ ] **Draco 제거 검토** - 압축 해제 비용 vs 다운로드 시간 트레이드오프

---

## 현재 설정값

```typescript
// src/config/sceneConfig.ts
PERFORMANCE_CONFIG = {
  maxVerticesPerModel: 15000,  // 조절 가능
  enableFrustumCulling: true,
}
```

## 성능 측정 방법

1. Chrome DevTools → Performance 탭
2. 측정 항목:
   - 초기 로드 시간 (DOMContentLoaded → 첫 렌더)
   - 스크롤 시 FPS (60fps 목표)
   - 메모리 사용량 (Memory 탭)

## 콘솔 로그 확인

```
Loaded: GAZ69 (15000 vertices, sampled from 200000)
Loaded: BMW M2 (15000 vertices, sampled from 80000)
```

→ `sampled from` 값이 크고 실제 버텍스가 15000이면 샘플링 정상 작동
