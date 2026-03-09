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
  modelPath?: string;            // GLB 경로 (geometry 미지정 시 필수)
  geometry?: string;             // 프로그래밍 도형 ('sphere' | 'box' | 'tetrahedron' 등)
  scale: number;
  position?: [number, number, number]; // 월드 위치 오프셋 [x, y, z] (Points 중심 기준)
  rotation?: [number, number, number]; // 기본 회전 [x, y, z] (라디안)
  particleCount?: number; // 모델별 파티클 수 고정값 (미지정 시 디바이스 기반 자동 결정)
}

// 3D 모델 정의
// geometry가 있으면 프로그래밍 생성, modelPath가 있으면 GLB .bin 로드
export const models: ModelData[] = [
  { id: 0, name: 'Sphere', modelPath: '/models/high_shpere.glb', scale: 0.36, position: [-1.5, 0.3, 0] },
  { id: 1, name: 'Box', modelPath: '/models/high_cube.glb', scale: 0.27, position: [0.8, -0.7, 0] },
  { id: 2, name: 'Cone', modelPath: '/models/high_cone.glb', scale: 0.315, position: [0, 0, 0] },
];

// 파티클 렌더링 모드
export type ParticleMode = 'dots' | 'tetrahedron';

// 파티클 설정
export const particleConfig = {
  size: 0.02,              // 파티클 크기
  depthNearMul: 1.7,      // 가까운 파티클 크기 배율
  depthFarMul: 0.8,       // 먼 파티클 크기 배율
  mode: 'dots' as ParticleMode,
  mouseRadius: 0.3,        // 돔 반경 (로컬 유닛)
  activationRadius: 2.0,   // 마우스 근접 시 효과 활성 반경 (월드 유닛)
  mouseAttract: true,      // true=마우스로 모임(attract), false=밀어냄(scatter)
  mouseStrength: 0.1,      // 마우스 인터랙션 강도
  microNoiseAmp: 0.015,    // 파티클 미세 공전 반지름 (0 = 비활성)
  microNoiseSpeed: 0.4,   // 미세 공전 속도 (rad/s)
  tetrahedronSize: 0.06,   // 삼각뿔 인스턴스 크기
  tetrahedronRotationSpeed: 0.5, // 삼각뿔 회전 속도 (rad/s)
  // 스프링 물리 (마우스 마그넷)
  springEnabled: true,           // 스프링 모드 on/off
  springStiffness: 20,           // 강성 (높을수록 빠르게 반응)
  springDamping: 15,             // 감쇠 (낮을수록 바운스 많음)
  // 사이즈 스케일링 (마우스 근접 시 파티클 확대)
  mouseSizeEffect: true,         // 사이즈 효과 on/off
  mouseSizeStrength: 0.8,        // 최대 확대 배율 (이동 시 1.5x, 정지 시 1.15x)
  // 공전 효과 (마우스 근처 파티클이 궤도 운동)
  orbitSpeed: 6.0,               // 공전 속도 (rad/s)
  orbitStrength: 1.0,            // 공전 반경 배율
  // 마우스 패럴랙스 (마우스 위치에 따른 미세 회전으로 입체감)
  parallaxStrength: 0.5,         // 최대 회전 강도 (라디안, ~29°)
  // 전환 scatter 범위 (진입/퇴장 시 파티클 흩어짐 배율, 1.0 = 기본 5~15유닛)
  scatterScale: 0.03,
  // 가짜 라이팅 (파티클 위치 기반 법선으로 명암)
  lightEnabled: true,
  lightDirection: [-0.7, 0.9, 0.7] as [number, number, number],  // 광원 방향 (좌상단)
  lightAmbient: 0.05,            // 최소 밝기 (그림자 부분)
  lightDiffuse: 1.0,             // 확산광 강도
  // 전환 시 회전 효과 (파티클이 오브젝트 중심 주위로 회전하며 형태 형성)
  transitionRotation: true,      // 전환 회전 on/off
  transitionRotationSpeed: 3.0,  // 회전 속도 (rad/s)
  // 디버그 시각화
  showDomeDebug: false,          // 돔 영역 빨간 원 표시
};

// 스크롤 설정 (3개 모델용)
export const scrollConfig = {
  introEnd: 0,             // 인트로 없음
  sectionStart: 0,         // 첫 모델 즉시 시작
  sectionGap: 0.35,        // 35% 간격 (3개 모델 균등 배분)
  sectionDuration: 0.35,   // 35% 지속 (sectionGap과 동일 → 갭 없음)
  previewOffset: 0,        // 프리뷰 없음
  modelCount: 3,
};

// 애니메이션 페이즈 설정 (진입 → 고정 → 퇴장)
export const animationPhases = {
  enterRatio: 0.2,   // 진입: 20%
  holdRatio: 0.6,    // 고정: 60%
  exitRatio: 0.2,    // 퇴장: 20%
};

// 배경 파티클 설정 (원통형 분포 → Y축 회전 시 균일)
export const backgroundConfig = {
  enabled: true,          // 기본 활성
  count: 240,
  radius: 10,            // 원통 반경
  height: 13,            // 원통 높이 (Y축)
  minRadius: 1,          // 카메라 근처 빈 영역
  size: 0.05,
  opacity: 0.6,
  rotationSpeed: 0.02,
};
