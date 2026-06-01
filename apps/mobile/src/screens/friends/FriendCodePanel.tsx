import { Ionicons } from '../../ui/AppIcon';
import { Pressable, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { useTheme } from '../../theme';
import { Card, Text } from '../../ui';

interface FriendCodePanelProps {
  code: string;
  qrPayload: string;
  onCopy: () => void;
  styles: {
    cardTitle: object;
    cardDescription: object;
    codeBox: object;
    codeHeaderRow: object;
    codeLabel: object;
    copyButton: object;
    codeText: object;
    qrContainer: object;
    qrDescription: object;
  };
}

export function FriendCodePanel({ code, onCopy, qrPayload, styles }: FriendCodePanelProps) {
  const theme = useTheme();

  return (
    <Card>
      <Text style={styles.cardTitle} variant="sectionTitleTight">My Friend Code</Text>
      <Text style={styles.cardDescription}>Share this code so friends can send you a request.</Text>
      <View style={styles.codeBox}>
        <View style={styles.codeHeaderRow}>
          <Text style={styles.codeLabel} variant="bodySmTightSemiBold">Friend Code</Text>
          <Pressable
            accessibilityLabel="Copy friend code"
            accessibilityRole="button"
            onPress={onCopy}
            style={styles.copyButton}
          >
            <Ionicons color={theme.colors.text.info} name="copy-outline" size={16} />
          </Pressable>
        </View>
        <Text style={styles.codeText} variant="displaySm">{code}</Text>
      </View>
      <View style={styles.qrContainer}>
        <QRCode
          backgroundColor={theme.colors.background.surface}
          color={theme.colors.text.primary}
          quietZone={8}
          size={176}
          value={qrPayload}
        />
        <Text style={styles.qrDescription} tone="secondary">
          Friends can scan this QR code to autofill your friend code.
        </Text>
      </View>
    </Card>
  );
}
