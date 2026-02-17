// Style Extractor v3.2 - Script Loader
//
// Loads all 23 scripts in correct dependency order.
//
// Usage:
//   Method 1: Paste into browser console
//   Method 2: Run via Chrome DevTools MCP evaluate_script
//
// Scripts are loaded relative to the current page by default.
// Set BASE_URL before running to override (e.g. for GitHub raw).

(async () => {
  // Authoritative load order — matches e2e-test.html
  const SCRIPTS = [
    'utils.js',
    'structure-extract.js',
    'css-parser.js',
    'component-detect.js',
    'state-capture.js',
    'ai-semantic.js',
    'a11y-tree.js',
    'responsive-extract.js',
    'stylekit-adapter.js',
    'theme-detect.js',
    'motion-tools.js',
    'motion-enhanced.js',
    'motion-assoc.js',
    'screenshot-helper.js',
    'library-detect.js',
    'code-generator.js',
    'replica-blueprint.js',
    'format-converter.js',
    'pattern-detect.js',
    'export-schema.js',
    'incremental.js',
    'multi-page.js',
    'registry.js'
  ];

  // Script name → window global name
  const GLOBAL_MAP = {
    'utils.js':              '__seUtils',
    'structure-extract.js':  '__seStructure',
    'css-parser.js':         '__seCSS',
    'component-detect.js':   '__seComponents',
    'state-capture.js':      '__seStateCapture',
    'ai-semantic.js':        '__seAISemantic',
    'a11y-tree.js':          '__seA11y',
    'responsive-extract.js': '__seResponsive',
    'stylekit-adapter.js':   '__seStyleKit',
    'theme-detect.js':       '__seTheme',
    'motion-tools.js':       '__seMotion',
    'motion-enhanced.js':    '__seMotionEnhanced',
    'motion-assoc.js':       '__seMotionAssoc',
    'screenshot-helper.js':  '__seScreenshot',
    'library-detect.js':     '__seLibs',
    'code-generator.js':     '__seCodeGen',
    'replica-blueprint.js':  '__seBlueprint',
    'format-converter.js':   '__seFormat',
    'pattern-detect.js':     '__sePatternDetect',
    'export-schema.js':      '__seExport',
    'incremental.js':        '__seIncremental',
    'multi-page.js':         '__seMultiPage',
    'registry.js':           '__seRegistry'
  };

  // Allow override — set window.__seScriptBase before running
  const BASE_URL = window.__seScriptBase || '../scripts/';

  const results = {
    loaded: [],
    failed: [],
    skipped: [],
    globals: {}
  };

  console.log(`[style-extractor] Loading ${SCRIPTS.length} scripts from ${BASE_URL}`);

  for (const script of SCRIPTS) {
    const globalName = GLOBAL_MAP[script];

    try {
      // Skip if already loaded
      if (globalName && window[globalName]?.installed) {
        results.skipped.push(script);
        results.globals[globalName] = true;
        continue;
      }

      const url = BASE_URL + script + '?t=' + Date.now();
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
      }
      const code = await response.text();
      eval(code);

      if (globalName && window[globalName]?.installed) {
        results.loaded.push(script);
        results.globals[globalName] = true;
      } else {
        // Some scripts may not set .installed — still count as loaded
        results.loaded.push(script);
        if (globalName) results.globals[globalName] = !!window[globalName];
      }
    } catch (e) {
      results.failed.push({ script, error: e.message });
      console.error(`[style-extractor] Failed to load ${script}:`, e.message);
    }
  }

  // Verification summary
  const total = SCRIPTS.length;
  const ok = results.loaded.length + results.skipped.length;
  const status = results.failed.length === 0 ? 'ALL LOADED' : 'PARTIAL';

  console.log(`\n[style-extractor] ${status}: ${ok}/${total} scripts ready`);
  if (results.skipped.length) {
    console.log(`  Skipped (already loaded): ${results.skipped.length}`);
  }
  if (results.failed.length) {
    console.warn(`  Failed: ${results.failed.map(f => f.script).join(', ')}`);
  }

  // Quick health check
  const critical = ['__seUtils', '__seStructure', '__seComponents', '__seStyleKit', '__seRegistry'];
  const missing = critical.filter(g => !window[g]?.installed);
  if (missing.length) {
    console.error(`[style-extractor] CRITICAL modules missing: ${missing.join(', ')}`);
  } else {
    console.log('[style-extractor] All critical modules verified.');
    if (window.extractStyle) {
      console.log('[style-extractor] Ready! Use: await extractStyle({ preset: "full" })');
    }
  }

  return results;
})();
