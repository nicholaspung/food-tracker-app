import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '../../theme';
import { Card, ListItem, Text } from '../../ui';

export interface DetailListItem {
  id: string;
  label: string;
  value: string;
  helperText?: string;
  trailing?: ReactNode;
}

export interface DetailListScaffoldProps {
  title: string;
  subtitle?: string;
  items: DetailListItem[];
  tone?: 'default' | 'muted' | 'info' | 'warning' | 'danger' | 'success';
}

export function DetailListScaffold({ title, subtitle, items, tone = 'default' }: DetailListScaffoldProps) {
  const theme = useTheme();

  const styles = StyleSheet.create({
    header: {
      gap: theme.spacing.xxs,
      marginBottom: theme.spacing.xs,
    },
    rowValue: {
      flexShrink: 1,
      marginLeft: theme.spacing.sm,
      textAlign: 'right',
    },
  });

  return (
    <Card tone={tone}>
      <View style={styles.header}>
        <Text variant="label">{title}</Text>
        {subtitle ? <Text tone="secondary">{subtitle}</Text> : null}
      </View>
      {items.map((item) => (
        <ListItem
          key={item.id}
          description={item.helperText}
          title={item.label}
          trailing={
            item.trailing ?? (
              <Text numberOfLines={2} style={styles.rowValue} tone="secondary">
                {item.value}
              </Text>
            )
          }
        />
      ))}
    </Card>
  );
}
