import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { pb } from '@/lib/pocketbase';
import VerifyEmailPage from '@/components/VerifyEmailPage';
import { z } from 'zod';

// Define the search params schema
const verifyEmailSearchSchema = z.object({
  token: z.string(),
});

export const Route = createFileRoute('/verify-email')({
  validateSearch: verifyEmailSearchSchema,
  beforeLoad: () => {
    // If user is already authenticated, redirect to home
    if (pb.authStore.isValid) {
      throw redirect({ to: '/home' });
    }
  },
  component: VerifyEmail,
});

function VerifyEmail() {
  const navigate = useNavigate();
  const { token } = Route.useSearch();

  return (
    <VerifyEmailPage
      token={token}
      onNavigateToLogin={() => {
        navigate({ to: '/' });
      }}
    />
  );
}
