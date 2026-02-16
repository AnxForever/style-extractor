// Style Extractor: Format Converter
// Converts extracted style data to various output formats
//
// Supported formats:
// - json: Structured JSON schema
// - tailwind: Tailwind CSS config
// - cssVars: CSS custom properties
// - stylekit: StyleKit tokens format
//
// Usage in evaluate_script:
//   window.__seFormat.toJSON(styleData)
//   window.__seFormat.toTailwind(styleData)
//   window.__seFormat.toCSSVars(styleData)
//   window.__seFormat.toStyleKit(styleData)

(() => {
  if (window.__seFormat?.installed) return;

  // ============================================
  // Helper Functions
  // ============================================

  function slugify(str) {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  function toKebabCase(str) {
    return str
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .toLowerCase();
  }

  // Sanitize string for use as CSS variable name
  function toCSSVarName(str) {
    if (!str) return 'unknown';
    return String(str)
      .toLowerCase()
      .replace(/([a-z])([A-Z])/g, '$1-$2')  // camelCase to kebab
      .replace(/[^a-z0-9-]/g, '-')           // remove invalid chars
      .replace(/-+/g, '-')                   // collapse multiple dashes
      .replace(/^-|-$/g, '');                // trim leading/trailing dashes
  }

  function toCamelCase(str) {
    return str.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  }

  function rgbToHex(rgb) {
    if (!rgb || typeof rgb !== 'string') return rgb;
    // Match rgba with optional alpha channel
    const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (!match) return rgb;
    const [, r, g, b, a] = match;
    const hex = '#' + [r, g, b].map(x => parseInt(x).toString(16).padStart(2, '0')).join('');
    // Preserve alpha if present and not fully opaque
    if (a !== undefined && parseFloat(a) < 1) {
      const alpha = Math.round(parseFloat(a) * 255).toString(16).padStart(2, '0');
      return hex + alpha;
    }
    return hex;
  }

  function parseColor(color) {
    if (!color) return null;
    if (typeof color === 'object') {
      if (typeof color.value === 'string') {
        color = color.value;
      } else {
        return null;
      }
    }
    if (typeof color !== 'string') return null;
    // Handle transparent keyword
    if (color === 'transparent') return 'transparent';
    const hex = rgbToHex(color);
    return typeof hex === 'string' && hex.startsWith('#') ? hex : color;
  }

  function parseDuration(duration) {
    if (!duration) return null;
    if (typeof duration === 'number') return duration;
    const match = String(duration).match(/([\d.]+)(ms|s)?/);
    if (!match) return null;
    const [, value, unit] = match;
    return unit === 's' ? parseFloat(value) * 1000 : parseFloat(value);
  }

  // ============================================
  // JSON Schema Format
  // ============================================

  function toJSON(styleData) {
    const result = {
      $schema: 'https://stylekit.dev/schema/extracted-style.json',
      version: '1.0.0',
      meta: {
        name: styleData.name || 'Extracted Style',
        source: styleData.url || null,
        extractedAt: new Date().toISOString(),
        generator: 'style-extractor'
      },
      colors: {},
      typography: {},
      spacing: {},
      borders: {},
      shadows: {},
      animations: {},
      components: {}
    };

    // Colors
    if (styleData.colors) {
      for (const [name, value] of Object.entries(styleData.colors)) {
        result.colors[slugify(name)] = {
          value: parseColor(value),
          usage: styleData.colorUsage?.[name] || null
        };
      }
    }

    // Typography
    if (styleData.typography) {
      result.typography = {
        families: styleData.typography.families || [],
        scale: styleData.typography.scale || {},
        weights: styleData.typography.weights || [400]
      };
    }

    // Spacing
    if (styleData.spacing) {
      for (const [name, value] of Object.entries(styleData.spacing)) {
        result.spacing[slugify(name)] = value;
      }
    }

    // Borders
    if (styleData.borders) {
      result.borders = {
        widths: styleData.borders.widths || {},
        radius: styleData.borders.radius || {},
        colors: styleData.borders.colors || {}
      };
    }

    // Shadows
    if (styleData.shadows) {
      for (const [name, value] of Object.entries(styleData.shadows)) {
        result.shadows[slugify(name)] = value;
      }
    }

    // Animations
    if (styleData.animations) {
      result.animations = {
        durations: {},
        easings: {},
        keyframes: {}
      };

      if (styleData.animations.durations) {
        for (const [name, value] of Object.entries(styleData.animations.durations)) {
          result.animations.durations[slugify(name)] = parseDuration(value);
        }
      }

      if (styleData.animations.easings) {
        result.animations.easings = { ...styleData.animations.easings };
      }

      if (styleData.animations.keyframes) {
        result.animations.keyframes = { ...styleData.animations.keyframes };
      }
    }

    // Components
    if (styleData.components) {
      for (const [name, component] of Object.entries(styleData.components)) {
        result.components[slugify(name)] = {
          selector: component.selector || null,
          states: component.states || {},
          variants: component.variants || []
        };
      }
    }

    // Recipes (from stylekit adapter)
    if (window.__seStyleKit?.getRecipes) {
      try {
        const recipes = window.__seStyleKit.getRecipes();
        if (recipes && Object.keys(recipes).length) {
          result.recipes = {};
          for (const [type, r] of Object.entries(recipes)) {
            result.recipes[type] = {
              id: r.id,
              name: r.name,
              element: r.skeleton?.element || null,
              baseClasses: r.skeleton?.baseClasses || [],
              variants: Object.entries(r.variants || {}).map(([vid, v]) => ({
                id: vid, label: v.label, classes: v.classes
              })),
              parameters: (r.parameters || []).map(p => ({
                id: p.id, type: p.type, default: p.default
              })),
              slots: (r.slots || []).map(s => ({
                id: s.id, type: s.type, required: s.required
              })),
              states: r.states || {},
              confidence: r._confidence || null,
              responsive: r.responsive || null,
            };
          }
        }
      } catch (e) {
        // Recipes not available — skip
      }
    }

    return result;
  }

  // ============================================
  // Tailwind CSS Config Format
  // ============================================

  function toTailwind(styleData) {
    const config = {
      theme: {
        extend: {
          colors: {},
          fontFamily: {},
          fontSize: {},
          spacing: {},
          borderRadius: {},
          boxShadow: {},
          transitionDuration: {},
          transitionTimingFunction: {},
          animation: {},
          keyframes: {}
        }
      }
    };

    // Colors
    if (styleData.colors) {
      for (const [name, value] of Object.entries(styleData.colors)) {
        const key = slugify(name);
        config.theme.extend.colors[key] = parseColor(value);
      }
    }

    // Typography - Font Families
    if (styleData.typography?.families) {
      for (const family of styleData.typography.families) {
        const key = slugify(family.split(',')[0].replace(/['"]/g, ''));
        config.theme.extend.fontFamily[key] = [family];
      }
    }

    // Typography - Font Sizes
    if (styleData.typography?.scale) {
      for (const [name, value] of Object.entries(styleData.typography.scale)) {
        config.theme.extend.fontSize[slugify(name)] = value;
      }
    }

    // Spacing
    if (styleData.spacing) {
      for (const [name, value] of Object.entries(styleData.spacing)) {
        config.theme.extend.spacing[slugify(name)] = value;
      }
    }

    // Border Radius
    if (styleData.borders?.radius) {
      for (const [name, value] of Object.entries(styleData.borders.radius)) {
        config.theme.extend.borderRadius[slugify(name)] = value;
      }
    }

    // Shadows
    if (styleData.shadows) {
      for (const [name, value] of Object.entries(styleData.shadows)) {
        config.theme.extend.boxShadow[slugify(name)] = value;
      }
    }

    // Animation Durations
    if (styleData.animations?.durations) {
      for (const [name, value] of Object.entries(styleData.animations.durations)) {
        const ms = parseDuration(value);
        if (ms !== null) {
          config.theme.extend.transitionDuration[slugify(name)] = `${ms}ms`;
        }
      }
    }

    // Animation Easings
    if (styleData.animations?.easings) {
      for (const [name, value] of Object.entries(styleData.animations.easings)) {
        config.theme.extend.transitionTimingFunction[slugify(name)] = value;
      }
    }

    // Keyframes
    if (styleData.animations?.keyframes) {
      for (const [name, keyframe] of Object.entries(styleData.animations.keyframes)) {
        const key = slugify(name);
        config.theme.extend.keyframes[key] = keyframe;

        // Create matching animation
        const duration = styleData.animations.durations?.[name] || '300ms';
        const easing = styleData.animations.easings?.[name] || 'ease';
        config.theme.extend.animation[key] = `${key} ${duration} ${easing}`;
      }
    }

    return config;
  }

  // ============================================
  // CSS Variables Format
  // ============================================

  function toCSSVars(styleData) {
    // Input validation
    if (!styleData || typeof styleData !== 'object') {
      console.warn('[style-extractor] toCSSVars: invalid input');
      return ':root {\n  /* No valid style data */\n}';
    }

    const vars = [];
    vars.push(':root {');

    // Colors
    if (styleData.colors && typeof styleData.colors === 'object') {
      vars.push('  /* Colors */');
      for (const [name, value] of Object.entries(styleData.colors)) {
        const safeName = toCSSVarName(name);
        if (safeName && value) {
          vars.push(`  --color-${safeName}: ${parseColor(value)};`);
        }
      }
      vars.push('');
    }

    // Typography
    if (styleData.typography?.families && Array.isArray(styleData.typography.families)) {
      vars.push('  /* Typography */');
      styleData.typography.families.forEach((family, i) => {
        vars.push(`  --font-family-${i === 0 ? 'primary' : i === 1 ? 'secondary' : `f${i}`}: ${family};`);
      });
      vars.push('');
    }

    if (styleData.typography?.scale && typeof styleData.typography.scale === 'object') {
      vars.push('  /* Font Sizes */');
      for (const [name, value] of Object.entries(styleData.typography.scale)) {
        const safeName = toCSSVarName(name);
        if (safeName && value) {
          vars.push(`  --font-size-${safeName}: ${value};`);
        }
      }
      vars.push('');
    }

    // Spacing
    if (styleData.spacing && typeof styleData.spacing === 'object') {
      vars.push('  /* Spacing */');
      for (const [name, value] of Object.entries(styleData.spacing)) {
        const safeName = toCSSVarName(name);
        if (safeName && value) {
          vars.push(`  --space-${safeName}: ${value};`);
        }
      }
      vars.push('');
    }

    // Borders
    if (styleData.borders?.radius) {
      vars.push('  /* Border Radius */');
      for (const [name, value] of Object.entries(styleData.borders.radius)) {
        vars.push(`  --radius-${toKebabCase(name)}: ${value};`);
      }
      vars.push('');
    }

    // Shadows
    if (styleData.shadows) {
      vars.push('  /* Shadows */');
      for (const [name, value] of Object.entries(styleData.shadows)) {
        vars.push(`  --shadow-${toKebabCase(name)}: ${value};`);
      }
      vars.push('');
    }

    // Animations
    if (styleData.animations?.durations) {
      vars.push('  /* Animation Durations */');
      for (const [name, value] of Object.entries(styleData.animations.durations)) {
        const ms = parseDuration(value);
        if (ms !== null) {
          vars.push(`  --motion-${toKebabCase(name)}: ${ms}ms;`);
        }
      }
      vars.push('');
    }

    if (styleData.animations?.easings) {
      vars.push('  /* Animation Easings */');
      for (const [name, value] of Object.entries(styleData.animations.easings)) {
        vars.push(`  --ease-${toKebabCase(name)}: ${value};`);
      }
      vars.push('');
    }

    vars.push('}');

    // Keyframes
    if (styleData.animations?.keyframes) {
      vars.push('');
      vars.push('/* Keyframes */');
      for (const [name, keyframe] of Object.entries(styleData.animations.keyframes)) {
        vars.push(`@keyframes ${slugify(name)} {`);
        if (typeof keyframe === 'string') {
          vars.push(keyframe);
        } else {
          for (const [offset, props] of Object.entries(keyframe)) {
            vars.push(`  ${offset} {`);
            for (const [prop, val] of Object.entries(props)) {
              vars.push(`    ${toKebabCase(prop)}: ${val};`);
            }
            vars.push('  }');
          }
        }
        vars.push('}');
        vars.push('');
      }
    }

    return vars.join('\n');
  }

  // ============================================
  // StyleKit Tokens Format
  // ============================================

  function toStyleKit(styleData) {
    const tokens = {
      id: slugify(styleData.name || 'extracted-style'),
      name: styleData.name || 'Extracted Style',
      description: `Style extracted from ${styleData.url || 'unknown source'}`,
      source: styleData.url || null,
      extractedAt: new Date().toISOString(),

      // Core tokens
      colors: {
        primary: null,
        secondary: null,
        accent: null,
        background: null,
        surface: null,
        text: null,
        textMuted: null,
        border: null,
        error: null,
        success: null,
        warning: null,
        // Raw extracted colors
        _raw: {}
      },

      typography: {
        fontFamily: {
          primary: null,
          secondary: null,
          mono: null
        },
        fontSize: {
          xs: null,
          sm: null,
          base: null,
          lg: null,
          xl: null,
          '2xl': null,
          '3xl': null,
          '4xl': null
        },
        fontWeight: {
          normal: 400,
          medium: 500,
          semibold: 600,
          bold: 700
        },
        lineHeight: {
          tight: 1.2,
          normal: 1.5,
          relaxed: 1.75
        }
      },

      spacing: {
        xs: null,
        sm: null,
        md: null,
        lg: null,
        xl: null,
        '2xl': null,
        '3xl': null,
        '4xl': null
      },

      borders: {
        width: {
          thin: '1px',
          default: '2px',
          thick: '4px'
        },
        radius: {
          none: '0',
          sm: null,
          default: null,
          lg: null,
          full: '9999px'
        }
      },

      shadows: {
        none: 'none',
        sm: null,
        default: null,
        lg: null
      },

      motion: {
        duration: {
          fast: null,
          default: null,
          slow: null
        },
        easing: {
          default: 'ease',
          in: 'ease-in',
          out: 'ease-out',
          inOut: 'ease-in-out'
        },
        keyframes: {}
      },

      components: {}
    };

    // Map colors to semantic tokens
    if (styleData.colors) {
      tokens.colors._raw = { ...styleData.colors };

      // Try to auto-map common color patterns
      for (const [name, value] of Object.entries(styleData.colors)) {
        const lower = name.toLowerCase();
        const hex = parseColor(value);

        if (lower.includes('primary') || lower.includes('brand') || lower.includes('accent')) {
          tokens.colors.primary = tokens.colors.primary || hex;
          if (lower.includes('accent')) tokens.colors.accent = hex;
        } else if (lower.includes('secondary')) {
          tokens.colors.secondary = hex;
        } else if (lower.includes('background') || lower.includes('bg')) {
          tokens.colors.background = tokens.colors.background || hex;
        } else if (lower.includes('surface') || lower.includes('card')) {
          tokens.colors.surface = hex;
        } else if (lower.includes('text') && !lower.includes('muted')) {
          tokens.colors.text = tokens.colors.text || hex;
        } else if (lower.includes('muted') || lower.includes('secondary-text')) {
          tokens.colors.textMuted = hex;
        } else if (lower.includes('border')) {
          tokens.colors.border = hex;
        } else if (lower.includes('error') || lower.includes('danger')) {
          tokens.colors.error = hex;
        } else if (lower.includes('success')) {
          tokens.colors.success = hex;
        } else if (lower.includes('warning')) {
          tokens.colors.warning = hex;
        }
      }
    }

    // Map typography
    if (styleData.typography) {
      if (styleData.typography.families?.length) {
        tokens.typography.fontFamily.primary = styleData.typography.families[0];
        if (styleData.typography.families[1]) {
          tokens.typography.fontFamily.secondary = styleData.typography.families[1];
        }
        // Check for mono font
        for (const family of styleData.typography.families) {
          if (family.toLowerCase().includes('mono') || family.toLowerCase().includes('code')) {
            tokens.typography.fontFamily.mono = family;
            break;
          }
        }
      }

      if (styleData.typography.scale) {
        const sizes = Object.entries(styleData.typography.scale)
          .map(([name, value]) => ({ name, value, px: parseInt(value) }))
          .filter(s => !isNaN(s.px))
          .sort((a, b) => a.px - b.px);

        if (sizes.length >= 4) {
          tokens.typography.fontSize.sm = sizes[0].value;
          tokens.typography.fontSize.base = sizes[Math.floor(sizes.length / 3)].value;
          tokens.typography.fontSize.lg = sizes[Math.floor(sizes.length * 2 / 3)].value;
          tokens.typography.fontSize.xl = sizes[sizes.length - 1].value;
        }
      }
    }

    // Map spacing
    if (styleData.spacing) {
      const spacings = Object.entries(styleData.spacing)
        .map(([name, value]) => ({ name, value, px: parseInt(value) }))
        .filter(s => !isNaN(s.px))
        .sort((a, b) => a.px - b.px);

      if (spacings.length >= 4) {
        tokens.spacing.sm = spacings[0].value;
        tokens.spacing.md = spacings[Math.floor(spacings.length / 2)].value;
        tokens.spacing.lg = spacings[spacings.length - 1].value;
      }
    }

    // Map borders
    if (styleData.borders?.radius) {
      const radii = Object.values(styleData.borders.radius)
        .map(v => ({ value: v, px: parseInt(v) }))
        .filter(r => !isNaN(r.px))
        .sort((a, b) => a.px - b.px);

      if (radii.length) {
        tokens.borders.radius.sm = radii[0].value;
        tokens.borders.radius.default = radii[Math.floor(radii.length / 2)].value;
        if (radii.length > 1) {
          tokens.borders.radius.lg = radii[radii.length - 1].value;
        }
      }
    }

    // Map shadows
    if (styleData.shadows) {
      const shadowList = Object.values(styleData.shadows);
      if (shadowList.length) {
        tokens.shadows.default = shadowList[0];
        if (shadowList.length > 1) {
          tokens.shadows.sm = shadowList[0];
          tokens.shadows.lg = shadowList[shadowList.length - 1];
        }
      }
    }

    // Map motion
    if (styleData.animations) {
      if (styleData.animations.durations) {
        const durations = Object.entries(styleData.animations.durations)
          .map(([name, value]) => ({ name, value, ms: parseDuration(value) }))
          .filter(d => d.ms !== null)
          .sort((a, b) => a.ms - b.ms);

        if (durations.length) {
          tokens.motion.duration.fast = `${durations[0].ms}ms`;
          tokens.motion.duration.default = `${durations[Math.floor(durations.length / 2)].ms}ms`;
          tokens.motion.duration.slow = `${durations[durations.length - 1].ms}ms`;
        }
      }

      if (styleData.animations.easings) {
        for (const [name, value] of Object.entries(styleData.animations.easings)) {
          const lower = name.toLowerCase();
          if (lower.includes('in') && lower.includes('out')) {
            tokens.motion.easing.inOut = value;
          } else if (lower.includes('in')) {
            tokens.motion.easing.in = value;
          } else if (lower.includes('out')) {
            tokens.motion.easing.out = value;
          } else {
            tokens.motion.easing.default = value;
          }
        }
      }

      if (styleData.animations.keyframes) {
        tokens.motion.keyframes = { ...styleData.animations.keyframes };
      }
    }

    // Map components
    if (styleData.components) {
      tokens.components = { ...styleData.components };
    }

    return tokens;
  }

  // ============================================
  // Generate TypeScript code for StyleKit
  // ============================================

  // Escape string for safe use in single-quoted JS/TS strings
  function escapeString(str) {
    if (!str) return '';
    return String(str)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r');
  }

  // Generate safe identifier from string (must start with letter, only alphanumeric)
  function toSafeIdentifier(str) {
    if (!str) return 'extracted';
    let id = toCamelCase(str);
    // Remove non-alphanumeric characters
    id = id.replace(/[^a-zA-Z0-9]/g, '');
    // Ensure starts with letter
    if (/^[0-9]/.test(id)) {
      id = 'style' + id;
    }
    return id || 'extracted';
  }

  function toStyleKitTS(styleData) {
    const tokens = toStyleKit(styleData);
    const safeId = toSafeIdentifier(tokens.id);

    let ts = `// StyleKit Style Definition
// Generated by style-extractor from: ${escapeString(tokens.source || 'unknown')}
// Generated at: ${tokens.extractedAt}

import type { StyleDefinition } from '@/lib/styles/types';

export const ${safeId}Style: StyleDefinition = {
  id: '${escapeString(tokens.id)}',
  name: '${escapeString(tokens.name)}',
  description: '${escapeString(tokens.description)}',

  colors: {
    primary: '${escapeString(tokens.colors.primary || '#000000')}',
    secondary: '${escapeString(tokens.colors.secondary || '#666666')}',
    accent: '${escapeString(tokens.colors.accent || tokens.colors.primary || '#0066cc')}',
    background: '${escapeString(tokens.colors.background || '#ffffff')}',
    surface: '${escapeString(tokens.colors.surface || '#f5f5f5')}',
    text: '${escapeString(tokens.colors.text || '#000000')}',
    textMuted: '${escapeString(tokens.colors.textMuted || '#666666')}',
    border: '${escapeString(tokens.colors.border || '#e0e0e0')}',
  },

  typography: {
    fontFamily: {
      primary: '${escapeString(tokens.typography.fontFamily.primary || 'system-ui, sans-serif')}',
      secondary: '${escapeString(tokens.typography.fontFamily.secondary || 'inherit')}',
      mono: '${escapeString(tokens.typography.fontFamily.mono || 'monospace')}',
    },
    fontSize: {
      sm: '${escapeString(tokens.typography.fontSize.sm || '14px')}',
      base: '${escapeString(tokens.typography.fontSize.base || '16px')}',
      lg: '${escapeString(tokens.typography.fontSize.lg || '18px')}',
      xl: '${escapeString(tokens.typography.fontSize.xl || '24px')}',
    },
  },

  spacing: {
    sm: '${escapeString(tokens.spacing.sm || '8px')}',
    md: '${escapeString(tokens.spacing.md || '16px')}',
    lg: '${escapeString(tokens.spacing.lg || '24px')}',
  },

  borders: {
    radius: {
      sm: '${escapeString(tokens.borders.radius.sm || '4px')}',
      default: '${escapeString(tokens.borders.radius.default || '8px')}',
      lg: '${escapeString(tokens.borders.radius.lg || '12px')}',
    },
  },

  motion: {
    duration: {
      fast: '${escapeString(tokens.motion.duration.fast || '150ms')}',
      default: '${escapeString(tokens.motion.duration.default || '300ms')}',
      slow: '${escapeString(tokens.motion.duration.slow || '500ms')}',
    },
    easing: {
      default: '${escapeString(tokens.motion.easing.default)}',
      in: '${escapeString(tokens.motion.easing.in)}',
      out: '${escapeString(tokens.motion.easing.out)}',
      inOut: '${escapeString(tokens.motion.easing.inOut)}',
    },
  },
};

export default ${safeId}Style;
`;

    return ts;
  }

  // ============================================
  // Recipes TypeScript Format (delegates to stylekit adapter)
  // ============================================

  function toRecipesTS() {
    if (!window.__seStyleKit?.generateRecipes) {
      return '// Recipes not available — stylekit-adapter.js not loaded\n';
    }
    return window.__seStyleKit.generateRecipes();
  }

  function toTokensTS() {
    if (!window.__seStyleKit?.generateTokens) {
      return '// Tokens not available — stylekit-adapter.js not loaded\n';
    }
    return window.__seStyleKit.generateTokens();
  }

  // ============================================
  // Export
  // ============================================

  window.__seFormat = {
    installed: true,

    // Core converters
    toJSON,
    toTailwind,
    toCSSVars,
    toStyleKit,
    toStyleKitTS,
    toRecipesTS,
    toTokensTS,

    // Helpers
    slugify,
    toKebabCase,
    toCamelCase,
    rgbToHex,
    parseColor,
    parseDuration,

    // Format all at once
    convertAll(styleData) {
      return {
        json: toJSON(styleData),
        tailwind: toTailwind(styleData),
        cssVars: toCSSVars(styleData),
        styleKit: toStyleKit(styleData),
        styleKitTS: toStyleKitTS(styleData),
        recipesTS: toRecipesTS(),
        tokensTS: toTokensTS()
      };
    }
  };
})();
