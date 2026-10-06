export const LANGS = ["en", "ar"] as const
export type Lang = (typeof LANGS)[number]

export const DEFAULT_LANG: Lang = "en"
export const LANG_COOKIE = "mizan_lang"

export type Strings = {
  readonly skipToContent: string
  readonly tagline: string
  readonly footer: string
  readonly langSwitchAria: string
  readonly navAsk: string
  readonly navVerify: string
  readonly navBadges: string
  readonly navProcedure: string
  readonly navDegradation: string
  readonly navProvenance: string
  readonly navSources: string
  readonly navRun: string
  readonly navMethod: string
  readonly footerHome: string
  readonly heroTitleEn: string
  readonly heroTitleAr: string
  readonly heroTitleTail: string
  readonly heroLede: string
  readonly heroClaim: string
  readonly statusCorpus: string
  readonly statusSnapshotHash: string
  readonly statusLiveRoute: string
  readonly statusBudget: string
  readonly statusClientJs: string
  readonly corpusYesPrefix: string
  readonly corpusUnavailable: string
  readonly liveRouteYes: string
  readonly liveRouteNo: string
  readonly clientJsNone: string
  readonly modePrecomputedNote: string
  readonly modeLiveNote: string
  readonly modeReplayNote: string
  readonly modeVerdictsLive: string
  readonly askTitle: string
  readonly askBody: string
  readonly askQuestionLabel: string
  readonly askQuestionPlaceholder: string
  readonly askRun: string
  readonly askSampleIkhlas: string
  readonly askSampleFabricated: string
  readonly askLiveConfigured: string
  readonly askLiveNoKey: string
  readonly askPrivacyNote: string
  readonly verifyTitle: string
  readonly verifyBody: string
  readonly verifyUnavailable: string
  readonly verifyTextLabel: string
  readonly verifyTextHint: string
  readonly verifyTextPlaceholder: string
  readonly verifyScopeLabel: string
  readonly verifyScopeHint: string
  readonly verifyScopePlaceholder: string
  readonly verifyRun: string
  readonly verifyNote: string
  readonly verifySampleA: string
  readonly verifySampleB: string
  readonly verifyResultTitle: string
  readonly verifyResultSummaryVerified: string
  readonly verifyResultSummaryNone: string
  readonly verifyResultSummaryNoCandidates: string
  readonly verifyResultSummaryUnavailable: string
  readonly verifyResultConsidered: string
  readonly verifyResultShown: string
  readonly verifyResultScopeAll: string
  readonly verifyResultScopeCollection: string
  readonly verifyResultScopeWidened: string
  readonly verifyResultQuoteChars: string
  readonly verifyResultRank: string
  readonly verifyResultBadge: string
  readonly verifyResultScope: string
  readonly verifyResultRecord: string
  readonly verifyResultSharedRun: string
  readonly verifyResultSharedRunNote: string
  readonly verifyResultText: string
  readonly verifyResultNotFound: string
  readonly verifyResultFormError: string
  readonly corpusKindSnapshot: string
  readonly corpusKindAnchors: string
  readonly corpusIntegrityFailed: string
  readonly corpusAnchorsWarning: string
  readonly corpusAnchorsWarningBody: string
  readonly askEyebrow: string
  readonly verifyEyebrow: string
  readonly trustTitle: string
  readonly trustItem1: string
  readonly trustItem2: string
  readonly trustItem3: string
  readonly trustMethodLink: string
  readonly methodEyebrow: string
  readonly methodTitle: string
  readonly methodLede: string
  readonly methodBackHome: string
  readonly badgesTitle: string
  readonly badgesBody: string
  readonly badgesDiagnosticNote: string
  readonly badgeMeaningVerified: string
  readonly badgeMeaningUnverifiable: string
  readonly badgeMeaningRejected: string
  readonly procedureTitle: string
  readonly procedureBody: string
  readonly procedureStep1: string
  readonly procedureStep2: string
  readonly procedureStep3: string
  readonly procedureStep4: string
  readonly procedureStep5: string
  readonly procedureStep6: string
  readonly procedureAnchorNote: string
  readonly procedureFoldTitle: string
  readonly procedureFoldBody: string
  readonly procedureFoldNote: string
  readonly procedureGradesTitle: string
  readonly procedureGradesBody: string
  readonly degradationTitle: string
  readonly degradationBody: string
  readonly degradationItem1: string
  readonly degradationItem2: string
  readonly degradationItem3: string
  readonly degradationItem4: string
  readonly degradationItem5: string
  readonly degradationItem6: string
  readonly degradationNote: string
  readonly provenanceTitle: string
  readonly provenanceItem1: string
  readonly provenanceItem2: string
  readonly provenanceItem3: string
  readonly provenanceItem4: string
  readonly provenanceItem5: string
  readonly sourcesTitle: string
  readonly sourcesBody: string
  readonly sourcesThSource: string
  readonly sourcesThRole: string
  readonly sourcesThTerms: string
  readonly sourcesTanzilRole: string
  readonly sourcesTanzilTerms: string
  readonly sourcesQuranLabRole: string
  readonly sourcesQuranLabTerms: string
  readonly sourcesCollections: string
  readonly sourcesNote: string
  readonly runTitle: string
  readonly runItemDemo: string
  readonly runItemAsk: string
  readonly runItemServer: string
  readonly runItemMcp: string
  readonly runItemCi: string
  readonly runNote: string
  readonly verdictTitle: string
  readonly verdictReason: string
  readonly verdictMatchStrength: string
  readonly verdictSnapshotHash: string
  readonly verdictClaimText: string
  readonly verdictQuotedSpan: string
  readonly verdictNotVerified: string
  readonly verdictMatchExact: string
  readonly verdictMatchNone: string
  readonly verdictEvidenceTitle: string
  readonly verdictProblemsTitle: string
  readonly verdictEvidenceNone: string
  readonly verdictGradeNone: string
  readonly verdictBack: string
  readonly verdictGradeNote: string
  readonly askOutputTerminal: string
  readonly askOutputBack: string
  readonly errorBack: string
  readonly badgeVerified: string
  readonly badgeRejected: string
  readonly badgeUnverifiable: string
  readonly reasonExactContainment: string
  readonly reasonEmptyQuote: string
  readonly reasonNoCitation: string
  readonly reasonCitationCapExceeded: string
  readonly reasonIdentifierUnresolved: string
  readonly reasonCollectionAmbiguous: string
  readonly reasonQuoteAbsentAtCitedId: string
  readonly reasonNoMatchingEvidence: string
  readonly reasonVerificationTimeout: string
  readonly reasonDecompositionFailed: string
  readonly errDemoBusyTitle: string
  readonly errDemoUnavailableTitle: string
  readonly errQuestionRequiredTitle: string
  readonly errQuestionRequiredDetail: string
  readonly errModelUnavailableTitle: string
  readonly errModelUnavailableDetail: string
  readonly errQuestionRejectedTitle: string
  readonly errRunBusyTitle: string
  readonly errRunFailedTitle: string
  readonly errCorpusUnavailableTitle: string
  readonly errUnknownSampleTitle: string
  readonly errUnknownSampleDetail: string
  readonly errFormRejectedTitle: string
  readonly errNotFoundTitle: string
  readonly errNotFoundDetail: string
  readonly liveConfiguredShort: string
  readonly liveMissingKey: string
  readonly liveMissingCorpus: string
  readonly liveProviderScripted: string
  readonly liveMissingAttestation: string
  readonly liveNotConfigured: string
  readonly demoQuestionEnOne: string
  readonly demoQuestionEnTwo: string
  readonly demoQuestionArOne: string
  readonly demoQuestionArTwo: string
  readonly hiddenLangLabel: string
}

