import { useEffect, useMemo, useState } from 'react';

import { AssetGrid } from '@/features/projects/AssetGrid';
import { assetFileUrl, combineGifAssets } from '@/lib/api';
import type { ToolAsset, ToolProject } from '@/lib/types';

interface AssetLibraryPageProps {
  projects: ToolProject[];
  onProjectsRefresh: () => Promise<void>;
}

type AssetFilter = 'all' | 'screenshot_png' | 'clip_mp4' | 'gif_export';
type CombineStep = 'select' | 'review';

const FILTER_LABELS: Array<{ value: AssetFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'screenshot_png', label: 'Screenshots' },
  { value: 'clip_mp4', label: 'Clips' },
  { value: 'gif_export', label: 'GIF Exports' },
];

function projectSearchText(project: ToolProject) {
  return [
    project.name,
    project.flowSlug || '',
    project.sourceVideoFilename,
  ].join(' ').toLowerCase();
}

export function AssetLibraryPage({ projects, onProjectsRefresh }: AssetLibraryPageProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<AssetFilter>('all');
  const [previewAsset, setPreviewAsset] = useState<ToolAsset | null>(null);
  const [gifRestartVersion, setGifRestartVersion] = useState(0);
  const [combineAssetIds, setCombineAssetIds] = useState<string[]>([]);
  const [isCombineModalOpen, setIsCombineModalOpen] = useState(false);
  const [combineStep, setCombineStep] = useState<CombineStep>('select');
  const [combineFocusedAssetId, setCombineFocusedAssetId] = useState<string | null>(null);
  const [isCombiningGifs, setIsCombiningGifs] = useState(false);
  const [combineError, setCombineError] = useState('');
  const [combinedProjectName, setCombinedProjectName] = useState('');
  const [combinedFilename, setCombinedFilename] = useState('combined.gif');

  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const allAssets = useMemo(
    () => projects.flatMap((project) => project.assets || []),
    [projects],
  );
  const storedAssets = useMemo(() => allAssets.filter((asset) => asset.kind !== 'source_reference'), [allAssets]);
  const sourceReferences = useMemo(() => allAssets.filter((asset) => asset.kind === 'source_reference'), [allAssets]);
  const gifExportAssets = useMemo(
    () => storedAssets.filter((asset) => asset.kind === 'gif_export'),
    [storedAssets],
  );
  const filteredAssets = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return storedAssets.filter((asset) => {
      const project = projectById.get(asset.project);
      const matchesFilter = filter === 'all' || asset.kind === filter;
      const matchesQuery = !normalized
        || asset.filename.toLowerCase().includes(normalized)
        || asset.kind.toLowerCase().includes(normalized)
        || (project ? projectSearchText(project).includes(normalized) : false);
      return matchesFilter && matchesQuery;
    });
  }, [filter, projectById, query, storedAssets]);
  const combineAssetIdSet = useMemo(() => new Set(combineAssetIds), [combineAssetIds]);
  const combineAssets = combineAssetIds
    .map((assetId) => gifExportAssets.find((asset) => asset.id === assetId))
    .filter((asset): asset is ToolAsset => Boolean(asset));
  const combineFocusedAsset = combineFocusedAssetId
    ? gifExportAssets.find((asset) => asset.id === combineFocusedAssetId) || null
    : gifExportAssets[0] || null;
  const previewAssetIndex = previewAsset
    ? filteredAssets.findIndex((asset) => asset.id === previewAsset.id)
    : -1;
  const previousPreviewAsset = previewAssetIndex > 0
    ? filteredAssets[previewAssetIndex - 1]
    : null;
  const nextPreviewAsset = previewAssetIndex >= 0 && previewAssetIndex < filteredAssets.length - 1
    ? filteredAssets[previewAssetIndex + 1]
    : null;

  useEffect(() => {
    if (previewAsset && !filteredAssets.some((asset) => asset.id === previewAsset.id)) {
      setPreviewAsset(null);
    }
  }, [filteredAssets, previewAsset]);

  useEffect(() => {
    setCombineAssetIds((current) => current.filter((assetId) => gifExportAssets.some((asset) => asset.id === assetId)));
    setCombineFocusedAssetId((current) => {
      if (current && gifExportAssets.some((asset) => asset.id === current)) {
        return current;
      }
      return gifExportAssets[0]?.id || null;
    });
  }, [gifExportAssets]);

  function openPreviewAsset(asset: ToolAsset) {
    setPreviewAsset(asset);
    if (asset.mimeType === 'image/gif') {
      setGifRestartVersion((value) => value + 1);
    }
  }

  function handleCombinePickerClick(asset: ToolAsset) {
    setCombineFocusedAssetId(asset.id);
    setCombineAssetIds((current) => {
      if (current.includes(asset.id)) {
        return current.filter((assetId) => assetId !== asset.id);
      }
      if (current.length >= 2) {
        return current;
      }
      return [...current, asset.id];
    });
  }

  function openCombineModal() {
    setCombineStep('select');
    setCombinedFilename('combined.gif');
    setCombineError('');
    setCombineFocusedAssetId(gifExportAssets[0]?.id || null);
    setIsCombineModalOpen(true);
  }

  function swapCombineOrder() {
    setCombineAssetIds((current) => current.length === 2 ? [current[1], current[0]] : current);
  }

  function continueToCombineReview() {
    if (combineAssets.length !== 2) {
      return;
    }
    const firstProject = projectById.get(combineAssets[0].project);
    const secondProject = projectById.get(combineAssets[1].project);
    setCombinedProjectName(`${firstProject?.name || combineAssets[0].filename} + ${secondProject?.name || combineAssets[1].filename}`);
    setCombinedFilename('combined.gif');
    setCombineError('');
    setCombineStep('review');
  }

  async function createCombinedGif() {
    if (combineAssets.length !== 2) {
      return;
    }
    setIsCombiningGifs(true);
    setCombineError('');
    try {
      const filename = combinedFilename.trim().toLowerCase().endsWith('.gif')
        ? combinedFilename.trim()
        : `${combinedFilename.trim() || 'combined'}.gif`;
      const { asset } = await combineGifAssets({
        assetIds: [combineAssets[0].id, combineAssets[1].id],
        projectName: combinedProjectName.trim(),
        filename,
      });
      await onProjectsRefresh();
      setCombineAssetIds([]);
      setIsCombineModalOpen(false);
      openPreviewAsset(asset);
    } catch (error) {
      setCombineError(error instanceof Error ? error.message : 'Could not combine GIFs.');
    } finally {
      setIsCombiningGifs(false);
    }
  }

  return (
    <div className="asset-library-page">
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Library</p>
            <h2>Asset Library</h2>
          </div>
          <span className="count-pill">{storedAssets.length}</span>
        </div>
        <div className="panel-body asset-library-controls">
          <input
            className="field"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by filename, project, or flow"
            type="search"
            value={query}
          />
          <div className="filter-tabs" role="tablist" aria-label="Asset kind filter">
            {FILTER_LABELS.map((item) => (
              <button
                aria-selected={filter === item.value}
                className={`filter-tab${filter === item.value ? ' active' : ''}`}
                key={item.value}
                onClick={() => setFilter(item.value)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="asset-library-actions">
            <button
              className="button secondary"
              disabled={gifExportAssets.length < 2}
              onClick={openCombineModal}
              type="button"
            >
              Combine GIFs
            </button>
          </div>
        </div>
      </section>

      <div className="asset-library-content">
        <AssetGrid
          assets={filteredAssets}
          emptyText="No saved assets match the current filters."
          onOpenAsset={openPreviewAsset}
          projectById={projectById}
        />

        <section className="panel source-reference-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Sources</p>
              <h2>Source References</h2>
            </div>
            <span className="count-pill">{sourceReferences.length}</span>
          </div>
          <div className="panel-body source-reference-list">
            {sourceReferences.length === 0 ? (
              <div className="empty-state">Source video references appear here after projects are created.</div>
            ) : sourceReferences.map((asset: ToolAsset) => {
              const project = projectById.get(asset.project);
              return (
                <article className="source-reference-row" key={asset.id}>
                  <strong>{project?.name || asset.filename}</strong>
                  <span>{asset.externalPath || project?.sourceVideoPath || asset.filename}</span>
                </article>
              );
            })}
          </div>
        </section>
      </div>

      {previewAsset ? (
        <div
          aria-labelledby="assetPreviewTitle"
          aria-modal="true"
          className="modal-backdrop"
          onClick={() => setPreviewAsset(null)}
          role="dialog"
        >
          <div className="asset-modal" onClick={(event) => event.stopPropagation()}>
            <div className="asset-modal-header">
              <div>
                <p className="eyebrow">Preview</p>
                <h2 id="assetPreviewTitle">{previewAsset.filename}</h2>
                <span>
                  {projectById.get(previewAsset.project)?.name || previewAsset.kind}
                  {previewAssetIndex >= 0 ? ` · ${previewAssetIndex + 1} of ${filteredAssets.length}` : ''}
                </span>
              </div>
              <button className="button secondary" onClick={() => setPreviewAsset(null)} type="button">
                Close
              </button>
            </div>
            <div className="asset-modal-body asset-preview-modal-body">
              <button
                aria-label="Previous asset"
                className="asset-preview-nav previous"
                disabled={!previousPreviewAsset}
                onClick={() => previousPreviewAsset && openPreviewAsset(previousPreviewAsset)}
                type="button"
              >
                Previous
              </button>
              <div className="asset-preview-modal-media">
                {previewAsset.mimeType.startsWith('image/') ? (
                  <img
                    alt={previewAsset.filename}
                    key={previewAsset.mimeType === 'image/gif' ? `${previewAsset.id}-${gifRestartVersion}` : previewAsset.id}
                    src={assetFileUrl(previewAsset.id, previewAsset.mimeType === 'image/gif' ? gifRestartVersion : undefined)}
                  />
                ) : previewAsset.mimeType.startsWith('video/') ? (
                  <video controls playsInline src={assetFileUrl(previewAsset.id)} />
                ) : (
                  <div className="empty-state">This asset type cannot be previewed inline.</div>
                )}
              </div>
              <button
                aria-label="Next asset"
                className="asset-preview-nav next"
                disabled={!nextPreviewAsset}
                onClick={() => nextPreviewAsset && openPreviewAsset(nextPreviewAsset)}
                type="button"
              >
                Next
              </button>
            </div>
            <div className="asset-modal-footer">
              <button
                className="button secondary"
                disabled={!previousPreviewAsset}
                onClick={() => previousPreviewAsset && openPreviewAsset(previousPreviewAsset)}
                type="button"
              >
                Previous
              </button>
              <button
                className="button secondary"
                disabled={!nextPreviewAsset}
                onClick={() => nextPreviewAsset && openPreviewAsset(nextPreviewAsset)}
                type="button"
              >
                Next
              </button>
              <a className="button secondary" href={assetFileUrl(previewAsset.id)} target="_blank" rel="noreferrer">
                Open in New Tab
              </a>
              {previewAsset.mimeType === 'image/gif' ? (
                <button className="button secondary" onClick={() => setGifRestartVersion((value) => value + 1)} type="button">
                  Restart GIF
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {isCombineModalOpen ? (
        <div
          aria-labelledby="combineGifTitle"
          aria-modal="true"
          className="modal-backdrop"
          onClick={() => !isCombiningGifs && setIsCombineModalOpen(false)}
          role="dialog"
        >
          <div className="asset-modal gif-combine-modal" onClick={(event) => event.stopPropagation()}>
            <div className="asset-modal-header">
              <div>
                <p className="eyebrow">Combine</p>
                <h2 id="combineGifTitle">Combine GIFs</h2>
                <span>{combineStep === 'select' ? 'Select two saved GIF exports.' : 'Review order and create the combined GIF.'}</span>
              </div>
              <button
                className="button secondary"
                disabled={isCombiningGifs}
                onClick={() => setIsCombineModalOpen(false)}
                type="button"
              >
                Cancel
              </button>
            </div>
            <div className="asset-modal-body light">
              <div className="gif-combine-steps" aria-label="Combine GIF steps">
                <button
                  className={combineStep === 'select' ? 'active' : ''}
                  disabled={isCombiningGifs}
                  onClick={() => setCombineStep('select')}
                  type="button"
                >
                  Select GIFs
                </button>
                <span aria-hidden="true">/</span>
                <button
                  className={combineStep === 'review' ? 'active' : ''}
                  disabled={combineAssets.length !== 2 || isCombiningGifs}
                  onClick={continueToCombineReview}
                  type="button"
                >
                  Order & Preview
                </button>
              </div>
              {combineStep === 'select' ? (
                <div className="gif-combine-select-layout">
                  <div className="gif-combine-picker-list" aria-label="GIF exports">
                    {gifExportAssets.length === 0 ? (
                      <div className="empty-state compact">No GIF exports are available to combine.</div>
                    ) : gifExportAssets.map((asset) => {
                      const isSelected = combineAssetIdSet.has(asset.id);
                      const isFocused = combineFocusedAsset?.id === asset.id;
                      const isSelectionFull = combineAssetIds.length >= 2 && !isSelected;
                      return (
                        <button
                          aria-pressed={isSelected}
                          className={[
                            'gif-combine-picker-row',
                            isSelected ? 'selected' : '',
                            isFocused ? 'focused' : '',
                          ].filter(Boolean).join(' ')}
                          key={asset.id}
                          onClick={() => handleCombinePickerClick(asset)}
                          type="button"
                        >
                          <span className="gif-combine-picker-thumb">
                            <img alt="" src={assetFileUrl(asset.id)} />
                          </span>
                          <span className="gif-combine-picker-copy">
                            <strong>{asset.filename}</strong>
                            <span>{projectById.get(asset.project)?.name || 'Unknown project'}</span>
                          </span>
                          {isSelected ? (
                            <span className="asset-availability">Selected</span>
                          ) : isSelectionFull ? (
                            <span className="asset-availability muted">Preview</span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                  <div className="gif-combine-large-preview">
                    {combineFocusedAsset ? (
                      <>
                        <div className="gif-combine-large-preview-header">
                          <strong>{combineFocusedAsset.filename}</strong>
                          <span>{projectById.get(combineFocusedAsset.project)?.name || 'Unknown project'}</span>
                        </div>
                        <div className="gif-combine-large-preview-media">
                          <img alt={combineFocusedAsset.filename} src={assetFileUrl(combineFocusedAsset.id)} />
                        </div>
                      </>
                    ) : (
                      <div className="empty-state compact">Select a GIF to preview it.</div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="gif-combine-review-layout">
                  <div className="gif-combine-review-header">
                    <div>
                      <strong>Order</strong>
                      <span>Combined GIF will play top to bottom.</span>
                    </div>
                    <button className="button secondary" disabled={isCombiningGifs} onClick={swapCombineOrder} type="button">
                      Swap Order
                    </button>
                  </div>
                  <div className="gif-combine-review-previews">
                    {combineAssets.map((asset, index) => (
                      <article className="gif-combine-review-card" key={asset.id}>
                        <div className="gif-combine-review-card-header">
                          <strong>{index + 1}. {asset.filename}</strong>
                          <span>{projectById.get(asset.project)?.name || 'Unknown project'}</span>
                        </div>
                        <div className="gif-combine-review-media">
                          <img alt={asset.filename} src={assetFileUrl(asset.id)} />
                        </div>
                      </article>
                    ))}
                  </div>
                  <div className="gif-combine-modal-fields">
                    <label>
                      <span>Project name</span>
                      <input
                        className="field"
                        onChange={(event) => setCombinedProjectName(event.target.value)}
                        value={combinedProjectName}
                      />
                    </label>
                    <label>
                      <span>GIF filename</span>
                      <input
                        className="field"
                        onChange={(event) => setCombinedFilename(event.target.value)}
                        value={combinedFilename}
                      />
                    </label>
                  </div>
                </div>
              )}
              {combineError ? <div className="error-banner">{combineError}</div> : null}
            </div>
            <div className="asset-modal-footer">
              {combineStep === 'review' ? (
                <button className="button secondary" disabled={isCombiningGifs} onClick={() => setCombineStep('select')} type="button">
                  Back
                </button>
              ) : <span />}
              {combineStep === 'select' ? (
                <button className="button" disabled={combineAssets.length !== 2} onClick={continueToCombineReview} type="button">
                  Next
                </button>
              ) : (
                <button className="button" disabled={isCombiningGifs || combineAssets.length !== 2} onClick={createCombinedGif} type="button">
                  {isCombiningGifs ? 'Combining...' : 'Combine'}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
