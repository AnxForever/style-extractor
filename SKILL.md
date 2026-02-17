---
name: style-extractor
description: Extract design tokens (colors, typography, spacing, components) from live websites. Outputs Tailwind classes, CSS variables, JSON tokens, and AI-ready design system prompts.
---

# Style Extractor (Design Token Extraction from Live Websites)

This skill extracts a reusable **design token set** from live web UIs: colors, typography, spacing, component patterns, states, and motion evidence. Outputs are practical and AI-ready -- Tailwind classes, CSS variables, JSON tokens, TypeScript definitions, and structured prompts for consistent UI generation.

**Core capabilities:**
- Color palette extraction with CIE2000 perceptual matching to Tailwind
- Typography scale, font families, weights, line heights
- Spacing/gap frequency analysis
- Component detection (button, card, input, nav) with state diffs
- Motion evidence (transitions, easings, keyframes)
- AI-ready design system prompt generation
- Confidence scoring for all extracted data

**Additional modules (experimental):**
- Website structure extraction (DOM tree, layout patterns, breakpoints)
- Skeleton code generation (HTML, React TSX, Vue SFC) -- best-effort output
- Standard export schema for design system sharing

## Output location (REQUIRED)

- Save all generated deliverables under: `%USERPROFILE%\style-extractor\`
- Never write generated outputs under the skill folder (`.codex/skills/...`)

Recommended structure:
```
%USERPROFILE%\style-extractor\<project>-<style>\
├── style.md                    # Main style guide
├── tokens.json                 # JSON tokens
├── tailwind.config.js          # Tailwind config
├── style-tokens.ts             # StyleKit tokens (createStyleTokens)
├── style-recipes.ts            # Component recipes (createStyleRecipes)
├── design-system-prompt.md     # AI-ready design system prompt
├── stylekit.ts                 # StyleKit import file
├── variables.css               # CSS variables
│
├── structure/                  # Structure data (experimental)
│   ├── dom-tree.json
│   ├── layout-patterns.json
│   ├── breakpoints.json
│   └── semantic.json
│
├── export.json                 # Standard export
│
└── evidence/                   # Raw evidence
    ├── screenshots/
    ├── css/
    └── motion/
```

## References (quality bar)

- `references/endfield-design-system-style.md` — best-practice **style + motion** reference
- `references/motherduck-design-system-style.md` — strong **static style** reference

---

## Quick Start

### Injecting Into HTTPS Sites (Local Tunnel)

When the target site is `https://...` you cannot `fetch()` scripts from plain `http://localhost` due to mixed-content restrictions. This repo includes a local CORS static server + Cloudflare quick tunnel helper:

1. Start tunnel (prints an `https://*.trycloudflare.com` base URL):
   - `powershell -ExecutionPolicy Bypass -File tools/start-tunnel.ps1`
2. Inject scripts into the target page via MCP `evaluate_script` (use your printed base URL):

```javascript
await evaluate_script({ function: `async () => {
  const base = "https://YOUR-TUNNEL.trycloudflare.com";
  const files = [
    "utils.js",
    "structure-extract.js",
    "css-parser.js",
    "component-detect.js",
    "state-capture.js",
    "ai-semantic.js",
    "a11y-tree.js",
    "responsive-extract.js",
    "stylekit-adapter.js",
    "theme-detect.js",
    "motion-tools.js",
    "motion-enhanced.js",
    "motion-assoc.js",
    "screenshot-helper.js",
    "library-detect.js",
    "code-generator.js",
    "replica-blueprint.js",
    "pattern-detect.js",
    "format-converter.js",
    "export-schema.js",
    "incremental.js",
    "multi-page.js",
    "registry.js"
  ];

  // Reset installed globals so re-injection works.
  const globals = [
    "__seUtils","__seStructure","__seCSS","__seComponents","__seStateCapture","__seAISemantic","__seA11y",
    "__seResponsive","__seStyleKit","__seTheme","__seMotion","__seMotionEnhanced","__seMotionAssoc","__seScreenshot",
    "__seLibs","__seCodeGen","__seBlueprint","__sePatternDetect","__seFormat","__seExport","__seIncremental","__seMultiPage","__seRegistry"
  ];
  for (const g of globals) window[g] = null;
  window.extractStyle = null;

  for (const f of files) {
    const url = base + "/scripts/" + f + "?t=" + Date.now();
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("Fetch failed: " + url + " HTTP " + res.status);
    const code = await res.text();
    (0, eval)(code + "\\n//# sourceURL=" + url);
  }

  return { ok: typeof window.extractStyle === "function" };
}` });
```

3. Stop tunnel:
   - `powershell -ExecutionPolicy Bypass -File tools/stop-tunnel.ps1`

### Run The Replica Interaction Batch (Automated)

If you want to execute `blueprint.interaction.workflowsForTopTargets.batch.serialized.steps` end-to-end (open page -> inject -> extract -> run batch), use the included MCP runner:

```bash
node tools/run-replica-workflow.cjs --url "https://www.stylekit.top/" --baseUrl "https://YOUR-TUNNEL.trycloudflare.com"
```

It will auto-resolve `<element_uid>` for hover/click steps using the latest a11y snapshot (best-effort).

To also emit a runnable replica scaffold (CSS + React + HTML) and a condensed LLM prompt:

```bash
node tools/run-replica-workflow.cjs --url "https://www.stylekit.top/" --baseUrl "https://YOUR-TUNNEL.trycloudflare.com" --outDir ".tmp/replica-out"
```

Local demo (no tunnel, runs against `tests/e2e-test.html`):

```bash
node tools/run-local-demo.cjs --browserUrl "http://127.0.0.1:9222" --outDir ".tmp/replica-out"
```

If your Chrome DevTools endpoint is not the default `http://127.0.0.1:9222`, override it:

```bash
node tools/run-replica-workflow.cjs --browserUrl "http://127.0.0.1:9222" --url "https://www.stylekit.top/" --baseUrl "https://YOUR-TUNNEL.trycloudflare.com"
```

### Simplest Usage (v3.0 Unified Entry Point)

```javascript
// Load all scripts, then use the unified entry point:
const result = await evaluate_script({ function: `
  window.extractStyle({
    preset: 'full',           // 'minimal', 'style', 'components', 'motion', 'ai-semantic', 'replica', 'full'
    includeCode: true,        // Generate React/Vue components
    includeTheme: true,       // Extract both light/dark themes
    includeAISemantic: true,  // Generate AI-friendly semantic output
    includeRecipes: true,     // Generate StyleKit component recipes (NEW)
    includePrompt: true,      // Generate AI System Prompt (NEW)
    includeConfidence: true,  // Include confidence scoring (NEW)
    format: 'tailwind'        // 'raw', 'json', 'tailwind', 'stylekit', 'css'
  })
` });
// Returns: { meta, data, formatted, errors, warnings }
// data.aiSemantic contains AI-friendly output when includeAISemantic: true
// data.recipes / data.recipesFile when includeRecipes: true
// data.designSystemPrompt when includePrompt: true
// data.confidenceReport when includeConfidence: true
```

### AI-Optimized Extraction (NEW in v3.1)

For AI agents that need to understand and replicate UI:

```javascript
// Extract with full AI semantic analysis
const result = await evaluate_script({ function: `
  window.extractStyle({
    preset: 'ai-semantic',    // Optimized for AI understanding
    includeAISemantic: true
  })
` });

// Or use AI semantic module directly
const aiOutput = await evaluate_script({ function: `
  const components = window.__seComponents?.generateReport();
  return window.__seAISemantic.generate({
    components: components?.components || {}
  });
` });
```

### Replica-First Extraction (NEW)

For website replication workflows, use `replica` preset to bundle structure + component + state + responsive evidence:

```javascript
const result = await evaluate_script({ function: `
  window.extractStyle({
    preset: 'replica',
    format: 'json'
  })
` });
// result.data.replica.workflows.viewport => MCP viewport workflow
// result.data.replica.workflows.state => MCP state capture workflow
// result.data.blueprint => hierarchy + layout constraints + state summaries
```

### Blueprint Field Map (Replica IR)

Use this map to convert extracted data into an AI-reconstructable UI blueprint:
- `blueprint.tree`: Use as the authoritative hierarchy tree. Each node carries `layout`, `constraints`, `typography`, `visual`, `component`, `state`, and accessibility/semantic tags when available (`accessibleRole`, `accessibleName`, `semanticRole`).
- `blueprint.sections`: Use as high-level page slices (hero, nav, footer, etc.) with component membership.
- `blueprint.components`: Use as the component inventory; map `byType` to build reusable components.
- `blueprint.outline`: Use as heading hierarchy for content structure.
- `blueprint.layout`: Use as global layout patterns (top flex/grid containers) to guide scaffolding.
- `blueprint.relationships`: Use to infer ordering, alignment groups, flex/grid containers, and overlays for layout reconstruction.
- `blueprint.interaction`: Use for MCP-driven state workflows, state matrices, and interactive target list. Targets may include `source`, `availableStates`, `component` / `section`, `tag`, `priority`, and a11y hints like `accessibleRole` / `accessibleName` (useful for finding element UIDs in MCP snapshots). When present, `interaction.groups` aggregates targets by component, section, component type, and role. `interaction.recommendations` provides a ranked list of high-value targets to replicate first, plus an `actions` checklist (hover/focus/click, screenshots, and diff scripts). `interaction.workflowsForTopTargets` is a ready-to-run batch workflow for the top recommendations; `interaction.workflowsForTopTargets.batch.steps` provides a linear list of MCP calls and scripts that can be executed sequentially, and `batch.runner.script` provides a pseudo-runner for agents that can call MCP tools. `batch.serialized.steps` provides a tool-call list ready for sequential execution.
- `blueprint.responsive`: Use as breakpoint definitions + MCP viewport workflow for variants. If `variants` exists, use it to compare stored viewport layouts.
- `blueprint.responsiveHints`: Condensed layout/visibility changes between breakpoints (derived from responsive comparisons). Use to understand how sections reflow at different viewports without inspecting full variant data.
- `blueprint.patterns`: Repeating sibling patterns detected via structural fingerprinting. Each entry has `selector`, `fingerprint`, `count`, and `template`. Use to identify list/grid items (cards, nav links, etc.) that share the same DOM skeleton and should be rendered with a loop.
- `blueprint.tokens`: Use as semantic tokens for colors, typography, spacing, radii, shadows, motion.
- `blueprint.page`: Use as page-level semantic classification.
- `blueprint.intent`: Use as intent summary to prioritize key UI elements.
- **Node-level fields (inside `blueprint.tree` nodes)**:
  - `node.varRefs`: CSS variable annotations mapping visual/typography/spacing keys to their `var(--name)` equivalents. Use to output `var(--color-primary)` instead of hardcoded `#2563eb`.
  - `node.pseudoElements`: Default-state `::before` / `::after` computed styles (content, colors, size, position, border, transform, etc.). Use to reconstruct decorative pseudo-elements.
- `window.__seBlueprint.toLLMPrompt(blueprint)`: Generates a condensed Markdown+JSON prompt (bounded by `maxChars`) you can paste directly into an LLM to rebuild the UI with higher fidelity. Includes patterns, responsiveHints, and hints about varRefs/pseudoElements.

### MCP-Driven State Capture (NEW in v3.1)

For accurate hover/focus/active state extraction using Chrome DevTools MCP:

```javascript
// 1. Generate MCP workflow for an element
const workflow = await evaluate_script({ function: `
  window.__seStateCapture.generateMCPCommands('button.primary')
` });

// 2. Execute MCP commands (hover, click) as instructed in workflow
// 3. Capture state after each interaction
const hoverState = await evaluate_script({ function: `
  window.__seStateCapture.captureCurrentState('button.primary')
` });

// 4. Compare states to get changes
const diff = await evaluate_script({ function: `
  window.__seStateCapture.diffStates(defaultState, hoverState)
` });
```

Tip: If MCP states are stored via `window.__seStateCapture.storeState`, they are merged into `state-capture.summaries` and exposed under `state-capture.captured` after re-running `extractStyle`.

### Manual Extraction (Advanced)

