export function escapeFilterValue(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function toErrorMessage(error: unknown, fallbackMessage: string) {
  if (typeof error === 'object' && error !== null) {
    const responseMessage = (error as { response?: { message?: string } }).response?.message;
    if (typeof responseMessage === 'string' && responseMessage.trim()) {
      return responseMessage;
    }

    const errorMessage = (error as { message?: string }).message;
    if (typeof errorMessage === 'string' && errorMessage.trim()) {
      return errorMessage;
    }
  }

  return fallbackMessage;
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

export function getCreatedUpdatedDisplay(
  created?: string | null,
  updated?: string | null,
  options?: {
    createdLabel?: string;
  },
) {
  const createdLabel = options?.createdLabel ?? 'Submitted';

  if (created && updated && created !== updated) {
    return {
      label: 'Updated',
      value: formatDateTime(updated),
    };
  }

  return {
    label: createdLabel,
    value: formatDateTime(created ?? updated),
  };
}

export function toPocketBaseDateTime(value: Date) {
  return value.toISOString().replace('T', ' ').slice(0, 19);
}
