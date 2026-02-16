// Style Extractor: Screenshot Integration
// Captures screenshots of key components during extraction
//
// This module provides screenshot utilities that work with:
// - Chrome DevTools MCP (take_screenshot)
// - Playwright MCP (browser_take_screenshot)
//
// Usage in evaluate_script:
//   window.__seScreenshot.getComponentRects()
//   window.__seScreenshot.generateScreenshotPlan()
//   window.__seScreenshot.markElement(selector)
//
// Note: Actual screenshot capture must be done via MCP tools,
// this script provides the coordinates and planning.

(() => {
  if (window.__seScreenshot?.installed) return;

  // Debug mode
  const debug = (...args) => {
    if (window.__seDebug) console.log('[style-extractor:screenshot]', ...args);
  };

  // ============================================
  // Helper Functions
  // ============================================

  function getRect(el) {
    const r = el.getBoundingClientRect();
    return {
      x: Math.round(r.x + window.scrollX),
      y: Math.round(r.y + window.scrollY),
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
      parts.unshift(part);
      if (cur.parentElement?.id) {
        parts.unshift(`#${CSS.escape(cur.parentElement.id)}`);
        break;
      }
      cur = cur.parentElement;
      depth++;
    }
    return parts.join(' > ');
  }

  // ============================================
  // Component Screenshot Planning
  // ============================================

  const SCREENSHOT_TARGETS = {
    // Layout components
    header: {
      selectors: ['header', '[role="banner"]', '.header'],
      priority: 1,
      description: 'Page header'
    },
    navigation: {
      selectors: ['nav', '[role="navigation"]', '.navbar', '.nav'],
      priority: 1,
      description: 'Navigation menu'
    },
    hero: {
      selectors: ['.hero', '[class*="hero"]', '.banner', '.jumbotron'],
      priority: 2,
      description: 'Hero section'
    },
    footer: {
      selectors: ['footer', '[role="contentinfo"]', '.footer'],
      priority: 2,
      description: 'Page footer'
    },

    // Interactive components
    button: {
      selectors: ['button.primary', '.btn-primary', 'button:not([class*="close"])'],
      priority: 1,
      description: 'Primary button',
      maxCount: 3
    },
    card: {
      selectors: ['.card', 'article.card', '[class*="card"]'],
      priority: 2,
      description: 'Card component',
      maxCount: 2
    },
    form: {
      selectors: ['form', '.form'],
      priority: 2,
      description: 'Form',
      maxCount: 1
    },
    input: {
      selectors: ['input[type="text"]', 'input[type="email"]', '.form-control'],
      priority: 3,
      description: 'Input field',
      maxCount: 2
    },
    modal: {
      selectors: ['.modal:not([style*="display: none"])', '[role="dialog"]'],
      priority: 1,
      description: 'Modal dialog',
      maxCount: 1
    }
  };

  /**
   * Get bounding rectangles for all key components
   */
  function getComponentRects() {
    const components = [];

    for (const [type, config] of Object.entries(SCREENSHOT_TARGETS)) {
      let found = 0;
      const maxCount = config.maxCount || 1;

      for (const selector of config.selectors) {
        if (found >= maxCount) break;

        try {
          const elements = document.querySelectorAll(selector);
          for (const el of elements) {
            if (found >= maxCount) break;
            if (!isVisible(el)) continue;

            const rect = getRect(el);
            // Skip very small elements
            if (rect.width < 50 || rect.height < 20) continue;

            components.push({
              type,
              selector: cssPath(el),
              rect,
              priority: config.priority,
              description: config.description
            });
            found++;
          }
        } catch (e) {
          debug('Error finding component:', selector, e.message);
        }
      }
    }

    // Sort by priority
    components.sort((a, b) => a.priority - b.priority);

    return components;
  }

  /**
   * Generate a screenshot plan for MCP tools
   */
  function generateScreenshotPlan(options = {}) {
    const components = getComponentRects();
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight
    };
    const pageHeight = document.documentElement.scrollHeight;

    const plan = {
      viewport,
      pageHeight,
      screenshots: []
    };

    // 1. Full page screenshot
    plan.screenshots.push({
      id: 'fullpage',
      type: 'fullpage',
      description: 'Full page screenshot',
      options: { fullPage: true }
    });

    // 2. Viewport screenshot
    plan.screenshots.push({
      id: 'viewport',
      type: 'viewport',
      description: 'Above-the-fold viewport',
      options: {}
    });

    // 3. Component screenshots
    for (const comp of components) {
      // Add padding around component
      const padding = options.padding || 20;
      const clip = {
        x: Math.max(0, comp.rect.x - padding),
        y: Math.max(0, comp.rect.y - padding),
        width: comp.rect.width + padding * 2,
        height: comp.rect.height + padding * 2
      };

      plan.screenshots.push({
        id: `${comp.type}-${plan.screenshots.length}`,
        type: 'element',
        component: comp.type,
        selector: comp.selector,
        description: comp.description,
        rect: comp.rect,
        clip,
        options: {
          // For Chrome DevTools MCP
          uid: null,  // Will be filled by MCP
          // For Playwright MCP
          element: comp.selector
        }
      });
    }

    return plan;
  }

  /**
   * Generate MCP commands for taking screenshots
   */
  function generateMCPCommands(plan, mcpType = 'chrome-devtools') {
    const commands = [];

    for (const shot of plan.screenshots) {
      if (mcpType === 'chrome-devtools') {
        // Chrome DevTools MCP format
        if (shot.type === 'fullpage') {
          commands.push({
            tool: 'take_screenshot',
            params: { fullPage: true },
            filename: `${shot.id}.png`
          });
        } else if (shot.type === 'viewport') {
          commands.push({
            tool: 'take_screenshot',
            params: {},
            filename: `${shot.id}.png`
          });
        } else {
          commands.push({
            tool: 'take_screenshot',
            params: { uid: shot.selector },
            filename: `${shot.id}.png`,
            note: `Selector: ${shot.selector}`
          });
        }
      } else if (mcpType === 'playwright') {
        // Playwright MCP format
        if (shot.type === 'fullpage') {
          commands.push({
            tool: 'browser_take_screenshot',
            params: { fullPage: true, type: 'png' },
            filename: `${shot.id}.png`
          });
        } else if (shot.type === 'viewport') {
          commands.push({
            tool: 'browser_take_screenshot',
            params: { type: 'png' },
            filename: `${shot.id}.png`
          });
        } else {
          commands.push({
            tool: 'browser_take_screenshot',
            params: {
              element: shot.description,
              ref: shot.selector,
              type: 'png'
            },
            filename: `${shot.id}.png`
          });
        }
      }
    }

    return commands;
  }

  // ============================================
  // Visual Markers (for debugging)
  // ============================================

  /**
   * Add visual marker to element (for debugging)
   */
  function markElement(selector, color = 'red') {
    const el = document.querySelector(selector);
    if (!el) return { success: false, error: 'Element not found' };

    const rect = getRect(el);
    const marker = document.createElement('div');
    marker.className = '__se-marker';
    marker.style.cssText = `
      position: absolute;
      left: ${rect.x}px;
      top: ${rect.y}px;
      width: ${rect.width}px;
      height: ${rect.height}px;
      border: 3px solid ${color};
      background: ${color}22;
      pointer-events: none;
      z-index: 999999;
      box-sizing: border-box;
    `;
    document.body.appendChild(marker);

    return {
      success: true,
      selector,
      rect,
      markerId: marker.className
    };
  }

  /**
   * Remove all visual markers
   */
  function clearMarkers() {
    const markers = document.querySelectorAll('.__se-marker');
    markers.forEach(m => m.remove());
    return { removed: markers.length };
  }

  /**
   * Mark all screenshot targets
   */
  function markAllTargets() {
    clearMarkers();
    const components = getComponentRects();
    const colors = {
      header: '#ff0000',
      navigation: '#00ff00',
      hero: '#0000ff',
      footer: '#ff00ff',
      button: '#ffff00',
      card: '#00ffff',
      form: '#ff8800',
      input: '#8800ff',
      modal: '#ff0088'
    };

    for (const comp of components) {
      markElement(comp.selector, colors[comp.type] || '#888888');
    }

    return {
      marked: components.length,
      components: components.map(c => ({ type: c.type, selector: c.selector }))
    };
  }

  // ============================================
  // State Capture Helpers
  // ============================================

  /**
   * Prepare element for hover state screenshot
   */
  function triggerHover(selector) {
    const el = document.querySelector(selector);
    if (!el) return { success: false, error: 'Element not found' };

    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    return {
      success: true,
      selector,
      note: 'Hover state triggered. Take screenshot now.'
    };
  }

  /**
   * Prepare element for focus state screenshot
   */
  function triggerFocus(selector) {
    const el = document.querySelector(selector);
    if (!el) return { success: false, error: 'Element not found' };

    el.focus();

    return {
      success: true,
      selector,
      note: 'Focus state triggered. Take screenshot now.'
    };
  }

  /**
   * Reset element states
   */
  function resetStates(selector) {
    const el = selector ? document.querySelector(selector) : document.activeElement;
    if (el) {
      el.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
      el.blur();
    }
    return { success: true };
  }

  // ============================================
  // Export
  // ============================================

  window.__seScreenshot = {
    installed: true,

    // Planning
    getComponentRects,
    generateScreenshotPlan,
    generateMCPCommands,

    // Visual markers
    markElement,
    clearMarkers,
    markAllTargets,

    // State triggers
    triggerHover,
    triggerFocus,
    resetStates,

    // Constants
    SCREENSHOT_TARGETS
  };
})();
