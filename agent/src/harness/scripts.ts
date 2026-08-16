/**
 * Authoritative load order for the style-extractor browser modules.
 *
 * Mirrors tests/load-scripts.js, which is the source of truth maintained
 * alongside the extraction engine. Order matters: utils.js installs shared
 * helpers that later modules read at definition time, and registry.js must
 * load last because it enumerates whatever is already installed.
 */
export interface ExtractorModule {
  /** File name inside ../scripts */
  readonly file: string;
  /** Global namespace the IIFE installs on window */
  readonly global: string;
  /** Missing critical modules make an extraction run meaningless */
  readonly critical: boolean;
}

export const EXTRACTOR_MODULES: readonly ExtractorModule[] = [
  { file: "utils.js", global: "__seUtils", critical: true },
  { file: "structure-extract.js", global: "__seStructure", critical: true },
  { file: "css-parser.js", global: "__seCSS", critical: false },
  { file: "component-detect.js", global: "__seComponents", critical: true },
  { file: "state-capture.js", global: "__seStateCapture", critical: false },
  { file: "ai-semantic.js", global: "__seAISemantic", critical: false },
  { file: "a11y-tree.js", global: "__seA11y", critical: false },
  { file: "responsive-extract.js", global: "__seResponsive", critical: false },
  { file: "stylekit-adapter.js", global: "__seStyleKit", critical: true },
  { file: "theme-detect.js", global: "__seTheme", critical: false },
  { file: "motion-tools.js", global: "__seMotion", critical: false },
  { file: "motion-enhanced.js", global: "__seMotionEnhanced", critical: false },
  { file: "motion-assoc.js", global: "__seMotionAssoc", critical: false },
  { file: "screenshot-helper.js", global: "__seScreenshot", critical: false },
  { file: "library-detect.js", global: "__seLibs", critical: false },
  { file: "code-generator.js", global: "__seCodeGen", critical: false },
  { file: "replica-blueprint.js", global: "__seBlueprint", critical: false },
  { file: "format-converter.js", global: "__seFormat", critical: false },
  { file: "pattern-detect.js", global: "__sePatternDetect", critical: false },
  { file: "export-schema.js", global: "__seExport", critical: false },
  { file: "incremental.js", global: "__seIncremental", critical: false },
  { file: "multi-page.js", global: "__seMultiPage", critical: false },
  { file: "registry.js", global: "__seRegistry", critical: true },
] as const;

/** Presets accepted by window.extractStyle, defined in scripts/registry.js. */
export const EXTRACTION_PRESETS = [
  "minimal",
  "style",
  "components",
  "motion",
  "ai-semantic",
  "replica",
  "full",
] as const;

export type ExtractionPreset = (typeof EXTRACTION_PRESETS)[number];

export function isExtractionPreset(value: string): value is ExtractionPreset {
  return (EXTRACTION_PRESETS as readonly string[]).includes(value);
}
