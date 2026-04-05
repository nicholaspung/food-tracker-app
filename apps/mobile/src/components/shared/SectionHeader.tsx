import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
import { Text } from '../../ui';
import type { TextProps } from '../../ui';

export interface SectionHeaderProps {
  title: string;
  description?: string;
  titleLeading?: ReactNode;
  titleAccessory?: ReactNode;
  rightAccessory?: ReactNode;
  style?: StyleProp<ViewStyle>;
  titleRowStyle?: StyleProp<ViewStyle>;
  titleStyle?: StyleProp<TextStyle>;
  descriptionStyle?: StyleProp<TextStyle>;
  titleVariant?: TextProps['variant'];
  descriptionVariant?: TextProps['variant'];
  titleTone?: TextProps['tone'];
  descriptionTone?: TextProps['tone'];
}

export function SectionHeader({
  title,
  description,
  titleLeading,
  titleAccessory,
  rightAccessory,
  style,
  titleRowStyle,
  titleStyle,
  descriptionStyle,
  titleVariant = 'labelStrong',
  descriptionVariant = 'bodyMd',
  titleTone = 'primary',
  descriptionTone = 'secondary',
}: SectionHeaderProps) {
  const theme = useTheme();

  const styles = StyleSheet.create({
    container: {
      gap: theme.spacing.xxs,
    },
    titleRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: theme.spacing.xs,
    },
    titleLeft: {
      alignItems: 'center',
      flex: 1,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.spacing.xs,
      minWidth: 0,
    },
    title: {
      flexShrink: 1,
    },
    rightAccessory: {
      marginLeft: 'auto',
    },
  });

  return (
    <View style={[styles.container, style]}>
      <View style={[styles.titleRow, titleRowStyle]}>
        <View style={styles.titleLeft}>
          {titleLeading}
          <Text style={[styles.title, titleStyle]} tone={titleTone} variant={titleVariant}>
            {title}
          </Text>
          {titleAccessory}
        </View>
        {rightAccessory ? <View style={styles.rightAccessory}>{rightAccessory}</View> : null}
      </View>
      {description ? (
        <Text style={descriptionStyle} tone={descriptionTone} variant={descriptionVariant}>
          {description}
        </Text>
      ) : null}
    </View>
  );
}
