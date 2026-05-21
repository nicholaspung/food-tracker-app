import { parseMenuItemNamesFromCsv } from '../features/photoProcessing/menuItemCsvParsing';

describe('parseMenuItemNamesFromCsv', () => {
  it('skips menu item headers, reads quoted first columns, and suppresses duplicates', () => {
    const result = parseMenuItemNamesFromCsv([
      'menu_item,description',
      '"Spicy, Ramen","house special"',
      'Gyoza,pan fried',
      '"Spicy, Ramen","duplicate"',
      '',
    ].join('\n'));

    expect(result).toEqual(['Spicy, Ramen', 'Gyoza']);
  });

  it('parses headerless csv from the first row', () => {
    expect(parseMenuItemNamesFromCsv('Burger\nFries')).toEqual(['Burger', 'Fries']);
  });
});
