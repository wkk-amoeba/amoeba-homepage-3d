/**
 * scroll.js - 스크롤 애니메이션 및 UI 로직
 * 원본: page.tsx의 스크롤 관련 코드
 */

const ScrollController = {
  scrollProgress: 0,
  currentSection: -1,

  /**
   * 초기화
   */
  init: function() {
    this.bindEvents();
    this.updateScrollProgress();
  },

  /**
   * 이벤트 바인딩
   */
  bindEvents: function() {
    window.addEventListener('scroll', this.onScroll.bind(this), { passive: true });
    window.addEventListener('resize', this.onScroll.bind(this), { passive: true });
  },

  /**
   * 스크롤 이벤트 핸들러
   */
  onScroll: function() {
    this.updateScrollProgress();
    this.updateUI();
    this.updateSections();

    // Scene3D에 스크롤 진행도 전달
    if (typeof Scene3D !== 'undefined') {
      Scene3D.setScrollProgress(this.scrollProgress);
    }
  },

  /**
   * 스크롤 진행도 계산
   */
  updateScrollProgress: function() {
    const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
    this.scrollProgress = Math.min(1, Math.max(0, window.scrollY / scrollHeight));
  },

  /**
   * UI 업데이트 (스크롤 인디케이터)
   */
  updateUI: function() {
    // 스크롤 바 채우기
    const scrollFill = document.getElementById('scroll-fill');
    if (scrollFill) {
      scrollFill.style.height = (this.scrollProgress * 100) + '%';
    }

    // 퍼센트 표시
    const scrollPercent = document.getElementById('scroll-percent');
    if (scrollPercent) {
      scrollPercent.textContent = Math.round(this.scrollProgress * 100) + '%';
    }
  },

  /**
   * 현재 섹션 계산
   */
  getCurrentSection: function() {
    if (this.scrollProgress < 0.15) return -1; // 인트로/스캐터
    const sectionProgress = (this.scrollProgress - 0.15) / 0.85;
    return Math.min(5, Math.floor(sectionProgress * 6));
  },

  /**
   * 섹션 표시/숨김 업데이트
   */
  updateSections: function() {
    const newSection = this.getCurrentSection();

    if (newSection !== this.currentSection) {
      this.currentSection = newSection;

      // 모든 도형 섹션의 텍스트 표시 업데이트
      const shapeSections = document.querySelectorAll('.section-shape');
      shapeSections.forEach((section, index) => {
        const info = section.querySelector('.shape-info');
        if (info) {
          if (index === this.currentSection) {
            info.classList.add('visible');
          } else {
            info.classList.remove('visible');
          }
        }
      });
    }
  }
};

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', function() {
  ScrollController.init();
});
