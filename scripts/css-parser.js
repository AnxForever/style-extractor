// Style Extractor: CSS Parser
// Downloads and parses external CSS files for complete style extraction
//
// This module:
// 1. Identifies all CSS files loaded by the page
// 2. Extracts CSS custom properties (variables)
// 3. Extracts @keyframes animations
// 4. Extracts media queries and breakpoints
// 5. Extracts font-face declarations
//
// Usage in evaluate_script:
//   window.__seCSS.getStylesheetUrls()
//   window.__seCSS.parseInlineStyles()
//   window.__seCSS.extractVariables()
//   window.__seCSS.extractKeyframes()
//   window.__seCSS.extractMediaQueries()
//   window.__seCSS.analyze()

(() => {
  if (window.__seCSS?.installed) return;

  // Debug mode
  const debug = (...args) => {
    if (window.__seDebug) console.log('[style-extractor:css]', ...args);
  };
  const debugWarn = (...args) => {
    if (window.__seDebug) console.warn('[style-extractor:css]', ...args);
  };

  // Cache for reverse variable map (reset when extractVariables is called)
  let _reverseMapCache = null;

  // ============================================
  // Stylesheet Discovery
  // ============================================

  /**
   * Get all stylesheet URLs loaded by the page
   */
  function getStylesheetUrls() {
    const urls = [];

    // From <link> elements
    const links = document.querySelectorAll('link[rel="stylesheet"]');
    for (const link of links) {
      if (link.href) {
        urls.push({
          type: 'link',
          url: link.href,
          media: link.media || 'all'
        });
      }
    }

    // From @import in stylesheets
    for (const sheet of document.styleSheets) {
      try {
        if (sheet.href) {
          // Check if already added
          if (!urls.some(u => u.url === sheet.href)) {
            urls.push({
              type: 'stylesheet',
              url: sheet.href,
              media: sheet.media?.mediaText || 'all'
            });
          }
        }

        // Check for @import rules
        for (const rule of sheet.cssRules || []) {
          if (rule.type === CSSRule.IMPORT_RULE && rule.href) {
            if (!urls.some(u => u.url === rule.href)) {
              urls.push({
                type: 'import',
                url: rule.href,
                media: rule.media?.mediaText || 'all'
              });
            }
          }
        }
      } catch (e) {
        debugWarn('Cannot access stylesheet (likely cross-origin):', sheet.href);
      }
    }

    return urls;
  }

  /**
   * Get inline styles from <style> elements
   */
  function getInlineStyles() {
    const styles = [];
    const styleElements = document.querySelectorAll('style');

    for (const style of styleElements) {
      styles.push({
        type: 'inline',
        content: style.textContent,
        length: style.textContent?.length || 0
      });
    }

    return styles;
  }

  // ============================================
  // CSS Variable Extraction
  // ============================================

  /**
   * Extract all CSS custom properties from stylesheets
   */
  function extractVariables() {
    // Invalidate reverse map cache so it rebuilds with fresh data
    _reverseMapCache = null;

    const variables = {
      root: {},      // Variables defined on :root
      html: {},      // Variables defined on html
      body: {},      // Variables defined on body
      other: {},     // Variables defined elsewhere
      computed: {}   // Computed values from :root
    };

    // Get computed values from :root
    const rootStyles = getComputedStyle(document.documentElement);

    // Extract from stylesheets
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules || []) {
          if (rule.type !== CSSRule.STYLE_RULE) continue;

          const selector = rule.selectorText;
          const style = rule.style;

          // Find CSS variables in this rule
          for (let i = 0; i < style.length; i++) {
            const prop = style[i];
            if (prop.startsWith('--')) {
              const value = style.getPropertyValue(prop).trim();

              if (selector === ':root') {
                variables.root[prop] = value;
              } else if (selector === 'html') {
                variables.html[prop] = value;
              } else if (selector === 'body') {
                variables.body[prop] = value;
              } else {
                if (!variables.other[selector]) {
                  variables.other[selector] = {};
                }
                variables.other[selector][prop] = value;
              }
            }
          }
        }
      } catch (e) {
        debugWarn('Cannot access stylesheet for variables:', sheet.href);
      }
    }

    // Get computed values for all root variables
    for (const prop of Object.keys(variables.root)) {
      variables.computed[prop] = rootStyles.getPropertyValue(prop).trim();
    }

    // Categorize variables by type
    const categorized = categorizeVariables(variables);

    return {
      variables,
      categorized,
      count: {
        root: Object.keys(variables.root).length,
        html: Object.keys(variables.html).length,
        body: Object.keys(variables.body).length,
        other: Object.keys(variables.other).length,
        total: Object.keys(variables.root).length +
               Object.keys(variables.html).length +
               Object.keys(variables.body).length
      }
    };
  }

  /**
   * Categorize variables by their likely purpose
   */
  function categorizeVariables(variables) {
    const allVars = { ...variables.root, ...variables.html, ...variables.body };
    const categorized = {
      colors: {},
      typography: {},
      spacing: {},
      borders: {},
      shadows: {},
      motion: {},
      zIndex: {},
      other: {}
    };

    for (const [name, value] of Object.entries(allVars)) {
      const lowerName = name.toLowerCase();
      const lowerValue = value.toLowerCase();

      // Colors
      if (lowerName.includes('color') || lowerName.includes('bg') ||
          lowerName.includes('background') || lowerName.includes('text') ||
          lowerName.includes('border-color') || lowerName.includes('fill') ||
          lowerName.includes('stroke') ||
          /^#[0-9a-f]{3,8}$/i.test(value) ||
          value.startsWith('rgb') || value.startsWith('hsl')) {
        categorized.colors[name] = value;
      }
      // Typography
      else if (lowerName.includes('font') || lowerName.includes('text') ||
               lowerName.includes('line-height') || lowerName.includes('letter')) {
        categorized.typography[name] = value;
      }
      // Spacing
      else if (lowerName.includes('space') || lowerName.includes('gap') ||
               lowerName.includes('padding') || lowerName.includes('margin') ||
               lowerName.includes('size') && !lowerName.includes('font')) {
        categorized.spacing[name] = value;
      }
      // Borders
      else if (lowerName.includes('border') || lowerName.includes('radius')) {
        categorized.borders[name] = value;
      }
      // Shadows
      else if (lowerName.includes('shadow')) {
        categorized.shadows[name] = value;
      }
      // Motion
      else if (lowerName.includes('duration') || lowerName.includes('delay') ||
               lowerName.includes('timing') || lowerName.includes('ease') ||
               lowerName.includes('transition') || lowerName.includes('animation')) {
        categorized.motion[name] = value;
      }
      // Z-Index
      else if (lowerName.includes('z-index') || lowerName.includes('zindex') ||
               lowerName.includes('layer')) {
        categorized.zIndex[name] = value;
      }
      // Other
      else {
        categorized.other[name] = value;
      }
    }

    return categorized;
  }

  // ============================================
  // CSS Variable Reverse Mapping
  // ============================================

  /**
   * Normalize a color value to a canonical rgb(r, g, b) form for matching.
   * Returns the normalized string, or null if the value is not a recognized color.
   */
  function normalizeColorValue(value) {
    if (typeof value !== 'string') return null;
    const v = value.trim();
    if (!v) return null;

    // --- hex colors ---
    const hexMatch = v.match(/^#([0-9a-f]{3,8})$/i);
    if (hexMatch) {
      let hex = hexMatch[1];
      // Expand shorthand: #rgb -> #rrggbb, #rgba -> #rrggbbaa
      if (hex.length === 3) {
        hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
      } else if (hex.length === 4) {
        hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
      }
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      if (hex.length === 8) {
        const a = parseInt(hex.substring(6, 8), 16) / 255;
        if (Math.abs(a - 1) < 0.004) {
          return 'rgb(' + r + ', ' + g + ', ' + b + ')';
        }
        return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + parseFloat(a.toFixed(3)) + ')';
      }
      return 'rgb(' + r + ', ' + g + ', ' + b + ')';
    }

    // --- rgba(...) ---
    const rgbaMatch = v.match(/^rgba?\(\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/i);
    if (rgbaMatch) {
      const r = parseInt(rgbaMatch[1], 10);
      const g = parseInt(rgbaMatch[2], 10);
      const b = parseInt(rgbaMatch[3], 10);
      if (rgbaMatch[4] !== undefined) {
        let a = rgbaMatch[4];
        if (a.endsWith('%')) {
          a = parseFloat(a) / 100;
        } else {
          a = parseFloat(a);
        }
        // Fully opaque -> collapse to rgb
        if (Math.abs(a - 1) < 0.004) {
          return 'rgb(' + r + ', ' + g + ', ' + b + ')';
        }
        return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + parseFloat(a.toFixed(3)) + ')';
      }
      return 'rgb(' + r + ', ' + g + ', ' + b + ')';
    }

    // --- hsl/hsla(...) ---
    const hslMatch = v.match(/^hsla?\(\s*([\d.]+)\s*[,\s]\s*([\d.]+)%\s*[,\s]\s*([\d.]+)%\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/i);
    if (hslMatch) {
      const h = parseFloat(hslMatch[1]);
      const s = parseFloat(hslMatch[2]) / 100;
      const l = parseFloat(hslMatch[3]) / 100;
      let a = 1;
      if (hslMatch[4] !== undefined) {
        a = hslMatch[4].endsWith('%') ? parseFloat(hslMatch[4]) / 100 : parseFloat(hslMatch[4]);
      }

      // Convert HSL to RGB
      const c = (1 - Math.abs(2 * l - 1)) * s;
      const x = c * (1 - Math.abs((h / 60) % 2 - 1));
      const m = l - c / 2;
      let r1 = 0, g1 = 0, b1 = 0;
      if (h < 60)       { r1 = c; g1 = x; b1 = 0; }
      else if (h < 120) { r1 = x; g1 = c; b1 = 0; }
      else if (h < 180) { r1 = 0; g1 = c; b1 = x; }
      else if (h < 240) { r1 = 0; g1 = x; b1 = c; }
      else if (h < 300) { r1 = x; g1 = 0; b1 = c; }
      else              { r1 = c; g1 = 0; b1 = x; }

      const r = Math.round((r1 + m) * 255);
      const g = Math.round((g1 + m) * 255);
      const b = Math.round((b1 + m) * 255);

      if (Math.abs(a - 1) < 0.004) {
        return 'rgb(' + r + ', ' + g + ', ' + b + ')';
      }
      return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + parseFloat(a.toFixed(3)) + ')';
    }

    return null;
  }

  /**
   * Infer a category for a CSS variable based on its name and value.
   * Returns one of: 'color', 'spacing', 'typography', 'border', 'shadow', 'motion', 'other'.
   */
  function inferCategory(name, value) {
    const n = name.toLowerCase();
    const v = value.toLowerCase();

    // Color by name or value pattern
    if (n.includes('color') || n.includes('bg') || n.includes('background') ||
        n.includes('fill') || n.includes('stroke') ||
        /^#[0-9a-f]{3,8}$/i.test(value) ||
        v.startsWith('rgb') || v.startsWith('hsl')) {
      return 'color';
    }

    // Typography
    if (n.includes('font') || n.includes('line-height') || n.includes('letter') ||
        n.includes('text') && !n.includes('color')) {
      return 'typography';
    }

    // Spacing
    if (n.includes('space') || n.includes('gap') || n.includes('padding') ||
        n.includes('margin') || (n.includes('size') && !n.includes('font'))) {
      return 'spacing';
    }

    // Border
    if (n.includes('border') || n.includes('radius')) {
      return 'border';
    }

    // Shadow
    if (n.includes('shadow')) {
      return 'shadow';
    }

    // Motion / animation
    if (n.includes('duration') || n.includes('delay') || n.includes('timing') ||
        n.includes('ease') || n.includes('transition') || n.includes('animation')) {
      return 'motion';
    }

    return 'other';
  }

  /**
   * Build a reverse map: computed value -> { varName, rawValue, category }.
   * Allows looking up which CSS variable produces a given computed value.
   */
  function buildReverseMap() {
    const vars = extractVariables();
    const map = {};  // normalizedComputedValue -> { varName, rawValue, category }

    const allVars = { ...vars.variables.root, ...vars.variables.html, ...vars.variables.body };
    const computed = vars.variables.computed;

    for (const [name, rawValue] of Object.entries(allVars)) {
      const computedValue = computed[name] || rawValue;

      // Try color normalization
      const normalizedColor = normalizeColorValue(computedValue);
      if (normalizedColor) {
        map[normalizedColor] = { varName: name, rawValue: rawValue, category: 'color' };
        // Also store the original computed value as a key for direct lookups
        if (normalizedColor !== computedValue) {
          map[computedValue] = { varName: name, rawValue: rawValue, category: 'color' };
        }
        continue;
      }

      // Store spacing/sizing values directly
      const trimmed = computedValue.trim();
      if (trimmed && trimmed !== '0' && trimmed !== '0px') {
        const category = inferCategory(name, trimmed);
        map[trimmed] = { varName: name, rawValue: rawValue, category: category };
      }
    }

    return { map: map, count: Object.keys(map).length };
  }

  /**
   * Look up which CSS variable produced a given computed value.
   * Uses an internal cache that is invalidated when extractVariables() is called.
   */
  function lookupVariable(computedValue) {
    if (!_reverseMapCache) {
      _reverseMapCache = buildReverseMap();
    }
    const normalized = normalizeColorValue(computedValue) || computedValue.trim();
    return _reverseMapCache.map[normalized] || null;
  }

  // ============================================
  // Keyframes Extraction
  // ============================================

  /**
   * Extract all @keyframes from stylesheets
   */
  function extractKeyframes() {
    const keyframes = {};

    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules || []) {
          if (rule.type === CSSRule.KEYFRAMES_RULE) {
            const name = rule.name;
            const frames = [];

            for (const keyframe of rule.cssRules || []) {
              const frame = {
                offset: keyframe.keyText,
                styles: {}
              };

              for (let i = 0; i < keyframe.style.length; i++) {
                const prop = keyframe.style[i];
                frame.styles[prop] = keyframe.style.getPropertyValue(prop);
              }

              frames.push(frame);
            }

            keyframes[name] = {
              name,
              frames,
              cssText: rule.cssText
            };
          }
        }
      } catch (e) {
        debugWarn('Cannot access stylesheet for keyframes:', sheet.href);
      }
    }

    return {
      keyframes,
      count: Object.keys(keyframes).length,
      names: Object.keys(keyframes)
    };
  }

  // ============================================
  // Media Query Extraction
  // ============================================

  /**
   * Extract all media queries from stylesheets
   */
  function extractMediaQueries() {
    const mediaQueries = [];
    const breakpoints = new Map();

    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules || []) {
          if (rule.type === CSSRule.MEDIA_RULE) {
            const media = rule.conditionText || rule.media?.mediaText;
            if (!media) continue;

            const ruleCount = rule.cssRules?.length || 0;

            mediaQueries.push({
              query: media,
              ruleCount,
              source: sheet.href || 'inline'
            });

            // Extract breakpoint values
            const minMatch = media.match(/min-width:\s*(\d+(?:\.\d+)?)(px|em|rem)/);
            const maxMatch = media.match(/max-width:\s*(\d+(?:\.\d+)?)(px|em|rem)/);

            if (minMatch) {
              const value = parseFloat(minMatch[1]);
              const unit = minMatch[2];
              const px = unit === 'px' ? value : value * 16;
              breakpoints.set(`min-${px}`, {
                type: 'min-width',
                value: `${minMatch[1]}${unit}`,
                px: Math.round(px)
              });
            }

            if (maxMatch) {
              const value = parseFloat(maxMatch[1]);
              const unit = maxMatch[2];
              const px = unit === 'px' ? value : value * 16;
              breakpoints.set(`max-${px}`, {
                type: 'max-width',
                value: `${maxMatch[1]}${unit}`,
                px: Math.round(px)
              });
            }
          }
        }
      } catch (e) {
        debugWarn('Cannot access stylesheet for media queries:', sheet.href);
      }
    }

    // Sort breakpoints
    const sortedBreakpoints = Array.from(breakpoints.values())
      .sort((a, b) => a.px - b.px);

    return {
      mediaQueries,
      breakpoints: sortedBreakpoints,
      count: mediaQueries.length,
      breakpointCount: sortedBreakpoints.length
    };
  }

  // ============================================
  // Font Face Extraction
  // ============================================

  /**
   * Extract all @font-face declarations
   */
  function extractFontFaces() {
    const fontFaces = [];

    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules || []) {
          if (rule.type === CSSRule.FONT_FACE_RULE) {
            const style = rule.style;
            fontFaces.push({
              family: style.getPropertyValue('font-family').replace(/['"]/g, ''),
              src: style.getPropertyValue('src'),
              weight: style.getPropertyValue('font-weight') || 'normal',
              style: style.getPropertyValue('font-style') || 'normal',
              display: style.getPropertyValue('font-display') || 'auto',
              source: sheet.href || 'inline'
            });
          }
        }
      } catch (e) {
        debugWarn('Cannot access stylesheet for font-faces:', sheet.href);
      }
    }

    // Group by family
    const byFamily = {};
    for (const face of fontFaces) {
      if (!byFamily[face.family]) {
        byFamily[face.family] = [];
      }
      byFamily[face.family].push(face);
    }

    return {
      fontFaces,
      byFamily,
      count: fontFaces.length,
      families: Object.keys(byFamily)
    };
  }

  // ============================================
  // Font Source Extraction
  // ============================================

  /**
   * Parse font family names from a Google Fonts URL.
   * Handles both the old API format (family=Roboto:400,700|Open+Sans)
   * and the new API v2 format (family=Roboto:wght@400;700&family=Open+Sans).
   */
  function parseGoogleFontFamilies(url) {
    const families = [];
    try {
      const u = new URL(url);
      const familyParams = u.searchParams.getAll('family');
      for (const param of familyParams) {
        // Old format uses | to separate families within a single param
        const parts = param.split('|');
        for (const part of parts) {
          // Family name is everything before the first ':'
          const name = part.split(':')[0].replace(/\+/g, ' ').trim();
          if (name && !families.includes(name)) {
            families.push(name);
          }
        }
      }
    } catch (e) {
      debug('Failed to parse Google Fonts URL:', url, e);
    }
    return families;
  }

  /**
   * Extract the kit ID from an Adobe Fonts (Typekit) URL.
   * e.g. "https://use.typekit.net/abc123.css" -> "abc123"
   */
  function extractTypekitId(url) {
    const match = url.match(/(?:use\.typekit\.net|use\.typekit\.com|p\.typekit\.net)\/([a-z0-9]+)/i);
    return match ? match[1].replace(/\.css$/, '') : null;
  }

  /**
   * Collect all unique font family names from every source.
   */
  function collectAllFontFamilies(sources) {
    const set = new Set();

    // From Google Fonts
    for (const gf of sources.googleFonts) {
      for (const fam of gf.families) {
        set.add(fam);
      }
    }

    // From @font-face
    if (sources.fontFaces && sources.fontFaces.families) {
      for (const fam of sources.fontFaces.families) {
        set.add(fam);
      }
    }

    return Array.from(set);
  }

  /**
   * Extract all font loading sources:
   * - Google Fonts <link> and @import
   * - Adobe Fonts (Typekit) <link>
   * - Other font-related <link> stylesheets
   * - Preconnect / dns-prefetch hints for font CDNs
   * - @font-face declarations (delegated to extractFontFaces)
   */
  function extractFontSources() {
    const sources = {
      googleFonts: [],
      adobeFonts: [],
      customLinks: [],
      preconnects: [],
      fontFaces: extractFontFaces()
    };

    // Scan <link> elements
    const links = document.querySelectorAll('link');
    for (const link of links) {
      const href = link.href || '';
      const rel = link.rel || '';

      // Google Fonts
      if (href.includes('fonts.googleapis.com') || href.includes('fonts.gstatic.com')) {
        if (rel === 'stylesheet' || rel === 'preload') {
          sources.googleFonts.push({
            url: href,
            families: parseGoogleFontFamilies(href)
          });
        }
      }

      // Adobe Fonts (Typekit)
      if (href.includes('use.typekit.net') || href.includes('use.typekit.com') || href.includes('p.typekit.net')) {
        sources.adobeFonts.push({
          url: href,
          kitId: extractTypekitId(href)
        });
      }

      // Preconnect / dns-prefetch hints for font CDNs
      if (rel === 'preconnect' || rel === 'dns-prefetch') {
        if (href.includes('fonts') || href.includes('typekit')) {
          sources.preconnects.push({ url: href, rel: rel });
        }
      }

      // Other font-related stylesheet links
      if (rel === 'stylesheet' && href.includes('font') &&
          !sources.googleFonts.some(function(g) { return g.url === href; }) &&
          !sources.adobeFonts.some(function(a) { return a.url === href; })) {
        sources.customLinks.push({ url: href });
      }
    }

    // Check @import rules in stylesheets for Google/Adobe fonts
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules || []) {
          if (rule.type === CSSRule.IMPORT_RULE && rule.href) {
            if (rule.href.includes('fonts.googleapis.com')) {
              if (!sources.googleFonts.some(function(g) { return g.url === rule.href; })) {
                sources.googleFonts.push({
                  url: rule.href,
                  families: parseGoogleFontFamilies(rule.href)
                });
              }
            }
          }
        }
      } catch (e) {
        // cross-origin stylesheet, skip
      }
    }

    return {
      googleFonts: sources.googleFonts,
      adobeFonts: sources.adobeFonts,
      customLinks: sources.customLinks,
      preconnects: sources.preconnects,
      fontFaces: sources.fontFaces,
      summary: {
        googleFontCount: sources.googleFonts.length,
        adobeFontCount: sources.adobeFonts.length,
        customLinkCount: sources.customLinks.length,
        fontFaceCount: sources.fontFaces.count,
        allFamilies: collectAllFontFamilies(sources)
      }
    };
  }

  // ============================================
  // Full Analysis
  // ============================================

  /**
   * Run complete CSS analysis
   */
  function analyze() {
    debug('Starting CSS analysis');

    const stylesheets = getStylesheetUrls();
    const inlineStyles = getInlineStyles();
    const variables = extractVariables();
    const keyframes = extractKeyframes();
    const mediaQueries = extractMediaQueries();
    const fontFaces = extractFontFaces();
    const reverseMap = buildReverseMap();
    const fontSources = extractFontSources();

    return {
      meta: {
        url: location.href,
        analyzedAt: new Date().toISOString()
      },
      stylesheets,
      inlineStyles,
      variables,
      keyframes,
      mediaQueries,
      fontFaces,
      reverseMap,
      fontSources,
      summary: {
        stylesheetCount: stylesheets.length,
        inlineStyleCount: inlineStyles.length,
        variableCount: variables.count.total,
        keyframeCount: keyframes.count,
        mediaQueryCount: mediaQueries.count,
        fontFaceCount: fontFaces.count,
        reverseMapCount: reverseMap.count,
        fontSourceCount: fontSources.summary.googleFontCount +
                         fontSources.summary.adobeFontCount +
                         fontSources.summary.customLinkCount
      }
    };
  }

  // ============================================
  // CSS Text Generation
  // ============================================

  /**
   * Generate CSS text from extracted variables
   */
  function generateVariablesCSS(variables) {
    const lines = [':root {'];

    for (const [name, value] of Object.entries(variables.root || {})) {
      lines.push(`  ${name}: ${value};`);
    }

    lines.push('}');
    return lines.join('\n');
  }

  /**
   * Generate CSS text from extracted keyframes
   */
  function generateKeyframesCSS(keyframes) {
    const lines = [];

    for (const [name, kf] of Object.entries(keyframes || {})) {
      lines.push(kf.cssText);
      lines.push('');
    }

    return lines.join('\n');
  }

  // ============================================
  // Export
  // ============================================

  window.__seCSS = {
    installed: true,

    // Discovery
    getStylesheetUrls,
    getInlineStyles,

    // Extraction
    extractVariables,
    extractKeyframes,
    extractMediaQueries,
    extractFontFaces,
    extractFontSources,

    // Reverse mapping
    buildReverseMap,
    lookupVariable,
    normalizeColorValue,

    // Full analysis
    analyze,

    // Generation
    generateVariablesCSS,
    generateKeyframesCSS,

    // Helpers
    categorizeVariables
  };
})();
