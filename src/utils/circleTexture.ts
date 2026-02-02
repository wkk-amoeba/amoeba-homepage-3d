import * as THREE from 'three';

let circleTexture: THREE.Texture | null = null;

export function getCircleTexture(): THREE.Texture {
  if (circleTexture) return circleTexture;

  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d')!;
  const center = size / 2;
  const radius = size / 2 - 2;

  // Draw circle with soft edge
  const gradient = ctx.createRadialGradient(center, center, 0, center, center, radius);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.8)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  circleTexture = new THREE.CanvasTexture(canvas);
  circleTexture.needsUpdate = true;

  return circleTexture;
}
