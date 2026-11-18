<script setup lang="ts">
import {
  ChevronRight,
  GripVertical,
  Copy,
  Send,
  Loader2,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-vue-next';
import type { QuickReplyTemplate } from '@/types/template';

defineProps<{
  template: QuickReplyTemplate;
  tagNames: string[];
  canReorder: boolean;
  expanded: boolean;
  isDragging: boolean;
  isKeyboardGrabbed: boolean;
  hasOpenMenu: boolean;
  isSending: boolean;
}>();

const emit = defineEmits<{
  toggleExpand: [];
  toggleMenu: [];
  closeMenu: [];
  copy: [];
  send: [];
  edit: [];
  remove: [];
  pointerDownHandle: [event: PointerEvent];
  keydownHandle: [event: KeyboardEvent];
  blurHandle: [];
}>();
</script>

<template>
  <div
    :data-template-id="template.id"
    class="template-card"
    :class="{
      'is-expanded': expanded,
      'is-dragging': isDragging,
      'is-keyboard-grabbed': isKeyboardGrabbed,
      'has-open-menu': hasOpenMenu,
    }"
  >
    <div class="card-header">
      <button
        v-if="canReorder"
        type="button"
        class="drag-handle"
        :aria-label="`Reordenar ${template.title}. Pressione Espaço ou Enter para pegar, setas para mover.`"
        :aria-pressed="isKeyboardGrabbed"
        title="Arraste para reordenar (ou Espaço + setas)"
        @pointerdown="emit('pointerDownHandle', $event)"
        @keydown="emit('keydownHandle', $event)"
        @blur="emit('blurHandle')"
      >
        <GripVertical :size="14" :stroke-width="2" aria-hidden="true" />
      </button>

      <button
        type="button"
        class="card-expand-trigger"
        :aria-expanded="expanded"
        :title="expanded ? 'Recolher modelo' : template.title"
        @click="emit('toggleExpand')"
      >
        <ChevronRight :size="14" :stroke-width="2" class="card-chevron" :class="{ expanded }" />
        <span class="card-title">{{ template.title }}</span>
        <span v-if="tagNames.length && !expanded" class="card-badge card-badge-compact">
          {{ tagNames.join(', ') }}
        </span>
      </button>

      <div class="card-menu">
        <template v-if="!expanded">
          <button
            type="button"
            class="btn-icon-quick"
            title="Copiar para área de transferência"
            aria-label="Copiar mensagem"
            @click="emit('copy')"
          >
            <Copy :size="13" :stroke-width="1.9" />
          </button>
          <button
            type="button"
            class="btn-icon-quick btn-icon-send"
            :disabled="isSending"
            title="Inserir diretamente no ticket em foco"
            aria-label="Inserir no ticket"
            @click="emit('send')"
          >
            <Loader2 v-if="isSending" :size="13" class="spin-icon" />
            <Send v-else :size="13" :stroke-width="2" />
          </button>
        </template>

        <div class="card-more-wrapper">
          <button
            type="button"
            class="btn-icon card-more-trigger"
            :class="{ active: hasOpenMenu }"
            title="Mais ações"
            aria-label="Mais ações do modelo"
            @click.stop="emit('toggleMenu')"
          >
            <MoreHorizontal :size="14" :stroke-width="2" />
          </button>

          <transition name="menu-scale">
            <div v-if="hasOpenMenu" class="card-dropdown-menu">
              <button
                type="button"
                class="menu-item"
                @click="emit('closeMenu'); emit('edit')"
              >
                <Pencil :size="13" class="menu-item-icon" />
                <span class="menu-item-text">Editar</span>
              </button>
              <button
                type="button"
                class="menu-item menu-item-danger"
                @click="emit('closeMenu'); emit('remove')"
              >
                <Trash2 :size="13" class="menu-item-icon" />
                <span class="menu-item-text">Excluir</span>
              </button>
            </div>
          </transition>
        </div>
      </div>
    </div>

    <p v-if="isKeyboardGrabbed" class="reorder-key-hint" aria-hidden="true">
      Setas para mover · Espaço para soltar · Esc para cancelar
    </p>

    <div v-if="expanded" class="card-body">
      <div v-if="tagNames.length" class="card-meta">
        <span v-for="tagName in tagNames" :key="tagName" class="card-badge">{{ tagName }}</span>
      </div>

      <p class="card-preview-expanded">{{ template.content }}</p>

      <div class="card-actions">
        <button
          type="button"
          class="btn-action btn-copy"
          title="Copiar para área de transferência"
          @click="emit('copy')"
        >
          <Copy :size="13" :stroke-width="1.8" />
          <span>Copiar</span>
        </button>
        <button
          type="button"
          class="btn-action btn-send"
          :disabled="isSending"
          title="Inserir diretamente no ticket em foco"
          @click="emit('send')"
        >
          <Loader2 v-if="isSending" :size="13" class="spin-icon" />
          <Send v-else :size="13" :stroke-width="2" />
          <span>{{ isSending ? 'Inserindo...' : 'Inserir no Ticket' }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.template-card {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 7px 9px;
  background: #ffffff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
  scroll-margin: 12px;
  transition: transform 0.15s, box-shadow 0.15s, border-color 0.15s;
}

.template-card.is-expanded {
  padding: 9px 10px 10px 10px;
}

.template-card.has-open-menu {
  position: relative;
  z-index: 30;
}

.template-card:hover {
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.07);
  border-color: #cbd5e1;
}

