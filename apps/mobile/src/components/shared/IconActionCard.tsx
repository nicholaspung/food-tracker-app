import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { createThemedStyles } from '../../theme';
import { Card, Text } from '../../ui';

type IoniconName = ComponentProps<typeof Ionicons>['name'];
type IconActionCardLayout = 'horizontal' | 'vertical';

export interface IconActionCardProps {
  title: string;
  description: string;
  iconName: IoniconName;
  iconColor: string;
  iconBackground: string;
  onPress: () => void;
  disabled?: boolean;
  layout?: IconActionCardLayout;
  testID?: string;
  trailing?: ReactNode;
}

const useStyles = createThemedStyles((theme, isVertical: boolean) => ({
  card: {
    borderColor: theme.colors.border.subtle,
    borderWidth: isVertical ? 1 : 2,
    gap: theme.spacing.sm,
    minHeight: isVertical ? 74 : undefined,
    paddingVertical: isVertical ? theme.spacing.sm : undefined,
  },
  cardPressed: {
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.brand,
  },
  cardDisabled: {
    opacity: 0.55,
  },
  contentRow: {
    alignItems: isVertical ? 'center' : 'flex-start',
    flexDirection: isVertical ? 'column' : 'row',
    gap: theme.spacing.sm,
    justifyContent: isVertical ? 'center' : 'flex-start',
  },
  iconWrap: {
    alignItems: 'center',
    borderRadius: theme.radii.md,
    height: isVertical ? 36 : 44,
    justifyContent: 'center',
    marginTop: isVertical ? 0 : theme.spacing.xxs,
    width: isVertical ? 36 : 44,
  },
  textWrap: {
    alignItems: isVertical ? 'center' : 'flex-start',
    flex: isVertical ? undefined : 1,
    gap: theme.spacing.xxs,
  },
  title: {
    textAlign: isVertical ? 'center' : 'left',
  },
  description: {
    textAlign: isVertical ? 'center' : 'left',
  },
  trailing: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    justifyContent: 'center',
    marginLeft: isVertical ? 0 : 'auto',
    marginTop: isVertical ? 0 : theme.spacing.xxs,
    minHeight: 24,
    minWidth: 24,
  },
}));

export function IconActionCard({
  title,
  description,
  iconName,
  iconColor,
  iconBackground,
  onPress,
  disabled = false,
  layout = 'horizontal',
  testID,
  trailing,
}: IconActionCardProps) {
  const isVertical = layout === 'vertical';
  const styles = useStyles(isVertical);

  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} testID={testID}>
      {({ pressed }) => (
        <Card style={[styles.card, disabled ? styles.cardDisabled : null, pressed && !disabled ? styles.cardPressed : null]}>
          <View style={styles.contentRow}>
            <View style={[styles.iconWrap, { backgroundColor: iconBackground }]}>
              <Ionicons color={iconColor} name={iconName} size={isVertical ? 18 : 22} />
            </View>
            <View style={styles.textWrap}>
              <Text style={styles.title} variant="label">
                {title}
              </Text>
              <Text style={styles.description} tone="secondary" variant={isVertical ? 'bodySm' : 'bodyMd'}>
                {description}
              </Text>
            </View>
            {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
          </View>
        </Card>
      )}
    </Pressable>
  );
}
