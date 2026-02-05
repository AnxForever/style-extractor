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
    // Normalize rgba to hex, preserving alpha channel
    if (color.startsWith('rgb')) {
      const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (match) {
        const [, r, g, b, a] = match;
        const hex = '#' + [r, g, b].map(x => parseInt(x).toString(16).padStart(2, '0')).join('');
        // Preserve alpha if present and not fully opaque
        if (a !== undefined && parseFloat(a) < 1) {
          const alpha = Math.round(parseFloat(a) * 255).toString(16).padStart(2, '0');
          return hex + alpha;
        }
        return hex;
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

    // Normalize components
    if (extractedData.componentDetails) {
      stylekit.components = normalizeComponents(extractedData.componentDetails);
    }

    return stylekit;
  }

  function generateId(url) {
    try {
      const hostname = new URL(url).hostname;
      return hostname.replace(/\./g, '-').replace(/^www-/, '');
    } catch {
      return 'extracted-' + Date.now();
    }
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

    // Add extracted colors to palette
    for (const [key, info] of Object.entries(colors || {})) {
      result.palette[key] = info.value;

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

  function normalizeComponents(componentDetails) {
    const result = {};

    for (const [type, items] of Object.entries(componentDetails)) {
      if (!items?.length) continue;

      result[type] = items.map(item => ({
        selector: item.selector,
        styles: item.styles,
        states: item.states?.states || {}
      }));
    }

    return result;
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
    files['style-tokens.json'] = JSON.stringify(normalizedData, null, 2);

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

    // Schema reference
    SCHEMA: STYLEKIT_SCHEMA
  };
})();
