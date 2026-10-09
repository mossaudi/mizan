import type { LicenceClass, SourceDescriptor } from "@mizan/core"

/**
 * The source catalogue: every dataset this project has considered, and the DECISION made
 * about each one.
 *
 * This file is the single place where a licence judgement is expressed (AGENTS.md section 17).
 * The registry generator turns it into `data/registry/sources.json`, `DISCLOSURE.md` is
 * generated from it, and gate G-5 reads the result — so a licence decision cannot be made
 * in a commit message, forgotten in a rebase, and quietly contradicted by the code.
 *
 * ## The two sources that are IN
 *
 * **Tanzil (Qur'an, uthmani script).** Tanzil publishes the text and states that it may be
 * redistributed unmodified, and asks that derivatives be marked as such. Classified
 * `no-derivatives`, which is enforced rather than merely noted: `CorpusRecord.textDisplay`
 * is stored byte-for-byte as received, and only the separate `textMatch` column is folded.
 * Nothing in the product ever renders a folded Qur'anic string.
 *
 * **quranlab/hadith (Arabic matn).** The dataset card declares
 * `license: other / "mixed-per-row-pd-arabic-and-reference"`: the Arabic matn is public
 * domain, and the *reference* fields (isnad, scholarly apparatus) are under separate
 * per-row terms. So the snapshot takes the Arabic text, the hadith number, the collection,
 * and the per-row grade, and records in `notes` that it does NOT ingest the reference/isnad
 * payload. That is the honest reading of a mixed licence: take the fields whose terms we
 * have established, and write down which ones we left.
 *
 * ## The two sources that are OUT, and why they are still listed
 *
 * **`mhashim6/Open-Hadith-Data`** is referenced as the upstream of the quranlab collections
 * and its terms could not be established from the repository, so it is `enabled: false` with
 * an `exclusionReason`. The adapter is not written, because an adapter for a source we may
 * not ship is code with no purpose.
 *
 * **`fawazahmed0/hadith-api`** is the origin of the Bukhari/Muslim numbering, but it is an
 * API-scrape mirror rather than a citable edition, and its per-row terms are not stated.
 * Also excluded, and the reason says so, so the next person does not re-derive it.
 *
 * Listing an excluded source is not clutter: it is the record of a decision. Deleting the row
 * would make the same question look new again next quarter.
 *
 * ## The two ATHAR rows, and why they are the deliverable rather than a delay
 *
 * A companion / athar corpus was asked for. No open-licensed one was found, and the two candidates
 * fail in the two opposite ways that matter: Mawdoo3 publishes no licence field at all, and
 * al-islam.org publishes one that is non-commercial only. This cycle therefore delivers the DECISION,
 * recorded in the single module AGENTS.md section 17 names, with a written reason on each row naming
 * what was checked and where — so a re-check is a diff rather than a re-derivation.
 *
 * Both rows carry `gradeApplicable: false` and `gradeBasis: "none"`, and that is the second half of
 * the answer: a companion attribution has no ṣaḥīḥ/ḍaʿīf grade, so the product would store `null` and
 * SAY SO rather than borrow a vocabulary that does not apply to it. It is not a quarantine — the
 * concept does not apply, it is not a gap in a grade some dataset asserted (AGENTS.md section 15,
 * ADR-06).
 */

export type SourceMeta = {
  /** Everything except the values only the ingest can know: the digest, the row count, `enabled`. */
  readonly descriptor: Omit<SourceDescriptor, "sha256" | "records" | "enabled" | "exclusionReason">
  /** Why this source is excluded, or null when it ships. */
  readonly exclusionReason: string | null
  /** `true` when the source contributes rows to the snapshot. */
  readonly enabled: boolean
}

const TANZIL: SourceMeta = {
  enabled: true,
  exclusionReason: null,
  descriptor: {
    source: "tanzil/quran-uthmani",
    title: "Tanzil — Qur'an, Uthmani script",
    publisher: "Tanzil Project",
    url: "https://tanzil.net/pub/download/index.php?quranType=uthmani&outType=txt&agree=true",
    license: "Tanzil Terms of Use — free for non-commercial redistribution provided it is distributed unmodified and marked as Tanzil",
    licenceClass: "no-derivatives",
    licenseUrl: "https://tanzil.net/res/terms-of-use",
    attribution: "Qur'an text: Tanzil (tanzil.net), distributed unmodified under the Tanzil terms of use",
    gradeApplicable: false,
    gradeBasis: "none",
    notes:
      "Stored verbatim in textDisplay; only the derived textMatch column is folded. Redistributed unmodified with attribution, as the terms require.",
  },
}

