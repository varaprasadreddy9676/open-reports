import dns from "node:dns";
import type { LookupFunction } from "node:net";
import { Agent, fetch, type Response } from "undici";
import { assertUrlIsSafe, isDisallowedIp, SsrfBlockedError, type SsrfGuardOptions } from "./ssrf-guard.js";

export const MAX_REDIRECTS = 3;

export interface SafeFetchInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}

type LookupAddress = { address: string; family: number };

/** Resolves at connect time and refuses private addresses, so the address that is connected to is the one
 * that was checked: a host cannot pass validation and then rebind to an internal address. */
function pinnedLookup(resolve: LookupFunction): LookupFunction {
  return (hostname, options, callback) => {
    resolve(hostname, { ...options, all: true }, (err, result) => {
      if (err) return callback(err, "", 0);
      const addresses = result as unknown as LookupAddress[];
      const blocked = addresses.find((entry) => isDisallowedIp(entry.address));
      if (blocked || addresses.length === 0) {
        const reason = blocked ? `resolves to a private/internal IP address (${blocked.address})` : "did not resolve";
        return callback(new SsrfBlockedError(`Refusing to connect to "${hostname}": ${reason}.`), "", 0);
      }
      if ((options as { all?: boolean }).all) (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, addresses);
      else callback(null, addresses[0]!.address, addresses[0]!.family);
    });
  };
}

const agents = new WeakMap<LookupFunction, Agent>();
const systemLookup = dns.lookup as LookupFunction;

/** An explicit host allowlist is the operator's decision to trust those hosts (including internal ones),
 * so only the default, allowlist-free mode pins connections to public addresses. */
function dispatcherFor(options: SsrfGuardOptions): Agent | undefined {
  if (options.allowedHosts) return undefined;
  const resolve = options.lookup ?? systemLookup;
  let agent = agents.get(resolve);
  if (!agent) {
    agent = new Agent({ connect: { lookup: pinnedLookup(resolve) } });
    agents.set(resolve, agent);
  }
  return agent;
}

/** Resolves a redirect `location` against the current URL; an https request may never continue over http. */
export function redirectTarget(from: URL, location: string): URL {
  const next = new URL(location, from);
  if (from.protocol === "https:" && next.protocol !== "https:") {
    throw new SsrfBlockedError(`Refusing to follow a redirect from https to "${next.protocol}".`);
  }
  return next;
}

function unwrap(err: unknown): unknown {
  let current = err;
  while (current instanceof Error && current.cause) {
    if (current.cause instanceof SsrfBlockedError) return current.cause;
    current = current.cause;
  }
  return err;
}

/**
 * Fetches a URL on an author's behalf. Every hop, including each redirect, is validated before it is
 * requested; connections are pinned to validated public addresses; author headers are not forwarded
 * to a different origin; and at most {@link MAX_REDIRECTS} redirects are followed.
 */
export async function safeFetch(rawUrl: string, init: SafeFetchInit = {}, options: SsrfGuardOptions = {}): Promise<Response> {
  let url = new URL(rawUrl);
  let { method = "GET", headers = {}, body } = init;
  const dispatcher = dispatcherFor(options);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertUrlIsSafe(url.toString(), options);
    let response: Response;
    try {
      response = await fetch(url, { method, headers, body, signal: init.signal, redirect: "manual", dispatcher });
    } catch (err) {
      throw unwrap(err);
    }
    const location = response.status >= 300 && response.status < 400 ? response.headers.get("location") : null;
    if (!location) return response;
    await response.body?.cancel();
    const next = redirectTarget(url, location);
    if (next.origin !== url.origin) headers = {};
    if (response.status === 303 || ((response.status === 301 || response.status === 302) && method === "POST")) {
      method = "GET";
      body = undefined;
      headers = Object.fromEntries(Object.entries(headers).filter(([name]) => name.toLowerCase() !== "content-type"));
    }
    url = next;
  }
  throw new SsrfBlockedError(`Refusing to follow more than ${MAX_REDIRECTS} redirects from "${rawUrl}".`);
}
