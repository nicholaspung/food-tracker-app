import { Pressable, View } from 'react-native';

import { createThemedStyles } from '../../theme';
import { Text } from '../../ui';
import { CachedRemoteImage } from './CachedRemoteImage';

export interface RecordPhotoEntry {
  id: string;
  previewUrl: string;
  url: string;
  ownerLabel: string;
}

interface RecordPhotoThumbnailButtonProps {
  accessibilityLabel: string;
  entries: RecordPhotoEntry[];
  onOpen: (entries: RecordPhotoEntry[]) => void;
  testID?: string;
}

const useStyles = createThemedStyles((theme) => ({
  photoWrap: {
    position: 'relative',
  },
  photoThumb: {
    backgroundColor: theme.colors.border.subtle,
    borderRadius: theme.radii.sm,
    height: 52,
    width: 52,
  },
  photoCountBadge: {
    alignItems: 'center',
    backgroundColor: theme.colors.background.inverse,
    borderRadius: theme.radii.pill,
    justifyContent: 'center',
    left: 2,
    minWidth: 18,
    paddingHorizontal: 4,
    position: 'absolute',
    top: 2,
  },
  photoCountText: {
    color: theme.colors.text.inverse,
    ...theme.typography.bodySmTightBold,
  },
}));

export function RecordPhotoThumbnailButton({
  accessibilityLabel,
  entries,
  onOpen,
  testID,
}: RecordPhotoThumbnailButtonProps) {
  const styles = useStyles();
  const primaryPhotoUrl = entries[0]?.previewUrl;

  if (!primaryPhotoUrl) {
    return null;
  }

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={() => {
        onOpen(entries);
      }}
      style={styles.photoWrap}
      testID={testID}
    >
      <CachedRemoteImage uri={primaryPhotoUrl} style={styles.photoThumb} />
      {entries.length > 1 ? (
        <View style={styles.photoCountBadge}>
          <Text style={styles.photoCountText}>+{entries.length - 1}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}
