declare const __dirname: string;
declare function require(moduleName: string): {
  readFileSync?: (path: string, encoding: string) => string;
  join?: (...pathSegments: string[]) => string;
};

const { readFileSync } = require('fs') as {
  readFileSync: (path: string, encoding: string) => string;
};
const { join } = require('path') as {
  join: (...pathSegments: string[]) => string;
};

const storeRoot = join(__dirname, '..', 'features', 'store');

function readStoreFile(fileName: string): string {
  return readFileSync(join(storeRoot, fileName), 'utf8');
}

describe('feature store architecture', () => {
  it('does not expose the featureStore compatibility adapter as the store barrel default', () => {
    expect(readStoreFile('index.ts')).not.toContain("export * from './featureStore'");
  });

  it('keeps Bill-owned interfaces in the Bill domain module', () => {
    const featureStoreSource = readStoreFile('featureStore.ts');
    const billTypesSource = readStoreFile('billTypes.ts');

    for (const interfaceName of [
      'BillListSummary',
      'BillListPageSummary',
      'BillListPage',
      'ListBillSummariesPageInput',
      'CreateBillInput',
      'UpdateBillInput',
    ]) {
      expect(featureStoreSource).not.toMatch(new RegExp(`export interface ${interfaceName}\\b`));
      expect(billTypesSource).toMatch(new RegExp(`export interface ${interfaceName}\\b`));
    }
  });
});
