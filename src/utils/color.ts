function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function normalizeHex(color: string): string {
  const raw = color.trim().replace("#", "");

  if (/^[\da-f]{3}$/i.test(raw)) {
    return `#${raw
      .split("")
      .map((segment) => `${segment}${segment}`)
      .join("")
      .toLowerCase()}`;
  }

  if (/^[\da-f]{6}$/i.test(raw)) {
    return `#${raw.toLowerCase()}`;
  }

  return "#3b82f6";
}

export function hexToRgb(color: string): { r: number; g: number; b: number } {
  const normalized = normalizeHex(color).slice(1);
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);

  return { r, g, b };
}

export function toRgbCss(color: string): string {
  const { r, g, b } = hexToRgb(color);
  return `${r}, ${g}, ${b}`;
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b]
    .map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

export function mixColors(colorA: string, colorB: string, weight: number): string {
  const first = hexToRgb(colorA);
  const second = hexToRgb(colorB);
  const ratio = clamp(weight, 0, 1);

  return rgbToHex(
    first.r + (second.r - first.r) * ratio,
    first.g + (second.g - first.g) * ratio,
    first.b + (second.b - first.b) * ratio,
  );
}

export function shiftColor(color: string, amount: number): string {
  return amount >= 0
    ? mixColors(color, "#ffffff", amount)
    : mixColors(color, "#000000", Math.abs(amount));
}

export function toHslCss(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;

  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  let h = 0, s = 0, l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rNorm: h = (gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0); break;
      case gNorm: h = (bNorm - rNorm) / d + 2; break;
      case bNorm: h = (rNorm - gNorm) / d + 4; break;
    }
    h /= 6;
  }

  const hDeg = Math.round(h * 360 * 10) / 10;
  const sPct = Math.round(s * 100 * 10) / 10;
  const lPct = Math.round(l * 100 * 10) / 10;

  return `${hDeg} ${sPct}% ${lPct}%`;
}
