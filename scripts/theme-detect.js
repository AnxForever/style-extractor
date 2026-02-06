// Style Extractor: Theme Detection
// Detects and extracts dark/light mode themes
//
// This module:
// 1. Detects theme switching mechanisms (CSS, JS, media query)
// 2. Extracts both light and dark theme variables
// 3. Compares themes and identifies differences
// 4. Generates theme-aware token output
//
// Usage in evaluate_script:
//   window.__seTheme.detect()
//   window.__seTheme.extractBothThemes()
//   window.__seTheme.switchTheme(mode)
//   window.__seTheme.compareThemes(light, dark)

(() => {
  if (window.__seTheme?.installed) return;

  // Debug mode
  const debug = (...args) => {
    if (window.__seDebug) console.log('[style-extractor:theme]', ...args);
  };

  // ============================================
  // Theme Detection
  // ============================================

  /**
   * Detect theme switching mechanism
   */
  function detectThemeMechanism() {
    const mechanisms = {
      cssClass: null,
      dataAttribute: null,
      mediaQuery: false,
      colorScheme: null,
      localStorage: null
    };

    // 1. Check for class-based theme (html/body)
    const htmlClasses = document.documentElement.classList;
    const bodyClasses = document.body.classList;

    const themeClassPatterns = ['dark', 'light', 'theme-dark', 'theme-light', 'dark-mode', 'light-mode'];
    for (const pattern of themeClassPatterns) {
      if (htmlClasses.contains(pattern)) {
        mechanisms.cssClass = { element: 'html', class: pattern };
        break;
      }
      if (bodyClasses.contains(pattern)) {
        mechanisms.cssClass = { element: 'body', class: pattern };
        break;
      }
    }

    // 2. Check for data attribute theme
    const dataThemeAttrs = ['data-theme', 'data-mode', 'data-color-scheme', 'data-bs-theme'];
    for (const attr of dataThemeAttrs) {
      const htmlValue = document.documentElement.getAttribute(attr);
      const bodyValue = document.body.getAttribute(attr);
      if (htmlValue) {
        mechanisms.dataAttribute = { element: 'html', attribute: attr, value: htmlValue };
        break;
      }
      if (bodyValue) {
        mechanisms.dataAttribute = { element: 'body', attribute: attr, value: bodyValue };
        break;
      }
    }

    // 3. Check for color-scheme CSS property
    const htmlStyle = getComputedStyle(document.documentElement);
    const colorScheme = htmlStyle.colorScheme;
    if (colorScheme && colorScheme !== 'normal') {
      mechanisms.colorScheme = colorScheme;
    }

    // 4. Check for prefers-color-scheme media query usage
    try {
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules || []) {
            if (rule.type === CSSRule.MEDIA_RULE) {
              const media = rule.conditionText || rule.media?.mediaText || '';
              if (media.includes('prefers-color-scheme')) {
                mechanisms.mediaQuery = true;
                break;
              }
            }
          }
        } catch (e) {
          // Cross-origin stylesheet
        }
        if (mechanisms.mediaQuery) break;
      }
    } catch (e) {
      debug('Error checking media queries:', e.message);
    }

    // 5. Check localStorage for theme preference
    const storageKeys = ['theme', 'color-theme', 'dark-mode', 'darkMode', 'colorScheme'];
    for (const key of storageKeys) {
      const value = localStorage.getItem(key);
      if (value) {
        mechanisms.localStorage = { key, value };
        break;
      }
    }

    return mechanisms;
  }

  /**
   * Detect current theme mode
   */
  function detectCurrentTheme() {
    const mechanisms = detectThemeMechanism();

    // Determine current mode
    let currentMode = 'unknown';

    if (mechanisms.cssClass) {
      currentMode = mechanisms.cssClass.class.includes('dark') ? 'dark' : 'light';
    } else if (mechanisms.dataAttribute) {
      currentMode = mechanisms.dataAttribute.value.includes('dark') ? 'dark' : 'light';
    } else if (mechanisms.colorScheme) {
      currentMode = mechanisms.colorScheme.includes('dark') ? 'dark' : 'light';
    } else {
      // Fallback: check background color luminance
      const bgColor = getComputedStyle(document.body).backgroundColor;
      currentMode = isColorDark(bgColor) ? 'dark' : 'light';
    }

    return {
      mode: currentMode,
      mechanisms,
      supportsToggle: !!(mechanisms.cssClass || mechanisms.dataAttribute || mechanisms.mediaQuery),
      timestamp: Date.now()
    };
  }

  /**
   * Check if a color is dark
   */
  function isColorDark(color) {
    if (!color || color === 'transparent') return false;

    // Parse rgb/rgba
    const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!match) return false;

    const [, r, g, b] = match.map(Number);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance < 0.5;
  }

  // ============================================
  // Theme Switching
  // ============================================

  /**
   * Switch to a specific theme mode
   */
  function switchTheme(mode) {
    const mechanisms = detectThemeMechanism();
    const actions = [];

    // Try class-based switching
    if (mechanisms.cssClass) {
      const el = mechanisms.cssClass.element === 'html' ? document.documentElement : document.body;
      const currentClass = mechanisms.cssClass.class;
      const newClass = mode === 'dark'
        ? currentClass.replace('light', 'dark')
        : currentClass.replace('dark', 'light');

      el.classList.remove(currentClass);
      el.classList.add(newClass);
      actions.push({ type: 'class', from: currentClass, to: newClass });
    }

    // Try data attribute switching
    if (mechanisms.dataAttribute) {
      const el = mechanisms.dataAttribute.element === 'html' ? document.documentElement : document.body;
      const attr = mechanisms.dataAttribute.attribute;
      el.setAttribute(attr, mode);
      actions.push({ type: 'attribute', attribute: attr, value: mode });
    }

    // Try color-scheme switching
    if (mechanisms.colorScheme || !mechanisms.cssClass && !mechanisms.dataAttribute) {
      document.documentElement.style.colorScheme = mode;
      actions.push({ type: 'colorScheme', value: mode });
    }

    return {
      success: actions.length > 0,
      mode,
      actions,
      timestamp: Date.now()
    };
  }

  /**
   * Temporarily switch theme, extract, then restore
   */
  async function extractWithTheme(mode, extractFn) {
    const original = detectCurrentTheme();

    // Switch to target theme
    switchTheme(mode);

    // Wait for CSS to apply
    await new Promise(resolve => setTimeout(resolve, 100));

    // Extract
    const result = extractFn ? extractFn() : extractThemeVariables();

    // Restore original theme
    switchTheme(original.mode);

    return {
      mode,
      result,
      originalMode: original.mode
    };
  }

  // ============================================
  // Theme Variable Extraction
  // ============================================

  /**
   * Extract CSS variables for current theme
   */
  function extractThemeVariables() {
    const variables = {
      colors: {},
      backgrounds: {},
      borders: {},
      text: {},
      other: {}
    };

    // Get computed styles from :root
    const rootStyles = getComputedStyle(document.documentElement);

    // Extract from stylesheets
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules || []) {
          if (rule.type !== CSSRule.STYLE_RULE) continue;

          const selector = rule.selectorText;
          if (selector !== ':root' && selector !== 'html' && selector !== 'body') continue;

          for (let i = 0; i < rule.style.length; i++) {
            const prop = rule.style[i];
            if (!prop.startsWith('--')) continue;

            const value = rootStyles.getPropertyValue(prop).trim();
            const lowerProp = prop.toLowerCase();

            // Categorize
            if (lowerProp.includes('background') || lowerProp.includes('-bg')) {
              variables.backgrounds[prop] = value;
            } else if (lowerProp.includes('border')) {
              variables.borders[prop] = value;
            } else if (lowerProp.includes('text') || lowerProp.includes('foreground') || lowerProp.includes('-fg')) {
              variables.text[prop] = value;
            } else if (lowerProp.includes('color') || isColorValue(value)) {
              variables.colors[prop] = value;
            } else {
              variables.other[prop] = value;
            }
          }
        }
      } catch (e) {
        // Cross-origin stylesheet
      }
    }

    // Also extract key computed colors
    const keyElements = [
      { selector: 'body', props: ['backgroundColor', 'color'] },
      { selector: 'a', props: ['color'] },
      { selector: 'button', props: ['backgroundColor', 'color'] },
      { selector: '.card, [class*="card"]', props: ['backgroundColor'] },
      { selector: 'header', props: ['backgroundColor'] },
      { selector: 'nav', props: ['backgroundColor'] }
    ];

    const computed = {};
    for (const { selector, props } of keyElements) {
      try {
        const el = document.querySelector(selector);
        if (el) {
          computed[selector] = {};
          const style = getComputedStyle(el);
          for (const prop of props) {
            computed[selector][prop] = style[prop];
          }
        }
      } catch (e) {
        // Invalid selector
      }
    }

    return {
      variables,
      computed,
      count: Object.keys(variables.colors).length +
             Object.keys(variables.backgrounds).length +
             Object.keys(variables.borders).length +
             Object.keys(variables.text).length
    };
  }

  function isColorValue(value) {
    if (!value) return false;
    return /^#[0-9a-f]{3,8}$/i.test(value) ||
           value.startsWith('rgb') ||
           value.startsWith('hsl') ||
           value.startsWith('oklch') ||
           value.startsWith('lab');
  }

  /**
   * Extract both light and dark theme variables
   */
  async function extractBothThemes() {
    const current = detectCurrentTheme();

    // Extract current theme
    const currentTheme = extractThemeVariables();

    // Extract opposite theme
    const oppositeMode = current.mode === 'dark' ? 'light' : 'dark';
    const oppositeTheme = await extractWithTheme(oppositeMode, extractThemeVariables);

    return {
      current: {
        mode: current.mode,
        ...currentTheme
      },
      opposite: {
        mode: oppositeMode,
        ...oppositeTheme.result
      },
      mechanisms: current.mechanisms,
      supportsToggle: current.supportsToggle
    };
  }

  // ============================================
  // Theme Comparison
  // ============================================

  /**
   * Compare two themes and identify differences
   */
  function compareThemes(theme1, theme2) {
    const comparison = {
      identical: [],
      different: [],
      onlyInFirst: [],
      onlyInSecond: []
    };

    const allVars1 = {
      ...theme1.variables?.colors,
      ...theme1.variables?.backgrounds,
      ...theme1.variables?.borders,
      ...theme1.variables?.text
    };

    const allVars2 = {
      ...theme2.variables?.colors,
      ...theme2.variables?.backgrounds,
      ...theme2.variables?.borders,
      ...theme2.variables?.text
    };

    const allKeys = new Set([...Object.keys(allVars1), ...Object.keys(allVars2)]);

    for (const key of allKeys) {
      const val1 = allVars1[key];
      const val2 = allVars2[key];

      if (val1 && val2) {
        if (val1 === val2) {
          comparison.identical.push({ variable: key, value: val1 });
        } else {
          comparison.different.push({
            variable: key,
            [theme1.mode || 'theme1']: val1,
            [theme2.mode || 'theme2']: val2
          });
        }
      } else if (val1) {
        comparison.onlyInFirst.push({ variable: key, value: val1 });
      } else {
        comparison.onlyInSecond.push({ variable: key, value: val2 });
      }
    }

    return {
      comparison,
      summary: {
        identical: comparison.identical.length,
        different: comparison.different.length,
        onlyInFirst: comparison.onlyInFirst.length,
        onlyInSecond: comparison.onlyInSecond.length,
        totalVariables: allKeys.size
      }
    };
  }

  // ============================================
  // Theme-Aware Token Generation
  // ============================================

  /**
   * Generate theme-aware CSS variables
   */
  function generateThemeCSS(themes) {
    const lines = [];

    // Light theme (default)
    lines.push(':root {');
    lines.push('  color-scheme: light dark;');
    lines.push('');
    lines.push('  /* Light theme (default) */');

    const lightVars = themes.current?.mode === 'light' ? themes.current : themes.opposite;
    if (lightVars?.variables) {
      for (const category of ['colors', 'backgrounds', 'borders', 'text']) {
        const vars = lightVars.variables[category];
        if (vars && Object.keys(vars).length > 0) {
          lines.push(`  /* ${category} */`);
          for (const [name, value] of Object.entries(vars)) {
            lines.push(`  ${name}: ${value};`);
          }
          lines.push('');
        }
      }
    }
    lines.push('}');
    lines.push('');

    // Dark theme
    lines.push('@media (prefers-color-scheme: dark) {');
    lines.push('  :root {');

    const darkVars = themes.current?.mode === 'dark' ? themes.current : themes.opposite;
    if (darkVars?.variables) {
      for (const category of ['colors', 'backgrounds', 'borders', 'text']) {
        const vars = darkVars.variables[category];
        if (vars && Object.keys(vars).length > 0) {
          lines.push(`    /* ${category} */`);
          for (const [name, value] of Object.entries(vars)) {
            lines.push(`    ${name}: ${value};`);
          }
          lines.push('');
        }
      }
    }

    lines.push('  }');
    lines.push('}');
    lines.push('');

    // Class-based dark mode
    lines.push('/* Class-based dark mode */');
    lines.push('.dark, [data-theme="dark"] {');
    if (darkVars?.variables) {
      for (const category of ['colors', 'backgrounds', 'borders', 'text']) {
        const vars = darkVars.variables[category];
        if (vars) {
          for (const [name, value] of Object.entries(vars)) {
            lines.push(`  ${name}: ${value};`);
          }
        }
      }
    }
    lines.push('}');

    return lines.join('\n');
  }

  // ============================================
  // Full Detection
  // ============================================

  /**
   * Run complete theme detection and extraction
   */
  async function detect() {
    debug('Starting theme detection');

    const current = detectCurrentTheme();
    const themes = await extractBothThemes();
    const comparison = compareThemes(themes.current, themes.opposite);

    return {
      current: current.mode,
      mechanisms: current.mechanisms,
      supportsToggle: current.supportsToggle,
      themes: {
        light: themes.current.mode === 'light' ? themes.current : themes.opposite,
        dark: themes.current.mode === 'dark' ? themes.current : themes.opposite
      },
      comparison,
      css: generateThemeCSS(themes),
      timestamp: Date.now()
    };
  }

  // ============================================
  // Export
  // ============================================

  window.__seTheme = {
    installed: true,

    // Detection
    detect,
    detectThemeMechanism,
    detectCurrentTheme,

    // Switching
    switchTheme,
    extractWithTheme,

    // Extraction
    extractThemeVariables,
    extractBothThemes,

    // Comparison
    compareThemes,

    // Generation
    generateThemeCSS,

    // Helpers
    isColorDark
  };
})();
