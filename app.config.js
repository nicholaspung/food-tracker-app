const mobileConfig = require('./apps/mobile/app.json');

const mobileExpoConfig = mobileConfig.expo ?? {};

module.exports = () => ({
  ...mobileExpoConfig,
  entryPoint: './apps/mobile/index.js',
  icon: './apps/mobile/assets/brand-logo.png',
  web: {
    ...(mobileExpoConfig.web ?? {}),
    favicon: './apps/mobile/assets/brand-logo.png',
  },
  android: {
    ...(mobileExpoConfig.android ?? {}),
    adaptiveIcon: {
      ...(mobileExpoConfig.android?.adaptiveIcon ?? {}),
      foregroundImage: './apps/mobile/assets/brand-logo.png',
    },
  },
});
