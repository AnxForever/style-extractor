// Style Extractor: Export Schema
// Generates standardized export format for style collection websites
//
// This module aggregates all extracted data into a single, validated schema
// suitable for submission to style collection platforms.
//
// Usage in evaluate_script:
//   window.__seExport.toStyleCollectionFormat(data)
//   window.__seExport.validateSchema(data)
//   window.__seExport.export(options)

(() => {
  if (window.__seExport?.installed) return;

  // Debug mode
  const debug = (...args) => {
    if (window.__seDebug) console.log('[style-extractor:export]', ...args);
  };

  // ============================================
  // Schema Version
  // ============================================

  const SCHEMA_VERSION = '1.0.0';
  const SCHEMA_URL = 'https://stylekit.dev/schema/style-collection-v1.json';

  // ============================================
  // Helper Functions
  // ============================================

  function slugify(str) {
    if (!str) return 'unknown';
    return str
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  function generateId(url) {
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname || '';
      if (hostname) {
        return hostname.replace(/\./g, '-').replace(/^www-/, '');
      }

      // file:// URLs do not have hostnames. Fall back to a slugged file name.
      if (parsed.protocol === 'file:') {
        const fileName = (parsed.pathname || '').split('/').filter(Boolean).pop() || 'local-file';
        const baseName = fileName.replace(/\.[a-z0-9]+$/i, '');
        const localId = slugify(baseName) || 'local-file';
        return `file-${localId}`;
      }
    } catch {
      // Ignore and fallback below.
    }

    return 'extracted-' + Date.now();
  }

  function extractDomain(url) {
    try {
      const hostname = new URL(url).hostname;
      return hostname || null;
    } catch {
      return null;
    }
  }

  // ============================================
  // Tag Inference
  // ============================================

  function inferTags(data) {
    const tags = new Set();

    // Color scheme detection
    if (data.tokens?.colors) {
      const colors = data.tokens.colors;
      const bgColor = colors.semantic?.background || colors.palette?.['color-0']?.value;
      if (bgColor) {
        const isDark = isColorDark(bgColor);
        tags.add(isDark ? 'dark-mode' : 'light-mode');
      }

      // Check for vibrant colors
      const hasVibrant = Object.values(colors.palette || {}).some(c => {
        const sat = getColorSaturation(c.value || c);
        return sat > 70;
      });
      if (hasVibrant) tags.add('vibrant');
    }

    // Layout detection
    if (data.structure?.layout) {
      const layout = data.structure.layout;
      if (layout.patterns?.grid?.length > 2) tags.add('grid-layout');
      if (layout.patterns?.flex?.length > 5) tags.add('flex-layout');
    }

    // Motion detection
    if (data.tokens?.motion) {
      const motion = data.tokens.motion;
      const hasAnimations = motion.keyframes && Object.keys(motion.keyframes).length > 0;
      const hasDurations = motion.duration && Object.keys(motion.duration).length > 0;
      if (hasAnimations || hasDurations) tags.add('animated');
    }

    // Component detection
    if (data.components) {
      if (data.components.card?.length > 3) tags.add('card-based');
      if (data.components.modal?.length > 0) tags.add('has-modals');
      if (data.components.hero?.length > 0) tags.add('hero-section');
    }

    // Responsive detection
    if (data.structure?.breakpoints?.count > 2) {
      tags.add('responsive');
    }

    // Typography detection
    if (data.tokens?.typography?.fontFamily?.mono) {
      tags.add('monospace');
    }

    return Array.from(tags);
  }

  function isColorDark(color) {
    if (!color) return false;
    // Simple luminance check for hex colors
    const hex = color.replace('#', '');
    if (hex.length < 6) return false;
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance < 0.5;
  }

  function getColorSaturation(color) {
    if (!color) return 0;
    const hex = color.replace('#', '');
    if (hex.length < 6) return 0;
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max === 0) return 0;
    return ((max - min) / max) * 100;
  }

  // ============================================
  // Metadata Generation
  // ============================================

  function generateMetadata(data, options = {}) {
    const url = data.meta?.url || options.url || location.href;
    const title = data.meta?.title || options.name || document.title;

    return {
      id: options.id || generateId(url),
      name: options.name || title,
      description: options.description || `Style extracted from ${extractDomain(url)}`,
      source: {
        url,
        domain: extractDomain(url),
        extractedAt: new Date().toISOString()
      },
      tags: options.tags || inferTags(data),
      thumbnail: options.thumbnail || null
    };
  }

  // ============================================
  // Token Normalization
  // ============================================

  function normalizeTokens(data) {
    const tokens = {
      colors: {},
      typography: {},
      spacing: {},
      motion: {}
    };

    // Colors from stylekit adapter
    if (data.stylekit?.normalized?.tokens?.colors) {
      tokens.colors = data.stylekit.normalized.tokens.colors;
    } else if (data.tokens?.colors) {
      tokens.colors = data.tokens.colors;
    }

    // Typography
    if (data.stylekit?.normalized?.tokens?.typography) {
      tokens.typography = data.stylekit.normalized.tokens.typography;
    } else if (data.tokens?.typography) {
      tokens.typography = data.tokens.typography;
    }

    // Spacing
    if (data.stylekit?.normalized?.tokens?.spacing) {
      tokens.spacing = data.stylekit.normalized.tokens.spacing;
    } else if (data.tokens?.spacing) {
      tokens.spacing = data.tokens.spacing;
    }

    // Motion
    if (data.stylekit?.normalized?.tokens?.motion) {
      tokens.motion = data.stylekit.normalized.tokens.motion;
    } else if (data.motion?.animations) {
      tokens.motion = {
        durations: {},
        easings: {},
        keyframes: {}
      };
      for (const anim of data.motion.animations || []) {
        if (anim.timing?.duration) {
          const dur = anim.timing.duration;
          tokens.motion.durations[`duration-${dur}`] = `${dur}ms`;
        }
        if (anim.timing?.easing) {
          tokens.motion.easings[`easing-${Object.keys(tokens.motion.easings).length}`] = anim.timing.easing;
        }
      }
    }

    return tokens;
  }

  // ============================================
  // Structure Normalization
  // ============================================

  function normalizeStructure(data) {
    const structure = {
      layout: {},
      landmarks: [],
      breakpoints: {}
    };

    if (data.structure) {
      // Layout patterns
      if (data.structure.layout) {
        structure.layout = {
          primaryType: data.structure.layout.summary?.primaryLayout || 'flex',
          gridCount: data.structure.layout.summary?.gridCount || 0,
          flexCount: data.structure.layout.summary?.flexCount || 0
        };
      }

      // Semantic landmarks
      if (data.structure.semantic?.structure?.landmarks) {
        structure.landmarks = data.structure.semantic.structure.landmarks.map(l => ({
          role: l.role,
          selector: l.selector,
          label: l.label || null
        }));
      }

      // Breakpoints
      if (data.structure.breakpoints?.named) {
        structure.breakpoints = {};
        for (const [name, bp] of Object.entries(data.structure.breakpoints.named)) {
          structure.breakpoints[name] = bp.value;
        }
      }
    }

    return structure;
  }

  // ============================================
  // Component Normalization
  // ============================================

  function normalizeComponents(data) {
    const components = {};

    // From component detector
    if (data.components?.components) {
      for (const [type, items] of Object.entries(data.components.components)) {
        if (!items?.length) continue;
        components[type] = {
          count: items.length,
          examples: items.slice(0, 3).map(item => ({
            selector: item.selector,
            styles: item.styles
          }))
        };
      }
    }

    // From stylekit adapter
    if (data.stylekit?.normalized?.components) {
      for (const [type, items] of Object.entries(data.stylekit.normalized.components)) {
        if (!components[type]) {
          components[type] = {
            count: items.length,
            examples: items.slice(0, 3)
          };
        }
      }
    }

    return components;
  }

  // ============================================
  // Code Normalization
  // ============================================

  function normalizeCode(data) {
    const code = {
      html: null,
      react: {},
      vue: {}
    };

    if (data.code) {
      if (data.code.html?.files?.['skeleton.html']) {
        code.html = data.code.html.files['skeleton.html'];
      }
      if (data.code.react?.files) {
        code.react = data.code.react.files;
      }
      if (data.code.vue?.files) {
        code.vue = data.code.vue.files;
      }
    }

    return code;
  }

  // ============================================
  // Evidence Collection
  // ============================================

  function collectEvidence(data) {
    const evidence = {
      screenshots: [],
      cssFiles: [],
      extractionLog: []
    };

    // Add extraction timestamps
    evidence.extractionLog.push({
      phase: 'extraction',
      timestamp: data.meta?.extractedAt || new Date().toISOString(),
      url: data.meta?.url || location.href
    });

    // CSS files from network requests (if available)
    if (data.cssFiles) {
      evidence.cssFiles = data.cssFiles;
    }

    // Screenshots (if available)
    if (data.screenshots) {
      evidence.screenshots = data.screenshots;
    }

    return evidence;
  }

  // ============================================
  // Schema Validation
  // ============================================

  function validateSchema(schema) {
    const errors = [];
    const warnings = [];

    // Required fields
    if (!schema.$schema) {
      warnings.push('Missing $schema field');
    }
    if (!schema.version) {
      errors.push('Missing version field');
    }
    if (!schema.meta?.id) {
      errors.push('Missing meta.id field');
    }
    if (!schema.meta?.name) {
      errors.push('Missing meta.name field');
    }
    if (!schema.meta?.source?.url) {
      errors.push('Missing meta.source.url field');
    }

    // Token validation
    if (!schema.tokens || Object.keys(schema.tokens).length === 0) {
      warnings.push('No tokens extracted');
    }
    if (!schema.tokens?.colors || Object.keys(schema.tokens.colors).length === 0) {
      warnings.push('No color tokens extracted');
    }

    // Structure validation
    if (!schema.structure) {
      warnings.push('No structure data');
    }

    // Blueprint validation
    if (schema.blueprint && !schema.blueprint.summary) {
      warnings.push('Blueprint missing summary');
    }

    // Component validation
    if (!schema.components || Object.keys(schema.components).length === 0) {
      warnings.push('No components detected');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      score: calculateCompleteness(schema)
    };
  }

  function calculateCompleteness(schema) {
    let score = 0;
    const maxScore = 105;

    // Meta (20 points)
    if (schema.meta?.id) score += 5;
    if (schema.meta?.name) score += 5;
    if (schema.meta?.source?.url) score += 5;
    if (schema.meta?.tags?.length > 0) score += 5;

    // Tokens (40 points)
    if (schema.tokens?.colors && Object.keys(schema.tokens.colors).length > 0) score += 10;
    if (schema.tokens?.typography && Object.keys(schema.tokens.typography).length > 0) score += 10;
    if (schema.tokens?.spacing && Object.keys(schema.tokens.spacing).length > 0) score += 10;
    if (schema.tokens?.motion && Object.keys(schema.tokens.motion).length > 0) score += 10;

    // Structure (20 points)
    if (schema.structure?.layout) score += 7;
    if (schema.structure?.landmarks?.length > 0) score += 7;
    if (schema.structure?.breakpoints && Object.keys(schema.structure.breakpoints).length > 0) score += 6;

    // Components (10 points)
    if (schema.components && Object.keys(schema.components).length > 0) score += 10;

    // Blueprint (5 points)
    if (schema.blueprint?.summary) score += 5;

    // Code (10 points)
    if (schema.code?.html) score += 4;
    if (schema.code?.react && Object.keys(schema.code.react).length > 0) score += 3;
    if (schema.code?.vue && Object.keys(schema.code.vue).length > 0) score += 3;

    return Math.round((score / maxScore) * 100);
  }

  // ============================================
  // Main Export Function
  // ============================================

  function toStyleCollectionFormat(data, options = {}) {
    debug('Generating style collection format');

    const schema = {
      $schema: SCHEMA_URL,
      version: SCHEMA_VERSION,
      meta: generateMetadata(data, options),
      tokens: normalizeTokens(data),
      structure: normalizeStructure(data),
      components: normalizeComponents(data),
      code: normalizeCode(data),
      evidence: collectEvidence(data)
    };

    if (data.blueprint) {
      schema.blueprint = {
        version: data.blueprint.meta?.version || '1.0.0',
        summary: data.blueprint.summary || null,
        sections: data.blueprint.sections || null,
        relationships: data.blueprint.relationships || null,
        interaction: data.blueprint.interaction || null,
        responsive: data.blueprint.responsive || null
      };
    }

    // Include recipes from stylekit adapter if available
    if (data.stylekit?.files?.['style-recipes.ts'] || data.recipes) {
      schema.recipes = {};
      try {
        if (window.__seStyleKit?.getRecipes) {
          const recipes = window.__seStyleKit.getRecipes();
          for (const [type, recipe] of Object.entries(recipes)) {
            schema.recipes[type] = {
              id: recipe.id,
              name: recipe.name,
              element: recipe.skeleton?.element || null,
              baseClasses: recipe.skeleton?.baseClasses || [],
              variants: Object.keys(recipe.variants || {}),
              parameters: (recipe.parameters || []).map(p => ({ id: p.id, type: p.type, default: p.default })),
              slots: (recipe.slots || []).map(s => ({ id: s.id, required: s.required })),
              states: recipe.states ? Object.keys(recipe.states) : [],
              confidence: recipe._confidence || null,
            };
          }
        }
      } catch (e) {
        debug('Failed to include recipes in schema:', e.message);
      }
    }

    return schema;
  }

  // ============================================
  // Full Export Pipeline
  // ============================================

  function exportFull(options = {}) {
    debug('Running full export pipeline');

    // Collect all available data
    const data = {
      meta: {
        url: location.href,
        title: document.title,
        extractedAt: new Date().toISOString()
      }
    };

    // Collect from structure extractor
    if (window.__seStructure?.installed) {
      data.structure = window.__seStructure.extract();
    }

    // Collect from stylekit adapter
    if (window.__seStyleKit?.installed) {
      data.stylekit = window.__seStyleKit.extract();
    }

    // Collect from component detector
    if (window.__seComponents?.installed) {
      data.components = window.__seComponents.generateReport();
    }

    // Collect from blueprint
    if (window.__seBlueprint?.installed) {
      data.blueprint = window.__seBlueprint.build(data);
    }

    // Collect from motion tools
    if (window.__seMotion?.installed) {
      data.motion = window.__seMotion.capture('export');
    }

    // Generate code if structure available
    if (window.__seCodeGen?.installed && data.structure) {
      data.code = window.__seCodeGen.generate(data.structure, 'all');
    }

    // Generate schema
    const schema = toStyleCollectionFormat(data, options);

    // Validate
    const validation = validateSchema(schema);

    return {
      schema,
      validation,
      raw: data
    };
  }

  // ============================================
  // Export
  // ============================================

  window.__seExport = {
    installed: true,

    // Core functions
    toStyleCollectionFormat,
    validateSchema,

    // Full pipeline
    export: exportFull,

    // Helpers
    generateMetadata,
    inferTags,
    normalizeTokens,
    normalizeStructure,
    normalizeComponents,
    normalizeCode,

    // Constants
    SCHEMA_VERSION,
    SCHEMA_URL
  };
})();
