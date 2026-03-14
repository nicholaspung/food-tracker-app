import { useDeferredValue, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { PaginationControls } from '@/components/shared/PaginationControls';
import { usePagination } from '@/components/shared/usePagination';
import { listAuditLogs } from '@/features/audit/api';
import { formatDateTime } from '@/lib/formatters';
import type { AuditLogRecord } from '@/lib/types';

type AuditActionFilter = AuditLogRecord['action'] | 'all';
type AuditDiffEntry = {
  after: unknown;
  before: unknown;
  fieldName: string;
};

const actionFilters: AuditActionFilter[] = ['all', 'view', 'update', 'create', 'delete'];
const pocketBaseIdPattern = /\b[a-z0-9]{15}\b/gi;

function formatAuditJson(value: unknown) {
  if (value == null) {
    return 'None';
  }

  return JSON.stringify(sanitizeAuditDisplayValue(value), null, 2);
}

function formatAuditFieldLabel(value: string) {
  const normalized = value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').trim();
  if (!normalized) {
    return 'Field';
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function isRecordId(value: string) {
  return /^[a-z0-9]{15}$/i.test(value.trim());
}

function redactRecordIdsInPath(value: string) {
  return value
    .split('/')
    .map((segment) => (isRecordId(segment) ? ':recordId' : segment))
    .join('/');
}

function sanitizeAuditDisplayValue(value: unknown): unknown {
  if (typeof value === 'string') {
    if (isRecordId(value)) {
      return 'linked record';
    }

    return value.replace(pocketBaseIdPattern, 'linked record');
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeAuditDisplayValue(item));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
        key,
        sanitizeAuditDisplayValue(nestedValue),
      ]),
    );
  }

  return value;
}

function getAuditObject(value: unknown) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function formatDiffValue(value: unknown) {
  if (value == null || value === '') {
    return 'Empty';
  }

  const sanitized = sanitizeAuditDisplayValue(value);
  if (typeof sanitized === 'string') {
    return sanitized;
  }

  return JSON.stringify(sanitized, null, 2);
}

function getAuditDiffEntries(log: AuditLogRecord | null): AuditDiffEntry[] {
  if (!log) {
    return [];
  }

  const before = getAuditObject(log.beforeJson);
  const after = getAuditObject(log.afterJson);
  const fieldNames =
    log.changedFields && log.changedFields.length > 0
      ? log.changedFields
      : Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).filter(
          (fieldName) => JSON.stringify(before[fieldName]) !== JSON.stringify(after[fieldName]),
        );

  return fieldNames.map((fieldName) => ({
    fieldName,
    before: before[fieldName],
    after: after[fieldName],
  }));
}

