<script setup lang="ts">
import { computed } from 'vue';
import type { AiPanelState } from '@/types/aiPanel';
const props = defineProps<{ state: AiPanelState | null }>();
const label = computed(() => props.state?.kind === 'general' ? 'Conversa livre'
  : props.state?.contextSource === 'saved' ? 'Dados salvos do ticket' : 'Ticket aberto');
const updated = computed(() => props.state?.contextUpdatedAt
  ? new Date(props.state.contextUpdatedAt).toLocaleString('pt-BR') : '');
</script>
<template>
  <p v-if="state" class="ai-context-status" :title="state.contextSource === 'saved' ? 'Consulta a base local deste ticket, sem ler a aba atual.' : undefined">
    {{ label }}<span v-if="state.contextSource === 'saved' && updated"> · {{ updated }}</span>
  </p>
</template>
<style scoped>
.ai-context-status{margin:4px 0 0;font:10px/1.4 system-ui;color:var(--text-muted);overflow-wrap:anywhere}
</style>
