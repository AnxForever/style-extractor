/**
 * W3C Design Tokens Community Group format (2025.10).
 *
 * The extraction engine emits seven bespoke formats and none of them is a
 * standard, which means every consumer needs a dedicated adapter. DTCG 2025.10
 * is the first stable release of the spec and is consumed directly by Style
 * Dictionary, Tokens Studio and Figma, so emitting it turns the output from
 * something that needs integration work into something that already fits.
 *
 * The agent proposes plain hex because that is what a model reliably produces.
 * Conversion to the spec's structured colour value happens here, at the edge,
 * rather than being pushed into the prompt.
 */

import type { DtcgGroup, DtcgToken } from "../agent/tools.js";

export const DTCG_MEDIA_TYPE = "application/design-tokens+json";
export const DTCG_VERSION = "2025.10";

/** Token types defined by the spec. */
export const DTCG_TYPES = [
  "color",
  "dimension",
  "fontFamily",
  "fontWeight",
  "duration",
  "cubicBezier",
  "number",
  "strokeStyle",
  "border",
  "transition",
  "shadow",
  "gradient",
  "typography",
] as const;

export type DtcgType = (typeof DTCG_TYPES)[number];

export interface DtcgColorValue {
  readonly colorSpace: "srgb";
  /** Channel values in 0..1, per the spec, not 0..255. */
  readonly components: readonly [number, number, number];
  readonly alpha: number;
  readonly hex: string;
}

export interface ValidationIssue {
  readonly path: string;
  readonly message: string;
  readonly severity: "error" | "warning";
}

const HEX = /^#([0-9a-f]{6})$/i;

function toColorValue(hex: string): DtcgColorValue | null {
  const match = HEX.exec(hex.trim());
  if (!match?.[1]) return null;
  const value = Number.parseInt(match[1], 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return {
    colorSpace: "srgb",
    components: [
      Number((r / 255).toFixed(4)),
      Number((g / 255).toFixed(4)),
      Number((b / 255).toFixed(4)),
    ],
    alpha: 1,
    hex: `#${match[1].toLowerCase()}`,
  };
}

function isToken(node: unknown): node is DtcgToken {
  return typeof node === "object" && node !== null && "$value" in node;
}

export interface DtcgDocument {
  readonly $description?: string;
  readonly [key: string]: unknown;
}

/**
 * Convert an agent proposal into spec-shaped output.
 *
 * Colour values are widened from hex strings to the structured form the 2025.10
 * spec requires. A token whose hex cannot be parsed is passed through
 * unchanged rather than dropped, so validation reports it instead of the
 * document silently losing entries.
 */
export function toDtcgDocument(
  proposal: DtcgGroup,
  meta?: { readonly source?: string; readonly description?: string },
): DtcgDocument {
  const convert = (group: DtcgGroup): DtcgGroup => {
    const out: DtcgGroup = {};
    for (const [key, value] of Object.entries(group)) {
      if (key.startsWith("$")) {
        out[key] = value;
        continue;
      }
      if (isToken(value)) {
        const type = value.$type;
        if (type === "color" && typeof value.$value === "string") {
          const color = toColorValue(value.$value);
          out[key] = color
            ? ({
                ...value,
                $type: "color",
                $value: color as unknown as string,
              } as DtcgToken)
            : value;
        } else {
          out[key] = value;
        }
        continue;
      }
      if (value && typeof value === "object") {
        out[key] = convert(value as DtcgGroup);
      }
    }
    return out;
  };

  const document: Record<string, unknown> = { ...convert(proposal) };
  const description = meta?.description ?? (meta?.source ? `Extracted from ${meta.source}` : undefined);
  if (description) document["$description"] = description;
  return document as DtcgDocument;
}

/**
 * Validate a document against the parts of the spec that matter in practice.
 *
 * Deliberately not a full schema implementation. It checks the constraints
 * that break real consumers: a missing $value, an unknown $type, a name that
 * collides with the reserved $ prefix, and a name containing the group
 * separator -- each of which produces a confusing downstream failure rather
 * than an obvious one.
 */
export function validateDtcg(document: unknown): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const walk = (node: unknown, path: string, inheritedType?: string): void => {
    if (!node || typeof node !== "object" || Array.isArray(node)) {
      issues.push({ path, message: "expected a token or group object", severity: "error" });
      return;
    }

    const record = node as Record<string, unknown>;
    const groupType = typeof record["$type"] === "string" ? (record["$type"] as string) : inheritedType;

    if (isToken(record)) {
      const type = typeof record["$type"] === "string" ? (record["$type"] as string) : inheritedType;
      if (!type) {
        issues.push({
          path,
          message: "token has no $type and no group provides one",
          severity: "warning",
        });
      } else if (!(DTCG_TYPES as readonly string[]).includes(type)) {
        issues.push({ path, message: `unknown $type "${type}"`, severity: "error" });
      }

      if (type === "color") {
        const value = record["$value"];
        const structured =
          typeof value === "object" &&
          value !== null &&
          "colorSpace" in value &&
          "components" in value;
        if (typeof value === "string") {
          if (!HEX.test(value)) {
            issues.push({ path, message: `colour "${value}" is not 6-digit hex`, severity: "error" });
          } else {
            issues.push({
              path,
              message: "colour is a bare string; 2025.10 expects a structured value",
              severity: "warning",
            });
          }
        } else if (structured) {
          const components = (value as { components?: unknown }).components;
          if (
            !Array.isArray(components) ||
            components.length !== 3 ||
            components.some((c) => typeof c !== "number" || c < 0 || c > 1)
          ) {
            issues.push({
              path,
              message: "colour components must be three numbers in 0..1",
              severity: "error",
            });
          }
        } else {
          issues.push({ path, message: "unrecognised colour value", severity: "error" });
        }
      }
      return;
    }

    for (const [key, value] of Object.entries(record)) {
      if (key.startsWith("$")) continue;
      const childPath = path ? `${path}.${key}` : key;
      if (key.includes(".")) {
        issues.push({
          path: childPath,
          message: "name contains '.', which is the group path separator",
          severity: "error",
        });
      }
      if (key.trim() !== key || key.length === 0) {
        issues.push({ path: childPath, message: "name is empty or padded", severity: "error" });
      }
      walk(value, childPath, groupType);
    }
  };

  walk(document, "");
  return issues;
}

export function serializeDtcg(document: DtcgDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}
