/**
 * `@mizan/mcp` — mizan verification as an MCP tool.
 *
 * Read-only, deterministic, and free of corpus content in both directions of the response.
 *
 * ## The dependency on `@mizan/corpus`, and what it is not
 *
 * A corpus dependency is not a verification dependency. `@mizan/verify` still declares exactly
 * one dependency and still terminates every route to `verified` in strict normalized substring
 * containment (AGENTS.md section 9); gate G-1 checks that package's own manifest, not this
 * one's. What is imported here is the read side — citation resolution, the snapshot identity,
 * and the attestation check — because a client asking "is this quote in the corpus" cannot be
 * answered without reading the corpus.
 */

export {
  createServer,
  createDispatcher,
  decodeVerifyArgs,
  executeVerify,
  framing,
  handleRequest,
  parseMessage,
  parseRequest,
  MAX_CITATIONS_PER_CALL,
  MAX_CITATIONS_PER_CLAIM,
  MAX_CLAIMS_PER_CALL,
  MAX_QUESTION_LENGTH,
  MCP_PROTOCOL_VERSION,
  REQUEST_TIMEOUT_MS,
  SERVER_NAME,
  SERVER_VERSION,
  TOOLS,
  VERIFY_TOOL,
  type JsonRpcMessage,
  type JsonRpcNotification,
  type JsonRpcResponse,
  type McpTool,
  type McpToolResult,
} from "./server.ts"

export {
  corpusProblemOf,
  createCorpusVerifier,
  describeCorpusProblem,
  openCorpusVerifier,
  type CorpusOptions,
  type CorpusProblem,
  type OpenVerifier,
  type Verifier,
  type VerifyInput,
} from "./verifier.ts"

export { serve, stdioPort, type Port } from "./transport.ts"

export * as Mcp from "./server.ts"