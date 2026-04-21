import { Alert } from 'react-native';

import { trackObservabilityEvent } from '../observability';
import { showQueuedOfflineAlert } from '../lib/offlineAlerts';

jest.mock('../observability', () => ({
  trackObservabilityEvent: jest.fn(),
}));

describe('offlineAlerts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('tracks queued offline alerts with analytics context', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());

    showQueuedOfflineAlert({
      analyticsSource: 'CreateBillScreen',
      subject: 'Bill',
    });

    expect(trackObservabilityEvent).toHaveBeenCalledWith(
      'QUEUED_OFFLINE_ALERT_SHOWN',
      expect.objectContaining({
        analyticsSource: 'CreateBillScreen',
        source: 'offlineAlerts',
      }),
    );
    expect(alertSpy).toHaveBeenCalledWith(
      'Saved Offline',
      expect.stringContaining('Bill queued and will sync'),
    );
  });
});
