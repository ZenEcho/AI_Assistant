<script setup lang="ts">
defineProps<{
  title: string;
  description: string;
}>();
</script>

<template>
  <header class="mb-6 flex flex-col gap-5 md:mb-8 xl:flex-row xl:items-end xl:justify-between rounded-xl">
    <div class="max-w-3xl min-w-0">
      <p class="text-sm font-semibold tracking-wide text-primary uppercase">AI Assistant</p>
      <h1 class="mt-3 text-3xl font-bold tracking-tight text-foreground md:text-4xl">
        {{ title }}
      </h1>
      <p class="mt-3 max-w-2xl text-base text-muted-foreground leading-relaxed">
        {{ description }}
      </p>
    </div>

    <div v-if="$slots.extra" class="w-full xl:w-auto xl:max-w-sm xl:shrink-0">
      <slot name="extra" />
    </div>
  </header>
</template>
