# style-extractor

Extract design tokens from any live website. Get colors, typography, spacing, and component patterns as Tailwind classes, CSS variables, JSON tokens, or AI-ready prompts.

Built as an [AI agent skill](https://skills.sh/) for Claude Code / Codex, but works standalone in any browser console.

## What it does

style-extractor injects into a live webpage via Chrome DevTools and reads the actual computed styles. No screenshots, no guessing -- real `getComputedStyle()` values converted to usable design tokens.

| Capability | Output |
|------------|--------|
| **Color palette** | Semantic roles (primary, background, text...) mapped to Tailwind classes via CIE2000 perceptual matching |
| **Typography** | Font families, size scale, weights, line heights |
| **Spacing** | Padding/margin/gap frequency analysis |
| **Components** | Button, card, input, nav detection with variant/state diffs |
| **Motion** | Transition durations, easings, animation keyframes |
| **AI prompt** | Structured `<design-system>` prompt ready for Claude/GPT |

## Output formats

| File | Format | Use case |
|------|--------|----------|
| `tokens.json` | JSON | Data exchange, tooling integration |
| `variables.css` | CSS Custom Properties | Drop into any CSS project |
| `tailwind.config.js` | Tailwind config | Extend your Tailwind theme |
| `style-tokens.ts` | TypeScript (`createStyleTokens`) | StyleKit integration |
| `style-recipes.ts` | TypeScript (`createStyleRecipes`) | Component recipe definitions |
| `design-system-prompt.md` | Markdown | Feed to AI for consistent UI generation |
| `style-definition.ts` | TypeScript | Full style definition object |

## Quick start

### Prerequisites

- Chrome browser
- [chrome-devtools-mcp](https://github.com/anthropics/chrome-devtools-mcp) (for AI agent usage)

### As an AI agent skill

1. Clone this repo into your skills directory:
   ```bash
   # Claude Code
   git clone https://github.com/anthropics/style-extractor ~/.claude/skills/public/style-extractor/

   # Codex
   git clone https://github.com/anthropics/style-extractor ~/.codex/skills/public/style-extractor/
   ```

2. Ask your agent:
   ```
   Extract the design tokens from https://example.com
   ```

### Manual (browser console)

1. Open the target website in Chrome
2. Open DevTools (F12) -> Console
3. Load the scripts:
   ```javascript
   // Set the base URL to where you cloned the repo
   window.__seScriptBase = 'http://localhost:8080/scripts/';
   // Then paste and run tests/load-scripts.js
   ```
4. Run extraction:
   ```javascript
   const result = await extractStyle({ preset: 'full' });
   console.log(result.data);
   ```

### Automated smoke test (CI-friendly)

From the project root (`D:/stylekit`):

```bash
npm run test:style-extractor
```

For CI (syntax + consistency + tests):

```bash
npm run test:style-extractor:ci
```

## API

### Unified entry point

```javascript
// Full extraction with all modules
const result = await extractStyle({ preset: 'full' });

// Presets: 'minimal', 'style', 'components', 'full'
// Options: includeRecipes, includePrompt, includeConfidence

// Result health metadata
// result.meta.status: 'ok' | 'partial' | 'empty' | 'error'
// result.warnings[*].code / result.errors[*].code provide machine-readable issue types
```

### StyleKit adapter

```javascript
// Complete pipeline
const { files } = window.__seStyleKit.extract();
// files['tokens.json'], files['style-tokens.ts'], files['style-recipes.ts'], etc.

// Individual APIs
window.__seStyleKit.generateTokens();       // -> style-tokens.ts content
window.__seStyleKit.generateRecipes();      // -> style-recipes.ts content
window.__seStyleKit.generatePrompt();       // -> AI design system prompt
window.__seStyleKit.getConfidenceReport();  // -> { overall, components, colors }
```

### Color matching

Colors are matched to Tailwind's palette using the CIE2000 Delta-E algorithm (perceptual distance in CIELAB color space), not simple RGB euclidean distance. Supports `rgb()`, `hsl()`, `oklch()`, `lab()`, and `color(srgb)` input formats.

## Architecture

23 browser-injected scripts, each registering on a `window.__se*` global:

| Module | Global | Purpose |
|--------|--------|---------|
| `utils.js` | `__seUtils` | Shared utilities, must load first |
| `css-parser.js` | `__seCSS` | CSS variable extraction, reverse map |
| `component-detect.js` | `__seComponents` | Component pattern detection |
| `stylekit-adapter.js` | `__seStyleKit` | Token normalization, recipe/prompt generation |
| `structure-extract.js` | `__seStructure` | DOM tree, layout patterns, breakpoints |
| `registry.js` | `__seRegistry` | Module registry, `extractStyle()` entry point |
| `format-converter.js` | `__seFormat` | Multi-format output conversion |
| `export-schema.js` | `__seExport` | Standard export schema |
| `replica-blueprint.js` | `__seBlueprint` | Blueprint IR for LLM consumption |
| `motion-tools.js` | `__seMotion` | Runtime animation capture |
| `pattern-detect.js` | `__sePatternDetect` | Repeating pattern detection |
| `theme-detect.js` | `__seTheme` | Dark/light theme detection |
| ... | ... | See `tests/e2e-test.html` for full list |

All modules are optional -- load only what you need. The registry auto-discovers whatever is available.

## Known limitations

- **Cross-origin CSS**: Stylesheets from CDNs cannot be iterated for `:hover`/`:focus` rules. The tool falls back to event simulation, which captures JS-driven state changes but not pure CSS pseudo-class transitions.
- **Shadow DOM**: Styles inside Web Components are not accessible.
- **Dynamic content**: SPA routes require navigation + re-extraction for each page.
- **Color spaces**: While `oklch()` and `lab()` are supported, the conversion to sRGB may clip out-of-gamut colors.

## Confidence scoring

Every extraction result includes a confidence level (`high` / `medium` / `low`) based on:
- **Components**: instance count + state coverage
- **Colors**: usage frequency across semantic roles
- **Overall**: majority vote across all signals

```javascript
const report = window.__seStyleKit.getConfidenceReport();
// { overall: 'medium', components: { button: { count: 3, confidence: 'high' } }, ... }
```

## License

MIT

## Contributing

Issues and PRs welcome at [github.com/AnxForever/style-extractor](https://github.com/AnxForever/style-extractor)
