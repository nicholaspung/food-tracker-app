import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { EmptyState, ErrorState, ScreenHeader, Skeleton } from '../components/shared';
import {
  createTastingSession,
  joinTastingSession,
  listRestaurants,
  listTastingSessions,
} from '../features';
import { useQueuedWrite } from '../features/store/useQueuedWrite';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../providers/AuthProvider';
import { useTheme } from '../theme';
import { Button, Card, Input, ListItem, Screen, Text } from '../ui';

type TastingSessionsScreenProps = NativeStackScreenProps<RootStackParamList, 'TastingSessions'>;

type SessionFilter = 'active' | 'completed';

export function TastingSessionsScreen({ navigation }: TastingSessionsScreenProps) {
  const theme = useTheme();
  const { user } = useAuth();
  const queueWrite = useQueuedWrite();
  const queryClient = useQueryClient();

  const sessionsQuery = useQuery({
    queryKey: ['feature', 'tastingSessions'],
    queryFn: listTastingSessions,
  });

  const restaurantsQuery = useQuery({
    queryKey: ['feature', 'restaurants'],
    queryFn: listRestaurants,
  });

  const [filter, setFilter] = useState<SessionFilter>('active');
  const [createName, setCreateName] = useState('');
  const [restaurantSearch, setRestaurantSearch] = useState('');
  const [selectedRestaurant, setSelectedRestaurant] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const filteredRestaurants = useMemo(() => {
    const normalizedSearch = restaurantSearch.trim().toLowerCase();
    if (!normalizedSearch) {
      return restaurantsQuery.data ?? [];
    }

    return (restaurantsQuery.data ?? []).filter((restaurant) =>
      restaurant.name.toLowerCase().includes(normalizedSearch),
    );
  }, [restaurantSearch, restaurantsQuery.data]);

  const filteredSessions = useMemo(() => {
    const sessions = sessionsQuery.data ?? [];
    if (filter === 'completed') {
      return sessions.filter((session) => session.status === 'completed');
    }

    return sessions.filter((session) => session.status === 'lobby' || session.status === 'rating');
  }, [filter, sessionsQuery.data]);

  const styles = StyleSheet.create({
    screenContent: {
      backgroundColor: theme.colors.background.muted,
      gap: 0,
      paddingHorizontal: 0,
      paddingVertical: 0,
    },
    body: {
      gap: theme.spacing.md,
      paddingBottom: theme.spacing.xl,
      paddingHorizontal: theme.spacing.md,
      paddingTop: theme.spacing.sm,
    },
    row: {
      flexDirection: 'row',
      gap: theme.spacing.sm,
    },
    rowAction: {
      flex: 1,
    },
  });

  const handleCreate = async () => {
    const name = createName.trim();
    const restaurantName = selectedRestaurant.trim();

    if (!name || !restaurantName || !user) {
      setErrorMessage('Session name, restaurant, and signed-in user are required.');
      return;
    }

    setErrorMessage(null);

    try {
      await queueWrite('tasting-session.create');
      const session = await createTastingSession({
        name,
        restaurantName,
        createdByUserId: user.id,
        createdByName: user.name ?? user.email,
      });

      setCreateName('');
      setRestaurantSearch('');
      setSelectedRestaurant('');

      await queryClient.invalidateQueries({ queryKey: ['feature', 'tastingSessions'] });
      navigation.navigate('TastingSessionDetail', { sessionId: session.id });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not create session.';
      setErrorMessage(message);
    }
  };

  const handleJoin = async () => {
    if (!joinCode.trim() || !user) {
      setErrorMessage('Join code is required.');
      return;
    }

    setErrorMessage(null);

    try {
      await queueWrite('tasting-session.join');
      const session = await joinTastingSession({
        inviteCode: joinCode.trim().toUpperCase(),
        userId: user.id,
        participantName: user.name ?? user.email,
      });

      setJoinCode('');
      await queryClient.invalidateQueries({ queryKey: ['feature', 'tastingSessions'] });
      navigation.navigate('TastingSessionDetail', { sessionId: session.id });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not join session.';
      setErrorMessage(message);
    }
  };

  return (
    <Screen background="surface" contentStyle={styles.screenContent} edges={['top']} padded={false} scroll>
      <ScreenHeader
        onBackPress={() => {
          if (navigation.canGoBack()) {
            navigation.goBack();
            return;
          }
          navigation.navigate('Profile');
        }}
        subtitle="Create or join a tasting session with your group."
        title="Group Tastings"
      />
      <View style={styles.body}>
        <View style={styles.row}>
          <Button
            label="Active"
            onPress={() => {
              setFilter('active');
            }}
            style={styles.rowAction}
            variant={filter === 'active' ? 'primary' : 'secondary'}
          />
          <Button
            label="Completed"
            onPress={() => {
              setFilter('completed');
            }}
            style={styles.rowAction}
            variant={filter === 'completed' ? 'primary' : 'secondary'}
          />
        </View>

        <Card>
          <Text variant="label">Create Session</Text>
          <Input
            label="Session name"
            onChangeText={setCreateName}
            placeholder="Friday ramen tasting"
            value={createName}
          />
          <Input
            label="Restaurant search"
            onChangeText={setRestaurantSearch}
            placeholder="Search restaurants"
            value={restaurantSearch}
          />
          <Input
            label="Selected restaurant"
            onChangeText={setSelectedRestaurant}
            placeholder="Restaurant"
            value={selectedRestaurant}
          />

          {filteredRestaurants.slice(0, 3).map((restaurant) => (
            <Button
              key={restaurant.id}
              label={`Use ${restaurant.name}`}
              onPress={() => {
                setSelectedRestaurant(restaurant.name);
              }}
              variant="secondary"
            />
          ))}

          <Button
            disabled={!createName.trim() || !selectedRestaurant.trim()}
            label="Create Session"
            onPress={() => {
              void handleCreate();
            }}
          />
        </Card>

        <Card>
          <Text variant="label">Join Session</Text>
          <Input
            autoCapitalize="characters"
            autoCorrect={false}
            label="6-character invite code"
            maxLength={6}
            onChangeText={setJoinCode}
            placeholder="ABC123"
            value={joinCode}
          />
          <Button
            disabled={joinCode.trim().length !== 6}
            label="Join"
            onPress={() => {
              void handleJoin();
            }}
            variant="secondary"
          />
        </Card>

        {errorMessage ? <ErrorState description={errorMessage} title="Session action failed" /> : null}

        {sessionsQuery.isLoading || restaurantsQuery.isLoading ? (
          <>
            <Skeleton height={20} />
            <Skeleton height={20} />
          </>
        ) : null}

        {sessionsQuery.isError ? (
          <ErrorState
            description="Could not load tasting sessions."
            onRetry={() => {
              void sessionsQuery.refetch();
            }}
            title="Sessions unavailable"
          />
        ) : null}

        {!sessionsQuery.isLoading && !sessionsQuery.isError && filteredSessions.length === 0 ? (
          <EmptyState description="No sessions found for the current filter." title="No sessions" />
        ) : null}

        {!sessionsQuery.isLoading && !sessionsQuery.isError
          ? filteredSessions.map((session) => (
              <Card key={session.id} tone={session.status === 'completed' ? 'success' : 'info'}>
                <ListItem
                  description={`${session.restaurantName} | ${session.participants.length} participants`}
                  title={session.name}
                  trailing={<Text tone="muted">{session.status}</Text>}
                />
                <Button
                  label="Open Session"
                  onPress={() => {
                    navigation.navigate('TastingSessionDetail', { sessionId: session.id });
                  }}
                  variant="secondary"
                />
              </Card>
            ))
          : null}
      </View>
    </Screen>
  );
}
