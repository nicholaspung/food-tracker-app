import { RecordPhotoThumbnailButton } from '../../components/shared';
import type { OwnerItemPhotoEntry } from './listDetailTypes';

interface ListDetailItemPhotoButtonProps {
  accessibilityLabel: string;
  entries: OwnerItemPhotoEntry[];
  onOpen: (entries: OwnerItemPhotoEntry[]) => void;
  testID: string;
}

export function ListDetailItemPhotoButton({
  accessibilityLabel,
  entries,
  onOpen,
  testID,
}: ListDetailItemPhotoButtonProps) {
  return (
    <RecordPhotoThumbnailButton
      accessibilityLabel={accessibilityLabel}
      entries={entries}
      onOpen={onOpen}
      testID={testID}
    />
  );
}
