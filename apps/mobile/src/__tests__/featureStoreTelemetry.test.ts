import { trackFeatureMutation } from '../features/store/featureStoreShared';
import { trackObservabilityEvent } from '../observability';

jest.mock('../observability', () => ({
  trackObservabilityEvent: jest.fn(),
}));

describe('feature store telemetry', () => {
  const mockedTrackObservabilityEvent = trackObservabilityEvent as jest.MockedFunction<
    typeof trackObservabilityEvent
  >;

  beforeEach(() => {
    mockedTrackObservabilityEvent.mockClear();
  });

  it('sanitizes feature mutation exception messages in telemetry', async () => {
    await expect(
      trackFeatureMutation('note.create', async () => {
        throw new Error('Could not save note "private dinner with jane@example.com"');
      }),
    ).rejects.toThrow('Could not save note');

    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith(
      'FEATURE_MUTATION_FAILED',
      expect.objectContaining({
        action: 'note.create',
        errorMessage: 'Error',
        errorMessageRedacted: true,
        errorType: 'Error',
        sourceOperation: 'note.create',
      }),
    );

    const emittedTelemetry = JSON.stringify(mockedTrackObservabilityEvent.mock.calls);
    expect(emittedTelemetry).not.toContain('private dinner');
    expect(emittedTelemetry).not.toContain('jane@example.com');
  });
});
