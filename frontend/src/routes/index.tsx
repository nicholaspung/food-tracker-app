import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { pb } from '@/lib/pocketbase';
import LoginPage from '@/components/auth/LoginPage';

export const Route = createFileRoute('/')({
  beforeLoad: () => {
    // If user is already authenticated, redirect to home
    if (pb.authStore.isValid) {
      throw redirect({ to: '/home' });
    }

    // If user hasn't seen onboarding yet, redirect to onboarding
    const hasSeenOnboarding = localStorage.getItem('hasSeenOnboarding');
    if (!hasSeenOnboarding) {
      throw redirect({ to: '/onboarding' });
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
      onNavigateToOnboarding={() => {
        navigate({ to: '/onboarding' });
      }}
      onLoginSuccess={() => {
        navigate({ to: '/home' });
      }}
    />
  );
}
