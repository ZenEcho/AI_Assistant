import { getVersion } from "@tauri-apps/api/app";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { createLogger } from "@/services/logging/logger";
import packageJson from "../../../package.json";

const logger = createLogger({
  source: "service",
  category: "app",
});

export const GITHUB_RELEASES_URL = "https://github.com/ZenEcho/AI_Assistant/releases";

const GITHUB_LATEST_RELEASE_API_URL =
  "https://api.github.com/repos/ZenEcho/AI_Assistant/releases/latest";

interface GitHubLatestReleaseApiResponse {
  tag_name: string;
  name: string | null;
  html_url: string;
  published_at: string | null;
  draft: boolean;
  prerelease: boolean;
  body: string | null;
}

export interface GitHubLatestRelease {
  tagName: string;
  version: string;
  name: string | null;
  htmlUrl: string;
  publishedAt: string | null;
  draft: boolean;
  prerelease: boolean;
  body: string | null;
}

export interface ReleaseCheckResult {
  currentVersion: string;
  latestRelease: GitHubLatestRelease;
  hasUpdate: boolean;
}

export function normalizeVersion(version: string) {
  return version.trim().replace(/^[vV]+/, "");
}

function parseVersion(version: string) {
  const normalized = normalizeVersion(version);
  const [core = "0", prereleaseText = ""] = normalized.split("-", 2);

  return {
    core: core.split(".").map((segment) => {
      const value = Number.parseInt(segment, 10);
      return Number.isFinite(value) ? value : 0;
    }),
    prerelease: prereleaseText.length > 0 ? prereleaseText.split(".") : [],
  };
}

function comparePrerelease(left: string[], right: string[]) {
  if (left.length === 0 && right.length === 0) {
    return 0;
  }

  if (left.length === 0) {
    return 1;
  }

  if (right.length === 0) {
    return -1;
  }

  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const leftPart = left[index];
    const rightPart = right[index];

    if (leftPart === undefined) {
      return -1;
    }

    if (rightPart === undefined) {
      return 1;
    }

    const leftNumber = Number.parseInt(leftPart, 10);
    const rightNumber = Number.parseInt(rightPart, 10);
    const leftIsNumber = /^\d+$/.test(leftPart);
    const rightIsNumber = /^\d+$/.test(rightPart);

    if (leftIsNumber && rightIsNumber && leftNumber !== rightNumber) {
      return leftNumber > rightNumber ? 1 : -1;
    }

    if (leftIsNumber !== rightIsNumber) {
      return leftIsNumber ? -1 : 1;
    }

    if (leftPart !== rightPart) {
      return leftPart > rightPart ? 1 : -1;
    }
  }

  return 0;
}

export function compareVersions(leftVersion: string, rightVersion: string) {
  const left = parseVersion(leftVersion);
  const right = parseVersion(rightVersion);
  const length = Math.max(left.core.length, right.core.length);

  for (let index = 0; index < length; index += 1) {
    const leftPart = left.core[index] ?? 0;
    const rightPart = right.core[index] ?? 0;

    if (leftPart !== rightPart) {
      return leftPart > rightPart ? 1 : -1;
    }
  }

  return comparePrerelease(left.prerelease, right.prerelease);
}

function mapLatestRelease(raw: GitHubLatestReleaseApiResponse): GitHubLatestRelease {
  return {
    tagName: raw.tag_name,
    version: normalizeVersion(raw.tag_name),
    name: raw.name,
    htmlUrl: raw.html_url,
    publishedAt: raw.published_at,
    draft: raw.draft,
    prerelease: raw.prerelease,
    body: raw.body,
  };
}

function formatHttpError(status: number, body: string) {
  const content = body.trim();

  if (content.length === 0) {
    return `GitHub 请求失败 (${status})`;
  }

  try {
    const raw = JSON.parse(content) as { message?: string };

    if (typeof raw.message === "string" && raw.message.trim().length > 0) {
      return `${raw.message.trim()} (${status})`;
    }
  } catch {
    // Ignore JSON parsing errors and fall back to raw text.
  }

  return `${content} (${status})`;
}

async function fetchLatestReleaseFromHttp() {
  const response = await fetch(GITHUB_LATEST_RELEASE_API_URL, {
    headers: {
      Accept: "application/vnd.github+json",
    },
  });

  if (!response.ok) {
    throw new Error(formatHttpError(response.status, await response.text()));
  }

  return mapLatestRelease((await response.json()) as GitHubLatestReleaseApiResponse);
}

export async function getCurrentAppVersion() {
  if (isTauri()) {
    try {
      return normalizeVersion(await getVersion());
    } catch (error) {
      await logger.warn("app.version.tauri-read-failed", "读取 Tauri 应用版本失败，已回退 package.json", {
        errorStack: error instanceof Error ? error.stack : String(error),
      });
    }
  }

  return normalizeVersion(packageJson.version);
}

export async function fetchLatestGithubRelease() {
  if (isTauri()) {
    try {
      const release = await invoke<GitHubLatestRelease>("fetch_latest_github_release");

      return {
        ...release,
        version: normalizeVersion(release.version),
      };
    } catch (error) {
      await logger.warn("app.update.tauri-fetch-failed", "Tauri 更新检查失败，已回退 webview 请求", {
        errorStack: error instanceof Error ? error.stack : String(error),
      });
    }
  }

  return fetchLatestReleaseFromHttp();
}

export async function checkForGithubReleaseUpdate(): Promise<ReleaseCheckResult> {
  const [currentVersion, latestRelease] = await Promise.all([
    getCurrentAppVersion(),
    fetchLatestGithubRelease(),
  ]);

  return {
    currentVersion,
    latestRelease,
    hasUpdate: compareVersions(latestRelease.version, currentVersion) > 0,
  };
}
