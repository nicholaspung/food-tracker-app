import type { FeatureStore, PhotoDraftAsset, PhotoProcessingDraft } from '../models';

interface PhotoDraftStoreDependencies {
  getStore: () => Promise<FeatureStore>;
  mutateStore: <T>(mutator: (store: FeatureStore) => T) => Promise<T>;
  nowIso: () => string;
}

export function createPhotoDraftStore(dependencies: PhotoDraftStoreDependencies) {
  const { getStore, mutateStore, nowIso } = dependencies;

  return {
    async getPhotoDraft(): Promise<PhotoProcessingDraft> {
      const store = await getStore();
      return store.photoDraft;
    },

    async savePhotoDraft(assets: PhotoDraftAsset[]): Promise<PhotoProcessingDraft> {
      return mutateStore((store) => {
        store.photoDraft = {
          assets,
          updatedAt: nowIso(),
        };
        return store.photoDraft;
      });
    },

    async clearPhotoDraft(): Promise<void> {
      await mutateStore((store) => {
        store.photoDraft = {
          assets: [],
          updatedAt: nowIso(),
        };
      });
    },
  };
}
