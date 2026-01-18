import { type Note } from "@/lib/pocketbase";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { FileText, MapPin, ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface NoteSelectorProps {
  notes: Note[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (note: Note) => void;
}

export default function NoteSelector({
  notes,
  open,
  onOpenChange,
  onSelect,
}: NoteSelectorProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm mx-4 max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Select a Note
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-2 -mx-2 px-2">
          {notes.map((note) => {
            const contentPreview =
              note.content.length > 80
                ? note.content.slice(0, 80) + "..."
                : note.content;

            const timeAgo = formatDistanceToNow(new Date(note.created), {
              addSuffix: true,
            });

            return (
              <button
                key={note.id}
                onClick={() => onSelect(note)}
                className="w-full text-left"
                data-testid={`select-note-${note.id}`}
              >
                <Card className="hover:shadow-md transition-shadow border hover:border-blue-300">
                  <CardContent className="p-3">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900 line-clamp-2 mb-1">
                          {contentPreview}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <span>{timeAgo}</span>
                          {(note.location_text || note.expand?.restaurant?.name) && (
                            <>
                              <span>-</span>
                              <span className="flex items-center gap-1 truncate">
                                <MapPin className="w-3 h-3" />
                                {note.expand?.restaurant?.name || note.location_text}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    </div>
                  </CardContent>
                </Card>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
