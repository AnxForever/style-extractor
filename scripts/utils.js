// Style Extractor: Shared Utilities
// Common utility functions used across all extraction modules
//
// This module provides:
// 1. DOM utilities (cssPath, getRect, isVisible)
// 2. Debug logging
// 3. Result caching
// 4. Standardized response format
//
// Usage: Load this script FIRST, then other modules can use window.__seUtils

(() => {
  if (window.__seUtils?.installed) return;

  // ============================================
  // Debug Logging
  // ============================================

  const createLogger = (namespace) => ({
    log: (...args) => {
      if (window.__seDebug) console.log(`[style-extractor:${namespace}]`, ...args);
    },
    warn: (...args) => {
      if (window.__seDebug) console.warn(`[style-extractor:${namespace}]`, ...args);
    },
    error: (...args) => {
      console.error(`[style-extractor:${namespace}]`, ...args);
    }
  });

  // ============================================
  // DOM Utilities
  // ============================================

  /**
   * Generate a CSS selector path for an element
   */
  function cssPath(el) {
    if (!el || el.nodeType !== 1) return null;
    if (el.id) return `#${CSS.escape(el.id)}`;

    const parts = [];
    let cur = el;
    let depth = 0;

    while (cur && cur.nodeType === 1 && depth < 5) {
      let part = cur.tagName.toLowerCase();
      if (cur.classList?.length) {
        part += Array.from(cur.classList)
          .slice(0, 2)
          .map(c => `.${CSS.escape(c)}`)
          .join('');
      }
      const parent = cur.parentElement;
      if (parent) {
        const same = Array.from(parent.children).filter(c => c.tagName === cur.tagName);
        if (same.length > 1) {
          part += `:nth-of-type(${same.indexOf(cur) + 1})`;
        }
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

  /**
   * Get bounding rectangle of an element (with scroll offset)
   */
  function getRect(el) {
    const r = el.getBoundingClientRect();
    return {
      x: Math.round(r.x),
      y: Math.round(r.y),
      width: Math.round(r.width),
      height: Math.round(r.height)
    };
  }

  /**
   * Get bounding rectangle with scroll offset (absolute position)
   */
  function getAbsoluteRect(el) {
    const r = el.getBoundingClientRect();
    return {
      x: Math.round(r.x + window.scrollX),
      y: Math.round(r.y + window.scrollY),
      width: Math.round(r.width),
      height: Math.round(r.height)
    };
  }

  /**
   * Check if an element is visible
   */
  function isVisible(el) {
    if (!el || el.nodeType !== 1) return false;
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
  // Caching
  // ============================================

  const cache = {
    computedStyles: new WeakMap(),
    cssSelectors: new WeakMap(),
    rects: new WeakMap()
  };

  /**
   * Get cached computed style for an element
   */
  function getCachedStyle(el) {
    if (!cache.computedStyles.has(el)) {
      cache.computedStyles.set(el, getComputedStyle(el));
    }
    return cache.computedStyles.get(el);
  }

  /**
   * Get cached CSS selector for an element
   */
  function getCachedSelector(el) {
    if (!cache.cssSelectors.has(el)) {
      cache.cssSelectors.set(el, cssPath(el));
    }
    return cache.cssSelectors.get(el);
  }

  /**
   * Get cached rect for an element
   */
  function getCachedRect(el) {
    if (!cache.rects.has(el)) {
      cache.rects.set(el, getRect(el));
    }
    return cache.rects.get(el);
  }

  /**
   * Clear all caches (call after DOM changes)
   */
  function clearCache() {
    cache.computedStyles = new WeakMap();
    cache.cssSelectors = new WeakMap();
    cache.rects = new WeakMap();
  }

  // ============================================
  // Standardized Response Format
  // ============================================

  /**
   * Create a success response
   */
  function success(data, warnings = []) {
    return {
      success: true,
      data,
      warnings,
      timestamp: Date.now()
    };
  }

  /**
   * Create an error response
   */
  function error(message, details = null) {
    return {
      success: false,
      error: message,
      details,
      timestamp: Date.now()
    };
  }

  /**
   * Wrap a function to return standardized response
   */
  function wrapWithResponse(fn, logger) {
    return function(...args) {
      try {
        const result = fn.apply(this, args);
        return success(result);
      } catch (e) {
        if (logger) logger.error('Error:', e.message);
        return error(e.message, { stack: e.stack });
      }
    };
  }

  // ============================================
  // Color Utilities
  // ============================================

  /**
   * Convert RGB to Hex
   */
  function rgbToHex(rgb) {
    if (!rgb || typeof rgb !== 'string') return rgb;
    const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (!match) return rgb;
    const [, r, g, b, a] = match;
    const hex = '#' + [r, g, b].map(x => parseInt(x).toString(16).padStart(2, '0')).join('');
    if (a !== undefined && parseFloat(a) < 1) {
      const alpha = Math.round(parseFloat(a) * 255).toString(16).padStart(2, '0');
      return hex + alpha;
    }
    return hex;
  }

  /**
   * Check if a color is dark (luminance < 0.5)
   */
  function isColorDark(color) {
    if (!color || color === 'transparent') return false;
    const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!match) {
      // Try hex
      const hex = color.replace('#', '');
      if (hex.length >= 6) {
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return luminance < 0.5;
      }
      return false;
    }
    const [, r, g, b] = match.map(Number);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance < 0.5;
  }

  /**
   * Check if a value is a color
   */
  function isColorValue(value) {
    if (!value) return false;
    return /^#[0-9a-f]{3,8}$/i.test(value) ||
           value.startsWith('rgb') ||
           value.startsWith('hsl') ||
           value.startsWith('oklch') ||
           value.startsWith('lab');
  }

  // ============================================
  // String Utilities
  // ============================================

  function slugify(str) {
    if (!str) return 'unknown';
    return str
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  function toKebabCase(str) {
    if (!str) return '';
    return str
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .replace(/[\s_]+/g, '-')
      .toLowerCase();
  }

  function toCamelCase(str) {
    if (!str) return '';
    return str.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  }

  function toPascalCase(str) {
    if (!str) return 'Component';
    return str
      .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
      .replace(/^(.)/, (_, c) => c.toUpperCase());
  }

  // ============================================
  // Timing Utilities
  // ============================================

  /**
   * Parse duration string to milliseconds
   */
  function parseDuration(duration) {
    if (!duration) return null;
    if (typeof duration === 'number') return duration;
    const match = String(duration).match(/([\d.]+)(ms|s)?/);
    if (!match) return null;
    const [, value, unit] = match;
    return unit === 's' ? parseFloat(value) * 1000 : parseFloat(value);
  }

  // ============================================
  // Deep Comparison
  // ============================================

  function deepEqual(a, b) {
    if (a === b) return true;
    if (a === null || b === null) return false;
    if (typeof a !== typeof b) return false;

    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((val, i) => deepEqual(val, b[i]));
    }

    if (typeof a === 'object') {
      const keysA = Object.keys(a);
      const keysB = Object.keys(b);
      if (keysA.length !== keysB.length) return false;
      return keysA.every(key => deepEqual(a[key], b[key]));
    }

    return false;
  }

  // ============================================
  // Export
  // ============================================

  window.__seUtils = {
    installed: true,
    version: '1.0.0',

    // Logging
    createLogger,

    // DOM utilities
    cssPath,
    getRect,
    getAbsoluteRect,
    isVisible,

    // Caching
    getCachedStyle,
    getCachedSelector,
    getCachedRect,
    clearCache,

    // Response format
    success,
    error,
    wrapWithResponse,

    // Color utilities
    rgbToHex,
    isColorDark,
    isColorValue,

    // String utilities
    slugify,
    toKebabCase,
    toCamelCase,
    toPascalCase,

    // Timing
    parseDuration,

    // Comparison
    deepEqual
  };
})();
