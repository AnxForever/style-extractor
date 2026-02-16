// Style Extractor: Structure Extractor
// Extracts website DOM structure, layout patterns, and semantic hierarchy
//
// This module enables website replication by capturing:
// 1. DOM tree structure with element metadata
// 2. Layout patterns (grid/flex/float/positioned)
// 3. Responsive breakpoints from CSS media queries
// 4. Semantic structure (ARIA landmarks, heading hierarchy)
//
// Usage in evaluate_script:
//   window.__seStructure.extractDOM(options)
//   window.__seStructure.analyzeLayoutPatterns()
//   window.__seStructure.extractBreakpoints()
//   window.__seStructure.analyzeSemanticStructure()
//   window.__seStructure.extract()

(() => {
  if (window.__seStructure?.installed) return;

  // Debug mode - set window.__seDebug = true to enable logging
  const debug = (...args) => {
    if (window.__seDebug) console.log('[style-extractor:structure]', ...args);
  };
  const debugWarn = (...args) => {
    if (window.__seDebug) console.warn('[style-extractor:structure]', ...args);
  };

  // ============================================
  // Helper Functions (reused from component-detect.js)
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

  // ============================================
  // DOM Tree Extraction
  // ============================================

  const DEFAULT_DOM_OPTIONS = {
    maxDepth: 10,
    includeText: true,
    includeStyles: true,
    includeRect: true,
    skipTags: ['script', 'style', 'noscript', 'svg', 'path', 'link', 'meta'],
    minWidth: 10,
    minHeight: 10,
    includeShadowDOM: true,  // NEW: 穿透 Shadow DOM
    shadowDepth: 3           // NEW: Shadow DOM 最大嵌套深度
  };

  function extractDOMNode(el, depth, options, shadowDepth = 0) {
    if (!el || el.nodeType !== 1) return null;
    if (depth > options.maxDepth) return null;

    const tag = el.tagName.toLowerCase();
    if (options.skipTags.includes(tag)) return null;

    // Skip invisible elements
    const rect = getRect(el);
    if (rect.width < options.minWidth || rect.height < options.minHeight) {
      // Still process children - parent might be a wrapper
      if (el.children.length === 0 && !el.shadowRoot) return null;
    }

    const node = {
      tag,
      id: el.id || null,
      classes: el.classList?.length ? Array.from(el.classList) : null,
      role: el.getAttribute('role') || null,
      ariaLabel: el.getAttribute('aria-label') || null
    };

    // Mark if this is a shadow host
    if (el.shadowRoot) {
      node.hasShadowRoot = true;
    }

    // Include rect if requested
    if (options.includeRect) {
      node.rect = rect;
    }

    // Include text content for leaf nodes
    if (options.includeText && el.children.length === 0 && !el.shadowRoot) {
      const text = (el.innerText || el.textContent || '').trim();
      if (text) {
        node.text = text.slice(0, 100);
      }
    }

    // Include computed styles if requested
    if (options.includeStyles) {
      const s = getComputedStyle(el);
      node.layout = detectLayoutType(el, s);
      node.styles = {
        display: s.display,
        position: s.position,
        flexDirection: s.flexDirection !== 'row' ? s.flexDirection : null,
        gridTemplateColumns: s.gridTemplateColumns !== 'none' ? s.gridTemplateColumns : null,
        gap: s.gap !== 'normal' && s.gap !== '0px' ? s.gap : null
      };
      // Clean up null values
      Object.keys(node.styles).forEach(k => {
        if (node.styles[k] === null) delete node.styles[k];
      });
      if (Object.keys(node.styles).length === 0) delete node.styles;
    }

    // Process Shadow DOM if enabled and present
    if (options.includeShadowDOM && el.shadowRoot && shadowDepth < options.shadowDepth) {
      const shadowChildren = [];
      for (const child of el.shadowRoot.children) {
        const childNode = extractDOMNode(child, depth + 1, options, shadowDepth + 1);
        if (childNode) {
          shadowChildren.push(childNode);
        }
      }
      if (shadowChildren.length > 0) {
        node.shadowChildren = shadowChildren;
        node.shadowMode = el.shadowRoot.mode; // 'open' or 'closed'
      }
    }

    // Process regular children
    if (el.children.length > 0 && depth < options.maxDepth) {
      const children = [];
      for (const child of el.children) {
        const childNode = extractDOMNode(child, depth + 1, options, shadowDepth);
        if (childNode) {
          children.push(childNode);
        }
      }
      if (children.length > 0) {
        node.children = children;
      }
    }

    return node;
  }

  function extractDOM(options = {}) {
    const opts = { ...DEFAULT_DOM_OPTIONS, ...options };
    debug('Extracting DOM with options:', opts);

    const root = document.body;
    const tree = extractDOMNode(root, 0, opts);

    return {
      url: location.href,
      title: document.title,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      tree,
      extractedAt: Date.now()
    };
  }

  // ============================================
  // Layout Pattern Analysis
  // ============================================

  function detectLayoutType(el, computedStyle) {
    const s = computedStyle || getComputedStyle(el);
    const display = s.display;
    const position = s.position;

    if (display === 'grid' || display === 'inline-grid') {
      return 'grid';
    }
    if (display === 'flex' || display === 'inline-flex') {
      return 'flex';
    }
    if (position === 'absolute' || position === 'fixed') {
      return 'positioned';
    }
    if (s.float !== 'none') {
      return 'float';
    }
    if (display === 'block' || display === 'inline-block') {
      return 'block';
    }
    return 'inline';
  }

  function analyzeLayoutPatterns() {
    const patterns = {
      grid: [],
      flex: [],
      positioned: [],
      float: [],
      block: []
    };

    // Target structural elements
    const selectors = [
      'header', 'nav', 'main', 'section', 'article', 'aside', 'footer',
      'div[class]', '[class*="container"]', '[class*="wrapper"]',
      '[class*="grid"]', '[class*="flex"]', '[class*="row"]', '[class*="col"]'
    ];

    const seen = new Set();

    for (const selector of selectors) {
      try {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          if (seen.has(el)) continue;
          if (!isVisible(el)) continue;
          seen.add(el);

          const s = getComputedStyle(el);
          const layoutType = detectLayoutType(el, s);

          if (layoutType === 'grid' || layoutType === 'flex') {
            const info = {
              selector: cssPath(el),
              rect: getRect(el),
              type: layoutType
            };

            if (layoutType === 'grid') {
              info.columns = s.gridTemplateColumns;
              info.rows = s.gridTemplateRows;
              info.gap = s.gap;
              patterns.grid.push(info);
            } else {
              info.direction = s.flexDirection;
              info.wrap = s.flexWrap;
              info.justify = s.justifyContent;
              info.align = s.alignItems;
              info.gap = s.gap;
              patterns.flex.push(info);
            }
          } else if (layoutType === 'positioned') {
            patterns.positioned.push({
              selector: cssPath(el),
              rect: getRect(el),
              position: s.position,
              top: s.top,
              right: s.right,
              bottom: s.bottom,
              left: s.left,
              zIndex: s.zIndex
            });
          }
        }
      } catch (e) {
        debugWarn('Error analyzing layout for selector:', selector, e.message);
      }
    }

    // Summarize patterns
    const summary = {
      gridCount: patterns.grid.length,
      flexCount: patterns.flex.length,
      positionedCount: patterns.positioned.length,
      primaryLayout: patterns.flex.length > patterns.grid.length ? 'flex' : 'grid'
    };

    return {
      patterns,
      summary,
      timestamp: Date.now()
    };
  }

  // ============================================
  // Responsive Breakpoints Extraction
  // ============================================

  function extractBreakpoints() {
    const breakpoints = new Map();
    const mediaQueries = [];

    // Extract from stylesheets
    for (const sheet of document.styleSheets) {
      try {
        const rules = sheet.cssRules || sheet.rules;
        for (const rule of rules) {
          if (rule.type === CSSRule.MEDIA_RULE) {
            const media = rule.conditionText || rule.media?.mediaText;
            if (media) {
              mediaQueries.push(media);

              // Extract width breakpoints
              const minMatch = media.match(/min-width:\s*(\d+(?:\.\d+)?)(px|em|rem)/);
              const maxMatch = media.match(/max-width:\s*(\d+(?:\.\d+)?)(px|em|rem)/);

              if (minMatch) {
                const value = parseFloat(minMatch[1]);
                const unit = minMatch[2];
                const px = unit === 'px' ? value : value * 16;
                breakpoints.set(`min-${px}`, {
                  type: 'min-width',
                  value: `${minMatch[1]}${unit}`,
                  px: Math.round(px),
                  query: media
                });
              }

              if (maxMatch) {
                const value = parseFloat(maxMatch[1]);
                const unit = maxMatch[2];
                const px = unit === 'px' ? value : value * 16;
                breakpoints.set(`max-${px}`, {
                  type: 'max-width',
                  value: `${maxMatch[1]}${unit}`,
                  px: Math.round(px),
                  query: media
                });
              }
            }
          }
        }
      } catch (e) {
        debugWarn('Cannot access stylesheet for breakpoints (likely cross-origin):', sheet.href);
      }
    }

    // Sort breakpoints by pixel value
    const sorted = Array.from(breakpoints.values())
      .sort((a, b) => a.px - b.px);

    // Infer common breakpoint names
    const named = {};
    for (const bp of sorted) {
      if (bp.type === 'min-width') {
        if (bp.px <= 480) named.xs = bp;
        else if (bp.px <= 640) named.sm = bp;
        else if (bp.px <= 768) named.md = bp;
        else if (bp.px <= 1024) named.lg = bp;
        else if (bp.px <= 1280) named.xl = bp;
        else named['2xl'] = bp;
      }
    }

    return {
      breakpoints: sorted,
      named,
      mediaQueries: [...new Set(mediaQueries)],
      count: sorted.length,
      timestamp: Date.now()
    };
  }

  // ============================================
  // Semantic Structure Analysis
  // ============================================

  function analyzeSemanticStructure() {
    const structure = {
      landmarks: [],
      headings: [],
      navigation: [],
      forms: [],
      regions: []
    };

    // ARIA Landmarks
    const landmarkRoles = [
      'banner', 'navigation', 'main', 'complementary',
      'contentinfo', 'search', 'form', 'region'
    ];

    for (const role of landmarkRoles) {
      const elements = document.querySelectorAll(`[role="${role}"]`);
      for (const el of elements) {
        if (!isVisible(el)) continue;
        structure.landmarks.push({
          role,
          selector: cssPath(el),
          rect: getRect(el),
          label: el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || null
        });
      }
    }

    // Semantic HTML elements as landmarks
    const semanticLandmarks = {
      header: 'banner',
      nav: 'navigation',
      main: 'main',
      aside: 'complementary',
      footer: 'contentinfo'
    };

    for (const [tag, role] of Object.entries(semanticLandmarks)) {
      const elements = document.querySelectorAll(tag);
      for (const el of elements) {
        if (!isVisible(el)) continue;
        // Skip if already has explicit role
        if (el.getAttribute('role')) continue;
        structure.landmarks.push({
          role,
          tag,
          selector: cssPath(el),
          rect: getRect(el),
          implicit: true
        });
      }
    }

    // Heading hierarchy
    for (let level = 1; level <= 6; level++) {
      const headings = document.querySelectorAll(`h${level}`);
      for (const h of headings) {
        if (!isVisible(h)) continue;
        structure.headings.push({
          level,
          text: (h.innerText || h.textContent || '').trim().slice(0, 100),
          selector: cssPath(h),
          rect: getRect(h)
        });
      }
    }

    // Navigation structure
    const navs = document.querySelectorAll('nav, [role="navigation"]');
    for (const nav of navs) {
      if (!isVisible(nav)) continue;
      const links = nav.querySelectorAll('a');
      structure.navigation.push({
        selector: cssPath(nav),
        rect: getRect(nav),
        label: nav.getAttribute('aria-label') || null,
        linkCount: links.length,
        links: Array.from(links).slice(0, 10).map(a => ({
          text: (a.innerText || a.textContent || '').trim().slice(0, 50),
          href: a.getAttribute('href')
        }))
      });
    }

    // Forms
    const forms = document.querySelectorAll('form');
    for (const form of forms) {
      if (!isVisible(form)) continue;
      const inputs = form.querySelectorAll('input, textarea, select');
      structure.forms.push({
        selector: cssPath(form),
        rect: getRect(form),
        action: form.getAttribute('action') || null,
        method: form.getAttribute('method') || 'get',
        fieldCount: inputs.length,
        fields: Array.from(inputs).slice(0, 10).map(input => ({
          type: input.type || input.tagName.toLowerCase(),
          name: input.name || null,
          label: input.getAttribute('aria-label') ||
                 document.querySelector(`label[for="${input.id}"]`)?.textContent?.trim() || null
        }))
      });
    }

    // Summary
    const summary = {
      landmarkCount: structure.landmarks.length,
      headingCount: structure.headings.length,
      navCount: structure.navigation.length,
      formCount: structure.forms.length,
      hasProperHeadingHierarchy: checkHeadingHierarchy(structure.headings),
      hasMainLandmark: structure.landmarks.some(l => l.role === 'main'),
      hasNavigation: structure.navigation.length > 0
    };

    return {
      structure,
      summary,
      timestamp: Date.now()
    };
  }

  function checkHeadingHierarchy(headings) {
    if (headings.length === 0) return false;
    // Check if starts with h1 and doesn't skip levels
    const levels = headings.map(h => h.level).sort((a, b) => a - b);
    if (levels[0] !== 1) return false;
    for (let i = 1; i < levels.length; i++) {
      if (levels[i] - levels[i - 1] > 1) return false;
    }
    return true;
  }

  // ============================================
  // Component Boundary Detection
  // ============================================

  function detectComponentBoundaries() {
    const components = [];

    // Component patterns to detect
    const patterns = [
      { name: 'Header', selectors: ['header', '[role="banner"]', '.header', '[class*="header"]'] },
      { name: 'Navigation', selectors: ['nav', '[role="navigation"]', '.nav', '.navbar'] },
      { name: 'Hero', selectors: ['.hero', '[class*="hero"]', '.banner', '.jumbotron'] },
      { name: 'Main', selectors: ['main', '[role="main"]', '.main-content'] },
      { name: 'Sidebar', selectors: ['aside', '[role="complementary"]', '.sidebar', '[class*="sidebar"]'] },
      { name: 'Footer', selectors: ['footer', '[role="contentinfo"]', '.footer', '[class*="footer"]'] },
      { name: 'Card', selectors: ['.card', '[class*="card"]', 'article', '.tile'] },
      { name: 'Section', selectors: ['section', '.section', '[class*="section"]'] }
    ];

    const seen = new Set();

    for (const pattern of patterns) {
      for (const selector of pattern.selectors) {
        try {
          const elements = document.querySelectorAll(selector);
          for (const el of elements) {
            if (seen.has(el)) continue;
            if (!isVisible(el)) continue;

            const rect = getRect(el);
            // Skip very small elements
            if (rect.width < 100 || rect.height < 50) continue;

            seen.add(el);
            components.push({
              name: pattern.name,
              selector: cssPath(el),
              rect,
              tag: el.tagName.toLowerCase(),
              classes: el.classList?.length ? Array.from(el.classList).slice(0, 5) : null,
              childCount: el.children.length
            });
          }
        } catch (e) {
          debugWarn('Error detecting component:', selector, e.message);
        }
      }
    }

    // Sort by vertical position
    components.sort((a, b) => a.rect.y - b.rect.y);

    return {
      components,
      count: components.length,
      timestamp: Date.now()
    };
  }

  // ============================================
  // Full Extraction
  // ============================================

  function extract(options = {}) {
    debug('Starting full structure extraction');

    const domOptions = options.dom || {};
    const dom = extractDOM(domOptions);
    const layout = analyzeLayoutPatterns();
    const breakpoints = extractBreakpoints();
    const semantic = analyzeSemanticStructure();
    const componentBoundaries = detectComponentBoundaries();
    const shadowDOM = analyzeShadowDOM();  // NEW

    return {
      meta: {
        url: location.href,
        title: document.title,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        },
        extractedAt: new Date().toISOString()
      },
      dom,
      layout,
      breakpoints,
      semantic,
      componentBoundaries,
      shadowDOM,  // NEW
      summary: {
        domDepth: calculateMaxDepth(dom.tree),
        layoutType: layout.summary.primaryLayout,
        breakpointCount: breakpoints.count,
        landmarkCount: semantic.summary.landmarkCount,
        componentCount: componentBoundaries.count,
        shadowHostCount: shadowDOM.analysis.hostCount,  // NEW
        customElementCount: shadowDOM.analysis.customElements.length  // NEW
      }
    };
  }

  function calculateMaxDepth(node, depth = 0) {
    if (!node || !node.children) return depth;
    let maxChildDepth = depth;
    for (const child of node.children) {
      const childDepth = calculateMaxDepth(child, depth + 1);
      if (childDepth > maxChildDepth) maxChildDepth = childDepth;
    }
    // Also check shadow children
    if (node.shadowChildren) {
      for (const child of node.shadowChildren) {
        const childDepth = calculateMaxDepth(child, depth + 1);
        if (childDepth > maxChildDepth) maxChildDepth = childDepth;
      }
    }
    return maxChildDepth;
  }

  // ============================================
  // Shadow DOM Utilities
  // ============================================

  /**
   * Find all elements with Shadow DOM in the document
   */
  function findShadowHosts(root = document.body) {
    const hosts = [];

    function traverse(el) {
      if (!el || el.nodeType !== 1) return;

      if (el.shadowRoot) {
        hosts.push({
          element: el,
          selector: cssPath(el),
          tag: el.tagName.toLowerCase(),
          mode: el.shadowRoot.mode,
          childCount: el.shadowRoot.children.length
        });

        // Traverse inside shadow root
        for (const child of el.shadowRoot.children) {
          traverse(child);
        }
      }

      // Traverse regular children
      for (const child of el.children) {
        traverse(child);
      }
    }

    traverse(root);
    return hosts;
  }

  /**
   * Query selector that works across Shadow DOM boundaries
   */
  function querySelectorDeep(selector, root = document) {
    const results = [];

    function searchInRoot(searchRoot) {
      try {
        const matches = searchRoot.querySelectorAll(selector);
        results.push(...matches);
      } catch (e) {
        debugWarn('querySelectorDeep error:', e.message);
      }

      // Search in shadow roots
      const allElements = searchRoot.querySelectorAll('*');
      for (const el of allElements) {
        if (el.shadowRoot) {
          searchInRoot(el.shadowRoot);
        }
      }
    }

    searchInRoot(root);
    return results;
  }

  /**
   * Get computed styles from element, even inside Shadow DOM
   */
  function getStylesDeep(el) {
    if (!el || el.nodeType !== 1) return null;

    const styles = {};
    const computed = getComputedStyle(el);

    // Extract key style properties
    const props = [
      'display', 'position', 'width', 'height',
      'padding', 'margin', 'backgroundColor', 'color',
      'fontSize', 'fontFamily', 'borderRadius', 'boxShadow'
    ];

    for (const prop of props) {
      const value = computed[prop];
      if (value && value !== 'none' && value !== 'auto' && value !== '0px') {
        styles[prop] = value;
      }
    }

    return styles;
  }

  /**
   * Analyze Shadow DOM usage in the page
   */
  function analyzeShadowDOM() {
    const hosts = findShadowHosts();

    const analysis = {
      hostCount: hosts.length,
      hosts: hosts.map(h => ({
        selector: h.selector,
        tag: h.tag,
        mode: h.mode,
        childCount: h.childCount
      })),
      customElements: [],
      webComponents: []
    };

    // Detect custom elements (elements with hyphens in tag name)
    const allElements = document.querySelectorAll('*');
    const customTags = new Set();

    for (const el of allElements) {
      const tag = el.tagName.toLowerCase();
      if (tag.includes('-')) {
        customTags.add(tag);
      }
    }

    analysis.customElements = Array.from(customTags);

    // Identify known web component libraries
    const knownLibraries = {
      'sl-': 'Shoelace',
      'md-': 'Material Web',
      'mwc-': 'Material Web Components',
      'ion-': 'Ionic',
      'vaadin-': 'Vaadin',
      'lit-': 'Lit',
      'fast-': 'FAST',
      'fluent-': 'Fluent UI'
    };

    for (const tag of customTags) {
      for (const [prefix, library] of Object.entries(knownLibraries)) {
        if (tag.startsWith(prefix)) {
          if (!analysis.webComponents.includes(library)) {
            analysis.webComponents.push(library);
          }
          break;
        }
      }
    }

    return {
      analysis,
      hasShadowDOM: hosts.length > 0,
      hasCustomElements: customTags.size > 0,
      timestamp: Date.now()
    };
  }

  // ============================================
  // Export
  // ============================================

  window.__seStructure = {
    installed: true,

    // Core extraction
    extractDOM,
    analyzeLayoutPatterns,
    extractBreakpoints,
    analyzeSemanticStructure,
    detectComponentBoundaries,

    // Full extraction
    extract,

    // Shadow DOM utilities (NEW)
    findShadowHosts,
    querySelectorDeep,
    getStylesDeep,
    analyzeShadowDOM,

    // Utilities
    cssPath,
    getRect,
    isVisible,
    detectLayoutType
  };
})();
