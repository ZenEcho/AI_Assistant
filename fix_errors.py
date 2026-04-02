import sys

file_path = 'src/pages/AppSettingsPage.vue'
with open(file_path, 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace('  DEFAULT_THEME_COLOR,\n', '')

import re

# Remove currentThemeModeLabel
text = re.sub(r'const currentThemeModeLabel = computed\(\(\) => \{.+?\}\);\n', '', text, flags=re.DOTALL)

# Remove currentVersionLabel
text = re.sub(r'const currentVersionLabel = computed\(\(\) =>.+?读取中...",\n\);\n', '', text, flags=re.DOTALL)

# Remove latestReleaseName
text = re.sub(r'const latestReleaseName = computed\(\(\) => releaseCheckResult\.value\?\.latestRelease\.name\?\.trim\(\) \?\? ""\);\n', '', text, flags=re.DOTALL)

# Remove latestReleasePublishedAt
text = re.sub(r'const latestReleasePublishedAt = computed\(\(\) => \{.+?\}\);\n', '', text, flags=re.DOTALL)

# Remove eleaseStatusTitle
text = re.sub(r'const releaseStatusTitle = computed\(\(\) => \{.+?\}\);\n', '', text, flags=re.DOTALL)

# Remove eleaseStatusDescription
text = re.sub(r'const releaseStatusDescription = computed\(\(\) => \{.+?\}\);\n', '', text, flags=re.DOTALL)

# Let\'s do another check to make sure esolveThemeMode import is not unused either, as it was only used by currentThemeModeLabel.
text = text.replace('import { resolveThemeMode } from "@/utils/theme";\n', '')

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(text)

