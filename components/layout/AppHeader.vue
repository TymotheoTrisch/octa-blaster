<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import {
  MoreHorizontal,
  SquarePen,
  PanelRight,
  Braces,
  Tags,
  Keyboard,
  Users,
  Sparkles,
  Download,
  Upload,
  RotateCcw,
  RefreshCw,
  Github,
  MessageSquarePlus,
} from 'lucide-vue-next';

export type PopupView = 'templates' | 'variables' | 'tags' | 'shortcuts' | 'technicians' | 'ai';

defineProps<{
  isSidebar: boolean;
  showNewButton: boolean;
  canOpenSidebar: boolean;
  isCheckingUpdate: boolean;
}>();

const emit = defineEmits<{
  create: [];
  openSidebar: [];
  navigate: [view: PopupView];
  exportBackup: [];
  importBackup: [];
  resetDefaults: [];
  checkUpdates: [];
  openGithub: [];
  openDiscussions: [];
}>();

const isMenuOpen = ref(false);
const menuRef = ref<HTMLElement | null>(null);

function closeMenu() {
  isMenuOpen.value = false;
}

function toggleMenu() {
  isMenuOpen.value = !isMenuOpen.value;
}

function trigger(action: () => void) {
  closeMenu();
  action();
}

function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  if (menuRef.value && (!target || !menuRef.value.contains(target))) {
    closeMenu();
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && isMenuOpen.value) {
    closeMenu();
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
  document.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
  document.removeEventListener('keydown', handleKeydown);
});

defineExpose({ closeMenu });
</script>

