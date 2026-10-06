import { Schema } from "effect"
import {
  badgeFor,
  decodeOrFail,
  decodeSync,
  transcriptLabel,
  TranscriptKind,
  Verdict,
  VerdictReason,
  type DecodeFailure,
  type Result,
} from "@mizan/core"
/**
 * The static page's renderer: a decoded fixture in, an HTML document out.
 *
 * ## One encoder, and it is total
 *
 * Every value that reaches the document — fixture data, badge strings, the page's own copy —
 * passes through `encodeText`, which is total over `& < > " '`. There is no path from a value
 * to the output that does not go through it, because there is exactly one place a value is
 * interpolated and this is it. ADR-C3's first consequence.
 *
 * ## Text nodes, never markup
 *
 * The page carries no `<script>`, no external `<link>` or `src`, and makes no request. Nothing
 * is parsed as markup: a quotation containing `<script>alert(1)</script>` becomes
 * `&lt;script&gt;…` in the bytes and is *displayed* as those characters, so the browser's
 * parser never sees a tag. AGENTS.md section 11 forbids raw-HTML sinks precisely because a text
 * node is not a sanitiser we have to keep in sync — it is not a sanitiser at all. ADR-C3's
 * second consequence.
 *
 * ## The badge map is shared, not copied
 *
 * `badgeFor` comes from `@mizan/core`, where the CLI's renderer reads it too. The strings on
 * this page are therefore the same strings the terminal prints, by construction rather than by
 * a test that hopes they still match. And because `BADGE_MEANING` is `satisfies Record<Verdict,
 * string>`, a fourth verdict joining the schema fails `tsc --noEmit` here instead of rendering
 * as a badge this page has never heard of. ADR-C3's third and fourth consequences.
 *
 * ## The page says which mode it is in
 *
 * The header line below is `transcriptLabel(fixture.transcript)` — the same function the CLI
 * header calls, so a replay reads `PRECOMPUTED (deterministic replay)` in both places. This is
 * the second half of the shared-map decision: the badge tells a reader the verdict was computed,
 * and the mode tells them whether the sentence above it was generated. Story 4's risk (R10) is
 * that a reader takes a replay for a live generation, and a page that stayed silent about it
 * would be that misread with a build step attached.
 */

export const PageExample = Schema.Struct({
  claimId: Schema.String,
  verdict: Verdict,
  reason: VerdictReason,
  question: Schema.String,
  prose: Schema.String,
  quote: Schema.String,
  sourceLabel: Schema.String,
  recordText: Schema.String,
})
export type PageExample = Schema.Schema.Type<typeof PageExample>

/**
 * Whether the answers on this page were generated live or replayed from a committed transcript.
 *
 * The field is required rather than inferred, and it is `TranscriptKind` rather than a new union, so
 * the page cannot invent a third mode and the vocabulary stays the one `RunTrace` already carries.
 * The label itself comes from `transcriptLabel`, which is the same function the CLI header prints,
 * so a replay on this page and a replay on stdout read identically (AGENTS.md section 17). A page
 * that showed a replayed answer with no label would be the exact misread this repository's
 * credibility cannot absorb, and the fixture's own `data/transcript.json` cross-check in the test
 * suite is what keeps the label honest rather than asserted.
 */
export const PageFixture = Schema.Struct({
  transcript: TranscriptKind,
  examples: Schema.Array(PageExample),
})
export type PageFixture = Schema.Schema.Type<typeof PageFixture>

/**
 * Decode a fixture, or fail.
 *
 * The build refuses rather than rendering a fixture it could not read: a malformed committed
 * file must fail the build, not the browser (ADR-C3). Nothing is rendered from a value that
 * did not survive the schema, so there is no partial page and no default badge.
 */
export const decodeFixture = (input: unknown): Result<PageFixture, DecodeFailure> =>
  decodeOrFail(decodeSync(PageFixture), input, "PageFixture")

const ENTITY_FOR: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&#39;",
}

/**
 * The one entity encoder, total over `& < > " '`.
 *
 * `Record<string, string>` rather than a lookup typed to the five characters, so the replacement
 * callback is total without an assertion: an unexpected character is returned unchanged, and the
 * regex guarantees there are no unexpected characters.
 */
