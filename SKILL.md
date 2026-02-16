---
name: style-extractor
description: Extract evidence-based web UI style + motion guides with multi-format output (Markdown, JSON, Tailwind, StyleKit). Now with website structure extraction and framework code generation.
---

# Style Extractor v3.0 (Web Style + Motion + Components + Structure)

This skill extracts a reusable design system from **web UIs**: colors, typography, spacing, components, states, and—when the UI is dynamic—motion (runtime timings, keyframes, delay chains).

**New in v3.0:**
- Website structure extraction (DOM tree, layout patterns, breakpoints)
- Framework code generation (HTML skeleton, React TSX, Vue SFC)
- Standard export format for style collection websites
- Enhanced component boundary detection

**v2.0 features:**
- Multiple output formats (JSON, Tailwind, CSS Variables, StyleKit)
- Enhanced component detection with state matrices
- StyleKit integration for direct import
- Stronger motion evidence requirements

## Output location (REQUIRED)

- Save all generated deliverables under: `%USERPROFILE%\style-extractor\`
- Never write generated outputs under the skill folder (`.codex/skills/...`)

Recommended structure:
```
%USERPROFILE%\style-extractor\<project>-<style>\
├── style.md                    # Main style guide
├── tokens.json                 # JSON tokens
├── tailwind.config.js          # Tailwind config
├── stylekit.ts                 # StyleKit import file
├── variables.css               # CSS variables
│
├── structure/                  # Structure data (NEW)
│   ├── dom-tree.json
│   ├── layout-patterns.json
│   ├── breakpoints.json
│   └── semantic.json
│
├── code/                       # Generated code (NEW)
│   ├── skeleton.html
│   ├── react/
│   │   ├── Page.tsx
│   │   ├── Header.tsx
│   │   ├── Navigation.tsx
│   │   ├── Hero.tsx
│   │   └── Footer.tsx
│   └── vue/
│       └── *.vue
│
├── export.json                 # Standard export (NEW)
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
| `style-tokens.json` | JSON | Raw normalized token data |

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

### Website replication (NEW in v3.0)

```
Replicate the structure of https://example.com
Extract:
- Full DOM structure with layout patterns
- Responsive breakpoints
- Component boundaries
Generate:
- React components (TypeScript)
- HTML skeleton
- Standard export for collection
```

### Full extraction with code generation (NEW in v3.0)

```
Extract https://stripe.com/docs with:
- Complete style tokens
- Website structure (DOM tree, layouts, breakpoints)
- React component generation
- Standard export format
Output: All formats + generated code
```
