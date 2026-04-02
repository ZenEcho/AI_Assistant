<script setup lang="ts">
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import { NButton, NEmpty, NPopconfirm, NSwitch, NTag } from "naive-ui";
import ModelFormModal from "@/components/model/ModelFormModal.vue";
import { createEmptyModelConfig, createModelConfigDraft } from "@/constants/app";
import { useAppConfigStore } from "@/stores/appConfig";
import type { ModelConfig, ModelConfigDraft } from "@/types/app";

const appConfigStore = useAppConfigStore();
const { models } = storeToRefs(appConfigStore);

const modalVisible = ref(false);
const modalMode = ref<"create" | "edit">("create");
const editingModel = ref<ModelConfig | null>(null);
const formState = ref<ModelConfigDraft>(createModelConfigDraft());

const orderedModels = computed(() =>
  [...models.value].sort((left, right) => {
    if (left.isDefault !== right.isDefault) {
      return left.isDefault ? -1 : 1;
    }

    if (left.enabled !== right.enabled) {
      return left.enabled ? -1 : 1;
    }

    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  }),
);

const enabledCount = computed(() => models.value.filter((model) => model.enabled).length);
const defaultModelName = computed(
  () => models.value.find((model) => model.isDefault && model.enabled)?.name ?? "未配置",
);

function openCreateModal() {
  modalMode.value = "create";
  editingModel.value = null;
  formState.value = createModelConfigDraft({
    ...createEmptyModelConfig(),
    isDefault: models.value.length === 0,
  });
  modalVisible.value = true;
}

function openEditModal(model: ModelConfig) {
  modalMode.value = "edit";
  editingModel.value = model;
  formState.value = createModelConfigDraft(model);
  modalVisible.value = true;
}

async function handleSetDefault(id: string) {
  await appConfigStore.setDefaultModel(id);
}

async function handleSeedMockModels() {
  await appConfigStore.seedMockModels();
}

async function handleToggleEnabled(id: string, enabled: boolean) {
  await appConfigStore.patchModel(id, { enabled });
}

async function handleDelete(model: ModelConfig) {
  await appConfigStore.removeModel(model.id);
}

function toModelConfig(draft: ModelConfigDraft, current?: ModelConfig): ModelConfig {
  const fallback = current ?? createEmptyModelConfig();
  const now = new Date().toISOString();

  return {
    ...fallback,
    id: current?.id ?? fallback.id,
    name: draft.name.trim(),
    provider: "openai-compatible",
    baseUrl: draft.baseUrl.trim().replace(/\/$/, ""),
    apiKey: draft.apiKey.trim(),
    model: draft.model.trim(),
    enabled: draft.enabled,
    isDefault: draft.isDefault,
    systemPrompt: draft.systemPrompt.trim(),
    timeoutMs: Number(draft.timeoutMs ?? fallback.timeoutMs),
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
  };
}

