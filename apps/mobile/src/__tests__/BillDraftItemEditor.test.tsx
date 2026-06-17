import React from 'react';
import { act, create } from 'react-test-renderer';

import { BillDraftItemEditor } from '../screens/createBill/BillDraftItemEditor';

const mockReact = React;
const theme = {
  colors: {
    background: {
      surface: 'surface-background',
    },
    border: {
      default: 'default-border',
      info: 'info-border',
      subtle: 'subtle-border',
    },
    button: {
      primaryBg: 'primary-background',
      primaryDisabledBg: 'primary-disabled-background',
    },
    fill: {
      brand: 'brand-fill',
    },
    status: {
      infoBg: 'info-background',
    },
    text: {
      danger: 'danger-text',
      inverse: 'inverse-text',
      muted: 'muted-text',
      primary: 'primary-text',
      secondary: 'secondary-text',
    },
  },
  radii: {
    md: 12,
    pill: 999,
  },
  sizes: {
    inputMinHeight: 44,
  },
  spacing: {
    sm: 12,
    xs: 8,
    xxs: 4,
  },
} as const;

jest.mock('react-native', () => {
  const React = jest.requireActual<typeof import('react')>('react');

  return {
    Pressable: ({
      children,
      ...props
    }: Record<string, unknown> & {
      children?: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode);
    }) =>
      React.createElement(
        'Pressable',
        props,
        typeof children === 'function' ? children({ pressed: false }) : children,
      ),
    View: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
      React.createElement('View', props, children),
  };
});

jest.mock('../theme', () => ({
  createThemedStyles:
    (factory: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      factory(theme, ...args),
  useTheme: () => theme,
}));

jest.mock('../ui', () => ({
  Input: (props: Record<string, unknown>) => mockReact.createElement('Input', props),
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

jest.mock('../ui/AppIcon', () => ({
  Ionicons: (props: Record<string, unknown>) => mockReact.createElement('Ionicons', props),
}));

jest.mock('../components/shared', () => ({
  OptionList: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('OptionList', props, children),
  OptionListInlineBody: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('OptionListInlineBody', props, children),
  OptionListRow: ({ leading, rightAccessory, ...props }: Record<string, unknown>) =>
    mockReact.createElement('OptionListRow', props, leading as React.ReactNode, rightAccessory as React.ReactNode),
  SegmentedControl: (props: Record<string, unknown>) => mockReact.createElement('SegmentedControl', props),
}));

function buildController() {
  const item = {
    advancedSplitType: 'percentage' as const,
    advancedSplits: [],
    assignedParticipantIds: [],
    id: 'item-1',
    name: 'Fries',
    price: '6.00',
    splitMode: 'simple' as const,
  };

  return {
    draftItemName: '',
    draftItemPrice: '',
    expandedItemIds: [],
    items: [item],
    addItem: jest.fn(),
    buildItemSplitSummary: jest.fn(() => 'No one assigned'),
    getAdvancedItemBalanceFact: jest.fn(() => null),
    getAdvancedSplitInputValue: jest.fn(() => ''),
    handleDraftItemPriceChange: jest.fn(),
    isAdvancedSplitValueLocked: jest.fn(() => false),
    isSimpleItemParticipantAssigned: jest.fn(() => false),
    setDraftItemName: jest.fn(),
    toggleAdvancedItemParticipant: jest.fn(),
    toggleAdvancedSplitLock: jest.fn(),
    toggleItemExpanded: jest.fn(),
    toggleSimpleItemParticipant: jest.fn(),
    updateAdvancedSplitType: jest.fn(),
    updateAdvancedSplitValue: jest.fn(),
    updateItemSplitMode: jest.fn(),
  };
}

describe('BillDraftItemEditor', () => {
  it('exposes item remove controls as 44 by 44 buttons', async () => {
    const controller = buildController();
    const onRemoveItemRequest = jest.fn();
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <BillDraftItemEditor
          controller={controller}
          onRemoveItemRequest={onRemoveItemRequest}
          participants={[]}
        />,
      );
    });

    const removeButton = renderer.root.findByProps({ testID: 'bill-item-remove-0' });

    expect(removeButton.props.accessibilityLabel).toBe('Remove Fries');
    expect(removeButton.props.accessibilityRole).toBe('button');
    expect(removeButton.props.style).toMatchObject({ height: 44, width: 44 });

    removeButton.props.onPress();

    expect(onRemoveItemRequest).toHaveBeenCalledWith(controller.items[0]);
  });
});
