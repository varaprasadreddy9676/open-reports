import { ExpressionError } from "./errors.js";

export type TokenType =
  | "number"
  | "string"
  | "identifier"
  | "boolean"
  | "null"
  | "punct"
  | "eof";

export interface Token {
  type: TokenType;
  value: string;
  position: number;
}

const PUNCTUATORS = [
  "??",
  "&&",
  "||",
  "==",
  "!=",
  ">=",
  "<=",
  "(",
  ")",
  "[",
  "]",
  ".",
  ",",
  "+",
  "-",
  "*",
  "/",
  "%",
  "!",
  ">",
  "<",
  "?",
  ":",
] as const;

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = source.length;

  while (i < n) {
    const ch = source[i]!;

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(source[i + 1] ?? ""))) {
      const start = i;
      while (i < n && /[0-9]/.test(source[i]!)) i++;
      if (source[i] === ".") {
        i++;
        while (i < n && /[0-9]/.test(source[i]!)) i++;
      }
      tokens.push({ type: "number", value: source.slice(start, i), position: start });
      continue;
    }

    if (ch === '"' || ch === "'") {
      const quote = ch;
      const start = i;
      i++;
      let value = "";
      while (i < n && source[i] !== quote) {
        if (source[i] === "\\" && i + 1 < n) {
          const next = source[i + 1];
          const escapes: Record<string, string> = { n: "\n", t: "\t", "\\": "\\", '"': '"', "'": "'" };
          value += escapes[next!] ?? next;
          i += 2;
        } else {
          value += source[i];
          i++;
        }
      }
      if (i >= n) {
        throw new ExpressionError("Unterminated string literal.", { expression: source, position: start });
      }
      i++; // closing quote
      tokens.push({ type: "string", value, position: start });
      continue;
    }

    if (/[A-Za-z_$]/.test(ch)) {
      const start = i;
      while (i < n && /[A-Za-z0-9_$]/.test(source[i]!)) i++;
      const word = source.slice(start, i);
      if (word === "true" || word === "false") {
        tokens.push({ type: "boolean", value: word, position: start });
      } else if (word === "null") {
        tokens.push({ type: "null", value: word, position: start });
      } else {
        tokens.push({ type: "identifier", value: word, position: start });
      }
      continue;
    }

    const twoChar = source.slice(i, i + 2);
    if ((PUNCTUATORS as readonly string[]).includes(twoChar)) {
      tokens.push({ type: "punct", value: twoChar, position: i });
      i += 2;
      continue;
    }

    if ((PUNCTUATORS as readonly string[]).includes(ch)) {
      tokens.push({ type: "punct", value: ch, position: i });
      i++;
      continue;
    }

    throw new ExpressionError(`Unexpected character "${ch}".`, { expression: source, position: i });
  }

  tokens.push({ type: "eof", value: "", position: n });
  return tokens;
}
