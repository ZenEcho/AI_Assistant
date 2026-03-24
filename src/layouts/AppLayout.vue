<script setup lang="ts">
import AppTopbar from "@/components/layout/AppTopbar.vue";
</script>

<template>
  <div class="app-shell bg-background text-foreground relative h-screen w-screen overflow-hidden ">
    <div class="pointer-events-none absolute inset-0 z-0">
      <div class="absolute inset-x-0 top-0 h-[280px] bg-gradient-to-b from-primary/10 to-transparent" />
      <div class="absolute left-[-7rem] top-24 h-56 w-56 rounded-full bg-primary/10 blur-[96px]" />
    </div>

    <div class="relative z-10 flex h-full flex-col  rounded-x">
      <div class="w-full shrink-0">
        <app-topbar />
      </div>

      <div class="relative isolate flex-1 overflow-y-auto overflow-x-hidden">
        <div class="mx-auto flex min-h-full w-full max-w-[1120px] flex-col px-3 py-3 sm:px-5 sm:py-5">
          <main class="min-w-0 flex-1 flex flex-col">
            <router-view v-slot="{ Component }">
              <transition name="page-fade" mode="out-in">
                <component :is="Component" />
              </transition>
            </router-view>
          </main>
        </div>
      </div>
    </div>
  </div>
</template>
