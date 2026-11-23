<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ArrowLeft, Monitor, Sun, Moon, RotateCcw } from 'lucide-vue-next';
import {
  BRAND_COLOR_PRESETS,
  DEFAULT_APPEARANCE,
  DEFAULT_BRAND_COLOR,
  LOGO_INNER_COLOR_PRESETS,
  normalizeHexColor,
  type AppearanceSettings,
  type ThemeMode,
} from '@/services/storage/settingsSchema';
import { loadAppearance, saveAppearance } from '@/services/appearance/appearanceStorage';
import {
  OCTABLASTER_ICON_PATH,
  OCTABLASTER_ICON_VIEWBOX,
  OCTABLASTER_INNER_RECT,
} from '@/services/appearance/iconGeometry';
import ColorSwatchPicker from '@/components/common/ColorSwatchPicker.vue';
import './management.css';

const props = defineProps<{
  currentAppearance: AppearanceSettings;
}>();

const emit = defineEmits<{
  back: [];
  preview: [appearance: AppearanceSettings];
  changed: [appearance: AppearanceSettings];
}>();

const theme = ref<ThemeMode>(props.currentAppearance.theme);
const brandColor = ref<string>(props.currentAppearance.brandColor);
const logoInnerColor = ref<string>(props.currentAppearance.logoInnerColor ?? '');
let appearanceBase: AppearanceSettings = { ...props.currentAppearance };

const status = ref('');
const statusIsError = ref(false);
const busy = ref(false);
let pendingSave: { appearance: AppearanceSettings; message: string } | null = null;
let previewPersistTimer: ReturnType<typeof setTimeout> | null = null;
let pendingPreviewMessage: string | null = null;

const themeOptions: ReadonlyArray<{ value: ThemeMode; label: string; icon: typeof Monitor }> = [
  { value: 'system', label: 'Sistema', icon: Monitor },
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Escuro', icon: Moon },
];

const isDefaultAppearance = computed(
  () =>
    theme.value === DEFAULT_APPEARANCE.theme
    && brandColor.value === DEFAULT_BRAND_COLOR
    && !logoInnerColor.value,
);

watch(
  () => props.currentAppearance,
  (next) => {
    if (busy.value || pendingSave || previewPersistTimer !== null) return;
    theme.value = next.theme;
    brandColor.value = next.brandColor;
    logoInnerColor.value = next.logoInnerColor ?? '';
  },
  { deep: true },
);

onMounted(async () => {
  try {
    const loaded = await loadAppearance();
    theme.value = loaded.theme;
    brandColor.value = loaded.brandColor;
    logoInnerColor.value = loaded.logoInnerColor ?? '';
    appearanceBase = { ...loaded };
    emit('preview', loaded);
  } catch (error) {
    statusIsError.value = true;
    status.value = error instanceof Error ? error.message : 'Falha ao carregar aparência.';
  }
});

function clearPreviewPersistTimer() {
  if (previewPersistTimer !== null) {
    clearTimeout(previewPersistTimer);
    previewPersistTimer = null;
  }
  pendingPreviewMessage = null;
}

function schedulePreviewPersist(message = 'Aparência salva.') {
  if (previewPersistTimer !== null) {
    clearTimeout(previewPersistTimer);
  }
  pendingPreviewMessage = message;
  previewPersistTimer = setTimeout(() => {
    previewPersistTimer = null;
    const msg = pendingPreviewMessage ?? message;
    pendingPreviewMessage = null;
    void persistAppearance(theme.value, brandColor.value, logoInnerColor.value, msg);
  }, 180);
}

async function flushAppearanceSave() {
  busy.value = true;
  statusIsError.value = false;
  try {
    while (pendingSave) {
      const current = pendingSave;
      pendingSave = null;
      const saved = await saveAppearance(current.appearance, appearanceBase);
      appearanceBase = { ...saved };
      if (!pendingSave) {
        theme.value = saved.theme;
        brandColor.value = saved.brandColor;
        logoInnerColor.value = saved.logoInnerColor ?? '';
        status.value = current.message;
        emit('changed', saved);
      }
    }
  } catch (error) {
    pendingSave = null;
    statusIsError.value = true;
    status.value = error instanceof Error ? error.message : 'Falha ao salvar aparência.';
  } finally {
    busy.value = false;
  }
}

