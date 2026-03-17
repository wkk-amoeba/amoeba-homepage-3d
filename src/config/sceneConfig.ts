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
  precomputedPositions?: Float32Array; // 사전 계산된 버텍스 위치 (런타임 주입용)
  scale: number;
  position?: [number, number, number]; // 월드 위치 오프셋 [x, y, z] (Points 중심 기준)
  rotation?: [number, number, number]; // 기본 회전 [x, y, z] (라디안)
  particleCount?: number; // 모델별 파티클 수 고정값 (미지정 시 디바이스 기반 자동 결정)
  holdScatter?: number;  // hold 상태에서 유지할 scatter 비율 (0=완전 형태, 1=완전 흩어짐)
  heightSize?: { min: number; max: number }; // Y 위치 기반 파티클 크기 (아래=min, 위=max 배율)
}

// 3D 모델 정의
// geometry가 있으면 프로그래밍 생성, modelPath가 있으면 GLB .bin 로드 -1.5, 0.3, 0
export const models: ModelData[] = [
  { id: 0, name: 'Sphere', modelPath: '/models/high_shpere.glb', scale: 0.36, position: [0, 0, 0], holdScatter: 0.02 },
  { id: 1, name: 'Box', modelPath: '/models/high_cube.glb', scale: 0.27, position: [0.8, -0.7, 0], holdScatter: 0.01 },
  { id: 2, name: 'Cone', modelPath: '/models/high_cone.glb', scale: 0.315, position: [0, 0, 0], holdScatter: 0.01 },
  { id: 3, name: 'Gyro', modelPath: '/models/inception_gyro.glb', scale: 0.4, position: [0, 0, 0], rotation: [0, 0, 0.122], holdScatter: 0.01 },
  { id: 4, name: 'Human', scale: 0.35, position: [0, -1.4, 0], holdScatter: 0.006 },  // precomputedPositions는 런타임에 주입
  { id: 5, name: 'City', modelPath: '/models/san_francisco_city.glb', scale: 1.0, position: [0, -1, 0], particleCount: 50000, heightSize: { min: 0.05, max: 1.0 } },
  { id: 6, name: 'City2', modelPath: '/models/city_23.glb', scale: 1.0, position: [0, -1, 0], particleCount: 50000, heightSize: { min: 0.05, max: 1.0 } },
  { id: 7, name: 'City3', modelPath: '/models/city_23_high.glb', scale: 1.0, position: [0, -1, 0], particleCount: 50000, heightSize: { min: 0.05, max: 0.8 } },
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
  mouseAttract: false,     // true=마우스로 모임(attract), false=밀어냄(scatter)
  mouseStrength: 0.5,      // 마우스 인터랙션 강도
  microNoiseAmp: 0.007,    // 파티클 미세 공전 반지름 (0 = 비활성)
  microNoiseSpeed: 3.0,    // 미세 공전 속도 (rad/s)
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
  // 오브젝트 자전 (Y축 느린 회전)
  autoRotateSpeed: 0.15,         // 자전 속도 (rad/s), 0=비활성
  // 디버그 시각화
  showDomeDebug: false,          // 돔 영역 빨간 원 표시
};

// 스크롤 설정 (6개 모델용)
export const scrollConfig = {
  introEnd: 0,             // 인트로 없음
  sectionStart: 0,         // 첫 모델 즉시 시작
  sectionGap: 1 / 8,       // 12.5% 간격 (8개 모델 균등 배분)
  sectionDuration: 1 / 8,  // 12.5% 지속
  previewOffset: 0,        // 프리뷰 없음
  modelCount: 8,
};

// 애니메이션 페이즈 설정 (진입 → 고정 → 퇴장)
export const animationPhases = {
  enterRatio: 0.2,   // 진입: 20%
  holdRatio: 0.6,    // 고정: 60%
  exitRatio: 0.2,    // 퇴장: 20%
};

// 인트로 애니메이션 설정 (페이지 로드 시 파티클이 모여서 첫 오브젝트 형성)
export const introConfig = {
  enabled: true,          // 인트로 애니메이션 on/off
  duration: 2.0,          // 인트로 지속 시간 (초)
  delay: 0.3,             // 페이지 로드 후 대기 시간 (초)
  scatterDistance: [5, 15] as [number, number], // 흩어진 파티클 거리 범위
  rotationTurns: -9,    // 인트로 중 자전 회전수 (양수=반시계, 음수=시계)
};

// 배경 파티클 설정 (원통형 분포 → Y축 회전 시 균일)
export const backgroundConfig = {
  enabled: true,          // 기본 활성
  count: 700,
  radius: 5,             // 원통 반경
  height: 5,             // 원통 높이 (Y축)
  minRadius: 1,          // 카메라 근처 빈 영역
  size: 0.03,
  opacity: 1,
  rotationSpeed: 0.02,
  exclusionRadius: 0,   // 오브젝트 실루엣 제외 반경 (NDC 단위)
  exclusionFade: 0.7,     // 제외 경계 페이드 영역 크기
};
