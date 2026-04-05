import type { ReactNode } from 'react';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import { View } from 'react-native';

import { Card } from '../../ui';
import { SectionHeader } from './SectionHeader';

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
  return (
    <Card style={style}>
      <SectionHeader
        description={description}
        descriptionStyle={descriptionStyle}
        title={title}
        titleAccessory={titleAccessory}
        titleLeading={titleLeading}
        titleStyle={titleStyle}
      />
      {contentStyle ? <View style={contentStyle}>{children}</View> : children}
    </Card>
  );
}
