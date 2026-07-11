import React from 'react';
import { act, create } from 'react-test-renderer';

import { RatingSelector } from '../components/shared/RatingSelector';

const mockReact = React;
const theme = {
  colors: {
    border: { info: 'info-border' },
    rating: {
      five: 'rating-five',
      four: 'rating-four',
      one: 'rating-one',
      three: 'rating-three',
      two: 'rating-two',
    },
    text: {
      inverse: 'inverse-text',
      muted: 'muted-text',
    },
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

describe('RatingSelector', () => {
  it('exposes canonical labels, radio semantics, and selected state', async () => {
    const onChange = jest.fn();
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <RatingSelector onChange={onChange} testIDPrefix="rating" value={3} />,
      );
    });

    const options = [
      [1, "Don't eat"],
      [2, 'Not good not bad'],
      [3, 'Worth trying'],
      [4, 'Would get again'],
      [5, 'Eat often'],
    ] as const;

    for (const [value, label] of options) {
      const option = renderer.root.findByProps({ testID: `rating-${value}` });
      expect(option.props.accessibilityLabel).toBe(`${value}, ${label}`);
      expect(option.props.accessibilityRole).toBe('radio');
      expect(option.props.accessibilityState).toEqual({ selected: value === 3 });
    }

    await act(async () => {
      renderer.root.findByProps({ testID: 'rating-5' }).props.onPress();
    });

    expect(onChange).toHaveBeenCalledWith(5);
  });
});
