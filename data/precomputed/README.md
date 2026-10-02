# Precomputed Transcripts

## What these are

Precomputed transcripts for common queries, shipped with the product so demos can
proceed even when the LLM provider is completely unavailable.

## Labelling

Every transcript file contains:
- `schemaVersion` — the transcript schema version
- `generatedAt` — when the transcript was generated
- `provider` — the provider name that generated it
- `model` — the model that generated it
- `precomputed` — always `true`, so a replay can never be mistaken for a live generation
- `entries` — the transcript entries, each with a question hash and answer

## Distinguishing from live results

Precomputed transcripts are clearly distinguished from live results at three points:

1. **The file** — `precomputed: true` in the JSON
2. **The provider** — `kind: "precomputed"` in the provider type
3. **The trace** — `transcript: "precomputed"` in the run trace

## Invalidation

When the corpus is updated, precomputed transcripts may become stale. The system
warns that results may not reflect the current corpus. To regenerate transcripts,
run `bun run make:transcript`.

## Security

Precomputed transcripts contain no API keys, no credentials, and no provider-specific
tokens. They contain only question hashes and answers.
