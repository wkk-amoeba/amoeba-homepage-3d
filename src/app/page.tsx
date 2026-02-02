'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState, useRef } from 'react';

const Scene = dynamic(() => import('@/components/three/Scene'), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 -z-10 bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900" />
  ),
});

const shapeInfo = [
  { name: 'Cube', description: '기본적인 3D 형태의 시작점', color: '#4f46e5' },
  { name: 'Torus', description: '무한의 순환을 상징하는 도넛 형태', color: '#ec4899' },
  { name: 'Sphere', description: '완벽한 균형과 조화의 구체', color: '#22c55e' },
  { name: 'Octahedron', description: '다이아몬드처럼 빛나는 팔면체', color: '#f59e0b' },
  { name: 'Cone', description: '정점을 향해 수렴하는 원뿔', color: '#06b6d4' },
];

export default function Home() {
  const [scrollProgress, setScrollProgress] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      if (!containerRef.current) return;
      const scrollHeight = containerRef.current.scrollHeight - window.innerHeight;
      const progress = window.scrollY / scrollHeight;
      setScrollProgress(Math.min(1, Math.max(0, progress)));
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // 현재 섹션 계산
  const getCurrentSection = () => {
    if (scrollProgress < 0.2) return -1; // 인트로/스캐터
    const sectionProgress = (scrollProgress - 0.2) / 0.8;
    return Math.min(4, Math.floor(sectionProgress * 5));
  };

  const currentSection = getCurrentSection();

  return (
    <div ref={containerRef}>
      <Scene scrollProgress={scrollProgress} />

      {/* Hero Section */}
      <section className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6">
        <div className="text-center">
          <h1 className="mb-6 text-6xl font-bold tracking-tight text-white drop-shadow-lg md:text-8xl">
            Welcome
          </h1>
          <p className="mb-8 max-w-2xl text-xl text-white/80 md:text-2xl">
            스크롤하여 3D 오브젝트 여행을 시작하세요
          </p>
          <div className="animate-bounce text-white/60">
            <svg className="mx-auto h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </div>
        </div>
      </section>

      {/* Spacer for scatter animation */}
      <section className="h-[50vh]" />

      {/* Individual Shape Sections */}
      {shapeInfo.map((shape, index) => (
        <section
          key={index}
          className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6"
        >
          <div
            className={`text-center transition-all duration-700 ${
              currentSection === index ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
            }`}
          >
            <div
              className="mb-4 inline-block rounded-full px-4 py-2 text-sm font-medium"
              style={{ backgroundColor: shape.color + '33', color: shape.color }}
            >
              {String(index + 1).padStart(2, '0')}
            </div>
            <h2 className="mb-4 text-5xl font-bold text-white md:text-7xl">
              {shape.name}
            </h2>
            <p className="max-w-md text-xl text-white/70">
              {shape.description}
            </p>
          </div>
        </section>
      ))}

      {/* Final Section */}
      <section className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6">
        <div className="text-center">
          <h2 className="mb-6 text-5xl font-bold text-white md:text-7xl">
            Explore More
          </h2>
          <p className="mb-8 max-w-2xl text-xl text-white/70">
            3D 웹의 무한한 가능성을 경험하세요
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <button className="rounded-full bg-white px-8 py-3 font-semibold text-black transition-transform hover:scale-105">
              Get Started
            </button>
            <button className="rounded-full border-2 border-white/30 px-8 py-3 font-semibold text-white backdrop-blur-sm transition-all hover:border-white/60 hover:bg-white/10">
              Learn More
            </button>
          </div>
        </div>
      </section>

      {/* Scroll Progress Indicator */}
      <div className="fixed bottom-8 right-8 z-50 flex flex-col items-center gap-2">
        <div className="h-32 w-1 overflow-hidden rounded-full bg-white/20">
          <div
            className="w-full rounded-full bg-white transition-all duration-150"
            style={{ height: `${scrollProgress * 100}%` }}
          />
        </div>
        <span className="text-xs text-white/60">
          {Math.round(scrollProgress * 100)}%
        </span>
      </div>
    </div>
  );
}
