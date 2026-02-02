'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Points, PointMaterial } from '@react-three/drei';
import * as THREE from 'three';
import { createBackgroundParticles } from '../utils/shapeGenerators';
import { backgroundConfig, getAdjustedParticleCount } from '../config/sceneConfig';

export default function ParticleBackground() {
  const pointsRef = useRef<THREE.Points>(null);

  const particles = useMemo(() => {
    return createBackgroundParticles(
      getAdjustedParticleCount(backgroundConfig.count),
      backgroundConfig.spread,
      backgroundConfig.zOffset
    );
  }, []);

  useFrame((state) => {
    if (pointsRef.current) {
      pointsRef.current.rotation.y = state.clock.elapsedTime * backgroundConfig.rotationSpeed;
    }
  });

  return (
    <Points ref={pointsRef} positions={particles} stride={3} frustumCulled={false}>
      <PointMaterial
        transparent
        color="#ffffff"
        size={backgroundConfig.size}
        sizeAttenuation={true}
        depthWrite={false}
        opacity={backgroundConfig.opacity}
      />
    </Points>
  );
}
