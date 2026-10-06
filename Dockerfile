FROM oven/bun:1.3.14
WORKDIR /app
COPY package.json bun.lock tsconfig.base.json ./
# AGENTS.md is not documentation here, it is a build input: `requireRepositoryRoot` qualifies a
# directory as the mizan workspace only when it holds BOTH a workspace package.json AND AGENTS.md,
# so anything invoking it (ingest, the gates) fails without the second marker.
COPY AGENTS.md ./AGENTS.md
# The authority the server checks the snapshot against before serving a verdict. Without it the
# server cannot attest a corpus, and refuses rather than serving an unattested one.
COPY attestation.json ./attestation.json
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts
COPY data ./data
RUN bun install --frozen-lockfile

# ── the corpus ───────────────────────────────────────────────────────────────
# data/corpus.db is ~80 MB and is NOT in the repository. Its compressed form is
# (13.7 MB, 17% — gzip on Arabic text), which is small enough to commit, and this step expands it
# in a second or two. Decompressing beats rebuilding from the pinned registry here on every axis a
# small container cares about: no 42k-row download, no upstream availability, no network at all.
# `docker run` is then all a deployment needs, with no volume and no host artefact.
#
# MIZAN_BUILD_CORPUS=0 skips the expansion for a deliberately small build. That has a real cost and
# the cost is visible, not silent: the server then serves the demo anchors, the home page says
# "demo anchors only", and every search result carries a NOT THE FULL CORPUS banner. A four-record
# answer that says so beats a 27,234-record claim the deployment cannot honour.
#
# Nothing here is trusted: apps/cli/src/server/corpus.ts verifies the snapshot hash and record count
# against attestation.json before opening it, so wrong bytes are refused with no verdict.
ARG MIZAN_BUILD_CORPUS=1
RUN if [ "$MIZAN_BUILD_CORPUS" = "1" ]; then gunzip -f data/corpus.db.gz; fi

ENV PORT=3000
# Fail-closed default: with no key, replay the committed transcript rather than guess. Override with
# -e MIZAN_PROVIDER=hosted plus a key for the live route.
ENV MIZAN_PROVIDER=scripted
EXPOSE 3000
CMD ["bun", "run", "demo-server"]