export {
  QURANIC_ROOTS,
  DECLARED_QURANIC_ROOT_COUNT,
  isQuranicRoot,
  getAllQuranicRoots,
  validateRoot,
} from "./roots.ts"

export {
  extractRoot,
  extractStem,
  extractLemma,
  analyzeText,
  buildRootCoverageArtefact,
  type DualStemmerResult,
  type RootCoverageArtefact,
} from "./analyzer.ts"

export {
  RootExtractionResult,
  StemExtractionResult,
  LemmaExtractionResult,
  TextMorphologyAnalysis,
  RootCoverageArtefact as RootCoverageArtefactSchema,
} from "./schema.ts"

export * as Roots from "./roots.ts"
export * as Analyzer from "./analyzer.ts"
export * as MorphologySchema from "./schema.ts"