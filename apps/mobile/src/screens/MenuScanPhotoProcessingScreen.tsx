import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Linking, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import {
  FeatureFormScreenScaffold,
  LinearProgressBar,
  PageErrorToast,
  PhotoSourceActionCards,
} from '../components/shared';
import {
  createMenuItemsFromScan,
  formatLimitExceededMessage,
  type MenuItemRecord,
  parseMenuImage,
  parseLimitExceededError,
  type VisitPhotoUploadInput,
} from '../features';
import { useImageSourcePicker } from '../hooks/useImageSourcePicker';
import { buildLocalPhotoFile } from '../lib/photoFiles';
import { trackObservabilityEvent } from '../observability';
import {
  parseMenuItemNamesFromCsv,
  type MenuScanPhase,
  type PhotoProcessingScreenProps,
  type ScanSource,
} from './photoProcessing/shared';
import { createThemedStyles, useTheme } from '../theme';
import { Button, Card, Text } from '../ui';

const useStyles = createThemedStyles((theme) => ({
  chooseCard: {
    gap: theme.spacing.sm,
  },
  tipCard: {
    backgroundColor: theme.colors.status.infoBg,
    borderColor: theme.colors.status.infoBorder,
    borderWidth: 1,
    gap: theme.spacing.xs,
  },
  processingCard: {
    gap: theme.spacing.sm,
  },
  processingHint: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  successCard: {
    borderColor: theme.colors.status.successBorder,
    borderWidth: 1,
    gap: theme.spacing.sm,
  },
  addedItemRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  footerButton: {
    marginTop: theme.spacing.sm,
  },
  errorCard: {
    borderColor: theme.colors.status.dangerBorder,
    borderWidth: 1,
    gap: theme.spacing.sm,
  },
  errorActionsRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  errorAction: {
    flex: 1,
  },
}));

