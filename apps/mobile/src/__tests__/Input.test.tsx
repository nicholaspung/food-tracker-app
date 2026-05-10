import React from 'react';
import { Platform, TextInput } from 'react-native';
import { act, create } from 'react-test-renderer';

import { Input } from '../ui/Input';

const mockReact = React;

const TEST_THEME = {
  colors: {
    background: {
      muted: 'background-muted',
      surface: 'background-surface',
    },
    border: {
      danger: 'border-danger',
      default: 'border-default',
      strong: 'border-strong',
    },
    text: {
      muted: 'text-muted',
      primary: 'text-primary',
    },
  },
  radii: {
    md: 12,
    pill: 999,
  },
  sizes: {
    inputMinHeight: 48,
  },
  spacing: {
    md: 16,
    sm: 12,
    xs: 8,
  },
  typography: {
    bodyLg: {
      fontSize: 16,
      lineHeight: 24,
    },
  },
} as const;

jest.mock('@expo/vector-icons', () => ({
  Ionicons: (props: Record<string, unknown>) => mockReact.createElement('Ionicons', props),
}));

jest.mock('../theme', () => ({
  createThemedStyles:
    <Args extends unknown[], Styles>(
      factory: (theme: typeof TEST_THEME, ...args: Args) => Styles,
    ) =>
    (...args: Args) =>
      factory(TEST_THEME, ...args),
  useTheme: () => TEST_THEME,
}));

jest.mock('../ui/Text', () => ({
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

function setPlatformOS(os: 'ios' | 'android') {
  Object.defineProperty(Platform, 'OS', {
    configurable: true,
    get: () => os,
  });
}

async function renderTextInput(passwordMode: React.ComponentProps<typeof Input>['passwordMode']) {
  let renderer: any = null;

  await act(async () => {
    renderer = create(<Input onChangeText={jest.fn()} passwordMode={passwordMode} value="" />);
  });

  return renderer!.root.findByType(TextInput);
}

describe('Input passwordMode', () => {
  const originalPlatformOS = Platform.OS;

  afterEach(() => {
    setPlatformOS(originalPlatformOS as 'ios' | 'android');
  });

  it('uses iOS new-password semantics without Android autocomplete props', async () => {
    setPlatformOS('ios');

    const input = await renderTextInput('new');

    expect(input.props.secureTextEntry).toBe(true);
    expect(input.props.autoCapitalize).toBe('none');
    expect(input.props.autoCorrect).toBe(false);
    expect(input.props.spellCheck).toBe(false);
    expect(input.props.textContentType).toBe('newPassword');
    expect(input.props.passwordRules).toBe('minlength: 8;');
    expect(input.props.autoComplete).toBeUndefined();
  });

  it('opts iOS confirm-password fields out of autofill', async () => {
    setPlatformOS('ios');

    const input = await renderTextInput('confirm');

    expect(input.props.secureTextEntry).toBe(true);
    expect(input.props.textContentType).toBe('none');
    expect(input.props.passwordRules).toBeUndefined();
    expect(input.props.autoComplete).toBeUndefined();
  });

  it('uses iOS saved-password semantics for current-password fields', async () => {
    setPlatformOS('ios');

    const input = await renderTextInput('current');

    expect(input.props.secureTextEntry).toBe(true);
    expect(input.props.textContentType).toBe('password');
    expect(input.props.passwordRules).toBeUndefined();
    expect(input.props.autoComplete).toBeUndefined();
  });

  it('uses Android autocomplete semantics for password modes', async () => {
    setPlatformOS('android');

    expect((await renderTextInput('new')).props).toEqual(
      expect.objectContaining({
        autoComplete: 'new-password',
        importantForAutofill: undefined,
        secureTextEntry: true,
        textContentType: undefined,
      }),
    );
    expect((await renderTextInput('current')).props).toEqual(
      expect.objectContaining({
        autoComplete: 'current-password',
        importantForAutofill: undefined,
        secureTextEntry: true,
        textContentType: undefined,
      }),
    );
    expect((await renderTextInput('confirm')).props).toEqual(
      expect.objectContaining({
        autoComplete: 'off',
        importantForAutofill: 'no',
        secureTextEntry: true,
        textContentType: undefined,
      }),
    );
    expect((await renderTextInput('off')).props).toEqual(
      expect.objectContaining({
        autoComplete: 'off',
        importantForAutofill: 'no',
        secureTextEntry: true,
        textContentType: undefined,
      }),
    );
  });
});
