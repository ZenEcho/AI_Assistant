import { invoke } from "@tauri-apps/api/core";

interface ReadJsonStorageOptions<T> {
  relativePath: string;
  fallbackValue: T;
  legacyRelativePaths?: string[];
}

function cloneFallbackValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export async function readJsonFromAppStorage<T>({
  relativePath,
  fallbackValue,
  legacyRelativePaths,
}: ReadJsonStorageOptions<T>): Promise<T> {
  const value = await invoke<T | null>("app_storage_read_json", {
    relativePath,
    legacyRelativePaths: legacyRelativePaths ?? null,
  });

  return value ?? cloneFallbackValue(fallbackValue);
}

export async function writeJsonToAppStorage(
  relativePath: string,
  value: unknown,
): Promise<void> {
  await invoke("app_storage_write_json", {
    relativePath,
    value,
  });
}