async function persistAppearance(
  nextTheme: ThemeMode,
  nextColor: string,
  nextLogoInner = logoInnerColor.value,
  message = 'Aparência salva.',
) {
  const normalized = normalizeHexColor(nextColor);
  if (!normalized) {
    statusIsError.value = true;
    status.value = 'Informe uma cor hexadecimal válida (#RRGGBB).';
    return;
  }

  let normalizedInner: string | undefined;
  if (nextLogoInner.trim()) {
    const parsedInner = normalizeHexColor(nextLogoInner);
    if (!parsedInner) {
      statusIsError.value = true;
      status.value = 'Informe uma cor interna válida (#RRGGBB).';
      return;
    }
    normalizedInner = parsedInner;
  }

  theme.value = nextTheme;
  brandColor.value = normalized;
  logoInnerColor.value = normalizedInner ?? '';
  const next: AppearanceSettings = {
    theme: nextTheme,
    brandColor: normalized,
    ...(normalizedInner ? { logoInnerColor: normalizedInner } : {}),
  };
  emit('preview', next);

  if (JSON.stringify(next) === JSON.stringify(appearanceBase) && !busy.value && !pendingSave) {
    statusIsError.value = false;
    status.value = message;
    return;
  }

  pendingSave = { appearance: next, message };
  if (busy.value) return;
  await flushAppearanceSave();
}

function selectTheme(nextTheme: ThemeMode) {
  clearPreviewPersistTimer();
  void persistAppearance(nextTheme, brandColor.value, logoInnerColor.value);
}

function handleBrandPreview(color: string) {
  const normalized = normalizeHexColor(color);
  if (!normalized) return;
  brandColor.value = normalized;
  emit('preview', {
    theme: theme.value,
    brandColor: normalized,
    ...(logoInnerColor.value ? { logoInnerColor: logoInnerColor.value } : {}),
  });
  schedulePreviewPersist();
}

function handleBrandCommit(color: string) {
  clearPreviewPersistTimer();
  void persistAppearance(theme.value, color, logoInnerColor.value);
}

function handleLogoInnerPreview(color: string) {
  if (!color.trim()) {
    logoInnerColor.value = '';
    emit('preview', { theme: theme.value, brandColor: brandColor.value });
    schedulePreviewPersist();
    return;
  }
  const normalized = normalizeHexColor(color);
  if (!normalized) return;
  logoInnerColor.value = normalized;
  emit('preview', {
    theme: theme.value,
    brandColor: brandColor.value,
    logoInnerColor: normalized,
  });
  schedulePreviewPersist();
}

function handleLogoInnerCommit(color: string) {
  clearPreviewPersistTimer();
  void persistAppearance(theme.value, brandColor.value, color);
}

function handleInvalidHex() {
  clearPreviewPersistTimer();
  statusIsError.value = true;
  status.value = 'Código hexadecimal inválido. Ex.: #ffc600';
}

function resetDefaults() {
  clearPreviewPersistTimer();
  void persistAppearance(
    DEFAULT_APPEARANCE.theme,
    DEFAULT_BRAND_COLOR,
    '',
    'Aparência padrão restaurada.',
  );
}

onBeforeUnmount(() => {
  if (previewPersistTimer !== null) {
    const msg = pendingPreviewMessage ?? 'Aparência salva.';
    clearPreviewPersistTimer();
    void persistAppearance(theme.value, brandColor.value, logoInnerColor.value, msg);
  }
});
</script>

