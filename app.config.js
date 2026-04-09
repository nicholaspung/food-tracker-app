module.exports = () => {
  throw new Error(
    'Expo native commands must be run from apps/mobile. Use pnpm mobile:start, pnpm mobile:ios, or pnpm mobile:android from the repo root.'
  );
};