export function MenuScanPhotoProcessingScreen({
  navigation,
  route,
}: PhotoProcessingScreenProps) {
  const theme = useTheme();
  const styles = useStyles();
  const queryClient = useQueryClient();

  const mode = route.params?.mode ?? 'general';
  const restaurantId = route.params?.restaurantId;
  const restaurantName = route.params?.restaurantName?.trim() ?? 'this restaurant';
  const autoStartSourcePicker = route.params?.autoStartSourcePicker === true;
  const isMenuScan = mode === 'menu_scan' && Boolean(restaurantId);

  const [phase, setPhase] = useState<MenuScanPhase>('choose');
  const [isSelectingSource, setIsSelectingSource] = useState(false);
  const [selectedImageName, setSelectedImageName] = useState('');
  const [progressValue, setProgressValue] = useState(0);
  const [createdItemNames, setCreatedItemNames] = useState<string[]>([]);
  const [existingItemNames, setExistingItemNames] = useState<string[]>([]);
  const [countdownValue, setCountdownValue] = useState(5);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastRequestedSource, setLastRequestedSource] =
    useState<ScanSource>('gallery');
  const autoPromptedRef = useRef(false);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const { permissionNeedsSettings, pickImageAssets } = useImageSourcePicker({
    cameraBlockedMessage:
      'Camera permission is blocked. Enable it in device settings.',
    cameraRequiredMessage: 'Camera permission is required to take a photo.',
    galleryBlockedMessage:
      'Photo library permission is blocked. Enable it in device settings.',
    galleryRequiredMessage:
      'Photo library permission is required to upload an image.',
  });

  const navigateBackToItems = useCallback(() => {
    if (!restaurantId) {
      navigation.goBack();
      return;
    }

    navigation.navigate('CreateVisit', {
      preselectedRestaurantId: restaurantId,
      preselectedRestaurantName: restaurantName,
      returnToStep: 1,
    });
  }, [navigation, restaurantId, restaurantName]);

  const startCountdown = useCallback(() => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }

    setCountdownValue(5);
    countdownIntervalRef.current = setInterval(() => {
      setCountdownValue((currentValue) => {
        if (currentValue <= 1) {
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
          }
          navigateBackToItems();
          return 0;
        }

        return currentValue - 1;
      });
    }, 1000);
  }, [navigateBackToItems]);

  const createScannedMenuItems = useCallback(
    async (itemNames: string[], fallbackLabel: string) => {
      if (!restaurantId) {
        throw new Error('Restaurant context is missing.');
      }

      const result = await createMenuItemsFromScan({
        restaurantId,
        itemNames,
        fallbackLabel,
      });
      const returnedRecords = [...result.createdItems, ...result.existingItems];

      queryClient.setQueryData(
        ['feature', 'menuItems', restaurantId],
        (currentItems: MenuItemRecord[] | undefined) => {
          const nextItems = [...(currentItems ?? [])];

          for (const record of returnedRecords) {
            if (nextItems.some((item) => item.id === record.id)) {
              continue;
            }

            nextItems.unshift(record);
          }

          return nextItems;
        },
      );
      await queryClient.invalidateQueries({
        queryKey: ['feature', 'menuItems', restaurantId],
      });

      return {
        createdNames: result.createdItems.map((record) => record.name),
        existingNames: result.existingItems.map((record) => record.name),
      };
    },
    [queryClient, restaurantId],
  );

  const processSelectedImage = useCallback(
    async (imageName: string, imageInput: VisitPhotoUploadInput) => {
      setPhase('processing');
      setProgressValue(0);
      setErrorMessage(null);
      setCreatedItemNames([]);
      setExistingItemNames([]);

      const progressInterval = setInterval(() => {
        setProgressValue((currentValue) => {
          if (currentValue >= 0.92) {
            return currentValue;
          }

          return Number((currentValue + 0.08).toFixed(2));
        });
      }, 250);

      try {
        const parseResult = await parseMenuImage(imageInput);
        const parsedNames = parseMenuItemNamesFromCsv(parseResult.csv);
        const { createdNames, existingNames } = await createScannedMenuItems(
          parsedNames,
          imageName,
        );
        setCreatedItemNames(createdNames);
        setExistingItemNames(existingNames);
        setProgressValue(1);
        setPhase('success');
        startCountdown();
      } catch (error) {
        const limitPayload = parseLimitExceededError(error);
        if (limitPayload) {
          trackObservabilityEvent('USAGE_LIMIT_REACHED', {
            enforcement: 'server',
            limit: limitPayload.limit,
            metric: limitPayload.metric,
            monthKey: limitPayload.monthKey,
            remaining: limitPayload.remaining,
            source: 'PhotoProcessingScreen',
            used: limitPayload.used,
            userTier: limitPayload.userTier ?? null,
          });
        }
        const message = limitPayload
          ? formatLimitExceededMessage(limitPayload)
          : error instanceof Error
            ? error.message
            : 'Could not process this photo.';
        setErrorMessage(message);
        setPhase('error');
      } finally {
        clearInterval(progressInterval);
        void queryClient.invalidateQueries({
          queryKey: ['feature', 'usage', 'monthly'],
        });
      }
    },
    [createScannedMenuItems, queryClient, startCountdown],
  );

  const pickImage = useCallback(
    async (source: ScanSource) => {
      trackObservabilityEvent('PHOTO_PROCESSING_IMAGE_PICK_STARTED', {
        photoSource: source,
        source: 'PhotoProcessingScreen',
      });
      setIsSelectingSource(true);
      setErrorMessage(null);
      setLastRequestedSource(source);

      try {
        const result = await pickImageAssets({ source });
        if (result.status === 'permission_denied') {
          trackObservabilityEvent('PHOTO_PROCESSING_IMAGE_PERMISSION_DENIED', {
            canAskAgain: result.canAskAgain,
            photoSource: source,
            source: 'PhotoProcessingScreen',
          });
          setErrorMessage(result.message);
          setPhase('error');
          return;
        }

        if (result.status === 'canceled') {
          trackObservabilityEvent('PHOTO_PROCESSING_IMAGE_PICK_CANCELED', {
            photoSource: source,
            source: 'PhotoProcessingScreen',
          });
          return;
        }

        const selectedAsset = result.assets[0];
        const imageInput: VisitPhotoUploadInput | null = buildLocalPhotoFile(
          selectedAsset,
          {
            fallbackPrefix:
              source === 'camera' ? 'camera-image' : 'library-image',
          },
        );
        if (!imageInput) {
          throw new Error('Could not read the selected image.');
        }

        setSelectedImageName(imageInput.name);
        trackObservabilityEvent('PHOTO_PROCESSING_IMAGE_PICKED', {
          photoSource: source,
          source: 'PhotoProcessingScreen',
        });
        await processSelectedImage(imageInput.name, imageInput);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Could not select an image.';
        trackObservabilityEvent('PHOTO_PROCESSING_IMAGE_PICK_FAILED', {
          errorMessage: message,
          errorType: error instanceof Error ? error.name : 'unknown_error',
          photoSource: source,
          source: 'PhotoProcessingScreen',
        });
        setErrorMessage(message);
        setPhase('error');
      } finally {
        setIsSelectingSource(false);
      }
    },
    [pickImageAssets, processSelectedImage],
  );

  useEffect(() => {
    if (
      !isMenuScan ||
      !autoStartSourcePicker ||
      autoPromptedRef.current ||
      phase !== 'choose'
    ) {
      return;
    }

    autoPromptedRef.current = true;
    Alert.alert('Scan Menu Photo', 'Choose how you want to add your menu photo.', [
      {
        text: 'Take Photo',
        onPress: () => {
          void pickImage('camera');
        },
      },
      {
        text: 'Upload Image',
        onPress: () => {
          void pickImage('gallery');
        },
      },
      {
        text: 'Cancel',
        style: 'cancel',
      },
    ]);
  }, [autoStartSourcePicker, isMenuScan, phase, pickImage]);

  useEffect(() => {
    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, []);

  if (!isMenuScan) {
    return (
      <FeatureFormScreenScaffold
        keyboardAware={false}
        onBackPress={() => {
          navigation.goBack();
        }}
        primaryAction={{
          label: 'Back',
          onPress: () => {
            navigation.goBack();
          },
        }}
        subtitle="This route is reserved for the menu scanning flow."
        title="Process Photos"
      >
        <Card>
          <Text tone="secondary">
            Use “Scan Menu Photo” from Track Restaurant Visit to continue.
          </Text>
        </Card>
      </FeatureFormScreenScaffold>
    );
  }

  const menuScanTitle =
    phase === 'processing'
      ? 'Processing Menu Photo'
      : phase === 'success'
        ? 'Menu Scan Complete'
        : 'Scan Menu Photo';
  const menuScanSubtitle =
    phase === 'processing'
      ? 'Extracting menu items from your uploaded image.'
      : phase === 'success'
        ? createdItemNames.length > 0
          ? 'New items were added to this restaurant.'
          : 'Existing menu items were matched for this restaurant.'
        : `Capture or upload a menu image for ${restaurantName}.`;

  return (
    <FeatureFormScreenScaffold
      keyboardAware={false}
      onBackPress={() => {
        navigateBackToItems();
      }}
      primaryAction={{
        label: phase === 'processing' ? 'Processing...' : 'Back to Menu Items',
        disabled: phase === 'processing',
        variant: 'secondary',
        onPress: () => {
          navigateBackToItems();
        },
      }}
      secondaryAction={
        phase === 'choose'
          ? {
              label: 'Cancel',
              onPress: () => {
                navigateBackToItems();
              },
            }
          : undefined
      }
      subtitle={menuScanSubtitle}
      title={menuScanTitle}
    >
      {phase === 'choose' ? (
        <>
          <Card style={styles.tipCard}>
            <Text tone="info" variant="bodySm">
              Tip: clear, well-lit menu photos produce better item extraction.
            </Text>
          </Card>

          <Card style={styles.chooseCard}>
            <Text variant="label">Choose Photo Source</Text>
            <Text tone="secondary">
              Take a new photo or upload an existing menu image.
            </Text>
            {isSelectingSource ? (
              <Text tone="secondary" variant="bodySm">
                Opening source picker...
              </Text>
            ) : null}
            <PhotoSourceActionCards
              cameraSubtitle="Camera"
              cameraTitle="Take Photo"
              disabled={isSelectingSource}
              gallerySubtitle="Photo Library"
              galleryTitle="Upload Image"
              onCameraPress={() => {
                void pickImage('camera');
              }}
              onGalleryPress={() => {
                void pickImage('gallery');
              }}
            />
          </Card>
        </>
      ) : null}

      {phase === 'processing' ? (
        <Card style={styles.processingCard}>
          <View style={styles.processingHint}>
            <Ionicons color={theme.colors.text.info} name="sync-outline" size={18} />
            <Text tone="secondary">We're processing your image now.</Text>
          </View>
          <Text variant="label">Processing "{selectedImageName}"</Text>
          <LinearProgressBar progress={progressValue} />
          <Text tone="secondary">{Math.round(progressValue * 100)}% complete</Text>
        </Card>
      ) : null}

      {phase === 'success' ? (
        <Card style={styles.successCard}>
          <View style={styles.processingHint}>
            <Ionicons
              color={theme.colors.text.success}
              name="checkmark-circle"
              size={18}
            />
            <Text tone="success" variant="label">
              Menu scan completed
            </Text>
          </View>
          {createdItemNames.length > 0 ? (
            <>
              <Text tone="secondary">Added items:</Text>
              {createdItemNames.map((itemName) => (
                <View key={itemName} style={styles.addedItemRow}>
                  <Ionicons
                    color={theme.colors.text.success}
                    name="checkmark-outline"
                    size={14}
                  />
                  <Text>{itemName}</Text>
                </View>
              ))}
            </>
          ) : null}
          {existingItemNames.length > 0 ? (
            <>
              <Text tone="secondary">
                {createdItemNames.length > 0 ? 'Already on this menu:' : 'Matched items:'}
              </Text>
              {existingItemNames.map((itemName) => (
                <View key={itemName} style={styles.addedItemRow}>
                  <Ionicons
                    color={theme.colors.text.info}
                    name="checkmark-done-outline"
                    size={14}
                  />
                  <Text>{itemName}</Text>
                </View>
              ))}
            </>
          ) : null}
          <Text tone="secondary">
            Returning to menu items in {countdownValue} second
            {countdownValue === 1 ? '' : 's'}...
          </Text>
          <Button
            label="Go to Menu Items Now"
            onPress={() => {
              navigateBackToItems();
            }}
            style={styles.footerButton}
          />
        </Card>
      ) : null}

      <PageErrorToast
        actionLabel="Try Again"
        errorMessage={
          phase === 'error' ? errorMessage ?? 'Could not process this photo.' : null
        }
        onAction={() => {
          setPhase('choose');
          setErrorMessage(null);
          void pickImage(lastRequestedSource);
        }}
        title="Menu scan failed"
      />

      {phase === 'error' && permissionNeedsSettings ? (
        <Card style={styles.errorCard}>
          <Text tone="danger">
            Camera or photo library permission is blocked in settings.
          </Text>
          <View style={styles.errorActionsRow}>
            <Button
              label="Open Settings"
              onPress={() => {
                void Linking.openSettings();
              }}
              style={styles.errorAction}
              variant="secondary"
            />
          </View>
        </Card>
      ) : null}
    </FeatureFormScreenScaffold>
  );
}
