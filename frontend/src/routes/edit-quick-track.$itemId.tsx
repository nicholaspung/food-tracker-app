import { createFileRoute, redirect } from "@tanstack/react-router";
import { pb } from "@/lib/pocketbase";
import EditQuickTrackPage from "@/components/EditQuickTrackPage";

export const Route = createFileRoute("/edit-quick-track/$itemId")({
  beforeLoad: () => {
    // Authentication guard
    if (!pb.authStore.isValid) {
      throw redirect({ to: "/" });
    }
  },
  component: EditQuickTrack,
});

function EditQuickTrack() {
  const { itemId } = Route.useParams();
  return <EditQuickTrackPage itemId={itemId} />;
}
