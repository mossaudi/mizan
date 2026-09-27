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

/** Every source considered, in registry order. Order is fixed so the generated file is byte-stable. */
export const SOURCE_CATALOGUE: readonly SourceMeta[] = [TANZIL, QURANLAB_HADITH, OPEN_HADITH_DATA, HADITH_API]

export const ENABLED_SOURCES = SOURCE_CATALOGUE.filter((source) => source.enabled)

export const findSource = (slug: string): SourceMeta | null => SOURCE_CATALOGUE.find((source) => source.descriptor.source === slug) ?? null

/** The licence classes this snapshot actually ships, for the disclosure header. */
export const shippedLicenceClasses = (): readonly LicenceClass[] =>
  [...new Set(ENABLED_SOURCES.map((source) => source.descriptor.licenceClass))]

export * as SourceMeta from "./source-meta.ts"
