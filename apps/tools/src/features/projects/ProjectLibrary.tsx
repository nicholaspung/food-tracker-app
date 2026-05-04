import { useMemo, useState } from 'react';

import { assetFileUrl } from '@/lib/api';
import type { ToolAsset, ToolProject } from '@/lib/types';

interface ProjectLibraryProps {
  projects: ToolProject[];
  selectedProjectId: string | null;
  onSelectProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function isCombinedGifProject(project: ToolProject) {
  return Array.isArray(project.tags) && project.tags.includes('combined_gif');
}

export function ProjectLibrary({ projects, selectedProjectId, onSelectProject, onDeleteProject }: ProjectLibraryProps) {
  const [query, setQuery] = useState('');
  const [previewAsset, setPreviewAsset] = useState<ToolAsset | null>(null);
  const [gifRestartVersion, setGifRestartVersion] = useState(0);

  const filteredProjects = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return projects;
    }
    return projects.filter((project) => (
      project.name.toLowerCase().includes(normalized)
      || project.flowSlug?.toLowerCase().includes(normalized)
      || project.sourceVideoFilename.toLowerCase().includes(normalized)
    ));
  }, [projects, query]);

  function openPreviewAsset(asset: ToolAsset) {
    setPreviewAsset(asset);
    setGifRestartVersion((value) => value + 1);
  }

  return (
    <section className="panel project-library">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Library</p>
          <h2>Projects</h2>
        </div>
        <span className="count-pill">{projects.length}</span>
      </div>
      <div className="panel-body">
        <input
          className="field"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search projects"
          type="search"
          value={query}
        />
        <div className="project-list">
          {filteredProjects.length === 0 ? (
            <div className="empty-state">No matching projects.</div>
          ) : filteredProjects.map((project) => {
            const latestExport = project.assets?.find((asset) => asset.kind === 'gif_export');
            const isCombinedProject = isCombinedGifProject(project);
            return (
              <article
                className={`project-row${project.id === selectedProjectId ? ' selected' : ''}`}
                key={project.id}
              >
                <button
                  className="project-row-main"
                  onClick={() => {
                    if (isCombinedProject && latestExport) {
                      openPreviewAsset(latestExport);
                      return;
                    }
                    onSelectProject(project.id);
                  }}
                  type="button"
                >
                  <strong>{project.name}</strong>
                  <span>
                    {isCombinedProject
                      ? `Combined GIF · ${latestExport?.filename || project.sourceVideoFilename}`
                      : `${project.flowSlug || 'Uncategorized'} · ${project.sourceVideoFilename}`}
                  </span>
                  <span>{formatDate(project.updated)}</span>
                </button>
                <div className="project-row-actions">
                  {latestExport ? (
                    <button
                      className="button secondary small"
                      onClick={() => openPreviewAsset(latestExport)}
                      type="button"
                    >
                      Open GIF
                    </button>
                  ) : null}
                  <button className="button danger small" onClick={() => onDeleteProject(project.id)} type="button">
                    Delete
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>
      {previewAsset ? (
        <div
          aria-labelledby="projectGifPreviewTitle"
          aria-modal="true"
          className="modal-backdrop"
          onClick={() => setPreviewAsset(null)}
          role="dialog"
        >
          <div className="asset-modal" onClick={(event) => event.stopPropagation()}>
            <div className="asset-modal-header">
              <div>
                <p className="eyebrow">GIF Preview</p>
                <h2 id="projectGifPreviewTitle">{previewAsset.filename}</h2>
                <span>Saved project export</span>
              </div>
              <button className="button secondary" onClick={() => setPreviewAsset(null)} type="button">
                Close
              </button>
            </div>
            <div className="asset-modal-body">
              <img
                alt={previewAsset.filename}
                key={`${previewAsset.id}-${gifRestartVersion}`}
                src={assetFileUrl(previewAsset.id, gifRestartVersion)}
              />
            </div>
            <div className="asset-modal-footer">
              <a className="button secondary" href={assetFileUrl(previewAsset.id)} target="_blank" rel="noreferrer">
                Open in New Tab
              </a>
              <button className="button secondary" onClick={() => setGifRestartVersion((value) => value + 1)} type="button">
                Restart GIF
              </button>
              <button className="button" onClick={() => setPreviewAsset(null)} type="button">
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