export const en: Strings = {
  skipToContent: "Skip to content",
  tagline:
    "Per-claim citation verification for Qur'an and hadith — the badge was computed, not asserted.",
  footer: "mizan · Apache-2.0 code · corpus per-source licences · islamicaich.org",
  langSwitchAria: "Language",
  navAsk: "Ask",
  navVerify: "Verify",
  navBadges: "Badges",
  navProcedure: "Procedure",
  navDegradation: "Degradation",
  navProvenance: "Provenance",
  navSources: "Sources",
  navRun: "Run it",
  navMethod: "How it works",
  footerHome: "Back to the tools",
  heroTitleEn: "mizan ",
  heroTitleAr: "ميزان",
  heroTitleTail: " — the balance",
  heroLede:
    "Per-claim citation verification for Qur'an and hadith answers. Every badge on this site was computed by strict normalised containment against an attested corpus — never asserted by a model, never a similarity score.",
  heroClaim: "The badge you see was computed, not asserted.",
  statusCorpus: "Corpus open",
  statusSnapshotHash: "Snapshot hash",
  statusLiveRoute: "Live model route",
  statusBudget: "Verification budget",
  statusClientJs: "Client JavaScript",
  corpusYesPrefix: "attested records",
  corpusKindSnapshot: "the attested snapshot",
  corpusKindAnchors: "demo anchors only — a handful of records, not the full corpus",
  corpusIntegrityFailed: "attestation failed — no verdict is shown",
  corpusAnchorsWarning: "NOT THE FULL CORPUS",
  corpusAnchorsWarningBody:
    "this deployment has no attested snapshot, so the search ran over the demo anchors only. A quote that is really in the corpus will not be found here. The record count below is the whole of what was searched, not a sample of it.",
  askEyebrow: "Ask",
  verifyEyebrow: "Verify",
  trustTitle: "Why the badge is worth reading",
  trustItem1:
    "<strong>Only containment verifies.</strong> A quote reaches VERIFIED when the cited record contains it after deterministic folding. Nothing else produces that badge.",
  trustItem2:
    "<strong>Near is not verified.</strong> Search finds the closest records so you can see what a text resembles, and each one is then checked on its own merits. A close match is REJECTED.",
  trustItem3:
    "<strong>No client JavaScript.</strong> These pages are rendered by the server and carry no script, so what you read is what the verifier computed.",
  trustMethodLink: "Read the full method",
  methodEyebrow: "Method",
  methodTitle: "How every badge is computed",
  methodLede:
    "The reasoning behind the two tools, in the order a judge asks for it: what the verifier does step by step, how the fold treats the text, whose judgement a grade is, what happens when something fails, and where the corpus came from.",
  methodBackHome: "Back to the tools",
  corpusUnavailable: "unavailable",
  liveRouteYes: "configured on this server",
  liveRouteNo: "not configured — replay samples only",
  clientJsNone: "none — pages carry no script tags",
  modePrecomputedNote: "verdicts computed live in this server process",
  modeLiveNote:
    "A live run through the full pipeline. The run header states whether the model was LIVE or a PRECOMPUTED replay.",
  modeReplayNote: "A replay run. The run header states whether the model was LIVE or a PRECOMPUTED replay.",
  modeVerdictsLive: "verdicts computed live in this server process",
  askTitle: "Ask a question",
  askBody:
    "The samples run <code>bun run demo</code> on this machine — the same offline demonstration a judge runs from the repository. Answers replay a committed transcript and are labelled PRECOMPUTED on screen; every badge in the output was computed by the verifier on that run.",
  askQuestionLabel: "Question",
  askQuestionPlaceholder: "What does the Qur'an say about the oneness of God?",
  askRun: "Run",
  askSampleIkhlas: "Sample: oneness of God (replay)",
  askSampleFabricated: "Sample: fabricated hadith (replay)",
  askLiveConfigured:
    "A live model route is configured on this server: typed questions run through the full pipeline.",
  askLiveNoKey:
    "This deployment has no live model key. The sample questions replay the committed transcript; the verifier still computes every badge live.",
  askPrivacyNote:
    "Run traces carry a hash of the question, never the question text. This server writes no question text to any log.",
  verifyTitle: "Verify a quote",
  verifyBody:
    "Paste one text. Every corpus record it might belong to is found, and each one is then verified on its own merits by the same six-step verifier — a badge is only ever printed where strict normalised containment produced it.",
  verifyUnavailable: "Unavailable",
  verifyTextLabel: "Text to look for",
  verifyTextHint: "a Qur'anic verse or a hadith, quoted exactly as you received it",
  verifyTextPlaceholder: "قُلْ هُوَ ٱللَّهُ أَحَدٌ",
  verifyScopeLabel: "Limit to one collection",
  verifyScopeHint: "optional — leave empty to search every collection",
  verifyScopePlaceholder: "all collections",
  verifyRun: "Search and verify",
  verifyNote:
    "The search only chooses which records to look at. Each row's badge is computed by containment against that record, so a near miss is REJECTED rather than softened, and no row is ever shown as a percentage.",
  verifySampleA: "Sample A — a faithful quote",
  verifySampleB: "Sample B — a one-word fabrication",
  verifyResultTitle: "Search results",
  verifyResultSummaryVerified:
    "At least one record in the corpus contains this text verbatim, verified by strict normalised containment.",
  verifyResultSummaryNone:
    "No record in the corpus contains this text verbatim. The nearest records are listed below so you can see what it resembles — each one is a real record, and each one was checked and did not contain it.",
  verifyResultSummaryNoCandidates:
    "The corpus was searched and nothing was near enough to show. That is a statement about proximity you can check, not a verdict.",
  verifyResultSummaryUnavailable:
    "The corpus could not be searched, so no badge is shown for this text. This is not the same answer as &quot;nothing matched&quot;.",
  verifyResultConsidered: "Records examined",
  verifyResultShown: "Records shown",
  verifyResultScopeAll: "every collection in the corpus",
  verifyResultScopeCollection: "only the records of",
  verifyResultScopeWidened: "nothing was near in that collection, so the search was widened to the whole corpus",
  verifyResultQuoteChars: "Folded length of your text",
  verifyResultRank: "Rank",
  verifyResultBadge: "Badge",
  verifyResultScope: "Scope searched",
  verifyResultRecord: "Record",
  verifyResultSharedRun: "Longest shared run",
  verifyResultSharedRunNote: "display-only: folded characters in common, never a match score",
  verifyResultText: "The record's own text",
  verifyResultNotFound: "Nothing was found for that text.",
  verifyResultFormError: "That text could not be searched:",
  badgesTitle: "The three badges",
  badgesBody:
    "These are the only verdicts the verifier can emit. There is no fourth state and no default badge.",
  badgesDiagnosticNote:
    "A display-only longest-run diagnostic exists for human reading; it is not a verdict, and the verifier cannot import it.",
  badgeMeaningVerified:
    "the quoted span is contained in the record the claim cites, after deterministic folding.",
  badgeMeaningUnverifiable:
    "mizan cannot decide: no citation, an unresolvable identifier, an empty quote, a paraphrase, a timeout or malformed model output.",
  badgeMeaningRejected:
    "the citation resolved to a real record and that record does not contain the quote.",
  procedureTitle: "How a badge is computed",
  procedureBody:
    "Per claim, in order. Each step fails closed and returns early; the happy path is the last line. The procedure lives in <code>packages/mizan-verify/src/verify.ts</code>.",
  procedureStep1:
    "<strong>the quote.</strong> An empty or diacritics-only quoted span is UNVERIFIABLE. Only a quoted span is falsifiable; the model&#39;s prose is never verified.",
  procedureStep2:
    "<strong>a citation.</strong> A claim with none is UNVERIFIABLE. Zero evidence blocks approval.",
  procedureStep3:
    "<strong>the cap.</strong> More than three citations are capped; the cap becomes the recorded reason only when it is the reason.",
  procedureStep4:
    "<strong>resolution.</strong> If no cited record exists the claim is UNVERIFIABLE; a number that exists in several collections with none named is UNVERIFIABLE as ambiguous.",
  procedureStep5:
    "<strong>containment.</strong> The folded quote is compared to the folded cited record by strict normalised substring containment. A hit is VERIFIED, with evidence. This is the only route to VERIFIED in the repository.",
  procedureStep6:
    "<strong>coercion.</strong> A VERIFIED carrying no evidence is coerced down to UNVERIFIABLE, and the evidence is cleared so nothing downstream can render a confident badge with no provenance.",
  procedureAnchorNote:
    "Between containment and accusation sits the anchor arm: an abridgement that a hand-drawn anchor locates in the cited record yields UNVERIFIABLE — never VERIFIED and never REJECTED. System instructions tell the model to quote verbatim; that hint improves output quality, never the verdict.",
  procedureFoldTitle: "What the fold is",
  procedureFoldBody:
    "One table, in <code>packages/mizan-core/src/normalize/fold-table.ts</code>, applied once at ingest. It normalises alef and hamza forms, the wasla, ta-marbuta, diacritics, tatweel, digit forms and punctuation. It never rewrites, adds or removes a letter — which is exactly why a fabrication cannot be folded into a match.",
  procedureFoldNote:
    "The folded column is a matching key, not a text. Every user surface renders the original; only the verifier compares the key.",
  procedureGradesTitle: "Grades are never ours",
  procedureGradesBody:
    "A grade is stored exactly as the source dataset asserts it, together with who published it and on what basis. Rows the dataset declines to grade carry an explicit &#8220;no grade&#8221; state rather than a default. The product never infers, upgrades or presents a grade as its own ruling.",
  degradationTitle: "Honest degradation",
  degradationBody:
    "Each failure has one correct surface. These are the words the product prints; a different spelling of the same absence is a defect, not a style choice.",
  degradationItem1:
    "provider unreachable inside its 30s budget → <code>model unavailable</code> — never a canned answer, never a silent mock.",
  degradationItem2:
    "corpus consulted, nothing citable → <code>no sources found</code> — never a guess, never a cached answer.",
  degradationItem3:
    "verification timeout or malformed model output → <code>unverifiable</code> — never <code>verified</code>, never a cached prior verdict.",
  degradationItem4:
    "attestation mismatch or ledger write failure → loud integrity error, no verdict — never warn-and-proceed.",
  degradationItem5:
    "corpus absent or unreadable → the pipeline is not entered; the CLI names the state and exits.",
  degradationItem6:
    "not every claim verified → the run action is <code>refer_to_scholar</code>, not a composite yes.",
  degradationNote:
    "Second-ranker absence is reported in run metadata as semanticRanking: unavailable, never as a silent downgrade presented as full fidelity. Tafsir backends report unavailable rather than fabricating tafsir.",
  provenanceTitle: "Provenance you can check",
  provenanceItem1:
    "The corpus snapshot is attested; a mismatch between the database and its attestation aborts the run rather than producing a badge.",
  provenanceItem2:
    "Every ledger row is hash-chained — each row carries the hash of the row before it. <code>bun run verify:chain</code> re-checks the chain from the committed file.",
  provenanceItem3: "Run traces carry a hash of the question, never the question text.",
  provenanceItem4:
    "Every badge is computed against a snapshot whose hash is shown beside it in the CLI report and on this site&#39;s verdict pages.",
  provenanceItem5:
    "Match strength is a constrained type — <code>exact</code> or <code>none</code> — not a percentage we computed.",
  sourcesTitle: "Sources and licences",
  sourcesBody:
    "Corpus text is not covered by the code&#39;s Apache-2.0 licence. Per-source terms live in <code>data/registry/sources.json</code>, and gate G-5 fails the build on an empty licence field.",
  sourcesThSource: "Source",
  sourcesThRole: "Role",
  sourcesThTerms: "Terms",
  sourcesTanzilRole: "Qur'an, Uthmani script, 6,236 records",
  sourcesTanzilTerms:
    "Distributed unmodified under the Tanzil terms of use (no-derivatives class in the registry).",
  sourcesQuranLabRole: "Hadith and per-row grades, 36,024 records ingested",
  sourcesQuranLabTerms:
    "Arabic matn public domain per the dataset card. Grades stored exactly as published.",
  sourcesCollections:
    "Served collections in the full snapshot: the Qur'an, Sunan Abi Dawud, Sunan an-Nasa&#39;i, Sunan Ibn Majah, Jami&#39; at-Tirmidhi, and Malik&#39;s Muwatta — 27,234 rows, as recorded in <code>docs/value-proof.md</code>. Bukhari, Muslim and an-Nawawi are not served; the registry says so rather than implying a wider coverage than the snapshot holds.",
  sourcesNote:
    "This server searches whichever corpus is open, and says which one that is beside the record count. With <code>data/corpus.db</code> present it is the full attested snapshot above; on a checkout without it, the small anchor corpus from <code>data/eval/demo-anchors.json</code> is used instead so the playground still computes real verdicts offline.",
  runTitle: "Where to run it",
  runItemDemo:
    "<code>bun run demo</code> — the offline demonstration. No API key, labelled replay, full report with each source&#39;s URL and the snapshot hash beside every badge.",
  runItemAsk:
    "<code>bun run ask</code> — the CLI question path. With a key set it runs the live model against an allowlisted OpenAI-compatible endpoint; without one it replays the committed transcript and labels every line precomputed.",
  runItemServer:
    "<code>bun run demo-server</code> — this server. Server-rendered HTML, no client-side script: an ask form, a verify playground, and <code>GET /health</code> for the platform. Badges are computed in the server process.",
  runItemMcp:
    "<code>bun run mcp</code> — mizan verification as a read-only MCP tool (server name <code>mizan-verify</code>) for other AI applications, over stdio.",
  runItemCi:
    "<code>bun run ci</code> — typecheck, per-package tests, then the structural gates G-1 through G-7.",
  runNote:
    "The repository is at github.com/mossaudi/mizan. Deployment notes for the static exhibit and this hosted demo are in docs/live-demo.md; the offline command walkthrough is docs/demo-runbook.md.",
  verdictTitle: "Verdict",
  verdictReason: "Reason",
  verdictMatchStrength: "Match strength",
  verdictSnapshotHash: "Snapshot hash",
  verdictClaimText: "Claim text",
  verdictQuotedSpan: "Quoted span",
  verdictNotVerified: "(not verified)",
  verdictMatchExact: " — a containment hit at 100%; there is no partial credit",
  verdictMatchNone: " — no containment match is claimed",
  verdictEvidenceTitle: "Evidence",
  verdictProblemsTitle: "Resolution problems",
  verdictEvidenceNone:
    "No evidence record: the verdict is not a containment hit. A REJECTED carries no evidence because the quote is absent from the cited record — the absence is the finding.",
  verdictGradeNone: "this dataset asserts no grade for this row",
  verdictBack: "Back",
  verdictGradeNote:
    "Grades shown above are the dataset&#39;s own, never mizan&#39;s. A grade of null means the dataset asserts none for this row.",
  askOutputTerminal: "Terminal output",
  askOutputBack: "Back",
  errorBack: "Back",
  badgeVerified: "VERIFIED",
  badgeRejected: "REJECTED",
  badgeUnverifiable: "UNVERIFIABLE",
  reasonExactContainment:
    "the folded quote is contained in the folded cited record — the only route to VERIFIED.",
  reasonEmptyQuote: "the quoted span was empty or diacritics-only; nothing falsifiable to compare.",
  reasonNoCitation: "the claim carried no citation; zero evidence blocks approval.",
  reasonCitationCapExceeded: "more citations than the per-claim cap and none survived.",
  reasonIdentifierUnresolved:
    "the cited identifier does not resolve to any record; a negative cannot be proven.",
  reasonCollectionAmbiguous:
    "the number exists in more than one collection and the citation named none.",
  reasonQuoteAbsentAtCitedId:
    "the citation resolved to a real record and that record does not contain the quote — the only route to REJECTED.",
  reasonNoMatchingEvidence:
    "a verified verdict carried no matching evidence and was coerced down to UNVERIFIABLE.",
  reasonVerificationTimeout: "the verification budget elapsed; never a cached prior verdict.",
  reasonDecompositionFailed: "claim decomposition produced unusable output.",
  errDemoBusyTitle: "mizan — demo busy",
  errDemoUnavailableTitle: "mizan — demo unavailable",
  errQuestionRequiredTitle: "mizan — question required",
  errQuestionRequiredDetail: "Enter a question, or press one of the sample buttons.",
  errModelUnavailableTitle: "mizan — model unavailable",
  errModelUnavailableDetail:
    "This deployment has no live model key. The sample questions on the home page replay the committed transcript instead; the verifier still computes every badge live. There is no canned answer and no guessed one.",
  errQuestionRejectedTitle: "mizan — question rejected",
  errRunBusyTitle: "mizan — run busy",
  errRunFailedTitle: "mizan — run failed",
  errCorpusUnavailableTitle: "mizan — verifier corpus unavailable",
  errUnknownSampleTitle: "mizan — unknown sample",
  errUnknownSampleDetail: "That sample id is not one this server knows.",
  errFormRejectedTitle: "mizan — form rejected",
  errNotFoundTitle: "mizan — not found",
  errNotFoundDetail: "That path is not part of this demo.",
  liveConfiguredShort: "configured",
  liveMissingKey: "MIZAN_LLM_API_KEY is not set on this server",
  liveMissingCorpus: "data/corpus.db is not present on this server",
  liveProviderScripted: "MIZAN_PROVIDER=scripted forces the committed transcript",
  liveMissingAttestation: "attestation.json is missing at the repository root",
  liveNotConfigured: "not configured — sample replays only",
  demoQuestionEnOne: "What does the Qur'an say about the oneness of God?",
  demoQuestionEnTwo: "What does the hadith say about the end of the world and knowledge diminishing?",
  demoQuestionArOne: "ماذا يقول القرآن عن وحدانية الله؟",
  demoQuestionArTwo: "ماذا يقول الحديث عن نهاية العالم ونقصان العلم؟",
  hiddenLangLabel: "Language",
}

