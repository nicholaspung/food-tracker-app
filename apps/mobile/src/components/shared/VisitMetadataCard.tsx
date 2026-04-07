import type { ReactNode } from 'react';
import { View } from 'react-native';

import { createThemedStyles } from '../../theme';
import { Card, Text } from '../../ui';
import { PhotoDetectedDateField } from './PhotoDetectedDateField';
import { VisibilityOptionSelector, type VisibilityOptionValue } from './VisibilityOptionSelector';

interface VisitMetadataCardProps {
  dateValue: string;
  onDateChange: (value: string) => void;
  detectedDateValue?: string | null;
  dateLabel?: string;
  dateModalTitle?: string;
  visibilityValue?: VisibilityOptionValue;
  onVisibilityChange?: (value: VisibilityOptionValue) => void;
  visibilityLabel?: string;
  visibilityOptions?: readonly VisibilityOptionValue[];
  beforeVisibilityContent?: ReactNode;
}

const useStyles = createThemedStyles((theme) => ({
  card: {
    gap: theme.spacing.sm,
  },
  visibilitySection: {
    gap: theme.spacing.xs,
  },
}));

export function VisitMetadataCard({
  dateValue,
  onDateChange,
  detectedDateValue,
  dateLabel = 'Visit Date',
  dateModalTitle = 'Select visit date',
  visibilityValue,
  onVisibilityChange,
  visibilityLabel = 'Visibility',
  visibilityOptions = ['friends', 'private'],
  beforeVisibilityContent,
}: VisitMetadataCardProps) {
  const styles = useStyles();

  return (
    <Card style={styles.card}>
      <PhotoDetectedDateField
        detectedDateValue={detectedDateValue}
        label={dateLabel}
        modalTitle={dateModalTitle}
        onChange={onDateChange}
        value={dateValue}
      />

      {beforeVisibilityContent}

      {visibilityValue && onVisibilityChange ? (
        <View style={styles.visibilitySection}>
          <Text variant="label">{visibilityLabel}</Text>
          <VisibilityOptionSelector
            onChange={onVisibilityChange}
            options={visibilityOptions}
            value={visibilityValue}
          />
        </View>
      ) : null}
    </Card>
  );
}
