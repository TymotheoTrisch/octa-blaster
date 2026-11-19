<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import {
  ArrowLeft,
  Plus,
  Search,
  GripVertical,
  ChevronRight,
  MoreHorizontal,
  Pencil,
  Trash2,
  RotateCcw,
} from 'lucide-vue-next';
import {
  loadMentionTargets,
  resetMentionTargets,
  saveMentionTargets,
} from '@/services/octadesk/mentionHelper';
import type { MentionTarget } from '@/types/template';
import { useListReorder } from '@/composables/useListReorder';
import './management.css';

const emit = defineEmits<{ back: []; changed: [] }>();

const targets = ref<MentionTarget[]>([]);
let targetsBase: MentionTarget[] = [];
function rememberBase() {
  targetsBase = structuredClone(targets.value.map((target) => ({ ...target })));
}

const searchQuery = ref('');
const statusFilter = ref<'all' | 'active' | 'inactive'>('all');
const listRef = ref<HTMLElement | null>(null);
const expandedIds = ref<Set<string>>(new Set());
const openMenuId = ref<string | null>(null);

const showForm = ref(false);
const editingId = ref<string | null>(null);
const name = ref('');
const query = ref('');
const queryEditedManually = ref(false);
const enabled = ref(true);
const status = ref('');
const busy = ref(false);

const canReorder = computed(() => !searchQuery.value.trim() && statusFilter.value === 'all');

const filteredTargets = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  return targets.value.filter((target) => {
    if (statusFilter.value === 'active' && !target.enabled) return false;
    if (statusFilter.value === 'inactive' && target.enabled) return false;
    if (!q) return true;
    return `${target.name} ${target.query}`.toLowerCase().includes(q);
  });
});

