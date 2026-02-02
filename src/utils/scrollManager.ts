export type ScrollListener = (progress: number) => void;

class ScrollManager {
  private progress = 0;
  private listeners: ScrollListener[] = [];
  private contentElement: HTMLElement | null = null;

  constructor() {
    this.handleScroll = this.handleScroll.bind(this);
  }

  init(contentSelector = '#content') {
    this.contentElement = document.querySelector(contentSelector);
    window.addEventListener('scroll', this.handleScroll, { passive: true });
    this.handleScroll();
  }

  private handleScroll() {
    if (!this.contentElement) return;
    const scrollHeight = this.contentElement.scrollHeight - window.innerHeight;
    this.progress = Math.min(1, Math.max(0, window.scrollY / scrollHeight));
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

    // Update shape section visibility
    const currentSection = this.getCurrentSection();
    const sections = document.querySelectorAll('.shape-section');
    sections.forEach((section, index) => {
      const content = section.querySelector('.shape-content');
      if (content) {
        if (index === currentSection) {
          content.classList.add('visible');
        } else {
          content.classList.remove('visible');
        }
      }
    });
  }

  getCurrentSection(): number {
    if (this.progress < 0.2) return -1;
    const sectionProgress = (this.progress - 0.2) / 0.8;
    return Math.min(4, Math.floor(sectionProgress * 5));
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
