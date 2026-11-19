<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { X, ChevronRight } from 'lucide-vue-next';
import type { TemplateTag } from '@/services/storage/templateTagSchema';
import type { TemplateVariable } from '@/services/storage/settingsSchema';

const props = defineProps<{
  editingId: string | null;
  title: string;
  content: string;
  selectedTags: string[];
  tags: TemplateTag[];
  variables: TemplateVariable[];
}>();

const emit = defineEmits<{
  'update:title': [value: string];
  'update:content': [value: string];
  'update:selectedTags': [value: string[]];
  cancel: [];
  submit: [];
  openTags: [];
}>();

const tagPicker = ref<HTMLDetailsElement | null>(null);
const contentTextarea = ref<HTMLTextAreaElement | null>(null);
let contentSelection = { start: props.content.length, end: props.content.length };

const variableTokens = computed(() => {
  const names = ['Saudacao', 'Data', 'Hora', ...props.variables.map((v) => v.name)];
  return names.map((name) => ({ name, token: `{{${name}}}` }));
});

const selectedTagNames = computed(() =>
  props.tags
    .filter((tag) => props.selectedTags.includes(tag.id))
    .map((tag) => tag.name)
    .join(', '),
);

function rememberContentSelection() {
  const textarea = contentTextarea.value;
  if (textarea) {
    contentSelection = { start: textarea.selectionStart, end: textarea.selectionEnd };
  }
}

function toggleTag(tagId: string, checked: boolean) {
  const next = checked
    ? [...new Set([...props.selectedTags, tagId])]
    : props.selectedTags.filter((id) => id !== tagId);
  emit('update:selectedTags', next);
}

async function insertVariable(token: string) {
  const textarea = contentTextarea.value;
  if (textarea && document.activeElement === textarea) rememberContentSelection();
  const start = Math.min(contentSelection.start, props.content.length);
  const end = Math.min(contentSelection.end, props.content.length);
  emit('update:content', props.content.slice(0, start) + token + props.content.slice(end));
  const caret = start + token.length;
  contentSelection = { start: caret, end: caret };
  await nextTick();
  textarea?.focus();
  textarea?.setSelectionRange(caret, caret);
}

function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  if (tagPicker.value && (!target || !tagPicker.value.contains(target))) {
    tagPicker.value.open = false;
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && tagPicker.value) {
    tagPicker.value.open = false;
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
  document.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
  document.removeEventListener('keydown', handleKeydown);
});

function closeTagPicker() {
  if (tagPicker.value) tagPicker.value.open = false;
}

defineExpose({ closeTagPicker });
</script>

