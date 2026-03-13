export function escapeFilterValue(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function formatDateTime(value?: string | null) {
  if (!value) {
    return 'Unknown';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function getCreatedUpdatedDisplay(created?: string | null, updated?: string | null) {
  if (created && updated && created !== updated) {
    return {
      label: 'Updated',
      value: formatDateTime(updated),
    };
  }

  return {
    label: 'Submitted',
    value: formatDateTime(created ?? updated),
  };
}

export function toPocketBaseDateTime(value: Date) {
  return value.toISOString().replace('T', ' ').slice(0, 19);
}
