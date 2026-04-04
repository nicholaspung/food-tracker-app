import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, Keyboard, Linking, Pressable, StyleSheet, View, type ScrollView } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  EmptyState,
  FeatureFormScreenScaffold,
  HomeFeedVisitEntryCard,
  HomeQuickTrackEntryCard,
  IconActionCard,
  LinearProgressBar,
  LoadingState,
  PageErrorToast,
  PhotoViewerModal,
  PhotoSourceActionCards,
  QuickTrackFormFields,
  RatingLegend,
  RatingSelector,
  ScreenHeader,
  SegmentedControl,
  StepProgressBar,
  UpgradePromptCard,
  VisitMenuItemOptionRow,
  VisitMetadataCard,
  VisitRestaurantOptionTrailing,
  VisitRestaurantSearchSection,
  type HomeFeedPhotoRecord,
  type VisitRestaurantSearchOption,
} from '../components/shared';
import {
  createCollectionRecord,
  createQuickTrack,
  createVisit,
  formatLimitExceededMessage,
  getAuthenticatedUserIdOrNull,
  listCollectionRecords,
  listRestaurants,
  parseMenuImage,
  parseLimitExceededError,
  updateCollectionRecord,
  type QuickTrackRecord,
  useMonthlyUsage,
  type RestaurantRecord,
  type VisitRecord,
  type VisitPhotoUploadInput,
} from '../features';
import { useFeatureOutboxQueue } from '../features/store/useFeatureOutboxQueue';
import { useQueuedWrite } from '../features/store/useQueuedWrite';
import {
  formatDateToLocalDateString,
  formatLocalDateLabel,
  getTodayLocalDateString,
  isValidLocalDate,
  localDateStringToUTC,
} from '../lib/dateFormatting';
import { resolvePhotoCaptureDate } from '../lib/photoMetadata';
import {
  buildCreateQuickTrackInput,
  buildDefaultQuickTrackForm,
  resolveDefaultQuickTrackVisibility,
  validateQuickTrackForm,
  type QuickTrackFormValues,
} from '../lib/quickTrackForm';
import {
  geocodeLocation,
  searchAndCacheNearbyRestaurants,
  searchAndCacheRestaurantsByText,
} from '../lib/googlePlaces';
import { showQueuedOfflineAlert } from '../lib/offlineAlerts';
import {
  buildVisitRestaurantDescription,
  dedupeVisitRestaurants,
  matchesVisitRestaurantSearch,
  prioritizeSelectedVisitRestaurant,
  withVisitRestaurantDistance,
  type VisitRestaurantWithDistance,
} from '../lib/visitRestaurantSearch';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { resolveCreateVisitSearchUi, shouldShowOfflineUsageWarning } from './usageUiRules';
import { useTheme } from '../theme';
import { Button, Card, Input, Screen, Text } from '../ui';

type PhotoProcessingScreenProps = NativeStackScreenProps<RootStackParamList, 'ProcessPhotos'>;
type ScanSource = 'camera' | 'gallery';
type MenuScanPhase = 'choose' | 'processing' | 'success' | 'error';
type ProcessType = 'restaurant' | 'quickTrack';
type GeneralPhotoStep = 'choice' | 'upload' | 'process' | 'review';

interface PhotoCoordinates {
  latitude: number;
  longitude: number;
}

interface DraftPhotoAsset {
  id: string;
  uri: string;
  name: string;
  mimeType: string;
  captureDate: Date | null;
  captureCoordinates: PhotoCoordinates | null;
}

interface RestaurantPhotoForm {
  restaurantId: string;
  restaurantName: string;
  menuItemId: string;
  menuItemName: string;
  rating: number;
  description: string;
  notes: string;
  date: string;
}

interface MenuItemRecord {
  id: string;
  restaurant: string;
  name: string;
  description?: string;
  createdBy?: string;
  visibility?: 'private' | 'friends' | 'public';
}

interface CreatedMenuItemRecord {
  id: string;
  name: string;
}

type MenuItemMode = 'existing' | 'create';

const PROGRESS_FLOW_TAIL: { label: string }[] = [{ label: 'Upload' }, { label: 'Process' }, { label: 'Review' }];
const FREE_MONTHLY_PHOTO_LIMIT = 5;
const FREE_MONTHLY_PHOTO_WARNING_THRESHOLD = 1;
const FREE_SEARCH_WARNING_THRESHOLD = 2;
const reviewEntryDateFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});
const reviewEntryTimeFormatter = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
});

interface ReviewVisitCardData {
  id: string;
  visit: VisitRecord;
  photosByFoodItem: Map<string, HomeFeedPhotoRecord[]>;
  footerLabel: string;
}

interface ReviewQuickTrackCardData {
  id: string;
  quickTrack: QuickTrackRecord;
  photos: HomeFeedPhotoRecord[];
  entryMeta: string;
}

function buildScannedItemNames(seedLabel: string): string[] {
  const normalized = seedLabel.replace(/\.[^/.]+$/, '').trim();
  const base = normalized || 'Scanned Item';
  return [`${base} #1`, `${base} #2`, `${base} #3`];
}

function formatReviewEntryDateLabel(value: string, fallbackDate: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return formatLocalDateLabel(fallbackDate);
  }

  return reviewEntryDateFormatter.format(date);
}

function formatReviewEntryTimeLabel(value: string): string | undefined {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return reviewEntryTimeFormatter.format(date);
}

function formatReviewEntryFooterLabel(value: string, fallbackDate: string): string {
  const dateLabel = formatReviewEntryDateLabel(value, fallbackDate);
  const timeLabel = formatReviewEntryTimeLabel(value);

  return timeLabel ? `${dateLabel} • ${timeLabel}` : dateLabel;
}

function parseCsvFirstColumn(line: string): string {
  if (!line.trim()) {
    return '';
  }

  let inQuotes = false;
  let value = '';

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      const nextChar = line[index + 1];
      if (inQuotes && nextChar === '"') {
        value += '"';
        index += 1;
        continue;
      }

      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      break;
    }

    value += char;
  }

  return value.trim();
}

function parseMenuItemNamesFromCsv(csvText: string): string[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return [];
  }

  const names: string[] = [];
  const firstLineFirstColumn = parseCsvFirstColumn(lines[0]).toLowerCase();
  const startIndex = firstLineFirstColumn.includes('menu_item') || firstLineFirstColumn.includes('menu item') ? 1 : 0;

  for (let index = startIndex; index < lines.length; index += 1) {
    const name = parseCsvFirstColumn(lines[index]);
    if (!name) {
      continue;
    }

    if (names.includes(name)) {
      continue;
    }

    names.push(name);
  }

  return names;
}

function buildDraftPhotoName(uri: string): string {
  const baseName = uri.split('/').pop();
  if (baseName && baseName.includes('.')) {
    return baseName;
  }

  return `photo-${Date.now()}.jpg`;
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

function parseExifRational(rawValue: unknown): number | null {
  if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
    return rawValue;
  }

  if (typeof rawValue === 'string') {
    const trimmed = rawValue.trim();
    if (!trimmed) {
      return null;
    }

    if (trimmed.includes('/')) {
      const [numeratorRaw, denominatorRaw] = trimmed.split('/');
      const numerator = Number(numeratorRaw);
      const denominator = Number(denominatorRaw);
      if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator !== 0) {
        return numerator / denominator;
      }
    }

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (rawValue && typeof rawValue === 'object') {
    const maybeFraction = rawValue as { numerator?: unknown; denominator?: unknown };
    if (typeof maybeFraction.numerator === 'number' && typeof maybeFraction.denominator === 'number') {
      if (!Number.isFinite(maybeFraction.numerator) || !Number.isFinite(maybeFraction.denominator)) {
        return null;
      }

      if (maybeFraction.denominator === 0) {
        return null;
      }

      return maybeFraction.numerator / maybeFraction.denominator;
    }
  }

  return null;
}

function parseExifCoordinate(rawValue: unknown): number | null {
  const directValue = parseExifRational(rawValue);
  if (directValue !== null) {
    return directValue;
  }

  if (!Array.isArray(rawValue) || rawValue.length === 0) {
    return null;
  }

  const degrees = parseExifRational(rawValue[0]);
  if (degrees === null) {
    return null;
  }

  const minutes = parseExifRational(rawValue[1]) ?? 0;
  const seconds = parseExifRational(rawValue[2]) ?? 0;
  const sign = degrees < 0 ? -1 : 1;
  const absoluteDegrees = Math.abs(degrees) + minutes / 60 + seconds / 3600;
  return sign * absoluteDegrees;
}

function applyCoordinateDirection(coordinate: number, rawDirection: unknown): number {
  if (typeof rawDirection !== 'string') {
    return coordinate;
  }

  const direction = rawDirection.trim().toUpperCase();
  if (direction === 'S' || direction === 'W') {
    return -Math.abs(coordinate);
  }

  if (direction === 'N' || direction === 'E') {
    return Math.abs(coordinate);
  }

  return coordinate;
}

function extractCaptureCoordinates(asset: ImagePicker.ImagePickerAsset): PhotoCoordinates | null {
  if (!asset.exif || typeof asset.exif !== 'object') {
    return null;
  }

  const exif = asset.exif as Record<string, unknown>;
  const latitudeRaw = parseExifCoordinate(exif.GPSLatitude ?? exif.latitude ?? exif.Latitude);
  const longitudeRaw = parseExifCoordinate(exif.GPSLongitude ?? exif.longitude ?? exif.Longitude);

  if (latitudeRaw === null || longitudeRaw === null) {
    return null;
  }

  const latitude = applyCoordinateDirection(latitudeRaw, exif.GPSLatitudeRef ?? exif.LatitudeRef);
  const longitude = applyCoordinateDirection(longitudeRaw, exif.GPSLongitudeRef ?? exif.LongitudeRef);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  return { latitude, longitude };
}

function formatCoordinatesForDisplay(coordinates: PhotoCoordinates): string {
  const latitudeDirection = coordinates.latitude >= 0 ? 'N' : 'S';
  const longitudeDirection = coordinates.longitude >= 0 ? 'E' : 'W';
  const latitude = Math.abs(coordinates.latitude).toFixed(4);
  const longitude = Math.abs(coordinates.longitude).toFixed(4);
  return `${latitude}${latitudeDirection}, ${longitude}${longitudeDirection}`;
}

function normalizeSelectionLabel(value: string): string {
  return value.trim().toLowerCase();
}

function buildDefaultRestaurantForm(
  photo: DraftPhotoAsset,
  previousForm: RestaurantPhotoForm | undefined,
): RestaurantPhotoForm {
  return {
    restaurantId: previousForm?.restaurantId ?? '',
    restaurantName: previousForm?.restaurantName ?? '',
    menuItemId: '',
    menuItemName: '',
    rating: 3,
    description: '',
    notes: '',
    date: photo.captureDate ? formatDateToLocalDateString(photo.captureDate) : getTodayLocalDateString(),
  };
}

