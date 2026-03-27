import './style.css';
import { SceneManager } from './scene/SceneManager';
import { models } from './config/sceneConfig';
import { registerUnifiedSphere } from './utils/sphereUnified';

// ─── 씬4 멀티 모델 설정 ───

interface SubModelEntry {
  binPath: string;
  offset: [number, number, number];   // 위치 [x, y, z]
  particleCount: number;
  scale: number;
  tilt?: [number, number, number];     // 초기 기울기 [rx, ry, rz] 라디안
  spinSpeed?: number;                  // 자전 속도 (rad/s, 0=정지)
  spinAxis?: [number, number, number]; // 자전축 방향 벡터 (기본 [0,1,0] = Y축)
}

/** Rodrigues 회전: 임의 축(정규화됨) 기준 angle만큼 회전 */
function rotateAroundAxis(
  px: number, py: number, pz: number,
  ax: number, ay: number, az: number,
  cos: number, sin: number,
): [number, number, number] {
  const dot = px * ax + py * ay + pz * az;
  return [
    px * cos + (ay * pz - az * py) * sin + ax * dot * (1 - cos),
    py * cos + (az * px - ax * pz) * sin + ay * dot * (1 - cos),
    pz * cos + (ax * py - ay * px) * sin + az * dot * (1 - cos),
  ];
}

/** .bin 파일들을 로드하고, 각 모델을 독립 정규화+tilt 후 합성 */
async function loadSubModels(entries: SubModelEntry[]) {
  const subs: { base: Float32Array; count: number; startIdx: number; offset: [number,number,number]; spinSpeed: number; axisX: number; axisY: number; axisZ: number }[] = [];
  let totalCount = 0;

  for (const entry of entries) {
    const res = await fetch(entry.binPath);
    const raw = new Float32Array(await res.arrayBuffer());
    const rawCount = raw.length / 3;
    const step = Math.max(1, Math.ceil(rawCount / entry.particleCount));
    const pts: number[] = [];
    for (let i = 0; i < rawCount && pts.length / 3 < entry.particleCount; i++) {
      if (i % step === 0) pts.push(raw[i * 3], raw[i * 3 + 1], raw[i * 3 + 2]);
    }
    const count = pts.length / 3;

    // 독립 정규화
    let mnX = Infinity, mnY = Infinity, mnZ = Infinity;
    let mxX = -Infinity, mxY = -Infinity, mxZ = -Infinity;
    for (let i = 0; i < pts.length; i += 3) {
      if (pts[i] < mnX) mnX = pts[i]; if (pts[i] > mxX) mxX = pts[i];
      if (pts[i+1] < mnY) mnY = pts[i+1]; if (pts[i+1] > mxY) mxY = pts[i+1];
      if (pts[i+2] < mnZ) mnZ = pts[i+2]; if (pts[i+2] > mxZ) mxZ = pts[i+2];
    }
    const dim = Math.max(mxX - mnX, mxY - mnY, mxZ - mnZ);
    const s = entry.scale / dim;
    const cx = (mnX + mxX) / 2, cy = (mnY + mxY) / 2, cz = (mnZ + mxZ) / 2;

    // tilt 적용 (Rx→Ry→Rz)
    const [tx, ty, tz] = entry.tilt ?? [0, 0, 0];
    const cxR = Math.cos(tx), sxR = Math.sin(tx);
    const cyR = Math.cos(ty), syR = Math.sin(ty);
    const czR = Math.cos(tz), szR = Math.sin(tz);

    const base = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      let px = (pts[i3] - cx) * s, py = (pts[i3+1] - cy) * s, pz = (pts[i3+2] - cz) * s;
      if (tx !== 0) { const y1 = py*cxR - pz*sxR, z1 = py*sxR + pz*cxR; py = y1; pz = z1; }
      if (ty !== 0) { const x1 = px*cyR + pz*syR, z1 = -px*syR + pz*cyR; px = x1; pz = z1; }
      if (tz !== 0) { const x1 = px*czR - py*szR, y1 = px*szR + py*czR; px = x1; py = y1; }
      base[i3] = px + entry.offset[0];
      base[i3+1] = py + entry.offset[1];
      base[i3+2] = pz + entry.offset[2];
    }

    // 자전축 정규화
    const [rawAx, rawAy, rawAz] = entry.spinAxis ?? [0, 1, 0];
    const axLen = Math.sqrt(rawAx * rawAx + rawAy * rawAy + rawAz * rawAz) || 1;

    subs.push({
      base, count, startIdx: totalCount, offset: entry.offset,
      spinSpeed: entry.spinSpeed ?? 0,
      axisX: rawAx / axLen, axisY: rawAy / axLen, axisZ: rawAz / axLen,
    });
    totalCount += count;
  }

  // 합성 (precomputedPositions용)
  const combined = new Float32Array(totalCount * 3);
  for (const sub of subs) combined.set(sub.base, sub.startIdx * 3);

  return { combined, subs };
}

