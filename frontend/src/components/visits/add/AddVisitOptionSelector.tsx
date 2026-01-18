import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Utensils, Zap, Images, ChevronRight, ArrowLeft, FileText, FolderOpen } from "lucide-react";
import { useTrackEvent } from "@/hooks/ui/useTrackEvent";
import { ANALYTICS_EVENTS } from "@/constants/analyticsEvents";
import { useUnusedNotes, type Note } from "@/hooks/api/useNotes";
import NoteSelector from "@/components/notes/NoteSelector";
import UseNoteDialog from "@/components/notes/UseNoteDialog";

export default function AddVisitOptionSelector() {
  const navigate = useNavigate();
  const trackEvent = useTrackEvent();

  // State for note selection
  const [showNoteSelector, setShowNoteSelector] = useState(false);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);

  // Fetch unused notes to conditionally show "Use Saved Note" option
  const { data: unusedNotes = [] } = useUnusedNotes();

  const options = [
    {
      id: "restaurant-visit",
      title: "Track Restaurant Visit",
      description: "Full experience with restaurant, menu items, and ratings",
      icon: Utensils,
      color: "bg-blue-500",
      path: "/add-visit/select-restaurant",
    },
    {
      id: "quick-track",
      title: "Quick Track Item",
      description: "Quickly rate any item without a restaurant",
      icon: Zap,
      color: "bg-green-500",
      path: "/quick-track",
    },
    {
      id: "log-note",
      title: "Log a Note",
      description: "Jot down notes about food/places for later",
      icon: FileText,
      color: "bg-orange-500",
      path: "/log-note",
    },
    {
      id: "process-photos",
      title: "Process Saved Photos",
      description: "Upload multiple photos and rate each one",
      icon: Images,
      color: "bg-purple-500",
      path: "/process-photos",
    },
  ];

  // TODO: Re-enable "Use Saved Note" option when functionality is ready
  // if (unusedNotes.length > 0) {
  //   options.splice(3, 0, {
  //     id: "use-saved-note",
  //     title: "Use Saved Note",
  //     description: `${unusedNotes.length} note${unusedNotes.length > 1 ? "s" : ""} ready to use`,
  //     icon: BookOpen,
  //     color: "bg-amber-500",
  //     path: "", // Handled specially
  //   });
  // }

  // Add "Manage Notes" option to view/edit/delete all notes
  options.push({
    id: "manage-notes",
    title: "Manage Notes",
    description: "View, edit, or delete your saved notes",
    icon: FolderOpen,
    color: "bg-gray-500",
    path: "/notes",
  });

  const handleOptionClick = (option: typeof options[0]) => {
    if (option.id === "use-saved-note") {
      setShowNoteSelector(true);
      return;
    }

    // Track flow started based on option selected
    if (option.id === "restaurant-visit") {
      trackEvent(ANALYTICS_EVENTS.VISIT_CREATION_STARTED, {
        source: "AddVisitOptionSelector",
      });
    } else if (option.id === "quick-track") {
      trackEvent(ANALYTICS_EVENTS.QUICK_TRACK_STARTED, {
        source: "AddVisitOptionSelector",
      });
    } else if (option.id === "process-photos") {
      trackEvent(ANALYTICS_EVENTS.PHOTO_PROCESSING_STARTED, {
        source: "AddVisitOptionSelector",
      });
    }

    // Pass from param for log-note so back button returns here
    if (option.id === "log-note") {
      navigate({ to: "/log-note", search: { from: "add-visit" } });
      return;
    }

    navigate({ to: option.path });
  };

  const handleNoteSelect = (note: Note) => {
    setShowNoteSelector(false);
    setSelectedNote(note);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b">
        <div className="flex items-center justify-between p-4">
          <button
            onClick={() => navigate({ to: "/home" })}
            className="p-2 hover:bg-accent rounded-lg transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-xl font-semibold">Add New</h1>
          <div className="w-9" /> {/* Spacer for alignment */}
        </div>
      </div>

      {/* Options */}
      <div className="p-4 space-y-3">
        <p className="text-sm text-muted-foreground mb-4">
          Choose how you want to track your food:
        </p>

        {options.map((option) => {
          const Icon = option.icon;
          return (
            <button
              key={option.id}
              onClick={() => handleOptionClick(option)}
              className="w-full text-left"
              data-testid={`add-option-${option.id}`}
            >
              <Card className="hover:shadow-lg transition-shadow border-2 hover:border-primary">
                <CardContent>
                  <div className="flex items-start gap-4">
                    {/* Icon */}
                    <div
                      className={`${option.color} p-3 rounded-lg flex-shrink-0`}
                    >
                      <Icon className="h-6 w-6 text-white" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-base mb-1">
                        {option.title}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {option.description}
                      </p>
                    </div>

                    {/* Arrow */}
                    <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-1" />
                  </div>
                </CardContent>
              </Card>
            </button>
          );
        })}
      </div>

      {/* Note Selector Modal */}
      {showNoteSelector && (
        <NoteSelector
          notes={unusedNotes}
          open={showNoteSelector}
          onOpenChange={setShowNoteSelector}
          onSelect={handleNoteSelect}
        />
      )}

      {/* Use Note Dialog */}
      {selectedNote && (
        <UseNoteDialog
          note={selectedNote}
          open={!!selectedNote}
          onOpenChange={(open) => !open && setSelectedNote(null)}
        />
      )}
    </div>
  );
}
