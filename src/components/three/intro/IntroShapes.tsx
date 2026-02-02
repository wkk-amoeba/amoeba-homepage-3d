'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Points, PointMaterial } from '@react-three/drei';
import * as THREE from 'three';
import { createShapePoints } from '../utils/shapeGenerators';
import { introShapesConfig, scatterDirections, scrollConfig, getAdjustedParticleCount } from '../config/sceneConfig';

interface IntroShapesProps {
  scrollProgress: number;
}

export default function IntroShapes({ scrollProgress }: IntroShapesProps) {
  const groupRef = useRef<THREE.Group>(null);
  // Vector3 재사용으로 GC 압박 방지
  const tempPosition = useMemo(() => new THREE.Vector3(), []);
  const tempScale = useMemo(() => new THREE.Vector3(), []);

  const fadeProgress = Math.min(1, scrollProgress / scrollConfig.introEnd);

  // 각 도형의 점 데이터 (디바이스 성능에 따라 파티클 수 조절)
  const shapePositions = useMemo(() =>
    introShapesConfig.map((config) => ({
      positions: createShapePoints(config.geometry, getAdjustedParticleCount(config.pointCount)),
      color: config.color,
      initialPos: config.initialPos,
    })),
  []);

  const pointsRefs = useRef<(THREE.Points | null)[]>([]);

  useFrame((state, delta) => {
    pointsRefs.current.forEach((points, index) => {
      if (!points) return;

      const initial = shapePositions[index].initialPos;
      const dir = scatterDirections[index];

      const targetX = initial[0] + dir[0] * fadeProgress;
      const targetY = initial[1] + dir[1] * fadeProgress;
      const targetZ = initial[2] + dir[2] * fadeProgress;

      tempPosition.set(targetX, targetY, targetZ);
      points.position.lerp(tempPosition, 0.1);

      const targetScaleVal = 0.6 * (1 - fadeProgress * 0.8);
      tempScale.set(targetScaleVal, targetScaleVal, targetScaleVal);
      points.scale.lerp(tempScale, 0.1);

      const material = points.material as THREE.PointsMaterial;
      material.opacity = THREE.MathUtils.lerp(material.opacity, 1 - fadeProgress, 0.1);

      points.rotation.x += delta * 0.3;
      points.rotation.y += delta * 0.2;
    });
  });

  return (
    <group ref={groupRef}>
      {shapePositions.map((shape, index) => (
        <Points
          key={index}
          ref={(el) => { pointsRefs.current[index] = el; }}
          positions={shape.positions}
          stride={3}
          frustumCulled={false}
        >
          <PointMaterial
            transparent
            color={shape.color}
            size={0.012}
            sizeAttenuation={true}
            depthWrite={false}
            opacity={1}
          />
        </Points>
      ))}
    </group>
  );
}
