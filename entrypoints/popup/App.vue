<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import type { QuickReplyTemplate, InsertMessageResponse } from '@/types/template';
import type { LicenseTicketInfo } from '@/utils/licenseDetector';
import { prepareTemplate, loadVariables } from '@/utils/templateVariables';
import { type TemplateVariable } from '@/utils/settingsSchema';
import { loadSettings } from '@/utils/settingsStorage';
import packageInfo from '../../package.json';
import { loadTags } from '@/utils/templateTags';
import { getTemplateTagIds, getTemplateTagNames, type TemplateTag } from '@/utils/templateTagSchema';
import VariablesView from './VariablesView.vue';
import TagsView from './TagsView.vue';
import ShortcutsView from './ShortcutsView.vue';
import { loadStoredTemplates, saveStoredTemplates, resetToDefaultTemplates, exportTemplatesToJson, parseTemplateBackup, mergeImportedTemplates } from '@/utils/templateStorage';
import {
  MoreHorizontal,
  Plus,
  SquarePen,
  Search,
  Pencil,
  Trash2,
  Copy,
  Send,
  Loader2,
  X,
  PanelRight,
  Download,
  Upload,
  RotateCcw,
  Tag,
  CheckCircle2,
  AlertCircle,
  Info,
  RefreshCw,
  Sparkles,
  ExternalLink,
  GripVertical,
  Github,
  MessageSquarePlus,
  ChevronRight,
  Braces,
  Tags,
  Keyboard,
} from 'lucide-vue-next';
import { checkGithubRelease, type UpdateInfo } from '@/utils/updateChecker';
import { useTemplateReorder } from '@/utils/useTemplateReorder';

const detectedLicense = ref<LicenseTicketInfo | null>(null);
const isAutomatingLicense = ref(false);

const templates = ref<QuickReplyTemplate[]>([]);
let templatesBase: QuickReplyTemplate[] = [];
function rememberTemplatesBase() { templatesBase = JSON.parse(JSON.stringify(templates.value)); }
const searchQuery = ref('');
const showForm = ref(false);
const editingId = ref<string | null>(null);

const formTitle = ref('');
const formTags = ref<string[]>([]);
const tags = ref<TemplateTag[]>([]);
const variables = ref<TemplateVariable[]>([]);
const selectedTagId = ref('');
type View = 'templates' | 'variables' | 'tags' | 'shortcuts';
const currentView = ref<View>('templates');
const viewHistory: View[] = [];
const tagPicker = ref<HTMLDetailsElement | null>(null);
const contentTextarea = ref<HTMLTextAreaElement | null>(null);
let contentSelection = { start: 0, end: 0 };
const variableTokens = computed(() => {
  const names = ['Saudacao', 'Data', 'Hora', ...variables.value.map(variable => variable.name)];
  return names.map(name => ({ name, token: '{{' + name + '}}' }));
});
async function refreshCatalogs() {
  try {
    tags.value = await loadTags();
    variables.value = await loadVariables();
    formTags.value = formTags.value.filter(id => tags.value.some(tag => tag.id === id));
    if (!tags.value.some(tag => tag.id === selectedTagId.value)) selectedTagId.value = '';
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Falha ao carregar configurações.', 'error');
  }
}
async function refreshTagsAndTemplates() {
  await refreshCatalogs();
  await loadTemplates();
}
function openView(view: View) {
  closeMenu();
  closeCardMenu();
  if (tagPicker.value) tagPicker.value.open = false;
  statusMessage.value = '';
  if (currentView.value !== view) viewHistory.push(currentView.value);
  currentView.value = view;
}
function returnToPreviousView() {
  currentView.value = viewHistory.pop() || 'templates';
  void refreshCatalogs();
}
function rememberContentSelection() {
  const textarea = contentTextarea.value;
  if (textarea) {
    contentSelection = { start: textarea.selectionStart, end: textarea.selectionEnd };
  }
}
const formContent = ref('');

const isSending = ref(false);
const statusType = ref<'success' | 'error' | 'info'>('info');
const statusMessage = ref('');
let statusTimeout: number | undefined;

const isMenuOpen = ref(false);
const menuRef = ref<HTMLElement | null>(null);
const expandedIds = ref<Set<string>>(new Set());
const openCardMenuId = ref<string | null>(null);
const showConfirmResetModal = ref(false);
const appVersion = ref(packageInfo.version);

const GITHUB_REPO_URL = 'https://github.com/luizGDpulz/octa-blaster';
const GITHUB_DISCUSSIONS_URL = 'https://github.com/luizGDpulz/octa-blaster/discussions';

