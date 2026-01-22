type Maybe<T> = T | undefined;

function repoFromEnv(): Maybe<{ owner: string; name: string }> {
  const repo = process.env.GITHUB_REPOSITORY || process.env.NEXT_PUBLIC_FORK_REPO || "";
  const [owner, name] = repo.split("/");
  if (!owner || !name) return undefined;
  return { owner, name };
}

const inferred = repoFromEnv();

export const siteConfig = {
  forkRepoUrl: ((): Maybe<string> => {
    if (process.env.NEXT_PUBLIC_FORK_REPO_URL) return process.env.NEXT_PUBLIC_FORK_REPO_URL;
    if (inferred) return `https://github.com/${inferred.owner}/${inferred.name}`;
    return undefined;
  })(),

  forkIssuesUrl: ((): Maybe<string> => {
    if (process.env.NEXT_PUBLIC_FORK_ISSUES_URL) return process.env.NEXT_PUBLIC_FORK_ISSUES_URL;
    const repoUrl = process.env.NEXT_PUBLIC_FORK_REPO_URL
      ? process.env.NEXT_PUBLIC_FORK_REPO_URL
      : inferred
        ? `https://github.com/${inferred.owner}/${inferred.name}`
        : undefined;
    return repoUrl ? `${repoUrl}/issues` : undefined;
  })(),

  forkSiteUrl: ((): Maybe<string> => {
    if (process.env.NEXT_PUBLIC_FORK_SITE_URL) return process.env.NEXT_PUBLIC_FORK_SITE_URL;
    if (inferred) return `https://${inferred.owner}.github.io/${inferred.name}/`;
    return undefined;
  })(),

  upstreamRepoUrl: "https://github.com/apace7/local_volume_database",
  upstreamPaperArxivUrl: "https://arxiv.org/abs/2411.07424",
  upstreamPaperAdsUrl: "https://ui.adsabs.harvard.edu/abs/2025OJAp....8E.142P/abstract",
  upstreamLicenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
  aladinLiteUrl: "https://aladin.cds.unistra.fr/AladinLite/",
} as const;
