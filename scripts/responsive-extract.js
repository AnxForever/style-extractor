// Style Extractor: Responsive Layout Module
// Captures layout changes across different viewports
//
// This module provides:
// 1. Multi-viewport layout extraction
// 2. Breakpoint-based style comparison
// 3. Layout pattern change detection
// 4. MCP workflow for viewport testing
//
// Usage:
//   window.__seResponsive.extractCurrentLayout()
//   window.__seResponsive.generateViewportWorkflow()
//   window.__seResponsive.compareLayouts(layout1, layout2)
//   window.__seResponsive.analyzeBreakpointChanges()

(() => {
  if (window.__seResponsive?.installed) return;

  const debug = (...args) => {
    if (window.__seDebug) console.log('[style-extractor:responsive]', ...args);
  };

  // ============================================
  // Standard Viewport Definitions
  // ============================================

  const STANDARD_VIEWPORTS = {
    mobile: { name: 'mobile', width: 375, height: 667, label: 'Mobile (iPhone SE)' },
    mobileLarge: { name: 'mobileLarge', width: 414, height: 896, label: 'Mobile Large (iPhone 11)' },
    tablet: { name: 'tablet', width: 768, height: 1024, label: 'Tablet (iPad)' },
    tabletLandscape: { name: 'tabletLandscape', width: 1024, height: 768, label: 'Tablet Landscape' },
    laptop: { name: 'laptop', width: 1280, height: 800, label: 'Laptop' },
    desktop: { name: 'desktop', width: 1440, height: 900, label: 'Desktop' },
    desktopLarge: { name: 'desktopLarge', width: 1920, height: 1080, label: 'Desktop Large (1080p)' }
  };

  // Common breakpoints
  const COMMON_BREAKPOINTS = [
    { name: 'xs', minWidth: 0, maxWidth: 479 },
    { name: 'sm', minWidth: 480, maxWidth: 639 },
    { name: 'md', minWidth: 640, maxWidth: 767 },
    { name: 'lg', minWidth: 768, maxWidth: 1023 },
    { name: 'xl', minWidth: 1024, maxWidth: 1279 },
    { name: '2xl', minWidth: 1280, maxWidth: Infinity }
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
  // Layout Extraction
  // ============================================

  /**
   * Extract current layout information
   */
  function extractCurrentLayout() {
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio
    };

    // Determine current breakpoint
    const currentBreakpoint = COMMON_BREAKPOINTS.find(bp =>
      viewport.width >= bp.minWidth && viewport.width <= bp.maxWidth
    )?.name || 'unknown';

    // Extract layout containers
    const layoutContainers = extractLayoutContainers();

    // Extract grid/flex layouts
    const gridLayouts = extractGridLayouts();
    const flexLayouts = extractFlexLayouts();

    // Extract visibility states
    const visibilityStates = extractVisibilityStates();

    // Extract sizing
    const sizingInfo = extractSizingInfo();

    return {
      viewport,
      breakpoint: currentBreakpoint,
      layoutContainers,
      gridLayouts,
      flexLayouts,
      visibilityStates,
      sizingInfo,
      timestamp: Date.now()
    };
  }

  /**
   * Extract main layout containers
   */
  function extractLayoutContainers() {
    const containers = [];
    const selectors = [
      // Capture primary page wrappers even when they don't have "container"/"wrapper" class names.
      'body > *',
      'header', 'nav', 'main', 'aside', 'footer',
      // Tailwind-style containers: max-w-* + mx-auto wrappers often carry responsive padding.
      '[class*=\"max-w-\"]', '[class*=\"mx-auto\"]',
      '[class*="container"]', '[class*="wrapper"]',
      '[class*="layout"]', '[class*="grid"]', '[class*="row"]'
    ];

    const seen = new Set();

    for (const selector of selectors) {
      try {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          if (seen.has(el)) continue;
          if (!isVisible(el)) continue;
          seen.add(el);

          const styles = getComputedStyle(el);
          containers.push({
            selector: cssPath(el),
            tag: el.tagName.toLowerCase(),
            rect: getRect(el),
            layout: {
              display: styles.display,
              position: styles.position,
              flexDirection: styles.flexDirection,
              gridTemplateColumns: styles.gridTemplateColumns,
              gap: styles.gap
            },
            sizing: {
              width: styles.width,
              maxWidth: styles.maxWidth,
              minWidth: styles.minWidth,
              padding: styles.padding,
              margin: styles.margin
            }
          });
        }
      } catch (e) {
        debug('Error extracting container:', selector, e.message);
      }
    }

    return containers;
  }

  /**
   * Extract grid layouts
   */
  function extractGridLayouts() {
    const grids = [];
    const elements = document.querySelectorAll('*');

    for (const el of elements) {
      const styles = getComputedStyle(el);
      if (styles.display !== 'grid' && styles.display !== 'inline-grid') continue;
      if (!isVisible(el)) continue;

      grids.push({
        selector: cssPath(el),
        rect: getRect(el),
        gridTemplateColumns: styles.gridTemplateColumns,
        gridTemplateRows: styles.gridTemplateRows,
        gridAutoFlow: styles.gridAutoFlow,
        gap: styles.gap,
        columnGap: styles.columnGap,
        rowGap: styles.rowGap,
        justifyItems: styles.justifyItems,
        alignItems: styles.alignItems,
        childCount: el.children.length
      });
    }

    return grids;
  }

  /**
   * Extract flex layouts
   */
  function extractFlexLayouts() {
    const flexes = [];
    const elements = document.querySelectorAll('*');

    for (const el of elements) {
      const styles = getComputedStyle(el);
      if (styles.display !== 'flex' && styles.display !== 'inline-flex') continue;
      if (!isVisible(el)) continue;

      flexes.push({
        selector: cssPath(el),
        rect: getRect(el),
        flexDirection: styles.flexDirection,
        flexWrap: styles.flexWrap,
        justifyContent: styles.justifyContent,
        alignItems: styles.alignItems,
        gap: styles.gap,
        childCount: el.children.length
      });
    }

    return flexes;
  }

  /**
   * Extract visibility states of key elements
   */
  function extractVisibilityStates() {
    const states = [];
    const selectors = [
      'nav', 'aside', '.sidebar', '[class*="sidebar"]',
      '.menu', '[class*="menu"]', '.mobile-menu',
      '[class*="hamburger"]', '[class*="toggle"]',
      '.hero', '[class*="hero"]',
      '[class*="hidden"]', '[class*="show"]', '[class*="visible"]'
    ];

    const seen = new Set();

    for (const selector of selectors) {
      try {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          if (seen.has(el)) continue;
          seen.add(el);

          const styles = getComputedStyle(el);
          const rect = el.getBoundingClientRect();

          states.push({
            selector: cssPath(el),
            isVisible: isVisible(el),
            display: styles.display,
            visibility: styles.visibility,
            opacity: styles.opacity,
            position: styles.position,
            rect: {
              width: Math.round(rect.width),
              height: Math.round(rect.height)
            }
          });
        }
      } catch (e) {
        debug('Error extracting visibility:', selector, e.message);
      }
    }

    return states;
  }

  /**
   * Extract sizing information for key elements
   */
  function extractSizingInfo() {
    const sizing = [];
    const selectors = [
      'body', 'main', '.container', '[class*="container"]',
      'h1', 'h2', 'p', 'img', 'button', '.btn'
    ];

    const seen = new Set();

    for (const selector of selectors) {
      try {
        const elements = document.querySelectorAll(selector);
        for (const el of Array.from(elements).slice(0, 5)) {
          if (seen.has(el)) continue;
          if (!isVisible(el)) continue;
          seen.add(el);

          const styles = getComputedStyle(el);
          sizing.push({
            selector: cssPath(el),
            tag: el.tagName.toLowerCase(),
            computed: {
              width: styles.width,
              height: styles.height,
              fontSize: styles.fontSize,
              lineHeight: styles.lineHeight,
              padding: styles.padding,
              margin: styles.margin
            },
            actual: getRect(el)
          });
        }
      } catch (e) {
        debug('Error extracting sizing:', selector, e.message);
      }
    }

    return sizing;
  }

  // ============================================
  // MCP Viewport Workflow
  // ============================================

  /**
   * Generate MCP workflow for multi-viewport extraction
   */
  function generateViewportWorkflow(viewports = ['mobile', 'tablet', 'desktop']) {
    const workflow = {
      description: 'Multi-viewport layout extraction workflow',
      viewports: viewports.map(v => STANDARD_VIEWPORTS[v] || STANDARD_VIEWPORTS.desktop),
      steps: []
    };

    // Step 1: Store current viewport
    workflow.steps.push({
      step: 1,
      action: 'store_current',
      instruction: 'Store current viewport dimensions for restoration',
      script: `() => {\n  const vp = { width: window.innerWidth, height: window.innerHeight };\n  window.__seResponsive.__originalViewport = vp;\n  return vp;\n}`
    });

    // Steps for each viewport
    let stepNum = 2;
    for (const vpName of viewports) {
      const vp = STANDARD_VIEWPORTS[vpName];
      if (!vp) continue;

      // Resize viewport
      workflow.steps.push({
        step: stepNum++,
        action: 'resize_viewport',
        viewport: vpName,
        instruction: `Resize viewport: ${vp.label} (${vp.width}x${vp.height})`,
        mcpTool: {
          // resize_page is more broadly supported than emulate across MCP implementations.
          name: 'mcp__chrome-devtools__resize_page',
          params: { width: vp.width, height: vp.height }
        }
      });

      // Wait for reflow
      workflow.steps.push({
        step: stepNum++,
        action: 'wait',
        instruction: 'Wait for layout reflow',
        duration: 500,
        script: `() => new Promise(r => setTimeout(r, 500))`
      });

      // Extract + store layout
      workflow.steps.push({
        step: stepNum++,
        action: 'extract_and_store',
        viewport: vpName,
        instruction: `Extract + store layout for ${vpName}`,
        script: `() => {\n  const layout = window.__seResponsive.extractCurrentLayout();\n  window.__seResponsive.storeLayout('${vpName}', layout);\n  return {\n    ok: true,\n    viewport: '${vpName}',\n    breakpoint: layout?.breakpoint || null,\n    width: layout?.viewport?.width || null,\n    height: layout?.viewport?.height || null,\n    gridCount: layout?.gridLayouts?.length || 0,\n    flexCount: layout?.flexLayouts?.length || 0\n  };\n}`
      });

      // Take screenshot
      workflow.steps.push({
        step: stepNum++,
        action: 'screenshot',
        viewport: vpName,
        instruction: `Take screenshot for ${vpName}`,
        note: 'Optional: take_screenshot can be flaky on some setups. Skip if it times out.',
        mcpTool: {
          name: 'mcp__chrome-devtools__take_screenshot',
          params: {}
        }
      });
    }

    // Final step: Restore original viewport
    workflow.steps.push({
      step: stepNum,
      action: 'restore',
      instruction: 'Restore original viewport dimensions (use stored window.__seResponsive.__originalViewport)',
      script: `() => window.__seResponsive.__originalViewport || null`,
      note: 'Resize the page back using mcp__chrome-devtools__resize_page with the returned width/height.'
    });

    return workflow;
  }

  /**
   * Store layout for later comparison
   */
  const layoutStore = new Map();

  function storeLayout(viewportName, layout) {
    layoutStore.set(viewportName, {
      ...layout,
      storedAt: Date.now()
    });
    return { ok: true, viewport: viewportName };
  }

  function getStoredLayout(viewportName) {
    return layoutStore.get(viewportName) || null;
  }

  function getAllStoredLayouts() {
    return Object.fromEntries(layoutStore);
  }

  function clearStoredLayouts() {
    layoutStore.clear();
    return { ok: true };
  }

  // ============================================
  // Layout Comparison
  // ============================================

  /**
   * Compare two layouts and find differences
   */
  function compareLayouts(layout1, layout2) {
    const changes = {
      viewport: {
        from: layout1.viewport,
        to: layout2.viewport
      },
      breakpoint: {
        from: layout1.breakpoint,
        to: layout2.breakpoint,
        changed: layout1.breakpoint !== layout2.breakpoint
      },
      layoutChanges: [],
      visibilityChanges: [],
      sizingChanges: []
    };

    // Compare grid layouts
    const grids1 = new Map(layout1.gridLayouts.map(g => [g.selector, g]));
    const grids2 = new Map(layout2.gridLayouts.map(g => [g.selector, g]));

    for (const [selector, grid1] of grids1) {
      const grid2 = grids2.get(selector);
      if (!grid2) {
        changes.layoutChanges.push({
          type: 'grid-removed',
          selector,
          from: grid1
        });
      } else if (grid1.gridTemplateColumns !== grid2.gridTemplateColumns) {
        changes.layoutChanges.push({
          type: 'grid-columns-changed',
          selector,
          from: grid1.gridTemplateColumns,
          to: grid2.gridTemplateColumns
        });
      }
    }

    // Compare flex layouts
    const flexes1 = new Map(layout1.flexLayouts.map(f => [f.selector, f]));
    const flexes2 = new Map(layout2.flexLayouts.map(f => [f.selector, f]));

    for (const [selector, flex1] of flexes1) {
      const flex2 = flexes2.get(selector);
      if (flex2 && flex1.flexDirection !== flex2.flexDirection) {
        changes.layoutChanges.push({
          type: 'flex-direction-changed',
          selector,
          from: flex1.flexDirection,
          to: flex2.flexDirection
        });
      }
      if (flex2 && flex1.flexWrap !== flex2.flexWrap) {
        changes.layoutChanges.push({
          type: 'flex-wrap-changed',
          selector,
          from: flex1.flexWrap,
          to: flex2.flexWrap
        });
      }
    }

    // Compare visibility
    const vis1 = new Map(layout1.visibilityStates.map(v => [v.selector, v]));
    const vis2 = new Map(layout2.visibilityStates.map(v => [v.selector, v]));

    for (const [selector, v1] of vis1) {
      const v2 = vis2.get(selector);
      if (v2 && v1.isVisible !== v2.isVisible) {
        changes.visibilityChanges.push({
          selector,
          from: v1.isVisible ? 'visible' : 'hidden',
          to: v2.isVisible ? 'visible' : 'hidden',
          displayFrom: v1.display,
          displayTo: v2.display
        });
      }
    }

    // Compare sizing
    const size1 = new Map(layout1.sizingInfo.map(s => [s.selector, s]));
    const size2 = new Map(layout2.sizingInfo.map(s => [s.selector, s]));

    for (const [selector, s1] of size1) {
      const s2 = size2.get(selector);
      if (!s2) continue;

      const widthDiff = Math.abs(s1.actual.width - s2.actual.width);
      const heightDiff = Math.abs(s1.actual.height - s2.actual.height);

      if (widthDiff > 50 || heightDiff > 50) {
        changes.sizingChanges.push({
          selector,
          tag: s1.tag,
          widthChange: {
            from: s1.actual.width,
            to: s2.actual.width,
            diff: s2.actual.width - s1.actual.width
          },
          heightChange: {
            from: s1.actual.height,
            to: s2.actual.height,
            diff: s2.actual.height - s1.actual.height
          }
        });
      }
    }

    // Summary
    changes.summary = {
      totalChanges: changes.layoutChanges.length +
                    changes.visibilityChanges.length +
                    changes.sizingChanges.length,
      hasLayoutChanges: changes.layoutChanges.length > 0,
      hasVisibilityChanges: changes.visibilityChanges.length > 0,
      hasSizingChanges: changes.sizingChanges.length > 0
    };

    return changes;
  }

  // ============================================
  // Breakpoint Analysis
  // ============================================

  /**
   * Analyze CSS breakpoints from stylesheets
   */
  function analyzeBreakpoints() {
    const breakpoints = new Map();
    const mediaQueries = [];

    for (const sheet of document.styleSheets) {
      try {
        const rules = sheet.cssRules || sheet.rules;
        for (const rule of rules) {
          if (rule.type === CSSRule.MEDIA_RULE) {
            const media = rule.conditionText || rule.media?.mediaText;
            if (!media) continue;

            mediaQueries.push(media);

            // Extract width breakpoints
            const minMatch = media.match(/min-width:\s*(\d+(?:\.\d+)?)(px|em|rem)/);
            const maxMatch = media.match(/max-width:\s*(\d+(?:\.\d+)?)(px|em|rem)/);

            if (minMatch) {
              const value = parseFloat(minMatch[1]);
              const unit = minMatch[2];
              const px = unit === 'px' ? value : value * 16;
              const key = `min-${Math.round(px)}`;

              if (!breakpoints.has(key)) {
                breakpoints.set(key, {
                  type: 'min-width',
                  value: `${minMatch[1]}${unit}`,
                  px: Math.round(px),
                  rulesCount: 0
                });
              }
              breakpoints.get(key).rulesCount++;
            }

            if (maxMatch) {
              const value = parseFloat(maxMatch[1]);
              const unit = maxMatch[2];
              const px = unit === 'px' ? value : value * 16;
              const key = `max-${Math.round(px)}`;

              if (!breakpoints.has(key)) {
                breakpoints.set(key, {
                  type: 'max-width',
                  value: `${maxMatch[1]}${unit}`,
                  px: Math.round(px),
                  rulesCount: 0
                });
              }
              breakpoints.get(key).rulesCount++;
            }
          }
        }
      } catch (e) {
        debug('Cannot access stylesheet:', sheet.href);
      }
    }

    // Sort breakpoints
    const sorted = Array.from(breakpoints.values())
      .sort((a, b) => a.px - b.px);

    // Infer breakpoint names
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
      count: sorted.length
    };
  }

  /**
   * Analyze what changes at each breakpoint
   */
  function analyzeBreakpointChanges() {
    const breakpointAnalysis = analyzeBreakpoints();
    const changes = [];

    // For each breakpoint, find rules that apply
    for (const sheet of document.styleSheets) {
      try {
        const rules = sheet.cssRules || sheet.rules;
        for (const rule of rules) {
          if (rule.type !== CSSRule.MEDIA_RULE) continue;

          const media = rule.conditionText || rule.media?.mediaText;
          if (!media) continue;

          const innerRules = [];
          for (const innerRule of rule.cssRules) {
            if (innerRule.type === 1) { // CSSStyleRule
              innerRules.push({
                selector: innerRule.selectorText,
                properties: Array.from({ length: innerRule.style.length })
                  .map((_, i) => innerRule.style[i])
              });
            }
          }

          if (innerRules.length > 0) {
            changes.push({
              mediaQuery: media,
              rulesCount: innerRules.length,
              selectors: innerRules.slice(0, 10).map(r => r.selector),
              commonProperties: findCommonProperties(innerRules)
            });
          }
        }
      } catch (e) {
        // Cross-origin
      }
    }

    return {
      breakpoints: breakpointAnalysis,
      changes,
      summary: {
        totalMediaQueries: changes.length,
        commonChanges: summarizeCommonChanges(changes)
      }
    };
  }

  function findCommonProperties(rules) {
    const propCounts = {};
    for (const rule of rules) {
      for (const prop of rule.properties) {
        propCounts[prop] = (propCounts[prop] || 0) + 1;
      }
    }

    return Object.entries(propCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([prop, count]) => ({ property: prop, count }));
  }

  function summarizeCommonChanges(changes) {
    const allProps = changes.flatMap(c => c.commonProperties.map(p => p.property));
    const propCounts = {};
    for (const prop of allProps) {
      propCounts[prop] = (propCounts[prop] || 0) + 1;
    }

    return Object.entries(propCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([prop, count]) => prop);
  }

  // ============================================
  // Responsive Documentation
  // ============================================

  /**
   * Generate responsive design documentation
   */
  function generateResponsiveDoc() {
    const currentLayout = extractCurrentLayout();
    const breakpointAnalysis = analyzeBreakpointChanges();

    return {
      currentViewport: {
        width: currentLayout.viewport.width,
        height: currentLayout.viewport.height,
        breakpoint: currentLayout.breakpoint
      },

      breakpoints: breakpointAnalysis.breakpoints.named,

      layoutPatterns: {
        grids: currentLayout.gridLayouts.length,
        flexes: currentLayout.flexLayouts.length,
        gridDetails: currentLayout.gridLayouts.slice(0, 5).map(g => ({
          selector: g.selector,
          columns: g.gridTemplateColumns
        })),
        flexDetails: currentLayout.flexLayouts.slice(0, 5).map(f => ({
          selector: f.selector,
          direction: f.flexDirection,
          wrap: f.flexWrap
        }))
      },

      responsiveChanges: breakpointAnalysis.summary.commonChanges,

      recommendations: generateResponsiveRecommendations(currentLayout, breakpointAnalysis)
    };
  }

  function generateResponsiveRecommendations(layout, analysis) {
    const recs = [];

    // Check for mobile-first
    const hasMinWidth = analysis.breakpoints.breakpoints.some(bp => bp.type === 'min-width');
    const hasMaxWidth = analysis.breakpoints.breakpoints.some(bp => bp.type === 'max-width');

    if (hasMaxWidth && !hasMinWidth) {
      recs.push('Consider using mobile-first approach (min-width) instead of max-width');
    }

    // Check for too many breakpoints
    if (analysis.breakpoints.count > 6) {
      recs.push(`${analysis.breakpoints.count} breakpoints detected - consider consolidating`);
    }

    // Check for flex/grid usage
    if (layout.gridLayouts.length === 0 && layout.flexLayouts.length === 0) {
      recs.push('No CSS Grid or Flexbox detected - consider using modern layout methods');
    }

    return recs;
  }

  // ============================================
  // Export
  // ============================================

  window.__seResponsive = {
    installed: true,
    version: '1.0.0',

    // Layout extraction
    extractCurrentLayout,
    extractLayoutContainers,
    extractGridLayouts,
    extractFlexLayouts,
    extractVisibilityStates,
    extractSizingInfo,

    // MCP workflow
    generateViewportWorkflow,

    // Layout storage
    storeLayout,
    getStoredLayout,
    getAllStoredLayouts,
    clearStoredLayouts,

    // Comparison
    compareLayouts,

    // Breakpoint analysis
    analyzeBreakpoints,
    analyzeBreakpointChanges,

    // Documentation
    generateResponsiveDoc,

    // Constants
    STANDARD_VIEWPORTS,
    COMMON_BREAKPOINTS
  };
})();
