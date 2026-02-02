'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { PointMaterial } from '@react-three/drei';
import * as THREE from 'three';
import { createTorusPoints, createScatteredPositions } from '../utils/shapeGenerators';
import { ShapeData, torusConfig, scrollConfig, getAdjustedParticleCount } from '../config/sceneConfig';

interface ScatterShapeProps {
  data: ShapeData;
  scrollProgress: number;
  sectionIndex: number;
}

export default function ScatterShape({ data, scrollProgress, sectionIndex }: ScatterShapeProps) {
  const pointsRef = useRef<THREE.Points>(null);

  const adjustedPointCount = useMemo(() => getAdjustedParticleCount(data.pointCount), [data.pointCount]);

  // 랜덤 시작 위치 (화면 전체에 흩어진)와 토러스 형태 위치
  const { scatteredPositions, torusPositions } = useMemo(() => {
    const count = adjustedPointCount;
    const scattered = createScatteredPositions(
      count,
      torusConfig.scatterRange,
      torusConfig.scatterZOffset
    );
    const torus = createTorusPoints(
      count,
      torusConfig.mainRadius,
      torusConfig.tubeRadius
    );

    return { scatteredPositions: scattered, torusPositions: torus };
  }, [adjustedPointCount]);

  // 섹션 범위
  const sectionStart = scrollConfig.sectionStart + sectionIndex * scrollConfig.sectionGap;
  const sectionEnd = sectionStart + scrollConfig.sectionDuration;

  useFrame((state, delta) => {
    if (!pointsRef.current) return;

    // 조건부 업데이트: 활성 범위 밖이면 비싼 파티클 연산 스킵
    const previewStart = sectionStart - scrollConfig.previewOffset;
    const isActive = scrollProgress >= previewStart && scrollProgress <= sectionEnd + 0.02;

    if (!isActive) {
      // 비활성 상태에서는 opacity만 0으로 유지
      const material = pointsRef.current.material as THREE.PointsMaterial;
      if (material.opacity > 0.01) {
        material.opacity *= 0.9; // 부드럽게 fade out
      }
      return;
    }

    let targetOpacity = 0;
    let morphProgress = 0; // 0 = scattered, 1 = torus shape

    // 섹션 진입 전 미리보기 (점들이 fade in)
    if (scrollProgress >= previewStart && scrollProgress < sectionStart) {
      const previewProgress = (scrollProgress - previewStart) / scrollConfig.previewOffset;
      targetOpacity = previewProgress * 0.5;
      morphProgress = 0; // 아직 흩어진 상태
    }

    // 현재 섹션에 해당하는 경우
    if (scrollProgress >= sectionStart && scrollProgress <= sectionEnd) {
      const localProgress = (scrollProgress - sectionStart) / (sectionEnd - sectionStart);

      // Phase 1 (0~0.3): 점들이 화면에 fade in (흩어진 상태)
      // Phase 2 (0.3~0.9): 점들이 토러스 형태로 모임
      // Phase 3 (0.9~1): fade out

      if (localProgress < 0.3) {
        targetOpacity = Math.min(1, localProgress / 0.3);
        morphProgress = 0;
      } else if (localProgress < 0.9) {
        targetOpacity = 1;
        morphProgress = (localProgress - 0.3) / 0.6; // 0 → 1
      } else {
        targetOpacity = Math.max(0, (1 - localProgress) * 10);
        morphProgress = 1;
      }
    }

    // 점 위치 보간
    const count = adjustedPointCount;
    const positionAttribute = pointsRef.current.geometry.getAttribute('position');
    if (positionAttribute) {
      const positions = positionAttribute.array as Float32Array;
      for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        // 흩어진 위치에서 토러스 위치로 보간
        const scatterX = scatteredPositions[i3];
        const scatterY = scatteredPositions[i3 + 1];
        const scatterZ = scatteredPositions[i3 + 2];

        // 토러스 형태 + 최종 위치 오프셋
        const torusX = torusPositions[i3] * 3 + torusConfig.position[0];
        const torusY = torusPositions[i3 + 1] * 3 + torusConfig.position[1];
        const torusZ = torusPositions[i3 + 2] * 3 + torusConfig.position[2];

        // easeOutCubic for smoother morphing
        const easedProgress = 1 - Math.pow(1 - morphProgress, 3);

        positions[i3] = THREE.MathUtils.lerp(scatterX, torusX, easedProgress);
        positions[i3 + 1] = THREE.MathUtils.lerp(scatterY, torusY, easedProgress);
        positions[i3 + 2] = THREE.MathUtils.lerp(scatterZ, torusZ, easedProgress);
      }
      positionAttribute.needsUpdate = true;
    }

    // 토러스 형태가 되면 회전
    if (morphProgress > 0.5) {
      pointsRef.current.rotation.x += delta * 0.2 * (morphProgress - 0.5) * 2;
      pointsRef.current.rotation.y += delta * 0.15 * (morphProgress - 0.5) * 2;
    }

    // material opacity
    const material = pointsRef.current.material as THREE.PointsMaterial;
    if (material.opacity !== undefined) {
      material.opacity = THREE.MathUtils.lerp(material.opacity, targetOpacity, 0.1);
    }
  });

  // 초기 geometry 생성
  const geometry = useMemo(() => {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(scatteredPositions.slice(), 3));
    return geom;
  }, [scatteredPositions]);

  return (
    <points ref={pointsRef} geometry={geometry} frustumCulled={false}>
      <PointMaterial
        transparent
        color="#ffffff"
        size={0.02}
        sizeAttenuation={true}
        depthWrite={false}
        opacity={0}
      />
    </points>
  );
}
