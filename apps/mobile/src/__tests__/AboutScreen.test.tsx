import React from 'react';
import { act, create } from 'react-test-renderer';

import { AboutScreen } from '../screens/AboutScreen';

const mockReact = React;
const mockFormatAppVersionLabel = jest.fn(() => 'v1.2.3');

jest.mock('../lib/appMetadata', () => ({
  formatAppVersionLabel: () => mockFormatAppVersionLabel(),
}));

jest.mock('../theme', () => ({
  createThemedStyles: () => () => ({}),
}));

jest.mock('../ui', () => ({
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

jest.mock('../components/shared', () => ({
  BackHeaderScreenScaffold: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('BackHeaderScreenScaffold', props, children),
  OptionList: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('OptionList', props, children),
  OptionListRow: (
    { rightAccessory, ...props }: Record<string, unknown> & { rightAccessory?: React.ReactNode },
  ) => mockReact.createElement('OptionListRow', { ...props, rightAccessory }, rightAccessory),
  SectionCard: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('SectionCard', props, children),
}));

function collectText(node: any): string[] {
  return node.root
    .findAllByType('Text')
    .flatMap((textNode: any) => {
      const { children } = textNode.props;
      return Array.isArray(children) ? children : [children];
    })
    .filter((value: unknown): value is string => typeof value === 'string');
}

describe('AboutScreen', () => {
  const navigation = {
    canGoBack: jest.fn(() => true),
    goBack: jest.fn(),
    navigate: jest.fn(),
  };

  beforeEach(() => {
    mockFormatAppVersionLabel.mockClear();
    navigation.canGoBack.mockReturnValue(true);
    navigation.goBack.mockReset();
    navigation.navigate.mockReset();
  });

  it('renders version-only app information without OTA controls or metadata', async () => {
    let renderer: any;
    await act(async () => {
      renderer = create(
        <AboutScreen
          navigation={navigation as never}
          route={{
            key: 'About-test',
            name: 'About',
          } as never}
        />,
      );
    });

    const optionRows = renderer.root.findAllByType('OptionListRow');
    const versionRow = optionRows.find((node: any) => node.props.title === 'Version');

    expect(versionRow).toBeDefined();
    expect(versionRow?.props.subtitle).toBe('Current app version');
    expect(versionRow?.props.rightAccessory).toBeDefined();
    expect(optionRows.map((node: any) => node.props.title)).toEqual([
      'Version',
      'Terms of Service',
      'Privacy Policy',
    ]);

    const renderedText = collectText(renderer);
    expect(renderedText).toContain('v1.2.3');
    expect(renderedText).not.toContain('Runtime');
    expect(renderedText).not.toContain('Channel');
    expect(renderedText).not.toContain('Current OTA');
    expect(renderedText).not.toContain('Latest Available');
    expect(renderedText).not.toContain('Environment');
    expect(renderedText).not.toContain('Backend');
    expect(renderedText).not.toContain('Make App Latest OTA');
    expect(renderer.root.findAllByType('Button')).toHaveLength(0);
  });
});
