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
  VisibilityOptionSelector,
} from '../components/shared';
import {
  createQuickTrack,
  createVisit,
  listRestaurants,
  type RestaurantRecord,
  type VisitPhotoUploadInput,
} from '../features';
import { useQueuedWrite } from '../features/store/useQueuedWrite';
import { pb } from '../lib/pocketbase';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { useTheme } from '../theme';
import { Button, Card, Input, ListItem, Screen, Text } from '../ui';

type PhotoProcessingScreenProps = NativeStackScreenProps<RootStackParamList, 'ProcessPhotos'>;
type ScanSource = 'camera' | 'gallery';
type MenuScanPhase = 'choose' | 'processing' | 'success' | 'error';
type ProcessType = 'restaurant' | 'quickTrack';
type GeneralPhotoStep = 'choice' | 'upload' | 'process' | 'review';
type QuickTrackCategory = 'convenience_store' | 'packaged_food' | 'homemade' | 'recipe' | 'other';

interface DraftPhotoAsset {
  id: string;
  uri: string;
  name: string;
  mimeType: string;
  captureDate: Date | null;
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

const PROCESS_FLOW_STEPS: { label: string }[] = [
  { label: 'Restaurant Visit' },
  { label: 'Upload' },
  { label: 'Process' },
  { label: 'Review' },
];
const QUICK_TRACK_FLOW_STEPS: { label: string }[] = [
  { label: 'Quick Track' },
  { label: 'Upload' },
  { label: 'Process' },
  { label: 'Review' },
];
const QUICK_TRACK_CATEGORIES: { value: QuickTrackCategory; label: string }[] = [
  { value: 'convenience_store', label: 'Convenience Store' },
  { value: 'packaged_food', label: 'Packaged Food' },
  { value: 'homemade', label: 'Homemade' },
  { value: 'recipe', label: 'Recipe' },
  { value: 'other', label: 'Other' },
];

function buildScannedItemNames(seedLabel: string): string[] {
  const normalized = seedLabel.replace(/\.[^/.]+$/, '').trim();
  const base = normalized || 'Scanned Item';
  return [`${base} #1`, `${base} #2`, `${base} #3`];
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
  return pb.authStore.record?.defaultVisitVisibility === 'private' ? 'private' : 'friends';
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

function resolveGeneralStepIndex(step: GeneralPhotoStep): number {
  if (step === 'upload') {
    return 1;
  }
  if (step === 'process') {
    return 2;
  }
  return 3;
}

function resolveGeneralFlowSteps(processType: ProcessType): { label: string }[] {
  return processType === 'restaurant' ? PROCESS_FLOW_STEPS : QUICK_TRACK_FLOW_STEPS;
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

  const createScannedMenuItems = useCallback(async (imageLabel: string) => {
    if (!restaurantId) {
      throw new Error('Restaurant context is missing.');
    }

    const currentUserId = pb.authStore.record?.id;
    if (!currentUserId) {
      throw new Error('Please sign in again to continue.');
    }

    const names = buildScannedItemNames(imageLabel);
    const createdRecords: CreatedMenuItemRecord[] = [];

    for (const itemName of names) {
      const createdItem = await pb.collection('menu_items').create<CreatedMenuItemRecord>({
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

  const processSelectedImage = useCallback(async (imageName: string) => {
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
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 2200);
      });

      const createdNames = await createScannedMenuItems(imageName);
      setCreatedItemNames(createdNames);
      setProgressValue(1);
      setPhase('success');
      startCountdown();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not process this photo.';
      setErrorMessage(message);
      setPhase('error');
    } finally {
      clearInterval(progressInterval);
    }
  }, [createScannedMenuItems, startCountdown]);

  const pickImage = useCallback(async (source: ScanSource) => {
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
        return;
      }

      const selectedAsset = pickerResult.assets[0];
      const imageLabel =
        selectedAsset.fileName?.trim() ||
        selectedAsset.uri.split('/').pop()?.trim() ||
        (source === 'camera' ? 'camera-image' : 'library-image');

      setSelectedImageName(imageLabel);
      await processSelectedImage(imageLabel);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not select an image.';
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
  const { isOnline } = useConnectivity();

  const [step, setStep] = useState<GeneralPhotoStep>('choice');
  const [processType, setProcessType] = useState<ProcessType | null>(null);
  const [photos, setPhotos] = useState<DraftPhotoAsset[]>([]);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [restaurantForms, setRestaurantForms] = useState<Record<string, RestaurantPhotoForm>>({});
  const [quickTrackForms, setQuickTrackForms] = useState<Record<string, QuickTrackPhotoForm>>({});
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

      return pb.collection('menu_items').getFullList<MenuItemRecord>({
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
    const restaurants = restaurantsQuery.data ?? [];
    if (!normalizedQuery) {
      return restaurants.slice(0, 12);
    }

    return restaurants
      .filter((restaurant) => {
        const matchesName = restaurant.name.toLowerCase().includes(normalizedQuery);
        const matchesLocation = (restaurant.location ?? '').toLowerCase().includes(normalizedQuery);
        const matchesCuisine = (restaurant.cuisineType ?? '').toLowerCase().includes(normalizedQuery);
        return matchesName || matchesLocation || matchesCuisine;
      })
      .slice(0, 12);
  }, [restaurantSearchQuery, restaurantsQuery.data]);

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
        });
        existingUris.add(asset.uri);
      });

      return nextPhotos;
    });
  };

  const pickPhotos = useCallback(
    async (source: ScanSource) => {
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
          return;
        }

        appendAssets(pickerResult.assets);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not select images.';
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
      await queueWrite('visit.create');
      await createVisit({
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
      });
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

      await queueWrite('quick-track.create');
      await createQuickTrack({
        itemName: form.itemName.trim(),
        rating: form.rating,
        itemCategory: form.category || undefined,
        notes: form.notes.trim() || undefined,
        locationText: form.locationText.trim() || undefined,
        visibility: form.visibility,
        itemDate: localDateStringToUTC(form.date),
        photo: buildPhotoUploadInput(photo),
      });
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
      ]);

      navigation.navigate('Home');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not process photos.';
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

    const currentUserId = pb.authStore.record?.id;
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
      const createdItem = await pb.collection('menu_items').create<MenuItemRecord>({
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
  const progressHeaderContent = processType ? (
    <StepProgressBar
      compact
      currentStep={resolveGeneralStepIndex(step)}
      showCompletedCheckmark={false}
      steps={resolveGeneralFlowSteps(processType)}
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

          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setProcessType('restaurant');
              setStep('upload');
              setPhotos([]);
              setCurrentPhotoIndex(0);
              setRestaurantForms({});
              setQuickTrackForms({});
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
              <Input
                autoCapitalize="words"
                onChangeText={setRestaurantSearchQuery}
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
                {filteredRestaurants.map((restaurant) => {
                  const description = [restaurant.location, restaurant.cuisineType].filter(Boolean).join(' • ');
                  const isSelected = currentRestaurantForm?.restaurantId === restaurant.id;
                  return (
                    <ListItem
                      description={description || 'Restaurant'}
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
                }}
                placeholder="YYYY-MM-DD"
                value={currentRestaurantForm?.date ?? getTodayLocalDateString()}
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
                }}
                placeholder="YYYY-MM-DD"
                value={currentQuickTrackForm?.date ?? getTodayLocalDateString()}
              />
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
