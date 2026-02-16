// Style Extractor: Module Registry
// Central registry for all extraction modules with dependency management
//
// This module provides:
// 1. Module registration and discovery
// 2. Dependency declaration and validation
// 3. Capability querying
// 4. Unified extraction entry point
//
// Usage:
//   window.__seRegistry.register(module)
//   window.__seRegistry.getModule(name)
//   window.__seRegistry.extractAll(options)
//   window.extractStyle(options)  // Unified entry point

(() => {
  if (window.__seRegistry?.installed) return;

  // ============================================
  // Module Registry
  // ============================================

  const modules = new Map();
  const capabilities = new Map();

  /**
   * Module definition schema
   */
  const MODULE_SCHEMA = {
    name: 'string',           // Module name (e.g., 'structure')
    globalName: 'string',     // Global object name (e.g., '__seStructure')
    version: 'string',        // Semantic version
    description: 'string',    // Brief description
    dependencies: 'array',    // Required modules
    optionalDeps: 'array',    // Optional modules
    capabilities: 'array',    // Provided capabilities
    extract: 'function'       // Main extraction function
  };

  /**
   * Register a module
   */
  function register(module) {
    // Validate required fields
    if (!module.name || !module.globalName) {
      console.error('[style-extractor:registry] Invalid module: missing name or globalName');
      return { success: false, error: 'Missing required fields' };
    }

    // Check if global object exists
    if (!window[module.globalName]?.installed) {
      console.warn(`[style-extractor:registry] Module ${module.name} not loaded (${module.globalName})`);
      return { success: false, error: 'Module not loaded' };
    }

    // Already registered.
    if (modules.has(module.name)) {
      return { success: true, name: module.name, skipped: 'already-registered' };
    }

    // Register module
    modules.set(module.name, {
      ...module,
      registeredAt: Date.now()
    });

    // Register capabilities
    for (const cap of (module.capabilities || [])) {
      if (!capabilities.has(cap)) {
        capabilities.set(cap, []);
      }
      capabilities.get(cap).push(module.name);
    }

    return { success: true, name: module.name };
  }

  /**
   * Get a registered module
   */
  function getModule(name) {
    return modules.get(name) || null;
  }

  /**
   * Get all registered modules
   */
  function getAllModules() {
    return Array.from(modules.values());
  }

  /**
   * Check if a module is available
   */
  function hasModule(name) {
    return modules.has(name) && window[modules.get(name).globalName]?.installed;
  }

  /**
   * Get modules that provide a capability
   */
  function getModulesWithCapability(capability) {
    return capabilities.get(capability) || [];
  }

  /**
   * Check dependencies for a module
   */
  function checkDependencies(moduleName) {
    const module = modules.get(moduleName);
    if (!module) return { valid: false, error: 'Module not found' };

    const missing = [];
    for (const dep of (module.dependencies || [])) {
      if (!hasModule(dep)) {
        missing.push(dep);
      }
    }

    return {
      valid: missing.length === 0,
      missing,
      optional: (module.optionalDeps || []).filter(dep => !hasModule(dep))
    };
  }

  function collectStateSelectors(data = {}, limit = 12) {
    const selectors = [];
    const seen = new Set();

    const pushSelector = (selector) => {
      if (!selector || typeof selector !== 'string') return;
      const normalized = selector.trim();
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      selectors.push(normalized);
    };

    const componentGroups = data.components?.components || {};
    for (const items of Object.values(componentGroups)) {
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        if (selectors.length >= limit) return selectors;
        if (item?.selector) pushSelector(item.selector);
      }
    }

    const fallbackQueries = [
      'button',
      'a',
      'input',
      'select',
      'textarea',
      '[role="button"]',
      '[role="tab"]',
      '[role="menuitem"]',
      '[tabindex]'
    ];
    for (const query of fallbackQueries) {
      if (selectors.length >= limit) return selectors;
      try {
        const nodes = document.querySelectorAll(query);
        for (const node of Array.from(nodes).slice(0, 3)) {
          if (selectors.length >= limit) return selectors;
          const selector = window.__seStateCapture?.cssPath?.(node);
          if (selector) pushSelector(selector);
        }
      } catch {
        // Ignore invalid selectors for the current document.
      }
    }

    return selectors;
  }

  function extractStateCaptureData(data = {}) {
    if (!window.__seStateCapture?.installed) return undefined;

    const storedSummaries = window.__seStateCapture.generateStoredSummaries?.() || null;
    const storedMatrix = window.__seStateCapture.getStoredStateMatrix?.() || null;
    let selectors = collectStateSelectors(data);
    if (storedMatrix) {
      const storedSelectors = Object.keys(storedMatrix);
      const merged = new Set(selectors);
      storedSelectors.forEach((s) => merged.add(s));
      selectors = Array.from(merged);
    }
    const stateFallback = {};
    const stateSummaries = {};

    if (storedSummaries) {
      for (const [selector, summary] of Object.entries(storedSummaries)) {
        stateSummaries[selector] = summary;
      }
    }

    for (const selector of selectors) {
      const fallback = window.__seStateCapture.extractAllStatesFallback(selector);
      stateFallback[selector] = fallback;

      if (!stateSummaries[selector] && fallback?.ok) {
        stateSummaries[selector] = window.__seStateCapture.generateStateSummary(fallback);
      }
    }

    const mcpCommands = selectors
      .slice(0, 8)
      .map((selector) => window.__seStateCapture.generateMCPCommands(selector))
      .filter((item) => item?.ok);

    return {
      selectors,
      fallback: stateFallback,
      summaries: stateSummaries,
      captured: storedMatrix ? { states: storedMatrix, summaries: storedSummaries } : null,
      batchWorkflow: window.__seStateCapture.batchCapture(selectors),
      mcpCommands
    };
  }

  function extractResponsiveData() {
    if (!window.__seResponsive?.installed) return undefined;

    let captured = null;
    try {
      const stored = window.__seResponsive.getAllStoredLayouts?.();
      if (stored && Object.keys(stored).length > 0) {
        captured = { layouts: stored };
      }
    } catch {
      // ignore
    }

    return {
      currentLayout: window.__seResponsive.extractCurrentLayout(),
      breakpoints: window.__seResponsive.analyzeBreakpoints(),
      responsiveDoc: window.__seResponsive.generateResponsiveDoc(),
      viewportWorkflow: window.__seResponsive.generateViewportWorkflow(['mobile', 'tablet', 'desktop']),
      captured
    };
  }

  function buildReplicaPlan(data = {}) {
    const stateSelectors = data['state-capture']?.selectors || [];
    const stateWorkflowSteps = data['state-capture']?.batchWorkflow?.steps?.length || 0;
    const viewportSteps = data.responsive?.viewportWorkflow?.steps?.length || 0;
    const blueprintNodes = data.blueprint?.summary?.nodeCount || 0;

    return {
      summary: {
        hasStructure: !!data.structure,
        hasComponents: !!data.components,
        hasCode: !!data.code,
        hasBlueprint: !!data.blueprint,
        blueprintNodes,
        stateSelectorCount: stateSelectors.length,
        stateWorkflowSteps,
        viewportWorkflowSteps: viewportSteps
      },
      workflows: {
        state: data['state-capture']?.batchWorkflow || null,
        viewport: data.responsive?.viewportWorkflow || null
      },
      nextSteps: [
        'Run replica.workflows.viewport with MCP resize/screenshot tools to capture mobile/tablet/desktop differences.',
        'Run replica.workflows.state with MCP hover/click actions, then re-run extractStyle({ preset: "replica" }) for updated state evidence.',
        'Use data.code output as scaffold and apply tokens from data.stylekit.normalized for visual parity.'
      ]
    };
  }

  // ============================================
  // Auto-Registration of Built-in Modules
  // ============================================

  const BUILT_IN_MODULES = [
    {
      name: 'utils',
      globalName: '__seUtils',
      version: '1.0.0',
      description: 'Shared utilities and caching',
      dependencies: [],
      capabilities: ['utils', 'caching', 'logging']
    },
    {
      name: 'structure',
      globalName: '__seStructure',
      version: '3.0.0',
      description: 'DOM structure and layout extraction',
      dependencies: [],
      optionalDeps: ['utils'],
      capabilities: ['dom', 'layout', 'breakpoints', 'semantic', 'shadow-dom'],
      extract: () => window.__seStructure?.extract()
    },
    {
      name: 'css',
      globalName: '__seCSS',
      version: '3.0.0',
      description: 'CSS parsing and variable extraction',
      dependencies: [],
      optionalDeps: ['utils'],
      capabilities: ['css-variables', 'keyframes', 'media-queries', 'font-faces'],
      extract: () => window.__seCSS?.analyze()
    },
    {
      name: 'components',
      globalName: '__seComponents',
      version: '2.0.0',
      description: 'Component detection and state extraction',
      dependencies: [],
      optionalDeps: ['utils'],
      capabilities: ['components', 'states', 'hierarchy'],
      extract: () => window.__seComponents?.generateReport()
    },
    {
      name: 'state-capture',
      globalName: '__seStateCapture',
      version: '1.0.0',
      description: 'MCP-driven pseudo-class state capture',
      dependencies: [],
      optionalDeps: ['components'],
      capabilities: ['state-capture', 'mcp-workflow', 'pseudo-classes'],
      extract: (data) => extractStateCaptureData(data)
    },
    {
      name: 'ai-semantic',
      globalName: '__seAISemantic',
      version: '1.0.0',
      description: 'AI-friendly semantic output generation',
      dependencies: [],
      optionalDeps: ['components', 'state-capture'],
      capabilities: ['ai-semantic', 'page-analysis', 'design-system', 'code-hints'],
      extract: (data) => window.__seAISemantic?.generate(data)
    },
    {
      name: 'blueprint',
      globalName: '__seBlueprint',
      version: '1.0.0',
      description: 'Replica blueprint for AI reconstruction',
      dependencies: ['structure'],
      optionalDeps: ['components', 'state-capture', 'responsive', 'stylekit', 'ai-semantic', 'a11y'],
      capabilities: ['blueprint', 'replica-ir', 'hierarchy', 'constraints'],
      extract: (data) => window.__seBlueprint?.build(data)
    },
    {
      name: 'a11y',
      globalName: '__seA11y',
      version: '1.0.0',
      description: 'Accessibility tree extraction',
      dependencies: [],
      optionalDeps: ['structure'],
      capabilities: ['a11y-tree', 'landmarks', 'aria-states', 'a11y-issues'],
      extract: () => window.__seA11y?.extractA11yTree()
    },
    {
      name: 'stylekit',
      globalName: '__seStyleKit',
      version: '3.2.0',
      description: 'StyleKit integration adapter with recipe generation, AI prompt, and confidence scoring',
      dependencies: [],
      optionalDeps: ['utils'],
      capabilities: ['tokens', 'stylekit', 'recipes', 'prompts', 'confidence'],
      extract: () => window.__seStyleKit?.extract()
    },
    {
      name: 'format',
      globalName: '__seFormat',
      version: '2.0.0',
      description: 'Multi-format output converter',
      dependencies: [],
      capabilities: ['json', 'tailwind', 'css-vars', 'typescript'],
      extract: (data) => window.__seFormat?.convertAll(data)
    },
    {
      name: 'codegen',
      globalName: '__seCodeGen',
      version: '3.0.0',
      description: 'Framework code generation',
      dependencies: ['structure'],
      capabilities: ['html', 'react', 'vue'],
      extract: (structure) => window.__seCodeGen?.generate(structure, 'all')
    },
    {
      name: 'export',
      globalName: '__seExport',
      version: '3.0.0',
      description: 'Standard export schema',
      dependencies: [],
      optionalDeps: ['structure', 'stylekit', 'components'],
      capabilities: ['export', 'schema', 'validation'],
      extract: () => window.__seExport?.export()
    },
    {
      name: 'theme',
      globalName: '__seTheme',
      version: '3.0.0',
      description: 'Theme detection and extraction',
      dependencies: [],
      optionalDeps: ['utils'],
      capabilities: ['theme', 'dark-mode', 'light-mode'],
      extract: () => window.__seTheme?.detect()
    },
    {
      name: 'motion',
      globalName: '__seMotion',
      version: '2.0.0',
      description: 'Animation capture',
      dependencies: [],
      capabilities: ['animations', 'transitions'],
      extract: (label) => window.__seMotion?.capture(label || 'full')
    },
    {
      name: 'motion-enhanced',
      globalName: '__seMotionEnhanced',
      version: '1.0.0',
      description: 'Enhanced animation capture with keyframes and triggers',
      dependencies: [],
      optionalDeps: ['motion'],
      capabilities: ['keyframes', 'triggers', 'chains', 'timeline'],
      extract: () => window.__seMotionEnhanced?.captureAll()
    },
    {
      name: 'motion-assoc',
      globalName: '__seMotionAssoc',
      version: '3.0.0',
      description: 'Animation-component association',
      dependencies: [],
      optionalDeps: ['motion', 'components'],
      capabilities: ['motion-docs', 'timeline'],
      extract: () => window.__seMotionAssoc?.analyze()
    },
    {
      name: 'screenshot',
      globalName: '__seScreenshot',
      version: '3.0.0',
      description: 'Screenshot planning',
      dependencies: [],
      capabilities: ['screenshots', 'evidence'],
      extract: () => window.__seScreenshot?.generateScreenshotPlan()
    },
    {
      name: 'multipage',
      globalName: '__seMultiPage',
      version: '3.0.0',
      description: 'Multi-page extraction',
      dependencies: [],
      capabilities: ['multipage', 'sitemap', 'merge'],
      extract: () => window.__seMultiPage?.discoverPages()
    },
    {
      name: 'incremental',
      globalName: '__seIncremental',
      version: '3.0.0',
      description: 'Incremental updates and diffing',
      dependencies: [],
      capabilities: ['incremental', 'snapshots', 'diff'],
      extract: () => window.__seIncremental?.extractIncremental()
    },
    {
      name: 'responsive',
      globalName: '__seResponsive',
      version: '1.0.0',
      description: 'Responsive layout extraction',
      dependencies: [],
      optionalDeps: ['structure'],
      capabilities: ['responsive', 'viewports', 'breakpoints', 'layout-comparison'],
      extract: () => extractResponsiveData()
    },
    {
      name: 'libs',
      globalName: '__seLibs',
      version: '2.0.0',
      description: 'Third-party library detection',
      dependencies: [],
      capabilities: ['library-detection'],
      extract: () => window.__seLibs?.detect?.() || null
    },
    {
      name: 'pattern-detect',
      globalName: '__sePatternDetect',
      version: '1.0.0',
      description: 'Repeating sibling pattern detection',
      dependencies: [],
      optionalDeps: ['structure', 'utils'],
      capabilities: ['patterns', 'repeating-elements', 'template-detection'],
      extract: () => window.__sePatternDetect?.detectPatterns()
    }
  ];

  /**
   * Auto-register all available built-in modules
   */
  function autoRegister() {
    const registered = [];
    const skipped = [];

    for (const module of BUILT_IN_MODULES) {
      if (window[module.globalName]?.installed) {
        register(module);
        registered.push(module.name);
      } else {
        skipped.push(module.name);
      }
    }

    return { registered, skipped };
  }

  // ============================================
  // Unified Extraction
  // ============================================

  /**
   * Extract all available data
   */
  function extractAll(options = {}) {
    const result = {
      meta: {
        url: location.href,
        title: document.title,
        extractedAt: new Date().toISOString(),
        modules: []
      },
      data: {},
      errors: [],
      warnings: []
    };

    // Determine which modules to run
    const modulesToRun = options.modules
      ? options.modules.filter(m => hasModule(m))
      : Array.from(modules.keys());

    // Run each module
    for (const moduleName of modulesToRun) {
      const module = modules.get(moduleName);
      if (!module?.extract) continue;

      try {
        // Check dependencies
        const deps = checkDependencies(moduleName);
        if (!deps.valid) {
          result.warnings.push({
            module: moduleName,
            message: `Missing dependencies: ${deps.missing.join(', ')}`
          });
        }

        // Run extraction
        const moduleResult = module.extract(result.data);
        if (moduleResult !== undefined) {
          result.data[moduleName] = moduleResult;
          result.meta.modules.push(moduleName);
        }
      } catch (e) {
        result.errors.push({
          module: moduleName,
          error: e.message
        });
      }
    }

    return result;
  }

  /**
   * Quick extraction with common presets
   */
  function quickExtract(preset = 'full') {
    const presets = {
      minimal: ['structure', 'css'],
      style: ['css', 'stylekit', 'theme'],
      components: ['structure', 'components', 'stylekit'],
      motion: ['motion', 'motion-assoc'],
      'ai-semantic': ['structure', 'components', 'state-capture', 'ai-semantic'],
      replica: [
        'structure',
        'css',
        'components',
        'a11y',
        'state-capture',
        'ai-semantic',
        'responsive',
        'stylekit',
        'blueprint',
        'theme',
        'motion',
        'motion-enhanced',
        'motion-assoc',
        'screenshot',
        'libs',
        'pattern-detect',
        'codegen',
        'export'
      ],
      full: null // All modules
    };

    const modules = presets[preset] || presets.full;
    return extractAll({ modules });
  }

  // ============================================
  // Unified Entry Point
  // ============================================

  /**
   * Main entry point for style extraction
   * @param {Object} options - Extraction options
   * @param {string} options.preset - Preset name: 'minimal', 'style', 'components', 'motion', 'ai-semantic', 'replica', 'full'
   * @param {string[]} options.modules - Specific modules to run
   * @param {boolean} options.includeCode - Generate framework code
   * @param {boolean} options.includeTheme - Extract both themes
   * @param {boolean} options.includeAISemantic - Generate AI-friendly semantic output
   * @param {boolean} options.includeRecipes - Generate StyleKit component recipes
   * @param {boolean} options.includePrompt - Generate AI-ready design system prompt
   * @param {boolean} options.includeConfidence - Include confidence scoring report
   * @param {string} options.format - Output format: 'raw', 'json', 'tailwind', 'stylekit'
   * @param {string} options.depth - Blueprint detail level: 'overview', 'section', 'full' (default: 'full')
   */
  function toFormatInputFromStyleKit(stylekitResult, fallbackMeta = {}) {
    const normalized = stylekitResult?.normalized || {};
    const tokens = normalized.tokens || {};
    const typography = tokens.typography || {};
    const motion = tokens.motion || {};

    const families = Object.values(typography.fontFamily || {}).filter(Boolean);
    const weights = Object.values(typography.fontWeight || {}).filter(Boolean);

    return {
      name: normalized.name || fallbackMeta.title || 'Extracted Style',
      url: normalized.source?.url || fallbackMeta.url || location.href,
      colors: tokens.colors?.semantic || {},
      typography: {
        families,
        scale: typography.fontSize || {},
        weights
      },
      spacing: tokens.spacing || {},
      borders: {
        widths: tokens.borders?.width || {},
        radius: tokens.borders?.radius || {},
        colors: {}
      },
      shadows: tokens.shadows || {},
      animations: {
        durations: motion.duration || {},
        easings: motion.easing || {},
        keyframes: motion.keyframes || {}
      },
      components: normalized.components || {}
    };
  }

  function compressBlueprint(blueprint, depth) {
    if (!blueprint || depth === 'full') return blueprint;

    function pruneTree(node, maxDepth, currentDepth = 0) {
      if (!node) return null;
      const pruned = { ...node };

      if (depth === 'overview') {
        // Overview: only keep sections and top-level components
        // Remove deep visual/typography details from non-component nodes
        if (!pruned.component && currentDepth > 1) {
          delete pruned.visual;
          delete pruned.typography;
          delete pruned.constraints;
        }
        // Truncate children at depth 2
        if (currentDepth >= 2) {
          if (pruned.children) {
            pruned.childCount = pruned.children.length;
            delete pruned.children;
          }
          return pruned;
        }
      } else if (depth === 'section') {
        // Section: keep 3 levels of depth with full details
        if (currentDepth >= 3) {
          if (pruned.children) {
            pruned.childCount = pruned.children.length;
            delete pruned.children;
          }
          return pruned;
        }
      }

      if (pruned.children) {
        pruned.children = pruned.children
          .map(child => pruneTree(child, maxDepth, currentDepth + 1))
          .filter(Boolean);
      }

      return pruned;
    }

    const compressed = { ...blueprint };
    compressed.tree = pruneTree(compressed.tree, depth === 'overview' ? 2 : 3);
    compressed.meta = { ...compressed.meta, depth };

    // For overview, also trim interaction plan
    if (depth === 'overview' && compressed.interaction) {
      compressed.interaction = {
        summary: compressed.interaction.summary,
        // Keep only top recommendations
        recommendations: compressed.interaction.recommendations
          ? { total: compressed.interaction.recommendations.total, items: compressed.interaction.recommendations.items?.slice(0, 3) }
          : null
      };
    }

    return compressed;
  }

  function extractStyle(options = {}) {
    // Re-run auto-register so modules loaded after registry init can join the run.
    autoRegister();

    const {
      preset = 'full',
      modules: requestedModules,
      includeCode = false,
      includeTheme = false,
      includeAISemantic = false,
      includeRecipes = false,
      includePrompt = false,
      includeConfidence = false,
      format = 'raw',
      depth = 'full'
    } = options;

    const replicaMode = preset === 'replica';

    // Run extraction
    const result = requestedModules
      ? extractAll({ modules: requestedModules })
      : quickExtract(preset);

    // Add code generation if requested
    if ((includeCode || replicaMode) && result.data.structure) {
      try {
        result.data.code = window.__seCodeGen?.generate(result.data.structure, 'all');
      } catch (e) {
        result.warnings.push({ module: 'codegen', message: e.message });
      }
    }

    // Add theme extraction if requested
    if ((includeTheme || replicaMode) && window.__seTheme?.installed) {
      try {
        result.data.themes = window.__seTheme.extractBothThemes();
      } catch (e) {
        result.warnings.push({ module: 'theme', message: e.message });
      }
    }

    // Add AI semantic output if requested
    if (includeAISemantic && window.__seAISemantic?.installed) {
      try {
        result.data.aiSemantic = window.__seAISemantic.generate({
          components: result.data.components?.components || {},
          states: result.data['state-capture'] || {}
        });
      } catch (e) {
        result.warnings.push({ module: 'ai-semantic', message: e.message });
      }
    }

    // Add StyleKit recipes if requested
    if (includeRecipes && window.__seStyleKit?.installed) {
      try {
        result.data.recipes = window.__seStyleKit.getRecipes();
        result.data.recipesFile = window.__seStyleKit.generateRecipes();
      } catch (e) {
        result.warnings.push({ module: 'stylekit-recipes', message: e.message });
      }
    }

    // Add AI-ready design system prompt if requested
    if (includePrompt && window.__seStyleKit?.installed) {
      try {
        result.data.designSystemPrompt = window.__seStyleKit.generatePrompt();
      } catch (e) {
        result.warnings.push({ module: 'stylekit-prompt', message: e.message });
      }
    }

    // Add confidence report if requested
    if (includeConfidence && window.__seStyleKit?.installed) {
      try {
        result.data.confidenceReport = window.__seStyleKit.getConfidenceReport();
      } catch (e) {
        result.warnings.push({ module: 'stylekit-confidence', message: e.message });
      }
    }

    // Format output if requested
    if (format !== 'raw' && result.data.stylekit && window.__seFormat?.installed) {
      try {
        const styleData = toFormatInputFromStyleKit(result.data.stylekit, result.meta);
        switch (format) {
          case 'json':
            result.formatted = window.__seFormat.toJSON(styleData);
            break;
          case 'tailwind':
            result.formatted = window.__seFormat.toTailwind(styleData);
            break;
          case 'stylekit':
            result.formatted = window.__seFormat.toStyleKitTS(styleData);
            break;
          case 'css':
            result.formatted = window.__seFormat.toCSSVars(styleData);
            break;
        }
      } catch (e) {
        result.warnings.push({ module: 'format', message: e.message });
      }
    }

    if (replicaMode) {
      result.data.replica = buildReplicaPlan(result.data);
    }

    // Blueprint compression: reduce output size based on depth parameter
    if (depth !== 'full' && result.data.blueprint) {
      result.data.blueprint = compressBlueprint(result.data.blueprint, depth);
    }

    return result;
  }

  // ============================================
  // Export
  // ============================================

  window.__seRegistry = {
    installed: true,
    version: '1.0.0',

    // Registration
    register,
    getModule,
    getAllModules,
    hasModule,
    checkDependencies,
    autoRegister,

    // Capabilities
    getModulesWithCapability,
    capabilities: () => Array.from(capabilities.keys()),

    // Extraction
    extractAll,
    quickExtract,

    // Constants
    BUILT_IN_MODULES
  };

  // Global unified entry point
  window.extractStyle = extractStyle;

  // Auto-register on load
  autoRegister();
})();
