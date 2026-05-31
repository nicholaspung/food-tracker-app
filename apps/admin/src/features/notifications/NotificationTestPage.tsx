import { FormEvent, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import { findUserByEmail } from '@/features/users/api';
import { sendMonthlyFriendsActivityTestNotification } from '@/features/notifications/api';

function getDefaultPreviousMonth() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
    .toISOString()
    .slice(0, 7);
}

export function NotificationTestPage() {
  const [email, setEmail] = useState('');
  const [userId, setUserId] = useState('');
  const [month, setMonth] = useState(getDefaultPreviousMonth);
  const [force, setForce] = useState(true);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const resolvedUserId = userId.trim();
  const canSend = resolvedUserId.length > 0 && month.trim().length > 0;

  const lookupMutation = useMutation({
    mutationFn: findUserByEmail,
    onError: (error) => {
      setLookupError(error instanceof Error ? error.message : 'Could not find that user.');
    },
    onSuccess: (user) => {
      setLookupError(null);
      setUserId(user.id);
    },
  });

  const sendMutation = useMutation({
    mutationFn: sendMonthlyFriendsActivityTestNotification,
  });

  const result = sendMutation.data;
  const lookupButtonLabel = lookupMutation.isPending ? 'Looking up...' : 'Find user';
  const sendButtonLabel = sendMutation.isPending ? 'Sending...' : 'Send test notification';
  const statusMessage = useMemo(() => {
    if (!result) {
      return null;
    }
    return `Status ${result.status}. ${result.visitCount} visit(s) from ${result.friendCount} friend(s) counted for ${result.month}.`;
  }, [result]);

  const handleLookup = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setLookupError('Email is required.');
      return;
    }
    lookupMutation.mutate(trimmedEmail);
  };

  const handleSend = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSend) {
      return;
    }
    sendMutation.mutate({
      force,
      month,
      userId: resolvedUserId,
    });
  };

  return (
    <>
      <section className="panel">
        <p className="eyebrow">Notifications</p>
        <h2 style={{ marginBottom: 0 }}>Monthly friends activity test</h2>
        <p className="text-muted" style={{ margin: 0 }}>
          Send the monthly friends activity Remote Device Notification to one user for a selected
          month.
        </p>
      </section>

      <section className="panel">
        <form className="field-row access-toolbar" onSubmit={handleLookup}>
          <div className="field">
            <label htmlFor="notification-test-email">User email</label>
            <input
              className="input"
              id="notification-test-email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="user@example.com"
              type="email"
              value={email}
            />
          </div>
          <div className="button-row">
            <button className="button ghost" disabled={lookupMutation.isPending} type="submit">
              {lookupButtonLabel}
            </button>
          </div>
        </form>
        {lookupError ? (
          <div className="state-panel error" style={{ marginTop: 16 }}>
            <strong>{lookupError}</strong>
          </div>
        ) : null}
      </section>

      <section className="panel">
        <form className="stack" onSubmit={handleSend}>
          <div className="field">
            <label htmlFor="notification-test-user-id">User ID</label>
            <input
              className="input"
              id="notification-test-user-id"
              onChange={(event) => setUserId(event.target.value)}
              placeholder="PocketBase user id"
              type="text"
              value={userId}
            />
          </div>
          <div className="field">
            <label htmlFor="notification-test-month">Activity month</label>
            <input
              className="input"
              id="notification-test-month"
              onChange={(event) => setMonth(event.target.value)}
              pattern="[0-9]{4}-[0-9]{2}"
              placeholder="2026-04"
              type="text"
              value={month}
            />
          </div>
          <label className="field-row" style={{ flex: '1 1 100%' }}>
            <input
              checked={force}
              onChange={(event) => setForce(event.target.checked)}
              type="checkbox"
            />
            Force test send
          </label>
          <div className="button-row">
            <button className="button primary" disabled={!canSend || sendMutation.isPending} type="submit">
              {sendButtonLabel}
            </button>
          </div>
        </form>

        {sendMutation.isError ? (
          <div className="state-panel error" style={{ marginTop: 16 }}>
            <strong>
              {sendMutation.error instanceof Error
                ? sendMutation.error.message
                : 'Could not send test notification.'}
            </strong>
          </div>
        ) : null}

        {statusMessage ? (
          <div className="state-panel success" style={{ marginTop: 16 }}>
            <strong>{statusMessage}</strong>
          </div>
        ) : null}
      </section>
    </>
  );
}
