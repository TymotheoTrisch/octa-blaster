<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { Check, Ban } from 'lucide-vue-next';
import { normalizeHexColor } from '@/services/storage/settingsSchema';
import { hexToHsv, hsvToHex, type HsvColor } from '@/services/appearance/themeTokens';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    presets: ReadonlyArray<{ name: string; color: string }>;
    allowClear?: boolean;
    clearLabel?: string;
    disabled?: boolean;
    fallbackPickerColor?: string;
    placeholder?: string;
    ariaLabel?: string;
  }>(),
  {
    allowClear: false,
    clearLabel: 'Padrão',
    disabled: false,
    fallbackPickerColor: '#1971c2',
    placeholder: '',
    ariaLabel: 'Selecionar cor',
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
  commit: [value: string];
  invalidHex: [];
}>();

const hexInput = ref(props.modelValue);
const isPickerOpen = ref(false);
const pickerBlockRef = ref<HTMLElement | null>(null);
const spectrumRef = ref<HTMLElement | null>(null);
const hueRef = ref<HTMLElement | null>(null);
const hsv = ref<HsvColor>(hexToHsv(props.modelValue) ?? hexToHsv(props.fallbackPickerColor) ?? { h: 46, s: 100, v: 100 });
let initialBeforeOpen = '';
let activeDragTarget: 'spectrum' | 'hue' | null = null;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function syncHsvFromHex(hex: string) {
  const parsed = hexToHsv(hex);
  if (!parsed) return;
  hsv.value = {
    h: parsed.s > 0 && parsed.v > 0 ? parsed.h : hsv.value.h,
    s: parsed.s,
    v: parsed.v,
  };
}

watch(
  () => props.modelValue,
  (next) => {
    hexInput.value = next;
    if (!activeDragTarget && next) {
      syncHsvFromHex(next);
    }
  },
);

const normalizedCurrent = computed(() => normalizeHexColor(props.modelValue) ?? '');
const pickerValue = computed(() => normalizedCurrent.value || props.fallbackPickerColor);
const normalizedTyped = computed(() => normalizeHexColor(hexInput.value));
const currentPickerHex = computed(() => hsvToHex(hsv.value.h, hsv.value.s, hsv.value.v));
const spectrumHueColor = computed(() => `hsl(${Math.round(hsv.value.h)}, 100%, 50%)`);

function applyHsvSelection() {
  const hex = currentPickerHex.value;
  hexInput.value = hex;
  emit('update:modelValue', hex);
}

function togglePicker() {
  if (props.disabled) return;
  if (isPickerOpen.value) {
    confirmPicker();
    return;
  }
  initialBeforeOpen = normalizedCurrent.value;
  const parsed = hexToHsv(pickerValue.value);
  if (parsed) hsv.value = parsed;
  isPickerOpen.value = true;
}

function confirmPicker() {
  if (!isPickerOpen.value) return;
  const hex = currentPickerHex.value;
  hexInput.value = hex;
  isPickerOpen.value = false;
  activeDragTarget = null;
  emit('update:modelValue', hex);
  emit('commit', hex);
}

function cancelPicker() {
  if (!isPickerOpen.value) return;
  isPickerOpen.value = false;
  activeDragTarget = null;
  hexInput.value = initialBeforeOpen;
  syncHsvFromHex(initialBeforeOpen || props.fallbackPickerColor);
  emit('update:modelValue', initialBeforeOpen);
  emit('commit', initialBeforeOpen);
}

function updateSpectrumFromPointer(clientX: number, clientY: number) {
  const el = spectrumRef.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const s = clamp01((clientX - rect.left) / rect.width) * 100;
  const v = (1 - clamp01((clientY - rect.top) / rect.height)) * 100;
  hsv.value = { h: hsv.value.h, s, v };
  applyHsvSelection();
}

function updateHueFromPointer(clientX: number) {
  const el = hueRef.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  if (!rect.width) return;
  const h = clamp01((clientX - rect.left) / rect.width) * 360;
  hsv.value = { h, s: hsv.value.s, v: hsv.value.v };
  applyHsvSelection();
}

