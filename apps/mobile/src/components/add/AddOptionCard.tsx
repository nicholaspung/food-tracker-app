import type { ComponentProps, ReactNode } from 'react';

import { FeatureActionCard } from '../shared';
import type { FeatureActionCardProps } from '../shared';

type IoniconName = ComponentProps<typeof FeatureActionCard>['iconName'];

interface AddOptionCardProps {
  title: string;
  description?: string;
  icon: IoniconName;
  iconColor: string;
  iconBackground: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
  titleAccessory?: ReactNode;
  layout?: FeatureActionCardProps['layout'];
  showTrailing?: boolean;
  tone?: FeatureActionCardProps['tone'];
}

export function AddOptionCard({
  title,
  description,
  icon,
  iconColor,
  iconBackground,
  onPress,
  disabled = false,
  testID,
  titleAccessory,
  layout = 'horizontal',
  showTrailing = true,
  tone = 'default',
}: AddOptionCardProps) {
  return (
    <FeatureActionCard
      description={description}
      iconBackground={iconBackground}
      iconColor={iconColor}
      disabled={disabled}
      iconName={icon}
      layout={layout}
      onPress={onPress}
      showTrailing={showTrailing}
      testID={testID}
      title={title}
      titleAccessory={titleAccessory}
      tone={tone}
    />
  );
}
