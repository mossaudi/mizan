FROM oven/bun:1.3.14
WORKDIR /app
COPY package.json bun.lock ./
COPY tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts
COPY data ./data
# The authority the snapshot is checked against before the server serves anything. It is a committed
# 2 KB artefact and it travels with the image on purpose: without it the server cannot attest a
# corpus, and refuses to serve rather than serving an unattested one.
COPY attestation.json ./attestation.json
# Required by `bun run ingest`, and not only by it: `requireRepositoryRoot` in @mizan/gate qualifies a
# directory as the workspace root only when it holds BOTH a workspace package.json and AGENTS.md, and
# it refuses to guess when only one signal is present. Omitting this file made the corpus rebuild below
# exit 2 with "not a mizan checkout" — a build failure whose message points at neither cause.
COPY AGENTS.md ./AGENTS.md
RUN bun install --frozen-lockfile

# ── the corpus ────────────────────────────────────────────────────────────────
#
# `data/corpus.db` is ~83 MB, gitignored, and reproducible from the pinned URLs and sha256 sums in
# `data/registry/sources.json`. Two ways this image ends up with it, and which one runs depends
# entirely on how the build was invoked:
#
#   1. A LOCAL `docker build` copies it in, because `.dockerignore` no longer excludes it. The image
#      then carries the exact bytes of the attested snapshot.
#   2. A CLOUD build clones from git, where the database is gitignored, so there is nothing to copy.
#      `bun run ingest` fetches the two pinned sources and rebuilds it.
#
# The step is skipped when the database is already present, so path 1 pays nothing here.
#
# `MIZAN_BUILD_CORPUS=0` skips the rebuild for an offline or size-constrained build. That is a real
# option with a real cost, and the cost is visible rather than silent: the server then serves the
# committed demo anchors, the home page labels them "demo anchors only — a handful of records, not
# the full corpus", and every search result reports the record count it actually scanned. A 2,000-line
# answer that says so is preferable to a 27,234-record claim the deployment cannot honour.
#
# If the rebuild FAILS the build fails. That is the deliberate direction: shipping an image whose
# verify form silently searches four records is the failure mode this step exists to prevent, and an
# operator who wants the anchors has an explicit opt-out rather than an accident.
#
# Either way the result is checked, not trusted: `apps/cli/src/server/corpus.ts` verifies the
# snapshot hash and record count against `attestation.json` before opening it, so a rebuild that
# produced the wrong bytes is refused with no verdict rather than served.
ARG MIZAN_BUILD_CORPUS=1
RUN if [ "$MIZAN_BUILD_CORPUS" = "1" ] && [ ! -f data/corpus.db ]; then \
      echo "no data/corpus.db in the build context; rebuilding from the pinned registry" && \
      bun run ingest; \
    else \
      echo "corpus present or rebuild disabled; nothing to fetch"; \
    fi

ENV PORT=3000
# Fail-closed default: with no key a hosted deployment replays the committed transcript rather than
# guessing. Override with -e MIZAN_PROVIDER=hosted and a key to get the live route.
ENV MIZAN_PROVIDER=scripted
EXPOSE 3000
CMD ["bun", "run", "demo-server"]