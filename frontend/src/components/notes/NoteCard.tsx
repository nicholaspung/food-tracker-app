import { memo } from "react";
import { pb, type Note, type NotePhoto } from "@/lib/pocketbase";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  MapPin,
  Pencil,
  Trash2,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface NoteCardProps {
  note: Note;
  photos?: NotePhoto[];
  onEdit: (noteId: string) => void;
  onDelete: (note: Note) => void;
  onUse?: (note: Note) => void;
  onPhotoClick?: (data: { urls: string[]; dishName: string; initialIndex?: number }) => void;
}

const NoteCard = memo(function NoteCard({
  note,
  photos = [],
  onEdit,
  onDelete,
  onUse,
  onPhotoClick,
}: NoteCardProps) {
  const hasPhotos = photos.length > 0;
  const photoCount = photos.length;
  const isUsed = note.status === "used";

  const photoUrls = photos.map((photo) =>
    pb.files.getURL(photo, photo.photo, { thumb: "100x100" })
  );

  const fullPhotoUrls = photos.map((photo) =>
    pb.files.getURL(photo, photo.photo)
  );

  // Truncate content for preview
  const contentPreview = note.content.length > 150
    ? note.content.slice(0, 150) + "..."
    : note.content;

  const timeAgo = formatDistanceToNow(new Date(note.created), { addSuffix: true });

  return (
    <Card
      className={
        isUsed
          ? "border-gray-200 bg-gray-50/50 opacity-75"
          : "border-blue-200 bg-blue-50/30"
      }
      data-testid={`note-card-${note.id}`}
    >
      <CardContent>
        {/* Header with status badge and action buttons */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2 flex-1">
            <FileText className="w-4 h-4 text-gray-500" />
            <span className="text-xs text-gray-500">{timeAgo}</span>
            {isUsed && (
              <Badge
                variant="outline"
                className="text-xs border-green-300 text-green-700"
              >
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Used
              </Badge>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1">
            {!isUsed && onUse && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onUse(note)}
                data-testid={`use-note-${note.id}`}
                className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
              >
                Use
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit(note.id)}
              data-testid={`edit-note-${note.id}`}
            >
              <Pencil className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(note)}
              data-testid={`delete-note-${note.id}`}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="flex items-start gap-3">
          {/* Photo thumbnail with count badge */}
          {hasPhotos && onPhotoClick && (
            <div
              className="relative w-16 h-16 flex-shrink-0 cursor-pointer"
              onClick={() =>
                onPhotoClick({
                  urls: fullPhotoUrls,
                  dishName: "Note Photos",
                  initialIndex: 0,
                })
              }
            >
              <img
                src={photoUrls[0]}
                alt="Note photo"
                className="w-16 h-16 object-cover rounded-md hover:opacity-80 transition-opacity"
              />
              {photoCount > 1 && (
                <div className="absolute top-0.5 left-0.5 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded-full font-medium">
                  +{photoCount - 1}
                </div>
              )}
            </div>
          )}

          {/* Photo count badge if no click handler */}
          {hasPhotos && !onPhotoClick && (
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <ImageIcon className="w-3 h-3" />
              {photoCount} photo{photoCount > 1 ? "s" : ""}
            </div>
          )}

          <div className="flex-1 min-w-0">
            {/* Content preview */}
            <p className="text-sm text-gray-900 whitespace-pre-wrap break-words">
              {contentPreview}
            </p>

            {/* Location */}
            {(note.location_text || note.expand?.restaurant?.name) && (
              <p className="flex items-center gap-1 text-sm text-gray-600 mt-2">
                <MapPin className="w-3 h-3" />
                {note.expand?.restaurant?.name || note.location_text}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
});

export default NoteCard;
