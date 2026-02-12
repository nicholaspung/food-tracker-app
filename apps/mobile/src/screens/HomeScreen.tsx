import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { env } from '../config/env';
import { useAuth } from '../providers/AuthProvider';

export function HomeScreen() {
  const { user, signOut } = useAuth();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>{user?.name ?? user?.email}</Text>

        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>API Base URL</Text>
          <Text style={styles.infoValue}>{env.apiBaseUrl}</Text>
          <Text style={styles.infoLabel}>PocketBase URL</Text>
          <Text style={styles.infoValue}>{env.pocketbaseUrl}</Text>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void signOut();
          }}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        >
          <Text style={styles.buttonLabel}>Sign Out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  container: {
    flex: 1,
    padding: 24,
    gap: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111',
  },
  subtitle: {
    fontSize: 16,
    color: '#333',
  },
  infoCard: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 14,
    gap: 6,
    backgroundColor: '#fafafa',
  },
  infoLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },
  infoValue: {
    fontSize: 13,
    color: '#111',
  },
  button: {
    backgroundColor: '#111',
    borderRadius: 10,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
