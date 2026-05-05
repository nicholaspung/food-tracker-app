import type {
  CreateProjectPayload,
  PublishedGifAssignment,
  PublishedGifsResponse,
  SourceVideo,
  ToolAsset,
  ToolProject,
} from '@/lib/types';

async function parseJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `Request failed with ${response.status}.`;
    try {
      const body = await response.json();
      message = body.error || body.message || message;
    } catch {
      // Keep default.
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export function assetFileUrl(assetId: string, version?: string | number) {
  const base = `/api/tools/assets/${encodeURIComponent(assetId)}/file`;
  return version === undefined ? base : `${base}?v=${encodeURIComponent(String(version))}`;
}

export function sourceVideoStreamUrl(sourceVideoId: string) {
  return `/api/tools/source-videos/${encodeURIComponent(sourceVideoId)}/stream`;
}

export async function listSourceVideos(): Promise<SourceVideo[]> {
  const data = await parseJsonResponse<{ items: SourceVideo[] }>(await fetch('/api/tools/source-videos'));
  return data.items;
}

export async function archiveSourceVideo(sourceVideoId: string): Promise<{ archivedTo: string }> {
  const data = await parseJsonResponse<{ ok: boolean; archivedTo: string }>(
    await fetch(`/api/tools/source-videos/${encodeURIComponent(sourceVideoId)}`, {
      method: 'DELETE',
    }),
  );
  return { archivedTo: data.archivedTo };
}

export async function moveSourceVideo(sourceVideoId: string, targetFlowSlug: string): Promise<SourceVideo> {
  const data = await parseJsonResponse<{ ok: boolean; sourceVideo: SourceVideo }>(
    await fetch(`/api/tools/source-videos/${encodeURIComponent(sourceVideoId)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'move', targetFlowSlug }),
    }),
  );
  return data.sourceVideo;
}

export async function listProjects(): Promise<ToolProject[]> {
  const data = await parseJsonResponse<{ items: ToolProject[] }>(await fetch('/api/tools/projects'));
  return data.items;
}

export async function listAssets(): Promise<ToolAsset[]> {
  const data = await parseJsonResponse<{ items: ToolAsset[] }>(await fetch('/api/tools/assets'));
  return data.items;
}

export async function createProject(payload: CreateProjectPayload): Promise<ToolProject> {
  const data = await parseJsonResponse<{ project: ToolProject }>(
    await fetch('/api/tools/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  );
  return data.project;
}

export async function getProject(projectId: string): Promise<ToolProject> {
  const data = await parseJsonResponse<{ project: ToolProject }>(
    await fetch(`/api/tools/projects/${encodeURIComponent(projectId)}`),
  );
  return data.project;
}

export async function updateProject(projectId: string, payload: Partial<ToolProject>): Promise<ToolProject> {
  const data = await parseJsonResponse<{ project: ToolProject }>(
    await fetch(`/api/tools/projects/${encodeURIComponent(projectId)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  );
  return data.project;
}

export async function deleteProject(projectId: string): Promise<void> {
  await parseJsonResponse<{ ok: boolean }>(
    await fetch(`/api/tools/projects/${encodeURIComponent(projectId)}`, { method: 'DELETE' }),
  );
}

export async function deleteAsset(assetId: string): Promise<void> {
  await parseJsonResponse<{ ok: boolean }>(
    await fetch(`/api/tools/assets/${encodeURIComponent(assetId)}`, { method: 'DELETE' }),
  );
}

export async function renameAsset(assetId: string, filename: string): Promise<ToolAsset> {
  const data = await parseJsonResponse<{ asset: ToolAsset }>(
    await fetch(`/api/tools/assets/${encodeURIComponent(assetId)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filename }),
    }),
  );
  return data.asset;
}

export async function uploadScreenshotAsset({
  projectId,
  file,
  filename,
  itemId,
  sourceTimestamp,
  sourceVideoPath,
}: {
  projectId: string;
  file: Blob;
  filename: string;
  itemId: string;
  sourceTimestamp: number;
  sourceVideoPath: string;
}): Promise<ToolAsset> {
  const form = new FormData();
  form.set('file', file, filename);
  form.set('filename', filename);
  form.set('itemId', itemId);
  form.set('sourceTimestamp', String(sourceTimestamp));
  form.set('sourceVideoPath', sourceVideoPath);
  const data = await parseJsonResponse<{ asset: ToolAsset }>(
    await fetch(`/api/tools/projects/${encodeURIComponent(projectId)}/screenshots`, {
      method: 'POST',
      body: form,
    }),
  );
  return data.asset;
}

export async function createClipAsset({
  projectId,
  itemId,
  start,
  end,
  speed,
  filename,
}: {
  projectId: string;
  itemId: string;
  start: number;
  end: number;
  speed: number;
  filename: string;
}): Promise<ToolAsset> {
  const data = await parseJsonResponse<{ asset: ToolAsset }>(
    await fetch(`/api/tools/projects/${encodeURIComponent(projectId)}/clips`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ itemId, start, end, speed, filename }),
    }),
  );
  return data.asset;
}

export async function previewMixedGif(projectId: string, editorState: unknown): Promise<Blob> {
  const response = await fetch(`/api/tools/projects/${encodeURIComponent(projectId)}/mixed-gif/preview`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ editorState }),
  });
  if (!response.ok) {
    let message = 'GIF preview failed.';
    try {
      const body = await response.json();
      message = body.error || message;
    } catch {
      // Keep default.
    }
    throw new Error(message);
  }
  return response.blob();
}

export async function saveMixedGif(projectId: string, editorState: unknown): Promise<ToolAsset> {
  const data = await parseJsonResponse<{ asset: ToolAsset }>(
    await fetch(`/api/tools/projects/${encodeURIComponent(projectId)}/exports/gif`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ editorState }),
    }),
  );
  return data.asset;
}

export async function combineGifAssets(payload: {
  assetIds: [string, string];
  projectName: string;
  filename: string;
}): Promise<{ project: ToolProject; asset: ToolAsset }> {
  return parseJsonResponse<{ project: ToolProject; asset: ToolAsset }>(
    await fetch('/api/tools/gif-combinations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  );
}

export async function listPublishedGifs(): Promise<PublishedGifsResponse> {
  return parseJsonResponse<PublishedGifsResponse>(await fetch('/api/tools/published-gifs'));
}

export async function assignPublishedGif(
  flowSlug: string,
  assetId: string,
  notes?: string,
): Promise<PublishedGifAssignment> {
  const data = await parseJsonResponse<{ assignment: PublishedGifAssignment }>(
    await fetch(`/api/tools/published-gifs/${encodeURIComponent(flowSlug)}/assign`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ assetId, notes }),
    }),
  );
  return data.assignment;
}