```javascript
// 1. Load all tools (order: utils first, registry last)
const scripts = [
  'utils.js',              // FIRST - shared utilities
  'motion-tools.js', 'library-detect.js', 'component-detect.js',
  'state-capture.js',      // P0 - MCP state capture
  'ai-semantic.js',        // P0 - AI semantic output
  'a11y-tree.js',          // P1 - Accessibility tree
  'replica-blueprint.js',  // P1 - Replica blueprint IR
  'pattern-detect.js',     // P1 - Repeating pattern detection
  'motion-enhanced.js',    // P2 - Enhanced motion
  'responsive-extract.js', // P2 - Responsive layouts
  'format-converter.js', 'stylekit-adapter.js', 'structure-extract.js',
  'code-generator.js', 'export-schema.js', 'css-parser.js',
  'screenshot-helper.js', 'multi-page.js', 'theme-detect.js',
  'motion-assoc.js', 'incremental.js',
  'registry.js'            // LAST - unified entry point
];
// Scripts are loaded via separate evaluate_script calls

// 2. Run full extraction with structure + code generation
const result = await evaluate_script({ function: `
  (() => {
    const motion = window.__seMotion?.capture('full') || {};
    const libs = window.__seLibs || {};
    const components = window.__seComponents?.generateReport() || {};
    const stylekit = window.__seStyleKit?.extract() || {};
    const structure = window.__seStructure?.extract() || {};
    const code = window.__seCodeGen?.generate(structure, 'all') || {};
    const exportData = window.__seExport?.export() || {};

    return {
      motion,
      libraries: libs,
      components,
      stylekit,
      structure,
      code,
      exportData,
      url: location.href,
      title: document.title
    };
  })()
` });
```

---

## Workflow

### Phase 0 — Inputs

1) Project name + style/variant name
2) Sources: URL / web repo / both
3) Motion importance: if meaningful motion exists, Strategy A2/A3 is required
4) **Output format preference**: Markdown only / JSON / Tailwind / StyleKit / All

### Phase 1 — Evidence gathering (do this first)

#### Strategy A — Live website (Chrome MCP)

Use:
- `new_page` / `select_page` / `navigate_page`
- `take_screenshot` (fullPage when helpful)
- `evaluate_script`
- `list_network_requests` / `get_network_request` (pull CSS/JS bodies when possible)
- `performance_start_trace` / `performance_stop_trace` (optional for complex motion)

#### Strategy A1.5 — Screenshot-assisted evidence (HIGHLY RECOMMENDED)

Screenshots don't replace computed styles, but they improve:
- semantic intent (primary vs secondary vs disabled)
- gated/hard-to-freeze states (login, region locks, scroll-only reveals)
- visual-only details (textures, subtle gradients, composition)

Minimum screenshot set:
1) baseline (full page/section)
2) navigation visible + active state
3) primary CTA: default + hover + pressed (if possible)
4) form controls: default + focus-visible (+ invalid if present)
5) modal/dialog open (if any)
6) motion sequence (2–4 shots): ~0ms / ~120ms / ~300–600ms after trigger

#### Strategy A2 — Runtime motion evidence (REQUIRED for dynamic sites)

Computed styles alone won't reconstruct timing quality. Capture runtime motion via:
- `document.getAnimations({ subtree: true })`
- per animation: `duration/delay/fill/iterations/easing` + moved properties (`opacity/transform/color/...`)
- when possible: full keyframes via `animation.effect.getKeyframes()`

**Use `scripts/motion-tools.js`:**

```javascript
// Load motion tools
evaluate_script({ function: `${motionToolsSource}` });

// Capture animations
evaluate_script({ function: `window.__seMotion.capture('initial')` });

// Sample JS-driven motion
evaluate_script({ function: `window.__seMotion.sample('.carousel', { durationMs: 800 })` });
```

Minimum capture loop:
1) baseline snapshot
2) trigger interaction (click/scroll/hover/focus)
3) snapshots at `t0`, `t80–120ms`, `t300–600ms`

#### Strategy A3 — JS-driven motion / third-party libs (IMPORTANT)

If motion is JS-driven (e.g., Swiper/carousels), `document.getAnimations()` may miss the main movement.

**Use `scripts/library-detect.js`:**

```javascript
evaluate_script({ function: `${libraryDetectSource}` });
// Returns: { globals: {Swiper, gsap, ...}, dom: {...}, fingerprints: {...} }
```

Fallback evidence:
- per-frame sampling (rAF loop ~700–900ms): `transform/opacity/...`
- or a Performance trace

#### Strategy A4 — Component Detection (NEW)

Use component detection for structured component analysis.

**Use `scripts/component-detect.js`:**

```javascript
// Load component detector
evaluate_script({ function: `${componentDetectSource}` });

// Detect all components
evaluate_script({ function: `window.__seComponents.detectAll()` });

// Generate full report with states
evaluate_script({ function: `window.__seComponents.generateReport()` });

// Extract states for specific element
evaluate_script({ function: `window.__seComponents.extractStates('button.primary')` });
```

#### Strategy A5 — Structure Extraction (NEW in v3.0)

Extract the full website structure for replication.

**Use `scripts/structure-extract.js`:**

```javascript
// Load structure extractor
evaluate_script({ function: `${structureExtractSource}` });

// Extract DOM tree
evaluate_script({ function: `window.__seStructure.extractDOM({ maxDepth: 10 })` });

// Analyze layout patterns (grid/flex/float)
evaluate_script({ function: `window.__seStructure.analyzeLayoutPatterns()` });

// Extract responsive breakpoints
evaluate_script({ function: `window.__seStructure.extractBreakpoints()` });

// Analyze semantic structure (ARIA landmarks, headings)
evaluate_script({ function: `window.__seStructure.analyzeSemanticStructure()` });

// Full extraction (all of the above)
evaluate_script({ function: `window.__seStructure.extract()` });
```

### Phase 1.5 — Structure Analysis (NEW)

After gathering evidence, analyze the website structure:

1) **DOM Tree**: Extract hierarchical structure with element metadata
2) **Layout Patterns**: Identify grid/flex/float usage
3) **Breakpoints**: Extract responsive breakpoints from CSS media queries
4) **Semantic Structure**: Map ARIA landmarks and heading hierarchy
5) **Component Boundaries**: Detect logical component boundaries

```javascript
// Full structure extraction
const structure = evaluate_script({
  function: `window.__seStructure.extract()`
});
// Returns: { dom, layout, breakpoints, semantic, componentBoundaries, summary }
```

### Phase 2 — Semantic tokenization (REQUIRED)

Do not stop at raw values. Convert repeated values into **semantic tokens**:
1) cluster repeated values (colors/radii/durations/easings/shadows)
2) map usage (CTA/text/border/overlay/active/etc.)
3) name by intent (e.g., `--color-accent`, `--motion-300`, `nav.switch.iconColor`)
4) keep evidence alongside tokens (raw values + element/selector/screenshot)

### Phase 3 — Multi-format output (NEW)

Generate outputs in requested formats using `scripts/format-converter.js` and `scripts/stylekit-adapter.js`:

#### Available Formats

| Format | File | Use Case |
|--------|------|----------|
| **Markdown** | `*-style.md` | Documentation, AI prompts |
| **JSON** | `*-tokens.json` | Data exchange, tooling |
| **Tailwind** | `*-tailwind.js` | Direct Tailwind integration |
| **CSS Variables** | `*-variables.css` | Native CSS usage |
| **StyleKit** | `*-stylekit.ts` | StyleKit import |

#### Using Format Converter

```javascript
// Load format converter
evaluate_script({ function: `${formatConverterSource}` });

// Convert collected style data
evaluate_script({ function: `
  const styleData = {
    name: 'Project Style',
    url: location.href,
    colors: { primary: '#FFFA00', text: '#191919', ... },
    typography: { families: ['Inter', 'monospace'], scale: { h1: '48px', ... } },
    spacing: { sm: '8px', md: '16px', lg: '24px' },
    animations: {
      durations: { fast: '150ms', normal: '300ms' },
      easings: { standard: 'ease', emphasis: 'cubic-bezier(.36,.07,.19,.97)' },
      keyframes: { shake: {...}, fade: {...} }
    },
    components: { button: {...}, card: {...} }
  };

  return window.__seFormat.convertAll(styleData);
` });
```

#### Using StyleKit Adapter

```javascript
// Load StyleKit adapter
evaluate_script({ function: `${stylekitAdapterSource}` });

// Full extraction pipeline
evaluate_script({ function: `window.__seStyleKit.extract()` });
// Returns: { raw, normalized, files: { 'style-definition.ts', 'variables.css', ... } }
```

### Blueprint Export (NEW)

`export()` now includes a `blueprint` section when available.

```javascript
const exportData = await evaluate_script({ function: `
  window.__seExport.export()
` });

// exportData.schema.blueprint includes:
// - summary
// - sections
// - relationships
// - interaction
// - responsive
```

### Phase 3.5 — Code Generation (NEW in v3.0)

Generate framework code from extracted structure.

**Use `scripts/code-generator.js`:**

```javascript
// Load code generator
evaluate_script({ function: `${codeGeneratorSource}` });

// Generate HTML skeleton
evaluate_script({ function: `window.__seCodeGen.toHTMLSkeleton(structureData)` });

// Generate React components (TypeScript + Tailwind)
evaluate_script({ function: `window.__seCodeGen.toReactComponents(structureData)` });
// Returns: { files: { 'Page.tsx', 'Header.tsx', ... }, componentCount, components }

// Generate Vue components (Composition API)
evaluate_script({ function: `window.__seCodeGen.toVueComponents(structureData)` });

// Generate all formats at once
evaluate_script({ function: `window.__seCodeGen.generate(structureData, 'all')` });
```

**Generated Components:**
| Pattern | React File | Vue File |
|---------|------------|----------|
| `header`, `[role="banner"]` | `Header.tsx` | `Header.vue` |
| `nav`, `[role="navigation"]` | `Navigation.tsx` | `Navigation.vue` |
| `.hero`, `[class*="hero"]` | `Hero.tsx` | `Hero.vue` |
| `main`, `[role="main"]` | `Main.tsx` | `Main.vue` |
| `aside`, `[class*="sidebar"]` | `Sidebar.tsx` | `Sidebar.vue` |
| `footer`, `[role="contentinfo"]` | `Footer.tsx` | `Footer.vue` |
| `.card`, `article` | `Card.tsx` | `Card.vue` |

### Phase 4 — Write the style guide (recommended sections)

Minimum recommended sections:
1) Overview
2) Design philosophy (evidence-based)
3) Semantic tokens (colors + motion)
4) Color palette + usage mapping
5) Typography scale
6) Spacing scale
7) Components (with state matrix)
8) Motion (runtime evidence + full `@keyframes` + delay chains + JS-driven notes)
9) Border Styles
10) Border Radius
11) Opacity & Transparency
12) Z-Index / Layering
13) Responsive behavior (breakpoints + degradation)
14) CSS Variables / Theme Sources
15) Layout Patterns
16) Example Components (Copy-Paste)
17) Evidence Notes (How it was extracted)

Component state matrix must include at least:
- default / hover / active(pressed) / focus-visible / disabled (loading if present)

### Phase 4.5 — Standard Export (NEW in v3.0)

Generate a standardized export file for style collection websites.

**Use `scripts/export-schema.js`:**

```javascript
// Load export schema
evaluate_script({ function: `${exportSchemaSource}` });

// Generate style collection format
evaluate_script({ function: `
  const allData = {
    meta: { url: location.href, title: document.title },
    structure: window.__seStructure?.extract(),
    stylekit: window.__seStyleKit?.extract(),
    components: window.__seComponents?.generateReport(),
    motion: window.__seMotion?.capture('export'),
    code: window.__seCodeGen?.generate(structureData, 'all')
  };
  return window.__seExport.toStyleCollectionFormat(allData);
` });

// Or use the full export pipeline
evaluate_script({ function: `window.__seExport.export()` });
// Returns: { schema, validation, raw }
```

**Export Schema Structure:**
```json
{
  "$schema": "https://stylekit.dev/schema/style-collection-v1.json",
  "version": "1.0.0",
  "meta": { "id", "name", "source", "tags", "thumbnail" },
  "tokens": { "colors", "typography", "spacing", "motion" },
  "structure": { "layout", "landmarks", "breakpoints" },
  "components": { "button", "card", "navigation", ... },
  "code": { "html", "react", "vue" },
  "evidence": { "screenshots", "cssFiles", "extractionLog" }
}
```

---

## Scripts Reference

### `scripts/utils.js` (NEW in v3.0 - LOAD FIRST)

Shared utilities used by all modules. **Must be loaded before other scripts.**

```javascript
window.__seUtils.cssPath(el)           // Generate CSS selector
window.__seUtils.getRect(el)           // Get bounding rect
window.__seUtils.isVisible(el)         // Check visibility
window.__seUtils.getCachedStyle(el)    // Cached getComputedStyle
window.__seUtils.getCachedSelector(el) // Cached CSS selector
window.__seUtils.clearCache()          // Clear all caches
window.__seUtils.success(data)         // Standardized success response
window.__seUtils.error(message)        // Standardized error response
window.__seUtils.createLogger(name)    // Create namespaced logger
```

### `scripts/registry.js` (NEW in v3.0 - LOAD LAST)

