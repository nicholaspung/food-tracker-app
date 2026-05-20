import type { QueryClient } from '@tanstack/react-query';

import type { MarkNoteUsedInput } from './featureStore';
import { promoteCachedNoteToUsed } from './notesCache';
import { markNoteUsed } from './notesStore';
import type {
  OfflineAwareFeatureWrite,
  OfflineAwareFeatureWriteResult,
} from './useOfflineAwareFeatureWrite';

interface ApplyNoteUsedCacheInput extends MarkNoteUsedInput {
  usedAt: string;
}

export function applyNoteUsedCacheEffects(
  queryClient: QueryClient,
  input: ApplyNoteUsedCacheInput,
): void {
  promoteCachedNoteToUsed(queryClient, {
    noteId: input.noteId,
    usedAt: input.usedAt,
  });
}

export async function writeNoteUsedWithOfflineSupport(
  writeFeature: OfflineAwareFeatureWrite,
  input: MarkNoteUsedInput,
  options: {
    trackOnlineWrite?: boolean;
  } = {},
): Promise<OfflineAwareFeatureWriteResult<void>> {
  return writeFeature({
    operationName: 'note.mark-used',
    trackOnlineWrite: options.trackOnlineWrite,
    offline: {
      strategy: 'outbox',
      payload: input,
    },
    execute: () => markNoteUsed(input),
  });
}
