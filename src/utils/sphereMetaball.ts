/**
 * Sphere2 metaball effect: a main sphere bobs up/down while satellite
 * spheres orbit around it. When satellites approach the main sphere,
 * particles form liquid-like bridges (metaball isosurface).
 *
 * Uses implicit surface ray-marching: for each particle's radial direction,
 * find the metaball isosurface via bisection search.
 */

/** Runtime-adjustable metaball parameters */
export interface MetaballConfig {
  mainRadius: number;        // 메인 구 반경 (정규화 유닛)
  bobAmplitude: number;      // Y 상하 운동 진폭
  bobSpeed: number;          // 상하 운동 속도 (rad/s)
  satelliteCount: number;    // 위성 구 개수
  satelliteRadius: number;   // 위성 구 반경
  orbitRadius: number;       // 궤도 반경 (메인 구 표면으로부터)
  orbitSpeed: number;        // 궤도 속도 (rad/s)
  threshold: number;         // isosurface 임계값
}

// ─── Sphere3: Linear reciprocating satellites ───

/** Config for linear reciprocating metaball */
export interface MetaballLinearConfig {
  mainRadius: number;
  bobAmplitude: number;
  bobSpeed: number;
  satelliteCount: number;
  satelliteRadius: number;
  travelDistance: number;     // 위성 왕복 거리 (중심으로부터)
  travelSpeed: number;       // 왕복 속도
  threshold: number;
}
