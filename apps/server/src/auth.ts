import type { FastifyReply, FastifyRequest } from "fastify";

/**
 * Simple API-key auth (spec section 49: "For V1 provide simple server
 * authentication: API keys"). Keys come from API_KEYS (comma-separated) in
 * the environment -- never hardcoded, never logged. If unset, the server
 * runs in open dev mode with a loud startup warning (see index.ts) rather
 * than silently being insecure by default.
 */
export function createAuthHook(apiKeys: string[]) {
  const keySet = new Set(apiKeys);

  return async function authHook(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (keySet.size === 0) return; // dev mode, no keys configured

    const header = request.headers["authorization"];
    const headerKey = typeof header === "string" && header.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
    const apiKeyHeader = request.headers["x-api-key"];
    const key = headerKey ?? (typeof apiKeyHeader === "string" ? apiKeyHeader : undefined);

    if (!key || !keySet.has(key)) {
      await reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "A valid API key is required (Authorization: Bearer <key> or X-API-Key header)." } });
    }
  };
}
