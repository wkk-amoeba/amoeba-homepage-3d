// 3D 씬 설정값 중앙 관리

// 성능 최적화 설정
export const PERFORMANCE_CONFIG = {
  maxVerticesPerModel: 15000, // 모델당 최대 버텍스 수
  enableFrustumCulling: true,
};

// 디바이스 성능에 따른 파티클 수 조절
export function getParticleMultiplier(): number {
  const isMobile = window.innerWidth < 768;
  const isLowEnd = navigator.hardwareConcurrency !== undefined &&
    navigator.hardwareConcurrency <= 4;

  if (isMobile) return 0.5;
  if (isLowEnd) return 0.7;
  return 1;
}

// 파티클 수에 multiplier 적용
export function getAdjustedParticleCount(baseCount: number): number {
  return Math.floor(baseCount * getParticleMultiplier());
}

// 3D 모델 인터페이스
export interface ModelData {
  id: number;
  name: string;
  modelPath: string;
  scale: number;
  particleCount?: number; // 모델별 파티클 수 고정값 (미지정 시 디바이스 기반 자동 결정)
}

// 3D 모델 정의 (GLB 파일)
// 모든 모델은 로딩 시 8 유닛으로 정규화됨 → scale은 미세 조정용
export const models: ModelData[] = [
  { id: 0, name: 'Light Bulb', modelPath: '/models/light-bulb.glb', scale: 1.0 },
  { id: 1, name: 'Porsche 911', modelPath: '/models/porsche_911_carrera_4s.glb', scale: 0.9 },
  { id: 2, name: 'Henchman', modelPath: '/models/HenchmanTough.glb', scale: 0.85 },
];

// 파티클 렌더링 모드
export type ParticleMode = 'dots' | 'tetrahedron';

// 파티클 설정
export const particleConfig = {
  size: 0.06,              // 파티클 크기 (기존 0.03에서 증가)
  depthNearMul: 1.0,      // 가까운 파티클 크기 배율 (1.0=기본)
  depthFarMul: 1.0,       // 먼 파티클 크기 배율 (1.0=기본)
  mode: 'dots' as ParticleMode,
  mouseRadius: 0.3,        // 돔 볼록 반경 (로컬 유닛)
  activationRadius: 4.0,   // 마우스 근접 시 효과 활성 반경 (월드 유닛)
  mouseStrength: 1.2,      // 마우스 끌림 강도
  mouseDecay: 0.95,        // 복귀 감쇠 (1에 가까울수록 느리게 복귀)
  maxDisplacement: 0.8,    // 최대 파티클 이동 거리 (유닛)
  tetrahedronSize: 0.06,   // 삼각뿔 인스턴스 크기
  tetrahedronRotationSpeed: 0.5, // 삼각뿔 회전 속도 (rad/s)
  // 스프링 물리 (마우스 마그넷)
  springEnabled: false,          // 스프링 모드 on/off
  springStiffness: 180,          // 강성 (높을수록 빠르게 반응)
  springDamping: 12,             // 감쇠 (낮을수록 바운스 많음)
  // 디버그 시각화
  showDomeDebug: true,           // 돔 영역 빨간 원 표시
};

// 스크롤 설정 (3개 모델용)
export const scrollConfig = {
  introEnd: 0,             // 인트로 없음
  sectionStart: 0,         // 첫 모델 즉시 시작
  sectionGap: 0.35,        // 35% 간격 (3개 모델 균등 배분)
  sectionDuration: 0.30,   // 30% 지속
  previewOffset: 0,        // 프리뷰 없음
  modelCount: 3,
};

// 애니메이션 페이즈 설정 (진입 → 고정 → 퇴장)
export const animationPhases = {
  enterRatio: 0.2,   // 진입: 20%
  holdRatio: 0.6,    // 고정: 60%
  exitRatio: 0.2,    // 퇴장: 20%
};

// 배경 파티클 설정
export const backgroundConfig = {
  count: 200,
  spread: { x: 30, y: 30, z: 20 },
  zOffset: -5,
  size: 0.02,
  opacity: 0.6,
  rotationSpeed: 0.02,
};
