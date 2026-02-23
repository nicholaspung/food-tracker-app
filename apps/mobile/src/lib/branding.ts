import type { ImageSourcePropType } from 'react-native';

export const APP_NAME = 'Yummy Recs';
// React Native static assets resolve via require() at runtime.
// eslint-disable-next-line @typescript-eslint/no-require-imports
export const BRAND_LOGO: ImageSourcePropType = require('../../assets/brand-logo.png');
