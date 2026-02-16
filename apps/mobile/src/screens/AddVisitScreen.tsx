import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { ErrorState } from '../components/shared';
import { createVisit } from '../features';
import { useQueuedWrite } from '../features/store/useQueuedWrite';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useTheme } from '../theme';
import { Button, Card, Input, ListItem, Screen, Text } from '../ui';

type AddVisitScreenProps = NativeStackScreenProps<RootStackParamList, 'AddVisit'>;

type VisitWizardStep = 1 | 2 | 3;

interface DraftVisitItem {
  id: string;
  name: string;
  rating: string;
  notes: string;
}

function createDraftItemId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function AddVisitScreen({ navigation }: AddVisitScreenProps) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const queueWrite = useQueuedWrite();

  const [step, setStep] = useState<VisitWizardStep>(1);
  const [restaurantName, setRestaurantName] = useState('');
  const [draftItemName, setDraftItemName] = useState('');
  const [draftItems, setDraftItems] = useState<DraftVisitItem[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const styles = StyleSheet.create({
    container: {
      gap: theme.spacing.md,
    },
    row: {
      flexDirection: 'row',
      gap: theme.spacing.sm,
    },
    action: {
      flex: 1,
    },
    itemCard: {
      gap: theme.spacing.sm,
    },
  });

  const addDraftItem = () => {
    if (!draftItemName.trim()) {
      return;
    }

    setDraftItems((currentItems) => [
      ...currentItems,
      {
        id: createDraftItemId(),
        name: draftItemName.trim(),
        rating: '4',
        notes: '',
      },
    ]);
    setDraftItemName('');
  };

  const updateDraftItem = (
    itemId: string,
    updates: Partial<Pick<DraftVisitItem, 'rating' | 'notes'>>,
  ) => {
    setDraftItems((currentItems) =>
      currentItems.map((item) => (item.id === itemId ? { ...item, ...updates } : item)),
    );
  };

  const removeDraftItem = (itemId: string) => {
    setDraftItems((currentItems) => currentItems.filter((item) => item.id !== itemId));
  };

  const submitVisit = async () => {
    const trimmedRestaurant = restaurantName.trim();

    if (!trimmedRestaurant) {
      setErrorMessage('Restaurant is required.');
      return;
    }

    if (draftItems.length === 0) {
      setErrorMessage('Add at least one item.');
      return;
    }

    const parsedItems = draftItems.map((item) => ({
      name: item.name,
      rating: Number(item.rating || '0'),
      notes: item.notes.trim() || undefined,
    }));

    if (parsedItems.some((item) => Number.isNaN(item.rating) || item.rating <= 0 || item.rating > 5)) {
      setErrorMessage('Ratings must be between 1 and 5.');
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await queueWrite('visit.create');
      await createVisit({
        restaurantName: trimmedRestaurant,
        items: parsedItems,
        source: 'visit',
      });

      await queryClient.invalidateQueries({ queryKey: ['feature', 'visits'] });
      navigation.navigate('Home');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save visit.';
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Screen scroll>
      <View style={styles.container}>
        <Text variant="titleMd">Add Visit Wizard</Text>
        <Text tone="secondary">Step {step} of 3</Text>

        {errorMessage ? <ErrorState description={errorMessage} title="Visit draft issue" /> : null}

        {step === 1 ? (
          <Card>
            <Text variant="label">Select restaurant</Text>
            <Input
              label="Restaurant"
              onChangeText={setRestaurantName}
              placeholder="Restaurant name"
              value={restaurantName}
            />
            <Button
              disabled={!restaurantName.trim()}
              label="Continue"
              onPress={() => {
                setStep(2);
              }}
            />
          </Card>
        ) : null}

        {step === 2 ? (
          <Card>
            <Text variant="label">Add items</Text>
            <Input
              label="Item"
              onChangeText={setDraftItemName}
              placeholder="Dish name"
              value={draftItemName}
            />
            <View style={styles.row}>
              <Button label="Add Item" onPress={addDraftItem} style={styles.action} variant="secondary" />
              <Button
                label="Rate Items"
                onPress={() => {
                  setStep(3);
                }}
                style={styles.action}
              />
            </View>

            {draftItems.length === 0 ? <Text tone="muted">No items added yet.</Text> : null}

            {draftItems.map((item) => (
              <Card key={item.id} tone="muted">
                <ListItem
                  title={item.name}
                  trailing={
                    <Button
                      label="Remove"
                      onPress={() => {
                        removeDraftItem(item.id);
                      }}
                      variant="secondary"
                    />
                  }
                />
              </Card>
            ))}
          </Card>
        ) : null}

        {step === 3 ? (
          <Card>
            <Text variant="label">Rate items</Text>
            {draftItems.map((item) => (
              <Card key={item.id} style={styles.itemCard} tone="muted">
                <Text variant="label">{item.name}</Text>
                <Input
                  keyboardType="decimal-pad"
                  label="Rating (1-5)"
                  onChangeText={(value) => {
                    updateDraftItem(item.id, { rating: value });
                  }}
                  value={item.rating}
                />
                <Input
                  label="Notes"
                  onChangeText={(value) => {
                    updateDraftItem(item.id, { notes: value });
                  }}
                  placeholder="Optional notes"
                  value={item.notes}
                />
              </Card>
            ))}

            <View style={styles.row}>
              <Button
                label="Back"
                onPress={() => {
                  setStep(2);
                }}
                style={styles.action}
                variant="secondary"
              />
              <Button
                disabled={isSubmitting}
                label={isSubmitting ? 'Saving...' : 'Save Visit'}
                onPress={() => {
                  void submitVisit();
                }}
                style={styles.action}
              />
            </View>
          </Card>
        ) : null}
      </View>
    </Screen>
  );
}
