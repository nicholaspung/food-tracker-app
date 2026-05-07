import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { createThemedStyles } from '../../theme';
import { Card, Text } from '../../ui';

type IoniconName = ComponentProps<typeof Ionicons>['name'];
type IconActionCardLayout = 'horizontal' | 'vertical';
type IconActionCardTone = 'default' | 'muted';

export interface IconActionCardProps {
  title: string;
  description: string;
  iconName: IoniconName;
  iconColor: string;
  iconBackground: string;
  onPress: () => void;
  disabled?: boolean;
  layout?: IconActionCardLayout;
  tone?: IconActionCardTone;
  testID?: string;
  titleAccessory?: ReactNode;
  trailing?: ReactNode;
}

const useStyles = createThemedStyles((theme, isVertical: boolean, tone: IconActionCardTone) => ({
  card: {
    backgroundColor:
      tone === 'muted' ? theme.colors.background.muted : theme.colors.background.surface,
    borderColor: theme.colors.border.subtle,
    borderWidth: isVertical ? 1 : 2,
    gap: theme.spacing.sm,
    minHeight: isVertical ? 74 : undefined,
    paddingVertical: isVertical ? theme.spacing.sm : undefined,
  },
  cardPressed: {
    backgroundColor:
      tone === 'muted' ? theme.colors.background.surface : theme.colors.background.surface,
    borderColor:
      tone === 'muted' ? theme.colors.border.default : theme.colors.border.brand,
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
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    justifyContent: isVertical ? 'center' : 'flex-start',
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
  tone = 'default',
  testID,
  titleAccessory,
  trailing,
}: IconActionCardProps) {
  const isVertical = layout === 'vertical';
  const styles = useStyles(isVertical, tone);
  const titleTone = tone === 'muted' ? 'secondary' : 'primary';
  const descriptionTone = tone === 'muted' ? 'muted' : 'secondary';

  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} testID={testID}>
      {({ pressed }) => (
        <Card style={[styles.card, disabled ? styles.cardDisabled : null, pressed && !disabled ? styles.cardPressed : null]}>
          <View style={styles.contentRow}>
            <View style={[styles.iconWrap, { backgroundColor: iconBackground }]}>
              <Ionicons color={iconColor} name={iconName} size={isVertical ? 18 : 22} />
            </View>
            <View style={styles.textWrap}>
              <View style={styles.titleRow}>
                <Text style={styles.title} tone={titleTone} variant="label">
                  {title}
                </Text>
                {titleAccessory}
              </View>
              <Text
                style={styles.description}
                tone={descriptionTone}
                variant={isVertical ? 'bodySm' : 'bodyMd'}
              >
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
