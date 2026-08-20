import type {
  FeatureOutboxOperationName,
  FeatureOutboxOperationPayload,
} from './featureOutboxOperations';

export type FeatureOutboxPayloadDecodeResult<TName extends FeatureOutboxOperationName> =
  | {
      status: 'ok';
      payload: FeatureOutboxOperationPayload<TName>;
    }
  | {
      status: 'terminalInvalidPayload';
      message: string;
    };

export type FeatureOutboxPayloadDecoder<TName extends FeatureOutboxOperationName> = (
  payload: unknown,
) => FeatureOutboxPayloadDecodeResult<TName>;

export type FeatureOutboxPersistedPayloadDecoder<TName extends FeatureOutboxOperationName> = (
  persistedPayload: unknown,
) => FeatureOutboxPayloadDecodeResult<TName>;

export type FeatureOutboxPayloadDecoderMap<TName extends FeatureOutboxOperationName> = {
  [Name in TName]: FeatureOutboxPayloadDecoder<Name>;
};

export type FeatureOutboxPersistedPayloadDecoderMap<
  TName extends FeatureOutboxOperationName,
> = {
  [Name in TName]: FeatureOutboxPersistedPayloadDecoder<Name>;
};

const FEATURE_OUTBOX_SCHEMA_VERSION = 1 as const;

export interface FeatureOutboxPayloadEnvelope {
  schemaVersion: typeof FEATURE_OUTBOX_SCHEMA_VERSION;
  payload: unknown;
}

export type FeatureOutboxLegacyPayloadPolicy = 'decode-as-current';

type PayloadFieldType = 'array' | 'boolean' | 'number' | 'record' | 'string';

interface PayloadFieldRequirement {
  key: string;
  type: PayloadFieldType;
  allowedValues?: readonly string[];
  allowEmpty?: boolean;
  fields?: readonly PayloadFieldRequirement[];
  items?: Omit<PayloadFieldRequirement, 'key' | 'optional'>;
  optional?: boolean;
  rejectUnknownFields?: boolean;
}

export function createFeatureOutboxPayloadEnvelope(
  payload: unknown,
): FeatureOutboxPayloadEnvelope {
  return {
    schemaVersion: FEATURE_OUTBOX_SCHEMA_VERSION,
    payload,
  };
}

export function createPersistedFeatureOutboxPayloadDecoderMap<
  TName extends FeatureOutboxOperationName,
>(
  decoders: FeatureOutboxPayloadDecoderMap<TName>,
  legacyPayloadPolicy: FeatureOutboxLegacyPayloadPolicy,
  legacyPayloadDecoders: Partial<FeatureOutboxPayloadDecoderMap<TName>> = {},
): FeatureOutboxPersistedPayloadDecoderMap<TName> {
  return Object.fromEntries(
    Object.entries(decoders).map(([operationName, decoder]) => [
      operationName,
      createPersistedFeatureOutboxPayloadDecoder(
        operationName as TName,
        decoder as FeatureOutboxPayloadDecoder<TName>,
        legacyPayloadPolicy,
        legacyPayloadDecoders[operationName as TName] as
          | FeatureOutboxPayloadDecoder<TName>
          | undefined,
      ),
    ]),
  ) as FeatureOutboxPersistedPayloadDecoderMap<TName>;
}

export function createFeatureOutboxPayloadDecoder<TName extends FeatureOutboxOperationName>(
  operationName: TName,
  requirements: readonly PayloadFieldRequirement[],
): FeatureOutboxPayloadDecoder<TName> {
  return (payload) => {
    if (!isRecord(payload)) {
      return terminalInvalidPayload(operationName, 'payload must be an object');
    }

    for (const requirement of requirements) {
      const error = validateField(payload, requirement);
      if (error) {
        return terminalInvalidPayload(operationName, error);
      }
    }

    return {
      status: 'ok',
      payload: payload as FeatureOutboxOperationPayload<TName>,
    };
  };
}

export function createEmptyFeatureOutboxPayloadDecoder<
  TName extends FeatureOutboxOperationName,
