import { useMemo, useState } from 'react';

import { AssetGrid } from '@/features/projects/AssetGrid';
import { assetFileUrl } from '@/lib/api';
import type { ToolAsset, ToolAssetKind, ToolProject } from '@/lib/types';

interface AssetLibraryPageProps {
  projects: ToolProject[];
}

type AssetFilter = 'all' | 'screenshot_png' | 'clip_mp4' | 'gif_export';

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

export function AssetLibraryPage({ projects }: AssetLibraryPageProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<AssetFilter>('all');
  const [previewAsset, setPreviewAsset] = useState<ToolAsset | null>(null);

  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const allAssets = useMemo(
    () => projects.flatMap((project) => project.assets || []),
    [projects],
  );
  const storedAssets = allAssets.filter((asset) => asset.kind !== 'source_reference');
  const sourceReferences = allAssets.filter((asset) => asset.kind === 'source_reference');

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
        </div>
      </section>

      <AssetGrid
        assets={filteredAssets}
        emptyText="No saved assets match the current filters."
        onOpenAsset={setPreviewAsset}
        projectById={projectById}
      />

      <section className="panel">
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
                <span>{projectById.get(previewAsset.project)?.name || previewAsset.kind}</span>
              </div>
              <button className="button secondary" onClick={() => setPreviewAsset(null)} type="button">
                Close
              </button>
            </div>
            <div className="asset-modal-body">
              {previewAsset.mimeType.startsWith('image/') ? (
                <img alt={previewAsset.filename} src={assetFileUrl(previewAsset.id)} />
              ) : previewAsset.mimeType.startsWith('video/') ? (
                <video controls playsInline src={assetFileUrl(previewAsset.id)} />
              ) : (
                <div className="empty-state">This asset type cannot be previewed inline.</div>
              )}
            </div>
            <div className="asset-modal-footer">
              <a className="button secondary" href={assetFileUrl(previewAsset.id)} target="_blank" rel="noreferrer">
                Open in New Tab
              </a>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
