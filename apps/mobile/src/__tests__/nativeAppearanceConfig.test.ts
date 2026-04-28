declare const __dirname: string;
declare function require(moduleName: string): {
  readFileSync?: (path: string, encoding: 'utf8') => string;
  join?: (...segments: string[]) => string;
};

const { readFileSync } = require('node:fs') as {
  readFileSync: (path: string, encoding: 'utf8') => string;
};
const { join } = require('node:path') as {
  join: (...segments: string[]) => string;
};

describe('native appearance config', () => {
  const mobileRoot = join(__dirname, '..', '..');

  it('allows Expo to follow the system color scheme', () => {
    const appConfig = JSON.parse(readFileSync(join(mobileRoot, 'app.json'), 'utf8')) as {
      expo?: {
        userInterfaceStyle?: string;
      };
    };

    expect(appConfig.expo?.userInterfaceStyle).toBe('automatic');
  });

  it('allows iOS native builds to follow the system color scheme', () => {
    const plist = readFileSync(join(mobileRoot, 'ios', 'YummyRecs', 'Info.plist'), 'utf8');

    expect(plist).toContain('<key>UIUserInterfaceStyle</key>');
    expect(plist).toContain('<string>Automatic</string>');
  });
});
