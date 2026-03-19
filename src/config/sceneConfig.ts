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
  mobileScale?: number;                // 모바일 전용 스케일 (미지정 시 scale 사용)
  position?: [number, number, number]; // 월드 위치 오프셋 [x, y, z] (Points 중심 기준)
  rotation?: [number, number, number]; // 기본 회전 [x, y, z] (라디안)
  particleCount?: number; // 모델별 파티클 수 고정값 (미지정 시 디바이스 기반 자동 결정)
  holdScatter?: number;  // hold 상태에서 유지할 scatter 비율 (0=완전 형태, 1=완전 흩어짐)
  heightSize?: { min: number; max: number; mobileMin?: number }; // Y 위치 기반 파티클 크기 (아래=min, 위=max 배율, mobileMin: 모바일 전용 min)
  radialSize?: { min: number; max: number }; // 중심축 거리 기반 파티클 크기 (중심=min, 외곽=max 배율)
  depthSize?: { min: number; max: number }; // Z 깊이 기반 파티클 크기 (먼쪽=min, 가까운쪽=max 배율)
  spinTop?: {              // 팽이 효과 (rotation 대신 동적 회전)
    tilt: number;            // 기울기 (라디안)
    spinSpeed: number;       // 자전 속도 (rad/s, 자체 축 중심)
    precessionSpeed: number; // 세차운동 속도 (rad/s, Y축 주위 축 회전)
    nutationAmp?: number;    // 장동 진폭 (라디안, 기울기 미세 흔들림)
    nutationSpeed?: number;  // 장동 속도 (rad/s)
  };
  sectionSpan?: number;  // 이 shape이 차지하는 스크롤 섹션 수 (기본 1)
  autoRotateSpeed?: number; // 모델별 자전 속도 오버라이드 (rad/s, 미지정 시 particleConfig.autoRotateSpeed 사용)
  lighting?: {               // 모델별 라이팅 오버라이드 (미지정 시 particleConfig 기본값)
    ambient?: number;
    diffuse?: number;
    specular?: number;
    shininess?: number;
  };
  enterTransition?: {        // 이 모델로 진입할 때의 전환 효과 커스텀
    noRotation?: boolean;      // 전환 시 회전 비활성 (기본 false)
    gravity?: boolean;         // 중력 낙하 효과 (기본 false)
    gravityHeight?: number;    // 낙하 시작 높이 오프셋 (기본 8)
    gravityDuration?: number;  // 낙하 재생 시간 (초, 기본 3.0)
    gravityWobbleFreq?: number; // 낙하 흔들림 진동 주파수 (Hz, 기본 4.0)
    scatterScale?: number;     // scatter 배율 오버라이드 (기본 particleConfig.scatterScale)
  };
}

// 3D 모델 정의
// geometry가 있으면 프로그래밍 생성, modelPath가 있으면 GLB .bin 로드 -1.5, 0.3, 0
export const models: ModelData[] = [
  { id: 0, name: 'Sphere', modelPath: '/models/high_shpere.glb', scale: 0.36, position: [0, 0, 0], holdScatter: 0.015, sectionSpan: 2, depthSize: { min: 0.1, max: 0.7 }, lighting: { ambient: 0.15, diffuse: 0.4, specular: 1.0, shininess: 2.0 }, },
  { id: 1, name: 'Gyro', modelPath: '/models/inception_gyro.glb', scale: 0.4, position: [0, 0, 0], holdScatter: 0.01, sectionSpan: 1, radialSize: { min: 0.5, max: 1.0 }, spinTop: { tilt: 0, spinSpeed: 0.3, precessionSpeed: 0.4, nutationAmp: 0.2443, nutationSpeed: 1.5 }, enterTransition: { noRotation: false, scatterScale: 0.03 }, lighting: { ambient: 0.1, diffuse: 0.3, specular: 0, shininess: 2.0 } },
  { id: 2, name: 'Human', scale: 0.35, position: [0, -1.4, 0], holdScatter: 0.006, lighting: { ambient: 0.05, diffuse: 0.2, specular: 0, shininess: 2.0 } },  // precomputedPositions는 런타임에 주입
  { id: 3, name: 'City3', modelPath: '/models/city_23_high.glb', scale: 1.0, mobileScale: 0.85, position: [0, -1, 0], particleCount: 50000, heightSize: { min: 0.05, max: 0.8, mobileMin: 0.2 }, autoRotateSpeed: -0.3, enterTransition: { noRotation: true, gravity: true, gravityHeight: 3.5, gravityDuration: 5.0, gravityWobbleFreq: 10.0, scatterScale: 0.08 }, lighting: { ambient: 0.05, diffuse: 0.2, specular: 0, shininess: 2.0 } },
];

