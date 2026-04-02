<script setup lang="ts">
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import { NButton, NPopconfirm, NSwitch } from "naive-ui";
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

function formatTime(iso: string) {
  try {
    return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(iso));
  } catch {
    return iso;
  }
}

async function handleSubmit(draft: ModelConfigDraft) {
  const nextModel = toModelConfig(draft, editingModel.value ?? undefined);
  await appConfigStore.upsertModel(nextModel);
  modalVisible.value = false;
}
</script>

<template>
  <div class="flex flex-col gap-5 pb-4">
    <!-- 顶部动作和汇总 -->
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div class="flex items-center gap-3 text-[13px] text-muted-foreground">
        <span class="font-medium text-foreground">可用 {{ enabledCount }}</span>
        <span class="h-3 w-px bg-border/60"></span>
        <span class="font-medium text-foreground">默认: {{ defaultModelName }}</span>
        <span class="h-3 w-px bg-border/60"></span>
        <span>共 {{ models.length }}</span>
      </div>
      <div class="flex gap-2">
        <n-button size="small" secondary @click="handleSeedMockModels">填充示例</n-button>
        <n-button size="small" type="primary" @click="openCreateModal">新增模型</n-button>
      </div>
    </div>

    <!-- 模型列表 -->
    <div v-if="orderedModels.length" class="flex flex-col gap-3">
      <section
        v-for="model in orderedModels"
        :key="model.id"
        class="group relative flex flex-col justify-between gap-3 rounded-[16px] border border-border/60 bg-[var(--app-surface-elevated)] p-4 transition-all hover:border-border"
      >
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <div class="flex items-center text-[14px]">
              <span class="font-semibold text-foreground truncate mr-2">{{ model.name }}</span>
              <div class="flex gap-1.5 shrink-0">
                <span v-if="model.isDefault" class="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">默认</span>
              </div>
            </div>
            <div class="mt-1 text-[11px] font-mono text-muted-foreground truncate" :title="model.baseUrl">
              {{ model.baseUrl }}
            </div>
          </div>
          <n-switch :value="model.enabled" size="small" @update:value="(value) => handleToggleEnabled(model.id, value)" />
        </div>

        <div class="grid grid-cols-2 gap-2 text-[12px]">
          <div class="flex items-center gap-2 rounded-lg bg-[var(--app-surface-soft)] px-3 py-1.5">
            <span class="text-muted-foreground">模型ID</span>
            <span class="truncate font-medium text-foreground" :title="model.model">{{ model.model }}</span>
          </div>
          <div class="flex items-center gap-2 rounded-lg bg-[var(--app-surface-soft)] px-3 py-1.5">
            <span class="text-muted-foreground">超时</span>
            <span class="font-medium text-foreground">{{ model.timeoutMs }} ms</span>
          </div>
        </div>

        <div class="rounded-lg bg-[var(--app-surface-soft)] px-3 py-2 text-[12px] leading-relaxed text-muted-foreground">
          <div class="line-clamp-2 break-all">{{ model.systemPrompt || "无 System Prompt" }}</div>
        </div>

        <div class="mt-1 flex items-center justify-between">
          <span class="text-[11px] text-muted-foreground/60 transition-opacity group-hover:opacity-100 opacity-50">
            更新于 {{ formatTime(model.updatedAt) }}
          </span>
          <div class="flex gap-1 shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
            <n-button size="tiny" quaternary :disabled="model.isDefault" @click="handleSetDefault(model.id)">设为默认</n-button>
            <n-button size="tiny" quaternary @click="openEditModal(model)">编辑</n-button>
            <n-popconfirm @positive-click="handleDelete(model)">
              <template #trigger>
                <n-button size="tiny" quaternary type="error">删除</n-button>
              </template>
              确定要删除此模型吗？
            </n-popconfirm>
          </div>
        </div>
      </section>
    </div>

    <!-- 空状态 -->
    <div v-else class="flex flex-col items-center justify-center rounded-[16px] border border-dashed border-border/60 bg-[var(--app-surface-elevated)] py-16 text-center">
      <div class="text-[13px] text-muted-foreground">暂无模型</div>
      <n-button size="small" secondary class="mt-4" @click="openCreateModal">
        新增模型
      </n-button>
    </div>

    <model-form-modal
      v-model:show="modalVisible"
      :mode="modalMode"
      :initial-value="formState"
      @submit="handleSubmit"
    />
  </div>
</template>
