import React from 'react';
import { act, create } from 'react-test-renderer';
import { FoodJournalExportSection } from '../screens/settings/FoodJournalExportSection';

const mockReact = React;
jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));
jest.mock('../lib/pocketbase', () => ({
  pb: {
    baseURL: 'https://synthetic.invalid',
    authStore: { isValid: true, record: { id: 'owner' }, token: 'synthetic-token' },
  },
}));
jest.mock('../ui/Button', () => ({
  Button: (props: Record<string, unknown>) => mockReact.createElement('Button', props),
}));
jest.mock('../components/shared/SectionCard', () => ({
  SectionCard: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
    mockReact.createElement('SectionCard', props, children),
}));
jest.mock('../components/shared/PageErrorToast', () => ({
  PageErrorToast: (props: Record<string, unknown>) => mockReact.createElement('PageErrorToast', props),
}));

test('downloads numbered parts with the same snapshot and keeps failed parts retryable', async () => {
  jest.useFakeTimers();
  const snapshot = 'a'.repeat(64);
  const anchor = { href: '', download: '', click: jest.fn() };
  const originalDocument = globalThis.document;
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  Object.defineProperty(globalThis, 'document', {
    configurable: true, value: { createElement: () => anchor },
  });
  URL.createObjectURL = jest.fn(() => 'blob:synthetic');
  URL.revokeObjectURL = jest.fn();
  const fetchMock = globalThis.fetch as jest.Mock;
  const success = {
    ok: true,
    headers: { get: (name: string) => name === 'X-Food-Journal-Parts' ? '2' : snapshot },
    blob: async () => ({}),
  };
  fetchMock.mockReset().mockResolvedValue(success);
  let renderer: any;
  const press = async (label: string) => {
    await act(async () => {
      renderer.root.findAllByType('Button' as never)
        .find((button: { props: { label: string } }) => button.props.label === label)!.props.onPress();
    });
  };
  try {
    await act(async () => { renderer = create(<FoodJournalExportSection />); });
    await press('Download Food Journal ZIP');
    expect(anchor.download).toBe('food-journal-part-1-of-2.zip');
    expect(anchor.click).toHaveBeenCalledTimes(1);
    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.has('snapshot')).toBe(false);

    fetchMock.mockResolvedValueOnce({
      ok: false, json: async () => ({ message: 'Start a new export.' }),
    });
    await press('Download part 2 of 2');
    expect(anchor.click).toHaveBeenCalledTimes(1);
    expect(renderer.root.findByType('PageErrorToast' as never).props.errorMessage)
      .toBe('Start a new export.');
    expect(renderer.root.findAllByType('Button' as never).every((button: { props: { disabled?: boolean } }) => !button.props.disabled))
      .toBe(true);

    await press('Download part 2 of 2');
    const query = new URL(fetchMock.mock.calls[2][0]).searchParams;
    expect(query.get('part')).toBe('2');
    expect(query.get('snapshot')).toBe(snapshot);
    expect(anchor.download).toBe('food-journal-part-2-of-2.zip');
    expect(anchor.click).toHaveBeenCalledTimes(2);

    await press('Start a new export');
    await press('Download Food Journal ZIP');
    expect(new URL(fetchMock.mock.calls[3][0]).searchParams.has('snapshot')).toBe(false);
  } finally {
    await act(async () => { renderer?.unmount(); });
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument });
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  }
});
