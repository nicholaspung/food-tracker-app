import * as Updates from 'expo-updates';

const NON_PRODUCTION_UPDATE_CHANNELS = new Set(['beta', 'development', 'dev', 'ios-simulator', 'preview']);

export function shouldShowAppUpdateStatus(): boolean {
  if (__DEV__) {
    return true;
  }

  const channel = Updates.channel?.trim().toLowerCase();
  if (!channel) {
    return false;
  }

  return NON_PRODUCTION_UPDATE_CHANNELS.has(channel);
}
