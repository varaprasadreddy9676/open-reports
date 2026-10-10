import React, { useEffect, useState } from "react";

const REPO_PATH = "varaprasadreddy9676/open-reports";
export const REPO = `https://github.com/${REPO_PATH}`;
const CACHE_KEY = "or-landing-stars";
/** A small count reads as "nobody uses this", so it is only shown once it is social proof. */
const MIN_SHOWN = 50;

function useStarCount(): number | undefined {
  const [stars, setStars] = useState<number | undefined>(() => {
    try { const cached = sessionStorage.getItem(CACHE_KEY); return cached ? Number(cached) : undefined; } catch { return undefined; }
  });
  useEffect(() => {
    if (stars !== undefined) return;
    const controller = new AbortController();
    fetch(`https://api.github.com/repos/${REPO_PATH}`, { signal: controller.signal, headers: { Accept: "application/vnd.github+json" } })
      .then((response) => (response.ok ? response.json() : undefined))
      .then((body: { stargazers_count?: unknown } | undefined) => {
        if (typeof body?.stargazers_count !== "number") return;
        setStars(body.stargazers_count);
        try { sessionStorage.setItem(CACHE_KEY, String(body.stargazers_count)); } catch { /* storage unavailable: count is refetched next visit */ }
      })
      .catch(() => { /* offline or rate-limited: the button still works without a count */ });
    return () => controller.abort();
  }, [stars]);
  return stars;
}

const formatStars = (count: number) => (count >= 1000 ? `${(count / 1000).toFixed(count >= 10_000 ? 0 : 1)}k` : String(count));

export function GithubMark({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .8a11.2 11.2 0 0 0-3.54 21.83c.56.1.77-.24.77-.54v-2.08c-3.12.68-3.78-1.33-3.78-1.33-.51-1.3-1.25-1.65-1.25-1.65-1.02-.7.08-.68.08-.68 1.13.08 1.73 1.16 1.73 1.16 1 1.72 2.63 1.22 3.27.93.1-.72.4-1.22.71-1.5-2.49-.28-5.11-1.24-5.11-5.54 0-1.23.44-2.23 1.16-3.02-.12-.29-.5-1.43.11-2.97 0 0 .94-.3 3.08 1.15a10.7 10.7 0 0 1 5.6 0c2.14-1.45 3.08-1.15 3.08-1.15.61 1.54.23 2.68.11 2.97.72.79 1.15 1.79 1.15 3.02 0 4.31-2.62 5.25-5.12 5.53.4.35.76 1.03.76 2.08v3.08c0 .3.2.64.77.53A11.2 11.2 0 0 0 12 .8Z" /></svg>;
}

/** "Star on GitHub" with the live count when it is large enough to reassure. */
export function GithubStar({ className = "", label = "Star" }: { className?: string; label?: string }) {
  const stars = useStarCount();
  const showCount = stars !== undefined && stars >= MIN_SHOWN;
  return <a className={`github-star ${className}`} href={REPO} target="_blank" rel="noopener noreferrer" aria-label={showCount ? `${label} on GitHub, ${stars} stars` : `${label} on GitHub`}>
    <GithubMark /><span className="github-star-label"><svg className="github-star-icon" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2.8 2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9Z" /></svg>{label}</span>
    {showCount && <span className="github-star-count">{formatStars(stars)}</span>}
  </a>;
}