const QURANLAB_HADITH: SourceMeta = {
  enabled: true,
  exclusionReason: null,
  descriptor: {
    source: "quranlab/hadith",
    title: "QuranLab — Hadith & Sunnah (Ahl al-Sunnah)",
    publisher: "QuranLab",
    url: "https://huggingface.co/datasets/quranlab/hadith",
    license: 'Dataset card: license "other", license_name "mixed-per-row-pd-arabic-and-reference"',
    licenceClass: "content-only",
    licenseUrl: "https://huggingface.co/datasets/quranlab/hadith",
    attribution: "Hadith text and grades: QuranLab (quranlab/hadith on Hugging Face), Arabic matn public domain per the dataset card",
    gradeApplicable: true,
    gradeBasis: "row",
    notes:
      "Ingests text, hadith_number, collection and the per-row grade. Does NOT ingest the reference/isnad payload, whose per-row terms the dataset card lists separately from the public-domain Arabic. Grades are stored exactly as published, with gradeSource, and are never presented as our own ruling.",
  },
}

const OPEN_HADITH_DATA: SourceMeta = {
  enabled: false,
  exclusionReason:
    "Licence terms could not be established from the repository. Recorded as the upstream of the quranlab collections so the question is not re-derived from scratch. No adapter is written for a source we may not ship.",
  descriptor: {
    source: "mhashim6/open-hadith-data",
    title: "Open Hadith Data",
    publisher: "mhashim6",
    url: "https://huggingface.co/datasets/mhashim6/Open-Hadith-Data",
    license: "not established",
    licenceClass: "unconfirmed",
    licenseUrl: "https://huggingface.co/datasets/mhashim6/Open-Hadith-Data",
    attribution: "n/a — excluded from the snapshot",
    gradeApplicable: true,
    gradeBasis: "none",
    notes: null,
  },
}

const HADITH_API: SourceMeta = {
  enabled: false,
  exclusionReason:
    "Numbering origin for the Kutub al-Sittah but not a citable edition, and per-row terms are not stated. quranlab/hadith supplies the same numbering with a published licence.",
  descriptor: {
    source: "fawazahmed0/hadith-api",
    title: "Hadith API (mirror)",
    publisher: "fawazahmed0",
    url: "https://huggingface.co/datasets/fawazahmed0/hadith-api",
    license: "not stated",
    licenceClass: "unconfirmed",
    licenseUrl: "https://huggingface.co/datasets/fawazahmed0/hadith-api",
    attribution: "n/a — excluded from the snapshot",
    gradeApplicable: true,
    gradeBasis: "none",
    notes: null,
  },
}

/**
 * A ṢAḤĀBAH / athar candidate, EXCLUDED. No licence is published for it.
 *
 * ## What was checked, and where, so the question is not re-derived
 *
 * The Mawdoo3 site publishes athar pages and, at the time of this row, published **no licence field at
 * all** — no terms page, no dataset card, no redistribution statement. A source with no stated terms
 * cannot be classified above `unconfirmed`, and gate G-5.4 fails the build on an enabled row whose
 * class is `unconfirmed`. So the row is recorded as considered and excluded, which is a decision, and
 * the decision is the deliverable (AGENTS.md section 17: deleting the row would make the same question
 * look new next quarter).
 *
 * `gradeApplicable: false` with `gradeBasis: "none"` is the load-bearing part of this row and it is
 * NOT a quarantine. A companion statement is not ṣaḥīḥ/ḍaʿīf graded by any dataset this repository has
 * examined, and the rule in AGENTS.md section 15 is that we store the dataset's grade exactly or store
 * `null` — we never borrow a vocabulary that does not apply, and we never silently quarantine a whole
 * collection because the concept does not apply to it. If a future source is found with published
 * terms, this row becomes an ingest question and NOT a grade question.
 *
 * No adapter is written and no fetch path exists. An adapter for a source we may not ship is code with
 * no purpose, and a licence decision that has to be honoured in code as well as in this file is a
 * decision two people can read differently.
 */
