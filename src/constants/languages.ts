import type { SupportedLanguageCode } from "@/types/language";

export interface LanguageOption {
  label: string;
  value: string;
}

interface LanguageDefinition extends LanguageOption {
  code: SupportedLanguageCode;
  aliases: string[];
}

const manualLanguageDefinitions: LanguageDefinition[] = [
  {
    code: "zh",
    label: "简体中文",
    value: "Chinese (Simplified)",
    aliases: [
      "zh",
      "zh-cn",
      "zh-sg",
      "zh_tw",
      "zh-tw",
      "zh-hk",
      "zh-mo",
      "chinese",
      "chinese (simplified)",
      "chinese (traditional)",
      "simplified chinese",
      "traditional chinese",
      "简体中文",
      "中文",
    ],
  },
  {
    code: "zh",
    label: "繁体中文",
    value: "Chinese (Traditional)",
    aliases: [
      "zh-hant",
      "zh-tw",
      "zh-hk",
      "zh-mo",
      "chinese (traditional)",
      "traditional chinese",
      "繁体中文",
    ],
  },
  {
    code: "en",
    label: "English",
    value: "English",
    aliases: ["en", "en-us", "en-gb", "english"],
  },
  {
    code: "ja",
    label: "日本語",
    value: "Japanese",
    aliases: ["ja", "ja-jp", "japanese", "日本語"],
  },
  {
    code: "ko",
    label: "한국어",
    value: "Korean",
    aliases: ["ko", "ko-kr", "korean", "한국어"],
  },
  {
    code: "fr",
    label: "Français",
    value: "French",
    aliases: ["fr", "fr-fr", "french", "français"],
  },
  {
    code: "de",
    label: "Deutsch",
    value: "German",
    aliases: ["de", "de-de", "german", "deutsch"],
  },
  {
    code: "es",
    label: "Español",
    value: "Spanish",
    aliases: ["es", "es-es", "spanish", "español"],
  },
  {
    code: "pt",
    label: "Português",
    value: "Portuguese",
    aliases: ["pt", "pt-pt", "pt-br", "portuguese", "português"],
  },
  {
    code: "ru",
    label: "Русский",
    value: "Russian",
    aliases: ["ru", "ru-ru", "russian", "русский"],
  },
  {
    code: "ar",
    label: "العربية",
    value: "Arabic",
    aliases: ["ar", "ar-sa", "arabic", "العربية"],
  },
];

const definitionByCode = new Map<SupportedLanguageCode, LanguageDefinition>();
const aliasToCode = new Map<string, SupportedLanguageCode>();

for (const definition of manualLanguageDefinitions) {
  if (!definitionByCode.has(definition.code)) {
    definitionByCode.set(definition.code, definition);
  }

  aliasToCode.set(definition.code, definition.code);
  aliasToCode.set(definition.label.trim().toLowerCase(), definition.code);
  aliasToCode.set(definition.value.trim().toLowerCase(), definition.code);

  definition.aliases.forEach((alias) => {
    aliasToCode.set(alias.trim().toLowerCase(), definition.code);
  });
}

export const manualLanguageOptions: LanguageOption[] = manualLanguageDefinitions.map(
  ({ label, value }) => ({
    label,
    value,
  }),
);

export const sourceLanguageOptions: LanguageOption[] = [
  { label: "自动检测", value: "auto" },
  ...manualLanguageOptions,
];

export const targetLanguageOptions: LanguageOption[] = [
  { label: "自动目标", value: "auto" },
  ...manualLanguageOptions,
];

export const languageOptions = sourceLanguageOptions;
export const defaultSourceLanguage = "auto";
export const defaultTargetLanguage = "English";

export function isAutoLanguageValue(value: string | null | undefined) {
  return typeof value === "string" && value.trim().toLowerCase() === "auto";
}

export function normalizeLanguageCode(value: string | null | undefined): SupportedLanguageCode | null {
  const normalized = value?.trim().toLowerCase();

  if (!normalized || normalized === "auto") {
    return null;
  }

  const directMatch = aliasToCode.get(normalized);

  if (directMatch) {
    return directMatch;
  }

  const localeBase = normalized.split(/[-_]/)[0];
  return aliasToCode.get(localeBase) ?? null;
}

export function normalizeLocaleToLanguageCode(locale: string | null | undefined) {
  return normalizeLanguageCode(locale);
}

export function resolveLanguageLabel(value: string | null | undefined) {
  if (isAutoLanguageValue(value)) {
    return "自动";
  }

  const normalizedValue = value?.trim();

  if (normalizedValue) {
    const exactMatch = manualLanguageDefinitions.find(
      (definition) =>
        definition.value.toLowerCase() === normalizedValue.toLowerCase() ||
        definition.label.toLowerCase() === normalizedValue.toLowerCase(),
    );

    if (exactMatch) {
      return exactMatch.label;
    }
  }

  const normalizedCode = normalizeLanguageCode(normalizedValue);

  if (!normalizedCode) {
    return normalizedValue || "未知";
  }

  return definitionByCode.get(normalizedCode)?.label ?? normalizedValue ?? "未知";
}

export function resolveProviderLanguageValue(
  code: SupportedLanguageCode,
  options?: {
    localeTag?: string | null;
  },
) {
  if (code === "zh" && /^zh[-_](tw|hk|mo)/i.test(options?.localeTag ?? "")) {
    return "Chinese (Traditional)";
  }

  return definitionByCode.get(code)?.value ?? defaultTargetLanguage;
}

export function resolveSystemLanguageTargetValue(locale: string | null | undefined) {
  const code = normalizeLocaleToLanguageCode(locale) ?? "en";
  return resolveProviderLanguageValue(code, {
    localeTag: locale,
  });
}

export function isSupportedManualLanguageValue(value: string | null | undefined) {
  return Boolean(normalizeLanguageCode(value));
}
