/**
 * Golden set for baseline evaluation.
 *
 * Sites are chosen by failure mode, not by how good they look. A set of
 * beautiful sites all built the same way would produce a flattering number
 * that hides whole categories of breakage. Each entry declares the difficulty
 * it is meant to expose, so a failure can be attributed to a class of problem
 * rather than to one unlucky URL.
 */

export type DifficultyTag =
  /** Server-rendered, stable markup. Should always work; regressions here are alarms. */
  | "static"
  /** Client-rendered; content appears after hydration. Stresses readiness detection. */
  | "spa"
  /** Heavy scroll/hover choreography. Stresses motion capture. */
  | "motion"
  /** Theme switches via prefers-color-scheme media query (browser-level state). */
  | "theme-media"
  /** Theme switches via a class or data attribute on a root element (page-level state). */
  | "theme-class"
  /** Embeds third-party widgets whose internal variables pollute the token set. */
  | "third-party-noise"
  /** Ships CSS Color 4 values such as lab()/oklch(). */
  | "modern-color"
  /** Known to sit behind bot protection; exercises the interstitial detector. */
  | "bot-protected"
  /** Minimal or no design system. Boundary case for token convergence. */
  | "sparse";

export interface GoldenSite {
  readonly url: string;
  readonly label: string;
  readonly tags: readonly DifficultyTag[];
  /** What this entry is specifically expected to break or prove. */
  readonly probes: string;
}

export const GOLDEN_SET: readonly GoldenSite[] = [
  {
    url: "https://tailwindcss.com",
    label: "tailwindcss",
    tags: ["static", "theme-media", "third-party-noise", "modern-color"],
    probes: "prefers-color-scheme theming, DocSearch variable pollution, lab() colors",
  },
  {
    url: "https://ui.shadcn.com",
    label: "shadcn-ui",
    tags: ["static", "theme-class", "modern-color"],
    probes: "class-driven dark mode, oklch token set, dense component surface",
  },
  {
    url: "https://react.dev",
    label: "react-dev",
    tags: ["spa", "theme-class", "third-party-noise"],
    probes: "hydration timing, class-based theme toggle",
  },
  {
    url: "https://svelte.dev",
    label: "svelte-dev",
    tags: ["spa", "theme-class"],
    probes: "framework docs shell, deferred content",
  },
  {
    url: "https://astro.build",
    label: "astro",
    tags: ["static", "modern-color", "motion"],
    probes: "gradient-heavy branding, modern color functions",
  },
  {
    url: "https://nextjs.org",
    label: "nextjs",
    tags: ["spa", "theme-media", "motion"],
    probes: "dark-first palette, route-level hydration",
  },
  {
    url: "https://vercel.com",
    label: "vercel",
    tags: ["spa", "motion", "theme-media"],
    probes: "geist design system, heavy client rendering",
  },
  {
    url: "https://linear.app",
    label: "linear",
    tags: ["spa", "motion", "modern-color"],
    probes: "signature dark aesthetic, scroll choreography",
  },
  {
    url: "https://stripe.com",
    label: "stripe",
    tags: ["motion", "spa"],
    probes: "animated gradient hero, canvas-driven visuals",
  },
  {
    url: "https://supabase.com",
    label: "supabase",
    tags: ["spa", "theme-class", "modern-color"],
    probes: "dark-first brand, large token surface",
  },
  {
    url: "https://resend.com",
    label: "resend",
    tags: ["static", "motion", "modern-color"],
    probes: "restrained modern palette, small precise system",
  },
  {
    url: "https://getbootstrap.com",
    label: "bootstrap",
    tags: ["static", "theme-class"],
    probes: "legacy-style CSS variables, conventional palette",
  },
  {
    url: "https://developer.mozilla.org/en-US/",
    label: "mdn",
    tags: ["static", "theme-class", "third-party-noise"],
    probes: "content-dense reference site, long typographic scale",
  },
  {
    url: "https://news.ycombinator.com",
    label: "hacker-news",
    tags: ["static", "sparse"],
    probes: "almost no design system; token convergence boundary case",
  },
  {
    url: "https://www.apple.com",
    label: "apple",
    tags: ["motion", "spa", "bot-protected"],
    probes: "scroll-driven media, aggressive edge caching",
  },
  {
    url: "https://www.framer.com",
    label: "framer",
    tags: ["spa", "motion"],
    probes: "animation-first marketing site",
  },
  {
    url: "https://clerk.com",
    label: "clerk",
    tags: ["spa", "theme-media", "modern-color"],
    probes: "product marketing with themed component previews",
  },
  {
    url: "https://openai.com",
    label: "openai",
    tags: ["spa", "bot-protected", "sparse"],
    probes: "minimal monochrome system behind edge protection",
  },
] as const;

export function sitesByTag(tag: DifficultyTag): readonly GoldenSite[] {
  return GOLDEN_SET.filter((site) => site.tags.includes(tag));
}
