import { createFileRoute, redirect } from '@tanstack/react-router';
import { pb } from '@/lib/pocketbase';
import PhotosPage from '@/components/PhotosPage';

export const Route = createFileRoute('/photos')({
  beforeLoad: () => {
    // Authentication guard
    if (!pb.authStore.isValid) {
      throw redirect({ to: '/' });
    }
  },
  component: Photos,
});

function Photos() {
  return <PhotosPage />;
}
