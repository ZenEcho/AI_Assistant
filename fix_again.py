import sys

file_path = 'src/pages/AppSettingsPage.vue'
with open(file_path, 'r', encoding='utf-8') as f:
    text = f.read()

# remove currentThemeModeLabel block
old_str_1 = '''const currentThemeModeLabel = computed(() => {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolvedMode = resolveThemeMode(preferences.value.themeMode, prefersDark);

  return resolvedMode === "dark" ? "深色" : "浅色";
});'''
text = text.replace(old_str_1, '')

# remove currentVersionLabel
old_str_2 = '''const currentVersionLabel = computed(() =>
  currentAppVersion.value ? \\\ : "读取中...",
);'''
text = text.replace(old_str_2, '')

# remove release getters
old_str_3 = '''const latestReleaseName = computed(() => releaseCheckResult.value?.latestRelease.name?.trim() ?? "");

const latestReleaseUrl = computed(
  () => releaseCheckResult.value?.latestRelease.htmlUrl ?? GITHUB_RELEASES_URL,
);

const latestReleasePublishedAt = computed(() => {
  const publishedAt = releaseCheckResult.value?.latestRelease.publishedAt;

  if (!publishedAt) {
    return "发布时间待 GitHub 返回";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(publishedAt));
});

const releaseStatusTitle = computed(() => {
  if (!releaseCheckResult.value) {
    return "检查 GitHub 最新版本";
  }

  return releaseCheckResult.value.hasUpdate
    ? \发现新版本 \\
    : "当前已是最新版本";
});

const releaseStatusDescription = computed(() => {
  const result = releaseCheckResult.value;

  if (!result) {
    return "应用会根据 GitHub Releases 返回的 latest release，显示当前版本与最新版本的差异。";
  }

  if (result.hasUpdate) {
    return \当前安装的是 v\，GitHub Releases 最新为 \，可以前往下载新的安装包。\;
  }

  return \当前安装的是 v\，已经与 GitHub Releases 最新发布保持一致。\;
});'''

text = text.replace(old_str_3, '''const latestReleaseUrl = computed(
  () => releaseCheckResult.value?.latestRelease.htmlUrl ?? GITHUB_RELEASES_URL,
);''')

# Now resolveThemeMode import
text = text.replace('import { resolveThemeMode } from "@/utils/theme";\n', '')

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(text)
