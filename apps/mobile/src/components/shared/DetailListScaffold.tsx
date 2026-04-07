import type { ReactNode } from 'react';

import { createThemedStyles } from '../../theme';
import { Card, ListItem, Text } from '../../ui';
import { SectionHeader } from './SectionHeader';

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

const useStyles = createThemedStyles((theme) => ({
  rowValue: {
    flexShrink: 1,
    marginLeft: theme.spacing.sm,
    textAlign: 'right',
  },
}));

export function DetailListScaffold({ title, subtitle, items, tone = 'default' }: DetailListScaffoldProps) {
  const styles = useStyles();

  return (
    <Card tone={tone}>
      <SectionHeader description={subtitle} title={title} />
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
