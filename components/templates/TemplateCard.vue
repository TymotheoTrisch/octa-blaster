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
import type { TemplateTag } from '@/services/storage/templateTagSchema';
import { computeTagBadgeVars } from '@/services/appearance/themeTokens';

defineProps<{
  template: QuickReplyTemplate;
  templateTags: TemplateTag[];
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
        <span
          v-if="templateTags.length && !expanded"
          class="card-badge card-badge-compact"
          :class="{ 'tag-badge-colored': Boolean(templateTags[0]?.color) }"
          :style="computeTagBadgeVars(templateTags[0]?.color)"
        >
          {{ templateTags.map((tag) => tag.name).join(', ') }}
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
      <div v-if="templateTags.length" class="card-meta">
        <span
          v-for="tag in templateTags"
          :key="tag.id"
          class="card-badge"
          :class="{ 'tag-badge-colored': Boolean(tag.color) }"
          :style="computeTagBadgeVars(tag.color)"
        >
          {{ tag.name }}
        </span>
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
  background: var(--bg-surface);
  box-shadow: var(--shadow-card);
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
  box-shadow: var(--shadow-card-hover);
  border-color: var(--border-hover);
}

.template-card:has(.drag-handle:focus-visible) {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.template-card.is-dragging {
  position: relative;
  z-index: 20;
  transform: scale(1.015);
  box-shadow: var(--shadow-drag);
  border-color: var(--accent-border);
  pointer-events: none;
  transition: none;
}

.template-card.is-keyboard-grabbed {
  border-color: var(--accent-border);
  box-shadow: 0 6px 16px var(--accent-soft);
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
  color: var(--text-muted);
  opacity: 0.45;
  cursor: grab;
  touch-action: none;
  -webkit-user-select: none;
  user-select: none;
  transition: opacity 0.15s, background-color 0.15s, color 0.15s;
}

.drag-handle:is(:hover, :focus-visible) {
  opacity: 1;
  color: var(--text-primary);
  background: var(--bg-hover);
  outline: none;
}

.drag-handle[aria-pressed='true'] {
  opacity: 1;
  color: var(--accent-soft-text);
  background: var(--accent-soft);
}

.reorder-key-hint {
  margin: 4px 0 4px 0;
  font-size: 10px;
  font-weight: 500;
  color: var(--accent-soft-text);
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
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.card-chevron {
  flex-shrink: 0;
  color: var(--text-subtle);
  transition: transform 0.15s ease, color 0.15s ease;
}

.card-expand-trigger:hover .card-chevron {
  color: var(--text-secondary);
}

.card-chevron.expanded {
  transform: rotate(90deg);
  color: var(--text-primary);
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
  background: var(--bg-badge);
  color: var(--text-secondary);
  border-radius: 12px;
  border: 1px solid var(--border);
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
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  cursor: pointer;
  transition: background-color 0.15s, border-color 0.15s, transform 0.12s;
}

.btn-icon-quick:hover:not(:disabled) {
  background: var(--bg-hover-strong);
  border-color: var(--border-hover);
  color: var(--text-primary);
}

.btn-icon-quick.btn-icon-send {
  background: var(--accent);
  color: var(--accent-text);
  border-color: var(--accent-border);
}

.btn-icon-quick.btn-icon-send:hover:not(:disabled) {
  background: var(--accent-hover);
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
  background: var(--bg-hover);
  color: var(--text-primary);
}

.card-dropdown-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  width: 132px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 7px;
  box-shadow: var(--shadow-popover);
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
  color: var(--text-primary);
  cursor: pointer;
  text-align: left;
  transition: background 0.12s ease;
}

.menu-item:hover {
  background: var(--bg-hover);
}

.menu-item-icon {
  flex-shrink: 0;
  color: var(--text-muted);
}

.menu-item-text {
  flex: 1;
  font-size: 12px;
  font-weight: 500;
}

.menu-item-danger {
  color: var(--danger);
}

.menu-item-danger .menu-item-icon {
  color: var(--danger);
}

.menu-item-danger:hover {
  background: var(--danger-soft);
}

.btn-icon {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  color: var(--text-muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: color 0.15s, background 0.15s;
}

.btn-icon:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.card-body {
  padding-top: 4px;
  border-top: 1px solid var(--border-divider);
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
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  border: 1px solid var(--border);
}

.btn-copy:hover:not(:disabled) {
  background: var(--bg-hover-strong);
  color: var(--text-primary);
}

.btn-send {
  background: var(--accent);
  color: var(--accent-text);
  border: 1px solid var(--accent-border);
  font-weight: 700;
}

.btn-send:hover:not(:disabled) {
  background: var(--accent-hover);
  transform: translateY(-1px);
  box-shadow: 0 2px 6px var(--accent-glow);
}
</style>
