import { createFileRoute, redirect } from "@tanstack/react-router";
import { pb } from "@/lib/pocketbase";
import QuickTrackPage from "@/components/quick-track/QuickTrackPage";

export const Route = createFileRoute("/quick-track")({
  beforeLoad: () => {
    // Authentication guard
    if (!pb.authStore.isValid) {
      throw redirect({ to: "/" });
    }
  },
  component: QuickTrack,
});

function QuickTrack() {
  return <QuickTrackPage />;
}