function onSpectrumPointerDown(event: PointerEvent) {
  if (props.disabled) return;
  event.preventDefault();
  activeDragTarget = 'spectrum';
  (event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
  updateSpectrumFromPointer(event.clientX, event.clientY);
}

function onSpectrumPointerMove(event: PointerEvent) {
  if (activeDragTarget !== 'spectrum') return;
  updateSpectrumFromPointer(event.clientX, event.clientY);
}

function onHuePointerDown(event: PointerEvent) {
  if (props.disabled) return;
  event.preventDefault();
  activeDragTarget = 'hue';
  (event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
  updateHueFromPointer(event.clientX);
}

function onHuePointerMove(event: PointerEvent) {
  if (activeDragTarget !== 'hue') return;
  updateHueFromPointer(event.clientX);
}

function onDragPointerEnd(event: PointerEvent) {
  if (!activeDragTarget) return;
  (event.currentTarget as HTMLElement | null)?.releasePointerCapture?.(event.pointerId);
  activeDragTarget = null;
}

function handleDocumentPointerDown(event: PointerEvent) {
  if (!isPickerOpen.value) return;
  const target = event.target as Node | null;
  if (pickerBlockRef.value && target && !pickerBlockRef.value.contains(target)) {
    confirmPicker();
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown);
});

onUnmounted(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown);
});

function selectPreset(color: string) {
  isPickerOpen.value = false;
  const normalized = normalizeHexColor(color) ?? color;
  hexInput.value = normalized;
  syncHsvFromHex(normalized);
  emit('update:modelValue', normalized);
  emit('commit', normalized);
}

function clearColor() {
  isPickerOpen.value = false;
  hexInput.value = '';
  emit('update:modelValue', '');
  emit('commit', '');
}

function handleHexTyping(event: Event) {
  const raw = (event.target as HTMLInputElement).value;
  hexInput.value = raw;
  if (props.allowClear && !raw.trim()) {
    emit('update:modelValue', '');
    return;
  }
  const normalized = normalizeHexColor(raw);
  if (normalized) {
    syncHsvFromHex(normalized);
    emit('update:modelValue', normalized);
  }
}

function commitTypedHex() {
  if (props.allowClear && !hexInput.value.trim()) {
    clearColor();
    return;
  }
  if (!normalizedTyped.value) {
    emit('invalidHex');
    return;
  }
  hexInput.value = normalizedTyped.value;
  syncHsvFromHex(normalizedTyped.value);
  emit('update:modelValue', normalizedTyped.value);
  emit('commit', normalizedTyped.value);
}
</script>

<template>
  <div ref="pickerBlockRef" class="color-picker-block">
    <div class="swatches-grid" role="list" :aria-label="ariaLabel">
      <button
        v-if="allowClear"
        type="button"
        class="swatch-btn swatch-btn-clear"
        :class="{ active: !normalizedCurrent }"
        :title="`${clearLabel} (sem cor personalizada)`"
        :aria-label="clearLabel"
        :aria-pressed="!normalizedCurrent"
        :disabled="disabled"
        @click="clearColor"
      >
        <Ban :size="12" :stroke-width="2.1" />
      </button>

      <button
        v-for="preset in presets"
        :key="preset.color"
        type="button"
        class="swatch-btn"
        :class="{ active: normalizedCurrent === preset.color }"
        :style="{ '--swatch-color': preset.color }"
        :title="`${preset.name} (${preset.color})`"
        :aria-label="`Selecionar cor ${preset.name}`"
        :aria-pressed="normalizedCurrent === preset.color"
        :disabled="disabled"
        @click="selectPreset(preset.color)"
      >
        <Check v-if="normalizedCurrent === preset.color" :size="12" :stroke-width="2.6" />
      </button>
    </div>

    <div class="custom-color-row">
      <button
        type="button"
        class="color-picker-trigger"
        :class="{ active: isPickerOpen }"
        :disabled="disabled"
        :aria-expanded="isPickerOpen"
        aria-label="Seletor visual de cor"
        title="Escolher cor personalizada"
        @click="togglePicker"
      >
        <span
          class="color-picker-swatch"
          :class="{ 'is-empty': !normalizedCurrent && !isPickerOpen }"
          :style="
            isPickerOpen
              ? { backgroundColor: currentPickerHex }
              : normalizedCurrent
                ? { backgroundColor: normalizedCurrent }
                : undefined
          "
        ></span>
      </button>

      <input
        :value="hexInput"
        type="text"
        class="hex-code-input"
        maxlength="7"
        :disabled="disabled"
        :placeholder="placeholder || (allowClear ? 'Padrão (opcional)' : '#ffc600')"
        aria-label="Código hexadecimal da cor"
        @input="handleHexTyping"
        @blur="commitTypedHex"
        @keydown.enter.prevent="commitTypedHex"
      />
    </div>

    <div
      v-if="isPickerOpen"
      class="custom-color-popover"
      role="dialog"
      aria-label="Seletor de cor personalizada"
      @keydown.esc.stop.prevent="cancelPicker"
    >
      <div
        ref="spectrumRef"
        class="hsv-spectrum"
        :style="{ '--hue-color': spectrumHueColor }"
        @pointerdown="onSpectrumPointerDown"
        @pointermove="onSpectrumPointerMove"
        @pointerup="onDragPointerEnd"
        @pointercancel="onDragPointerEnd"
      >
        <span
          class="hsv-spectrum-thumb"
          :style="{
            left: `${hsv.s}%`,
            top: `${100 - hsv.v}%`,
            backgroundColor: currentPickerHex,
          }"
        ></span>
      </div>

      <div
        ref="hueRef"
        class="hsv-hue-track"
        @pointerdown="onHuePointerDown"
        @pointermove="onHuePointerMove"
        @pointerup="onDragPointerEnd"
        @pointercancel="onDragPointerEnd"
      >
        <span
          class="hsv-hue-thumb"
          :style="{
            left: `${(hsv.h / 360) * 100}%`,
            backgroundColor: spectrumHueColor,
          }"
        ></span>
      </div>

      <div class="custom-color-popover-footer">
        <div class="popover-preview">
          <span class="popover-preview-swatch" :style="{ backgroundColor: currentPickerHex }"></span>
          <span class="popover-preview-hex">{{ currentPickerHex }}</span>
        </div>
        <div class="popover-actions">
          <button type="button" class="picker-btn-cancel" @click="cancelPicker">
            Cancelar
          </button>
          <button type="button" class="picker-btn-ok" @click="confirmPicker">
            OK
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.color-picker-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.swatches-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(26px, 1fr));
  gap: 6px;
}

