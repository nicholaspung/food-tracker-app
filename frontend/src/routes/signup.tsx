import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { pb } from '@/lib/pocketbase';
import SignUpPage from '@/components/SignUpPage';

export const Route = createFileRoute('/signup')({
  beforeLoad: () => {
    // If user is already authenticated, redirect to home
    if (pb.authStore.isValid) {
      throw redirect({ to: '/home' });
    }
  },
  component: SignUp,
});

function SignUp() {
  const navigate = useNavigate();

  return (
    <SignUpPage
      onNavigateToLogin={() => {
        navigate({ to: '/' });
      }}
      onSignUpSuccess={() => {
        navigate({ to: '/home' });
      }}
    />
  );
}