<template>
  <section class="management-shell" aria-label="Aparência e Marca">
    <div class="management-subbar">
      <button
        type="button"
        class="management-back-btn"
        aria-label="Voltar para a tela anterior"
        @click="emit('back')"
      >
        <ArrowLeft :size="15" />
      </button>
      <h2>Aparência</h2>
      <button
        type="button"
        class="card-badge card-badge-btn"
        :disabled="busy || isDefaultAppearance"
        title="Restaurar tema e cor padrão"
        @click="resetDefaults"
      >
        Restaurar padrão
      </button>
    </div>

    <div class="management-scroll">
      <div class="template-card is-expanded appearance-card">
        <div class="appearance-section-head">
          <span class="appearance-label">Tema</span>
          <span class="appearance-hint">Aplicado no popup, painel e página do Octadesk</span>
        </div>

        <div class="theme-segmented" role="radiogroup" aria-label="Selecionar tema">
          <button
            v-for="option in themeOptions"
            :key="option.value"
            type="button"
            role="radio"
            :aria-checked="theme === option.value"
            class="theme-option-btn"
            :class="{ active: theme === option.value }"
            :disabled="busy"
            @click="selectTheme(option.value)"
          >
            <component :is="option.icon" :size="13" :stroke-width="2" />
            <span>{{ option.label }}</span>
          </button>
        </div>
      </div>

      <div class="template-card is-expanded appearance-card">
        <div class="appearance-section-head">
          <span class="appearance-label">Cor da marca</span>
          <span class="appearance-hint">Botões, destaques, SVG interno e ícone do navegador</span>
        </div>

        <ColorSwatchPicker
          :model-value="brandColor"
          :presets="BRAND_COLOR_PRESETS"
          :fallback-picker-color="DEFAULT_BRAND_COLOR"
          placeholder="#ffc600"
          aria-label="Cores sugeridas para a marca"
          @update:model-value="handleBrandPreview"
          @commit="handleBrandCommit"
          @invalid-hex="handleInvalidHex"
        />
      </div>

      <div class="template-card is-expanded appearance-card">
        <div class="appearance-section-head">
          <span class="appearance-label">Cor secundária</span>
          <span class="appearance-hint">Interior do logo e texto/ícones dos botões</span>
        </div>

        <ColorSwatchPicker
          :model-value="logoInnerColor"
          :presets="LOGO_INNER_COLOR_PRESETS"
          :allow-clear="true"
          clear-label="Automático (tema)"
          fallback-picker-color="#ffffff"
          placeholder="Automático (tema)"
          aria-label="Cores sugeridas para a cor secundária"
          @update:model-value="handleLogoInnerPreview"
          @commit="handleLogoInnerCommit"
          @invalid-hex="handleInvalidHex"
        />
      </div>

      <div class="template-card is-expanded appearance-preview-card">
        <div class="appearance-section-head">
          <span class="appearance-label">Prévia em tempo real</span>
          <span class="card-badge card-badge-accent">Ao vivo</span>
        </div>

        <div class="appearance-preview-box">
          <div class="preview-brand">
            <svg
              class="preview-logo"
              :viewBox="OCTABLASTER_ICON_VIEWBOX"
              width="20"
              height="20"
              fill="currentColor"
              aria-hidden="true"
            >
              <rect
                :x="OCTABLASTER_INNER_RECT.x"
                :y="OCTABLASTER_INNER_RECT.y"
                :width="OCTABLASTER_INNER_RECT.width"
                :height="OCTABLASTER_INNER_RECT.height"
                :rx="OCTABLASTER_INNER_RECT.rx"
                fill="var(--logo-inner)"
              />
              <path :d="OCTABLASTER_ICON_PATH" />
            </svg>
            <span class="preview-title">OctaBlaster</span>
          </div>
          <div class="preview-actions">
            <span class="preview-chip">{{ brandColor }}</span>
            <span class="preview-btn">Inserir</span>
          </div>
        </div>
      </div>

      <div class="management-footer-bar">
        <button
          type="button"
          class="btn-secondary"
          :disabled="busy || isDefaultAppearance"
          @click="resetDefaults"
        >
          <RotateCcw :size="12" />
          <span>Restaurar padrão</span>
        </button>
      </div>
    </div>

    <p v-if="status" class="management-status-inline" :class="{ 'is-error': statusIsError }" role="status">
      {{ status }}
    </p>
  </section>
</template>

<style scoped>
.appearance-card,
.appearance-preview-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.appearance-section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.appearance-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.appearance-hint {
  font-size: 10.5px;
  color: var(--text-muted);
  text-align: right;
}

.theme-segmented {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  padding: 3px;
  border-radius: 7px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
}

.theme-option-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 6px 8px;
  border: 1px solid transparent;
  border-radius: 5px;
  background: transparent;
  color: var(--text-muted);
  font-size: 11.5px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

.theme-option-btn:hover:not(:disabled) {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.theme-option-btn.active {
  background: var(--bg-surface);
  color: var(--text-primary);
  border-color: var(--border);
  font-weight: 600;
  box-shadow: var(--shadow-card);
}

.appearance-preview-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
}

.preview-brand {
  display: flex;
  align-items: center;
  gap: 7px;
}

.preview-logo {
  color: var(--accent);
  filter: drop-shadow(0 0 0.5px rgba(0, 0, 0, 0.22));
  flex-shrink: 0;
}

.preview-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-primary);
}

.preview-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.preview-chip {
  font-size: 10.5px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent-soft-text);
  border: 1px solid var(--accent-soft-border);
}

.preview-btn {
  font-size: 11px;
  font-weight: 700;
  padding: 4px 9px;
  border-radius: 4px;
  background: var(--accent);
  color: var(--accent-text);
  border: 1px solid var(--accent-border);
}

.management-status-inline.is-error {
  background: var(--error-bg);
  color: var(--error-text);
}
</style>
