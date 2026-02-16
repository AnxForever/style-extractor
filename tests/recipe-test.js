// Recipe Generation Test
// Run in browser console after loading stylekit-adapter.js and component-detect.js
//
// Usage:
// 1. Open target website
// 2. Open Developer Tools (F12)
// 3. Load scripts: component-detect.js, then stylekit-adapter.js
// 4. Paste this script into Console

(() => {
  console.log('=== Recipe Generation Test ===\n');

  const results = { pass: 0, fail: 0, errors: [] };

  function assert(condition, msg) {
    if (condition) {
      results.pass++;
      console.log(`  PASS: ${msg}`);
    } else {
      results.fail++;
      results.errors.push(msg);
      console.error(`  FAIL: ${msg}`);
    }
  }

  // ---------- Test 1: Adapter is installed ----------
  console.log('\n1. Adapter availability');
  assert(window.__seStyleKit?.installed, 'StyleKit adapter is installed');
  assert(typeof window.__seStyleKit.generateRecipes === 'function', 'generateRecipes() method exists');
  assert(typeof window.__seStyleKit.getRecipes === 'function', 'getRecipes() method exists');

  // ---------- Test 2: Full extract includes recipes ----------
  console.log('\n2. Full extract pipeline');
  const result = window.__seStyleKit.extract();
  assert(result.files !== undefined, 'extract() returns files');
  assert('style-recipes.ts' in result.files, 'files include style-recipes.ts');
  assert(result.files['style-recipes.ts'].length > 0, 'recipes file is non-empty');

  // ---------- Test 3: Recipe structure validation ----------
  console.log('\n3. Recipe structure');
  const recipes = window.__seStyleKit.getRecipes();
  const types = Object.keys(recipes);
  console.log(`  Detected component types: ${types.join(', ') || '(none)'}`);

  for (const [type, recipe] of Object.entries(recipes)) {
    assert(recipe.id === type, `${type}: id matches key`);
    assert(recipe.name && recipe.name.length > 0, `${type}: has name`);
    assert(recipe.nameZh && recipe.nameZh.length > 0, `${type}: has nameZh`);
    assert(recipe.description && recipe.description.length > 0, `${type}: has description`);

    // Skeleton
    assert(recipe.skeleton !== undefined, `${type}: has skeleton`);
    assert(typeof recipe.skeleton.element === 'string', `${type}: skeleton has element`);
    assert(Array.isArray(recipe.skeleton.baseClasses), `${type}: skeleton has baseClasses array`);
    assert(recipe.skeleton.baseClasses.length > 0, `${type}: baseClasses is non-empty`);

    // Parameters
    assert(Array.isArray(recipe.parameters), `${type}: has parameters array`);

    // Variants
    assert(typeof recipe.variants === 'object', `${type}: has variants object`);
    for (const [vid, v] of Object.entries(recipe.variants)) {
      assert(v.id === vid, `${type}.${vid}: variant id matches key`);
      assert(Array.isArray(v.classes), `${type}.${vid}: variant has classes array`);
    }

    // Slots
    assert(Array.isArray(recipe.slots), `${type}: has slots array`);
    assert(recipe.slots.length > 0, `${type}: has at least one slot`);

    // States (optional)
    if (recipe.states) {
      for (const [state, classes] of Object.entries(recipe.states)) {
        assert(Array.isArray(classes), `${type}.states.${state}: is an array`);
        if (state !== 'disabled') {
          // hover/focus/active should be prefixed
          for (const cls of classes) {
            assert(cls.startsWith(`${state}:`), `${type}.states.${state}: class "${cls}" is prefixed with ${state}:`);
          }
        }
      }
    }
  }

  // ---------- Test 4: TypeScript output format ----------
  console.log('\n4. TypeScript output');
  const tsOutput = window.__seStyleKit.generateRecipes();
  assert(tsOutput.includes('import { createStyleRecipes }'), 'imports createStyleRecipes');
  assert(tsOutput.includes('createStyleRecipes('), 'calls createStyleRecipes()');

  // ---------- Test 5: AI Prompt generation ----------
  console.log('\n5. AI Prompt generation');
  assert(typeof window.__seStyleKit.generatePrompt === 'function', 'generatePrompt() method exists');
  const prompt = window.__seStyleKit.generatePrompt();
  assert(typeof prompt === 'string', 'generatePrompt() returns string');
  assert(prompt.length > 100, 'prompt is non-trivial length');
  assert(prompt.includes('<role>'), 'prompt contains <role> block');
  assert(prompt.includes('<design-system>'), 'prompt contains <design-system> block');
  assert(prompt.includes('## Design Token System'), 'prompt has Design Token System section');
  assert(prompt.includes('## Component Styling'), 'prompt has Component Styling section');
  assert(prompt.includes('## Anti-Patterns'), 'prompt has Anti-Patterns section');

  // Verify prompt includes from extract() files
  const allFiles = window.__seStyleKit.extract().files;
  assert('design-system-prompt.md' in allFiles, 'extract() files include design-system-prompt.md');
  assert(allFiles['design-system-prompt.md'].length > 0, 'design-system-prompt.md is non-empty');

  // ---------- Test 6: Confidence report ----------
  console.log('\n6. Confidence report');
  assert(typeof window.__seStyleKit.getConfidenceReport === 'function', 'getConfidenceReport() method exists');
  const confidence = window.__seStyleKit.getConfidenceReport();
  assert(typeof confidence === 'object', 'getConfidenceReport() returns object');
  assert(['high', 'medium', 'low'].includes(confidence.overall), 'overall is high/medium/low');
  assert(typeof confidence.components === 'object', 'has components object');
  assert(typeof confidence.colors === 'object', 'has colors object');

  // Validate component confidence entries
  for (const [type, info] of Object.entries(confidence.components)) {
    assert(typeof info.count === 'number', `confidence.components.${type}: has count`);
    assert(['high', 'medium', 'low'].includes(info.confidence), `confidence.components.${type}: valid confidence level`);
    assert(typeof info.hasStates === 'boolean', `confidence.components.${type}: has hasStates boolean`);
  }

  // Validate color confidence entries
  for (const [key, level] of Object.entries(confidence.colors)) {
    assert(['high', 'medium', 'low'].includes(level), `confidence.colors.${key}: valid level`);
  }

  // ---------- Test 7: Recipe confidence annotation ----------
  console.log('\n7. Recipe confidence annotation');
  for (const [type, recipe] of Object.entries(recipes)) {
    assert(
      ['high', 'medium', 'low'].includes(recipe._confidence),
      `${type}: has _confidence field (${recipe._confidence})`
    );
    assert(
      recipe.description.includes('confidence:'),
      `${type}: description includes confidence label`
    );
  }

  // ---------- Summary ----------
  console.log(`\n=== Results: ${results.pass} passed, ${results.fail} failed ===`);
  if (results.errors.length) {
    console.error('Failed tests:', results.errors);
  }
  return results;
})();
