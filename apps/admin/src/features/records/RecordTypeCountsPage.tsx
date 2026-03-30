import { useDeferredValue, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { PaginatedCollection } from '@/components/shared/PaginatedCollection';
import type { AdminUser } from '@/features/auth/types';
import {
  getAdminRecordTypeCounts,
  type AdminRecordType,
} from '@/features/records/api';
import { formatDateTime } from '@/lib/formatters';

const defaultRecordType: AdminRecordType = 'quick-track';

const recordTypeOptions: Array<{
  description: string;
  label: string;
  value: AdminRecordType;
}> = [
  {
    value: 'quick-track',
    label: 'Quick track items',
    description: 'See how many users have logged Quick Track items and how many each user has created.',
  },
  {
    value: 'visit',
    label: 'Visits',
    description: 'Review visit volume by user.',
  },
  {
    value: 'note',
    label: 'Notes',
    description: 'Review note creation counts by user.',
  },
  {
    value: 'list',
    label: 'Restaurant lists',
    description: 'Review saved list creation counts by user.',
  },
  {
    value: 'bill',
    label: 'Bills',
    description: 'Review bill creation counts by user.',
  },
  {
    value: 'feedback-thread',
    label: 'Feedback threads',
    description: 'Review support thread creation counts by user.',
  },
  {
    value: 'photo-upload',
    label: 'Photo uploads',
    description: 'Review upload counts by user.',
  },
];

function isAdminRecordType(value: string | null): value is AdminRecordType {
  return recordTypeOptions.some((option) => option.value === value);
}

function formatAverageRecords(totalRecords: number, usersWithRecords: number) {
  if (usersWithRecords <= 0) {
    return '0';
  }

  const average = totalRecords / usersWithRecords;
  if (Number.isInteger(average)) {
    return String(average);
  }

  return average.toFixed(1);
}

function renderAccessTags(user: AdminUser | null) {
  if (!user) {
    return <span className="text-muted">Unavailable</span>;
  }

  return (
    <div className="tag-row tag-row-start">
      <span className="tag">{user.isAdmin ? 'admin' : 'user'}</span>
      {user.isSubscriber ? <span className="tag">subscriber</span> : null}
      {user.isBetaUser ? <span className="tag">beta</span> : null}
    </div>
  );
}

export function RecordTypeCountsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const selectedTypeParam = searchParams.get('type');

  const selectedRecordType = isAdminRecordType(selectedTypeParam)
    ? selectedTypeParam
    : defaultRecordType;

  const summaryQuery = useQuery({
    queryKey: ['admin', 'record-counts', selectedRecordType],
    queryFn: () => getAdminRecordTypeCounts(selectedRecordType),
  });

  const selectedOption =
    recordTypeOptions.find((option) => option.value === selectedRecordType) ?? recordTypeOptions[0];

  const visibleRows = useMemo(() => {
    const rows = summaryQuery.data?.rows ?? [];
    const normalizedSearch = deferredSearchTerm.trim().toLowerCase();
    if (!normalizedSearch) {
      return rows;
    }

    return rows.filter((row) =>
      [row.user?.email, row.user?.name, row.userId].some((value) =>
        value?.toLowerCase().includes(normalizedSearch),
      ),
    );
  }, [deferredSearchTerm, summaryQuery.data?.rows]);

  const topRow = summaryQuery.data?.rows[0] ?? null;

  return (
    <>
      <section className="panel">
        <p className="eyebrow">Record counts</p>
        <h2 style={{ marginBottom: 0 }}>Review record volume by user</h2>
        <p className="text-muted" style={{ margin: 0 }}>
          Pick a record type to see how many users have at least one matching record and how many
          each user has logged. The default view focuses on Quick Track items.
        </p>
      </section>

      <section className="panel">
        <div className="field-row">
          <div className="field">
            <label htmlFor="record-type-filter">Record type</label>
            <select
              className="input"
              id="record-type-filter"
              onChange={(event) => {
                const nextParams = new URLSearchParams(searchParams);
                nextParams.set('type', event.target.value);
                setSearchParams(nextParams);
              }}
              value={selectedRecordType}
            >
              {recordTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="record-count-search">Search users</label>
            <input
              className="input"
              id="record-count-search"
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by email, name, or user id"
              type="search"
              value={searchTerm}
            />
          </div>
        </div>

        <p className="text-muted" style={{ margin: 0 }}>
          {selectedOption.description} Only users with at least one matching record are listed.
        </p>
      </section>

      {summaryQuery.isLoading ? (
        <section className="state-panel">
          <strong>Loading record counts...</strong>
        </section>
      ) : null}

      {summaryQuery.isError ? (
        <section className="state-panel error">
          <strong>Could not load record counts</strong>
          <span className="text-muted">
            Confirm the admin API is running and the selected record type is supported.
          </span>
        </section>
      ) : null}

      {summaryQuery.data ? (
        <>
          <section className="metric-grid">
            <article className="metric-card">
              <p className="eyebrow">Total records</p>
              <div className="metric-value">{summaryQuery.data.totalRecords}</div>
              <span className="text-muted">{summaryQuery.data.label} across all matching users.</span>
            </article>

            <article className="metric-card">
              <p className="eyebrow">Users with records</p>
              <div className="metric-value">{summaryQuery.data.usersWithRecords}</div>
              <span className="text-muted">Distinct users with at least one matching record.</span>
            </article>

            <article className="metric-card">
              <p className="eyebrow">Average per user</p>
              <div className="metric-value">
                {formatAverageRecords(
                  summaryQuery.data.totalRecords,
                  summaryQuery.data.usersWithRecords,
                )}
              </div>
              <span className="text-muted">Average only across users who have matching records.</span>
            </article>

            <article className="metric-card">
              <p className="eyebrow">Highest per user</p>
              <div className="metric-value">{topRow?.recordCount ?? 0}</div>
              <span className="text-muted">
                {topRow?.user?.email || topRow?.user?.name || 'No matching users yet.'}
              </span>
            </article>
          </section>

          <section className="table-panel">
            <div className="summary-row">
              <div>
                <p className="eyebrow">{summaryQuery.data.label}</p>
                <h3>{visibleRows.length} visible user(s)</h3>
              </div>

              <div className="tag-row">
                <span className="tag">{summaryQuery.data.usersWithRecords} user(s) with records</span>
                <span className="tag">{summaryQuery.data.totalRecords} total record(s)</span>
              </div>
            </div>

            {summaryQuery.data.rows.length === 0 ? (
              <div className="state-panel">
                <span className="text-muted">
                  No {summaryQuery.data.label.toLowerCase()} have been created yet.
                </span>
              </div>
            ) : visibleRows.length === 0 ? (
              <div className="state-panel">
                <span className="text-muted">No users matched your search.</span>
              </div>
            ) : (
              <PaginatedCollection
                items={visibleRows}
                itemsPerPage={25}
                resetKey={`${selectedRecordType}:${deferredSearchTerm}`}
              >
                {(pageRows) => (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>User</th>
                          <th>Access</th>
                          <th>Records</th>
                          <th>Latest record</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {pageRows.map((row) => (
                          <tr key={row.userId}>
                            <td>
                              <div style={{ display: 'grid', gap: 4 }}>
                                <strong>{row.user?.name?.trim() || row.user?.email || row.userId}</strong>
                                {row.user?.name?.trim() && row.user?.email ? (
                                  <span className="text-muted">{row.user.email}</span>
                                ) : null}
                                <span className="text-muted">{row.userId}</span>
                              </div>
                            </td>
                            <td>{renderAccessTags(row.user)}</td>
                            <td style={{ whiteSpace: 'nowrap' }}>{row.recordCount}</td>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              {row.latestRecordAt ? formatDateTime(row.latestRecordAt) : 'Unknown'}
                            </td>
                            <td>
                              <Link className="route-link" to={`/users/${row.userId}`}>
                                Inspect
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </PaginatedCollection>
            )}
          </section>
        </>
      ) : null}
    </>
  );
}
