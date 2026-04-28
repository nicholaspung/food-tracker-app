export const spacingTokens = {
  none: 0,
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
} as const;

export const radiusTokens = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const sizeTokens = {
  buttonHeight: 46,
  secondaryButtonHeight: 40,
  inputMinHeight: 50,
  modalMaxWidth: 520,
  skeletonPulseMs: 900,
} as const;

export const typographyTokens = {
  displayLg: {
    fontSize: 38,
    lineHeight: 44,
    fontWeight: '700',
  },
  displayMd: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '700',
  },
  displaySm: {
    fontSize: 26,
    lineHeight: 30,
    fontWeight: '700',
  },
  titleLg: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "700",
  },
  titleMd: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "700",
  },
  bodyLg: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400',
  },
  bodyLgComfortable: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '400',
  },
  bodyLgCompact: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '400',
  },
  bodyLgMedium: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '500',
  },
  bodyLgBold: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '700',
  },
  bodyLgTightMedium: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '500',
  },
  bodyLgTightSemiBold: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '600',
  },
  bodyLgTightBold: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '700',
  },
  bodyBase: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '400',
  },
  bodyBaseSemiBold: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },
  bodyMd: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400',
  },
  bodyMdMedium: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  bodyMdSemiBold: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  bodyMdBold: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  bodyMdTight: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '400',
  },
  bodyMdTightMedium: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '500',
  },
  bodySm: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '400',
  },
  bodySmCompact: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '400',
  },
  bodySmSemiBold: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },
  bodySmTight: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '400',
  },
  bodySmTightMedium: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  bodySmTightSemiBold: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  bodySmTightBold: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  label: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  labelStrong: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  labelMd: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600',
  },
  labelMdBold: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
  },
  titleBase: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
  },
  sectionTitleTight: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '700',
  },
  cardTitle: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '700',
  },
  titleSm: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
  titleSmSemiBold: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
  },
  titleXs: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  titleXsTight: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '700',
  },
  metric: {
    fontSize: 20,
    lineHeight: 20,
    fontWeight: '700',
  },
  eyebrow: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  caption: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
  },
  captionRegular: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '400',
  },
  captionMedium: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '500',
  },
  captionStrong: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
  },
  microStrong: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
  },
  meta: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  metaRegular: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400',
  },
  metaTight: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '400',
  },
  metaTightSemiBold: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '600',
  },
  metaTightStrong: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '700',
  },
  button: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '600',
  },
} as const;

export interface PaletteTokens {
  brandStrong: string;
  brand: string;
  brandMuted: string;
  backgroundApp: string;
  backgroundSurface: string;
  backgroundMuted: string;
  backgroundInverse: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textInverse: string;
  borderDefault: string;
  borderSubtle: string;
  borderStrong: string;
  warningSurface: string;
  warningBorder: string;
  warningText: string;
  dangerSurface: string;
  dangerBorder: string;
  dangerText: string;
  successSurface: string;
  successBorder: string;
  successText: string;
  infoSurface: string;
  infoBorder: string;
  infoText: string;
  ratingOne: string;
  ratingTwo: string;
  ratingThree: string;
  ratingFour: string;
  ratingFive: string;
  overlay: string;
}

type PaletteTokenGroup = {
  light: PaletteTokens;
  dark?: PaletteTokens;
};

export const paletteTokens = {
  ocean: {
    light: {
      brandStrong: "#0B4FDB",
      brand: "#236BFE",
      brandMuted: "#E8F0FF",
      backgroundApp: "#F5F7FB",
      backgroundSurface: "#FFFFFF",
      backgroundMuted: "#EEF2F8",
      backgroundInverse: "#0F1728",
      textPrimary: "#111827",
      textSecondary: "#364152",
      textMuted: "#6C768A",
      textInverse: "#FFFFFF",
      borderDefault: "#C9D2E1",
      borderSubtle: "#DFE5F0",
      borderStrong: "#8A98B1",
      warningSurface: "#FFF7E6",
      warningBorder: "#F6C568",
      warningText: "#855400",
      dangerSurface: "#FFEDEE",
      dangerBorder: "#F2A1A1",
      dangerText: "#9B1C1C",
      successSurface: "#E9F8F0",
      successBorder: "#93D8B0",
      successText: "#1F6A42",
      infoSurface: "#ECF3FF",
      infoBorder: "#9EB9F2",
      infoText: "#1E3A8A",
      ratingOne: "#ef4444",
      ratingTwo: "#f97316",
      ratingThree: "#eab308",
      ratingFour: "#84cc16",
      ratingFive: "#22c55e",
      overlay: "rgba(15, 23, 40, 0.45)",
    },
  },
  sunrise: {
    light: {
      brandStrong: "#9E4600",
      brand: "#C35A00",
      brandMuted: "#FFF1E2",
      backgroundApp: "#FFF8F2",
      backgroundSurface: "#FFFFFF",
      backgroundMuted: "#FFF1E6",
      backgroundInverse: "#2B1C12",
      textPrimary: "#2F241B",
      textSecondary: "#5A4536",
      textMuted: "#8A6E5D",
      textInverse: "#FFFFFF",
      borderDefault: "#E2CCB9",
      borderSubtle: "#F1E0D1",
      borderStrong: "#BF987C",
      warningSurface: "#FFF6DF",
      warningBorder: "#E3B74A",
      warningText: "#7F4D00",
      dangerSurface: "#FCECEC",
      dangerBorder: "#E7A2A2",
      dangerText: "#8E1F1F",
      successSurface: "#EAF6EE",
      successBorder: "#97CCAA",
      successText: "#23593A",
      infoSurface: "#EEF2FF",
      infoBorder: "#A3B0E5",
      infoText: "#27357A",
      ratingOne: "#ef4444",
      ratingTwo: "#f97316",
      ratingThree: "#eab308",
      ratingFour: "#84cc16",
      ratingFive: "#22c55e",
      overlay: "rgba(43, 28, 18, 0.4)",
    },
    dark: {
      brandStrong: "#F97316",
      brand: "#FB923C",
      brandMuted: "#3A2418",
      backgroundApp: "#11100E",
      backgroundSurface: "#1B1815",
      backgroundMuted: "#27211C",
      backgroundInverse: "#FFF7ED",
      textPrimary: "#FFF7ED",
      textSecondary: "#E8D7C7",
      textMuted: "#BBA694",
      textInverse: "#1A120C",
      borderDefault: "#3A3028",
      borderSubtle: "#2D261F",
      borderStrong: "#6B5748",
      warningSurface: "#3A2A12",
      warningBorder: "#B7791F",
      warningText: "#FACC15",
      dangerSurface: "#3A1717",
      dangerBorder: "#B91C1C",
      dangerText: "#FCA5A5",
      successSurface: "#123322",
      successBorder: "#15803D",
      successText: "#86EFAC",
      infoSurface: "#17233A",
      infoBorder: "#3B82F6",
      infoText: "#BFDBFE",
      ratingOne: "#F87171",
      ratingTwo: "#FB923C",
      ratingThree: "#FACC15",
      ratingFour: "#A3E635",
      ratingFive: "#4ADE80",
      overlay: "rgba(0, 0, 0, 0.62)",
    },
  },
} as const satisfies Record<string, PaletteTokenGroup>;

export type ThemeName = keyof typeof paletteTokens;

export const defaultThemeName: ThemeName = 'sunrise';
