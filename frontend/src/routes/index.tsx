import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { pb } from '@/lib/pocketbase';
import LoginPage from '@/components/LoginPage';

export const Route = createFileRoute('/')({
  beforeLoad: () => {
    // If user is already authenticated, redirect to home
    if (pb.authStore.isValid) {
      throw redirect({ to: '/home' });
    }
  },
  component: Index,
});

function Index() {
  const navigate = useNavigate();

  return (
    <LoginPage
      onNavigateToSignUp={() => {
        navigate({ to: '/signup' });
      }}
      onNavigateToForgotPassword={() => {
        navigate({ to: '/forgot-password' });
      }}
      onLoginSuccess={() => {
        navigate({ to: '/home' });
      }}
    />
  );
}
