import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import type {
  GestureResponderEvent,
  NativeSyntheticEvent,
  StyleProp,
  TextLayoutEventData,
  ViewStyle,
} from 'react-native';

import { createThemedStyles } from '../../theme';
import { Text, type TextProps } from '../../ui';

type ExpandableTextInteractionMode = 'tap-text' | 'inline-toggle';

export interface ExpandableTextProps
  extends Pick<TextProps, 'style' | 'testID' | 'tone' | 'variant'> {
  children: string;
  collapsedNumberOfLines: number;
  containerStyle?: StyleProp<ViewStyle>;
  interactionMode?: ExpandableTextInteractionMode;
  stopPropagationOnToggle?: boolean;
}

const useStyles = createThemedStyles((theme) => ({
  container: {
    gap: theme.spacing.xxs,
  },
  toggleButton: {
    alignSelf: 'flex-start',
  },
}));

export function ExpandableText({
  children,
  collapsedNumberOfLines,
  containerStyle,
  interactionMode = 'tap-text',
  stopPropagationOnToggle = false,
  style,
  testID,
  tone = 'primary',
  variant = 'bodyMd',
}: ExpandableTextProps) {
  const styles = useStyles();
  const [expanded, setExpanded] = useState(false);
  const [isTruncated, setIsTruncated] = useState(false);
  const canToggle = interactionMode === 'tap-text' ? true : expanded || isTruncated;

  useEffect(() => {
    setExpanded(false);
    setIsTruncated(false);
  }, [children, collapsedNumberOfLines]);

  const handleTextLayout = (
    event: NativeSyntheticEvent<TextLayoutEventData>,
  ) => {
    if (expanded) {
      return;
    }

    const nextIsTruncated =
      event.nativeEvent.lines.length > collapsedNumberOfLines;
    setIsTruncated((current) =>
      current === nextIsTruncated ? current : nextIsTruncated,
    );
  };

  const toggleExpanded = (event?: GestureResponderEvent) => {
    if (stopPropagationOnToggle && event) {
      event.stopPropagation();
    }

    if (!canToggle) {
      return;
    }

    setExpanded((current) => !current);
  };

  const content = (
    <Text
      ellipsizeMode={expanded ? undefined : 'tail'}
      numberOfLines={expanded ? undefined : collapsedNumberOfLines}
      onTextLayout={expanded ? undefined : handleTextLayout}
      style={style}
      testID={interactionMode === 'tap-text' && !canToggle ? testID : undefined}
      tone={tone}
      variant={variant}
    >
      {children}
    </Text>
  );

  if (interactionMode === 'tap-text') {
    return (
      <Pressable
        accessibilityHint={expanded ? 'Collapses the text' : 'Shows the full text'}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={toggleExpanded}
        style={[styles.toggleButton, containerStyle]}
        testID={testID}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View style={[styles.container, containerStyle]} testID={testID}>
      {content}
      {canToggle ? (
        <Pressable
          accessibilityHint={expanded ? 'Collapses the text' : 'Shows the full text'}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          onPress={toggleExpanded}
          style={styles.toggleButton}
        >
          <Text tone="brand" variant="bodySm">
            {expanded ? 'Show less' : 'Show more'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
