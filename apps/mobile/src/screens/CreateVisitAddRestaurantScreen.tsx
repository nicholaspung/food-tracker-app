import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import {
  FeatureFormScreenScaffold,
  PageErrorToast,
  VisibilityOptionSelector,
  type VisibilityOptionValue,
} from '../components/shared';
import { createCollectionRecord, resolveDefaultRestaurantVisibilityFromAuth } from '../features';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { useTheme } from '../theme';
import { Card, Input, Text } from '../ui';

type CreateVisitAddRestaurantScreenProps = NativeStackScreenProps<RootStackParamList, 'CreateVisitAddRestaurant'>;

type RestaurantVisibility = VisibilityOptionValue;

function resolveDefaultRestaurantVisibility(isAdmin: boolean): RestaurantVisibility {
  return resolveDefaultRestaurantVisibilityFromAuth(isAdmin);
}

export function CreateVisitAddRestaurantScreen({ navigation }: CreateVisitAddRestaurantScreenProps) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.isAdmin === true;

  const [restaurantName, setRestaurantName] = useState('');
  const [restaurantLocation, setRestaurantLocation] = useState('');
  const [restaurantCuisine, setRestaurantCuisine] = useState('');
  const [visibility, setVisibility] = useState<RestaurantVisibility>(resolveDefaultRestaurantVisibility(isAdmin));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const visibilityOptions = useMemo<RestaurantVisibility[]>(
    () => (isAdmin ? ['private', 'friends', 'public'] : ['private', 'friends']),
    [isAdmin],
  );

  const styles = StyleSheet.create({
    body: {
      gap: theme.spacing.md,
    },
    formCard: {
      gap: theme.spacing.sm,
    },
    visibilitySection: {
      gap: theme.spacing.xs,
    },
  });

  const handleAddRestaurant = async () => {
    const currentUserId = user?.id;
    if (!currentUserId) {
      trackObservabilityEvent('CREATE_VISIT_ADD_RESTAURANT_SUBMIT_VALIDATION_FAILED', {
        source: 'CreateVisitAddRestaurantScreen',
        reason: 'missing_user',
      });
      setErrorMessage('Please sign in again to add a restaurant.');
      return;
    }

    const trimmedName = restaurantName.trim();
    const trimmedLocation = restaurantLocation.trim();

    if (!trimmedName) {
      trackObservabilityEvent('CREATE_VISIT_ADD_RESTAURANT_SUBMIT_VALIDATION_FAILED', {
        source: 'CreateVisitAddRestaurantScreen',
        reason: 'missing_restaurant_name',
        visibility,
      });
      setErrorMessage('Restaurant name is required.');
      return;
    }

    if (!trimmedLocation) {
      trackObservabilityEvent('CREATE_VISIT_ADD_RESTAURANT_SUBMIT_VALIDATION_FAILED', {
        source: 'CreateVisitAddRestaurantScreen',
        reason: 'missing_location',
        visibility,
      });
      setErrorMessage('Location is required.');
      return;
    }

    setErrorMessage(null);
    trackObservabilityEvent('CREATE_VISIT_ADD_RESTAURANT_SUBMIT_STARTED', {
      source: 'CreateVisitAddRestaurantScreen',
      visibility,
      isAdmin,
      hasCuisine: restaurantCuisine.trim().length > 0,
    });
    setIsSubmitting(true);

    try {
      const resolvedVisibility = !isAdmin && visibility === 'public' ? 'friends' : visibility;

      const createdRestaurant = await createCollectionRecord<{
        id: string;
        name: string;
      }>('restaurants', {
        name: trimmedName,
        location: trimmedLocation,
        cuisineType: restaurantCuisine.trim() || '',
        visibility: resolvedVisibility,
        createdBy: currentUserId,
      });

      await queryClient.invalidateQueries({ queryKey: ['feature', 'restaurants'] });
      trackObservabilityEvent('CREATE_VISIT_ADD_RESTAURANT_SUBMIT_SUCCEEDED', {
        source: 'CreateVisitAddRestaurantScreen',
        restaurantId: createdRestaurant.id,
        visibility: resolvedVisibility,
      });
      navigation.navigate('CreateVisit', {
        preselectedRestaurantId: createdRestaurant.id,
        preselectedRestaurantName: createdRestaurant.name,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not add restaurant.';
      setErrorMessage(message);
      trackObservabilityEvent('CREATE_VISIT_ADD_RESTAURANT_SUBMIT_FAILED', {
        source: 'CreateVisitAddRestaurantScreen',
        visibility,
        error: message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FeatureFormScreenScaffold
      keyboardAware
      onBackPress={() => {
        navigation.goBack();
      }}
      primaryAction={{
        label: 'Add & Continue',
        disabled: !restaurantName.trim() || !restaurantLocation.trim() || isSubmitting,
        loading: isSubmitting,
        onPress: () => {
          void handleAddRestaurant();
        },
      }}
      secondaryAction={{
        label: 'Cancel',
        onPress: () => {
          navigation.goBack();
        },
      }}
      title="Add New Restaurant"
    >
      <View style={styles.body}>
        <PageErrorToast errorMessage={errorMessage} title="Could not add restaurant" />

        <Card style={styles.formCard}>
          <Text tone="secondary">Add a restaurant and continue with your visit.</Text>

          <Input
            autoCapitalize="words"
            label="Restaurant Name"
            onChangeText={setRestaurantName}
            placeholder="Restaurant name"
            value={restaurantName}
          />
          <Input
            autoCapitalize="words"
            label="Location"
            onChangeText={setRestaurantLocation}
            placeholder="City, zip, or full address"
            value={restaurantLocation}
          />
          <Input
            autoCapitalize="words"
            label="Cuisine Type (Optional)"
            onChangeText={setRestaurantCuisine}
            placeholder="e.g., Italian, Japanese"
            value={restaurantCuisine}
          />

          <View style={styles.visibilitySection}>
            <Text variant="label">Visibility</Text>
            <VisibilityOptionSelector
              options={visibilityOptions}
              onChange={(nextVisibility) => {
                trackObservabilityEvent('CREATE_VISIT_ADD_RESTAURANT_VISIBILITY_CHANGED', {
                  source: 'CreateVisitAddRestaurantScreen',
                  previousVisibility: visibility,
                  nextVisibility,
                  isAdmin,
                });
                setVisibility(nextVisibility);
              }}
              value={visibility}
            />
          </View>
        </Card>
      </View>
    </FeatureFormScreenScaffold>
  );
}