Module registry and unified entry point. **Load after all other scripts.**

```javascript
// Unified entry point (recommended)
window.extractStyle({
  preset: 'full',           // 'minimal', 'style', 'components', 'motion', 'ai-semantic', 'replica', 'full'
  includeCode: true,        // Generate React/Vue code
  includeTheme: true,       // Extract both themes
  format: 'tailwind'        // 'raw', 'json', 'tailwind', 'stylekit', 'css'
})

// Registry API
window.__seRegistry.getAllModules()           // List all modules
window.__seRegistry.hasModule('structure')    // Check if module loaded
window.__seRegistry.extractAll()              // Run all modules
window.__seRegistry.quickExtract('style')     // Run preset
window.__seRegistry.capabilities()            // List all capabilities
```

**Presets:**
| Preset | Modules |
|--------|---------|
| `minimal` | structure, css |
| `style` | css, stylekit, theme |
| `components` | structure, components, stylekit |
| `motion` | motion, motion-assoc |
| `ai-semantic` | structure, components, state-capture, ai-semantic |
| `replica` | structure, css, components, a11y, state-capture, responsive, stylekit, blueprint, pattern-detect, theme, motion, motion-enhanced, motion-assoc, screenshot, libs, codegen, export |
| `full` | All modules |

### `scripts/motion-tools.js`

Runtime animation capture and sampling.

```javascript
window.__seMotion.capture(label)      // Capture all animations
window.__seMotion.sample(el, opts)    // Sample computed styles per frame
```

### `scripts/motion-enhanced.js` (NEW in v3.1 - P2)

增强版动画捕获，包含完整关键帧、触发条件和动画链检测。

```javascript
// 完整动画捕获
window.__seMotionEnhanced.captureAll()
// Returns: { animations, keyframesRules, chains, transitions, summary }

// 提取完整关键帧
window.__seMotionEnhanced.extractFullKeyframes(animation)
// Returns: [{ offset, easing, composite, ...properties }]

// 检测动画触发条件
window.__seMotionEnhanced.detectTriggers(element)
// Returns: { onLoad, onHover, onClick, onFocus, onScroll, onIntersection, details }

// 检测动画链/序列
window.__seMotionEnhanced.detectAnimationChains()
// Returns: { chains, hasStagger, hasSequence, totalChains }

// 提取 CSS transitions
window.__seMotionEnhanced.extractTransitions(element)
window.__seMotionEnhanced.findAllTransitions()

// 提取所有 @keyframes 规则
window.__seMotionEnhanced.extractAllKeyframesRules()
// Returns: { keyframes, names, count }

// 生成动画时间线
window.__seMotionEnhanced.generateTimeline()
window.__seMotionEnhanced.visualizeTimeline(width)  // ASCII 可视化

// 生成动画文档（AI 友好）
window.__seMotionEnhanced.generateMotionDoc()
```

**动画捕获输出示例：**
```javascript
{
  animations: {
    count: 5,
    items: [{
      animationName: 'fadeIn',
      playState: 'running',
      target: { selector: '.hero-title', tag: 'h1' },
      timing: { duration: 500, delay: 100, easing: 'ease-out' },
      keyframes: [
        { offset: 0, opacity: '0', transform: 'translateY(20px)' },
        { offset: 1, opacity: '1', transform: 'translateY(0)' }
      ],
      triggers: { onLoad: true, onHover: false },
      summary: { animatedProperties: ['opacity', 'transform'] }
    }]
  },
  keyframesRules: {
    keyframes: [{ name: 'fadeIn', frames: [...], cssText: '@keyframes fadeIn {...}' }]
  },
  chains: {
    chains: [{ type: 'stagger', staggerDelay: 100, count: 5 }],
    hasStagger: true
  },
  transitions: {
    count: 12,
    properties: ['opacity', 'transform', 'background-color']
  }
}
```

**触发条件检测：**
| 触发类型 | 检测方式 |
|----------|----------|
| `onLoad` | 元素基础样式中的 animation |
| `onHover` | :hover 伪类中的 animation/transition |
| `onClick` | :active 伪类中的 animation |
| `onFocus` | :focus 伪类中的 animation |
| `onScroll` | animation-timeline 属性 |
| `onIntersection` | data-aos, .animate 等类名/属性 |

### `scripts/library-detect.js`

Detect third-party animation libraries.

```javascript
// Returns: { globals, dom, fingerprints, assets }
```

### `scripts/state-capture.js` (NEW in v3.1 - P0)

MCP-driven pseudo-class state capture for accurate hover/focus/active styles.

```javascript
// Generate MCP workflow for capturing element states
window.__seStateCapture.generateMCPCommands(selector)
// Returns: { element, isInteractive, isFocusable, workflow, mcpTools }

// Capture current computed styles (call after MCP triggers state)
window.__seStateCapture.captureCurrentState(selector)
// Returns: { ok, selector, timestamp, styles, rect }

// Calculate difference between two states
window.__seStateCapture.diffStates(before, after)
// Returns: { ok, hasChanges, changeCount, changes }

// CSS-based fallback (when MCP not available)
window.__seStateCapture.extractAllStatesFallback(selector)
// Returns: { ok, selector, method, states, stateCount }

// Generate human-readable state summary
window.__seStateCapture.generateStateSummary(stateData)

// Batch capture for multiple elements
window.__seStateCapture.batchCapture(selectors)
```

**MCP Workflow Example:**
```javascript
// 1. Generate MCP commands
const commands = window.__seStateCapture.generateMCPCommands('button.primary');

// 2. Execute MCP workflow:
//    - take_snapshot to get element UID
//    - hover with mcp__chrome_devtools__hover
//    - captureCurrentState after each interaction
//    - click with mcp__chrome_devtools__click for focus

// 3. Compare states
const diff = window.__seStateCapture.diffStates(defaultState, hoverState);
```

### `scripts/ai-semantic.js` (NEW in v3.1 - P0)

AI-friendly semantic output for better understanding and code generation.

```javascript
// Main entry point - generate full AI semantic output
window.__seAISemantic.generate(extractedData)
// Returns: { page, components, designSystem, meta, summary }

// Page-level analysis
window.__seAISemantic.analyzePage()
// Returns: { type, sections, primaryAction, colorScheme, layout, intent }

// Annotate components with semantic information
window.__seAISemantic.annotateComponents(components)
// Returns: [{ id, type, semanticRole, description, visual, context, codeHints }]

// Extract design system tokens
window.__seAISemantic.extractDesignSystem()
// Returns: { colorPalette, typography, spacing, shadows, borderRadius }

// Generate code hints for a component
window.__seAISemantic.generateCodeHints(type, item)
// Returns: { tailwind, css, react }
```

**AI Semantic Output Structure:**
```javascript
{
  page: {
    type: 'landing-page',           // Inferred page type
    sections: ['hero', 'features'], // Detected sections
    primaryAction: 'sign-up',       // Main CTA action
    colorScheme: 'light',           // light/dark
    intent: 'Convert visitors...'   // Page purpose
  },
  components: [{
    id: 'button-get-started',
    type: 'button',
    semanticRole: 'primary-call-to-action',
    description: 'Primary CTA button in hero section',
    visual: {
      size: 'large',
      prominence: 'high',
      position: 'top-center'
    },
    codeHints: {
      tailwind: 'bg-blue-600 text-white px-6 py-3 rounded-lg',
      css: '.button { background-color: #2563eb; ... }',
      react: '<Button variant="primary" />'
    }
  }],
  designSystem: {
    colorPalette: [{ value: '#2563eb', role: 'primary', usage: 'buttons, links' }],
    typography: { families: ['Inter'], scale: { h1: '48px', body: '16px' } },
    spacing: { scale: [4, 8, 16, 24, 32, 48] }
  },
  summary: {
    pageDescription: 'landing-page with 5 sections',
    keyComponents: ['button: Primary CTA in hero'],
    recommendations: ['2 components may have low contrast']
  }
}
```

### `scripts/a11y-tree.js` (NEW in v3.1 - P1)

完整的无障碍树提取，让 AI 理解每个元素的语义角色和关系。

```javascript
// 提取完整的无障碍树
window.__seA11y.extractA11yTree(options)
// Returns: { url, title, tree, extractedAt }

// 获取单个元素的完整无障碍信息
window.__seA11y.getAccessibleInfo(element)
// Returns: { selector, tag, role, roleSource, name, nameSource, states, properties, relations }

// 分析页面地标结构
window.__seA11y.analyzeLandmarks()
// Returns: { landmarks, rootLandmarks, summary }

// 查找所有交互元素
window.__seA11y.findInteractiveElements()
// Returns: { elements, count, byRole, withoutName }

// 检测无障碍问题
window.__seA11y.detectA11yIssues()
// Returns: { issues, summary }

// 获取计算后的 ARIA 角色（包括隐式角色）
window.__seA11y.getComputedRole(element)
// Returns: { role, source, inputType?, context? }

// 获取可访问名称
window.__seA11y.getAccessibleName(element)
// Returns: { name, source, references? }

// 获取 ARIA 状态
window.__seA11y.getAriaStates(element)
// Returns: { expanded?, selected?, disabled?, checked?, ... }

// 获取 ARIA 关系
window.__seA11y.getAriaRelations(element)
// Returns: { controls?, owns?, labelFor?, parentLandmark?, ... }
```

**无障碍信息结构示例：**
```javascript
{
  selector: '#submit-btn',
  tag: 'button',
  role: 'button',
  roleSource: 'implicit',
  name: 'Submit Form',
  nameSource: 'content',
  states: {
    disabled: false,
    expanded: false
  },
  properties: {
    haspopup: 'menu'
  },
  relations: {
    controls: ['dropdown-menu'],
    parentLandmark: {
      role: 'form',
      selector: '#contact-form'
    }
  }
}
```

**检测的无障碍问题：**
- `missing-alt`: 图片缺少 alt 属性
- `missing-label`: 表单控件缺少标签
- `missing-button-name`: 按钮缺少可访问名称
- `missing-link-name`: 链接缺少可访问名称
- `missing-main`: 页面缺少 main 地标
- `multiple-h1`: 页面有多个 h1
- `skipped-heading`: 标题层级跳跃

### `scripts/component-detect.js` (Enhanced in v3.1 - P1)

组件模式检测和状态提取，新增智能识别功能。

```javascript
// 原有功能
window.__seComponents.detectAll()              // 基于模式匹配检测
window.__seComponents.extractStates(selector)  // 获取元素状态
window.__seComponents.generateReport()         // 完整组件报告
window.__seComponents.analyzeHierarchy()       // 布局结构分析

// 新增：增强检测 (P1)
window.__seComponents.detectAllEnhanced()      // 智能增强检测
window.__seComponents.smartDetect(element)     // 单元素智能识别
window.__seComponents.identifyByVisualFeatures(element)  // 视觉特征识别
window.__seComponents.identifyByInteraction(element)     // 交互行为识别
window.__seComponents.identifyByContext(element)         // 上下文识别
window.__seComponents.identifyVariant(element, type)     // 变体识别
```

**智能检测输出示例：**
```javascript
// smartDetect 返回
{
  type: 'button',
  confidence: 0.85,
  reasons: ['visual-button', 'interactive-button', 'context-form'],
  allCandidates: {
    button: { score: 2.5, reasons: [...] },
    link: { score: 0.3, reasons: [...] }
  }
}

// identifyVariant 返回
{
  size: 'md',           // xs, sm, md, lg, xl
  style: 'solid',       // solid, outline, ghost, link
  state: 'default',     // default, disabled, loading, active
  variant: 'primary',   // primary, secondary, danger, success (按钮)
  iconOnly: false       // 是否仅图标
}

// detectAllEnhanced 返回
{
  summary: {
    totalComponents: 45,
    byType: { button: 12, card: 8, ... },
    byConfidence: { high: 30, medium: 10, low: 5 }
  },
  components: {
    button: [{
      selector: '.btn-primary',
      rect: { x, y, width, height },
      text: 'Submit',
      styles: { ... },
      variant: { size: 'md', style: 'solid', variant: 'primary' },
      detection: { type: 'button', confidence: 0.85, reasons: [...] },
      detectionMethod: 'smart'  // 'pattern' 或 'smart'
    }]
  }
}
```

**识别维度：**

| 维度 | 方法 | 识别内容 |
|------|------|----------|
| 视觉特征 | `identifyByVisualFeatures` | 尺寸、圆角、阴影、背景色、cursor |
| 交互行为 | `identifyByInteraction` | click handler、role、tabindex、form control |
| 上下文 | `identifyByContext` | 父元素、兄弟元素、所在区域 |

### `scripts/format-converter.js` (NEW)

Multi-format output converter.

