import type { ReactNode, Ref } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '../../ui/AppIcon';

import { createThemedStyles, useTheme } from '../../theme';
import { Card, Input, Text } from '../../ui';
import { RatingSelector } from './RatingSelector';

interface VisitItemRatingCardProps {
  descriptionPlaceholder?: string;
  descriptionValue?: string;
  footerAction?: ReactNode;
  hideRatingFields?: boolean;
  itemName: string;
  notesPlaceholder?: string;
  notesValue: string;
  onDescriptionChange?: (value: string) => void;
  onNotesChange: (value: string) => void;
  onRatingChange: (value: number) => void;
  onRequestRemove?: () => void;
  photoSection?: ReactNode;
  rating: number;
  removeAccessibilityLabel?: string;
  removeButtonRef?: Ref<View>;
  removeTestID?: string;
  showDescription?: boolean;
  testIDPrefix?: string;
}

const useStyles = createThemedStyles((theme) => ({
  card: {
    gap: theme.spacing.sm,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  title: {
    flex: 1,
  },
  removeButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
    minWidth: 36,
    padding: theme.spacing.xxs,
  },
}));

export function VisitItemRatingCard({
  descriptionPlaceholder = 'Optional description or modification',
  descriptionValue = '',
  footerAction,
  hideRatingFields = false,
  itemName,
  notesPlaceholder = 'Optional notes',
  notesValue,
  onDescriptionChange,
  onNotesChange,
  onRatingChange,
  onRequestRemove,
  photoSection,
  rating,
  removeAccessibilityLabel,
  removeButtonRef,
  removeTestID,
  showDescription = false,
  testIDPrefix,
}: VisitItemRatingCardProps) {
  const theme = useTheme();
  const styles = useStyles();

  return (
    <Card style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.title}>
          <Text variant="label">{itemName}</Text>
        </View>
        {onRequestRemove ? (
          <Pressable
            accessibilityLabel={removeAccessibilityLabel ?? `Remove ${itemName}`}
            accessibilityRole="button"
            hitSlop={12}
            onPress={onRequestRemove}
            ref={removeButtonRef}
            style={styles.removeButton}
            testID={removeTestID}
          >
            <Ionicons color={theme.colors.text.danger} name="trash-outline" size={18} />
          </Pressable>
        ) : null}
      </View>
      {!hideRatingFields ? (
        <>
          <RatingSelector onChange={onRatingChange} testIDPrefix={testIDPrefix} value={rating} />
          {showDescription && onDescriptionChange ? (
            <Input
              label="Description"
              onChangeText={onDescriptionChange}
              placeholder={descriptionPlaceholder}
              value={descriptionValue}
            />
          ) : null}
          {photoSection}
          <Input
            label="Notes"
            onChangeText={onNotesChange}
            placeholder={notesPlaceholder}
            value={notesValue}
          />
        </>
      ) : null}
      {footerAction}
    </Card>
  );
}
