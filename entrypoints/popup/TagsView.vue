<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ArrowLeft, Plus, Pencil, Trash2 } from 'lucide-vue-next';
import { loadTags, saveTags, type TemplateTag } from '@/utils/templateTags';
import './management.css';
const emit = defineEmits<{ back: []; changed: [] }>();
const tags = ref<TemplateTag[]>([]);
let tagsBase: TemplateTag[] = [];
function rememberBase() {
  tagsBase = structuredClone(tags.value.map((tag) => ({ ...tag })));
}
const editingId = ref<string | null>(null);
const showForm = ref(false);
const name = ref('');
const status = ref('');
const busy = ref(false);
onMounted(async () => {
  try {
    tags.value = await loadTags();
    rememberBase();
  } catch (error) {
    status.value =
      error instanceof Error ? error.message : 'Falha ao carregar tags.';
  }
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
  editingId.value = tag?.id || null;
  name.value = tag?.name || '';
  status.value = '';
  showForm.value = true;
}
async function save() {
  if (busy.value) return;
  busy.value = true;
  try {
    const updated = {
      id: editingId.value || crypto.randomUUID(),
      name: name.value,
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
    status.value =
      error instanceof Error ? error.message : 'Falha ao salvar tag.';
  } finally {
    busy.value = false;
  }
}
async function remove(tag: TemplateTag) {
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
    status.value =
      error instanceof Error ? error.message : 'Falha ao remover tag.';
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <section class="management-page" aria-label="Tags">
    <div class="management-heading">
      <button
        type="button"
        class="management-icon"
        :aria-label="showForm ? 'Voltar para a lista de tags' : 'Voltar para a tela anterior'"
        @click="goBack"
      >
        <ArrowLeft :size="16" />
      </button>
      <h2>{{ showForm ? (editingId ? 'Editar tag' : 'Nova tag') : 'Tags' }}</h2>
      <button
        v-if="!showForm"
        type="button"
        class="management-primary"
        aria-label="Nova tag"
        @click="startEdit()"
      >
        <Plus :size="14" />
      </button>
    </div>
    <form v-if="showForm" class="management-form" @submit.prevent="save">
      <label
        >Nome da tag<input
          v-model="name"
          type="text"
          required
          maxlength="40"
          placeholder="Suporte"
      /></label>
      <div class="management-actions">
        <button
          type="button"
          class="management-secondary"
          @click="showForm = false"
        >
          Cancelar</button
        ><button type="submit" class="management-primary" :disabled="busy">
          Salvar tag
        </button>
      </div>
    </form>
    <template v-else>
      <p class="management-help">
        As tags organizam e filtram as mensagens. Excluir uma tag remove sua
        associação às mensagens.
      </p>
      <article v-for="tag in tags" :key="tag.id" class="management-card">
        <div class="management-card-header">
          <h3>{{ tag.name }}</h3>
          <button
            type="button"
            class="management-icon"
            :aria-label="'Editar ' + tag.name"
            @click="startEdit(tag)"
          >
            <Pencil :size="14" /></button
          ><button
            type="button"
            class="management-icon"
            :aria-label="'Excluir ' + tag.name"
            :disabled="busy"
            @click="remove(tag)"
          >
            <Trash2 :size="14" />
          </button>
        </div>
      </article>
      <p v-if="!tags.length" class="management-empty">
        Cadastre a primeira tag para organizar suas mensagens.
      </p>
    </template>
    <p v-if="status" class="management-status" role="status">{{ status }}</p>
  </section>
</template>
