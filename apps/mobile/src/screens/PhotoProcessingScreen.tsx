import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { EmptyState, ErrorState, OfflineBanner, Skeleton } from '../components/shared';
import { clearPhotoDraft, getPhotoDraft, savePhotoDraft, type PhotoDraftAsset } from '../features';
import { useQueuedWrite } from '../features/store/useQueuedWrite';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { useSync } from '../providers/SyncProvider';
import { useTheme } from '../theme';
import { Button, Card, ListItem, Screen, Text } from '../ui';

type PhotoProcessingScreenProps = NativeStackScreenProps<RootStackParamList, 'ProcessPhotos'>;

function createDraftAsset(source: PhotoDraftAsset['source']): PhotoDraftAsset {
  const uniqueId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  return {
    id: `photo_${uniqueId}`,
    source,
    uri: `${source}://mock/${uniqueId}`,
    status: 'pending',
  };
}

function simulatePhotoProcessing(assets: PhotoDraftAsset[]): PhotoDraftAsset[] {
  return assets.map((asset, index) => {
    if (asset.status !== 'processing') {
      return asset;
    }

    const shouldFail = (asset.id.length + index) % 4 === 0;
    return {
      ...asset,
      status: shouldFail ? 'failed' : 'succeeded',
      errorMessage: shouldFail ? 'Processing timeout. Retry this photo.' : undefined,
    };
  });
}

export function PhotoProcessingScreen({ navigation }: PhotoProcessingScreenProps) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const queueWrite = useQueuedWrite();
  const { isOnline } = useConnectivity();
  const { failedCount, isSyncing, queueDepth, replayNow, retryAllFailed } = useSync();

  const photoDraftQuery = useQuery({
    queryKey: ['feature', 'photoDraft'],
    queryFn: getPhotoDraft,
  });

  const [assets, setAssets] = useState<PhotoDraftAsset[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (!photoDraftQuery.data) {
      return;
    }

    setAssets(photoDraftQuery.data.assets);
  }, [photoDraftQuery.data]);

  const persistAssets = async (nextAssets: PhotoDraftAsset[], operationName: string) => {
    await queueWrite(operationName);
    await savePhotoDraft(nextAssets);
    setAssets(nextAssets);
    await queryClient.invalidateQueries({ queryKey: ['feature', 'photoDraft'] });
  };

  const addAsset = async (source: PhotoDraftAsset['source']) => {
    setErrorMessage(null);

    try {
      const nextAssets = [createDraftAsset(source), ...assets];
      await persistAssets(nextAssets, `photo.${source}.add`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not add photo draft.';
      setErrorMessage(message);
    }
  };

  const processAssets = async () => {
    if (assets.length === 0) {
      return;
    }

    setErrorMessage(null);
    setIsProcessing(true);

    try {
      const processingAssets = assets.map((asset) =>
        asset.status === 'pending' || asset.status === 'failed'
          ? {
              ...asset,
              status: 'processing' as const,
              errorMessage: undefined,
            }
          : asset,
      );

      await persistAssets(processingAssets, 'photo.processing.start');

      await new Promise<void>((resolve) => {
        setTimeout(resolve, 450);
      });

      const processedAssets = simulatePhotoProcessing(processingAssets);
      await persistAssets(processedAssets, 'photo.processing.complete');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Photo processing failed.';
      setErrorMessage(message);
    } finally {
      setIsProcessing(false);
    }
  };

  const clearDraft = async () => {
    setErrorMessage(null);

    try {
      await queueWrite('photo.draft.clear');
      await clearPhotoDraft();
      setAssets([]);
      await queryClient.invalidateQueries({ queryKey: ['feature', 'photoDraft'] });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not clear draft.';
      setErrorMessage(message);
    }
  };

  const summary = useMemo(() => {
    const pending = assets.filter((asset) => asset.status === 'pending').length;
    const processing = assets.filter((asset) => asset.status === 'processing').length;
    const succeeded = assets.filter((asset) => asset.status === 'succeeded').length;
    const failed = assets.filter((asset) => asset.status === 'failed').length;

    return { pending, processing, succeeded, failed };
  }, [assets]);

  const styles = StyleSheet.create({
    container: {
      gap: theme.spacing.md,
    },
    row: {
      flexDirection: 'row',
      gap: theme.spacing.sm,
    },
    rowAction: {
      flex: 1,
    },
  });

  if (photoDraftQuery.isLoading) {
    return (
      <Screen>
        <Skeleton height={20} />
        <Skeleton height={20} />
        <Skeleton height={20} />
      </Screen>
    );
  }

  if (photoDraftQuery.isError) {
    return (
      <Screen>
        <ErrorState
          description="Could not restore photo draft."
          onRetry={() => {
            void photoDraftQuery.refetch();
          }}
          title="Draft unavailable"
        />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <View style={styles.container}>
        <Text variant="titleMd">Photo Processing</Text>

        <OfflineBanner
          failedWrites={failedCount}
          isOnline={isOnline}
          isSyncing={isSyncing}
          onRetryFailed={() => {
            void retryAllFailed();
          }}
          onSyncNow={() => {
            void replayNow();
          }}
          pendingWrites={queueDepth}
        />

        <Card>
          <Text variant="label">Capture or select photos</Text>
          <Text tone="secondary">Camera and gallery entries are stored as draft assets for recovery.</Text>
          <View style={styles.row}>
            <Button
              label="Use Camera"
              onPress={() => {
                void addAsset('camera');
              }}
              style={styles.rowAction}
              variant="secondary"
            />
            <Button
              label="Use Gallery"
              onPress={() => {
                void addAsset('gallery');
              }}
              style={styles.rowAction}
              variant="secondary"
            />
          </View>
        </Card>

        <Card>
          <Text variant="label">Processing state</Text>
          <Text tone="secondary">
            Pending: {summary.pending} | Processing: {summary.processing} | Success: {summary.succeeded} | Failed: {summary.failed}
          </Text>

          {assets.length === 0 ? (
            <EmptyState description="Add camera or gallery assets to start." title="No draft assets" />
          ) : (
            assets.map((asset) => (
              <ListItem
                key={asset.id}
                description={asset.errorMessage ? `${asset.uri} - ${asset.errorMessage}` : asset.uri}
                title={`${asset.source.toUpperCase()} - ${asset.status}`}
              />
            ))
          )}

          {errorMessage ? <ErrorState description={errorMessage} title="Photo processing issue" /> : null}

          <View style={styles.row}>
            <Button
              disabled={assets.length === 0 || isProcessing}
              label={isProcessing ? 'Processing...' : 'Process / Retry'}
              onPress={() => {
                void processAssets();
              }}
              style={styles.rowAction}
            />
            <Button
              disabled={assets.length === 0}
              label="Clear Draft"
              onPress={() => {
                void clearDraft();
              }}
              style={styles.rowAction}
              variant="secondary"
            />
          </View>
        </Card>

        <Button
          label="Back to Add Visit"
          onPress={() => {
            navigation.navigate('AddVisit');
          }}
          variant="secondary"
        />
      </View>
    </Screen>
  );
}