// 파티클 렌더링 모드
export type ParticleMode = 'dots' | 'tetrahedron';

// 파티클 설정
export const particleConfig = {
  size: 0.02,              // 파티클 크기
  depthNearMul: 1.7,      // 가까운 파티클 크기 배율 (최대)
  depthFarMul: 0.3,       // 먼 파티클 크기 배율 (최소)
  mode: 'dots' as ParticleMode,
  mouseRadius: 0.3,        // 돔 반경 (로컬 유닛)
  activationRadius: 2.0,   // 마우스 근접 시 효과 활성 반경 (월드 유닛)
  mouseAttract: false,     // true=마우스로 모임(attract), false=밀어냄(scatter)
  mouseStrength: 0.5,      // 마우스 인터랙션 강도
  microNoiseAmp: 0.1,    // 파티클 미세 공전 반지름 (0 = 비활성)
  microNoiseSpeed: 0.05,    // 미세 공전 속도 (rad/s)
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
  lightDiffuse: 0.2,             // 확산광 강도
  lightSpecular: 1.0,            // 스페큘러 강도 (핀 조명 하이라이트)
  lightShininess: 2.0,           // 스페큘러 집중도 (높을수록 작고 날카로운 하이라이트)
  // 전환 시 회전 효과 (파티클이 오브젝트 중심 주위로 회전하며 형태 형성)
  transitionRotation: true,      // 전환 회전 on/off
  transitionRotationSpeed: 3.0,  // 회전 속도 (rad/s)
  // 오브젝트 자전 (Y축 느린 회전)
  autoRotateSpeed: 0.15,         // 자전 속도 (rad/s), 0=비활성
  // 디버그 시각화
  showDomeDebug: false,          // 돔 영역 빨간 원 표시
};

// 스크롤 설정 — sectionGap은 1 span 단위의 크기, 총 span 합계로 균등 배분
// 총 span = Sphere(2) + Gyro(1) + Human(1) + City3(1) = 5
export const scrollConfig = {
  introEnd: 0,             // 인트로 없음
  sectionStart: 0,         // 첫 모델 즉시 시작
  sectionGap: 1 / 5,       // 20% per span unit
  sectionDuration: 1 / 5,  // 20% per span unit
  previewOffset: 0,        // 프리뷰 없음
  modelCount: 5,           // 총 span 합계 (deprecated — getPhase에서 span 누적 사용)
};

// 애니메이션 페이즈 설정 (진입 → 고정 → 퇴장)
export const animationPhases = {
  enterRatio: 0.3,   // 진입: 30%
  holdRatio: 0.4,    // 고정: 40%  microNoiseAmp: 0.1를 키우면 원하는 형태에 가까운
  exitRatio: 0.3,    // 퇴장: 30%
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
  radius: 8,             // 원통 반경
  height: 8,             // 원통 높이 (Y축)
  minRadius: 1,          // 카메라 근처 빈 영역
  size: 0.04,
  opacity: 1,
  rotationSpeed: 0.02,
  exclusionRadius: 0,   // 오브젝트 실루엣 제외 반경 (NDC 단위)
  exclusionFade: 0.7,     // 제외 경계 페이드 영역 크기
};
