import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { pb } from '@/lib/pocketbase';
import OnboardingPage from '@/components/OnboardingPage';

export const Route = createFileRoute('/onboarding')({
  component: Onboarding,
});

function Onboarding() {
  const navigate = useNavigate();
  const isAuthenticated = pb.authStore.isValid;

  return (
    <OnboardingPage
      onNavigateToSignUp={() => {
        // Mark onboarding as seen before going to signup
        localStorage.setItem('hasSeenOnboarding', 'true');
        // If user is authenticated, go back to home, otherwise go to signup
        if (isAuthenticated) {
          navigate({ to: '/home' });
        } else {
          navigate({ to: '/signup' });
        }
      }}
      onNavigateToLogin={() => {
        // Mark onboarding as seen before going to login
        localStorage.setItem('hasSeenOnboarding', 'true');
        // If user is authenticated, go back to home, otherwise go to login
        if (isAuthenticated) {
          navigate({ to: '/home' });
        } else {
          navigate({ to: '/' });
        }
      }}
    />
  );
}
