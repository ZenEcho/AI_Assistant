export function stringifyHeaders(headers: Record<string, string>): string {
  return Object.entries(headers)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
}

export function parseHeaderText(text: string): Record<string, string> {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((headers, line) => {
      const separatorIndex = line.indexOf(":");

      if (separatorIndex === -1) {
        return headers;
      }

      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim();

      if (key && value) {
        headers[key] = value;
      }

      return headers;
    }, {});
}
