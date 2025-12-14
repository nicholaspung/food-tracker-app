import { createFileRoute, redirect } from '@tanstack/react-router';
import { pb } from '@/lib/pocketbase';
import ProcessPhotosPage from '@/components/photos/ProcessPhotosPage';

export const Route = createFileRoute('/process-photos')({
  beforeLoad: () => {
    // Authentication guard
    if (!pb.authStore.isValid) {
      throw redirect({ to: '/' });
    }
  },
  component: ProcessPhotos,
});

function ProcessPhotos() {
  return <ProcessPhotosPage />;
}
