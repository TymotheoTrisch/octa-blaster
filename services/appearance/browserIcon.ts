import { rawStorageGet } from '@/services/storage/rawStorage';
import {
  APPEARANCE_KEY,
  DEFAULT_BRAND_COLOR,
  normalizeHexColor,
  validateAppearance,
} from '@/services/storage/settingsSchema';
import {
  OCTABLASTER_ICON_PATH,
  OCTABLASTER_ICON_VIEWBOX_SIZE,
  OCTABLASTER_INNER_RECT,
} from './iconGeometry';

const DEFAULT_ICON_PATHS = {
  16: 'icon/16.png',
  32: 'icon/32.png',
  48: 'icon/48.png',
};

const SIDEBAR_DEFAULT_ICON_PATHS = {
  16: 'icon/16.png',
  32: 'icon/32.png',
};

function createCanvasForSize(size: number): OffscreenCanvas | HTMLCanvasElement | null {
  if (typeof OffscreenCanvas === 'function') {
    return new OffscreenCanvas(size, size);
  }
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    return canvas;
  }
  return null;
}

function drawRoundedRect(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.closePath();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

export function renderBrandIconImageData(
  rawColor: string,
  sizes: number[] = [16, 32, 48],
  rawInnerColor?: string,
): Record<number, ImageData> | null {
  const color = normalizeHexColor(rawColor) ?? DEFAULT_BRAND_COLOR;
  const innerColor = normalizeHexColor(rawInnerColor);
  if (typeof Path2D !== 'function') return null;

  const result: Record<number, ImageData> = {};
  const iconPath = new Path2D(OCTABLASTER_ICON_PATH);

  for (const size of sizes) {
    const canvas = createCanvasForSize(size);
    const ctx = canvas?.getContext('2d') as
      | OffscreenCanvasRenderingContext2D
      | CanvasRenderingContext2D
      | null;
    if (!ctx) return null;

    ctx.clearRect(0, 0, size, size);
    const scale = size / OCTABLASTER_ICON_VIEWBOX_SIZE;
    ctx.save();
    ctx.scale(scale, scale);
    if (innerColor) {
      drawRoundedRect(
        ctx,
        OCTABLASTER_INNER_RECT.x,
        OCTABLASTER_INNER_RECT.y,
        OCTABLASTER_INNER_RECT.width,
        OCTABLASTER_INNER_RECT.height,
        OCTABLASTER_INNER_RECT.rx,
      );
      ctx.fillStyle = innerColor;
      ctx.fill();
    }
    ctx.fillStyle = color;
    ctx.fill(iconPath);
    ctx.restore();

    result[size] = ctx.getImageData(0, 0, size, size);
  }

  return result;
}

export async function applyBrowserBrandIcon(
  rawColor: string,
  rawInnerColor?: string,
): Promise<boolean> {
  const color = normalizeHexColor(rawColor) ?? DEFAULT_BRAND_COLOR;
  const innerColor = normalizeHexColor(rawInnerColor);
  const b = (globalThis as any).browser;
  const c = (globalThis as any).chrome;

  const actionApi = b?.action ?? b?.browserAction ?? c?.action ?? c?.browserAction;
  const sidebarApi = b?.sidebarAction;

  if (!actionApi?.setIcon && !sidebarApi?.setIcon) {
    return false;
  }

  if (color === DEFAULT_BRAND_COLOR && !innerColor) {
    try {
      await actionApi?.setIcon?.({ path: DEFAULT_ICON_PATHS });
    } catch {}
    try {
      await sidebarApi?.setIcon?.({ path: SIDEBAR_DEFAULT_ICON_PATHS });
    } catch {}
    return true;
  }

  const imageData = renderBrandIconImageData(color, [16, 32, 48], innerColor ?? undefined);
  if (!imageData) return false;

  let applied = false;
  if (actionApi?.setIcon) {
    try {
      await actionApi.setIcon({ imageData });
      applied = true;
    } catch {}
  }

  if (sidebarApi?.setIcon) {
    try {
      await sidebarApi.setIcon({
        imageData: {
          16: imageData[16],
          32: imageData[32],
        },
      });
      applied = true;
    } catch {}
  }

  return applied;
}

export async function syncBrowserBrandIconFromStorage(): Promise<void> {
  try {
    const stored = await rawStorageGet([APPEARANCE_KEY]);
    const appearance = stored[APPEARANCE_KEY]
      ? validateAppearance(stored[APPEARANCE_KEY])
      : null;
    await applyBrowserBrandIcon(
      appearance?.brandColor ?? DEFAULT_BRAND_COLOR,
      appearance?.logoInnerColor,
    );
  } catch {}
}
