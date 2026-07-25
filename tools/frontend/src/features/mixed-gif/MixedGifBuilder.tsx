import { useEffect, useMemo, useReducer, useRef, useState, type CSSProperties } from 'react';

import { AssetGrid } from '@/features/projects/AssetGrid';
import {
  assetFileUrl,
  createClipAsset,
  deleteAsset,
  previewMixedGif,
  saveMixedGif,
  sourceVideoProxyUrl,
  updateProject,
  uploadScreenshotAsset,
} from '@/lib/api';
import type {
  MixedGifClipItem,
  MixedGifItem,
  MixedGifProjectState,
  SourceVideo,
  ToolAsset,
  ToolProject,
} from '@/lib/types';
import { formatTime, makeId, mixedGifReducer } from '@/features/mixed-gif/state';

interface MixedGifBuilderProps {
  project: ToolProject;
  projects: ToolProject[];
  sourceVideos: SourceVideo[];
  onProjectChange: (project: ToolProject) => void;
  onProjectsRefresh: () => Promise<void>;
}

type MixedGifBuilderTab = 'compose' | 'selected' | 'export' | 'assets';
type AssetReuseFilter = 'all' | 'screenshot_png' | 'clip_mp4';
type AssetReuseModalView = { name: 'list' } | { name: 'detail'; assetId: string };
type DraftClip = {
  mode: 'create' | 'edit';
  itemId?: string;
  assetId?: string;
  sourceKind?: 'source_video' | 'asset_file';
  start: number;
  end: number;
  speed: number;
  taps: MixedGifClipItem['taps'];
};

function mediaDimensions(media: HTMLImageElement | HTMLVideoElement) {
  return media instanceof HTMLVideoElement
    ? { width: media.videoWidth, height: media.videoHeight }
    : { width: media.naturalWidth, height: media.naturalHeight };
}

function getContainedMediaRect(container: HTMLElement, media: HTMLImageElement | HTMLVideoElement) {
  const rect = container.getBoundingClientRect();
  const dimensions = mediaDimensions(media);
  if (!dimensions.width || !dimensions.height || !rect.width || !rect.height) {
    return rect;
  }

  const mediaRatio = dimensions.width / dimensions.height;
  const containerRatio = rect.width / rect.height;
  let width = rect.width;
  let height = rect.height;
  let left = rect.left;
  let top = rect.top;

  if (containerRatio > mediaRatio) {
    width = rect.height * mediaRatio;
    left = rect.left + (rect.width - width) / 2;
  } else {
    height = rect.width / mediaRatio;
    top = rect.top + (rect.height - height) / 2;
  }

  return { left, top, width, height };
}

function readContainedMediaPointerPosition(
  event: React.MouseEvent<HTMLElement>,
  media: HTMLImageElement | HTMLVideoElement,
) {
  const mediaRect = getContainedMediaRect(event.currentTarget, media);
  return {
    x: Math.min(1, Math.max(0, (event.clientX - mediaRect.left) / mediaRect.width)),
    y: Math.min(1, Math.max(0, (event.clientY - mediaRect.top) / mediaRect.height)),
  };
}

function selectedItem(items: MixedGifItem[], selectedItemId: string | null) {
  return items.find((item) => item.id === selectedItemId) || null;
}

