<script setup lang="ts">
import { ref } from 'vue';

defineProps<{
  appVersion: string;
  repoUrl: string;
}>();

const emit = defineEmits<{
  fileSelected: [event: Event];
}>();

const fileInputRef = ref<HTMLInputElement | null>(null);

function triggerFilePicker() {
  fileInputRef.value?.click();
}

defineExpose({ triggerFilePicker });
</script>

<template>
  <footer class="footer">
    <a
      :href="repoUrl"
      target="_blank"
      rel="noopener noreferrer"
      class="build-version-link"
      title="Abrir repositório no GitHub"
    >
      OctaBlaster v{{ appVersion }}
    </a>
    <input
      ref="fileInputRef"
      type="file"
      accept="application/json,.json"
      style="display: none"
      @change="emit('fileSelected', $event)"
    />
  </footer>
</template>

<style scoped>
.footer {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px 14px;
  background: var(--bg-secondary);
  border-top: 1px solid var(--border);
  min-height: 30px;
}

.build-version-link {
  font-size: 11px;
  font-weight: 500;
  color: #8a8f96;
  letter-spacing: 0.02em;
  text-decoration: none;
  padding: 2px 6px;
  border-radius: 4px;
  transition: color 0.15s ease, background-color 0.15s ease;
}

.build-version-link:hover {
  color: #3c3f43;
  background-color: rgba(60, 63, 67, 0.06);
}

.build-version-link:focus-visible {
  outline: 2px solid #ffc600;
  outline-offset: 1px;
  color: #1c1b1c;
}
</style>
