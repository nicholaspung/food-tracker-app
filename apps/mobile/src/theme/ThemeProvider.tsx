import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { useColorScheme } from 'react-native';

import {
  defaultThemeName,
  paletteTokens,
  radiusTokens,
  sizeTokens,
  spacingTokens,
  typographyTokens,
  type PaletteTokens,
  type ThemeName,
} from './tokens';
import { logger } from '../lib/logger';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ThemeColorScheme = 'light' | 'dark';

export const THEME_PREFERENCE_STORAGE_KEY = 'ui.theme.preference.v1';

export interface Theme {
  name: ThemeName;
  colorScheme: ThemeColorScheme;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  isPreferenceLoaded: boolean;
  spacing: typeof spacingTokens;
  radii: typeof radiusTokens;
  sizes: typeof sizeTokens;
  typography: typeof typographyTokens;
  colors: {
    background: {
      app: string;
      surface: string;
      muted: string;
      inverse: string;
      overlay: string;
    };
    fill: {
      brand: string;
      info: string;
      warning: string;
      danger: string;
      success: string;
    };
    text: {
      primary: string;
      secondary: string;
      muted: string;
      inverse: string;
      brand: string;
      warning: string;
      danger: string;
      success: string;
      info: string;
    };
    border: {
      default: string;
      subtle: string;
      strong: string;
      brand: string;
      warning: string;
      danger: string;
      success: string;
      info: string;
    };
    button: {
      primaryBg: string;
      primaryPressed: string;
      primaryDisabledBg: string;
      primaryText: string;
      secondaryBg: string;
      secondaryPressed: string;
      secondaryDisabledBg: string;
      secondaryText: string;
      secondaryBorder: string;
    };
    status: {
      warningBg: string;
      warningBorder: string;
      warningText: string;
      dangerBg: string;
      dangerBorder: string;
      dangerText: string;
      successBg: string;
      successBorder: string;
      successText: string;
      infoBg: string;
      infoBorder: string;
      infoText: string;
    };
    rating: {
      one: string;
      two: string;
      three: string;
      four: string;
      five: string;
    };
  };
}

function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

function resolveThemeColorScheme(preference: ThemePreference, systemColorScheme: string | null | undefined): ThemeColorScheme {
  if (preference === 'light' || preference === 'dark') {
    return preference;
  }

  return systemColorScheme === 'dark' ? 'dark' : 'light';
}

function createTheme(
  name: ThemeName,
  colorScheme: ThemeColorScheme,
  preference: ThemePreference,
  isPreferenceLoaded: boolean,
  setPreference: (preference: ThemePreference) => void,
  palette: PaletteTokens,
): Theme {
  const solidFill = {
    brand: palette.brand,
    info: palette.infoText,
    warning: palette.warningText,
    danger: palette.dangerText,
    success: palette.successText,
  } as const;

  return {
    name,
    colorScheme,
    preference,
    setPreference,
    isPreferenceLoaded,
    spacing: spacingTokens,
    radii: radiusTokens,
    sizes: sizeTokens,
    typography: typographyTokens,
    colors: {
      background: {
        app: palette.backgroundApp,
        surface: palette.backgroundSurface,
        muted: palette.backgroundMuted,
        inverse: palette.backgroundInverse,
        overlay: palette.overlay,
      },
      fill: solidFill,
      text: {
        primary: palette.textPrimary,
        secondary: palette.textSecondary,
        muted: palette.textMuted,
        inverse: palette.textInverse,
        brand: palette.brand,
        warning: palette.warningText,
        danger: palette.dangerText,
        success: palette.successText,
        info: palette.infoText,
      },
      border: {
        default: palette.borderDefault,
        subtle: palette.borderSubtle,
        strong: palette.borderStrong,
        brand: solidFill.brand,
        warning: palette.warningBorder,
        danger: palette.dangerBorder,
        success: palette.successBorder,
        info: palette.infoBorder,
      },
      button: {
        primaryBg: solidFill.brand,
        primaryPressed: palette.brandStrong,
        primaryDisabledBg: palette.borderStrong,
        primaryText: palette.textInverse,
        secondaryBg: palette.backgroundSurface,
        secondaryPressed: palette.backgroundMuted,
        secondaryDisabledBg: palette.backgroundMuted,
        secondaryText: palette.textPrimary,
        secondaryBorder: palette.borderStrong,
      },
      status: {
        warningBg: palette.warningSurface,
        warningBorder: palette.warningBorder,
        warningText: palette.warningText,
        dangerBg: palette.dangerSurface,
        dangerBorder: palette.dangerBorder,
        dangerText: palette.dangerText,
        successBg: palette.successSurface,
        successBorder: palette.successBorder,
        successText: palette.successText,
        infoBg: palette.infoSurface,
        infoBorder: palette.infoBorder,
        infoText: palette.infoText,
      },
      rating: {
        one: palette.ratingOne,
        two: palette.ratingTwo,
        three: palette.ratingThree,
        four: palette.ratingFour,
        five: palette.ratingFive,
      },
    },
  };
}

const ACTIVE_THEME_NAME: ThemeName = defaultThemeName;

const ThemeContext = createContext<Theme | null>(null);

interface ThemeProviderProps {
  themeName?: ThemeName;
}

export function ThemeProvider({ children, themeName = ACTIVE_THEME_NAME }: PropsWithChildren<ThemeProviderProps>) {
  const systemColorScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [isPreferenceLoaded, setIsPreferenceLoaded] = useState(false);

  useEffect(() => {
    let isMounted = true;

    void AsyncStorage.getItem(THEME_PREFERENCE_STORAGE_KEY)
      .then((storedPreference) => {
        if (!isMounted) {
          return;
        }

        setPreferenceState(isThemePreference(storedPreference) ? storedPreference : 'system');
      })
      .catch((error) => {
        logger.warn('[ThemeProvider] Failed to load theme preference:', error);
        if (isMounted) {
          setPreferenceState('system');
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsPreferenceLoaded(true);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const setPreference = useCallback((nextPreference: ThemePreference) => {
    if (!isThemePreference(nextPreference)) {
      return;
    }

    setPreferenceState(nextPreference);
    void AsyncStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, nextPreference).catch((error) => {
      logger.warn('[ThemeProvider] Failed to persist theme preference:', error);
    });
  }, []);

  const colorScheme = resolveThemeColorScheme(preference, systemColorScheme);

  const theme = useMemo(() => {
    const paletteGroup = (paletteTokens[themeName] ?? paletteTokens[defaultThemeName]) as {
      light: PaletteTokens;
      dark?: PaletteTokens;
    };
    const defaultPaletteGroup = paletteTokens[defaultThemeName] as {
      light: PaletteTokens;
      dark?: PaletteTokens;
    };
    const palette = paletteGroup[colorScheme] ?? defaultPaletteGroup[colorScheme] ?? paletteGroup.light;

    return createTheme(themeName, colorScheme, preference, isPreferenceLoaded, setPreference, palette);
  }, [colorScheme, isPreferenceLoaded, preference, setPreference, themeName]);

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }

  return context;
}
