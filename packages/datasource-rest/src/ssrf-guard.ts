import dns from "node:dns";
import net, { type LookupFunction } from "node:net";

export class SsrfBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfBlockedError";
  }
}

/** Private/loopback/link-local/reserved ranges that a server-side fetch must
 * never be allowed to reach on an author's behalf -- the classic SSRF
 * pivot-to-internal-network vector (cloud metadata endpoints, internal
 * admin panels, etc). This is a default-deny allowlist of what's fine
 * (public internet), not an attempt to enumerate every bad range. */
export function isDisallowedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b! >= 16 && b! <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 0) return true;
    if (a === 100 && b! >= 64 && b! <= 127) return true; // CGNAT
    if (a === 192 && b === 0) return true; // IETF protocol assignments / documentation
    if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
    if (a! >= 224) return true; // multicast, reserved, broadcast
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true;
    if (lower.startsWith("ff")) return true; // multicast
    if (lower.startsWith("fe80:")) return true; // link-local
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local
    if (lower.startsWith("::ffff:")) {
      // IPv4-mapped IPv6, written either dotted (::ffff:127.0.0.1) or as hex (::ffff:7f00:1).
      const embedded = lower.slice("::ffff:".length);
      if (net.isIPv4(embedded)) return isDisallowedIp(embedded);
      const [high, low] = embedded.split(":").map((part) => parseInt(part, 16));
      if (high === undefined || low === undefined || Number.isNaN(high) || Number.isNaN(low)) return true;
      return isDisallowedIp([high >> 8, high & 255, low >> 8, low & 255].join("."));
    }
    return false;
  }
  return true; // not a parseable IP at all -- refuse rather than guess
}

export interface SsrfGuardOptions {
  /** Explicit hostname allowlist. If set, only these hosts (exact match) may
   * be requested, regardless of IP checks -- the strictest, recommended mode
   * for production. */
  allowedHosts?: string[];
  /** DNS resolver used both when validating and when connecting. Defaults to the system resolver; tests inject one to simulate rebinding. */
  lookup?: LookupFunction;
}

/** Strips the brackets WHATWG URLs keep around IPv6 hosts, so `[::1]` is checked as an IP literal. */
export function urlHost(url: URL): string {
  return url.hostname.startsWith("[") ? url.hostname.slice(1, -1) : url.hostname;
}

function resolveAll(lookup: LookupFunction, hostname: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    lookup(hostname, { all: true }, (err, addresses) => {
      if (err) reject(err);
      else resolve((addresses as unknown as { address: string }[]).map((entry) => entry.address));
    });
  });
}

/** Validates a target URL before it's ever fetched: protocol must be
 * http/https, and (unless the host is in an explicit allowlist) the
 * hostname must not resolve to a private/loopback/link-local address. */
export async function assertUrlIsSafe(rawUrl: string, options: SsrfGuardOptions = {}): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SsrfBlockedError(`Invalid URL: "${rawUrl}".`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SsrfBlockedError(`Refusing to fetch "${rawUrl}": only http/https URLs are allowed.`);
  }

  if (options.allowedHosts) {
    if (!options.allowedHosts.includes(url.hostname)) {
      throw new SsrfBlockedError(`Refusing to fetch "${rawUrl}": host "${url.hostname}" is not in the configured allowlist.`);
    }
    return;
  }

  const host = urlHost(url);
  if (net.isIP(host)) {
    if (isDisallowedIp(host)) {
      throw new SsrfBlockedError(`Refusing to fetch "${rawUrl}": targets a private/internal IP address.`);
    }
    return;
  }

  let addresses: string[];
  try {
    addresses = await resolveAll(options.lookup ?? (dns.lookup as LookupFunction), url.hostname);
  } catch {
    throw new SsrfBlockedError(`Refusing to fetch "${rawUrl}": could not resolve host "${url.hostname}".`);
  }

  for (const ip of addresses) {
    if (isDisallowedIp(ip)) {
      throw new SsrfBlockedError(`Refusing to fetch "${rawUrl}": host "${url.hostname}" resolves to a private/internal IP address (${ip}).`);
    }
  }
}