>(operationName: TName): FeatureOutboxPayloadDecoder<TName> {
  return (payload) => {
    if (!isRecord(payload)) {
      return terminalInvalidPayload(operationName, 'payload must be an object');
    }

    return {
      status: 'ok',
      payload: {} as FeatureOutboxOperationPayload<TName>,
    };
  };
}

export function terminalInvalidPayload<TName extends FeatureOutboxOperationName>(
  operationName: TName,
  reason: string,
): FeatureOutboxPayloadDecodeResult<TName> {
  return {
    status: 'terminalInvalidPayload',
    message: `Invalid payload for ${operationName}: ${reason}.`,
  };
}

function validateField(
  payload: Record<string, unknown>,
  requirement: PayloadFieldRequirement,
  parentPath = '',
): string | null {
  const value = payload[requirement.key];
  const path = parentPath ? `${parentPath}.${requirement.key}` : requirement.key;

  if (value === undefined || value === null) {
    return requirement.optional ? null : `${path} is required`;
  }

  if (!matchesFieldType(value, requirement)) {
    return `${path} must be ${describeFieldType(requirement)}`;
  }

  if (
    requirement.allowedValues &&
    !requirement.allowedValues.includes(value as string)
  ) {
    return `${path} must be one of ${requirement.allowedValues.join(', ')}`;
  }

  if (requirement.type === 'record' && requirement.fields) {
    const record = value as Record<string, unknown>;
    for (const field of requirement.fields) {
      const error = validateField(record, field, path);
      if (error) {
        return error;
      }
    }

    if (requirement.rejectUnknownFields) {
      const allowedKeys = new Set(requirement.fields.map((field) => field.key));
      const unknownKey = Object.keys(record).find((key) => !allowedKeys.has(key));
      if (unknownKey) {
        return `${path}.${unknownKey} is not supported`;
      }
    }
  }

  if (requirement.type === 'array' && requirement.items) {
    for (const [index, item] of (value as unknown[]).entries()) {
      const itemRequirement = {
        ...requirement.items,
        key: String(index),
      } satisfies PayloadFieldRequirement;
      const error = validateField({ [index]: item }, itemRequirement, path);
      if (error) {
        return error;
      }
    }
  }

  return null;
}

function createPersistedFeatureOutboxPayloadDecoder<
  TName extends FeatureOutboxOperationName,
>(
  operationName: TName,
  decoder: FeatureOutboxPayloadDecoder<TName>,
  legacyPayloadPolicy: FeatureOutboxLegacyPayloadPolicy,
  legacyPayloadDecoder?: FeatureOutboxPayloadDecoder<TName>,
): FeatureOutboxPersistedPayloadDecoder<TName> {
  return (persistedPayload) => {
    if (!isRecord(persistedPayload) || !('schemaVersion' in persistedPayload)) {
      if (legacyPayloadPolicy === 'decode-as-current') {
        return (legacyPayloadDecoder ?? decoder)(persistedPayload);
      }
    }

    if (!isRecord(persistedPayload)) {
      return terminalInvalidPayload(operationName, 'payload envelope must be an object');
    }

    if (persistedPayload.schemaVersion !== FEATURE_OUTBOX_SCHEMA_VERSION) {
      return terminalInvalidPayload(
        operationName,
        `unsupported schema version ${String(persistedPayload.schemaVersion)}`,
      );
    }

    if (!('payload' in persistedPayload)) {
      return terminalInvalidPayload(operationName, 'payload envelope is missing payload');
    }

    return decoder(persistedPayload.payload);
  };
}

function matchesFieldType(value: unknown, requirement: PayloadFieldRequirement): boolean {
  switch (requirement.type) {
    case 'array':
      return Array.isArray(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'record':
      return isRecord(value);
    case 'string':
      return typeof value === 'string' && (requirement.allowEmpty === true || value.trim() !== '');
  }
}

function describeFieldType(requirement: PayloadFieldRequirement): string {
  if (requirement.allowedValues) {
    return `one of ${requirement.allowedValues.join(', ')}`;
  }

  return requirement.type === 'record' ? 'an object' : `a ${requirement.type}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
