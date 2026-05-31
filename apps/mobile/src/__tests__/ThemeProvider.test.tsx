import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, create } from 'react-test-renderer';
import { useColorScheme } from 'react-native';

import { paletteTokens, ThemeProvider, THEME_PREFERENCE_STORAGE_KEY, useTheme, type Theme } from '../theme';

jest.mock('react-native', () => {
  return {
    useColorScheme: jest.fn(),
  };
});

const mockUseColorScheme = useColorScheme as jest.MockedFunction<typeof useColorScheme>;

function ThemeCapture({ onTheme }: { onTheme: (theme: Theme) => void }) {
  const theme = useTheme();
  onTheme(theme);
  return null;
}

async function renderTheme(onTheme: (theme: Theme) => void) {
  let renderer: ReturnType<typeof create> | null = null;

  await act(async () => {
    renderer = create(
      <ThemeProvider>
        <ThemeCapture onTheme={onTheme} />
      </ThemeProvider>,
    );
  });

  await act(async () => {});

  return renderer;
}

describe('ThemeProvider', () => {
  beforeEach(async () => {
    mockUseColorScheme.mockReset();
    mockUseColorScheme.mockReturnValue('light');
    await AsyncStorage.clear();
  });

  it('defaults to system preference when no stored preference exists', async () => {
    let capturedTheme: Theme | undefined;

    await renderTheme((theme) => {
      capturedTheme = theme;
    });

    expect(capturedTheme).toBeDefined();
    expect(capturedTheme!.preference).toBe('system');
    expect(capturedTheme!.colorScheme).toBe('light');
    expect(capturedTheme!.isPreferenceLoaded).toBe(true);
  });

  it('uses the dark palette when system preference resolves to dark', async () => {
    mockUseColorScheme.mockReturnValue('dark');
    let capturedTheme: Theme | undefined;

    await renderTheme((theme) => {
      capturedTheme = theme;
    });

    expect(capturedTheme).toBeDefined();
    expect(capturedTheme!.preference).toBe('system');
    expect(capturedTheme!.colorScheme).toBe('dark');
    expect(capturedTheme!.colors.background.app).toBe(paletteTokens.sunrise.dark.backgroundApp);
  });

  it('uses the light palette when a light override is stored and the OS is dark', async () => {
    mockUseColorScheme.mockReturnValue('dark');
    await AsyncStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, 'light');
    let capturedTheme: Theme | undefined;

    await renderTheme((theme) => {
      capturedTheme = theme;
    });

    expect(capturedTheme).toBeDefined();
    expect(capturedTheme!.preference).toBe('light');
    expect(capturedTheme!.colorScheme).toBe('light');
    expect(capturedTheme!.colors.background.app).toBe(paletteTokens.sunrise.light.backgroundApp);
  });

  it('persists preference changes', async () => {
    let capturedTheme: Theme | undefined;

    await renderTheme((theme) => {
      capturedTheme = theme;
    });

    await act(async () => {
      capturedTheme!.setPreference('dark');
    });

    expect(await AsyncStorage.getItem(THEME_PREFERENCE_STORAGE_KEY)).toBe('dark');
    expect(capturedTheme).toBeDefined();
    expect(capturedTheme!.preference).toBe('dark');
    expect(capturedTheme!.colorScheme).toBe('dark');
  });

  it('ignores invalid stored preferences', async () => {
    await AsyncStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, 'sepia');
    let capturedTheme: Theme | undefined;

    await renderTheme((theme) => {
      capturedTheme = theme;
    });

    expect(capturedTheme).toBeDefined();
    expect(capturedTheme!.preference).toBe('system');
    expect(capturedTheme!.colorScheme).toBe('light');
  });
});
