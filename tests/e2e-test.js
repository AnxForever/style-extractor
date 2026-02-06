// Style Extractor v3.0 - End-to-End Test Script
//
// 用法：在浏览器控制台中运行，或通过 Chrome DevTools MCP 的 evaluate_script 执行
//
// 测试流程：
// 1. 加载所有脚本
// 2. 运行结构提取
// 3. 运行代码生成
// 4. 运行标准导出
// 5. 验证输出

(async () => {
  const results = {
    timestamp: new Date().toISOString(),
    url: location.href,
    title: document.title,
    tests: [],
    summary: { passed: 0, failed: 0 }
  };

  function test(name, fn) {
    try {
      const result = fn();
      const passed = result.success !== false;
      results.tests.push({
        name,
        passed,
        result: result.success !== false ? result : null,
        error: result.success === false ? result.error : null
      });
      if (passed) results.summary.passed++;
      else results.summary.failed++;
      console.log(`${passed ? '[PASS]' : '[FAIL]'} ${name}`);
      return result;
    } catch (e) {
      results.tests.push({ name, passed: false, error: e.message });
      results.summary.failed++;
      console.error(`[FAIL] ${name}:`, e.message);
      return { success: false, error: e.message };
    }
  }

  // ============================================
  // Test 1: 检查脚本是否已加载
  // ============================================

  test('Scripts loaded - __seStructure', () => {
    if (!window.__seStructure?.installed) {
      return { success: false, error: 'structure-extract.js not loaded' };
    }
    return { success: true, api: Object.keys(window.__seStructure) };
  });

  test('Scripts loaded - __seCodeGen', () => {
    if (!window.__seCodeGen?.installed) {
      return { success: false, error: 'code-generator.js not loaded' };
    }
    return { success: true, api: Object.keys(window.__seCodeGen) };
  });

  test('Scripts loaded - __seExport', () => {
    if (!window.__seExport?.installed) {
      return { success: false, error: 'export-schema.js not loaded' };
    }
    return { success: true, api: Object.keys(window.__seExport) };
  });

  test('Scripts loaded - __seBlueprint', () => {
    if (!window.__seBlueprint?.installed) {
      return { success: false, error: 'replica-blueprint.js not loaded' };
    }
    return { success: true, api: Object.keys(window.__seBlueprint) };
  });

  test('Scripts loaded - __sePatternDetect', () => {
    if (!window.__sePatternDetect?.installed) {
      return { success: false, error: 'pattern-detect.js not loaded' };
    }
    return { success: true, api: Object.keys(window.__sePatternDetect) };
  });

  test('Scripts loaded - __seCSS', () => {
    if (!window.__seCSS?.installed) {
      return { success: false, error: 'css-parser.js not loaded' };
    }
    return { success: true, api: Object.keys(window.__seCSS) };
  });

  // ============================================
  // Test 2: 结构提取
  // ============================================

  let structureData = null;

  test('Structure extraction - extractDOM', () => {
    const dom = window.__seStructure.extractDOM({ maxDepth: 5 });
    if (!dom?.tree) {
      return { success: false, error: 'No DOM tree extracted' };
    }
    return {
      success: true,
      nodeCount: countNodes(dom.tree),
      viewport: dom.viewport
    };
  });

  test('Structure extraction - analyzeLayoutPatterns', () => {
    const layout = window.__seStructure.analyzeLayoutPatterns();
    if (!layout?.patterns) {
      return { success: false, error: 'No layout patterns' };
    }
    return {
      success: true,
      summary: layout.summary
    };
  });

  test('Structure extraction - extractBreakpoints', () => {
    const bp = window.__seStructure.extractBreakpoints();
    return {
      success: true,
      count: bp.count,
      named: Object.keys(bp.named || {})
    };
  });

  test('Structure extraction - analyzeSemanticStructure', () => {
    const semantic = window.__seStructure.analyzeSemanticStructure();
    if (!semantic?.structure) {
      return { success: false, error: 'No semantic structure' };
    }
    return {
      success: true,
      summary: semantic.summary
    };
  });

  test('Structure extraction - full extract()', () => {
    structureData = window.__seStructure.extract();
    if (!structureData?.dom || !structureData?.layout) {
      return { success: false, error: 'Incomplete extraction' };
    }
    return {
      success: true,
      summary: structureData.summary
    };
  });

  // ============================================
  // Test 2.5: Replica blueprint
  // ============================================

  test('Replica blueprint - build()', () => {
    if (!window.__seBlueprint?.installed) {
      return { success: false, error: 'replica-blueprint.js not loaded' };
    }
    const componentsData = window.__seComponents?.generateReport?.();
    const blueprint = window.__seBlueprint.build({
      structure: structureData,
      components: componentsData
    });
    if (!blueprint?.tree) {
      return { success: false, error: 'Blueprint tree missing' };
    }
    return {
      success: true,
      summary: blueprint.summary,
      relationships: Object.keys(blueprint.relationships || {}),
      interactionTargets: blueprint.interaction?.targets?.length || 0,
      responsiveVariants: blueprint.responsive?.variants ? Object.keys(blueprint.responsive.variants.layouts || {}).length : 0
    };
  });

  // ============================================
  // Test 2.6: CSS reverse map and font sources
  // ============================================

  test('CSS reverse map - buildReverseMap', () => {
    if (!window.__seCSS?.buildReverseMap) {
      return { success: false, error: 'buildReverseMap not available' };
    }
    const result = window.__seCSS.buildReverseMap();
    if (!result || typeof result !== 'object') {
      return { success: false, error: 'buildReverseMap returned invalid result' };
    }
    return {
      success: true,
      mapSize: result.map ? Object.keys(result.map).length : 0,
      hasCategories: !!result.categories
    };
  });

  test('CSS reverse map - lookupVariable', () => {
    if (!window.__seCSS?.lookupVariable) {
      return { success: false, error: 'lookupVariable not available' };
    }
    // lookupVariable should return null or an object for any value
    const result = window.__seCSS.lookupVariable('nonexistent-value-xyz');
    return {
      success: true,
      returnsNullForUnknown: result === null || result === undefined,
      type: typeof result
    };
  });

  test('CSS font sources - extractFontSources', () => {
    if (!window.__seCSS?.extractFontSources) {
      return { success: false, error: 'extractFontSources not available' };
    }
    const result = window.__seCSS.extractFontSources();
    if (!result || typeof result !== 'object') {
      return { success: false, error: 'extractFontSources returned invalid result' };
    }
    return {
      success: true,
      hasGoogleFonts: 'google' in result || 'googleFonts' in result,
      hasTypekit: 'typekit' in result || 'adobeFonts' in result,
      hasFamilies: Array.isArray(result.families) || Array.isArray(result.allFamilies)
    };
  });

  // ============================================
  // Test 2.7: Pattern detection
  // ============================================

  test('Pattern detection - detectPatterns', () => {
    if (!window.__sePatternDetect?.detectPatterns) {
      return { success: false, error: 'detectPatterns not available' };
    }
    const patterns = window.__sePatternDetect.detectPatterns();
    if (!Array.isArray(patterns)) {
      return { success: false, error: 'detectPatterns did not return array' };
    }
    return {
      success: true,
      patternCount: patterns.length,
      sample: patterns.length > 0 ? {
        fingerprint: patterns[0].fingerprint,
        count: patterns[0].count,
        selector: patterns[0].selector
      } : null
    };
  });

  test('Pattern detection - fingerprint', () => {
    if (!window.__sePatternDetect?.fingerprint) {
      return { success: false, error: 'fingerprint not available' };
    }
    const el = document.body.firstElementChild;
    if (!el) {
      return { success: true, skipped: true, reason: 'No child elements in body' };
    }
    const fp = window.__sePatternDetect.fingerprint(el);
    return {
      success: typeof fp === 'string',
      fingerprint: fp,
      type: typeof fp
    };
  });

  test('Pattern detection - generatePatternGuide', () => {
    if (!window.__sePatternDetect?.generatePatternGuide) {
      return { success: false, error: 'generatePatternGuide not available' };
    }
    const guide = window.__sePatternDetect.generatePatternGuide();
    return {
      success: typeof guide === 'string' || typeof guide === 'object',
      type: typeof guide,
      length: typeof guide === 'string' ? guide.length : JSON.stringify(guide).length
    };
  });

  // ============================================
  // Test 2.8: Blueprint new fields (patterns, pseudo-elements, varRefs)
  // ============================================

  test('Blueprint new fields - patterns and responsiveHints', () => {
    if (!window.__seBlueprint?.installed) {
      return { success: false, error: 'replica-blueprint.js not loaded' };
    }
    const componentsData = window.__seComponents?.generateReport?.();
    const blueprint = window.__seBlueprint.build({
      structure: structureData,
      components: componentsData
    });
    return {
      success: true,
      hasPatterns: Array.isArray(blueprint.patterns),
      patternCount: Array.isArray(blueprint.patterns) ? blueprint.patterns.length : 0,
      hasResponsiveHints: blueprint.responsiveHints !== undefined,
      summaryHasPatternCount: blueprint.summary?.patternCount !== undefined
    };
  });

  test('Blueprint new fields - toLLMPrompt includes patterns', () => {
    if (!window.__seBlueprint?.toLLMPrompt) {
      return { success: false, error: 'toLLMPrompt not available' };
    }
    const componentsData = window.__seComponents?.generateReport?.();
    const blueprint = window.__seBlueprint.build({
      structure: structureData,
      components: componentsData
    });
    const prompt = window.__seBlueprint.toLLMPrompt(blueprint);
    if (!prompt || typeof prompt !== 'string') {
      return { success: false, error: 'toLLMPrompt returned non-string' };
    }
    return {
      success: true,
      length: prompt.length,
      includesPatterns: prompt.includes('patterns'),
      includesVarRefs: prompt.includes('varRefs'),
      includesPseudo: prompt.includes('pseudoElements')
    };
  });

  // ============================================
  // Test 3: 代码生成
  // ============================================

  let codeData = null;

  test('Code generation - toHTMLSkeleton', () => {
    const html = window.__seCodeGen.toHTMLSkeleton(structureData);
    if (!html || html.includes('No structure data')) {
      return { success: false, error: 'Failed to generate HTML' };
    }
    return {
      success: true,
      length: html.length,
      hasDoctype: html.includes('<!DOCTYPE html>')
    };
  });

  test('Code generation - toReactComponents', () => {
    const react = window.__seCodeGen.toReactComponents(structureData);
    if (react.error) {
      return { success: false, error: react.error };
    }
    return {
      success: true,
      fileCount: Object.keys(react.files || {}).length,
      components: react.components
    };
  });

  test('Code generation - toVueComponents', () => {
    const vue = window.__seCodeGen.toVueComponents(structureData);
    if (vue.error) {
      return { success: false, error: vue.error };
    }
    return {
      success: true,
      fileCount: Object.keys(vue.files || {}).length,
      components: vue.components
    };
  });

  test('Code generation - generate(all)', () => {
    codeData = window.__seCodeGen.generate(structureData, 'all');
    if (!codeData?.html || !codeData?.react || !codeData?.vue) {
      return { success: false, error: 'Missing format output' };
    }
    return {
      success: true,
      formats: Object.keys(codeData)
    };
  });

  // ============================================
  // Test 4: 标准导出
  // ============================================

  let exportData = null;

  test('Export - toStyleCollectionFormat', () => {
    const data = {
      meta: { url: location.href, title: document.title },
      structure: structureData,
      code: codeData
    };
    const schema = window.__seExport.toStyleCollectionFormat(data);
    if (!schema?.$schema || !schema?.meta?.id) {
      return { success: false, error: 'Invalid schema' };
    }
    return {
      success: true,
      id: schema.meta.id,
      tags: schema.meta.tags
    };
  });

  test('Export - validateSchema', () => {
    const data = {
      meta: { url: location.href, title: document.title },
      structure: structureData,
      code: codeData
    };
    const schema = window.__seExport.toStyleCollectionFormat(data);
    const validation = window.__seExport.validateSchema(schema);
    return {
      success: validation.valid || validation.errors.length === 0,
      score: validation.score,
      errors: validation.errors,
      warnings: validation.warnings
    };
  });

  test('Export - full export()', () => {
    exportData = window.__seExport.export();
    if (!exportData?.schema || !exportData?.validation) {
      return { success: false, error: 'Export failed' };
    }
    return {
      success: true,
      score: exportData.validation.score,
      valid: exportData.validation.valid,
      hasBlueprint: !!exportData.schema.blueprint
    };
  });

  // ============================================
  // Helper Functions
  // ============================================

  function countNodes(node) {
    if (!node) return 0;
    let count = 1;
    if (node.children) {
      for (const child of node.children) {
        count += countNodes(child);
      }
    }
    return count;
  }

  // ============================================
  // Summary
  // ============================================

  console.log('\n========================================');
  console.log(`E2E Test Results: ${results.summary.passed}/${results.tests.length} passed`);
  console.log('========================================\n');

  return results;
})();
