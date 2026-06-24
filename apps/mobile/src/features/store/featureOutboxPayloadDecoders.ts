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

export type FeatureOutboxPayloadDecoderMap<TName extends FeatureOutboxOperationName> = {
  [Name in TName]: FeatureOutboxPayloadDecoder<Name>;
};

type PayloadFieldType = 'array' | 'boolean' | 'number' | 'record' | 'string';

interface PayloadFieldRequirement {
  key: string;
  type: PayloadFieldType;
  allowedValues?: readonly string[];
  allowEmpty?: boolean;
  optional?: boolean;
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
): string | null {
  const value = payload[requirement.key];

  if (value === undefined || value === null) {
    return requirement.optional ? null : `${requirement.key} is required`;
  }

  if (!matchesFieldType(value, requirement)) {
    return `${requirement.key} must be ${describeFieldType(requirement)}`;
  }

  if (
    requirement.allowedValues &&
    !requirement.allowedValues.includes(value as string)
  ) {
    return `${requirement.key} must be one of ${requirement.allowedValues.join(', ')}`;
  }

  return null;
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
