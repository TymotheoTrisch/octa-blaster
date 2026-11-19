<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import {
  ArrowLeft,
  Plus,
  Search,
  GripVertical,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-vue-next';
import { loadTags, saveTags } from '@/services/storage/templateTags';
import { TAG_COLOR_PRESETS, type TemplateTag } from '@/services/storage/templateTagSchema';
import { computeTagBadgeVars } from '@/services/appearance/themeTokens';
import { useListReorder } from '@/composables/useListReorder';
import ColorSwatchPicker from '@/components/common/ColorSwatchPicker.vue';
import './management.css';

const emit = defineEmits<{ back: []; changed: [] }>();

const tags = ref<TemplateTag[]>([]);
let tagsBase: TemplateTag[] = [];
function rememberBase() {
  tagsBase = structuredClone(tags.value.map((tag) => ({ ...tag })));
}

const searchQuery = ref('');
const listRef = ref<HTMLElement | null>(null);
const openMenuId = ref<string | null>(null);

const editingId = ref<string | null>(null);
const showForm = ref(false);
const name = ref('');
const color = ref('');
const status = ref('');
const busy = ref(false);
const previewBadgeStyle = computed(() => computeTagBadgeVars(color.value));

const canReorder = computed(() => !searchQuery.value.trim());

const filteredTags = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return tags.value;
  return tags.value.filter((tag) => tag.name.toLowerCase().includes(q));
});

async function persistOrder() {
  try {
    tags.value = await saveTags(tags.value, tagsBase);
    rememberBase();
    emit('changed');
  } catch (error) {
    status.value = error instanceof Error ? error.message : 'Falha ao salvar ordem das tags.';
    tags.value = await loadTags();
    rememberBase();
  }
}

const {
  draggingId,
  keyboardGrabbedId,
  liveAnnouncement,
  onHandlePointerDown,
  onHandleKeydown,
  onHandleBlur,
} = useListReorder<TemplateTag>({
  items: tags,
  getId: (t) => t.id,
  getLabel: (t) => t.name,
  canReorder,
  listRef,
  onPersist: persistOrder,
});

function toggleMenu(id: string) {
  openMenuId.value = openMenuId.value === id ? null : id;
}

function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  if (openMenuId.value && (!target || !target.closest('.card-more-wrapper'))) {
    openMenuId.value = null;
  }
}

onMounted(async () => {
  document.addEventListener('click', handleClickOutside);
  try {
    tags.value = await loadTags();
    rememberBase();
  } catch (error) {
    status.value = error instanceof Error ? error.message : 'Falha ao carregar tags.';
  }
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});

function goBack() {
  if (showForm.value) {
    showForm.value = false;
    status.value = '';
    return;
  }
  emit('back');
}

function startEdit(tag?: TemplateTag) {
  openMenuId.value = null;
  editingId.value = tag?.id || null;
  name.value = tag?.name || '';
  color.value = tag?.color || '';
  status.value = '';
  showForm.value = true;
}

async function save() {
  if (busy.value) return;
  busy.value = true;
  try {
    const updated: TemplateTag = {
      id: editingId.value || crypto.randomUUID(),
      name: name.value,
      ...(color.value ? { color: color.value } : {}),
    };
    const next = editingId.value
      ? tags.value.map((tag) => (tag.id === editingId.value ? updated : tag))
      : [...tags.value, updated];
    tags.value = await saveTags(next, tagsBase);
    rememberBase();
    showForm.value = false;
    status.value = 'Tag salva.';
    emit('changed');
  } catch (error) {
    status.value = error instanceof Error ? error.message : 'Falha ao salvar tag.';
  } finally {
    busy.value = false;
  }
}

