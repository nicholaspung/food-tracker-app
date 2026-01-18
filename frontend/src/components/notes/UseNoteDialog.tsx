import { useNavigate } from "@tanstack/react-router";
import { type Note } from "@/lib/pocketbase";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Utensils, Zap, ChevronRight } from "lucide-react";

interface UseNoteDialogProps {
  note: Note;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function UseNoteDialog({
  note,
  open,
  onOpenChange,
}: UseNoteDialogProps) {
  const navigate = useNavigate();

  const handleUseForVisit = () => {
    // Store note data in sessionStorage for the visit flow
    sessionStorage.setItem(
      "noteForVisit",
      JSON.stringify({
        noteId: note.id,
        content: note.content,
        restaurant: note.restaurant,
        location_text: note.location_text,
      })
    );

    onOpenChange(false);
    navigate({ to: "/add-visit/select-restaurant" });
  };

  const handleUseForQuickTrack = () => {
    // Store note data in sessionStorage for quick track
    sessionStorage.setItem(
      "noteForQuickTrack",
      JSON.stringify({
        noteId: note.id,
        content: note.content,
        location_text: note.location_text,
      })
    );

    onOpenChange(false);
    navigate({ to: "/quick-track" });
  };

  // Truncate content for preview
  const contentPreview =
    note.content.length > 100 ? note.content.slice(0, 100) + "..." : note.content;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm mx-4">
        <DialogHeader>
          <DialogTitle>Use This Note</DialogTitle>
          <DialogDescription>
            Choose how you want to use this note
          </DialogDescription>
        </DialogHeader>

        {/* Note Preview */}
        <div className="bg-gray-50 rounded-lg p-3 mb-4">
          <p className="text-sm text-gray-700 italic">"{contentPreview}"</p>
        </div>

        {/* Options */}
        <div className="space-y-3">
          <button
            onClick={handleUseForVisit}
            className="w-full text-left"
            data-testid="use-note-for-visit"
          >
            <Card className="hover:shadow-md transition-shadow border hover:border-blue-300">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-500 p-2 rounded-lg">
                    <Utensils className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-sm">Restaurant Visit</h4>
                    <p className="text-xs text-gray-500">
                      Full experience with menu items
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </div>
              </CardContent>
            </Card>
          </button>

          <button
            onClick={handleUseForQuickTrack}
            className="w-full text-left"
            data-testid="use-note-for-quick-track"
          >
            <Card className="hover:shadow-md transition-shadow border hover:border-green-300">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="bg-green-500 p-2 rounded-lg">
                    <Zap className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-sm">Quick Track</h4>
                    <p className="text-xs text-gray-500">
                      Quick rating without restaurant
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </div>
              </CardContent>
            </Card>
          </button>
        </div>

        <Button
          variant="ghost"
          onClick={() => onOpenChange(false)}
          className="w-full mt-2"
        >
          Cancel
        </Button>
      </DialogContent>
    </Dialog>
  );
}
