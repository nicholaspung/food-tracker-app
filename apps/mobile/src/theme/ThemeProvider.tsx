import { createContext, useContext, useMemo } from 'react';
import type { PropsWithChildren } from 'react';

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

export interface Theme {
  name: ThemeName;
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

function createTheme(name: ThemeName, palette: PaletteTokens): Theme {
  const solidFill = {
    brand: palette.brand,
    info: palette.infoText,
    warning: palette.warningText,
    danger: palette.dangerText,
    success: palette.successText,
  } as const;

  return {
    name,
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

const themes: Record<ThemeName, Theme> = {
  ocean: createTheme('ocean', paletteTokens.ocean),
  sunrise: createTheme('sunrise', paletteTokens.sunrise),
};

const ACTIVE_THEME_NAME: ThemeName = defaultThemeName;

const ThemeContext = createContext<Theme | null>(null);

interface ThemeProviderProps {
  themeName?: ThemeName;
}

export function ThemeProvider({ children, themeName = ACTIVE_THEME_NAME }: PropsWithChildren<ThemeProviderProps>) {
  const theme = useMemo(() => themes[themeName] ?? themes[defaultThemeName], [themeName]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }

  return context;
}