<template>
  <header class="header" :class="{ 'is-sidebar': isSidebar }">
    <div class="brand" :class="{ 'is-sidebar': isSidebar }">
      <svg class="brand-logo" viewBox="0 0 498.69 498.69" width="20" height="20" fill="#ffc600" aria-label="OctaBlaster">
        <path d="M6.14,102C11.14,49.59,49.47,10.93,101.89,6,137.18,2.69,185.36,0,249.34,0s114.33,2.76,149.83,6.18c51.07,4.92,88.41,42.26,93.34,93.34,3.42,35.5,6.18,84.39,6.18,149.83s-2.76,114.32-6.18,149.82c-4.93,51.08-42.27,88.42-93.34,93.34-35.5,3.42-84.4,6.18-149.83,6.18s-112.16-2.63-147.45-6c-52.42-4.93-90.73-43.59-95.75-96C2.74,361.07,0,312.69,0,249.3S2.72,137.57,6.14,102m392.8,209.12c-3.01-11.83-15.03-18.98-26.86-16-6.28,1.42-12.77,1.74-19.16,.93-15.58-1.65-36-16.44-39.76-37.9-1.09-12.34,4.58-21.56,11.24-31.43,9-13.28,17.33-29.82,17.33-51.11,0-47.74-43.63-90.33-92.34-90.33s-93.78,39.72-93.78,90.28c0,21.29,9.82,37.83,18.82,51.11,6.66,9.88,12.33,19.08,11.24,31.43-1.08,17.13-24.21,36.25-39.76,37.9-6.39,.81-12.88,.49-19.16-.93-11.84-3.01-23.88,4.15-26.89,15.99h0c-1.43,5.69-.54,11.71,2.47,16.73,3.02,5.03,7.92,8.66,13.61,10.08,7.41,1.82,15.02,2.72,22.65,2.68,4.01,0,8.02-.22,12-.65,9.92-.9,19.58-3.65,28.48-8.11,5.4-1.37,10.41-3.95,14.65-7.55,2.42-1.88,4-3.09,5.28-2.21,3,2,2.76,4.6,1.58,7.5-.26,.58-.53,1.16-.81,1.73-.92,1.67-1.92,3.29-3,4.85-.63,.94-1.23,1.84-1.73,2.65-2.89,4.73-.49,1.07,4-5.91-1.8,3.46-3.85,6.79-6.14,9.95-9,12.35-16.76,21.68-23.8,28.54-6.41,6.23-8.42,15.71-5.08,24,4.62,11.35,17.56,16.81,28.92,12.19,2.64-1.07,5.04-2.64,7.08-4.62,8.85-8.63,18.26-19.8,28.7-34.2,8.75-12.12,15.27-25.7,19.26-40.11,.64-.84,1.51-1.47,2.51-1.8,3.95,15.06,10.65,29.27,19.75,41.91,10.48,14.4,19.86,25.57,28.71,34.2,8.71,8.55,22.71,8.41,31.26-.3s8.41-22.71-.31-31.25c-7-6.86-14.82-16.19-23.8-28.54-4.56-6.33-8.18-13.29-10.74-20.66,.44-.77,1.06-1.43,1.81-1.91,1.33-.86,2.87,.35,5.27,2.22,3.96,3.36,8.58,5.84,13.57,7.29,8.7,5.2,19.1,8.8,32.23,10.19,3.99,.43,7.99,.65,12,.65,7.63,.04,15.24-.86,22.65-2.68,8.69-2.16,15.22-9.36,16.52-18.22,.42-2.88,.26-5.81-.47-8.62v.05Zm-141.94-122c0,14.66,7.93,18.34,17.72,18.34s17.69-3.69,17.69-18.34-8-21.44-17.82-21.44-17.59,6.74-17.59,21.4v.04Zm-52.67,0c0,14.53,7.85,18.11,17.54,18.11s17.53-3.59,17.53-18.11-7.92-21.2-17.66-21.2-17.41,6.64-17.41,21.16v.04Z" />
      </svg>
      <h1 v-if="!isSidebar" class="brand-title">OctaBlaster</h1>
    </div>

    <div class="header-actions">
      <button
        v-if="showNewButton"
        type="button"
        class="btn-primary-icon"
        title="Novo modelo de resposta"
        aria-label="Novo modelo de resposta"
        @click="emit('create')"
      >
        <SquarePen :size="15" :stroke-width="2.2" />
      </button>

      <div ref="menuRef" class="options-menu-wrapper">
        <button
          type="button"
          class="btn-options-trigger"
          :class="{ active: isMenuOpen }"
          title="Mais opções"
          aria-label="Mais opções"
          @click.stop="toggleMenu"
        >
          <MoreHorizontal :size="17" :stroke-width="2" />
        </button>

        <transition name="menu-scale">
          <div v-if="isMenuOpen" class="notion-dropdown-menu">
            <template v-if="canOpenSidebar">
              <div class="menu-section">
                <button
                  type="button"
                  class="menu-item"
                  @click="trigger(() => emit('openSidebar'))"
                >
                  <PanelRight :size="14" class="menu-item-icon" />
                  <span class="menu-item-text">Abrir no Painel Lateral</span>
                </button>
              </div>
              <div class="menu-divider"></div>
            </template>

            <div class="menu-section">
              <button type="button" class="menu-item" @click="trigger(() => emit('navigate', 'variables'))">
                <Braces :size="14" class="menu-item-icon" />
                <span class="menu-item-text">Variáveis</span>
              </button>
              <button type="button" class="menu-item" @click="trigger(() => emit('navigate', 'tags'))">
                <Tags :size="14" class="menu-item-icon" />
                <span class="menu-item-text">Tags</span>
              </button>
              <button type="button" class="menu-item" @click="trigger(() => emit('navigate', 'shortcuts'))">
                <Keyboard :size="14" class="menu-item-icon" />
                <span class="menu-item-text">Atalhos</span>
              </button>
              <button type="button" class="menu-item" @click="trigger(() => emit('navigate', 'technicians'))">
                <Users :size="14" class="menu-item-icon" />
                <span class="menu-item-text">Técnicos (Licenças)</span>
              </button>
              <button type="button" class="menu-item" @click="trigger(() => emit('navigate', 'ai'))"><Sparkles :size="14" class="menu-item-icon" /><span class="menu-item-text">Inteligência artificial</span></button>
            </div>

            <div class="menu-divider"></div>

            <div class="menu-section">
              <button type="button" class="menu-item" @click="trigger(() => emit('exportBackup'))">
                <Download :size="14" class="menu-item-icon" />
                <span class="menu-item-text">Exportar backup completo (JSON)</span>
              </button>
              <button type="button" class="menu-item" @click="trigger(() => emit('importBackup'))">
                <Upload :size="14" class="menu-item-icon" />
                <span class="menu-item-text">Importar backup ou modelos (JSON)</span>
              </button>
            </div>

            <div class="menu-divider"></div>

            <div class="menu-section">
              <button type="button" class="menu-item" @click="trigger(() => emit('resetDefaults'))">
                <RotateCcw :size="14" class="menu-item-icon" />
                <span class="menu-item-text">Restaurar modelos padrão</span>
              </button>
            </div>

            <div class="menu-divider"></div>

            <div class="menu-section">
              <button
                type="button"
                class="menu-item"
                :disabled="isCheckingUpdate"
                @click="trigger(() => emit('checkUpdates'))"
              >
                <RefreshCw :size="14" class="menu-item-icon" :class="{ 'spin-icon': isCheckingUpdate }" />
                <span class="menu-item-text">{{ isCheckingUpdate ? 'Verificando...' : 'Verificar atualizações' }}</span>
              </button>
              <button type="button" class="menu-item" @click="trigger(() => emit('openGithub'))">
                <Github :size="14" class="menu-item-icon" />
                <span class="menu-item-text">Repositório no GitHub</span>
              </button>
              <button type="button" class="menu-item" @click="trigger(() => emit('openDiscussions'))">
                <MessageSquarePlus :size="14" class="menu-item-icon" />
                <span class="menu-item-text">Sugerir melhorias (Discussions)</span>
              </button>
            </div>
          </div>
        </transition>
      </div>
    </div>
  </header>
