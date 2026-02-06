// Quick Test Script for Style Extractor
// 在浏览器 Console 中运行此脚本测试新模块
//
// 使用方法:
// 1. 打开目标网站
// 2. 打开开发者工具 (F12)
// 3. 粘贴此脚本到 Console 运行

(async () => {
  console.log('=== Style Extractor Quick Test ===\n');

  // 加载脚本的辅助函数
  async function loadScript(url) {
    const response = await fetch(url);
    const code = await response.text();
    eval(code);
  }

  // 由于是本地测试，直接内联简化版测试代码

  // ========== 测试 1: AI 语义分析 ==========
  console.log('1. Testing AI Semantic Analysis...');

  const pageAnalysis = (() => {
    const url = location.href.toLowerCase();
    let pageType = 'general-page';

    if (url.includes('/pricing')) pageType = 'pricing-page';
    else if (url.includes('/blog')) pageType = 'blog-page';
    else if (url.includes('/docs')) pageType = 'documentation';
    else {
      const hasHero = !!document.querySelector('.hero, [class*="hero"], .banner');
      const hasFeatures = !!document.querySelector('[class*="feature"], .features');
      if (hasHero || hasFeatures) pageType = 'landing-page';
    }

    const sections = [];
    const sectionPatterns = [
      { name: 'hero', selectors: ['.hero', '[class*="hero"]'] },
      { name: 'navigation', selectors: ['nav', '[role="navigation"]'] },
      { name: 'features', selectors: ['[class*="feature"]', '.features'] },
      { name: 'footer', selectors: ['footer', '[role="contentinfo"]'] }
    ];

    for (const pattern of sectionPatterns) {
      for (const selector of pattern.selectors) {
        try {
          if (document.querySelector(selector)) {
            if (!sections.includes(pattern.name)) sections.push(pattern.name);
            break;
          }
        } catch (e) {}
      }
    }

    const bg = getComputedStyle(document.body).backgroundColor;
    const colorScheme = bg.includes('255') || bg.includes('fff') ? 'light' : 'dark';

    return { pageType, sections, colorScheme };
  })();

  console.log('  Page Type:', pageAnalysis.pageType);
  console.log('  Sections:', pageAnalysis.sections.join(', '));
  console.log('  Color Scheme:', pageAnalysis.colorScheme);
  console.log('');

  // ========== 测试 2: 组件检测 ==========
  console.log('2. Testing Component Detection...');

  const components = (() => {
    const results = { button: 0, card: 0, input: 0, link: 0, nav: 0 };

    results.button = document.querySelectorAll('button, [role="button"], .btn, [class*="button"]').length;
    results.card = document.querySelectorAll('.card, [class*="card"], article').length;
    results.input = document.querySelectorAll('input:not([type="hidden"]), textarea, select').length;
    results.link = document.querySelectorAll('a[href]').length;
    results.nav = document.querySelectorAll('nav, [role="navigation"]').length;

    return results;
  })();

  console.log('  Buttons:', components.button);
  console.log('  Cards:', components.card);
  console.log('  Inputs:', components.input);
  console.log('  Links:', components.link);
  console.log('  Navigation:', components.nav);
  console.log('');

  // ========== 测试 3: 布局分析 ==========
  console.log('3. Testing Layout Analysis...');

  const layouts = (() => {
    let gridCount = 0;
    let flexCount = 0;

    document.querySelectorAll('*').forEach(el => {
      const display = getComputedStyle(el).display;
      if (display === 'grid' || display === 'inline-grid') gridCount++;
      if (display === 'flex' || display === 'inline-flex') flexCount++;
    });

    return { gridCount, flexCount };
  })();

  console.log('  Grid Layouts:', layouts.gridCount);
  console.log('  Flex Layouts:', layouts.flexCount);
  console.log('');

  // ========== 测试 4: 动画检测 ==========
  console.log('4. Testing Animation Detection...');

  const animations = (() => {
    const anims = document.getAnimations({ subtree: true });
    const transitions = [];

    document.querySelectorAll('*').forEach(el => {
      const t = getComputedStyle(el).transition;
      if (t && t !== 'none' && t !== 'all 0s ease 0s') {
        transitions.push(el.tagName.toLowerCase());
      }
    });

    return {
      animationCount: anims.length,
      transitionCount: transitions.length,
      animationNames: [...new Set(anims.map(a => a.animationName).filter(Boolean))]
    };
  })();

  console.log('  Active Animations:', animations.animationCount);
  console.log('  Elements with Transitions:', animations.transitionCount);
  if (animations.animationNames.length > 0) {
    console.log('  Animation Names:', animations.animationNames.join(', '));
  }
  console.log('');

  // ========== 测试 5: 无障碍分析 ==========
  console.log('5. Testing Accessibility Analysis...');

  const a11y = (() => {
    const landmarks = document.querySelectorAll('[role="banner"], [role="navigation"], [role="main"], [role="contentinfo"], header, nav, main, footer').length;
    const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6').length;
    const imagesWithoutAlt = document.querySelectorAll('img:not([alt])').length;
    const buttonsWithoutName = Array.from(document.querySelectorAll('button')).filter(b => !b.innerText?.trim() && !b.getAttribute('aria-label')).length;

    return { landmarks, headings, imagesWithoutAlt, buttonsWithoutName };
  })();

  console.log('  Landmarks:', a11y.landmarks);
  console.log('  Headings:', a11y.headings);
  console.log('  Images without alt:', a11y.imagesWithoutAlt);
  console.log('  Buttons without name:', a11y.buttonsWithoutName);
  console.log('');

  // ========== 测试 6: 设计系统提取 ==========
  console.log('6. Testing Design System Extraction...');

  const designSystem = (() => {
    const colors = new Set();
    const fonts = new Set();
    const fontSizes = new Set();

    document.querySelectorAll('*').forEach(el => {
      const s = getComputedStyle(el);
      if (s.color) colors.add(s.color);
      if (s.backgroundColor && s.backgroundColor !== 'rgba(0, 0, 0, 0)') colors.add(s.backgroundColor);
      if (s.fontFamily) fonts.add(s.fontFamily.split(',')[0].trim().replace(/['"]/g, ''));
      if (s.fontSize) fontSizes.add(s.fontSize);
    });

    return {
      colorCount: colors.size,
      fontFamilies: [...fonts].slice(0, 5),
      fontSizeCount: fontSizes.size
    };
  })();

  console.log('  Unique Colors:', designSystem.colorCount);
  console.log('  Font Families:', designSystem.fontFamilies.join(', '));
  console.log('  Font Sizes:', designSystem.fontSizeCount);
  console.log('');

  // ========== 测试 7: 响应式断点 ==========
  console.log('7. Testing Responsive Breakpoints...');

  const responsive = (() => {
    const breakpoints = new Set();

    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule.type === CSSRule.MEDIA_RULE) {
            const media = rule.conditionText || rule.media?.mediaText;
            if (media) {
              const match = media.match(/(\d+)px/);
              if (match) breakpoints.add(parseInt(match[1]));
            }
          }
        }
      } catch (e) {}
    }

    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      breakpoints: [...breakpoints].sort((a, b) => a - b)
    };
  })();

  console.log('  Current Viewport:', `${responsive.viewport.width}x${responsive.viewport.height}`);
  console.log('  Detected Breakpoints:', responsive.breakpoints.join('px, ') + 'px');
  console.log('');

  console.log('=== Test Complete ===');

  return {
    pageAnalysis,
    components,
    layouts,
    animations,
    a11y,
    designSystem,
    responsive
  };
})();
