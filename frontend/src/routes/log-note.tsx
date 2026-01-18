import { createFileRoute, redirect } from "@tanstack/react-router";
import { pb } from "@/lib/pocketbase";
import LogNotePage from "@/components/notes/LogNotePage";

type LogNoteSearch = {
  from?: "add-visit" | "notes";
};

export const Route = createFileRoute("/log-note")({
  validateSearch: (search: Record<string, unknown>): LogNoteSearch => {
    return {
      from: search.from === "add-visit" ? "add-visit" : undefined,
    };
  },
  beforeLoad: () => {
    // Authentication guard
    if (!pb.authStore.isValid) {
      throw redirect({ to: "/" });
    }
  },
  component: LogNote,
});

function LogNote() {
  const { from } = Route.useSearch();
  return <LogNotePage from={from} />;
}
