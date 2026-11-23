export interface FloatingSummaryRect { top: number; bottom: number; left: number; right: number; width: number; height: number }

export function summaryPanelBounds(anchor: FloatingSummaryRect, body: FloatingSummaryRect, viewport: { width: number; height: number }) {
  const gutter = 16;
  const width = Math.max(0, Math.min(520, body.width - gutter * 2, viewport.width - gutter * 2));
  const height = Math.max(0, Math.min(Math.max(180, body.height), 440, viewport.height - gutter * 2));
  const maxLeft = viewport.width - gutter - width;
  const minLeft = Math.min(maxLeft, Math.max(gutter, body.left + gutter));
  const left = Math.max(minLeft, Math.min(anchor.right - width, body.right - gutter - width, maxLeft));
  const above = anchor.top - height - 12;
  const top = above >= gutter ? above : Math.max(gutter, Math.min(anchor.bottom + 12, viewport.height - gutter - height));
  return { left, top, width, height };
}

/** Camada independente: não move, envolve, estreita nem define dimensões do e-mail. */
export function anchorSummaryPanel(panel: HTMLElement, anchor: HTMLElement, body: HTMLElement) {
  const doc = anchor.ownerDocument, win = doc.defaultView!;
  let frame: number | null = null, disposed = false;
  const position = () => {
    if (disposed || !anchor.isConnected || !body.isConnected) return;
    const bounds = summaryPanelBounds(anchor.getBoundingClientRect(), body.getBoundingClientRect(), { width: win.innerWidth, height: win.innerHeight });
    Object.assign(panel.style, { left: `${bounds.left}px`, top: `${bounds.top}px`, width: `${bounds.width}px`, height: `${bounds.height}px` });
  };
  const schedule = () => { if (frame === null) frame = win.requestAnimationFrame(() => { frame = null; position(); }); };
  panel.setAttribute('popover', 'manual');
  doc.body.append(panel);
  try { panel.showPopover?.(); } catch { panel.removeAttribute('popover'); }
  position();
  const observer = win.ResizeObserver ? new win.ResizeObserver(schedule) : null;
  observer?.observe(body); observer?.observe(anchor);
  doc.addEventListener('scroll', schedule, true); win.addEventListener('resize', schedule);
  return () => {
    disposed = true; if (frame !== null) win.cancelAnimationFrame(frame);
    observer?.disconnect(); doc.removeEventListener('scroll', schedule, true); win.removeEventListener('resize', schedule);
    try { panel.hidePopover?.(); } catch {}
    panel.remove();
  };
}
