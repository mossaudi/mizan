/**
 * The stdio transport: byte chunks in, newline-delimited JSON-RPC out.
 *
 * ## Why the transport is a parameter
 *
 * The first version of this loop read `Bun.stdin.stream()` directly and was therefore untestable:
 * `server.test.ts` could only test the pure dispatcher and say nothing about framing, partial
 * lines, or what happens when a client disappears mid-request. Those are exactly the edge cases
 * the story names, and a transport whose behaviour is only reachable by spawning a process is a
 * transport nobody has read.
 *
 * Taking the port as an argument is what lets the same loop be driven by a real stdin stream in
 * `main.ts` and by a hand-written chunk sequence in the tests — including a chunk that ends
 * halfway through a request and never gets another.
 */

/** Where a transport reads from, writes to, and stops. */
export type Port = {
  /** Chunks of decoded text. May split a request anywhere, including mid-token. */
  readonly chunks: AsyncIterable<string>
  /** Called once per complete line, without its terminator. */
  readonly write: (line: string) => void
  /**
   * Interrupt a read that is already pending. Optional, and a stop works without it — see
   * `ServeOptions.cancelled` for what each one is for.
   */
  readonly cancel?: () => void
}

/**
 * The largest request line the transport will buffer, in UTF-16 code units of the decoded stream.
 *
 * ## Why it is CODE UNITS and the name says so
 *
 * `pending.length` is UTF-16 code units, because that is what a JavaScript string counts — an
 * astral character costs two, so the count is neither characters nor UTF-8 bytes. The constant
 * used to be called `MAX_LINE_BYTES` while the doc comment said "code units" and the refusal said
 * "bytes". All three cannot be true at once, and a client sizing a request against a byte figure
 * would be wrong by up to 3x in either direction: a 2.7M-code-unit Arabic request is 8.1M UTF-8
 * bytes, so "under 8MiB" and "accepted" are not the same statement. The name now states the unit
 * that is actually measured, and so does the refusal.
 *
 * ## Why the cap is where it is, and not somewhere round
 *
 * Two bounds have to be reconciled. From below: a request `decodeVerifyArgs` would accept must not
 * be refused for framing, or the transport would reject a call the protocol permits. That
 * ceiling is `MAX_CLAIMS_PER_CALL` claims of (10,000-char text + 10,000-char quote + 128-char id +
 * 3 citations of 768 chars) ≈ 718,000 characters, which is ≈ 4.3 MB written as `\uXXXX` escapes
 * and ≈ 1.4 MB as raw UTF-8 Arabic. From above: a client that never sends a newline must not be
 * able to grow the buffer without limit, which is the denial of service this cap exists for.
 *
 * 8 Mi code units sits above both. The number is derived rather than chosen, because a cap that can
 * refuse a legal call is a bug that only appears on a large request, and a cap that can be reached
 * by a legitimate client is not a cap.
 *
 * The buffer overshoots by at most one chunk, because the check runs on the accumulated buffer
 * rather than before the append: a chunk may itself contain the newline that ends the line, so
 * refusing before appending would refuse legal requests. Chunks arrive bounded by the stream's
 * high-water mark, so the overshoot is a transport detail and not a client-controlled quantity.
 */
export const MAX_LINE_CODE_UNITS = 8_388_608

export const stdioPort = (): Port => {
  const stream = Bun.stdin.stream().pipeThrough(new TextDecoderStream())
  return {
    chunks: stream,
    write: (line: string): void => {
      process.stdout.write(`${line}\n`)
    },
    cancel: (): void => {
      // `cancel` resolves once the stream is closed, so it is deliberately not awaited: the point is
      // to unblock the pending read, and the loop observes the end of the stream on its own.
      void stream.cancel().catch(() => {
        // Already closed or already errored. The loop is ending either way and `serve` reports what
        // it served, so there is nothing here a caller could act on.
      })
    },
  }
}

/** One line in, one response line out — or `null` for a notification, which must not be answered. */
export type Dispatch = (line: string) => string | null

/** What the loop may be told beyond the port itself. Both fields are optional. */
export type ServeOptions = {
  /**
   * Consulted at every chunk boundary and between the lines of a chunk. `true` ends the loop.
   *
   * This is the flag half of stopping: it takes effect the next time there is input, which is
   * prompt for a client that is still talking and not at all for an idle one. `Port.cancel` is the
   * other half — it interrupts the pending read so the flag gets consulted at all.
   */
  readonly cancelled?: () => boolean
  /**
   * Render a refusal the transport itself produces. The protocol layer owns the wire format, so
   * `server.ts` passes the JSON-RPC error envelope and this module never has to import it.
   */
  readonly refuse?: (message: string) => string
}

const neverCancelled = (): boolean => false

