import { ref, nextTick, onUnmounted, type Ref } from 'vue';

interface UseListReorderOptions<T> {
  items: Ref<T[]>;
  getId: (item: T) => string;
  getLabel: (item: T) => string;
  canReorder: Ref<boolean>;
  listRef: Ref<HTMLElement | null>;
  onPersist: () => Promise<void>;
  cardSelector?: string;
  idAttribute?: string;
}

const FLIP_DURATION_MS = 180;
const FLIP_EASING = 'cubic-bezier(0.2, 0, 0, 1)';
const MAX_AUTOSCROLL_PX_PER_SEC = 520;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Reordenação genérica por ponteiro (drag-and-drop com autoscroll e animação FLIP)
 * e por teclado (Espaço/Enter + setas) para listas de cards da extensão.
 */
export function useListReorder<T>({
  items,
  getId,
  getLabel,
  canReorder,
  listRef,
  onPersist,
  cardSelector = '.template-card',
  idAttribute = 'data-reorder-id',
}: UseListReorderOptions<T>) {
  const draggingId = ref<string | null>(null);
  const keyboardGrabbedId = ref<string | null>(null);
  const liveAnnouncement = ref('');

  let announcementTimer: number | undefined;
  let keyboardOriginalIndex = -1;
  let isMovingFocus = false;

  let activePointerId: number | null = null;
  let activeHandleEl: HTMLElement | null = null;
  let activeCardEl: HTMLElement | null = null;
  let sourceIndex = -1;
  let targetSlotIndex: number | null = null;
  let startClientY = 0;
  let startScrollTop = 0;
  let lastClientY = 0;
  let autoscrollRaf: number | null = null;
  let lastFrameTime = 0;

  function announce(message: string) {
    liveAnnouncement.value = '';
    if (announcementTimer) clearTimeout(announcementTimer);
    announcementTimer = window.setTimeout(() => {
      liveAnnouncement.value = message;
    }, 40);
  }

  function getCardElements(): HTMLElement[] {
    const container = listRef.value;
    if (!container) return [];
    return Array.from(container.querySelectorAll<HTMLElement>(`${cardSelector}[${idAttribute}]`));
  }

  function findCardById(id: string): HTMLElement | null {
    return (
      listRef.value?.querySelector<HTMLElement>(
        `${cardSelector}[${idAttribute}="${CSS.escape(id)}"]`,
      ) || null
    );
  }

  function captureRects(): Map<string, DOMRect> {
    const map = new Map<string, DOMRect>();
    for (const el of getCardElements()) {
      const id = el.getAttribute(idAttribute);
      if (id) map.set(id, el.getBoundingClientRect());
    }
    return map;
  }

  function runFlipAnimation(
    beforeRects: Map<string, DOMRect>,
    overrideFirstRect?: { id: string; rect: DOMRect },
  ) {
    if (prefersReducedMotion()) return;
    for (const el of getCardElements()) {
      const id = el.getAttribute(idAttribute);
      if (!id) continue;
      const first =
        overrideFirstRect && overrideFirstRect.id === id
          ? overrideFirstRect.rect
          : beforeRects.get(id);
      if (!first) continue;

      el.getAnimations().forEach((anim) => anim.finish());
      const last = el.getBoundingClientRect();
      const dx = first.left - last.left;
      const dy = first.top - last.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;

      el.animate(
        [{ translate: `${dx}px ${dy}px` }, { translate: '0px 0px' }],
        { duration: FLIP_DURATION_MS, easing: FLIP_EASING },
      );
    }
  }

  function clearDropMarker() {
    const container = listRef.value;
    if (!container) return;
    container.removeAttribute('data-drop');
    container.style.removeProperty('--drop-x');
    container.style.removeProperty('--drop-y');
    container.style.removeProperty('--drop-w');
    container.style.removeProperty('--drop-h');
  }

  function updateDropMarker(slotIndex: number | null) {
    const container = listRef.value;
    if (!container) return;

    if (slotIndex === null || slotIndex === sourceIndex || slotIndex === sourceIndex + 1) {
      clearDropMarker();
      return;
    }

    const cards = getCardElements();
    if (cards.length === 0) {
      clearDropMarker();
      return;
    }

    const containerRect = container.getBoundingClientRect();
    let markerY = containerRect.top;
    let markerX = containerRect.left + 14;
    let markerW = Math.max(40, containerRect.width - 28);

    if (slotIndex === 0) {
      const firstCard = cards[0];
      if (!firstCard) return;
      const firstRect = firstCard.getBoundingClientRect();
      markerY = firstRect.top - 5;
      markerX = firstRect.left;
      markerW = firstRect.width;
    } else if (slotIndex >= cards.length) {
      const lastCard = cards[cards.length - 1];
      if (!lastCard) return;
      const lastRect = lastCard.getBoundingClientRect();
      markerY = lastRect.bottom + 5;
      markerX = lastRect.left;
      markerW = lastRect.width;
    } else {
      const prevCard = cards[slotIndex - 1];
      const nextCard = cards[slotIndex];
      if (!prevCard || !nextCard) return;
      const prevRect = prevCard.getBoundingClientRect();
      const nextRect = nextCard.getBoundingClientRect();
      markerY = (prevRect.bottom + nextRect.top) / 2;
      markerX = nextRect.left;
      markerW = nextRect.width;
    }

    const clampedMarkerY = Math.max(containerRect.top + 2, Math.min(containerRect.bottom - 2, markerY));
    container.setAttribute('data-drop', 'true');
    container.style.setProperty('--drop-x', `${markerX}px`);
    container.style.setProperty('--drop-y', `${clampedMarkerY}px`);
    container.style.setProperty('--drop-w', `${markerW}px`);
    container.style.setProperty('--drop-h', '2px');
  }

  function updateDropTarget(clientY: number) {
    const container = listRef.value;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const clampedY = Math.max(containerRect.top, Math.min(containerRect.bottom, clientY));
    const pointerContentY =
      clampedY - containerRect.top - container.clientTop + container.scrollTop;

    const cards = getCardElements();
    let slot = cards.length;
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      if (!card) continue;
      const midpoint = card.offsetTop + card.offsetHeight / 2;
      if (pointerContentY < midpoint) {
        slot = i;
        break;
      }
    }

    targetSlotIndex = slot;
    updateDropMarker(slot);
  }

  function updateDraggedTranslate() {
    const container = listRef.value;
    if (!container || !activeCardEl) return;
    const dy = lastClientY - startClientY + (container.scrollTop - startScrollTop);
    activeCardEl.style.translate = `0px ${dy}px`;
  }

  function stopAutoscroll() {
    if (autoscrollRaf !== null) {
      cancelAnimationFrame(autoscrollRaf);
      autoscrollRaf = null;
    }
    lastFrameTime = 0;
  }

  function autoscrollStep(now: number) {
    if (activePointerId === null || !listRef.value || !activeCardEl) {
      stopAutoscroll();
      return;
    }

    const container = listRef.value;
    if (!lastFrameTime) lastFrameTime = now;
    const dt = Math.min(0.05, (now - lastFrameTime) / 1000);
    lastFrameTime = now;

    const rect = container.getBoundingClientRect();
    const cardHeight = activeCardEl.offsetHeight || 64;
    const edgeZone = Math.min(cardHeight, rect.height / 3);
    let velocity = 0;

    if (lastClientY < rect.top + edgeZone) {
      const dist = Math.min(edgeZone * 1.5, rect.top + edgeZone - lastClientY);
      velocity = -(dist / edgeZone) * MAX_AUTOSCROLL_PX_PER_SEC;
    } else if (lastClientY > rect.bottom - edgeZone) {
      const dist = Math.min(edgeZone * 1.5, lastClientY - (rect.bottom - edgeZone));
      velocity = (dist / edgeZone) * MAX_AUTOSCROLL_PX_PER_SEC;
    }

    if (velocity !== 0) {
      const prevScroll = container.scrollTop;
      container.scrollTop += velocity * dt;
      if (container.scrollTop !== prevScroll) {
        updateDraggedTranslate();
        updateDropTarget(lastClientY);
      }
    }

    autoscrollRaf = requestAnimationFrame(autoscrollStep);
  }

  function detachPointerListeners() {
    document.removeEventListener('pointermove', onDocumentPointerMove);
    document.removeEventListener('pointerup', onDocumentPointerUp);
    document.removeEventListener('pointercancel', onDocumentPointerCancel);
    document.removeEventListener('keydown', onDocumentDragKeydown, true);
    if (activeHandleEl) {
      activeHandleEl.removeEventListener('lostpointercapture', onLostPointerCapture);
    }
  }

  function cleanupPointerDrag() {
    stopAutoscroll();
    detachPointerListeners();
    clearDropMarker();

    if (activeCardEl) {
      activeCardEl.style.removeProperty('translate');
    }

    document.documentElement.classList.remove('is-reordering');

    if (activeHandleEl && activePointerId !== null) {
      try {
        if (activeHandleEl.hasPointerCapture(activePointerId)) {
          activeHandleEl.releasePointerCapture(activePointerId);
        }
      } catch {}
    }

    activePointerId = null;
    activeHandleEl = null;
    activeCardEl = null;
    draggingId.value = null;
    sourceIndex = -1;
    targetSlotIndex = null;
  }

  function cancelPointerDrag() {
    const cardEl = activeCardEl;
    const id = draggingId.value;
    const currentRect = cardEl?.getBoundingClientRect();

    cleanupPointerDrag();

    if (cardEl && id && currentRect && !prefersReducedMotion()) {
      const before = new Map<string, DOMRect>([[id, currentRect]]);
      runFlipAnimation(before, { id, rect: currentRect });
    }
    if (id) {
      const item = items.value.find((entry) => getId(entry) === id);
      if (item) announce(`Reordenação de ${getLabel(item)} cancelada.`);
    }
  }

  function onDocumentPointerMove(event: PointerEvent) {
    if (event.pointerId !== activePointerId) return;
    lastClientY = event.clientY;
    updateDraggedTranslate();
    updateDropTarget(event.clientY);
  }

  async function onDocumentPointerUp(event: PointerEvent) {
    if (event.pointerId !== activePointerId) return;

    const id = draggingId.value;
    const fromIdx = sourceIndex;
    const slot = targetSlotIndex;
    const draggedRect = activeCardEl?.getBoundingClientRect();
    const beforeRects = captureRects();

    cleanupPointerDrag();

    if (!id || fromIdx < 0 || slot === null || slot === fromIdx || slot === fromIdx + 1) {
      if (id && draggedRect && !prefersReducedMotion()) {
        runFlipAnimation(beforeRects, { id, rect: draggedRect });
      }
      return;
    }

    const toIdx = slot > fromIdx ? slot - 1 : slot;
    const nextList = [...items.value];
    const [moved] = nextList.splice(fromIdx, 1);
    if (!moved) return;
    nextList.splice(toIdx, 0, moved);
    items.value = nextList;

    await nextTick();

    findCardById(id)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });

    runFlipAnimation(
      beforeRects,
      draggedRect ? { id, rect: draggedRect } : undefined,
    );

    announce(`${getLabel(moved)} movido para a posição ${toIdx + 1} de ${nextList.length}.`);
    await onPersist();
  }

  function onDocumentPointerCancel(event: PointerEvent) {
    if (event.pointerId !== activePointerId) return;
    cancelPointerDrag();
  }

  function onLostPointerCapture(event: PointerEvent) {
    if (event.pointerId !== activePointerId) return;
    cancelPointerDrag();
  }

  function onDocumentDragKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && activePointerId !== null) {
      event.preventDefault();
      event.stopPropagation();
      cancelPointerDrag();
    }
  }

  function onHandlePointerDown(event: PointerEvent, id: string) {
    if (!canReorder.value) return;
    if (event.button !== 0 || activePointerId !== null) return;

    if (keyboardGrabbedId.value) {
      keyboardGrabbedId.value = null;
    }

    const handle = event.currentTarget as HTMLElement | null;
    const card = handle?.closest(cardSelector) as HTMLElement | null;
    const container = listRef.value;
    if (!handle || !card || !container) return;

    const idx = items.value.findIndex((entry) => getId(entry) === id);
    if (idx === -1) return;

    event.preventDefault();

    activePointerId = event.pointerId;
    activeHandleEl = handle;
    activeCardEl = card;
    draggingId.value = id;
    sourceIndex = idx;
    targetSlotIndex = idx;
    startClientY = event.clientY;
    lastClientY = event.clientY;
    startScrollTop = container.scrollTop;

    document.documentElement.classList.add('is-reordering');

    try {
      handle.setPointerCapture(event.pointerId);
    } catch {}

    handle.addEventListener('lostpointercapture', onLostPointerCapture);
    document.addEventListener('pointermove', onDocumentPointerMove);
    document.addEventListener('pointerup', onDocumentPointerUp);
    document.addEventListener('pointercancel', onDocumentPointerCancel);
    document.addEventListener('keydown', onDocumentDragKeydown, true);

    autoscrollRaf = requestAnimationFrame(autoscrollStep);
  }

  async function moveStep(id: string, delta: -1 | 1) {
    const fromIdx = items.value.findIndex((entry) => getId(entry) === id);
    if (fromIdx === -1) return;
    const toIdx = fromIdx + delta;
    if (toIdx < 0 || toIdx >= items.value.length) return;

    const beforeRects = captureRects();
    const nextList = [...items.value];
    const [moved] = nextList.splice(fromIdx, 1);
    if (!moved) return;
    nextList.splice(toIdx, 0, moved);
    items.value = nextList;

    isMovingFocus = true;
    await nextTick();

    const movedCard = findCardById(id);
    const movedHandle = movedCard?.querySelector<HTMLElement>('.drag-handle');
    movedCard?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    movedHandle?.focus({ preventScroll: true });

    requestAnimationFrame(() => {
      isMovingFocus = false;
    });

    runFlipAnimation(beforeRects);
    announce(`${getLabel(moved)} movido para a posição ${toIdx + 1} de ${nextList.length}.`);
    await onPersist();
  }

  async function onHandleKeydown(event: KeyboardEvent, id: string) {
    if (!canReorder.value) return;
    const idx = items.value.findIndex((entry) => getId(entry) === id);
    if (idx === -1) return;
    const item = items.value[idx];
    if (!item) return;

    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      if (keyboardGrabbedId.value === id) {
        keyboardGrabbedId.value = null;
        announce(`${getLabel(item)} solto na posição ${idx + 1} de ${items.value.length}.`);
      } else {
        keyboardGrabbedId.value = id;
        keyboardOriginalIndex = idx;
        announce(
          `${getLabel(item)} selecionado na posição ${idx + 1} de ${items.value.length}. Use as setas para cima ou para baixo para mover, Espaço para soltar ou Esc para cancelar.`,
        );
      }
      return;
    }

    if (event.key === 'ArrowUp' && (keyboardGrabbedId.value === id || event.altKey)) {
      event.preventDefault();
      await moveStep(id, -1);
      return;
    }

    if (event.key === 'ArrowDown' && (keyboardGrabbedId.value === id || event.altKey)) {
      event.preventDefault();
      await moveStep(id, 1);
      return;
    }

    if (event.key === 'Escape' && keyboardGrabbedId.value === id) {
      event.preventDefault();
      event.stopPropagation();
      const origIdx = keyboardOriginalIndex;
      keyboardGrabbedId.value = null;

      if (origIdx >= 0 && origIdx !== idx && origIdx < items.value.length) {
        const beforeRects = captureRects();
        const nextList = [...items.value];
        const [moved] = nextList.splice(idx, 1);
        if (moved) {
          nextList.splice(origIdx, 0, moved);
          items.value = nextList;

          isMovingFocus = true;
          await nextTick();
          const card = findCardById(id);
          card?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          card?.querySelector<HTMLElement>('.drag-handle')?.focus({ preventScroll: true });
          requestAnimationFrame(() => {
            isMovingFocus = false;
          });
          runFlipAnimation(beforeRects);
          await onPersist();
        }
      }

      announce(`Reordenação cancelada. ${getLabel(item)} voltou para a posição ${origIdx + 1}.`);
    }
  }

  function onHandleBlur(id: string) {
    if (isMovingFocus) return;
    if (keyboardGrabbedId.value === id) {
      keyboardGrabbedId.value = null;
    }
  }

  onUnmounted(() => {
    cleanupPointerDrag();
    if (announcementTimer) clearTimeout(announcementTimer);
  });

  return {
    draggingId,
    keyboardGrabbedId,
    liveAnnouncement,
    onHandlePointerDown,
    onHandleKeydown,
    onHandleBlur,
  };
}
