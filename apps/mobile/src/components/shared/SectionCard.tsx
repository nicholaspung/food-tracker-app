import type { ReactNode } from 'react';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '../../theme';
import { Card, Text } from '../../ui';

export interface SectionCardProps {
  title: string;
  description?: string;
  titleLeading?: ReactNode;
  titleAccessory?: ReactNode;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  titleStyle?: StyleProp<TextStyle>;
  descriptionStyle?: StyleProp<TextStyle>;
}

export function SectionCard({
  title,
  description,
  titleLeading,
  titleAccessory,
  children,
  style,
  contentStyle,
  titleStyle,
  descriptionStyle,
}: SectionCardProps) {
  const theme = useTheme();

  const styles = StyleSheet.create({
    header: {
      gap: theme.spacing.xxs,
    },
    titleRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: theme.spacing.xs,
    },
    description: {
      color: theme.colors.text.secondary,
      fontSize: 14,
      lineHeight: 20,
    },
  });

  return (
    <Card style={style}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          {titleLeading}
          <Text style={titleStyle} variant="label">
            {title}
          </Text>
          {titleAccessory}
        </View>
        {description ? <Text style={[styles.description, descriptionStyle]}>{description}</Text> : null}
      </View>
      {contentStyle ? <View style={contentStyle}>{children}</View> : children}
    </Card>
  );
}