export function AuditTrailPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState<AuditActionFilter>('all');
  const [collectionFilter, setCollectionFilter] = useState('all');
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const deferredSearchTerm = useDeferredValue(searchTerm);

  const auditLogsQuery = useQuery({
    queryKey: ['admin', 'audit-logs'],
    queryFn: listAuditLogs,
  });

  const collectionOptions = Array.from(
    new Set((auditLogsQuery.data ?? []).map((log) => log.targetCollection).filter(Boolean)),
  ).sort((left, right) => left.localeCompare(right));

  const normalizedSearch = deferredSearchTerm.trim().toLowerCase();
  const filteredLogs = (auditLogsQuery.data ?? []).filter((log) => {
    if (actionFilter !== 'all' && log.action !== actionFilter) {
      return false;
    }

    if (collectionFilter !== 'all' && log.targetCollection !== collectionFilter) {
      return false;
    }

    if (!normalizedSearch) {
      return true;
    }

    const searchableText = [
      log.actorEmail,
      log.summary,
      log.targetCollection,
      log.targetLabel,
      log.targetRecordId,
      log.requestPath,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return searchableText.includes(normalizedSearch);
  });

  const paginatedLogs = usePagination(filteredLogs, {
    itemsPerPage: 20,
    resetKey: `${normalizedSearch}|${actionFilter}|${collectionFilter}`,
  });
  const visibleLogs = paginatedLogs.pageItems;

  const selectedLog =
    visibleLogs.find((log) => log.id === selectedLogId) ?? visibleLogs[0] ?? null;
  const diffEntries = getAuditDiffEntries(selectedLog);

  useEffect(() => {
    if (visibleLogs.length === 0) {
      setSelectedLogId(null);
      return;
    }

    if (!selectedLogId || !visibleLogs.some((log) => log.id === selectedLogId)) {
      setSelectedLogId(visibleLogs[0].id);
    }
  }, [selectedLogId, visibleLogs]);

  return (
    <>
      <section className="panel">
        <p className="eyebrow">Audit trail</p>
        <h2 style={{ marginBottom: 0 }}>Immutable admin change history</h2>
        <p className="text-muted" style={{ margin: 0 }}>
          This view is read-only. Admin writes and audited user-detail views are recorded here with
          actor, target, timestamp, and stored snapshots.
        </p>
      </section>

      <section className="panel">
        <div className="field-row">
          <div className="field">
            <label htmlFor="audit-search">Search audit entries</label>
            <input
              className="input"
              id="audit-search"
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by actor, summary, collection, or path"
              type="search"
              value={searchTerm}
            />
          </div>

          <div className="field">
            <label htmlFor="audit-action-filter">Action</label>
            <select
              className="input"
              id="audit-action-filter"
              onChange={(event) => setActionFilter(event.target.value as AuditActionFilter)}
              value={actionFilter}
            >
              {actionFilters.map((filter) => (
                <option key={filter} value={filter}>
                  {filter}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="audit-collection-filter">Collection</label>
            <select
              className="input"
              id="audit-collection-filter"
              onChange={(event) => setCollectionFilter(event.target.value)}
              value={collectionFilter}
            >
              <option value="all">all</option>
              {collectionOptions.map((collectionName) => (
                <option key={collectionName} value={collectionName}>
                  {collectionName}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {auditLogsQuery.isLoading ? (
        <section className="state-panel">
          <strong>Loading audit trail...</strong>
        </section>
      ) : null}

      {auditLogsQuery.isError ? (
        <section className="state-panel error">
          <strong>Could not load audit trail</strong>
          <span className="text-muted">
            Confirm the `audit_logs` collection exists and your admin account can read it.
          </span>
        </section>
      ) : null}

      {auditLogsQuery.data ? (
        <section className="audit-grid">
          <article className="detail-card">
            <div className="summary-row">
              <div>
                <p className="eyebrow">Entries</p>
                <h3>{filteredLogs.length} visible record(s)</h3>
              </div>
            </div>

            <PaginationControls {...paginatedLogs} position="top" />

            {filteredLogs.length === 0 ? (
              <div className="state-panel">
                <span className="text-muted">No audit entries match the current filters.</span>
              </div>
            ) : (
              <>
                <div className="audit-log-list">
                  {visibleLogs.map((log) => (
                    <button
                      className={`audit-log-row${selectedLog?.id === log.id ? ' active' : ''}`}
                      key={log.id}
                      onClick={() => setSelectedLogId(log.id)}
                      type="button"
                    >
                      <div className="summary-row">
                        <strong>{log.summary?.trim() || `${log.action} ${log.targetCollection}`}</strong>
                        <span className={`status-pill ${log.action}`}>{log.action}</span>
                      </div>

                      <div className="tag-row tag-row-start">
                        <span className="tag">{log.actorEmail?.trim() || 'Unknown actor'}</span>
                        <span className="tag">{formatDateTime(log.created)}</span>
                        <span className="tag">{log.targetCollection}</span>
                        {log.targetLabel?.trim() ? <span className="tag">{log.targetLabel}</span> : null}
                      </div>
                    </button>
                  ))}
                </div>
                <PaginationControls {...paginatedLogs} />
              </>
            )}
          </article>

          <article className="detail-card">
            <div>
              <p className="eyebrow">Detail</p>
              <h3>{selectedLog?.summary?.trim() || 'Select an audit entry'}</h3>
            </div>

            {selectedLog ? (
              <div className="audit-detail-stack">
                <div className="audit-meta-grid">
                  <div className="list-item">
                    <strong>Actor</strong>
                    <span className="text-muted">
                      {selectedLog.expand?.actor?.email ?? selectedLog.actorEmail ?? 'Unknown actor'}
                    </span>
                  </div>
                  <div className="list-item">
                    <strong>When</strong>
                    <span className="text-muted">{formatDateTime(selectedLog.created)}</span>
                  </div>
                  <div className="list-item">
                    <strong>Target</strong>
                    <span className="text-muted">
                      {selectedLog.targetCollection}
                      {selectedLog.targetLabel?.trim() ? ` (${selectedLog.targetLabel})` : ''}
                    </span>
                  </div>
                  <div className="list-item">
                    <strong>HTTP request</strong>
                    <span className="text-muted">
                      {[selectedLog.requestMethod, redactRecordIdsInPath(selectedLog.requestPath ?? '')]
                        .filter(Boolean)
                        .join(' ')}
                    </span>
                  </div>
                  <div className="list-item">
                    <strong>IP address</strong>
                    <span className="text-muted mono-text">{selectedLog.requestIp || 'Unknown'}</span>
                  </div>
                </div>

                <div className="list-item">
                  <strong>Changed fields</strong>
                  {selectedLog.changedFields && selectedLog.changedFields.length > 0 ? (
                    <div className="tag-row tag-row-start">
                      {selectedLog.changedFields.map((fieldName) => (
                        <span className="tag" key={fieldName}>
                          {fieldName}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-muted">No field-level diff was stored for this entry.</span>
                  )}
                </div>

                <div className="list-item">
                  <strong>Diff</strong>
                  {diffEntries.length > 0 ? (
                    <div className="audit-diff-list">
                      {diffEntries.map((entry) => (
                        <div className="audit-diff-row" key={entry.fieldName}>
                          <span className="audit-diff-field">{formatAuditFieldLabel(entry.fieldName)}</span>
                          <div className="audit-diff-columns">
                            <div className="audit-diff-block removed">
                              <span className="audit-diff-label">Before</span>
                              <pre className="audit-diff-value">{formatDiffValue(entry.before)}</pre>
                            </div>
                            <div className="audit-diff-block added">
                              <span className="audit-diff-label">After</span>
                              <pre className="audit-diff-value">{formatDiffValue(entry.after)}</pre>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-muted">No diff is available for this audit entry.</span>
                  )}
                </div>

                <div className="list-item">
                  <strong>Metadata</strong>
                  <pre className="json-block">{formatAuditJson(selectedLog.metadataJson)}</pre>
                </div>
              </div>
            ) : (
              <div className="state-panel">
                <span className="text-muted">Select an audit entry to inspect its snapshots.</span>
              </div>
            )}
          </article>
        </section>
      ) : null}
    </>
  );
}
