// Style Extractor: StyleKit Adapter
// Bridges extracted styles with StyleKit's design system format
//
// This adapter:
// 1. Collects all extracted evidence (colors, typography, motion, components)
// 2. Normalizes and validates the data
// 3. Generates StyleKit-compatible output files
// 4. Provides import helpers for StyleKit integration
//
// Usage:
//   const adapter = window.__seStyleKit;
//   adapter.collect();           // Collect all extracted data
//   adapter.normalize();         // Normalize to StyleKit format
//   adapter.generateFiles();     // Generate importable files

(() => {
  if (window.__seStyleKit?.installed) return;

  // Debug mode - set window.__seDebug = true to enable logging
  const debug = (...args) => {
    if (window.__seDebug) console.log('[style-extractor]', ...args);
  };
  const debugWarn = (...args) => {
    if (window.__seDebug) console.warn('[style-extractor]', ...args);
  };

  // ============================================
  // StyleKit Schema Definitions
  // ============================================

  const STYLEKIT_SCHEMA = {
    // Color semantic roles
    colorRoles: [
      'primary', 'secondary', 'accent',
      'background', 'surface', 'surfaceAlt',
      'text', 'textMuted', 'textInverse',
      'border', 'borderMuted',
      'success', 'warning', 'error', 'info'
    ],

    // Typography tokens
    typographyTokens: {
      fontFamily: ['primary', 'secondary', 'mono', 'display'],
      fontSize: ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl'],
      fontWeight: ['light', 'normal', 'medium', 'semibold', 'bold'],
      lineHeight: ['tight', 'snug', 'normal', 'relaxed', 'loose']
    },

    // Spacing scale
    spacingScale: ['0', 'px', '0.5', '1', '1.5', '2', '2.5', '3', '4', '5', '6', '8', '10', '12', '16', '20', '24', '32', '40', '48', '56', '64'],

    // Border radius
    radiusScale: ['none', 'sm', 'default', 'md', 'lg', 'xl', '2xl', '3xl', 'full'],

    // Motion tokens
    motionTokens: {
      duration: ['instant', 'fast', 'normal', 'slow', 'slower'],
      easing: ['linear', 'in', 'out', 'inOut', 'bounce', 'elastic']
    }
  };

  // ============================================
  // Data Collection
  // ============================================

  function collectExtractedData() {
    const data = {
      meta: {
        url: location.href,
        title: document.title,
        timestamp: Date.now()
      },
      colors: {},
      typography: {},
      spacing: {},
      borders: {},
      shadows: {},
      motion: {},
      components: {}
    };

    // Collect from motion tools if available
    if (window.__seMotion?.installed) {
      const capture = window.__seMotion.capture('stylekit-collection');
      if (capture.animations?.length) {
        data.motion.runtimeAnimations = capture.animations;
      }
    }

    // Collect from component detector if available
    if (window.__seComponents?.installed) {
      const report = window.__seComponents.generateReport();
      data.components = report.components;
      data.componentDetails = report.interactiveDetails;
    }

    // Collect CSS custom properties from document
    const rootStyles = getComputedStyle(document.documentElement);
    const cssVars = {};

    // Try to get all CSS variables
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule.selectorText === ':root' || rule.selectorText === 'html') {
            for (const prop of rule.style) {
              if (prop.startsWith('--')) {
                cssVars[prop] = rule.style.getPropertyValue(prop).trim();
              }
            }
          }
        }
      } catch (e) {
        debugWarn('Cannot access stylesheet (likely cross-origin):', sheet.href);
      }
    }
    data.cssVariables = cssVars;

    // Extract colors from common elements
    data.colors = extractDocumentColors();

    // Extract typography
    data.typography = extractTypography();

    // Extract spacing patterns
    data.spacing = extractSpacing();

    return data;
  }

  function extractDocumentColors() {
    const colors = new Map();

    // Sample from key elements
    const selectors = [
      'body', 'main', 'header', 'footer', 'nav',
      'h1', 'h2', 'h3', 'p', 'a',
      'button', '.btn', '.button',
      '.card', '.panel', 'article'
    ];

    for (const sel of selectors) {
      try {
        const els = document.querySelectorAll(sel);
        for (const el of Array.from(els).slice(0, 3)) {
          const s = getComputedStyle(el);

          addColor(colors, s.color, 'text');
          addColor(colors, s.backgroundColor, 'background');
          addColor(colors, s.borderColor, 'border');
        }
      } catch (e) {
        debugWarn('Error extracting colors from selector:', sel, e.message);
      }
    }

    // Convert to object
    const result = {};
    for (const [color, info] of colors) {
      if (color && color !== 'transparent' && color !== 'rgba(0, 0, 0, 0)') {
        const key = `color-${info.count}`;
        result[key] = {
          value: color,
          usage: Array.from(info.usage),
          count: info.count
        };
      }
    }

    return result;
  }

  function addColor(map, color, usage) {
    if (!color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)') return;

    const normalized = normalizeColor(color);
    if (!map.has(normalized)) {
      map.set(normalized, { count: 0, usage: new Set() });
    }
    const info = map.get(normalized);
    info.count++;
    info.usage.add(usage);
  }

  function normalizeColor(color) {
    if (!color || typeof color !== 'string') return color;

    // Already hex
    if (color.startsWith('#')) return color;

    // rgb/rgba → hex
    if (color.startsWith('rgb')) {
      const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (match) {
        const [, r, g, b, a] = match;
        const hex = '#' + [r, g, b].map(x => parseInt(x).toString(16).padStart(2, '0')).join('');
        if (a !== undefined && parseFloat(a) < 1) {
          const alpha = Math.round(parseFloat(a) * 255).toString(16).padStart(2, '0');
          return hex + alpha;
        }
        return hex;
      }
    }

    // hsl/hsla → hex
    if (color.startsWith('hsl')) {
      const match = color.match(/hsla?\(([\d.]+),\s*([\d.]+)%?,\s*([\d.]+)%?(?:,\s*([\d.]+))?\)/);
      if (match) {
        const h = parseFloat(match[1]) / 360;
        const s = parseFloat(match[2]) / 100;
        const l = parseFloat(match[3]) / 100;
        const a = match[4] !== undefined ? parseFloat(match[4]) : 1;

        let r, g, b;
        if (s === 0) {
          r = g = b = l;
        } else {
          const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
          };
          const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
          const p = 2 * l - q;
          r = hue2rgb(p, q, h + 1/3);
          g = hue2rgb(p, q, h);
          b = hue2rgb(p, q, h - 1/3);
        }

        const toHex = v => Math.round(v * 255).toString(16).padStart(2, '0');
        const hex = '#' + toHex(r) + toHex(g) + toHex(b);
        if (a < 1) {
          return hex + Math.round(a * 255).toString(16).padStart(2, '0');
        }
        return hex;
      }
    }

    // oklch() → hex (approximate conversion via sRGB)
    if (color.startsWith('oklch')) {
      const match = color.match(/oklch\(([\d.]+%?)\s+([\d.]+%?)\s+([\d.]+(?:deg)?)/);
      if (match) {
        let L = parseFloat(match[1]);
        if (match[1].includes('%')) L /= 100;
        let C = parseFloat(match[2]);
        if (match[2].includes('%')) C = C / 100 * 0.4;
        const H = parseFloat(match[3]) * Math.PI / 180;

        // OKLCH → OKLab
        const a_lab = C * Math.cos(H);
        const b_lab = C * Math.sin(H);

        // OKLab → linear sRGB (approximate)
        const l_ = L + 0.3963377774 * a_lab + 0.2158037573 * b_lab;
        const m_ = L - 0.1055613458 * a_lab - 0.0638541728 * b_lab;
        const s_ = L - 0.0894841775 * a_lab - 1.2914855480 * b_lab;

        const l3 = l_ * l_ * l_;
        const m3 = m_ * m_ * m_;
        const s3 = s_ * s_ * s_;

        let rLin = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
        let gLin = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
        let bLin = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3;

        // Linear sRGB → sRGB gamma
        const gamma = v => v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(0, v), 1 / 2.4) - 0.055;
        const clamp = v => Math.max(0, Math.min(255, Math.round(gamma(v) * 255)));

        return '#' + [rLin, gLin, bLin].map(v => clamp(v).toString(16).padStart(2, '0')).join('');
      }
    }

    // color(srgb ...) → hex
    if (color.startsWith('color(')) {
      const match = color.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
      if (match) {
        const toHex = v => Math.max(0, Math.min(255, Math.round(parseFloat(v) * 255))).toString(16).padStart(2, '0');
        return '#' + toHex(match[1]) + toHex(match[2]) + toHex(match[3]);
      }
    }

    // lab() → hex (CIELab to sRGB approximate)
    if (color.startsWith('lab(')) {
      const match = color.match(/lab\(([\d.]+%?)\s+(-?[\d.]+)\s+(-?[\d.]+)/);
      if (match) {
        let L = parseFloat(match[1]);
        if (match[1].includes('%')) L = L;
        const a_val = parseFloat(match[2]);
        const b_val = parseFloat(match[3]);

        // Lab → XYZ D65
        const fy = (L + 16) / 116;
        const fx = a_val / 500 + fy;
        const fz = fy - b_val / 200;
        const delta = 6/29;
        const xyz = f => f > delta ? f * f * f : 3 * delta * delta * (f - 4/29);
        const X = 0.95047 * xyz(fx);
        const Y = 1.00000 * xyz(fy);
        const Z = 1.08883 * xyz(fz);

        // XYZ → linear sRGB
        let rLin = 3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z;
        let gLin = -0.9692660 * X + 1.8760108 * Y + 0.0415560 * Z;
        let bLin = 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z;

        const gamma = v => v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(0, v), 1 / 2.4) - 0.055;
        const clamp = v => Math.max(0, Math.min(255, Math.round(gamma(v) * 255)));

        return '#' + [rLin, gLin, bLin].map(v => clamp(v).toString(16).padStart(2, '0')).join('');
      }
    }

    return color;
  }

  function extractTypography() {
    const typography = {
      families: new Set(),
      sizes: new Map(),
      weights: new Set(),
      lineHeights: new Set()
    };

    const textSelectors = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'a', 'li', 'button', 'label'];

    for (const sel of textSelectors) {
      try {
        const els = document.querySelectorAll(sel);
        for (const el of Array.from(els).slice(0, 5)) {
          const s = getComputedStyle(el);

          typography.families.add(s.fontFamily);
          typography.weights.add(s.fontWeight);
          typography.lineHeights.add(s.lineHeight);

          const size = s.fontSize;
          if (!typography.sizes.has(size)) {
            typography.sizes.set(size, { count: 0, elements: [] });
          }
          typography.sizes.get(size).count++;
          if (typography.sizes.get(size).elements.length < 3) {
            typography.sizes.get(size).elements.push(sel);
          }
        }
      } catch (e) {
        debugWarn('Error extracting typography from selector:', sel, e.message);
      }
    }

    return {
      families: Array.from(typography.families),
      sizes: Object.fromEntries(typography.sizes),
      weights: Array.from(typography.weights),
      lineHeights: Array.from(typography.lineHeights)
    };
  }

  function extractSpacing() {
    const spacing = new Map();

    // Use targeted selectors instead of querySelectorAll('*') for better performance
    const spacingSelectors = [
      'main', 'section', 'article', 'aside', 'header', 'footer', 'nav',
      'div[class]', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li', 'figure', 'figcaption',
      '.container', '.wrapper', '.content', '.card', '.panel',
      '[class*="grid"]', '[class*="flex"]', '[class*="gap"]',
      '[class*="padding"]', '[class*="margin"]', '[class*="space"]'
    ];

    for (const sel of spacingSelectors) {
      try {
        const els = document.querySelectorAll(sel);
        // Limit to first 20 elements per selector
        for (const el of Array.from(els).slice(0, 20)) {
          const s = getComputedStyle(el);

          addSpacing(spacing, s.paddingTop);
          addSpacing(spacing, s.paddingRight);
          addSpacing(spacing, s.paddingBottom);
          addSpacing(spacing, s.paddingLeft);
          addSpacing(spacing, s.marginTop);
          addSpacing(spacing, s.marginRight);
          addSpacing(spacing, s.marginBottom);
          addSpacing(spacing, s.marginLeft);
          addSpacing(spacing, s.gap);
        }
      } catch (e) {
        debugWarn('Error extracting spacing from selector:', sel, e.message);
      }
    }

    // Sort by frequency and return top values
    const sorted = Array.from(spacing.entries())
      .filter(([v]) => v !== '0px' && v !== 'auto' && v !== 'normal')
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);

    return Object.fromEntries(sorted);
  }

  function addSpacing(map, value) {
    if (!value || value === '0px' || value === 'auto' || value === 'normal') return;
    map.set(value, (map.get(value) || 0) + 1);
  }

  // ============================================
  // Normalization to StyleKit Format
  // ============================================

  function normalizeToStyleKit(extractedData) {
    const stylekit = {
      id: generateId(extractedData.meta.url),
      name: extractedData.meta.title || 'Extracted Style',
      description: `Extracted from ${extractedData.meta.url}`,
      version: '1.0.0',
      source: {
        url: extractedData.meta.url,
        extractedAt: new Date(extractedData.meta.timestamp).toISOString()
      },

      tokens: {
        colors: {},
        typography: {},
        spacing: {},
        borders: {},
        shadows: {},
        motion: {}
      },

      components: {},
      examples: []
    };

    // Normalize colors
    stylekit.tokens.colors = normalizeColors(extractedData.colors, extractedData.cssVariables);

    // Normalize typography
    stylekit.tokens.typography = normalizeTypography(extractedData.typography);

    // Normalize spacing
    stylekit.tokens.spacing = normalizeSpacing(extractedData.spacing);

    // Normalize motion
    if (extractedData.motion?.runtimeAnimations) {
      stylekit.tokens.motion = normalizeMotion(extractedData.motion);
    }

    // Normalize components - merge interactiveDetails (with states) and basic components
    if (extractedData.componentDetails) {
      stylekit.components = normalizeComponents(extractedData.componentDetails);
    }
    // Fill in component types that were detected but not in interactiveDetails
    if (extractedData.components) {
      for (const [type, items] of Object.entries(extractedData.components)) {
        if (!stylekit.components[type] && items?.length) {
          stylekit.components[type] = items.map(item => ({
            selector: item.selector,
            styles: item.styles,
            states: {}
          }));
        }
      }
    }

    return stylekit;
  }

  function generateId(url) {
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname || '';
      if (hostname) {
        return hostname.replace(/\./g, '-').replace(/^www-/, '');
      }

      // file:// URLs do not expose hostnames. Build a stable local id from file name.
      if (parsed.protocol === 'file:') {
        const fileName = (parsed.pathname || '').split('/').filter(Boolean).pop() || 'local-file';
        return `file-${fileName.replace(/\.[a-z0-9]+$/i, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'local-file'}`;
      }
    } catch {
      // Ignore and fallback below.
    }

    return 'extracted-' + Date.now();
  }

  // Generate safe JS identifier from id (must start with letter, only alphanumeric)
  function toSafeIdentifier(id) {
    if (!id) return 'extracted';
    // Remove dashes and convert to camelCase-ish
    let safe = id.replace(/-([a-z0-9])/gi, (_, c) => c.toUpperCase()).replace(/-/g, '');
    // Remove non-alphanumeric characters
    safe = safe.replace(/[^a-zA-Z0-9]/g, '');
    // Ensure starts with letter
    if (/^[0-9]/.test(safe)) {
      safe = 'style' + safe;
    }
    return safe || 'extracted';
  }

  function normalizeColors(colors, cssVars) {
    const result = {
      semantic: {},
      palette: {},
      raw: {}
    };

    // Map CSS variables to semantic names
    for (const [varName, value] of Object.entries(cssVars || {})) {
      const name = varName.replace(/^--/, '');
      const lower = name.toLowerCase();

      if (lower.includes('primary')) {
        result.semantic.primary = result.semantic.primary || value;
      } else if (lower.includes('secondary')) {
        result.semantic.secondary = result.semantic.secondary || value;
      } else if (lower.includes('accent')) {
        result.semantic.accent = result.semantic.accent || value;
      } else if (lower.includes('background') || lower.includes('bg')) {
        result.semantic.background = result.semantic.background || value;
      } else if (lower.includes('surface')) {
        result.semantic.surface = result.semantic.surface || value;
      } else if (lower.includes('text') && !lower.includes('muted')) {
        result.semantic.text = result.semantic.text || value;
      } else if (lower.includes('muted')) {
        result.semantic.textMuted = result.semantic.textMuted || value;
      } else if (lower.includes('border')) {
        result.semantic.border = result.semantic.border || value;
      } else if (lower.includes('error') || lower.includes('danger')) {
        result.semantic.error = result.semantic.error || value;
      } else if (lower.includes('success')) {
        result.semantic.success = result.semantic.success || value;
      } else if (lower.includes('warning')) {
        result.semantic.warning = result.semantic.warning || value;
      }

      result.raw[name] = value;
    }

    // Add extracted colors to palette with confidence
    for (const [key, info] of Object.entries(colors || {})) {
      result.palette[key] = {
        value: info.value,
        usage: info.usage ? Array.from(info.usage) : [],
        confidence: countToConfidence(info.count || 1),
      };

      // Try to infer semantic usage
      if (info.usage?.includes('text') && !result.semantic.text) {
        result.semantic.text = info.value;
      }
      if (info.usage?.includes('background') && !result.semantic.background) {
        result.semantic.background = info.value;
      }
    }

    return result;
  }

  function normalizeTypography(typography) {
    const result = {
      fontFamily: {},
      fontSize: {},
      fontWeight: {},
      lineHeight: {}
    };

    // Font families
    if (typography.families?.length) {
      result.fontFamily.primary = typography.families[0];
      if (typography.families[1]) {
        result.fontFamily.secondary = typography.families[1];
      }
      for (const family of typography.families) {
        if (family.toLowerCase().includes('mono') || family.toLowerCase().includes('code')) {
          result.fontFamily.mono = family;
          break;
        }
      }
    }

    // Font sizes - sort and assign to scale
    if (typography.sizes) {
      const sizes = Object.entries(typography.sizes)
        .map(([size, info]) => ({ size, px: parseInt(size), count: info.count }))
        .filter(s => !isNaN(s.px))
        .sort((a, b) => a.px - b.px);

      const scaleNames = ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl'];
      const step = Math.max(1, Math.floor(sizes.length / scaleNames.length));

      for (let i = 0; i < scaleNames.length && i * step < sizes.length; i++) {
        result.fontSize[scaleNames[i]] = sizes[Math.min(i * step, sizes.length - 1)].size;
      }
    }

    // Font weights
    if (typography.weights?.length) {
      const weights = typography.weights.map(w => parseInt(w)).filter(w => !isNaN(w)).sort((a, b) => a - b);
      if (weights.length) {
        result.fontWeight.normal = String(weights[0]);
        if (weights.length > 1) {
          result.fontWeight.bold = String(weights[weights.length - 1]);
        }
        if (weights.length > 2) {
          result.fontWeight.medium = String(weights[Math.floor(weights.length / 2)]);
        }
      }
    }

    // Line heights
    if (typography.lineHeights?.length) {
      const lhs = typography.lineHeights
        .map(lh => parseFloat(lh))
        .filter(lh => !isNaN(lh))
        .sort((a, b) => a - b);

      if (lhs.length) {
        result.lineHeight.tight = String(lhs[0]);
        result.lineHeight.normal = String(lhs[Math.floor(lhs.length / 2)]);
        if (lhs.length > 1) {
          result.lineHeight.relaxed = String(lhs[lhs.length - 1]);
        }
      }
    }

    return result;
  }

  function normalizeSpacing(spacing) {
    const result = {};
    const scaleNames = ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl'];

    const values = Object.entries(spacing)
      .map(([size, count]) => ({ size, px: parseInt(size), count }))
      .filter(s => !isNaN(s.px) && s.px > 0)
      .sort((a, b) => a.px - b.px);

    const step = Math.max(1, Math.floor(values.length / scaleNames.length));

    for (let i = 0; i < scaleNames.length && i * step < values.length; i++) {
      result[scaleNames[i]] = values[Math.min(i * step, values.length - 1)].size;
    }

    return result;
  }

  function normalizeMotion(motion) {
    const result = {
      duration: {},
      easing: {},
      keyframes: {}
    };

    if (motion.runtimeAnimations) {
      const durations = new Set();
      const easings = new Set();

      for (const anim of motion.runtimeAnimations) {
        if (anim.timing?.duration) {
          // Normalize duration to number (ms)
          const dur = typeof anim.timing.duration === 'string'
            ? parseFloat(anim.timing.duration)
            : anim.timing.duration;
          if (!isNaN(dur) && dur > 0) {
            durations.add(dur);
          }
        }
        if (anim.timing?.easing) {
          easings.add(anim.timing.easing);
        }
      }

      // Map durations to scale (ensure numeric sort)
      const durationList = Array.from(durations).sort((a, b) => Number(a) - Number(b));
      if (durationList.length) {
        result.duration.fast = `${durationList[0]}ms`;
        result.duration.normal = `${durationList[Math.floor(durationList.length / 2)]}ms`;
        if (durationList.length > 1) {
          result.duration.slow = `${durationList[durationList.length - 1]}ms`;
        }
      }

      // Collect easings
      result.easing = Object.fromEntries(
        Array.from(easings).map((e, i) => [`easing-${i}`, e])
      );
    }

    return result;
  }

  // ============================================
  // Confidence Scoring
  // ============================================

  function countToConfidence(count) {
    if (count >= 5) return 'high';
    if (count >= 2) return 'medium';
    return 'low';
  }

  function stateConfidence(stateData) {
    if (!stateData) return 'low';
    const stateCount = ['hover', 'active', 'focus', 'disabled']
      .filter(s => stateData[s] && Object.keys(stateData[s]).length > 0).length;
    if (stateCount >= 3) return 'high';
    if (stateCount >= 1) return 'medium';
    return 'low';
  }

  function componentConfidence(items) {
    const count = items?.length || 0;
    const hasStates = items?.some(i => i.states && Object.keys(i.states).length > 0);
    if (count >= 3 && hasStates) return 'high';
    if (count >= 2 || hasStates) return 'medium';
    return 'low';
  }

  // Map plural interactiveDetails keys to singular component type keys
  const PLURAL_TO_SINGULAR = {
    buttons: 'button', inputs: 'input', navItems: 'navItem',
    cards: 'card', badges: 'badge', modals: 'modal', navigations: 'navigation',
  };

  function normalizeComponents(componentDetails) {
    const result = {};

    for (const [type, items] of Object.entries(componentDetails)) {
      if (!items?.length) continue;
      const singularType = PLURAL_TO_SINGULAR[type] || type;

      const normalized = items.map(item => ({
        selector: item.selector,
        styles: item.styles,
        states: item.states?.states || {},
        confidence: stateConfidence(item.states?.states),
      }));
      normalized._confidence = componentConfidence(normalized);

      result[singularType] = normalized;
    }

    return result;
  }

  // ============================================
  // CSS → Tailwind Mapping
  // ============================================

  // Color hex → nearest Tailwind color class
  const TW_COLORS = {
    '#000000': 'black', '#ffffff': 'white', '#f8fafc': 'slate-50', '#f1f5f9': 'slate-100',
    '#e2e8f0': 'slate-200', '#cbd5e1': 'slate-300', '#94a3b8': 'slate-400', '#64748b': 'slate-500',
    '#475569': 'slate-600', '#334155': 'slate-700', '#1e293b': 'slate-800', '#0f172a': 'slate-900',
    '#f9fafb': 'gray-50', '#f3f4f6': 'gray-100', '#e5e7eb': 'gray-200', '#d1d5db': 'gray-300',
    '#9ca3af': 'gray-400', '#6b7280': 'gray-500', '#4b5563': 'gray-600', '#374151': 'gray-700',
    '#1f2937': 'gray-800', '#111827': 'gray-900', '#fef2f2': 'red-50', '#fee2e2': 'red-100',
    '#fecaca': 'red-200', '#fca5a5': 'red-300', '#f87171': 'red-400', '#ef4444': 'red-500',
    '#dc2626': 'red-600', '#b91c1c': 'red-700', '#991b1b': 'red-800',
    '#fefce8': 'yellow-50', '#fef9c3': 'yellow-100', '#fef08a': 'yellow-200',
    '#fde047': 'yellow-300', '#facc15': 'yellow-400', '#eab308': 'yellow-500',
    '#ecfdf5': 'green-50', '#d1fae5': 'green-100', '#a7f3d0': 'green-200',
    '#6ee7b7': 'green-300', '#34d399': 'green-400', '#10b981': 'green-500',
    '#059669': 'green-600', '#047857': 'green-700', '#065f46': 'green-800',
    '#eff6ff': 'blue-50', '#dbeafe': 'blue-100', '#bfdbfe': 'blue-200',
    '#93c5fd': 'blue-300', '#60a5fa': 'blue-400', '#3b82f6': 'blue-500',
    '#2563eb': 'blue-600', '#1d4ed8': 'blue-700', '#1e40af': 'blue-800',
    '#eef2ff': 'indigo-50', '#e0e7ff': 'indigo-100', '#c7d2fe': 'indigo-200',
    '#a5b4fc': 'indigo-300', '#818cf8': 'indigo-400', '#6366f1': 'indigo-500',
    '#4f46e5': 'indigo-600', '#4338ca': 'indigo-700',
    '#fdf4ff': 'purple-50', '#fae8ff': 'purple-100', '#e9d5ff': 'purple-200',
    '#d8b4fe': 'purple-300', '#c084fc': 'purple-400', '#a855f7': 'purple-500',
    '#9333ea': 'purple-600', '#7e22ce': 'purple-700',
    '#fdf2f8': 'pink-50', '#fce7f3': 'pink-100', '#fbcfe8': 'pink-200',
    '#f9a8d4': 'pink-300', '#f472b6': 'pink-400', '#ec4899': 'pink-500',
    '#db2777': 'pink-600', '#be185d': 'pink-700',
    '#fff7ed': 'orange-50', '#ffedd5': 'orange-100', '#fed7aa': 'orange-200',
    '#fdba74': 'orange-300', '#fb923c': 'orange-400', '#f97316': 'orange-500',
    '#ea580c': 'orange-600', '#c2410c': 'orange-700',
    '#f0fdfa': 'teal-50', '#ccfbf1': 'teal-100', '#99f6e4': 'teal-200',
    '#5eead4': 'teal-300', '#2dd4bf': 'teal-400', '#14b8a6': 'teal-500',
    '#0d9488': 'teal-600', '#0f766e': 'teal-700',
    '#ecfeff': 'cyan-50', '#cffafe': 'cyan-100', '#a5f3fc': 'cyan-200',
    '#67e8f9': 'cyan-300', '#22d3ee': 'cyan-400', '#06b6d4': 'cyan-500',
    '#0891b2': 'cyan-600', '#0e7490': 'cyan-700',
    '#f0fdf4': 'emerald-50', '#d1fae5': 'emerald-100', '#a7f3d0': 'emerald-200',
    '#6ee7b7': 'emerald-300', '#34d399': 'emerald-400', '#10b981': 'emerald-500',
    '#f5f3ff': 'violet-50', '#ede9fe': 'violet-100', '#ddd6fe': 'violet-200',
    '#c4b5fd': 'violet-300', '#a78bfa': 'violet-400', '#8b5cf6': 'violet-500',
    '#7c3aed': 'violet-600', '#6d28d9': 'violet-700',
    '#fefce8': 'amber-50', '#fef3c7': 'amber-100', '#fde68a': 'amber-200',
    '#fcd34d': 'amber-300', '#fbbf24': 'amber-400', '#f59e0b': 'amber-500',
    '#d97706': 'amber-600', '#b45309': 'amber-700',
    '#fff1f2': 'rose-50', '#ffe4e6': 'rose-100', '#fecdd3': 'rose-200',
    '#fda4af': 'rose-300', '#fb7185': 'rose-400', '#f43f5e': 'rose-500',
    '#e11d48': 'rose-600', '#be123c': 'rose-700',
    '#ecfdf5': 'emerald-50', '#d1fae5': 'emerald-100',
    '#f7fee7': 'lime-50', '#ecfccb': 'lime-100', '#d9f99d': 'lime-200',
    '#bef264': 'lime-300', '#a3e635': 'lime-400', '#84cc16': 'lime-500',
    '#e0f2fe': 'sky-100', '#bae6fd': 'sky-200', '#7dd3fc': 'sky-300',
    '#38bdf8': 'sky-400', '#0ea5e9': 'sky-500', '#0284c7': 'sky-600',
  };

  // ── Color Science: RGB → LAB → Delta-E CIE2000 ──

  function hexToRgb(hex) {
    return {
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16),
    };
  }

  function rgbToLab({ r, g, b }) {
    // sRGB → linear RGB
    let rl = r / 255, gl = g / 255, bl = b / 255;
    rl = rl > 0.04045 ? ((rl + 0.055) / 1.055) ** 2.4 : rl / 12.92;
    gl = gl > 0.04045 ? ((gl + 0.055) / 1.055) ** 2.4 : gl / 12.92;
    bl = bl > 0.04045 ? ((bl + 0.055) / 1.055) ** 2.4 : bl / 12.92;
    // linear RGB → XYZ (D65)
    let x = (rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375) / 0.95047;
    let y = (rl * 0.2126729 + gl * 0.7151522 + bl * 0.0721750);
    let z = (rl * 0.0193339 + gl * 0.1191920 + bl * 0.9503041) / 1.08883;
    // XYZ → LAB
    const f = t => t > 0.008856 ? t ** (1 / 3) : 7.787 * t + 16 / 116;
    x = f(x); y = f(y); z = f(z);
    return { l: 116 * y - 16, a: 500 * (x - y), b: 200 * (y - z) };
  }

  function deltaE2000(lab1, lab2) {
    const { l: L1, a: a1, b: b1 } = lab1;
    const { l: L2, a: a2, b: b2 } = lab2;
    const rad = Math.PI / 180;
    const avg_Lp = (L1 + L2) / 2;
    const C1 = Math.sqrt(a1 * a1 + b1 * b1);
    const C2 = Math.sqrt(a2 * a2 + b2 * b2);
    const avg_C = (C1 + C2) / 2;
    const G = 0.5 * (1 - Math.sqrt(avg_C ** 7 / (avg_C ** 7 + 25 ** 7)));
    const a1p = a1 * (1 + G), a2p = a2 * (1 + G);
    const C1p = Math.sqrt(a1p * a1p + b1 * b1);
    const C2p = Math.sqrt(a2p * a2p + b2 * b2);
    const avg_Cp = (C1p + C2p) / 2;
    let h1p = Math.atan2(b1, a1p) / rad; if (h1p < 0) h1p += 360;
    let h2p = Math.atan2(b2, a2p) / rad; if (h2p < 0) h2p += 360;
    let dHP = h2p - h1p;
    if (Math.abs(dHP) > 180) dHP += dHP > 0 ? -360 : 360;
    const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(dHP * rad / 2);
    let avg_Hp = (h1p + h2p) / 2;
    if (Math.abs(h1p - h2p) > 180) avg_Hp += avg_Hp < 180 ? 180 : -180;
    const T = 1 - 0.17 * Math.cos((avg_Hp - 30) * rad) + 0.24 * Math.cos(2 * avg_Hp * rad) +
      0.32 * Math.cos((3 * avg_Hp + 6) * rad) - 0.20 * Math.cos((4 * avg_Hp - 63) * rad);
    const SL = 1 + 0.015 * (avg_Lp - 50) ** 2 / Math.sqrt(20 + (avg_Lp - 50) ** 2);
    const SC = 1 + 0.045 * avg_Cp;
    const SH = 1 + 0.015 * avg_Cp * T;
    const RT_exp = -2 * Math.sqrt(avg_Cp ** 7 / (avg_Cp ** 7 + 25 ** 7));
    const d_theta = 30 * Math.exp(-(((avg_Hp - 275) / 25) ** 2));
    const RT = RT_exp * Math.sin(2 * d_theta * rad);
    const dLp = L2 - L1, dCp = C2p - C1p;
    return Math.sqrt((dLp / SL) ** 2 + (dCp / SC) ** 2 + (dHp / SH) ** 2 + RT * (dCp / SC) * (dHp / SH));
  }

  // Pre-compute LAB values for TW_COLORS (once)
  const TW_COLORS_LAB = {};
  for (const hex of Object.keys(TW_COLORS)) {
    TW_COLORS_LAB[hex] = rgbToLab(hexToRgb(hex));
  }

  function colorToTw(cssColor) {
    if (!cssColor || cssColor === 'transparent' || cssColor === 'rgba(0, 0, 0, 0)') return null;
    const hex = normalizeColor(cssColor);
    if (!hex || !hex.startsWith('#') || hex.length < 7) return null;
    const short = hex.slice(0, 7).toLowerCase();
    if (TW_COLORS[short]) return TW_COLORS[short];
    // Delta-E CIE2000 nearest match
    const lab = rgbToLab(hexToRgb(short));
    let best = null, bestDe = Infinity;
    for (const [h, twLab] of Object.entries(TW_COLORS_LAB)) {
      const de = deltaE2000(lab, twLab);
      if (de < bestDe) { bestDe = de; best = TW_COLORS[h]; }
    }
    // Delta-E < 10 is "close enough" perceptually; < 25 is "same general color"
    return bestDe < 15 ? best : null;
  }

  // px → Tailwind spacing mapping
  const TW_SPACING = {
    '0': '0', '1': 'px', '2': '0.5', '4': '1', '6': '1.5', '8': '2', '10': '2.5',
    '12': '3', '14': '3.5', '16': '4', '20': '5', '24': '6', '28': '7', '32': '8',
    '36': '9', '40': '10', '44': '11', '48': '12', '56': '14', '64': '16',
    '80': '20', '96': '24', '112': '28', '128': '32', '160': '40', '192': '48',
    '224': '56', '256': '64',
  };

  function pxToTwSpacing(pxVal) {
    if (!pxVal) return null;
    const n = parseFloat(pxVal);
    if (isNaN(n)) return null;
    const rounded = Math.round(n);
    if (TW_SPACING[String(rounded)]) return TW_SPACING[String(rounded)];
    // Find nearest
    let best = null, bestDist = Infinity;
    for (const [px, tw] of Object.entries(TW_SPACING)) {
      const d = Math.abs(rounded - Number(px));
      if (d < bestDist) { bestDist = d; best = tw; }
    }
    return bestDist <= 4 ? best : null;
  }

  // Border radius → Tailwind class
  function borderRadiusToTw(val) {
    if (!val || val === '0px') return 'rounded-none';
    const n = parseFloat(val);
    if (isNaN(n)) return null;
    if (n >= 9999) return 'rounded-full';
    if (n >= 24) return 'rounded-3xl';
    if (n >= 16) return 'rounded-2xl';
    if (n >= 12) return 'rounded-xl';
    if (n >= 8) return 'rounded-lg';
    if (n >= 6) return 'rounded-md';
    if (n >= 4) return 'rounded';
    if (n >= 2) return 'rounded-sm';
    return 'rounded-none';
  }

  // Font size → Tailwind class
  function fontSizeToTw(val) {
    if (!val) return null;
    const n = parseFloat(val);
    if (isNaN(n)) return null;
    if (n <= 12) return 'text-xs';
    if (n <= 14) return 'text-sm';
    if (n <= 16) return 'text-base';
    if (n <= 18) return 'text-lg';
    if (n <= 20) return 'text-xl';
    if (n <= 24) return 'text-2xl';
    if (n <= 30) return 'text-3xl';
    if (n <= 36) return 'text-4xl';
    if (n <= 48) return 'text-5xl';
    if (n <= 60) return 'text-6xl';
    if (n <= 72) return 'text-7xl';
    if (n <= 96) return 'text-8xl';
    return 'text-9xl';
  }

  // Font weight → Tailwind class
  function fontWeightToTw(val) {
    if (!val) return null;
    const n = parseInt(val);
    if (n <= 100) return 'font-thin';
    if (n <= 200) return 'font-extralight';
    if (n <= 300) return 'font-light';
    if (n <= 400) return 'font-normal';
    if (n <= 500) return 'font-medium';
    if (n <= 600) return 'font-semibold';
    if (n <= 700) return 'font-bold';
    if (n <= 800) return 'font-extrabold';
    return 'font-black';
  }

  // Border width → Tailwind class
  function borderWidthToTw(val) {
    if (!val) return null;
    const n = parseFloat(val);
    if (n === 0) return 'border-0';
    if (n <= 1) return 'border';
    if (n <= 2) return 'border-2';
    if (n <= 4) return 'border-4';
    return 'border-8';
  }

  // Box shadow → Tailwind class (best-effort)
  function boxShadowToTw(val) {
    if (!val || val === 'none') return null;
    // Hard offset shadows (brutalist-style)
    if (/\d+px\s+\d+px\s+0px/.test(val)) return `shadow-[${val.replace(/\s+/g, '_')}]`;
    // Generic shadow classification by blur radius
    const blur = val.match(/\d+px\s+\d+px\s+(\d+)px/);
    if (blur) {
      const b = parseInt(blur[1]);
      if (b <= 2) return 'shadow-sm';
      if (b <= 6) return 'shadow';
      if (b <= 15) return 'shadow-md';
      if (b <= 25) return 'shadow-lg';
      if (b <= 50) return 'shadow-xl';
      return 'shadow-2xl';
    }
    return 'shadow';
  }

  // Opacity → Tailwind class
  function opacityToTw(val) {
    if (!val) return null;
    const n = parseFloat(val);
    if (n >= 1) return null;
    const rounded = Math.round(n * 100 / 5) * 5;
    return `opacity-${rounded}`;
  }

  // Full computed styles → array of Tailwind classes
  function stylesToTailwind(styles) {
    if (!styles) return [];
    const classes = [];

    // Background color
    const bgTw = colorToTw(styles.backgroundColor);
    if (bgTw) classes.push(`bg-${bgTw}`);

    // Text color
    const textTw = colorToTw(styles.color);
    if (textTw) classes.push(`text-${textTw}`);

    // Border
    const bw = borderWidthToTw(styles.borderWidth);
    if (bw && bw !== 'border-0') {
      classes.push(bw);
      const bc = colorToTw(styles.borderColor);
      if (bc) classes.push(`border-${bc}`);
    }

    // Border radius
    const br = borderRadiusToTw(styles.borderRadius);
    if (br) classes.push(br);

    // Font size
    const fs = fontSizeToTw(styles.fontSize);
    if (fs) classes.push(fs);

    // Font weight
    const fw = fontWeightToTw(styles.fontWeight);
    if (fw && fw !== 'font-normal') classes.push(fw);

    // Box shadow
    const shadow = boxShadowToTw(styles.boxShadow);
    if (shadow) classes.push(shadow);

    // Opacity
    const opacity = opacityToTw(styles.opacity);
    if (opacity) classes.push(opacity);

    // Padding (simplified - use largest axis)
    const pt = pxToTwSpacing(styles.paddingTop);
    const pr = pxToTwSpacing(styles.paddingRight);
    const pb = pxToTwSpacing(styles.paddingBottom);
    const pl = pxToTwSpacing(styles.paddingLeft);
    if (pt && pr && pb && pl) {
      if (pt === pb && pl === pr && pt === pl) {
        classes.push(`p-${pt}`);
      } else if (pt === pb && pl === pr) {
        classes.push(`py-${pt}`, `px-${pl}`);
      } else {
        if (pt) classes.push(`pt-${pt}`);
        if (pr) classes.push(`pr-${pr}`);
        if (pb) classes.push(`pb-${pb}`);
        if (pl) classes.push(`pl-${pl}`);
      }
    }

    // Transition
    if (styles.transitionDuration && styles.transitionDuration !== '0s') {
      classes.push('transition-all');
      const ms = parseFloat(styles.transitionDuration) * 1000;
      if (ms <= 75) classes.push('duration-75');
      else if (ms <= 100) classes.push('duration-100');
      else if (ms <= 150) classes.push('duration-150');
      else if (ms <= 200) classes.push('duration-200');
      else if (ms <= 300) classes.push('duration-300');
      else if (ms <= 500) classes.push('duration-500');
      else if (ms <= 700) classes.push('duration-700');
      else classes.push('duration-1000');
    }

    // Cursor
    if (styles.cursor === 'pointer') classes.push('cursor-pointer');
    if (styles.cursor === 'not-allowed') classes.push('cursor-not-allowed');

    // Line height
    if (styles.lineHeight) {
      const lh = parseFloat(styles.lineHeight);
      const fs = parseFloat(styles.fontSize) || 16;
      const ratio = lh / fs;
      if (ratio <= 1) classes.push('leading-none');
      else if (ratio <= 1.25) classes.push('leading-tight');
      else if (ratio <= 1.375) classes.push('leading-snug');
      else if (ratio <= 1.5) classes.push('leading-normal');
      else if (ratio <= 1.625) classes.push('leading-relaxed');
      else classes.push('leading-loose');
    }

    // Letter spacing
    if (styles.letterSpacing) {
      const ls = parseFloat(styles.letterSpacing);
      if (ls < -0.04) classes.push('tracking-tighter');
      else if (ls < -0.01) classes.push('tracking-tight');
      else if (ls > 0.1) classes.push('tracking-widest');
      else if (ls > 0.05) classes.push('tracking-wider');
      else if (ls > 0.02) classes.push('tracking-wide');
    }

    // Text transform
    if (styles.textTransform === 'uppercase') classes.push('uppercase');
    else if (styles.textTransform === 'lowercase') classes.push('lowercase');
    else if (styles.textTransform === 'capitalize') classes.push('capitalize');

    // Gap
    const gap = pxToTwSpacing(styles.gap);
    if (gap) classes.push(`gap-${gap}`);
    const colGap = pxToTwSpacing(styles.columnGap);
    if (colGap) classes.push(`gap-x-${colGap}`);
    const rowGap = pxToTwSpacing(styles.rowGap);
    if (rowGap) classes.push(`gap-y-${rowGap}`);

    // Display
    if (styles.display === 'flex') classes.push('flex');
    else if (styles.display === 'inline-flex') classes.push('inline-flex');
    else if (styles.display === 'grid') classes.push('grid');
    else if (styles.display === 'inline-block') classes.push('inline-block');
    else if (styles.display === 'none') classes.push('hidden');

    // Flex direction
    if (styles.flexDirection === 'column') classes.push('flex-col');
    else if (styles.flexDirection === 'column-reverse') classes.push('flex-col-reverse');
    else if (styles.flexDirection === 'row-reverse') classes.push('flex-row-reverse');

    // Align items
    if (styles.alignItems === 'center') classes.push('items-center');
    else if (styles.alignItems === 'flex-start') classes.push('items-start');
    else if (styles.alignItems === 'flex-end') classes.push('items-end');
    else if (styles.alignItems === 'stretch') classes.push('items-stretch');
    else if (styles.alignItems === 'baseline') classes.push('items-baseline');

    // Justify content
    if (styles.justifyContent === 'center') classes.push('justify-center');
    else if (styles.justifyContent === 'flex-start') classes.push('justify-start');
    else if (styles.justifyContent === 'flex-end') classes.push('justify-end');
    else if (styles.justifyContent === 'space-between') classes.push('justify-between');
    else if (styles.justifyContent === 'space-around') classes.push('justify-around');
    else if (styles.justifyContent === 'space-evenly') classes.push('justify-evenly');

    // Width
    if (styles.width === '100%') classes.push('w-full');
    else if (styles.width === 'auto') { /* skip */ }
    else {
      const w = pxToTwSpacing(styles.width);
      if (w) classes.push(`w-${w}`);
    }

    // Height
    if (styles.height === '100%') classes.push('h-full');
    else if (styles.height === 'auto') { /* skip */ }
    else if (styles.height === '100vh') classes.push('h-screen');

    // Max width
    if (styles.maxWidth) {
      const mw = parseFloat(styles.maxWidth);
      if (mw <= 320) classes.push('max-w-xs');
      else if (mw <= 384) classes.push('max-w-sm');
      else if (mw <= 448) classes.push('max-w-md');
      else if (mw <= 512) classes.push('max-w-lg');
      else if (mw <= 576) classes.push('max-w-xl');
      else if (mw <= 672) classes.push('max-w-2xl');
      else if (mw <= 768) classes.push('max-w-3xl');
      else if (mw <= 896) classes.push('max-w-4xl');
      else if (mw <= 1024) classes.push('max-w-5xl');
      else if (mw <= 1152) classes.push('max-w-6xl');
      else if (mw <= 1280) classes.push('max-w-7xl');
      else if (styles.maxWidth === 'none') classes.push('max-w-none');
    }

    // Overflow
    if (styles.overflow === 'hidden') classes.push('overflow-hidden');
    else if (styles.overflow === 'auto') classes.push('overflow-auto');
    else if (styles.overflow === 'scroll') classes.push('overflow-scroll');

    // Position
    if (styles.position === 'relative') classes.push('relative');
    else if (styles.position === 'absolute') classes.push('absolute');
    else if (styles.position === 'fixed') classes.push('fixed');
    else if (styles.position === 'sticky') classes.push('sticky');

    // Z-index
    if (styles.zIndex && styles.zIndex !== 'auto') {
      const z = parseInt(styles.zIndex, 10);
      if (z === 0) classes.push('z-0');
      else if (z <= 10) classes.push('z-10');
      else if (z <= 20) classes.push('z-20');
      else if (z <= 30) classes.push('z-30');
      else if (z <= 40) classes.push('z-40');
      else if (z <= 50) classes.push('z-50');
    }

    // Backdrop filter (blur)
    if (styles.backdropFilter) {
      const blurMatch = styles.backdropFilter.match(/blur\((\d+(?:\.\d+)?)px\)/);
      if (blurMatch) {
        const px = parseFloat(blurMatch[1]);
        if (px <= 4) classes.push('backdrop-blur-sm');
        else if (px <= 8) classes.push('backdrop-blur');
        else if (px <= 12) classes.push('backdrop-blur-md');
        else if (px <= 16) classes.push('backdrop-blur-lg');
        else if (px <= 24) classes.push('backdrop-blur-xl');
        else classes.push('backdrop-blur-2xl');
      }
    }

    // Text decoration
    if (styles.textDecoration?.includes('underline')) classes.push('underline');
    else if (styles.textDecoration?.includes('line-through')) classes.push('line-through');

    // Text shadow (map to drop-shadow utility)
    if (styles.textShadow && styles.textShadow !== 'none') {
      // Parse "Xpx Ypx Bpx color" pattern
      const tsm = styles.textShadow.match(/([\d.]+)px\s+([\d.]+)px\s+([\d.]+)px/);
      if (tsm) {
        const blur = parseFloat(tsm[3]);
        if (blur <= 1) classes.push('drop-shadow-sm');
        else if (blur <= 3) classes.push('drop-shadow');
        else if (blur <= 6) classes.push('drop-shadow-md');
        else if (blur <= 10) classes.push('drop-shadow-lg');
        else classes.push('drop-shadow-xl');
      }
    }

    // Background gradient (linear-gradient → bg-gradient-to-* + from/to colors)
    if (styles.backgroundImage && styles.backgroundImage.includes('linear-gradient')) {
      const gm = styles.backgroundImage.match(/linear-gradient\(\s*(?:to\s+)?([\w\s]+?)?\s*,\s*([^,)]+)\s*(?:,\s*([^,)]+))?\s*(?:,\s*([^,)]+))?\s*\)/);
      if (gm) {
        // Direction
        const dir = (gm[1] || '').trim().toLowerCase();
        const dirMap = {
          'bottom': 'bg-gradient-to-b', 'top': 'bg-gradient-to-t',
          'right': 'bg-gradient-to-r', 'left': 'bg-gradient-to-l',
          'bottom right': 'bg-gradient-to-br', 'bottom left': 'bg-gradient-to-bl',
          'top right': 'bg-gradient-to-tr', 'top left': 'bg-gradient-to-tl',
          '180deg': 'bg-gradient-to-b', '0deg': 'bg-gradient-to-t',
          '90deg': 'bg-gradient-to-r', '270deg': 'bg-gradient-to-l',
        };
        classes.push(dirMap[dir] || 'bg-gradient-to-r');

        // Color stops
        const fromColor = colorToTw(gm[2]?.trim());
        if (fromColor) classes.push(`from-${fromColor}`);
        if (gm[3]) {
          const viaColor = colorToTw(gm[3].trim());
          if (viaColor) {
            if (gm[4]) {
              classes.push(`via-${viaColor}`);
              const toColor = colorToTw(gm[4].trim());
              if (toColor) classes.push(`to-${toColor}`);
            } else {
              classes.push(`to-${viaColor}`);
            }
          }
        }
      }
    }

    return classes;
  }

  // Compare two style objects, return Tailwind classes for the diff
  function stateStyleDiff(defaultStyles, stateStyles) {
    if (!stateStyles || !defaultStyles) return [];
    const diff = [];
    for (const prop of Object.keys(stateStyles)) {
      if (defaultStyles[prop] !== stateStyles[prop]) {
        const single = {};
        single[prop] = stateStyles[prop];
        const tw = stylesToTailwind(single);
        diff.push(...tw);
      }
    }
    return diff;
  }

  // ============================================
  // Recipe Generation
  // ============================================

  const COMPONENT_TYPE_META = {
    button: { element: 'button', name: 'Button', nameZh: '按钮', desc: 'button', slotsType: 'button' },
    card: { element: 'div', name: 'Card', nameZh: '卡片', desc: 'card', slotsType: 'card' },
    input: { element: 'input', name: 'Input', nameZh: '输入框', desc: 'input', slotsType: 'input' },
    navigation: { element: 'nav', name: 'Navigation', nameZh: '导航', desc: 'navigation bar', slotsType: 'children' },
    navItem: { element: 'a', name: 'Nav Item', nameZh: '导航项', desc: 'navigation item', slotsType: 'label' },
    badge: { element: 'div', name: 'Badge', nameZh: '徽章', desc: 'badge/tag', slotsType: 'label' },
    modal: { element: 'div', name: 'Modal', nameZh: '弹窗', desc: 'modal dialog', slotsType: 'children' },
  };

  function generateRecipesFromComponents(normalizedData) {
    const components = normalizedData.components || {};
    const recipes = {};

    // Detect available breakpoints for responsive hints
    let breakpoints = null;
    try {
      if (window.__seStructure?.extractBreakpoints) {
        const bp = window.__seStructure.extractBreakpoints();
        if (bp?.named && Object.keys(bp.named).length) {
          breakpoints = bp.named;
        }
      }
    } catch (e) { /* ignore */ }

    // Build responsive size parameter options from breakpoints
    function buildResponsiveSizeOptions(type) {
      if (!breakpoints) return null;
      // Standard Tailwind breakpoint prefixes
      const bpKeys = Object.keys(breakpoints).sort((a, b) => {
        const order = { sm: 1, md: 2, lg: 3, xl: 4, '2xl': 5 };
        return (order[a] || 99) - (order[b] || 99);
      });
      const mdBp = bpKeys.find(k => k === 'md' || k === 'lg') || bpKeys[0];
      if (!mdBp) return null;

      if (type === 'button' || type === 'input' || type === 'badge') {
        return [
          { value: 'sm', label: 'Small', labelZh: '小', classes: `px-3 py-1.5 text-sm ${mdBp}:px-4 ${mdBp}:py-2` },
          { value: 'md', label: 'Medium', labelZh: '中', classes: `px-4 py-2 text-base ${mdBp}:px-5 ${mdBp}:py-2.5` },
          { value: 'lg', label: 'Large', labelZh: '大', classes: `px-5 py-2.5 text-lg ${mdBp}:px-7 ${mdBp}:py-3` },
        ];
      }
      if (type === 'card' || type === 'modal') {
        return [
          { value: 'sm', label: 'Small', labelZh: '小', classes: `p-3 ${mdBp}:p-4` },
          { value: 'md', label: 'Medium', labelZh: '中', classes: `p-4 ${mdBp}:p-6` },
          { value: 'lg', label: 'Large', labelZh: '大', classes: `p-6 ${mdBp}:p-8` },
        ];
      }
      return null;
    }

    for (const [type, items] of Object.entries(components)) {
      if (!items?.length) continue;
      const meta = COMPONENT_TYPE_META[type];
      if (!meta) continue;

      // Use first item for base styles, detect variants from multiple items
      const primary = items[0];
      const baseClasses = stylesToTailwind(primary.styles);

      // Build variants from different instances
      const variants = {};
      if (items.length === 1) {
        variants.primary = {
          id: 'primary', label: 'Primary', labelZh: '主要', classes: [],
        };
      } else {
        // First instance = primary, others = secondary/tertiary etc.
        const variantNames = [
          { id: 'primary', label: 'Primary', labelZh: '主要' },
          { id: 'secondary', label: 'Secondary', labelZh: '次要' },
          { id: 'outline', label: 'Outline', labelZh: '轮廓' },
          { id: 'ghost', label: 'Ghost', labelZh: '幽灵' },
          { id: 'accent', label: 'Accent', labelZh: '强调' },
        ];
        items.slice(0, 5).forEach((item, i) => {
          const vn = variantNames[i] || { id: `variant-${i}`, label: `Variant ${i + 1}`, labelZh: `变体${i + 1}` };
          // Diff this item's styles vs the base (first item)
          const diffClasses = i === 0 ? [] : stateStyleDiff(primary.styles, item.styles);
          variants[vn.id] = { id: vn.id, label: vn.label, labelZh: vn.labelZh, classes: diffClasses };
        });
      }

      // Build states from interactiveDetails
      const states = {};
      const stateData = primary.states || {};
      const defaultStyles = stateData.default || primary.styles || {};

      if (stateData.hover) {
        const hoverDiff = stateStyleDiff(defaultStyles, stateData.hover);
        if (hoverDiff.length) states.hover = hoverDiff.map(c => `hover:${c}`);
      }
      if (stateData.focus) {
        const focusDiff = stateStyleDiff(defaultStyles, stateData.focus);
        if (focusDiff.length) states.focus = focusDiff.map(c => `focus:${c}`);
      }
      if (stateData.active) {
        const activeDiff = stateStyleDiff(defaultStyles, stateData.active);
        if (activeDiff.length) states.active = activeDiff.map(c => `active:${c}`);
      }
      if (stateData.disabled) {
        const disabledDiff = stateStyleDiff(defaultStyles, stateData.disabled);
        if (disabledDiff.length) states.disabled = disabledDiff;
      }

      // Build size parameters (responsive-aware when breakpoints available)
      const parameters = [];
      if (type === 'button' || type === 'input' || type === 'badge') {
        const responsiveOpts = buildResponsiveSizeOptions(type);
        parameters.push({
          id: 'size', label: 'Size', labelZh: '尺寸', type: 'select',
          options: responsiveOpts || [
            { value: 'sm', label: 'Small', labelZh: '小', classes: 'px-3 py-1.5 text-sm' },
            { value: 'md', label: 'Medium', labelZh: '中', classes: 'px-5 py-2 text-base' },
            { value: 'lg', label: 'Large', labelZh: '大', classes: 'px-7 py-3 text-lg' },
          ],
          default: 'md',
        });
      }
      if (type === 'card' || type === 'modal') {
        const responsiveOpts = buildResponsiveSizeOptions(type);
        parameters.push({
          id: 'padding', label: 'Padding', labelZh: '内边距', type: 'select',
          options: responsiveOpts || [
            { value: 'sm', label: 'Small', labelZh: '小', classes: 'p-3 md:p-4' },
            { value: 'md', label: 'Medium', labelZh: '中', classes: 'p-4 md:p-6' },
            { value: 'lg', label: 'Large', labelZh: '大', classes: 'p-6 md:p-8' },
          ],
          default: 'md',
        });
      }
      if (type === 'button') {
        parameters.push({
          id: 'fullWidth', label: 'Full Width', labelZh: '全宽',
          type: 'boolean', default: false, trueClasses: 'w-full',
        });
      }

      // Build slots
      let slots;
      switch (meta.slotsType) {
        case 'button':
          slots = [
            { id: 'icon', label: 'Icon', labelZh: '图标', required: false, type: 'icon' },
            { id: 'label', label: 'Label', labelZh: '文字', required: true, default: 'Click', type: 'text' },
          ];
          break;
        case 'card':
          slots = [
            { id: 'title', label: 'Title', labelZh: '标题', required: false, default: 'Card Title', type: 'text' },
            { id: 'children', label: 'Content', labelZh: '内容', required: true, default: 'Card content goes here', type: 'children' },
          ];
          break;
        case 'input':
          slots = [
            { id: 'placeholder', label: 'Placeholder', labelZh: '占位符', required: false, default: 'Type here...', type: 'text' },
          ];
          break;
        case 'label':
          slots = [
            { id: 'label', label: 'Label', labelZh: '文字', required: true, default: meta.name, type: 'text' },
          ];
          break;
        case 'children':
        default:
          slots = [
            { id: 'children', label: 'Content', labelZh: '内容', required: true, type: 'children' },
          ];
          break;
      }

      const confidence = componentConfidence(items);

      // Build responsive hints from detected breakpoints
      let responsive = null;
      if (breakpoints) {
        const bpNames = Object.keys(breakpoints);
        responsive = {
          breakpoints: bpNames,
          hasResponsiveParams: !!buildResponsiveSizeOptions(type),
        };
      }

      recipes[type] = {
        id: type,
        name: meta.name,
        nameZh: meta.nameZh,
        description: `Extracted ${meta.desc} component (confidence: ${confidence})`,
        skeleton: {
          element: meta.element,
          baseClasses: baseClasses.length ? baseClasses : ['inline-flex', 'items-center'],
        },
        parameters,
        variants,
        slots,
        states: Object.keys(states).length ? states : undefined,
        responsive,
        _confidence: confidence,
      };
    }

    return recipes;
  }

  function generateRecipesTypeScript(normalizedData) {
    const id = toSafeIdentifier(normalizedData.id);
    const slug = normalizedData.id;
    const name = normalizedData.name;
    const recipes = generateRecipesFromComponents(normalizedData);

    if (!Object.keys(recipes).length) {
      return `// No components detected — no recipes generated.\n// Run component detection first: window.__seComponents.detectAll()\n`;
    }

    const recipesJson = JSON.stringify(recipes, null, 2);

    return `// StyleKit Recipe Definition
// Generated by style-extractor
// Source: ${normalizedData.source.url}

import { createStyleRecipes } from "./factory";

export const ${id}Recipes = createStyleRecipes("${slug}", "${name}", ${recipesJson});
`;
  }

  // ============================================
  // AI-Ready Design System Prompt Generation
  // ============================================

  function generateDesignSystemPrompt(normalizedData) {
    const name = normalizedData.name || 'Extracted Style';
    const url = normalizedData.source?.url || 'unknown';
    const tokens = normalizedData.tokens || {};
    const components = normalizedData.components || {};

    // Color table
    const colorEntries = Object.entries(tokens.colors?.semantic || {})
      .filter(([, v]) => v)
      .map(([role, value]) => `| \`${role}\` | \`${value}\` |`)
      .join('\n');
    const colorTable = colorEntries
      ? `| Role | Value |\n|------|-------|\n${colorEntries}`
      : 'No color tokens extracted.';

    // Typography
    const typo = tokens.typography || {};
    const fontFamilies = Object.entries(typo.fontFamily || {})
      .filter(([, v]) => v)
      .map(([role, family]) => `- **${role}**: \`${family}\``)
      .join('\n') || 'Not observed';
    const fontSizes = Object.entries(typo.fontSize || {})
      .filter(([, v]) => v)
      .map(([name, size]) => `\`${name}\`: ${size}`)
      .join(', ') || 'Not observed';

    // Spacing
    const spacing = Object.entries(tokens.spacing || {})
      .filter(([, v]) => v)
      .slice(0, 10)
      .map(([val, count]) => `\`${val}\` (${count}x)`)
      .join(', ') || 'Not observed';

    // Motion
    const motion = tokens.motion || {};
    const durations = Object.entries(motion.duration || {})
      .map(([name, val]) => `${name}: ${val}`)
      .join(', ') || 'Not observed';
    const easings = Object.entries(motion.easing || {})
      .map(([name, val]) => `${name}: ${val}`)
      .join(', ') || 'Not observed';

    // Component state descriptions
    function describeComponentStates(compType) {
      const items = components[compType];
      if (!items?.length) return 'Not detected';
      const first = items[0];
      const baseClasses = stylesToTailwind(first.styles);
      const lines = [`Base: \`${baseClasses.join(' ') || 'N/A'}\``];
      const states = first.states || {};
      if (states.hover) {
        const diff = stateStyleDiff(states.default || first.styles, states.hover);
        if (diff.length) lines.push(`Hover: \`${diff.map(c => 'hover:' + c).join(' ')}\``);
      }
      if (states.focus) {
        const diff = stateStyleDiff(states.default || first.styles, states.focus);
        if (diff.length) lines.push(`Focus: \`${diff.map(c => 'focus:' + c).join(' ')}\``);
      }
      if (states.active) {
        const diff = stateStyleDiff(states.default || first.styles, states.active);
        if (diff.length) lines.push(`Active: \`${diff.map(c => 'active:' + c).join(' ')}\``);
      }
      return lines.join('\n');
    }

    // Detected component types
    const detectedTypes = Object.keys(components).filter(k => components[k]?.length);
    const componentCount = detectedTypes.reduce((sum, k) => sum + components[k].length, 0);

    return `<role>
You are an expert frontend engineer specializing in UI implementation. Your goal is to help
implement the "${name}" design system consistently across all components. Before writing code,
understand the existing tech stack, design tokens, and component patterns.

Always aim to:
- Maintain visual consistency with the design system below
- Ensure responsiveness across devices
- Preserve or improve accessibility
- Make deliberate choices that reflect the design system's unique personality
</role>

<design-system>
# ${name}

> Extracted from: ${url}
> Components detected: ${componentCount} across ${detectedTypes.length} types (${detectedTypes.join(', ')})

## Design Token System

### Colors
${colorTable}

### Typography
**Font Stacks**:
${fontFamilies}

**Type Scale**: ${fontSizes}

### Spacing System
Common values: ${spacing}

### Motion
**Durations**: ${durations}
**Easings**: ${easings}

---

## Component Styling

### Buttons
${describeComponentStates('button')}

### Cards
${describeComponentStates('card')}

### Inputs
${describeComponentStates('input')}

### Navigation
${describeComponentStates('navigation')}
${describeComponentStates('navItem') !== 'Not detected' ? '\n### Nav Items\n' + describeComponentStates('navItem') : ''}
${describeComponentStates('badge') !== 'Not detected' ? '\n### Badges\n' + describeComponentStates('badge') : ''}

---

## Implementation Notes

- Use Tailwind CSS utility classes for styling
- Follow mobile-first responsive design
- All component recipes are available in \`style-recipes.ts\`
- Design tokens are defined in \`style-definition.ts\` and \`variables.css\`

## Anti-Patterns

- Do NOT use generic/default styling that contradicts the extracted tokens
- Do NOT ignore the extracted state transitions (hover/focus/active)
- Do NOT use arbitrary color values when a token exists for the same role

</design-system>
`;
  }

  // ============================================
  // Style Tokens Generation (createStyleTokens format)
  // ============================================

  function generateTokensTypeScript(normalizedData) {
    const id = toSafeIdentifier(normalizedData.id);
    const tokens = normalizedData.tokens || {};
    const components = normalizedData.components || {};

    // --- Border tokens ---
    function deriveBorder() {
      // Look at the most common border from extracted components
      const allBorders = [];
      for (const items of Object.values(components)) {
        for (const item of (items || [])) {
          if (item.styles?.borderWidth) allBorders.push(item.styles);
        }
      }
      const first = allBorders[0] || {};
      const bw = borderWidthToTw(first.borderWidth);
      const bc = colorToTw(first.borderColor);
      const br = borderRadiusToTw(first.borderRadius);
      return {
        width: bw || 'border',
        color: bc ? `border-${bc}` : 'border-gray-200',
        radius: br || 'rounded-lg',
        style: 'border-solid',
      };
    }

    // --- Shadow tokens ---
    function deriveShadow() {
      const allShadows = [];
      for (const items of Object.values(components)) {
        for (const item of (items || [])) {
          if (item.styles?.boxShadow && item.styles.boxShadow !== 'none') {
            allShadows.push(item.styles.boxShadow);
          }
        }
      }
      if (!allShadows.length) {
        return {
          sm: 'shadow-sm', md: 'shadow-md', lg: 'shadow-lg',
          none: 'shadow-none', hover: 'hover:shadow-lg', focus: 'focus:shadow-md',
        };
      }
      // Use the raw box-shadow value if it looks like a hard-edge shadow
      const raw = allShadows[0];
      const isHardEdge = raw && !raw.includes('blur') && /\d+px\s+\d+px\s+0px/.test(raw);
      if (isHardEdge) {
        return {
          sm: `shadow-[${raw.replace(/rgba?\([^)]+\)/, 'rgba(0,0,0,0.15)')}]`,
          md: `shadow-[${raw}]`,
          lg: `shadow-[${raw.replace(/(\d+)px/g, (_, n) => (parseInt(n) * 1.5) + 'px')}]`,
          none: 'shadow-none',
          hover: 'hover:shadow-none',
          focus: 'focus:shadow-md',
        };
      }
      const tw = boxShadowToTw(raw);
      return {
        sm: 'shadow-sm', md: tw || 'shadow-md', lg: 'shadow-lg',
        none: 'shadow-none', hover: `hover:${tw === 'shadow-lg' ? 'shadow-xl' : 'shadow-lg'}`, focus: 'focus:shadow-md',
      };
    }

    // --- Interaction tokens ---
    function deriveInteraction() {
      const result = { transition: 'transition-all duration-200' };
      for (const items of Object.values(components)) {
        const first = (items || [])[0];
        if (!first?.states) continue;
        const def = first.states.default || first.styles || {};
        if (first.states.hover) {
          const diff = stateStyleDiff(def, first.states.hover);
          const scaleCls = diff.find(c => c.includes('scale'));
          const translateCls = diff.find(c => c.includes('translate'));
          if (scaleCls) result.hoverScale = `hover:${scaleCls}`;
          if (translateCls) result.hoverTranslate = `hover:${translateCls}`;
        }
        if (first.states.active) {
          const diff = stateStyleDiff(def, first.states.active);
          if (diff.length) result.active = diff.map(c => `active:${c}`).join(' ');
        }
        // Extract transition duration
        if (first.styles?.transitionDuration && first.styles.transitionDuration !== '0s') {
          const ms = parseFloat(first.styles.transitionDuration) * 1000;
          const dur = ms <= 150 ? '150' : ms <= 200 ? '200' : ms <= 300 ? '300' : '500';
          result.transition = `transition-all duration-${dur}`;
        }
        break; // Use first component with states
      }
      return result;
    }

    // --- Typography tokens ---
    function deriveTypography() {
      const typo = tokens.typography || {};
      const families = typo.fontFamily || {};
      const sizes = typo.fontSize || {};

      // Determine heading/body font classes
      const headingFont = families.primary ? `font-[${families.primary.split(',')[0].replace(/['"]/g, '').trim()}]` : 'font-bold tracking-tight';
      const bodyFont = families.secondary || families.primary ? `font-sans` : 'font-sans';

      // Map extracted font sizes to responsive Tailwind classes
      const sizeEntries = Object.entries(sizes).sort((a, b) => parseFloat(b[1]) - parseFloat(a[1]));
      const twSizes = sizeEntries.map(([, v]) => fontSizeToTw(v)).filter(Boolean);

      return {
        heading: headingFont.includes('font-[') ? `${headingFont} font-bold tracking-tight` : headingFont,
        body: bodyFont,
        mono: families.mono ? `font-[${families.mono.split(',')[0].replace(/['"]/g, '').trim()}]` : 'font-mono',
        sizes: {
          hero: twSizes[0] ? `${twSizes[0]} md:${twSizes[0].replace('text-', 'text-')}` : 'text-4xl md:text-6xl lg:text-8xl',
          h1: twSizes[1] || 'text-3xl md:text-5xl',
          h2: twSizes[2] || 'text-2xl md:text-4xl',
          h3: twSizes[3] || 'text-xl md:text-2xl',
          body: twSizes[4] || 'text-sm md:text-base',
          small: twSizes[5] || 'text-xs md:text-sm',
        },
      };
    }

    // --- Spacing tokens ---
    function deriveSpacing() {
      const spacing = tokens.spacing || {};
      const sorted = Object.entries(spacing)
        .filter(([, v]) => typeof v === 'number')
        .sort((a, b) => b[1] - a[1]);
      const twVals = sorted.map(([k]) => pxToTwSpacing(k + 'px')).filter(Boolean);
      return {
        section: twVals[0] ? `py-${twVals[0]} md:py-${twVals[1] || twVals[0]}` : 'py-12 md:py-20 lg:py-28',
        container: 'px-4 md:px-8 lg:px-12',
        card: twVals[2] ? `p-${twVals[2]} md:p-${twVals[3] || twVals[2]}` : 'p-5 md:p-8',
        gap: {
          sm: 'gap-3 md:gap-4',
          md: 'gap-4 md:gap-6',
          lg: 'gap-6 md:gap-10',
        },
      };
    }

    // --- Color tokens (Tailwind class format) ---
    function deriveColors() {
      const semantic = tokens.colors?.semantic || {};
      const bgPrimary = colorToTw(semantic.background);
      const bgSecondary = colorToTw(semantic.surfaceAlt || semantic.surface);
      const accentColors = [semantic.primary, semantic.accent, semantic.secondary]
        .filter(Boolean)
        .map(c => { const tw = colorToTw(c); return tw ? `bg-${tw}` : null; })
        .filter(Boolean);

      const textPrimary = colorToTw(semantic.text);
      const textSecondary = colorToTw(semantic.textMuted);

      // Button colors from component detection
      const buttons = components.button || [];
      let btnPrimary = '';
      let btnSecondary = '';
      if (buttons.length >= 1) {
        const s = buttons[0].styles || {};
        const bg = colorToTw(s.backgroundColor);
        const tx = colorToTw(s.color);
        btnPrimary = [bg ? `bg-${bg}` : null, tx ? `text-${tx}` : null].filter(Boolean).join(' ');
      }
      if (buttons.length >= 2) {
        const s = buttons[1].styles || {};
        const bg = colorToTw(s.backgroundColor);
        const tx = colorToTw(s.color);
        btnSecondary = [bg ? `bg-${bg}` : null, tx ? `text-${tx}` : null].filter(Boolean).join(' ');
      }

      return {
        background: {
          primary: bgPrimary ? `bg-${bgPrimary}` : 'bg-white',
          secondary: bgSecondary ? `bg-${bgSecondary}` : 'bg-gray-50',
          accent: accentColors.length ? accentColors : ['bg-blue-500'],
        },
        text: {
          primary: textPrimary ? `text-${textPrimary}` : 'text-gray-900',
          secondary: textSecondary ? `text-${textSecondary}` : 'text-gray-600',
          muted: 'text-gray-400',
        },
        button: {
          primary: btnPrimary || 'bg-blue-500 text-white',
          secondary: btnSecondary || 'bg-gray-200 text-gray-800',
        },
      };
    }

    // --- Forbidden & Required ---
    function deriveForbidden() {
      // Derive from what the site does NOT use
      return { classes: [], patterns: [], reasons: {} };
    }

    function deriveRequired() {
      const result = { button: [], card: [], input: [] };
      for (const type of ['button', 'card', 'input']) {
        const items = components[type];
        if (!items?.length) continue;
        const base = stylesToTailwind(items[0].styles);
        result[type] = base.length ? base : [];
      }
      return result;
    }

    // --- Assemble ---
    const tokensObj = {
      border: deriveBorder(),
      shadow: deriveShadow(),
      interaction: deriveInteraction(),
      typography: deriveTypography(),
      spacing: deriveSpacing(),
      colors: deriveColors(),
      forbidden: deriveForbidden(),
      required: deriveRequired(),
    };

    // Clean undefined values for JSON.stringify
    const cleaned = JSON.parse(JSON.stringify(tokensObj));
    const tokensJson = JSON.stringify(cleaned, null, 2);

    return `// StyleKit Token Definition
// Generated by style-extractor
// Source: ${normalizedData.source?.url || 'unknown'}

import { createStyleTokens } from "./token-defaults";

export const ${id}Tokens = createStyleTokens(${tokensJson});
`;
  }

  // ============================================
  // File Generation
  // ============================================

  function generateFiles(normalizedData) {
    const files = {};

    // Generate TypeScript style definition
    files['style-definition.ts'] = generateTypeScriptDefinition(normalizedData);

    // Generate CSS variables
    files['variables.css'] = generateCSSVariables(normalizedData);

    // Generate Tailwind config
    files['tailwind.config.js'] = generateTailwindConfig(normalizedData);

    // Generate JSON export
    files['tokens.json'] = JSON.stringify(normalizedData, null, 2);

    // Generate recipe definition
    files['style-recipes.ts'] = generateRecipesTypeScript(normalizedData);

    // Generate AI-ready design system prompt
    files['design-system-prompt.md'] = generateDesignSystemPrompt(normalizedData);

    // Generate StyleKit tokens (createStyleTokens format)
    files['style-tokens.ts'] = generateTokensTypeScript(normalizedData);

    return files;
  }

  function generateTypeScriptDefinition(data) {
    const id = toSafeIdentifier(data.id);

    return `// StyleKit Style Definition
// Generated by style-extractor
// Source: ${data.source.url}

import type { StyleDefinition } from '@/lib/styles/types';

export const ${id}Style: StyleDefinition = ${JSON.stringify({
      id: data.id,
      name: data.name,
      description: data.description,
      colors: data.tokens.colors.semantic,
      typography: data.tokens.typography,
      spacing: data.tokens.spacing,
      motion: data.tokens.motion
    }, null, 2)};

export default ${id}Style;
`;
  }

  function generateCSSVariables(data) {
    const lines = [':root {'];

    // Colors
    if (data.tokens.colors.semantic) {
      lines.push('  /* Colors */');
      for (const [name, value] of Object.entries(data.tokens.colors.semantic)) {
        if (value) lines.push(`  --color-${name}: ${value};`);
      }
      lines.push('');
    }

    // Typography
    if (data.tokens.typography.fontFamily) {
      lines.push('  /* Typography */');
      for (const [name, value] of Object.entries(data.tokens.typography.fontFamily)) {
        if (value) lines.push(`  --font-${name}: ${value};`);
      }
      lines.push('');
    }

    if (data.tokens.typography.fontSize) {
      lines.push('  /* Font Sizes */');
      for (const [name, value] of Object.entries(data.tokens.typography.fontSize)) {
        if (value) lines.push(`  --text-${name}: ${value};`);
      }
      lines.push('');
    }

    // Spacing
    if (data.tokens.spacing) {
      lines.push('  /* Spacing */');
      for (const [name, value] of Object.entries(data.tokens.spacing)) {
        if (value) lines.push(`  --space-${name}: ${value};`);
      }
      lines.push('');
    }

    // Motion
    if (data.tokens.motion.duration) {
      lines.push('  /* Motion */');
      for (const [name, value] of Object.entries(data.tokens.motion.duration)) {
        if (value) lines.push(`  --duration-${name}: ${value};`);
      }
    }

    lines.push('}');

    return lines.join('\n');
  }

  function generateTailwindConfig(data) {
    const config = {
      theme: {
        extend: {
          colors: {},
          fontFamily: {},
          fontSize: {},
          spacing: {},
          transitionDuration: {}
        }
      }
    };

    // Colors
    for (const [name, value] of Object.entries(data.tokens.colors.semantic || {})) {
      if (value) config.theme.extend.colors[name] = value;
    }

    // Typography
    for (const [name, value] of Object.entries(data.tokens.typography.fontFamily || {})) {
      if (value) config.theme.extend.fontFamily[name] = [value];
    }
    for (const [name, value] of Object.entries(data.tokens.typography.fontSize || {})) {
      if (value) config.theme.extend.fontSize[name] = value;
    }

    // Spacing
    for (const [name, value] of Object.entries(data.tokens.spacing || {})) {
      if (value) config.theme.extend.spacing[name] = value;
    }

    // Motion
    for (const [name, value] of Object.entries(data.tokens.motion.duration || {})) {
      if (value) config.theme.extend.transitionDuration[name] = value;
    }

    return `/** @type {import('tailwindcss').Config} */
module.exports = ${JSON.stringify(config, null, 2)};
`;
  }

  // ============================================
  // Main API
  // ============================================

  let collectedData = null;
  let normalizedData = null;

  window.__seStyleKit = {
    installed: true,

    // Collect all extracted data
    collect() {
      collectedData = collectExtractedData();
      return collectedData;
    },

    // Normalize to StyleKit format
    normalize() {
      if (!collectedData) {
        this.collect();
      }
      normalizedData = normalizeToStyleKit(collectedData);
      return normalizedData;
    },

    // Generate all output files
    generateFiles() {
      if (!normalizedData) {
        this.normalize();
      }
      return generateFiles(normalizedData);
    },

    // Generate only recipe file
    generateRecipes() {
      if (!normalizedData) {
        this.normalize();
      }
      return generateRecipesTypeScript(normalizedData);
    },

    // Get extracted recipes as structured data (for inspection)
    getRecipes() {
      if (!normalizedData) {
        this.normalize();
      }
      return generateRecipesFromComponents(normalizedData);
    },

    // Generate AI-ready design system prompt
    generatePrompt() {
      if (!normalizedData) {
        this.normalize();
      }
      return generateDesignSystemPrompt(normalizedData);
    },

    // Generate style-tokens.ts (createStyleTokens format)
    generateTokens() {
      if (!normalizedData) {
        this.normalize();
      }
      return generateTokensTypeScript(normalizedData);
    },

    // Full pipeline
    extract() {
      this.collect();
      this.normalize();
      return {
        raw: collectedData,
        normalized: normalizedData,
        files: this.generateFiles()
      };
    },

    // Get current state
    getData() {
      return { collected: collectedData, normalized: normalizedData };
    },

    // Get confidence report across all extraction results
    getConfidenceReport() {
      if (!normalizedData) this.normalize();
      const report = { overall: 'low', components: {}, colors: {} };

      // Component confidence
      for (const [type, items] of Object.entries(normalizedData.components || {})) {
        report.components[type] = {
          count: items.length,
          confidence: items._confidence || componentConfidence(items),
          hasStates: items.some(i => i.states && Object.keys(i.states).length > 0),
        };
      }

      // Color confidence
      for (const [key, info] of Object.entries(normalizedData.tokens?.colors?.palette || {})) {
        if (typeof info === 'object' && info.confidence) {
          report.colors[key] = info.confidence;
        }
      }

      // Overall confidence: majority vote
      const allScores = [
        ...Object.values(report.components).map(c => c.confidence),
        ...Object.values(report.colors),
      ];
      const high = allScores.filter(s => s === 'high').length;
      const med = allScores.filter(s => s === 'medium').length;
      if (high > allScores.length / 2) report.overall = 'high';
      else if (high + med > allScores.length / 2) report.overall = 'medium';

      return report;
    },

    // Schema reference
    SCHEMA: STYLEKIT_SCHEMA
  };
})();
