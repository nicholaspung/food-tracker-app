import { useMemo, useState } from 'react';

import { assetFileUrl } from '@/lib/api';
import type { ToolProject } from '@/lib/types';

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

export function ProjectLibrary({ projects, selectedProjectId, onSelectProject, onDeleteProject }: ProjectLibraryProps) {
  const [query, setQuery] = useState('');

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
            return (
              <article
                className={`project-row${project.id === selectedProjectId ? ' selected' : ''}`}
                key={project.id}
              >
                <button className="project-row-main" onClick={() => onSelectProject(project.id)} type="button">
                  <strong>{project.name}</strong>
                  <span>{project.flowSlug || 'Uncategorized'} · {project.sourceVideoFilename}</span>
                  <span>{formatDate(project.updated)}</span>
                </button>
                <div className="project-row-actions">
                  {latestExport ? (
                    <a className="button secondary small" href={assetFileUrl(latestExport.id)} target="_blank" rel="noreferrer">
                      Open GIF
                    </a>
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
    </section>
  );
}
