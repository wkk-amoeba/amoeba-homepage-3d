/**
 * Sphere deformation effect: particles oscillate between perfect sphere
 * and a crumpled/faceted surface, creating an organic breathing effect.
 *
 * Uses simplex-like hash noise on the radial direction of each particle
 * to create faceted bumps. The deformation intensity breathes over time.
 */

/** Runtime-adjustable deformation parameters */
export interface SphereDeformConfig {
  noiseScale: number;      // noise 공간 스케일 (낮을수록 큰 덩어리)
  maxDeform: number;       // 최대 변형 깊이 (정규화 유닛)
  breathSpeed: number;     // breathing 주기 속도 (rad/s)
  breathMin: number;       // 최소 변형 강도 (0=완전 구)
  breathMax: number;       // 최대 변형 강도
  noiseSpeed: number;      // noise 변화 속도
}
