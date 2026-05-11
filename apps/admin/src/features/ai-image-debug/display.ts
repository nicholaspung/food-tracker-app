const supportedImageTypes = new Set([
  'image/heic',
  'image/heif',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export function isSupportedDebugImage(file: File) {
  if (supportedImageTypes.has(file.type)) {
    return true;
  }

  return /\.(heic|heif|jpe?g|png|webp)$/i.test(file.name);
}

export function formatFileSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB'];
  let value = size;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value >= 10 || unitIndex === 0 ? Math.round(value) : value.toFixed(1)} ${units[unitIndex]}`;
}

export function formatJson(value: unknown) {
  if (value === undefined) {
    return 'undefined';
  }

  return JSON.stringify(value, null, 2);
}

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
    firstLineFirstColumn.includes('menu_item') || firstLineFirstColumn.includes('menu item')
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

export function getDebugPayload(response: unknown) {
  if (response && typeof response === 'object' && 'debug' in response) {
    return (response as { debug?: unknown }).debug;
  }

  if (response && typeof response === 'object' && 'data' in response) {
    const data = (response as { data?: unknown }).data;
    if (data && typeof data === 'object' && 'debug' in data) {
      return (data as { debug?: unknown }).debug;
    }
  }

  return undefined;
}