<template>
  <div class="form-container">
    <div class="form-header">
      <h2>{{ editingId ? 'Editar Modelo' : 'Novo Modelo de Resposta' }}</h2>
      <button type="button" class="btn-close" title="Fechar" @click="emit('cancel')">
        <X :size="15" :stroke-width="2" />
      </button>
    </div>

    <div class="form-group">
      <label>Título do Modelo</label>
      <input
        :value="title"
        type="text"
        placeholder="Ex: Cobrança de Retorno (2º e 4º dia)"
        maxlength="60"
        @input="emit('update:title', ($event.target as HTMLInputElement).value)"
      />
    </div>

    <fieldset class="message-tags-field">
      <legend>Tags</legend>
      <details ref="tagPicker" class="message-tag-picker">
        <summary aria-label="Selecionar tags da mensagem">
          <span>{{ selectedTagNames || 'Selecionar tags' }}</span>
          <ChevronRight :size="14" class="tag-picker-chevron" />
        </summary>
        <div class="message-tag-menu">
          <label v-for="tag in tags" :key="tag.id" class="message-tag-option">
            <input
              type="checkbox"
              :value="tag.id"
              :checked="selectedTags.includes(tag.id)"
              @change="toggleTag(tag.id, ($event.target as HTMLInputElement).checked)"
            />
            {{ tag.name }}
          </label>
          <p v-if="!tags.length" class="tag-hint">Cadastre tags para organizar suas mensagens.</p>
          <button
            type="button"
            class="tag-picker-manage"
            @click="closeTagPicker(); emit('openTags')"
          >
            Gerenciar tags
          </button>
        </div>
      </details>
    </fieldset>

    <div class="form-group">
      <div class="label-with-tags">
        <label>Mensagem da Resposta</label>
        <div class="quick-tags">
          <span class="tag-hint">Inserir variável</span>
          <button
            v-for="variable in variableTokens"
            :key="variable.name"
            type="button"
            class="tag-btn"
            :class="{ 'tag-btn-highlight': variable.name === 'Saudacao' }"
            :aria-label="'Inserir ' + variable.token"
            @mousedown.prevent
            @click="insertVariable(variable.token)"
          >
            {{ variable.token }}
          </button>
        </div>
      </div>
      <textarea
        ref="contentTextarea"
        :value="content"
        aria-label="Mensagem da Resposta"
        rows="6"
        placeholder="Escreva a resposta pronta aqui... Use {{Saudacao}} para Bom dia / Boa tarde automático!"
        @input="emit('update:content', ($event.target as HTMLTextAreaElement).value); rememberContentSelection()"
        @select="rememberContentSelection"
        @keyup="rememberContentSelection"
        @click="rememberContentSelection"
        @blur="rememberContentSelection"
      ></textarea>
    </div>

    <div class="form-actions">
      <button type="button" class="btn-secondary" @click="emit('cancel')">
        Cancelar
      </button>
      <button type="button" class="btn-primary" @click="emit('submit')">
        {{ editingId ? 'Salvar Alterações' : 'Criar Modelo' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.form-container {
  flex: 1;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
}

.form-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.form-header h2 {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.btn-close {
  background: transparent;
  border: none;
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  cursor: pointer;
  color: var(--text-muted);
  transition: background 0.15s, color 0.15s;
}

.btn-close:hover {
  background: #f1f5f9;
  color: var(--text-primary);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-group label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.label-with-tags {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
}

.quick-tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}

.tag-hint {
  font-size: 10px;
  color: var(--text-muted);
}

.tag-btn {
  background: #e2e8f0;
  border: 1px solid #cbd5e1;
  color: #334155;
  border-radius: 4px;
  font-size: 10px;
  padding: 2px 6px;
  cursor: pointer;
  font-weight: 500;
}

.tag-btn:hover {
  background: #cbd5e1;
}

.tag-btn-highlight {
  background: rgba(255, 198, 0, 0.22);
  border-color: rgba(255, 198, 0, 0.55);
  color: #6f5600;
  font-weight: 600;
}

.tag-btn-highlight:hover {
  background: rgba(255, 198, 0, 0.35);
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 6px;
}

.message-tags-field {
  border: 0;
  min-width: 0;
  padding: 0;
}

.message-tags-field legend {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 5px;
}

.message-tag-picker {
  position: relative;
}

.message-tag-picker summary {
  list-style: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 12px;
  cursor: pointer;
}

.message-tag-picker summary::-webkit-details-marker {
  display: none;
}

.message-tag-picker summary span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tag-picker-chevron {
  transform: rotate(90deg);
  flex-shrink: 0;
}

.message-tag-picker[open] .tag-picker-chevron {
  transform: rotate(-90deg);
}

.message-tag-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 50;
  max-height: 200px;
  overflow-y: auto;
  padding: 5px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-primary);
  box-shadow: 0 4px 14px #0002;
}

.message-tag-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}

.message-tag-option:hover {
  background: var(--bg-tertiary);
}

.message-tag-option input {
  accent-color: var(--accent);
}

.tag-picker-manage {
  display: block;
  width: 100%;
  padding: 9px 8px;
  border: 0;
  border-top: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  text-align: left;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
</style>
