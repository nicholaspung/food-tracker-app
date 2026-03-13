import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  CurrentLocationButton,
  FeatureFormScreenScaffold,
  LocalDatePickerField,
  OptionList,
  OptionListRow,
  PageErrorToast,
  PhotoAttachmentRow,
  PhotoSourceActionCards,
  PhotoViewerModal,
  RatingLegend,
  RatingSelector,
  UpgradePromptCard,
  VisibilityOptionSelector,
  type VisibilityOptionValue,
} from '../components/shared';
import {
  createQuickTrack,
  formatLimitExceededMessage,
  getNoteById,
  parseLimitExceededError,
  resolveDefaultVisitVisibilityFromAuth,
  useMonthlyUsage,
  type VisitPhotoUploadInput,
} from '../features';
import { useFeatureOutboxQueue } from '../features/store/useFeatureOutboxQueue';
import { useQueuedWrite } from '../features/store/useQueuedWrite';
import {
  formatDateToLocalDateString,
  getTodayLocalDateString,
  isValidLocalDate,
  localDateStringToUTC,
} from '../lib/dateFormatting';
import { showQueuedOfflineAlert } from '../lib/offlineAlerts';
import { resolvePhotoCaptureDate } from '../lib/photoMetadata';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { useTheme } from '../theme';
import { Button, Card, Input, Text } from '../ui';

type QuickTrackScreenProps = NativeStackScreenProps<RootStackParamList, 'QuickTrack'>;

const QUICK_TRACK_RATED_BEFORE_KEY = 'ui.quickTrack.hasRatedBefore';
const FREE_MONTHLY_PHOTO_LIMIT = 5;
const FREE_MONTHLY_PHOTO_WARNING_THRESHOLD = 1;

const ITEM_CATEGORIES = [
  { value: 'convenience_store', label: 'Convenience Store' },
  { value: 'packaged_food', label: 'Packaged Food' },
  { value: 'homemade', label: 'Homemade' },
  { value: 'recipe', label: 'Recipe' },
  { value: 'other', label: 'Other' },
] as const;

type ItemCategory = (typeof ITEM_CATEGORIES)[number]['value'];
type PhotoSource = 'camera' | 'gallery';
type QuickTrackVisibility = Extract<VisibilityOptionValue, 'private' | 'friends'>;

function buildDraftPhotoInput(asset: ImagePicker.ImagePickerAsset): VisitPhotoUploadInput | null {
  if (!asset.uri) {
    return null;
  }

  return {
    uri: asset.uri,
    name: asset.fileName?.trim() || buildDraftPhotoName(asset.uri),
    mimeType: asset.mimeType?.trim() || inferImageMimeType(asset.uri),
  };
}

function inferImageMimeType(uri: string): string {
  const normalizedUri = uri.toLowerCase();
  if (normalizedUri.endsWith('.png')) {
    return 'image/png';
  }

  if (normalizedUri.endsWith('.webp')) {
    return 'image/webp';
  }

  if (normalizedUri.endsWith('.heic') || normalizedUri.endsWith('.heif')) {
    return 'image/heic';
  }

  return 'image/jpeg';
}

function buildDraftPhotoName(uri: string): string {
  const baseName = uri.split('/').pop();
  if (baseName && baseName.includes('.')) {
    return baseName;
  }

  return `quick-track-${Date.now()}.jpg`;
}

function resolveDefaultQuickTrackVisibility(): QuickTrackVisibility {
  return resolveDefaultVisitVisibilityFromAuth();
}

