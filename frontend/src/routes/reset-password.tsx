import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { pb } from '@/lib/pocketbase';
import ResetPasswordPage from '@/components/auth/ResetPasswordPage';
import { z } from 'zod';

// Define the search params schema
const resetPasswordSearchSchema = z.object({
  token: z.string(),
});

export const Route = createFileRoute('/reset-password')({
  validateSearch: resetPasswordSearchSchema,
  beforeLoad: () => {
    // If user is already authenticated, redirect to home
    if (pb.authStore.isValid) {
      throw redirect({ to: '/home' });
    }
  },
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const { token } = Route.useSearch();

  return (
    <ResetPasswordPage
      token={token}
      onNavigateToLogin={() => {
        navigate({ to: '/' });
      }}
      onResetSuccess={() => {
        navigate({ to: '/' });
      }}
    />
  );
}
