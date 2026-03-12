const { getPostHogExpoConfig } = require('posthog-react-native/metro');

const config = getPostHogExpoConfig(__dirname);

config.resolver = config.resolver ?? {};
config.resolver.assetExt = config.resolver.assetExt ?? [];

if (!config.resolver.assetExt.includes('wasm')) {
  config.resolver.assetExt.push('wasm');
}

module.exports = config;
