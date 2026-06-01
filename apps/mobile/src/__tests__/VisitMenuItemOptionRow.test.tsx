import React from 'react';
import { act, create } from 'react-test-renderer';

import { VisitMenuItemOptionRow } from '../components/shared/VisitMenuItemOptionRow';

const mockReact = React;
const theme = {
  colors: {
    border: {
      subtle: 'subtle-border',
    },
    status: {
      infoBg: 'info-background',
      infoBorder: 'info-border',
      successBg: 'success-background',
      successBorder: 'success-border',
    },
    text: {
      brand: 'brand',
      info: 'info',
      muted: 'muted',
      secondary: 'secondary',
      success: 'success',
    },
  },
  radii: {
    md: 12,
  },
  spacing: {
    sm: 12,
    xs: 8,
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
  useTheme: () => theme,
}));

jest.mock('../ui', () => ({
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

jest.mock('../components/shared/VisibilityBadge', () => ({
  VisibilityBadge: (props: Record<string, unknown>) =>
    mockReact.createElement('VisibilityBadge', props),
}));

describe('VisitMenuItemOptionRow', () => {
  it('renders eaten count badges only when a menu item has history', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <VisitMenuItemOptionRow
          name="Iced Latte"
          onPress={jest.fn()}
          selected={false}
          userEatenCount={2}
        />,
      );
    });

    expect(renderer.root.findByProps({ children: 'Ate 2 times' })).toBeDefined();
    expect(renderer.root.findByProps({ name: 'restaurant-outline' }).props.color).toBe('success');
    expect(renderer.root.findByProps({ children: 'Ate 2 times' }).props.tone).toBe('success');

    await act(async () => {
      renderer.update(
        <VisitMenuItemOptionRow
          name="Iced Latte"
          onPress={jest.fn()}
          selected={false}
          userEatenCount={1}
        />,
      );
    });

    expect(renderer.root.findByProps({ children: 'Ate 1 time' })).toBeDefined();

    await act(async () => {
      renderer.update(
        <VisitMenuItemOptionRow
          name="Iced Latte"
          onPress={jest.fn()}
          selected={false}
          userEatenCount={0}
        />,
      );
    });

    expect(
      renderer.root.findAll(
        (node: { props: { children?: React.ReactNode } }) =>
          node.props.children === 'Ate 1 time' || node.props.children === 'Ate 2 times',
      ),
    ).toHaveLength(0);
  });

  it('renders friend eaten count badges only when friends have history', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <VisitMenuItemOptionRow
          friendEatenCount={3}
          name="Iced Latte"
          onPress={jest.fn()}
          selected={false}
        />,
      );
    });

    expect(renderer.root.findByProps({ children: 'Ate 3 times' })).toBeDefined();
    expect(renderer.root.findByProps({ name: 'people-outline' }).props.color).toBe('info');
    expect(renderer.root.findByProps({ children: 'Ate 3 times' }).props.tone).toBe('info');

    await act(async () => {
      renderer.update(
        <VisitMenuItemOptionRow
          friendEatenCount={1}
          name="Iced Latte"
          onPress={jest.fn()}
          selected={false}
        />,
      );
    });

    expect(renderer.root.findByProps({ children: 'Ate 1 time' })).toBeDefined();

    await act(async () => {
      renderer.update(
        <VisitMenuItemOptionRow
          friendEatenCount={0}
          name="Iced Latte"
          onPress={jest.fn()}
          selected={false}
        />,
      );
    });

    expect(
      renderer.root.findAll(
        (node: { props: { children?: React.ReactNode } }) =>
          node.props.children === 'Ate 1 time' || node.props.children === 'Ate 3 times',
      ),
    ).toHaveLength(0);
  });

  it('expands and collapses long descriptions without triggering the row selection handler', async () => {
    const onPress = jest.fn();
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <VisitMenuItemOptionRow
          description="Long tasting description"
          name="Iced Latte"
          onPress={onPress}
          optionTestID="menu-item-option"
          selected={false}
        />,
      );
    });

    const descriptionText = renderer.root.findAll(
      (node: { type: unknown; props: { children?: React.ReactNode } }) =>
        node.type === 'Text' &&
        node.props.children === 'Long tasting description',
    )[0];

    await act(async () => {
      descriptionText.props.onTextLayout({
        nativeEvent: {
          lines: [{}, {}, {}],
        },
      });
    });

    const showMoreLabel = renderer.root.findByProps({ children: 'Show more' });
    const stopPropagation = jest.fn();

    await act(async () => {
      showMoreLabel.parent.props.onPress({ stopPropagation });
    });

    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
    expect(
      renderer.root.findAll(
        (node: { type: unknown; props: { children?: React.ReactNode; numberOfLines?: number } }) =>
          node.type === 'Text' &&
          node.props.children === 'Long tasting description' &&
          node.props.numberOfLines === undefined,
      ),
    ).toHaveLength(1);

    const showLessLabel = renderer.root.findByProps({ children: 'Show less' });

    await act(async () => {
      showLessLabel.parent.props.onPress({ stopPropagation: jest.fn() });
    });

    expect(
      renderer.root.findAll(
        (node: { type: unknown; props: { children?: React.ReactNode; numberOfLines?: number } }) =>
          node.type === 'Text' &&
          node.props.children === 'Long tasting description' &&
          node.props.numberOfLines === 2,
      ),
    ).toHaveLength(1);

    await act(async () => {
      renderer.root.findByProps({ testID: 'menu-item-option' }).props.onPress();
    });

    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