/**
 * Run the framing loop until the input ends, or until a stop is requested.
 *
 * ## What happens to a partial line, and why
 *
 * A trailing fragment that is not newline-terminated when the stream ends is DISCARDED, not
 * dispatched. That is the client-disconnects-mid-request case. Processing it would mean guessing
 * where the client meant to stop, and the guess is decided by whoever's transport happened to
 * close first — a JSON-RPC server that completes a request its client never finished is
 * answering a question nobody asked. The client will retry the whole request, which is the
 * recovery the protocol already provides.
 *
 * ## What happens to a notification, and why `dispatch` can return `null`
 *
 * `dispatch` returns `null` for a message with no `id`, and this loop writes nothing for it.
 * JSON-RPC 2.0 section 4.1 is explicit — "The Server MUST NOT reply to a Notification" — and the
 * MCP lifecycle sends exactly one of them, `notifications/initialized`, between `initialize` and
 * `tools/list`. An unsolicited `id: null` response at that point is what the official SDKs treat as
 * a protocol violation, so the handshake a real host performs would have failed here.
 *
 * `served` therefore counts ANSWERED lines, not lines read. A client that sends three requests and
 * one notification gets `served === 3`, which is the number it can match responses against. A line
 * the loop refused itself is not counted, because a client has no response to match it against.
 *
 * ## Sequential dispatch, and why that is not a concurrency limit
 *
 * Lines are dispatched one at a time in arrival order. `handleRequest` is a pure function — no
 * clock, no randomness, no shared mutable state — so interleaving requests could not change an
 * answer even if the loop were parallel. Serialising them means a slow request cannot reorder
 * another client's response, which is the property the concurrency requirement is actually about.
 *
 * ## The over-long line is refused, and then dropped
 *
 * A client that never sends a newline used to grow `pending` until the process died. It now gets
 * one refusal and the tail of that line is discarded until its terminator arrives. It is discarded
 * rather than buffered because buffering it is the defect: a resumed line would put the buffer back
* on the same unbounded path one chunk at a time. The session continues afterwards, so a host that
 * mis-measured one request is not disconnected for it.
 *
 * ## A dispatcher that throws is answered, and the loop lives
 *
 * `dispatch` is the whole server behind this function, and one of the things behind it — a query
 * against a `corpus.db` that rotted on disk after startup — throws rather than returning. Unguarded,
 * that escape unwound `serve`, and `main.ts` printed it as `mcp transport failed` before exiting 3:
 * a *transport* verdict on a *corpus* fault, from a process whose whole job is a transport
 * (AGENTS.md section 16). It also killed a session that one unreadable record had no business
 * ending, and the client could not tell a verdict from a shutdown.
 *
 * So the call is contained here as well as at the layer that knows what went wrong. This guard is
 * deliberately the coarse one: it does not claim to know which subsystem failed, so it asks the
 * caller's own `refuse` to turn the throw into a protocol answer, and the session continues. The
 * refusal counts as `served`, because the client now has a line to match the request against — the
 * alternative is a client blocked forever on an id that will never be answered.
 *
 * The precise surface for a verifier fault is `VERIFIER_UNAVAILABLE`, reported by `executeVerify`
 * where the fault is actually diagnosable. Nothing today reaches the guard below from that path,
 * and that is the point: two guards, two jobs — one names the failure, the other refuses to let any
 * unnamed failure end the loop.
 */
export const serve = async (port: Port, dispatch: Dispatch, options: ServeOptions = {}): Promise<number> => {
  const cancelled = options.cancelled ?? neverCancelled
  const refuse = options.refuse ?? ((message: string): string => message)
  let pending = ""
  let served = 0
  let dropping = false

  /**
   * Dispatch one line, or report a dispatcher that threw.
   *
   * `null` for a line with no answer to give, which is a notification and nothing to write.
   */
  const answerFor = (line: string): string | null => {
    try {
      return dispatch(line)
    } catch (cause) {
      return refuse(`the request could not be dispatched: ${cause instanceof Error ? cause.message : String(cause)}`)
    }
  }

  /**
   * Dispatch every complete line in `buffered`, keeping the unterminated tail for the next chunk.
   *
   * `pending` is written here rather than returned, so that every path through the loop leaves it
   * holding the same one thing: the bytes of a request that has not finished arriving.
   */
  const drain = (buffered: string): void => {
    const parts = buffered.split("\n")
    pending = parts.pop() ?? ""
    for (const line of parts) {
      if (cancelled()) return
      const trimmed = line.trim()
      if (trimmed.length === 0) continue
      const answer = answerFor(trimmed)
      if (answer === null) continue
      port.write(answer)
      served += 1
    }
  }

  for await (const chunk of port.chunks) {
    if (cancelled()) break

    if (dropping) {
      const end = chunk.indexOf("\n")
      if (end < 0) continue
      dropping = false
      drain(chunk.slice(end + 1))
      continue
    }

    drain(`${pending}${chunk}`)
    if (pending.length <= MAX_LINE_CODE_UNITS) continue
    port.write(refuse(`request line exceeded ${MAX_LINE_CODE_UNITS} UTF-16 code units; the rest of it is discarded`))
    dropping = true
    pending = ""
  }

  return served
}

export * as Transport from "./transport.ts"