</template>

<style scoped>
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background: #1c1b22;
  color: #ffffff;
  border-bottom: 1px solid #32313c;
  min-height: 40px;
  box-sizing: border-box;
}

.header.is-sidebar {
  justify-content: space-between;
  padding: 6px 12px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  user-select: none;
}

.brand-logo {
  flex-shrink: 0;
  display: block;
}

.brand-title {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: -0.2px;
  color: #ffffff;
  margin: 0;
  line-height: 1;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.btn-primary-icon {
  background: #ffc600;
  color: #1c1b1c;
  border: 1px solid #e0af00;
  width: 28px;
  height: 28px;
  border-radius: 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
  flex-shrink: 0;
}

.btn-primary-icon:hover {
  background: #f0ba00;
  transform: translateY(-1px);
  box-shadow: 0 2px 6px rgba(255, 198, 0, 0.35);
}

.btn-primary-icon:active {
  transform: translateY(0);
}

.options-menu-wrapper {
  position: relative;
}

.btn-options-trigger {
  background: transparent;
  color: #dee0e4;
  border: 1px solid rgba(255, 255, 255, 0.15);
  width: 28px;
  height: 28px;
  border-radius: 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-options-trigger:hover,
.btn-options-trigger.active {
  background: rgba(255, 255, 255, 0.16);
  color: #ffffff;
  border-color: rgba(255, 255, 255, 0.3);
}

.notion-dropdown-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  width: 240px;
  background: #ffffff;
  border: 1px solid #dee0e4;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.05);
  padding: 4px;
  z-index: 100;
  transform-origin: top right;
}

.menu-section {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.menu-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: transparent;
  border: none;
  border-radius: 5px;
  font-size: 12px;
  color: #1c1b1c;
  cursor: pointer;
  text-align: left;
  transition: background 0.12s ease;
}

.menu-item:hover {
  background: #f1f2f4;
}

.menu-item-icon {
  flex-shrink: 0;
  color: #5b5f63;
}

.menu-item-text {
  flex: 1;
  font-size: 12px;
  font-weight: 500;
}

.menu-divider {
  height: 1px;
  background: #f0f1f3;
  margin: 4px 2px;
}
</style>