```javascript
window.__seFormat.toJSON(styleData)       // JSON schema
window.__seFormat.toTailwind(styleData)   // Tailwind config
window.__seFormat.toCSSVars(styleData)    // CSS variables
window.__seFormat.toStyleKit(styleData)   // StyleKit tokens
window.__seFormat.toStyleKitTS(styleData) // TypeScript file
window.__seFormat.convertAll(styleData)   // All formats
```

### `scripts/stylekit-adapter.js` (v3.2)

StyleKit integration adapter with recipe generation, AI prompt output, and confidence scoring.

**Core pipeline:**
```javascript
window.__seStyleKit.collect()        // Collect page data
window.__seStyleKit.normalize()      // Normalize to StyleKit format
window.__seStyleKit.generateFiles()  // Generate all output files (6 files)
window.__seStyleKit.extract()        // Full pipeline → { raw, normalized, files }
```

**Recipe generation (NEW):**
```javascript
// Generate createStyleRecipes() TypeScript file
window.__seStyleKit.generateRecipes()  // → string (TS source code)

// Get structured recipe data for inspection
window.__seStyleKit.getRecipes()       // → { button: { id, skeleton, parameters, variants, slots, states }, ... }
```

**AI-ready prompt (NEW):**
```javascript
// Generate design system System Prompt for AI agents
window.__seStyleKit.generatePrompt()   // → string (markdown with <role> + <design-system> blocks)
```

**Confidence report (NEW):**
```javascript
// Get confidence scores across all extraction results
window.__seStyleKit.getConfidenceReport()
// → { overall: 'high'|'medium'|'low', components: { button: { count, confidence, hasStates } }, colors: { ... } }
```

**Output files from `generateFiles()`:**

| File | Format | Purpose |
|------|--------|---------|
| `style-definition.ts` | TypeScript | StyleKit `StyleDefinition` import |
| `style-recipes.ts` | TypeScript | `createStyleRecipes()` component recipes |
| `design-system-prompt.md` | Markdown | AI System Prompt with tokens + component states |
| `variables.css` | CSS | CSS custom properties |
| `tailwind.config.js` | JavaScript | Tailwind theme extension |
| `tokens.json` | JSON | Raw normalized token data |

**Color matching:** Uses CIE2000 Delta-E perceptual distance (not RGB euclidean) for Tailwind color approximation.

**Via unified entry point:**
```javascript
window.extractStyle({
  preset: 'full',
  includeRecipes: true,       // → result.data.recipes + result.data.recipesFile
  includePrompt: true,        // → result.data.designSystemPrompt
  includeConfidence: true,    // → result.data.confidenceReport
})
```

### `scripts/structure-extract.js` (NEW in v3.0)

Website structure extraction for replication.

```javascript
window.__seStructure.extractDOM(options)           // DOM tree extraction
window.__seStructure.analyzeLayoutPatterns()       // Grid/flex/float analysis
window.__seStructure.extractBreakpoints()          // Responsive breakpoints
window.__seStructure.analyzeSemanticStructure()    // ARIA landmarks + headings
window.__seStructure.detectComponentBoundaries()   // Component boundary detection
window.__seStructure.extract()                     // Full extraction
```

### `scripts/replica-blueprint.js` (NEW)

Unified replication blueprint for AI-driven UI reconstruction.

```javascript
// Build blueprint from extracted data
const stateFallback = window.__seStateCapture?.extractAllStatesFallback('button');
const stateSummary = stateFallback?.ok
  ? window.__seStateCapture.generateStateSummary(stateFallback)
  : null;

window.__seBlueprint.build({
  structure: window.__seStructure?.extract(),
  components: window.__seComponents?.generateReport(),
  'state-capture': stateSummary?.ok
    ? { summaries: { [stateSummary.selector]: stateSummary } }
    : {},
  responsive: window.__seResponsive?.extractCurrentLayout(),
  stylekit: window.__seStyleKit?.extract(),
  aiSemantic: window.__seAISemantic?.generate({ components: window.__seComponents?.generateReport()?.components || {} })
});

// Alias
window.__seBlueprint.generate(...)

// Generate condensed LLM prompt
window.__seBlueprint.toLLMPrompt(blueprint, { maxChars: 12000 })
```

**Blueprint Compression (`depth` option):**

When calling `extractStyle()` with `depth`, the blueprint is compressed to reduce payload size:

| Depth | Behavior |
|-------|----------|
| `'full'` (default) | No compression, all nodes and fields preserved |
| `'section'` | Tree pruned to depth 3, full visual/typography retained |
| `'overview'` | Tree pruned to depth 2, visual/typography fields stripped from nodes |

```javascript
window.extractStyle({ preset: 'replica', depth: 'section' })
```

### `scripts/pattern-detect.js` (NEW)

Repeating sibling pattern detection for identifying list/grid items.

```javascript
// Detect repeating patterns in the DOM
window.__sePatternDetect.detectPatterns(options)
// Returns: [{ selector, fingerprint, count, template, containerSelector }]
// Options: { minCount: 3, maxDepth: 4 }

// Get structural fingerprint for a single element
window.__sePatternDetect.fingerprint(element, maxDepth)
// Returns: "div.card>img+div.card-body>h3+p" (structural signature)

// Generate AI-friendly rendering hints from detected patterns
window.__sePatternDetect.generatePatternGuide()
// Returns: markdown/string with template suggestions for each pattern group

// Build a template summary for a pattern group
window.__sePatternDetect.buildTemplateSummary(group)
// Returns: { tag, classes, childStructure, sampleText }

// Check if a class name is a utility class (Tailwind, etc.)
window.__sePatternDetect.isUtilityClass(className)
// Returns: boolean
```

**Pattern Detection Output:**
```javascript
[
  {
    selector: "main > .grid > .card",
    fingerprint: "div.card>img.card-img+div.card-body>h3.card-title+p.card-text",
    count: 6,
    containerSelector: "main > .grid",
    template: {
      tag: "div",
      classes: ["card"],
      childStructure: "img + div > h3 + p",
      sampleText: "Feature 1..."
    }
  }
]
```

**Options for `extractDOM()`:**
```javascript
{
  maxDepth: 10,        // Maximum DOM depth to traverse
  includeText: true,   // Include text content for leaf nodes
  includeStyles: true, // Include computed layout styles
  includeRect: true,   // Include bounding rectangles
  skipTags: ['script', 'style', 'svg'],  // Tags to skip
  minWidth: 10,        // Minimum element width
  minHeight: 10        // Minimum element height
}
```

### `scripts/code-generator.js` (NEW in v3.0)

Framework code generation from structure data.

```javascript
window.__seCodeGen.toHTMLSkeleton(structureData)   // Semantic HTML5
window.__seCodeGen.toReactComponents(structureData) // TypeScript + Tailwind
window.__seCodeGen.toVueComponents(structureData)   // Vue 3 Composition API
window.__seCodeGen.generate(structureData, format)  // Unified generator
window.__seCodeGen.identifyComponentType(node)      // Component type detection

// Replica codegen (blueprint-driven, higher fidelity than structure-only skeletons)
window.__seCodeGen.toReplicaCSS(blueprint, stateCapture, options)   // CSS rules per node + optional hover/focus states
window.__seCodeGen.toReplicaHTML(blueprint, options)                // index.html that references replica.css
window.__seCodeGen.toReplicaReact(blueprint, stateCapture, options) // { files: { Page.tsx, replica.css, index.html } }
```

**Supported formats:** `'html'`, `'react'`, `'vue'`, `'all'`

### `scripts/export-schema.js` (NEW in v3.0)

Standard export format for style collection websites.

```javascript
window.__seExport.toStyleCollectionFormat(data)  // Generate schema
window.__seExport.validateSchema(schema)         // Validate completeness
window.__seExport.export()                       // Full pipeline
window.__seExport.inferTags(data)                // Auto-infer tags
window.__seExport.generateMetadata(data)         // Generate metadata
```

**Validation returns:**
```javascript
{
  valid: true/false,
  errors: [],      // Critical issues
  warnings: [],    // Non-critical issues
  score: 0-100     // Completeness percentage
}
```

### `scripts/screenshot-helper.js` (NEW in v3.0)

Screenshot planning and component marking for evidence capture.

```javascript
window.__seScreenshot.getComponentRects()        // Get all component bounding boxes
window.__seScreenshot.generateScreenshotPlan()   // Generate MCP screenshot commands
window.__seScreenshot.generateMCPCommands(plan)  // Format for chrome-devtools/playwright
window.__seScreenshot.markAllTargets()           // Visual debug markers
window.__seScreenshot.triggerHover(selector)     // Trigger hover state for screenshot
window.__seScreenshot.triggerFocus(selector)     // Trigger focus state for screenshot
```

### `scripts/css-parser.js` (NEW in v3.0)

CSS file analysis and variable extraction.

```javascript
window.__seCSS.analyze()                // Full CSS analysis
window.__seCSS.getStylesheetUrls()      // List all CSS files
window.__seCSS.extractVariables()       // Extract CSS custom properties
window.__seCSS.extractKeyframes()       // Extract @keyframes
window.__seCSS.extractMediaQueries()    // Extract media queries + breakpoints
window.__seCSS.extractFontFaces()       // Extract @font-face declarations
window.__seCSS.generateVariablesCSS()   // Generate CSS from variables

// CSS Variable Reverse Mapping (NEW)
window.__seCSS.buildReverseMap()        // Build computed-value -> variable-name map
// Returns: { map: { "rgb(37, 99, 235)": { varName: "--color-primary", rawValue: "#2563eb", category: "color" } }, categories: {...} }

window.__seCSS.lookupVariable(value)    // Look up CSS variable for a computed value
// Returns: { varName, rawValue, category } or null

window.__seCSS.normalizeColorValue(v)   // Normalize hex/rgb/rgba/hsl to canonical rgb string

// Font Source Extraction (NEW)
window.__seCSS.extractFontSources()     // Extract font loading sources
// Returns: { google: [...], typekit: { id, families }, preconnects: [...], imports: [...], allFamilies: [...] }
```

### `scripts/multi-page.js` (NEW in v3.0)

Multi-page extraction and site-wide analysis.

```javascript
window.__seMultiPage.discoverPages()       // Discover pages from nav/sitemap
window.__seMultiPage.initExtraction(pages) // Initialize multi-page extraction
window.__seMultiPage.mergeResults(results) // Merge results from multiple pages
window.__seMultiPage.generateSiteReport()  // Generate site-wide style report
window.__seMultiPage.generateMCPWorkflow() // Generate MCP commands for extraction
```

### `scripts/theme-detect.js` (NEW in v3.0)

Dark/light mode theme detection and extraction.

```javascript
window.__seTheme.detect()              // Full theme detection
window.__seTheme.detectCurrentTheme()  // Detect current theme mode
window.__seTheme.switchTheme(mode)     // Switch to light/dark
window.__seTheme.extractBothThemes()   // Extract both theme variants
window.__seTheme.compareThemes(a, b)   // Compare two themes
window.__seTheme.generateThemeCSS()    // Generate theme-aware CSS
```

### `scripts/motion-assoc.js` (NEW in v3.0)

Animation-component association and motion documentation.

```javascript
window.__seMotionAssoc.analyze()              // Full motion analysis
window.__seMotionAssoc.associateAnimations()  // Link animations to components
window.__seMotionAssoc.detectTriggers(el)     // Detect animation triggers
window.__seMotionAssoc.generateMotionDoc()    // Generate component motion docs
window.__seMotionAssoc.generateTimeline()     // Generate animation timeline
window.__seMotionAssoc.visualizeTimeline()    // ASCII timeline visualization
```

### `scripts/incremental.js` (NEW in v3.0)

Incremental extraction and change tracking.

```javascript
window.__seIncremental.extractIncremental()  // Incremental extraction
window.__seIncremental.saveSnapshot()        // Save extraction snapshot
window.__seIncremental.loadSnapshot()        // Load previous snapshot
window.__seIncremental.compare(prev, curr)   // Compare extractions
window.__seIncremental.getChanges(prev, curr) // Get detailed changes
window.__seIncremental.generateDiffReport()  // Generate diff report
```

### `scripts/responsive-extract.js` (NEW in v3.1 - P2)

响应式布局提取，捕获不同视口下的布局变化。

