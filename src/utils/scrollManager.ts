import { scrollConfig, introConfig, models } from '../config/sceneConfig';

export type ScrollListener = (progress: number) => void;

// Precompute section bounds from model spans
function computeSectionBounds(): { start: number; end: number }[] {
  const { sectionStart, sectionGap } = scrollConfig;
  const bounds: { start: number; end: number }[] = [];
  let offset = sectionStart;
  for (const m of models) {
    const span = m.sectionSpan ?? 1;
    const start = offset;
    const end = offset + span * sectionGap;
    bounds.push({ start, end });
    offset = end;
  }
  return bounds;
}

const sectionBoundsCache = computeSectionBounds();

class ScrollManager {
  private targetProgress = 0;  // 스크롤 이벤트의 즉시값
  private progress = 0;        // 스무딩된 현재값 (렌더링에 사용)
  private smoothing = 0.05;    // lerp 속도 (0=정지, 1=즉시)
  private listeners: ScrollListener[] = [];
  private contentElement: HTMLElement | null = null;
  private introComplete = !introConfig.enabled; // 인트로 비활성이면 즉시 완료
  private introTextOpacity = 0; // 인트로 후 첫 섹션 텍스트 페이드인 진행

  constructor() {
    this.handleScroll = this.handleScroll.bind(this);
    window.addEventListener('intro-complete', () => {
      this.introComplete = true;
    });
  }

  init(contentSelector = '#content') {
    this.contentElement = document.querySelector(contentSelector);
    window.addEventListener('scroll', this.handleScroll, { passive: true });
    this.handleScroll();
    // 초기 위치는 즉시 동기화
    this.progress = this.targetProgress;
  }

  private handleScroll() {
    if (!this.contentElement) return;
    const scrollHeight = this.contentElement.scrollHeight - window.innerHeight;
    this.targetProgress = Math.min(1, Math.max(0, window.scrollY / scrollHeight));
  }

  /** 매 프레임 호출 — progress를 target으로 부드럽게 보간 */
  tick() {
    const diff = this.targetProgress - this.progress;
    if (Math.abs(diff) < 0.0001) {
      this.progress = this.targetProgress;
    } else {
      this.progress += diff * this.smoothing;
    }
    this.listeners.forEach(fn => fn(this.progress));
    this.updateUI();
  }

  private updateUI() {
    // Update scroll indicator
    const scrollBar = document.getElementById('scroll-bar');
    const scrollPercent = document.getElementById('scroll-percent');

    if (scrollBar) {
      scrollBar.style.height = `${this.progress * 100}%`;
    }
    if (scrollPercent) {
      scrollPercent.textContent = `${Math.round(this.progress * 100)}%`;
    }

    // Update shape section text with fade in/out (fixed position, no movement)
    const sections = document.querySelectorAll('.shape-section');
    const fadeInRatio = 0.15;
    const fadeOutRatio = 0.15;

    // Smoothly fade in the intro text opacity after intro completes
    if (this.introComplete && this.introTextOpacity < 1) {
      this.introTextOpacity = Math.min(1, this.introTextOpacity + 0.02);
    }

    sections.forEach((section, index) => {
      const contents = section.querySelectorAll('.shape-content') as NodeListOf<HTMLElement>;
      if (!contents.length) return;

      const bounds = sectionBoundsCache[index];
      if (!bounds) {
        contents.forEach(c => c.style.opacity = '0');
        return;
      }

      const start = bounds.start;
      const end = bounds.end;
      const duration = end - start;

      if (this.progress < start || this.progress > end) {
        contents.forEach(c => c.style.opacity = '0');
        return;
      }

      const local = (this.progress - start) / duration;
      const subBoundary = section.getAttribute('data-sub-boundary');

      if (subBoundary && contents.length > 1) {
        // Sub-section mode: crossfade between sub-contents at the boundary point
        const boundary = parseFloat(subBoundary);
        const crossFadeWidth = 0.08; // 8% of local progress for crossfade

        contents.forEach(content => {
          const subIdx = parseInt(content.getAttribute('data-sub') || '0', 10);
          let subOpacity: number;

          if (subIdx === 0) {
            // First sub: visible before boundary, fades out at boundary
            if (local < boundary - crossFadeWidth) {
              subOpacity = 1;
            } else if (local < boundary + crossFadeWidth) {
              subOpacity = 1 - (local - (boundary - crossFadeWidth)) / (2 * crossFadeWidth);
            } else {
              subOpacity = 0;
            }
          } else {
            // Second sub: fades in at boundary, visible after
            if (local < boundary - crossFadeWidth) {
              subOpacity = 0;
            } else if (local < boundary + crossFadeWidth) {
              subOpacity = (local - (boundary - crossFadeWidth)) / (2 * crossFadeWidth);
            } else {
              subOpacity = 1;
            }
          }

          // Apply section-level fade in/out
          if (index > 0 && local < fadeInRatio) {
            subOpacity *= local / fadeInRatio;
          } else if (index < sections.length - 1 && local > 1 - fadeOutRatio) {
            subOpacity *= 1 - (local - (1 - fadeOutRatio)) / fadeOutRatio;
          }

          // First section: gate by intro completion
          if (index === 0) {
            subOpacity *= this.introTextOpacity;
          }

          content.style.opacity = String(subOpacity);
        });
      } else {
        // Single content mode (original behavior)
        const content = contents[0];
        let opacity = 1;

        if (index > 0 && local < fadeInRatio) {
          opacity = local / fadeInRatio;
        } else if (index < sections.length - 1 && local > 1 - fadeOutRatio) {
          opacity = 1 - (local - (1 - fadeOutRatio)) / fadeOutRatio;
        }

        if (index === 0) {
          opacity *= this.introTextOpacity;
        }

        content.style.opacity = String(opacity);
      }
    });
  }

  getCurrentSection(): number {
    // 인트로 구간이면 -1 반환
    const firstStart = sectionBoundsCache[0]?.start ?? 0;
    if (this.progress < firstStart) return -1;

    for (let i = 0; i < sectionBoundsCache.length; i++) {
      const { start, end } = sectionBoundsCache[i];
      if (this.progress >= start && this.progress <= end) {
        return i;
      }
    }

    return -1;
  }

  getProgress(): number {
    return this.progress;
  }

  subscribe(listener: ScrollListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(fn => fn !== listener);
    };
  }

  destroy() {
    window.removeEventListener('scroll', this.handleScroll);
    this.listeners = [];
  }
}

export const scrollManager = new ScrollManager();
