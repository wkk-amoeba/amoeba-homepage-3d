import { scrollConfig, introConfig, models, snapConfig } from '../config/sceneConfig';

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
  private targetProgress = 0;  // 스크롤 이벤트의 즉시값 (snap 시 애니메이션 대상)
  private progress = 0;        // 스무딩된 현재값 (렌더링에 사용)
  private smoothing = 0.05;    // lerp 속도 (0=정지, 1=즉시)
  private listeners: ScrollListener[] = [];
  private contentElement: HTMLElement | null = null;
  private introComplete = !introConfig.enabled; // 인트로 비활성이면 즉시 완료
  private introTextOpacity = 0; // 인트로 후 첫 섹션 텍스트 페이드인 진행

  // --- Snap state ---
  private snapEnabled = false;
  private snapPoints: number[] = [];
  private currentSnapIndex = 0;
  private isSnapping = false;
  private snapStartTime = 0;
  private snapStartProgress = 0;
  private snapEndProgress = 0;
  private snapDuration = 1.2;

  // Wheel accumulation
  private wheelAccum = 0;
  private wheelCooldown = 0;

  // Touch tracking
  private touchStartY = 0;
  private touchStartTime = 0;

  constructor() {
    this.handleWheel = this.handleWheel.bind(this);
    this.handleTouchStart = this.handleTouchStart.bind(this);
    this.handleTouchMove = this.handleTouchMove.bind(this);
    this.handleTouchEnd = this.handleTouchEnd.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleNativeScroll = this.handleNativeScroll.bind(this);

    window.addEventListener('intro-complete', () => {
      this.introComplete = true;
      if (snapConfig.enabled) {
        this.activateSnap();
      }
    });

    // If intro is disabled and snap is enabled, activate snap immediately after init
    if (!introConfig.enabled && snapConfig.enabled) {
      // Will be called in init() after content element is set
    }
  }

  init(contentSelector = '#content') {
    this.contentElement = document.querySelector(contentSelector);

    // Wheel interception (non-passive to allow preventDefault when snap active)
    window.addEventListener('wheel', this.handleWheel, { passive: false });

    // Touch interception
    window.addEventListener('touchstart', this.handleTouchStart, { passive: true });
    window.addEventListener('touchmove', this.handleTouchMove, { passive: false });
    window.addEventListener('touchend', this.handleTouchEnd, { passive: true });

    // Keyboard
    window.addEventListener('keydown', this.handleKeyDown);

    // Native scroll fallback (for intro period before snap activates)
    window.addEventListener('scroll', this.handleNativeScroll, { passive: true });

    this.handleNativeScroll();
    // 초기 위치는 즉시 동기화
    this.progress = this.targetProgress;

    // If intro disabled, activate snap immediately
    if (!introConfig.enabled && snapConfig.enabled) {
      this.activateSnap();
    }
  }

  // Native scroll handler — only used before snap activates
  private handleNativeScroll() {
    if (this.snapEnabled) return; // snap이 활성화되면 native scroll 무시
    if (!this.contentElement) return;
    const scrollHeight = this.contentElement.scrollHeight - window.innerHeight;
    this.targetProgress = Math.min(1, Math.max(0, window.scrollY / scrollHeight));
  }

  // --- Wheel handler with threshold accumulation ---
  private handleWheel(e: WheelEvent) {
    if (!this.snapEnabled) {
      // Snap 비활성 (인트로 중) — native scroll 허용
      return;
    }

    e.preventDefault(); // Native scroll 차단

    if (this.isSnapping || this.wheelCooldown > 0) return;

    this.wheelAccum += e.deltaY;

    if (Math.abs(this.wheelAccum) >= snapConfig.wheelThreshold) {
      const direction = this.wheelAccum > 0 ? 1 : -1;
      this.wheelAccum = 0;
      this.snapTo(this.currentSnapIndex + direction);
    }
  }

  // --- Touch handlers ---
  private handleTouchStart(e: TouchEvent) {
    this.touchStartY = e.touches[0].clientY;
    this.touchStartTime = performance.now();
  }

  private handleTouchMove(e: TouchEvent) {
    if (this.snapEnabled) e.preventDefault(); // Native scroll 차단
  }

  private handleTouchEnd(e: TouchEvent) {
    if (!this.snapEnabled || this.isSnapping) return;

    const dy = this.touchStartY - e.changedTouches[0].clientY; // 양수 = 위로 스와이프 (다음 씬)
    const dt = performance.now() - this.touchStartTime;
    const velocity = dt > 0 ? Math.abs(dy / dt) : 0; // px/ms

    // 충분한 거리 또는 속도면 트리거
    if (Math.abs(dy) > snapConfig.touchThreshold || velocity > 0.5) {
      const direction = dy > 0 ? 1 : -1;
      this.snapTo(this.currentSnapIndex + direction);
    }
  }

  // --- Keyboard handler ---
  private handleKeyDown(e: KeyboardEvent) {
    if (!this.snapEnabled || this.isSnapping) return;

    if (e.key === 'ArrowDown' || e.key === ' ' || e.key === 'PageDown') {
      e.preventDefault();
      this.snapTo(this.currentSnapIndex + 1);
    } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
      e.preventDefault();
      this.snapTo(this.currentSnapIndex - 1);
    }
  }

  // --- Snap logic ---
  private snapTo(index: number) {
    const clamped = Math.max(0, Math.min(this.snapPoints.length - 1, index));
    if (clamped === this.currentSnapIndex && !this.isSnapping) return;

    this.currentSnapIndex = clamped;
    this.isSnapping = true;
    this.snapStartTime = performance.now();
    this.snapStartProgress = this.progress; // 현재 스무딩된 위치에서 출발
    this.snapEndProgress = this.snapPoints[clamped];

    // 거리에 비례한 전환 시간 (1.5~2.5초)
    const distance = Math.abs(this.snapEndProgress - this.snapStartProgress);
    this.snapDuration = Math.max(snapConfig.transitionDuration, Math.min(2.5, distance * 12));

    this.wheelAccum = 0;
  }

  private activateSnap() {
    this.snapEnabled = true;
    this.snapPoints = snapConfig.points.map(p => p.progress);

    // 현재 progress에 가장 가까운 snap point 찾기
    let nearest = 0;
    let minDist = Infinity;
    for (let i = 0; i < this.snapPoints.length; i++) {
      const d = Math.abs(this.progress - this.snapPoints[i]);
      if (d < minDist) { minDist = d; nearest = i; }
    }
    this.currentSnapIndex = nearest;

    // Native scroll 차단
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';

    // 가장 가까운 snap point로 즉시 이동
    this.snapTo(nearest);
  }

  private syncScrollPosition() {
    if (!this.contentElement) return;
    const scrollHeight = this.contentElement.scrollHeight - window.innerHeight;
    const targetScrollY = this.targetProgress * scrollHeight;
    window.scrollTo({ top: targetScrollY, behavior: 'instant' as ScrollBehavior });
  }

  private easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  /** 매 프레임 호출 — progress를 target으로 부드럽게 보간 */
  tick() {
    // Snap 애니메이션 구동
    if (this.isSnapping) {
      const elapsed = (performance.now() - this.snapStartTime) / 1000;
      const t = Math.min(1, elapsed / this.snapDuration);
      const eased = this.easeInOutCubic(t);

      this.targetProgress = this.snapStartProgress +
        (this.snapEndProgress - this.snapStartProgress) * eased;

      if (t >= 1) {
        this.isSnapping = false;
        this.targetProgress = this.snapEndProgress;
        this.wheelCooldown = 0.3; // 착지 후 짧은 쿨다운
      }

      this.syncScrollPosition();
    }

    // Lerp smoothing (snap 중에는 빠르게 추적)
    const diff = this.targetProgress - this.progress;
    if (Math.abs(diff) < 0.0001) {
      this.progress = this.targetProgress;
    } else {
      const smoothing = this.isSnapping ? 0.12 : this.smoothing;
      this.progress += diff * smoothing;
    }

    // Cooldown 감소 (~60fps 가정)
    if (this.wheelCooldown > 0) {
      this.wheelCooldown -= 1 / 60;
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
    window.removeEventListener('wheel', this.handleWheel);
    window.removeEventListener('touchstart', this.handleTouchStart);
    window.removeEventListener('touchmove', this.handleTouchMove);
    window.removeEventListener('touchend', this.handleTouchEnd);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('scroll', this.handleNativeScroll);

    // overflow 복원
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';

    this.listeners = [];
  }
}

export const scrollManager = new ScrollManager();