export const encodeText = (value: string): string => value.replace(/[&<>"']/g, (character) => ENTITY_FOR[character] ?? character)

/**
 * What each badge means, keyed by the union.
 *
 * `satisfies` rather than a type annotation so the literals stay literal keys and a new verdict
 * in `@mizan/core` is a compile error in this file — the page would otherwise be able to render
 * a badge whose meaning it had never written down.
 */
const BADGE_MEANING = {
  verified: "the quoted span is contained in the record the claim cites, after deterministic folding.",
  unverifiable: "mizan cannot decide: no citation, an unresolvable identifier, an empty quote, a paraphrase, a timeout or malformed model output.",
  rejected: "the citation resolved to a real record and that record does not contain the quote.",
} as const satisfies Readonly<Record<Verdict, string>>

const STYLE = [
  ":root { color-scheme: light dark; }",
  "body { font-family: ui-sans-serif, system-ui, sans-serif; line-height: 1.55; margin: 0 auto; max-width: 54rem; padding: 2rem 1.25rem; }",
  "h1 { font-size: 1.75rem; margin: 0 0 0.25rem; }",
  "h2 { font-size: 1.1rem; margin: 2rem 0 0.5rem; }",
  ".lede { margin-top: 0; }",
  ".mode { border: 1px solid rgba(128,128,128,0.5); padding: 0.4rem 0.6rem; }",
  ".mode-label { font-weight: 700; letter-spacing: 0.04em; }",
  ".mode-note { opacity: 0.85; }",
  "ul { list-style: none; padding: 0; }",
  "li { margin: 0.6rem 0; }",
  ".badge { font-weight: 700; letter-spacing: 0.04em; }",
  "li .badge { display: inline-block; min-width: 10.5rem; }",
  "article.example { border-top: 1px solid rgba(128,128,128,0.4); margin-top: 1.25rem; padding-top: 1rem; }",
  ".label { display: inline-block; min-width: 4.5rem; font-weight: 600; }",
  "pre { font-size: 0.95rem; margin: 0.25rem 0 0.75rem; overflow-wrap: anywhere; white-space: pre-wrap; }",
  ".note { font-size: 0.85rem; opacity: 0.85; }",
].join("\n")

/**
 * Every verdict the repository defines, in the order the page lists them.
 *
 * The order is `BADGE_MEANING`'s own key order rather than a hand-written list: a second list
 * is a second registry, and a second registry is the thing AGENTS.md section 17 exists to
 * prevent. The cast is the one place `string` becomes a `Verdict` again, and it is sound
 * because `satisfies` above proved the key sets are equal.
 */
const badgeRows = (): readonly string[] =>
  (Object.keys(BADGE_MEANING) as readonly (keyof typeof BADGE_MEANING)[]).map((verdict) =>
    ["    <li>", `      <span class="badge">${encodeText(badgeFor(verdict))}</span>`, `      <span>${encodeText(BADGE_MEANING[verdict])}</span>`, "    </li>"].join("\n"),
  )

/**
 * One worked example.
 *
 * `dir="auto"` on both quotation blocks is the RTL edge case from the story: an Arabic quotation
 * must lay out right-to-left even though the document's base direction is English, and `auto`
 * resolves from the first strong character — so an English quotation stays LTR and an Arabic one
 * flips, with no directionality decision written into this file.
 */
const exampleBlock = (example: PageExample): string =>
  [
    '    <article class="example">',
    "      <p>",
    `        <span class="badge">${encodeText(badgeFor(example.verdict))}</span>`,
    `        <span>${encodeText(`${example.claimId} — ${example.reason}`)}</span>`,
    "      </p>",
    `      <p><span class="label">ask</span>${encodeText(example.question)}</p>`,
    `      <p><span class="label">answer</span>${encodeText(example.prose)}</p>`,
    '      <p class="note">quoted — model text, inserted as characters</p>',
    `      <pre dir="auto">${encodeText(example.quote)}</pre>`,
    `      <p><span class="label">source</span>${encodeText(example.sourceLabel)}</p>`,
    '      <p class="note">record — corpus text, inserted as characters</p>',
    `      <pre dir="auto">${encodeText(example.recordText)}</pre>`,
    "    </article>",
  ].join("\n")

/**
 * What each mode changes, in one sentence, keyed by the union.
 *
 * Two entries because two things change when the answer is replayed instead of generated — and
 * because the badge does not. The second half of each sentence says so explicitly: a label with no
 * scope reads as a disclaimer over the whole report, badges included, which would be a false
 * retraction of the one claim this page exists to make. Exhaustive by type, so a third mode is a
 * compile error here rather than a missing sentence.
 */
const MODE_NOTE: Readonly<Record<TranscriptKind, string>> = {
  live: "the answers were generated live by the allowlisted provider; every badge below was computed by the verifier against the committed corpus on this run.",
  precomputed: "the answers and quotations are replayed from a committed transcript; every badge below was computed by the verifier against the committed corpus on this run, live or replayed alike.",
}

/**
 * The mode line: the label, and what the label covers.
 *
 * Three spans rather than one string, so a test can read the label back out of the committed bytes
 * exactly rather than pattern-matching around an em dash.
 */
const modeLine = (fixture: PageFixture): string =>
  [
    '    <p class="mode">',
    '      <span class="label">transcript</span>',
    `      <span class="mode-label">${encodeText(transcriptLabel(fixture.transcript))}</span>`,
    `      <span class="mode-note">${encodeText(MODE_NOTE[fixture.transcript])}</span>`,
    "    </p>",
  ].join("\n")

const STEP_ROWS: readonly string[] = [
  "      <li>1 — <strong>the quote.</strong> An empty or diacritics-only quoted span is <code>UNVERIFIABLE</code>. Only a quoted span is falsifiable; the model&#39;s prose is never verified.</li>",
  "      <li>2 — <strong>a citation.</strong> A claim with none is <code>UNVERIFIABLE</code>. Zero evidence blocks approval.</li>",
  "      <li>3 — <strong>the cap.</strong> More than three citations are capped; the cap becomes the recorded reason only when it is the reason.</li>",
  "      <li>4 — <strong>resolution.</strong> If no cited record exists the claim is <code>UNVERIFIABLE</code>; a number that exists in several collections with none named is <code>UNVERIFIABLE</code> as ambiguous.</li>",
  "      <li>5 — <strong>containment.</strong> The folded quote is compared to the folded cited record by strict normalised substring containment. A hit is <code>VERIFIED</code>, with evidence. This is the only route to <code>VERIFIED</code> in the repository.</li>",
  "      <li>6 — <strong>coercion.</strong> A <code>VERIFIED</code> carrying no evidence is coerced down to <code>UNVERIFIABLE</code>, and the evidence is cleared so nothing downstream can render a confident badge with no provenance.</li>",
]

const HOW_SECTION: readonly string[] = [
  "    <h2>How a badge is computed</h2>",
  "    <p>Per claim, in order. Each step fails closed and returns early; the happy path is the last line. The procedure lives in <code>packages/mizan-verify/src/verify.ts</code> and is summarised in the repository README.</p>",
  "    <ul>",
  ...STEP_ROWS,
  "    </ul>",
  "    <p class=\"note\">Between containment and accusation sits the anchor arm: an abridgement that a hand-drawn anchor locates in the cited record yields <code>UNVERIFIABLE</code> — never <code>VERIFIED</code> and never <code>REJECTED</code>. A case nobody ruled on receives no anchor and falls back to the containment result.</p>",
]

const FOLD_SECTION: readonly string[] = [
  "    <h2>What the fold is</h2>",
  "    <p>One table, in <code>packages/mizan-core/src/normalize/fold-table.ts</code>, applied once at ingest. It normalises alef and hamza forms, the wasla, ta-marbuta, diacritics, tatweel, digit forms and punctuation. It never rewrites, adds or removes a <em>letter</em> — which is exactly why a fabrication cannot be folded into a match.</p>",
  "    <p class=\"note\">The folded column is a matching key, not a text. Every user surface renders the original; only the verifier compares the key.</p>",
]

const MATCH_SECTION: readonly string[] = [
  "    <h2>Match strength is exact or none</h2>",
  "    <p>Every verdict carries one of two match strengths: <code>exact</code> (a containment hit) or <code>none</code>. There is no percentage on any verdict and no third shape. A display-only longest-run diagnostic exists for human reading; it is not a verdict, and the verifier cannot import it.</p>",
]

const GRADES_SECTION: readonly string[] = [
  "    <h2>Grades are never ours</h2>",
  "    <p>A grade is stored exactly as the source dataset asserts it, together with who published it and on what basis. Rows the dataset declines to grade carry an explicit &#8220;no grade&#8221; state rather than a default. The product never infers, upgrades or presents a grade as its own ruling.</p>",
  "    <p class=\"note\">Qur&#39;an rows from Tanzil carry no hadith grade at all. Hadith rows from QuranLab carry the dataset&#39;s own per-row grade; the reference/isnad payload is not ingested.</p>",
]

const DEGRADATION_ROWS: readonly string[] = [
  "      <li>provider unreachable inside its 30s budget → <code>model unavailable</code> — never a canned answer, never a silent mock.</li>",
  "      <li>corpus consulted, nothing citable → <code>no sources found</code> — never a guess, never a cached answer.</li>",
  "      <li>verification timeout or malformed model output → <code>unverifiable</code> — never <code>verified</code>, never a cached prior verdict.</li>",
  "      <li>attestation mismatch or ledger write failure → loud integrity error, no verdict — never warn-and-proceed.</li>",
  "      <li>corpus absent or unreadable → the pipeline is not entered; the CLI names the state and exits.</li>",
  "      <li>not every claim verified → the run action is <code>refer_to_scholar</code>, not a composite yes.</li>",
]

const DEGRADATION_SECTION: readonly string[] = [
  "    <h2>Honest degradation</h2>",
  "    <p>Each failure has one correct surface. These are the words the product prints; a different spelling of the same absence is a defect, not a style choice.</p>",
  "    <ul>",
  ...DEGRADATION_ROWS,
  "    </ul>",
  "    <p class=\"note\">Second-ranker absence is reported in run metadata as <code>semanticRanking: unavailable</code>, never as a silent downgrade presented as full fidelity.</p>",
]

const PROVENANCE_SECTION: readonly string[] = [
  "    <h2>Provenance you can check</h2>",
  "    <ul>",
  "      <li>The corpus snapshot is attested; a mismatch between the database and its attestation aborts the run rather than producing a badge.</li>",
  "      <li>Every ledger row is hash-chained — each row carries the hash of the row before it. <code>bun run verify:chain</code> re-checks the chain from the committed file.</li>",
  "      <li>Run traces carry a hash of the question, never the question text.</li>",
  "      <li>Every badge is computed against a snapshot whose hash is shown beside it in the CLI report and in the hosted demo.</li>",
  "    </ul>",
]

const EVAL_SECTION: readonly string[] = [
  "    <h2>Evaluated on cases that must fail</h2>",
  "    <p>Two committed eval sets, both hand-adjudicated: <code>data/eval/golden-normalization.json</code> (200 cases the fold table must decide correctly) and <code>data/eval/redteam-fabricated.json</code> (40 fabricated citations that must never earn <code>VERIFIED</code>).</p>",
  "    <p class=\"note\">The red-team cases cite real collection names with fabricated content, chimeric citations and wrong-venue attributions. Each is published synthetic test data, not hadith, and a test fails if the eval generator ever imports the verifier.</p>",
]

const SOURCES_SECTION: readonly string[] = [
  "    <h2>Sources and licences</h2>",
  "    <p>Corpus text is not covered by the code&#39;s Apache-2.0 licence. Per-source terms live in <code>data/registry/sources.json</code>, and gate G-5 fails the build on an empty licence field.</p>",
  "    <ul>",
  "      <li><strong>Tanzil Project</strong> — Qur&#39;an, Uthmani script, 6,236 records. Distributed unmodified under the Tanzil terms of use (no-derivatives class in the registry).</li>",
  "      <li><strong>QuranLab</strong> — hadith and per-row grades, 36,024 records ingested. Arabic matn public domain per the dataset card. Grades stored exactly as published.</li>",
  "    </ul>",
  "    <p>Served collections in this snapshot: the Qur&#39;an, Sunan Abi Dawud, Sunan an-Nasa&#39;i, Sunan Ibn Majah, Jami&#39; at-Tirmidhi, and Malik&#39;s Muwatta — 27,234 rows, as recorded in <code>docs/value-proof.md</code>. Bukhari, Muslim and an-Nawawi are not served; the registry and the eval tables say so rather than implying a wider coverage than the snapshot holds. Rows the dataset declines to grade are held back rather than served with an invented grade.</p>",
]

const RUN_SECTION: readonly string[] = [
  "    <h2>Where to run it</h2>",
  "    <ul>",
  "      <li><code>bun run demo</code> — the offline demonstration. No API key, labelled replay, full report with each source&#39;s URL and the snapshot hash beside every badge. About a second on a laptop.</li>",
  "      <li><code>bun run ask</code> — the CLI question path. With a key set in the environment it runs the live model against an allowlisted OpenAI-compatible endpoint; without one it replays the committed transcript and labels every line precomputed.</li>",
  "      <li><code>bun run demo-server</code> — the hosted-form demo. Server-rendered HTML, no client-side script: an ask form, a verify playground, and <code>GET /health</code> for the platform. Badges are computed in the server process.</li>",
  "      <li><code>bun run mcp</code> — mizan verification as a read-only MCP tool (server name <code>mizan-verify</code>) for other AI applications, over stdio.</li>",
  "      <li><code>bun run ci</code> — typecheck, per-package tests, then the structural gates G-1 through G-7.</li>",
  "    </ul>",
  "    <p class=\"note\">The repository is at github.com/mossaudi/mizan. Deployment notes for the static exhibit and the hosted demo are in <code>docs/live-demo.md</code>; the offline command walkthrough is <code>docs/demo-runbook.md</code>.</p>",
]

/**
 * Render the page.
 *
 * Pure: no clock, no randomness, no I/O, no network — so two runs over one fixture are
 * byte-identical, which is what makes the committed `index.html` checkable against a
 * regeneration in a test rather than against a reviewer's eye.
 */
export const renderPage = (fixture: PageFixture): string =>
  [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    "<title>mizan — the badge is computed, not asserted</title>",
    "<style>",
    STYLE,
    "</style>",
    "</head>",
    "<body>",
    "<main>",
    '<h1>mizan</h1>',
    '    <p class="lede">Every badge mizan shows is computed by strict normalised containment against a committed corpus, not asserted by a model. The three lines below are the only verdicts the verifier can emit; there is no fourth state and no default badge.</p>',
    modeLine(fixture),
    "    <h2>The three badges</h2>",
    "    <ul>",
    ...badgeRows(),
    "    </ul>",
    ...HOW_SECTION,
    ...FOLD_SECTION,
    ...MATCH_SECTION,
    ...GRADES_SECTION,
    ...DEGRADATION_SECTION,
    ...PROVENANCE_SECTION,
    ...EVAL_SECTION,
    ...SOURCES_SECTION,
    ...RUN_SECTION,
    "    <h2>Worked example</h2>",
    '    <p class="note">Rendered at build time from the committed fixture <code>apps/web/fixtures/page.json</code>. The verdicts in it were computed by <code>bun run demo</code> and are re-checked against <code>data/demo-questions.json</code> by this package\u2019s tests. The second quotation is published synthetic test data from <code>data/eval/redteam-fabricated.json</code>: it is not hadith and it asserts nothing about anyone\u2019s religion.</p>',
    ...fixture.examples.map(exampleBlock),
    "    <h2>This page makes no request, and takes no input</h2>",
    '    <p class="note">No script, no stylesheet link, no image, no font, no fetch. It renders from <code>file://</code> with zero network access, so what you are reading is the committed bytes and nothing else. There is no text box on purpose: accepting input needs a script, and ADR-C3 forbids one. To ask a question, use the CLI \u2014 <code>bun run ask</code>, with a key set for a live run and unset for the labelled replay; <code>bun run demo</code> prints the full report, with each source\u2019s URL and the snapshot hash beside every badge. For an interactive form, the hosted demo server (<code>bun run demo-server</code>) serves one from a separate process; this static exhibit stays offline.</p>',
    "  </main>",
    "</body>",
    "</html>",
    "",
  ].join("\n")

export * as Page from "./page.ts"
