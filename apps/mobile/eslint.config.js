const { FlatCompat } = require('@eslint/eslintrc');

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

module.exports = [
  ...compat.extends('expo'),
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/theme/tokens.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "Literal[value=/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/]",
          message: 'Use theme tokens instead of raw hex literals in feature code.',
        },
      ],
    },
  },
];
