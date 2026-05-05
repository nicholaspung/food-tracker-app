import { assetFileUrl } from '@/lib/api';
import type { ToolAsset, ToolProject } from '@/lib/types';

interface AssetGridProps {
  assets: ToolAsset[];
  className?: string;
  emptyText?: string;
  onOpenAsset?: (asset: ToolAsset) => void;
  onDeleteAsset?: (asset: ToolAsset) => void;
  onRenameAsset?: (asset: ToolAsset) => void;
  isAssetDeleteDisabled?: (asset: ToolAsset) => boolean;
  isAssetRenameDisabled?: (asset: ToolAsset) => boolean;
  deleteDisabledReason?: (asset: ToolAsset) => string;
  renameDisabledReason?: (asset: ToolAsset) => string;
  projectById?: Map<string, ToolProject>;
  scrollable?: boolean;
}

function formatBytes(value?: number) {
  if (!value) {
    return '0 B';
  }
  if (value < 1024 * 1024) {
    return `${Math.round(value / 1024)} KB`;
  }
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function AssetGrid({
  assets,
  className,
  emptyText = 'Saved screenshots, clips, and GIFs appear here.',
  deleteDisabledReason,
  isAssetDeleteDisabled,
  isAssetRenameDisabled,
  onDeleteAsset,
  onOpenAsset,
  onRenameAsset,
  projectById,
  renameDisabledReason,
  scrollable = true,
}: AssetGridProps) {
  const storedAssets = assets.filter((asset) => asset.kind !== 'source_reference');
  const panelClassName = [
    'panel',
    'asset-grid-panel',
    scrollable ? 'scrollable-panel' : '',
    className || '',
  ].filter(Boolean).join(' ');
  const gridClassName = [
    'asset-grid',
    scrollable ? 'scrollable-panel-body' : '',
  ].filter(Boolean).join(' ');

  function renderAssetPreview(asset: ToolAsset) {
    if (asset.mimeType.startsWith('image/')) {
      return <img alt="" src={assetFileUrl(asset.id)} />;
    }
    if (asset.mimeType.startsWith('video/')) {
      return <video muted playsInline src={assetFileUrl(asset.id)} />;
    }
    return <span>{asset.kind}</span>;
  }

  function renderAssetMeta(asset: ToolAsset, project?: ToolProject) {
    return (
      <span className="asset-meta">
        <strong title={asset.filename}>{asset.filename}</strong>
        <span>{asset.kind} · {formatBytes(asset.bytes)}</span>
        {project ? <span title={project.name}>{project.name}</span> : null}
      </span>
    );
  }

  return (
    <section className={panelClassName}>
      <div className="panel-header">
        <div>
          <p className="eyebrow">Assets</p>
          <h2>Saved Files</h2>
        </div>
        <span className="count-pill">{storedAssets.length}</span>
      </div>
      <div className={gridClassName}>
        {storedAssets.length === 0 ? (
          <div className="empty-state">{emptyText}</div>
        ) : storedAssets.map((asset) => {
          const project = projectById?.get(asset.project);
          const preview = <span className="asset-preview">{renderAssetPreview(asset)}</span>;
          const meta = renderAssetMeta(asset, project);
          return (
            <article className="asset-card" key={asset.id}>
              {onOpenAsset ? (
                <button className="asset-card-main" onClick={() => onOpenAsset(asset)} type="button">
                  {preview}
                  {meta}
                </button>
              ) : (
                <a className="asset-card-main" href={assetFileUrl(asset.id)} target="_blank" rel="noreferrer">
                  {preview}
                  {meta}
                </a>
              )}
              {onDeleteAsset || onRenameAsset ? (
                <div className="asset-card-actions">
                  {onRenameAsset ? (
                    <button
                      className="asset-card-action-button"
                      disabled={isAssetRenameDisabled?.(asset) || false}
                      onClick={() => onRenameAsset(asset)}
                      title={renameDisabledReason?.(asset)}
                      type="button"
                    >
                      Rename
                    </button>
                  ) : null}
                  {onDeleteAsset ? (
                    <button
                      className="asset-card-action-button asset-delete-button"
                      disabled={isAssetDeleteDisabled?.(asset) || false}
                      onClick={() => onDeleteAsset(asset)}
                      title={deleteDisabledReason?.(asset)}
                      type="button"
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
