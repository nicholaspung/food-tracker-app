import { createFileRoute, redirect } from "@tanstack/react-router";
import { pb } from "@/lib/pocketbase";
import EditNotePage from "@/components/notes/EditNotePage";

export const Route = createFileRoute("/edit-note/$noteId")({
  beforeLoad: () => {
    // Authentication guard
    if (!pb.authStore.isValid) {
      throw redirect({ to: "/" });
    }
  },
  component: EditNote,
});

function EditNote() {
  const { noteId } = Route.useParams();
  return <EditNotePage noteId={noteId} />;
}
