# Image OCR Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace multimodal image translation with a local OCR-first pipeline that supports downloadable RapidOCR and PaddleOCR engines, renders translated overlay images, and keeps translation extensible for future machine-translation providers.

**Architecture:** Add a structured image-translation result model, introduce an OCR engine manager boundary with runtime install state, run OCR locally in Tauri through downloadable Windows executables, then translate OCR text blocks and render a translated overlay image in the frontend. Keep OCR, translation, rendering, and UI state decoupled so future engines and translators slot in without changing the full pipeline.

**Tech Stack:** Vue 3, Pinia, Vitest, Tauri 2, Rust, reqwest, 7z extraction, OpenAI-compatible translation provider

---

### Task 1: Add structured OCR and image-translation types

**Files:**
- Modify: `src/types/ai.ts`
- Modify: `src/types/language.ts`
- Modify: `src/constants/app.ts`
- Test: `src/test/unit/services/ai/translationService.spec.ts`

- [ ] Add OCR engine, OCR block, image render, and structured image translation result types.
- [ ] Extend translation preferences with OCR engine selection.
- [ ] Keep `TranslateResult.text` for compatibility while adding structured image translation payload.
- [ ] Update translation service tests to expect OCR-text translation rather than multimodal image payloads.

### Task 2: Add OCR runtime store and Tauri command bridge

**Files:**
- Create: `src/types/ocr.ts`
- Create: `src/services/ocr/nativeBridge.ts`
- Create: `src/stores/ocr.ts`
- Test: `src/test/unit/services/ocr/nativeBridge.spec.ts`
- Test: `src/test/unit/stores/ocr.spec.ts`

- [ ] Define runtime install/download state separate from persisted preferences.
- [ ] Add frontend bridge wrappers for listing engines, downloading engines, and running OCR.
- [ ] Add Pinia store actions for refresh/download/select/recognize.

### Task 3: Add backend OCR engine management and recognition commands

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`
- Create: `src-tauri/src/commands/ocr.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Test: `src-tauri/src/commands/ocr.rs`

- [ ] Add Rust command types for engine metadata, status, progress, and OCR result payloads.
- [ ] Implement GitHub-release download, 7z extraction, local engine install directories, and installed-version checks.
- [ ] Implement OCR execution by spawning RapidOCR-json / PaddleOCR-json executables and parsing returned JSON lines.

### Task 4: Add OCR pipeline, translation block handling, and overlay rendering

**Files:**
- Create: `src/services/ocr/ocrResultNormalizer.ts`
- Create: `src/services/ocr/imageOverlayRenderer.ts`
- Create: `src/services/ocr/imageTranslationService.ts`
- Modify: `src/services/ai/translationService.ts`
- Test: `src/test/unit/services/ocr/ocrResultNormalizer.spec.ts`
- Test: `src/test/unit/services/ocr/imageOverlayRenderer.spec.ts`
- Test: `src/test/unit/services/ocr/imageTranslationService.spec.ts`

- [ ] Normalize OCR engine output into a shared block format.
- [ ] Translate OCR blocks as text-only requests.
- [ ] Render overlay image from OCR boxes and translated blocks.
- [ ] Return structured image translation result while preserving plain text compatibility.

### Task 5: Update persistence and translation history/cache for image results

**Files:**
- Modify: `src/services/storage/appConfigStorage.ts`
- Modify: `src/services/storage/translationHistoryStorage.ts`
- Modify: `src/services/storage/translationCacheStorage.ts`
- Modify: `src/stores/appConfig.ts`
- Modify: `src/stores/translation.ts`
- Test: `src/test/unit/services/storage/appConfigStorage.spec.ts`
- Test: `src/test/unit/services/storage/translationHistoryStorage.spec.ts`
- Test: `src/test/unit/services/storage/translationCacheStorage.spec.ts`

- [ ] Persist OCR engine preference in app config.
- [ ] Persist structured image translation results safely in history and cache.
- [ ] Keep dedupe keys stable for image translation requests.

### Task 6: Update settings page and translation flow UI

**Files:**
- Modify: `src/pages/AppSettingsPage.vue`
- Modify: `src/pages/TranslatePage.vue`
- Modify: `src/pages/TranslateResultPage.vue`
- Test: `src/test/unit/pages/AppSettingsPage.ocr.spec.ts`
- Test: `src/test/unit/pages/TranslatePage.spec.ts`
- Test: `src/test/unit/pages/TranslateResultPage.spec.ts`

- [ ] Add OCR engine selection, install status, download progress, retry, and install actions to settings.
- [ ] Gate image translation on installed engine readiness.
- [ ] Show translated overlay image above pure translated text in result page.

### Task 7: Verify and document

**Files:**
- Modify: `README.md`

- [ ] Update README to describe OCR engine download/install behavior and the image OCR pipeline.
- [ ] Run focused Vitest suites and the project build.
