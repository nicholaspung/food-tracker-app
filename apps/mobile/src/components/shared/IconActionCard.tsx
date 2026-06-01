import { Ionicons } from '../../ui/AppIcon';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { createThemedStyles } from '../../theme';
import { Card, Text } from '../../ui';

type IoniconName = ComponentProps<typeof Ionicons>['name'];
type IconActionCardLayout = 'horizontal' | 'vertical' | 'compact';
type IconActionCardTone = 'default' | 'muted';

export interface IconActionCardProps {
  title: string;
  description?: string;
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

const useStyles = createThemedStyles((theme, layout: IconActionCardLayout, tone: IconActionCardTone) => {
  const isVertical = layout === 'vertical';
  const isCompact = layout === 'compact';

  return {
    card: {
      backgroundColor:
        tone === 'muted' ? theme.colors.background.muted : theme.colors.background.surface,
      borderColor: theme.colors.border.subtle,
      borderWidth: isVertical || isCompact ? 1 : 2,
      gap: isCompact ? theme.spacing.xs : theme.spacing.sm,
      justifyContent: isCompact ? 'flex-start' : undefined,
      minHeight: isCompact ? 84 : isVertical ? 74 : undefined,
      paddingHorizontal: isCompact ? theme.spacing.sm : undefined,
      paddingVertical: isVertical || isCompact ? theme.spacing.sm : undefined,
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
      gap: isCompact ? theme.spacing.xs : theme.spacing.sm,
      justifyContent: isVertical ? 'center' : 'flex-start',
    },
    iconWrap: {
      alignItems: 'center',
      borderRadius: theme.radii.md,
      height: isVertical || isCompact ? 36 : 44,
      justifyContent: 'center',
      marginTop: isVertical || isCompact ? 0 : theme.spacing.xxs,
      width: isVertical || isCompact ? 36 : 44,
    },
    textWrap: {
      alignItems: isVertical ? 'center' : 'flex-start',
      flex: isVertical ? undefined : 1,
      gap: isCompact ? 2 : theme.spacing.xxs,
      minWidth: 0,
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
  };
});

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
  const isCompact = layout === 'compact';
  const isSmallIcon = isVertical || isCompact;
  const styles = useStyles(layout, tone);
  const titleTone = tone === 'muted' ? 'secondary' : 'primary';
  const descriptionTone = tone === 'muted' ? 'muted' : 'secondary';

  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} testID={testID}>
      {({ pressed }) => (
        <Card style={[styles.card, disabled ? styles.cardDisabled : null, pressed && !disabled ? styles.cardPressed : null]}>
          <View style={styles.contentRow}>
            <View style={[styles.iconWrap, { backgroundColor: iconBackground }]}>
              <Ionicons color={iconColor} name={iconName} size={isSmallIcon ? 18 : 22} />
            </View>
            <View style={styles.textWrap}>
              <View style={styles.titleRow}>
                <Text style={styles.title} tone={titleTone} variant="label">
                  {title}
                </Text>
                {titleAccessory}
              </View>
              {description ? (
                <Text
                  style={styles.description}
                  tone={descriptionTone}
                  variant={isVertical || isCompact ? 'bodySm' : 'bodyMd'}
                >
                  {description}
                </Text>
              ) : null}
            </View>
            {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
          </View>
        </Card>
      )}
    </Pressable>
  );
}
