import type { QueryClient } from '@tanstack/react-query';

import type { OfflineAwareFeatureWrite } from '../store/useOfflineAwareFeatureWrite';
import {
  applyNoteUsedCacheEffects,
  writeNoteUsedWithOfflineSupport,
} from '../store/noteUsedWrite';

interface SourceNoteCompletionInput {
  noteId?: string;
  queryClient: QueryClient;
  usedAt: string;
}

interface PersistSourceNoteCompletionInput extends SourceNoteCompletionInput {
  writeFeature: OfflineAwareFeatureWrite;
}

interface CompleteSourceNoteAfterEntryWriteInput
  extends PersistSourceNoteCompletionInput {
  entryWriteStatus: 'completed' | 'queued';
}

export function promoteSourceNoteUsed({
  noteId,
  queryClient,
  usedAt,
}: SourceNoteCompletionInput): void {
  if (!noteId) {
    return;
  }

  applyNoteUsedCacheEffects(queryClient, {
    noteId,
    usedAt,
  });
}

export async function persistSourceNoteUsed({
  noteId,
  queryClient,
  usedAt,
  writeFeature,
}: PersistSourceNoteCompletionInput): Promise<void> {
  if (!noteId) {
    return;
  }

  await writeNoteUsedWithOfflineSupport(
    writeFeature,
    {
      noteId,
      usedAt,
    },
    {
      trackOnlineWrite: false,
    },
  );

  promoteSourceNoteUsed({
    noteId,
    queryClient,
    usedAt,
  });
}

export async function completeSourceNoteAfterEntryWrite({
  entryWriteStatus,
  noteId,
  queryClient,
  usedAt,
  writeFeature,
}: CompleteSourceNoteAfterEntryWriteInput): Promise<void> {
  if (!noteId) {
    return;
  }

  if (entryWriteStatus === 'queued') {
    await persistSourceNoteUsed({
      noteId,
      queryClient,
      usedAt,
      writeFeature,
    });
    return;
  }

  promoteSourceNoteUsed({
    noteId,
    queryClient,
    usedAt,
  });
}
