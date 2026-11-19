<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Check, Ban } from 'lucide-vue-next';
import { normalizeHexColor } from '@/services/storage/settingsSchema';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    presets: ReadonlyArray<{ name: string; color: string }>;
    allowClear?: boolean;
    clearLabel?: string;
    disabled?: boolean;
    showApplyButton?: boolean;
    fallbackPickerColor?: string;
    placeholder?: string;
    ariaLabel?: string;
  }>(),
  {
    allowClear: false,
    clearLabel: 'Padrão',
    disabled: false,
    showApplyButton: false,
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

watch(
  () => props.modelValue,
  (next) => {
    hexInput.value = next;
  },
);

const normalizedCurrent = computed(() => normalizeHexColor(props.modelValue) ?? '');
const pickerValue = computed(() => normalizedCurrent.value || props.fallbackPickerColor);
const normalizedTyped = computed(() => normalizeHexColor(hexInput.value));
const canApplyTyped = computed(
  () => Boolean(normalizedTyped.value) && normalizedTyped.value !== normalizedCurrent.value,
);

function selectPreset(color: string) {
  const normalized = normalizeHexColor(color) ?? color;
  hexInput.value = normalized;
  emit('update:modelValue', normalized);
  emit('commit', normalized);
}

function clearColor() {
  hexInput.value = '';
  emit('update:modelValue', '');
  emit('commit', '');
}

function handlePickerInput(event: Event) {
  const normalized = normalizeHexColor((event.target as HTMLInputElement).value);
  if (!normalized) return;
  hexInput.value = normalized;
  emit('update:modelValue', normalized);
}

function handlePickerChange(event: Event) {
  const normalized = normalizeHexColor((event.target as HTMLInputElement).value);
  if (!normalized) return;
  hexInput.value = normalized;
  emit('update:modelValue', normalized);
  emit('commit', normalized);
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
    emit('update:modelValue', normalized);
  }
}

function applyTypedHex() {
  if (props.allowClear && !hexInput.value.trim()) {
    clearColor();
    return;
  }
  if (!normalizedTyped.value) {
    emit('invalidHex');
    return;
  }
  hexInput.value = normalizedTyped.value;
  emit('update:modelValue', normalizedTyped.value);
  emit('commit', normalizedTyped.value);
}
</script>

<template>
  <div class="color-picker-block">
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
      <label class="color-picker-trigger" title="Escolher cor personalizada">
        <input
          type="color"
          :value="pickerValue"
          :disabled="disabled"
          aria-label="Seletor visual de cor"
          @input="handlePickerInput"
          @change="handlePickerChange"
        />
        <span
          class="color-picker-swatch"
          :class="{ 'is-empty': !normalizedCurrent }"
          :style="normalizedCurrent ? { backgroundColor: normalizedCurrent } : undefined"
        ></span>
      </label>

      <input
        :value="hexInput"
        type="text"
        class="hex-code-input"
        maxlength="7"
        :disabled="disabled"
        :placeholder="placeholder || (allowClear ? 'Padrão (opcional)' : '#ffc600')"
        aria-label="Código hexadecimal da cor"
        @input="handleHexTyping"
        @keydown.enter.prevent="applyTypedHex"
      />

      <button
        v-if="showApplyButton"
        type="button"
        class="btn-secondary btn-apply-hex"
        :disabled="disabled || !canApplyTyped"
        @click="applyTypedHex"
      >
        Aplicar
      </button>
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
  flex-shrink: 0;
  cursor: pointer;
}

.color-picker-trigger input[type='color'] {
  position: absolute;
  inset: 0;
  opacity: 0;
  width: 100%;
  height: 100%;
  cursor: pointer;
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

.btn-apply-hex {
  padding: 6px 10px;
  font-size: 11.5px;
  flex-shrink: 0;
}

.btn-apply-hex:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>
