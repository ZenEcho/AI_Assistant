/**
 * 生成一个随机唯一 ID。
 * 优先使用 Web Crypto API（`crypto.randomUUID`），在不可用的环境中降级为时间戳 + 随机数。
 */
export function generateId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
