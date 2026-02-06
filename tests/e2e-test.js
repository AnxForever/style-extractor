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
