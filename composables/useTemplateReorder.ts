import type { Ref } from 'vue';
import type { QuickReplyTemplate } from '@/types/template';
import { useListReorder } from './useListReorder';

interface UseTemplateReorderOptions {
  templates: Ref<QuickReplyTemplate[]>;
  canReorder: Ref<boolean>;
  listRef: Ref<HTMLElement | null>;
  onPersist: () => Promise<void>;
}

export function useTemplateReorder({
  templates,
  canReorder,
  listRef,
  onPersist,
}: UseTemplateReorderOptions) {
  return useListReorder<QuickReplyTemplate>({
    items: templates,
    getId: (t) => t.id,
    getLabel: (t) => t.title,
    canReorder,
    listRef,
    onPersist,
    cardSelector: '.template-card',
    idAttribute: 'data-template-id',
  });
}
