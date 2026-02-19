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
import { pb } from '../lib/pocketbase';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useTheme } from '../theme';
import { Card, Input, Text } from '../ui';

type CreateVisitAddRestaurantScreenProps = NativeStackScreenProps<RootStackParamList, 'CreateVisitAddRestaurant'>;

type RestaurantVisibility = VisibilityOptionValue;

function resolveDefaultRestaurantVisibility(isAdmin: boolean): RestaurantVisibility {
  const value = pb.authStore.record?.defaultRestaurantVisibility;

  if (value === 'private') {
    return 'private';
  }

  if (value === 'public' && isAdmin) {
    return 'public';
  }

  return 'friends';
}

export function CreateVisitAddRestaurantScreen({ navigation }: CreateVisitAddRestaurantScreenProps) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const isAdmin = Boolean(pb.authStore.record?.isAdmin);

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
    const currentUserId = pb.authStore.record?.id;
    if (!currentUserId) {
      setErrorMessage('Please sign in again to add a restaurant.');
      return;
    }

    const trimmedName = restaurantName.trim();
    const trimmedLocation = restaurantLocation.trim();

    if (!trimmedName) {
      setErrorMessage('Restaurant name is required.');
      return;
    }

    if (!trimmedLocation) {
      setErrorMessage('Location is required.');
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const resolvedVisibility = !isAdmin && visibility === 'public' ? 'friends' : visibility;

      const createdRestaurant = await pb.collection('restaurants').create<{
        id: string;
        name: string;
      }>({
        name: trimmedName,
        location: trimmedLocation,
        cuisineType: restaurantCuisine.trim() || '',
        visibility: resolvedVisibility,
        createdBy: currentUserId,
      });

      await queryClient.invalidateQueries({ queryKey: ['feature', 'restaurants'] });
      navigation.navigate('CreateVisit', {
        preselectedRestaurantId: createdRestaurant.id,
        preselectedRestaurantName: createdRestaurant.name,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not add restaurant.';
      setErrorMessage(message);
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
              onChange={setVisibility}
              value={visibility}
            />
          </View>
        </Card>
      </View>
    </FeatureFormScreenScaffold>
  );
}
