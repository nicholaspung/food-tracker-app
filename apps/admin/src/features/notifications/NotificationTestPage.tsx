import { FormEvent, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import { findUserByEmail } from '@/features/users/api';
import {
  sendBillOwedTestNotification,
  sendMonthlyFriendsActivityTestNotification,
  sendTastingInviteTestNotification,
} from '@/features/notifications/api';

type NotificationTestTab = 'monthlyFriendsActivity' | 'billOwed' | 'tastingInvite';

const notificationTestTabs: Array<{ label: string; value: NotificationTestTab }> = [
  { label: 'Monthly friends activity', value: 'monthlyFriendsActivity' },
  { label: 'Split bill', value: 'billOwed' },
  { label: 'Tasting invite', value: 'tastingInvite' },
];

function getDefaultPreviousMonth() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
    .toISOString()
    .slice(0, 7);
}

function parseUserIds(value: string) {
  return value
    .split(/[\s,;]+/)
    .map((userId) => userId.trim())
    .filter(Boolean);
}

function statusTone(status: string | undefined) {
  if (status === 'sent' || status === 'completed') {
    return 'success';
  }
  return 'error';
}

export function NotificationTestPage() {
  const [activeTab, setActiveTab] = useState<NotificationTestTab>('monthlyFriendsActivity');
  const [email, setEmail] = useState('');
  const [monthlyUserId, setMonthlyUserId] = useState('');
  const [month, setMonth] = useState(getDefaultPreviousMonth);
  const [force, setForce] = useState(true);
  const [billUserIds, setBillUserIds] = useState('');
  const [billActorUserId, setBillActorUserId] = useState('');
  const [billId, setBillId] = useState('');
  const [tastingUserId, setTastingUserId] = useState('');
  const [tastingActorUserId, setTastingActorUserId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [lookupError, setLookupError] = useState<string | null>(null);

  const resolvedMonthlyUserId = monthlyUserId.trim();
  const resolvedBillUserIds = useMemo(() => parseUserIds(billUserIds), [billUserIds]);
  const resolvedTastingUserId = tastingUserId.trim();

  const canSendMonthly = resolvedMonthlyUserId.length > 0 && month.trim().length > 0;
  const canSendBill = resolvedBillUserIds.length > 0;
  const canSendTasting = resolvedTastingUserId.length > 0;

  const lookupMutation = useMutation({
    mutationFn: findUserByEmail,
    onError: (error) => {
      setLookupError(error instanceof Error ? error.message : 'Could not find that user.');
    },
    onSuccess: (user) => {
      setLookupError(null);
      if (activeTab === 'billOwed') {
        setBillUserIds((currentValue) => {
          const currentUserIds = parseUserIds(currentValue);
          if (currentUserIds.includes(user.id)) {
            return currentValue;
          }
          return [...currentUserIds, user.id].join('\n');
        });
        return;
      }
      if (activeTab === 'tastingInvite') {
        setTastingUserId(user.id);
        return;
      }
      setMonthlyUserId(user.id);
    },
  });

  const monthlyMutation = useMutation({
    mutationFn: sendMonthlyFriendsActivityTestNotification,
  });
  const billMutation = useMutation({
    mutationFn: sendBillOwedTestNotification,
  });
  const tastingMutation = useMutation({
    mutationFn: sendTastingInviteTestNotification,
  });

  const monthlyResult = monthlyMutation.data;
  const monthlyStatusMessage = useMemo(() => {
    if (!monthlyResult) {
      return null;
    }
    if (monthlyResult.status === 'skipped_no_matching_activity') {
      return `No matching monthly activity was found for ${monthlyResult.month}.`;
    }
    return `Status ${monthlyResult.status}. ${monthlyResult.visitCount} visit(s) from ${monthlyResult.friendCount} friend(s) counted for ${monthlyResult.month}.`;
  }, [monthlyResult]);

  const lookupButtonLabel = lookupMutation.isPending ? 'Looking up...' : 'Find user';

  const handleLookup = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setLookupError('Email is required.');
      return;
    }
    lookupMutation.mutate(trimmedEmail);
  };

  const handleTabChange = (nextTab: NotificationTestTab) => {
    setActiveTab(nextTab);
    setLookupError(null);
    lookupMutation.reset();
    monthlyMutation.reset();
    billMutation.reset();
    tastingMutation.reset();
  };

  const handleMonthlySend = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSendMonthly) {
      return;
    }
    monthlyMutation.mutate({
      force,
      month,
      userId: resolvedMonthlyUserId,
    });
  };

  const handleBillSend = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSendBill) {
      return;
    }
    billMutation.mutate({
      actorUserId: billActorUserId,
      billId,
      userIds: resolvedBillUserIds,
    });
  };

  const handleTastingSend = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSendTasting) {
      return;
    }
    tastingMutation.mutate({
      actorUserId: tastingActorUserId,
      sessionId,
      userId: resolvedTastingUserId,
    });
  };

  return (
    <>
      <section className="panel">
        <p className="eyebrow">Notifications</p>
        <h2 style={{ marginBottom: 4 }}>Notification test workspace</h2>
        <p className="text-muted" style={{ margin: 0 }}>
          Send production-shaped test notifications without creating the source bill or tasting
          session records.
        </p>
        <div aria-label="Notification test tabs" className="tab-bar" role="tablist">
          {notificationTestTabs.map((tab) => (
            <button
              aria-selected={activeTab === tab.value}
              className={`tab-button ${activeTab === tab.value ? 'active' : ''}`}
              key={tab.value}
              onClick={() => handleTabChange(tab.value)}
              role="tab"
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>
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

      {activeTab === 'monthlyFriendsActivity' ? (
        <section className="panel" role="tabpanel">
          <form className="stack" onSubmit={handleMonthlySend}>
            <div className="field">
              <label htmlFor="notification-test-monthly-user-id">User ID</label>
              <input
                className="input"
                id="notification-test-monthly-user-id"
                onChange={(event) => setMonthlyUserId(event.target.value)}
                placeholder="PocketBase user id"
                type="text"
                value={monthlyUserId}
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
              <button
                className="button primary"
                disabled={!canSendMonthly || monthlyMutation.isPending}
                type="submit"
              >
                {monthlyMutation.isPending ? 'Sending...' : 'Send monthly test'}
              </button>
            </div>
          </form>

          {monthlyMutation.isError ? (
            <div className="state-panel error" style={{ marginTop: 16 }}>
              <strong>
                {monthlyMutation.error instanceof Error
                  ? monthlyMutation.error.message
                  : 'Could not send test notification.'}
              </strong>
            </div>
          ) : null}

          {monthlyStatusMessage ? (
            <div
              className={`state-panel ${
                monthlyResult?.status === 'skipped_no_matching_activity' ? 'error' : 'success'
              }`}
              style={{ marginTop: 16 }}
            >
              <strong>{monthlyStatusMessage}</strong>
              {monthlyResult?.diagnostics ? (
                <span className="text-muted">
                  Target exists: {monthlyResult.diagnostics.targetUserExists ? 'yes' : 'no'} ·
                  Accepted friends: {monthlyResult.diagnostics.acceptedFriendCount} ·
                  Friend-visible visits in selected month:{' '}
                  {monthlyResult.diagnostics.friendVisibleVisitDateCountInMonth} · Any
                  accepted-friend visits in selected month:{' '}
                  {monthlyResult.diagnostics.acceptedFriendVisitCountInMonth} · Private
                  accepted-friend visits in selected month:{' '}
                  {monthlyResult.diagnostics.privateAcceptedFriendCountInMonth} · Friend-visible
                  visits created in selected month:{' '}
                  {monthlyResult.diagnostics.friendVisibleCreatedCountInMonth} · Friend-visible
                  visits all time: {monthlyResult.diagnostics.friendVisibleVisitCountAllTime}
                </span>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {activeTab === 'billOwed' ? (
        <section className="panel" role="tabpanel">
          <form className="stack" onSubmit={handleBillSend}>
            <div className="field">
              <label htmlFor="notification-test-bill-user-ids">Added user IDs</label>
              <textarea
                className="input"
                id="notification-test-bill-user-ids"
                onChange={(event) => setBillUserIds(event.target.value)}
                placeholder="One or more PocketBase user IDs"
                rows={5}
                value={billUserIds}
              />
            </div>
            <div className="field">
              <label htmlFor="notification-test-bill-actor-user-id">Actor user ID</label>
              <input
                className="input"
                id="notification-test-bill-actor-user-id"
                onChange={(event) => setBillActorUserId(event.target.value)}
                placeholder="Optional user id to suppress self-notification"
                type="text"
                value={billActorUserId}
              />
            </div>
            <div className="field">
              <label htmlFor="notification-test-bill-id">Bill ID</label>
              <input
                className="input"
                id="notification-test-bill-id"
                onChange={(event) => setBillId(event.target.value)}
                placeholder="Optional synthetic bill id"
                type="text"
                value={billId}
              />
            </div>
            <div className="button-row">
              <button
                className="button primary"
                disabled={!canSendBill || billMutation.isPending}
                type="submit"
              >
                {billMutation.isPending ? 'Sending...' : 'Send split bill test'}
              </button>
            </div>
          </form>

          {billMutation.isError ? (
            <div className="state-panel error" style={{ marginTop: 16 }}>
              <strong>
                {billMutation.error instanceof Error
                  ? billMutation.error.message
                  : 'Could not send bill owed test notification.'}
              </strong>
            </div>
          ) : null}

          {billMutation.data ? (
            <div
              className={`state-panel ${statusTone(billMutation.data.status)}`}
              style={{ marginTop: 16 }}
            >
              <strong>
                Status {billMutation.data.status}. Bill id {billMutation.data.billId}.
              </strong>
              <span className="text-muted">
                {billMutation.data.recipients
                  .map((recipient) => `${recipient.userId}: ${recipient.status}`)
                  .join(' · ')}
              </span>
            </div>
          ) : null}
        </section>
      ) : null}

      {activeTab === 'tastingInvite' ? (
        <section className="panel" role="tabpanel">
          <form className="stack" onSubmit={handleTastingSend}>
            <div className="field">
              <label htmlFor="notification-test-tasting-user-id">Invited user ID</label>
              <input
                className="input"
                id="notification-test-tasting-user-id"
                onChange={(event) => setTastingUserId(event.target.value)}
                placeholder="PocketBase user id"
                type="text"
                value={tastingUserId}
              />
            </div>
            <div className="field">
              <label htmlFor="notification-test-tasting-actor-user-id">Actor user ID</label>
              <input
                className="input"
                id="notification-test-tasting-actor-user-id"
                onChange={(event) => setTastingActorUserId(event.target.value)}
                placeholder="Optional user id to suppress self-invite"
                type="text"
                value={tastingActorUserId}
              />
            </div>
            <div className="field">
              <label htmlFor="notification-test-session-id">Session ID</label>
              <input
                className="input"
                id="notification-test-session-id"
                onChange={(event) => setSessionId(event.target.value)}
                placeholder="Optional synthetic session id"
                type="text"
                value={sessionId}
              />
            </div>
            <div className="button-row">
              <button
                className="button primary"
                disabled={!canSendTasting || tastingMutation.isPending}
                type="submit"
              >
                {tastingMutation.isPending ? 'Sending...' : 'Send tasting invite test'}
              </button>
            </div>
          </form>

          {tastingMutation.isError ? (
            <div className="state-panel error" style={{ marginTop: 16 }}>
              <strong>
                {tastingMutation.error instanceof Error
                  ? tastingMutation.error.message
                  : 'Could not send tasting invite test notification.'}
              </strong>
            </div>
          ) : null}

          {tastingMutation.data ? (
            <div
              className={`state-panel ${statusTone(tastingMutation.data.status)}`}
              style={{ marginTop: 16 }}
            >
              <strong>
                Status {tastingMutation.data.status}. Session id {tastingMutation.data.sessionId}.
              </strong>
              <span className="text-muted">User {tastingMutation.data.userId}</span>
            </div>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
