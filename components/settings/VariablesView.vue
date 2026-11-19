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
} from 'lucide-vue-next';
import { loadVariables, saveVariables } from '@/services/templates/templateVariables';
import type { TemplateVariable } from '@/services/storage/settingsSchema';
import { useListReorder } from '@/composables/useListReorder';
import './management.css';

const emit = defineEmits<{ back: []; changed: [] }>();

const variables = ref<TemplateVariable[]>([]);
let variablesBase: TemplateVariable[] = [];
function rememberBase() {
  variablesBase = structuredClone(variables.value.map((item) => ({ ...item })));
}

const searchQuery = ref('');
const modeFilter = ref<'all' | 'saved' | 'prompt' | 'auto'>('all');
const listRef = ref<HTMLElement | null>(null);
const expandedNames = ref<Set<string>>(new Set());
const openMenuName = ref<string | null>(null);

const editingName = ref<string | null>(null);
const showForm = ref(false);
const name = ref('');
const value = ref('');
const mode = ref<'saved' | 'prompt'>('saved');
const status = ref('');
const busy = ref(false);

const automaticVariables = [
  { name: 'Saudacao', description: 'Bom dia! / Boa tarde! / Boa noite! conforme o horário.' },
  { name: 'Data', description: 'Data atual no formato DD/MM/AAAA.' },
  { name: 'Hora', description: 'Horário atual no formato HH:mm.' },
];

const canReorder = computed(() => !searchQuery.value.trim() && modeFilter.value === 'all');

const filteredCustom = computed(() => {
  if (modeFilter.value === 'auto') return [];
  const q = searchQuery.value.trim().toLowerCase();
  return variables.value.filter((item) => {
    if (modeFilter.value !== 'all' && item.mode !== modeFilter.value) return false;
    if (!q) return true;
    return `${item.name} ${item.value}`.toLowerCase().includes(q);
  });
});

const filteredAutomatic = computed(() => {
  if (modeFilter.value === 'saved' || modeFilter.value === 'prompt') return [];
  const q = searchQuery.value.trim().toLowerCase();
  return automaticVariables.filter(
    (item) => !q || `${item.name} ${item.description}`.toLowerCase().includes(q),
  );
});

