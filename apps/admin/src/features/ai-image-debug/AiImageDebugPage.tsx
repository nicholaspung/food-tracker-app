import { useEffect, useMemo, useState, type ChangeEvent } from 'react';

import {
  runMenuScanDebug,
  runStorefrontDebug,
  type AiImageDebugApiError,
  type AiImageDebugMode,
  type AiImageDebugRunMetadata,
  type MenuScanDebugResponse,
  type StorefrontDebugResponse,
} from '@/features/ai-image-debug/api';
import {
  formatFileSize,
  formatJson,
  getDebugPayload,
  isSupportedDebugImage,
  parseMenuItemNamesFromCsv,
} from '@/features/ai-image-debug/display';

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
      mode: AiImageDebugMode;
      metadata: AiImageDebugRunMetadata;
      response: null;
      errorMessage: string;
      errorPayload: unknown;
    };

const modeOptions: Array<{ label: string; value: AiImageDebugMode }> = [
  { label: 'Read a Storefront', value: 'storefront' },
  { label: 'Scan Menu Items', value: 'menu-scan' },
];

function buildRequestId() {
  const random = Math.random().toString(36).slice(2, 10);
  return `admin-image-debug-${Date.now()}-${random}`;
}

function getEndpoint(mode: AiImageDebugMode): AiImageDebugRunMetadata['endpoint'] {
  return mode === 'storefront' ? '/api/find-restaurant-name' : '/api/parse-menu';
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

export function AiImageDebugPage() {
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
          : {
              mode,
              metadata,
              response: response as MenuScanDebugResponse,
              errorMessage: null,
              errorPayload: null,
            },
      );
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
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <>
      <section className="panel">
        <p className="eyebrow">AI image debug</p>
        <h2 style={{ marginBottom: 0 }}>Test storefront and menu image parsing</h2>
        <p className="text-muted" style={{ margin: 0 }}>
          Upload one image and run the same production parsing endpoints used by mobile. These
          runs may consume AI usage. Menu scans on this page are read-only and do not create menu
          item records.
        </p>
      </section>

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
                <label htmlFor="ai-image-debug-restaurant-name">Restaurant name (optional)</label>
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
            <img alt="Selected upload preview" className="ai-debug-image-preview" src={previewUrl} />
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
                : 'Run Menu Scan'}
          </button>
          <button className="button ghost" disabled={isRunning} onClick={clearState} type="button">
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
            <span className="tag">{result.mode === 'storefront' ? 'Storefront' : 'Menu scan'}</span>
          </div>
          <MetadataGrid metadata={result.metadata} />
          {result.errorMessage ? (
            <div className="state-panel error">
              <strong>{result.errorMessage}</strong>
              <span className="text-muted">
                Review the response JSON below for provider, usage-limit, or validation details.
              </span>
            </div>
          ) : null}
        </section>
      ) : null}

      {result?.response ? (
        <section className="panel">
          {result.mode === 'storefront' ? (
            <StorefrontPreview response={result.response as StorefrontDebugResponse} />
          ) : (
            <MenuScanPreview response={result.response as MenuScanDebugResponse} />
          )}
        </section>
      ) : null}

      {result ? <RawDebugPanels result={result} /> : null}
    </>
  );
}
