<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ArrowLeft, Plus, Pencil, Trash2 } from 'lucide-vue-next';
import {
  loadVariables,
  saveVariables,
  type TemplateVariable,
} from '@/utils/templateVariables';
import './management.css';
const emit = defineEmits<{ back: []; changed: [] }>();
const variables = ref<TemplateVariable[]>([]);
const editingName = ref<string | null>(null);
const showForm = ref(false);
const name = ref('');
const value = ref('');
const mode = ref<'saved' | 'prompt'>('saved');
const status = ref('');
const busy = ref(false);
const automaticVariables = ['Saudacao', 'Data', 'Hora'];
function token(name: string) {
  return '{{' + name + '}}';
}
onMounted(async () => {
  try {
    variables.value = await loadVariables();
  } catch (error) {
    status.value =
      error instanceof Error ? error.message : 'Falha ao carregar variáveis.';
  }
});
function startEdit(variable?: TemplateVariable) {
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
      ? variables.value.map((variable) =>
          variable.name === editingName.value ? updated : variable,
        )
      : [...variables.value, updated];
    await saveVariables(next);
    variables.value = await loadVariables();
    showForm.value = false;
    status.value = 'Variável salva.';
    emit('changed');
  } catch (error) {
    status.value =
      error instanceof Error ? error.message : 'Falha ao salvar variável.';
  } finally {
    busy.value = false;
  }
}
async function remove(variable: TemplateVariable) {
  if (busy.value) return;
  busy.value = true;
  try {
    await saveVariables(
      variables.value.filter((item) => item.name !== variable.name),
    );
    variables.value = await loadVariables();
    status.value = 'Variável removida.';
    emit('changed');
  } catch (error) {
    status.value =
      error instanceof Error ? error.message : 'Falha ao remover variável.';
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <section class="management-page" aria-label="Variáveis">
    <div class="management-heading">
      <button
        type="button"
        class="management-icon"
        aria-label="Voltar para mensagens"
        @click="emit('back')"
      >
        <ArrowLeft :size="16" />
      </button>
      <h2>
        {{
          showForm
            ? editingName
              ? 'Editar variável'
              : 'Nova variável'
            : 'Variáveis'
        }}
      </h2>
      <button
        v-if="!showForm"
        type="button"
        class="management-primary"
        aria-label="Nova variável"
        @click="startEdit()"
      >
        <Plus :size="14" />
      </button>
    </div>
    <form v-if="showForm" class="management-form" @submit.prevent="save">
      <label
        >Nome da variável<input
          v-model="name"
          type="text"
          required
          placeholder="Assinatura"
      /></label>
      <p
        v-if="editingName && name.trim() !== editingName"
        class="management-help"
      >
        Atualize os tokens das mensagens para usar o novo nome.
      </p>
      <label
        >Preenchimento<select v-model="mode">
          <option value="saved">Valor salvo</option>
          <option value="prompt">Preencher ao usar</option>
        </select></label
      >
      <label v-if="mode === 'saved'"
        >Valor<textarea
          v-model="value"
          required
          rows="3"
          placeholder="Texto que substituirá a variável"
        ></textarea>
      </label>
      <p v-else class="management-help">
        O valor será solicitado ao usar uma resposta com esta variável.
      </p>
      <div class="management-actions">
        <button
          type="button"
          class="management-secondary"
          @click="showForm = false"
        >
          Cancelar</button
        ><button type="submit" class="management-primary" :disabled="busy">
          Salvar variável
        </button>
      </div>
    </form>
    <template v-else>
      <article
        v-for="variable in variables"
        :key="variable.name"
        class="management-card"
      >
        <div class="management-card-header">
          <h3>{{ token(variable.name) }}</h3>
          <button
            type="button"
            class="management-icon"
            :aria-label="'Editar ' + variable.name"
            @click="startEdit(variable)"
          >
            <Pencil :size="14" /></button
          ><button
            type="button"
            class="management-icon"
            :aria-label="'Excluir ' + variable.name"
            :disabled="busy"
            @click="remove(variable)"
          >
            <Trash2 :size="14" />
          </button>
        </div>
        <p>
          {{ variable.mode === 'saved' ? variable.value : 'Preencher ao usar' }}
        </p>
      </article>
      <p v-if="!variables.length" class="management-empty">
        Cadastre variáveis para reutilizar valores nas mensagens.
      </p>
      <article
        v-for="automatic in automaticVariables"
        :key="automatic"
        class="management-card"
      >
        <div class="management-card-header">
          <h3>{{ token(automatic) }}</h3>
          <span class="management-badge">Automática</span>
        </div>
      </article>
    </template>
    <p v-if="status" class="management-status" role="status">{{ status }}</p>
  </section>
</template>
