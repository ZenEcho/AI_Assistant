import sys

file_path = 'src/pages/AppSettingsPage.vue'
with open(file_path, 'r', encoding='utf-8') as f:
    text = f.read()

# Replace imports
old_imports = '''  NAlert,
  NButton,
  NTag,
  NCard,
  NColorPicker,
  NText,
  NGrid,
  NGridItem,
  NInputNumber,
  useMessage,
} from "naive-ui";'''

new_imports = '''  NAlert,
  NButton,
  NTag,
  NSelect,
  NInputNumber,
  useMessage,
} from "naive-ui";'''
text = text.replace(old_imports, new_imports)

# Replace template
template_start = text.find('<template>')
if template_start != -1:
    text = text[:template_start] + '''<template>
  <div class="flex h-full flex-col gap-6 p-1">
    <header class="flex shrink-0 items-center justify-between border-b border-border/60 pb-4">
      <div class="text-xl font-semibold tracking-tight text-foreground">应用设置</div>
      <n-button secondary size="small" @click="handleResetAppearance">恢复默认</n-button>
    </header>

    <div class="grid max-w-3xl gap-6 overflow-y-auto pb-6 pr-2">
      <!-- 外观 -->
      <section>
        <div class="mb-2 px-1 text-xs font-semibold text-muted-foreground uppercase tracking-widest">Appearance</div>
        <div class="overflow-hidden rounded-[12px] border border-border/60 bg-[var(--app-surface-elevated)]">
          <div class="flex items-center justify-between border-b border-border/60 p-4 transition-colors hover:bg-[var(--app-surface-soft)]">
            <div class="text-[13px] font-medium text-foreground">主题模式</div>
            <div class="w-32">
              <n-select
                size="small"
                :value="preferences.themeMode"
                :options="themeModeOptions"
                @update:value="handleThemeModeChange"
              />
            </div>
          </div>
          <div class="flex items-center justify-between p-4 transition-colors hover:bg-[var(--app-surface-soft)]">
            <div class="text-[13px] font-medium text-foreground">主题色</div>
            <div class="flex items-center justify-end gap-2">
              <button
                v-for="color in presetThemeColors"
                :key="color"
                class="flex h-6 w-6 items-center justify-center rounded-full border border-black/10 shadow-sm transition-transform hover:scale-110"
                :style="{ backgroundColor: color }"
                @click="handleThemeColorChange(color)"
              >
                <span
                  v-if="preferences.themeColor === color"
                  class="text-[10px] font-bold text-white mix-blend-difference"
                >
                  ✓
                </span>
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- 常规 -->
      <section>
        <div class="mb-2 px-1 text-xs font-semibold text-muted-foreground uppercase tracking-widest">General</div>
        <div class="overflow-hidden rounded-[12px] border border-border/60 bg-[var(--app-surface-elevated)]">
          <div class="flex flex-wrap gap-3 items-center justify-between border-b border-border/60 p-4 transition-colors hover:bg-[var(--app-surface-soft)]">
            <div class="text-[13px] font-medium text-foreground">关闭行为</div>
            <div class="w-40 shrink-0">
              <n-select
                size="small"
                :value="preferences.closeBehavior"
                :options="closeBehaviorOptions"
                @update:value="handleCloseBehaviorChange"
              />
            </div>
          </div>
          <div class="flex flex-wrap gap-3 items-center justify-between p-4 transition-colors hover:bg-[var(--app-surface-soft)]">
            <div class="text-[13px] font-medium text-foreground">记录保留上限</div>
            <div class="flex items-center gap-3 shrink-0">
              <span class="text-xs text-muted-foreground mr-1">当前存有 {{ history.length }} 条</span>
              <div class="w-24">
                <n-input-number
                  size="small"
                  :value="preferences.historyLimit"
                  :min="1"
                  :max="MAX_HISTORY_LIMIT"
                  :precision="0"
                  clearable
                  @update:value="handleHistoryLimitChange"
                />
              </div>
              <n-button secondary type="error" size="small" @click="handleClearHistory">
                清空
              </n-button>
            </div>
          </div>
        </div>
      </section>

      <!-- 快捷键 -->
      <section>
        <div class="mb-2 px-1 text-xs font-semibold text-muted-foreground uppercase tracking-widest">Shortcuts</div>

        <n-alert v-if="shortcutConflict" type="warning" class="mb-3" closable @close="shortcutConflict = false; shortcutError = ''">
          <div class="flex items-center gap-2">
            <span>{{ shortcutError }}</span>
            <n-button size="small" type="warning" :loading="shortcutRegistering" @click="handleForceApply">
              强制绑定
            </n-button>
          </div>
        </n-alert>
        <n-alert v-else-if="shortcutError && !shortcutConflict" type="error" class="mb-3" closable @close="shortcutError = ''">
          {{ shortcutError }}
        </n-alert>
        
        <div class="overflow-hidden rounded-[12px] border border-border/60 bg-[var(--app-surface-elevated)]">
          <!-- 全局呼出 -->
          <div class="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 p-4 transition-colors hover:bg-[var(--app-surface-soft)]">
            <div class="text-[13px] font-medium text-foreground">全局呼出</div>
            <div class="flex items-center gap-2 shrink-0">
              <div
                class="flex h-7 min-w-[120px] cursor-pointer select-none items-center justify-center rounded-[6px] border border-border/80 bg-[var(--app-surface-soft)] px-3 text-xs font-mono font-medium transition-all hover:border-primary/50"
                :class="shortcutRecording ? 'border-primary text-primary shadow-[0_0_0_2px_rgba(59,130,246,0.2)]' : 'text-foreground'"
                @click="!shortcutRecording && startRecording()"
                title="点击绑定快捷键"
              >
                {{ shortcutDisplayText }}
              </div>
              <n-button
                secondary
                size="small"
                @click="shortcutRecording ? stopRecording() : startRecording()"
              >
                {{ shortcutRecording ? '取消' : '修改' }}
              </n-button>
              <n-button secondary size="small" @click="handleResetShortcut">
                重置
              </n-button>
            </div>
          </div>
          
          <!-- 开始翻译 -->
          <div class="flex flex-wrap items-center justify-between gap-3 p-4 transition-colors hover:bg-[var(--app-surface-soft)]">
            <div class="text-[13px] font-medium text-foreground">开始翻译</div>
            <div class="flex items-center gap-2 shrink-0">
              <div
                class="flex h-7 min-w-[120px] cursor-pointer select-none items-center justify-center rounded-[6px] border border-border/80 bg-[var(--app-surface-soft)] px-3 text-xs font-mono font-medium transition-all hover:border-primary/50"
                :class="translateShortcutRecording ? 'border-primary text-primary shadow-[0_0_0_2px_rgba(59,130,246,0.2)]' : 'text-foreground'"
                @click="!translateShortcutRecording && startTranslateShortcutRecording()"
                title="点击绑定快捷键"
              >
                {{ translateShortcutDisplayText }}
              </div>
              <n-button
                secondary
                size="small"
                @click="translateShortcutRecording ? stopTranslateShortcutRecording() : startTranslateShortcutRecording()"
              >
                {{ translateShortcutRecording ? '取消' : '修改' }}
              </n-button>
              <n-button secondary size="small" @click="handleResetTranslateShortcut">
                重置
              </n-button>
            </div>
          </div>
        </div>
      </section>

      <!-- 关于 -->
      <section>
        <div class="mb-2 px-1 text-xs font-semibold text-muted-foreground uppercase tracking-widest">About</div>
        <div class="overflow-hidden rounded-[12px] border border-border/60 bg-[var(--app-surface-elevated)]">
          <div class="flex flex-wrap items-center justify-between gap-3 p-4 transition-colors hover:bg-[var(--app-surface-soft)]">
            <div class="flex items-center gap-3">
              <div class="text-[13px] font-medium text-foreground">检查更新</div>
              <n-tag v-if="releaseCheckResult?.hasUpdate" type="warning" size="small" :bordered="false" round>
                发现新版 {{ latestVersionLabel }}
              </n-tag>
              <n-tag v-else-if="currentAppVersion" :bordered="false" size="small" round>
                当前 v{{ currentAppVersion }}
              </n-tag>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <span v-if="releaseCheckError" class="mr-2 text-xs text-red-500">{{ releaseCheckError }}</span>
              <n-button
                v-if="releaseCheckResult?.hasUpdate"
                type="primary"
                size="small"
                @click="handleOpenGithubReleases"
              >
                前往下载
              </n-button>
              <n-button
                secondary
                size="small"
                :loading="releaseCheckLoading"
                @click="handleCheckGithubRelease()"
              >
                {{ releaseCheckLoading ? "检查中..." : "检查更新" }}
              </n-button>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
'''
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(text)
    print('Successfully updated template.')
else:
    print('Failed to find template.')