```javascript
// 提取当前布局
window.__seResponsive.extractCurrentLayout()
// Returns: { viewport, breakpoint, gridLayouts, flexLayouts, visibilityStates, sizingInfo }

// 生成 MCP 多视口工作流
window.__seResponsive.generateViewportWorkflow(['mobile', 'tablet', 'desktop'])
// Returns: { steps: [{ action, mcpTool, ... }] }

// 存储/获取布局（用于比较）
window.__seResponsive.storeLayout('mobile', layout)
window.__seResponsive.getStoredLayout('mobile')
window.__seResponsive.getAllStoredLayouts()

// 比较两个布局
window.__seResponsive.compareLayouts(mobileLayout, desktopLayout)
// Returns: { layoutChanges, visibilityChanges, sizingChanges, summary }

// 分析 CSS 断点
window.__seResponsive.analyzeBreakpoints()
// Returns: { breakpoints, named, mediaQueries, count }

// 分析断点处的变化
window.__seResponsive.analyzeBreakpointChanges()

// 生成响应式文档
window.__seResponsive.generateResponsiveDoc()
```

**MCP 多视口工作流示例：**
```javascript
// 1. 生成工作流
const workflow = window.__seResponsive.generateViewportWorkflow(['mobile', 'tablet', 'desktop']);

// 2. 按步骤执行
// Step: resize_page -> wait -> extractCurrentLayout -> screenshot
// 对每个视口重复

// 3. 比较布局
const changes = window.__seResponsive.compareLayouts(
  window.__seResponsive.getStoredLayout('mobile'),
  window.__seResponsive.getStoredLayout('desktop')
);
```

**布局比较输出：**
```javascript
{
  breakpoint: { from: 'sm', to: 'xl', changed: true },
  layoutChanges: [
    { type: 'grid-columns-changed', selector: '.grid', from: '1fr', to: 'repeat(3, 1fr)' },
    { type: 'flex-direction-changed', selector: '.nav', from: 'column', to: 'row' }
  ],
  visibilityChanges: [
    { selector: '.mobile-menu', from: 'visible', to: 'hidden' },
    { selector: '.desktop-nav', from: 'hidden', to: 'visible' }
  ],
  sizingChanges: [
    { selector: '.hero', widthChange: { from: 375, to: 1440, diff: 1065 } }
  ]
}
```

**标准视口：**
| 名称 | 尺寸 | 说明 |
|------|------|------|
| `mobile` | 375x667 | iPhone SE |
| `mobileLarge` | 414x896 | iPhone 11 |
| `tablet` | 768x1024 | iPad |
| `laptop` | 1280x800 | 笔记本 |
| `desktop` | 1440x900 | 桌面 |
| `desktopLarge` | 1920x1080 | 1080p |

### `scripts/extract-keyframes.py`

Offline keyframes extraction from downloaded CSS files.

```bash
python scripts/extract-keyframes.py <folder> --out keyframes.md
```

---

## Quality Checklist

### Static
- [ ] tokens include usage intent (not just lists)
- [ ] examples are copy-pasteable (HTML+CSS)
- [ ] all output formats are valid and usable

### Motion (when dynamic)
- [ ] 3+ key interactions with `document.getAnimations()` evidence
- [ ] full `@keyframes` blocks for important animations
- [ ] at least one documented "delay chain" if present
- [ ] JS-driven motion: detection proof + sampling/trace evidence

### Components (NEW)
- [ ] All interactive components detected (buttons, inputs, nav items)
- [ ] State matrix includes: default, hover, active, focus-visible, disabled
- [ ] Component hierarchy documented

### Output Formats (NEW)
- [ ] Markdown style guide complete
- [ ] JSON tokens valid and parseable
- [ ] Tailwind config can be used directly
- [ ] StyleKit TypeScript file importable

### Structure Extraction (NEW in v3.0)
- [ ] DOM tree captures page hierarchy
- [ ] Layout patterns (grid/flex) identified
- [ ] Responsive breakpoints extracted
- [ ] Semantic landmarks documented
- [ ] Component boundaries detected

### Code Generation (NEW in v3.0)
- [ ] HTML skeleton is valid HTML5
- [ ] React components compile with TypeScript
- [ ] Vue components use Composition API
- [ ] Generated components match detected boundaries

### Export Schema (NEW in v3.0)
- [ ] Schema validates without errors
- [ ] Completeness score > 70%
- [ ] Tags auto-inferred correctly
- [ ] All sections populated

### Replica Fidelity (NEW)
- [ ] CSS variable reverse map populated (buildReverseMap returns entries)
- [ ] Font sources detected (Google Fonts, Typekit, @font-face)
- [ ] Repeating patterns detected for card grids, nav items, lists
- [ ] Pseudo-element default states captured (::before/::after)
- [ ] Blueprint nodes carry varRefs for CSS variable annotation
- [ ] Responsive hints summarize layout changes across breakpoints
- [ ] toLLMPrompt includes patterns and responsive hints in condensed output

### AI Semantic Output (NEW in v3.1)
- [ ] Page type correctly identified
- [ ] Primary action detected
- [ ] Component semantic roles assigned
- [ ] Design system tokens extracted
- [ ] Code hints generated (Tailwind, CSS, React)
- [ ] Summary includes actionable recommendations

### State Capture (NEW in v3.1)
- [ ] MCP workflow generated for interactive elements
- [ ] Default state captured accurately
- [ ] Hover state captured via MCP hover tool
- [ ] Focus state captured via MCP click tool
- [ ] State diffs calculated correctly
- [ ] Fallback CSS extraction works when MCP unavailable

---

## StyleKit Integration

### Importing to StyleKit

After extraction, the generated `*-stylekit.ts` file can be:

1. **Direct import**: Copy to `lib/styles/custom/` in StyleKit
2. **Via UI**: Paste JSON into StyleKit's "Import Style" dialog at `/create-style`
3. **MCP tool**: Use StyleKit's `import_extracted_style` MCP tool

### Example Import Flow

```typescript
// In StyleKit: lib/styles/custom/endfield.ts
import endfieldStyle from './extracted/endfield-stylekit';

export { endfieldStyle };
```

---

## Troubleshooting

### Motion not captured
1. Check if animations are CSS or JS-driven
2. Use `library-detect.js` to identify libraries
3. Use `motion-tools.js` sampling for JS-driven motion
4. Record a Performance trace as fallback

### Components not detected
1. Check if site uses shadow DOM (may need different selectors)
2. Try broader selectors in `component-detect.js`
3. Use manual `extractStates()` for specific elements

### Format conversion fails
1. Ensure `styleData` object has required properties
2. Check console for parsing errors
3. Validate color values are in hex/rgb format

### Structure extraction incomplete
1. Increase `maxDepth` option for deep DOM trees
2. Check if site uses shadow DOM (not fully supported)
3. Ensure page is fully loaded before extraction
4. Try reducing `minWidth`/`minHeight` for small elements

### Code generation missing components
1. Verify structure data includes `componentBoundaries`
2. Check if component patterns match site's class naming
3. Add custom patterns to `COMPONENT_PATTERNS` if needed

### Export validation fails
1. Run `window.__seExport.validateSchema(schema)` to see errors
2. Ensure all prerequisite scripts are loaded
3. Check that structure extraction completed successfully

### MCP connection fails (chrome-devtools)
1. Ensure Chrome is reachable on port `9222` (remote debugging enabled).
2. If your agent runs in WSL but Chrome runs on Windows, use the included `.mcp.json` (it runs `scripts/chrome-devtools-mcp.cjs` which auto-picks a reachable `--browserUrl`). You can also set `CHROME_BROWSER_URL` explicitly.
3. If `chrome-devtools-mcp` reports "browser already running for ...chrome-profile", kill the stale Chrome instance using that profile and restart the MCP server.

---

## Examples

### Minimal extraction (Markdown only)

```
Extract the style from https://example.com
Output: Markdown style guide only
```

### Full extraction with all formats

```
Extract https://endfield.hypergryph.com with:
- Full motion evidence (site has significant animations)
- Component state matrices for buttons, nav, cards
- All output formats: Markdown, JSON, Tailwind, StyleKit
- Follow endfield reference quality
```

### Component-focused extraction

```
Extract component library from https://ui.shadcn.com
Focus on: button variants, form inputs, cards
Include: complete state matrices for all variants
Output: JSON + StyleKit for integration
```

### Website replication (experimental)

> Note: Code generation produces best-effort skeleton output, not production-ready replicas.

```
Extract the structure and tokens of https://example.com
- Design tokens (colors, typography, spacing)
- DOM structure and layout patterns
- Component patterns with state transitions
Output: All token formats + AI design system prompt
```

### Full extraction with AI prompt

```
Extract https://stripe.com/docs with:
- Complete style tokens
- Component detection (buttons, inputs, cards)
- AI-ready design system prompt
- Confidence scoring
Output: JSON + Tailwind + StyleKit + AI Prompt
```

### Design recommendation (Phase 5)

After extracting tokens, cross-reference against the embedded knowledge base:

```
Extract https://example.com then:
- Identify which UI style category the site matches
- Recommend color palette improvements based on product type
- Suggest font pairings that match the detected mood
- Run UX quick-check against critical guidelines
Output: Style guide + Recommendations report
```

---

## Phase 5 — Design Recommendation (Post-Extraction)

After extracting tokens (Phase 1-4), use the embedded knowledge base to enrich results:

### 5.1 Style Identification

Compare extracted tokens against the **Style Reference** below. Match by:
1. Color palette similarity (primary/secondary hex distance)
2. CSS property patterns (border-radius, box-shadow, backdrop-filter)
3. Animation characteristics (duration, easing, effects)
4. Keywords from AI Prompt Keywords column

Output: Top 3 matching style categories with confidence score.

### 5.2 Color Palette Recommendation

Match the extracted site's product type against the **Product Color Palette Reference**. Compare:
1. Extracted primary color vs recommended primary
2. CTA color contrast ratio
3. Background/text readability

Output: Current palette assessment + recommended palette for the product type.

### 5.3 Font Pairing Suggestion

Match extracted font families against the **Typography Reference**. If fonts are generic or suboptimal:
1. Identify mood/style from extracted design tokens
2. Find matching font pairing by mood keywords
3. Provide Google Fonts URL + CSS import + Tailwind config

### 5.4 UX Quick Check

Run extracted evidence against the **UX Checklist** (HIGH/CRITICAL severity items only):
- Touch targets >= 44x44px
- Color contrast >= 4.5:1
- Focus states visible
- Loading states present
- Reduced motion respected
- Form labels associated
- Alt text on images

Output: Pass/Fail checklist with specific findings.

---

## Knowledge Base: Style Reference (68 Categories)

Compact reference for style identification. Match extracted tokens against these patterns.

