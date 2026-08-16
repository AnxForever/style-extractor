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

## The agent

The extraction engine already finds every value on the page. What it cannot do
is decide which of those values constitute a design decision, or what to call
them -- computed styles carry values, never intent. That judgement is the only
thing the model is asked for; all measurement stays in code.

The gap is quantifiable. Scoring the raw extraction of `tailwindcss.com` as if
it had been proposed verbatim:

```
coverage 0.917   reality 0.940   convergence 1.00   ->  values are right
roleAccuracy 0   semanticNaming 0                   ->  and it is not a design system
combined: 0.521
```

92% of the colours that matter are present and 94% of what is reported is
genuinely painted, yet the result scores 0.52 because nothing identifies which
colour is the page surface, which is body text, or what any of them are for.

### Loop

```
plan -> call tools -> observe -> score against measurements -> revise
```

Six tools, bounded by the agent's decisions rather than by the engine's 23
internal modules: `survey`, `list_colors`, `list_variables`, `check_color`,
`propose_tokens`, `score_proposal`. Exposing one tool per module would force
the model to reason about whether to call `motion-assoc` or `motion-enhanced`,
which is not a question it should be spending tokens on.

`score_proposal` is what closes the loop, and it is deterministic. A second
model grading the first would import position bias, length bias and
self-preference into the one component that has to stay trustworthy, and would
need calibration against human labels before its numbers meant anything. Here
the grader is the same measurement code the harness uses, and its feedback is
phrased as specific deltas -- *"Missing #030712, which paints 34.1% of the
page"* -- because a bare score gives the agent nothing to act on.

### Properties the loop guarantees

- **Turn and token caps.** A model that keeps requesting tools cannot spin
  indefinitely.
- **Tool faults are fed back, not thrown.** A malformed argument is something
  the agent can correct next turn; crashing turns a recoverable mistake into a
  failed run.
- **Best-so-far is retained.** Agent trajectories are not monotone; a later
  revision can be worse, and returning the final state would silently discard a
  better earlier answer.
- **Context is compacted, not truncated.** Tool output dominates growth in a
  loop like this and stale output is largely redundant. Recent turns stay
  verbatim; older tool results are elided. Truncating the conversation instead
  would drop the task framing, which is the one thing that must survive.
- **Provider is an interface.** Agent logic is the part worth testing and it
  must be testable without a network or a billing account. A deterministic mock
  provider replays scripted turns, which is how every property above is
  verified in CI.

### Verification status

The loop is covered by 10 tests against the mock provider, including two that
check the scoring function has a usable gradient: identical colour values score
more than 0.3 higher when named by role instead of by index, and acting on the
feedback from a weak proposal reaches a good score. A metric that only punishes
would leave nothing to climb.

**The loop has not yet been run against a live model.** This environment routes
Anthropic traffic through a proxy whose edge WAF returns
`403 Denied by http_auto_ratelimit` before requests reach the API, for both
`Authorization: Bearer` and `x-api-key`. The credential is valid; the network
path is not. Real-model numbers are therefore absent rather than estimated.

## A negative result: rules already win

Before assuming the model earns its place, the same task was implemented as
plain rules -- largest painted colour becomes the surface, the page's reported
foreground becomes the text token, the most chromatic remainder becomes the
accent -- and dropped into the identical loop, graded by the identical scorer.

```
                     raw extraction    heuristic (no model, 0 tokens)
tailwindcss.com          0.521               0.999
linear.app               0.317               0.997
vercel.com               0.217               1.000
getbootstrap.com         0.338               0.988
```

The rules score essentially perfectly, which leaves a model nothing to improve.
Two things follow, and only one of them is comfortable.

**The scoring dimensions are mechanically satisfiable.** Coverage and reality
are table lookups. Semantic naming is a regular expression. Worst of all, role
accuracy is effectively given away: the `survey` tool reports
`page background: #030712, text: #ffffff` directly, so identifying those roles
requires no judgement at all. A tool that hands over the answer cannot measure
the ability to find it.

**The judgement-heavy parts are not being scored.** Deciding that `#1d202a` and
`#10141e` are two elevation steps of one surface rather than two unrelated
colours; recognising that a declared `--color-primary` reveals authorial intent
that a computed value cannot; choosing which six of sixteen observed colours
deserve to exist as tokens at all; knowing when near-duplicates should collapse.
Rules handle none of this well, and none of it is currently measured.

The honest reading is that **for the task as currently defined and scored, the
model is not needed.** That result is kept here rather than engineered away.
Adjusting the metric until the model looks necessary would invert the point of
having a metric, and the next person to trust these numbers would be trusting
something that had been fitted to a conclusion.

What it does establish is the shape of the real question. A benchmark that
separates a model from a lookup table has to withhold the answer, not print it
in the survey, and has to score the decisions that have no mechanical form. The
harness, the loop, the budgets and the trace are all reusable once that
benchmark exists; the scorer is the part that needs rebuilding.

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
src/agent/
  provider.ts    model interface, Anthropic and deterministic mock
  tools.ts       six tools plus the deterministic proposal scorer
  loop.ts        plan/act/observe/correct with budgets and best-so-far
  trace.ts       append-only JSONL execution trace
src/cli.ts       batch runner
src/run-agent.ts measure a page, then run the agent over the measurements
src/report.ts    markdown report generation
```

## Running it

```bash
pnpm install

# measure one page, with ground truth and L2/L4 scoring
pnpm exec tsx src/cli.ts --url https://example.com --preset style --truth

# full golden-set baseline, then the report
pnpm exec tsx src/cli.ts --golden --preset style --truth --out runs/baseline
pnpm exec tsx src/report.ts runs/baseline

# measure a page and run the agent over it
pnpm exec tsx src/run-agent.ts --url https://example.com          # live model
pnpm exec tsx src/run-agent.ts --url https://example.com --mock   # no network

node --import tsx --test 'src/**/*.test.ts'
```

Model access is read from `ANTHROPIC_API_KEY`, or `ANTHROPIC_AUTH_TOKEN` plus
`ANTHROPIC_BASE_URL`. Override the model with `STYLE_AGENT_MODEL` or `--model`.

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
