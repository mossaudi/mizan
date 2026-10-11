export { selectSpansForChunk, selectSpansForChunks, createUnconfiguredExtractProvider } from "./model-span-selector.ts"
export { fenceChunkText, MAX_CHUNK_CHARS } from "./provider.ts"
export { SpanCandidate, SpanCandidates, ModelSpanSelectorInput, ModelSpanSelectorOutput } from "./schema/span-candidate.ts"
export { SpanSourceHint, CollectionSourceHint, FullSourceHint } from "./schema/span-source-hint.ts"
export { SpanSourceHintNs } from "./schema/span-source-hint.ts"
export { extractProvider, unconfiguredExtractProvider, type ExtractTransport, type ExtractProviderConfig, type ExtractGenerationResult } from "./provider.ts"

export * as Extract from "./model-span-selector.ts"
export * as ExtractProvider from "./provider.ts"