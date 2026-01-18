import { createFileRoute, redirect } from "@tanstack/react-router";
import { pb } from "@/lib/pocketbase";
import NotesPage from "@/components/notes/NotesPage";

export const Route = createFileRoute("/notes")({
  beforeLoad: () => {
    // Authentication guard
    if (!pb.authStore.isValid) {
      throw redirect({ to: "/" });
    }
  },
  component: Notes,
});

function Notes() {
  return <NotesPage />;
}
