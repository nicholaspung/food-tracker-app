import { assetFileUrl } from '@/lib/api';
import type { ToolAsset, ToolProject } from '@/lib/types';

interface AssetGridProps {
  assets: ToolAsset[];
  emptyText?: string;
  onOpenAsset?: (asset: ToolAsset) => void;
  onDeleteAsset?: (asset: ToolAsset) => void;
  isAssetDeleteDisabled?: (asset: ToolAsset) => boolean;
  deleteDisabledReason?: (asset: ToolAsset) => string;
  projectById?: Map<string, ToolProject>;
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
  emptyText = 'Saved screenshots, clips, and GIFs appear here.',
  deleteDisabledReason,
  isAssetDeleteDisabled,
  onDeleteAsset,
  onOpenAsset,
  projectById,
}: AssetGridProps) {
  const storedAssets = assets.filter((asset) => asset.kind !== 'source_reference');

  return (
    <section className="panel asset-grid-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Assets</p>
          <h2>Saved Files</h2>
        </div>
        <span className="count-pill">{storedAssets.length}</span>
      </div>
      <div className="asset-grid">
        {storedAssets.length === 0 ? (
          <div className="empty-state">{emptyText}</div>
        ) : storedAssets.map((asset) => {
          const project = projectById?.get(asset.project);
          return (
            <article className="asset-card" key={asset.id}>
              <div className="asset-preview">
                {asset.mimeType.startsWith('image/') ? (
                  <img alt="" src={assetFileUrl(asset.id)} />
                ) : asset.mimeType.startsWith('video/') ? (
                  <video muted playsInline src={assetFileUrl(asset.id)} />
                ) : (
                  <span>{asset.kind}</span>
                )}
              </div>
              <div className="asset-meta">
                <strong title={asset.filename}>{asset.filename}</strong>
                <span>{asset.kind} · {formatBytes(asset.bytes)}</span>
                {project ? <span>{project.name}</span> : null}
                <div className="asset-card-actions">
                  {onOpenAsset ? (
                    <button className="asset-open-button" onClick={() => onOpenAsset(asset)} type="button">
                      Open
                    </button>
                  ) : (
                    <a href={assetFileUrl(asset.id)} target="_blank" rel="noreferrer">Open</a>
                  )}
                  {onDeleteAsset ? (
                    <button
                      className="asset-delete-button"
                      disabled={isAssetDeleteDisabled?.(asset) || false}
                      onClick={() => onDeleteAsset(asset)}
                      title={deleteDisabledReason?.(asset)}
                      type="button"
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
