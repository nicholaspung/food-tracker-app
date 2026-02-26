import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, Linking, Pressable, StyleSheet, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  EmptyState,
  FeatureFormScreenScaffold,
  LinearProgressBar,
  PageErrorToast,
  PhotoSourceActionCards,
  RatingLegend,
  RatingSelector,
  ScreenHeader,
  StepProgressBar,
  UpgradePromptCard,
  VisibilityOptionSelector,
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
  resolveDefaultVisitVisibilityFromAuth,
  useMonthlyUsage,
  type RestaurantRecord,
  type VisitPhotoUploadInput,
} from '../features';
import { useFeatureOutboxQueue } from '../features/store/useFeatureOutboxQueue';
import { useQueuedWrite } from '../features/store/useQueuedWrite';
import { calculateDistance, formatDistance } from '../lib/googlePlaces';
import { showQueuedOfflineAlert } from '../lib/offlineAlerts';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { shouldShowOfflineUsageWarning } from './usageUiRules';
import { useTheme } from '../theme';
import { Button, Card, Input, ListItem, Screen, Text } from '../ui';

type PhotoProcessingScreenProps = NativeStackScreenProps<RootStackParamList, 'ProcessPhotos'>;
type ScanSource = 'camera' | 'gallery';
type MenuScanPhase = 'choose' | 'processing' | 'success' | 'error';
type ProcessType = 'restaurant' | 'quickTrack';
type GeneralPhotoStep = 'choice' | 'upload' | 'process' | 'review';
type QuickTrackCategory = 'convenience_store' | 'packaged_food' | 'homemade' | 'recipe' | 'other';

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
  menuItemName: string;
  rating: number;
  notes: string;
  date: string;
}

interface QuickTrackPhotoForm {
  itemName: string;
  category: QuickTrackCategory | '';
  rating: number;
  locationText: string;
  notes: string;
  visibility: 'friends' | 'private';
  date: string;
}

interface MenuItemRecord {
  id: string;
  restaurant: string;
  name: string;
  description?: string;
}

interface CreatedMenuItemRecord {
  id: string;
  name: string;
}

const PROGRESS_FLOW_TAIL: { label: string }[] = [{ label: 'Upload' }, { label: 'Process' }, { label: 'Review' }];
const QUICK_TRACK_CATEGORIES: { value: QuickTrackCategory; label: string }[] = [
  { value: 'convenience_store', label: 'Convenience Store' },
  { value: 'packaged_food', label: 'Packaged Food' },
  { value: 'homemade', label: 'Homemade' },
  { value: 'recipe', label: 'Recipe' },
  { value: 'other', label: 'Other' },
];
const FREE_MONTHLY_PHOTO_LIMIT = 5;
const FREE_MONTHLY_PHOTO_WARNING_THRESHOLD = 1;

function buildScannedItemNames(seedLabel: string): string[] {
  const normalized = seedLabel.replace(/\.[^/.]+$/, '').trim();
  const base = normalized || 'Scanned Item';
  return [`${base} #1`, `${base} #2`, `${base} #3`];
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

function formatDateToLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getTodayLocalDateString(): string {
  return formatDateToLocalDateString(new Date());
}

function localDateStringToUTC(localDateString: string): string {
  return new Date(`${localDateString}T00:00:00`).toISOString();
}

function isValidLocalDate(localDateString: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDateString)) {
    return false;
  }

  const parsedDate = new Date(`${localDateString}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) {
    return false;
  }

  return parsedDate.toISOString().slice(0, 10) === localDateString;
}

function formatReviewDate(localDateString: string): string {
  const parsedDate = new Date(`${localDateString}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) {
    return localDateString;
  }

  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(parsedDate);
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

