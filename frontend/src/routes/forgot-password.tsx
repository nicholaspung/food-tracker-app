import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { pb } from '@/lib/pocketbase';
import ForgotPasswordPage from '@/components/ForgotPasswordPage';

export const Route = createFileRoute('/forgot-password')({
  beforeLoad: () => {
    // If user is already authenticated, redirect to home
    if (pb.authStore.isValid) {
      throw redirect({ to: '/home' });
    }
  },
  component: ForgotPassword,
});

function ForgotPassword() {
  const navigate = useNavigate();

  return (
    <ForgotPasswordPage
      onNavigateToLogin={() => {
        navigate({ to: '/' });
      }}
    />
  );
}
