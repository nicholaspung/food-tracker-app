import { ClientResponseError } from 'pocketbase';

import { buildSafeTelemetryErrorProperties } from '../observability/telemetryError';

describe('buildSafeTelemetryErrorProperties', () => {
  it('keeps exception messages out of telemetry errorMessage', () => {
    const properties = buildSafeTelemetryErrorProperties(
      new Error('Could not save note for jane@example.com: private dinner details'),
    );

    expect(properties).toMatchObject({
      errorMessage: 'Error',
      errorMessageRedacted: true,
      errorType: 'Error',
      statusCode: null,
    });
    expect(JSON.stringify(properties)).not.toContain('jane@example.com');
    expect(JSON.stringify(properties)).not.toContain('private dinner details');
  });

  it('keeps PocketBase response text out of telemetry errorMessage while retaining status', () => {
    const properties = buildSafeTelemetryErrorProperties(
      new ClientResponseError({
        message: 'Failed request for Secret Restaurant',
        response: {
          message: 'Menu item "Hidden Dumplings" already exists for nick@example.com',
        },
        status: 400,
      }),
    );

    expect(properties).toMatchObject({
      errorMessage: 'HTTP 400',
      errorMessageRedacted: true,
      errorType: 'ClientResponseError',
      statusCode: 400,
    });
    expect(JSON.stringify(properties)).not.toContain('Hidden Dumplings');
    expect(JSON.stringify(properties)).not.toContain('nick@example.com');
    expect(JSON.stringify(properties)).not.toContain('Secret Restaurant');
  });
});
