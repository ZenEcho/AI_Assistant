export interface LanguageOption {
  label: string;
  value: string;
}

export const languageOptions: LanguageOption[] = [
  { label: "自动检测", value: "auto" },
  { label: "简体中文", value: "Chinese (Simplified)" },
  { label: "繁体中文", value: "Chinese (Traditional)" },
  { label: "English", value: "English" },
  { label: "日本語", value: "Japanese" },
  { label: "한국어", value: "Korean" },
  { label: "Français", value: "French" },
  { label: "Deutsch", value: "German" },
  { label: "Español", value: "Spanish" },
  { label: "Português", value: "Portuguese" },
  { label: "Русский", value: "Russian" },
  { label: "العربية", value: "Arabic" },
];

export const defaultSourceLanguage = "auto";
export const defaultTargetLanguage = "English";
