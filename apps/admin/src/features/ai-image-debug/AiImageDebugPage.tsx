import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  listReceiptScanDebugLogs,
  runMenuScanDebug,
  runReceiptScanDebug,
  runStorefrontDebug,
  type AiImageDebugApiError,
  type AiImageDebugMode,
  type AiImageDebugRunMetadata,
  type MenuScanDebugResponse,
  type ReceiptScanDebugLogRecord,
  type ReceiptScanDebugLogStatus,
  type ReceiptScanDebugResponse,
  type StorefrontDebugResponse,
} from '@/features/ai-image-debug/api';
import {
  formatFileSize,
  formatJson,
  getDebugPayload,
  isSupportedDebugImage,
  parseMenuItemNamesFromCsv,
} from '@/features/ai-image-debug/display';
import { formatDateTime } from '@/lib/formatters';

type DebugResult =
  | {
      mode: 'storefront';
      metadata: AiImageDebugRunMetadata;
      response: StorefrontDebugResponse;
      errorMessage: null;
      errorPayload: null;
    }
  | {
      mode: 'menu-scan';
      metadata: AiImageDebugRunMetadata;
      response: MenuScanDebugResponse;
      errorMessage: null;
      errorPayload: null;
    }
  | {
      mode: 'receipt-scan';
      metadata: AiImageDebugRunMetadata;
      response: ReceiptScanDebugResponse;
      errorMessage: null;
      errorPayload: null;
    }
  | {
      mode: AiImageDebugMode;
      metadata: AiImageDebugRunMetadata;
      response: null;
      errorMessage: string;
      errorPayload: unknown;
    };

type AiImageDebugTab = 'scan' | 'logs';

const aiImageDebugTabs: Array<{ label: string; value: AiImageDebugTab }> = [
  { label: 'Scan Photos', value: 'scan' },
  { label: 'Logs', value: 'logs' },
];

const modeOptions: Array<{ label: string; value: AiImageDebugMode }> = [
  { label: 'Read a Storefront', value: 'storefront' },
  { label: 'Scan Menu Items', value: 'menu-scan' },
  { label: 'Scan Receipt', value: 'receipt-scan' },
];

const receiptLogStatusOptions: Array<{ label: string; value: ReceiptScanDebugLogStatus | 'all' }> =
  [
    { label: 'All statuses', value: 'all' },
    { label: 'Success', value: 'success' },
    { label: 'Failed', value: 'failed' },
    { label: 'Invalid response', value: 'invalid_response' },
    { label: 'Empty response', value: 'empty_response' },
    { label: 'Not receipt', value: 'not_receipt' },
    { label: 'Low confidence', value: 'low_confidence' },
  ];

function buildRequestId() {
  const random = Math.random().toString(36).slice(2, 10);
  return `admin-image-debug-${Date.now()}-${random}`;
}

function getEndpoint(mode: AiImageDebugMode): AiImageDebugRunMetadata['endpoint'] {
  if (mode === 'storefront') {
    return '/api/find-restaurant-name';
  }
  return mode === 'receipt-scan' ? '/api/parse-receipt' : '/api/parse-menu';
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Could not run this image debug request.';
}

function getApiError(error: unknown): AiImageDebugApiError | null {
  if (error instanceof Error && 'status' in error && 'responseData' in error) {
    return error as AiImageDebugApiError;
  }

  return null;
}

