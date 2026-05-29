import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { View } from 'react-native';

import { createThemedStyles } from '../../theme';
import { OptionListRow } from './OptionList';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export interface FeatureActionListRowProps {
  title: string;
  description: string;
  iconName: IoniconName;
  iconColor: string;
  iconBackground: string;
  onPress: () => void;
  disabled?: boolean;
  isLast?: boolean;
  rightAccessory?: ReactNode;
  titleAccessory?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const useStyles = createThemedStyles((theme) => ({
  iconWrap: {
    alignItems: 'center',
    borderRadius: theme.radii.md,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  row: {
    backgroundColor: theme.colors.background.app,
  },
}));

export function FeatureActionListRow({
  title,
  description,
  iconName,
  iconColor,
  iconBackground,
  onPress,
  disabled = false,
  isLast = false,
  rightAccessory,
  titleAccessory,
  style,
  testID,
}: FeatureActionListRowProps) {
  const styles = useStyles();

  return (
    <OptionListRow
      isLast={isLast}
      leading={
        <View style={[styles.iconWrap, { backgroundColor: iconBackground }]}>
          <Ionicons color={iconColor} name={iconName} size={18} />
        </View>
      }
      disabled={disabled}
      onPress={onPress}
      rightAccessory={
        rightAccessory ??
        (disabled ? <Ionicons color={iconColor} name="lock-closed-outline" size={16} /> : undefined)
      }
      style={[styles.row, style]}
      subtitle={description}
      testID={testID}
      title={title}
      titleAccessory={titleAccessory}
    />
  );
}
