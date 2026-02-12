import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { pb } from '@/lib/pocketbase';
import TipCalculatorPage from '@/components/bills/TipCalculatorPage';

export const Route = createFileRoute('/tip-calculator')({
  beforeLoad: () => {
    if (!pb.authStore.isValid) {
      throw redirect({ to: '/' });
    }
  },
  component: TipCalculatorRoute,
});

function TipCalculatorRoute() {
  const navigate = useNavigate();

  return (
    <TipCalculatorPage onNavigateBack={() => navigate({ to: '/misc' })} />
  );
}
