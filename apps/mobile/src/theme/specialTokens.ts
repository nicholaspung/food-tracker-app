import type { Theme } from './ThemeProvider';

export type VisitShareThemeName = 'modern' | 'rustic' | 'minimal' | 'neon';

export interface VisitSharePalette {
  screenBackground: string;
  headerTitle: string;
  headerSubtitle: string;
  closeIcon: string;
  closeButtonBackground: string;
  optionPanelBackground: string;
  optionPanelBorder: string;
  chipBorder: string;
  chipActiveBackground: string;
  chipActiveBorder: string;
  chipLabel: string;
  chipLabelActive: string;
  statusText: string;
  canvasBackground: string;
  canvasBorder: string;
  itemBorder: string;
  itemBackground: string;
  overlayBackground: string;
  primaryText: string;
  secondaryText: string;
  overlayTopBorderColor: string;
  overlayBottomBorderColor: string;
  metaRightBackground: string;
  metaRightBorderColor: string;
  brandFooterBackground: string;
  brandFooterBorder: string;
  brandFooterText: string;
}

export function getVisitSharePalette(theme: Theme, shareTheme: VisitShareThemeName): VisitSharePalette {
  if (shareTheme === 'rustic') {
    return {
      screenBackground: 'rgba(0, 0, 0, 0.97)',
      headerTitle: 'rgba(255, 255, 255, 0.96)',
      headerSubtitle: 'rgba(255, 255, 255, 0.76)',
      closeIcon: 'rgba(255, 255, 255, 0.92)',
      closeButtonBackground: 'rgba(255, 255, 255, 0.18)',
      optionPanelBackground: 'rgba(20, 20, 20, 0.98)',
      optionPanelBorder: 'rgba(255, 255, 255, 0.12)',
      chipBorder: 'rgba(255, 255, 255, 0.24)',
      chipActiveBackground: 'rgba(255, 255, 255, 0.2)',
      chipActiveBorder: 'rgba(255, 255, 255, 0.62)',
      chipLabel: 'rgba(255, 255, 255, 0.72)',
      chipLabelActive: 'rgba(255, 255, 255, 0.96)',
      statusText: 'rgba(255, 255, 255, 0.72)',
      canvasBackground: theme.colors.background.muted,
      canvasBorder: 'transparent',
      itemBorder: theme.colors.border.warning,
      itemBackground: theme.colors.background.surface,
      overlayBackground: 'rgba(64, 43, 26, 0.74)',
      primaryText: 'rgba(255, 255, 255, 0.96)',
      secondaryText: 'rgba(255, 255, 255, 0.9)',
      overlayTopBorderColor: 'rgba(255, 238, 214, 0.5)',
      overlayBottomBorderColor: 'rgba(255, 238, 214, 0.28)',
      metaRightBackground: 'rgba(30, 16, 8, 0.45)',
      metaRightBorderColor: 'rgba(255, 235, 210, 0.35)',
      brandFooterBackground: 'rgba(64, 43, 26, 0.74)',
      brandFooterBorder: 'rgba(255, 238, 214, 0.5)',
      brandFooterText: 'rgba(255, 255, 255, 0.92)',
    };
  }

  if (shareTheme === 'minimal') {
    return {
      screenBackground: 'rgba(0, 0, 0, 0.97)',
      headerTitle: 'rgba(255, 255, 255, 0.96)',
      headerSubtitle: 'rgba(255, 255, 255, 0.76)',
      closeIcon: 'rgba(255, 255, 255, 0.92)',
      closeButtonBackground: 'rgba(255, 255, 255, 0.18)',
      optionPanelBackground: 'rgba(20, 20, 20, 0.98)',
      optionPanelBorder: 'rgba(255, 255, 255, 0.12)',
      chipBorder: 'rgba(255, 255, 255, 0.24)',
      chipActiveBackground: 'rgba(255, 255, 255, 0.2)',
      chipActiveBorder: 'rgba(255, 255, 255, 0.62)',
      chipLabel: 'rgba(255, 255, 255, 0.72)',
      chipLabelActive: 'rgba(255, 255, 255, 0.96)',
      statusText: 'rgba(255, 255, 255, 0.72)',
      canvasBackground: theme.colors.background.surface,
      canvasBorder: 'transparent',
      itemBorder: 'rgba(255, 255, 255, 0.08)',
      itemBackground: theme.colors.background.surface,
      overlayBackground: 'rgba(255, 255, 255, 0.88)',
      primaryText: theme.colors.text.primary,
      secondaryText: theme.colors.text.secondary,
      overlayTopBorderColor: 'rgba(17, 24, 39, 0.2)',
      overlayBottomBorderColor: 'rgba(17, 24, 39, 0.08)',
      metaRightBackground: 'rgba(17, 24, 39, 0.06)',
      metaRightBorderColor: 'rgba(17, 24, 39, 0.2)',
      brandFooterBackground: 'rgba(255, 255, 255, 0.88)',
      brandFooterBorder: 'rgba(17, 24, 39, 0.2)',
      brandFooterText: theme.colors.text.secondary,
    };
  }

  if (shareTheme === 'neon') {
    return {
      screenBackground: 'rgba(0, 0, 0, 0.97)',
      headerTitle: 'rgba(255, 255, 255, 0.96)',
      headerSubtitle: 'rgba(255, 255, 255, 0.76)',
      closeIcon: 'rgba(255, 255, 255, 0.92)',
      closeButtonBackground: 'rgba(255, 255, 255, 0.18)',
      optionPanelBackground: 'rgba(20, 20, 20, 0.98)',
      optionPanelBorder: 'rgba(255, 255, 255, 0.12)',
      chipBorder: 'rgba(255, 255, 255, 0.24)',
      chipActiveBackground: 'rgba(255, 255, 255, 0.2)',
      chipActiveBorder: 'rgba(255, 255, 255, 0.62)',
      chipLabel: 'rgba(255, 255, 255, 0.72)',
      chipLabelActive: 'rgba(255, 255, 255, 0.96)',
      statusText: 'rgba(255, 255, 255, 0.72)',
      canvasBackground: 'rgba(6, 10, 20, 1)',
      canvasBorder: 'rgba(22, 217, 255, 1)',
      itemBorder: 'rgba(22, 217, 255, 1)',
      itemBackground: 'rgba(4, 8, 19, 1)',
      overlayBackground: 'rgba(3, 9, 24, 0.88)',
      primaryText: 'rgba(163, 240, 255, 1)',
      secondaryText: 'rgba(226, 246, 255, 1)',
      overlayTopBorderColor: 'rgba(22, 217, 255, 1)',
      overlayBottomBorderColor: 'rgba(140, 55, 255, 1)',
      metaRightBackground: 'rgba(7, 16, 38, 0.72)',
      metaRightBorderColor: 'rgba(22, 217, 255, 1)',
      brandFooterBackground: 'rgba(3, 9, 24, 0.88)',
      brandFooterBorder: 'rgba(22, 217, 255, 1)',
      brandFooterText: 'rgba(226, 246, 255, 1)',
    };
  }

  return {
    screenBackground: 'rgba(0, 0, 0, 0.97)',
    headerTitle: 'rgba(255, 255, 255, 0.96)',
    headerSubtitle: 'rgba(255, 255, 255, 0.76)',
    closeIcon: 'rgba(255, 255, 255, 0.92)',
    closeButtonBackground: 'rgba(255, 255, 255, 0.18)',
    optionPanelBackground: 'rgba(20, 20, 20, 0.98)',
    optionPanelBorder: 'rgba(255, 255, 255, 0.12)',
    chipBorder: 'rgba(255, 255, 255, 0.24)',
    chipActiveBackground: 'rgba(255, 255, 255, 0.2)',
    chipActiveBorder: 'rgba(255, 255, 255, 0.62)',
    chipLabel: 'rgba(255, 255, 255, 0.72)',
    chipLabelActive: 'rgba(255, 255, 255, 0.96)',
    statusText: 'rgba(255, 255, 255, 0.72)',
    canvasBackground: theme.colors.background.surface,
    canvasBorder: 'transparent',
    itemBorder: 'rgba(255, 255, 255, 0.08)',
    itemBackground: theme.colors.background.surface,
    overlayBackground: 'rgba(15, 23, 40, 0.72)',
    primaryText: 'rgba(255, 255, 255, 0.96)',
    secondaryText: 'rgba(255, 255, 255, 0.9)',
    overlayTopBorderColor: 'transparent',
    overlayBottomBorderColor: 'transparent',
    metaRightBackground: 'transparent',
    metaRightBorderColor: 'transparent',
    brandFooterBackground: 'rgba(15, 23, 40, 0.72)',
    brandFooterBorder: 'transparent',
    brandFooterText: 'rgba(255, 255, 255, 0.92)',
  };
}

export function getPhotoViewerPalette(_theme: Theme) {
  return {
    background: 'rgba(0, 0, 0, 0.96)',
    controlBackground: 'rgba(255, 255, 255, 0.2)',
    text: 'rgba(255, 255, 255, 0.92)',
  } as const;
}
