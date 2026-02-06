// Style Extractor: AI Semantic Module
// Generates AI-friendly semantic output for better understanding and code generation
//
// This module provides:
// 1. Page-level semantic analysis (type, sections, primary actions)
// 2. Component semantic annotation (role, description, code hints)
// 3. Design system extraction (color palette, typography, spacing)
// 4. AI-optimized output format
//
// Usage:
//   window.__seAISemantic.generate(extractedData)
//   window.__seAISemantic.analyzePage()
//   window.__seAISemantic.annotateComponents(components)
//   window.__seAISemantic.extractDesignSystem()

(() => {
  if (window.__seAISemantic?.installed) return;

  const debug = (...args) => {
    if (window.__seDebug) console.log('[style-extractor:ai-semantic]', ...args);
  };

  // ============================================
  // Helper Functions
  // ============================================

  function cssPath(el) {
    if (!el || el.nodeType !== 1) return null;
    if (el.id) return `#${CSS.escape(el.id)}`;
    const parts = [];
    let cur = el;
    let depth = 0;
    while (cur && cur.nodeType === 1 && depth < 5) {
      let part = cur.tagName.toLowerCase();
      if (cur.classList?.length) {
        part += Array.from(cur.classList).slice(0, 2).map(c => `.${CSS.escape(c)}`).join('');
      }
      const parent = cur.parentElement;
      if (parent) {
        const same = Array.from(parent.children).filter(c => c.tagName === cur.tagName);
        if (same.length > 1) part += `:nth-of-type(${same.indexOf(cur) + 1})`;
      }
      parts.unshift(part);
      if (parent?.id) {
        parts.unshift(`#${CSS.escape(parent.id)}`);
        break;
      }
      cur = parent;
      depth++;
    }
    return parts.join(' > ');
  }

  function getRect(el) {
    const r = el.getBoundingClientRect();
    return {
      x: Math.round(r.x),
      y: Math.round(r.y),
      width: Math.round(r.width),
      height: Math.round(r.height)
    };
  }

  function rgbToHex(rgb) {
    if (!rgb || rgb === 'transparent') return null;
    if (rgb.startsWith('#')) return rgb;
    const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!match) return rgb;
    const [, r, g, b] = match;
    return '#' + [r, g, b].map(x => parseInt(x).toString(16).padStart(2, '0')).join('');
  }

  function getLuminance(hex) {
    if (!hex || !hex.startsWith('#')) return 0.5;
    const rgb = parseInt(hex.slice(1), 16);
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = rgb & 0xff;
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  }

  // ============================================
  // Page Analysis
  // ============================================

  function analyzePage() {
    const page = {
      type: inferPageType(),
      sections: detectSections(),
      primaryAction: findPrimaryAction(),
      colorScheme: detectColorScheme(),
      layout: analyzePageLayout(),
      intent: inferPageIntent()
    };

    return page;
  }

  function inferPageType() {
    const url = location.href.toLowerCase();
    const title = document.title.toLowerCase();
    const h1 = document.querySelector('h1')?.textContent?.toLowerCase() || '';

    // Check URL patterns
    if (url.includes('/pricing')) return 'pricing-page';
    if (url.includes('/blog') || url.includes('/post')) return 'blog-page';
    if (url.includes('/docs') || url.includes('/documentation')) return 'documentation';
    if (url.includes('/login') || url.includes('/signin')) return 'login-page';
    if (url.includes('/signup') || url.includes('/register')) return 'signup-page';
    if (url.includes('/contact')) return 'contact-page';
    if (url.includes('/about')) return 'about-page';
    if (url.includes('/product')) return 'product-page';

    // Check content patterns
    const hasHero = !!document.querySelector('.hero, [class*="hero"], .banner, .jumbotron');
    const hasFeatures = !!document.querySelector('[class*="feature"], .features');
    const hasPricing = !!document.querySelector('[class*="pricing"], .pricing');
    const hasTestimonials = !!document.querySelector('[class*="testimonial"], .testimonials');

    if (hasHero && (hasFeatures || hasPricing)) return 'landing-page';
    if (hasPricing) return 'pricing-page';
    if (hasTestimonials) return 'marketing-page';

    // Check for app-like patterns
    const hasSidebar = !!document.querySelector('aside, [class*="sidebar"], [role="complementary"]');
    const hasDataTable = !!document.querySelector('table, [class*="table"], [role="grid"]');
    if (hasSidebar && hasDataTable) return 'dashboard';
    if (hasSidebar) return 'app-page';

    return 'general-page';
  }

  function detectSections() {
    const sections = [];
    const sectionPatterns = [
      { name: 'hero', selectors: ['.hero', '[class*="hero"]', '.banner', '.jumbotron'] },
      { name: 'navigation', selectors: ['nav', '[role="navigation"]', '.navbar'] },
      { name: 'features', selectors: ['[class*="feature"]', '.features', '[class*="benefit"]'] },
      { name: 'pricing', selectors: ['[class*="pricing"]', '.pricing', '[class*="plan"]'] },
      { name: 'testimonials', selectors: ['[class*="testimonial"]', '.testimonials', '[class*="review"]'] },
      { name: 'cta', selectors: ['[class*="cta"]', '.call-to-action'] },
      { name: 'footer', selectors: ['footer', '[role="contentinfo"]', '.footer'] },
      { name: 'sidebar', selectors: ['aside', '[role="complementary"]', '.sidebar'] },
      { name: 'content', selectors: ['main', '[role="main"]', '.main-content'] }
    ];

    for (const pattern of sectionPatterns) {
      for (const selector of pattern.selectors) {
        try {
          if (document.querySelector(selector)) {
            if (!sections.includes(pattern.name)) {
              sections.push(pattern.name);
            }
            break;
          }
        } catch (e) { /* invalid selector */ }
      }
    }

    return sections;
  }

  function findPrimaryAction() {
    // Look for primary CTA buttons
    const ctaSelectors = [
      'a.btn-primary', 'button.btn-primary',
      'a[class*="primary"]', 'button[class*="primary"]',
      '.hero a', '.hero button',
      '[class*="cta"] a', '[class*="cta"] button'
    ];

    for (const selector of ctaSelectors) {
      try {
        const el = document.querySelector(selector);
        if (el) {
          const text = (el.innerText || el.textContent || '').trim().toLowerCase();
          if (text.includes('sign up') || text.includes('signup')) return 'sign-up';
          if (text.includes('get started')) return 'get-started';
          if (text.includes('try') || text.includes('free')) return 'free-trial';
          if (text.includes('buy') || text.includes('purchase')) return 'purchase';
          if (text.includes('download')) return 'download';
          if (text.includes('contact')) return 'contact';
          if (text.includes('learn')) return 'learn-more';
          return text.slice(0, 30) || 'cta';
        }
      } catch (e) { /* invalid selector */ }
    }

    return null;
  }

  function detectColorScheme() {
    const bg = getComputedStyle(document.body).backgroundColor;
    const hex = rgbToHex(bg);
    const luminance = getLuminance(hex);
    return luminance > 0.5 ? 'light' : 'dark';
  }

  function analyzePageLayout() {
    const body = document.body;
    const main = document.querySelector('main, [role="main"], .main-content');

    return {
      hasHeader: !!document.querySelector('header, [role="banner"]'),
      hasFooter: !!document.querySelector('footer, [role="contentinfo"]'),
      hasSidebar: !!document.querySelector('aside, [role="complementary"], .sidebar'),
      hasNavigation: !!document.querySelector('nav, [role="navigation"]'),
      mainWidth: main ? getRect(main).width : null,
      isCentered: main ? getComputedStyle(main).marginLeft === getComputedStyle(main).marginRight : false
    };
  }

  function inferPageIntent() {
    const pageType = inferPageType();
    const primaryAction = findPrimaryAction();

    const intents = {
      'landing-page': 'Convert visitors to users/customers',
      'pricing-page': 'Help users choose a plan',
      'blog-page': 'Provide information and build authority',
      'documentation': 'Help users understand and use the product',
      'login-page': 'Authenticate existing users',
      'signup-page': 'Register new users',
      'dashboard': 'Display data and enable actions',
      'product-page': 'Showcase product features',
      'contact-page': 'Enable user communication'
    };

    return intents[pageType] || 'General information display';
  }

  // ============================================
  // Component Annotation
  // ============================================

  function annotateComponents(components) {
    if (!components) return [];

    const annotated = [];

    for (const [type, items] of Object.entries(components)) {
      if (!Array.isArray(items)) continue;

      for (const item of items) {
        const annotation = {
          id: generateComponentId(type, item),
          type,
          selector: item.selector,
          semanticRole: inferSemanticRole(type, item),
          description: generateDescription(type, item),
          visual: analyzeVisualProperties(item),
          context: analyzeContext(item),
          codeHints: generateCodeHints(type, item)
        };

        // Include original styles
        if (item.styles) {
          annotation.styles = { default: item.styles };
        }

        // Include states if available
        if (item.states) {
          annotation.styles = item.states;
        }

        annotated.push(annotation);
      }
    }

    return annotated;
  }

  function generateComponentId(type, item) {
    const text = item.text?.toLowerCase().replace(/\s+/g, '-').slice(0, 20) || '';
    const index = Math.random().toString(36).slice(2, 6);
    return `${type}-${text || index}`;
  }

  function inferSemanticRole(type, item) {
    const context = analyzeContext(item);
    const text = (item.text || '').toLowerCase();

    // Button roles
    if (type === 'button') {
      if (context.inHero || context.prominence === 'high') return 'primary-call-to-action';
      if (context.inForm) return 'form-submit';
      if (context.inNav) return 'navigation-action';
      if (context.inModal) return 'modal-action';
      if (text.includes('cancel') || text.includes('close')) return 'dismiss-action';
      if (text.includes('delete') || text.includes('remove')) return 'destructive-action';
      return 'secondary-action';
    }

    // Navigation roles
    if (type === 'navItem') {
      if (context.isActive) return 'active-nav-item';
      return 'nav-link';
    }

    // Card roles
    if (type === 'card') {
      if (context.inPricing) return 'pricing-card';
      if (context.inFeatures) return 'feature-card';
      if (context.hasImage) return 'media-card';
      return 'content-card';
    }

    // Input roles
    if (type === 'input') {
      if (item.inputType === 'search') return 'search-input';
      if (item.inputType === 'email') return 'email-input';
      if (item.inputType === 'password') return 'password-input';
      return 'form-input';
    }

    return type;
  }

  function generateDescription(type, item) {
    const context = analyzeContext(item);
    const visual = analyzeVisualProperties(item);
    const text = item.text || '';

    let desc = '';

    switch (type) {
      case 'button':
        desc = context.inHero ? 'Primary CTA button in hero section' :
               context.inForm ? 'Form submission button' :
               context.inNav ? 'Navigation action button' :
               `${visual.prominence} prominence button`;
        if (text) desc += ` with text "${text.slice(0, 30)}"`;
        break;

      case 'card':
        desc = context.inPricing ? 'Pricing plan card' :
               context.inFeatures ? 'Feature highlight card' :
               'Content card';
        if (visual.hasImage) desc += ' with image';
        break;

      case 'input':
        desc = `${item.inputType || 'text'} input field`;
        if (item.placeholder) desc += ` (placeholder: "${item.placeholder}")`;
        break;

      case 'navigation':
        desc = context.isHeader ? 'Main header navigation' :
               context.isSidebar ? 'Sidebar navigation' :
               'Navigation component';
        break;

      default:
        desc = `${type} component`;
    }

    return desc;
  }

  function analyzeVisualProperties(item) {
    const styles = item.styles || {};
    const rect = item.rect || {};

    return {
      size: inferSize(rect),
      prominence: inferProminence(styles, rect),
      position: inferPosition(rect),
      colorContrast: inferColorContrast(styles),
      hasImage: !!item.hasImage,
      hasShadow: styles.boxShadow && styles.boxShadow !== 'none',
      hasRoundedCorners: styles.borderRadius && styles.borderRadius !== '0px',
      isTransparent: styles.backgroundColor === 'transparent' ||
                     styles.backgroundColor === 'rgba(0, 0, 0, 0)'
    };
  }

  function inferSize(rect) {
    if (!rect.width || !rect.height) return 'unknown';
    const area = rect.width * rect.height;
    if (area < 2000) return 'small';
    if (area < 10000) return 'medium';
    if (area < 50000) return 'large';
    return 'extra-large';
  }

  function inferProminence(styles, rect) {
    let score = 0;

    // Size contributes to prominence
    if (rect.width > 200) score += 1;
    if (rect.height > 50) score += 1;

    // Visual styling
    if (styles.backgroundColor && styles.backgroundColor !== 'transparent') score += 1;
    if (styles.boxShadow && styles.boxShadow !== 'none') score += 1;
    if (styles.fontWeight && parseInt(styles.fontWeight) >= 600) score += 1;

    if (score >= 4) return 'high';
    if (score >= 2) return 'medium';
    return 'low';
  }

  function inferPosition(rect) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const centerX = rect.x + rect.width / 2;
    const centerY = rect.y + rect.height / 2;

    let position = '';

    // Vertical position
    if (centerY < vh * 0.33) position += 'top-';
    else if (centerY > vh * 0.66) position += 'bottom-';
    else position += 'middle-';

    // Horizontal position
    if (centerX < vw * 0.33) position += 'left';
    else if (centerX > vw * 0.66) position += 'right';
    else position += 'center';

    return position;
  }

  function inferColorContrast(styles) {
    if (!styles.backgroundColor || !styles.color) return 'unknown';

    const bgHex = rgbToHex(styles.backgroundColor);
    const fgHex = rgbToHex(styles.color);

    if (!bgHex || !fgHex) return 'unknown';

    const bgLum = getLuminance(bgHex);
    const fgLum = getLuminance(fgHex);

    const contrast = Math.abs(bgLum - fgLum);

    if (contrast > 0.5) return 'high';
    if (contrast > 0.3) return 'medium';
    return 'low';
  }

  function analyzeContext(item) {
    const selector = item.selector || '';

    return {
      inHero: selector.includes('hero') || selector.includes('banner'),
      inNav: selector.includes('nav') || selector.includes('menu'),
      inForm: selector.includes('form'),
      inModal: selector.includes('modal') || selector.includes('dialog'),
      inFooter: selector.includes('footer'),
      inHeader: selector.includes('header'),
      inSidebar: selector.includes('sidebar') || selector.includes('aside'),
      inPricing: selector.includes('pricing') || selector.includes('plan'),
      inFeatures: selector.includes('feature'),
      isActive: selector.includes('active') || selector.includes('current'),
      prominence: inferProminence(item.styles || {}, item.rect || {})
    };
  }

  // ============================================
  // Code Hints Generation
  // ============================================

  function generateCodeHints(type, item) {
    const styles = item.styles || {};
    const hints = {
      tailwind: generateTailwindHint(type, styles),
      css: generateCSSHint(type, styles),
      react: generateReactHint(type, item)
    };

    return hints;
  }

  function generateTailwindHint(type, styles) {
    const classes = [];

    // Background
    if (styles.backgroundColor) {
      const hex = rgbToHex(styles.backgroundColor);
      if (hex) {
        const twColor = hexToTailwindColor(hex);
        if (twColor) classes.push(`bg-${twColor}`);
      }
    }

    // Text color
    if (styles.color) {
      const hex = rgbToHex(styles.color);
      if (hex) {
        const twColor = hexToTailwindColor(hex);
        if (twColor) classes.push(`text-${twColor}`);
      }
    }

    // Padding
    if (styles.padding) {
      const px = parseInt(styles.padding);
      if (px) classes.push(`p-${pxToTailwindSpacing(px)}`);
    }

    // Border radius
    if (styles.borderRadius) {
      const px = parseInt(styles.borderRadius);
      if (px <= 4) classes.push('rounded-sm');
      else if (px <= 8) classes.push('rounded');
      else if (px <= 12) classes.push('rounded-md');
      else if (px <= 16) classes.push('rounded-lg');
      else if (px <= 24) classes.push('rounded-xl');
      else classes.push('rounded-full');
    }

    // Font weight
    if (styles.fontWeight) {
      const weight = parseInt(styles.fontWeight);
      if (weight >= 700) classes.push('font-bold');
      else if (weight >= 600) classes.push('font-semibold');
      else if (weight >= 500) classes.push('font-medium');
    }

    // Shadow
    if (styles.boxShadow && styles.boxShadow !== 'none') {
      if (styles.boxShadow.includes('0 1px')) classes.push('shadow-sm');
      else if (styles.boxShadow.includes('0 4px')) classes.push('shadow');
      else if (styles.boxShadow.includes('0 10px')) classes.push('shadow-lg');
      else classes.push('shadow-md');
    }

    return classes.join(' ');
  }

  function hexToTailwindColor(hex) {
    if (!hex) return null;

    const colorMap = {
      '#000000': 'black',
      '#ffffff': 'white',
      '#f8fafc': 'slate-50',
      '#f1f5f9': 'slate-100',
      '#e2e8f0': 'slate-200',
      '#cbd5e1': 'slate-300',
      '#94a3b8': 'slate-400',
      '#64748b': 'slate-500',
      '#475569': 'slate-600',
      '#334155': 'slate-700',
      '#1e293b': 'slate-800',
      '#0f172a': 'slate-900',
      '#3b82f6': 'blue-500',
      '#2563eb': 'blue-600',
      '#1d4ed8': 'blue-700',
      '#ef4444': 'red-500',
      '#22c55e': 'green-500',
      '#eab308': 'yellow-500'
    };

    const normalized = hex.toLowerCase();
    if (colorMap[normalized]) return colorMap[normalized];

    // Try to find closest match
    const lum = getLuminance(hex);
    if (lum > 0.9) return 'white';
    if (lum < 0.1) return 'black';
    if (lum > 0.7) return 'gray-200';
    if (lum > 0.5) return 'gray-400';
    if (lum > 0.3) return 'gray-600';
    return 'gray-800';
  }

  function pxToTailwindSpacing(px) {
    const map = {
      4: '1', 8: '2', 12: '3', 16: '4', 20: '5', 24: '6',
      32: '8', 40: '10', 48: '12', 64: '16'
    };
    const closest = Object.keys(map).reduce((prev, curr) =>
      Math.abs(curr - px) < Math.abs(prev - px) ? curr : prev
    );
    return map[closest] || '4';
  }

  function generateCSSHint(type, styles) {
    const cssProps = [];

    if (styles.backgroundColor) cssProps.push(`background-color: ${styles.backgroundColor}`);
    if (styles.color) cssProps.push(`color: ${styles.color}`);
    if (styles.padding) cssProps.push(`padding: ${styles.padding}`);
    if (styles.borderRadius) cssProps.push(`border-radius: ${styles.borderRadius}`);
    if (styles.fontWeight) cssProps.push(`font-weight: ${styles.fontWeight}`);
    if (styles.boxShadow && styles.boxShadow !== 'none') {
      cssProps.push(`box-shadow: ${styles.boxShadow}`);
    }

    return `.${type} { ${cssProps.join('; ')} }`;
  }

  function generateReactHint(type, item) {
    const componentName = type.charAt(0).toUpperCase() + type.slice(1);
    const props = [];

    if (item.text) props.push(`children="${item.text.slice(0, 20)}"`);
    if (type === 'button') {
      const context = analyzeContext(item);
      if (context.inHero) props.push('variant="primary"');
      else props.push('variant="secondary"');
    }

    return `<${componentName} ${props.join(' ')} />`;
  }

  // ============================================
  // Design System Extraction
  // ============================================

  function extractDesignSystem() {
    return {
      colorPalette: extractColorPalette(),
      typography: extractTypography(),
      spacing: extractSpacing(),
      shadows: extractShadows(),
      borderRadius: extractBorderRadius()
    };
  }

  function extractColorPalette() {
    const colors = new Map();
    const colorUsage = new Map();

    // Sample colors from key elements
    const sampleSelectors = [
      { selector: 'body', usage: 'background' },
      { selector: 'h1, h2, h3', usage: 'heading' },
      { selector: 'p, span', usage: 'body-text' },
      { selector: 'a', usage: 'link' },
      { selector: 'button, .btn', usage: 'button' },
      { selector: 'nav', usage: 'navigation' },
      { selector: 'header', usage: 'header' },
      { selector: 'footer', usage: 'footer' }
    ];

    for (const { selector, usage } of sampleSelectors) {
      try {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          const styles = getComputedStyle(el);

          // Background color
          const bg = rgbToHex(styles.backgroundColor);
          if (bg && bg !== '#000000' && bg !== 'transparent') {
            if (!colors.has(bg)) {
              colors.set(bg, { value: bg, usages: [] });
            }
            colors.get(bg).usages.push(`${usage}-background`);
          }

          // Text color
          const fg = rgbToHex(styles.color);
          if (fg) {
            if (!colors.has(fg)) {
              colors.set(fg, { value: fg, usages: [] });
            }
            colors.get(fg).usages.push(`${usage}-text`);
          }

          // Border color
          const border = rgbToHex(styles.borderColor);
          if (border && border !== fg && border !== bg) {
            if (!colors.has(border)) {
              colors.set(border, { value: border, usages: [] });
            }
            colors.get(border).usages.push(`${usage}-border`);
          }
        }
      } catch (e) { /* invalid selector */ }
    }

    // Convert to array and dedupe usages
    const palette = [];
    for (const [hex, data] of colors) {
      const uniqueUsages = [...new Set(data.usages)];
      const role = inferColorRole(hex, uniqueUsages);

      palette.push({
        value: hex,
        role,
        usage: uniqueUsages.join(', ')
      });
    }

    return palette;
  }

  function inferColorRole(hex, usages) {
    const usageStr = usages.join(' ').toLowerCase();

    if (usageStr.includes('button') || usageStr.includes('link')) {
      return 'primary';
    }
    if (usageStr.includes('heading')) {
      return 'heading';
    }
    if (usageStr.includes('body-text')) {
      return 'body';
    }
    if (usageStr.includes('background')) {
      return 'background';
    }
    if (usageStr.includes('border')) {
      return 'border';
    }

    return 'accent';
  }

  function extractTypography() {
    const fonts = new Set();
    const sizes = new Map();
    const weights = new Set();

    const textSelectors = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'a', 'button', 'li'];

    for (const selector of textSelectors) {
      try {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          const styles = getComputedStyle(el);

          // Font family
          const family = styles.fontFamily.split(',')[0].trim().replace(/['"]/g, '');
          if (family) fonts.add(family);

          // Font size
          const size = styles.fontSize;
          if (size) {
            if (!sizes.has(size)) {
              sizes.set(size, { value: size, elements: [] });
            }
            sizes.get(size).elements.push(selector);
          }

          // Font weight
          const weight = styles.fontWeight;
          if (weight) weights.add(weight);
        }
      } catch (e) { /* invalid selector */ }
    }

    // Build typography scale
    const scale = {};
    const sortedSizes = Array.from(sizes.entries())
      .sort((a, b) => parseInt(b[0]) - parseInt(a[0]));

    const scaleNames = ['display', 'h1', 'h2', 'h3', 'h4', 'body', 'small', 'xs'];
    sortedSizes.slice(0, 8).forEach(([size, data], i) => {
      scale[scaleNames[i] || `size-${i}`] = size;
    });

    return {
      families: Array.from(fonts),
      scale,
      weights: Array.from(weights).map(w => parseInt(w)).sort((a, b) => a - b)
    };
  }

  function extractSpacing() {
    const spacings = new Set();

    const elements = document.querySelectorAll('*');
    const sampleSize = Math.min(elements.length, 100);

    for (let i = 0; i < sampleSize; i++) {
      const el = elements[i];
      const styles = getComputedStyle(el);

      // Padding
      ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'].forEach(prop => {
        const val = parseInt(styles[prop]);
        if (val > 0 && val < 200) spacings.add(val);
      });

      // Margin
      ['marginTop', 'marginRight', 'marginBottom', 'marginLeft'].forEach(prop => {
        const val = parseInt(styles[prop]);
        if (val > 0 && val < 200) spacings.add(val);
      });

      // Gap
      const gap = parseInt(styles.gap);
      if (gap > 0 && gap < 200) spacings.add(gap);
    }

    // Build spacing scale
    const sorted = Array.from(spacings).sort((a, b) => a - b);
    const scale = [];
    let prev = 0;

    for (const val of sorted) {
      // Only include values that are meaningfully different
      if (val - prev >= 4) {
        scale.push(val);
        prev = val;
      }
    }

    return {
      scale: scale.slice(0, 10),
      usage: 'Consistent spacing grid detected'
    };
  }

  function extractShadows() {
    const shadows = new Map();

    const elements = document.querySelectorAll('*');
    const sampleSize = Math.min(elements.length, 100);

    for (let i = 0; i < sampleSize; i++) {
      const el = elements[i];
      const shadow = getComputedStyle(el).boxShadow;

      if (shadow && shadow !== 'none') {
        if (!shadows.has(shadow)) {
          shadows.set(shadow, { value: shadow, count: 0 });
        }
        shadows.get(shadow).count++;
      }
    }

    // Sort by frequency
    const sorted = Array.from(shadows.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return sorted.map((s, i) => ({
      name: ['sm', 'md', 'lg', 'xl', '2xl'][i] || `shadow-${i}`,
      value: s.value,
      frequency: s.count
    }));
  }

  function extractBorderRadius() {
    const radii = new Map();

    const elements = document.querySelectorAll('*');
    const sampleSize = Math.min(elements.length, 100);

    for (let i = 0; i < sampleSize; i++) {
      const el = elements[i];
      const radius = getComputedStyle(el).borderRadius;

      if (radius && radius !== '0px') {
        if (!radii.has(radius)) {
          radii.set(radius, { value: radius, count: 0 });
        }
        radii.get(radius).count++;
      }
    }

    // Sort by frequency
    const sorted = Array.from(radii.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return sorted.map((r, i) => ({
      name: ['sm', 'md', 'lg', 'xl', 'full'][i] || `radius-${i}`,
      value: r.value,
      frequency: r.count
    }));
  }

  // ============================================
  // Main Generate Function
  // ============================================

  function summarizeStateCapture(stateCapture) {
    if (!stateCapture || typeof stateCapture !== 'object') return null;

    const selectors = Array.isArray(stateCapture.selectors) ? stateCapture.selectors : [];
    const summaries = stateCapture.summaries && typeof stateCapture.summaries === 'object'
      ? stateCapture.summaries
      : null;
    const capturedStates = stateCapture.captured?.states && typeof stateCapture.captured.states === 'object'
      ? stateCapture.captured.states
      : null;

    const examples = [];
    if (summaries) {
      for (const [selector, summary] of Object.entries(summaries)) {
        if (examples.length >= 3) break;
        if (!summary) continue;
        examples.push({
          selector,
          hasInteractiveStates: !!summary.hasInteractiveStates,
          keyChanges: (summary.keyChanges || []).slice(0, 6),
          states: Array.isArray(summary.states) ? summary.states : null
        });
      }
    }

    return {
      selectorCount: selectors.length,
      capturedSelectorCount: capturedStates ? Object.keys(capturedStates).length : 0,
      hasBatchWorkflow: !!stateCapture.batchWorkflow,
      hasElementWorkflows: Array.isArray(stateCapture.mcpCommands) && stateCapture.mcpCommands.length > 0,
      examples
    };
  }

  function summarizeResponsive(responsive) {
    if (!responsive || typeof responsive !== 'object') return null;
    const bp = responsive.breakpoints?.breakpoints || responsive.breakpoints || null;
    const named = responsive.breakpoints?.named || null;
    const capturedLayouts = responsive.captured?.layouts && typeof responsive.captured.layouts === 'object'
      ? Object.keys(responsive.captured.layouts)
      : [];

    return {
      viewport: responsive.currentLayout?.viewport || null,
      breakpoints: bp,
      namedBreakpoints: named,
      capturedLayouts
    };
  }

  function generate(extractedData = {}) {
    const result = {
      page: analyzePage(),
      components: [],
      designSystem: extractDesignSystem(),
      meta: {
        url: location.href,
        title: document.title,
        generatedAt: new Date().toISOString(),
        version: '1.0.0'
      }
    };

    // Annotate components if provided
    const componentsInput = extractedData?.components?.components || extractedData.components;
    if (componentsInput && typeof componentsInput === 'object') {
      result.components = annotateComponents(componentsInput);
    }

    // Include state capture info if available
    const stateCapture = extractedData['state-capture'] || extractedData.states || null;
    const stateSummary = summarizeStateCapture(stateCapture);
    if (stateSummary) {
      result.states = stateSummary;
    }

    // Responsive summary if available
    const responsiveSummary = summarizeResponsive(extractedData.responsive);
    if (responsiveSummary) {
      result.responsive = responsiveSummary;
    }

    // Generate summary for AI consumption
    result.summary = generateAISummary(result);

    return result;
  }

  function generateAISummary(data) {
    const page = data.page;
    const components = data.components;
    const ds = data.designSystem;

    return {
      pageDescription: `${page.type} with ${page.sections.length} sections (${page.sections.join(', ')})`,
      primaryIntent: page.intent,
      colorScheme: page.colorScheme,
      componentCount: components.length,
      keyComponents: components
        .filter(c => c.visual?.prominence === 'high')
        .map(c => `${c.type}: ${c.description}`)
        .slice(0, 5),
      designTokens: {
        colorCount: ds.colorPalette?.length || 0,
        fontFamilies: ds.typography?.families || [],
        spacingScale: ds.spacing?.scale || []
      },
      recommendations: generateRecommendations(data)
    };
  }

  function generateRecommendations(data) {
    const recs = [];

    // Check color contrast
    const lowContrastComponents = data.components.filter(
      c => c.visual?.colorContrast === 'low'
    );
    if (lowContrastComponents.length > 0) {
      recs.push(`${lowContrastComponents.length} components may have low color contrast`);
    }

    // Check for missing states
    const interactiveWithoutStates = data.components.filter(
      c => ['button', 'input', 'navItem'].includes(c.type) &&
           (!c.styles?.hover && !c.styles?.focus)
    );
    if (interactiveWithoutStates.length > 0) {
      recs.push(`${interactiveWithoutStates.length} interactive components missing hover/focus states`);
    }

    // Check typography
    if (data.designSystem.typography?.families?.length > 3) {
      recs.push('Consider reducing font families for consistency');
    }

    return recs;
  }

  // ============================================
  // Export
  // ============================================

  window.__seAISemantic = {
    installed: true,
    version: '1.0.0',

    // Main entry point
    generate,

    // Page analysis
    analyzePage,
    inferPageType,
    detectSections,
    findPrimaryAction,
    detectColorScheme,

    // Component annotation
    annotateComponents,
    inferSemanticRole,
    generateDescription,
    analyzeVisualProperties,
    analyzeContext,

    // Code hints
    generateCodeHints,
    generateTailwindHint,
    generateCSSHint,
    generateReactHint,

    // Design system
    extractDesignSystem,
    extractColorPalette,
    extractTypography,
    extractSpacing,

    // Utilities
    rgbToHex,
    getLuminance,
    hexToTailwindColor
  };
})();