function MetadataGrid({ metadata }: { metadata: AiImageDebugRunMetadata }) {
  return (
    <div className="ai-debug-metadata-grid">
      <div className="ai-debug-metadata-item">
        <span className="inventory-secondary-text">Request ID</span>
        <strong className="mono-text">{metadata.requestId}</strong>
      </div>
      <div className="ai-debug-metadata-item">
        <span className="inventory-secondary-text">Endpoint</span>
        <strong className="mono-text">{metadata.endpoint}</strong>
      </div>
      <div className="ai-debug-metadata-item">
        <span className="inventory-secondary-text">HTTP status</span>
        <strong>{metadata.status ?? 'Unavailable'}</strong>
      </div>
      <div className="ai-debug-metadata-item">
        <span className="inventory-secondary-text">Duration</span>
        <strong>{metadata.durationMs} ms</strong>
      </div>
      <div className="ai-debug-metadata-item">
        <span className="inventory-secondary-text">File</span>
        <strong>{metadata.fileName}</strong>
      </div>
      <div className="ai-debug-metadata-item">
        <span className="inventory-secondary-text">Type and size</span>
        <strong>
          {metadata.fileType || 'Unknown type'} · {formatFileSize(metadata.fileSize)}
        </strong>
      </div>
    </div>
  );
}

function ConfidenceTag({ confidence }: { confidence: string }) {
  return <span className={`status-pill ai-debug-confidence-${confidence}`}>{confidence}</span>;
}

