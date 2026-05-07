import { useEffect, useMemo, useState } from 'react';

import { ProjectLibrary } from '@/features/projects/ProjectLibrary';
import { sourceVideoStreamUrl } from '@/lib/api';
import type { SourceVideo, ToolProject } from '@/lib/types';

interface VideoToolsHomeProps {
  sourceVideos: SourceVideo[];
  projects: ToolProject[];
  createMode: 'source_video' | 'asset_library';
  selectedSourceId: string;
  projectName: string;
  isLoading: boolean;
  isCreating: boolean;
  onCreateModeChange: (mode: 'source_video' | 'asset_library') => void;
  onSourceChange: (sourceId: string) => void;
  onProjectNameChange: (projectName: string) => void;
  onCreateProject: () => void;
  onArchiveSourceVideo: (sourceVideoId: string) => Promise<void> | void;
  onMoveSourceVideo: (sourceVideoId: string, targetFlowSlug: string) => Promise<void> | void;
  onSelectProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
}

function formatDuration(value?: number) {
  if (!value) {
    return 'unknown';
  }
  return `${value.toFixed(1)}s`;
}

export function defaultProjectName(video: SourceVideo) {
  return `${video.flowSlug} ${video.timestamp}`;
}

export function VideoToolsHome({
  sourceVideos,
  projects,
  createMode,
  selectedSourceId,
  projectName,
  isLoading,
  isCreating,
  onCreateModeChange,
  onSourceChange,
  onProjectNameChange,
  onCreateProject,
  onArchiveSourceVideo,
  onMoveSourceVideo,
  onSelectProject,
  onDeleteProject,
}: VideoToolsHomeProps) {
  const [previewSource, setPreviewSource] = useState<SourceVideo | null>(null);
  const [isConfirmingArchive, setIsConfirmingArchive] = useState(false);
  const [moveTargetFlowSlug, setMoveTargetFlowSlug] = useState('');
  const [isManagingSource, setIsManagingSource] = useState(false);

  const selectedSource = sourceVideos.find((sourceVideo) => sourceVideo.id === selectedSourceId) || null;
  const sourceProjectCount = selectedSource
    ? projects.filter((project) => project.sourceVideoPath === selectedSource.path).length
    : 0;
  const isSourceInUse = sourceProjectCount > 0;
  const moveTargetFlowSlugs = useMemo(() => (
    Array.from(new Set(sourceVideos.map((sourceVideo) => sourceVideo.flowSlug)))
      .filter((flowSlug) => flowSlug !== selectedSource?.flowSlug)
      .sort()
  ), [selectedSource?.flowSlug, sourceVideos]);
  const canManageSelectedSource = Boolean(selectedSource) && !isSourceInUse && !isManagingSource;
  const canMoveSelectedSource = canManageSelectedSource && moveTargetFlowSlugs.length > 0 && Boolean(moveTargetFlowSlug);

  useEffect(() => {
    setIsConfirmingArchive(false);
    setMoveTargetFlowSlug(moveTargetFlowSlugs[0] || '');
  }, [moveTargetFlowSlugs, selectedSourceId]);

  async function handleArchiveSource() {
    if (!selectedSource || isSourceInUse) {
      return;
    }
    if (!isConfirmingArchive) {
      setIsConfirmingArchive(true);
      return;
    }
    setIsManagingSource(true);
    try {
      await onArchiveSourceVideo(selectedSource.id);
      setIsConfirmingArchive(false);
    } finally {
      setIsManagingSource(false);
    }
  }

  async function handleMoveSource() {
    if (!selectedSource || !moveTargetFlowSlug || isSourceInUse) {
      return;
    }
    setIsManagingSource(true);
    try {
      await onMoveSourceVideo(selectedSource.id, moveTargetFlowSlug);
      setIsConfirmingArchive(false);
    } finally {
      setIsManagingSource(false);
    }
  }

  function renderPreviewModal() {
    if (!previewSource) {
      return null;
    }

    return (
      <div className="modal-backdrop" role="presentation" onMouseDown={() => setPreviewSource(null)}>
        <section
          aria-labelledby="source-preview-title"
          aria-modal="true"
          className="asset-modal"
          onMouseDown={(event) => event.stopPropagation()}
          role="dialog"
        >
          <div className="asset-modal-header">
            <div>
              <h2 id="source-preview-title">{previewSource.flowSlug} / {previewSource.timestamp}</h2>
              <span>{previewSource.relativePath}</span>
            </div>
            <button className="button secondary" onClick={() => setPreviewSource(null)} type="button">
              Close
            </button>
          </div>
          <div className="asset-modal-body">
            <video
              className="source-preview-video"
              controls
              playsInline
              src={sourceVideoStreamUrl(previewSource.id)}
            />
          </div>
          <div className="asset-modal-footer">
            <button className="button" onClick={() => setPreviewSource(null)} type="button">
              Close
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <>
      <section className="dashboard-grid" id="mixed-gif">
        <section className="panel create-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">New</p>
              <h2>Mixed GIF Project</h2>
            </div>
          </div>
          <div className="panel-body create-form">
            <div className="create-mode-tabs" role="tablist" aria-label="Project source">
              <button
                aria-selected={createMode === 'source_video'}
                className={`filter-tab${createMode === 'source_video' ? ' active' : ''}`}
                onClick={() => onCreateModeChange('source_video')}
                type="button"
              >
                From screen recording
              </button>
              <button
                aria-selected={createMode === 'asset_library'}
                className={`filter-tab${createMode === 'asset_library' ? ' active' : ''}`}
                onClick={() => onCreateModeChange('asset_library')}
                type="button"
              >
                Without video
              </button>
            </div>
            {createMode === 'asset_library' ? (
              <>
                <div className="empty-state compact">
                  Start from saved PNG screenshots and MP4 clips, then upload more PNG screenshots from the editor.
                </div>
                <label>
                  <span>Project name</span>
                  <input
                    className="field"
                    onChange={(event) => onProjectNameChange(event.target.value)}
                    value={projectName}
                  />
                </label>
                <button className="button" disabled={isCreating || isManagingSource} onClick={onCreateProject} type="button">
                  Create Project
                </button>
              </>
            ) : isLoading ? (
              <div className="empty-state">Loading local source videos...</div>
            ) : sourceVideos.length === 0 ? (
              <div className="empty-state">No `raw.mov` files found under tutorial-artifacts/ios. Switch to Without video to build from saved assets.</div>
            ) : (
              <>
                <label>
                  <span>Source video</span>
                  <select
                    className="field"
                    onChange={(event) => onSourceChange(event.target.value)}
                    value={selectedSourceId}
                  >
                    {sourceVideos.map((sourceVideo) => (
                      <option key={sourceVideo.id} value={sourceVideo.id}>
                        {sourceVideo.flowSlug} / {sourceVideo.timestamp} · {formatDuration(sourceVideo.duration)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Project name</span>
                  <input
                    className="field"
                    onChange={(event) => onProjectNameChange(event.target.value)}
                    value={projectName}
                  />
                </label>
                {selectedSource ? (
                  <div className="source-summary">
                    <strong>{selectedSource.relativePath}</strong>
                    <span>
                      {selectedSource.width || 0}x{selectedSource.height || 0} · {formatDuration(selectedSource.duration)}
                    </span>
                    {isSourceInUse ? (
                      <span className="source-warning">
                        Used by {sourceProjectCount} project{sourceProjectCount === 1 ? '' : 's'}. Archive and move are disabled to avoid breaking saved projects.
                      </span>
                    ) : null}
                  </div>
                ) : null}
                {selectedSource ? (
                  <div className="source-actions">
                    <button
                      className="button secondary"
                      disabled={isManagingSource}
                      onClick={() => setPreviewSource(selectedSource)}
                      type="button"
                    >
                      Preview
                    </button>
                    <select
                      aria-label="Move source recording to flow"
                      className="field source-move-select"
                      disabled={!canManageSelectedSource || moveTargetFlowSlugs.length === 0}
                      onChange={(event) => setMoveTargetFlowSlug(event.target.value)}
                      value={moveTargetFlowSlug}
                    >
                      {moveTargetFlowSlugs.length === 0 ? (
                        <option value="">No other flows</option>
                      ) : moveTargetFlowSlugs.map((flowSlug) => (
                        <option key={flowSlug} value={flowSlug}>
                          Move to {flowSlug}
                        </option>
                      ))}
                    </select>
                    <button
                      className="button secondary"
                      disabled={!canMoveSelectedSource}
                      onClick={handleMoveSource}
                      type="button"
                    >
                      Move
                    </button>
                    <button
                      className="button danger"
                      disabled={!canManageSelectedSource}
                      onClick={handleArchiveSource}
                      type="button"
                    >
                      {isConfirmingArchive ? 'Confirm Archive Delete' : 'Archive Delete'}
                    </button>
                    {isConfirmingArchive ? (
                      <button
                        className="button secondary"
                        disabled={isManagingSource}
                        onClick={() => setIsConfirmingArchive(false)}
                        type="button"
                      >
                        Cancel
                      </button>
                    ) : null}
                  </div>
                ) : null}
                <button className="button" disabled={isCreating || isManagingSource} onClick={onCreateProject} type="button">
                  Create Project
                </button>
              </>
            )}
          </div>
        </section>

        <ProjectLibrary
          onDeleteProject={onDeleteProject}
          onSelectProject={onSelectProject}
          projects={projects}
          selectedProjectId={null}
        />
      </section>
      {renderPreviewModal()}
    </>
  );
}
