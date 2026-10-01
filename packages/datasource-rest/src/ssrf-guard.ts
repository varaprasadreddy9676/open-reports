import dns from "node:dns/promises";
import net from "node:net";

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
function isDisallowedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b! >= 16 && b! <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 0) return true;
    if (a === 100 && b! >= 64 && b! <= 127) return true; // CGNAT
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === "::1") return true;
    if (lower.startsWith("fe80:")) return true; // link-local
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local
    if (lower.startsWith("::ffff:")) {
      // IPv4-mapped IPv6; re-check the embedded IPv4 address.
      return isDisallowedIp(lower.replace("::ffff:", ""));
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

  if (net.isIP(url.hostname)) {
    if (isDisallowedIp(url.hostname)) {
      throw new SsrfBlockedError(`Refusing to fetch "${rawUrl}": targets a private/internal IP address.`);
    }
    return;
  }

  let addresses: string[];
  try {
    addresses = (await dns.lookup(url.hostname, { all: true })).map((a) => a.address);
  } catch {
    throw new SsrfBlockedError(`Refusing to fetch "${rawUrl}": could not resolve host "${url.hostname}".`);
  }

  for (const ip of addresses) {
    if (isDisallowedIp(ip)) {
      throw new SsrfBlockedError(`Refusing to fetch "${rawUrl}": host "${url.hostname}" resolves to a private/internal IP address (${ip}).`);
    }
  }
}
