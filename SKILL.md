---
name: style-extractor
description: Extract evidence-based web UI style + motion guides with multi-format output (Markdown, JSON, Tailwind, StyleKit).
---

# Style Extractor v2.0 (Web Style + Motion + Components)

This skill extracts a reusable design system from **web UIs**: colors, typography, spacing, components, states, and—when the UI is dynamic—motion (runtime timings, keyframes, delay chains).

**New in v2.0:**
- Multiple output formats (JSON, Tailwind, CSS Variables, StyleKit)
- Enhanced component detection with state matrices
- StyleKit integration for direct import
- Stronger motion evidence requirements

## Output location (REQUIRED)

- Save all generated deliverables under: `%USERPROFILE%\style-extractor\`
- Never write generated outputs under the skill folder (`.codex/skills/...`)

Recommended structure:
```
%USERPROFILE%\style-extractor\
├── <project>-<style>-style.md           # Main style guide
├── <project>-<style>-tokens.json        # JSON tokens
├── <project>-<style>-tailwind.js        # Tailwind config
├── <project>-<style>-stylekit.ts        # StyleKit import file
└── <project>-<style>-evidence\          # Raw evidence
    ├── screenshots\
    ├── css\
    └── motion\
```

## References (quality bar)

- `references/endfield-design-system-style.md` — best-practice **style + motion** reference
- `references/motherduck-design-system-style.md` — strong **static style** reference

---

## Quick Start

For a complete extraction with all outputs:

```javascript
// 1. Load all tools
await evaluate_script({ function: `
  const scripts = ['motion-tools.js', 'library-detect.js', 'component-detect.js',
                   'format-converter.js', 'stylekit-adapter.js'];
  // Scripts are loaded via separate evaluate_script calls
` });

// 2. Run full extraction
const result = await evaluate_script({ function: `
  (() => {
    const motion = window.__seMotion?.capture('full') || {};
    const libs = window.__seLibs || {};
    const components = window.__seComponents?.generateReport() || {};
    const stylekit = window.__seStyleKit?.extract() || {};

    return {
      motion,
      libraries: libs,
      components,
      stylekit,
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

---

## Scripts Reference

### `scripts/motion-tools.js`

Runtime animation capture and sampling.

```javascript
window.__seMotion.capture(label)      // Capture all animations
window.__seMotion.sample(el, opts)    // Sample computed styles per frame
```

### `scripts/library-detect.js`

Detect third-party animation libraries.

```javascript
// Returns: { globals, dom, fingerprints, assets }
```

### `scripts/component-detect.js` (NEW)

Component pattern detection and state extraction.

```javascript
window.__seComponents.detectAll()              // Find all components
window.__seComponents.extractStates(selector)  // Get element states
window.__seComponents.generateReport()         // Full component report
window.__seComponents.analyzeHierarchy()       // Layout structure
```

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

### `scripts/stylekit-adapter.js` (NEW)

StyleKit integration adapter.

```javascript
window.__seStyleKit.collect()        // Collect page data
window.__seStyleKit.normalize()      // Normalize to StyleKit format
window.__seStyleKit.generateFiles()  // Generate import files
window.__seStyleKit.extract()        // Full pipeline
```

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