export const ar: Strings = {
  skipToContent: "تخطَّ إلى المحتوى",
  tagline: "التحقق من الاستشهاد لكل ادعاء في القرآن والحديث — الشارة محسوبة لا مُدّعاة.",
  footer: "ميزان · رمز بترخيص Apache-2.0 · نصوص المصدر بترخيصها الخاص · islamicaich.org",
  langSwitchAria: "اللغة",
  navAsk: "اسأل",
  navVerify: "تحقّق",
  navBadges: "الشارات",
  navProcedure: "الإجراء",
  navDegradation: "التدهور الصادق",
  navProvenance: "الأصل",
  navSources: "المصادر",
  navRun: "تشغيل",
  navMethod: "كيف يعمل",
  footerHome: "العودة إلى الأدوات",
  heroTitleEn: "mizan ",
  heroTitleAr: "ميزان",
  heroTitleTail: " — الميزان",
  heroLede:
    "التحقق من الاستشهاد لكل ادعاء في إجابات القرآن والحديث. كل شارة في هذا الموقع حُسبت بالاحتواء المُطبَّع الصارم مقابل مُسنَد موثَّق — لا يدّعيها نموذج، ولا هي درجة تشابه.",
  heroClaim: "الشارة التي تراها محسوبة لا مُدّعاة.",
  statusCorpus: "المدونة المفتوحة",
  statusSnapshotHash: "بصمة اللقطة",
  statusLiveRoute: "مسار النموذج الحيّ",
  statusBudget: "ميزانية التحقق",
  statusClientJs: "جافاسكريبت العميل",
  corpusYesPrefix: "سجلّات مُسنَدة",
  corpusUnavailable: "غير متاح",
  liveRouteYes: "مضبوط على هذا الخادم",
  liveRouteNo: "غير مضبوط — عيّنات إعادة فقط",
  clientJsNone: "لا شيء — الصفحات بلا وسوم برمجة",
  modePrecomputedNote: "الأحكام محسوبة حيًّا في عملية هذا الخادم",
  modeLiveNote:
    "تشغيل حيّ عبر الخط كاملاً. يذكر ترويسة التشغيل إن كان النموذج LIVE أم إعادة PRECOMPUTED.",
  modeReplayNote: "تشغيل إعادة. يذكر ترويسة التشغيل إن كان النموذج LIVE أم إعادة PRECOMPUTED.",
  modeVerdictsLive: "الأحكام محسوبة حيًّا في عملية هذا الخادم",
  askTitle: "اطرح سؤالاً",
  askBody:
    "العيّنات تُشغّل <code>bun run demo</code> على هذه الآلة — العرض غير المتصل نفسه الذي يشغّله القاضي من المستودع. تُعيد الإجابات نصاً مُلتزماً وتُعرض PRECOMPUTED على الشاشة؛ وكل شارة في المخرجات حسبها المحقّق عند ذلك التشغيل.",
  askQuestionLabel: "السؤال",
  askQuestionPlaceholder: "ماذا يقول القرآن عن وحدانية الله؟",
  askRun: "تشغيل",
  askSampleIkhlas: "عيّنة: وحدانية الله (إعادة)",
  askSampleFabricated: "عيّنة: حديث مختلَق (إعادة)",
  askLiveConfigured: "مسار نموذج حيّ مضبوط على هذا الخادم: الأسئلة المكتوبة تمرّ عبر الخط كاملاً.",
  askLiveNoKey:
    "لا يملك هذا النشر مفتاح نموذج حيّ. أسئلة العيّنات تُعيد النص المُلتزم؛ والتحقّق يحسب كل شارة حيًّاً.",
  askPrivacyNote:
    "تتبعات التشغيل تحمل بصمة السؤال لا نصّه. هذا الخادم لا يكتب نصّ أي سؤال في أي سجل.",
  verifyTitle: "تحقّق من اقتباس",
  verifyBody:
    "الصق نصًّا واحدًا. يُبحث في كل سجلات المدونة عن كل موضع قد ينتمي إليه هذا النص، ثم يُتحقَّق من كل موضع على حدة بالمحقّق نفسه من ست خطوات — فلا تُطبع أي شارة إلا حيث أنتجها الاحتواء المُطبَّع الصارم.",
  verifyUnavailable: "غير متاح",
  verifyTextLabel: "النصّ المطلوب البحث عنه",
  verifyTextHint: "آية قرآنية أو حديث، منقولًا كما ورد إليك تمامًا",
  verifyTextPlaceholder: "قُلْ هُوَ ٱللَّهُ أَحَدٌ",
  verifyScopeLabel: "قصر البحث على مجموعة واحدة",
  verifyScopeHint: "اختياري — اتركه فارغًا للبحث في كل المجموعات",
  verifyScopePlaceholder: "كل المجموعات",
  verifyRun: "ابحث وتحقّق",
  verifyNote:
    "البحث يختار السجلات التي تُنظر فيها فقط. وشارة كل سطر يحسبها الاحتواء على ذلك السجل بعينه، فالتقارب القليل يُرفض ولا يُلطَّف، ولا يظهر أي سطر كنسبة مئوية.",
  verifySampleA: "عيّنة أ — اقتباس أمين",
  verifySampleB: "عيّنة ب — اختلاق بكلمة واحدة",
  verifyResultTitle: "نتائج البحث",
  verifyResultSummaryVerified:
    "سجل واحد على الأقل في المدونة يحتوي هذا النص حرفيًّا، وقد تحقّق ذلك بالاحتواء المُطبَّع الصارم.",
  verifyResultSummaryNone:
    "لا سجل في المدونة يحتوي هذا النص حرفيًّا. تُعرض أدناه أقرب السجلات لترى ما يشبهه — كل واحد منها سجل حقيقي، وقد فُحص ولم يكن يحتويه.",
  verifyResultSummaryNoCandidates:
    "فُحصت المدونة ولم يكن هناك ما هو قريب بما يكفي للعرض. هذه مسألة قُرب يستطيع القارئ التحقق منها، وليست حكمًا.",
  verifyResultSummaryUnavailable:
    "تعذّر البحث في المدونة، فلا تُطبع أي شارة لهذا النص. وهذا ليس الجواب نفسه الذي يعنيه «لم يطابق شيء».",
  verifyResultConsidered: "السجلات المفحوصة",
  verifyResultShown: "السجلات المعروضة",
  verifyResultScopeAll: "كل مجموعات المدونة",
  verifyResultScopeCollection: "سجلات",
  verifyResultScopeWidened: "لم يكن هناك شيء قريب في تلك المجموعة، فوُسّع البحث إلى المدونة كلها",
  verifyResultQuoteChars: "الطول المطويّ لنصّك",
  verifyResultRank: "الترتيب",
  verifyResultBadge: "الشارة",
  verifyResultScope: "نطاق البحث",
  verifyResultRecord: "السجل",
  verifyResultSharedRun: "أطول تتابع مشترك",
  verifyResultSharedRunNote: "للعرض فقط: عدد الحروف المطويّة المشتركة، وليس درجة مطابقة",
  verifyResultText: "نصّ السجل كما هو",
  verifyResultNotFound: "لم يُعثر على شيء لهذا النص.",
  verifyResultFormError: "تعذّر البحث في هذا النص:",
  corpusKindSnapshot: "اللقط المُسنَد",
  corpusKindAnchors: "مراسي العرض فقط — عدد قليل من السجلات، لا المدونة الكاملة",
  corpusIntegrityFailed: "فشل الإسناد — لا تُطبع أي شارة",
  corpusAnchorsWarning: "ليست المدونة الكاملة",
  corpusAnchorsWarningBody:
    "لا يملك هذا الإصدار لقطةً مُسنَدة، فالبحث جرى على مراسي العرض وحدها. فلن يُعثر هنا على اقتباس هو في المدونة حقًّا. وعدد السجلات أدناه هو كامل ما فُحص، لا عيّنة منه.",
  askEyebrow: "اسأل",
  verifyEyebrow: "تحقّق",
  trustTitle: "لماذا تستحق الشارة القراءة",
  trustItem1:
    "<strong>الاحتواء وحده هو التحقّق.</strong> يبلغ النص حالة موثَّق حين يحتويه السجل المُستشهَد به بعد الطي الحتمي. ولا شيء آخر يُنتج تلك الشارة.",
  trustItem2:
    "<strong>التقارب ليس تحقّقًا.</strong> يبحث المحرّك عن أقرب السجلات لترى ما يشبهه النص، ثم يُفحص كلٌّ منها على حدة. والقريب المرفوض يبقى مرفوضًا.",
  trustItem3:
    "<strong>لا جافاسكريبت في العميل.</strong> هذه الصفحات يولّدها الخادم ولا تحمل أي برمجة، فما تقرأه هو ما حسبه المحقّق.",
  trustMethodLink: "اقرأ الأسلوب كاملًا",
  methodEyebrow: "الأسلوب",
  methodTitle: "كيف تُحسب كل شارة",
  methodLede:
    "التفصيل وراء الأداتين، بترتيب ما يسأله الحَكَم: ما يفعله المحقّق خطوةً خطوة، وكيف يعامل الطي النصَّ، ولمن حكم الدرجة، وماذا يحدث حين يفشل شيء، ومن أين جاءت المدونة.",
  methodBackHome: "العودة إلى الأدوات",
  badgesTitle: "الشارات الثلاث",
  badgesBody: "هذه الأحكام الوحيدة التي يستطيع المحقّق إصدارها. لا حالة رابعة ولا شارة افتراضية.",
  badgesDiagnosticNote:
    "يوجد تشخيص أطول تسلسل للعرض البشري فقط؛ ليس حكماً، ولا يستطيع المحقّق استيراده.",
  badgeMeaningVerified: "المقتطف موجود في السجل الذي يحيل إليه الادّعاء، بعد الطيّ المُطبَّع الحاسم.",
  badgeMeaningUnverifiable:
    "ميزان لا يستطيع الحسم: لا استشهاد، أو معرّف غير قابل للاستدلال، أو اقتباس فارغ، أو إعادة صياغة، أو انتهاء مهلة، أو مخرجات نموذج تالفة.",
  badgeMeaningRejected: "حَلَّ الاستشهاد إلى سجل حقيقي وذلك السجل لا يحتوي المقتطف.",
  procedureTitle: "كيف تُحسب الشارة",
  procedureBody:
    "لكل ادعاء، بالترتيب. كل خطوة تفشل مغلقة وتعود مبكراً؛ والمسار السعيد هو السطر الأخير. الإجراء في <code>packages/mizan-verify/src/verify.ts</code>.",
  procedureStep1:
    "<strong>الاقتباس.</strong> مقتطف فارغ أو حروف عَرَضية فقط = غير قابل للتحقّق. المقتطف وحده هو قابل للإثبات؛ ونثر النموذج لا يُتحقّق منه أبداً.",
  procedureStep2: "<strong>الاستشهاد.</strong> ادعاء بلا استشهاد = غير قابل للتحقّق. صفر أدلة يمنع الموافقة.",
  procedureStep3:
    "<strong>الحدّ.</strong> أكثر من ثلاثة استشهادات يُحذَف الزائد؛ ويُسجَّل الحدّ سبباً فقط إن كان هو السبب.",
  procedureStep4:
    "<strong>الاستدلال.</strong> إن لم يوجد سجل مُستشهَد فهذا غير قابل للتحقّق؛ ورقم موجود في عدة مجموعات ولم تُسمَّ واحدة = غير قابل للتحقّق بسبب الالتباس.",
  procedureStep5:
    "<strong>الاحتواء.</strong> يُقارَن المقتطف المطويّ بالسجل المُستشهَد المطويّ بحزم احتواء نصّي مُطبَّع. الإصابة = موثَّق مع دليل. هذا هو الطريق الوحيد إلى VERIFIED في المستودع.",
  procedureStep6:
    "<strong>الإجبار.</strong> موثَّق بلا دليل يُنزَل قسراً إلى غير قابل للتحقّق، ويُمسَح الدليل حتى لا يعرض أي مكوّن شارة واثقة بلا أصل.",
  procedureAnchorNote:
    "بين الاحتواء والاتهام يقع ذراع المرساة: اختصار تحدّده مرساة مرسومة يدويًا في السجل المُستشهَد ينتج غير قابل للتحقّق — لا موثَّق ولا مرفوض. تعليمات النظام تُخبر النموذج بأن يُنصّ حرفيًا؛ تلك التلميح يحسّن جودة المخرجات لا الحكم.",
  procedureFoldTitle: "ما هو الطيّ",
  procedureFoldBody:
    "جدول واحد، في <code>packages/mizan-core/src/normalize/fold-table.ts</code>، يُطبَّق مرّة واحدة عند الإدخال. يُطبِّع أشكال الألف والهمزة، والوصل، والتاء المربوطة، والحركات، والتطويل، وأشكال الأرقام، والترقيم. لا يُعيد صياغة حرف أو يضيفه أو يحذفه — ولهذا تمامًا لا يستطيع الاختلاق أن يُطوى إلى مطابقة.",
  procedureFoldNote: "العمود المطويّ مفتاح مطابقة لا نصّاً. كل سطح مستخدم يعرض الأصلي؛ والتحقّق وحده يقارن المفتاح.",
  procedureGradesTitle: "الدرجات لا تكون لنا أبداً",
  procedureGradesBody:
    "تُخزَّن الدرجة كما تدّعيها مجموعة البيانات المصدر تمامًا، مع من نشرها وعلى أي أساس. الصفوف التي ترفض المجموعة منحها درجة تحمل حالة صريحة «بلا درجة» بدل افتراض. المنتج لا يستنتج ولا يرقّي ولا يعرض درجة كحكم خاص به.",
  degradationTitle: "التدهور الصادق",
  degradationBody:
    "لكل فشل سطح واحد صحيح. هذه الكلمات التي يطبعها المنتج؛ وإملاء مختلف لنفس الغياب عيب لا خيار أسلوب.",
  degradationItem1:
    "الموصّل غيرقابل للوصول داخل ميزانيته 30 ثانية → <code>model unavailable</code> — لا إجابة جاهزة، ولا محاكاة صامتة.",
  degradationItem2:
    "المُسنَد مُستشار ولا شيء قابل للاستشهاد → <code>no sources found</code> — لا تخمين، ولا إجابة مُخزَّنة.",
  degradationItem3:
    "انتهاء مهلة التحقق أو مخرجات نموذج تالفة → <code>unverifiable</code> — لا <code>verified</code>، ولا حكم سابق مُخزَّن.",
  degradationItem4:
    "عدم تطابق الإسناد أو فشل كتابة السجل → خطأ سلامة صاخب بلا حكم — لا تحذير ثم متابعة.",
  degradationItem5: "المُسنَد غائب أو غير مقروء → لا يُدخَل الخط؛ والسطر يسمّي الحالة وينتهي.",
  degradationItem6:
    "لم يُتحقَّق من كل ادعاء → إجراء التشغيل <code>refer_to_scholar</code> لا نعم تركيبية.",
  degradationNote:
    "غياب المصنِّف الثاني يُبلَّغ في بيانات التشغيل semanticRanking: unavailable، لا كتخفيض صامت يُقدَّم كمُلاءَمة كاملة. محرّك التفسير يبلّغ unavailable بدل اختلاق تفسير.",
  provenanceTitle: "أصل يمكنك التحقق منه",
  provenanceItem1:
    "لقطة المُسنَد مُسنَدة؛ وعدم تطابق قاعدة البيانات مع إسنادها يُوقِف التشغيل بدل إنتاج شارة.",
  provenanceItem2:
    "كل صف في السجل مرتبط بسلسلة بصمات — كل صف يحمل بصمة ما قبله. <code>bun run verify:chain</code> يعيد فحص السلسلة من الملف المُلتزم.",
  provenanceItem3: "تتبعات التشغيل تحمل بصمة السؤال لا نصّه.",
  provenanceItem4:
    "كل شارة تُحسب مقابل لقطة تُعرض بصمتها بجوارها في تقرير السطر وأصفح الأحكام في هذا الموقع.",
  provenanceItem5: "قوة المطابقة نوع مقيَّد — <code>exact</code> أو <code>none</code> — لا نسبة حسبناها.",
  sourcesTitle: "المصادر والتراخيص",
  sourcesBody:
    "نصوص المُسنَد ليست ضمن ترخيص Apache-2.0 للرمز. شروط كل مصدر في <code>data/registry/sources.json</code>، وبوابة G-5 تفشل البناء عند حقل ترخيص فارغ.",
  sourcesThSource: "المصدر",
  sourcesThRole: "الدور",
  sourcesThTerms: "الشروط",
  sourcesTanzilRole: "القرآن، رسم عثماني، 6,236 سجلًّا",
  sourcesTanzilTerms: "تُوزَّع بلا تعديل وفق شروط استخدام مشروع تانيِل (فئة بلا اشتقاق في السجل).",
  sourcesQuranLabRole: "حديث ودرجات لكل صف، 36,024 سجلًّا مُدخلًا",
  sourcesQuranLabTerms: "نصّ عَرَضي في الملكية العامة بحسب بطاقة البيانات. الدرجات تُخزَّن كما نُشرت.",
  sourcesCollections:
    "المجموعات المخدومة في اللقطة الكاملة: القرآن، وسنن أبي داود، والنسائي، وابن ماجه، والترمذي، وموطأ مالك — 27,234 صفًّا، كما في <code>docs/value-proof.md</code>. البخاري ومسلم والنواوي لا تُخدَم؛ والسجل يقول ذلك بدل إيحاء تغطية أوسع مما تحمله اللقطة.",
  sourcesNote:
    "يبحث هذا الخادم في المدونة المفتوحة ويذكر أيّها إلى جانب عدد السجلات. ومع وجود <code>data/corpus.db</code> فهي اللقطة المُسنَدة الكاملة أعلاه؛ وفي نسخة بلاه، يُستخدم بدلًا منها مُسنَد المراسي الصغير من <code>data/eval/demo-anchors.json</code> حتى تظل ساحة اللعب تحسب أحكامًا حقيقية دون اتصال.",
  runTitle: "أين تُشغّله",
  runItemDemo:
    "<code>bun run demo</code> — العرض غير المتصل. بلا مفتاح API، إعادة مُعلَّمة، وتقرير كامل يحوي رابط كل مصدر وبصمة اللقطة بجوار كل شارة.",
  runItemAsk:
    "<code>bun run ask</code> — مسار الأسئلة في السطر. بوجود مفتاح يُشغّل النموذج الحيّ مقابل نقطة نهاية OpenAI متوافقة مسموحة؛ وبلا مفتاح يُعيد النص المُلتزم ويُعلَّم كل سطر precomputed.",
  runItemServer:
    "<code>bun run demo-server</code> — هذا الخادم. HTML مُصيَّر على الخادم بلا برمجة جانبية: نموذج سؤال، وساحة تحقّق، و<code>GET /health</code> للمنصّة. الشارات تُحسب في عملية الخادم.",
  runItemMcp:
    "<code>bun run mcp</code> — تحقّق ميزان كأداة MCP للقراءة فقط (اسم الخادم <code>mizan-verify</code>) لتطبيقات الذكاء الاصطناعي الأخرى، عبر stdio.",
  runItemCi:
    "<code>bun run ci</code> — فحص الأنواع، واختبارات كل حزمة، ثم البوابات الهيكلية G-1 through G-7.",
  runNote:
    "المستودع في github.com/mossaudi/mizan. ملاحظات النشر للعرض الثابت وهذا المضيف في docs/live-demo.md؛ وجولة الأوامر غير المتصلة في docs/demo-runbook.md.",
  verdictTitle: "الحكم",
  verdictReason: "السبب",
  verdictMatchStrength: "قوة المطابقة",
  verdictSnapshotHash: "بصمة اللقطة",
  verdictClaimText: "نصّ الادّعاء",
  verdictQuotedSpan: "المقتطف",
  verdictNotVerified: "(لا يُتحقّق منه)",
  verdictMatchExact: " — إصابة احتواء عند 100%؛ لا احتساب جزئي",
  verdictMatchNone: " — لا تُدّعي مطابقة احتواء",
  verdictEvidenceTitle: "الدليل",
  verdictProblemsTitle: "مشاكل الاستدلال",
  verdictEvidenceNone:
    "بلا سجل دليل: الحكم ليس إصابة احتواء. المرفوض لا يحمل دليلاً لأن المقتطف غائب عن السجل المُستشهَد — الغياب هو النتيجة.",
  verdictGradeNone: "هذه المجموعة لا تدّعي درجة لهذا الصف",
  verdictBack: "رجوع",
  verdictGradeNote:
    "الدرجات المعروضة أعلاه للمجموعة لا لميزان. درجة null تعني أن المجموعة لا تدّعي درجة لهذا الصف.",
  askOutputTerminal: "مخرجات السطر",
  askOutputBack: "رجوع",
  errorBack: "رجوع",
  badgeVerified: "موثَّق",
  badgeRejected: "مرفوض",
  badgeUnverifiable: "غير قابل للتحقّق",
  reasonExactContainment: "المقتطف المطويّ موجود في السجل المُستشهَد المطويّ — الطريق الوحيد إلى موثَّق.",
  reasonEmptyQuote: "المقتطف فارغ أو حروف عَرَضية فقط؛ لا يوجد شيء قابل للمقارنة.",
  reasonNoCitation: "الادّعاء بلا استشهاد؛ صفر أدلة يمنع الموافقة.",
  reasonCitationCapExceeded: "استشهادات أكثر من حدّ الادّعاء ولم ينجُ منها أحد.",
  reasonIdentifierUnresolved: "المعرّف المُستشهَد لا يحلّ إلى أي سجل؛ والسلب لا يُثبت.",
  reasonCollectionAmbiguous: "الرقم موجود في أكثر من مجموعة والاستشهاد لم يسمِّ واحدة.",
  reasonQuoteAbsentAtCitedId:
    "حَلَّ الاستشهاد إلى سجل حقيقي وهذا السجل لا يحتوي المقتطف — الطريق الوحيد إلى مرفوض.",
  reasonNoMatchingEvidence: "حكم موثَّق حمل دليلاً غير مطابق فنزَل قسراً إلى غير قابل للتحقّق.",
  reasonVerificationTimeout: "انتهت ميزانية التحقق؛ لا حكم سابق مُخزَّن أبداً.",
  reasonDecompositionFailed: "فكّ ادعاء الادّعاء أنتج مخرجات غير صالحة.",
  errDemoBusyTitle: "ميزان — العرض مشغول",
  errDemoUnavailableTitle: "ميزان — العرض غير متاح",
  errQuestionRequiredTitle: "ميزان — السؤال مطلوب",
  errQuestionRequiredDetail: "أدخل سؤالاً، أو اضغط إحدى أزرار العيّنات.",
  errModelUnavailableTitle: "ميزان — النموذج غير متاح",
  errModelUnavailableDetail:
    "لا يملك هذا النشر مفتاح نموذج حيّ. أسئلة العيّنات في الصفحة الرئيسية تُعيد النص المُلتزم؛ والتحقّق يحسب كل شارة حيًّاً. لا إجابة جاهزة ولا مخترَعة.",
  errQuestionRejectedTitle: "ميزان — السؤال مرفوض",
  errRunBusyTitle: "ميزان — التشغيل مشغول",
  errRunFailedTitle: "ميزان — فشل التشغيل",
  errCorpusUnavailableTitle: "ميزان — مُسنَد التحقّق غير متاح",
  errUnknownSampleTitle: "ميزان — عيّنة غير معروفة",
  errUnknownSampleDetail: "معرّف هذه العيّنة ليس ضمن ما يعرفه هذا الخادم.",
  errFormRejectedTitle: "ميزان — النموذج مرفوض",
  errNotFoundTitle: "ميزان — غير موجود",
  errNotFoundDetail: "هذا المسار ليس جزءاً من هذا العرض.",
  liveConfiguredShort: "مضبوط",
  liveMissingKey: "المتغيّر MIZAN_LLM_API_KEY غير مضبوط على هذا الخادم",
  liveMissingCorpus: "الملف data/corpus.db غير موجود على هذا الخادم",
  liveProviderScripted: "MIZAN_PROVIDER=scripted يفرض النص المُلتزم",
  liveMissingAttestation: "ملف attestation.json مفقود في جذر المستودع",
  liveNotConfigured: "غير مضبوط — إعادة عيّنات فقط",
  demoQuestionEnOne: "What does the Qur'an say about the oneness of God?",
  demoQuestionEnTwo: "What does the hadith say about the end of the world and knowledge diminishing?",
  demoQuestionArOne: "ماذا يقول القرآن عن وحدانية الله؟",
  demoQuestionArTwo: "ماذا يقول الحديث عن نهاية العالم ونقصان العلم؟",
  hiddenLangLabel: "اللغة",
}

