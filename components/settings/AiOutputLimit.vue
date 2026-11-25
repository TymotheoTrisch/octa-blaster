<script setup lang="ts">
import { computed } from 'vue';
import type { AiProvider, AiProviderConfig } from '@/types/ai';
const props=defineProps<{ connection: AiProviderConfig; provider: AiProvider; disabled?: boolean }>();
const mode=computed({
  get:()=>props.connection.maxOutputTokens===null?'provider':props.connection.maxOutputTokens===undefined?'extension':'custom',
  set:(value:string)=>{props.connection.maxOutputTokens=value==='provider'?null:value==='custom'?8192:undefined;},
});
</script>
<template>
  <div class="ai-field">
    <label for="ai-output-mode">Limite de tokens de saída</label>
    <select id="ai-output-mode" v-model="mode" :disabled="disabled">
      <option value="extension">Padrão da extensão</option>
      <option value="custom">Definir limite</option>
      <option value="provider" :disabled="provider==='claude'">Sem limite definido pela extensão</option>
    </select>
  </div>
  <div v-if="mode==='custom'" class="ai-field">
    <label for="ai-output-tokens">Máximo de tokens por resposta</label>
    <input id="ai-output-tokens" v-model.number="connection.maxOutputTokens" type="number" min="1" max="1048576" step="1" placeholder="8192" :disabled="disabled">
  </div>
  <p v-if="mode==='provider'" class="ai-help">Usa o padrão da API. Não significa geração infinita: os limites do modelo, custos e tempo de espera continuam valendo.</p>
  <p v-else-if="mode==='custom'" class="ai-help">Inclui raciocínio quando a API o contabiliza na saída. Um teto maior permite mais geração, tempo e consumo. O valor aceito depende do modelo.</p>
  <p v-else class="ai-help">768 tokens para resumir mensagem, 1.536 para ticket e 2.048 para perguntas e sugestões.</p>
  <p v-if="provider==='claude'" class="ai-help">A API Claude exige um limite explícito.</p>
</template>
