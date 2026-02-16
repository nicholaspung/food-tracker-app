import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { ErrorState } from '../components/shared';
import { inviteFriend } from '../features';
import { useQueuedWrite } from '../features/store/useQueuedWrite';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { Button, Card, Input, Screen, Text } from '../ui';

type QRScannerScreenProps = NativeStackScreenProps<RootStackParamList, 'QRScanner'>;

function generateMockScanCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let index = 0; index < 6; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

export function QRScannerScreen({ navigation }: QRScannerScreenProps) {
  const queueWrite = useQueuedWrite();
  const queryClient = useQueryClient();

  const [scannedCode, setScannedCode] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleScanResult = async () => {
    if (!scannedCode.trim()) {
      setErrorMessage('Enter or scan an invite code first.');
      return;
    }

    const normalizedCode = scannedCode.trim().toUpperCase();

    setErrorMessage(null);

    try {
      await queueWrite('friend.qr.scan');
      await inviteFriend({
        code: normalizedCode,
      });

      await queryClient.invalidateQueries({ queryKey: ['feature', 'friends'] });
      navigation.navigate('Friends');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not process QR invite.';
      setErrorMessage(message);
    }
  };

  return (
    <Screen keyboardAware>
      <Text variant="titleMd">QR Invite Scanner</Text>

      <Card>
        <Text variant="label">Native scanner flow</Text>
        <Text tone="secondary">
          This screen captures QR invite payloads and sends friend requests using scanned codes.
        </Text>
      </Card>

      <Input
        autoCapitalize="characters"
        autoCorrect={false}
        label="Scanned invite code"
        onChangeText={setScannedCode}
        placeholder="ABC123"
        value={scannedCode}
      />

      {errorMessage ? <ErrorState description={errorMessage} title="Scan failed" /> : null}

      <Button
        label="Simulate Native Scan"
        onPress={() => {
          setScannedCode(generateMockScanCode());
        }}
        variant="secondary"
      />

      <Button
        label="Send Request"
        onPress={() => {
          void handleScanResult();
        }}
      />
    </Screen>
  );
}
