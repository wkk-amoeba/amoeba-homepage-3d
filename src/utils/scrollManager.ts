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
  private progress = 0;
  private listeners: ScrollListener[] = [];
  private contentElement: HTMLElement | null = null;
  private introComplete = !introConfig.enabled;
  private introTextOpacity = 0;

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
  }

  private handleScroll() {
    if (!this.contentElement) return;
    const scrollHeight = this.contentElement.scrollHeight - window.innerHeight;
    if (scrollHeight <= 0) return;
    this.progress = Math.min(1, Math.max(0, window.scrollY / scrollHeight));
  }

  /** 매 프레임 호출 — listeners에 progress 전달 + UI 업데이트 */
  tick() {
    this.listeners.forEach(fn => fn(this.progress));
    this.updateUI();
  }

  private updateUI() {
    const scrollBar = document.getElementById('scroll-bar');
    const scrollPercent = document.getElementById('scroll-percent');

    if (scrollBar) {
      scrollBar.style.height = `${this.progress * 100}%`;
    }
    if (scrollPercent) {
      scrollPercent.textContent = `${Math.round(this.progress * 100)}%`;
    }

    // Update shape section text with fade in/out
    const sections = document.querySelectorAll('.shape-section');
    const fadeInRatio = 0.15;
    const fadeOutRatio = 0.15;

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
        const boundary = parseFloat(subBoundary);
        const crossFadeWidth = 0.08;

        contents.forEach(content => {
          const subIdx = parseInt(content.getAttribute('data-sub') || '0', 10);
          let subOpacity: number;

          if (subIdx === 0) {
            if (local < boundary - crossFadeWidth) {
              subOpacity = 1;
            } else if (local < boundary + crossFadeWidth) {
              subOpacity = 1 - (local - (boundary - crossFadeWidth)) / (2 * crossFadeWidth);
            } else {
              subOpacity = 0;
            }
          } else {
            if (local < boundary - crossFadeWidth) {
              subOpacity = 0;
            } else if (local < boundary + crossFadeWidth) {
              subOpacity = (local - (boundary - crossFadeWidth)) / (2 * crossFadeWidth);
            } else {
              subOpacity = 1;
            }
          }

          if (index > 0 && local < fadeInRatio) {
            subOpacity *= local / fadeInRatio;
          } else if (index < sections.length - 1 && local > 1 - fadeOutRatio) {
            subOpacity *= 1 - (local - (1 - fadeOutRatio)) / fadeOutRatio;
          }

          if (index === 0) {
            subOpacity *= this.introTextOpacity;
          }

          content.style.opacity = String(subOpacity);
        });
      } else {
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