function buildPhotoUploadInput(asset: DraftPhotoAsset): VisitPhotoUploadInput {
  return {
    uri: asset.uri,
    name: asset.name,
    mimeType: asset.mimeType,
  };
}

function resolveWizardStepIndex(step: GeneralPhotoStep): number {
  if (step === 'choice') {
    return 0;
  }
  if (step === 'upload') {
    return 1;
  }
  if (step === 'process') {
    return 2;
  }
  return 3;
}

function resolveProgressSteps(processType: ProcessType | null): { label: string }[] {
  const firstLabel =
    processType === null ? 'Choose Method' : processType === 'restaurant' ? 'Restaurant Visit' : 'Quick Track';

  return [{ label: firstLabel }, ...PROGRESS_FLOW_TAIL];
}

export function PhotoProcessingScreen(screenProps: PhotoProcessingScreenProps) {
  const mode = screenProps.route.params?.mode ?? 'general';
  if (mode === 'menu_scan') {
    return <MenuScanPhotoProcessingScreen {...screenProps} />;
  }

  return <GeneralPhotoProcessingScreen {...screenProps} />;
}

function MenuScanPhotoProcessingScreen({ navigation, route }: PhotoProcessingScreenProps) {
  const theme = useTheme();
  const queryClient = useQueryClient();

  const mode = route.params?.mode ?? 'general';
  const restaurantId = route.params?.restaurantId;
  const restaurantName = route.params?.restaurantName?.trim() ?? 'this restaurant';
  const autoStartSourcePicker = route.params?.autoStartSourcePicker === true;
  const isMenuScan = mode === 'menu_scan' && Boolean(restaurantId);

  const [phase, setPhase] = useState<MenuScanPhase>('choose');
  const [isSelectingSource, setIsSelectingSource] = useState(false);
  const [selectedImageName, setSelectedImageName] = useState<string>('');
  const [progressValue, setProgressValue] = useState(0);
  const [createdItemNames, setCreatedItemNames] = useState<string[]>([]);
  const [countdownValue, setCountdownValue] = useState(5);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastRequestedSource, setLastRequestedSource] = useState<ScanSource>('gallery');
  const [permissionNeedsSettings, setPermissionNeedsSettings] = useState(false);
  const autoPromptedRef = useRef(false);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const styles = StyleSheet.create({
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

  const createScannedMenuItems = useCallback(async (itemNames: string[], fallbackLabel: string) => {
    if (!restaurantId) {
      throw new Error('Restaurant context is missing.');
    }

    const currentUserId = getAuthenticatedUserIdOrNull();
    if (!currentUserId) {
      throw new Error('Please sign in again to continue.');
    }

    const names = itemNames.length > 0 ? itemNames : buildScannedItemNames(fallbackLabel);
    const createdRecords: CreatedMenuItemRecord[] = [];

    for (const itemName of names) {
      const createdItem = await createCollectionRecord<CreatedMenuItemRecord>('menu_items', {
        restaurant: restaurantId,
        name: itemName,
        createdBy: currentUserId,
        visibility: 'friends',
        isFromOCR: true,
      });
      createdRecords.push(createdItem);
    }

    queryClient.setQueryData<CreatedMenuItemRecord[]>(
      ['feature', 'menuItems', restaurantId],
      (currentItems) => [...createdRecords, ...(currentItems ?? [])],
    );
    await queryClient.invalidateQueries({
      queryKey: ['feature', 'menuItems', restaurantId],
    });

    return createdRecords.map((record) => record.name);
  }, [queryClient, restaurantId]);

  const processSelectedImage = useCallback(async (imageName: string, imageInput: VisitPhotoUploadInput) => {
    setPhase('processing');
    setProgressValue(0);
    setErrorMessage(null);
    setCreatedItemNames([]);

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
      const createdNames = await createScannedMenuItems(parsedNames, imageName);
      setCreatedItemNames(createdNames);
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
      void queryClient.invalidateQueries({ queryKey: ['feature', 'usage', 'monthly'] });
    }
  }, [createScannedMenuItems, queryClient, startCountdown]);

  const pickImage = useCallback(async (source: ScanSource) => {
    trackObservabilityEvent('PHOTO_PROCESSING_IMAGE_PICK_STARTED', {
      photoSource: source,
      source: 'PhotoProcessingScreen',
    });
    setIsSelectingSource(true);
    setErrorMessage(null);
    setLastRequestedSource(source);
    setPermissionNeedsSettings(false);

    try {
      const permissionResult =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permissionResult.granted) {
        trackObservabilityEvent('PHOTO_PROCESSING_IMAGE_PERMISSION_DENIED', {
          canAskAgain: permissionResult.canAskAgain,
          photoSource: source,
          source: 'PhotoProcessingScreen',
        });
        setPermissionNeedsSettings(permissionResult.canAskAgain === false);
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
              quality: 0.8,
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              allowsEditing: false,
              quality: 0.8,
            });

      if (pickerResult.canceled || pickerResult.assets.length === 0) {
        trackObservabilityEvent('PHOTO_PROCESSING_IMAGE_PICK_CANCELED', {
          photoSource: source,
          source: 'PhotoProcessingScreen',
        });
        return;
      }

      const selectedAsset = pickerResult.assets[0];
      const imageLabel =
        selectedAsset.fileName?.trim() ||
        selectedAsset.uri.split('/').pop()?.trim() ||
        (source === 'camera' ? 'camera-image' : 'library-image');
      const imageInput: VisitPhotoUploadInput = {
        uri: selectedAsset.uri,
        name: imageLabel,
        mimeType: inferImageMimeType(selectedAsset.uri),
      };

      setSelectedImageName(imageLabel);
      trackObservabilityEvent('PHOTO_PROCESSING_IMAGE_PICKED', {
        photoSource: source,
        source: 'PhotoProcessingScreen',
      });
      await processSelectedImage(imageLabel, imageInput);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not select an image.';
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
  }, [processSelectedImage]);

  useEffect(() => {
    if (!isMenuScan || !autoStartSourcePicker || autoPromptedRef.current || phase !== 'choose') {
      return;
    }

    autoPromptedRef.current = true;
    Alert.alert(
      'Scan Menu Photo',
      'Choose how you want to add your menu photo.',
      [
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
      ],
    );
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
        title="Process Photos"
        subtitle="This route is reserved for the menu scanning flow."
      >
        <Card>
          <Text tone="secondary">Use “Scan Menu Photo” from Track Restaurant Visit to continue.</Text>
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
        ? 'New items were added to this restaurant.'
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
      title={menuScanTitle}
      subtitle={menuScanSubtitle}
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
            <Text tone="secondary">Take a new photo or upload an existing menu image.</Text>
            {isSelectingSource ? <Text tone="secondary" variant="bodySm">Opening source picker...</Text> : null}
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
            <Ionicons color={theme.colors.text.success} name="checkmark-circle" size={18} />
            <Text tone="success" variant="label">
              Menu scan completed
            </Text>
          </View>
          <Text tone="secondary">Added items:</Text>
          {createdItemNames.map((itemName) => (
            <View key={itemName} style={styles.addedItemRow}>
              <Ionicons color={theme.colors.text.success} name="checkmark-outline" size={14} />
              <Text>{itemName}</Text>
            </View>
          ))}
          <Text tone="secondary">
            Returning to menu items in {countdownValue} second{countdownValue === 1 ? '' : 's'}...
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
        errorMessage={phase === 'error' ? (errorMessage ?? 'Could not process this photo.') : null}
        title="Menu scan failed"
        actionLabel="Try Again"
        onAction={() => {
          setPhase('choose');
          setErrorMessage(null);
          void pickImage(lastRequestedSource);
        }}
      />

      {phase === 'error' && permissionNeedsSettings ? (
        <Card style={styles.errorCard}>
          <Text tone="danger">Camera or photo library permission is blocked in settings.</Text>
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

function GeneralPhotoProcessingScreen({ navigation }: PhotoProcessingScreenProps) {
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
  const shouldEnforceUsageLimitsClientSide = !isActualAdmin;
  const currentUserId = getAuthenticatedUserIdOrNull();
  const placesQueriesRemaining = isDisplayFreeUser
    ? monthlyUsage.snapshot?.remaining.placesQueriesMonthly ?? null
    : null;

  const [step, setStep] = useState<GeneralPhotoStep>('choice');
  const [processType, setProcessType] = useState<ProcessType | null>(null);
  const [photos, setPhotos] = useState<DraftPhotoAsset[]>([]);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [restaurantForms, setRestaurantForms] = useState<Record<string, RestaurantPhotoForm>>({});
  const [quickTrackForms, setQuickTrackForms] = useState<Record<string, QuickTrackFormValues>>({});
  const [locationMetadataHintDismissedByPhotoId, setLocationMetadataHintDismissedByPhotoId] = useState<
    Record<string, boolean>
  >({});
  const [visitVisibility, setVisitVisibility] = useState<'friends' | 'private'>(
    resolveDefaultQuickTrackVisibility(),
  );
  const [restaurantSearchQuery, setRestaurantSearchQuery] = useState('');
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [manualLocation, setManualLocation] = useState('');
  const [showNearbyPlaces, setShowNearbyPlaces] = useState(false);
  const [referenceCoords, setReferenceCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [searchResults, setSearchResults] = useState<RestaurantRecord[]>([]);
  const [nearbyResults, setNearbyResults] = useState<RestaurantRecord[]>([]);
  const [searchErrorMessage, setSearchErrorMessage] = useState<string | null>(null);
  const [isSearchingRestaurants, setIsSearchingRestaurants] = useState(false);
  const [isSearchingNearbyRestaurants, setIsSearchingNearbyRestaurants] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [locationPermissionNeedsSettings, setLocationPermissionNeedsSettings] = useState(false);
  const [isQuickTrackCategoryExpanded, setIsQuickTrackCategoryExpanded] = useState(false);
  const [menuItemSearchQuery, setMenuItemSearchQuery] = useState('');
  const [menuItemMode, setMenuItemMode] = useState<MenuItemMode>('existing');
  const [newMenuItemName, setNewMenuItemName] = useState('');
  const [isEditingMenuItemInline, setIsEditingMenuItemInline] = useState(false);
  const [editingMenuItemName, setEditingMenuItemName] = useState('');
  const [isUpdatingMenuItem, setIsUpdatingMenuItem] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSelectingSource, setIsSelectingSource] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCreatingMenuItem, setIsCreatingMenuItem] = useState(false);
  const [permissionNeedsSettings, setPermissionNeedsSettings] = useState(false);
  const [lastRequestedSource, setLastRequestedSource] = useState<ScanSource>('gallery');
  const [reviewPhotoViewerVisible, setReviewPhotoViewerVisible] = useState(false);
  const [reviewPhotoViewerUrls, setReviewPhotoViewerUrls] = useState<string[]>([]);
  const [reviewPhotoViewerInitialIndex, setReviewPhotoViewerInitialIndex] = useState(0);
  const processStepScrollViewRef = useRef<ScrollView | null>(null);

  const createVisitSearchUi = resolveCreateVisitSearchUi({
    isFreeTier: isDisplayFreeUser,
    enforceQuota: shouldEnforceUsageLimitsClientSide,
    placesQueriesRemaining,
    isOnline,
    isSearching: isSearchingRestaurants || isSearchingNearbyRestaurants || isGettingLocation,
  });
  const isPlacesQuotaReached = createVisitSearchUi.isQuotaReached;
  const compactSearchLabel = createVisitSearchUi.compactLabel;
  const expandedSearchLabel = createVisitSearchUi.expandedLabel;
  const shouldShowPlacesUpgradePrompt =
    isDisplayFreeUser &&
    typeof placesQueriesRemaining === 'number' &&
    placesQueriesRemaining <= FREE_SEARCH_WARNING_THRESHOLD;

  const currentPhoto = photos[currentPhotoIndex] ?? null;
  const currentRestaurantForm = currentPhoto ? restaurantForms[currentPhoto.id] : undefined;
  const currentQuickTrackForm = currentPhoto ? quickTrackForms[currentPhoto.id] : undefined;
  const currentRestaurantId = currentRestaurantForm?.restaurantId ?? null;

  const restaurantsQuery = useQuery<RestaurantRecord[]>({
    queryKey: ['feature', 'restaurants'],
    queryFn: listRestaurants,
    enabled: processType === 'restaurant' && (step === 'process' || step === 'review'),
  });

  const menuItemsQuery = useQuery<MenuItemRecord[]>({
    queryKey: ['feature', 'menuItems', currentRestaurantId ?? ''],
    queryFn: async () => {
      if (!currentRestaurantId) {
        return [];
      }

      if (!isOnline) {
        return queryClient.getQueryData<MenuItemRecord[]>(['feature', 'menuItems', currentRestaurantId]) ?? [];
      }

      return listCollectionRecords<MenuItemRecord>('menu_items', {
        filter: `restaurant = "${currentRestaurantId}"`,
        sort: '-created',
      });
    },
    enabled: processType === 'restaurant' && step === 'process' && Boolean(currentRestaurantId),
  });

  useEffect(() => {
    if (photos.length === 0) {
      if (step === 'process' || step === 'review') {
        setStep('upload');
      }
      setCurrentPhotoIndex(0);
      return;
    }

    if (currentPhotoIndex >= photos.length) {
      setCurrentPhotoIndex(photos.length - 1);
    }
  }, [currentPhotoIndex, photos.length, step]);

  useEffect(() => {
    if (step !== 'process' || !processType || !currentPhoto) {
      return;
    }

    if (processType === 'restaurant') {
      setRestaurantForms((current) => {
        if (current[currentPhoto.id]) {
          return current;
        }

        const previousPhoto = currentPhotoIndex > 0 ? photos[currentPhotoIndex - 1] : null;
        const previousForm = previousPhoto ? current[previousPhoto.id] : undefined;

        return {
          ...current,
          [currentPhoto.id]: buildDefaultRestaurantForm(currentPhoto, previousForm),
        };
      });
      return;
    }

    setQuickTrackForms((current) => {
      if (current[currentPhoto.id]) {
        return current;
      }

      const previousPhoto = currentPhotoIndex > 0 ? photos[currentPhotoIndex - 1] : null;
      const previousForm = previousPhoto ? current[previousPhoto.id] : undefined;

      return {
        ...current,
        [currentPhoto.id]: buildDefaultQuickTrackForm({
          captureDate: currentPhoto.captureDate,
          previousForm,
        }),
      };
    });
  }, [currentPhoto, currentPhotoIndex, photos, processType, step]);

  useEffect(() => {
    if (step === 'process' && processType === 'restaurant') {
      setMenuItemSearchQuery('');
      setNewMenuItemName('');
      setIsEditingMenuItemInline(false);
      setEditingMenuItemName('');
    }
  }, [currentPhoto?.id, processType, step]);

  useEffect(() => {
    if (step === 'process' && processType === 'restaurant') {
      setMenuItemMode('existing');
    }
  }, [currentPhoto?.id, processType, step]);

  useEffect(() => {
    if (step !== 'process' || processType !== 'quickTrack') {
      setIsQuickTrackCategoryExpanded(false);
      return;
    }

    setIsQuickTrackCategoryExpanded(false);
  }, [currentPhoto?.id, processType, step]);

  const scrollProcessStepToTop = useCallback(() => {
    processStepScrollViewRef.current?.scrollTo({
      y: 0,
      animated: false,
    });
  }, []);

  const goToProcessPhoto = useCallback(
    (nextIndex: number) => {
      Keyboard.dismiss();
      scrollProcessStepToTop();
      setCurrentPhotoIndex(nextIndex);
      setErrorMessage(null);
    },
    [scrollProcessStepToTop],
  );

  const effectiveReferenceCoords = useMemo(() => {
    if (referenceCoords) {
      return referenceCoords;
    }

    if (!currentPhoto?.captureCoordinates) {
      return null;
    }

    return {
      lat: currentPhoto.captureCoordinates.latitude,
      lng: currentPhoto.captureCoordinates.longitude,
    };
  }, [currentPhoto?.captureCoordinates, referenceCoords]);

  const displayedSavedRestaurants = useMemo(() => {
    const filtered = (restaurantsQuery.data ?? []).filter((restaurant) =>
      matchesVisitRestaurantSearch(restaurant, restaurantSearchQuery),
    );
    return prioritizeSelectedVisitRestaurant(
      withVisitRestaurantDistance(filtered, effectiveReferenceCoords),
      currentRestaurantForm?.restaurantId ?? null,
    ).slice(0, 12);
  }, [currentRestaurantForm?.restaurantId, effectiveReferenceCoords, restaurantSearchQuery, restaurantsQuery.data]);

  const displayedNearbyRestaurants = useMemo(() => {
    const combined = dedupeVisitRestaurants([...nearbyResults, ...searchResults]);
    const filtered = combined.filter((restaurant) =>
      matchesVisitRestaurantSearch(restaurant, restaurantSearchQuery),
    );
    return prioritizeSelectedVisitRestaurant(
      withVisitRestaurantDistance(filtered, effectiveReferenceCoords),
      currentRestaurantForm?.restaurantId ?? null,
    ).slice(0, 12);
  }, [
    currentRestaurantForm?.restaurantId,
    effectiveReferenceCoords,
    nearbyResults,
    restaurantSearchQuery,
    searchResults,
  ]);

  const filteredMenuItems = useMemo(() => {
    const normalizedQuery = normalizeSelectionLabel(menuItemSearchQuery);
    const menuItems = menuItemsQuery.data ?? [];
    if (!normalizedQuery) {
      return menuItems;
    }

    return menuItems.filter((item) => normalizeSelectionLabel(item.name).includes(normalizedQuery));
  }, [menuItemSearchQuery, menuItemsQuery.data]);

  const selectedMenuItem = useMemo(() => {
    const menuItems = menuItemsQuery.data ?? [];
    if (!currentRestaurantForm?.menuItemName && !currentRestaurantForm?.menuItemId) {
      return null;
    }

    return (
      menuItems.find((item) => item.id === currentRestaurantForm?.menuItemId) ??
      menuItems.find(
        (item) => normalizeSelectionLabel(item.name) === normalizeSelectionLabel(currentRestaurantForm?.menuItemName ?? ''),
      ) ??
      null
    );
  }, [currentRestaurantForm?.menuItemId, currentRestaurantForm?.menuItemName, menuItemsQuery.data]);

  const displayedMenuItems = useMemo(() => {
    const normalizedQuery = normalizeSelectionLabel(menuItemSearchQuery);
    const normalizedSelectedName = normalizeSelectionLabel(selectedMenuItem?.name ?? '');
    if (selectedMenuItem && (!normalizedQuery || normalizedQuery === normalizedSelectedName)) {
      return [selectedMenuItem];
    }

    const selected: MenuItemRecord[] = [];
    const unselected: MenuItemRecord[] = [];

    for (const item of filteredMenuItems) {
      const isSelected =
        (currentRestaurantForm?.menuItemId
          ? item.id === currentRestaurantForm.menuItemId
          : normalizeSelectionLabel(item.name) === normalizeSelectionLabel(currentRestaurantForm?.menuItemName ?? ''));

      if (isSelected) {
        selected.push(item);
      } else {
        unselected.push(item);
      }
    }

    return [...selected, ...unselected];
  }, [
    currentRestaurantForm?.menuItemId,
    currentRestaurantForm?.menuItemName,
    filteredMenuItems,
    menuItemSearchQuery,
    selectedMenuItem,
  ]);

  const selectedRestaurant = useMemo(() => {
    const selectedRestaurantId = currentRestaurantForm?.restaurantId;
    if (!selectedRestaurantId) {
      return null;
    }

    const restaurants = dedupeVisitRestaurants([...(restaurantsQuery.data ?? []), ...searchResults, ...nearbyResults]);
    return restaurants.find((restaurant) => restaurant.id === selectedRestaurantId) ?? null;
  }, [currentRestaurantForm?.restaurantId, nearbyResults, restaurantsQuery.data, searchResults]);

  const matchingMenuItemByName = useMemo(() => {
    const normalizedName = normalizeSelectionLabel(newMenuItemName);
    if (!normalizedName) {
      return null;
    }

    return (
      (menuItemsQuery.data ?? []).find((item) => normalizeSelectionLabel(item.name) === normalizedName) ?? null
    );
  }, [menuItemsQuery.data, newMenuItemName]);

  const restaurantReviewGroups = useMemo(() => {
    const groups = new Map<
      string,
      {
        restaurantName: string;
        date: string;
        items: { photo: DraftPhotoAsset; form: RestaurantPhotoForm }[];
      }
    >();

    for (const photo of photos) {
      const form = restaurantForms[photo.id];
      if (!form) {
        continue;
      }

      const key = `${form.restaurantName.trim().toLowerCase()}__${form.date}`;
      const existing =
        groups.get(key) ??
        ({
          restaurantName: form.restaurantName.trim(),
          date: form.date,
          items: [],
        } as const);

      groups.set(key, {
        ...existing,
        items: [...existing.items, { photo, form }],
      });
    }

    return Array.from(groups.values());
  }, [photos, restaurantForms]);

  const quickTrackReviewEntries = useMemo(() => {
    return photos
      .map((photo) => {
        const form = quickTrackForms[photo.id];
        if (!form) {
          return null;
        }

        return { photo, form };
      })
      .filter((entry): entry is { photo: DraftPhotoAsset; form: QuickTrackFormValues } => Boolean(entry));
  }, [photos, quickTrackForms]);

  const reviewQuickTrackCards = useMemo<ReviewQuickTrackCardData[]>(() => {
    return quickTrackReviewEntries.map((entry, index) => {
      const eventAt = entry.photo.captureDate?.toISOString() ?? localDateStringToUTC(entry.form.date);
      const locationText = entry.form.locationText.trim() || undefined;

      return {
        id: `review-quick-track-${entry.photo.id}-${index}`,
        quickTrack: {
          id: entry.photo.id,
          restaurantName: locationText ?? 'Quick Track',
          locationText,
          itemCategory: entry.form.category || undefined,
          itemName: entry.form.itemName.trim(),
          rating: entry.form.rating,
          notes: entry.form.notes.trim() || undefined,
          userId: currentUserId ?? undefined,
          userName: user?.name?.trim() || undefined,
          visibility: entry.form.visibility,
          itemDate: eventAt,
          createdAt: eventAt,
          updatedAt: eventAt,
        },
        photos: [
          {
            id: entry.photo.id,
            food_item: entry.photo.id,
            photo: entry.photo.name,
            uri: entry.photo.uri,
            created: eventAt,
          },
        ],
        entryMeta: formatReviewEntryFooterLabel(eventAt, entry.form.date),
      };
    });
  }, [currentUserId, quickTrackReviewEntries, user?.name]);

  const reviewVisitCards = useMemo<ReviewVisitCardData[]>(() => {
    return restaurantReviewGroups.map((group, groupIndex) => {
      const representativeTimestamp =
        group.items.find((entry) => entry.photo.captureDate)?.photo.captureDate?.toISOString() ?? null;
      const eventAt = representativeTimestamp ?? localDateStringToUTC(group.date);
      const footerLabel = formatReviewEntryFooterLabel(eventAt, group.date);
      const visitItems = group.items.map((entry, itemIndex) => ({
        id: `review-visit-item-${groupIndex}-${itemIndex}-${entry.photo.id}`,
        name: entry.form.menuItemName.trim(),
        rating: entry.form.rating,
        description: entry.form.description.trim() || undefined,
        notes: entry.form.notes.trim() || undefined,
      }));
      const photosByFoodItem = new Map<string, HomeFeedPhotoRecord[]>();

      group.items.forEach((entry, itemIndex) => {
        const visitItemId = visitItems[itemIndex]?.id;
        if (!visitItemId) {
          return;
        }

        photosByFoodItem.set(visitItemId, [
          {
            id: entry.photo.id,
            food_item: visitItemId,
            photo: entry.photo.name,
            uri: entry.photo.uri,
            created: entry.photo.captureDate?.toISOString() ?? eventAt,
          },
        ]);
      });

      const visit: VisitRecord = {
        id: `review-visit-${groupIndex}-${group.date}`,
        restaurantName: group.restaurantName,
        visitedAt: eventAt,
        items: visitItems,
        source: 'visit',
        userId: currentUserId ?? undefined,
        userName: user?.name?.trim() || undefined,
        visibility: visitVisibility,
        createdAt: eventAt,
        updatedAt: eventAt,
      };

      return {
        id: visit.id,
        visit,
        photosByFoodItem,
        footerLabel,
      };
    });
  }, [currentUserId, restaurantReviewGroups, user?.name, visitVisibility]);

  const openReviewPhotoViewer = useCallback(
    (reviewPhotos: HomeFeedPhotoRecord[], initialIndex = 0) => {
      const urls = reviewPhotos
        .map((photo) => photo.uri?.trim())
        .filter((value): value is string => Boolean(value));
      if (urls.length === 0) {
        return;
      }

      const boundedIndex = Math.max(0, Math.min(initialIndex, urls.length - 1));
      setReviewPhotoViewerUrls(urls);
      setReviewPhotoViewerInitialIndex(boundedIndex);
      setReviewPhotoViewerVisible(true);
    },
    [],
  );

  const closeReviewPhotoViewer = useCallback(() => {
    setReviewPhotoViewerVisible(false);
  }, []);

  const estimatedFreeMonthlyPhotoTotal = (monthlyUsage.snapshot?.usage.photoUploads ?? 0) + photos.length;
  const estimatedFreeMonthlyPhotoRemaining = Math.max(
    FREE_MONTHLY_PHOTO_LIMIT - estimatedFreeMonthlyPhotoTotal,
    0,
  );
  const shouldShowPhotoUpgradePrompt =
    isDisplayFreeUser &&
    estimatedFreeMonthlyPhotoRemaining <= FREE_MONTHLY_PHOTO_WARNING_THRESHOLD;

  const updateCurrentRestaurantForm = (updates: Partial<RestaurantPhotoForm>) => {
    if (!currentPhoto) {
      return;
    }

    setRestaurantForms((current) => {
      const currentForm = current[currentPhoto.id] ?? buildDefaultRestaurantForm(currentPhoto, undefined);
      return {
        ...current,
        [currentPhoto.id]: {
          ...currentForm,
          ...updates,
        },
      };
    });
  };

  const updateCurrentQuickTrackForm = (updates: Partial<QuickTrackFormValues>) => {
    if (!currentPhoto) {
      return;
    }

    setQuickTrackForms((current) => {
      const currentForm =
        current[currentPhoto.id] ??
        buildDefaultQuickTrackForm({
          captureDate: currentPhoto.captureDate,
        });
      return {
        ...current,
        [currentPhoto.id]: {
          ...currentForm,
          ...updates,
        },
      };
    });
  };

  const dismissCurrentPhotoLocationHint = () => {
    if (!currentPhoto?.captureCoordinates) {
      return;
    }

    setLocationMetadataHintDismissedByPhotoId((current) => {
      if (current[currentPhoto.id]) {
        return current;
      }

      return {
        ...current,
        [currentPhoto.id]: true,
      };
    });
  };

  const clearRestaurantSearchState = () => {
    setShowNearbyPlaces(false);
    setNearbyResults([]);
    setSearchResults([]);
    setSearchErrorMessage(null);
    setLocationPermissionNeedsSettings(false);
  };

  const handleSearchByText = async (collapseAfterSearch = false) => {
    if (!isOnline) {
      setSearchErrorMessage('Google Places search requires internet connection.');
      return;
    }

    if (isPlacesQuotaReached && shouldEnforceUsageLimitsClientSide) {
      trackObservabilityEvent('USAGE_LIMIT_REACHED', {
        enforcement: 'client_estimate',
        limit: monthlyUsage.snapshot?.limits.placesQueriesMonthly ?? null,
        metric: 'places_queries',
        remaining: placesQueriesRemaining,
        source: 'PhotoProcessingScreen',
        used: monthlyUsage.snapshot?.usage.placesQueries ?? null,
      });
      setSearchErrorMessage('Monthly food place search limit reached.');
      return;
    }

    const trimmedQuery = restaurantSearchQuery.trim();
    const trimmedLocation = manualLocation.trim();
    if (!trimmedQuery && !trimmedLocation) {
      setSearchErrorMessage('Enter a place name/type or a location to search.');
      return;
    }

    if (collapseAfterSearch) {
      setIsSearchExpanded(false);
    }

    setIsSearchingRestaurants(true);
    setShowNearbyPlaces(true);
    setSearchErrorMessage(null);
    setLocationPermissionNeedsSettings(false);
    dismissCurrentPhotoLocationHint();

    let didAttemptPlacesQuery = false;

    try {
      let nextReferenceCoords = effectiveReferenceCoords;
      if (trimmedLocation) {
        nextReferenceCoords = await geocodeLocation(trimmedLocation);
      }

      setReferenceCoords(nextReferenceCoords);
      didAttemptPlacesQuery = true;
      const results = await searchAndCacheRestaurantsByText({
        query: trimmedQuery || 'food',
        location: trimmedLocation || undefined,
        radius: 5000,
      });

      setSearchResults(results);
      await restaurantsQuery.refetch();
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
          : 'Could not search restaurants.';
      setSearchErrorMessage(message);
    } finally {
      setIsSearchingRestaurants(false);
      if (didAttemptPlacesQuery) {
        await queryClient.invalidateQueries({
          queryKey: ['feature', 'usage', 'monthly'],
        });
      }
    }
  };

  const handleSearchNearby = async () => {
    if (!isOnline) {
      setSearchErrorMessage('Nearby search requires internet connection.');
      return;
    }

    if (isPlacesQuotaReached && shouldEnforceUsageLimitsClientSide) {
      trackObservabilityEvent('USAGE_LIMIT_REACHED', {
        enforcement: 'client_estimate',
        limit: monthlyUsage.snapshot?.limits.placesQueriesMonthly ?? null,
        metric: 'places_queries',
        remaining: placesQueriesRemaining,
        source: 'PhotoProcessingScreen',
        used: monthlyUsage.snapshot?.usage.placesQueries ?? null,
      });
      setSearchErrorMessage('Monthly food place search limit reached.');
      return;
    }

    setShowNearbyPlaces(true);
    setSearchErrorMessage(null);
    setLocationPermissionNeedsSettings(false);
    setIsGettingLocation(true);
    dismissCurrentPhotoLocationHint();

    let didAttemptPlacesQuery = false;

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setLocationPermissionNeedsSettings(permission.canAskAgain === false);
        setSearchErrorMessage(
          permission.canAskAgain === false
            ? 'Location permission is blocked. Enable it in device settings.'
            : 'Location permission is required to find nearby places.',
        );
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const coords = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };
      setReferenceCoords(coords);

      setIsSearchingNearbyRestaurants(true);
      didAttemptPlacesQuery = true;
      const results = await searchAndCacheNearbyRestaurants({
        latitude: coords.lat,
        longitude: coords.lng,
        radius: 5000,
      });

      setNearbyResults(results);
      await restaurantsQuery.refetch();
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
          : 'Could not load nearby restaurants.';
      setSearchErrorMessage(message);
    } finally {
      setIsGettingLocation(false);
      setIsSearchingNearbyRestaurants(false);
      if (didAttemptPlacesQuery) {
        await queryClient.invalidateQueries({
          queryKey: ['feature', 'usage', 'monthly'],
        });
      }
    }
  };

  const handleSelectRestaurant = (restaurant: RestaurantRecord) => {
    const isChangingRestaurant =
      Boolean(currentRestaurantForm?.restaurantId) && currentRestaurantForm?.restaurantId !== restaurant.id;

    updateCurrentRestaurantForm({
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      ...(isChangingRestaurant
        ? {
            menuItemId: '',
            menuItemName: '',
            rating: 3,
            description: '',
            notes: '',
          }
        : {}),
    });
    setMenuItemSearchQuery('');
    setNewMenuItemName('');
    setMenuItemMode('existing');
    setIsEditingMenuItemInline(false);
    setEditingMenuItemName('');
    setErrorMessage(null);
    setSearchErrorMessage(null);
  };

  const clearSelectedMenuItem = () => {
    updateCurrentRestaurantForm({
      menuItemId: '',
      menuItemName: '',
      rating: 3,
      description: '',
      notes: '',
    });
    setMenuItemSearchQuery('');
    setNewMenuItemName('');
    setMenuItemMode('existing');
    setIsEditingMenuItemInline(false);
    setEditingMenuItemName('');
    setErrorMessage(null);
  };

  const handleSelectMenuItem = (menuItem: MenuItemRecord) => {
    const isAlreadySelected =
      currentRestaurantForm?.menuItemId === menuItem.id ||
      (!currentRestaurantForm?.menuItemId &&
        normalizeSelectionLabel(currentRestaurantForm?.menuItemName ?? '') === normalizeSelectionLabel(menuItem.name));

    if (isAlreadySelected) {
      clearSelectedMenuItem();
      return;
    }

    const isChangingMenuItem =
      currentRestaurantForm?.menuItemId !== menuItem.id &&
      normalizeSelectionLabel(currentRestaurantForm?.menuItemName ?? '') !== normalizeSelectionLabel(menuItem.name);

    updateCurrentRestaurantForm({
      menuItemId: menuItem.id,
      menuItemName: menuItem.name,
      ...(isChangingMenuItem
        ? {
            rating: 3,
            description: '',
            notes: '',
          }
        : {}),
    });
    setMenuItemSearchQuery(menuItem.name);
    setNewMenuItemName('');
    setMenuItemMode('existing');
    setIsEditingMenuItemInline(false);
    setEditingMenuItemName(menuItem.name);
    setErrorMessage(null);
  };

  const buildRestaurantSearchOption = (
    { restaurant, distance }: VisitRestaurantWithDistance,
    source: 'search' | 'saved',
  ): VisitRestaurantSearchOption => {
    const isSelected = currentRestaurantForm?.restaurantId === restaurant.id;

    return {
      description: buildVisitRestaurantDescription(restaurant, distance),
      key: `${source}-${restaurant.id}`,
      onPress: () => {
        handleSelectRestaurant(restaurant);
      },
      selected: isSelected,
      title: restaurant.name,
      trailing: <VisitRestaurantOptionTrailing restaurant={restaurant} selected={isSelected} />,
    };
  };

  const appendAssets = async (assets: ImagePicker.ImagePickerAsset[]) => {
    if (assets.length === 0) {
      return;
    }

    const resolvedAssets = await Promise.all(
      assets.map(async (asset) => ({
        asset,
        captureDate: await resolvePhotoCaptureDate(asset),
        captureCoordinates: extractCaptureCoordinates(asset),
      })),
    );

    setPhotos((current) => {
      const existingUris = new Set(current.map((photo) => photo.uri));
      const nextPhotos = [...current];
      const timestamp = Date.now();

      resolvedAssets.forEach(({ asset, captureDate, captureCoordinates }, index) => {
        if (!asset.uri || existingUris.has(asset.uri)) {
          return;
        }

        nextPhotos.push({
          id: `${timestamp}-${index}-${asset.assetId ?? index}`,
          uri: asset.uri,
          name: asset.fileName?.trim() || buildDraftPhotoName(asset.uri),
          mimeType: asset.mimeType || inferImageMimeType(asset.uri),
          captureDate,
          captureCoordinates,
        });
        existingUris.add(asset.uri);
      });

      return nextPhotos;
    });
  };

  const pickPhotos = useCallback(
    async (source: ScanSource) => {
      trackObservabilityEvent('PHOTO_PROCESSING_MULTI_PICK_STARTED', {
        photoSource: source,
        source: 'PhotoProcessingScreen',
      });
      setIsSelectingSource(true);
      setErrorMessage(null);
      setPermissionNeedsSettings(false);
      setLastRequestedSource(source);

      try {
        const permission =
          source === 'camera'
            ? await ImagePicker.requestCameraPermissionsAsync()
            : await ImagePicker.requestMediaLibraryPermissionsAsync();

        if (!permission.granted) {
          trackObservabilityEvent('PHOTO_PROCESSING_MULTI_PERMISSION_DENIED', {
            canAskAgain: permission.canAskAgain,
            photoSource: source,
            source: 'PhotoProcessingScreen',
          });
          setPermissionNeedsSettings(permission.canAskAgain === false);
          throw new Error(
            source === 'camera'
              ? 'Camera permission is required to take a photo.'
              : 'Photo library permission is required to upload images.',
          );
        }

        const pickerResult =
          source === 'camera'
            ? await ImagePicker.launchCameraAsync({
                mediaTypes: ['images'],
                allowsEditing: false,
                quality: 0.8,
                exif: true,
              })
            : await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: false,
                allowsMultipleSelection: true,
                selectionLimit: 20,
                quality: 0.8,
                exif: true,
              });

        if (pickerResult.canceled || pickerResult.assets.length === 0) {
          trackObservabilityEvent('PHOTO_PROCESSING_MULTI_PICK_CANCELED', {
            photoSource: source,
            source: 'PhotoProcessingScreen',
          });
          return;
        }

        trackObservabilityEvent('PHOTO_PROCESSING_MULTI_PICKED', {
          photoCount: pickerResult.assets.length,
          photoSource: source,
          source: 'PhotoProcessingScreen',
        });
        await appendAssets(pickerResult.assets);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not select images.';
        trackObservabilityEvent('PHOTO_PROCESSING_MULTI_PICK_FAILED', {
          errorMessage: message,
          errorType: error instanceof Error ? error.name : 'unknown_error',
          photoSource: source,
          source: 'PhotoProcessingScreen',
        });
        setErrorMessage(message);
      } finally {
        setIsSelectingSource(false);
      }
    },
    [],
  );

  const removePhoto = (photoId: string) => {
    setPhotos((current) => current.filter((photo) => photo.id !== photoId));
    setRestaurantForms((current) => {
      if (!current[photoId]) {
        return current;
      }

      const next = { ...current };
      delete next[photoId];
      return next;
    });
    setQuickTrackForms((current) => {
      if (!current[photoId]) {
        return current;
      }

      const next = { ...current };
      delete next[photoId];
      return next;
    });
    setLocationMetadataHintDismissedByPhotoId((current) => {
      if (!current[photoId]) {
        return current;
      }

      const next = { ...current };
      delete next[photoId];
      return next;
    });
  };

  const validateRestaurantForm = (form: RestaurantPhotoForm): string | null => {
    if (!form.restaurantName.trim()) {
      return 'Select a restaurant before continuing.';
    }

    if (!form.menuItemName.trim()) {
      return 'Select a menu item before continuing.';
    }

    if (form.rating < 1 || form.rating > 5) {
      return 'Rating must be between 1 and 5.';
    }

    if (!isValidLocalDate(form.date.trim())) {
      return 'Date must use YYYY-MM-DD format.';
    }

    return null;
  };

  const handleProcessNext = () => {
    if (!currentPhoto || !processType) {
      return;
    }

    const validationMessage =
      processType === 'restaurant'
        ? validateRestaurantForm(currentRestaurantForm ?? buildDefaultRestaurantForm(currentPhoto, undefined))
        : validateQuickTrackForm(
            currentQuickTrackForm ??
              buildDefaultQuickTrackForm({
                captureDate: currentPhoto.captureDate,
              }),
          );

    if (validationMessage) {
      setErrorMessage(validationMessage);
      return;
    }

    setErrorMessage(null);
    if (currentPhotoIndex < photos.length - 1) {
      goToProcessPhoto(currentPhotoIndex + 1);
      return;
    }

    setStep('review');
  };

  const handleSubmitRestaurantVisits = async () => {
    const groupedVisits = new Map<
      string,
      {
        restaurantName: string;
        date: string;
        items: { photo: DraftPhotoAsset; form: RestaurantPhotoForm }[];
      }
    >();

    for (const [index, photo] of photos.entries()) {
      const form = restaurantForms[photo.id];
      if (!form) {
        throw new Error(`Photo ${index + 1} is missing restaurant details.`);
      }

      const validationMessage = validateRestaurantForm(form);
      if (validationMessage) {
        throw new Error(`Photo ${index + 1}: ${validationMessage}`);
      }

      const key = `${form.restaurantName.trim().toLowerCase()}__${form.date}`;
      const existingVisit =
        groupedVisits.get(key) ??
        ({
          restaurantName: form.restaurantName.trim(),
          date: form.date,
          items: [],
        } as const);

      groupedVisits.set(key, {
        ...existingVisit,
        items: [...existingVisit.items, { photo, form }],
      });
    }

    for (const visitGroup of groupedVisits.values()) {
      const visitInput = {
        restaurantName: visitGroup.restaurantName,
        visitedAt: localDateStringToUTC(visitGroup.date),
        visibility: visitVisibility,
        source: 'visit',
        items: visitGroup.items.map((entry) => ({
          name: entry.form.menuItemName.trim(),
          rating: entry.form.rating,
          description: entry.form.description.trim() || undefined,
          notes: entry.form.notes.trim() || undefined,
          photos: [buildPhotoUploadInput(entry.photo)],
        })),
      } as const;

      if (!isOnline) {
        await queueFeatureOutbox('visit.create', visitInput);
        continue;
      }

      await queueWrite('visit.create');
      await createVisit(visitInput);
    }

    trackObservabilityEvent('Photo Processing Completed', {
      processType: 'restaurant',
      source: 'PhotoProcessingScreen',
      photoCount: photos.length,
      visitCount: groupedVisits.size,
    });
  };

  const handleSubmitQuickTrackItems = async () => {
    for (const [index, photo] of photos.entries()) {
      const form = quickTrackForms[photo.id];
      if (!form) {
        throw new Error(`Photo ${index + 1} is missing quick track details.`);
      }

      const validationMessage = validateQuickTrackForm(form);
      if (validationMessage) {
        throw new Error(`Photo ${index + 1}: ${validationMessage}`);
      }

      const quickTrackInput = buildCreateQuickTrackInput(form, {
        photo: buildPhotoUploadInput(photo),
      });

      if (!isOnline) {
        await queueFeatureOutbox('quick-track.create', quickTrackInput);
        continue;
      }

      await queueWrite('quick-track.create');
      await createQuickTrack(quickTrackInput);
    }

    trackObservabilityEvent('Photo Processing Completed', {
      processType: 'quickTrack',
      source: 'PhotoProcessingScreen',
      itemCount: photos.length,
    });
  };

  const handleSubmitAll = async () => {
    if (!processType) {
      return;
    }

    if (shouldEnforceUsageLimitsClientSide && isDisplayFreeUser && monthlyUsage.snapshot) {
      const estimatedTotalAfterSubmit = monthlyUsage.snapshot.usage.photoUploads + photos.length;
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
          source: 'PhotoProcessingScreen',
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
      if (processType === 'restaurant') {
        await handleSubmitRestaurantVisits();
      } else {
        await handleSubmitQuickTrackItems();
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['feature', 'visits'] }),
        queryClient.invalidateQueries({ queryKey: ['feature', 'quickTracks'] }),
        queryClient.invalidateQueries({ queryKey: ['feature', 'visitPhotos'] }),
        queryClient.invalidateQueries({ queryKey: ['feature', 'usage', 'monthly'] }),
      ]);

      if (!isOnline) {
        showQueuedOfflineAlert('Photo entries');
      }

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
          source: 'PhotoProcessingScreen',
          used: limitPayload.used,
          userTier: limitPayload.userTier ?? null,
        });
      }
      const message = limitPayload
        ? formatLimitExceededMessage(limitPayload)
        : error instanceof Error
          ? error.message
          : 'Could not process photos.';
      setErrorMessage(message);
      trackObservabilityEvent('Photo Processing Failed', {
        errorMessage: message,
        processType: processType ?? 'unknown',
        source: 'PhotoProcessingScreen',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateMenuItem = async () => {
    if (!currentRestaurantForm?.restaurantId) {
      setErrorMessage('Select a restaurant before adding a menu item.');
      return;
    }

    if (!isOnline) {
      setErrorMessage('Creating menu items requires internet connection.');
      return;
    }

    if (!currentUserId) {
      setErrorMessage('Please sign in again to continue.');
      return;
    }

    if (matchingMenuItemByName) {
      const isMatchingItemSelected =
        currentRestaurantForm?.menuItemId === matchingMenuItemByName.id ||
        (!currentRestaurantForm?.menuItemId &&
          normalizeSelectionLabel(currentRestaurantForm?.menuItemName ?? '') ===
            normalizeSelectionLabel(matchingMenuItemByName.name));

      if (isMatchingItemSelected) {
        setMenuItemMode('existing');
        setNewMenuItemName('');
        return;
      }
      handleSelectMenuItem(matchingMenuItemByName);
      return;
    }

    const menuItemName = newMenuItemName.trim();
    if (!menuItemName) {
      setErrorMessage('Enter a menu item name first.');
      return;
    }

    setErrorMessage(null);
    setIsCreatingMenuItem(true);
    try {
      const createdItem = await createCollectionRecord<MenuItemRecord>('menu_items', {
        restaurant: currentRestaurantForm.restaurantId,
        name: menuItemName,
        createdBy: currentUserId,
        visibility: 'friends',
        isFromOCR: false,
      });

      queryClient.setQueryData<MenuItemRecord[]>(
        ['feature', 'menuItems', currentRestaurantForm.restaurantId],
        (currentItems) => [createdItem, ...(currentItems ?? [])],
      );
      await queryClient.invalidateQueries({
        queryKey: ['feature', 'menuItems', currentRestaurantForm.restaurantId],
      });

      handleSelectMenuItem(createdItem);
      setMenuItemMode('existing');
      setNewMenuItemName('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not add menu item.';
      setErrorMessage(message);
    } finally {
      setIsCreatingMenuItem(false);
    }
  };

  const handleSaveInlineMenuItemEdit = async () => {
    if (!selectedMenuItem || !currentRestaurantForm?.restaurantId) {
      return;
    }

    if (!isOnline) {
      setErrorMessage('Editing menu items requires internet connection.');
      return;
    }

    const trimmedName = editingMenuItemName.trim();
    if (!trimmedName) {
      setErrorMessage('Enter a menu item name first.');
      return;
    }

    setErrorMessage(null);
    setIsUpdatingMenuItem(true);

    try {
      await updateCollectionRecord('menu_items', selectedMenuItem.id, {
        name: trimmedName,
      });

      queryClient.setQueryData<MenuItemRecord[]>(
        ['feature', 'menuItems', currentRestaurantForm.restaurantId],
        (currentItems) =>
          currentItems?.map((item) =>
            item.id === selectedMenuItem.id ? { ...item, name: trimmedName } : item,
          ) ?? currentItems,
      );
      await queryClient.invalidateQueries({
        queryKey: ['feature', 'menuItems', currentRestaurantForm.restaurantId],
      });

      setRestaurantForms((current) => {
        const next: Record<string, RestaurantPhotoForm> = {};
        for (const [photoId, form] of Object.entries(current)) {
          const matchesById = form.menuItemId === selectedMenuItem.id;
          const matchesByLegacyName =
            !form.menuItemId &&
            form.restaurantId === currentRestaurantForm.restaurantId &&
            normalizeSelectionLabel(form.menuItemName) === normalizeSelectionLabel(selectedMenuItem.name);

          next[photoId] =
            matchesById || matchesByLegacyName
              ? {
                  ...form,
                  menuItemId: selectedMenuItem.id,
                  menuItemName: trimmedName,
                }
              : form;
        }

        return next;
      });
      setMenuItemSearchQuery(trimmedName);
      setNewMenuItemName('');
      setEditingMenuItemName(trimmedName);
      setIsEditingMenuItemInline(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not update menu item.';
      setErrorMessage(message);
    } finally {
      setIsUpdatingMenuItem(false);
    }
  };

  const styles = StyleSheet.create({
    choiceContent: {
      backgroundColor: theme.colors.background.muted,
      gap: 0,
      paddingHorizontal: 0,
      paddingVertical: 0,
    },
    choiceBody: {
      flex: 1,
      gap: theme.spacing.md,
      paddingHorizontal: theme.spacing.md,
      paddingTop: theme.spacing.md,
      paddingBottom: theme.spacing.xl,
    },
    uploadCard: {
      gap: theme.spacing.sm,
    },
    photoGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.spacing.sm,
    },
    photoTile: {
      borderColor: theme.colors.border.default,
      borderRadius: theme.radii.md,
      borderWidth: 1,
      gap: theme.spacing.xs,
      overflow: 'hidden',
      width: '47%',
    },
    photoImage: {
      backgroundColor: theme.colors.background.app,
      height: 120,
      width: '100%',
    },
    photoMetaRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: theme.spacing.xs,
      justifyContent: 'space-between',
      paddingHorizontal: theme.spacing.xs,
      paddingBottom: theme.spacing.xs,
    },
    photoName: {
      flex: 1,
    },
    photoRemoveButton: {
      alignItems: 'center',
      borderColor: theme.colors.border.default,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      height: 20,
      justifyContent: 'center',
      width: 20,
    },
    photoPreviewCard: {
      gap: theme.spacing.xs,
    },
    largePhotoPreview: {
      backgroundColor: theme.colors.background.app,
      borderRadius: theme.radii.md,
      height: 220,
      width: '100%',
    },
    sectionCard: {
      gap: theme.spacing.sm,
    },
    listCard: {
      gap: theme.spacing.xs,
    },
    statusCard: {
      gap: theme.spacing.xs,
    },
    searchHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: theme.spacing.xs,
    },
    searchHeaderTitle: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: theme.spacing.xs,
    },
    searchHeaderButton: {
      alignItems: 'center',
      borderColor: theme.colors.border.default,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      flexDirection: 'row',
      gap: theme.spacing.xxs,
      paddingHorizontal: theme.spacing.xs,
      paddingVertical: theme.spacing.xxs,
    },
    row: {
      flexDirection: 'row',
      gap: theme.spacing.sm,
    },
    locationField: {
      flex: 1,
    },
    locationInput: {
      height: theme.sizes.inputMinHeight,
      minHeight: theme.sizes.inputMinHeight,
    },
    locationAction: {
      alignSelf: 'flex-end',
      minWidth: 96,
    },
    listSection: {
      gap: theme.spacing.xs,
    },
    selectedHint: {
      alignItems: 'center',
      backgroundColor: theme.colors.status.successBg,
      borderColor: theme.colors.status.successBorder,
      borderRadius: theme.radii.md,
      borderWidth: 1,
      flexDirection: 'row',
      gap: theme.spacing.xxs,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.xs,
    },
    menuModeControl: {
      marginTop: theme.spacing.xxs,
    },
    menuSearchInput: {
      marginTop: theme.spacing.xxs,
    },
    inlineEditorActions: {
      flexDirection: 'row',
      gap: theme.spacing.sm,
    },
    inlineEditorAction: {
      flex: 1,
    },
    notesInput: {
      minHeight: 96,
      textAlignVertical: 'top',
    },
    reviewFeedList: {
      gap: theme.spacing.md,
    },
    reviewCard: {
      gap: theme.spacing.sm,
    },
  });

  const errorActionLabel = permissionNeedsSettings ? 'Open Settings' : undefined;
  const errorAction = permissionNeedsSettings
    ? () => {
        void Linking.openSettings();
      }
    : undefined;
  const progressSteps = resolveProgressSteps(processType);
  const progressHeaderContent = processType ? (
    <StepProgressBar
      compact
      currentStep={resolveWizardStepIndex(step)}
      showCompletedCheckmark={false}
      steps={progressSteps}
    />
  ) : null;

  if (step === 'choice') {
    return (
      <Screen
        background="surface"
        contentStyle={styles.choiceContent}
        edges={['top']}
        padded={false}
        scroll={false}
        testID="process-photos-choice-screen"
      >
        <ScreenHeader
          onBackPress={() => {
            navigation.goBack();
          }}
          subtitle="What would you like to track?"
          title="Process Photos"
          variant="compact"
        />
        <View style={styles.choiceBody}>
          <PageErrorToast actionLabel={errorActionLabel} errorMessage={errorMessage} onAction={errorAction} />
          <StepProgressBar
            compact
            currentStep={resolveWizardStepIndex('choice')}
            showCompletedCheckmark={false}
            steps={resolveProgressSteps(null)}
          />

          <IconActionCard
            description="Track menu items from your saved photos"
            iconBackground={theme.colors.text.info}
            iconColor={theme.colors.text.inverse}
            iconName="restaurant-outline"
            onPress={() => {
              setProcessType('restaurant');
              setStep('upload');
              setPhotos([]);
              setCurrentPhotoIndex(0);
              setRestaurantForms({});
              setQuickTrackForms({});
              setLocationMetadataHintDismissedByPhotoId({});
              setRestaurantSearchQuery('');
              setManualLocation('');
              setShowNearbyPlaces(false);
              setReferenceCoords(null);
              setSearchResults([]);
              setNearbyResults([]);
              setSearchErrorMessage(null);
              setLocationPermissionNeedsSettings(false);
              setIsQuickTrackCategoryExpanded(false);
              setMenuItemSearchQuery('');
              setMenuItemMode('existing');
              setNewMenuItemName('');
              setIsEditingMenuItemInline(false);
              setEditingMenuItemName('');
              setErrorMessage(null);
            }}
            title="Restaurant Visit"
            trailing={<Ionicons color={theme.colors.text.muted} name="chevron-forward" size={20} />}
          />

          <IconActionCard
            description="Rate each photo as an individual item"
            iconBackground={theme.colors.text.success}
            iconColor={theme.colors.text.inverse}
            iconName="flash-outline"
            onPress={() => {
              setProcessType('quickTrack');
              setStep('upload');
              setPhotos([]);
              setCurrentPhotoIndex(0);
              setRestaurantForms({});
              setQuickTrackForms({});
              setLocationMetadataHintDismissedByPhotoId({});
              setRestaurantSearchQuery('');
              setManualLocation('');
              setShowNearbyPlaces(false);
              setReferenceCoords(null);
              setSearchResults([]);
              setNearbyResults([]);
              setSearchErrorMessage(null);
              setLocationPermissionNeedsSettings(false);
              setIsQuickTrackCategoryExpanded(false);
              setMenuItemSearchQuery('');
              setMenuItemMode('existing');
              setNewMenuItemName('');
              setIsEditingMenuItemInline(false);
              setEditingMenuItemName('');
              setErrorMessage(null);
            }}
            title="Quick Track Items"
            trailing={<Ionicons color={theme.colors.text.muted} name="chevron-forward" size={20} />}
          />
        </View>
      </Screen>
    );
  }

  if (step === 'upload' && processType) {
    return (
      <FeatureFormScreenScaffold
        headerBottomCompact
        headerBottomContent={progressHeaderContent}
        keyboardAware={false}
        onBackPress={() => {
          setStep('choice');
          setProcessType(null);
          setErrorMessage(null);
        }}
        primaryAction={{
          label: 'Next',
          disabled: photos.length === 0 || isSelectingSource,
          onPress: () => {
            if (photos.length === 0) {
              setErrorMessage('Please choose at least one photo.');
              return;
            }

            setCurrentPhotoIndex(0);
            setErrorMessage(null);
            setStep('process');
          },
        }}
        secondaryAction={{
          label: 'Back',
          onPress: () => {
            setStep('choice');
            setProcessType(null);
            setErrorMessage(null);
          },
        }}
        subtitle="Upload and rate multiple food photos."
        title="Process Saved Photos"
      >
        <PageErrorToast
          actionLabel={errorActionLabel}
          errorMessage={errorMessage}
          onAction={errorAction}
          title="Photo upload issue"
        />

        {shouldShowOfflineUsageWarning(isOnline, isDisplayFreeUser) ? (
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
              {monthlyUsage.snapshot
                ? `${estimatedFreeMonthlyPhotoRemaining} left`
                : 'unknown'}.
            </Text>
          </Card>
        ) : null}

        {shouldShowPhotoUpgradePrompt ? (
          <UpgradePromptCard
            description={
              estimatedFreeMonthlyPhotoRemaining <= 0
                ? "You have reached this month's free photo limit. Subscriber accounts have higher monthly limits."
                : `Only ${estimatedFreeMonthlyPhotoRemaining} photo uploads left this month. Subscriber accounts have higher monthly limits.`
            }
            title={
              estimatedFreeMonthlyPhotoRemaining <= 0
                ? 'Free limit reached'
                : 'You are close to your free limit'
            }
          />
        ) : null}

        <Card style={styles.uploadCard}>
          <Text variant="label">Choose Photo Source</Text>
          <Text tone="secondary">Take a new photo or upload multiple saved photos.</Text>
          <PhotoSourceActionCards
            cameraSubtitle="Camera"
            cameraTitle="Take Photo"
            disabled={isSelectingSource}
            gallerySubtitle="Photo Library"
            galleryTitle="Upload Images"
            onCameraPress={() => {
              void pickPhotos('camera');
            }}
            onGalleryPress={() => {
              void pickPhotos('gallery');
            }}
          />
          {isSelectingSource ? <Text tone="secondary">Opening source picker...</Text> : null}
        </Card>

        {photos.length === 0 ? (
          <Card>
            <EmptyState description="Add photos to start processing." title="No photos selected" />
          </Card>
        ) : (
          <Card style={styles.uploadCard}>
            <Text variant="label">
              {photos.length} photo{photos.length === 1 ? '' : 's'} selected
            </Text>
            <Text tone="secondary">Review your photos before continuing.</Text>
            <View style={styles.photoGrid}>
              {photos.map((photo) => (
                <View key={photo.id} style={styles.photoTile}>
                  <Image source={{ uri: photo.uri }} style={styles.photoImage} />
                  <View style={styles.photoMetaRow}>
                    <Text
                      ellipsizeMode="tail"
                      numberOfLines={1}
                      style={styles.photoName}
                      tone="secondary"
                      variant="bodySm"
                    >
                      {photo.name}
                    </Text>
                    <Pressable
                      accessibilityLabel="Remove photo"
                      accessibilityRole="button"
                      onPress={() => {
                        removePhoto(photo.id);
                      }}
                      style={styles.photoRemoveButton}
                    >
                      <Ionicons color={theme.colors.text.secondary} name="close" size={12} />
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          </Card>
        )}
      </FeatureFormScreenScaffold>
    );
  }

  if (step === 'process' && processType && currentPhoto) {
    const isLastPhoto = currentPhotoIndex === photos.length - 1;
    const captureDateValue = currentPhoto.captureDate ? formatDateToLocalDateString(currentPhoto.captureDate) : null;
    const captureCoordinatesLabel = currentPhoto.captureCoordinates
      ? formatCoordinatesForDisplay(currentPhoto.captureCoordinates)
      : null;
    const showLocationMetadataHint =
      Boolean(captureCoordinatesLabel) && !locationMetadataHintDismissedByPhotoId[currentPhoto.id];

    return (
      <FeatureFormScreenScaffold
        key={`process-photo-${processType}-${currentPhoto.id}`}
        headerBottomCompact
        headerBottomContent={progressHeaderContent}
        keyboardAware
        onBackPress={() => {
          if (currentPhotoIndex > 0) {
            goToProcessPhoto(currentPhotoIndex - 1);
            return;
          }
          Keyboard.dismiss();
          setStep('upload');
          setErrorMessage(null);
        }}
        primaryAction={{
          label: isLastPhoto ? 'Review' : 'Next Photo',
          onPress: handleProcessNext,
        }}
        scrollViewProps={{
          contentOffset: { x: 0, y: 0 },
        }}
        scrollViewRef={processStepScrollViewRef}
        secondaryAction={{
          label: currentPhotoIndex > 0 ? 'Previous' : 'Back to Upload',
          onPress: () => {
            if (currentPhotoIndex > 0) {
              goToProcessPhoto(currentPhotoIndex - 1);
              return;
            }
            Keyboard.dismiss();
            setStep('upload');
            setErrorMessage(null);
          },
          variant: 'secondary',
        }}
        subtitle={`Photo ${currentPhotoIndex + 1} of ${photos.length}`}
        title={processType === 'restaurant' ? 'Process Saved Photos' : 'Quick Track Item'}
      >
        <PageErrorToast
          actionLabel={errorActionLabel}
          errorMessage={errorMessage}
          onAction={errorAction}
          title="Photo details issue"
        />

        <Card style={styles.photoPreviewCard}>
          <Image source={{ uri: currentPhoto.uri }} style={styles.largePhotoPreview} />
        </Card>

        {processType === 'restaurant' ? (
          <>
            <VisitMetadataCard
              detectedDateValue={captureDateValue}
              dateLabel="Visit Date"
              dateModalTitle="Select visit date"
              dateValue={currentRestaurantForm?.date ?? getTodayLocalDateString()}
              onDateChange={(value) => {
                updateCurrentRestaurantForm({ date: value });
              }}
              onVisibilityChange={(value) => {
                if (value === 'friends' || value === 'private') {
                  setVisitVisibility(value);
                }
              }}
              visibilityValue={visitVisibility}
            />

            <VisitRestaurantSearchSection
              connectivityWarningMessage={
                !isOnline ? 'Google Places search requires internet connection.' : null
              }
              currentLocationDisabled={
                !isOnline ||
                isGettingLocation ||
                isSearchingNearbyRestaurants ||
                (isPlacesQuotaReached && shouldEnforceUsageLimitsClientSide)
              }
              currentLocationLoading={isGettingLocation || isSearchingNearbyRestaurants}
              headerAccessory={
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setIsSearchExpanded((currentValue) => !currentValue);
                  }}
                  style={styles.searchHeaderButton}
                  testID="process-photos-search-toggle"
                >
                  <Text tone="secondary" variant="bodySm">
                    {isSearchExpanded ? 'Collapse' : 'Expand'}
                  </Text>
                  <Ionicons
                    color={theme.colors.text.secondary}
                    name={isSearchExpanded ? 'chevron-up-outline' : 'chevron-down-outline'}
                    size={14}
                  />
                </Pressable>
              }
              locationMetadataHintText={
                showLocationMetadataHint
                  ? `Using screenshot location metadata: ${captureCoordinatesLabel}. Nearby saved restaurants are shown first.`
                  : null
              }
              locationPermissionNeedsSettings={locationPermissionNeedsSettings}
              manualLocation={manualLocation}
              onClearSearchResults={clearRestaurantSearchState}
              onManualLocationChange={(value) => {
                setManualLocation(value);
                dismissCurrentPhotoLocationHint();
              }}
              onOpenLocationSettings={() => {
                void Linking.openSettings();
              }}
              onSearchPress={() => {
                void handleSearchByText(true);
              }}
              onSearchQueryChange={(value) => {
                setRestaurantSearchQuery(value);
                dismissCurrentPhotoLocationHint();
              }}
              onUseCurrentLocationPress={() => {
                void handleSearchNearby();
              }}
              quotaWarningMessage={
                isOnline && isPlacesQuotaReached
                  ? shouldEnforceUsageLimitsClientSide
                    ? 'Monthly food place search limit reached.'
                    : 'Monthly food place search limit reached in preview mode. Admin access is still allowed.'
                  : null
              }
              savedOptions={displayedSavedRestaurants.map((restaurant) =>
                buildRestaurantSearchOption(restaurant, 'saved'),
              )}
              savedResultsErrorMessage={restaurantsQuery.isError ? 'Could not load restaurants.' : null}
              savedResultsLoading={restaurantsQuery.isLoading}
              searchButtonDisabled={createVisitSearchUi.isSearchDisabled}
              searchButtonLabel={isSearchExpanded ? expandedSearchLabel : compactSearchLabel}
              searchButtonLoading={isSearchingRestaurants}
              searchErrorMessage={searchErrorMessage}
              searchInputsMode={isSearchExpanded ? 'full' : 'compact'}
              searchQuery={restaurantSearchQuery}
              searchResultsOptions={displayedNearbyRestaurants.map((restaurant) =>
                buildRestaurantSearchOption(restaurant, 'search'),
              )}
              selectedRestaurantName={selectedRestaurant?.name ?? null}
              showSearchResults={showNearbyPlaces}
              upgradePromptDescription={
                shouldShowPlacesUpgradePrompt
                  ? isPlacesQuotaReached
                    ? "You have reached this month's free search limit. Subscriber accounts have higher limits for place search."
                    : `Only ${placesQueriesRemaining} food place searches left this month. Subscriber accounts have higher limits for place search.`
                  : null
              }
              upgradePromptTitle={
                shouldShowPlacesUpgradePrompt
                  ? isPlacesQuotaReached
                    ? 'Free limit reached'
                    : 'You are close to your free limit'
                  : null
              }
            />

            {selectedRestaurant ? (
              <Card style={styles.sectionCard}>
                <Text variant="label">Menu Item</Text>
                <Text tone="secondary" variant="bodySm">
                  Select an existing item for {selectedRestaurant.name}, or create one if it is missing.
                </Text>

                <SegmentedControl
                  containerStyle={styles.menuModeControl}
                  onChange={setMenuItemMode}
                  options={[
                    { label: 'Existing Items', value: 'existing' },
                    { label: 'Create New', value: 'create' },
                  ]}
                  value={menuItemMode}
                />

                {menuItemMode === 'existing' ? (
                  <>
                    <Input
                      autoCapitalize="words"
                      containerStyle={styles.menuSearchInput}
                      onChangeText={setMenuItemSearchQuery}
                      placeholder="Search menu items..."
                      value={menuItemSearchQuery}
                    />
                    {menuItemsQuery.isLoading ? <LoadingState label="Loading menu items..." /> : null}
                    {menuItemsQuery.isError ? <Text tone="danger">Could not load menu items.</Text> : null}
                    {!menuItemsQuery.isLoading && !menuItemsQuery.isError ? (
                      displayedMenuItems.length === 0 ? (
                        <EmptyState
                          description={
                            menuItemSearchQuery.trim()
                              ? 'No matching items found. Try another search or create a new one.'
                              : 'No menu items yet. Create one to continue.'
                          }
                          title="No menu items available"
                        />
                      ) : (
                        <View style={styles.listSection}>
                          {displayedMenuItems.map((menuItem) => {
                            const isSelected =
                              (currentRestaurantForm?.menuItemId
                                ? menuItem.id === currentRestaurantForm.menuItemId
                                : normalizeSelectionLabel(menuItem.name) ===
                                  normalizeSelectionLabel(currentRestaurantForm?.menuItemName ?? ''));
                            const isSelectedUserCreated =
                              isSelected && menuItem.createdBy === currentUserId;
                            return (
                              <View key={menuItem.id} style={styles.listSection}>
                                <VisitMenuItemOptionRow
                                  description={menuItem.description}
                                  name={menuItem.name}
                                  onEditPress={
                                    isSelectedUserCreated
                                      ? () => {
                                          const nextValue = !isEditingMenuItemInline;
                                          setIsEditingMenuItemInline(nextValue);
                                          setEditingMenuItemName(menuItem.name);
                                        }
                                      : undefined
                                  }
                                  onPress={() => {
                                    handleSelectMenuItem(menuItem);
                                  }}
                                  selected={isSelected}
                                  visibility={menuItem.visibility}
                                />
                                {isSelectedUserCreated && isEditingMenuItemInline ? (
                                  <Card style={styles.sectionCard}>
                                    <Input
                                      autoCapitalize="words"
                                      label="Edit Menu Item"
                                      onChangeText={setEditingMenuItemName}
                                      placeholder="Menu item name"
                                      value={editingMenuItemName}
                                    />
                                    <View style={styles.inlineEditorActions}>
                                      <Button
                                        disabled={!editingMenuItemName.trim() || isUpdatingMenuItem || !isOnline}
                                        label="Save"
                                        loading={isUpdatingMenuItem}
                                        onPress={() => {
                                          void handleSaveInlineMenuItemEdit();
                                        }}
                                        style={styles.inlineEditorAction}
                                      />
                                      <Button
                                        label="Cancel"
                                        onPress={() => {
                                          setIsEditingMenuItemInline(false);
                                          setEditingMenuItemName(menuItem.name);
                                          setErrorMessage(null);
                                        }}
                                        style={styles.inlineEditorAction}
                                        variant="secondary"
                                      />
                                    </View>
                                  </Card>
                                ) : null}
                              </View>
                            );
                          })}
                        </View>
                      )
                    ) : null}
                  </>
                ) : (
                  <>
                    <Input
                      autoCapitalize="words"
                      label="Menu Item Name"
                      onChangeText={setNewMenuItemName}
                      placeholder="Enter a menu item name"
                      value={newMenuItemName}
                    />
                    {matchingMenuItemByName ? (
                      <Text tone="secondary" variant="bodySm">
                        That menu item already exists for this restaurant. Select it instead of creating a duplicate.
                      </Text>
                    ) : null}
                    {!isOnline && !matchingMenuItemByName ? (
                      <Text tone="warning">You are offline. Connect to create a new menu item.</Text>
                    ) : null}
                    <Button
                      disabled={
                        !newMenuItemName.trim() ||
                        isCreatingMenuItem ||
                        (!isOnline && !matchingMenuItemByName)
                      }
                      label={
                        matchingMenuItemByName
                          ? 'Select Existing Item'
                          : isCreatingMenuItem
                            ? 'Creating...'
                            : 'Create Menu Item'
                      }
                      loading={isCreatingMenuItem}
                      onPress={() => {
                        void handleCreateMenuItem();
                      }}
                    />
                  </>
                )}
              </Card>
            ) : null}

            {currentRestaurantForm?.menuItemName.trim() ? (
              <>
                <RatingLegend initiallyExpanded />
                <Card style={styles.sectionCard}>
                  <Text variant="label">{currentRestaurantForm.menuItemName}</Text>
                  <RatingSelector
                    onChange={(value) => {
                      updateCurrentRestaurantForm({ rating: value });
                    }}
                    value={currentRestaurantForm?.rating ?? 3}
                  />
                  <Input
                    label="Description"
                    onChangeText={(value) => {
                      updateCurrentRestaurantForm({ description: value });
                    }}
                    placeholder="Optional description or modification"
                    value={currentRestaurantForm?.description ?? ''}
                  />
                  <Input
                    inputStyle={styles.notesInput}
                    label="Notes"
                    multiline
                    onChangeText={(value) => {
                      updateCurrentRestaurantForm({ notes: value });
                    }}
                    placeholder="Optional notes"
                    value={currentRestaurantForm?.notes ?? ''}
                  />
                </Card>
              </>
            ) : null}
          </>
        ) : (
          <>
            <QuickTrackFormFields
              detectedDateValue={captureDateValue}
              isCategoryExpanded={isQuickTrackCategoryExpanded}
              onCategoryExpandedChange={setIsQuickTrackCategoryExpanded}
              onChange={updateCurrentQuickTrackForm}
              value={
                currentQuickTrackForm ??
                buildDefaultQuickTrackForm({
                  captureDate: currentPhoto.captureDate,
                })
              }
            />
          </>
        )}
      </FeatureFormScreenScaffold>
    );
  }

  if (step === 'review' && processType) {
    return (
      <FeatureFormScreenScaffold
        headerBottomCompact
        headerBottomContent={progressHeaderContent}
        keyboardAware={false}
        onBackPress={() => {
          setStep('process');
          setCurrentPhotoIndex(Math.max(photos.length - 1, 0));
          setErrorMessage(null);
        }}
        primaryAction={{
          label: processType === 'restaurant' ? 'Submit Visits' : 'Save All Items',
          disabled: isSubmitting,
          loading: isSubmitting,
          onPress: () => {
            void handleSubmitAll();
          },
        }}
        secondaryAction={{
          label: 'Edit',
          onPress: () => {
            setStep('process');
            setCurrentPhotoIndex(Math.max(photos.length - 1, 0));
            setErrorMessage(null);
          },
          variant: 'secondary',
        }}
        subtitle={
          processType === 'restaurant'
            ? `${restaurantReviewGroups.length} visit${restaurantReviewGroups.length === 1 ? '' : 's'} • ${photos.length} item${photos.length === 1 ? '' : 's'}`
            : `${quickTrackReviewEntries.length} item${quickTrackReviewEntries.length === 1 ? '' : 's'} ready to save`
        }
        title={processType === 'restaurant' ? 'Review Your Visits' : 'Review Quick Track Items'}
      >
        <PageErrorToast errorMessage={errorMessage} title="Review issue" />

        {shouldShowOfflineUsageWarning(isOnline, isDisplayFreeUser) ? (
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
              {monthlyUsage.snapshot
                ? `${estimatedFreeMonthlyPhotoRemaining} left`
                : 'unknown'}.
            </Text>
          </Card>
        ) : null}

        {shouldShowPhotoUpgradePrompt ? (
          <UpgradePromptCard
            description={
              estimatedFreeMonthlyPhotoRemaining <= 0
                ? "You have reached this month's free photo limit. Subscriber accounts have higher monthly limits."
                : `Only ${estimatedFreeMonthlyPhotoRemaining} photo uploads left this month. Subscriber accounts have higher monthly limits.`
            }
            title={
              estimatedFreeMonthlyPhotoRemaining <= 0
                ? 'Free limit reached'
                : 'You are close to your free limit'
            }
          />
        ) : null}

        {processType === 'restaurant' ? (
          <>
            <Card style={styles.reviewCard}>
              <Text variant="label">Visit Visibility</Text>
              <Text tone="secondary">{visitVisibility === 'private' ? 'Private' : 'Friends'}</Text>
            </Card>

            <View style={styles.reviewFeedList}>
              {reviewVisitCards.map((reviewVisitCard) => (
                <HomeFeedVisitEntryCard
                  footerLabel={reviewVisitCard.footerLabel}
                  getPhotosForItem={(itemId) => reviewVisitCard.photosByFoodItem.get(itemId) ?? []}
                  key={reviewVisitCard.id}
                  onOpenPhotoViewer={openReviewPhotoViewer}
                  visit={reviewVisitCard.visit}
                />
              ))}
            </View>
          </>
        ) : (
          reviewQuickTrackCards.map((entry) => (
            <HomeQuickTrackEntryCard
              entryMeta={entry.entryMeta}
              key={entry.id}
              onOpenPhotoViewer={openReviewPhotoViewer}
              photos={entry.photos}
              quickTrack={entry.quickTrack}
            />
          ))
        )}

        <PhotoViewerModal
          initialIndex={reviewPhotoViewerInitialIndex}
          onRequestClose={closeReviewPhotoViewer}
          urls={reviewPhotoViewerUrls}
          visible={reviewPhotoViewerVisible}
        />
      </FeatureFormScreenScaffold>
    );
  }

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
      title="Process Photos"
      subtitle="This route is not ready yet."
    >
      <Card>
        <Text tone="secondary">Start from Add tab to begin processing photos.</Text>
      </Card>
      <PageErrorToast errorMessage={errorMessage} title="Process photos issue" />
      {permissionNeedsSettings ? (
        <Button
          label="Open Settings"
          onPress={() => {
            void Linking.openSettings();
          }}
          variant="secondary"
        />
      ) : null}
      <Button
        label="Retry Last Source"
        onPress={() => {
          void pickPhotos(lastRequestedSource);
        }}
        variant="secondary"
      />
    </FeatureFormScreenScaffold>
  );
}