.template-card:has(.drag-handle:focus-visible) {
  outline: 2px solid #ffc600;
  outline-offset: 1px;
}

.template-card.is-dragging {
  position: relative;
  z-index: 20;
  transform: scale(1.015);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.14);
  border-color: #e0af00;
  pointer-events: none;
  transition: none;
}

.template-card.is-keyboard-grabbed {
  border-color: #e0af00;
  box-shadow: 0 6px 16px rgba(255, 198, 0, 0.25);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  margin-bottom: 0;
}

.template-card.is-expanded .card-header {
  align-items: flex-start;
  margin-bottom: 6px;
}

.drag-handle {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 22px;
  margin-left: -3px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #5b5f63;
  opacity: 0.45;
  cursor: grab;
  touch-action: none;
  -webkit-user-select: none;
  user-select: none;
  transition: opacity 0.15s, background-color 0.15s, color 0.15s;
}

.drag-handle:is(:hover, :focus-visible) {
  opacity: 1;
  color: #1c1b1c;
  background: #f1f5f9;
  outline: none;
}

.drag-handle[aria-pressed='true'] {
  opacity: 1;
  color: #1c1b1c;
  background: rgba(255, 198, 0, 0.28);
}

.reorder-key-hint {
  margin: 4px 0 4px 0;
  font-size: 10px;
  font-weight: 500;
  color: #7c6200;
}

.card-expand-trigger {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 4px 2px 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  color: var(--text-primary);
}

.card-expand-trigger:focus-visible {
  outline: 2px solid #ffc600;
  outline-offset: 1px;
}

.card-chevron {
  flex-shrink: 0;
  color: #8a8f96;
  transition: transform 0.15s ease, color 0.15s ease;
}

.card-expand-trigger:hover .card-chevron {
  color: #3c3f43;
}

.card-chevron.expanded {
  transform: rotate(90deg);
  color: #1c1b1c;
}

.card-title {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.template-card.is-expanded .card-title {
  white-space: normal;
  overflow: visible;
  text-overflow: clip;
  line-height: 1.35;
}

.card-badge {
  font-size: 10px;
  padding: 2px 8px;
  background: rgba(60, 63, 67, 0.08);
  color: #3c3f43;
  border-radius: 12px;
  border: 1px solid #dee0e4;
  font-weight: 500;
  white-space: nowrap;
}

.card-badge-compact {
  flex-shrink: 0;
  max-width: 68px;
  padding: 1px 6px;
  font-size: 9.5px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-menu {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 3px;
}

.btn-icon-quick {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid #dee0e4;
  border-radius: 5px;
  background: #f7f8f9;
  color: #3c3f43;
  cursor: pointer;
  transition: background-color 0.15s, border-color 0.15s, transform 0.12s;
}

.btn-icon-quick:hover:not(:disabled) {
  background: #eceef0;
  border-color: #cbd5e1;
}

.btn-icon-quick.btn-icon-send {
  background: #ffc600;
  color: #1c1b1c;
  border-color: #e5b100;
}

.btn-icon-quick.btn-icon-send:hover:not(:disabled) {
  background: #f0ba00;
  transform: translateY(-0.5px);
}

.btn-icon-quick:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.card-more-wrapper {
  position: relative;
}

.card-more-trigger.active {
  background: #f1f5f9;
  color: #1c1b1c;
}

.card-dropdown-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  width: 132px;
  background: #ffffff;
  border: 1px solid #dee0e4;
  border-radius: 7px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.05);
  padding: 4px;
  z-index: 40;
  transform-origin: top right;
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

.menu-item-danger {
  color: #ba1a1a;
}

.menu-item-danger .menu-item-icon {
  color: #ba1a1a;
}

.menu-item-danger:hover {
  background: #fee2e2;
}

.btn-icon {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  color: #5b5f63;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: color 0.15s, background 0.15s;
}

.btn-icon:hover {
  color: #1c1b1c;
  background: #f1f5f9;
}

.card-body {
  padding-top: 4px;
  border-top: 1px solid #f0f1f3;
}

.card-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
  margin-bottom: 6px;
}

.card-preview-expanded {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: pre-line;
  line-height: 1.45;
  margin: 0 0 10px 0;
  max-height: 180px;
  overflow-y: auto;
}

.card-actions {
  display: flex;
  gap: 8px;
}

.btn-action {
  flex: 1;
  padding: 6px 10px;
  border-radius: 5px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
}

.btn-action:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-copy {
  background: #f7f8f9;
  color: #3c3f43;
  border: 1px solid #dee0e4;
}

.btn-copy:hover:not(:disabled) {
  background: #eceef0;
}

.btn-send {
  background: #ffc600;
  color: #1c1b1c;
  border: 1px solid #e5b100;
  font-weight: 700;
}

.btn-send:hover:not(:disabled) {
  background: #f0ba00;
  transform: translateY(-1px);
  box-shadow: 0 2px 6px rgba(255, 198, 0, 0.4);
}
</style>
