/**
 * 연도별 데이터 정의
 * - color: 테마 색상
 * - particleCount: 파티클 수 (활동량)
 * - scatter: 구 표면에서 흩어지는 정도 (0=밀착, 1=완전히 흩어짐)
 * - density: 밀집 분포 (concentration, poleY, poleAngle)
 */
export interface YearDensity {
  concentration: number;
  poleY: number;
  poleAngle: number;
}

export interface YearData {
  year: number;
  color: string;
  particleCount: number;
  scatter: number;
  density: YearDensity;
  description: string;
}

const defaultDensity: YearDensity = { concentration: 0, poleY: 0, poleAngle: 0 };

export const YEAR_DATA: YearData[] = [
  { year: 1998, color: '#D1D3D4', particleCount: 300,  scatter: 0.95, density: { ...defaultDensity }, description: '창립' },
  { year: 1999, color: '#58595B', particleCount: 350,  scatter: 0.90, density: { ...defaultDensity }, description: '' },
  { year: 2000, color: '#9B8579', particleCount: 450,  scatter: 0.85, density: { ...defaultDensity }, description: '' },
  { year: 2001, color: '#F15A28', particleCount: 550,  scatter: 0.80, density: { ...defaultDensity }, description: '' },
  { year: 2002, color: '#EC008C', particleCount: 650,  scatter: 0.75, density: { ...defaultDensity }, description: '' },
  { year: 2003, color: '#2E3092', particleCount: 800,  scatter: 0.70, density: { ...defaultDensity }, description: '' },
  { year: 2004, color: '#00AEEF', particleCount: 1000, scatter: 0.65, density: { ...defaultDensity }, description: '' },
  { year: 2005, color: '#00A650', particleCount: 1100, scatter: 0.60, density: { ...defaultDensity }, description: '' },
  { year: 2006, color: '#FFF200', particleCount: 1300, scatter: 0.55, density: { ...defaultDensity }, description: '' },
  { year: 2007, color: '#ED1B23', particleCount: 1500, scatter: 0.50, density: { ...defaultDensity }, description: '' },
  { year: 2008, color: '#5B6670', particleCount: 1700, scatter: 0.45, density: { ...defaultDensity }, description: '' },
  { year: 2009, color: '#1226AA', particleCount: 1900, scatter: 0.40, density: { ...defaultDensity }, description: '' },
  { year: 2010, color: '#8C9091', particleCount: 2200, scatter: 0.35, density: { ...defaultDensity }, description: '' },
  { year: 2011, color: '#85754E', particleCount: 2400, scatter: 0.32, density: { ...defaultDensity }, description: '' },
  { year: 2012, color: '#FF40B4', particleCount: 2700, scatter: 0.28, density: { ...defaultDensity }, description: '' },
  { year: 2013, color: '#FFAB4D', particleCount: 3000, scatter: 0.24, density: { ...defaultDensity }, description: '' },
  { year: 2014, color: '#38D430', particleCount: 3300, scatter: 0.20, density: { ...defaultDensity }, description: '' },
  { year: 2015, color: '#0097CE', particleCount: 3600, scatter: 0.17, density: { ...defaultDensity }, description: '' },
  { year: 2016, color: '#99E6D8', particleCount: 4000, scatter: 0.14, density: { ...defaultDensity }, description: '' },
  { year: 2017, color: '#C19ADE', particleCount: 4300, scatter: 0.12, density: { ...defaultDensity }, description: '' },
  { year: 2018, color: '#C19ADE', particleCount: 4600, scatter: 0.10, density: { ...defaultDensity }, description: '' },
  { year: 2019, color: '#C19ADE', particleCount: 5000, scatter: 0.08, density: { ...defaultDensity }, description: '' },
  { year: 2020, color: '#F3B2DB', particleCount: 5400, scatter: 0.06, density: { ...defaultDensity }, description: '' },
  { year: 2021, color: '#F3EFA1', particleCount: 5800, scatter: 0.05, density: { ...defaultDensity }, description: '' },
  { year: 2022, color: '#FFAB4D', particleCount: 6200, scatter: 0.04, density: { ...defaultDensity }, description: '' },
  { year: 2023, color: '#F5333F', particleCount: 6500, scatter: 0.03, density: { ...defaultDensity }, description: '' },
  { year: 2024, color: '#FFFFFF', particleCount: 7000, scatter: 0.02, density: { ...defaultDensity }, description: '' },
];

export const MAX_PARTICLES = 7000;

/** localStorage 키 */
const STORAGE_KEY = 'chronography-year-prefs';

/** 연도별 저장 가능한 프리퍼런스 */
export interface YearPrefs {
  scatter: number;
  particleCount: number;
  density: YearDensity;
}

/** localStorage에서 모든 연도 프리퍼런스 로드 */
export function loadAllPrefs(): Record<number, YearPrefs> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** 특정 연도 프리퍼런스 저장 */
export function saveYearPrefs(year: number, prefs: YearPrefs): void {
  const all = loadAllPrefs();
  all[year] = prefs;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

/** localStorage 프리퍼런스를 YEAR_DATA에 적용 */
export function applyStoredPrefs(): void {
  const all = loadAllPrefs();
  for (const yd of YEAR_DATA) {
    const p = all[yd.year];
    if (p) {
      yd.scatter = p.scatter;
      yd.particleCount = p.particleCount;
      yd.density = { ...p.density };
    }
  }
}

/** 모든 저장된 프리퍼런스를 JSON 문자열로 내보내기 */
export function exportAllPrefs(): string {
  const result: Record<number, YearPrefs> = {};
  for (const yd of YEAR_DATA) {
    result[yd.year] = {
      scatter: yd.scatter,
      particleCount: yd.particleCount,
      density: { ...yd.density },
    };
  }
  return JSON.stringify(result, null, 2);
}