async function remove(tag: TemplateTag) {
  openMenuId.value = null;
  if (busy.value) return;
  busy.value = true;
  try {
    tags.value = await saveTags(
      tags.value.filter((item) => item.id !== tag.id),
      tagsBase,
    );
    rememberBase();
    status.value = 'Tag removida das mensagens.';
    emit('changed');
  } catch (error) {
    status.value = error instanceof Error ? error.message : 'Falha ao remover tag.';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="management-shell" aria-label="Tags">
    <div class="management-subbar">
      <button
        type="button"
        class="management-back-btn"
        :aria-label="showForm ? 'Voltar para a lista de tags' : 'Voltar para a tela anterior'"
        @click="goBack"
      >
        <ArrowLeft :size="15" />
      </button>
      <h2>{{ showForm ? (editingId ? 'Editar tag' : 'Nova tag') : 'Tags' }}</h2>
      <button
        v-if="!showForm"
        type="button"
        class="management-add-btn"
        title="Nova tag"
        aria-label="Nova tag"
        @click="startEdit()"
      >
        <Plus :size="14" :stroke-width="2.3" />
      </button>
    </div>

    <form v-if="showForm" class="management-form-wrap" @submit.prevent="save">
      <div class="management-form-group">
        <label>Nome da tag</label>
        <input v-model="name" type="text" required maxlength="40" placeholder="Suporte" />
      </div>
      <div class="management-form-group">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px">
          <label>Cor da tag (opcional)</label>
          <span
            class="card-badge"
            :class="{ 'tag-badge-colored': Boolean(previewBadgeStyle) }"
            :style="previewBadgeStyle"
          >
            {{ name.trim() || 'Prévia' }}
          </span>
        </div>
        <ColorSwatchPicker
          v-model="color"
          :presets="TAG_COLOR_PRESETS"
          :allow-clear="true"
          clear-label="Sem cor (padrão)"
          :disabled="busy"
          aria-label="Cores sugeridas para a tag"
        />
      </div>
      <p class="management-help">
        As tags organizam e filtram as mensagens. Excluir uma tag remove apenas sua associação.
      </p>
      <div class="management-form-actions">
        <button type="button" class="btn-secondary" @click="showForm = false">
          Cancelar
        </button>
        <button type="submit" class="btn-primary" :disabled="busy">
          Salvar tag
        </button>
      </div>
    </form>

    <template v-else>
      <div class="management-search-box">
        <div class="management-search-wrapper">
          <Search :size="14" class="management-search-icon" />
          <input v-model="searchQuery" type="search" placeholder="Buscar tag..." />
        </div>
      </div>

      <div ref="listRef" class="management-scroll">
        <span class="sr-only" aria-live="polite">{{ liveAnnouncement }}</span>

        <div v-if="!filteredTags.length" class="management-empty">
          <p v-if="searchQuery">Nenhuma tag corresponde à busca.</p>
          <p v-else>Cadastre a primeira tag para organizar suas mensagens.</p>
        </div>

        <div
          v-for="tag in filteredTags"
          :key="tag.id"
          :data-reorder-id="tag.id"
          class="template-card"
          :class="{
            'is-dragging': draggingId === tag.id,
            'is-keyboard-grabbed': keyboardGrabbedId === tag.id,
            'has-open-menu': openMenuId === tag.id,
          }"
        >
          <div class="card-header">
            <button
              v-if="canReorder"
              type="button"
              class="drag-handle"
              :aria-label="`Reordenar ${tag.name}. Pressione Espaço ou Enter para pegar, setas para mover.`"
              :aria-pressed="keyboardGrabbedId === tag.id"
              title="Arraste para reordenar (ou Espaço + setas)"
              @pointerdown="onHandlePointerDown($event, tag.id)"
              @keydown="onHandleKeydown($event, tag.id)"
              @blur="onHandleBlur(tag.id)"
            >
              <GripVertical :size="14" :stroke-width="2" aria-hidden="true" />
            </button>

            <div class="card-static-row">
              <span class="card-title">{{ tag.name }}</span>
              <span
                class="card-badge"
                :class="{ 'tag-badge-colored': Boolean(tag.color) }"
                :style="computeTagBadgeVars(tag.color)"
              >
                {{ tag.color ? tag.name : 'Tag' }}
              </span>
            </div>

            <div class="card-menu">
              <div class="card-more-wrapper">
                <button
                  type="button"
                  class="btn-icon"
                  :class="{ active: openMenuId === tag.id }"
                  :aria-label="'Mais ações de ' + tag.name"
                  @click.stop="toggleMenu(tag.id)"
                >
                  <MoreHorizontal :size="14" :stroke-width="2" />
                </button>
                <transition name="menu-scale">
                  <div v-if="openMenuId === tag.id" class="card-dropdown-menu">
                    <button type="button" class="menu-item" @click="startEdit(tag)">
                      <Pencil :size="13" class="menu-item-icon" />
                      <span class="menu-item-text">Editar</span>
                    </button>
                    <button
                      type="button"
                      class="menu-item menu-item-danger"
                      :disabled="busy"
                      @click="remove(tag)"
                    >
                      <Trash2 :size="13" class="menu-item-icon" />
                      <span class="menu-item-text">Excluir</span>
                    </button>
                  </div>
                </transition>
              </div>
            </div>
          </div>

          <p v-if="keyboardGrabbedId === tag.id" class="reorder-key-hint" aria-hidden="true">
            Setas para mover · Espaço para soltar · Esc para cancelar
          </p>
        </div>
      </div>
    </template>

    <p v-if="status" class="management-status-inline" role="status">{{ status }}</p>
  </section>
</template>
