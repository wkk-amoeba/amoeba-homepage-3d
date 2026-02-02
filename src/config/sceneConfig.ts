// 3D 씬 설정값 중앙 관리

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

export interface ShapeData {
  id: number;
  geometry: 'box' | 'torus' | 'sphere' | 'octahedron' | 'cone';
  color: string;
  animation: 'left-to-center' | 'right-to-center' | 'zoom-through' | 'curve-zoom' | 'scatter-to-form';
  pointCount: number;
}

// 도형 정의
export const shapes: ShapeData[] = [
  { id: 0, geometry: 'box', color: '#ffffff', animation: 'left-to-center', pointCount: 3000 },
  { id: 1, geometry: 'torus', color: '#ffffff', animation: 'scatter-to-form', pointCount: 4000 },
  { id: 2, geometry: 'sphere', color: '#ffffff', animation: 'left-to-center', pointCount: 5000 },
  { id: 3, geometry: 'octahedron', color: '#ffffff', animation: 'zoom-through', pointCount: 3000 },
  { id: 4, geometry: 'cone', color: '#ffffff', animation: 'curve-zoom', pointCount: 3500 },
];

// IntroShapes 설정
export const introShapesConfig = [
  { geometry: 'box' as const, color: '#ffffff', pointCount: 1500, initialPos: [0, 0, 0] as [number, number, number] },
  { geometry: 'torus' as const, color: '#ffffff', pointCount: 2000, initialPos: [1.5, 0.8, -0.5] as [number, number, number] },
  { geometry: 'sphere' as const, color: '#ffffff', pointCount: 2500, initialPos: [-1.5, -0.3, 0.3] as [number, number, number] },
  { geometry: 'octahedron' as const, color: '#ffffff', pointCount: 1500, initialPos: [0.8, -1, 0.5] as [number, number, number] },
  { geometry: 'cone' as const, color: '#ffffff', pointCount: 1800, initialPos: [-1, 1, -0.3] as [number, number, number] },
];

// 애니메이션별 대기 위치
export const waitPositions: Record<string, [number, number, number]> = {
  'left-to-center': [-5, -2, 2],
  'right-to-center': [5, -2, 2],
  'zoom-through': [0, 0, 15],
  'curve-zoom': [6, -3, 2],
};

// IntroShapes scatter 방향
export const scatterDirections = [
  [-3, 2, -8],
  [4, 3, -10],
  [-4, -2, -9],
  [3, -3, -7],
  [-2, 4, -11],
];

// 스크롤 설정
export const scrollConfig = {
  introEnd: 0.1,
  sectionStart: 0.1,
  sectionGap: 0.18,
  sectionDuration: 0.16,
  previewOffset: 0.05,
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

// ScatterToForm 토러스 설정
export const torusConfig = {
  position: [3, -2, 2] as [number, number, number],
  mainRadius: 0.5,
  tubeRadius: 0.2,
  scatterRange: { x: 20, y: 15, z: 10 },
  scatterZOffset: 5,
};
