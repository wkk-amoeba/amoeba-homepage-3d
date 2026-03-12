import { HumanParticleScene } from './scene/HumanParticleScene';

document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('canvas-container')!;
  const scene = new HumanParticleScene(container);

  window.addEventListener('beforeunload', () => {
    scene.destroy();
  });
});
