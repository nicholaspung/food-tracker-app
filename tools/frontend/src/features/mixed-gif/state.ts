import type {
  MixedGifClipItem,
  MixedGifClipTap,
  MixedGifExportSettings,
  MixedGifItem,
  MixedGifProjectState,
  MixedGifScreenshotItem,
  SourceVideo,
} from '@/lib/types';

const defaultExportSettings: MixedGifExportSettings = {
  outputFilename: 'mixed.gif',
  defaultScreenshotDuration: 1.6,
  fps: 12,
  width: 480,
  rippleDuration: 0.75,
  rippleRadius: 58,
  rippleOpacity: 0.95,
  rippleColor: '#006CFF',
};

export function makeId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function formatTime(value: number) {
  if (!Number.isFinite(value)) {
    return '00:00.000';
  }
  const minutes = Math.floor(value / 60);
  const seconds = value - minutes * 60;
  return `${String(minutes).padStart(2, '0')}:${seconds.toFixed(3).padStart(6, '0')}`;
}

export function createInitialState(sourceVideo: SourceVideo): MixedGifProjectState {
  const baseName = sourceVideo.filename.replace(/\.[^.]+$/, '') || 'mixed';
  return {
    version: 1,
    selectedItemId: null,
    sourceVideo: {
      path: sourceVideo.path,
      filename: sourceVideo.filename,
      duration: sourceVideo.duration || 0,
      width: sourceVideo.width || 0,
      height: sourceVideo.height || 0,
    },
    items: [],
    exportSettings: {
      ...defaultExportSettings,
      outputFilename: `${baseName}-mixed.gif`,
    },
  };
}

export function createEmptyAssetProjectState(projectName = 'Asset Library GIF'): MixedGifProjectState {
  const baseName = projectName.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'asset-library';
  return {
    version: 1,
    selectedItemId: null,
    sourceVideo: {
      path: '',
      filename: '',
      duration: 0,
      width: 0,
      height: 0,
    },
    items: [],
    exportSettings: {
      ...defaultExportSettings,
      outputFilename: `${baseName}-mixed.gif`,
    },
  };
}

export type MixedGifAction =
  | { type: 'selectItem'; itemId: string | null }
  | { type: 'addScreenshot'; item: MixedGifScreenshotItem }
  | { type: 'addClip'; item: MixedGifClipItem }
  | { type: 'replaceClip'; item: MixedGifClipItem }
  | { type: 'replaceItem'; item: MixedGifItem }
  | { type: 'deleteItem'; itemId: string }
  | { type: 'duplicateItem'; itemId: string }
  | { type: 'moveItem'; itemId: string; direction: -1 | 1 }
  | { type: 'setScreenshotTap'; itemId: string; tap: { x: number; y: number } | null }
  | { type: 'setScreenshotTapTiming'; itemId: string; tapTiming: 'start' | 'before-next' }
  | { type: 'setClipRange'; itemId: string; start: number; end: number }
  | { type: 'setClipSpeed'; itemId: string; speed: number }
  | { type: 'addClipTap'; itemId: string; tap: MixedGifClipTap }
  | { type: 'clearClipTaps'; itemId: string }
  | { type: 'deleteClipTap'; itemId: string; tapId: string }
  | { type: 'setExportSetting'; key: keyof MixedGifExportSettings; value: string | number };

export function mixedGifReducer(state: MixedGifProjectState, action: MixedGifAction): MixedGifProjectState {
  switch (action.type) {
    case 'selectItem':
      return { ...state, selectedItemId: action.itemId };
    case 'addScreenshot':
      return {
        ...state,
        selectedItemId: action.item.id,
        items: [...state.items, action.item],
      };
    case 'addClip':
      return {
        ...state,
        selectedItemId: action.item.id,
        items: [...state.items, action.item],
      };
    case 'replaceItem':
      return {
        ...state,
        items: state.items.map((item) => (item.id === action.item.id ? action.item : item)),
      };
    case 'replaceClip':
      return {
        ...state,
        selectedItemId: action.item.id,
        items: state.items.map((item) => (
          item.id === action.item.id && item.type === 'clip'
            ? action.item
            : item
        )),
      };
    case 'deleteItem': {
      const index = state.items.findIndex((item) => item.id === action.itemId);
      const items = state.items.filter((item) => item.id !== action.itemId);
      const selectedItemId = state.selectedItemId === action.itemId
        ? items[Math.min(index, items.length - 1)]?.id || null
        : state.selectedItemId;
      return { ...state, selectedItemId, items };
    }
    case 'duplicateItem': {
      const index = state.items.findIndex((item) => item.id === action.itemId);
      if (index < 0) {
        return state;
      }
      const original = state.items[index];
      const duplicate: MixedGifItem = original.type === 'screenshot'
        ? { ...original, id: makeId('shot'), filename: original.filename.replace(/\.png$/i, '-copy.png') }
        : {
            ...original,
            id: makeId('clip'),
            taps: original.taps.map((tap) => ({ ...tap, id: makeId('tap') })),
          };
      const items = [...state.items];
      items.splice(index + 1, 0, duplicate);
      return { ...state, selectedItemId: duplicate.id, items };
    }
    case 'moveItem': {
      const index = state.items.findIndex((item) => item.id === action.itemId);
      const nextIndex = index + action.direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= state.items.length) {
        return state;
      }
      const items = [...state.items];
      const [item] = items.splice(index, 1);
      items.splice(nextIndex, 0, item);
      return { ...state, items };
    }
    case 'setScreenshotTap':
      return {
        ...state,
        items: state.items.map((item) => (
          item.id === action.itemId && item.type === 'screenshot'
            ? { ...item, tap: action.tap }
            : item
        )),
      };
    case 'setScreenshotTapTiming':
      return {
        ...state,
        items: state.items.map((item) => (
          item.id === action.itemId && item.type === 'screenshot'
            ? { ...item, tapTiming: action.tapTiming }
            : item
        )),
      };
    case 'setClipRange':
      return {
        ...state,
        items: state.items.map((item) => {
          if (item.id !== action.itemId || item.type !== 'clip') {
            return item;
          }
          const start = Math.max(0, Math.min(action.start, action.end - 0.05));
          const end = Math.max(start + 0.05, action.end);
          return {
            ...item,
            start,
            end,
            taps: item.taps.filter((tap) => tap.timestamp >= start && tap.timestamp < end),
          };
        }),
      };
    case 'setClipSpeed':
      return {
        ...state,
        items: state.items.map((item) => (
          item.id === action.itemId && item.type === 'clip'
            ? { ...item, speed: Math.min(4, Math.max(0.25, action.speed)) }
            : item
        )),
      };
    case 'addClipTap':
      return {
        ...state,
        items: state.items.map((item) => (
          item.id === action.itemId && item.type === 'clip'
            ? { ...item, taps: [...item.taps, action.tap].sort((a, b) => a.timestamp - b.timestamp) }
            : item
        )),
      };
    case 'deleteClipTap':
      return {
        ...state,
        items: state.items.map((item) => (
          item.id === action.itemId && item.type === 'clip'
            ? { ...item, taps: item.taps.filter((tap) => tap.id !== action.tapId) }
            : item
        )),
      };
    case 'clearClipTaps':
      return {
        ...state,
        items: state.items.map((item) => (
          item.id === action.itemId && item.type === 'clip'
            ? { ...item, taps: [] }
            : item
        )),
      };
    case 'setExportSetting':
      return {
        ...state,
        exportSettings: {
          ...state.exportSettings,
          [action.key]: action.value,
        },
      };
    default:
      return state;
  }
}