function openExternalUrl(url: string) {
  if (browser?.tabs?.create) {
    browser.tabs.create({ url });
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

function openGithubRepo() {
  openExternalUrl(GITHUB_REPO_URL);
}

function openGithubDiscussions() {
  openExternalUrl(GITHUB_DISCUSSIONS_URL);
}

const isSidebar = computed(() => {
  if (typeof window === 'undefined') return false;
  return window.location.href.includes('sidepanel') || window.location.pathname.includes('sidepanel');
});

const isCheckingUpdate = ref(false);
const updateInfo = ref<UpdateInfo | null>(null);
const showUpdateModal = ref(false);

async function checkForUpdates() {
  if (isCheckingUpdate.value) return;
  isCheckingUpdate.value = true;
  setStatus('Verificando atualizações no GitHub...', 'info');

  try {
    const res = await checkGithubRelease(appVersion.value);
    if (res.hasUpdate) {
      updateInfo.value = res;
      showUpdateModal.value = true;
      setStatus(`Nova versão v${res.latestVersion} disponível!`, 'info');
    } else {
      setStatus(`Você já está na versão mais recente (v${appVersion.value})!`, 'success');
    }
  } catch (err: any) {
    console.error('Falha ao verificar atualizações:', err);
    setStatus(err.message || 'Não foi possível verificar atualizações.', 'error');
  } finally {
    isCheckingUpdate.value = false;
  }
}

function openUpdateRelease() {
  if (updateInfo.value?.releaseUrl) {
    browser.tabs.create({ url: updateInfo.value.releaseUrl });
    showUpdateModal.value = false;
  }
}

function setStatus(msg: string, type: 'success' | 'error' | 'info' = 'info') {
  statusMessage.value = msg;
  statusType.value = type;
  if (statusTimeout) clearTimeout(statusTimeout);
  statusTimeout = window.setTimeout(() => {
    statusMessage.value = '';
  }, 3500);
}

async function loadTemplates() {
  try {
    templates.value = await loadStoredTemplates();
    rememberTemplatesBase();
  } catch (err) {
    console.error('Erro ao carregar modelos:', err);
    setStatus('Falha ao carregar modelos salvos', 'error');
  }
}

async function saveTemplates() {
  try {
    templates.value = await saveStoredTemplates(templates.value, templatesBase);
    rememberTemplatesBase();
  } catch (err: any) {
    console.error('Erro ao persistir modelos:', err);
    await loadTemplates();
    setStatus(err?.message || 'Erro ao salvar no armazenamento', 'error');
    throw err;
  }
}

function requestResetDefaults() {
  showConfirmResetModal.value = true;
}

function cancelResetDefaults() {
  showConfirmResetModal.value = false;
}

async function confirmResetDefaults() {
  showConfirmResetModal.value = false;
  try {
    templates.value = await resetToDefaultTemplates(templates.value, templatesBase);
    rememberTemplatesBase();
    setStatus('Modelos padrão restaurados! Seus modelos manuais foram mantidos.', 'success');
  } catch (err) {
    console.error('Erro ao restaurar padrões:', err);
    setStatus('Erro ao restaurar modelos padrão.', 'error');
  }
}

const fileInputRef = ref<HTMLInputElement | null>(null);

async function exportTemplates() {
  try {
    await exportTemplatesToJson();
    setStatus('Backup completo exportado com sucesso!', 'success');
  } catch (err: any) {
    console.error('Erro ao exportar modelos:', err);
    setStatus(err?.message || 'Falha ao exportar modelos.', 'error');
  }
}

function triggerImport() {
  fileInputRef.value?.click();
}

async function handleFileImport(e: Event) {
  const target = e.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  try {
    const settingsBase = await loadSettings();
    const text = await file.text();
    const imported = parseTemplateBackup(text);
    const { count, merged } = await mergeImportedTemplates(templates.value, imported.templates, templatesBase, imported.tags, imported.settings, settingsBase);
    templates.value = merged;
    rememberTemplatesBase();
    await refreshCatalogs();
    setStatus(imported.settings ? `Backup restaurado: ${count} mensagem(ns) e configurações.` : `${count} modelo(s) importado(s) com sucesso!`, 'success');
  } catch (err: any) {
    console.error('Erro ao importar modelos:', err);
    setStatus(err?.message || 'Erro ao processar arquivo JSON.', 'error');
  } finally {
    target.value = '';
  }
}

function startCreate() {
  editingId.value = null;
  formTitle.value = '';
  formTags.value = [];
  contentSelection = { start: 0, end: 0 };
  formContent.value = '';
  showForm.value = true;
}

function startEdit(template: QuickReplyTemplate) {
  editingId.value = template.id;
  formTitle.value = template.title;
  formTags.value = getTemplateTagIds(template, tags.value);
  contentSelection = { start: template.content.length, end: template.content.length };
  formContent.value = template.content;
  showForm.value = true;
}

function cancelForm() {
  showForm.value = false;
  editingId.value = null;
}

async function submitForm() {
  const title = formTitle.value.trim();
  const content = formContent.value.trim();
  const selectedTags = formTags.value.filter(id => tags.value.some(tag => tag.id === id));

  if (!title || !content) {
    setStatus('Preencha o título e a mensagem.', 'error');
    return;
  }

  try {
    if (editingId.value) {
      const currentId = editingId.value;
      const idx = templates.value.findIndex((t) => t.id === currentId);
      if (idx !== -1) {
        const updatedItem: QuickReplyTemplate = {
          id: currentId,
          title,
          content,
          updatedAt: Date.now(),
        };
        updatedItem.tags = [...selectedTags];
        templates.value[idx] = updatedItem;
      }
    } else {
      const newTemplate: QuickReplyTemplate = {
        id: typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `tpl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        title,
        content,
        updatedAt: Date.now(),
      };
      newTemplate.tags = [...selectedTags];
      templates.value.unshift(newTemplate);
    }

    await saveTemplates();
    setStatus(editingId.value ? 'Modelo atualizado com sucesso!' : 'Novo modelo criado!', 'success');
    cancelForm();
  } catch (err: any) {
    console.error('Falha ao submeter formulário:', err);
    // Não fecha o formulário se houver erro para que o usuário não perca seu texto digitado
  }
}

async function removeTemplate(id: string) {
  try {
    templates.value = templates.value.filter((t) => t.id !== id);
    await saveTemplates();
    setStatus('Modelo removido.', 'info');
  } catch (err) {
    console.error('Falha ao remover modelo:', err);
  }
}

async function insertIntoTicket(template: QuickReplyTemplate) {
  if (isSending.value) return;
  isSending.value = true;

  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      setStatus('Aba do navegador não encontrada.', 'error');
      return;
    }

    const target = await browser.runtime.sendMessage({ action: 'CAPTURE_EDITOR', tabId: tab.id });
    if (!target?.success) { setStatus('Clique primeiro no campo de resposta do ticket.', 'error'); return; }
    const processedContent = await prepareTemplate(template.content);
    if (processedContent === null) return;
    const res = (await browser.runtime.sendMessage({ action: 'ROUTE_TICKET_ACTION', tabId: tab.id, expectedToken: target.editorToken, request: {
      action: 'INSERT_REPLY',
      requestId,
      content: processedContent,
    } })) as InsertMessageResponse | undefined;

    if (res?.success) {
      setStatus('Texto inserido com sucesso!', 'success');
    } else {
      setStatus(res?.error || 'Clique primeiro no campo de texto do ticket.', 'error');
    }
  } catch (error) {
    console.error('Falha de comunicação com a aba:', error);
    setStatus('Recarregue a página do ticket e tente novamente.', 'error');
  } finally {
    setTimeout(() => {
      isSending.value = false;
    }, 600);
  }
}

async function copyToClipboard(template: QuickReplyTemplate) {
  try {
    const processedContent = await prepareTemplate(template.content);
    if (processedContent === null) return;
    await navigator.clipboard.writeText(processedContent);
    setStatus('Copiado para a área de transferência!', 'success');
  } catch {
    setStatus('Falha ao copiar texto.', 'error');
  }
}

async function insertVariable(token: string) {
  const textarea = contentTextarea.value;
  if (textarea && document.activeElement === textarea) rememberContentSelection();
  const start = Math.min(contentSelection.start, formContent.value.length);
  const end = Math.min(contentSelection.end, formContent.value.length);
  formContent.value = formContent.value.slice(0, start) + token + formContent.value.slice(end);
  const caret = start + token.length;
  contentSelection = { start: caret, end: caret };
  await nextTick();
  textarea?.focus();
  textarea?.setSelectionRange(caret, caret);
}

const filteredTemplates = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  return templates.value.filter(template => {
    const matchesTag = !selectedTagId.value || getTemplateTagIds(template, tags.value).includes(selectedTagId.value);
    const searchable = [template.title, template.content, ...getTemplateTagNames(template, tags.value)].join(' ').toLowerCase();
    return matchesTag && (!query || searchable.includes(query));
  });
});

const templatesListRef = ref<HTMLElement | null>(null);
const canReorder = computed(() => !searchQuery.value.trim() && !selectedTagId.value);

const {
  draggingId,
  keyboardGrabbedId,
  liveAnnouncement,
  onHandlePointerDown,
  onHandleKeydown,
  onHandleBlur,
} = useTemplateReorder({
  templates,
  canReorder,
  listRef: templatesListRef,
  onPersist: saveTemplates,
});

async function checkLicenseStatus() {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      const res = (await browser.runtime.sendMessage({ action: 'ROUTE_TICKET_ACTION', tabId: tab.id, request: {
        action: 'CHECK_LICENSE_TICKET',
      } })) as InsertMessageResponse | undefined;
      if (res?.success && res.data && res.data.isLicenseTicket) {
        detectedLicense.value = res.data;
      }
    }
  } catch {}
}

async function triggerLicenseMentions() {
  if (isAutomatingLicense.value) return;
  isAutomatingLicense.value = true;
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      setStatus('Aba do navegador não encontrada.', 'error');
      return;
    }

    const res = (await browser.runtime.sendMessage({ action: 'ROUTE_TICKET_ACTION', tabId: tab.id, request: {
      action: 'AUTOMATE_LICENSE_MENTIONS',
      force: false,
    } })) as InsertMessageResponse | undefined;

    if (res?.success) {
      setStatus('Responsáveis de licenças marcados em Anotação Interna!', 'success');
    } else {
      setStatus(res?.error || 'Erro ao marcar responsáveis.', 'error');
    }
  } catch (error) {
    console.error('Falha ao acionar automação de licenças:', error);
    setStatus('Recarregue a página do ticket e tente novamente.', 'error');
  } finally {
    isAutomatingLicense.value = false;
  }
}

const canOpenSidebar = ref(false);

async function checkSidebarSupport() {
  try {
    const b = browser as any;
    const c = (globalThis as any).chrome;

    if (b?.sidebarAction?.open && typeof b.sidebarAction.open === 'function') {
      canOpenSidebar.value = true;
      return;
    }

    if (c?.sidePanel?.open && typeof c.sidePanel.open === 'function') {
      canOpenSidebar.value = true;
      return;
    }
  } catch (err) {
    console.warn('Erro ao checar suporte a painel lateral:', err);
  }
}

async function openSidebarPanel() {
  try {
    const b = browser as any;
    const c = (globalThis as any).chrome;

    // 1. Suporte ao Firefox (sidebar_action)
    if (b?.sidebarAction?.open && typeof b.sidebarAction.open === 'function') {
      await b.sidebarAction.open();
      window.close();
      return;
    }

    // 2. Suporte ao Chromium MV3 (side_panel)
    if (c?.sidePanel?.open && typeof c.sidePanel.open === 'function') {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab?.windowId) {
        await c.sidePanel.open({ windowId: tab.windowId });
        window.close();
        return;
      }
    }
  } catch (err) {
    console.warn('Não foi possível abrir painel lateral programaticamente:', err);
    setStatus('Não foi possível abrir o painel lateral.', 'error');
  }
}

function isExpanded(id: string): boolean {
  return expandedIds.value.has(id);
}

function toggleExpand(id: string) {
  const next = new Set(expandedIds.value);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  expandedIds.value = next;
}

function toggleCardMenu(id: string) {
  closeMenu();
  openCardMenuId.value = openCardMenuId.value === id ? null : id;
}

function closeCardMenu() {
  openCardMenuId.value = null;
}

function toggleMenu() {
  closeCardMenu();
  isMenuOpen.value = !isMenuOpen.value;
}

function closeMenu() {
  isMenuOpen.value = false;
}

function handleMenuAction(action: () => void | Promise<void>) {
  closeMenu();
  action();
}

function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  if (tagPicker.value && (!target || !tagPicker.value.contains(target))) {
    tagPicker.value.open = false;
  }
  if (menuRef.value && (!target || !menuRef.value.contains(target))) {
    closeMenu();
  }
  if (openCardMenuId.value && (!target || !target.closest('.card-more-wrapper'))) {
    closeCardMenu();
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    if (tagPicker.value) tagPicker.value.open = false;
    if (isMenuOpen.value) {
      closeMenu();
    }
    if (openCardMenuId.value) {
      closeCardMenu();
    }
    if (showConfirmResetModal.value) {
      cancelResetDefaults();
    }
    if (showUpdateModal.value) {
      showUpdateModal.value = false;
    }
  }
}

onMounted(() => {
  try {
    const manifest = browser?.runtime?.getManifest?.();
    if (manifest?.version) {
      appVersion.value = manifest.version;
    }
  } catch {}

  void loadTemplates().then(refreshCatalogs);
  checkLicenseStatus();
  checkSidebarSupport();

  document.addEventListener('click', handleClickOutside);
  document.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
  document.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <div class="popup-container">
    <!-- Header / Barra de Ferramentas Superior -->
    <header class="header" :class="{ 'is-sidebar': isSidebar }">
      <div class="brand" :class="{ 'is-sidebar': isSidebar }">
        <svg class="brand-logo" viewBox="0 0 498.69 498.69" width="20" height="20" fill="#ffc600" aria-label="OctaBlaster">
          <path d="M6.14,102C11.14,49.59,49.47,10.93,101.89,6,137.18,2.69,185.36,0,249.34,0s114.33,2.76,149.83,6.18c51.07,4.92,88.41,42.26,93.34,93.34,3.42,35.5,6.18,84.39,6.18,149.83s-2.76,114.32-6.18,149.82c-4.93,51.08-42.27,88.42-93.34,93.34-35.5,3.42-84.4,6.18-149.83,6.18s-112.16-2.63-147.45-6c-52.42-4.93-90.73-43.59-95.75-96C2.74,361.07,0,312.69,0,249.3S2.72,137.57,6.14,102m392.8,209.12c-3.01-11.83-15.03-18.98-26.86-16-6.28,1.42-12.77,1.74-19.16,.93-15.58-1.65-36-16.44-39.76-37.9-1.09-12.34,4.58-21.56,11.24-31.43,9-13.28,17.33-29.82,17.33-51.11,0-47.74-43.63-90.33-92.34-90.33s-93.78,39.72-93.78,90.28c0,21.29,9.82,37.83,18.82,51.11,6.66,9.88,12.33,19.08,11.24,31.43-1.08,17.13-24.21,36.25-39.76,37.9-6.39,.81-12.88,.49-19.16-.93-11.84-3.01-23.88,4.15-26.89,15.99h0c-1.43,5.69-.54,11.71,2.47,16.73,3.02,5.03,7.92,8.66,13.61,10.08,7.41,1.82,15.02,2.72,22.65,2.68,4.01,0,8.02-.22,12-.65,9.92-.9,19.58-3.65,28.48-8.11,5.4-1.37,10.41-3.95,14.65-7.55,2.42-1.88,4-3.09,5.28-2.21,3,2,2.76,4.6,1.58,7.5-.26,.58-.53,1.16-.81,1.73-.92,1.67-1.92,3.29-3,4.85-.63,.94-1.23,1.84-1.73,2.65-2.89,4.73-.49,1.07,4-5.91-1.8,3.46-3.85,6.79-6.14,9.95-9,12.35-16.76,21.68-23.8,28.54-6.41,6.23-8.42,15.71-5.08,24,4.62,11.35,17.56,16.81,28.92,12.19,2.64-1.07,5.04-2.64,7.08-4.62,8.85-8.63,18.26-19.8,28.7-34.2,8.75-12.12,15.27-25.7,19.26-40.11,.64-.84,1.51-1.47,2.51-1.8,3.95,15.06,10.65,29.27,19.75,41.91,10.48,14.4,19.86,25.57,28.71,34.2,8.71,8.55,22.71,8.41,31.26-.3s8.41-22.71-.31-31.25c-7-6.86-14.82-16.19-23.8-28.54-4.56-6.33-8.18-13.29-10.74-20.66,.44-.77,1.06-1.43,1.81-1.91,1.33-.86,2.87,.35,5.27,2.22,3.96,3.36,8.58,5.84,13.57,7.29,8.7,5.2,19.1,8.8,32.23,10.19,3.99,.43,7.99,.65,12,.65,7.63,.04,15.24-.86,22.65-2.68,8.69-2.16,15.22-9.36,16.52-18.22,.42-2.88,.26-5.81-.47-8.62v.05Zm-141.94-122c0,14.66,7.93,18.34,17.72,18.34s17.69-3.69,17.69-18.34-8-21.44-17.82-21.44-17.59,6.74-17.59,21.4v.04Zm-52.67,0c0,14.53,7.85,18.11,17.54,18.11s17.53-3.59,17.53-18.11-7.92-21.2-17.66-21.2-17.41,6.64-17.41,21.16v.04Z" />
        </svg>
        <h1 v-if="!isSidebar" class="brand-title">OctaBlaster</h1>
      </div>
      <div class="header-actions">
        <button
          v-if="currentView === 'templates' && !showForm"
          type="button"
          class="btn-primary-icon"
          title="Novo modelo de resposta"
          aria-label="Novo modelo de resposta"
          @click="startCreate"
        >
          <SquarePen :size="15" :stroke-width="2.2" />
        </button>

        <!-- Dropdown Menu Estilo Notion -->
        <div class="options-menu-wrapper" ref="menuRef">
          <button
            type="button"
            class="btn-options-trigger"
            :class="{ active: isMenuOpen }"
            title="Mais opções"
            aria-label="Mais opções"
            @click="toggleMenu"
          >
            <MoreHorizontal :size="17" :stroke-width="2" />
          </button>

          <transition name="menu-scale">
            <div v-if="isMenuOpen" class="notion-dropdown-menu">
              <div v-if="canOpenSidebar" class="menu-section">
                <button
                  type="button"
                  class="menu-item"
                  @click="handleMenuAction(openSidebarPanel)"
                >
                  <PanelRight :size="14" class="menu-item-icon" />
                  <span class="menu-item-text">Abrir no Painel Lateral</span>
                </button>
              </div>

              <div v-if="canOpenSidebar" class="menu-divider"></div>

              <div class="menu-section">
                <button type="button" class="menu-item" @click="openView('variables')">
                  <Braces :size="14" class="menu-item-icon" />
                  <span class="menu-item-text">Variáveis</span>
                </button>
                <button type="button" class="menu-item" @click="openView('tags')">
                  <Tags :size="14" class="menu-item-icon" />
                  <span class="menu-item-text">Tags</span>
                </button>
                <button type="button" class="menu-item" @click="openView('shortcuts')">
                  <Keyboard :size="14" class="menu-item-icon" />
                  <span class="menu-item-text">Atalhos</span>
                </button>
              </div>
              <div class="menu-divider"></div>
              <div class="menu-section">
                <button
                  type="button"
                  class="menu-item"
                  @click="handleMenuAction(exportTemplates)"
                >
                  <Download :size="14" class="menu-item-icon" />
                  <span class="menu-item-text">Exportar backup completo (JSON)</span>
                </button>
                <button
                  type="button"
                  class="menu-item"
                  @click="handleMenuAction(triggerImport)"
                >
                  <Upload :size="14" class="menu-item-icon" />
                  <span class="menu-item-text">Importar backup ou modelos (JSON)</span>
                </button>
              </div>

              <div class="menu-divider"></div>

              <div class="menu-section">
                <button
                  type="button"
                  class="menu-item"
                  @click="handleMenuAction(requestResetDefaults)"
                >
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
                  @click="handleMenuAction(checkForUpdates)"
                >
                  <RefreshCw :size="14" class="menu-item-icon" :class="{ 'spin-icon': isCheckingUpdate }" />
                  <span class="menu-item-text">{{ isCheckingUpdate ? 'Verificando...' : 'Verificar atualizações' }}</span>
                </button>
                <button
                  type="button"
                  class="menu-item"
                  @click="handleMenuAction(openGithubRepo)"
                >
                  <Github :size="14" class="menu-item-icon" />
                  <span class="menu-item-text">Repositório no GitHub</span>
                </button>
                <button
                  type="button"
                  class="menu-item"
                  @click="handleMenuAction(openGithubDiscussions)"
                >
                  <MessageSquarePlus :size="14" class="menu-item-icon" />
                  <span class="menu-item-text">Sugerir melhorias (Discussions)</span>
                </button>
              </div>
            </div>
          </transition>
        </div>
      </div>
    </header>


    <!-- Status Message Alert -->
    <transition name="fade">
      <div v-if="statusMessage" :class="['status-banner', `status-${statusType}`]">
        <span class="status-icon">
          <CheckCircle2 v-if="statusType === 'success'" :size="14" :stroke-width="2.2" />
          <AlertCircle v-else-if="statusType === 'error'" :size="14" :stroke-width="2.2" />
          <Info v-else :size="14" :stroke-width="2.2" />
        </span>
        <span class="status-text">{{ statusMessage }}</span>
      </div>
    </transition>

    <VariablesView v-if="currentView === 'variables'" @back="returnToPreviousView" @changed="refreshCatalogs" />
    <TagsView v-else-if="currentView === 'tags'" @back="returnToPreviousView" @changed="refreshTagsAndTemplates" />
    <ShortcutsView v-else-if="currentView === 'shortcuts'" @back="returnToPreviousView" @changed="refreshCatalogs" />
    <template v-else>
    <!-- Ação rápida de licenças -->
    <div v-if="detectedLicense" class="license-banner">
      <button
        class="btn-license-quick"
        :disabled="isAutomatingLicense"
        @click="triggerLicenseMentions"
      >
        <Loader2 v-if="isAutomatingLicense" :size="12" class="spin-icon" />
        <Tag v-else :size="12" :stroke-width="2" />
        <span>{{ isAutomatingLicense ? 'Marcando...' : 'Marcar Licenças' }}</span>
      </button>
    </div>

    <!-- Formulário de Criação/Edição -->
    <div v-if="showForm" class="form-container">
      <div class="form-header">
        <h2>{{ editingId ? 'Editar Modelo' : 'Novo Modelo de Resposta' }}</h2>
        <button class="btn-close" title="Fechar" @click="cancelForm">
          <X :size="15" :stroke-width="2" />
        </button>
      </div>

      <div class="form-group">
        <label>Título do Modelo</label>
        <input
          v-model="formTitle"
          type="text"
          placeholder="Ex: Cobrança de Retorno (2º e 4º dia)"
          maxlength="60"
        />
      </div>

      <fieldset class="message-tags-field">
        <legend>Tags</legend>
        <details ref="tagPicker" class="message-tag-picker">
          <summary aria-label="Selecionar tags da mensagem">
            <span>{{ tags.filter(tag => formTags.includes(tag.id)).map(tag => tag.name).join(', ') || 'Selecionar tags' }}</span>
            <ChevronRight :size="14" class="tag-picker-chevron" />
          </summary>
          <div class="message-tag-menu">
            <label v-for="tag in tags" :key="tag.id" class="message-tag-option">
              <input v-model="formTags" type="checkbox" :value="tag.id" />
              {{ tag.name }}
            </label>
            <p v-if="!tags.length" class="tag-hint">Cadastre tags para organizar suas mensagens.</p>
            <button type="button" class="tag-picker-manage" @click="openView('tags')">Gerenciar tags</button>
          </div>
        </details>
      </fieldset>

      <div class="form-group">
        <div class="label-with-tags">
          <label>Mensagem da Resposta</label>
          <div class="quick-tags">
            <span class="tag-hint">Inserir variável</span>
            <button
              v-for="variable in variableTokens"
              :key="variable.name"
              type="button"
              class="tag-btn"
              :class="{ 'tag-btn-highlight': variable.name === 'Saudacao' }"
              :aria-label="'Inserir ' + variable.token"
              @mousedown.prevent
              @click="insertVariable(variable.token)"
            >
              {{ variable.token }}
            </button>
          </div>
        </div>
        <textarea
          ref="contentTextarea"
          v-model="formContent"
          aria-label="Mensagem da Resposta"
          @select="rememberContentSelection"
          @keyup="rememberContentSelection"
          @click="rememberContentSelection"
          @input="rememberContentSelection"
          @blur="rememberContentSelection"
          rows="6"
          placeholder="Escreva a resposta pronta aqui... Use {{Saudacao}} para Bom dia / Boa tarde automático!"
        ></textarea>
      </div>

      <div class="form-actions">
        <button type="button" class="btn-secondary" @click="cancelForm">
          Cancelar
        </button>
        <button type="button" class="btn-primary" @click="submitForm">
          {{ editingId ? 'Salvar Alterações' : 'Criar Modelo' }}
        </button>
      </div>
    </div>

    <!-- Lista de Modelos Salvos -->
    <div v-else class="list-container">
      <!-- Barra de Busca -->
      <div class="search-box">
        <div class="search-input-wrapper">
          <Search :size="14" class="search-input-icon" />
          <input
            v-model="searchQuery"
            type="search"
            placeholder="Buscar por título ou conteúdo..."
          />
        </div>
        <div class="tag-filter">
          <label for="tag-filter" class="sr-only">Filtrar por tag</label>
          <select id="tag-filter" v-model="selectedTagId" aria-label="Filtrar por tag">
            <option value="">Todas as tags</option>
            <option v-for="tag in tags" :key="tag.id" :value="tag.id">{{ tag.name }}</option>
          </select>
        </div>
      </div>
      <div ref="templatesListRef" class="templates-scroll">
        <span class="sr-only" aria-live="polite">{{ liveAnnouncement }}</span>

        <div v-if="filteredTemplates.length === 0" class="empty-state">
          <p v-if="searchQuery || selectedTagId">Nenhum modelo corresponde aos filtros.</p>
          <p v-else>Nenhum modelo cadastrado. Clique em "Novo" ou abra as opções para restaurar os padrões.</p>
        </div>

        <div
          v-for="tpl in filteredTemplates"
          :key="tpl.id"
          :data-template-id="tpl.id"
          class="template-card"
          :class="{
            'is-expanded': isExpanded(tpl.id),
            'is-dragging': draggingId === tpl.id,
            'is-keyboard-grabbed': keyboardGrabbedId === tpl.id,
            'has-open-menu': openCardMenuId === tpl.id,
          }"
        >
          <div class="card-header">
            <button
              v-if="canReorder"
              type="button"
              class="drag-handle"
              :aria-label="`Reordenar ${tpl.title}. Pressione Espaço ou Enter para pegar, setas para mover.`"
              :aria-pressed="keyboardGrabbedId === tpl.id"
              title="Arraste para reordenar (ou Espaço + setas)"
              @pointerdown="onHandlePointerDown($event, tpl.id)"
              @keydown="onHandleKeydown($event, tpl.id)"
              @blur="onHandleBlur(tpl.id)"
            >
              <GripVertical :size="14" :stroke-width="2" aria-hidden="true" />
            </button>

            <button
              type="button"
              class="card-expand-trigger"
              :aria-expanded="isExpanded(tpl.id)"
              :title="isExpanded(tpl.id) ? 'Recolher modelo' : tpl.title"
              @click="toggleExpand(tpl.id)"
            >
              <ChevronRight :size="14" :stroke-width="2" class="card-chevron" :class="{ expanded: isExpanded(tpl.id) }" />
              <span class="card-title">{{ tpl.title }}</span>
              <span v-if="getTemplateTagNames(tpl, tags).length && !isExpanded(tpl.id)" class="card-badge card-badge-compact">{{ getTemplateTagNames(tpl, tags).join(', ') }}</span>
            </button>

            <div class="card-menu">
              <template v-if="!isExpanded(tpl.id)">
                <button
                  type="button"
                  class="btn-icon-quick"
                  title="Copiar para área de transferência"
                  aria-label="Copiar mensagem"
                  @click="copyToClipboard(tpl)"
                >
                  <Copy :size="13" :stroke-width="1.9" />
                </button>
                <button
                  type="button"
                  class="btn-icon-quick btn-icon-send"
                  :disabled="isSending"
                  title="Inserir diretamente no ticket em foco"
                  aria-label="Inserir no ticket"
                  @click="insertIntoTicket(tpl)"
                >
                  <Loader2 v-if="isSending" :size="13" class="spin-icon" />
                  <Send v-else :size="13" :stroke-width="2" />
                </button>
              </template>

              <div class="card-more-wrapper">
                <button
                  type="button"
                  class="btn-icon card-more-trigger"
                  :class="{ active: openCardMenuId === tpl.id }"
                  title="Mais ações"
                  aria-label="Mais ações do modelo"
                  @click.stop="toggleCardMenu(tpl.id)"
                >
                  <MoreHorizontal :size="14" :stroke-width="2" />
                </button>

                <transition name="menu-scale">
                  <div v-if="openCardMenuId === tpl.id" class="card-dropdown-menu">
                    <button
                      type="button"
                      class="menu-item"
                      @click="closeCardMenu(); startEdit(tpl)"
                    >
                      <Pencil :size="13" class="menu-item-icon" />
                      <span class="menu-item-text">Editar</span>
                    </button>
                    <button
                      type="button"
                      class="menu-item menu-item-danger"
                      @click="closeCardMenu(); removeTemplate(tpl.id)"
                    >
                      <Trash2 :size="13" class="menu-item-icon" />
                      <span class="menu-item-text">Excluir</span>
                    </button>
                  </div>
                </transition>
              </div>
            </div>
          </div>

          <p v-if="keyboardGrabbedId === tpl.id" class="reorder-key-hint" aria-hidden="true">
            Setas para mover · Espaço para soltar · Esc para cancelar
          </p>

          <div v-if="isExpanded(tpl.id)" class="card-body">
            <div v-if="getTemplateTagNames(tpl, tags).length" class="card-meta">
              <span v-for="tagName in getTemplateTagNames(tpl, tags)" :key="tagName" class="card-badge">{{ tagName }}</span>
            </div>

            <p class="card-preview-expanded">{{ tpl.content }}</p>

            <div class="card-actions">
              <button
                type="button"
                class="btn-action btn-copy"
                title="Copiar para área de transferência"
                @click="copyToClipboard(tpl)"
              >
                <Copy :size="13" :stroke-width="1.8" />
                <span>Copiar</span>
              </button>
              <button
                type="button"
                class="btn-action btn-send"
                :disabled="isSending"
                title="Inserir diretamente no ticket em foco"
                @click="insertIntoTicket(tpl)"
              >
                <Loader2 v-if="isSending" :size="13" class="spin-icon" />
                <Send v-else :size="13" :stroke-width="2" />
                <span>{{ isSending ? 'Inserindo...' : 'Inserir no Ticket' }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    </template>
    <!-- Rodapé Minimalista -->
    <footer class="footer">
      <a
        :href="GITHUB_REPO_URL"
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
        @change="handleFileImport"
      />
    </footer>

    <!-- Modal de Confirmação de Restauração Estilo Notion -->
    <transition name="fade">
      <div v-if="showConfirmResetModal" class="modal-backdrop" @click.self="cancelResetDefaults">
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
            <button type="button" class="btn-secondary" @click="cancelResetDefaults">
              Cancelar
            </button>
            <button type="button" class="btn-primary" @click="confirmResetDefaults">
              Restaurar
            </button>
          </div>
        </div>
      </div>
    </transition>

    <!-- Modal de Nova Versão Disponível Estilo Notion -->
    <transition name="fade">
      <div v-if="showUpdateModal && updateInfo" class="modal-backdrop" @click.self="showUpdateModal = false">
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
            <button type="button" class="btn-secondary" @click="showUpdateModal = false">
              Mais tarde
            </button>
            <button type="button" class="btn-primary btn-update-action" @click="openUpdateRelease">
              <ExternalLink :size="13" :stroke-width="2" />
              <span>Ver Release</span>
            </button>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.message-tags-field {
  border: 0;
  min-width: 0;
  padding: 0;
}
.message-tags-field legend {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 5px;
}
.message-tag-picker {
  position: relative;
}
.message-tag-picker summary {
  list-style: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 12px;
  cursor: pointer;
}
.message-tag-picker summary::-webkit-details-marker { display: none; }
.message-tag-picker summary span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tag-picker-chevron { transform: rotate(90deg); flex-shrink: 0; }
.message-tag-picker[open] .tag-picker-chevron { transform: rotate(-90deg); }
.message-tag-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 50;
  max-height: 200px;
  overflow-y: auto;
  padding: 5px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-primary);
  box-shadow: 0 4px 14px #0002;
}
.message-tag-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}
.message-tag-option:hover { background: var(--bg-tertiary); }
.message-tag-option input {
  accent-color: var(--accent);
}
.tag-picker-manage {
  display: block;
  width: 100%;
  padding: 9px 8px;
  border: 0;
  border-top: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  text-align: left;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.tag-filter {
  flex: 0 1 125px;
  min-width: 0;
  display: flex;
  align-items: center;
}
.tag-filter select {
  width: 100%;
  min-width: 0;
  padding: 7px 8px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: #fff;
  color: var(--text-primary);
  font-size: 12px;
}
.card-meta { display: flex; flex-wrap: wrap; gap: 5px; }
.popup-container {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 480px;
  background: var(--bg-primary);
  position: relative;
  box-sizing: border-box;
  overflow: hidden;
}

/* Header / Barra de Ferramentas Superior */
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

/* Notion Dropdown Menu */
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

/* Transições do Menu */
.menu-scale-enter-active,
.menu-scale-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.menu-scale-enter-from,
.menu-scale-leave-to {
  opacity: 0;
  transform: scale(0.96) translateY(-4px);
}

/* Status Banner */
.status-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 500;
  border-bottom: 1px solid transparent;
}

.status-success {
  background: #ecfdf5;
  color: #065f46;
  border-color: #a7f3d0;
}

.status-error {
  background: #fef2f2;
  color: #ba1a1a;
  border-color: #fecaca;
}

.status-info {
  background: #f7f8f9;
  color: #3c3f43;
  border-color: #dee0e4;
}

.status-icon {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

/* License Banner */
.license-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(255, 198, 0, 0.12);
  border-bottom: 1px solid rgba(255, 198, 0, 0.35);
}

.btn-license-quick {
  background: #ffc600;
  color: #1c1b1c;
  border: none;
  border-radius: 4px;
  padding: 5px 10px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  transition: all 0.15s;
  white-space: nowrap;
}

.btn-license-quick:hover:not(:disabled) {
  background: #f0ba00;
  transform: translateY(-1px);
  box-shadow: 0 2px 6px rgba(255, 198, 0, 0.4);
}

.btn-license-quick:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Form Styles */
.form-container {
  flex: 1;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
}

.form-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.form-header h2 {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.btn-close {
  background: transparent;
  border: none;
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  cursor: pointer;
  color: var(--text-muted);
  transition: background 0.15s, color 0.15s;
}

.btn-close:hover {
  background: #f1f5f9;
  color: var(--text-primary);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-group label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.label-with-tags {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
}

.quick-tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}

.tag-hint {
  font-size: 10px;
  color: var(--text-muted);
}

.tag-btn {
  background: #e2e8f0;
  border: 1px solid #cbd5e1;
  color: #334155;
  border-radius: 4px;
  font-size: 10px;
  padding: 2px 6px;
  cursor: pointer;
  font-weight: 500;
}

.tag-btn:hover {
  background: #cbd5e1;
}

.tag-btn-highlight {
  background: rgba(255, 198, 0, 0.22);
  border-color: rgba(255, 198, 0, 0.55);
  color: #6f5600;
  font-weight: 600;
}

.tag-btn-highlight:hover {
  background: rgba(255, 198, 0, 0.35);
}

input[type="text"],
input[type="search"],
textarea {
  width: 100%;
  padding: 7px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: #ffffff;
  color: var(--text-primary);
  font-size: 12px;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}

input:focus,
textarea:focus {
  border-color: #ffc600;
  box-shadow: 0 0 0 2px rgba(255, 198, 0, 0.25);
}

textarea {
  resize: vertical;
  min-height: 100px;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 6px;
}

.btn-primary {
  background: #ffc600;
  color: #1c1b1c;
  border: none;
  padding: 7px 14px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
}

.btn-primary:hover {
  background: #f0ba00;
  transform: translateY(-1px);
  box-shadow: 0 2px 6px rgba(255, 198, 0, 0.4);
}

.btn-secondary {
  background: #f7f8f9;
  border: 1px solid #dee0e4;
  color: #3c3f43;
  padding: 7px 12px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-secondary:hover {
  background: #eceef0;
}

/* List Styles */
.list-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px 6px;
  background: var(--bg-primary);
}

.search-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
}

.search-input-icon {
  position: absolute;
  left: 9px;
  color: #8a8f96;
  pointer-events: none;
}

.search-input-wrapper input {
  padding-left: 30px;
}

.templates-scroll {
  position: relative;
  flex: 1;
  overflow-y: auto;
  padding: 10px 14px 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.templates-scroll[data-drop="true"]::after {
  content: '';
  position: fixed;
  left: var(--drop-x);
  top: var(--drop-y);
  width: var(--drop-w);
  height: var(--drop-h, 2px);
  background: #ffc600;
  border-radius: 999px;
  pointer-events: none;
  z-index: 50;
  transform: translateY(-50%);
}

.templates-scroll[data-drop="true"]::before {
  content: '';
  position: fixed;
  left: calc(var(--drop-x) - 3px);
  top: var(--drop-y);
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ffffff;
  border: 2px solid #e0af00;
  pointer-events: none;
  z-index: 51;
  transform: translateY(-50%);
}

@media (forced-colors: active) {
  .templates-scroll[data-drop="true"]::after {
    background: Highlight;
  }
  .templates-scroll[data-drop="true"]::before {
    border-color: Highlight;
  }
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.empty-state {
  text-align: center;
  padding: 30px 15px;
  color: var(--text-muted);
  font-size: 12px;
}

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

:global(.is-reordering),
:global(.is-reordering *) {
  cursor: grabbing !important;
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

.drag-handle[aria-pressed="true"] {
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
  align-items: center;
  gap: 6px;
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

/* Footer Notion-style minimal */
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

/* Modal Estilo Notion */
.modal-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(15, 15, 15, 0.45);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  z-index: 200;
}

.notion-modal {
  background: #ffffff;
  border: 1px solid #dee0e4;
  border-radius: 8px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.18);
  padding: 16px;
  width: 100%;
  max-width: 310px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.notion-modal-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.modal-icon-badge {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  background: rgba(255, 198, 0, 0.15);
  color: #6f5600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.modal-title {
  font-size: 13px;
  font-weight: 600;
  color: #1c1b1c;
}

.modal-body {
  font-size: 11.5px;
  line-height: 1.45;
  color: #44474a;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}

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

/* Utilitários e animações */
.spin-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