async function handleSubmit(draft: ModelConfigDraft) {
  const nextModel = toModelConfig(draft, editingModel.value ?? undefined);
  await appConfigStore.upsertModel(nextModel);
  modalVisible.value = false;
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-col gap-3 border-b border-border/50 pb-4 md:flex-row md:items-start md:justify-between">
      <div>
        <div class="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          Models
        </div>
        <h2 class="mt-2 text-xl font-semibold tracking-tight text-foreground md:text-2xl">模型设置</h2>
        <p class="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          管理可用模型、默认模型和连接配置，翻译窗口会同步读取这里的可用列表。
        </p>
      </div>

      <div class="flex flex-wrap gap-2">
        <n-button secondary @click="handleSeedMockModels">填充示例</n-button>
        <n-button type="primary" @click="openCreateModal">新增模型</n-button>
      </div>
    </div>

    <div class="grid gap-3 sm:grid-cols-3">
      <div class="rounded-[16px] border border-border/60 bg-[var(--app-surface-elevated)] px-4 py-4">
        <div class="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Total
        </div>
        <div class="mt-2 text-base font-semibold text-foreground">{{ models.length }}</div>
        <div class="mt-1 text-xs text-muted-foreground">当前已保存模型</div>
      </div>

      <div class="rounded-[16px] border border-border/60 bg-[var(--app-surface-elevated)] px-4 py-4">
        <div class="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Enabled
        </div>
        <div class="mt-2 text-base font-semibold text-foreground">{{ enabledCount }}</div>
        <div class="mt-1 text-xs text-muted-foreground">翻译窗可直接使用</div>
      </div>

      <div class="rounded-[16px] border border-border/60 bg-[var(--app-surface-elevated)] px-4 py-4">
        <div class="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Default
        </div>
        <div class="mt-2 text-base font-semibold text-foreground">{{ defaultModelName }}</div>
        <div class="mt-1 text-xs text-muted-foreground">翻译默认调用</div>
      </div>
    </div>

    <div v-if="orderedModels.length" class="grid gap-4">
      <section
        v-for="model in orderedModels"
        :key="model.id"
        class="rounded-[16px] border border-border/60 bg-[var(--app-surface-elevated)] p-4 sm:p-5"
      >
        <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="min-w-0 text-lg font-semibold text-foreground">{{ model.name }}</h3>
              <n-tag v-if="model.isDefault" size="small" type="primary" round>默认模型</n-tag>
              <n-tag :type="model.enabled ? 'success' : 'default'" size="small" round>
                {{ model.enabled ? "已启用" : "已停用" }}
              </n-tag>
            </div>

            <div class="mt-2 break-all font-mono text-xs leading-5 text-muted-foreground">
              {{ model.baseUrl }}
            </div>
          </div>

          <div class="flex items-center gap-3">
            <span class="text-xs text-muted-foreground">启用</span>
            <n-switch :value="model.enabled" @update:value="(value) => handleToggleEnabled(model.id, value)" />
          </div>
        </div>

        <div class="mt-4 grid gap-3 md:grid-cols-2">
          <div class="rounded-[12px] border border-border/60 bg-[var(--app-surface-soft)] px-4 py-3">
            <div class="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Model
            </div>
            <div class="mt-2 truncate text-sm font-medium text-foreground" :title="model.model">
              {{ model.model }}
            </div>
          </div>

          <div class="rounded-[12px] border border-border/60 bg-[var(--app-surface-soft)] px-4 py-3">
            <div class="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Timeout
            </div>
            <div class="mt-2 text-sm font-medium text-foreground">
              {{ model.timeoutMs }} ms
            </div>
          </div>
        </div>

        <div class="mt-4 rounded-[12px] border border-border/60 bg-[var(--app-surface-soft)] px-4 py-4">
          <div class="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            System Prompt
          </div>
          <p class="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-foreground/88">
            {{ model.systemPrompt }}
          </p>
        </div>

        <div class="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div class="text-xs text-muted-foreground">
            更新于 {{ new Date(model.updatedAt).toLocaleString() }}
          </div>

          <div class="flex flex-wrap gap-2">
            <n-button
              v-if="model.enabled && !model.isDefault"
              size="small"
              secondary
              @click="handleSetDefault(model.id)"
            >
              设为默认
            </n-button>
            <n-button size="small" secondary @click="openEditModal(model)">编辑</n-button>

            <n-popconfirm @positive-click="handleDelete(model)" positive-text="确认" negative-text="取消">
              <template #trigger>
                <n-button size="small" type="error" secondary>删除</n-button>
              </template>
              确认删除“{{ model.name }}”吗？此操作不可恢复。
            </n-popconfirm>
          </div>
        </div>
      </section>
    </div>

    <div v-else class="flex flex-col items-center justify-center rounded-[16px] border border-dashed border-border/60 bg-[var(--app-surface-elevated)] py-16">
      <n-empty description="还没有模型配置">
        <template #extra>
          <n-button secondary @click="openCreateModal">新增模型</n-button>
        </template>
      </n-empty>
    </div>

    <model-form-modal
      v-model:show="modalVisible"
      :mode="modalMode"
      :initial-value="formState"
      @submit="handleSubmit"
    />
  </div>
</template>
