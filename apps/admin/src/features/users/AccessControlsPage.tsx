import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { findUserByEmail, updateUserAccessFlags } from '@/features/users/api';

interface LoadedAccessUser {
  email: string;
  id: string;
  isBetaUser: boolean;
  isSubscriber: boolean;
}

function renderAccessTags(flags: { isBetaUser: boolean; isSubscriber: boolean }) {
  const tags = [];

  if (flags.isSubscriber) {
    tags.push(
      <span className="tag" key="subscriber">
        subscriber
      </span>,
    );
  }

  if (flags.isBetaUser) {
    tags.push(
      <span className="tag" key="beta">
        beta
      </span>,
    );
  }

  if (tags.length === 0) {
    tags.push(
      <span className="tag" key="none">
        no access flags
      </span>,
    );
  }

  return tags;
}

export function AccessControlsPage() {
  const [accessEmail, setAccessEmail] = useState('');
  const [loadedUser, setLoadedUser] = useState<LoadedAccessUser | null>(null);
  const [draftAccess, setDraftAccess] = useState({
    isBetaUser: false,
    isSubscriber: false,
  });
  const [accessError, setAccessError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const lookupMutation = useMutation({
    mutationFn: findUserByEmail,
    onSuccess: (user) => {
      const nextLoadedUser = {
        email: user.email,
        id: user.id,
        isBetaUser: user.isBetaUser === true,
        isSubscriber: user.isSubscriber === true,
      };

      setLoadedUser(nextLoadedUser);
      setAccessEmail(user.email);
      setDraftAccess({
        isBetaUser: nextLoadedUser.isBetaUser,
        isSubscriber: nextLoadedUser.isSubscriber,
      });
      setAccessError(null);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Could not load user access.';
      setLoadedUser(null);
      setDraftAccess({
        isBetaUser: false,
        isSubscriber: false,
      });
      setAccessError(message);
    },
  });

  const saveMutation = useMutation({
    mutationFn: updateUserAccessFlags,
    onSuccess: async (user) => {
      const nextLoadedUser = {
        email: user.email,
        id: user.id,
        isBetaUser: user.isBetaUser === true,
        isSubscriber: user.isSubscriber === true,
      };

      setLoadedUser(nextLoadedUser);
      setAccessEmail(user.email);
      setDraftAccess({
        isBetaUser: nextLoadedUser.isBetaUser,
        isSubscriber: nextLoadedUser.isSubscriber,
      });
      setAccessError(null);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'user-profile', user.id] }),
      ]);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Could not update user access.';
      setAccessError(message);
    },
  });

  const normalizedAccessEmail = accessEmail.trim().toLowerCase();
  const hasLoadedUser = loadedUser !== null;
  const isAccessBusy = lookupMutation.isPending || saveMutation.isPending;
  const isDirty =
    hasLoadedUser &&
    (draftAccess.isSubscriber !== loadedUser.isSubscriber ||
      draftAccess.isBetaUser !== loadedUser.isBetaUser);

  const resetLoadedState = () => {
    setLoadedUser(null);
    setDraftAccess({
      isBetaUser: false,
      isSubscriber: false,
    });
  };

  const handleLoadAccess = () => {
    if (!normalizedAccessEmail) {
      setAccessError('Email is required.');
      return;
    }

    setAccessError(null);
    lookupMutation.mutate(normalizedAccessEmail);
  };

  const handleSaveAccess = () => {
    if (!loadedUser || !isDirty) {
      return;
    }

    setAccessError(null);
    saveMutation.mutate({
      userId: loadedUser.id,
      isSubscriber: draftAccess.isSubscriber,
      isBetaUser: draftAccess.isBetaUser,
    });
  };

  const handleReset = () => {
    if (!loadedUser) {
      return;
    }

    setDraftAccess({
      isBetaUser: loadedUser.isBetaUser,
      isSubscriber: loadedUser.isSubscriber,
    });
    setAccessError(null);
  };

  const handleClearUser = () => {
    setAccessEmail('');
    resetLoadedState();
    setAccessError(null);
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
        <div>
          <p className="eyebrow">Lookup</p>
          <h3 style={{ marginBottom: 0 }}>User email</h3>
        </div>

        <div className="field-row access-toolbar">
          <div className="field">
            <input
              autoCapitalize="none"
              className="input"
              id="user-access-email"
              onChange={(event) => {
                const nextEmail = event.target.value;

                setAccessEmail(nextEmail);
                setAccessError(null);

                if (loadedUser && nextEmail.trim().toLowerCase() !== loadedUser.email.trim().toLowerCase()) {
                  resetLoadedState();
                }
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
              className="button ghost"
              disabled={isAccessBusy || (!hasLoadedUser && !accessEmail.trim())}
              onClick={handleClearUser}
              type="button"
            >
              Clear user
            </button>
          </div>
        </div>
      </section>

      {hasLoadedUser ? (
        <section className="panel">
          <div>
            <p className="eyebrow">Flags</p>
            <h3 style={{ marginBottom: 0 }}>Subscriber and beta access</h3>
          </div>

          <div className="access-flag-grid">
            <label className="checkbox-card">
              <input
                checked={draftAccess.isSubscriber}
                onChange={(event) => {
                  setDraftAccess((current) => ({
                    ...current,
                    isSubscriber: event.target.checked,
                  }));
                  setAccessError(null);
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
                checked={draftAccess.isBetaUser}
                onChange={(event) => {
                  setDraftAccess((current) => ({
                    ...current,
                    isBetaUser: event.target.checked,
                  }));
                  setAccessError(null);
                }}
                type="checkbox"
              />
              <div>
                <strong>Beta access</strong>
                <p className="text-muted">Enables beta-only functionality for this account.</p>
              </div>
            </label>
          </div>
        </section>
      ) : null}

      {hasLoadedUser ? (
        <section className="panel">
          <div>
            <p className="eyebrow">Review</p>
            <h3 style={{ marginBottom: 0 }}>Current and pending user state</h3>
          </div>

          <div className="access-state-grid">
            <div className="list-item">
              <div className="summary-row">
                <strong>Current user state</strong>
                <div className="tag-row">{renderAccessTags(loadedUser)}</div>
              </div>
              <span>{loadedUser.email}</span>
              <span className="text-muted">This is the saved access configuration currently on the account.</span>
            </div>

            <div className="list-item">
              <div className="summary-row">
                <strong>To be saved user state</strong>
                <div className="tag-row">{renderAccessTags(draftAccess)}</div>
              </div>
              <span>{loadedUser.email}</span>
              <span className="text-muted">
                {isDirty
                  ? 'This pending state will be written when you save access.'
                  : 'No pending changes. Update a toggle to enable saving.'}
              </span>
            </div>
          </div>
        </section>
      ) : null}

      {hasLoadedUser ? (
        <section className="panel">
          <div>
            <p className="eyebrow">Actions</p>
            <h3 style={{ marginBottom: 0 }}>Save or discard changes</h3>
          </div>

          <div className="button-row access-footer-actions">
            <button className="button ghost" disabled={isAccessBusy || !isDirty} onClick={handleReset} type="button">
              Reset
            </button>
            <button
              className="button primary"
              disabled={isAccessBusy || !isDirty}
              onClick={handleSaveAccess}
              type="button"
            >
              {saveMutation.isPending ? 'Saving...' : 'Save access'}
            </button>
          </div>
        </section>
      ) : null}

      {accessError ? (
        <section className="state-panel error">
          <strong>Access update failed</strong>
          <span className="text-muted">{accessError}</span>
        </section>
      ) : null}
    </>
  );
}
