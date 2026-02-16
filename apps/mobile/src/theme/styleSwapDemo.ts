import { ACTIVE_THEME_NAME, themeNames } from './ThemeProvider';
import type { ThemeName } from './tokens';

function resolveAlternateThemeName(): ThemeName {
  return themeNames.find((themeName) => themeName !== ACTIVE_THEME_NAME) ?? ACTIVE_THEME_NAME;
}

export const STYLE_SWAP_DEMO = {
  currentTheme: ACTIVE_THEME_NAME,
  alternateTheme: resolveAlternateThemeName(),
  steps: [
    'Open src/theme/ThemeProvider.tsx.',
    'Change ACTIVE_THEME_NAME to the alternate theme name in this file.',
    'Reload the app to verify color/semantic style changes across screens without editing any feature screen styles.',
  ],
} as const;
