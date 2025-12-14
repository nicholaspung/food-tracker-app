import { createFileRoute, redirect, useNavigate, useSearch } from '@tanstack/react-router';
import { pb } from '@/lib/pocketbase';
import SignUpPage from '@/components/auth/SignUpPage';

type SignUpSearch = {
  code?: string;
};

export const Route = createFileRoute('/signup')({
  beforeLoad: () => {
    // If user is already authenticated, redirect to home
    if (pb.authStore.isValid) {
      throw redirect({ to: '/home' });
    }
  },
  validateSearch: (search: Record<string, unknown>): SignUpSearch => {
    return {
      code: search.code as string | undefined,
    };
  },
  component: SignUp,
});

function SignUp() {
  const navigate = useNavigate();
  const { code } = useSearch({ from: '/signup' });

  return (
    <SignUpPage
      initialInviteCode={code}
      onNavigateToLogin={() => {
        navigate({ to: '/' });
      }}
    />
  );
}