| # | Style | Type | Keywords | Primary Colors | Effects | Best For | CSS Patterns |
|---|-------|------|----------|---------------|---------|----------|-------------|
| 1 | Minimalism & Swiss | General | clean, spacious, grid, sans-serif | Black #000, White #FFF | Subtle hover 200-250ms, sharp shadows | Enterprise, dashboards, SaaS | `grid, gap:2rem, sans-serif, no box-shadow` |
| 2 | Neumorphism | General | soft UI, embossed, rounded 12-16px | Soft Blue #C8E0F4, Soft Pink #F5E0E8 | Multi box-shadow (-5px/-5px + 5px/5px), press 150ms | Wellness, meditation, fitness | `border-radius:14px, box-shadow:multi-layer, pastel bg` |
| 3 | Glassmorphism | General | frosted glass, blur, translucent | rgba(255,255,255,0.1-0.3) | backdrop-filter blur 10-20px, 1px border | Modern SaaS, financial, modals | `backdrop-filter:blur(15px), rgba bg, subtle border` |
| 4 | Brutalism | General | raw, stark, anti-design, bold | Red #F00, Blue #00F, Yellow #FF0 | No transitions, sharp corners 0px | Design portfolios, editorial | `border-radius:0, transition:none, font-weight:700+` |
| 5 | 3D & Hyperrealism | General | depth, textures, 3D, immersive | Navy #001F3F, Gold #FFD700 | WebGL, parallax 3-5 layers, 300-400ms | Gaming, product showcase | `perspective:1000px, translate3d, complex shadows` |
| 6 | Vibrant Block-based | General | bold, energetic, geometric | Neon Green #39FF14, Purple #BF00FF | Large sections 48px+ gaps, scroll-snap | Startups, gaming, youth | `grid large gaps, font-size:32px+, vibrant colors` |
| 7 | Dark Mode OLED | General | dark, OLED, eye-friendly | Black #000, Dark Grey #121212 | Minimal glow text-shadow, high readability | Night-mode, coding, entertainment | `bg:#000/#121212, neon accents, color-scheme:dark` |
| 8 | Accessible & Ethical | General | WCAG AAA, high contrast, semantic | 7:1+ contrast ratio | Focus rings 3-4px, ARIA, skip links, 44x44px targets | Government, healthcare, education | `contrast:7:1+, font:16px+, focus-visible:3-4px` |
| 9 | Claymorphism | General | soft 3D, chunky, bubbly, toy-like | Peach #FDBCB4, Baby Blue #ADD8E6 | Inner+outer shadows, soft press 200ms | Educational, children's, creative | `border-radius:20px, border:3-4px, double shadows` |
| 10 | Aurora UI | General | mesh gradient, Northern Lights | Blue-Orange, Purple-Yellow complementary | Flowing gradients 8-12s animation | Modern SaaS, creative, hero sections | `conic-gradient, animation:8-12s, blend-mode:screen` |
| 11 | Retro-Futurism | General | 80s, neon glow, CRT, synthwave | Neon Blue #0080FF, Pink #FF006E, Cyan #0FF | CRT scanlines, neon glow, glitch effects | Gaming, entertainment, music | `text-shadow:neon, monospace, animation:glitch` |
| 12 | Flat Design | General | 2D, bold colors, no shadows | Solid bright limited 4-6 palette | No gradients/shadows, 150-200ms transitions | Web/mobile apps, SaaS, dashboards | `box-shadow:none, solid bg, no gradients` |
| 13 | Skeuomorphism | General | realistic, texture, 3D, tactile | Wood/leather/metal colors | Realistic shadows, textures, 300-500ms | Legacy apps, gaming, luxury | `gradient:8-12 stops, texture overlay, multi-shadow` |
| 14 | Liquid Glass | General | morphing, fluid, iridescent | Iridescent rainbow, translucent | SVG morphing 400-600ms, dynamic blur | Premium SaaS, luxury portfolios | `animation:morph, backdrop-filter, hue-rotate` |
| 15 | Motion-Driven | General | animation-heavy, parallax, scroll | Bold + dynamic gradients | Scroll anim, parallax 3-5 layers, 300-400ms | Portfolio, storytelling, entertainment | `IntersectionObserver, will-change:transform, parallax` |
| 16 | Micro-interactions | General | small anim, gesture, tactile | Subtle color shifts 10-20% | 50-100ms hover, loading spinners, haptic | Mobile apps, productivity, consumer | `transition:50-100ms, :active, haptic feedback` |
| 17 | Inclusive Design | General | color-blind, haptic, voice, WCAG AAA | 7:1+ contrast, symbol-based | Haptic, voice, focus 4px+, reduced motion | Public services, education, healthcare | `aria-*, focus-visible:4px, prefers-reduced-motion` |
| 18 | Zero Interface | General | voice-first, gesture, AI-driven | Neutral #FAFAFA, light grey | Voice recognition, progressive disclosure | Voice assistants, AI, smart home | `Web Speech API, minimal visible UI` |
| 19 | Soft UI Evolution | General | evolved neumorphism, better contrast | Soft Blue #87CEEB, Pink #FFB6C1 | Improved shadows, 200-300ms, WCAG AA+ | Modern enterprise, SaaS, health | `box-shadow:softer, border-radius:10px, contrast:4.5:1+` |
| 38 | Neubrutalism | General | bold borders, black outlines, 45deg shadows | Yellow #FFEB3B, Red #FF5252, Blue #2196F3 | box-shadow:4px 4px 0 #000, border:3px solid | Gen Z, startups, Figma-style | `border:3px solid black, hard shadow offset, no blur` |
| 39 | Bento Box Grid | General | modular cards, Apple-style, asymmetric | White #FFF, #F5F5F5 + brand accent | Hover scale 1.02, subtle shadows, rounded-xl | Dashboards, product pages, portfolios | `grid varied spans, border-radius:24px, soft shadow` |
| 40 | Y2K Aesthetic | General | neon pink, chrome, metallic, glossy | Hot Pink #FF69B4, Cyan #0FF, Silver #C0C0C0 | Metallic gradients, glossy, glow animations | Fashion, music, Gen Z, nostalgia | `linear-gradient metallic, drop-shadow glow, bubbles` |
| 41 | Cyberpunk UI | General | neon, terminal, HUD, glitch | Matrix Green #0F0, Magenta #F0F, Cyan #0FF | Neon glow, glitch, scanlines, terminal fonts | Gaming, crypto, developer tools | `bg:#0D0D0D, text-shadow:neon, monospace, glitch` |
| 42 | Organic Biophilic | General | nature, green, sustainable, earthy | Forest #228B22, Brown #8B4513, Sky #87CEEB | Organic curves, natural shadows, flowing SVG | Wellness, sustainability, eco | `border-radius:varied, earth tones, organic shapes` |
| 43 | AI-Native UI | General | chatbot, conversational, streaming | AI Purple #6366F1, Success #10B981 | Typing indicators, streaming text, pulse | AI products, chatbots, copilots | `chat bubbles, typing animation, sticky input` |
| 44 | Memphis Design | General | 80s, geometric, postmodern, squiggles | Hot Pink #FF71CE, Yellow #FFCE5C, Teal #86CCCA | clip-path, rotate, mix-blend-mode, patterns | Creative agencies, music, youth | `clip-path:polygon, repeating patterns, rotate` |
| 45 | Vaporwave | General | synthwave, 80s-90s, sunset, dreamy | Pink #FF71CE, Cyan #01CDFE, Purple #B967FF | Sunset gradients, glitch, VHS, neon glow | Music, gaming, creative portfolios | `linear-gradient sunset, hue-rotate, retro grid` |
| 46 | Dimensional Layering | General | depth, z-index, elevation, floating | Neutral base + brand accent | z-index stacking, elevation shadows 4 levels | Dashboards, cards, modals, SaaS | `z-index:1-4, box-shadow:elevation scale, translateZ` |
| 47 | Exaggerated Minimalism | General | oversized type, negative space, bold | Black #000, White #FFF, single accent | clamp(3rem,10vw,12rem), font-weight:900 | Fashion, architecture, portfolios | `font-size:clamp huge, padding:8rem+, single accent` |
| 48 | Kinetic Typography | General | motion text, typing effect, morphing | High contrast, gradient text fills | @keyframes text, typing steps(), GSAP SplitText | Hero sections, marketing, creative | `background-clip:text, letter animation, scroll-trigger` |
| 51 | HUD / Sci-Fi FUI | General | futuristic, wireframe, iron man | Neon Cyan #0FF, Holo Blue #0080FF | Glow, scanning, ticker, blinking markers | Sci-fi games, cybersecurity | `border:1px rgba cyan, monospace, transparent bg` |
| 52 | Pixel Art | General | 8-bit, retro, gaming, blocky | NES palette, limited brights | Frame-by-frame, instant transitions | Indie games, retro tools, NFT | `image-rendering:pixelated, pixel font, box-shadow pixels` |
| 55 | Spatial UI VisionOS | General | glass, depth, gaze, gesture | Frosted Glass 15-30% opacity | Parallax depth, gaze-hover, dynamic lighting | Spatial computing, VR/AR | `backdrop-filter:blur(40px) saturate(180%), scale on focus` |
| 56 | E-Ink / Paper | General | paper, matte, calm, monochrome | Off-White #FDFBF7, Ink #1A1A1A | No animations, grain texture, sharp transitions | Reading apps, journals, writing | `bg:#FDFBF7, transition:none, serif, no gradients` |
| 57 | Gen Z Chaos | General | chaos, stickers, collage, loud | Clashing #F0F, #0F0, #FF0, #00F | Marquee, jitter, sticker layers, GIF overload | Gen Z lifestyle, viral marketing | `mix-blend-mode, random rotate, saturate(150%)` |
| 66 | Editorial Grid | General | magazine, asymmetric, pull quotes | Black #000, White #FFF + accent | Scroll reveal, parallax images, page-flip | News, blogs, magazines, publishing | `grid named areas, column-count, ::first-letter` |
| 68 | Vintage Analog | General | film grain, VHS, polaroid, sepia | Cream #F5E6C8, Sepia #D4A574, Teal #4A7B7C | Film grain overlay, VHS tracking, light leaks | Photography, music, vintage fashion | `filter:sepia() contrast(), noise texture, warm tint` |

## Knowledge Base: Product Color Palettes (96 Types)

Cross-reference extracted primary/secondary/CTA colors against these industry-standard palettes to identify product type and recommend improvements.

**Matching logic:** Calculate color distance (deltaE) between extracted colors and each row. Closest match = likely product type. If distance > 30, the site uses a custom palette.