export const DICT: Readonly<Record<Lang, Strings>> = { en, ar }

export const strings = (lang: Lang): Strings => DICT[lang]

export const dirOf = (lang: Lang): "ltr" | "rtl" => (lang === "ar" ? "rtl" : "ltr")

export const langSelfLabel = (lang: Lang): string => (lang === "ar" ? "العربية" : "English")

export const isLang = (value: string): value is Lang => (LANGS as readonly string[]).includes(value)

export type LangSource = {
  readonly query: string | null
  readonly field: string | null
  readonly cookie: string | null
  readonly acceptLanguage: string | null
}

export const resolveLang = (source: LangSource): Lang => {
  if (source.query !== null && isLang(source.query)) return source.query
  if (source.field !== null && isLang(source.field)) return source.field
  if (source.cookie !== null && isLang(source.cookie)) return source.cookie
  if (source.acceptLanguage !== null && source.acceptLanguage.toLowerCase().startsWith("ar")) return "ar"
  return DEFAULT_LANG
}

export const readCookie = (header: string | null, name: string): string | null => {
  if (header === null) return null
  for (const part of header.split(";")) {
    const trimmed = part.trim()
    const eq = trimmed.indexOf("=")
    if (eq === -1) continue
    if (trimmed.slice(0, eq) !== name) continue
    return trimmed.slice(eq + 1)
  }
  return null
}

