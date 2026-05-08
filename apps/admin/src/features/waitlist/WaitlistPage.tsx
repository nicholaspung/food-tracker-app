import { useDeferredValue, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { approveWaitlistEntry, listWaitlistEntries, rejectWaitlistEntry } from '@/features/waitlist/api';
import { formatDateTime } from '@/lib/formatters';
import type { WaitlistStatus } from '@/lib/types';

const statusFilters: Array<WaitlistStatus | 'all'> = ['pending', 'approved', 'rejected', 'signed_up', 'all'];

function formatStatus(status: WaitlistStatus | 'all') {
  if (status === 'signed_up') {
    return 'signed up';
  }
  return status;
}

export function WaitlistPage() {
  const [statusFilter, setStatusFilter] = useState<WaitlistStatus | 'all'>('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const queryClient = useQueryClient();

  const waitlistQuery = useQuery({
    queryKey: ['admin', 'waitlist', statusFilter, deferredSearchTerm],
    queryFn: () => listWaitlistEntries({ status: statusFilter, search: deferredSearchTerm }),
  });

  const approveMutation = useMutation({
    mutationFn: approveWaitlistEntry,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'waitlist'] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: rejectWaitlistEntry,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'waitlist'] });
    },
  });

  const activeMutationId =
    approveMutation.isPending && typeof approveMutation.variables === 'string'
      ? approveMutation.variables
      : rejectMutation.isPending && typeof rejectMutation.variables === 'string'
        ? rejectMutation.variables
        : null;
  const mutationError =
    approveMutation.error instanceof Error
      ? approveMutation.error.message
      : rejectMutation.error instanceof Error
        ? rejectMutation.error.message
        : null;

  return (
    <>
      <section className="panel">
        <p className="eyebrow">Waitlist</p>
        <h2 style={{ marginBottom: 0 }}>Approve account access by email</h2>
        <p className="text-muted" style={{ margin: 0 }}>
          Approved emails can create an account without an invite code. Approval emails are sent through PocketBase SMTP.
        </p>
      </section>

      <section className="panel">
        <div className="filter-row">
          {statusFilters.map((status) => (
            <button
              className={`filter-chip${statusFilter === status ? ' active' : ''}`}
              key={status}
              onClick={() => setStatusFilter(status)}
              type="button"
            >
              {formatStatus(status)}
            </button>
          ))}
        </div>
        <div className="field">
          <label htmlFor="waitlist-search">Search waitlist</label>
          <input
            className="input"
            id="waitlist-search"
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search by email"
            type="search"
            value={searchTerm}
          />
        </div>
      </section>

      {mutationError ? (
        <section className="state-panel error">
          <strong>Could not update waitlist entry</strong>
          <span className="text-muted">{mutationError}</span>
        </section>
      ) : null}

      {waitlistQuery.isLoading ? (
        <section className="state-panel">
          <strong>Loading waitlist...</strong>
        </section>
      ) : null}

      {waitlistQuery.isError ? (
        <section className="state-panel error">
          <strong>Could not load waitlist</strong>
          <span className="text-muted">
            Confirm that this admin account can access waitlist endpoints.
          </span>
        </section>
      ) : null}

      {waitlistQuery.data ? (
        <section className="table-panel">
          <div className="summary-row">
            <div>
              <p className="eyebrow">Entries</p>
              <h3>{waitlistQuery.data.totalItems} waitlist record(s)</h3>
            </div>
          </div>

          {waitlistQuery.data.items.length === 0 ? (
            <div className="state-panel">
              <span className="text-muted">No waitlist entries matched this view.</span>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Status</th>
                    <th>Consent</th>
                    <th>Joined</th>
                    <th>Decision</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {waitlistQuery.data.items.map((entry) => (
                    <tr key={entry.id}>
                      <td>{entry.email}</td>
                      <td>
                        <span className="tag">{formatStatus(entry.status)}</span>
                      </td>
                      <td>
                        <div className="tag-row">
                          {entry.productUpdatesConsent ? <span className="tag">product</span> : null}
                          {entry.marketingConsent ? <span className="tag">marketing</span> : null}
                          {entry.onboardingEmailsAcknowledged ? <span className="tag">required</span> : null}
                        </div>
                      </td>
                      <td>{formatDateTime(entry.created)}</td>
                      <td>
                        {entry.approvedAt ? <span className="text-muted">Approved {formatDateTime(entry.approvedAt)}</span> : null}
                        {entry.rejectedAt ? <span className="text-muted">Rejected {formatDateTime(entry.rejectedAt)}</span> : null}
                        {!entry.approvedAt && !entry.rejectedAt ? <span className="text-muted">No decision</span> : null}
                      </td>
                      <td>
                        {entry.status === 'signed_up' ? (
                          <span className="text-muted">Account created</span>
                        ) : (
                          <div className="button-row">
                            <button
                              className="button primary"
                              disabled={activeMutationId === entry.id}
                              onClick={() => approveMutation.mutate(entry.id)}
                              type="button"
                            >
                              {activeMutationId === entry.id && approveMutation.isPending ? 'Approving...' : 'Approve'}
                            </button>
                            <button
                              className="button danger"
                              disabled={activeMutationId === entry.id}
                              onClick={() => rejectMutation.mutate(entry.id)}
                              type="button"
                            >
                              {activeMutationId === entry.id && rejectMutation.isPending ? 'Rejecting...' : 'Reject'}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </>
  );
}