function parseExifDate(rawValue: unknown): Date | null {
  if (typeof rawValue !== 'string' || !rawValue.trim()) {
    return null;
  }

  const normalized = rawValue.trim().replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
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

function buildRestaurantDescription(restaurant: RestaurantRecord, distanceMiles: number | null): string {
  const parts = [restaurant.location, restaurant.cuisineType].filter(Boolean);
  if (distanceMiles !== null) {
    parts.push(`${formatDistance(distanceMiles)} away`);
  }

  return parts.join(' • ') || 'Restaurant';
}

function extractCaptureDate(asset: ImagePicker.ImagePickerAsset): Date | null {
  const creationTime = (asset as ImagePicker.ImagePickerAsset & { creationTime?: number }).creationTime;
  if (typeof creationTime === 'number' && Number.isFinite(creationTime)) {
    const parsed = new Date(creationTime);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  if (asset.exif && typeof asset.exif === 'object') {
    const exif = asset.exif as Record<string, unknown>;
    const exifDate =
      parseExifDate(exif.DateTimeOriginal) ??
      parseExifDate(exif.DateTimeDigitized) ??
      parseExifDate(exif.DateTime);
    if (exifDate) {
      return exifDate;
    }
  }

  return null;
}

function resolveDefaultQuickTrackVisibility(): 'friends' | 'private' {
  return resolveDefaultVisitVisibilityFromAuth();
}

function buildDefaultRestaurantForm(
  photo: DraftPhotoAsset,
  previousForm: RestaurantPhotoForm | undefined,
): RestaurantPhotoForm {
  return {
    restaurantId: previousForm?.restaurantId ?? '',
    restaurantName: previousForm?.restaurantName ?? '',
    menuItemName: '',
    rating: 3,
    notes: '',
    date: photo.captureDate ? formatDateToLocalDateString(photo.captureDate) : getTodayLocalDateString(),
  };
}

function buildDefaultQuickTrackForm(
  photo: DraftPhotoAsset,
  previousForm: QuickTrackPhotoForm | undefined,
): QuickTrackPhotoForm {
  return {
    itemName: '',
    category: previousForm?.category ?? '',
    rating: 3,
    locationText: previousForm?.locationText ?? '',
    notes: '',
    visibility: previousForm?.visibility ?? resolveDefaultQuickTrackVisibility(),
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

  const [step, setStep] = useState<GeneralPhotoStep>('choice');
  const [processType, setProcessType] = useState<ProcessType | null>(null);
  const [photos, setPhotos] = useState<DraftPhotoAsset[]>([]);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [restaurantForms, setRestaurantForms] = useState<Record<string, RestaurantPhotoForm>>({});
  const [quickTrackForms, setQuickTrackForms] = useState<Record<string, QuickTrackPhotoForm>>({});
  const [dateMetadataHintDismissedByPhotoId, setDateMetadataHintDismissedByPhotoId] = useState<
    Record<string, boolean>
  >({});
  const [locationMetadataHintDismissedByPhotoId, setLocationMetadataHintDismissedByPhotoId] = useState<
    Record<string, boolean>
  >({});
  const [visitVisibility, setVisitVisibility] = useState<'friends' | 'private'>(
    resolveDefaultQuickTrackVisibility(),
  );
  const [restaurantSearchQuery, setRestaurantSearchQuery] = useState('');
  const [menuItemSearchQuery, setMenuItemSearchQuery] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSelectingSource, setIsSelectingSource] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCreatingMenuItem, setIsCreatingMenuItem] = useState(false);
  const [permissionNeedsSettings, setPermissionNeedsSettings] = useState(false);
  const [lastRequestedSource, setLastRequestedSource] = useState<ScanSource>('gallery');

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
        [currentPhoto.id]: buildDefaultQuickTrackForm(currentPhoto, previousForm),
      };
    });
  }, [currentPhoto, currentPhotoIndex, photos, processType, step]);

  useEffect(() => {
    if (step === 'process' && processType === 'restaurant') {
      setMenuItemSearchQuery(currentRestaurantForm?.menuItemName ?? '');
    }
  }, [currentPhoto?.id, currentRestaurantForm?.menuItemName, processType, step]);

  const filteredRestaurants = useMemo(() => {
    const normalizedQuery = restaurantSearchQuery.trim().toLowerCase();
    const photoCoordinates = currentPhoto?.captureCoordinates ?? null;
    const restaurants = restaurantsQuery.data ?? [];
    const rankedRestaurants = restaurants.map((restaurant) => {
      if (
        !photoCoordinates ||
        typeof restaurant.latitude !== 'number' ||
        typeof restaurant.longitude !== 'number'
      ) {
        return { restaurant, distanceMiles: null };
      }

      return {
        restaurant,
        distanceMiles: calculateDistance(
          photoCoordinates.latitude,
          photoCoordinates.longitude,
          restaurant.latitude,
          restaurant.longitude,
        ),
      };
    });

    return rankedRestaurants
      .filter(({ restaurant }) => {
        if (!normalizedQuery) {
          return true;
        }

        const matchesName = restaurant.name.toLowerCase().includes(normalizedQuery);
        const matchesLocation = (restaurant.location ?? '').toLowerCase().includes(normalizedQuery);
        const matchesCuisine = (restaurant.cuisineType ?? '').toLowerCase().includes(normalizedQuery);
        return matchesName || matchesLocation || matchesCuisine;
      })
      .sort((left, right) => {
        if (left.distanceMiles === null && right.distanceMiles === null) {
          return left.restaurant.name.localeCompare(right.restaurant.name);
        }

        if (left.distanceMiles === null) {
          return 1;
        }

        if (right.distanceMiles === null) {
          return -1;
        }

        if (left.distanceMiles === right.distanceMiles) {
          return left.restaurant.name.localeCompare(right.restaurant.name);
        }

        return left.distanceMiles - right.distanceMiles;
      })
      .slice(0, 12);
  }, [currentPhoto?.captureCoordinates, restaurantSearchQuery, restaurantsQuery.data]);

  const filteredMenuItems = useMemo(() => {
    const normalizedQuery = menuItemSearchQuery.trim().toLowerCase();
    const menuItems = menuItemsQuery.data ?? [];
    if (!normalizedQuery) {
      return menuItems.slice(0, 10);
    }

    return menuItems.filter((item) => item.name.toLowerCase().includes(normalizedQuery)).slice(0, 10);
  }, [menuItemSearchQuery, menuItemsQuery.data]);

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
      .filter((entry): entry is { photo: DraftPhotoAsset; form: QuickTrackPhotoForm } => Boolean(entry));
  }, [photos, quickTrackForms]);

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

  const updateCurrentQuickTrackForm = (updates: Partial<QuickTrackPhotoForm>) => {
    if (!currentPhoto) {
      return;
    }

    setQuickTrackForms((current) => {
      const currentForm = current[currentPhoto.id] ?? buildDefaultQuickTrackForm(currentPhoto, undefined);
      return {
        ...current,
        [currentPhoto.id]: {
          ...currentForm,
          ...updates,
        },
      };
    });
  };

  const appendAssets = (assets: ImagePicker.ImagePickerAsset[]) => {
    if (assets.length === 0) {
      return;
    }

    setPhotos((current) => {
      const existingUris = new Set(current.map((photo) => photo.uri));
      const nextPhotos = [...current];
      const timestamp = Date.now();

      assets.forEach((asset, index) => {
        if (!asset.uri || existingUris.has(asset.uri)) {
          return;
        }

        nextPhotos.push({
          id: `${timestamp}-${index}-${asset.assetId ?? index}`,
          uri: asset.uri,
          name: asset.fileName?.trim() || buildDraftPhotoName(asset.uri),
          mimeType: asset.mimeType || inferImageMimeType(asset.uri),
          captureDate: extractCaptureDate(asset),
          captureCoordinates: extractCaptureCoordinates(asset),
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
        appendAssets(pickerResult.assets);
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
    setDateMetadataHintDismissedByPhotoId((current) => {
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
      return 'Enter a menu item name before continuing.';
    }

    if (form.rating < 1 || form.rating > 5) {
      return 'Rating must be between 1 and 5.';
    }

    if (!isValidLocalDate(form.date.trim())) {
      return 'Date must use YYYY-MM-DD format.';
    }

    return null;
  };

  const validateQuickTrackForm = (form: QuickTrackPhotoForm): string | null => {
    if (!form.itemName.trim()) {
      return 'Item name is required.';
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
        : validateQuickTrackForm(currentQuickTrackForm ?? buildDefaultQuickTrackForm(currentPhoto, undefined));

    if (validationMessage) {
      setErrorMessage(validationMessage);
      return;
    }

    setErrorMessage(null);
    if (currentPhotoIndex < photos.length - 1) {
      setCurrentPhotoIndex((index) => index + 1);
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

      const quickTrackInput = {
        itemName: form.itemName.trim(),
        rating: form.rating,
        itemCategory: form.category || undefined,
        notes: form.notes.trim() || undefined,
        locationText: form.locationText.trim() || undefined,
        visibility: form.visibility,
        itemDate: localDateStringToUTC(form.date),
        photo: buildPhotoUploadInput(photo),
      };

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

  const createMenuItem = async () => {
    if (!currentRestaurantForm?.restaurantId) {
      setErrorMessage('Select a restaurant before adding a menu item.');
      return;
    }

    if (!isOnline) {
      setErrorMessage('Creating menu items requires internet connection.');
      return;
    }

    const currentUserId = getAuthenticatedUserIdOrNull();
    if (!currentUserId) {
      setErrorMessage('Please sign in again to continue.');
      return;
    }

    const menuItemName = menuItemSearchQuery.trim() || currentRestaurantForm.menuItemName.trim();
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

      updateCurrentRestaurantForm({
        menuItemName: createdItem.name,
      });
      setMenuItemSearchQuery(createdItem.name);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not add menu item.';
      setErrorMessage(message);
    } finally {
      setIsCreatingMenuItem(false);
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
    choiceCard: {
      gap: theme.spacing.xs,
    },
    choiceCardRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: theme.spacing.sm,
    },
    choiceTextWrap: {
      flex: 1,
    },
    choiceIconWrap: {
      alignItems: 'center',
      borderRadius: theme.radii.md,
      height: 42,
      justifyContent: 'center',
      width: 42,
    },
    choiceChevronWrap: {
      alignSelf: 'flex-start',
      alignItems: 'center',
      height: 24,
      justifyContent: 'center',
      marginLeft: 'auto',
      marginTop: 2,
      width: 24,
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
    menuSuggestionTitle: {
      marginTop: theme.spacing.xxs,
    },
    createMenuItemButton: {
      alignItems: 'center',
      alignSelf: 'flex-start',
      borderColor: theme.colors.border.default,
      borderRadius: theme.radii.md,
      borderWidth: 1,
      flexDirection: 'row',
      gap: theme.spacing.xs,
      minHeight: theme.sizes.secondaryButtonHeight,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.xs,
    },
    metadataActionButton: {
      alignSelf: 'flex-start',
    },
    notesInput: {
      minHeight: 96,
      textAlignVertical: 'top',
    },
    categoryWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.spacing.xs,
    },
    categoryChip: {
      borderColor: theme.colors.border.default,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.xs,
    },
    categoryChipSelected: {
      backgroundColor: theme.colors.status.infoBg,
      borderColor: theme.colors.status.infoBorder,
    },
    reviewCard: {
      gap: theme.spacing.sm,
    },
    reviewItemRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: theme.spacing.sm,
    },
    reviewThumb: {
      borderRadius: theme.radii.sm,
      height: 48,
      width: 48,
    },
    reviewTextWrap: {
      flex: 1,
      gap: 2,
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

          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setProcessType('restaurant');
              setStep('upload');
              setPhotos([]);
              setCurrentPhotoIndex(0);
              setRestaurantForms({});
              setQuickTrackForms({});
              setDateMetadataHintDismissedByPhotoId({});
              setLocationMetadataHintDismissedByPhotoId({});
              setErrorMessage(null);
            }}
          >
            <Card style={styles.choiceCard}>
              <View style={styles.choiceCardRow}>
                <View style={[styles.choiceIconWrap, { backgroundColor: theme.colors.text.info }]}>
                  <Ionicons color={theme.colors.text.inverse} name="restaurant-outline" size={20} />
                </View>
                <View style={styles.choiceTextWrap}>
                  <Text variant="label">Restaurant Visit</Text>
                  <Text tone="secondary">Track menu items from your saved photos</Text>
                </View>
                <View style={styles.choiceChevronWrap}>
                  <Ionicons color={theme.colors.text.muted} name="chevron-forward" size={20} />
                </View>
              </View>
            </Card>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setProcessType('quickTrack');
              setStep('upload');
              setPhotos([]);
              setCurrentPhotoIndex(0);
              setRestaurantForms({});
              setQuickTrackForms({});
              setDateMetadataHintDismissedByPhotoId({});
              setLocationMetadataHintDismissedByPhotoId({});
              setErrorMessage(null);
            }}
          >
            <Card style={styles.choiceCard}>
              <View style={styles.choiceCardRow}>
                <View style={[styles.choiceIconWrap, { backgroundColor: theme.colors.text.success }]}>
                  <Ionicons color={theme.colors.text.inverse} name="flash-outline" size={20} />
                </View>
                <View style={styles.choiceTextWrap}>
                  <Text variant="label">Quick Track Items</Text>
                  <Text tone="secondary">Rate each photo as an individual item</Text>
                </View>
                <View style={styles.choiceChevronWrap}>
                  <Ionicons color={theme.colors.text.muted} name="chevron-forward" size={20} />
                </View>
              </View>
            </Card>
          </Pressable>
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
                ? "You have reached this month's free photo limit. Subscribe for higher monthly limits."
                : `Only ${estimatedFreeMonthlyPhotoRemaining} photo uploads left this month. Subscribe for higher limits.`
            }
            onPrimaryAction={() => {
              navigation.navigate('Billing');
            }}
            onSecondaryAction={() => {
              navigation.navigate('Billing');
            }}
            primaryActionLabel={estimatedFreeMonthlyPhotoRemaining <= 0 ? 'Subscribe now' : 'Upgrade'}
            secondaryActionLabel="Compare plans"
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
                      style={{ flex: 1 }}
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
    const captureDateLabel = currentPhoto.captureDate
      ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(currentPhoto.captureDate)
      : null;
    const captureDateValue = currentPhoto.captureDate ? formatDateToLocalDateString(currentPhoto.captureDate) : null;
    const captureCoordinatesLabel = currentPhoto.captureCoordinates
      ? formatCoordinatesForDisplay(currentPhoto.captureCoordinates)
      : null;
    const showDateMetadataHint =
      Boolean(captureDateValue) && !dateMetadataHintDismissedByPhotoId[currentPhoto.id];
    const showLocationMetadataHint =
      Boolean(captureCoordinatesLabel) && !locationMetadataHintDismissedByPhotoId[currentPhoto.id];
    const selectedRestaurant = (restaurantsQuery.data ?? []).find(
      (restaurant) => restaurant.id === currentRestaurantForm?.restaurantId,
    );
    const hasMatchingMenuItem = (menuItemsQuery.data ?? []).some(
      (item) => item.name.trim().toLowerCase() === menuItemSearchQuery.trim().toLowerCase(),
    );

    return (
      <FeatureFormScreenScaffold
        headerBottomCompact
        headerBottomContent={progressHeaderContent}
        keyboardAware
        onBackPress={() => {
          if (currentPhotoIndex > 0) {
            setCurrentPhotoIndex((index) => index - 1);
            setErrorMessage(null);
            return;
          }
          setStep('upload');
          setErrorMessage(null);
        }}
        primaryAction={{
          label: isLastPhoto ? 'Review' : 'Next Photo',
          onPress: handleProcessNext,
        }}
        secondaryAction={{
          label: currentPhotoIndex > 0 ? 'Previous' : 'Back to Upload',
          onPress: () => {
            if (currentPhotoIndex > 0) {
              setCurrentPhotoIndex((index) => index - 1);
              setErrorMessage(null);
              return;
            }
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
          <Text tone="secondary" variant="bodySm">
            {currentPhoto.name}
          </Text>
          {captureDateLabel ? (
            <Text tone="secondary" variant="bodySm">
              Captured: {captureDateLabel}
            </Text>
          ) : null}
        </Card>

        {processType === 'restaurant' ? (
          <>
            <Card style={styles.sectionCard}>
              <Text variant="label">Restaurant</Text>
              {showLocationMetadataHint ? (
                <Text tone="info" variant="bodySm">
                  Location data grabbed from image metadata: {captureCoordinatesLabel}. Nearby restaurants are shown
                  first.
                </Text>
              ) : null}
              <Input
                autoCapitalize="words"
                onChangeText={(value) => {
                  setRestaurantSearchQuery(value);
                  if (currentPhoto.captureCoordinates) {
                    setLocationMetadataHintDismissedByPhotoId((current) => {
                      if (current[currentPhoto.id]) {
                        return current;
                      }
                      return {
                        ...current,
                        [currentPhoto.id]: true,
                      };
                    });
                  }
                }}
                placeholder="Search restaurants..."
                value={restaurantSearchQuery}
              />
              {selectedRestaurant ? (
                <View style={styles.selectedHint}>
                  <Ionicons color={theme.colors.text.success} name="checkmark-circle" size={15} />
                  <Text tone="success">Selected: {selectedRestaurant.name}</Text>
                </View>
              ) : null}
              {restaurantsQuery.isLoading ? <Text tone="secondary">Loading restaurants...</Text> : null}
              {restaurantsQuery.isError ? <Text tone="danger">Could not load restaurants.</Text> : null}
              <View style={styles.listSection}>
                {filteredRestaurants.map(({ restaurant, distanceMiles }) => {
                  const description = buildRestaurantDescription(restaurant, distanceMiles);
                  const isSelected = currentRestaurantForm?.restaurantId === restaurant.id;
                  return (
                    <ListItem
                      description={description}
                      key={restaurant.id}
                      onPress={() => {
                        updateCurrentRestaurantForm({
                          restaurantId: restaurant.id,
                          restaurantName: restaurant.name,
                        });
                        setMenuItemSearchQuery('');
                        setErrorMessage(null);
                      }}
                      style={
                        isSelected
                          ? {
                              backgroundColor: theme.colors.status.successBg,
                              borderColor: theme.colors.status.successBorder,
                            }
                          : undefined
                      }
                      title={restaurant.name}
                      trailing={
                        isSelected ? (
                          <Ionicons color={theme.colors.text.success} name="checkmark-circle" size={18} />
                        ) : undefined
                      }
                    />
                  );
                })}
              </View>
              {!restaurantsQuery.isLoading && filteredRestaurants.length === 0 ? (
                <Text tone="secondary">No restaurants found for that search.</Text>
              ) : null}
            </Card>

            <Card style={styles.sectionCard}>
              <Text variant="label">Menu Item</Text>
              <Input
                autoCapitalize="words"
                label="Item name"
                onChangeText={(value) => {
                  updateCurrentRestaurantForm({ menuItemName: value });
                  setMenuItemSearchQuery(value);
                }}
                placeholder="Enter or select item name"
                value={currentRestaurantForm?.menuItemName ?? ''}
              />
              <Text style={styles.menuSuggestionTitle} tone="secondary" variant="bodySm">
                Suggestions
              </Text>
              {menuItemsQuery.isLoading ? <Text tone="secondary">Loading menu items...</Text> : null}
              {menuItemsQuery.isError ? <Text tone="danger">Could not load menu items.</Text> : null}
              <View style={styles.listSection}>
                {filteredMenuItems.map((menuItem) => {
                  const isSelected = menuItem.name === (currentRestaurantForm?.menuItemName ?? '');
                  return (
                    <ListItem
                      description={menuItem.description || 'Menu item'}
                      key={menuItem.id}
                      onPress={() => {
                        updateCurrentRestaurantForm({ menuItemName: menuItem.name });
                        setMenuItemSearchQuery(menuItem.name);
                        setErrorMessage(null);
                      }}
                      style={
                        isSelected
                          ? {
                              backgroundColor: theme.colors.status.successBg,
                              borderColor: theme.colors.status.successBorder,
                            }
                          : undefined
                      }
                      title={menuItem.name}
                      trailing={
                        isSelected ? (
                          <Ionicons color={theme.colors.text.success} name="checkmark-circle" size={18} />
                        ) : undefined
                      }
                    />
                  );
                })}
              </View>
              {currentRestaurantForm?.restaurantId &&
              menuItemSearchQuery.trim() &&
              !hasMatchingMenuItem &&
              isOnline ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={isCreatingMenuItem}
                  onPress={() => {
                    void createMenuItem();
                  }}
                  style={[styles.createMenuItemButton, isCreatingMenuItem ? { opacity: 0.55 } : null]}
                >
                  <Ionicons color={theme.colors.text.secondary} name="add-outline" size={16} />
                  <Text>{isCreatingMenuItem ? 'Adding...' : 'Add as New Menu Item'}</Text>
                </Pressable>
              ) : null}
            </Card>

            <Card style={styles.sectionCard}>
              <Text variant="label">Rating</Text>
              <RatingSelector
                onChange={(value) => {
                  updateCurrentRestaurantForm({ rating: value });
                }}
                value={currentRestaurantForm?.rating ?? 3}
              />
              <Input
                label="Date (YYYY-MM-DD)"
                onChangeText={(value) => {
                  updateCurrentRestaurantForm({ date: value });
                  if (captureDateValue && value !== captureDateValue) {
                    setDateMetadataHintDismissedByPhotoId((current) => {
                      if (current[currentPhoto.id]) {
                        return current;
                      }
                      return {
                        ...current,
                        [currentPhoto.id]: true,
                      };
                    });
                  }
                }}
                placeholder="YYYY-MM-DD"
                value={currentRestaurantForm?.date ?? getTodayLocalDateString()}
              />
              {showDateMetadataHint ? (
                <>
                  <Text tone="secondary" variant="bodySm">
                    Date data grabbed from image metadata.
                  </Text>
                </>
              ) : null}
              {captureDateValue ? (
                <Button
                  label="Use Photo Date"
                  onPress={() => {
                    updateCurrentRestaurantForm({ date: captureDateValue });
                    setDateMetadataHintDismissedByPhotoId((current) => ({
                      ...current,
                      [currentPhoto.id]: false,
                    }));
                    setErrorMessage(null);
                  }}
                  style={styles.metadataActionButton}
                  variant="secondary"
                />
              ) : null}
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

            <RatingLegend persistenceKey="ui.processPhotos.ratingGuide.expanded" />
          </>
        ) : (
          <>
            <Card style={styles.sectionCard}>
              <Input
                autoCapitalize="words"
                label="Item Name"
                onChangeText={(value) => {
                  updateCurrentQuickTrackForm({ itemName: value });
                }}
                placeholder="Item name"
                value={currentQuickTrackForm?.itemName ?? ''}
              />

              <Text variant="label">Category (Optional)</Text>
              <View style={styles.categoryWrap}>
                {QUICK_TRACK_CATEGORIES.map((category) => {
                  const isSelected = currentQuickTrackForm?.category === category.value;
                  return (
                    <Pressable
                      accessibilityRole="button"
                      key={category.value}
                      onPress={() => {
                        updateCurrentQuickTrackForm({
                          category: isSelected ? '' : category.value,
                        });
                      }}
                      style={[styles.categoryChip, isSelected ? styles.categoryChipSelected : null]}
                    >
                      <Text tone={isSelected ? 'info' : 'secondary'} variant="bodySm">
                        {category.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </Card>

            <Card style={styles.sectionCard}>
              <Text variant="label">Rating</Text>
              <RatingSelector
                onChange={(value) => {
                  updateCurrentQuickTrackForm({ rating: value });
                }}
                value={currentQuickTrackForm?.rating ?? 3}
              />
              <View>
                <Text variant="label">Visibility</Text>
                <VisibilityOptionSelector
                  labelOverrides={{ friends: 'Friends only', private: 'Only me' }}
                  onChange={(value) => {
                    if (value === 'friends' || value === 'private') {
                      updateCurrentQuickTrackForm({ visibility: value });
                    }
                  }}
                  options={['friends', 'private']}
                  value={currentQuickTrackForm?.visibility ?? resolveDefaultQuickTrackVisibility()}
                />
              </View>
              <Input
                label="Date (YYYY-MM-DD)"
                onChangeText={(value) => {
                  updateCurrentQuickTrackForm({ date: value });
                  if (captureDateValue && value !== captureDateValue) {
                    setDateMetadataHintDismissedByPhotoId((current) => {
                      if (current[currentPhoto.id]) {
                        return current;
                      }
                      return {
                        ...current,
                        [currentPhoto.id]: true,
                      };
                    });
                  }
                }}
                placeholder="YYYY-MM-DD"
                value={currentQuickTrackForm?.date ?? getTodayLocalDateString()}
              />
              {showDateMetadataHint ? (
                <>
                  <Text tone="secondary" variant="bodySm">
                    Date data grabbed from image metadata.
                  </Text>
                </>
              ) : null}
              {captureDateValue ? (
                <Button
                  label="Use Photo Date"
                  onPress={() => {
                    updateCurrentQuickTrackForm({ date: captureDateValue });
                    setDateMetadataHintDismissedByPhotoId((current) => ({
                      ...current,
                      [currentPhoto.id]: false,
                    }));
                    setErrorMessage(null);
                  }}
                  style={styles.metadataActionButton}
                  variant="secondary"
                />
              ) : null}
              <Input
                label="Location (Optional)"
                onChangeText={(value) => {
                  updateCurrentQuickTrackForm({ locationText: value });
                }}
                placeholder="Where was this item from?"
                value={currentQuickTrackForm?.locationText ?? ''}
              />
              <Input
                inputStyle={styles.notesInput}
                label="Notes"
                multiline
                onChangeText={(value) => {
                  updateCurrentQuickTrackForm({ notes: value });
                }}
                placeholder="Optional notes"
                value={currentQuickTrackForm?.notes ?? ''}
              />
            </Card>

            <RatingLegend persistenceKey="ui.processPhotos.quickTrack.ratingGuide.expanded" />
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
                ? "You have reached this month's free photo limit. Subscribe for higher monthly limits."
                : `Only ${estimatedFreeMonthlyPhotoRemaining} photo uploads left this month. Subscribe for higher limits.`
            }
            onPrimaryAction={() => {
              navigation.navigate('Billing');
            }}
            onSecondaryAction={() => {
              navigation.navigate('Billing');
            }}
            primaryActionLabel={estimatedFreeMonthlyPhotoRemaining <= 0 ? 'Subscribe now' : 'Upgrade'}
            secondaryActionLabel="Compare plans"
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
              <VisibilityOptionSelector
                labelOverrides={{ friends: 'Friends only', private: 'Only me' }}
                onChange={(value) => {
                  if (value === 'friends' || value === 'private') {
                    setVisitVisibility(value);
                  }
                }}
                options={['friends', 'private']}
                value={visitVisibility}
              />
            </Card>

            {restaurantReviewGroups.map((group) => (
              <Card key={`${group.restaurantName}_${group.date}`} style={styles.reviewCard}>
                <Text variant="label">{group.restaurantName}</Text>
                <Text tone="secondary">Date: {formatReviewDate(group.date)}</Text>
                {group.items.map((item) => (
                  <View key={item.photo.id} style={styles.reviewItemRow}>
                    <Image source={{ uri: item.photo.uri }} style={styles.reviewThumb} />
                    <View style={styles.reviewTextWrap}>
                      <Text>{item.form.menuItemName}</Text>
                      <Text tone="secondary" variant="bodySm">
                        Rating {item.form.rating}/5
                      </Text>
                      {item.form.notes.trim() ? (
                        <Text tone="secondary" variant="bodySm">
                          {item.form.notes.trim()}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                ))}
              </Card>
            ))}
          </>
        ) : (
          quickTrackReviewEntries.map((entry) => (
            <Card key={entry.photo.id} style={styles.reviewCard}>
              <View style={styles.reviewItemRow}>
                <Image source={{ uri: entry.photo.uri }} style={styles.reviewThumb} />
                <View style={styles.reviewTextWrap}>
                  <Text variant="label">{entry.form.itemName}</Text>
                  <Text tone="secondary" variant="bodySm">
                    Rating {entry.form.rating}/5
                  </Text>
                  {entry.form.category ? (
                    <Text tone="secondary" variant="bodySm">
                      Category: {QUICK_TRACK_CATEGORIES.find((cat) => cat.value === entry.form.category)?.label}
                    </Text>
                  ) : null}
                  {entry.form.locationText.trim() ? (
                    <Text tone="secondary" variant="bodySm">
                      Location: {entry.form.locationText.trim()}
                    </Text>
                  ) : null}
                  {entry.form.notes.trim() ? (
                    <Text tone="secondary" variant="bodySm">
                      {entry.form.notes.trim()}
                    </Text>
                  ) : null}
                  <Text tone="secondary" variant="bodySm">
                    Date: {formatReviewDate(entry.form.date)}
                  </Text>
                </View>
              </View>
            </Card>
          ))
        )}
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
