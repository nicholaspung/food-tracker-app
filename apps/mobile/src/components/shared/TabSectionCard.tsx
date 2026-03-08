import type { ReactNode } from 'react';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';

import { SectionCard } from './SectionCard';

export interface TabSectionCardProps {
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

/**
 * Reusable section shell for tab-root pages: title row, optional description, and custom body content.
 */
export function TabSectionCard({
  title,
  description,
  titleLeading,
  titleAccessory,
  children,
  style,
  contentStyle,
  titleStyle,
  descriptionStyle,
}: TabSectionCardProps) {
  return (
    <SectionCard
      contentStyle={contentStyle}
      description={description}
      descriptionStyle={descriptionStyle}
      style={style}
      title={title}
      titleAccessory={titleAccessory}
      titleLeading={titleLeading}
      titleStyle={titleStyle}
    >
      {children}
    </SectionCard>
  );
}
