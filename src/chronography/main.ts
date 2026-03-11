import GUI from 'lil-gui';
import { ChronographyScene } from './ChronographyScene';
import { YEAR_DATA, applyStoredPrefs, saveYearPrefs, exportAllPrefs } from './yearData';

// Apply stored preferences before anything else
applyStoredPrefs();

// DOM elements
const container = document.getElementById('canvas-container')!;
const yearDisplay = document.getElementById('year-display')!;
const yearNav = document.getElementById('year-nav')!;
const infoPanel = document.getElementById('info-panel')!;
const prevBtn = document.getElementById('prev-btn')!;
const nextBtn = document.getElementById('next-btn')!;

// Init scene
const scene = new ChronographyScene(container);

// Build year navigation buttons
YEAR_DATA.forEach((yd, i) => {
  const btn = document.createElement('button');
  btn.className = 'year-btn';
  btn.style.setProperty('--year-color', yd.color);
  btn.innerHTML = `<span class="dot"></span>${yd.year}`;
  btn.addEventListener('click', () => goToYear(i));
  yearNav.appendChild(btn);
});

// ===== Debug Panel (lil-gui) =====
const gui = new GUI({ title: 'Chronography Debug' });

// --- Year selector + per-year editing ---
const yearFolder = gui.addFolder('Year (연도별 편집)');

// Editable proxy for current year
const yearEdit = {
  year: YEAR_DATA[0].year,
  scatter: YEAR_DATA[0].scatter,
  particleCount: YEAR_DATA[0].particleCount,
  concentration: YEAR_DATA[0].density.concentration,
  poleY: YEAR_DATA[0].density.poleY,
  poleAngle: YEAR_DATA[0].density.poleAngle,
};

// Year dropdown (select list)
const yearOptions: Record<string, number> = {};
YEAR_DATA.forEach((yd) => { yearOptions[String(yd.year)] = yd.year; });

const yearSelectCtrl = yearFolder.add(yearEdit, 'year', yearOptions).name('연도 선택').onChange((year: number) => {
  const idx = YEAR_DATA.findIndex(y => y.year === year);
  if (idx >= 0) goToYear(idx);
});

const scatterCtrl = yearFolder.add(yearEdit, 'scatter', 0, 2, 0.01).name('Scatter').onChange((v: number) => {
  const yd = YEAR_DATA[scene.getCurrentYearIndex()];
  yd.scatter = v;
  scene.rebuildCurrentYear();
});

const countCtrl = yearFolder.add(yearEdit, 'particleCount', 100, 7000, 50).name('파티클 수').onChange((v: number) => {
  const yd = YEAR_DATA[scene.getCurrentYearIndex()];
  yd.particleCount = v;
  scene.rebuildCurrentYear();
});

const concCtrl = yearFolder.add(yearEdit, 'concentration', 0, 1, 0.01).name('밀집 집중도').onChange((v: number) => {
  const yd = YEAR_DATA[scene.getCurrentYearIndex()];
  yd.density.concentration = v;
  scene.rebuildCurrentYear();
});

const poleYCtrl = yearFolder.add(yearEdit, 'poleY', -1, 1, 0.01).name('밀집 극점 Y').onChange((v: number) => {
  const yd = YEAR_DATA[scene.getCurrentYearIndex()];
  yd.density.poleY = v;
  scene.rebuildCurrentYear();
});

const poleAngleCtrl = yearFolder.add(yearEdit, 'poleAngle', 0, 360, 1).name('밀집 극점 각도').onChange((v: number) => {
  const yd = YEAR_DATA[scene.getCurrentYearIndex()];
  yd.density.poleAngle = v;
  scene.rebuildCurrentYear();
});

// Save button for current year
yearFolder.add({ save() {
  const yd = YEAR_DATA[scene.getCurrentYearIndex()];
  saveYearPrefs(yd.year, {
    scatter: yd.scatter,
    particleCount: yd.particleCount,
    density: { ...yd.density },
  });
  console.log(`[Saved] ${yd.year}:`, { scatter: yd.scatter, particleCount: yd.particleCount, density: yd.density });
}}, 'save').name('이 연도 저장');

