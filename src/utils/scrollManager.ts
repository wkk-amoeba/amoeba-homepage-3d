import { scrollConfig, introConfig } from '../config/sceneConfig';

export type ScrollListener = (progress: number) => void;

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
      const content = section.querySelector('.shape-content') as HTMLElement;
      if (!content) return;

      const start = scrollConfig.sectionStart + index * scrollConfig.sectionGap;
      const end = start + scrollConfig.sectionDuration;

      if (this.progress < start || this.progress > end) {
        content.style.opacity = '0';
        return;
      }

      const local = (this.progress - start) / scrollConfig.sectionDuration;
      let opacity = 1;

      // Fade in (skip for first section — controlled by intro)
      if (index > 0 && local < fadeInRatio) {
        opacity = local / fadeInRatio;
      }
      // Fade out (skip for last section — stay visible)
      else if (index < sections.length - 1 && local > 1 - fadeOutRatio) {
        opacity = 1 - (local - (1 - fadeOutRatio)) / fadeOutRatio;
      }

      // First section: gate by intro completion fade-in
      if (index === 0) {
        opacity *= this.introTextOpacity;
      }

      content.style.opacity = String(opacity);
    });
  }

  getCurrentSection(): number {
    const { sectionStart, sectionGap, sectionDuration, modelCount } = scrollConfig;

    // 인트로 구간이면 -1 반환
    if (this.progress < sectionStart) return -1;

    // 각 섹션의 중간 지점을 기준으로 현재 섹션 계산
    for (let i = 0; i < modelCount; i++) {
      const start = sectionStart + i * sectionGap;
      const end = start + sectionDuration;

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
