import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import type { QueryClient } from '@tanstack/react-query';

import { submitProcessedPhotos, type MonthlyUsageSnapshot } from '../../features';
import type { OfflineAwareFeatureWrite } from '../../features/store/useOfflineAwareFeatureWrite';
import {
  buildDefaultFoodProductForm,
  validateFoodProductForm,
  type FoodProductFormValues,
} from '../../lib/foodProductForm';
import {
  buildDefaultRestaurantForm,
  resolveDraftPhotoDetectedDateValue,
  type DraftPhotoAsset,
  type GeneralPhotoStep,
  type PhotoProcessingScreenProps,
  type ProcessType,
  type RestaurantPhotoGroup,
  type RestaurantPhotoForm,
} from './shared';
import { validateRestaurantPhotoSubmissionForm } from '../../features/photoProcessing/photoSubmission';

interface UsePhotoProcessingSubmissionParams {
  currentPhoto: DraftPhotoAsset | null;
  currentPhotoIndex: number;
  currentFoodProductForm: FoodProductFormValues | undefined;
  currentRestaurantForm: RestaurantPhotoForm | undefined;
  goToProcessPhoto: (nextIndex: number) => void;
  isDisplayFreeUser: boolean;
  isOnline: boolean;
  monthlyUsageSnapshot: MonthlyUsageSnapshot | null;
  navigation: PhotoProcessingScreenProps['navigation'];
  photos: DraftPhotoAsset[];
  processUnitCount?: number;
  processType: ProcessType | null;
  queryClient: QueryClient;
  foodProductForms: Record<string, FoodProductFormValues>;
  onSubmitSucceeded?: () => void;
  restaurantPhotoGroups?: RestaurantPhotoGroup[];
  restaurantForms: Record<string, RestaurantPhotoForm>;
  setErrorMessage: Dispatch<SetStateAction<string | null>>;
  setStep: Dispatch<SetStateAction<GeneralPhotoStep>>;
  sourceNoteId?: string;
  shouldEnforceUsageLimitsClientSide: boolean;
  visitVisibility: 'friends' | 'private';
  writeFeature: OfflineAwareFeatureWrite;
}

export function usePhotoProcessingSubmission({
  currentPhoto,
  currentPhotoIndex,
  currentFoodProductForm,
  currentRestaurantForm,
  goToProcessPhoto,
  isDisplayFreeUser,
  isOnline,
  monthlyUsageSnapshot,
  navigation,
  photos,
  processUnitCount,
  processType,
  queryClient,
  foodProductForms,
  onSubmitSucceeded,
  restaurantPhotoGroups,
  restaurantForms,
  setErrorMessage,
  setStep,
  sourceNoteId,
  shouldEnforceUsageLimitsClientSide,
  visitVisibility,
  writeFeature,
}: UsePhotoProcessingSubmissionParams) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateRestaurantForm = useCallback(
    (form: RestaurantPhotoForm): string | null =>
      validateRestaurantPhotoSubmissionForm(form),
    [],
  );

  const handleProcessNext = useCallback(() => {
    if (!currentPhoto || !processType) {
      return;
    }

    const validationMessage =
      processType === 'restaurant'
        ? validateRestaurantForm(
            currentRestaurantForm ??
              buildDefaultRestaurantForm(currentPhoto, undefined),
          )
        : validateFoodProductForm(
            currentFoodProductForm ??
              buildDefaultFoodProductForm({
                captureDate: currentPhoto.captureDate,
                detectedDateValue: resolveDraftPhotoDetectedDateValue(currentPhoto),
              }),
          );

    if (validationMessage) {
      setErrorMessage(validationMessage);
      return;
    }

    setErrorMessage(null);
    const totalProcessUnits = processUnitCount ?? photos.length;
    if (currentPhotoIndex < totalProcessUnits - 1) {
      goToProcessPhoto(currentPhotoIndex + 1);
      return;
    }

    setStep('review');
  }, [
    currentPhoto,
    currentPhotoIndex,
    currentFoodProductForm,
    currentRestaurantForm,
    goToProcessPhoto,
    photos.length,
    processUnitCount,
    processType,
    setErrorMessage,
    setStep,
    validateRestaurantForm,
  ]);

  const handleSubmitAll = useCallback(async () => {
    if (!processType) {
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const submitResult = await submitProcessedPhotos({
        foodProductForms,
        isDisplayFreeUser,
        isOnline,
        monthlyUsageSnapshot,
        photos,
        processType,
        queryClient,
        restaurantPhotoGroups,
        restaurantForms,
        shouldEnforceUsageLimitsClientSide,
        sourceNoteId,
        visitVisibility,
        writeFeature,
      });

      if (!('destination' in submitResult)) {
        setErrorMessage(submitResult.errorMessage);
        return;
      }

      onSubmitSucceeded?.();
      if (submitResult.destination.name === 'Home' && submitResult.destination.params) {
        navigation.navigate('Home', submitResult.destination.params);
      } else {
        navigation.navigate('Home');
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [
    foodProductForms,
    isDisplayFreeUser,
    isOnline,
    monthlyUsageSnapshot,
    navigation,
    photos,
    processType,
    queryClient,
    restaurantPhotoGroups,
    restaurantForms,
    setErrorMessage,
    shouldEnforceUsageLimitsClientSide,
    sourceNoteId,
    onSubmitSucceeded,
    visitVisibility,
    writeFeature,
  ]);

  return {
    handleProcessNext,
    handleSubmitAll,
    isSubmitting,
  };
}
