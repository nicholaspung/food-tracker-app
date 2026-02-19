import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '../../theme';
import { Card, Text } from '../../ui';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

interface AddOptionCardProps {
  title: string;
  description: string;
  icon: IoniconName;
  iconColor: string;
  iconBackground: string;
  onPress: () => void;
  testID?: string;
}

export function AddOptionCard({
  title,
  description,
  icon,
  iconColor,
  iconBackground,
  onPress,
  testID,
}: AddOptionCardProps) {
  const theme = useTheme();

  const styles = StyleSheet.create({
    card: {
      borderWidth: 2,
      borderColor: theme.colors.border.subtle,
    },
    cardPressed: {
      borderColor: theme.colors.text.brand,
      backgroundColor: theme.colors.background.surface,
    },
    row: {
      alignItems: 'flex-start',
      flexDirection: 'row',
      gap: theme.spacing.sm,
    },
    iconWrap: {
      alignItems: 'center',
      borderRadius: theme.radii.md,
      height: 44,
      justifyContent: 'center',
      marginTop: theme.spacing.xxs,
      width: 44,
    },
    content: {
      flex: 1,
      gap: theme.spacing.xxs,
    },
    title: {
      color: theme.colors.text.primary,
      fontSize: 16,
      fontWeight: '700',
      lineHeight: 22,
    },
    description: {
      color: theme.colors.text.muted,
      fontSize: 13,
      lineHeight: 18,
    },
    chevron: {
      marginTop: theme.spacing.xxs,
    },
  });

  return (
    <Pressable accessibilityRole="button" onPress={onPress} testID={testID}>
      {({ pressed }) => (
        <Card style={[styles.card, pressed && styles.cardPressed]}>
          <View style={styles.row}>
            <View style={[styles.iconWrap, { backgroundColor: iconBackground }]}>
              <Ionicons color={iconColor} name={icon} size={22} />
            </View>
            <View style={styles.content}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.description}>{description}</Text>
            </View>
            <Ionicons
              color={theme.colors.text.muted}
              name="chevron-forward"
              size={18}
              style={styles.chevron}
            />
          </View>
        </Card>
      )}
    </Pressable>
  );
}