| # | Product Type | Primary | Secondary | CTA | BG | Text | Border | Notes |
|---|---|---|---|---|---|---|---|---|
| 1 | SaaS (General) | #2563EB | #3B82F6 | #F97316 | #F8FAFC | #1E293B | #E2E8F0 | Trust blue + orange CTA |
| 2 | Micro SaaS | #6366F1 | #818CF8 | #10B981 | #F5F3FF | #1E1B4B | #E0E7FF | Indigo + emerald CTA |
| 3 | E-commerce | #059669 | #10B981 | #F97316 | #ECFDF5 | #064E3B | #A7F3D0 | Green + urgency orange |
| 4 | E-commerce Luxury | #1C1917 | #44403C | #CA8A04 | #FAFAF9 | #0C0A09 | #D6D3D1 | Dark + gold accent |
| 5 | Service Landing | #0EA5E9 | #38BDF8 | #F97316 | #F0F9FF | #0C4A6E | #BAE6FD | Sky blue + warm CTA |
| 6 | B2B Service | #0F172A | #334155 | #0369A1 | #F8FAFC | #020617 | #E2E8F0 | Navy + blue CTA |
| 7 | Financial Dashboard | #0F172A | #1E293B | #22C55E | #020617 | #F8FAFC | #334155 | Dark + green indicators |
| 8 | Analytics Dashboard | #1E40AF | #3B82F6 | #F59E0B | #F8FAFC | #1E3A8A | #DBEAFE | Blue + amber highlights |
| 9 | Healthcare App | #0891B2 | #22D3EE | #059669 | #ECFEFF | #164E63 | #A5F3FC | Cyan + health green |
| 10 | Educational App | #4F46E5 | #818CF8 | #F97316 | #EEF2FF | #1E1B4B | #C7D2FE | Indigo + orange |
| 11 | Creative Agency | #EC4899 | #F472B6 | #06B6D4 | #FDF2F8 | #831843 | #FBCFE8 | Pink + cyan |
| 12 | Portfolio/Personal | #18181B | #3F3F46 | #2563EB | #FAFAFA | #09090B | #E4E4E7 | Mono + blue accent |
| 13 | Gaming | #7C3AED | #A78BFA | #F43F5E | #0F0F23 | #E2E8F0 | #4C1D95 | Neon purple + rose |
| 14 | Government | #0F172A | #334155 | #0369A1 | #F8FAFC | #020617 | #E2E8F0 | High contrast navy |
| 15 | Fintech/Crypto | #F59E0B | #FBBF24 | #8B5CF6 | #0F172A | #F8FAFC | #334155 | Gold + purple tech |
| 16 | Social Media | #E11D48 | #FB7185 | #2563EB | #FFF1F2 | #881337 | #FECDD3 | Rose + engagement blue |
| 17 | Productivity Tool | #0D9488 | #14B8A6 | #F97316 | #F0FDFA | #134E4A | #99F6E4 | Teal + action orange |
| 18 | Design System | #4F46E5 | #6366F1 | #F97316 | #EEF2FF | #312E81 | #C7D2FE | Indigo + doc hierarchy |
| 19 | AI/Chatbot | #7C3AED | #A78BFA | #06B6D4 | #FAF5FF | #1E1B4B | #DDD6FE | Purple + cyan |
| 20 | NFT/Web3 | #8B5CF6 | #A78BFA | #FBBF24 | #0F0F23 | #F8FAFC | #4C1D95 | Purple + gold |
| 21 | Creator Economy | #EC4899 | #F472B6 | #F97316 | #FDF2F8 | #831843 | #FBCFE8 | Pink + orange |
| 22 | Sustainability/ESG | #059669 | #10B981 | #0891B2 | #ECFDF5 | #064E3B | #A7F3D0 | Green + ocean blue |
| 23 | Remote Work/Collab | #6366F1 | #818CF8 | #10B981 | #F5F3FF | #312E81 | #E0E7FF | Indigo + success green |
| 24 | Mental Health | #8B5CF6 | #C4B5FD | #10B981 | #FAF5FF | #4C1D95 | #EDE9FE | Lavender + wellness green |
| 25 | Pet Tech | #F97316 | #FB923C | #2563EB | #FFF7ED | #9A3412 | #FED7AA | Orange + trust blue |
| 26 | Smart Home/IoT | #1E293B | #334155 | #22C55E | #0F172A | #F8FAFC | #475569 | Dark + status green |
| 27 | EV/Charging | #0891B2 | #22D3EE | #22C55E | #ECFEFF | #164E63 | #A5F3FC | Cyan + eco green |
| 28 | Subscription Box | #D946EF | #E879F9 | #F97316 | #FDF4FF | #86198F | #F5D0FE | Purple + urgency orange |
| 29 | Podcast | #1E1B4B | #312E81 | #F97316 | #0F0F23 | #F8FAFC | #4338CA | Dark audio + warm |
| 30 | Dating App | #E11D48 | #FB7185 | #F97316 | #FFF1F2 | #881337 | #FECDD3 | Rose + warm orange |
| 31 | Micro-Credentials | #0369A1 | #0EA5E9 | #CA8A04 | #F0F9FF | #0C4A6E | #BAE6FD | Blue + achievement gold |
| 32 | Knowledge Base | #475569 | #64748B | #2563EB | #F8FAFC | #1E293B | #E2E8F0 | Grey + link blue |
| 33 | Hyperlocal Services | #059669 | #10B981 | #F97316 | #ECFDF5 | #064E3B | #A7F3D0 | Green + action orange |
| 34 | Beauty/Spa | #EC4899 | #F9A8D4 | #8B5CF6 | #FDF2F8 | #831843 | #FBCFE8 | Pink + lavender |
| 35 | Luxury/Premium | #1C1917 | #44403C | #CA8A04 | #FAFAF9 | #0C0A09 | #D6D3D1 | Black + gold |
| 36 | Restaurant/Food | #DC2626 | #F87171 | #CA8A04 | #FEF2F2 | #450A0A | #FECACA | Red + warm gold |
| 37 | Fitness/Gym | #F97316 | #FB923C | #22C55E | #1F2937 | #F8FAFC | #374151 | Orange + success green |
| 38 | Real Estate | #0F766E | #14B8A6 | #0369A1 | #F0FDFA | #134E4A | #99F6E4 | Teal + professional blue |
| 39 | Travel/Tourism | #0EA5E9 | #38BDF8 | #F97316 | #F0F9FF | #0C4A6E | #BAE6FD | Sky blue + adventure orange |
| 40 | Hotel/Hospitality | #1E3A8A | #3B82F6 | #CA8A04 | #F8FAFC | #1E40AF | #BFDBFE | Navy + gold service |
| 41 | Wedding/Event | #DB2777 | #F472B6 | #CA8A04 | #FDF2F8 | #831843 | #FBCFE8 | Pink + elegant gold |
| 42 | Legal Services | #1E3A8A | #1E40AF | #B45309 | #F8FAFC | #0F172A | #CBD5E1 | Navy + trust gold |
| 43 | Insurance | #0369A1 | #0EA5E9 | #22C55E | #F0F9FF | #0C4A6E | #BAE6FD | Blue + protected green |
| 44 | Banking/Finance | #0F172A | #1E3A8A | #CA8A04 | #F8FAFC | #020617 | #E2E8F0 | Navy + premium gold |
| 45 | Online Course | #0D9488 | #2DD4BF | #F97316 | #F0FDFA | #134E4A | #5EEAD4 | Teal + achievement orange |
| 46 | Non-profit/Charity | #0891B2 | #22D3EE | #F97316 | #ECFEFF | #164E63 | #A5F3FC | Blue + action orange |
| 47 | Music Streaming | #1E1B4B | #4338CA | #22C55E | #0F0F23 | #F8FAFC | #312E81 | Dark + play green |
| 48 | Video Streaming | #0F0F23 | #1E1B4B | #E11D48 | #000000 | #F8FAFC | #312E81 | Cinema dark + play red |
| 49 | Job Board | #0369A1 | #0EA5E9 | #22C55E | #F0F9FF | #0C4A6E | #BAE6FD | Blue + success green |
| 50 | Marketplace (P2P) | #7C3AED | #A78BFA | #22C55E | #FAF5FF | #4C1D95 | #DDD6FE | Purple + transaction green |
| 51 | Logistics/Delivery | #2563EB | #3B82F6 | #F97316 | #EFF6FF | #1E40AF | #BFDBFE | Blue + delivery orange |
| 52 | Agriculture/Farm | #15803D | #22C55E | #CA8A04 | #F0FDF4 | #14532D | #BBF7D0 | Earth green + harvest gold |
| 53 | Construction | #64748B | #94A3B8 | #F97316 | #F8FAFC | #334155 | #E2E8F0 | Grey + safety orange |
| 54 | Automotive | #1E293B | #334155 | #DC2626 | #F8FAFC | #0F172A | #E2E8F0 | Dark + action red |
| 55 | Photography | #18181B | #27272A | #F8FAFC | #000000 | #FAFAFA | #3F3F46 | Black + white contrast |
| 56 | Coworking Space | #F59E0B | #FBBF24 | #2563EB | #FFFBEB | #78350F | #FDE68A | Amber + booking blue |
| 57 | Cleaning Service | #0891B2 | #22D3EE | #22C55E | #ECFEFF | #164E63 | #A5F3FC | Cyan + clean green |
| 58 | Home Services | #1E40AF | #3B82F6 | #F97316 | #EFF6FF | #1E3A8A | #BFDBFE | Blue + urgent orange |
| 59 | Childcare/Daycare | #F472B6 | #FBCFE8 | #22C55E | #FDF2F8 | #9D174D | #FCE7F3 | Pink + safe green |
| 60 | Senior Care | #0369A1 | #38BDF8 | #22C55E | #F0F9FF | #0C4A6E | #E0F2FE | Blue + reassuring green |
| 61 | Medical Clinic | #0891B2 | #22D3EE | #22C55E | #F0FDFA | #134E4A | #CCFBF1 | Teal + health green |
| 62 | Pharmacy | #15803D | #22C55E | #0369A1 | #F0FDF4 | #14532D | #BBF7D0 | Green + trust blue |
| 63 | Dental Practice | #0EA5E9 | #38BDF8 | #FBBF24 | #F0F9FF | #0C4A6E | #BAE6FD | Blue + smile yellow |
| 64 | Veterinary | #0D9488 | #14B8A6 | #F97316 | #F0FDFA | #134E4A | #99F6E4 | Teal + warm orange |
| 65 | Florist/Plant | #15803D | #22C55E | #EC4899 | #F0FDF4 | #14532D | #BBF7D0 | Green + floral pink |
| 66 | Bakery/Cafe | #92400E | #B45309 | #F8FAFC | #FEF3C7 | #78350F | #FDE68A | Warm brown + cream |
| 67 | Coffee Shop | #78350F | #92400E | #FBBF24 | #FEF3C7 | #451A03 | #FDE68A | Coffee brown + gold |
| 68 | Brewery/Winery | #7C2D12 | #B91C1C | #CA8A04 | #FEF2F2 | #450A0A | #FECACA | Burgundy + craft gold |
| 69 | Airline | #1E3A8A | #3B82F6 | #F97316 | #EFF6FF | #1E40AF | #BFDBFE | Sky blue + booking orange |
| 70 | News/Media | #DC2626 | #EF4444 | #1E40AF | #FEF2F2 | #450A0A | #FECACA | Breaking red + link blue |
| 71 | Magazine/Blog | #18181B | #3F3F46 | #EC4899 | #FAFAFA | #09090B | #E4E4E7 | Editorial black + pink |
| 72 | Freelancer | #6366F1 | #818CF8 | #22C55E | #EEF2FF | #312E81 | #C7D2FE | Indigo + hire green |
| 73 | Consulting Firm | #0F172A | #334155 | #CA8A04 | #F8FAFC | #020617 | #E2E8F0 | Navy + premium gold |
| 74 | Marketing Agency | #EC4899 | #F472B6 | #06B6D4 | #FDF2F8 | #831843 | #FBCFE8 | Pink + creative cyan |
| 75 | Event Management | #7C3AED | #A78BFA | #F97316 | #FAF5FF | #4C1D95 | #DDD6FE | Purple + action orange |
| 76 | Conference/Webinar | #1E40AF | #3B82F6 | #22C55E | #EFF6FF | #1E3A8A | #BFDBFE | Blue + join green |
| 77 | Membership/Community | #7C3AED | #A78BFA | #22C55E | #FAF5FF | #4C1D95 | #DDD6FE | Purple + join green |
| 78 | Newsletter | #0369A1 | #0EA5E9 | #F97316 | #F0F9FF | #0C4A6E | #BAE6FD | Blue + subscribe orange |
| 79 | Digital Products | #6366F1 | #818CF8 | #22C55E | #EEF2FF | #312E81 | #C7D2FE | Indigo + buy green |
| 80 | Church/Religious | #7C3AED | #A78BFA | #CA8A04 | #FAF5FF | #4C1D95 | #DDD6FE | Purple + warm gold |
| 81 | Sports Team | #DC2626 | #EF4444 | #FBBF24 | #FEF2F2 | #7F1D1D | #FECACA | Red + championship gold |
| 82 | Museum/Gallery | #18181B | #27272A | #F8FAFC | #FAFAFA | #09090B | #E4E4E7 | Black + white space |
| 83 | Theater/Cinema | #1E1B4B | #312E81 | #CA8A04 | #0F0F23 | #F8FAFC | #4338CA | Dark + spotlight gold |
| 84 | Language Learning | #4F46E5 | #818CF8 | #22C55E | #EEF2FF | #312E81 | #C7D2FE | Indigo + progress green |
| 85 | Coding Bootcamp | #0F172A | #1E293B | #22C55E | #020617 | #F8FAFC | #334155 | Terminal dark + green |
| 86 | Cybersecurity | #00FF41 | #0D0D0D | #FF3333 | #000000 | #E0E0E0 | #1F1F1F | Matrix green + alert red |
| 87 | Developer Tool/IDE | #1E293B | #334155 | #22C55E | #0F172A | #F8FAFC | #475569 | Code dark + run green |
| 88 | Biotech/Life Sci | #0EA5E9 | #0284C7 | #10B981 | #F0F9FF | #0C4A6E | #BAE6FD | DNA blue + life green |
| 89 | Space Tech | #F8FAFC | #94A3B8 | #3B82F6 | #0B0B10 | #F8FAFC | #1E293B | Star white + launch blue |
| 90 | Architecture/Interior | #171717 | #404040 | #D4AF37 | #FFFFFF | #171717 | #E5E5E5 | Minimal black + gold |
| 91 | Quantum Computing | #00FFFF | #7B61FF | #FF00FF | #050510 | #E0E0FF | #333344 | Cyan + interference purple |
| 92 | Biohacking | #FF4D4D | #4D94FF | #00E676 | #F5F5F7 | #1C1C1E | #E5E5EA | Bio red/blue + vitality green |
| 93 | Autonomous Systems | #00FF41 | #008F11 | #FF3333 | #0D1117 | #E6EDF3 | #30363D | Terminal green + alert red |
| 94 | Generative AI Art | #18181B | #3F3F46 | #EC4899 | #FAFAFA | #09090B | #E4E4E7 | Neutral + creative pink |
| 95 | Spatial/VisionOS | #FFFFFF | #E5E5E5 | #007AFF | #888888 | #000000 | #CCCCCC | Glass white + system blue |
| 96 | Climate Tech | #059669 | #10B981 | #FBBF24 | #ECFDF5 | #064E3B | #A7F3D0 | Nature green + solar gold |

## Knowledge Base: Font Pairings (57 Combinations)

Cross-reference extracted font-family values against these pairings to identify typography style and suggest improvements.

**Matching logic:** Extract `font-family` from headings and body text. Match against Heading Font + Body Font columns. Partial match (one font) = suggest the complementary pair.

