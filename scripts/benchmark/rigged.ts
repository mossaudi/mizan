import { HONEST_BASELINE } from "@mizan/core"
import { HONEST_OPTIONS, type BaselineOptions } from "./baseline.ts"
import { toDeclaration } from "./score.ts"

/**
 * The six rigged baselines, each a one-field move from the honest one.
 *
 * ## Why a rigged baseline must be a DECLARATION and not a code path
 *
 * The temptation is to write six search functions and pick one. That is a trap: six near-identical
 * query builders is six places for the honest path and a rigged one to drift, and a defect that is
 * visible as a separate function is far easier to leave in place by accident. So there is ONE search
 * implementation and six DATA values, and each value moves a field of `HONEST_BASELINE`.
 *
 * That is also why `assertBaselineIsHonest` can be exhaustive without knowing these declarations
 * exist: it compares field by field against `HONEST_BASELINE`, so a defect IS a data difference.
 * A new field added to the declaration without being added to the check would be silently unchecked,
 * which is why the self-test also asserts the field list below matches the schema's own keys.
 *
 * ## Each defect is chosen to fail DIFFERENTLY, and the table is MEASURED
 *
 * A self-test that planted six defects which all produced "rate = 0" would prove only that the check
 * returns a non-empty list. So the six cover both directions, and the figures below are the measured
 * top-1 hit rate over the 40 red-team cases against the attested 27,234-record corpus, whose honest
 * baseline is **65.0%** — not a prediction, and not a number this file is allowed to assert without a
 * corpus. Re-measure with `bun run benchmark:vs-search` and the honest figure beside it.
 *
 * | rig | rate | what it does to the number |
 * | --- | --- | --- |
 * | `collection-filtered` | 82.5% | **inflates** — the cited collection is where the answer lives |
 * | `gold-record-id` | 100.0% | **inflates** — a perfect score, and the most blatant of the six |
 * | `rerun-until-found` | 100.0% | **inflates** — a *plausible* perfect score from a real technique |
 * | `wide-k` | 65.0% | **unchanged, and that is the trap** — see below |
 * | `id-order` | 5.0% | deflates — corpus layout instead of retrieval |
 * | `raw-column` | 0.0% | deflates — a folded query against raw, undiacriticized text |
 *
 * Three of the six inflate, and inflating the baseline is the direction that HURTS us, so those are
 * the ones a reader must never find in the tree. Two deflate, and a deflated baseline is as much a
 * defect as an inflated one: it makes mizan look good for the wrong reason.
 *
 * ## `wide-k` is why the declaration is printed above the figures
 *
 * At `k = 10` the top-1 answer is identical to the honest one, so the rig produces exactly the
 * number the honest run produces and nothing in the report's figures betrays it. A lever invisible
 * in the output is the lever that survives review, which is why `run.ts` prints the whole
 * declaration and `assertBaselineIsHonest` checks it field by field rather than letting a reader
 * look for a discrepancy in a percentage.
 *
 * ## Why `collection-filtered` moves TWO fields
 *
 * With `k = 1` a collection filter has one candidate to keep or discard, so it cannot change the
 * answer and the planted defect is inert — measured, and it is why the entry below carries a wider
 * pool. A reader who already knows which collection the answer lives in is a reader with a pool to
 * choose from. Both fields are declared, and `assertBaselineIsHonest` names both, so a reader can
 * still attribute the effect to a named lever rather than to a combination nobody wrote down.
 */

/** The six fields, in the order the report prints them. Mirrors `BaselineDeclaration`. */
const FIELDS = ["strategy", "column", "collectionFilter", "usesGoldRecordId", "k", "rerunBudget"] as const

type BaselineField = (typeof FIELDS)[number]

/** A rigged declaration, and what a reader would conclude if they believed its number. */
export type RiggedBaseline = {
  readonly name: string
  readonly intent: string
  readonly options: BaselineOptions
  /**
   * Which fields this entry moves.
   *
   * Declared per entry rather than assumed, and two entries genuinely need two: a
   * rerun-until-found strategy is meaningless without a budget to spend, and a collection filter over
   * a one-record pool cannot do anything. Recording the list is what keeps the claim honest — an
   * entry that quietly moved a third field would fail the self-test rather than widening the
   * catalogue's claim unnoticed, and `movedFieldsOf` is what proves it.
   */
  readonly movedFields: readonly BaselineField[]
}

/** Build a rigged declaration by moving named fields of the honest one. */
const rig = (overrides: Partial<BaselineOptions>): BaselineOptions => ({ ...HONEST_OPTIONS, ...overrides })

export const RIGGED_BASELINES: readonly RiggedBaseline[] = [
  {
    name: "collection-filtered",
    intent: "the baseline 'finds' a fabrication because it was already restricted to the collection its citation names, out of a pool wider than one",
    movedFields: ["collectionFilter", "k"],
    options: rig({ collectionFilter: true, k: 8 }),
  },
  {
    name: "gold-record-id",
    intent: "the baseline's answer is the record id the case cites — handed the answer, not a search",
    movedFields: ["usesGoldRecordId"],
    options: rig({ usesGoldRecordId: true }),
  },
  {
    name: "id-order",
    intent: "the baseline returns records in id order and takes the first, so its rate is corpus layout rather than retrieval",
    movedFields: ["strategy"],
    options: rig({ strategy: "id-order" }),
  },
  {
    name: "raw-column",
    intent: "the baseline asks with the raw, undiacriticized text against a folded index and matches almost nothing",
    movedFields: ["column"],
    options: rig({ column: "textDisplay" }),
  },
  {
    name: "wide-k",
    intent: "the baseline fetches ten results, so a later rerank could pick the winner and the number is no longer top-1",
    movedFields: ["k"],
    options: rig({ k: 10 }),
  },
  {
    name: "rerun-until-found",
    intent: "the baseline re-asks with shorter queries until the cited record appears, producing a plausible 100%",
    // Two fields: the strategy needs a budget, and a budget without the strategy is a no-op.
    movedFields: ["strategy", "rerunBudget"],
    options: rig({ strategy: "rerun-until-found", rerunBudget: 8 }),
  },
]

/** The number of defects the architecture requires the self-test to plant. */
export const RIGGED_COUNT = 6

/**
 * The fields that actually differ from the honest declaration.
 *
 * Derived rather than trusted from `movedFields`: a declaration that CLAIMS to move one field and
 * moves two is exactly the kind of drift the catalogue exists to make impossible, and the
 * self-test compares the two lists. The projection is `toDeclaration` rather than a second copy of
 * it, because a field added to the declaration and forgotten here would be unchecked here and
 * checked everywhere else (AGENTS.md §17).
 */
export const movedFieldsOf = (options: BaselineOptions): readonly BaselineField[] => {
  const declaration = toDeclaration(options)
  return FIELDS.filter((field) => declaration[field] !== HONEST_BASELINE[field])
}

/** The field list, exported so the self-test can assert it against the schema's own keys. */
export const BASELINE_FIELDS = FIELDS

export * as Rigged from "./rigged.ts"
