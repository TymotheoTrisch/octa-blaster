import { rawStorageGet } from '@/services/storage/rawStorage';
import {
  APPEARANCE_KEY,
  DEFAULT_BRAND_COLOR,
  normalizeHexColor,
  validateAppearance,
} from '@/services/storage/settingsSchema';
import { OCTABLASTER_ICON_PATH, OCTABLASTER_ICON_VIEWBOX_SIZE } from './iconGeometry';

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

export function renderBrandIconImageData(
  rawColor: string,
  sizes: number[] = [16, 32, 48],
): Record<number, ImageData> | null {
  const color = normalizeHexColor(rawColor) ?? DEFAULT_BRAND_COLOR;
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
    ctx.fillStyle = color;
    ctx.fill(iconPath);
    ctx.restore();

    result[size] = ctx.getImageData(0, 0, size, size);
  }

  return result;
}

export async function applyBrowserBrandIcon(rawColor: string): Promise<boolean> {
  const color = normalizeHexColor(rawColor) ?? DEFAULT_BRAND_COLOR;
  const b = (globalThis as any).browser;
  const c = (globalThis as any).chrome;

  const actionApi = b?.action ?? b?.browserAction ?? c?.action ?? c?.browserAction;
  const sidebarApi = b?.sidebarAction;

  if (!actionApi?.setIcon && !sidebarApi?.setIcon) {
    return false;
  }

  if (color === DEFAULT_BRAND_COLOR) {
    try {
      await actionApi?.setIcon?.({ path: DEFAULT_ICON_PATHS });
    } catch {}
    try {
      await sidebarApi?.setIcon?.({ path: SIDEBAR_DEFAULT_ICON_PATHS });
    } catch {}
    return true;
  }

  const imageData = renderBrandIconImageData(color, [16, 32, 48]);
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
    const color = stored[APPEARANCE_KEY]
      ? validateAppearance(stored[APPEARANCE_KEY]).brandColor
      : DEFAULT_BRAND_COLOR;
    await applyBrowserBrandIcon(color);
  } catch {}
}
