type AppEnvironment = 'local' | 'beta' | 'production';

interface AdminEnvironmentDefaults {
  adminUrl: string;
  apiUrl: string;
}

const ADMIN_ENVIRONMENT_DEFAULTS: Record<AppEnvironment, AdminEnvironmentDefaults> = {
  local: {
    adminUrl: 'http://localhost:5173',
    apiUrl: 'http://127.0.0.1:8090',
  },
  beta: {
    adminUrl: 'https://beta.admin.yummyrecs.com',
    apiUrl: 'https://beta.admin.yummyrecs.com',
  },
  production: {
    adminUrl: 'https://admin.yummyrecs.com',
    apiUrl: 'https://admin.yummyrecs.com',
  },
};

function readOptionalEnvValue(value: string | undefined): string | undefined {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : undefined;
}

function normalizeAppEnvironment(value: string | undefined): AppEnvironment | null {
  const normalizedValue = value?.trim().toLowerCase();

  switch (normalizedValue) {
    case 'local':
    case 'dev':
    case 'development':
      return 'local';
    case 'beta':
    case 'preview':
      return 'beta';
    case 'prod':
    case 'production':
      return 'production';
    default:
      return null;
  }
}

function inferEnvironmentFromOrigin(origin: string | undefined): AppEnvironment | null {
  if (!origin) {
    return null;
  }

  if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
    return 'local';
  }

  if (origin === ADMIN_ENVIRONMENT_DEFAULTS.beta.adminUrl) {
    return 'beta';
  }

  if (origin === ADMIN_ENVIRONMENT_DEFAULTS.production.adminUrl) {
    return 'production';
  }

  return null;
}

function resolveAppEnvironment(): AppEnvironment {
  const explicitEnvironment = normalizeAppEnvironment(readOptionalEnvValue(import.meta.env.VITE_APP_ENV));
  const inferredEnvironment = inferEnvironmentFromOrigin(
    typeof window !== 'undefined' ? window.location.origin : undefined,
  );

  return explicitEnvironment ?? inferredEnvironment ?? 'local';
}

const environment = resolveAppEnvironment();
const defaults = ADMIN_ENVIRONMENT_DEFAULTS[environment];

export const env = {
  adminUrl: readOptionalEnvValue(import.meta.env.VITE_ADMIN_URL) ?? defaults.adminUrl,
  apiUrl: readOptionalEnvValue(import.meta.env.VITE_API_URL) ?? defaults.apiUrl,
  environment,
};
