'use client';

import { Canvas } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import { Suspense } from 'react';
import { Points, PointMaterial } from '@react-three/drei';

// 분리된 컴포넌트들
import ParticleBackground from './backgrounds/ParticleBackground';
import IntroShapes from './intro/IntroShapes';
import { PointShape, ScatterShape } from './shapes';
import { shapes } from './config/sceneConfig';

function LoadingFallback() {
  return (
    <Points positions={new Float32Array([0, 0, 0])} stride={3}>
      <PointMaterial color="#666" size={0.1} />
    </Points>
  );
}

function ScrollScene({ scrollProgress }: { scrollProgress: number }) {
  return (
    <group>
      <ParticleBackground />
      <IntroShapes scrollProgress={scrollProgress} />
      {shapes.map((shape, index) => (
        shape.animation === 'scatter-to-form' ? (
          <ScatterShape key={shape.id} data={shape} scrollProgress={scrollProgress} sectionIndex={index} />
        ) : (
          <PointShape key={shape.id} data={shape} scrollProgress={scrollProgress} sectionIndex={index} />
        )
      ))}
    </group>
  );
}

interface SceneProps {
  scrollProgress: number;
}

export default function Scene({ scrollProgress }: SceneProps) {
  return (
    <div className="fixed inset-0 -z-10">
      <Canvas
        camera={{ position: [0, 0, 8], fov: 45 }}
        gl={{ antialias: true, alpha: true }}
      >
        <Suspense fallback={<LoadingFallback />}>
          <ambientLight intensity={0.5} />
          <directionalLight position={[10, 10, 5]} intensity={1} />
          <pointLight position={[-10, -10, -5]} intensity={0.5} color="#ec4899" />

          <ScrollScene scrollProgress={scrollProgress} />

          <Environment preset="city" />
        </Suspense>
      </Canvas>
    </div>
  );
}
