import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { pb } from '@/lib/pocketbase';
import HomePage from '@/components/HomePage';

export const Route = createFileRoute('/home')({
  beforeLoad: () => {
    // If user is not authenticated, redirect to login
    if (!pb.authStore.isValid) {
      throw redirect({ to: '/' });
    }
  },
  component: Home,
});

function Home() {
  const navigate = useNavigate();

  return (
    <HomePage
      onNavigateToProfile={() => {
        navigate({ to: '/profile' });
      }}
    />
  );
}
