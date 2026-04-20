import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { createThemedStyles } from '../../theme';
import { Card, Text } from '../../ui';
import type { CardTone } from '../../ui';
import { ExpandableText } from './ExpandableText';

interface LinkedNoteLike {
  title: string;
  content: string;
}

export interface LinkedNoteCardProps {
  note: LinkedNoteLike | null | undefined;
  isLoading?: boolean;
  style?: StyleProp<ViewStyle>;
  title?: string;
  testID?: string;
  tone?: CardTone;
  titleAccessory?: ReactNode;
}

const useStyles = createThemedStyles((theme) => ({
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  headerTitle: {
    flex: 1,
  },
}));

export function LinkedNoteCard({
  note,
  isLoading = false,
  style,
  title = 'Linked Note',
  testID,
  tone = 'default',
  titleAccessory,
}: LinkedNoteCardProps) {
  const styles = useStyles();

  return (
    <View testID={testID}>
      <Card style={style} tone={tone}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle} variant="label">
            {title}
          </Text>
          {titleAccessory}
        </View>
        {isLoading ? (
          <Text tone="secondary">Loading note details...</Text>
        ) : note ? (
          <>
            <Text tone="secondary">{note.title}</Text>
            <ExpandableText
              collapsedNumberOfLines={4}
              interactionMode="tap-text"
              tone="secondary"
              variant="bodySm"
            >
              {note.content}
            </ExpandableText>
          </>
        ) : (
          <Text tone="warning">Note details unavailable. You can still continue.</Text>
        )}
      </Card>
    </View>
  );
}
