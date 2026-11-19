<script setup lang="ts">
import { RotateCcw } from 'lucide-vue-next';

defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  cancel: [];
  confirm: [];
}>();
</script>

<template>
  <transition name="fade">
    <div v-if="open" class="modal-backdrop" @click.self="emit('cancel')">
      <div class="notion-modal">
        <div class="notion-modal-header">
          <div class="modal-icon-badge">
            <RotateCcw :size="16" :stroke-width="2" />
          </div>
          <h3 class="modal-title">Restaurar modelos padrão?</h3>
        </div>
        <p class="modal-body">
          Os modelos padrão originais serão restabelecidos. <strong>Seus modelos personalizados criados manualmente serão mantidos</strong>.
        </p>
        <div class="modal-actions">
          <button type="button" class="btn-secondary" @click="emit('cancel')">
            Cancelar
          </button>
          <button type="button" class="btn-primary" @click="emit('confirm')">
            Restaurar
          </button>
        </div>
      </div>
    </div>
  </transition>
</template>
