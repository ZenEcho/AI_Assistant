<script setup lang="ts">
import { ref } from "vue";
import { storeToRefs } from "pinia";
import { NButton, NTag, NCard, NSwitch, NText, NEmpty, NAlert, NPopconfirm } from "naive-ui";
import ModelFormModal from "@/components/model/ModelFormModal.vue";
import { createEmptyModelConfig, createModelConfigDraft } from "@/constants/app";
import { useAppConfigStore } from "@/stores/appConfig";
import type { ModelConfig, ModelConfigDraft } from "@/types/app";
import { parseHeaderText } from "@/utils/headers";

const appConfigStore = useAppConfigStore();
const { models } = storeToRefs(appConfigStore);

const modalVisible = ref(false);
const modalMode = ref<"create" | "edit">("create");
const editingModel = ref<ModelConfig | null>(null);
const formState = ref<ModelConfigDraft>(createModelConfigDraft());

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
    temperature: Number(draft.temperature ?? fallback.temperature),
    maxTokens: Number(draft.maxTokens ?? fallback.maxTokens),
    enabled: draft.enabled,
    isDefault: draft.isDefault,
    systemPrompt: draft.systemPrompt.trim(),
    timeoutMs: Number(draft.timeoutMs ?? fallback.timeoutMs),
    extraHeaders: parseHeaderText(draft.extraHeadersText),
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
  <div class="h-full flex flex-col gap-6 animate-in fade-in duration-300">
    <!-- Header -->
    <div class="flex flex-col gap-4 border-b border-border/50 pb-5 md:flex-row md:items-start md:justify-between">
      <div>
        <n-text depth="3" class="text-xs tracking-wider uppercase font-semibold">Model Configurations</n-text>
        <h1 class="mt-2 text-3xl font-bold tracking-tight text-foreground md:text-4xl">模型设置</h1>
        <p class="mt-2 text-sm text-muted-foreground max-w-2xl leading-relaxed">
          配置翻译所使用的 OpenAI Compatible 模型。翻译页会在已启用模型中单选，默认模型会作为初始选项。
        </p>
      </div>
      <div class="flex flex-wrap gap-3 shrink-0">
        <n-button secondary @click="handleSeedMockModels">填充示例参数</n-button>
        <n-button type="primary" @click="openCreateModal">新增模型</n-button>
      </div>
    </div>

    <n-alert title="本地持久化说明" type="info" class="rounded-xl">
      模型配置会通过 Tauri Store 插件保存在本地应用数据目录，重新打开应用后仍会保留。
    </n-alert>

    <div v-if="models.length" class="grid gap-6 2xl:grid-cols-2">
      <n-card
        v-for="model in models"
        :key="model.id"
        class="h-full rounded-2xl shadow-sm border-border/50 bg-card/40 backdrop-blur-md"
        :bordered="true"
      >
        <template #header>
          <div class="flex flex-col gap-2">
            <div class="flex items-center gap-3">
              <span class="text-xl font-bold break-words">{{ model.name }}</span>
              <n-tag v-if="model.isDefault" type="primary" size="small" round>默认模型</n-tag>
              <n-tag :type="model.enabled ? 'success' : 'default'" size="small" round>
                {{ model.enabled ? "已启用" : "已停用" }}
              </n-tag>
            </div>
            <n-text depth="3" class="text-sm break-all font-mono">{{ model.baseUrl }}</n-text>
          </div>
        </template>
        <template #header-extra>
          <div class="flex items-center gap-2">
            <n-text depth="3" class="text-xs">启用</n-text>
            <n-switch
              :value="model.enabled"
              @update:value="(val) => handleToggleEnabled(model.id, val)"
            />
          </div>
        </template>

        <div class="grid gap-4 sm:grid-cols-2 mt-2">
          <div class="rounded-xl border border-border/50 p-4 bg-card/50">
            <n-text depth="3" class="text-xs font-semibold uppercase">Provider</n-text>
            <div class="mt-2 font-semibold">OpenAI Compatible</div>
          </div>
          <div class="rounded-xl border border-border/50 p-4 bg-card/50">
            <n-text depth="3" class="text-xs font-semibold uppercase">Model</n-text>
            <div class="mt-2 font-semibold truncate" :title="model.model">{{ model.model }}</div>
          </div>
          <div class="rounded-xl border border-border/50 p-4 bg-card/50">
            <n-text depth="3" class="text-xs font-semibold uppercase">Generation</n-text>
            <div class="mt-2 font-semibold">Temp {{ model.temperature }} / Max {{ model.maxTokens }}</div>
          </div>
          <div class="rounded-xl border border-border/50 p-4 bg-card/50">
            <n-text depth="3" class="text-xs font-semibold uppercase">Timeout</n-text>
            <div class="mt-2 font-semibold">{{ model.timeoutMs }} ms</div>
          </div>
        </div>

        <div class="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
          <n-text depth="3" class="text-xs font-semibold uppercase">System Prompt</n-text>
          <p class="mt-2 whitespace-pre-wrap break-words text-sm leading-6">
            {{ model.systemPrompt }}
          </p>
        </div>

        <template #footer>
          <div class="flex items-center justify-between">
            <n-text depth="3" class="text-xs">
              更新于 {{ new Date(model.updatedAt).toLocaleString() }}
            </n-text>
            <div class="flex gap-2">
              <n-button
                v-if="model.enabled && !model.isDefault"
                size="small"
                secondary
                @click="handleSetDefault(model.id)"
              >
                设为默认
              </n-button>
              <n-button size="small" secondary @click="openEditModal(model)">编辑</n-button>
              
              <n-popconfirm
                @positive-click="handleDelete(model)"
                positive-text="确认"
                negative-text="取消"
              >
                <template #trigger>
                  <n-button size="small" type="error" secondary>删除</n-button>
                </template>
                确认删除“{{ model.name }}”吗？此操作不可恢复。
              </n-popconfirm>
            </div>
          </div>
        </template>
      </n-card>
    </div>

    <div v-else class="flex flex-col items-center justify-center py-20">
      <n-empty description="暂无模型配置">
        <template #extra>
          <n-button size="small" mt-4 @click="openCreateModal">新增模型</n-button>
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
