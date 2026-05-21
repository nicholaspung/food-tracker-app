function parseCsvFirstColumn(line: string): string {
  if (!line.trim()) {
    return '';
  }

  let inQuotes = false;
  let value = '';

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      const nextChar = line[index + 1];
      if (inQuotes && nextChar === '"') {
        value += '"';
        index += 1;
        continue;
      }

      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      break;
    }

    value += char;
  }

  return value.trim();
}

export function parseMenuItemNamesFromCsv(csvText: string): string[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return [];
  }

  const names: string[] = [];
  const firstLineFirstColumn = parseCsvFirstColumn(lines[0]).toLowerCase();
  const startIndex =
    firstLineFirstColumn.includes('menu_item') ||
    firstLineFirstColumn.includes('menu item')
      ? 1
      : 0;

  for (let index = startIndex; index < lines.length; index += 1) {
    const name = parseCsvFirstColumn(lines[index]);
    if (!name || names.includes(name)) {
      continue;
    }

    names.push(name);
  }

  return names;
}
