# style-extractor eval harness

An evaluation harness for the design-token extraction engine in this repository.
It runs the extractor against a fixed set of live sites without human
supervision, and scores the result in four independent layers so that a failure
can be attributed to a cause rather than reported as a single number.

## Why this exists

The extraction engine is roughly 20k lines of browser-injected analysis plus a
2k-line skill document. It works, in the sense that it returns data. Whether
that data is any good was, until now, a matter of opinion -- there was no way to
run it over many sites unattended, and no definition of "good" that could be
computed.

Four complaints motivated the work, and they turn out to be layered rather than
parallel: each one only becomes visible once the one before it is satisfied.

```
L1  many sites cannot be scraped     ->  no data at all
L2  extracted values are wrong       ->  data exists but is false
L3  output is too noisy to use       ->  data is true but unconsumable
L4  values are right, it looks wrong ->  everything above passes, and it still fails
```

Reporting one blended score would hide all of this. Reporting four does not.

## Baseline results

18 sites, chosen by failure mode rather than by appearance. Full table in
`runs/baseline-final/baseline-report.md`.

| layer | result |
|---|---|
| L1 reachability | **17/18** (the one failure is an HTTP 403 bot wall) |
| L2 accuracy | mean **0.824** |
| L3 usability | mean **0.363** |
| L4 perception | mean **0.516** |

Three findings did not survive contact with the data:

**L1 was never the real problem.** The original loader fetched each module over
HTTP and `eval`'d it in page context, which fails on any site with a
restrictive CSP or missing CORS headers. Passing module source directly to
`page.evaluate` runs it through CDP instead, where page CSP does not apply.
Scrape success went from "many sites fail" to 17/18 without touching a line of
extraction logic.

**Recall was masking precision.** Mean palette recall is **0.990** -- the
extractor essentially never misses a colour. Mean precision is **0.690**: about
a third of what it reports was never painted on the page, having been read out
of stylesheet rules that never rendered. The relationship is monotone in payload
size:

| colours claimed | precision |
|---|---|
| 7 | 0.98 |
| 20 | 0.94 |
| 109 | 0.74 |
| 288 | 0.43 |
| 329 | 0.40 |

An earlier version of this harness scored recall alone and reported 11 of 17
sites at a perfect 1.00. That number was meaningless: an extractor that emits
every colour it can find covers any reference set by brute force. The scoring
change is guarded by a regression test that asserts the brute-force strategy
still wins on recall but loses on the combined score.

**"Right values, wrong look" is real and measurable.** Several sites score high
on value accuracy and low on perceptual match:

| site | L2 | L4 | tone |
|---|---|---|---|
| linear.app | 0.95 | 0.40 | 0.00 |
| www.framer.com | 0.96 | 0.38 | 0.00 |
| clerk.com | 0.96 | 0.42 | 0.00 |
| svelte.dev | 0.96 | 0.90 | 0.99 |

The cause is structural, not a bug: the extractor emits a list of colours with
no indication of how much of the page each one covers. Visual character lives in
that distribution, so a palette can be correct as a set and still rebuild into
something with the wrong tonal balance. `svelte.dev` scoring 0.90 confirms the
metric discriminates rather than simply punishing everything.

## Design decisions

**Ground truth shares no code with the system under test.** If the judge reused
the extractor's colour parsing or element selection, systematic mistakes would
cancel out and every score would look good. Truth is measured, never inferred:
it is what the browser actually painted.

**Colour comparison goes through CIEDE2000, never string equality.** `#0d0d0d`
and `#0f0f0f` are the same decision; `lab()`, `oklch()` and hex are the same
colour in different notation. The implementation is verified against the
Sharma-Wu-Dalal reference pairs, which exist because the hue-rotation term is
easy to get subtly wrong in a way that only shows on blue and purple.

**The browser is used as the colour parser.** Rather than reimplementing CSS
Color 4 in Node, candidate strings are rasterized through a canvas in page
context. This removes an entire class of disagreement where a parser bug would
be scored as an extractor error.

**Theme switching is exercised at the CDP level.** `prefers-color-scheme` is a
browser-level media feature; page-level JavaScript cannot change it. Any
extractor running purely inside the page will therefore report identical values
for both themes no matter how it is written. This is an architectural ceiling of
the skill-shaped approach, not an implementation defect, and it is why the
harness exists as a separate layer. Five of seventeen sites are diagnosed
`collapsed` by this check.

**Deterministic metrics first; LLM judging only where it is unavoidable.**
L1 through L4 are all computed. LLM-as-judge carries position bias, length bias
and self-preference, and needs calibration against human labels before its
output can be trusted -- so it is worth reaching for only when a question is
genuinely subjective, and none of these four are yet.

**Failures are classified, not just counted.** Every run ends in one of five
stages (`navigation`, `readiness`, `injection`, `extraction`, `empty`) with a
specific reason and a retryable flag, because each maps to a different fix.
Bot-challenge interstitials are detected explicitly: they return HTTP 200, and
without a check the harness would happily produce a design system for a CAPTCHA
page.

**Readiness requires text, structure and painted area together.** An
any-of-three check passes on an unhydrated SPA shell, and every downstream
metric then measures an empty page while reporting success. A readiness timeout
is a more useful outcome than a confident measurement of nothing.

## Layout

```
src/harness/
  driver.ts      navigate, inject, extract, collect truth; five-stage failure classification
  errors.ts      failure taxonomy with retryability
  scripts.ts     module load order and criticality
src/eval/
  color.ts       CIEDE2000, palette coverage/reality, Earth Mover's Distance
  ground-truth.ts  in-page measurement, alpha compositing, CDP theme emulation
  accuracy.ts    L2
  usability.ts   L3
  fingerprint.ts L4
  golden-set.ts  18 sites tagged by the difficulty each one probes
src/cli.ts       batch runner
src/report.ts    markdown report generation
```

## Running it

```bash
pnpm install
pnpm exec tsx src/cli.ts --url https://example.com --preset style --truth
pnpm exec tsx src/cli.ts --golden --preset style --truth --out runs/baseline
pnpm exec tsx src/report.ts runs/baseline
node --import tsx --test 'src/**/*.test.ts'
```

## Known limits

- L4 currently characterises colour distribution only. Typography scale and
  spacing rhythm contribute to perceived similarity and are not yet scored.
- Palette precision is measured against colours painted in the sampled
  viewport; a colour that only appears far below the fold can be counted as
  invented.
- The greedy transport in `paletteEmd` is an approximation. It is monotone,
  which is sufficient for ranking, but it is not the LP optimum. The 1-D
  histogram EMD used by L4 is exact.
- One golden-set site is behind a bot wall and cannot be scored.