function StorefrontPreview({ response }: { response: StorefrontDebugResponse }) {
  if ('error' in response) {
    return (
      <div className="state-panel error">
        <strong>No restaurant detected</strong>
        <span>{response.reason || 'Try a clearer photo of the sign or storefront.'}</span>
      </div>
    );
  }

  if (response.found) {
    return (
      <div className="ai-debug-phone-preview">
        <div className="summary-row">
          <div>
            <p className="eyebrow">Mobile preview</p>
            <h3>Possible Names</h3>
          </div>
          {response.language ? <span className="tag">{response.language}</span> : null}
        </div>
        <div className="inline-list">
          {response.options.map((option) => (
            <div className="list-item" key={`${option.name}-${option.confidence}`}>
              <div className="summary-row">
                <strong>{option.name}</strong>
                <ConfidenceTag confidence={option.confidence} />
              </div>
              {option.reason ? <span className="text-muted">{option.reason}</span> : null}
              <div className="tag-row tag-row-start">
                <span className="tag">Search</span>
                <span className="tag">Copy</span>
                <span className="tag">Add manually</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="ai-debug-phone-preview">
      <p className="eyebrow">Mobile preview</p>
      <h3>Visible Text</h3>
      <p className="ai-debug-extracted-text">
        {response.allText?.trim() || 'No clear text found.'}
      </p>
    </div>
  );
}

function MenuScanPreview({ response }: { response: MenuScanDebugResponse }) {
  const itemNames = parseMenuItemNamesFromCsv(response.csv);
  const parsedPreview = {
    itemNames,
    itemCount: itemNames.length,
    verification: response.verification ?? null,
    recordsCreated: false,
  };

  return (
    <div className="ai-debug-phone-preview">
      <div className="summary-row">
        <div>
          <p className="eyebrow">Mobile preview</p>
          <h3>Menu scan completed</h3>
        </div>
        <span className="tag">Read-only</span>
      </div>

      <p className="text-muted">
        No menu item records were created. This shows how the extracted items would be presented
        after a mobile scan.
      </p>

      {response.verification ? (
        <div className="state-panel">
          <div className="summary-row">
            <strong>Restaurant verification</strong>
            <ConfidenceTag confidence={response.verification.confidence} />
          </div>
          <span>
            Match:{' '}
            {response.verification.matched === null
              ? 'Unknown'
              : response.verification.matched
                ? 'Yes'
                : 'No'}
          </span>
          {response.verification.selectedRestaurantName ? (
            <span className="text-muted">
              Selected: {response.verification.selectedRestaurantName}
            </span>
          ) : null}
          {response.verification.observedRestaurantNames.length > 0 ? (
            <span className="text-muted">
              Observed: {response.verification.observedRestaurantNames.join(', ')}
            </span>
          ) : null}
          {response.verification.reason ? (
            <span className="text-muted">{response.verification.reason}</span>
          ) : null}
        </div>
      ) : null}

      <div className="inline-list">
        <strong>Would display these menu items</strong>
        {itemNames.length > 0 ? (
          itemNames.map((itemName) => (
            <div className="ai-debug-menu-item-row" key={itemName}>
              <span aria-hidden="true">✓</span>
              <span>{itemName}</span>
            </div>
          ))
        ) : (
          <div className="state-panel">
            <strong>No menu item names could be parsed from the CSV.</strong>
            <span className="text-muted">Review the raw CSV response below.</span>
          </div>
        )}
      </div>

      <pre className="json-block">{formatJson(parsedPreview)}</pre>
    </div>
  );
}

function ReceiptScanPreview({ response }: { response: ReceiptScanDebugResponse }) {
  return (
    <div className="ai-debug-phone-preview">
      <div className="summary-row">
        <div>
          <p className="eyebrow">Mobile preview</p>
          <h3>{response.title || response.restaurantName || 'Receipt scan completed'}</h3>
        </div>
        <ConfidenceTag confidence={response.confidence} />
      </div>

      <p className="text-muted">
        Items would be added to the Bill Draft unassigned so the user can choose who had each one.
      </p>

      <div className="inline-list">
        <strong>Would add these bill items</strong>
        {response.items.length > 0 ? (
          response.items.map((item, index) => (
            <div className="list-item" key={`${item.name}-${index}`}>
              <div className="summary-row">
                <strong>{item.name}</strong>
                <span>${item.price.toFixed(2)}</span>
              </div>
              <div className="tag-row tag-row-start">
                <ConfidenceTag confidence={item.confidence} />
                {item.quantityText ? <span className="tag">Qty {item.quantityText}</span> : null}
                <span className="tag">Unassigned</span>
              </div>
              {item.warning ? <span className="text-muted">{item.warning}</span> : null}
            </div>
          ))
        ) : (
          <div className="state-panel">
            <strong>No receipt items were extracted.</strong>
            <span className="text-muted">Review totals and raw JSON below.</span>
          </div>
        )}
      </div>

      <pre className="json-block">
        {formatJson({
          subtotal: response.subtotal ?? null,
          tax: response.tax ?? null,
          tip: response.tip ?? null,
          fees: response.fees ?? null,
          discount: response.discount ?? null,
          finalTotal: response.finalTotal ?? null,
          warnings: response.warnings,
        })}
      </pre>
    </div>
  );
}

function RawDebugPanels({ result }: { result: DebugResult }) {
  const responseJson = result.response ?? result.errorPayload;
  const parsedPreview =
    result.mode === 'menu-scan' && result.response
      ? {
          itemNames: parseMenuItemNamesFromCsv(result.response.csv),
          verification: result.response.verification ?? null,
          recordsCreated: false,
        }
      : result.response;

  return (
    <section className="table-panel">
      <div className="summary-row">
        <div>
          <p className="eyebrow">Endpoint logs</p>
          <h3>Raw response and debug payload</h3>
        </div>
        <span className="tag">Request {result.metadata.requestId}</span>
      </div>

      <div className="ai-debug-raw-grid">
        <div className="ai-debug-raw-block">
          <strong>Response JSON</strong>
          <pre className="json-block">{formatJson(responseJson)}</pre>
        </div>
        <div className="ai-debug-raw-block">
          <strong>Endpoint Debug</strong>
          <pre className="json-block">{formatJson(getDebugPayload(responseJson))}</pre>
        </div>
        <div className="ai-debug-raw-block">
          <strong>Parsed Preview Data</strong>
          <pre className="json-block">{formatJson(parsedPreview)}</pre>
        </div>
      </div>
    </section>
  );
}

function formatLogStatus(status: string) {
  return status.replace(/_/g, ' ');
}

function getLogUserLabel(log: ReceiptScanDebugLogRecord) {
  return log.expand?.user?.email || log.expand?.user?.name || log.user || 'Unknown user';
}

function readReceiptLogItemCount(log: ReceiptScanDebugLogRecord) {
  const metadata = log.metadataJson;
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const itemCount = (metadata as { itemCount?: unknown }).itemCount;
    return typeof itemCount === 'number' ? itemCount : null;
  }

  const rawOutput = log.rawOutputJson;
  if (rawOutput && typeof rawOutput === 'object' && !Array.isArray(rawOutput)) {
    const parsedReceipt = (rawOutput as { parsedReceipt?: unknown }).parsedReceipt;
    if (parsedReceipt && typeof parsedReceipt === 'object' && !Array.isArray(parsedReceipt)) {
      const items = (parsedReceipt as { items?: unknown }).items;
      return Array.isArray(items) ? items.length : null;
    }
  }

  return null;
}

function ReceiptScanDebugLogsPanel() {
  const [statusFilter, setStatusFilter] = useState<ReceiptScanDebugLogStatus | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);

  const logsQuery = useQuery({
    queryKey: ['admin', 'receipt-scan-debug-logs'],
    queryFn: listReceiptScanDebugLogs,
  });

  const filteredLogs = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return (logsQuery.data ?? []).filter((log) => {
      if (statusFilter !== 'all' && log.status !== statusFilter) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      return [
        log.requestId,
        log.status,
        log.model,
        log.errorType,
        log.errorMessage,
        getLogUserLabel(log),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(normalizedSearch);
    });
  }, [logsQuery.data, searchTerm, statusFilter]);

  const selectedLog =
    filteredLogs.find((log) => log.id === selectedLogId) ?? filteredLogs[0] ?? null;

  useEffect(() => {
    if (filteredLogs.length === 0) {
      setSelectedLogId(null);
      return;
    }

    if (!selectedLogId || !filteredLogs.some((log) => log.id === selectedLogId)) {
      setSelectedLogId(filteredLogs[0].id);
    }
  }, [filteredLogs, selectedLogId]);

  return (
    <>
      <section className="panel">
        <div className="summary-row">
          <div>
            <p className="eyebrow">Receipt scan logs</p>
            <h3>Persisted debug history</h3>
          </div>
          <button
            className="button ghost"
            disabled={logsQuery.isFetching}
            onClick={() => void logsQuery.refetch()}
            type="button"
          >
            {logsQuery.isFetching ? 'Refreshing...' : 'Refresh logs'}
          </button>
        </div>
        <p className="text-muted" style={{ margin: 0 }}>
          These records come from the backend `receipt_scan_debug_logs` collection and survive page
          refreshes. Records are cleaned up after 30 days.
        </p>
      </section>

      <section className="panel">
        <div className="field-row">
          <div className="field">
            <label htmlFor="receipt-log-search">Search logs</label>
            <input
              className="input"
              id="receipt-log-search"
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Request ID, user, model, or error"
              type="search"
              value={searchTerm}
            />
          </div>
          <div className="field">
            <label htmlFor="receipt-log-status">Status</label>
            <select
              className="input"
              id="receipt-log-status"
              onChange={(event) =>
                setStatusFilter(event.target.value as ReceiptScanDebugLogStatus | 'all')
              }
              value={statusFilter}
            >
              {receiptLogStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {logsQuery.isLoading ? (
        <section className="state-panel">
          <strong>Loading receipt scan logs...</strong>
        </section>
      ) : null}

      {logsQuery.isError ? (
        <section className="state-panel error">
          <strong>Could not load receipt scan logs</strong>
          <span className="text-muted">
            Confirm the `receipt_scan_debug_logs` collection exists and your admin account can read
            it.
          </span>
        </section>
      ) : null}

      {logsQuery.data ? (
        <section className="audit-grid">
          <article className="detail-card">
            <div className="summary-row">
              <div>
                <p className="eyebrow">Recent logs</p>
                <h3>{filteredLogs.length} visible record(s)</h3>
              </div>
              <span className="tag">{logsQuery.data.length} loaded</span>
            </div>

            {filteredLogs.length === 0 ? (
              <div className="state-panel">
                <span className="text-muted">No receipt scan logs match the current filters.</span>
              </div>
            ) : (
              <div className="audit-log-list">
                {filteredLogs.map((log) => {
                  const itemCount = readReceiptLogItemCount(log);

                  return (
                    <button
                      className={`audit-log-row${selectedLog?.id === log.id ? ' active' : ''}`}
                      key={log.id}
                      onClick={() => setSelectedLogId(log.id)}
                      type="button"
                    >
                      <div className="summary-row">
                        <strong className="mono-text">{log.requestId}</strong>
                        <span className={`status-pill ${log.status}`}>
                          {formatLogStatus(log.status)}
                        </span>
                      </div>
                      <div className="tag-row tag-row-start">
                        <span className="tag">{getLogUserLabel(log)}</span>
                        <span className="tag">{formatDateTime(log.created)}</span>
                        {log.confidence ? <span className="tag">{log.confidence}</span> : null}
                        {itemCount !== null ? <span className="tag">{itemCount} item(s)</span> : null}
                      </div>
                      {log.errorMessage ? (
                        <span className="text-muted">{log.errorMessage}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}
          </article>

          <article className="detail-card">
            <div>
              <p className="eyebrow">Detail</p>
              <h3>{selectedLog ? selectedLog.requestId : 'Select a receipt scan log'}</h3>
            </div>

            {selectedLog ? (
              <div className="audit-detail-stack">
                <div className="audit-meta-grid">
                  <div className="list-item">
                    <strong>Status</strong>
                    <span className={`status-pill ${selectedLog.status}`}>
                      {formatLogStatus(selectedLog.status)}
                    </span>
                  </div>
                  <div className="list-item">
                    <strong>User</strong>
                    <span className="text-muted">{getLogUserLabel(selectedLog)}</span>
                  </div>
                  <div className="list-item">
                    <strong>Created</strong>
                    <span className="text-muted">{formatDateTime(selectedLog.created)}</span>
                  </div>
                  <div className="list-item">
                    <strong>Model</strong>
                    <span className="text-muted">{selectedLog.model || 'Unknown'}</span>
                  </div>
                  <div className="list-item">
                    <strong>HTTP</strong>
                    <span className="text-muted">{selectedLog.httpStatusCode ?? 'Unknown'}</span>
                  </div>
                  <div className="list-item">
                    <strong>Duration</strong>
                    <span className="text-muted">
                      {selectedLog.durationMs == null ? 'Unknown' : `${selectedLog.durationMs} ms`}
                    </span>
                  </div>
                </div>

                <div className="list-item">
                  <strong>Usage</strong>
                  <div className="tag-row tag-row-start">
                    <span className="tag">prompt {selectedLog.promptTokens ?? 0}</span>
                    <span className="tag">output {selectedLog.outputTokens ?? 0}</span>
                    <span className="tag">total {selectedLog.totalTokens ?? 0}</span>
                    <span className="tag">
                      {selectedLog.imageMimeType || 'unknown image'} ·{' '}
                      {formatFileSize(selectedLog.imageSizeBytes ?? 0)}
                    </span>
                  </div>
                </div>

                {selectedLog.errorType || selectedLog.errorMessage ? (
                  <div className="list-item">
                    <strong>Error</strong>
                    <span className="text-muted">
                      {[selectedLog.errorType, selectedLog.errorMessage].filter(Boolean).join(': ')}
                    </span>
                  </div>
                ) : null}

                <div className="list-item">
                  <strong>Metadata</strong>
                  <pre className="json-block">{formatJson(selectedLog.metadataJson ?? null)}</pre>
                </div>

                <div className="list-item">
                  <strong>Raw output</strong>
                  <pre className="json-block">{formatJson(selectedLog.rawOutputJson ?? null)}</pre>
                </div>
              </div>
            ) : (
              <div className="state-panel">
                <span className="text-muted">Select a receipt scan log to inspect its payload.</span>
              </div>
            )}
          </article>
        </section>
      ) : null}
    </>
  );
}

export function AiImageDebugPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<AiImageDebugTab>('scan');
  const [mode, setMode] = useState<AiImageDebugMode>('storefront');
  const [file, setFile] = useState<File | null>(null);
  const [restaurantId, setRestaurantId] = useState('');
  const [restaurantName, setRestaurantName] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);
  const [result, setResult] = useState<DebugResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const submitDisabled = !file || Boolean(fileError) || isRunning;

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;
    setFile(nextFile);
    setResult(null);

    if (!nextFile) {
      setFileError(null);
      return;
    }

    setFileError(
      isSupportedDebugImage(nextFile)
        ? null
        : 'Upload a JPEG, PNG, WebP, HEIC, or HEIF image.',
    );
  };

  const clearState = () => {
    setFile(null);
    setFileError(null);
    setResult(null);
    setRestaurantId('');
    setRestaurantName('');
  };

  const runDebug = async () => {
    if (!file || fileError) {
      return;
    }

    const requestId = buildRequestId();
    const endpoint = getEndpoint(mode);
    const startedAt = performance.now();
    setIsRunning(true);
    setResult(null);

    try {
      const response =
        mode === 'storefront'
          ? await runStorefrontDebug({ file, requestId })
          : mode === 'receipt-scan'
            ? await runReceiptScanDebug({ file, requestId })
            : await runMenuScanDebug({
                file,
                requestId,
                restaurantId,
                restaurantName,
              });

      const metadata: AiImageDebugRunMetadata = {
        requestId,
        endpoint,
        status: 200,
        durationMs: Math.round(performance.now() - startedAt),
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
      };

      setResult(
        mode === 'storefront'
          ? {
              mode,
              metadata,
              response: response as StorefrontDebugResponse,
              errorMessage: null,
              errorPayload: null,
            }
          : mode === 'receipt-scan'
            ? {
                mode,
                metadata,
                response: response as ReceiptScanDebugResponse,
                errorMessage: null,
                errorPayload: null,
              }
          : {
              mode,
              metadata,
              response: response as MenuScanDebugResponse,
              errorMessage: null,
              errorPayload: null,
            },
      );

      if (mode === 'receipt-scan') {
        void queryClient.invalidateQueries({ queryKey: ['admin', 'receipt-scan-debug-logs'] });
      }
    } catch (error) {
      const apiError = getApiError(error);
      const metadata: AiImageDebugRunMetadata = {
        requestId,
        endpoint,
        status: apiError?.status ?? null,
        durationMs: Math.round(performance.now() - startedAt),
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
      };

      setResult({
        mode,
        metadata,
        response: null,
        errorMessage: getErrorMessage(error),
        errorPayload: apiError?.responseData ?? null,
      });

      if (mode === 'receipt-scan') {
        void queryClient.invalidateQueries({ queryKey: ['admin', 'receipt-scan-debug-logs'] });
      }
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <>
      <section className="panel">
        <p className="eyebrow">AI image debug</p>
        <h2 style={{ marginBottom: 0 }}>Test storefront, menu, and receipt image parsing</h2>
        <p className="text-muted" style={{ margin: 0 }}>
          Upload one image and run the same production parsing endpoints used by mobile. These
          runs may consume AI usage. Menu and receipt scans on this page are read-only and do not
          create app records.
        </p>
      </section>

      <div aria-label="AI image debug tabs" className="tab-bar" role="tablist">
        {aiImageDebugTabs.map((tab) => (
          <button
            aria-selected={activeTab === tab.value}
            className={`tab-button ${activeTab === tab.value ? 'active' : ''}`}
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            role="tab"
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'scan' ? (
        <>
          <section className="panel">
            <div className="filter-row">
              {modeOptions.map((option) => (
                <button
                  className={`filter-chip${mode === option.value ? ' active' : ''}`}
                  disabled={isRunning}
                  key={option.value}
                  onClick={() => {
                    setMode(option.value);
                    setResult(null);
                  }}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="ai-debug-upload-grid">
              <div className="field">
                <label htmlFor="ai-image-debug-file">Image</label>
                <input
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                  className="input"
                  disabled={isRunning}
                  id="ai-image-debug-file"
                  onChange={handleFileChange}
                  type="file"
                />
                {fileError ? <span className="ai-debug-inline-error">{fileError}</span> : null}
              </div>

              {mode === 'menu-scan' ? (
                <>
                  <div className="field">
                    <label htmlFor="ai-image-debug-restaurant-id">Restaurant ID (optional)</label>
                    <input
                      className="input"
                      disabled={isRunning}
                      id="ai-image-debug-restaurant-id"
                      onChange={(event) => setRestaurantId(event.target.value)}
                      placeholder="restaurant record id"
                      value={restaurantId}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="ai-image-debug-restaurant-name">
                      Restaurant name (optional)
                    </label>
                    <input
                      className="input"
                      disabled={isRunning}
                      id="ai-image-debug-restaurant-name"
                      onChange={(event) => setRestaurantName(event.target.value)}
                      placeholder="Visible restaurant context"
                      value={restaurantName}
                    />
                  </div>
                </>
              ) : null}
            </div>

            {previewUrl ? (
              <div className="ai-debug-image-preview-wrap">
                <img
                  alt="Selected upload preview"
                  className="ai-debug-image-preview"
                  src={previewUrl}
                />
                <div className="inventory-primary-cell">
                  <strong>{file?.name}</strong>
                  <span className="inventory-secondary-text">
                    {file?.type || 'Unknown type'} · {formatFileSize(file?.size ?? 0)}
                  </span>
                </div>
              </div>
            ) : null}

            <div className="button-row">
              <button
                className="button primary"
                disabled={submitDisabled}
                onClick={() => {
                  void runDebug();
                }}
                type="button"
              >
                {isRunning
                  ? 'Running...'
                  : mode === 'storefront'
                    ? 'Run Storefront Read'
                    : mode === 'receipt-scan'
                      ? 'Run Receipt Scan'
                      : 'Run Menu Scan'}
              </button>
              <button
                className="button ghost"
                disabled={isRunning}
                onClick={clearState}
                type="button"
              >
                Clear
              </button>
            </div>
          </section>

          {result ? (
            <section className={`panel${result.errorMessage ? ' ai-debug-error-panel' : ''}`}>
              <div className="summary-row">
                <div>
                  <p className="eyebrow">Run summary</p>
                  <h3>{result.errorMessage ? 'Request failed' : 'Request completed'}</h3>
                </div>
                <span className="tag">
                  {result.mode === 'storefront'
                    ? 'Storefront'
                    : result.mode === 'receipt-scan'
                      ? 'Receipt scan'
                      : 'Menu scan'}
                </span>
              </div>
              <MetadataGrid metadata={result.metadata} />
              {result.errorMessage ? (
                <div className="state-panel error">
                  <strong>{result.errorMessage}</strong>
                  <span className="text-muted">
                    Review the response JSON below for provider, usage-limit, or validation
                    details.
                  </span>
                </div>
              ) : null}
            </section>
          ) : null}

          {result?.response ? (
            <section className="panel">
              {result.mode === 'storefront' ? (
                <StorefrontPreview response={result.response as StorefrontDebugResponse} />
              ) : result.mode === 'receipt-scan' ? (
                <ReceiptScanPreview response={result.response as ReceiptScanDebugResponse} />
              ) : (
                <MenuScanPreview response={result.response as MenuScanDebugResponse} />
              )}
            </section>
          ) : null}

          {result ? <RawDebugPanels result={result} /> : null}
        </>
      ) : (
        <ReceiptScanDebugLogsPanel />
      )}
    </>
  );
}
