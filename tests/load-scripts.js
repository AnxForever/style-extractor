// Style Extractor v3.0 - Script Loader
//
// 用法：在浏览器控制台中运行，加载所有 style-extractor 脚本
//
// 方式 1: 直接在控制台粘贴运行
// 方式 2: 通过 Chrome DevTools MCP 的 evaluate_script 执行

(async () => {
  const SCRIPTS = [
    'motion-tools.js',
    'library-detect.js',
    'component-detect.js',
    'format-converter.js',
    'stylekit-adapter.js',
    'structure-extract.js',
    'replica-blueprint.js',
    'code-generator.js',
    'export-schema.js'
  ];

  const BASE_URL = 'https://raw.githubusercontent.com/AnxForever/style-extractor/main/scripts/';

  const results = {
    loaded: [],
    failed: [],
    globals: {}
  };

  for (const script of SCRIPTS) {
    try {
      // 如果已加载则跳过
      const globalName = getGlobalName(script);
      if (window[globalName]?.installed) {
        results.loaded.push({ script, status: 'already loaded' });
        results.globals[globalName] = true;
        continue;
      }

      // 尝试从 GitHub 加载
      const response = await fetch(BASE_URL + script);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const code = await response.text();
      eval(code);

      if (window[globalName]?.installed) {
        results.loaded.push({ script, status: 'loaded' });
        results.globals[globalName] = true;
      } else {
        results.failed.push({ script, error: 'Script did not install global' });
      }
    } catch (e) {
      results.failed.push({ script, error: e.message });
    }
  }

  function getGlobalName(script) {
    const map = {
      'motion-tools.js': '__seMotion',
      'library-detect.js': '__seLibs',
      'component-detect.js': '__seComponents',
      'format-converter.js': '__seFormat',
      'stylekit-adapter.js': '__seStyleKit',
      'structure-extract.js': '__seStructure',
      'replica-blueprint.js': '__seBlueprint',
      'code-generator.js': '__seCodeGen',
      'export-schema.js': '__seExport'
    };
    return map[script] || null;
  }

  console.log('Style Extractor v3.0 - Scripts Loaded');
  console.log(`Loaded: ${results.loaded.length}/${SCRIPTS.length}`);
  if (results.failed.length > 0) {
    console.warn('Failed:', results.failed);
  }

  return results;
})();