async function persistOrder() {
  try {
    variables.value = await saveVariables(variables.value, variablesBase);
    rememberBase();
    emit('changed');
  } catch (error) {
    status.value = error instanceof Error ? error.message : 'Falha ao salvar ordem.';
    variables.value = await loadVariables();
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
} = useListReorder<TemplateVariable>({
  items: variables,
  getId: (v) => v.name,
  getLabel: (v) => `{{${v.name}}}`,
  canReorder,
  listRef,
  onPersist: persistOrder,
});

function token(variableName: string) {
  return `{{${variableName}}}`;
}

function toggleExpand(key: string) {
  const next = new Set(expandedNames.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  expandedNames.value = next;
}

function toggleMenu(key: string) {
  openMenuName.value = openMenuName.value === key ? null : key;
}

function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  if (openMenuName.value && (!target || !target.closest('.card-more-wrapper'))) {
    openMenuName.value = null;
  }
}

onMounted(async () => {
  document.addEventListener('click', handleClickOutside);
  try {
    variables.value = await loadVariables();
    rememberBase();
  } catch (error) {
    status.value = error instanceof Error ? error.message : 'Falha ao carregar variáveis.';
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

function startEdit(variable?: TemplateVariable) {
  openMenuName.value = null;
  editingName.value = variable?.name || null;
  name.value = variable?.name || '';
  value.value = variable?.value || '';
  mode.value = variable?.mode || 'saved';
  status.value = '';
  showForm.value = true;
}

async function save() {
  if (busy.value) return;
  busy.value = true;
  try {
    const updated = { name: name.value, value: value.value, mode: mode.value };
    const next = editingName.value
      ? variables.value.map((variable) => (variable.name === editingName.value ? updated : variable))
      : [...variables.value, updated];
    variables.value = await saveVariables(next, variablesBase);
    rememberBase();
    showForm.value = false;
    status.value = 'Variável salva.';
    emit('changed');
  } catch (error) {
    status.value = error instanceof Error ? error.message : 'Falha ao salvar variável.';
  } finally {
    busy.value = false;
  }
}

async function remove(variable: TemplateVariable) {
  openMenuName.value = null;
  if (busy.value) return;
  busy.value = true;
  try {
    variables.value = await saveVariables(
      variables.value.filter((item) => item.name !== variable.name),
      variablesBase,
    );
    rememberBase();
    status.value = 'Variável removida.';
    emit('changed');
  } catch (error) {
    status.value = error instanceof Error ? error.message : 'Falha ao remover variável.';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="management-shell" aria-label="Variáveis">
    <div class="management-subbar">
      <button
        type="button"
        class="management-back-btn"
        :aria-label="showForm ? 'Voltar para a lista de variáveis' : 'Voltar para a tela anterior'"
        @click="goBack"
      >
        <ArrowLeft :size="15" />
      </button>
      <h2>
        {{ showForm ? (editingName ? 'Editar variável' : 'Nova variável') : 'Variáveis' }}
      </h2>
      <button
        v-if="!showForm"
        type="button"
        class="management-add-btn"
        title="Nova variável"
        aria-label="Nova variável"
        @click="startEdit()"
      >
        <Plus :size="14" :stroke-width="2.3" />
      </button>
    </div>

    <form v-if="showForm" class="management-form-wrap" @submit.prevent="save">
      <div class="management-form-group">
        <label>Nome da variável</label>
        <input v-model="name" type="text" required placeholder="Assinatura" />
      </div>
      <p v-if="editingName && name.trim() !== editingName" class="management-help">
        Atualize os tokens das mensagens para usar o novo nome.
      </p>
      <div class="management-form-group">
        <label>Preenchimento</label>
        <select v-model="mode">
          <option value="saved">Valor salvo</option>
          <option value="prompt">Preencher ao usar</option>
        </select>
      </div>
      <div v-if="mode === 'saved'" class="management-form-group">
        <label>Valor</label>
        <textarea
          v-model="value"
          required
          rows="3"
          placeholder="Texto que substituirá a variável"
        ></textarea>
      </div>
      <p v-else class="management-help">
        O valor será solicitado ao usar uma resposta com esta variável.
      </p>
      <div class="management-form-actions">
        <button type="button" class="btn-secondary" @click="showForm = false">
          Cancelar
        </button>
        <button type="submit" class="btn-primary" :disabled="busy">
          Salvar variável
        </button>
      </div>
    </form>

    <template v-else>
      <div class="management-search-box">
        <div class="management-search-wrapper">
          <Search :size="14" class="management-search-icon" />
          <input
            v-model="searchQuery"
            type="search"
            placeholder="Buscar variável..."
          />
        </div>
        <div class="management-filter">
          <select v-model="modeFilter" aria-label="Filtrar por tipo de variável">
            <option value="all">Todos os tipos</option>
            <option value="saved">Valor salvo</option>
            <option value="prompt">Ao usar</option>
            <option value="auto">Automáticas</option>
          </select>
        </div>
      </div>

      <div ref="listRef" class="management-scroll">
        <span class="sr-only" aria-live="polite">{{ liveAnnouncement }}</span>

        <div
          v-for="variable in filteredCustom"
          :key="variable.name"
          :data-reorder-id="variable.name"
          class="template-card"
          :class="{
            'is-expanded': expandedNames.has(variable.name),
            'is-dragging': draggingId === variable.name,
            'is-keyboard-grabbed': keyboardGrabbedId === variable.name,
            'has-open-menu': openMenuName === variable.name,
          }"
        >
          <div class="card-header">
            <button
              v-if="canReorder"
              type="button"
              class="drag-handle"
              :aria-label="`Reordenar ${token(variable.name)}. Pressione Espaço ou Enter para pegar, setas para mover.`"
              :aria-pressed="keyboardGrabbedId === variable.name"
              title="Arraste para reordenar (ou Espaço + setas)"
              @pointerdown="onHandlePointerDown($event, variable.name)"
              @keydown="onHandleKeydown($event, variable.name)"
              @blur="onHandleBlur(variable.name)"
            >
              <GripVertical :size="14" :stroke-width="2" aria-hidden="true" />
            </button>

            <button
              type="button"
              class="card-expand-trigger"
              :aria-expanded="expandedNames.has(variable.name)"
              @click="toggleExpand(variable.name)"
            >
              <ChevronRight
                :size="14"
                :stroke-width="2"
                class="card-chevron"
                :class="{ expanded: expandedNames.has(variable.name) }"
              />
              <span class="card-title">{{ token(variable.name) }}</span>
              <span
                class="card-badge"
                :class="{ 'card-badge-accent': variable.mode === 'prompt' }"
              >
                {{ variable.mode === 'saved' ? 'Salva' : 'Ao usar' }}
              </span>
            </button>

            <div class="card-menu">
              <div class="card-more-wrapper">
                <button
                  type="button"
                  class="btn-icon"
                  :class="{ active: openMenuName === variable.name }"
                  :aria-label="'Mais ações de ' + variable.name"
                  @click.stop="toggleMenu(variable.name)"
                >
                  <MoreHorizontal :size="14" :stroke-width="2" />
                </button>
                <transition name="menu-scale">
                  <div v-if="openMenuName === variable.name" class="card-dropdown-menu">
                    <button type="button" class="menu-item" @click="startEdit(variable)">
                      <Pencil :size="13" class="menu-item-icon" />
                      <span class="menu-item-text">Editar</span>
                    </button>
                    <button
                      type="button"
                      class="menu-item menu-item-danger"
                      :disabled="busy"
                      @click="remove(variable)"
                    >
                      <Trash2 :size="13" class="menu-item-icon" />
                      <span class="menu-item-text">Excluir</span>
                    </button>
                  </div>
                </transition>
              </div>
            </div>
          </div>

          <p v-if="keyboardGrabbedId === variable.name" class="reorder-key-hint" aria-hidden="true">
            Setas para mover · Espaço para soltar · Esc para cancelar
          </p>

          <div v-if="expandedNames.has(variable.name)" class="card-body">
            {{ variable.mode === 'saved' ? variable.value : 'Solicita preenchimento ao inserir a resposta.' }}
          </div>
        </div>

        <p
          v-if="!filteredCustom.length && !filteredAutomatic.length"
          class="management-empty"
        >
          Nenhuma variável corresponde aos filtros.
        </p>

        <template v-if="filteredAutomatic.length">
          <div class="management-section-label">Automáticas do sistema</div>
          <div
            v-for="auto in filteredAutomatic"
            :key="auto.name"
            class="template-card"
            :class="{ 'is-expanded': expandedNames.has('auto:' + auto.name) }"
          >
            <div class="card-header">
              <button
                type="button"
                class="card-expand-trigger"
                :aria-expanded="expandedNames.has('auto:' + auto.name)"
                @click="toggleExpand('auto:' + auto.name)"
              >
                <ChevronRight
                  :size="14"
                  :stroke-width="2"
                  class="card-chevron"
                  :class="{ expanded: expandedNames.has('auto:' + auto.name) }"
                />
                <span class="card-title">{{ token(auto.name) }}</span>
                <span class="card-badge">Automática</span>
              </button>
            </div>
            <div v-if="expandedNames.has('auto:' + auto.name)" class="card-body">
              {{ auto.description }}
            </div>
          </div>
        </template>
      </div>
    </template>

    <p v-if="status" class="management-status-inline" role="status">{{ status }}</p>
  </section>
</template>
