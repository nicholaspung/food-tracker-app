import { View } from 'react-native';

import { createThemedStyles } from '../../theme';
import { Card, Text } from '../../ui';
import { BackHeaderScreenScaffold } from './BackHeaderScreenScaffold';

interface StaticContentSection {
  title: string;
  body: string;
}

export interface StaticContentSectionsScreenProps {
  title: string;
  subtitle: string;
  introCaption: string;
  introTitle: string;
  introDescription: string;
  sections: readonly StaticContentSection[];
  onBackPress: () => void;
  testID?: string;
}

const useStyles = createThemedStyles((theme) => ({
  body: {
    gap: theme.spacing.md,
  },
  introCard: {
    gap: theme.spacing.xs,
  },
  sectionCard: {
    gap: theme.spacing.xs,
  },
  caption: {
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
}));

export function StaticContentSectionsScreen({
  title,
  subtitle,
  introCaption,
  introTitle,
  introDescription,
  sections,
  onBackPress,
  testID,
}: StaticContentSectionsScreenProps) {
  const styles = useStyles();

  return (
    <BackHeaderScreenScaffold
      bodyStyle={styles.body}
      headerScrollMode="fixed"
      onBackPress={onBackPress}
      subtitle={subtitle}
      testID={testID}
      title={title}
    >
      <Card style={styles.introCard}>
        <Text style={styles.caption} tone="muted" variant="bodySm">
          {introCaption}
        </Text>
        <Text variant="titleMd">{introTitle}</Text>
        <Text tone="secondary">{introDescription}</Text>
      </Card>

      {sections.map((section) => (
        <Card key={section.title} style={styles.sectionCard}>
          <View>
            <Text variant="label">{section.title}</Text>
            <Text tone="secondary">{section.body}</Text>
          </View>
        </Card>
      ))}
    </BackHeaderScreenScaffold>
  );
}
