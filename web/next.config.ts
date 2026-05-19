import type { NextConfig } from "next";

const isGitHubActions = process.env.GITHUB_ACTIONS === "true";
const repoName = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "";

// GitHub Pages (project pages) are served from `/<repo>/`.
// For local dev and non-GitHub deploys, keep it at root.
const basePath = isGitHubActions && repoName ? `/${repoName}` : "";

const nextConfig: NextConfig = {
  output: "export",
  turbopack: {
    root: process.cwd(),
  },
  // In dev, enabling trailingSlash can lead to confusing redirects/404s.
  // On GitHub Pages we want directory-style URLs (…/index.html), so keep it on there.
  trailingSlash: isGitHubActions,
  basePath,
  assetPrefix: basePath,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
