// Style Extractor: Pattern Detection
// Detects repeating sibling patterns for AI-driven page reconstruction
//
// This module provides:
// 1. Structural fingerprinting of DOM elements
// 2. Repeating pattern detection among siblings
// 3. AI-friendly pattern guides for loop/map rendering
//
// Usage:
//   window.__sePatternDetect.detectPatterns()
//   window.__sePatternDetect.generatePatternGuide(result)

(() => {
  if (window.__sePatternDetect?.installed) return;

  const debug = (...args) => {
    if (window.__seDebug) console.log('[style-extractor:pattern-detect]', ...args);
  };

  // ============================================
  // Structure Fingerprinting
  // ============================================

  /**
   * Create a structural fingerprint of an element.
   * This captures the "shape" of the element without specific content.
   * Returns a string like "div.card>img+div.card-body>h3+p+a.btn"
   */
  function fingerprint(el, maxDepth = 3, currentDepth = 0) {
    if (!el || el.nodeType !== 1 || currentDepth > maxDepth) return '';

    const tag = el.tagName.toLowerCase();
    // Take first 2 class names for fingerprinting (ignore utility classes that are too specific)
    const classes = Array.from(el.classList || [])
      .filter(c => !isUtilityClass(c))
      .slice(0, 2)
      .map(c => '.' + c)
      .join('');

    let fp = tag + classes;

    if (el.children.length > 0 && currentDepth < maxDepth) {
      const childFps = Array.from(el.children)
        .slice(0, 8) // Limit children to avoid huge fingerprints
        .map(child => fingerprint(child, maxDepth, currentDepth + 1))
        .filter(Boolean);
      if (childFps.length > 0) {
        fp += '>' + childFps.join('+');
      }
    }

    return fp;
  }

  /**
   * Check if a class name looks like a utility class (Tailwind, etc.)
   */
  function isUtilityClass(cls) {
    // Common utility class patterns
    return /^(p[xtylrb]?|m[xtylrb]?|w|h|min-|max-|text-|bg-|border-|rounded|flex|grid|gap|space|overflow|z|opacity|shadow|font|leading|tracking|underline|italic|block|inline|hidden|absolute|relative|fixed|sticky|top|right|bottom|left)-/.test(cls) ||
           /^\-?[a-z]+-\d/.test(cls) || // e.g., col-4, row-2
           /^(sm|md|lg|xl|2xl):/.test(cls); // responsive prefixes
  }

  // ============================================
  // Pattern Detection
  // ============================================

  /**
   * Detect repeating patterns among sibling elements.
   * Returns groups of siblings that share the same structural fingerprint.
   */
  function detectPatterns(options = {}) {
    const minGroupSize = options.minGroupSize || 3;
    const maxDepth = options.maxDepth || 3;
    const maxPatterns = options.maxPatterns || 30;
    const patterns = [];

    // Walk significant container elements
    const containers = document.querySelectorAll(
      'ul, ol, nav, main, section, article, div, aside, footer, header'
    );

    const seen = new Set(); // Track parents we've already analyzed

    for (const container of containers) {
      if (patterns.length >= maxPatterns) break;
      if (seen.has(container)) continue;

      const children = Array.from(container.children);
      if (children.length < minGroupSize) continue;

      // Fingerprint all children
      const fpGroups = new Map(); // fingerprint -> [element, ...]
      for (const child of children) {
        const fp = fingerprint(child, maxDepth);
        if (!fp) continue;
        if (!fpGroups.has(fp)) fpGroups.set(fp, []);
        fpGroups.get(fp).push(child);
      }

      // Find groups that meet minimum size
      for (const [fp, elements] of fpGroups) {
        if (elements.length < minGroupSize) continue;
        if (patterns.length >= maxPatterns) break;

        seen.add(container);

        const sample = elements[0];
        const sampleRect = sample.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();

        // Determine layout type
        let layoutType = 'list';
        const containerStyle = getComputedStyle(container);
        if (containerStyle.display.includes('grid')) layoutType = 'grid';
        else if (containerStyle.display.includes('flex')) layoutType = 'flex';

        // Build CSS path for container
        const containerSelector = cssPath(container);
        const sampleSelector = cssPath(sample);

        // Extract the common tag pattern
        const templateSummary = buildTemplateSummary(sample, maxDepth);

        patterns.push({
          id: `pattern-${patterns.length + 1}`,
          containerSelector,
          sampleSelector,
          fingerprint: fp,
          count: elements.length,
          layoutType,
          containerRect: {
            x: Math.round(containerRect.x),
            y: Math.round(containerRect.y),
            width: Math.round(containerRect.width),
            height: Math.round(containerRect.height)
          },
          itemSize: {
            width: Math.round(sampleRect.width),
            height: Math.round(sampleRect.height)
          },
          template: templateSummary,
          gap: extractGap(containerStyle),
          // Provide selectors for first N items so AI can inspect variety
          sampleSelectors: elements.slice(0, 3).map(el => cssPath(el)).filter(Boolean)
        });
      }
    }

    return {
      patterns,
      count: patterns.length,
      totalRepeatingElements: patterns.reduce((sum, p) => sum + p.count, 0)
    };
  }

  /**
   * Build a human-readable template summary from a sample element.
   */
  function buildTemplateSummary(el, maxDepth = 2, depth = 0) {
    if (!el || el.nodeType !== 1 || depth > maxDepth) return null;

    const tag = el.tagName.toLowerCase();
    const classes = Array.from(el.classList || []).filter(c => !isUtilityClass(c)).slice(0, 3);

    const summary = {
      tag,
      classes: classes.length > 0 ? classes : undefined
    };

    // Add semantic hints
    if (tag === 'img') {
      summary.hint = 'image';
      const src = el.getAttribute('src') || el.currentSrc;
      if (src) summary.hasSrc = true;
    } else if (tag === 'a') {
      summary.hint = 'link';
    } else if (tag.match(/^h[1-6]$/)) {
      summary.hint = 'heading';
    } else if (tag === 'p') {
      summary.hint = 'text';
    } else if (tag === 'button') {
      summary.hint = 'button';
    }

    if (el.children.length > 0 && depth < maxDepth) {
      summary.children = Array.from(el.children)
        .slice(0, 6)
        .map(child => buildTemplateSummary(child, maxDepth, depth + 1))
        .filter(Boolean);
    }

    return summary;
  }

  function extractGap(style) {
    const gap = style.gap;
    if (!gap || gap === 'normal' || gap === '0px') return null;
    return gap;
  }

  function cssPath(el) {
    if (window.__seUtils?.getCachedSelector) return window.__seUtils.getCachedSelector(el);
    // Fallback
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
   * Generate an AI-friendly summary of detected patterns.
   * This tells the AI "use a loop/map to render N items with this template"
   */
  function generatePatternGuide(patternsResult) {
    if (!patternsResult?.patterns?.length) return null;

    const guides = patternsResult.patterns.map(p => ({
      hint: `Render ${p.count} items using ${p.layoutType} layout`,
      container: p.containerSelector,
      itemCount: p.count,
      layoutType: p.layoutType,
      gap: p.gap,
      itemSize: p.itemSize,
      template: p.template,
      sampleSelectors: p.sampleSelectors
    }));

    return {
      total: guides.length,
      guides,
      note: 'Each pattern represents a group of sibling elements with identical DOM structure. Use loops/map to render them, varying only text/image content.'
    };
  }

  // ============================================
  // Export
  // ============================================

  window.__sePatternDetect = {
    installed: true,
    version: '1.0.0',

    fingerprint,
    detectPatterns,
    generatePatternGuide,

    // Low-level helpers exposed for testing
    isUtilityClass,
    buildTemplateSummary
  };
})();