async function persistOrder() {
  try {
    targets.value = await saveMentionTargets(targets.value, targetsBase);
    rememberBase();
    status.value = 'Ordem dos técnicos atualizada.';
    emit('changed');
  } catch (error) {
    status.value = error instanceof Error ? error.message : 'Falha ao salvar ordem.';
    targets.value = await loadMentionTargets();
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
} = useListReorder<MentionTarget>({
  items: targets,
  getId: (t) => t.id,
  getLabel: (t) => t.name,
  canReorder,
  listRef,
  onPersist: persistOrder,
});

function toggleExpand(id: string) {
  const next = new Set(expandedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expandedIds.value = next;
}

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
    targets.value = await loadMentionTargets();
    rememberBase();
  } catch (error) {
    status.value = error instanceof Error ? error.message : 'Falha ao carregar técnicos.';
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

function startEdit(target?: MentionTarget) {
  openMenuId.value = null;
  editingId.value = target?.id || null;
  name.value = target?.name || '';
  query.value = target?.query || '';
  queryEditedManually.value = Boolean(target);
  enabled.value = target?.enabled ?? true;
  status.value = '';
  showForm.value = true;
}

function onNameInput() {
  if (editingId.value || queryEditedManually.value) return;
  const firstWord = name.value.trim().split(/\s+/)[0] || '';
  query.value = firstWord ? `@${firstWord}` : '';
}

function onQueryInput() {
  queryEditedManually.value = query.value.trim().length > 0;
}

async function persistTargets(next: MentionTarget[], successMessage: string) {
  targets.value = await saveMentionTargets(next, targetsBase);
  rememberBase();
  status.value = successMessage;
  emit('changed');
}

async function saveTarget() {
  if (busy.value) return;
  busy.value = true;
  try {
    const original = targets.value.find((target) => target.id === editingId.value);
    const pattern = original && original.name.trim() === name.value.trim()
      ? original.pattern
      : '';
    const updated: MentionTarget = {
      id: editingId.value || crypto.randomUUID(),
      name: name.value,
      query: query.value,
      enabled: enabled.value,
      pattern,
    };
    const next = editingId.value
      ? targets.value.map((target) => (target.id === editingId.value ? updated : target))
      : [...targets.value, updated];

    await persistTargets(next, 'Técnico salvo.');
    showForm.value = false;
  } catch (error) {
    status.value = error instanceof Error ? error.message : 'Falha ao salvar técnico.';
  } finally {
    busy.value = false;
  }
}

async function toggleEnabled(target: MentionTarget) {
  if (busy.value) return;
  busy.value = true;
  try {
    const next = targets.value.map((item) =>
      item.id === target.id ? { ...item, enabled: !item.enabled } : item,
    );
    await persistTargets(
      next,
      target.enabled ? `${target.name} desativado.` : `${target.name} ativado.`,
    );
  } catch (error) {
    status.value = error instanceof Error ? error.message : 'Falha ao atualizar técnico.';
  } finally {
    busy.value = false;
  }
}

async function removeTarget(target: MentionTarget) {
  openMenuId.value = null;
  if (busy.value) return;
  busy.value = true;
  try {
    await persistTargets(
      targets.value.filter((item) => item.id !== target.id),
      'Técnico removido.',
    );
  } catch (error) {
    status.value = error instanceof Error ? error.message : 'Falha ao remover técnico.';
  } finally {
    busy.value = false;
  }
}

async function restoreDefaults() {
  if (busy.value) return;
  busy.value = true;
  try {
    targets.value = await resetMentionTargets(targetsBase);
    rememberBase();
    status.value = 'Técnicos padrão restaurados.';
    emit('changed');
  } catch (error) {
    status.value = error instanceof Error ? error.message : 'Falha ao restaurar técnicos padrão.';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="management-shell" aria-label="Técnicos das licenças">
    <div class="management-subbar">
      <button
        type="button"
        class="management-back-btn"
        :aria-label="showForm ? 'Voltar para a lista de técnicos' : 'Voltar para a tela anterior'"
        @click="goBack"
      >
        <ArrowLeft :size="15" />
      </button>
      <h2>
        {{ showForm ? (editingId ? 'Editar técnico' : 'Novo técnico') : 'Técnicos (Licenças)' }}
      </h2>
      <button
        v-if="!showForm"
        type="button"
        class="management-add-btn"
        title="Novo técnico"
        aria-label="Novo técnico"
        @click="startEdit()"
      >
        <Plus :size="14" :stroke-width="2.3" />
      </button>
    </div>

    <form v-if="showForm" class="management-form-wrap" @submit.prevent="saveTarget">
      <div class="management-form-group">
        <label>Nome completo exibido no Octadesk</label>
        <input
          v-model="name"
          type="text"
          required
          placeholder="Ex: Jorge Tigre"
          @input="onNameInput"
        />
      </div>
      <div class="management-form-group">
        <label>Texto para buscar a menção</label>
        <input
          v-model="query"
          type="text"
          required
          placeholder="Ex: @Jorge"
          @input="onQueryInput"
        />
      </div>
      <p class="management-help">
        O nome completo identifica o item certo na lista de menções do Octadesk; a busca é o texto digitado após o @.
      </p>
      <label class="management-checkbox-row">
        <input v-model="enabled" type="checkbox" />
        Marcar automaticamente nas licenças
      </label>
      <div class="management-form-actions">
        <button type="button" class="btn-secondary" @click="showForm = false">
          Cancelar
        </button>
        <button type="submit" class="btn-primary" :disabled="busy">
          Salvar técnico
        </button>
      </div>
    </form>

    <template v-else>
      <div class="management-search-box">
        <div class="management-search-wrapper">
          <Search :size="14" class="management-search-icon" />
          <input v-model="searchQuery" type="search" placeholder="Buscar técnico..." />
        </div>
        <div class="management-filter">
          <select v-model="statusFilter" aria-label="Filtrar por status do técnico">
            <option value="all">Todos</option>
            <option value="active">Ativos</option>
            <option value="inactive">Desativados</option>
          </select>
        </div>
      </div>

      <div ref="listRef" class="management-scroll">
        <span class="sr-only" aria-live="polite">{{ liveAnnouncement }}</span>

        <div v-if="!filteredTargets.length" class="management-empty">
          <p v-if="searchQuery || statusFilter !== 'all'">Nenhum técnico corresponde aos filtros.</p>
          <p v-else>Nenhum técnico cadastrado para marcação automática.</p>
        </div>

        <div
          v-for="target in filteredTargets"
          :key="target.id"
          :data-reorder-id="target.id"
          class="template-card"
          :class="{
            'is-expanded': expandedIds.has(target.id),
            'is-inactive': !target.enabled,
            'is-dragging': draggingId === target.id,
            'is-keyboard-grabbed': keyboardGrabbedId === target.id,
            'has-open-menu': openMenuId === target.id,
          }"
        >
          <div class="card-header">
            <button
              v-if="canReorder"
              type="button"
              class="drag-handle"
              :aria-label="`Reordenar ${target.name}. Pressione Espaço ou Enter para pegar, setas para mover.`"
              :aria-pressed="keyboardGrabbedId === target.id"
              title="Arraste para definir a ordem da marcação (ou Espaço + setas)"
              @pointerdown="onHandlePointerDown($event, target.id)"
              @keydown="onHandleKeydown($event, target.id)"
              @blur="onHandleBlur(target.id)"
            >
              <GripVertical :size="14" :stroke-width="2" aria-hidden="true" />
            </button>

            <button
              type="button"
              class="card-expand-trigger"
              :aria-expanded="expandedIds.has(target.id)"
              @click="toggleExpand(target.id)"
            >
              <ChevronRight
                :size="14"
                :stroke-width="2"
                class="card-chevron"
                :class="{ expanded: expandedIds.has(target.id) }"
              />
              <span class="card-title">{{ target.name }}</span>
            </button>

            <div class="card-menu">
              <button
                type="button"
                class="card-badge card-badge-btn"
                :class="{ 'card-badge-accent': target.enabled }"
                :aria-pressed="target.enabled"
                :disabled="busy"
                title="Clique para ativar ou desativar"
                @click="toggleEnabled(target)"
              >
                {{ target.enabled ? 'Ativo' : 'Inativo' }}
              </button>

              <div class="card-more-wrapper">
                <button
                  type="button"
                  class="btn-icon"
                  :class="{ active: openMenuId === target.id }"
                  :aria-label="'Mais ações de ' + target.name"
                  @click.stop="toggleMenu(target.id)"
                >
                  <MoreHorizontal :size="14" :stroke-width="2" />
                </button>
                <transition name="menu-scale">
                  <div v-if="openMenuId === target.id" class="card-dropdown-menu">
                    <button type="button" class="menu-item" @click="startEdit(target)">
                      <Pencil :size="13" class="menu-item-icon" />
                      <span class="menu-item-text">Editar</span>
                    </button>
                    <button
                      type="button"
                      class="menu-item menu-item-danger"
                      :disabled="busy"
                      @click="removeTarget(target)"
                    >
                      <Trash2 :size="13" class="menu-item-icon" />
                      <span class="menu-item-text">Excluir</span>
                    </button>
                  </div>
                </transition>
              </div>
            </div>
          </div>

          <p v-if="keyboardGrabbedId === target.id" class="reorder-key-hint" aria-hidden="true">
            Setas para mover · Espaço para soltar · Esc para cancelar
          </p>

          <div v-if="expandedIds.has(target.id)" class="card-body">
            Busca de menção: <strong>{{ target.query }}</strong>
          </div>
        </div>

        <div class="management-footer-bar">
          <button
            type="button"
            class="btn-secondary"
            :disabled="busy"
            @click="restoreDefaults"
          >
            <RotateCcw :size="12" />
            Restaurar padrão
          </button>
        </div>
      </div>
    </template>

    <p v-if="status" class="management-status-inline" role="status">{{ status }}</p>
  </section>
</template>
