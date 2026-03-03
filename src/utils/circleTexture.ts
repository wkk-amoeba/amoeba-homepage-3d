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

  // Draw hard edge circle
  ctx.fillStyle = 'white';
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.fill();

  circleTexture = new THREE.CanvasTexture(canvas);
  circleTexture.needsUpdate = true;

  return circleTexture;
}