.swatch-btn {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 6px;
  border: 2px solid transparent;
  background: var(--swatch-color);
  color: #ffffff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.14);
  transition: transform 0.12s ease, border-color 0.12s ease;
}

.swatch-btn:hover:not(:disabled) {
  transform: translateY(-1px);
}

.swatch-btn.active {
  border-color: var(--text-primary);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.55);
}

.swatch-btn :deep(svg) {
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.45));
}

.swatch-btn-clear {
  background: var(--bg-tertiary);
  color: var(--text-muted);
  box-shadow: inset 0 0 0 1px var(--border);
}

.swatch-btn-clear :deep(svg) {
  filter: none;
}

.swatch-btn-clear.active {
  box-shadow: none;
  color: var(--text-primary);
}

.custom-color-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.color-picker-trigger {
  position: relative;
  width: 30px;
  height: 30px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  display: inline-flex;
  flex-shrink: 0;
  cursor: pointer;
}

.color-picker-trigger:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.color-picker-trigger.active .color-picker-swatch {
  border-color: var(--text-primary);
  box-shadow: 0 0 0 2px var(--accent-ring);
}

.color-picker-swatch {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 6px;
  border: 1px solid var(--border);
}

.color-picker-swatch.is-empty {
  background: linear-gradient(
    to top right,
    var(--bg-tertiary) calc(50% - 1px),
    var(--border-hover) 50%,
    var(--bg-tertiary) calc(50% + 1px)
  );
}

.hex-code-input {
  flex: 1;
  min-width: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  text-transform: lowercase;
}

.custom-color-popover {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
  border-radius: 8px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-popover);
}

.hsv-spectrum {
  position: relative;
  width: 100%;
  height: 118px;
  border-radius: 6px;
  border: 1px solid rgba(0, 0, 0, 0.14);
  background:
    linear-gradient(to top, #000000, transparent),
    linear-gradient(to right, #ffffff, var(--hue-color));
  touch-action: none;
  user-select: none;
  cursor: crosshair;
  overflow: hidden;
}

.hsv-spectrum-thumb {
  position: absolute;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid #ffffff;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.45), 0 1px 3px rgba(0, 0, 0, 0.35);
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.hsv-hue-track {
  position: relative;
  width: 100%;
  height: 12px;
  border-radius: 999px;
  border: 1px solid rgba(0, 0, 0, 0.14);
  background: linear-gradient(
    to right,
    #ff0000 0%,
    #ffff00 17%,
    #00ff00 33%,
    #00ffff 50%,
    #0000ff 67%,
    #ff00ff 83%,
    #ff0000 100%
  );
  touch-action: none;
  user-select: none;
  cursor: ew-resize;
}

.hsv-hue-thumb {
  position: absolute;
  top: 50%;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid #ffffff;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.45), 0 1px 3px rgba(0, 0, 0, 0.35);
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.custom-color-popover-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.popover-preview {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.popover-preview-swatch {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  border: 1px solid var(--border);
  flex-shrink: 0;
}

.popover-preview-hex {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.popover-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.picker-btn-cancel,
.picker-btn-ok {
  height: 26px;
  padding: 0 10px;
  border-radius: 5px;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.picker-btn-cancel {
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  border: 1px solid var(--border);
}

.picker-btn-cancel:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.picker-btn-ok {
  background: var(--accent);
  color: var(--accent-text);
  border: 1px solid var(--accent-border);
}

.picker-btn-ok:hover {
  background: var(--accent-hover);
}
</style>
