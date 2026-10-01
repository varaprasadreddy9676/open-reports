export class ExpressionError extends Error {
  constructor(
    message: string,
    public readonly info: {
      expression: string;
      position?: number;
      suggestion?: string;
    }
  ) {
    super(ExpressionError.format(message, info));
    this.name = "ExpressionError";
  }

  private static format(message: string, info: { expression: string; suggestion?: string }): string {
    let text = `Expression error in "${info.expression}": ${message}`;
    if (info.suggestion) {
      text += ` Did you mean "${info.suggestion}"?`;
    }
    return text;
  }
}

/** Finds the closest key by edit distance, used to suggest fixes for typos (row.prcie -> row.price). */
export function closestMatch(target: string, candidates: string[]): string | undefined {
  let best: string | undefined;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const distance = levenshtein(target, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  // Only suggest when the candidate is "close enough" to be a plausible typo.
  if (best !== undefined && bestDistance <= Math.max(2, Math.ceil(target.length / 3))) {
    return best;
  }
  return undefined;
}

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i]![0] = i;
  for (let j = 0; j <= b.length; j++) dp[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost);
    }
  }
  return dp[a.length]![b.length]!;
}