// --- Global settings ---
const globalFolder = gui.addFolder('Global (전체 설정)');
globalFolder.add(scene, 'baseRadius', 0.5, 5, 0.1).name('구 크기').onChange(() => {
  scene.rebuildCurrentYear();
});
globalFolder.add(scene.params, 'rotationSpeed', 0, 3, 0.01).name('회전 속도');
globalFolder.add(scene.params, 'particleSize', 0.01, 0.2, 0.005).name('파티클 크기');
globalFolder.add(scene.params, 'breathingAmp', 0, 0.02, 0.001).name('떨림 진폭');
globalFolder.add(scene.params, 'breathingSpeed', 0, 5, 0.1).name('떨림 속도');
globalFolder.add(scene.params, 'convergenceSpeed', 0.5, 10, 0.1).name('수렴 속도');

// --- Export ---
const exportFolder = gui.addFolder('Export');
exportFolder.add({ exportJSON() {
  const json = exportAllPrefs();
  console.log(json);
  navigator.clipboard.writeText(json).then(() => {
    console.log('모든 연도 설정이 클립보드에 복사됨');
  });
}}, 'exportJSON').name('전체 JSON 내보내기');

exportFolder.add({ clearAll() {
  if (confirm('저장된 모든 프리퍼런스를 삭제하시겠습니까?')) {
    localStorage.removeItem('chronography-year-prefs');
    location.reload();
  }
}}, 'clearAll').name('저장 초기화');

// ===== Sync UI when year changes =====
function loadYearToPanel(index: number): void {
  const yd = YEAR_DATA[index];
  yearEdit.year = yd.year;
  yearEdit.scatter = yd.scatter;
  yearEdit.particleCount = yd.particleCount;
  yearEdit.concentration = yd.density.concentration;
  yearEdit.poleY = yd.density.poleY;
  yearEdit.poleAngle = yd.density.poleAngle;

  // lil-gui 컨트롤러 갱신
  yearSelectCtrl.updateDisplay();
  scatterCtrl.updateDisplay();
  countCtrl.updateDisplay();
  concCtrl.updateDisplay();
  poleYCtrl.updateDisplay();
  poleAngleCtrl.updateDisplay();
}

function updateUI(index: number): void {
  const yd = YEAR_DATA[index];

  yearDisplay.textContent = String(yd.year);
  yearDisplay.style.color = yd.color;

  const buttons = yearNav.querySelectorAll('.year-btn');
  buttons.forEach((btn, i) => {
    btn.classList.toggle('active', i === index);
  });

  infoPanel.innerHTML = [
    `particles: ${yd.particleCount.toLocaleString()}`,
    `scatter: ${yd.scatter.toFixed(2)}`,
    yd.description ? yd.description : '',
  ].filter(Boolean).join('<br>');

  // Sync debug panel
  loadYearToPanel(index);
}

function goToYear(index: number): void {
  if (index < 0 || index >= YEAR_DATA.length) return;
  scene.setYear(index);
  updateUI(index);
}

// Arrow navigation
prevBtn.addEventListener('click', () => {
  const next = scene.getCurrentYearIndex() - 1;
  if (next >= 0) goToYear(next);
});
nextBtn.addEventListener('click', () => {
  const next = scene.getCurrentYearIndex() + 1;
  if (next < YEAR_DATA.length) goToYear(next);
});

// Keyboard
window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    e.preventDefault();
    const next = scene.getCurrentYearIndex() - 1;
    if (next >= 0) goToYear(next);
  } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    e.preventDefault();
    const next = scene.getCurrentYearIndex() + 1;
    if (next < YEAR_DATA.length) goToYear(next);
  }
});

// Touch swipe
let touchStartX = 0;
window.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; });
window.addEventListener('touchend', (e) => {
  const dx = e.changedTouches[0].clientX - touchStartX;
  if (Math.abs(dx) > 50) {
    const dir = dx < 0 ? 1 : -1;
    const next = scene.getCurrentYearIndex() + dir;
    if (next >= 0 && next < YEAR_DATA.length) goToYear(next);
  }
});

// Mouse wheel
let wheelAccumulator = 0;
window.addEventListener('wheel', (e) => {
  if ((e.target as HTMLElement).closest('.lil-gui')) return;
  e.preventDefault();
  wheelAccumulator += e.deltaY;
  if (Math.abs(wheelAccumulator) > 80) {
    const dir = wheelAccumulator > 0 ? 1 : -1;
    const next = scene.getCurrentYearIndex() + dir;
    if (next >= 0 && next < YEAR_DATA.length) goToYear(next);
    wheelAccumulator = 0;
  }
}, { passive: false });

// Init
updateUI(0);
