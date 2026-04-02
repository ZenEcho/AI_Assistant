<template>
  <n-button
    :type="primary ? 'primary' : 'default'"
    :secondary="!primary"
    :size="naiveSize"
    :style="buttonStyle"
    strong
    round
    @click="onClick"
  >
    {{ label }}
  </n-button>
</template>

<script lang="ts" setup>
import { computed } from "vue";
import { NButton } from "naive-ui";

const props = withDefaults(
  defineProps<{
    /**
     * The label of the button
     */
    label: string;
    /**
     * primary or secondary button
     */
    primary?: boolean;
    /**
     * size of the button
     */
    size?: "small" | "medium" | "large";
    /**
     * background color of the button
     */
    backgroundColor?: string;
  }>(),
  { primary: false },
);

const emit = defineEmits<{
  (e: "click", id: number): void;
}>();

const naiveSize = computed(() => {
  switch (props.size) {
    case "small":
      return "small";
    case "large":
      return "large";
    default:
      return "medium";
  }
});

const buttonStyle = computed(() => {
  if (!props.backgroundColor) {
    return undefined;
  }

  return {
    "--n-color": props.backgroundColor,
    "--n-color-hover": props.backgroundColor,
    "--n-color-pressed": props.backgroundColor,
    "--n-color-focus": props.backgroundColor,
    "--n-border": `1px solid ${props.backgroundColor}`,
    "--n-border-hover": `1px solid ${props.backgroundColor}`,
    "--n-border-pressed": `1px solid ${props.backgroundColor}`,
    "--n-border-focus": `1px solid ${props.backgroundColor}`,
    "--n-text-color": "#ffffff",
    "--n-text-color-hover": "#ffffff",
    "--n-text-color-pressed": "#ffffff",
    "--n-text-color-focus": "#ffffff",
    "--n-ripple-color": props.backgroundColor,
  };
});

const onClick = () => {
  emit("click", 1);
};
</script>
