import React from 'react';
import { act, create } from 'react-test-renderer';

import { PhotoInputField } from '../components/shared/PhotoInputField';

const mockReact = React;
const theme = {
  colors: {
    text: {
      secondary: 'secondary-text',
    },
  },
  spacing: {
    sm: 12,
    xs: 8,
  },
} as const;

jest.mock('@expo/vector-icons', () => ({
  Ionicons: (props: Record<string, unknown>) => mockReact.createElement('Ionicons', props),
}));

jest.mock('react-native', () => {
  const React = jest.requireActual<typeof import('react')>('react');

  return {
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
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

jest.mock('../components/shared/PhotoAttachmentRow', () => ({
  PhotoAttachmentRow: (props: Record<string, unknown>) =>
    mockReact.createElement('PhotoAttachmentRow', props),
}));

jest.mock('../components/shared/PhotoSourceActionCards', () => ({
  PhotoSourceActionCards: (props: Record<string, unknown>) =>
    mockReact.createElement('PhotoSourceActionCards', props),
}));

describe('PhotoInputField', () => {
  it('keeps the action cards first with the default tone when there are no attachments', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <PhotoInputField
          label="Photos"
          onCameraPress={jest.fn()}
          onGalleryPress={jest.fn()}
        />,
      );
    });

    const json = renderer.toJSON() as {
      children?: { type: string }[];
    };

    expect(renderer.root.findByType('PhotoSourceActionCards').props.tone).toBe('default');
    expect(json.children?.map((child) => child.type)).toEqual(['View', 'PhotoSourceActionCards']);
  });

  it('renders attachments before muted action cards when photos already exist', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <PhotoInputField
          attachments={[
            {
              id: 'photo-1',
              label: 'Apr 20, 2026',
              onRemove: jest.fn(),
              uri: 'file:///latte.jpg',
            },
          ]}
          label="Photos"
          onCameraPress={jest.fn()}
          onGalleryPress={jest.fn()}
        />,
      );
    });

    const json = renderer.toJSON() as {
      children?: {
        children?: { type: string }[];
        type: string;
      }[];
    };

    expect(renderer.root.findByType('PhotoSourceActionCards').props.tone).toBe('muted');
    expect(renderer.root.findByType('PhotoAttachmentRow').props.label).toBe('Apr 20, 2026');
    expect(json.children?.[1]?.children?.[0]?.type).toBe('PhotoAttachmentRow');
    expect(json.children?.[2]?.type).toBe('PhotoSourceActionCards');
  });
});
