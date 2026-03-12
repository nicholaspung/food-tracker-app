import { Platform } from 'react-native';

// Subscription purchase and management flows stay on web for now.
export const isBillingScreenEnabled = Platform.OS === 'web';
