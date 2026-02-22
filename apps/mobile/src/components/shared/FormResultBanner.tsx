import { Card, Text } from '../../ui';

type FormResultTone = 'success' | 'danger' | 'warning' | 'info';

export interface FormResultBannerProps {
  message: string;
  tone?: FormResultTone;
}

function resolveTextTone(tone: FormResultTone): 'success' | 'danger' | 'warning' | 'info' {
  return tone;
}

export function FormResultBanner({ message, tone = 'success' }: FormResultBannerProps) {
  return (
    <Card tone={tone}>
      <Text tone={resolveTextTone(tone)}>{message}</Text>
    </Card>
  );
}