export function QuickTrackScreen({ navigation, route }: QuickTrackScreenProps) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const queueWrite = useQueuedWrite();
  const queueFeatureOutbox = useFeatureOutboxQueue();
  const { isOnline } = useConnectivity();
  const { actualUser, user } = useAuth();
  const isActualAdmin = actualUser?.isAdmin === true;
  const isDisplayAdminUser = user?.isAdmin === true;
  const isDisplaySubscriberUser = user?.isSubscriber === true;
  const isDisplayFreeUser = !isDisplayAdminUser && !isDisplaySubscriberUser;
  const usagePreviewTier = isActualAdmin && !isDisplayAdminUser
    ? (isDisplaySubscriberUser ? 'subscriber' : 'free')
    : null;
  const monthlyUsage = useMonthlyUsage({
    viewAsTier: usagePreviewTier,
  });
  const sourceNoteId = route.params?.sourceNoteId;

  const shouldEnforceUsageLimitsClientSide = !isActualAdmin;
  const estimatedFreePhotoRemaining = isDisplayFreeUser
    ? monthlyUsage.snapshot?.remaining.photoUploadsMonthly ?? null
    : null;
  const shouldShowPhotoUpgradePrompt =
    isDisplayFreeUser &&
    typeof estimatedFreePhotoRemaining === 'number' &&
    estimatedFreePhotoRemaining <= FREE_MONTHLY_PHOTO_WARNING_THRESHOLD;

  const linkedNoteQuery = useQuery({
    queryKey: ['feature', 'note', sourceNoteId],
    queryFn: () => (sourceNoteId ? getNoteById(sourceNoteId) : Promise.resolve(null)),
    enabled: Boolean(sourceNoteId),
  });

  const [itemName, setItemName] = useState('');
  const [rating, setRating] = useState(3);
  const [notes, setNotes] = useState('');
  const [itemCategory, setItemCategory] = useState<ItemCategory | null>(null);
  const [locationText, setLocationText] = useState('');
  const [visibility, setVisibility] = useState<QuickTrackVisibility>(resolveDefaultQuickTrackVisibility());
  const [itemDate, setItemDate] = useState(getTodayLocalDateString());
  const [photo, setPhoto] = useState<VisitPhotoUploadInput | null>(null);
  const [latitude, setLatitude] = useState<number | undefined>(undefined);
  const [longitude, setLongitude] = useState<number | undefined>(undefined);
  const [isItemDateAutoFilled, setIsItemDateAutoFilled] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasRatedBefore, setHasRatedBefore] = useState(false);
  const [isCategoryExpanded, setIsCategoryExpanded] = useState(false);
  const [isPhotoViewerVisible, setIsPhotoViewerVisible] = useState(false);
  const [isCapturingLocation, setIsCapturingLocation] = useState(false);
  const [locationPermissionNeedsSettings, setLocationPermissionNeedsSettings] = useState(false);
  const [photoPermissionNeedsSettings, setPhotoPermissionNeedsSettings] = useState(false);
  const [didApplyNotePrefill, setDidApplyNotePrefill] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedCategoryLabel = itemCategory
    ? ITEM_CATEGORIES.find((category) => category.value === itemCategory)?.label ?? 'Select category'
    : 'Select category';

  useEffect(() => {
    let isMounted = true;

    const loadRatedBefore = async () => {
      try {
        const storedValue = await AsyncStorage.getItem(QUICK_TRACK_RATED_BEFORE_KEY);
        if (isMounted) {
          setHasRatedBefore(storedValue === '1');
        }
      } catch {
        // Ignore storage read errors and keep the default collapsed state.
      }
    };

    void loadRatedBefore();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!linkedNoteQuery.data || didApplyNotePrefill) {
      return;
    }

    setNotes((currentNotes) => (currentNotes.trim() ? currentNotes : linkedNoteQuery.data?.content ?? ''));
    setLocationText((currentLocation) =>
      currentLocation.trim() ? currentLocation : linkedNoteQuery.data?.locationText ?? '',
    );
    setDidApplyNotePrefill(true);
  }, [didApplyNotePrefill, linkedNoteQuery.data]);

  const styles = StyleSheet.create({
    body: {
      gap: theme.spacing.md,
      paddingBottom: theme.spacing.sm,
    },
    sectionCard: {
      gap: theme.spacing.sm,
    },
    photoSection: {
      gap: theme.spacing.sm,
    },
    locationRow: {
      alignItems: 'flex-start',
      flexDirection: 'row',
      gap: theme.spacing.sm,
    },
    locationInput: {
      flex: 1,
    },
    notesInput: {
      minHeight: 100,
      textAlignVertical: 'top',
    },
    categorySelectorRow: {
      backgroundColor: theme.colors.background.muted,
      borderBottomColor: theme.colors.border.default,
    },
    categorySelectorRowExpanded: {
      backgroundColor: theme.colors.status.warningBg,
      borderBottomColor: theme.colors.status.warningBorder,
    },
    categorySelectorTitle: {
      color: theme.colors.text.primary,
      fontWeight: '700',
    },
    categorySelectorSubtitle: {
      color: theme.colors.text.muted,
    },
    categorySelectorSubtitleSelected: {
      color: theme.colors.text.warning,
    },
    categoryOptionSelectedRow: {
      backgroundColor: theme.colors.status.warningBg,
    },
    categoryOptionSelectedLabel: {
      color: theme.colors.text.warning,
    },
    categoryClearLabel: {
      color: theme.colors.text.muted,
    },
    categoryPlaceholder: {
      color: theme.colors.text.muted,
    },
    linkedNoteCard: {
      gap: theme.spacing.xs,
    },
  });

  const applyPhotoCaptureDate = useCallback(async (asset: ImagePicker.ImagePickerAsset) => {
    const captureDate = await resolvePhotoCaptureDate(asset);
    if (!captureDate) {
      return;
    }

    setItemDate(formatDateToLocalDateString(captureDate));
    setIsItemDateAutoFilled(true);
  }, []);

  const handleItemDateChange = (value: string) => {
    setItemDate(value);
    setIsItemDateAutoFilled(false);
  };

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    let isMounted = true;

    const restorePendingPickerResult = async () => {
      try {
        const pendingResult = await ImagePicker.getPendingResultAsync();
        if (!isMounted || !pendingResult || 'code' in pendingResult || pendingResult.canceled) {
          return;
        }

        const pendingAsset = pendingResult.assets?.[0];
        const nextPhoto = pendingAsset ? buildDraftPhotoInput(pendingAsset) : null;
        if (!nextPhoto) {
          return;
        }

        if (pendingAsset) {
          await applyPhotoCaptureDate(pendingAsset);
        }
        setIsPhotoViewerVisible(false);
        setPhoto(nextPhoto);
        trackObservabilityEvent('QUICK_TRACK_PHOTO_PICKED', {
          photoSource: 'gallery',
          restoredPendingResult: true,
          source: 'QuickTrackScreen',
        });
      } catch (error) {
        trackObservabilityEvent('QUICK_TRACK_PHOTO_PICK_FAILED', {
          errorMessage: error instanceof Error ? error.message : String(error),
          errorType: error instanceof Error ? error.name : 'unknown_error',
          photoSource: 'gallery',
          restoredPendingResult: true,
          source: 'QuickTrackScreen',
        });
      }
    };

    void restorePendingPickerResult();
    return () => {
      isMounted = false;
    };
  }, [applyPhotoCaptureDate]);

  const handleVisibilityChange = (value: VisibilityOptionValue) => {
    if (value === 'private' || value === 'friends') {
      setVisibility(value);
    }
  };

  const handleCaptureLocation = async () => {
    trackObservabilityEvent('QUICK_TRACK_LOCATION_CAPTURE_STARTED', {
      source: 'QuickTrackScreen',
    });
    setErrorMessage(null);
    setLocationPermissionNeedsSettings(false);
    setIsCapturingLocation(true);

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        trackObservabilityEvent('QUICK_TRACK_LOCATION_PERMISSION_DENIED', {
          canAskAgain: permission.canAskAgain,
          source: 'QuickTrackScreen',
        });
        setLocationPermissionNeedsSettings(permission.canAskAgain === false);
        setErrorMessage(
          permission.canAskAgain === false
            ? 'Location permission is blocked. Enable it in settings.'
            : 'Location permission is required to capture your coordinates.',
        );
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const capturedLatitude = position.coords.latitude;
      const capturedLongitude = position.coords.longitude;
      const coordinateText = `${capturedLatitude.toFixed(6)}, ${capturedLongitude.toFixed(6)}`;

      setLatitude(capturedLatitude);
      setLongitude(capturedLongitude);
      setLocationText(coordinateText);
      trackObservabilityEvent('QUICK_TRACK_LOCATION_CAPTURED', {
        source: 'QuickTrackScreen',
      });
    } catch (error) {
      trackObservabilityEvent('QUICK_TRACK_LOCATION_CAPTURE_FAILED', {
        errorMessage: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.name : 'unknown_error',
        source: 'QuickTrackScreen',
      });
      setErrorMessage(error instanceof Error ? error.message : 'Could not capture your location.');
    } finally {
      setIsCapturingLocation(false);
    }
  };

  const handlePhotoPick = async (source: PhotoSource) => {
    trackObservabilityEvent('QUICK_TRACK_PHOTO_PICK_STARTED', {
      photoSource: source,
      source: 'QuickTrackScreen',
    });
    setErrorMessage(null);
    setPhotoPermissionNeedsSettings(false);

    if (shouldEnforceUsageLimitsClientSide && isDisplayFreeUser && estimatedFreePhotoRemaining === 0) {
      trackObservabilityEvent('USAGE_LIMIT_REACHED', {
        enforcement: 'client_estimate',
        limit: FREE_MONTHLY_PHOTO_LIMIT,
        metric: 'photo_uploads',
        remaining: estimatedFreePhotoRemaining,
        source: 'QuickTrackScreen',
        used: monthlyUsage.snapshot?.usage.photoUploads ?? null,
      });
      setErrorMessage('Free users can upload up to 5 photos per month.');
      return;
    }

    try {
      const permission =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        trackObservabilityEvent('QUICK_TRACK_PHOTO_PERMISSION_DENIED', {
          canAskAgain: permission.canAskAgain,
          photoSource: source,
          source: 'QuickTrackScreen',
        });
        setPhotoPermissionNeedsSettings(permission.canAskAgain === false);
        throw new Error(
          source === 'camera'
            ? 'Camera permission is required to take a photo.'
            : 'Photo library permission is required to upload an image.',
        );
      }

      const pickerResult =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({
              mediaTypes: ['images'],
              allowsEditing: false,
              exif: true,
              quality: 0.8,
              presentationStyle:
                Platform.OS === 'ios'
                  ? ImagePicker.UIImagePickerPresentationStyle.FULL_SCREEN
                  : undefined,
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              allowsEditing: false,
              exif: true,
              quality: 1,
              selectionLimit: 1,
              presentationStyle:
                Platform.OS === 'ios'
                  ? ImagePicker.UIImagePickerPresentationStyle.FULL_SCREEN
                  : undefined,
              preferredAssetRepresentationMode:
                Platform.OS === 'ios'
                  ? ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current
                  : undefined,
            });

      if (pickerResult.canceled) {
        trackObservabilityEvent('QUICK_TRACK_PHOTO_PICK_CANCELED', {
          photoSource: source,
          source: 'QuickTrackScreen',
        });
        return;
      }

      const selectedAsset = pickerResult.assets?.[0];
      const nextPhoto = selectedAsset ? buildDraftPhotoInput(selectedAsset) : null;
      if (!nextPhoto) {
        throw new Error('Could not read the selected image.');
      }

      await applyPhotoCaptureDate(selectedAsset);
      setIsPhotoViewerVisible(false);
      setPhoto(nextPhoto);
      trackObservabilityEvent('QUICK_TRACK_PHOTO_PICKED', {
        photoSource: source,
        source: 'QuickTrackScreen',
      });
    } catch (error) {
      trackObservabilityEvent('QUICK_TRACK_PHOTO_PICK_FAILED', {
        errorMessage: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.name : 'unknown_error',
        photoSource: source,
        source: 'QuickTrackScreen',
      });
      setErrorMessage(error instanceof Error ? error.message : 'Could not select a photo.');
    }
  };

  const handleCreate = async () => {
    if (!itemName.trim()) {
      setErrorMessage('Item name is required.');
      return;
    }

    if (!isValidLocalDate(itemDate)) {
      setErrorMessage('Please choose a valid date.');
      return;
    }

    if (shouldEnforceUsageLimitsClientSide && isDisplayFreeUser && photo && monthlyUsage.snapshot) {
      const estimatedTotalAfterSubmit = monthlyUsage.snapshot.usage.photoUploads + 1;
      if (estimatedTotalAfterSubmit > FREE_MONTHLY_PHOTO_LIMIT) {
        const remaining = Math.max(
          FREE_MONTHLY_PHOTO_LIMIT - monthlyUsage.snapshot.usage.photoUploads,
          0,
        );
        trackObservabilityEvent('USAGE_LIMIT_REACHED', {
          enforcement: 'client_estimate',
          limit: FREE_MONTHLY_PHOTO_LIMIT,
          metric: 'photo_uploads',
          remaining,
          source: 'QuickTrackScreen',
          used: monthlyUsage.snapshot.usage.photoUploads,
        });
        setErrorMessage(
          `Free users can upload up to ${FREE_MONTHLY_PHOTO_LIMIT} photos per month. Remaining estimate: ${remaining}.`,
        );
        return;
      }
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const quickTrackInput = {
        itemName,
        rating,
        notes: notes.trim() || undefined,
        itemCategory: itemCategory ?? undefined,
        locationText: locationText.trim() || undefined,
        visibility,
        itemDate: localDateStringToUTC(itemDate),
        latitude,
        longitude,
        photo: photo ?? undefined,
        sourceNoteId,
      };

      if (!isOnline) {
        await queueFeatureOutbox('quick-track.create', quickTrackInput);
        await queryClient.invalidateQueries({ queryKey: ['feature', 'quickTracks'] });
        showQueuedOfflineAlert('Quick track');
        navigation.navigate('Home');
        return;
      }

      await queueWrite('quick-track.create');
      await createQuickTrack(quickTrackInput);

      const invalidations: Promise<unknown>[] = [
        queryClient.invalidateQueries({ queryKey: ['feature', 'quickTracks'] }),
        queryClient.invalidateQueries({ queryKey: ['feature', 'visitPhotos'] }),
        queryClient.invalidateQueries({ queryKey: ['feature', 'usage', 'monthly'] }),
      ];

      if (sourceNoteId) {
        invalidations.push(queryClient.invalidateQueries({ queryKey: ['feature', 'notes'] }));
        invalidations.push(queryClient.invalidateQueries({ queryKey: ['feature', 'note', sourceNoteId] }));
      }

      await Promise.all(invalidations);
      await AsyncStorage.setItem(QUICK_TRACK_RATED_BEFORE_KEY, '1');
      navigation.navigate('Home');
    } catch (error) {
      const limitPayload = parseLimitExceededError(error);
      if (limitPayload) {
        trackObservabilityEvent('USAGE_LIMIT_REACHED', {
          enforcement: 'server',
          limit: limitPayload.limit,
          metric: limitPayload.metric,
          monthKey: limitPayload.monthKey,
          remaining: limitPayload.remaining,
          source: 'QuickTrackScreen',
          used: limitPayload.used,
          userTier: limitPayload.userTier ?? null,
        });
      }
      const message = limitPayload
        ? formatLimitExceededMessage(limitPayload)
        : error instanceof Error
          ? error.message
          : 'Could not save quick track.';
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (sourceNoteId) {
      navigation.navigate('Notes');
      return;
    }

    navigation.navigate('AddVisit');
  };

  const hasCapturedCoordinates =
    typeof latitude === 'number' && typeof longitude === 'number';
  const coordinateLabel = hasCapturedCoordinates
    ? `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
    : null;

  return (
    <FeatureFormScreenScaffold
      keyboardAware
      onBackPress={handleCancel}
      primaryAction={{
        label: 'Save Item',
        disabled: isSubmitting || !itemName.trim(),
        loading: isSubmitting,
        onPress: () => {
          void handleCreate();
        },
      }}
      secondaryAction={{
        label: 'Cancel',
        disabled: isSubmitting,
        onPress: handleCancel,
      }}
      subtitle="Quickly rate any item without a restaurant."
      title="Quick Track Item"
    >
      <View style={styles.body}>
        <PageErrorToast errorMessage={errorMessage} title="Quick track failed" />

        {!isOnline && isDisplayFreeUser ? (
          <Card style={styles.sectionCard} tone="muted">
            <Text tone="warning">
              Offline estimate may be stale. Backend limits are enforced when sync runs.
            </Text>
          </Card>
        ) : null}

        {isDisplayFreeUser ? (
          <Card style={styles.sectionCard} tone="muted">
            <Text tone="secondary">
              Monthly photo estimate:{' '}
              {estimatedFreePhotoRemaining === null ? 'unknown' : `${estimatedFreePhotoRemaining} left`}.
            </Text>
          </Card>
        ) : null}

        {shouldShowPhotoUpgradePrompt ? (
          <UpgradePromptCard
            description={
              estimatedFreePhotoRemaining === 0
                ? "You have reached this month's free photo limit. Subscriber accounts have higher monthly limits."
                : `Only ${estimatedFreePhotoRemaining} photo uploads left this month. Subscriber accounts have higher monthly limits.`
            }
            title={
              estimatedFreePhotoRemaining === 0
                ? 'Free limit reached'
                : 'You are close to your free limit'
            }
          />
        ) : null}

        {sourceNoteId ? (
          <Card style={styles.linkedNoteCard} tone="muted">
            <Text variant="label">Linked Note</Text>
            {linkedNoteQuery.isLoading ? (
              <Text tone="secondary">Loading note details...</Text>
            ) : linkedNoteQuery.data ? (
              <>
                <Text tone="secondary">{linkedNoteQuery.data.title}</Text>
                <Text numberOfLines={4} tone="secondary" variant="bodySm">
                  {linkedNoteQuery.data.content}
                </Text>
              </>
            ) : (
              <Text tone="warning">Note details unavailable. You can still save this item.</Text>
            )}
          </Card>
        ) : null}

        <Card style={styles.sectionCard}>
          <LocalDatePickerField
            helperText={
              isItemDateAutoFilled ? 'Auto-set from a selected photo date. You can still change it.' : undefined
            }
            highlighted={isItemDateAutoFilled}
            label="Date"
            modalTitle="Select item date"
            onChange={handleItemDateChange}
            value={itemDate}
          />
        </Card>

        <Card style={styles.sectionCard}>
          <Text variant="label">Visibility</Text>
          <VisibilityOptionSelector
            onChange={handleVisibilityChange}
            options={['private', 'friends']}
            value={visibility}
          />
        </Card>

        <Card style={styles.sectionCard}>
          <Input
            autoCapitalize="words"
            label="Item Name *"
            onChangeText={setItemName}
            placeholder="e.g., Chocolate Bar, Coffee, Homemade Pasta"
            value={itemName}
          />

          <View style={styles.photoSection}>
            <Text variant="label">Photo (Optional)</Text>
            <PhotoSourceActionCards
              cameraSubtitle="Camera"
              cameraTitle="Take Photo"
              disabled={isSubmitting}
              gallerySubtitle="Photo Library"
              galleryTitle="Upload Image"
              onCameraPress={() => {
                void handlePhotoPick('camera');
              }}
              onGalleryPress={() => {
                void handlePhotoPick('gallery');
              }}
            />

            {photo ? (
              <PhotoAttachmentRow
                accessibilityLabel="View attached photo full screen"
                name={photo.name}
                onPress={() => {
                  setIsPhotoViewerVisible(true);
                }}
                onRemove={() => {
                  setIsPhotoViewerVisible(false);
                  setPhoto(null);
                }}
                uri={photo.uri}
              />
            ) : null}

            {photoPermissionNeedsSettings ? (
              <Button
                label="Open Settings"
                onPress={() => {
                  void Linking.openSettings();
                }}
                variant="secondary"
              />
            ) : null}
          </View>
        </Card>

        <RatingLegend
          initiallyExpanded={!hasRatedBefore}
          persistenceKey="ui.quickTrack.ratingGuide.expanded"
        />

        <Card style={styles.sectionCard}>
          <Text variant="label">Rating *</Text>
          <RatingSelector
            onChange={setRating}
            value={rating}
          />
        </Card>

        <Card style={styles.sectionCard}>
          <Text variant="label">Category (Optional)</Text>
          <OptionList>
            <OptionListRow
              chevron={isCategoryExpanded ? 'up' : 'down'}
              iconName="pricetag-outline"
              isLast={!isCategoryExpanded}
              onPress={() => {
                setIsCategoryExpanded((currentValue) => !currentValue);
              }}
              style={[styles.categorySelectorRow, isCategoryExpanded ? styles.categorySelectorRowExpanded : undefined]}
              subtitle={itemCategory ? 'Selected category' : 'Tap to choose a category'}
              subtitleStyle={itemCategory ? styles.categorySelectorSubtitleSelected : styles.categorySelectorSubtitle}
              title={selectedCategoryLabel}
              titleStyle={!itemCategory ? styles.categoryPlaceholder : styles.categorySelectorTitle}
            />

            {isCategoryExpanded ? (
              ITEM_CATEGORIES.map((category, index) => {
                const isSelected = itemCategory === category.value;
                const isLastOption = index === ITEM_CATEGORIES.length - 1;

                return (
                  <OptionListRow
                    chevron={false}
                    isLast={isLastOption && !itemCategory}
                    key={category.value}
                    onPress={() => {
                      setItemCategory(category.value);
                      setIsCategoryExpanded(false);
                    }}
                    rightAccessory={
                      isSelected ? <Ionicons color={theme.colors.text.warning} name="checkmark-circle" size={16} /> : undefined
                    }
                    style={isSelected ? styles.categoryOptionSelectedRow : undefined}
                    title={category.label}
                    titleStyle={isSelected ? styles.categoryOptionSelectedLabel : undefined}
                  />
                );
              })
            ) : null}
            {isCategoryExpanded && itemCategory ? (
              <OptionListRow
                chevron={false}
                isLast
                onPress={() => {
                  setItemCategory(null);
                  setIsCategoryExpanded(false);
                }}
                title="Clear Category"
                titleStyle={styles.categoryClearLabel}
              />
            ) : null}
          </OptionList>

          <Text variant="label">Location (Optional)</Text>
          <View style={styles.locationRow}>
            <Input
              containerStyle={styles.locationInput}
              onChangeText={setLocationText}
              placeholder="e.g., Trader Joe's, Home Kitchen"
              value={locationText}
            />
            <CurrentLocationButton
              accessibilityLabel="Capture current location"
              captured={hasCapturedCoordinates}
              loading={isCapturingLocation}
              onPress={() => {
                void handleCaptureLocation();
              }}
              variant="icon"
            />
          </View>
          {coordinateLabel ? (
            <Text tone="success" variant="bodySm">
              Location updated from GPS: {coordinateLabel}
            </Text>
          ) : null}
          {locationPermissionNeedsSettings ? (
            <Button
              label="Open Settings"
              onPress={() => {
                void Linking.openSettings();
              }}
              variant="secondary"
            />
          ) : null}

          <Input
            inputStyle={styles.notesInput}
            label="Notes (Optional)"
            multiline
            onChangeText={setNotes}
            placeholder="Any additional thoughts or details..."
            value={notes}
          />
        </Card>
      </View>
      <PhotoViewerModal
        onRequestClose={() => {
          setIsPhotoViewerVisible(false);
        }}
        urls={photo ? [photo.uri] : []}
        visible={Boolean(photo) && isPhotoViewerVisible}
      />
    </FeatureFormScreenScaffold>
  );
}