export const langCookieHeader = (lang: Lang): string =>
  `${LANG_COOKIE}=${lang}; Path=/; Max-Age=31536000; SameSite=Lax`

const BADGE_BY_LABEL: Readonly<Record<string, keyof Strings>> = {
  VERIFIED: "badgeVerified",
  REJECTED: "badgeRejected",
  UNVERIFIABLE: "badgeUnverifiable",
}

const REASON_BY_CODE: Readonly<Record<string, keyof Strings>> = {
  exact_containment: "reasonExactContainment",
  empty_quote: "reasonEmptyQuote",
  no_citation: "reasonNoCitation",
  citation_cap_exceeded: "reasonCitationCapExceeded",
  identifier_unresolved: "reasonIdentifierUnresolved",
  collection_ambiguous: "reasonCollectionAmbiguous",
  quote_absent_at_cited_id: "reasonQuoteAbsentAtCitedId",
  no_matching_evidence: "reasonNoMatchingEvidence",
  verification_timeout: "reasonVerificationTimeout",
  decomposition_failed: "reasonDecompositionFailed",
}

const MEANING_BY_VERDICT: Readonly<Record<string, keyof Strings>> = {
  verified: "badgeMeaningVerified",
  unverifiable: "badgeMeaningUnverifiable",
  rejected: "badgeMeaningRejected",
}

export const badgeDisplay = (label: string, lang: Lang): string => {
  const key = BADGE_BY_LABEL[label]
  if (key === undefined) return label
  return strings(lang)[key]
}

export const reasonMeaning = (reason: string, lang: Lang): string => {
  const key = REASON_BY_CODE[reason]
  if (key === undefined) return reason
  return strings(lang)[key]
}

export const badgeMeaning = (verdict: string, lang: Lang): string => {
  const key = MEANING_BY_VERDICT[verdict]
  if (key === undefined) return verdict
  return strings(lang)[key]
}

export const DEMO_QUESTIONS: readonly string[] = [
  "What does the Qur'an say about the oneness of God?",
  "What does the hadith say about the end of the world and knowledge diminishing?",
  "ماذا يقول القرآن عن وحدانية الله؟",
  "ماذا يقول الحديث عن نهاية العالم ونقصان العلم؟",
]

export * as I18n from "./i18n.ts"
