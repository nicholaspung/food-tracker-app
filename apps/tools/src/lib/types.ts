export type ToolType = 'mixed_gif';

export type ToolAssetKind =
  | 'source_reference'
  | 'screenshot_png'
  | 'clip_mp4'
  | 'thumbnail_png'
  | 'gif_export'
  | 'mov_export';

export interface SourceVideo {
  id: string;
  flowSlug: string;
  timestamp: string;
  path: string;
  relativePath: string;
  filename: string;
  size: number;
  createdAt: string;
  updatedAt: string;
  duration?: number;
  width?: number;
  height?: number;
  archivedTo?: string;
}

export interface ToolAsset {
  id: string;
  project: string;
  kind: ToolAssetKind;
  itemId?: string;
  label?: string;
  file?: string;
  externalPath?: string;
  filename: string;
  mimeType: string;
  bytes?: number;
  duration?: number;
  width?: number;
  height?: number;
  sourceStart?: number;
  sourceEnd?: number;
  sourceTimestamp?: number;
  metadata?: unknown;
  created: string;
  updated: string;
}

export interface TutorialFlowDefinition {
  slug: string;
  title: string;
  section: string;
  navigationHint: string;
  mobileAssetFilename?: string;
  mobileAssetKey?: string;
}

export type PublishedGifCopyStatus = 'copied' | 'tracked_only' | 'copy_failed';

export interface PublishedGifAssignment {
  id: string;
  flowSlug: string;
  flowTitle: string;
  flowSection?: string;
  asset: string;
  project: string;
  assetFilename: string;
  assetFile?: string;
  sourceProjectName?: string;
  sourceProjectFlowSlug?: string;
  sourceVideoPath?: string;
  sourceVideoFilename?: string;
  targetRelativePath?: string;
  copiedToPath?: string;
  copiedBytes?: number;
  copyStatus: PublishedGifCopyStatus;
  copyError?: string;
  isCurrent: boolean;
  notes?: string;
  created: string;
  updated: string;
}

export interface PublishedGifsResponse {
  flows: TutorialFlowDefinition[];
  current: PublishedGifAssignment[];
  history: PublishedGifAssignment[];
}

export interface MixedGifExportSettings {
  outputFilename: string;
  defaultScreenshotDuration: number;
  fps: number;
  width: number;
  rippleDuration: number;
  rippleRadius: number;
  rippleOpacity: number;
  rippleColor: string;
}

export interface MixedGifSourceVideo {
  path: string;
  filename: string;
  duration: number;
  width: number;
  height: number;
}

export interface MixedGifTap {
  id?: string;
  timestamp?: number;
  x: number;
  y: number;
}

export interface MixedGifScreenshotItem {
  id: string;
  type: 'screenshot';
  assetId: string;
  filename: string;
  sourceTimestamp: number;
  duration: number;
  tap: MixedGifTap | null;
  tapTiming: 'start' | 'before-next';
}

export interface MixedGifClipTap {
  id: string;
  timestamp: number;
  x: number;
  y: number;
}

export interface MixedGifClipItem {
  id: string;
  type: 'clip';
  sourceKind?: 'source_video' | 'asset_file';
  assetId?: string;
  start: number;
  end: number;
  speed: number;
  taps: MixedGifClipTap[];
}

export type MixedGifItem = MixedGifScreenshotItem | MixedGifClipItem;

export interface MixedGifProjectState {
  version: 1;
  selectedItemId: string | null;
  sourceVideo: MixedGifSourceVideo;
  items: MixedGifItem[];
  exportSettings: MixedGifExportSettings;
}

export interface ToolProject {
  id: string;
  name: string;
  toolType: ToolType;
  flowSlug?: string;
  sourceVideoPath: string;
  sourceVideoFilename: string;
  sourceVideoDuration?: number;
  sourceVideoWidth?: number;
  sourceVideoHeight?: number;
  editorState: MixedGifProjectState;
  exportSettings: MixedGifExportSettings;
  tags?: string[];
  notes?: string;
  assets?: ToolAsset[];
  created: string;
  updated: string;
}

export interface CreateProjectPayload {
  name: string;
  flowSlug?: string;
  sourceVideoPath: string;
  sourceVideoFilename: string;
  sourceVideoDuration: number;
  sourceVideoWidth: number;
  sourceVideoHeight: number;
  editorState: MixedGifProjectState;
  exportSettings: MixedGifExportSettings;
  tags?: string[];
  notes?: string;
}
