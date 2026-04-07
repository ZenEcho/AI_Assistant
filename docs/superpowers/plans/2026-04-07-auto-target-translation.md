# Auto Target Translation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve `targetLanguage=auto` locally from the current system language and complete translation in a single AI request.

**Architecture:** Keep the existing translation request resolution pipeline, but remove AI-based language detection from the auto-target path. Refresh the cached system locale during app startup, resolve the auto target from that locale, and move the “same as system language -> translate to English” decision into the translation prompt so the model handles it inside one request.

**Tech Stack:** Vue 3, Pinia, TypeScript, Vitest, Tauri

---

### Task 1: Lock In Auto-Target Resolution Behavior

**Files:**
- Modify: `src/test/unit/services/ai/translationRequestResolver.spec.ts`
- Modify: `src/test/unit/services/ai/translationService.spec.ts`

- [ ] **Step 1: Write the failing tests**

Add a resolver test proving `targetLanguage=auto` only reads the system locale and does not call `detectSourceLanguage`, and add a translation-service test proving the prompt includes system-language-aware routing instructions.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:run -- src/test/unit/services/ai/translationRequestResolver.spec.ts src/test/unit/services/ai/translationService.spec.ts`

Expected: FAIL because current code still invokes language detection and does not emit the new single-request prompt.

- [ ] **Step 3: Write the minimal implementation**

Update the resolver and translation service so auto target resolution is local-only and the prompt tells the model to compare the source language to the current system language.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:run -- src/test/unit/services/ai/translationRequestResolver.spec.ts src/test/unit/services/ai/translationService.spec.ts`

Expected: PASS

### Task 2: Refresh System Locale On Startup

**Files:**
- Modify: `src/services/app/systemLanguageService.ts`
- Modify: `src/main.ts`
- Add: `src/test/unit/services/app/systemLanguageService.spec.ts`

- [ ] **Step 1: Write the failing tests**

Add tests for an explicit refresh path that re-reads the locale instead of returning the cached value, and a startup test that exercises the refresh entry point.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:run -- src/test/unit/services/app/systemLanguageService.spec.ts`

Expected: FAIL because no refresh API exists yet.

- [ ] **Step 3: Write the minimal implementation**

Expose a refresh helper in the system-language service and call it during bootstrap before stores initialize.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:run -- src/test/unit/services/app/systemLanguageService.spec.ts`

Expected: PASS

### Task 3: Final Verification

**Files:**
- Modify: `src/services/ai/translationRequestResolver.ts`
- Modify: `src/services/ai/translationService.ts`
- Modify: `src/services/app/systemLanguageService.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Run targeted regression tests**

Run: `pnpm test:run -- src/test/unit/services/ai/translationRequestResolver.spec.ts src/test/unit/services/ai/translationService.spec.ts src/test/unit/services/app/systemLanguageService.spec.ts`

Expected: PASS

- [ ] **Step 2: Run broader translation-related regression tests**

Run: `pnpm test:run -- src/test/unit/services/ai/languageDetectionService.spec.ts src/test/unit/stores/systemInput.spec.ts src/test/unit/pages/TranslatePage.spec.ts`

Expected: PASS, or failures only where assertions encode the old double-request behavior.

- [ ] **Step 3: Summarize any remaining behavioral deltas**

Call out that auto target no longer performs explicit source-language detection and now relies on the model to decide between translating to the system language or to English inside one request.