// ─── 메인 ───

document.addEventListener('DOMContentLoaded', async () => {
  // 씬 04: 멀티 모델 설정
  const scene4Entries: SubModelEntry[] = [
    { binPath: '/models/vertices/2.bin', offset: [0, 1.2, 0], tilt: [0, 0.5, 0.5], particleCount: 5000, scale: 2, spinSpeed: 0.3, spinAxis: [0, 1, 0] },
    { binPath: '/models/vertices/Cone.bin', offset: [-1.2, -1.0, 0], tilt: [0.2, 0.5, 0], particleCount: 5000, scale: 1.2, spinSpeed: -0.5, spinAxis: [0.3, 0, 0.3] },
    { binPath: '/models/vertices/Cube.bin', offset: [1.3, -1.0, 0], tilt: [0, 0.5, 1], particleCount: 5000, scale: 1.2, spinSpeed: 0.4, spinAxis: [0.2, 0.3, 0.3] },
  ];

  const { combined, subs } = await loadSubModels(scene4Entries);
  const model2 = models.find((m) => m.name === 'Model2');
  if (model2) model2.precomputedPositions = combined;

  const sceneManager = new SceneManager('canvas-container');
  sceneManager.start();

  const morpher = sceneManager.getMorpher();
  if (morpher) {
    await morpher.ready;

    // 씬 01-02: Sphere
    const sphereIdx = models.findIndex((m) => m.name === 'Sphere');
    if (sphereIdx >= 0) registerUnifiedSphere(morpher, sphereIdx);

    // 씬 04: 개별 자전 shapeUpdater
    const model2Idx = models.findIndex((m) => m.name === 'Model2');
    if (model2Idx >= 0) {
      const shape = morpher.getShapeTargets()[model2Idx];
      if (shape) {
        let elapsed = 0;
        morpher.setShapeUpdater(model2Idx, (delta: number) => {
          elapsed += delta;
          const positions = shape.positions;
          for (const sub of subs) {
            if (sub.spinSpeed === 0) {
              // 회전 없음: basePositions 복사
              for (let i = 0; i < sub.count; i++) {
                const si3 = (sub.startIdx + i) * 3, bi3 = i * 3;
                positions[si3] = sub.base[bi3];
                positions[si3+1] = sub.base[bi3+1];
                positions[si3+2] = sub.base[bi3+2];
              }
            } else {
              const angle = elapsed * sub.spinSpeed;
              const cos = Math.cos(angle), sin = Math.sin(angle);
              const [ocx, ocy, ocz] = sub.offset;
              for (let i = 0; i < sub.count; i++) {
                const si3 = (sub.startIdx + i) * 3, bi3 = i * 3;
                const lx = sub.base[bi3] - ocx, ly = sub.base[bi3+1] - ocy, lz = sub.base[bi3+2] - ocz;
                const [rx, ry, rz] = rotateAroundAxis(lx, ly, lz, sub.axisX, sub.axisY, sub.axisZ, cos, sin);
                positions[si3] = rx + ocx;
                positions[si3+1] = ry + ocy;
                positions[si3+2] = rz + ocz;
              }
            }
          }
        });
      }
    }
  }

  if (__DEBUG_PANEL__) {
    import('./debug/DebugPanel').then(({ DebugPanel }) => {
      new DebugPanel(sceneManager);
    });
  }

  window.addEventListener('beforeunload', () => {
    sceneManager.destroy();
  });
});
