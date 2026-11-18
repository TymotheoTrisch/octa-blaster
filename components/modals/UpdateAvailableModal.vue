<script setup lang="ts">
import { Sparkles, ExternalLink } from 'lucide-vue-next';
import type { UpdateInfo } from '@/services/updates/updateChecker';

defineProps<{
  open: boolean;
  updateInfo: UpdateInfo | null;
}>();

const emit = defineEmits<{
  close: [];
  openRelease: [];
}>();
</script>

<template>
  <transition name="fade">
    <div v-if="open && updateInfo" class="modal-backdrop" @click.self="emit('close')">
      <div class="notion-modal">
        <div class="notion-modal-header">
          <div class="modal-icon-badge modal-icon-update">
            <Sparkles :size="16" :stroke-width="2" />
          </div>
          <h3 class="modal-title">Nova versão disponível!</h3>
        </div>
        <p class="modal-body">
          O <strong>OctaBlaster v{{ updateInfo.latestVersion }}</strong> já está disponível no GitHub. Você está atualmente utilizando a versão <strong>v{{ updateInfo.currentVersion }}</strong>.
        </p>
        <div v-if="updateInfo.releaseNotes" class="modal-notes-preview">
          {{ updateInfo.releaseNotes }}
        </div>
        <div class="modal-actions">
          <button type="button" class="btn-secondary" @click="emit('close')">
            Mais tarde
          </button>
          <button type="button" class="btn-primary btn-update-action" @click="emit('openRelease')">
            <ExternalLink :size="13" :stroke-width="2" />
            <span>Ver Release</span>
          </button>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.modal-icon-update {
  background: rgba(255, 198, 0, 0.25);
  color: #1c1b1c;
}

.modal-notes-preview {
  font-size: 11px;
  line-height: 1.4;
  color: #5b5f63;
  background: #f7f8f9;
  border: 1px solid #dee0e4;
  border-radius: 6px;
  padding: 8px;
  max-height: 80px;
  overflow-y: auto;
  white-space: pre-line;
}

.btn-update-action {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
</style>
