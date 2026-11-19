<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { Search } from 'lucide-vue-next';
import type { QuickReplyTemplate } from '@/types/template';
import { getTemplateTagIds, getTemplateTagNames, type TemplateTag } from '@/services/storage/templateTagSchema';
import { useTemplateReorder } from '@/composables/useTemplateReorder';
import TemplateCard from './TemplateCard.vue';

const props = defineProps<{
  templates: QuickReplyTemplate[];
  tags: TemplateTag[];
  searchQuery: string;
  selectedTagId: string;
  isSending: boolean;
  onPersistOrder: () => Promise<void>;
}>();

const emit = defineEmits<{
  'update:searchQuery': [value: string];
  'update:selectedTagId': [value: string];
  'update:templates': [value: QuickReplyTemplate[]];
  copy: [template: QuickReplyTemplate];
  send: [template: QuickReplyTemplate];
  edit: [template: QuickReplyTemplate];
  remove: [id: string];
}>();

const templatesModel = computed({
  get: () => props.templates,
  set: (value) => emit('update:templates', value),
});

const filteredTemplates = computed(() => {
  const query = props.searchQuery.trim().toLowerCase();
  return props.templates.filter((template) => {
    const matchesTag =
      !props.selectedTagId ||
      getTemplateTagIds(template, props.tags).includes(props.selectedTagId);
    const searchable = [
      template.title,
      template.content,
      ...getTemplateTagNames(template, props.tags),
    ]
      .join(' ')
      .toLowerCase();
    return matchesTag && (!query || searchable.includes(query));
  });
});

const templatesListRef = ref<HTMLElement | null>(null);
const canReorder = computed(() => !props.searchQuery.trim() && !props.selectedTagId);

const {
  draggingId,
  keyboardGrabbedId,
  liveAnnouncement,
  onHandlePointerDown,
  onHandleKeydown,
  onHandleBlur,
} = useTemplateReorder({
  templates: templatesModel,
  canReorder,
  listRef: templatesListRef,
  onPersist: props.onPersistOrder,
});

const expandedIds = ref<Set<string>>(new Set());
const openCardMenuId = ref<string | null>(null);

function isExpanded(id: string): boolean {
  return expandedIds.value.has(id);
}

function toggleExpand(id: string) {
  const next = new Set(expandedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expandedIds.value = next;
}

function toggleCardMenu(id: string) {
  openCardMenuId.value = openCardMenuId.value === id ? null : id;
}

function closeCardMenu() {
  openCardMenuId.value = null;
}

function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  if (openCardMenuId.value && (!target || !target.closest('.card-more-wrapper'))) {
    closeCardMenu();
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && openCardMenuId.value) {
    closeCardMenu();
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

defineExpose({ closeCardMenu });
</script>

<template>
  <div class="list-container">
    <div class="search-box">
      <div class="search-input-wrapper">
        <Search :size="14" class="search-input-icon" />
        <input
          :value="searchQuery"
          type="search"
          placeholder="Buscar por título ou conteúdo..."
          @input="emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
        />
      </div>
      <div class="tag-filter">
        <label for="tag-filter" class="sr-only">Filtrar por tag</label>
        <select
          id="tag-filter"
          :value="selectedTagId"
          aria-label="Filtrar por tag"
          @change="emit('update:selectedTagId', ($event.target as HTMLSelectElement).value)"
        >
          <option value="">Todas as tags</option>
          <option v-for="tag in tags" :key="tag.id" :value="tag.id">{{ tag.name }}</option>
        </select>
      </div>
    </div>

    <div ref="templatesListRef" class="templates-scroll">
      <span class="sr-only" aria-live="polite">{{ liveAnnouncement }}</span>

      <div v-if="filteredTemplates.length === 0" class="empty-state">
        <p v-if="searchQuery || selectedTagId">Nenhum modelo corresponde aos filtros.</p>
        <p v-else>
          Nenhum modelo cadastrado. Clique em "Novo" ou abra as opções para restaurar os padrões.
        </p>
      </div>

      <TemplateCard
        v-for="tpl in filteredTemplates"
        :key="tpl.id"
        :template="tpl"
        :tag-names="getTemplateTagNames(tpl, tags)"
        :can-reorder="canReorder"
        :expanded="isExpanded(tpl.id)"
        :is-dragging="draggingId === tpl.id"
        :is-keyboard-grabbed="keyboardGrabbedId === tpl.id"
        :has-open-menu="openCardMenuId === tpl.id"
        :is-sending="isSending"
        @toggle-expand="toggleExpand(tpl.id)"
        @toggle-menu="toggleCardMenu(tpl.id)"
        @close-menu="closeCardMenu"
        @copy="emit('copy', tpl)"
        @send="emit('send', tpl)"
        @edit="emit('edit', tpl)"
        @remove="emit('remove', tpl.id)"
        @pointer-down-handle="onHandlePointerDown($event, tpl.id)"
        @keydown-handle="onHandleKeydown($event, tpl.id)"
        @blur-handle="onHandleBlur(tpl.id)"
      />
    </div>
  </div>
</template>

<style scoped>
.list-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px 6px;
  background: var(--bg-primary);
}

.search-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
}

.search-input-icon {
  position: absolute;
  left: 9px;
  color: var(--text-subtle);
  pointer-events: none;
}

.search-input-wrapper input {
  padding-left: 30px;
}

.tag-filter {
  flex: 0 1 125px;
  min-width: 0;
  display: flex;
  align-items: center;
}

.tag-filter select {
  width: 100%;
  min-width: 0;
  padding: 7px 8px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 12px;
}

.templates-scroll {
  position: relative;
  flex: 1;
  overflow-y: auto;
  padding: 10px 14px 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.templates-scroll[data-drop='true']::after {
  content: '';
  position: fixed;
  left: var(--drop-x);
  top: var(--drop-y);
  width: var(--drop-w);
  height: var(--drop-h, 2px);
  background: var(--accent);
  border-radius: 999px;
  pointer-events: none;
  z-index: 50;
  transform: translateY(-50%);
}

.templates-scroll[data-drop='true']::before {
  content: '';
  position: fixed;
  left: calc(var(--drop-x) - 3px);
  top: var(--drop-y);
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--bg-surface);
  border: 2px solid var(--accent-border);
  pointer-events: none;
  z-index: 51;
  transform: translateY(-50%);
}

@media (forced-colors: active) {
  .templates-scroll[data-drop='true']::after {
    background: Highlight;
  }
  .templates-scroll[data-drop='true']::before {
    border-color: Highlight;
  }
}

.empty-state {
  text-align: center;
  padding: 30px 15px;
  color: var(--text-muted);
  font-size: 12px;
}
</style>
