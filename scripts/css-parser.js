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
      summary: {
        stylesheetCount: stylesheets.length,
        inlineStyleCount: inlineStyles.length,
        variableCount: variables.count.total,
        keyframeCount: keyframes.count,
        mediaQueryCount: mediaQueries.count,
        fontFaceCount: fontFaces.count
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

    // Full analysis
    analyze,

    // Generation
    generateVariablesCSS,
    generateKeyframesCSS,

    // Helpers
    categorizeVariables
  };
})();