const MAWDOO3_ATHAR: SourceMeta = {
  enabled: false,
  exclusionReason:
    "No licence is published. Checked the Mawdoo3 site and its terms pages on 2026-10-08 and found no licence field, no terms-of-use statement and no redistribution grant; a source with no stated terms cannot be classified above `unconfirmed`, and G-5.4 refuses an enabled row at that class. Recorded here so the athar question is answered rather than deferred; no adapter and no fetch path exist for it, and re-checking is a diff against this sentence.",
  descriptor: {
    source: "mawdoo3/athar",
    title: "Mawdoo3 — Athar and Prophets' sayings",
    publisher: "Mawdoo3",
    url: "https://mawdoo3.com/",
    license: "not published",
    licenceClass: "unconfirmed",
    licenseUrl: "https://mawdoo3.com/",
    attribution: "n/a — excluded from the snapshot",
    // The point of the row: a companion attribution has no ṣaḥīḥ/ḍaʿīf grade, so the concept does not
    // apply and no grade vocabulary may be borrowed for it (AGENTS.md section 15, ADR-06).
    gradeApplicable: false,
    gradeBasis: "none",
    notes:
      "Companion and athar attributions would carry grade: null and gradeApplicable: false, and the surface would say so rather than borrowing ṣaḥīḥ/ḍaʿīf. Not a quarantine: the concept does not apply, it is not a gap in a grade the dataset asserted.",
  },
}

/**
 * A ṢAḤĀBAH / athar candidate, EXCLUDED. Non-commercial use only.
 *
 * ## What was checked, and where
 *
 * al-islam.org states plainly that its content is provided "solely for non-commercial purposes". That
 * is a real licence statement and it is enough to classify — and not enough to ship into a product that
 * competes, is judged, and is redistributed as a repository. The class is `content-only` rather than
 * `unconfirmed` because the terms ARE published; the exclusion is a DECISION about those terms, not a
 * gap in them, which is exactly the distinction G-5.4 and G-5.5 encode.
 *
 * Companion attributions that appear inside a shipped graded collection are a different matter and are
 * NOT excluded by this row: in those collections a companion appears as a narrator or a rawi, never as
 * an independently graded hadith, and the row is already served with `gradeApplicable: true` because
 * the collection grades its rows. This row excludes the source as a COMPANION CORPUS, nothing else.
 */
const AL_ISLAM_ATHAR: SourceMeta = {
  enabled: false,
  exclusionReason:
    "Licence is published and is non-commercial only: al-islam.org states its content is for non-commercial purposes, which cannot cover a redistributed, competition-entered repository. Checked the site's terms on 2026-10-08. Excluded as a companion CORPUS; companion attributions appearing as narrators inside a shipped graded collection are unaffected, because there the companion is a narrator and not an independently graded hadith. Re-checking is a diff against this sentence.",
  descriptor: {
    source: "al-islam.org/athar",
    title: "Al-Islam.org — Athar and Prophets' sayings",
    publisher: "Al-Islam.org",
    url: "https://www.al-islam.org/",
    license: 'Site terms: content is provided "solely for non-commercial purposes"',
    licenceClass: "content-only",
    licenseUrl: "https://www.al-islam.org/terms-of-use/",
    attribution: "n/a — excluded from the snapshot",
    gradeApplicable: false,
    gradeBasis: "none",
    notes:
      "Excluded for non-commercial terms, not for an absent grade. Were it ever licensed for this use, a companion attribution would still carry grade: null and gradeApplicable: false — a companion statement is not ṣaḥīḥ/ḍaʿīf graded by any dataset examined here (AGENTS.md section 15, ADR-06).",
  },
}

/** Every source considered, in registry order. Order is fixed so the generated file is byte-stable. */
export const SOURCE_CATALOGUE: readonly SourceMeta[] = [
  TANZIL,
  QURANLAB_HADITH,
  OPEN_HADITH_DATA,
  HADITH_API,
  MAWDOO3_ATHAR,
  AL_ISLAM_ATHAR,
]

export const ENABLED_SOURCES = SOURCE_CATALOGUE.filter((source) => source.enabled)

export const findSource = (slug: string): SourceMeta | null => SOURCE_CATALOGUE.find((source) => source.descriptor.source === slug) ?? null

/** The licence classes this snapshot actually ships, for the disclosure header. */
export const shippedLicenceClasses = (): readonly LicenceClass[] =>
  [...new Set(ENABLED_SOURCES.map((source) => source.descriptor.licenceClass))]

export * as SourceMeta from "./source-meta.ts"
