import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { findUserByEmail, updateUserAccessFlags } from '@/features/users/api';

export function AccessControlsPage() {
  const [accessEmail, setAccessEmail] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [isSubscriber, setIsSubscriber] = useState(false);
  const [isBetaUser, setIsBetaUser] = useState(false);
  const [selectedUserEmail, setSelectedUserEmail] = useState<string | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [accessSuccess, setAccessSuccess] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const lookupMutation = useMutation({
    mutationFn: findUserByEmail,
    onSuccess: (user) => {
      setSelectedUserId(user.id);
      setSelectedUserEmail(user.email);
      setAccessEmail(user.email);
      setIsSubscriber(user.isSubscriber === true);
      setIsBetaUser(user.isBetaUser === true);
      setAccessError(null);
      setAccessSuccess(`Loaded access controls for ${user.email}.`);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Could not load user access.';
      setSelectedUserId(null);
      setSelectedUserEmail(null);
      setAccessError(message);
      setAccessSuccess(null);
    },
  });

  const saveMutation = useMutation({
    mutationFn: updateUserAccessFlags,
    onSuccess: async (user) => {
      setSelectedUserId(user.id);
      setSelectedUserEmail(user.email);
      setAccessEmail(user.email);
      setIsSubscriber(user.isSubscriber === true);
      setIsBetaUser(user.isBetaUser === true);
      setAccessError(null);
      setAccessSuccess(`Saved subscriber and beta access for ${user.email}.`);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'user-profile', user.id] }),
      ]);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Could not update user access.';
      setAccessError(message);
      setAccessSuccess(null);
    },
  });

  const normalizedAccessEmail = accessEmail.trim().toLowerCase();
  const isAccessBusy = lookupMutation.isPending || saveMutation.isPending;

  const handleLoadAccess = () => {
    if (!normalizedAccessEmail) {
      setAccessError('Email is required.');
      setAccessSuccess(null);
      return;
    }

    setAccessError(null);
    setAccessSuccess(null);
    lookupMutation.mutate(normalizedAccessEmail);
  };

  const handleSaveAccess = () => {
    if (!selectedUserId) {
      setAccessError('Load a user before saving access changes.');
      setAccessSuccess(null);
      return;
    }

    setAccessError(null);
    setAccessSuccess(null);
    saveMutation.mutate({
      userId: selectedUserId,
      isSubscriber,
      isBetaUser,
    });
  };

  return (
    <>
      <section className="panel">
        <p className="eyebrow">Access controls</p>
        <h2 style={{ marginBottom: 0 }}>Manage subscriber and beta access</h2>
        <p className="text-muted" style={{ margin: 0 }}>
          Look up a user by email, then enable or disable subscriber and beta flags. Admin accounts
          can also keep subscriber and beta access enabled.
        </p>
      </section>

      <section className="panel">
        <div className="field-row access-toolbar">
          <div className="field">
            <label htmlFor="user-access-email">User email</label>
            <input
              autoCapitalize="none"
              className="input"
              id="user-access-email"
              onChange={(event) => {
                setAccessEmail(event.target.value);
                setAccessError(null);
                setAccessSuccess(null);
              }}
              placeholder="person@example.com"
              type="email"
              value={accessEmail}
            />
          </div>

          <div className="button-row access-actions">
            <button className="button" disabled={isAccessBusy} onClick={handleLoadAccess} type="button">
              {lookupMutation.isPending ? 'Loading...' : 'Load access'}
            </button>
            <button
              className="button primary"
              disabled={isAccessBusy}
              onClick={handleSaveAccess}
              type="button"
            >
              {saveMutation.isPending ? 'Saving...' : 'Save access'}
            </button>
          </div>
        </div>

        <div className="access-flag-grid">
          <label className="checkbox-card">
            <input
              checked={isSubscriber}
              onChange={(event) => {
                setIsSubscriber(event.target.checked);
                setAccessError(null);
                setAccessSuccess(null);
              }}
              type="checkbox"
            />
            <div>
              <strong>Subscriber access</strong>
              <p className="text-muted">Enables subscriber-only functionality for this account.</p>
            </div>
          </label>

          <label className="checkbox-card">
            <input
              checked={isBetaUser}
              onChange={(event) => {
                setIsBetaUser(event.target.checked);
                setAccessError(null);
                setAccessSuccess(null);
              }}
              type="checkbox"
            />
            <div>
              <strong>Beta access</strong>
              <p className="text-muted">Enables beta-only functionality for this account.</p>
            </div>
          </label>
        </div>

        {selectedUserEmail ? (
          <div className="list-item">
            <div className="summary-row">
              <strong>{selectedUserEmail}</strong>
              <div className="tag-row">
                {isSubscriber ? <span className="tag">subscriber</span> : null}
                {isBetaUser ? <span className="tag">beta</span> : null}
              </div>
            </div>
            <span className="text-muted">Loaded user access state. Save after changing either flag.</span>
          </div>
        ) : null}

        {accessError ? (
          <div className="state-panel error">
            <strong>Access update failed</strong>
            <span className="text-muted">{accessError}</span>
          </div>
        ) : null}

        {accessSuccess ? (
          <div className="state-panel">
            <strong>Access controls ready</strong>
            <span className="text-muted">{accessSuccess}</span>
          </div>
        ) : null}
      </section>
    </>
  );
}
