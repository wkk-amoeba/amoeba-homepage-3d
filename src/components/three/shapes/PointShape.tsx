'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Points, PointMaterial } from '@react-three/drei';
import * as THREE from 'three';
import { createShapePoints } from '../utils/shapeGenerators';
import { ShapeData, waitPositions, scrollConfig, getAdjustedParticleCount } from '../config/sceneConfig';

interface PointShapeProps {
  data: ShapeData;
  scrollProgress: number;
  sectionIndex: number;
}

export default function PointShape({ data, scrollProgress, sectionIndex }: PointShapeProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const time = useRef(0);
  // Vector3 재사용으로 GC 압박 방지
  const tempPosition = useMemo(() => new THREE.Vector3(), []);
  const tempScale = useMemo(() => new THREE.Vector3(), []);

  const adjustedPointCount = useMemo(() => getAdjustedParticleCount(data.pointCount), [data.pointCount]);
  const positions = useMemo(() => createShapePoints(data.geometry, adjustedPointCount), [data.geometry, adjustedPointCount]);

  // 각 섹션의 스크롤 범위
  const sectionStart = scrollConfig.sectionStart + sectionIndex * scrollConfig.sectionGap;
  const sectionEnd = sectionStart + scrollConfig.sectionDuration;

  useFrame((state, delta) => {
    if (!pointsRef.current) return;

    // 조건부 업데이트: 활성 범위 밖이면 연산 스킵
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

    time.current += delta;

    // 기본값: 섹션 시작 전에 이미 화면 한쪽에 크게 대기
    let targetPosition: [number, number, number];
    let targetScale = 3; // 처음부터 크게
    let targetOpacity = 0;

    targetPosition = waitPositions[data.animation] || [0, 0, -20];

    // 섹션 진입 전 미리보기 (살짝 보이기 시작)
    if (scrollProgress >= previewStart && scrollProgress < sectionStart) {
      const previewProgress = (scrollProgress - previewStart) / scrollConfig.previewOffset;
      targetOpacity = previewProgress * 0.3; // 30%만 살짝 보임
    }

    // 현재 섹션에 해당하는 경우
    if (scrollProgress >= sectionStart && scrollProgress <= sectionEnd) {
      const localProgress = (scrollProgress - sectionStart) / (sectionEnd - sectionStart);

      switch (data.animation) {
        case 'left-to-center':
          // 왼쪽 하단에서 시작 → 살짝 위/오른쪽으로 이동
          const leftX = -5 + localProgress * 2;    // -5 → -3
          const leftY = -2 + localProgress * 1.5;  // -2 → -0.5
          targetPosition = [leftX, leftY, 2];
          targetScale = 3;
          targetOpacity = localProgress > 0.9 ? (1 - localProgress) * 10 : 1;
          break;

        case 'right-to-center':
          // 오른쪽 하단에서 시작 → 살짝 위/왼쪽으로 이동
          const rightX = 5 - localProgress * 2;    // 5 → 3
          const rightY = -2 + localProgress * 1.5; // -2 → -0.5
          targetPosition = [rightX, rightY, 2];
          targetScale = 3;
          targetOpacity = localProgress > 0.9 ? (1 - localProgress) * 10 : 1;
          break;

        case 'zoom-through':
          // 뒤에서 앞으로 다가와서 뚫고 지나감
          const zoomZ = 15 - localProgress * 30;   // 15 → -15
          targetPosition = [0, 0, zoomZ];
          targetScale = 3;
          targetOpacity = localProgress > 0.7 ? Math.max(0, (1 - localProgress) * 3.3) : 1;
          break;

        case 'curve-zoom':
          // 오른쪽 하단에서 커브 그리며 이동
          const curveT = localProgress;
          const curveX = 6 - curveT * 8;                    // 6 → -2
          const curveY = -3 + Math.sin(curveT * Math.PI) * 4; // 포물선
          const curveZ = 2 + curveT * 5;                    // 2 → 7 (가까워짐)
          targetPosition = [curveX, curveY, curveZ];
          targetScale = 3;
          targetOpacity = curveT > 0.85 ? (1 - curveT) * 6.7 : 1;
          break;
      }
    }

    // 부드러운 보간 (재사용 Vector3로 GC 방지)
    tempPosition.set(...targetPosition);
    tempScale.set(targetScale, targetScale, targetScale);
    pointsRef.current.position.lerp(tempPosition, 0.06);
    pointsRef.current.scale.lerp(tempScale, 0.06);

    // 회전 애니메이션
    pointsRef.current.rotation.x += delta * 0.2;
    pointsRef.current.rotation.y += delta * 0.15;

    // material opacity
    const material = pointsRef.current.material as THREE.PointsMaterial;
    if (material.opacity !== undefined) {
      material.opacity = THREE.MathUtils.lerp(material.opacity, targetOpacity, 0.1);
    }
  });

  return (
    <Points ref={pointsRef} positions={positions} stride={3} frustumCulled={false}>
      <PointMaterial
        transparent
        color={data.color}
        size={0.015}
        sizeAttenuation={true}
        depthWrite={false}
        opacity={0}
      />
    </Points>
  );
}
