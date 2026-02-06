// Style Extractor: Component Detector
// Identifies and extracts common UI component patterns from the DOM
//
// Detects: buttons, cards, navigation, forms, modals, badges, etc.
// Extracts: states (default, hover, active, focus, disabled), variants, hierarchy
//
// Usage in evaluate_script:
//   window.__seComponents.detectAll()
//   window.__seComponents.extractStates(selector)
//   window.__seComponents.analyzeHierarchy()

(() => {
  if (window.__seComponents?.installed) return;

  // Debug mode - set window.__seDebug = true to enable logging
  const debug = (...args) => {
    if (window.__seDebug) console.log('[style-extractor:components]', ...args);
  };
  const debugWarn = (...args) => {
    if (window.__seDebug) console.warn('[style-extractor:components]', ...args);
  };

  // ============================================
  // Component Pattern Definitions
  // ============================================

  const COMPONENT_PATTERNS = {
    button: {
      selectors: [
        'button',
        '[role="button"]',
        'a.btn', 'a.button',
        '.btn', '.button',
        '[class*="btn-"]', '[class*="button-"]',
        'input[type="button"]', 'input[type="submit"]'
      ],
      indicators: ['click', 'submit', 'action', 'cta'],
      excludeSelectors: ['nav button', '.nav-toggle']
    },

    card: {
      selectors: [
        '.card', '[class*="card"]',
        'article', '.article',
        '.tile', '.panel',
        '[class*="feature-"]',
        '.item', '.list-item'
      ],
      indicators: ['card', 'tile', 'panel', 'feature'],
      minSize: { width: 150, height: 100 }
    },

    navigation: {
      selectors: [
        'nav', '[role="navigation"]',
        'header nav', '.navbar', '.nav',
        '.menu', '[class*="menu"]',
        '.sidebar', '[class*="sidebar"]'
      ],
      indicators: ['nav', 'menu', 'sidebar', 'header']
    },

    navItem: {
      selectors: [
        'nav a', 'nav button',
        '.nav-item', '.nav-link',
        '.menu-item', '[class*="menu-item"]',
        '[role="menuitem"]'
      ],
      parentType: 'navigation'
    },

    input: {
      selectors: [
        'input[type="text"]', 'input[type="email"]', 'input[type="password"]',
        'input[type="search"]', 'input[type="tel"]', 'input[type="url"]',
        'input[type="number"]', 'input[type="date"]',
        'textarea', 'select',
        '.input', '[class*="input-"]',
        '.form-control'
      ],
      indicators: ['input', 'field', 'form']
    },

    badge: {
      selectors: [
        '.badge', '.tag', '.chip', '.label',
        '[class*="badge"]', '[class*="tag-"]', '[class*="chip"]',
        '.pill', '.status'
      ],
      maxSize: { width: 200, height: 50 }
    },

    modal: {
      selectors: [
        '.modal', '[role="dialog"]',
        '.dialog', '.popup', '.overlay',
        '[class*="modal"]', '[class*="dialog"]'
      ],
      indicators: ['modal', 'dialog', 'popup', 'overlay']
    },

    hero: {
      selectors: [
        '.hero', '[class*="hero"]',
        '.banner', '.jumbotron',
        'section:first-of-type',
        '[class*="landing"]'
      ],
      indicators: ['hero', 'banner', 'landing'],
      minSize: { height: 300 }
    },

    heading: {
      selectors: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', '[class*="heading"]', '[class*="title"]'],
      indicators: ['heading', 'title']
    },

    icon: {
      selectors: [
        'svg', '.icon', '[class*="icon"]',
        'i.fa', 'i.material-icons',
        '[class*="lucide"]'
      ],
      maxSize: { width: 48, height: 48 }
    },

    list: {
      selectors: [
        'ul', 'ol', '.list', '[class*="list"]',
        '[role="list"]', '.items'
      ],
      indicators: ['list', 'items']
    },

    footer: {
      selectors: [
        'footer', '[role="contentinfo"]',
        '.footer', '[class*="footer"]'
      ],
      indicators: ['footer']
    },

    header: {
      selectors: [
        'header', '[role="banner"]',
        '.header', '[class*="header"]'
      ],
      indicators: ['header', 'banner', 'top']
    }
  };

  // ============================================
  // CSS Properties to Extract
  // ============================================

  const STYLE_PROPERTIES = [
    // Layout
    'display', 'position', 'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight',
    'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
    'gap', 'flexDirection', 'justifyContent', 'alignItems',

    // Visual
    'backgroundColor', 'color', 'opacity',
    'border', 'borderWidth', 'borderStyle', 'borderColor', 'borderRadius',
    'boxShadow', 'outline', 'outlineOffset',

    // Typography
    'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'textTransform',

    // Effects
    'transform', 'filter', 'backdropFilter',
    'transition', 'transitionProperty', 'transitionDuration', 'transitionTimingFunction',

    // Cursor
    'cursor'
  ];

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

  function extractStyles(el, properties = STYLE_PROPERTIES) {
    const s = getComputedStyle(el);
    const result = {};
    for (const prop of properties) {
      const value = s[prop];
      if (value && value !== 'none' && value !== 'normal' && value !== 'auto' && value !== '0px') {
        result[prop] = value;
      }
    }
    return result;
  }

  function getTextContent(el, maxLength = 100) {
    const text = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
    return text.slice(0, maxLength) || null;
  }

  function matchesPattern(el, pattern) {
    // Check selectors
    for (const selector of pattern.selectors) {
      try {
        if (el.matches(selector)) return true;
      } catch (e) {
        debugWarn('Invalid selector:', selector, e.message);
      }
    }

    // Check class indicators
    if (pattern.indicators && el.className) {
      const className = String(el.className).toLowerCase();
      for (const indicator of pattern.indicators) {
        if (className.includes(indicator)) return true;
      }
    }

    return false;
  }

  function isVisible(el) {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.visibility !== 'hidden' &&
      style.display !== 'none' &&
      parseFloat(style.opacity) > 0
    );
  }

  function checkSizeConstraints(el, constraints) {
    const rect = getRect(el);
    if (constraints.minSize) {
      if (constraints.minSize.width && rect.width < constraints.minSize.width) return false;
      if (constraints.minSize.height && rect.height < constraints.minSize.height) return false;
    }
    if (constraints.maxSize) {
      if (constraints.maxSize.width && rect.width > constraints.maxSize.width) return false;
      if (constraints.maxSize.height && rect.height > constraints.maxSize.height) return false;
    }
    return true;
  }

  // ============================================
  // Enhanced Component Detection (P1)
  // ============================================

  /**
   * Identify component type by visual features
   */
  function identifyByVisualFeatures(el) {
    const rect = getRect(el);
    const styles = extractStyles(el);
    const candidates = [];

    // Button features: small size + cursor:pointer + background
    if (rect.width < 400 && rect.height < 80 &&
        styles.cursor === 'pointer' &&
        (styles.backgroundColor !== 'transparent' &&
         styles.backgroundColor !== 'rgba(0, 0, 0, 0)')) {
      candidates.push({ type: 'button', confidence: 0.7, reason: 'visual-button' });
    }

    // Ghost button: pointer + border + transparent bg
    if (rect.width < 400 && rect.height < 80 &&
        styles.cursor === 'pointer' &&
        styles.borderWidth && styles.borderWidth !== '0px' &&
        (styles.backgroundColor === 'transparent' ||
         styles.backgroundColor === 'rgba(0, 0, 0, 0)')) {
      candidates.push({ type: 'button', confidence: 0.6, reason: 'ghost-button' });
    }

    // Card features: medium size + rounded corners + shadow
    if (rect.width > 150 && rect.height > 100 &&
        rect.width < 800 && rect.height < 600 &&
        parseFloat(styles.borderRadius) > 0 &&
        styles.boxShadow && styles.boxShadow !== 'none') {
      candidates.push({ type: 'card', confidence: 0.7, reason: 'visual-card' });
    }

    // Card without shadow but with border
    if (rect.width > 150 && rect.height > 100 &&
        rect.width < 800 && rect.height < 600 &&
        parseFloat(styles.borderRadius) > 0 &&
        styles.borderWidth && styles.borderWidth !== '0px') {
      candidates.push({ type: 'card', confidence: 0.5, reason: 'bordered-card' });
    }

    // Badge features: very small + rounded + colored bg
    if (rect.width < 150 && rect.height < 40 &&
        parseFloat(styles.borderRadius) > 0 &&
        styles.backgroundColor !== 'transparent') {
      candidates.push({ type: 'badge', confidence: 0.7, reason: 'visual-badge' });
    }

    // Input features: specific height range + border
    if (rect.width > 100 && rect.height >= 30 && rect.height <= 60 &&
        styles.borderWidth && styles.borderWidth !== '0px') {
      candidates.push({ type: 'input', confidence: 0.5, reason: 'visual-input' });
    }

    // Hero features: large height + top position
    if (rect.height > 300 && rect.y < 200) {
      candidates.push({ type: 'hero', confidence: 0.6, reason: 'visual-hero' });
    }

    // Modal features: centered + high z-index + shadow
    const zIndex = parseInt(styles.zIndex);
    if (zIndex > 100 &&
        styles.position === 'fixed' &&
        styles.boxShadow && styles.boxShadow !== 'none') {
      candidates.push({ type: 'modal', confidence: 0.8, reason: 'visual-modal' });
    }

    return candidates;
  }

  /**
   * Identify component type by interaction behavior
   */
  function identifyByInteraction(el) {
    const candidates = [];
    const tag = el.tagName.toLowerCase();

    // Has click handler
    const hasClickHandler = el.onclick ||
                            el.getAttribute('onclick') ||
                            el.hasAttribute('data-action') ||
                            el.hasAttribute('data-click');

    // Has href
    const hasHref = tag === 'a' && el.href;

    // Is form control
    const isFormControl = ['input', 'select', 'textarea'].includes(tag);

    // Has role
    const role = el.getAttribute('role');

    // Cursor style
    const cursor = getComputedStyle(el).cursor;

    // Button-like interaction
    if ((tag === 'button' || role === 'button' || hasClickHandler) &&
        cursor === 'pointer') {
      candidates.push({ type: 'button', confidence: 0.8, reason: 'interactive-button' });
    }

    // Link interaction
    if (hasHref || role === 'link') {
      candidates.push({ type: 'link', confidence: 0.9, reason: 'interactive-link' });
    }

    // Form control
    if (isFormControl) {
      const inputType = el.type || 'text';
      if (['checkbox', 'radio'].includes(inputType)) {
        candidates.push({ type: 'checkbox', confidence: 0.9, reason: 'form-checkbox' });
      } else if (inputType === 'submit' || inputType === 'button') {
        candidates.push({ type: 'button', confidence: 0.9, reason: 'form-button' });
      } else {
        candidates.push({ type: 'input', confidence: 0.9, reason: 'form-input' });
      }
    }

    // Tab interaction
    if (role === 'tab' || role === 'tablist') {
      candidates.push({ type: 'tab', confidence: 0.9, reason: 'interactive-tab' });
    }

    // Menu interaction
    if (role === 'menu' || role === 'menuitem' || role === 'menubar') {
      candidates.push({ type: 'menu', confidence: 0.9, reason: 'interactive-menu' });
    }

    // Expandable
    if (el.hasAttribute('aria-expanded')) {
      candidates.push({ type: 'accordion', confidence: 0.7, reason: 'expandable' });
    }

    return candidates;
  }

  /**
   * Identify component type by context
   */
  function identifyByContext(el) {
    const candidates = [];
    const parent = el.parentElement;
    if (!parent) return candidates;

    const siblings = Array.from(parent.children);
    const tag = el.tagName.toLowerCase();

    // Inside nav = navigation item
    if (el.closest('nav') || el.closest('[role="navigation"]')) {
      if (tag === 'a' || tag === 'button') {
        candidates.push({ type: 'navItem', confidence: 0.9, reason: 'context-nav' });
      }
    }

    // Inside header = header element
    if (el.closest('header') || el.closest('[role="banner"]')) {
      candidates.push({ type: 'headerElement', confidence: 0.6, reason: 'context-header' });
    }

    // Inside footer = footer element
    if (el.closest('footer') || el.closest('[role="contentinfo"]')) {
      candidates.push({ type: 'footerElement', confidence: 0.6, reason: 'context-footer' });
    }

    // Inside form = form element
    if (el.closest('form')) {
      if (tag === 'button' || (tag === 'input' && el.type === 'submit')) {
        candidates.push({ type: 'submitButton', confidence: 0.8, reason: 'context-form' });
      }
    }

    // Multiple similar siblings = list item
    const similarSiblings = siblings.filter(s =>
      s.tagName === el.tagName &&
      s.className === el.className &&
      s !== el
    );
    if (similarSiblings.length >= 2) {
      candidates.push({ type: 'listItem', confidence: 0.7, reason: 'context-siblings' });
    }

    // Inside grid/flex container with multiple children = grid item
    const parentStyle = getComputedStyle(parent);
    if ((parentStyle.display === 'grid' || parentStyle.display === 'flex') &&
        siblings.length >= 3) {
      candidates.push({ type: 'gridItem', confidence: 0.6, reason: 'context-grid' });
    }

    // Check for pricing context
    const parentClasses = parent.className?.toLowerCase() || '';
    const grandparentClasses = parent.parentElement?.className?.toLowerCase() || '';
    if (parentClasses.includes('pricing') || grandparentClasses.includes('pricing') ||
        parentClasses.includes('plan') || grandparentClasses.includes('plan')) {
      candidates.push({ type: 'pricingCard', confidence: 0.8, reason: 'context-pricing' });
    }

    // Check for feature context
    if (parentClasses.includes('feature') || grandparentClasses.includes('feature')) {
      candidates.push({ type: 'featureCard', confidence: 0.8, reason: 'context-feature' });
    }

    return candidates;
  }

  /**
   * Smart component detection combining all methods
   */
  function smartDetect(el) {
    const visualCandidates = identifyByVisualFeatures(el);
    const interactionCandidates = identifyByInteraction(el);
    const contextCandidates = identifyByContext(el);

    // Merge all candidates
    const allCandidates = [
      ...visualCandidates,
      ...interactionCandidates,
      ...contextCandidates
    ];

    if (allCandidates.length === 0) return null;

    // Score each type
    const typeScores = {};
    for (const candidate of allCandidates) {
      if (!typeScores[candidate.type]) {
        typeScores[candidate.type] = {
          score: 0,
          reasons: []
        };
      }
      typeScores[candidate.type].score += candidate.confidence;
      typeScores[candidate.type].reasons.push(candidate.reason);
    }

    // Find best match
    let bestType = null;
    let bestScore = 0;
    for (const [type, data] of Object.entries(typeScores)) {
      if (data.score > bestScore) {
        bestScore = data.score;
        bestType = type;
      }
    }

    if (!bestType) return null;

    return {
      type: bestType,
      confidence: Math.min(bestScore / 2, 1), // Normalize to 0-1
      reasons: typeScores[bestType].reasons,
      allCandidates: typeScores
    };
  }

  /**
   * Identify component variant
   */
  function identifyVariant(el, componentType) {
    const styles = extractStyles(el);
    const classes = Array.from(el.classList || []);
    const classStr = classes.join(' ').toLowerCase();

    const variant = {
      size: inferVariantSize(el, styles),
      style: inferVariantStyle(classStr, styles),
      state: inferVariantState(el)
    };

    // Type-specific variants
    if (componentType === 'button') {
      variant.variant = inferButtonVariant(classStr, styles);
      variant.iconOnly = !el.innerText?.trim() && el.querySelector('svg, img, i');
    }

    if (componentType === 'input') {
      variant.inputType = el.type || 'text';
      variant.hasIcon = !!el.parentElement?.querySelector('svg, .icon');
    }

    if (componentType === 'card') {
      variant.hasImage = !!el.querySelector('img, picture, video');
      variant.hasHeader = !!el.querySelector('[class*="header"], [class*="title"]:first-child');
      variant.hasFooter = !!el.querySelector('[class*="footer"], [class*="action"]');
    }

    return variant;
  }

  function inferVariantSize(el, styles) {
    const rect = getRect(el);
    const fontSize = parseFloat(styles.fontSize);
    const padding = parseFloat(styles.padding) || 0;

    // Based on font size
    if (fontSize <= 12) return 'xs';
    if (fontSize <= 14) return 'sm';
    if (fontSize <= 16) return 'md';
    if (fontSize <= 20) return 'lg';
    return 'xl';
  }

  function inferVariantStyle(classStr, styles) {
    // Check class names
    if (classStr.includes('outline') || classStr.includes('ghost')) return 'outline';
    if (classStr.includes('solid') || classStr.includes('filled')) return 'solid';
    if (classStr.includes('link') || classStr.includes('text')) return 'link';

    // Check styles
    if (styles.backgroundColor === 'transparent' ||
        styles.backgroundColor === 'rgba(0, 0, 0, 0)') {
      if (styles.borderWidth && styles.borderWidth !== '0px') return 'outline';
      return 'ghost';
    }

    return 'solid';
  }

  function inferVariantState(el) {
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') return 'disabled';
    if (el.classList.contains('loading') || el.getAttribute('aria-busy') === 'true') return 'loading';
    if (el.classList.contains('active') || el.getAttribute('aria-current')) return 'active';
    return 'default';
  }

  function inferButtonVariant(classStr, styles) {
    // Check class names for variant
    if (classStr.includes('primary') || classStr.includes('cta')) return 'primary';
    if (classStr.includes('secondary')) return 'secondary';
    if (classStr.includes('danger') || classStr.includes('destructive')) return 'danger';
    if (classStr.includes('success')) return 'success';
    if (classStr.includes('warning')) return 'warning';
    if (classStr.includes('ghost')) return 'ghost';
    if (classStr.includes('link')) return 'link';

    // Infer from colors
    const bg = styles.backgroundColor?.toLowerCase();
    if (bg) {
      // Common primary colors
      if (bg.includes('rgb(59, 130, 246)') || // blue-500
          bg.includes('rgb(37, 99, 235)') ||  // blue-600
          bg.includes('#3b82f6') || bg.includes('#2563eb')) {
        return 'primary';
      }
      // Red/danger colors
      if (bg.includes('rgb(239, 68, 68)') || bg.includes('#ef4444')) {
        return 'danger';
      }
      // Green/success colors
      if (bg.includes('rgb(34, 197, 94)') || bg.includes('#22c55e')) {
        return 'success';
      }
    }

    return 'default';
  }

  /**
   * Enhanced detectAll with smart detection
   */
  function detectAllEnhanced() {
    const allComponents = {};
    const summary = {
      totalComponents: 0,
      byType: {},
      byConfidence: { high: 0, medium: 0, low: 0 }
    };

    // First, run pattern-based detection
    for (const type of Object.keys(COMPONENT_PATTERNS)) {
      const components = detectComponents(type);
      if (components.length > 0) {
        allComponents[type] = components.map(c => {
          const variant = identifyVariant(c.element, type);
          return {
            selector: c.selector,
            rect: c.rect,
            text: c.text,
            styles: c.styles,
            variant,
            detectionMethod: 'pattern'
          };
        });
        summary.byType[type] = components.length;
        summary.totalComponents += components.length;
      }
    }

    // Then, scan for components missed by patterns
    const scannedElements = new Set();
    const interactiveSelectors = [
      '[onclick]', '[data-action]', '[role]',
      '[class*="btn"]', '[class*="card"]', '[class*="badge"]',
      '[class*="tag"]', '[class*="chip"]', '[class*="alert"]'
    ];

    for (const selector of interactiveSelectors) {
      try {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          if (scannedElements.has(el)) continue;
          if (!isVisible(el)) continue;
          scannedElements.add(el);

          // Check if already detected
          let alreadyDetected = false;
          for (const [type, items] of Object.entries(allComponents)) {
            if (items.some(item => item.selector === cssPath(el))) {
              alreadyDetected = true;
              break;
            }
          }
          if (alreadyDetected) continue;

          // Try smart detection
          const detection = smartDetect(el);
          if (detection && detection.confidence >= 0.5) {
            const type = detection.type;
            if (!allComponents[type]) {
              allComponents[type] = [];
              summary.byType[type] = 0;
            }

            const variant = identifyVariant(el, type);
            allComponents[type].push({
              selector: cssPath(el),
              rect: getRect(el),
              text: getTextContent(el),
              styles: extractStyles(el),
              variant,
              detection,
              detectionMethod: 'smart'
            });

            summary.byType[type]++;
            summary.totalComponents++;

            // Track confidence
            if (detection.confidence >= 0.8) summary.byConfidence.high++;
            else if (detection.confidence >= 0.6) summary.byConfidence.medium++;
            else summary.byConfidence.low++;
          }
        }
      } catch (e) {
        debugWarn('Error in enhanced detection:', selector, e.message);
      }
    }

    return {
      summary,
      components: allComponents,
      timestamp: Date.now(),
      url: location.href
    };
  }

  // ============================================
  // Component Detection (Original)
  // ============================================

  function detectComponents(type) {
    const pattern = COMPONENT_PATTERNS[type];
    if (!pattern) return [];

    const results = [];
    const seen = new Set();

    for (const selector of pattern.selectors) {
      try {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          if (seen.has(el)) continue;
          if (!isVisible(el)) continue;

          // Check exclude selectors
          if (pattern.excludeSelectors) {
            let excluded = false;
            for (const excl of pattern.excludeSelectors) {
              if (el.matches(excl)) {
                excluded = true;
                break;
              }
            }
            if (excluded) continue;
          }

          // Check size constraints
          if (!checkSizeConstraints(el, pattern)) continue;

          seen.add(el);
          results.push({
            type,
            element: el,
            selector: cssPath(el),
            rect: getRect(el),
            text: getTextContent(el),
            styles: extractStyles(el)
          });
        }
      } catch (e) {
        debugWarn('Error detecting components with selector:', selector, e.message);
      }
    }

    return results;
  }

  function detectAll() {
    const allComponents = {};
    const summary = {
      totalComponents: 0,
      byType: {}
    };

    for (const type of Object.keys(COMPONENT_PATTERNS)) {
      const components = detectComponents(type);
      if (components.length > 0) {
        allComponents[type] = components.map(c => ({
          selector: c.selector,
          rect: c.rect,
          text: c.text,
          styles: c.styles
        }));
        summary.byType[type] = components.length;
        summary.totalComponents += components.length;
      }
    }

    return {
      summary,
      components: allComponents,
      timestamp: Date.now(),
      url: location.href
    };
  }

  // ============================================
  // State Extraction
  // ============================================

  function extractStates(selector) {
    const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!el) return { ok: false, reason: 'Element not found' };

    const states = {
      default: extractStyles(el),
      hover: null,
      active: null,
      focus: null,
      focusVisible: null,
      disabled: null
    };

    // Get pseudo-class styles from stylesheets
    const sheets = document.styleSheets;
    const matchingRules = { hover: [], active: [], focus: [], focusVisible: [], disabled: [] };

    for (const sheet of sheets) {
      try {
        const rules = sheet.cssRules || sheet.rules;
        for (const rule of rules) {
          if (rule.type !== 1) continue; // CSSStyleRule

          const selectorText = rule.selectorText || '';

          // Check if this rule applies to our element
          if (selectorText.includes(':hover') && el.matches(selectorText.replace(/:hover/g, ''))) {
            matchingRules.hover.push(rule);
          }
          if (selectorText.includes(':active') && el.matches(selectorText.replace(/:active/g, ''))) {
            matchingRules.active.push(rule);
          }
          if (selectorText.includes(':focus') && !selectorText.includes(':focus-visible') && el.matches(selectorText.replace(/:focus/g, ''))) {
            matchingRules.focus.push(rule);
          }
          if (selectorText.includes(':focus-visible') && el.matches(selectorText.replace(/:focus-visible/g, ''))) {
            matchingRules.focusVisible.push(rule);
          }
          if (selectorText.includes(':disabled') && el.matches(selectorText.replace(/:disabled/g, ''))) {
            matchingRules.disabled.push(rule);
          }
        }
      } catch (e) {
        debugWarn('Cannot access stylesheet for state extraction (likely cross-origin):', sheet.href);
      }
    }

    // Extract styles from matching rules
    for (const [state, rules] of Object.entries(matchingRules)) {
      if (rules.length > 0) {
        const stateStyles = {};
        for (const rule of rules) {
          for (const prop of STYLE_PROPERTIES) {
            const kebab = prop.replace(/([A-Z])/g, '-$1').toLowerCase();
            const value = rule.style.getPropertyValue(kebab);
            if (value) {
              stateStyles[prop] = value;
            }
          }
        }
        if (Object.keys(stateStyles).length > 0) {
          states[state] = { ...states.default, ...stateStyles };
        }
      }
    }

    return {
      ok: true,
      selector: cssPath(el),
      states,
      hasHover: !!states.hover,
      hasActive: !!states.active,
      hasFocus: !!states.focus || !!states.focusVisible,
      hasDisabled: !!states.disabled
    };
  }

  // ============================================
  // Interactive State Capture (requires user interaction)
  // ============================================

  // Extract pseudo-class styles from stylesheets (safe, no side effects)
  function extractPseudoStyles(el, pseudoClass) {
    const styles = {};
    for (const sheet of document.styleSheets) {
      try {
        const rules = sheet.cssRules || sheet.rules;
        for (const rule of rules) {
          if (rule.type !== 1) continue;
          const selectorText = rule.selectorText || '';
          if (selectorText.includes(pseudoClass)) {
            const baseSelector = selectorText.replace(new RegExp(pseudoClass.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '');
            try {
              if (el.matches(baseSelector)) {
                for (const prop of STYLE_PROPERTIES) {
                  const kebab = prop.replace(/([A-Z])/g, '-$1').toLowerCase();
                  const value = rule.style.getPropertyValue(kebab);
                  if (value) styles[prop] = value;
                }
              }
            } catch (e) {
              debugWarn('Error matching selector:', baseSelector, e.message);
            }
          }
        }
      } catch (e) {
        debugWarn('Cannot access stylesheet for pseudo-styles (likely cross-origin):', sheet.href);
      }
    }
    return styles;
  }

  async function captureInteractiveStates(selector, options = {}) {
    const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!el) return { ok: false, reason: 'Element not found' };

    const timeout = options.timeout || 5000;
    const states = {
      default: extractStyles(el)
    };

    // Capture hover state
    if (options.captureHover !== false) {
      const hoverPromise = new Promise(resolve => {
        const handler = () => {
          states.hover = extractStyles(el);
          el.removeEventListener('mouseenter', handler);
          resolve();
        };
        el.addEventListener('mouseenter', handler);

        // Timeout
        setTimeout(() => {
          el.removeEventListener('mouseenter', handler);
          resolve();
        }, timeout);
      });

      // Trigger hover programmatically
      el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      await new Promise(r => setTimeout(r, 100));
      states.hover = extractStyles(el);
      el.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    }

    // Capture focus state
    if (options.captureFocus !== false && el.focus) {
      el.focus();
      await new Promise(r => setTimeout(r, 50));
      states.focus = extractStyles(el);
      el.blur();
    }

    // Capture active state using CSS class simulation instead of real events
    // This avoids triggering form submissions or navigation
    if (options.captureActive !== false) {
      // Try to extract :active styles from stylesheets instead of dispatching events
      const activeStyles = extractPseudoStyles(el, ':active');
      if (activeStyles && Object.keys(activeStyles).length > 0) {
        states.active = { ...states.default, ...activeStyles };
      }
    }

    return {
      ok: true,
      selector: cssPath(el),
      states,
      capturedAt: Date.now()
    };
  }

  // ============================================
  // Component Hierarchy Analysis
  // ============================================

  function analyzeHierarchy() {
    const components = detectAll().components;
    const hierarchy = {
      layout: [],
      containers: [],
      content: []
    };

    // Find layout components (header, nav, footer)
    if (components.header) {
      hierarchy.layout.push(...components.header.map(c => ({ ...c, role: 'header' })));
    }
    if (components.navigation) {
      hierarchy.layout.push(...components.navigation.map(c => ({ ...c, role: 'navigation' })));
    }
    if (components.footer) {
      hierarchy.layout.push(...components.footer.map(c => ({ ...c, role: 'footer' })));
    }

    // Find container components (hero, cards)
    if (components.hero) {
      hierarchy.containers.push(...components.hero.map(c => ({ ...c, role: 'hero' })));
    }
    if (components.card) {
      hierarchy.containers.push(...components.card.map(c => ({ ...c, role: 'card' })));
    }
    if (components.modal) {
      hierarchy.containers.push(...components.modal.map(c => ({ ...c, role: 'modal' })));
    }

    // Find content/interactive components
    if (components.button) {
      hierarchy.content.push(...components.button.map(c => ({ ...c, role: 'button' })));
    }
    if (components.input) {
      hierarchy.content.push(...components.input.map(c => ({ ...c, role: 'input' })));
    }
    if (components.badge) {
      hierarchy.content.push(...components.badge.map(c => ({ ...c, role: 'badge' })));
    }

    return {
      hierarchy,
      summary: {
        layoutComponents: hierarchy.layout.length,
        containerComponents: hierarchy.containers.length,
        contentComponents: hierarchy.content.length
      }
    };
  }

  // ============================================
  // Generate Component Report
  // ============================================

  function generateReport() {
    const detection = detectAll();
    const hierarchy = analyzeHierarchy();

    // Get detailed state info for key interactive components
    const interactiveDetails = {};

    if (detection.components.button?.length) {
      interactiveDetails.buttons = detection.components.button.slice(0, 5).map(b => ({
        ...b,
        states: extractStates(b.selector)
      }));
    }

    if (detection.components.input?.length) {
      interactiveDetails.inputs = detection.components.input.slice(0, 5).map(i => ({
        ...i,
        states: extractStates(i.selector)
      }));
    }

    if (detection.components.navItem?.length) {
      interactiveDetails.navItems = detection.components.navItem.slice(0, 5).map(n => ({
        ...n,
        states: extractStates(n.selector)
      }));
    }

    return {
      url: location.href,
      timestamp: Date.now(),
      summary: detection.summary,
      hierarchy: hierarchy.summary,
      components: detection.components,
      interactiveDetails
    };
  }

  // ============================================
  // Export
  // ============================================

  window.__seComponents = {
    installed: true,

    // Detection (original)
    detectAll,
    detectComponents,

    // Enhanced Detection (P1)
    detectAllEnhanced,
    smartDetect,
    identifyByVisualFeatures,
    identifyByInteraction,
    identifyByContext,
    identifyVariant,

    // State extraction
    extractStates,
    captureInteractiveStates,

    // Analysis
    analyzeHierarchy,
    generateReport,

    // Utilities
    cssPath,
    extractStyles,
    isVisible,

    // Constants
    COMPONENT_PATTERNS,
    STYLE_PROPERTIES
  };
})();
