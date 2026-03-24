<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  NButton,
  NFormItem,
  NInput,
  NInputNumber,
  NModal,
  NSwitch,
} from "naive-ui";
import type { ModelConfigDraft } from "@/types/app";

const props = defineProps<{
  show: boolean;
  mode: "create" | "edit";
  initialValue: ModelConfigDraft;
}>();

const emit = defineEmits<{
  (event: "update:show", value: boolean): void;
  (event: "submit", value: ModelConfigDraft): void;
}>();

const formValue = ref<ModelConfigDraft>({ ...props.initialValue });
const errors = ref<Record<string, string>>({});

const visible = computed({
  get: () => props.show,
  set: (value: boolean) => emit("update:show", value),
});

const modalTitle = computed(() => (props.mode === "edit" ? "编辑模型配置" : "新增模型配置"));

function cloneDraft(value: ModelConfigDraft): ModelConfigDraft {
  return { ...value };
}

function validateUrl(value: string): true | string {
  if (!value.trim()) return "请输入兼容 OpenAI 的 Base URL";
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return "仅支持 http 或 https 协议";
    return true;
  } catch {
    return "请输入合法的 URL";
  }
}

async function handleSubmit() {
  errors.value = {};
  let isValid = true;

  if (!formValue.value.name.trim()) {
    errors.value.name = "请输入配置名称";
    isValid = false;
  }
  if (!formValue.value.model.trim()) {
    errors.value.model = "请输入模型名称";
    isValid = false;
  }
  const urlValidation = validateUrl(formValue.value.baseUrl);
  if (urlValidation !== true) {
    errors.value.baseUrl = urlValidation;
    isValid = false;
  }
  
  if (formValue.value.temperature === undefined || isNaN(Number(formValue.value.temperature))) {
    errors.value.temperature = "请输入有效的 temperature";
    isValid = false;
  }
  if (formValue.value.maxTokens === undefined || isNaN(Number(formValue.value.maxTokens))) {
    errors.value.maxTokens = "请输入有效的 max tokens";
    isValid = false;
  }
  if (formValue.value.timeoutMs === undefined || isNaN(Number(formValue.value.timeoutMs))) {
    errors.value.timeoutMs = "请输入超时时间";
    isValid = false;
  }

  if (!isValid) return;

  emit("submit", cloneDraft(formValue.value));
}

watch(() => props.initialValue, (value) => { formValue.value = cloneDraft(value); }, { deep: true, immediate: true });
watch(() => props.show, (show) => { if (show) formValue.value = cloneDraft(props.initialValue); });
</script>

<template>
  <n-modal
    v-model:show="visible"
    preset="card"
    :title="modalTitle"
    :style="{ width: 'min(960px, 92vw)' }"
  >
    <div class="max-h-[70vh] overflow-y-auto pr-1">
      <div class="grid gap-6 py-2">
        <div class="grid gap-4 md:grid-cols-2">
          <n-form-item
            label="配置名称"
            :validation-status="errors.name ? 'error' : undefined"
            :feedback="errors.name"
          >
            <n-input v-model:value="formValue.name" placeholder="例如：OpenAI 主账号 / 本地网关" />
          </n-form-item>
          <n-form-item
            label="模型名称"
            :validation-status="errors.model ? 'error' : undefined"
            :feedback="errors.model"
          >
            <n-input v-model:value="formValue.model" placeholder="例如：gpt-4o-mini / qwen-plus" />
          </n-form-item>
        </div>

        <div class="grid gap-4 md:grid-cols-2">
          <n-form-item
            label="Base URL"
            :validation-status="errors.baseUrl ? 'error' : undefined"
            :feedback="errors.baseUrl"
          >
            <n-input v-model:value="formValue.baseUrl" placeholder="https://api.openai.com/v1" />
          </n-form-item>
          <n-form-item label="API Key">
            <n-input
              v-model:value="formValue.apiKey"
              type="password"
              show-password-on="click"
              placeholder="可为空，取决于你的服务端"
            />
          </n-form-item>
        </div>

        <div class="grid gap-4 md:grid-cols-3">
          <n-form-item
            label="Temperature"
            :validation-status="errors.temperature ? 'error' : undefined"
            :feedback="errors.temperature"
          >
            <n-input-number
              v-model:value="formValue.temperature"
              class="w-full"
              :min="0"
              :max="2"
              :step="0.1"
              :precision="1"
            />
          </n-form-item>
          <n-form-item
            label="Max Tokens"
            :validation-status="errors.maxTokens ? 'error' : undefined"
            :feedback="errors.maxTokens"
          >
            <n-input-number
              v-model:value="formValue.maxTokens"
              class="w-full"
              :min="32"
              :max="32000"
              :step="64"
            />
          </n-form-item>
          <n-form-item
            label="超时时间 (ms)"
            :validation-status="errors.timeoutMs ? 'error' : undefined"
            :feedback="errors.timeoutMs"
          >
            <n-input-number
              v-model:value="formValue.timeoutMs"
              class="w-full"
              :min="1000"
              :max="300000"
              :step="1000"
            />
          </n-form-item>
        </div>

        <div class="grid gap-4 md:grid-cols-2">
          <div class="flex items-center justify-between rounded-xl border border-border/50 bg-card/40 p-4">
            <div class="space-y-1">
              <div class="text-base font-medium">启用</div>
              <p class="text-sm text-muted-foreground">启用后会出现在翻译页的模型单选里。</p>
            </div>
            <n-switch v-model:value="formValue.enabled" />
          </div>
          <div class="flex items-center justify-between rounded-xl border border-border/50 bg-card/40 p-4">
            <div class="space-y-1">
              <div class="text-base font-medium">设为默认</div>
              <p class="text-sm text-muted-foreground">默认模型会作为翻译页初始选中的候选项。</p>
            </div>
            <n-switch v-model:value="formValue.isDefault" />
          </div>
        </div>

        <n-form-item label="翻译 System Prompt">
          <n-input
            v-model:value="formValue.systemPrompt"
            type="textarea"
            :autosize="{ minRows: 4, maxRows: 8 }"
            placeholder="为翻译场景自定义系统提示词"
          />
        </n-form-item>

        <n-form-item label="额外请求头">
          <n-input
            v-model:value="formValue.extraHeadersText"
            type="textarea"
            :autosize="{ minRows: 3, maxRows: 6 }"
            placeholder="每行一个，例如：&#10;HTTP-Referer: https://example.com&#10;X-Title: AI Assistant"
          />
        </n-form-item>
      </div>
    </div>

    <template #action>
      <div class="flex justify-end gap-3">
        <n-button secondary @click="visible = false">取消</n-button>
        <n-button type="primary" @click="handleSubmit">保存配置</n-button>
      </div>
    </template>
  </n-modal>
</template>