| # | Pairing Name | Cat | Heading | Body | Mood | Best For |
|---|---|---|---|---|---|---|
| 1 | Classic Elegant | Serif+Sans | Playfair Display | Inter | elegant, luxury, premium | Luxury, fashion, editorial |
| 2 | Modern Professional | Sans+Sans | Poppins | Open Sans | modern, corporate, friendly | SaaS, corporate, startups |
| 3 | Tech Startup | Sans+Sans | Space Grotesk | DM Sans | tech, innovative, bold | Tech, SaaS, AI products |
| 4 | Editorial Classic | Serif+Serif | Cormorant Garamond | Libre Baskerville | editorial, literary, refined | Publishing, blogs, news |
| 5 | Minimal Swiss | Sans+Sans | Inter | Inter | minimal, functional, neutral | Dashboards, admin, design systems |
| 6 | Playful Creative | Display+Sans | Fredoka | Nunito | playful, fun, warm | Children's apps, education, gaming |
| 7 | Bold Statement | Display+Sans | Bebas Neue | Source Sans 3 | bold, dramatic, impactful | Marketing, portfolios, sports |
| 8 | Wellness Calm | Serif+Sans | Lora | Raleway | calm, natural, organic | Health, wellness, spa, yoga |
| 9 | Developer Mono | Mono+Sans | JetBrains Mono | IBM Plex Sans | code, technical, precise | Dev tools, docs, tech blogs |
| 10 | Retro Vintage | Display+Serif | Abril Fatface | Merriweather | retro, nostalgic, dramatic | Vintage brands, breweries, posters |
| 11 | Geometric Modern | Sans+Sans | Outfit | Work Sans | geometric, contemporary | Portfolios, agencies, landing pages |
| 12 | Luxury Serif | Serif+Sans | Cormorant | Montserrat | luxury, fashion, refined | Fashion, jewelry, high-end |
| 13 | Friendly SaaS | Sans+Sans | Plus Jakarta Sans | Plus Jakarta Sans | friendly, modern, clean | SaaS, web apps, dashboards |
| 14 | News Editorial | Serif+Sans | Newsreader | Roboto | news, trustworthy, readable | News, magazines, journalism |
| 15 | Handwritten Charm | Script+Sans | Caveat | Quicksand | handwritten, casual, warm | Personal blogs, invitations |
| 16 | Corporate Trust | Sans+Sans | Lexend | Source Sans 3 | corporate, accessible | Enterprise, government, healthcare |
| 17 | Brutalist Raw | Mono+Mono | Space Mono | Space Mono | brutalist, raw, stark | Brutalist design, dev portfolios |
| 18 | Fashion Forward | Sans+Sans | Syne | Manrope | avant-garde, artistic, edgy | Fashion, creative agencies, art |
| 19 | Soft Rounded | Sans+Sans | Varela Round | Nunito Sans | soft, friendly, gentle | Children's, pet apps, soft UI |
| 20 | Premium Sans | Sans+Sans | Satoshi | General Sans | premium, sophisticated | Premium brands, modern agencies |
| 21 | Vietnamese | Sans+Sans | Be Vietnam Pro | Noto Sans | multilingual, readable | Vietnamese sites, intl products |
| 22 | Japanese Elegant | Serif+Sans | Noto Serif JP | Noto Sans JP | japanese, elegant | Japanese sites, cultural content |
| 23 | Korean Modern | Sans+Sans | Noto Sans KR | Noto Sans KR | korean, modern, clean | Korean sites, K-beauty, K-pop |
| 24 | Chinese Traditional | Serif+Sans | Noto Serif TC | Noto Sans TC | chinese, elegant | Traditional Chinese, Taiwan/HK |
| 25 | Chinese Simplified | Sans+Sans | Noto Sans SC | Noto Sans SC | chinese, modern | Mainland China, business apps |
| 26 | Arabic Elegant | Serif+Sans | Noto Naskh Arabic | Noto Sans Arabic | arabic, RTL | Arabic sites, Middle East |
| 27 | Thai Modern | Sans+Sans | Noto Sans Thai | Noto Sans Thai | thai, readable | Thai sites, SE Asia, tourism |
| 28 | Hebrew Modern | Sans+Sans | Noto Sans Hebrew | Noto Sans Hebrew | hebrew, RTL | Hebrew sites, Israeli market |
| 29 | Legal Professional | Serif+Sans | EB Garamond | Lato | legal, authoritative | Law firms, contracts, government |
| 30 | Medical Clean | Sans+Sans | Figtree | Noto Sans | medical, accessible | Healthcare, pharma, health apps |
| 31 | Financial Trust | Sans+Sans | IBM Plex Sans | IBM Plex Sans | financial, corporate | Banks, finance, insurance, fintech |
| 32 | Real Estate Luxury | Serif+Sans | Cinzel | Josefin Sans | real estate, elegant | Luxury properties, architecture |
| 33 | Restaurant Menu | Serif+Sans | Playfair Display SC | Karla | culinary, elegant | Restaurants, cafes, food blogs |
| 34 | Art Deco | Display+Sans | Poiret One | Didact Gothic | art deco, 1920s, gatsby | Vintage events, luxury hotels |
| 35 | Magazine Style | Serif+Sans | Libre Bodoni | Public Sans | magazine, editorial | Magazines, publications, journalism |
| 36 | Crypto/Web3 | Sans+Sans | Orbitron | Exo 2 | crypto, futuristic, blockchain | Crypto, NFT, web3, blockchain |
| 37 | Gaming Bold | Display+Sans | Russo One | Chakra Petch | gaming, action, esports | Gaming, esports, competition |
| 38 | Indie/Craft | Display+Sans | Amatic SC | Cabin | indie, handmade, artisan | Craft brands, artisan, organic |
| 39 | Startup Bold | Sans+Sans | Clash Display | Satoshi | startup, bold, confident | Startups, pitch decks, launches |
| 40 | E-commerce Clean | Sans+Sans | Rubik | Nunito Sans | ecommerce, clean, retail | Online stores, product pages |
| 41 | Academic/Research | Serif+Sans | Crimson Pro | Atkinson Hyperlegible | academic, scholarly | Universities, research, journals |
| 42 | Dashboard Data | Mono+Sans | Fira Code | Fira Sans | dashboard, analytics | Dashboards, data viz, admin |
| 43 | Music/Entertainment | Display+Sans | Righteous | Poppins | music, energetic, bold | Music, entertainment, festivals |
| 44 | Minimalist Portfolio | Sans+Sans | Space Grotesk | Archivo | minimal, designer, artistic | Design portfolios, creative pros |
| 45 | Kids/Education | Display+Sans | Baloo 2 | Comic Neue | kids, playful, colorful | Children's apps, educational games |
| 46 | Wedding/Romance | Script+Serif | Great Vibes | Cormorant Infant | wedding, romantic, script | Wedding sites, invitations, bridal |
| 47 | Science/Tech | Sans+Mono | Exo | Roboto Mono | science, research, data | Science, research, tech docs |
| 48 | Accessibility First | Sans+Sans | Atkinson Hyperlegible | Atkinson Hyperlegible | accessible, WCAG, inclusive | Government, healthcare, inclusive |
| 49 | Sports/Fitness | Sans+Sans | Barlow Condensed | Barlow | sports, athletic, energetic | Sports, fitness, gyms, competition |
| 50 | Luxury Minimalist | Serif+Sans | Bodoni Moda | Jost | luxury, minimalist, refined | High-end fashion, premium products |
| 51 | Tech/HUD Mono | Mono+Mono | Share Tech Mono | Fira Code | tech, sci-fi, HUD | Sci-fi interfaces, cybersecurity |
| 52 | Pixel Retro | Display+Sans | Press Start 2P | VT323 | pixel, retro, 8-bit, arcade | Pixel art games, retro websites |
| 53 | Neubrutalist Bold | Display+Sans | Lexend Mega | Public Sans | neubrutalist, loud, bold | Neubrutalist, Gen Z brands |
| 54 | Academic/Archival | Serif+Serif | EB Garamond | Crimson Text | academic, traditional | University, archives, research |
| 55 | Spatial Clear | Sans+Sans | Inter | Inter | spatial, glass, system | Spatial computing, AR/VR, glass UI |
| 56 | Kinetic Motion | Display+Mono | Syncopate | Space Mono | kinetic, speed, futuristic | Music festivals, automotive |
| 57 | Gen Z Brutal | Display+Sans | Anton | Epilogue | brutal, loud, meme | Gen Z marketing, streetwear |

## Knowledge Base: UX Quick Check (High Severity)

Post-extraction validation checklist. After extracting tokens, verify the site against these critical UX guidelines. Items marked HIGH severity = must fix.

**Usage:** Run extracted CSS/HTML tokens through each check. Flag violations with severity and recommended fix.

### Navigation
| Issue | Do | Don't | Good Example | Bad Example |
|---|---|---|---|---|
| Smooth Scroll | `scroll-behavior: smooth` on html | Jump without transition | `html { scroll-behavior: smooth }` | `<a href='#section'>` no CSS |
| Back Button | Preserve navigation history | Break browser back | `history.pushState()` | `location.replace()` |

### Animation
| Issue | Do | Don't | Good Example | Bad Example |
|---|---|---|---|---|
| Excessive Motion | Animate 1-2 key elements max | Animate everything | Single hero animation | `animate-bounce` on 5+ elements |
| Reduced Motion | Check `prefers-reduced-motion` | Ignore motion settings | `@media (prefers-reduced-motion: reduce)` | No motion query |
| Loading States | Skeleton screens or spinners | Frozen UI, no feedback | `animate-pulse` skeleton | Blank screen while loading |
| Hover vs Tap | Use click/tap for primary actions | Rely only on hover | `onClick` handler | `onMouseEnter` only |

### Layout
| Issue | Do | Don't | Good Example | Bad Example |
|---|---|---|---|---|
| Z-Index Management | Define scale system (10,20,30,50) | Arbitrary large values | `z-10 z-20 z-50` | `z-[9999]` |
| Content Jumping | Reserve space for async content | Let content push layout | `aspect-ratio` or fixed height | No dimensions on images |

### Touch
| Issue | Do | Don't | Good Example | Bad Example |
|---|---|---|---|---|
| Touch Target Size | Minimum 44x44px targets | Tiny clickable areas | `min-h-[44px] min-w-[44px]` | `w-6 h-6` buttons |

### Interaction
| Issue | Do | Don't | Good Example | Bad Example |
|---|---|---|---|---|
| Focus States | Visible focus rings | Remove outline without replacement | `focus:ring-2 focus:ring-blue-500` | `outline-none` only |
| Loading Buttons | Disable + show loading state | Allow multiple clicks | `disabled={loading}` + spinner | Button clickable while loading |
| Error Feedback | Clear error messages near problem | Silent failures | Red border + error message | No indication |
| Confirmation Dialogs | Confirm before destructive actions | Delete without confirmation | "Are you sure?" modal | Direct delete on click |

### Accessibility
| Issue | Do | Don't | Good Example | Bad Example |
|---|---|---|---|---|
| Color Contrast | Min 4.5:1 ratio for text | Low contrast text | `#333` on white (7:1) | `#999` on white (2.8:1) |
| Color Only | Use icons/text + color | Color-only information | Red text + error icon | Red border only |
| Alt Text | Descriptive alt for images | Empty/missing alt | `alt='Dog playing in park'` | `alt=''` for content |
| ARIA Labels | `aria-label` for icon buttons | Icon buttons without labels | `aria-label='Close menu'` | `<button><Icon/></button>` |
| Keyboard Nav | Tab order matches visual order | Keyboard traps | `tabIndex` for custom order | Unreachable elements |
| Form Labels | `<label>` with `for` attribute | Placeholder-only inputs | `<label for='email'>` | `placeholder='Email'` only |
| Error Messages | `aria-live` or `role=alert` | Visual-only errors | `role='alert'` | Red border only |
| Motion Sensitivity | Respect `prefers-reduced-motion` | Force scroll effects | `@media (prefers-reduced-motion)` | `ScrollTrigger.create()` |

### Performance
| Issue | Do | Don't | Good Example | Bad Example |
|---|---|---|---|---|
| Image Optimization | Appropriate size + WebP | Unoptimized full-size | `srcset` with multiple sizes | 4000px for 400px display |

### Forms
| Issue | Do | Don't | Good Example | Bad Example |
|---|---|---|---|---|
| Input Labels | Visible label above/beside input | Placeholder as only label | `<label>Email</label><input>` | `placeholder='Email'` only |
| Submit Feedback | Loading then success/error state | No feedback after submit | Loading -> Success message | No response on click |

### Responsive
| Issue | Do | Don't | Good Example | Bad Example |
|---|---|---|---|---|
| Touch Friendly | Increase targets on mobile | Same tiny buttons | Larger buttons on mobile | Desktop-sized on mobile |
| Readable Font Size | Min 16px body on mobile | Tiny text | `text-base` or larger | `text-xs` for body |
| Viewport Meta | `width=device-width, initial-scale=1` | Missing viewport | `<meta name='viewport'...>` | No viewport tag |
| Horizontal Scroll | Content fits viewport width | Content wider than viewport | `max-w-full overflow-x-hidden` | Horizontal scrollbar |

### Typography
| Issue | Do | Don't | Good Example | Bad Example |
|---|---|---|---|---|
| Contrast Readability | Darker text on light bg | Gray on gray | `text-gray-900` on white | `text-gray-400` on `gray-100` |

### Feedback
| Issue | Do | Don't | Good Example | Bad Example |
|---|---|---|---|---|
| Loading Indicators | Spinner/skeleton for >300ms waits | No feedback | Skeleton or spinner | Frozen UI |

### AI Interaction
| Issue | Do | Don't | Good Example | Bad Example |
|---|---|---|---|---|
| AI Disclaimer | Clearly label AI content | Present AI as human | "AI Assistant" label | Fake human name |

### Spatial UI
| Issue | Do | Don't | Good Example | Bad Example |
|---|---|---|---|---|
| Gaze Hover | Scale/highlight on look | Static until pinch | `hoverEffect()` | `onTap` only |
