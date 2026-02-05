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
      } catch { }
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
  // Component Detection
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
      } catch { }
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
      } catch { }
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

    // Capture active state (harder - need to hold mousedown)
    if (options.captureActive !== false) {
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await new Promise(r => setTimeout(r, 50));
      states.active = extractStyles(el);
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
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

    // Detection
    detectAll,
    detectComponents,

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
