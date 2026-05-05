import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { assignPublishedGif, assetFileUrl, listPublishedGifs } from '@/lib/api';
import type { PublishedGifAssignment, PublishedGifsResponse, ToolAsset, ToolProject, TutorialFlowDefinition } from '@/lib/types';

interface PublishedGifsPageProps {
  initialAssetId?: string;
  initialFlowSlug?: string;
  onProjectsRefresh: () => Promise<void>;
  projects: ToolProject[];
}

interface AssignModalState {
  flowSlug: string;
  assetId: string;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function statusLabel(status: PublishedGifAssignment['copyStatus']) {
  if (status === 'copied') {
    return 'Copied to app';
  }
  if (status === 'copy_failed') {
    return 'Copy failed';
  }
  return 'Tracked only';
}

function assignmentStatusClass(status: PublishedGifAssignment['copyStatus']) {
  if (status === 'copied') {
    return 'success';
  }
  if (status === 'copy_failed') {
    return 'danger';
  }
  return 'muted';
}

function assetSearchText(asset: ToolAsset, project?: ToolProject) {
  return [
    asset.filename,
    asset.kind,
    project?.name || '',
    project?.flowSlug || '',
  ].join(' ').toLowerCase();
}

function flowSearchText(flow: TutorialFlowDefinition) {
  return [
    flow.title,
    flow.slug,
    flow.section,
    flow.navigationHint,
  ].join(' ').toLowerCase();
}

export function PublishedGifsPage({
  initialAssetId,
  initialFlowSlug,
  onProjectsRefresh,
  projects,
}: PublishedGifsPageProps) {
  const [publishedData, setPublishedData] = useState<PublishedGifsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [assignModal, setAssignModal] = useState<AssignModalState | null>(null);
  const [historyFlowSlug, setHistoryFlowSlug] = useState<string | null>(null);
  const [selectedHistoryAssignmentId, setSelectedHistoryAssignmentId] = useState<string | null>(null);
  const [assetQuery, setAssetQuery] = useState('');
  const [notes, setNotes] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);
  const [assignError, setAssignError] = useState('');
  const [assignPreviewRestartVersion, setAssignPreviewRestartVersion] = useState(0);
  const openedInitialModalKey = useRef('');

  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const gifAssets = useMemo(
    () => projects.flatMap((project) => project.assets || []).filter((asset) => asset.kind === 'gif_export' && asset.mimeType === 'image/gif'),
    [projects],
  );
  const currentByFlowSlug = useMemo(() => {
    const map = new Map<string, PublishedGifAssignment>();
    for (const assignment of publishedData?.current || []) {
      map.set(assignment.flowSlug, assignment);
    }
    return map;
  }, [publishedData]);
  const historyByFlowSlug = useMemo(() => {
    const map = new Map<string, PublishedGifAssignment[]>();
    for (const assignment of publishedData?.history || []) {
      const list = map.get(assignment.flowSlug) || [];
      list.push(assignment);
      map.set(assignment.flowSlug, list);
    }
    return map;
  }, [publishedData]);
  const filteredFlows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const flows = publishedData?.flows || [];
    return normalized
      ? flows.filter((flow) => flowSearchText(flow).includes(normalized))
      : flows;
  }, [publishedData, query]);
  const flowsBySection = useMemo(() => {
    const groups: Array<{ section: string; flows: TutorialFlowDefinition[] }> = [];
    for (const flow of filteredFlows) {
      const lastGroup = groups[groups.length - 1];
      if (lastGroup?.section === flow.section) {
        lastGroup.flows.push(flow);
      } else {
        groups.push({ section: flow.section, flows: [flow] });
      }
    }
    return groups;
  }, [filteredFlows]);
  const selectedFlow = assignModal && publishedData
    ? publishedData.flows.find((flow) => flow.slug === assignModal.flowSlug) || null
    : null;
  const selectedAsset = assignModal
    ? gifAssets.find((asset) => asset.id === assignModal.assetId) || null
    : null;
  const filteredGifAssets = useMemo(() => {
    const normalized = assetQuery.trim().toLowerCase();
    const selectedFlowSlug = assignModal?.flowSlug || '';
    const assets = normalized
      ? gifAssets.filter((asset) => assetSearchText(asset, projectById.get(asset.project)).includes(normalized))
      : gifAssets;
    return [...assets].sort((a, b) => {
      const aMatches = projectById.get(a.project)?.flowSlug === selectedFlowSlug;
      const bMatches = projectById.get(b.project)?.flowSlug === selectedFlowSlug;
      if (aMatches !== bMatches) {
        return aMatches ? -1 : 1;
      }
      return b.created.localeCompare(a.created);
    });
  }, [assetQuery, assignModal?.flowSlug, gifAssets, projectById]);
  const historyFlow = historyFlowSlug && publishedData
    ? publishedData.flows.find((flow) => flow.slug === historyFlowSlug) || null
    : null;
  const historyItems = historyFlowSlug ? historyByFlowSlug.get(historyFlowSlug) || [] : [];
  const selectedHistoryAssignment = selectedHistoryAssignmentId
    ? historyItems.find((assignment) => assignment.id === selectedHistoryAssignmentId) || null
    : historyItems.find((assignment) => assignment.isCurrent) || historyItems[0] || null;

  const selectDefaultAssignAsset = useCallback((flowSlug: string, preferredAsset?: ToolAsset | null) => {
    const currentAssignment = currentByFlowSlug.get(flowSlug);
    const currentAsset = currentAssignment
      ? gifAssets.find((asset) => asset.id === currentAssignment.asset) || null
      : null;
    const matchingAsset = gifAssets.find((asset) => projectById.get(asset.project)?.flowSlug === flowSlug) || null;
    return preferredAsset || currentAsset || matchingAsset || gifAssets[0] || null;
  }, [currentByFlowSlug, gifAssets, projectById]);

  async function loadPublishedData() {
    setIsLoading(true);
    setError('');
    try {
      setPublishedData(await listPublishedGifs());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load published GIFs.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadPublishedData();
  }, []);

  useEffect(() => {
    if (!publishedData || (!initialAssetId && !initialFlowSlug)) {
      return;
    }
    const key = `${initialFlowSlug || ''}:${initialAssetId || ''}`;
    if (openedInitialModalKey.current === key) {
      return;
    }
    openedInitialModalKey.current = key;
    const initialAsset = initialAssetId ? gifAssets.find((asset) => asset.id === initialAssetId) || null : null;
    const sourceFlowSlug = initialAsset ? projectById.get(initialAsset.project)?.flowSlug : '';
    const nextFlowSlug = initialFlowSlug
      || (sourceFlowSlug && publishedData.flows.some((flow) => flow.slug === sourceFlowSlug) ? sourceFlowSlug : '')
      || publishedData.flows[0]?.slug
      || '';
    const nextAsset = selectDefaultAssignAsset(nextFlowSlug, initialAsset);
    setAssignModal({
      flowSlug: nextFlowSlug,
      assetId: nextAsset?.id || '',
    });
    setAssignPreviewRestartVersion((version) => version + 1);
    setAssetQuery('');
    setNotes('');
    setAssignError('');
  }, [gifAssets, initialAssetId, initialFlowSlug, projectById, publishedData, selectDefaultAssignAsset]);

  function openAssignModal(flow: TutorialFlowDefinition, preferredAsset?: ToolAsset) {
    const nextAsset = selectDefaultAssignAsset(flow.slug, preferredAsset);
    setAssignModal({ flowSlug: flow.slug, assetId: nextAsset?.id || '' });
    setAssignPreviewRestartVersion((version) => version + 1);
    setAssetQuery('');
    setNotes('');
    setAssignError('');
  }

  function selectAssignFlow(flowSlug: string) {
    const nextAsset = selectDefaultAssignAsset(flowSlug);
    setAssignModal((current) => current ? { ...current, flowSlug, assetId: nextAsset?.id || '' } : current);
    setAssignPreviewRestartVersion((version) => version + 1);
  }

  function selectAssignAsset(assetId: string) {
    setAssignModal((current) => current ? { ...current, assetId } : current);
    setAssignPreviewRestartVersion((version) => version + 1);
  }

  function openHistoryModal(flowSlug: string, preferredAssignmentId?: string) {
    const assignments = historyByFlowSlug.get(flowSlug) || [];
    const nextSelected = preferredAssignmentId
      || assignments.find((assignment) => assignment.isCurrent)?.id
      || assignments[0]?.id
      || null;

    setHistoryFlowSlug(flowSlug);
    setSelectedHistoryAssignmentId(nextSelected);
  }

  function closeHistoryModal() {
    setHistoryFlowSlug(null);
    setSelectedHistoryAssignmentId(null);
  }

  async function handleAssignGif() {
    if (!assignModal?.flowSlug || !assignModal.assetId) {
      return;
    }
    setIsAssigning(true);
    setAssignError('');
    try {
      await assignPublishedGif(assignModal.flowSlug, assignModal.assetId, notes);
      await Promise.all([loadPublishedData(), onProjectsRefresh()]);
      setAssignModal(null);
    } catch (assignFailure) {
      setAssignError(assignFailure instanceof Error ? assignFailure.message : 'Could not assign published GIF.');
      await loadPublishedData();
    } finally {
      setIsAssigning(false);
    }
  }

  return (
    <div className="published-gifs-page">
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Publishing</p>
            <h2>Published GIFs</h2>
          </div>
          <span className="count-pill">{publishedData?.current.length || 0}</span>
        </div>
        <div className="panel-body published-gifs-controls">
          <input
            className="field"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search flows"
            type="search"
            value={query}
          />
          <button className="button secondary" disabled={isLoading} onClick={loadPublishedData} type="button">
            Refresh
          </button>
        </div>
      </section>

      {error ? <div className="error-banner">{error}</div> : null}

      {isLoading && !publishedData ? (
        <div className="empty-state">Loading published GIF assignments...</div>
      ) : flowsBySection.length === 0 ? (
        <div className="empty-state">No tutorial flows match the current search.</div>
      ) : (
        <div className="published-flow-sections">
          {flowsBySection.map((group) => (
            <section className="panel" key={group.section}>
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Flow group</p>
                  <h2>{group.section}</h2>
                </div>
                <span className="count-pill">{group.flows.length}</span>
              </div>
              <div className="published-flow-list">
                {group.flows.map((flow) => {
                  const current = currentByFlowSlug.get(flow.slug);
                  return (
                    <article className="published-flow-row" key={flow.slug}>
                      <div className="published-flow-main">
                        <div className="published-flow-title-block">
                          <strong>{flow.title}</strong>
                          <span className="published-flow-slug">{flow.slug}</span>
                          <span className="published-flow-navigation">{flow.navigationHint}</span>
                        </div>
                        {flow.mobileAssetFilename ? (
                          <span className="status-pill success">{flow.mobileAssetFilename}</span>
                        ) : (
                          <span className="status-pill muted">Tracked only</span>
                        )}
                      </div>
                      <div className="published-current">
                        {current ? (
                          <>
                            <button className="published-current-preview" onClick={() => openHistoryModal(flow.slug, current.id)} type="button">
                              <img alt={current.assetFilename} src={assetFileUrl(current.asset)} />
                            </button>
                            <div className="published-current-copy">
                              <strong>{current.assetFilename}</strong>
                              <span>{current.sourceProjectName || 'Unknown project'}</span>
                              <span>{formatDate(current.created)}</span>
                              <span className={`status-pill ${assignmentStatusClass(current.copyStatus)}`}>
                                {statusLabel(current.copyStatus)}
                              </span>
                              {current.targetRelativePath ? <span>{current.targetRelativePath}</span> : null}
                            </div>
                          </>
                        ) : (
                          <div className="empty-state compact">No published GIF assigned.</div>
                        )}
                      </div>
                      <div className="published-flow-actions">
                        <button className="button" disabled={gifAssets.length === 0} onClick={() => openAssignModal(flow)} type="button">
                          Assign GIF
                        </button>
                        <button
                          className="button secondary"
                          disabled={(historyByFlowSlug.get(flow.slug) || []).length === 0}
                          onClick={() => openHistoryModal(flow.slug)}
                          type="button"
                        >
                          View History
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {assignModal && publishedData ? (
        <div
          aria-labelledby="assignGifTitle"
          aria-modal="true"
          className="modal-backdrop"
          onClick={() => !isAssigning && setAssignModal(null)}
          role="dialog"
        >
          <div className="asset-modal published-assign-modal" onClick={(event) => event.stopPropagation()}>
            <div className="asset-modal-header">
              <div>
                <p className="eyebrow">Publish</p>
                <h2 id="assignGifTitle">Assign GIF</h2>
                <span>{selectedFlow?.title || 'Choose a tutorial flow'}</span>
              </div>
              <button className="button secondary" disabled={isAssigning} onClick={() => setAssignModal(null)} type="button">
                Cancel
              </button>
            </div>
            <div className="asset-modal-body light">
              <div className="published-assign-fields">
                <label>
                  <span>Tutorial flow</span>
                  <select
                    className="field"
                    disabled={isAssigning}
                    onChange={(event) => selectAssignFlow(event.target.value)}
                    value={assignModal.flowSlug}
                  >
                    {publishedData.flows.map((flow) => (
                      <option key={flow.slug} value={flow.slug}>
                        {flow.section} / {flow.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Search GIF exports</span>
                  <input
                    className="field"
                    disabled={isAssigning}
                    onChange={(event) => setAssetQuery(event.target.value)}
                    placeholder="Search by filename, project, or flow"
                    type="search"
                    value={assetQuery}
                  />
                </label>
              </div>
              <div className="published-assign-layout">
                <div className="published-asset-picker">
                  {filteredGifAssets.length === 0 ? (
                    <div className="empty-state compact">No saved GIF exports match the current search.</div>
                  ) : filteredGifAssets.map((asset) => {
                    const project = projectById.get(asset.project);
                    const sourceFlowDiffers = selectedFlow && project?.flowSlug && project.flowSlug !== selectedFlow.slug;
                    return (
                      <button
                        aria-pressed={assignModal.assetId === asset.id}
                        className={`published-asset-row${assignModal.assetId === asset.id ? ' selected' : ''}`}
                        disabled={isAssigning}
                        key={asset.id}
                        onClick={() => selectAssignAsset(asset.id)}
                        type="button"
                      >
                        <span className="published-asset-thumb">
                          <img alt="" src={assetFileUrl(asset.id)} />
                        </span>
                        <span className="published-asset-copy">
                          <strong>{asset.filename}</strong>
                          <span>{project?.name || 'Unknown project'}</span>
                          {sourceFlowDiffers ? <span>Source flow differs</span> : <span>{project?.flowSlug || 'No source flow'}</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="published-selected-preview">
                  {selectedAsset ? (
                    <>
                      <div className="published-selected-header">
                        <div className="published-selected-copy">
                          <strong>{selectedAsset.filename}</strong>
                          <span>{projectById.get(selectedAsset.project)?.name || 'Unknown project'}</span>
                        </div>
                        <button
                          className="button secondary"
                          disabled={isAssigning}
                          onClick={() => setAssignPreviewRestartVersion((version) => version + 1)}
                          type="button"
                        >
                          Reset GIF
                        </button>
                      </div>
                      <div className="published-selected-media">
                        <img
                          alt={selectedAsset.filename}
                          key={`${selectedAsset.id}-${assignPreviewRestartVersion}`}
                          src={assetFileUrl(selectedAsset.id, assignPreviewRestartVersion)}
                        />
                      </div>
                      <div className="published-target-summary">
                        {selectedFlow?.mobileAssetFilename ? (
                          <span>Target: apps/mobile/assets/onboarding/{selectedFlow.mobileAssetFilename}</span>
                        ) : (
                          <span>This flow is tracked in history only.</span>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="empty-state compact">Choose a GIF export to preview it.</div>
                  )}
                </div>
              </div>
              <label className="published-notes-field">
                <span>Notes</span>
                <textarea
                  className="field"
                  disabled={isAssigning}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Optional assignment notes"
                  value={notes}
                />
              </label>
              {assignError ? <div className="error-banner">{assignError}</div> : null}
            </div>
            <div className="asset-modal-footer">
              <button className="button secondary" disabled={isAssigning} onClick={() => setAssignModal(null)} type="button">
                Cancel
              </button>
              <button className="button" disabled={isAssigning || !assignModal.assetId || !assignModal.flowSlug} onClick={handleAssignGif} type="button">
                {isAssigning ? 'Assigning...' : selectedFlow?.mobileAssetFilename ? 'Publish GIF' : 'Assign GIF'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {historyFlow ? (
        <div
          aria-labelledby="publishedHistoryTitle"
          aria-modal="true"
          className="modal-backdrop"
          onClick={closeHistoryModal}
          role="dialog"
        >
          <div className="asset-modal published-history-modal" onClick={(event) => event.stopPropagation()}>
            <div className="asset-modal-header">
              <div>
                <p className="eyebrow">History</p>
                <h2 id="publishedHistoryTitle">{historyFlow.title}</h2>
                <span>{historyFlow.slug}</span>
              </div>
              <button className="button secondary" onClick={closeHistoryModal} type="button">
                Close
              </button>
            </div>
            <div className="asset-modal-body light">
              <div className="published-history-layout">
                <div className="published-history-picker">
                  {historyItems.length === 0 ? (
                    <div className="empty-state compact">No assignments have been saved for this flow.</div>
                  ) : historyItems.map((assignment) => (
                    <button
                      aria-pressed={selectedHistoryAssignment?.id === assignment.id}
                      className={`published-history-picker-row${selectedHistoryAssignment?.id === assignment.id ? ' selected' : ''}`}
                      key={assignment.id}
                      onClick={() => setSelectedHistoryAssignmentId(assignment.id)}
                      type="button"
                    >
                      <span className="published-history-thumb">
                        <img alt="" src={assetFileUrl(assignment.asset)} />
                      </span>
                      <span className="published-history-copy">
                        <strong>{assignment.assetFilename}</strong>
                        <span>{assignment.sourceProjectName || 'Unknown project'}</span>
                        <span>{formatDate(assignment.created)}</span>
                        <span className={`status-pill ${assignmentStatusClass(assignment.copyStatus)}`}>
                          {statusLabel(assignment.copyStatus)}
                        </span>
                        {assignment.isCurrent ? <span className="status-pill success">Current</span> : null}
                      </span>
                    </button>
                  ))}
                </div>

                <div className="published-history-preview">
                  {selectedHistoryAssignment ? (
                    <>
                      <div className="published-selected-header">
                        <strong>{selectedHistoryAssignment.assetFilename}</strong>
                        <span>{selectedHistoryAssignment.sourceProjectName || 'Unknown project'}</span>
                        <span>{formatDate(selectedHistoryAssignment.created)}</span>
                      </div>
                      <div className="published-selected-media">
                        <img alt={selectedHistoryAssignment.assetFilename} src={assetFileUrl(selectedHistoryAssignment.asset)} />
                      </div>
                      <div className="published-history-detail-grid">
                        <span className={`status-pill ${assignmentStatusClass(selectedHistoryAssignment.copyStatus)}`}>
                          {statusLabel(selectedHistoryAssignment.copyStatus)}
                        </span>
                        {selectedHistoryAssignment.isCurrent ? <span className="status-pill success">Current</span> : null}
                        {selectedHistoryAssignment.targetRelativePath ? <span>{selectedHistoryAssignment.targetRelativePath}</span> : null}
                        {selectedHistoryAssignment.copyError ? <span>{selectedHistoryAssignment.copyError}</span> : null}
                        {selectedHistoryAssignment.notes ? <span>{selectedHistoryAssignment.notes}</span> : null}
                      </div>
                      <a className="button secondary" href={assetFileUrl(selectedHistoryAssignment.asset)} target="_blank" rel="noreferrer">
                        Open in New Tab
                      </a>
                    </>
                  ) : (
                    <div className="empty-state compact">Select a GIF assignment to preview it.</div>
                  )}
                </div>
              </div>
            </div>
            <div className="asset-modal-footer">
              <button className="button" onClick={closeHistoryModal} type="button">
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
