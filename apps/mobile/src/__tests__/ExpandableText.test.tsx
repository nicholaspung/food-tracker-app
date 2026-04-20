import React from 'react';
import { act, create } from 'react-test-renderer';

import { ExpandableText } from '../components/shared/ExpandableText';

const mockReact = React;
const theme = {
  colors: {
    text: {
      brand: 'brand',
      primary: 'primary',
      secondary: 'secondary',
    },
  },
  spacing: {
    xxs: 4,
  },
} as const;

jest.mock('react-native', () => ({
  Pressable: ({
    children,
    ...props
  }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Pressable', props, children),
  View: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('View', props, children),
}));

jest.mock('../theme', () => ({
  createThemedStyles:
    (factory: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      factory(theme, ...args),
}));

jest.mock('../ui', () => ({
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

function findTextNode(renderer: any, content: string, numberOfLines?: number) {
  return renderer.root.findAll(
    (node: { type: unknown; props: { children?: React.ReactNode; numberOfLines?: number } }) =>
      node.type === 'Text' &&
      (Array.isArray(node.props.children)
        ? node.props.children.join('')
        : String(node.props.children ?? '')) === content &&
      (numberOfLines === undefined || node.props.numberOfLines === numberOfLines),
  )[0];
}

function findToggleButton(renderer: any, expanded: boolean) {
  return renderer.root.findAll(
    (node: { type: unknown; props: { accessibilityRole?: string; accessibilityState?: { expanded?: boolean } } }) =>
      node.type === 'Pressable' &&
      node.props.accessibilityRole === 'button' &&
      node.props.accessibilityState?.expanded === expanded,
  )[0];
}

describe('ExpandableText', () => {
  it('renders collapsed with the provided line count', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <ExpandableText collapsedNumberOfLines={2}>
          Long tasting note
        </ExpandableText>,
      );
    });

    const contentText = findTextNode(renderer, 'Long tasting note');

    expect(contentText.props.numberOfLines).toBe(2);
  });

  it('toggles to expanded on tap in tap-text mode', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <ExpandableText collapsedNumberOfLines={2}>
          Long tasting note
        </ExpandableText>,
      );
    });

    const collapsedText = findTextNode(renderer, 'Long tasting note', 2);

    await act(async () => {
      collapsedText.props.onTextLayout({
        nativeEvent: {
          lines: [{}, {}, {}],
        },
      });
    });

    const expandButton = renderer.root.findByProps({
      accessibilityHint: 'Shows the full text',
    });

    await act(async () => {
      expandButton.props.onPress();
    });

    const expandedText = findTextNode(renderer, 'Long tasting note');
    expect(expandedText.props.numberOfLines).toBeUndefined();
  });

  it('toggles via the inline Show more and Show less control', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <ExpandableText
          collapsedNumberOfLines={1}
          interactionMode="inline-toggle"
        >
          Long tasting note
        </ExpandableText>,
      );
    });

    const collapsedText = findTextNode(renderer, 'Long tasting note', 1);

    await act(async () => {
      collapsedText.props.onTextLayout({
        nativeEvent: {
          lines: [{}, {}],
        },
      });
    });

    await act(async () => {
      findToggleButton(renderer, false).props.onPress();
    });

    expect(findTextNode(renderer, 'Show less')).toBeDefined();
    expect(findTextNode(renderer, 'Long tasting note').props.numberOfLines).toBeUndefined();

    await act(async () => {
      findToggleButton(renderer, true).props.onPress();
    });

    expect(findTextNode(renderer, 'Show more')).toBeDefined();
    expect(findTextNode(renderer, 'Long tasting note').props.numberOfLines).toBe(1);
  });

  it('calls stopPropagation when configured for the toggle control', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <ExpandableText
          collapsedNumberOfLines={1}
          interactionMode="inline-toggle"
          stopPropagationOnToggle
        >
          Long tasting note
        </ExpandableText>,
      );
    });

    const collapsedText = findTextNode(renderer, 'Long tasting note', 1);

    await act(async () => {
      collapsedText.props.onTextLayout({
        nativeEvent: {
          lines: [{}, {}],
        },
      });
    });

    const stopPropagation = jest.fn();

    await act(async () => {
      findToggleButton(renderer, false).props.onPress({ stopPropagation });
    });

    expect(stopPropagation).toHaveBeenCalledTimes(1);
  });

  it('preserves expanded state across rerenders until toggled back', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <ExpandableText collapsedNumberOfLines={2}>
          Long tasting note
        </ExpandableText>,
      );
    });

    const collapsedText = findTextNode(renderer, 'Long tasting note', 2);

    await act(async () => {
      collapsedText.props.onTextLayout({
        nativeEvent: {
          lines: [{}, {}, {}],
        },
      });
    });

    await act(async () => {
      renderer.root.findByProps({ accessibilityHint: 'Shows the full text' }).props.onPress();
    });

    await act(async () => {
      renderer.update(
        <ExpandableText collapsedNumberOfLines={2}>
          Long tasting note
        </ExpandableText>,
      );
    });

    expect(findTextNode(renderer, 'Long tasting note').props.numberOfLines).toBeUndefined();

    await act(async () => {
      renderer.root.findByProps({ accessibilityHint: 'Collapses the text' }).props.onPress();
    });

    expect(findTextNode(renderer, 'Long tasting note').props.numberOfLines).toBe(2);
  });
});