function isTimelineAddableAsset(asset: ToolAsset | null | undefined) {
  return asset?.kind === 'screenshot_png' || asset?.kind === 'clip_mp4';
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

function normalizeProjectState(project: ToolProject): MixedGifProjectState {
  const editorState = project.editorState;

  if (editorState.exportSettings.rippleColor === 'white') {
    return {
      ...editorState,
      exportSettings: {
        ...editorState.exportSettings,
        rippleColor: '#006CFF',
        rippleOpacity: Math.max(editorState.exportSettings.rippleOpacity || 0, 0.95),
        rippleRadius: Math.max(editorState.exportSettings.rippleRadius || 0, 58),
        rippleDuration: Math.max(editorState.exportSettings.rippleDuration || 0, 0.75),
      },
    };
  }

  return editorState;
}

export function MixedGifBuilder({
  project,
  projects,
  sourceVideos,
  onProjectChange,
  onProjectsRefresh,
}: MixedGifBuilderProps) {
  const [state, dispatch] = useReducer(mixedGifReducer, project.editorState, () => normalizeProjectState(project));
  const [activeTab, setActiveTab] = useState<MixedGifBuilderTab>('compose');
  const [currentTime, setCurrentTime] = useState(0);
  const [draftClip, setDraftClip] = useState<DraftClip | null>(null);
  const [status, setStatus] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [isSourcePlaying, setIsSourcePlaying] = useState(false);
  const [isPlayingDraftClip, setIsPlayingDraftClip] = useState(false);
  const [isClipModalOpen, setIsClipModalOpen] = useState(false);
  const [draftClipPreviewTime, setDraftClipPreviewTime] = useState(0);
  const [, setMediaLayoutVersion] = useState(0);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewRestartVersion, setPreviewRestartVersion] = useState(0);
  const [timelinePreviewItem, setTimelinePreviewItem] = useState<MixedGifItem | null>(null);
  const [projectPreviewAsset, setProjectPreviewAsset] = useState<ToolAsset | null>(null);
  const [projectPreviewRestartVersion, setProjectPreviewRestartVersion] = useState(0);
  const [assetPendingDelete, setAssetPendingDelete] = useState<ToolAsset | null>(null);
  const [isDeletingAsset, setIsDeletingAsset] = useState(false);
  const [isAssetReuseOpen, setIsAssetReuseOpen] = useState(false);
  const [assetReuseView, setAssetReuseView] = useState<AssetReuseModalView>({ name: 'list' });
  const [assetReuseQuery, setAssetReuseQuery] = useState('');
  const [assetReuseFilter, setAssetReuseFilter] = useState<AssetReuseFilter>('all');
  const [lastSavedState, setLastSavedState] = useState(project.editorState);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const draftClipVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenshotImageRef = useRef<HTMLImageElement | null>(null);
  const screenshotPreviewRef = useRef<HTMLButtonElement | null>(null);
  const draftClipWrapRef = useRef<HTMLDivElement | null>(null);
  const draftClipPlaybackRef = useRef<number | null>(null);
  const draftClipSeekTimeoutRef = useRef<number | null>(null);
  const draftClipPreviewTimeRef = useRef(0);
  const gifPreviewRef = useRef<HTMLDivElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const sourceVideo = useMemo(
    () => project.sourceVideoPath
      ? sourceVideos.find((video) => video.path === project.sourceVideoPath)
      : undefined,
    [project.sourceVideoPath, sourceVideos],
  );
  const hasSourceVideoPath = Boolean(project.sourceVideoPath);
  const hasSourceVideo = Boolean(sourceVideo && project.sourceVideoPath);
  const activeItem = selectedItem(state.items, state.selectedItemId);
  const activeScreenshot = activeItem?.type === 'screenshot' ? activeItem : null;
  const activeClip = activeItem?.type === 'clip' ? activeItem : null;
  const videoUrl = sourceVideo ? sourceVideoProxyUrl(sourceVideo.id) : '';
  const projectById = useMemo(() => new Map(projects.map((item) => [item.id, item])), [projects]);
  const assetPickerAssets = useMemo(
    () => projects
      .flatMap((item) => item.assets || [])
      .filter((asset) => asset.kind === 'screenshot_png' || asset.kind === 'clip_mp4'),
    [projects],
  );
  const currentTimelineAssetIds = useMemo(
    () => new Set(state.items.map((item) => item.assetId).filter((assetId): assetId is string => Boolean(assetId))),
    [state.items],
  );

  function activeDraftVideo() {
    return draftClipVideoRef.current || videoRef.current;
  }

  function clipVideoUrlForDraft(clip: DraftClip) {
    return clip.sourceKind === 'asset_file' && clip.assetId ? assetFileUrl(clip.assetId) : videoUrl;
  }

  function draftClipDuration() {
    if (draftClip?.sourceKind === 'asset_file') {
      return draftClipVideoRef.current?.duration || draftClip.end || 0;
    }
    return state.sourceVideo.duration || activeDraftVideo()?.duration || 0;
  }

  function refreshMediaLayout() {
    setMediaLayoutVersion((version) => version + 1);
  }

  function replacePreviewUrl(blob: Blob) {
    setPreviewUrl(URL.createObjectURL(blob));
  }

  function restartGeneratedPreview() {
    if (!previewBlob) {
      return;
    }
    replacePreviewUrl(previewBlob);
    setPreviewRestartVersion((version) => version + 1);
  }

  function openProjectPreviewAsset(asset: ToolAsset) {
    setProjectPreviewAsset(asset);
    if (asset.mimeType === 'image/gif') {
      setProjectPreviewRestartVersion((version) => version + 1);
    }
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (JSON.stringify(state) === JSON.stringify(lastSavedState)) {
        return;
      }
      updateProject(project.id, {
        editorState: state,
        exportSettings: state.exportSettings,
      }).then((updatedProject) => {
        setLastSavedState(state);
        onProjectChange(updatedProject);
      }).catch((error: unknown) => {
        setStatus(error instanceof Error ? error.message : 'Could not save project state.');
      });
    }, 650);

    return () => window.clearTimeout(timeout);
  }, [lastSavedState, onProjectChange, project.id, state]);

  useEffect(() => () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
  }, [previewUrl]);

  useEffect(() => () => {
    if (draftClipPlaybackRef.current !== null) {
      window.clearInterval(draftClipPlaybackRef.current);
    }
    if (draftClipSeekTimeoutRef.current !== null) {
      window.clearTimeout(draftClipSeekTimeoutRef.current);
    }
    if (videoRef.current) {
      videoRef.current.playbackRate = 1;
    }
    if (draftClipVideoRef.current) {
      draftClipVideoRef.current.playbackRate = 1;
    }
  }, []);

  useEffect(() => {
    window.addEventListener('resize', refreshMediaLayout);
    return () => window.removeEventListener('resize', refreshMediaLayout);
  }, []);

  useEffect(() => {
    if (!draftClip || !isClipModalOpen) {
      return;
    }

    const video = draftClipVideoRef.current;
    if (!video) {
      return;
    }

    if (!isPlayingDraftClip) {
      video.pause();
    }
    video.playbackRate = draftClip.speed;

    const targetTime = clampDraftVideoTime(draftClipPreviewTime);
    const seekThreshold = isPlayingDraftClip ? 0.25 : 0.015;
    if (Math.abs(video.currentTime - targetTime) > seekThreshold) {
      video.currentTime = targetTime;
      window.requestAnimationFrame(() => {
        const activeVideo = draftClipVideoRef.current;
        if (activeVideo && Math.abs(activeVideo.currentTime - targetTime) > 0.015) {
          activeVideo.currentTime = targetTime;
        }
      });
    }

    if (draftClip.sourceKind !== 'asset_file' && videoRef.current && Math.abs(videoRef.current.currentTime - targetTime) > 0.015) {
      videoRef.current.currentTime = targetTime;
    }
  }, [
    draftClip,
    draftClipPreviewTime,
    isClipModalOpen,
    isPlayingDraftClip,
  ]);

  async function refreshProject() {
    const updatedProject = await updateProject(project.id, {});
    onProjectChange(updatedProject);
  }

  function selectTimelineItem(itemId: string) {
    dispatch({ type: 'selectItem', itemId });
    setActiveTab('selected');
  }

  function clampVideoTime(value: number) {
    const duration = state.sourceVideo.duration || activeDraftVideo()?.duration || 0;
    return Math.min(duration, Math.max(0, value));
  }

  function draftVideoDurationForSeek() {
    return Math.max(draftClipDuration(), 0);
  }

  function clampDraftVideoTime(value: number) {
    const duration = draftVideoDurationForSeek();
    return Math.min(duration, Math.max(0, value));
  }

  function setVideoTime(value: number) {
    const nextTime = clampVideoTime(value);
    setCurrentTime(nextTime);
    if (videoRef.current) {
      videoRef.current.currentTime = nextTime;
    }
    if (draftClipVideoRef.current) {
      draftClipVideoRef.current.currentTime = nextTime;
    }
  }

  function setDraftVideoTime(value: number) {
    const nextTime = clampDraftVideoTime(value);
    draftClipPreviewTimeRef.current = nextTime;
    setCurrentTime(nextTime);
    setDraftClipPreviewTime(nextTime);

    const modalVideo = draftClipVideoRef.current;
    if (modalVideo && Math.abs(modalVideo.currentTime - nextTime) > 0.015) {
      modalVideo.currentTime = nextTime;
      window.requestAnimationFrame(() => {
        const activeVideo = draftClipVideoRef.current;
        if (activeVideo && Math.abs(activeVideo.currentTime - nextTime) > 0.015) {
          activeVideo.currentTime = nextTime;
        }
      });
    }

    if (draftClip?.sourceKind !== 'asset_file' && videoRef.current && Math.abs(videoRef.current.currentTime - nextTime) > 0.015) {
      videoRef.current.currentTime = nextTime;
    }
  }

  function nudgeVideoTime(delta: number) {
    if (draftClip && isClipModalOpen) {
      setDraftVideoTime(draftClipPreviewTimeRef.current + delta);
      return;
    }
    setVideoTime(currentTime + delta);
  }

  function stopDraftClipPlayback() {
    if (draftClipPlaybackRef.current !== null) {
      window.clearInterval(draftClipPlaybackRef.current);
      draftClipPlaybackRef.current = null;
    }
    if (draftClipSeekTimeoutRef.current !== null) {
      window.clearTimeout(draftClipSeekTimeoutRef.current);
      draftClipSeekTimeoutRef.current = null;
    }
    const video = activeDraftVideo();
    if (video) {
      video.playbackRate = 1;
    }
    setIsPlayingDraftClip(false);
  }

  function toggleSourcePlayback() {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const wasPlayingDraftClip = isPlayingDraftClip;
    stopDraftClipPlayback();
    if (video.paused || wasPlayingDraftClip) {
      video.playbackRate = 1;
      video.play().catch(() => setStatus('Could not play source video.'));
    } else {
      video.pause();
    }
  }

  function normalizeDraftClipRange(nextStart: number, nextEnd: number) {
    const duration = Math.max(draftClipDuration(), 0.05);
    const boundedEndInput = Math.min(duration, Math.max(0.05, nextEnd));
    const start = Math.max(0, Math.min(nextStart, boundedEndInput - 0.05));
    const end = Math.min(duration, Math.max(nextEnd, start + 0.05));
    return { start, end };
  }

  function updateDraftClipBoundary(boundary: 'start' | 'end', value: number) {
    if (!draftClip) {
      return;
    }

    const { start, end } = normalizeDraftClipRange(
      boundary === 'start' ? value : draftClip.start,
      boundary === 'end' ? value : draftClip.end,
    );
    const duration = Math.max(draftVideoDurationForSeek(), 0.05);
    const seekTime = boundary === 'start' ? start : Math.min(end, Math.max(0, duration - 0.001));
    setDraftClip({
      ...draftClip,
      start,
      end,
      taps: draftClip.taps.filter((tap) => tap.timestamp >= start && tap.timestamp < end),
    });
    stopDraftClipPlayback();
    setDraftVideoTime(seekTime);
  }

  function updateDraftClipSpeed(speed: number) {
    if (!draftClip) {
      return;
    }
    const nextSpeed = Math.min(4, Math.max(0.25, speed));
    setDraftClip({ ...draftClip, speed: nextSpeed });
    const video = activeDraftVideo();
    if (isPlayingDraftClip && video) {
      video.playbackRate = nextSpeed;
    }
  }

  function beginDraftClipPlayback(video: HTMLVideoElement, clipEnd: number, clipSpeed: number) {
    setIsPlayingDraftClip(true);
    video.playbackRate = clipSpeed;
    video.play().catch(() => {
      setIsPlayingDraftClip(false);
      video.playbackRate = 1;
      setStatus('Could not play pending clip.');
    });

    draftClipPlaybackRef.current = window.setInterval(() => {
      const activeVideo = activeDraftVideo();
      if (!activeVideo) {
        stopDraftClipPlayback();
        return;
      }
      if (activeVideo.currentTime >= clipEnd || activeVideo.paused) {
        activeVideo.pause();
        activeVideo.playbackRate = 1;
        setDraftVideoTime(Math.min(clipEnd, Math.max(0, draftVideoDurationForSeek() - 0.001)));
        stopDraftClipPlayback();
      }
    }, 50);
  }

  function seekDraftClipThenPlay(video: HTMLVideoElement, playStart: number, clipEnd: number, clipSpeed: number) {
    let didStart = false;

    const startPlayback = () => {
      if (didStart) {
        return;
      }
      didStart = true;
      video.removeEventListener('seeked', startPlayback);
      if (draftClipSeekTimeoutRef.current !== null) {
        window.clearTimeout(draftClipSeekTimeoutRef.current);
        draftClipSeekTimeoutRef.current = null;
      }
      beginDraftClipPlayback(video, clipEnd, clipSpeed);
    };

    if (Math.abs(video.currentTime - playStart) > 0.015) {
      video.addEventListener('seeked', startPlayback, { once: true });
      video.currentTime = playStart;
      draftClipSeekTimeoutRef.current = window.setTimeout(startPlayback, 120);
      return;
    }

    window.requestAnimationFrame(startPlayback);
  }

  function playDraftClip() {
    const video = activeDraftVideo();
    if (!draftClip || !video) {
      return;
    }

    const clipStart = draftClip.start;
    const clipEnd = draftClip.end;
    const clipSpeed = draftClip.speed;
    const currentPlayhead = Number.isFinite(draftClipPreviewTimeRef.current)
      ? draftClipPreviewTimeRef.current
      : Number.isFinite(video.currentTime)
        ? video.currentTime
        : draftClipPreviewTime;
    const playStart = currentPlayhead >= clipStart && currentPlayhead < clipEnd
      ? currentPlayhead
      : clipStart;
    stopDraftClipPlayback();
    setDraftVideoTime(playStart);
    seekDraftClipThenPlay(video, playStart, clipEnd, clipSpeed);
  }

  function toggleDraftClipPlayback() {
    if (isPlayingDraftClip) {
      const video = activeDraftVideo();
      if (video) {
        video.pause();
        video.playbackRate = 1;
      }
      stopDraftClipPlayback();
      return;
    }

    playDraftClip();
  }

  async function captureScreenshot() {
    if (!hasSourceVideo) {
      setStatus('Add PNG screenshots from the asset library or upload one to this project.');
      return;
    }
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setStatus('Video metadata is not ready.');
      return;
    }

    setIsBusy(true);
    setStatus('Capturing screenshot...');
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Could not create screenshot canvas.');
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Could not encode PNG.')), 'image/png');
      });
      const itemId = makeId('shot');
      const filename = `${itemId}.png`;
      const asset = await uploadScreenshotAsset({
        projectId: project.id,
        file: blob,
        filename,
        itemId,
        sourceTimestamp: video.currentTime,
        sourceVideoPath: project.sourceVideoPath || '',
      });
      dispatch({
        type: 'addScreenshot',
        item: {
          id: itemId,
          type: 'screenshot',
          assetId: asset.id,
          filename,
          sourceTimestamp: video.currentTime,
          duration: state.exportSettings.defaultScreenshotDuration,
          tap: null,
          tapTiming: 'start',
        },
      });
      await refreshProject();
      setStatus(`Captured screenshot at ${formatTime(video.currentTime)}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not capture screenshot.');
    } finally {
      setIsBusy(false);
    }
  }

  function addClip() {
    if (!hasSourceVideo) {
      setStatus('Add an existing MP4 clip asset to this project.');
      setIsAssetReuseOpen(true);
      setAssetReuseView({ name: 'list' });
      return;
    }
    stopDraftClipPlayback();
    const video = videoRef.current;
    const duration = state.sourceVideo.duration || video?.duration || 0;
    const start = currentTime;
    const end = Math.min(duration, start + Math.min(Math.max(duration * 0.08, 0.5), 2));
    draftClipPreviewTimeRef.current = start;
    setDraftClipPreviewTime(start);
    setDraftClip({ mode: 'create', start, end: Math.max(start + 0.05, end), speed: 1, taps: [] });
    setIsClipModalOpen(true);
    setActiveTab('compose');
  }

  function configureSelectedClip() {
    if (!activeClip) {
      return;
    }
    stopDraftClipPlayback();
    const initialTime = activeClip.start;
    draftClipPreviewTimeRef.current = initialTime;
    setCurrentTime(initialTime);
    setDraftClipPreviewTime(initialTime);
    setDraftClip({
      mode: 'edit',
      itemId: activeClip.id,
      assetId: activeClip.assetId,
      sourceKind: activeClip.sourceKind,
      start: activeClip.start,
      end: activeClip.end,
      speed: activeClip.speed,
      taps: activeClip.taps.map((tap) => ({ ...tap })),
    });
    setIsClipModalOpen(true);
  }

  async function confirmClip() {
    if (!draftClip) {
      return;
    }
    stopDraftClipPlayback();
    const itemId = draftClip.mode === 'edit' && draftClip.itemId ? draftClip.itemId : makeId('clip');
    const item: MixedGifClipItem = {
      id: itemId,
      type: 'clip',
      assetId: draftClip.assetId,
      sourceKind: draftClip.sourceKind,
      start: draftClip.start,
      end: draftClip.end,
      speed: draftClip.speed,
      taps: draftClip.taps.filter((tap) => tap.timestamp >= draftClip.start && tap.timestamp < draftClip.end),
    };

    if (draftClip.sourceKind === 'asset_file') {
      if (draftClip.mode === 'edit') {
        dispatch({ type: 'replaceClip', item });
      } else {
        dispatch({ type: 'addClip', item });
      }
      setDraftClip(null);
      setIsClipModalOpen(false);
      setStatus(draftClip.mode === 'edit'
        ? 'Updated reused clip timeline item.'
        : 'Added reused clip asset to the timeline.');
      return;
    }

    setIsBusy(true);
    setStatus('Rendering clip asset...');
    try {
      const asset = await createClipAsset({
        projectId: project.id,
        itemId,
        start: item.start,
        end: item.end,
        speed: item.speed,
        filename: `${itemId}.mp4`,
      });
      const sourceVideoItem: MixedGifClipItem = {
        ...item,
        assetId: asset.id,
        sourceKind: 'source_video',
      };
      if (draftClip.mode === 'edit') {
        dispatch({ type: 'replaceClip', item: sourceVideoItem });
      } else {
        dispatch({ type: 'addClip', item: sourceVideoItem });
      }
      setDraftClip(null);
      setIsClipModalOpen(false);
      await refreshProject();
      setStatus(draftClip.mode === 'edit'
        ? 'Updated clip asset.'
        : 'Created clip asset and added it to the timeline.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not render clip.');
    } finally {
      setIsBusy(false);
    }
  }

  function handleScreenshotTap(event: React.MouseEvent<HTMLElement>) {
    if (!activeScreenshot || !screenshotImageRef.current) {
      return;
    }
    dispatch({
      type: 'setScreenshotTap',
      itemId: activeScreenshot.id,
      tap: readContainedMediaPointerPosition(event, screenshotImageRef.current),
    });
  }

  function cancelDraftClip() {
    stopDraftClipPlayback();
    setDraftClip(null);
    setIsClipModalOpen(false);
  }

  function addDraftClipTap(event: React.MouseEvent<HTMLDivElement>) {
    if (!draftClip || !draftClipVideoRef.current) {
      return;
    }
    const point = readContainedMediaPointerPosition(event, draftClipVideoRef.current);
    const timestamp = Math.min(draftClip.end - 0.001, Math.max(draftClip.start, draftClipVideoRef.current.currentTime));
    setDraftClipPreviewTime(timestamp);
    setDraftClip({
      ...draftClip,
      taps: [
        ...draftClip.taps,
        {
          id: makeId('tap'),
          timestamp,
          x: point.x,
          y: point.y,
        },
      ].sort((a, b) => a.timestamp - b.timestamp),
    });
  }

  function deleteDraftClipTap(tapId: string) {
    if (!draftClip) {
      return;
    }
    setDraftClip({ ...draftClip, taps: draftClip.taps.filter((tap) => tap.id !== tapId) });
  }

  function clearDraftClipTaps() {
    if (!draftClip) {
      return;
    }
    setDraftClip({ ...draftClip, taps: [] });
  }

  function rippleVars(): CSSProperties {
    return {
      '--tap-ripple-duration': `${state.exportSettings.rippleDuration}s`,
      '--tap-ripple-radius': `${state.exportSettings.rippleRadius}px`,
      '--tap-ripple-opacity': String(state.exportSettings.rippleOpacity),
      '--tap-ripple-color': state.exportSettings.rippleColor,
    } as CSSProperties;
  }

  function markerStyleForTap(
    tap: { x: number; y: number },
    wrapper: HTMLElement | null,
    media: HTMLImageElement | HTMLVideoElement | null,
  ): CSSProperties {
    if (!wrapper || !media) {
      return {
        left: `${tap.x * 100}%`,
        top: `${tap.y * 100}%`,
        ...rippleVars(),
      };
    }
    const wrapperRect = wrapper.getBoundingClientRect();
    const mediaRect = getContainedMediaRect(wrapper, media);
    return {
      left: `${mediaRect.left - wrapperRect.left + tap.x * mediaRect.width}px`,
      top: `${mediaRect.top - wrapperRect.top + tap.y * mediaRect.height}px`,
      ...rippleVars(),
    };
  }

  function isTapRippleActive(timestamp: number, previewTime: number) {
    return previewTime >= timestamp && previewTime <= timestamp + state.exportSettings.rippleDuration;
  }

  async function generatePreview() {
    if (state.items.length === 0) {
      setStatus('Add screenshots or clips before generating a GIF.');
      return;
    }
    setIsBusy(true);
    setStatus('Generating GIF preview...');
    try {
      const blob = await previewMixedGif(project.id, state);
      setPreviewBlob(blob);
      replacePreviewUrl(blob);
      setPreviewRestartVersion(0);
      setStatus('Preview generated.');
      window.requestAnimationFrame(() => {
        gifPreviewRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'GIF preview failed.');
    } finally {
      setIsBusy(false);
    }
  }

  async function saveGif() {
    if (state.items.length === 0) {
      setStatus('Add screenshots or clips before saving a GIF.');
      return;
    }
    setIsBusy(true);
    setStatus('Rendering and saving GIF...');
    try {
      const asset = await saveMixedGif(project.id, state);
      await refreshProject();
      setStatus(`Saved ${asset.filename}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not save GIF.');
    } finally {
      setIsBusy(false);
    }
  }

  async function confirmDeleteAsset() {
    if (!assetPendingDelete) {
      return;
    }
    setIsDeletingAsset(true);
    setStatus('');
    try {
      await deleteAsset(assetPendingDelete.id);
      setProjectPreviewAsset(null);
      setAssetPendingDelete(null);
      await onProjectsRefresh();
      setStatus(`Deleted ${assetPendingDelete.filename}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not delete asset.');
    } finally {
      setIsDeletingAsset(false);
    }
  }

  async function uploadPngAsset(file: File | null | undefined, addToTimeline: boolean) {
    if (!file) {
      return;
    }
    if (file.type !== 'image/png' && !file.name.toLowerCase().endsWith('.png')) {
      setStatus('Upload a PNG screenshot.');
      return;
    }

    setIsBusy(true);
    setStatus('Uploading PNG...');
    try {
      const itemId = addToTimeline ? makeId('shot') : undefined;
      const asset = await uploadScreenshotAsset({
        projectId: project.id,
        file,
        filename: file.name || `${itemId || makeId('shot')}.png`,
        itemId,
        label: 'Uploaded PNG',
      });
      await refreshProject();
      await onProjectsRefresh();
      if (addToTimeline && itemId) {
        dispatch({
          type: 'addScreenshot',
          item: {
            id: itemId,
            type: 'screenshot',
            assetId: asset.id,
            filename: asset.filename,
            sourceTimestamp: 0,
            duration: state.exportSettings.defaultScreenshotDuration,
            tap: null,
            tapTiming: 'start',
          },
        });
        setActiveTab('compose');
      } else {
        setActiveTab('assets');
      }
      setStatus(addToTimeline ? `Uploaded and added ${asset.filename}.` : `Uploaded ${asset.filename}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not upload PNG.');
    } finally {
      setIsBusy(false);
      if (uploadInputRef.current) {
        uploadInputRef.current.value = '';
      }
    }
  }

  function addReusableAssetToTimeline(asset: ToolAsset) {
    if (asset.kind === 'screenshot_png') {
      dispatch({
        type: 'addScreenshot',
        item: {
          id: makeId('shot'),
          type: 'screenshot',
          assetId: asset.id,
          filename: asset.filename,
          sourceTimestamp: asset.sourceTimestamp || 0,
          duration: state.exportSettings.defaultScreenshotDuration,
          tap: null,
          tapTiming: 'start',
        },
      });
      setIsAssetReuseOpen(false);
      setAssetReuseView({ name: 'list' });
      setActiveTab('compose');
      return;
    }

    if (asset.kind === 'clip_mp4') {
      const duration = asset.duration
        || (asset.sourceStart !== undefined && asset.sourceEnd !== undefined
          ? asset.sourceEnd - asset.sourceStart
          : 1);
      dispatch({
        type: 'addClip',
        item: {
          id: makeId('clip'),
          type: 'clip',
          assetId: asset.id,
          sourceKind: 'asset_file',
          start: 0,
          end: Math.max(0.05, duration),
          speed: 1,
          taps: [],
        },
      });
      setIsAssetReuseOpen(false);
      setAssetReuseView({ name: 'list' });
      setActiveTab('compose');
    }
  }

  function renderComposeTab() {
    return (
      <div className="mixed-tab-panel">
        <div className="video-section">
          {hasSourceVideo ? (
            <video
              onEnded={() => {
                setIsSourcePlaying(false);
                stopDraftClipPlayback();
              }}
              onLoadedMetadata={(event) => setCurrentTime(event.currentTarget.currentTime)}
              onPause={() => setIsSourcePlaying(false)}
              onPlay={() => setIsSourcePlaying(true)}
              onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
              playsInline
              ref={videoRef}
              src={videoUrl}
            />
          ) : hasSourceVideoPath ? (
            <div className="empty-state">Source video is missing from tutorial-artifacts.</div>
          ) : (
            <div className="empty-state asset-project-empty-state">
              <strong>Build this GIF from saved assets.</strong>
              <span>Add PNG screenshots or MP4 clips from the asset library, or upload a PNG screenshot to this project.</span>
              <div className="source-actions">
                <button
                  className="button"
                  onClick={() => {
                    setIsAssetReuseOpen(true);
                    setAssetReuseView({ name: 'list' });
                  }}
                  type="button"
                >
                  Add Asset
                </button>
                <button className="button secondary" disabled={isBusy} onClick={() => uploadInputRef.current?.click()} type="button">
                  Upload PNG
                </button>
              </div>
            </div>
          )}
          {hasSourceVideo ? <div className="source-control-row">
            <div className="source-playback-controls">
              <button className="button secondary" onClick={() => nudgeVideoTime(-1)} type="button">-1s</button>
              <button className="button secondary" onClick={() => nudgeVideoTime(-0.5)} type="button">-0.5s</button>
              <button className="button" onClick={toggleSourcePlayback} type="button">
                {isSourcePlaying ? 'Pause' : 'Play'}
              </button>
              <button className="button secondary" onClick={() => nudgeVideoTime(0.5)} type="button">+0.5s</button>
              <button className="button secondary" onClick={() => nudgeVideoTime(1)} type="button">+1s</button>
            </div>
            <div className="source-scrub-row">
              <span>{formatTime(currentTime)}</span>
              <input
                max={state.sourceVideo.duration || 0}
                min={0}
                onChange={(event) => setVideoTime(Number(event.target.value))}
                step={0.001}
                type="range"
                value={currentTime}
              />
              <span>{formatTime(state.sourceVideo.duration || 0)}</span>
            </div>
          </div> : null}
        </div>

        <div className="hint-row">
          {hasSourceVideo
            ? 'Capture screenshots for taps, or add clips for transitions.'
            : 'Screenshots keep tap timing controls, and MP4 clips keep clip tap overlays.'}
        </div>
      </div>
    );
  }

  function renderDraftClipModal() {
    if (!draftClip || !isClipModalOpen) {
      return null;
    }

    const draftVideoUrl = clipVideoUrlForDraft(draftClip);
    const duration = Math.max(draftClipDuration(), 0.001);
    const modalPreviewTime = Math.min(duration, Math.max(0, draftClipPreviewTime));
    const left = (draftClip.start / duration) * 100;
    const width = ((draftClip.end - draftClip.start) / duration) * 100;
    const modalTitle = draftClip.mode === 'edit' ? 'Configure Clip' : 'Create Clip Asset';
    const primaryActionLabel = isBusy
      ? draftClip.mode === 'edit' ? 'Saving Clip...' : 'Creating Clip...'
      : draftClip.mode === 'edit' ? 'Save Clip' : 'Create Clip Asset';
    const actionHint = draftClip.mode === 'edit'
      ? 'Save Clip updates the timeline item and renders a replacement MP4 asset when needed.'
      : 'Cancel discards this pending clip. Create Clip Asset saves an MP4 to this project and adds it to the timeline.';

    return (
      <div className="modal-backdrop clip-modal-backdrop" role="presentation">
        <section
          aria-labelledby="clip-modal-title"
          aria-modal="true"
          className="asset-modal clip-modal"
          role="dialog"
        >
          <div className="asset-modal-header">
            <div>
              <h2 id="clip-modal-title">{modalTitle}</h2>
              <span>{formatTime(draftClip.start)} - {formatTime(draftClip.end)} · {draftClip.speed}x</span>
            </div>
            <button className="button secondary" disabled={isBusy} onClick={cancelDraftClip} type="button">
              Cancel
            </button>
          </div>

          <div className="clip-modal-body">
            {draftVideoUrl ? (
              <div className="clip-modal-video-wrap" onClick={addDraftClipTap} ref={draftClipWrapRef}>
                <video
                  className="clip-modal-video"
                  onEnded={() => {
                    setIsSourcePlaying(false);
                    stopDraftClipPlayback();
                  }}
                  onLoadedMetadata={(event) => {
                    const mediaDuration = Number.isFinite(event.currentTarget.duration)
                      ? event.currentTarget.duration
                      : duration;
                    const preferredTime = draftClipPreviewTimeRef.current >= draftClip.start && draftClipPreviewTimeRef.current <= draftClip.end
                      ? draftClipPreviewTimeRef.current
                      : draftClip.start;
                    const nextTime = Math.min(Math.max(0, preferredTime), Math.max(0, mediaDuration));
                    setDraftVideoTime(nextTime);
                    refreshMediaLayout();
                  }}
                  onPause={() => setIsSourcePlaying(false)}
                  onPlay={() => setIsSourcePlaying(true)}
                  onSeeked={() => {
                    refreshMediaLayout();
                  }}
                  onTimeUpdate={(event) => {
                    if (!isPlayingDraftClip) {
                      return;
                    }
                    const nextTime = Math.min(
                      draftClip.end,
                      Math.max(draftClip.start, event.currentTarget.currentTime),
                    );
                    draftClipPreviewTimeRef.current = nextTime;
                    setCurrentTime(nextTime);
                    setDraftClipPreviewTime(nextTime);
                  }}
                  playsInline
                  src={draftVideoUrl}
                  ref={draftClipVideoRef}
                />
                {draftClip.taps.filter((tap) => isTapRippleActive(tap.timestamp, modalPreviewTime)).map((tap) => (
                  <span
                    className="tap-ripple active"
                    key={`${tap.id}-${Math.floor((modalPreviewTime - tap.timestamp) * 10)}`}
                    style={markerStyleForTap(tap, draftClipWrapRef.current, draftClipVideoRef.current)}
                  />
                ))}
              </div>
            ) : (
              <div className="empty-state">Clip video is missing from the local asset library.</div>
            )}

            <div className="source-control-row">
              <div className="source-playback-controls">
                <button className="button secondary" onClick={() => nudgeVideoTime(-1)} type="button">-1s</button>
                <button className="button secondary" onClick={() => nudgeVideoTime(-0.5)} type="button">-0.5s</button>
                <button className="button" onClick={toggleDraftClipPlayback} type="button">
                  {isPlayingDraftClip ? 'Stop Clip' : 'Play Clip'}
                </button>
                <button className="button secondary" onClick={() => nudgeVideoTime(0.5)} type="button">+0.5s</button>
                <button className="button secondary" onClick={() => nudgeVideoTime(1)} type="button">+1s</button>
              </div>
              <div className="source-scrub-row">
                <span>{formatTime(modalPreviewTime)}</span>
                <input
                  max={duration}
                  min={0}
                  onChange={(event) => setDraftVideoTime(Number(event.target.value))}
                  onInput={(event) => setDraftVideoTime(Number(event.currentTarget.value))}
                  step={0.001}
                  type="range"
                  value={modalPreviewTime}
                />
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            <div className="clip-range-editor">
              <div className="clip-range-header">
                <div>
                  <strong>Clip range</strong>
                  <span>{formatTime(draftClip.start)} - {formatTime(draftClip.end)}</span>
                </div>
              </div>
              <div
                className="clip-dual-range"
                style={{
                  '--clip-range-left': `${left}%`,
                  '--clip-range-width': `${width}%`,
                } as CSSProperties}
              >
                <div className="clip-dual-range-track" />
                <input
                  aria-label="Clip start"
                  max={duration}
                  min={0}
                  onChange={(event) => updateDraftClipBoundary('start', Number(event.target.value))}
                  onInput={(event) => updateDraftClipBoundary('start', Number(event.currentTarget.value))}
                  step={0.001}
                  type="range"
                  value={draftClip.start}
                />
                <input
                  aria-label="Clip end"
                  max={duration}
                  min={0}
                  onChange={(event) => updateDraftClipBoundary('end', Number(event.target.value))}
                  onInput={(event) => updateDraftClipBoundary('end', Number(event.currentTarget.value))}
                  step={0.001}
                  type="range"
                  value={draftClip.end}
                />
              </div>
            </div>

            <div className="field-grid">
              <label>
                <span>Start</span>
                <input
                  className="field"
                  max={draftClip.end - 0.05}
                  min={0}
                  onChange={(event) => updateDraftClipBoundary('start', Number(event.target.value))}
                  step={0.001}
                  type="number"
                  value={draftClip.start}
                />
              </label>
              <label>
                <span>End</span>
                <input
                  className="field"
                  max={duration}
                  min={draftClip.start + 0.05}
                  onChange={(event) => updateDraftClipBoundary('end', Number(event.target.value))}
                  step={0.001}
                  type="number"
                  value={draftClip.end}
                />
              </label>
              <label>
                <span>Speed</span>
                <input
                  className="field"
                  max={4}
                  min={0.25}
                  onChange={(event) => updateDraftClipSpeed(Number(event.target.value))}
                  step={0.25}
                  type="number"
                  value={draftClip.speed}
                />
              </label>
            </div>

            <div className="section-header">
              <h2>Clip Taps</h2>
              <button className="button secondary" onClick={clearDraftClipTaps} type="button">Clear Taps</button>
            </div>
            <div className="tap-list">
              {draftClip.taps.length === 0 ? (
                <div className="empty-state compact">Click the clip preview to add timed taps.</div>
              ) : draftClip.taps.map((tap) => (
                <div className="tap-row" key={tap.id}>
                  <span>{formatTime(tap.timestamp)}</span>
                  <button
                    className="button icon danger"
                    onClick={() => deleteDraftClipTap(tap.id)}
                    type="button"
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="asset-modal-footer">
            <p className="modal-action-hint">{actionHint}</p>
            <button className="button secondary" disabled={isBusy} onClick={cancelDraftClip} type="button">Cancel</button>
            <button className="button" disabled={isBusy || !draftVideoUrl} onClick={confirmClip} type="button">
              {primaryActionLabel}
            </button>
          </div>
        </section>
      </div>
    );
  }

  function renderSelectedTab() {
    if (!activeItem) {
      return (
        <div className="mixed-tab-panel">
          <div className="empty-state">Select a screenshot or clip from Timeline Items.</div>
        </div>
      );
    }

    if (activeScreenshot) {
      return (
        <div className="mixed-tab-panel selected-editor">
          <div className="section-header">
            <h2>Selected Screenshot</h2>
            <button
              className="button secondary"
              onClick={() => dispatch({ type: 'setScreenshotTap', itemId: activeScreenshot.id, tap: null })}
              type="button"
            >
              Clear Tap
            </button>
          </div>
          <button className="screenshot-preview" onClick={handleScreenshotTap} ref={screenshotPreviewRef} type="button">
            <img alt="" onLoad={refreshMediaLayout} ref={screenshotImageRef} src={assetFileUrl(activeScreenshot.assetId)} />
            {activeScreenshot.tap ? (
              <span
                className="tap-ripple loop"
                style={markerStyleForTap(activeScreenshot.tap, screenshotPreviewRef.current, screenshotImageRef.current)}
              />
            ) : null}
          </button>
          <label className="check-row">
            <input
              checked={activeScreenshot.tapTiming === 'before-next'}
              onChange={(event) => dispatch({
                type: 'setScreenshotTapTiming',
                itemId: activeScreenshot.id,
                tapTiming: event.target.checked ? 'before-next' : 'start',
              })}
              type="checkbox"
            />
            <span>Play tap right before next item</span>
          </label>
        </div>
      );
    }

    if (!activeClip) {
      return null;
    }

    return (
      <div className="mixed-tab-panel selected-editor selected-clip-landing">
        <div className="selected-clip-summary">
          <p className="eyebrow">Selected Clip</p>
          <h2>Configure Clip</h2>
          <span>
            {formatTime(activeClip.start)} - {formatTime(activeClip.end)} · {activeClip.speed}x · {activeClip.taps.length} tap{activeClip.taps.length === 1 ? '' : 's'}
          </span>
        </div>

        <button className="button selected-clip-configure-button" onClick={configureSelectedClip} type="button">
          Configure Clip
        </button>
      </div>
    );
  }

  function renderExportTab() {
    return (
      <div className="mixed-tab-panel export-settings">
        {([
          ['outputFilename', 'GIF filename', 'text', undefined, undefined, undefined],
          ['defaultScreenshotDuration', 'Screenshot duration', 'number', 0.05, 30, 0.05],
          ['fps', 'FPS', 'number', 1, 60, 1],
          ['width', 'Width', 'number', 120, 2160, 1],
          ['rippleDuration', 'Ripple duration', 'number', 0.01, 30, 0.01],
          ['rippleRadius', 'Ripple radius', 'number', 1, 1000, 1],
          ['rippleOpacity', 'Ripple opacity', 'number', 0, 1, 0.05],
          ['rippleColor', 'Ripple color', 'text', undefined, undefined, undefined],
        ] as const).map(([key, label, type, min, max, step]) => (
          <label key={key}>
            <span>{label}</span>
            <input
              className="field"
              max={max}
              min={min}
              onChange={(event) => dispatch({
                type: 'setExportSetting',
                key,
                value: type === 'number' ? Number(event.target.value) : event.target.value,
              })}
              step={step}
              type={type}
              value={state.exportSettings[key]}
            />
          </label>
        ))}
        <div className="toolbar wrap">
          <button className="button" disabled={isBusy || state.items.length === 0} onClick={generatePreview} type="button">
            Generate Preview
          </button>
          <button className="button secondary" disabled={isBusy || state.items.length === 0} onClick={saveGif} type="button">
            Save GIF
          </button>
        </div>
        <div className="status-text">{status}</div>
        {previewUrl ? (
          <section className="gif-preview-panel" ref={gifPreviewRef}>
            <div className="section-header">
              <h2>Generated Preview</h2>
              <button
                className="button secondary"
                onClick={restartGeneratedPreview}
                type="button"
              >
                Restart Preview
              </button>
            </div>
            <div className="gif-preview">
              <img key={`${previewUrl}-${previewRestartVersion}`} alt="Generated GIF preview" src={previewUrl} />
            </div>
          </section>
        ) : null}
      </div>
    );
  }

  function renderAssetsTab() {
    return (
      <div className="mixed-tab-panel assets-tab-panel">
        <AssetGrid
          assets={project.assets || []}
          deleteDisabledReason={(asset) => currentTimelineAssetIds.has(asset.id)
            ? 'Remove this asset from Timeline Items before deleting it.'
            : ''}
          isAssetDeleteDisabled={(asset) => currentTimelineAssetIds.has(asset.id)}
          onDeleteAsset={setAssetPendingDelete}
          onOpenAsset={openProjectPreviewAsset}
        />
      </div>
    );
  }

  function renderActiveTab() {
    switch (activeTab) {
      case 'selected':
        return renderSelectedTab();
      case 'export':
        return renderExportTab();
      case 'assets':
        return renderAssetsTab();
      case 'compose':
      default:
        return renderComposeTab();
    }
  }

  function getTimelinePreviewUrl(item: MixedGifItem) {
    if (item.type === 'screenshot') {
      return assetFileUrl(item.assetId);
    }

    return item.assetId ? assetFileUrl(item.assetId) : '';
  }

  function getTimelineModalPreviewUrl(item: MixedGifItem) {
    if (item.type === 'screenshot') {
      return assetFileUrl(item.assetId);
    }

    if (item.sourceKind === 'asset_file') {
      return item.assetId ? assetFileUrl(item.assetId) : '';
    }

    return videoUrl;
  }

  function renderTimelineThumbnail(item: MixedGifItem) {
    const previewUrl = getTimelinePreviewUrl(item);

    if (item.type === 'screenshot') {
      return <img alt="" src={previewUrl} />;
    }

    if (previewUrl) {
      return <video muted playsInline preload="metadata" src={previewUrl} />;
    }

    return <span className="timeline-thumb-placeholder">Clip</span>;
  }

  function renderTimelinePreviewModal() {
    if (!timelinePreviewItem) {
      return null;
    }

    const previewUrl = getTimelineModalPreviewUrl(timelinePreviewItem);
    const title = timelinePreviewItem.type === 'screenshot' ? 'Screenshot Preview' : 'Clip Preview';
    const subtitle = timelinePreviewItem.type === 'screenshot'
      ? `${formatTime(timelinePreviewItem.sourceTimestamp)} · ${timelinePreviewItem.duration.toFixed(2)}s`
      : `${formatTime(timelinePreviewItem.start)} - ${formatTime(timelinePreviewItem.end)} · ${timelinePreviewItem.speed}x`;

    return (
      <div className="modal-backdrop" role="presentation" onMouseDown={() => setTimelinePreviewItem(null)}>
        <section
          aria-labelledby="timeline-preview-title"
          aria-modal="true"
          className="asset-modal"
          onMouseDown={(event) => event.stopPropagation()}
          role="dialog"
        >
          <div className="asset-modal-header">
            <div>
              <h2 id="timeline-preview-title">{title}</h2>
              <span>{subtitle}</span>
            </div>
            <button className="button secondary" onClick={() => setTimelinePreviewItem(null)} type="button">
              Close
            </button>
          </div>
          <div className="asset-modal-body">
            {timelinePreviewItem.type === 'screenshot' ? (
              <img alt="Timeline screenshot preview" src={previewUrl} />
            ) : previewUrl ? (
              <video
                controls
                onLoadedMetadata={(event) => {
                  const video = event.currentTarget;
                  video.playbackRate = timelinePreviewItem.speed;
                  video.currentTime = timelinePreviewItem.start;
                }}
                onPlay={(event) => {
                  const video = event.currentTarget;
                  video.playbackRate = timelinePreviewItem.speed;
                  if (video.currentTime < timelinePreviewItem.start || video.currentTime >= timelinePreviewItem.end) {
                    video.currentTime = timelinePreviewItem.start;
                  }
                }}
                onTimeUpdate={(event) => {
                  const video = event.currentTarget;
                  if (video.currentTime >= timelinePreviewItem.end) {
                    video.pause();
                    video.playbackRate = 1;
                    video.currentTime = Math.min(
                      timelinePreviewItem.end,
                      Math.max(timelinePreviewItem.start, timelinePreviewItem.end - 0.001),
                    );
                  }
                }}
                playsInline
                src={previewUrl}
              />
            ) : (
              <div className="empty-state compact">Clip asset is not available yet.</div>
            )}
          </div>
          <div className="asset-modal-footer">
            <button
              className="button secondary"
              onClick={() => {
                selectTimelineItem(timelinePreviewItem.id);
                setTimelinePreviewItem(null);
              }}
              type="button"
            >
              Edit Selected Item
            </button>
            <button className="button" onClick={() => setTimelinePreviewItem(null)} type="button">
              Close
            </button>
          </div>
        </section>
      </div>
    );
  }

  function renderProjectAssetPreviewModal() {
    if (!projectPreviewAsset) {
      return null;
    }

    const fileUrl = assetFileUrl(projectPreviewAsset.id);
    const isGif = projectPreviewAsset.mimeType === 'image/gif';
    const previewFileUrl = assetFileUrl(projectPreviewAsset.id, isGif ? projectPreviewRestartVersion : undefined);

    return (
      <div
        aria-labelledby="projectAssetPreviewTitle"
        aria-modal="true"
        className="modal-backdrop"
        onClick={() => setProjectPreviewAsset(null)}
        role="dialog"
      >
        <div className="asset-modal" onClick={(event) => event.stopPropagation()}>
          <div className="asset-modal-header">
            <div>
              <p className="eyebrow">Preview</p>
              <h2 id="projectAssetPreviewTitle">{projectPreviewAsset.filename}</h2>
              <span>{projectPreviewAsset.kind}</span>
            </div>
            <button className="button secondary" onClick={() => setProjectPreviewAsset(null)} type="button">
              Close
            </button>
          </div>
          <div className="asset-modal-body">
            {projectPreviewAsset.mimeType.startsWith('image/') ? (
              <img
                alt={projectPreviewAsset.filename}
                key={isGif ? `${projectPreviewAsset.id}-${projectPreviewRestartVersion}` : projectPreviewAsset.id}
                src={previewFileUrl}
              />
            ) : projectPreviewAsset.mimeType.startsWith('video/') ? (
              <video controls playsInline src={fileUrl} />
            ) : (
              <div className="empty-state compact">This asset type cannot be previewed inline.</div>
            )}
          </div>
          <div className="asset-modal-footer">
            <a className="button secondary" href={fileUrl} target="_blank" rel="noreferrer">
              Open in New Tab
            </a>
            {isGif ? (
              <button className="button secondary" onClick={() => setProjectPreviewRestartVersion((version) => version + 1)} type="button">
                Restart GIF
              </button>
            ) : null}
            <button className="button" onClick={() => setProjectPreviewAsset(null)} type="button">
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderDeleteAssetModal() {
    if (!assetPendingDelete) {
      return null;
    }

    return (
      <div
        aria-labelledby="deleteAssetTitle"
        aria-modal="true"
        className="modal-backdrop"
        onClick={() => setAssetPendingDelete(null)}
        role="dialog"
      >
        <div className="asset-modal delete-asset-modal" onClick={(event) => event.stopPropagation()}>
          <div className="asset-modal-header">
            <div>
              <p className="eyebrow">Delete</p>
              <h2 id="deleteAssetTitle">Delete Asset</h2>
              <span>{assetPendingDelete.filename}</span>
            </div>
            <button className="button secondary" disabled={isDeletingAsset} onClick={() => setAssetPendingDelete(null)} type="button">
              Cancel
            </button>
          </div>
          <div className="asset-modal-body light">
            <div className="empty-state">
              Delete {assetPendingDelete.filename}? This removes the stored file from the local tools asset library.
            </div>
          </div>
          <div className="asset-modal-footer">
            <button className="button secondary" disabled={isDeletingAsset} onClick={() => setAssetPendingDelete(null)} type="button">
              Cancel
            </button>
            <button className="button danger" disabled={isDeletingAsset} onClick={confirmDeleteAsset} type="button">
              Delete Asset
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderAssetReuseModal() {
    if (!isAssetReuseOpen) {
      return null;
    }

    const normalized = assetReuseQuery.trim().toLowerCase();
    const filteredAssets = assetPickerAssets.filter((asset) => {
      const sourceProject = projectById.get(asset.project);
      const searchText = [
        asset.filename,
        asset.kind,
        sourceProject?.name || '',
        sourceProject?.flowSlug || '',
      ].join(' ').toLowerCase();
      const matchesFilter = assetReuseFilter === 'all' || asset.kind === assetReuseFilter;
      return matchesFilter && (!normalized || searchText.includes(normalized));
    });
    const selectedAsset = assetReuseView.name === 'detail'
      ? assetPickerAssets.find((asset) => asset.id === assetReuseView.assetId) || null
      : null;
    const canAddSelectedAsset = isTimelineAddableAsset(selectedAsset);

    return (
      <div
        aria-labelledby="assetReuseTitle"
        aria-modal="true"
        className="modal-backdrop"
        onClick={() => setIsAssetReuseOpen(false)}
        role="dialog"
      >
        <div className="asset-modal asset-picker-modal" onClick={(event) => event.stopPropagation()}>
          <div className="asset-modal-header">
            <div>
              <p className="eyebrow">Asset Library</p>
              <h2 id="assetReuseTitle">Add Asset to Timeline</h2>
            </div>
            <button className="button secondary" onClick={() => setIsAssetReuseOpen(false)} type="button">
              Close
            </button>
          </div>
          <div className="asset-picker-body">
            {selectedAsset ? (
              <div className="asset-picker-detail">
                <div className="asset-picker-breadcrumbs">
                  <button className="link-button" onClick={() => setAssetReuseView({ name: 'list' })} type="button">
                    Assets
                  </button>
                  <span>/</span>
                  <span>{selectedAsset.filename}</span>
                </div>
                <div className="asset-modal-body inline">
                  {selectedAsset.mimeType.startsWith('image/') ? (
                    <img alt={selectedAsset.filename} src={assetFileUrl(selectedAsset.id)} />
                  ) : selectedAsset.mimeType.startsWith('video/') ? (
                    <video controls playsInline src={assetFileUrl(selectedAsset.id)} />
                  ) : (
                    <div className="empty-state compact">This asset type cannot be previewed inline.</div>
                  )}
                </div>
                <div className="asset-picker-meta-row">
                  <span><strong>Project</strong> {projectById.get(selectedAsset.project)?.name || 'Unknown project'}</span>
                  <span><strong>Kind</strong> {selectedAsset.kind}</span>
                  <span><strong>Size</strong> {formatBytes(selectedAsset.bytes)}</span>
                  {selectedAsset.duration ? <span><strong>Duration</strong> {selectedAsset.duration.toFixed(2)}s</span> : null}
                  {selectedAsset.sourceStart !== undefined && selectedAsset.sourceEnd !== undefined ? (
                    <span><strong>Source Range</strong> {formatTime(selectedAsset.sourceStart)} - {formatTime(selectedAsset.sourceEnd)}</span>
                  ) : null}
                </div>
                <div className="asset-picker-detail-actions">
                  <button className="button secondary" onClick={() => setAssetReuseView({ name: 'list' })} type="button">
                    Back
                  </button>
                  {canAddSelectedAsset ? (
                    <button className="button" onClick={() => addReusableAssetToTimeline(selectedAsset)} type="button">
                      Add to Timeline
                    </button>
                  ) : (
                    <span className="asset-availability">This asset cannot be added.</span>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className="asset-picker-controls">
                  <input
                    className="field"
                    onChange={(event) => setAssetReuseQuery(event.target.value)}
                    placeholder="Search assets by filename, project, or flow"
                    type="search"
                    value={assetReuseQuery}
                  />
                  <div className="filter-tabs" role="tablist" aria-label="Reusable asset kind filter">
                    {([
                      ['all', 'All'],
                      ['screenshot_png', 'Screenshots'],
                      ['clip_mp4', 'Clips'],
                    ] as const).map(([value, label]) => (
                      <button
                        aria-selected={assetReuseFilter === value}
                        className={`filter-tab${assetReuseFilter === value ? ' active' : ''}`}
                        key={value}
                        onClick={() => setAssetReuseFilter(value)}
                        type="button"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="asset-picker-grid">
                  {filteredAssets.length === 0 ? (
                    <div className="empty-state">No saved screenshots or clips match the current filters.</div>
                  ) : filteredAssets.map((asset) => (
                    <article className="asset-picker-card" key={asset.id}>
                      <button
                        className="asset-picker-card-main"
                        onClick={() => setAssetReuseView({ name: 'detail', assetId: asset.id })}
                        type="button"
                      >
                        <span className="asset-preview">
                          {asset.mimeType.startsWith('image/') ? (
                            <img alt="" src={assetFileUrl(asset.id)} />
                          ) : asset.mimeType.startsWith('video/') ? (
                            <video muted playsInline src={assetFileUrl(asset.id)} />
                          ) : (
                            <span>{asset.kind}</span>
                          )}
                        </span>
                        <strong>{asset.filename}</strong>
                        <span>{asset.kind} · {formatBytes(asset.bytes)}</span>
                        <span>{projectById.get(asset.project)?.name || 'Unknown project'}</span>
                      </button>
                      {isTimelineAddableAsset(asset) ? (
                        <button
                          className="button small asset-picker-add-button"
                          onClick={() => addReusableAssetToTimeline(asset)}
                          type="button"
                        >
                          Add to Timeline
                        </button>
                      ) : (
                        <span className="asset-availability">Preview only</span>
                      )}
                    </article>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="asset-modal-footer">
            {selectedAsset ? (
              <>
                <button className="button secondary" onClick={() => setAssetReuseView({ name: 'list' })} type="button">
                  Back
                </button>
                <button className="button" onClick={() => setIsAssetReuseOpen(false)} type="button">
                  Close
                </button>
              </>
            ) : (
              <button className="button" onClick={() => setIsAssetReuseOpen(false)} type="button">
                Close
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  function renderTimelineItems() {
    return (
      <aside className="panel timeline-items-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Timeline</p>
            <h2>Timeline Items</h2>
          </div>
          <div className="timeline-header-actions">
            <button
              className="button secondary small"
              onClick={() => {
                setIsAssetReuseOpen(true);
                setAssetReuseView({ name: 'list' });
              }}
              type="button"
            >
              + Asset
            </button>
            <span className="count-pill">{state.items.length}</span>
          </div>
        </div>
        <div className="timeline-list">
          {state.items.length === 0 ? (
            <div className="empty-state">Capture screenshots or add clips to build the timeline.</div>
          ) : state.items.map((item, index) => (
            <article className={`timeline-item${item.id === state.selectedItemId ? ' selected' : ''}`} key={item.id}>
              <button
                aria-label={`Preview ${item.type}`}
                className="timeline-thumb-button"
                onClick={(event) => {
                  event.stopPropagation();
                  setTimelinePreviewItem(item);
                }}
                type="button"
              >
                {renderTimelineThumbnail(item)}
              </button>
              <button className="timeline-item-main" onClick={() => selectTimelineItem(item.id)} type="button">
                <strong>{index + 1}. {item.type === 'screenshot' ? 'Screenshot' : 'Clip'}</strong>
                <span>
                  {item.type === 'screenshot'
                    ? `${formatTime(item.sourceTimestamp)} · ${item.duration.toFixed(2)}s`
                    : `${formatTime(item.start)} - ${formatTime(item.end)} · ${item.speed}x`}
                </span>
              </button>
              <div className="timeline-actions">
                <button className="button icon" disabled={index === 0} onClick={() => dispatch({ type: 'moveItem', itemId: item.id, direction: -1 })} type="button">↑</button>
                <button className="button icon" disabled={index === state.items.length - 1} onClick={() => dispatch({ type: 'moveItem', itemId: item.id, direction: 1 })} type="button">↓</button>
                <button className="button icon secondary" onClick={() => dispatch({ type: 'duplicateItem', itemId: item.id })} type="button">⧉</button>
                <button className="button icon danger" onClick={() => dispatch({ type: 'deleteItem', itemId: item.id })} type="button">x</button>
              </div>
            </article>
          ))}
        </div>
      </aside>
    );
  }

  return (
    <>
      <div className="builder-page-content">
        <div className="builder-layout">
          <section className="panel builder-main">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Mixed GIF Builder</p>
                <h2>{project.name}</h2>
              </div>
              <div className="toolbar">
                {hasSourceVideo ? (
                  <>
                    <button className="button secondary" disabled={isBusy} onClick={captureScreenshot} type="button">
                      Capture Screenshot
                    </button>
                    <button className="button secondary" disabled={isBusy} onClick={addClip} type="button">
                      Add Clip
                    </button>
                  </>
                ) : null}
                <button
                  className="button secondary"
                  disabled={isBusy}
                  onClick={() => {
                    setIsAssetReuseOpen(true);
                    setAssetReuseView({ name: 'list' });
                  }}
                  type="button"
                >
                  + Asset
                </button>
                <button className="button secondary" disabled={isBusy} onClick={() => uploadInputRef.current?.click()} type="button">
                  Upload PNG
                </button>
                <input
                  accept="image/png"
                  className="visually-hidden-file"
                  onChange={(event) => uploadPngAsset(event.target.files?.[0], false)}
                  ref={uploadInputRef}
                  type="file"
                />
              </div>
            </div>

            <div className="mixed-editor-tabs" role="tablist" aria-label="Mixed GIF editor">
              {([
                ['compose', 'Mixed GIF'],
                ['selected', 'Selected Item'],
                ['export', 'GIF Export'],
                ['assets', 'Assets'],
              ] as const).map(([tab, label]) => (
                <button
                  aria-selected={activeTab === tab}
                  className={`tab-button${activeTab === tab ? ' active' : ''}`}
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  role="tab"
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>

            {renderActiveTab()}
          </section>

          {renderTimelineItems()}
        </div>
      </div>
      {renderTimelinePreviewModal()}
      {renderProjectAssetPreviewModal()}
      {renderAssetReuseModal()}
      {renderDeleteAssetModal()}
      {renderDraftClipModal()}
    </>
  );
}
