import { useState, useCallback, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/ui/LoadingState";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, ArrowLeft, Filter } from "lucide-react";
import { useNotes, type Note, type NotePhoto } from "@/hooks/api/useNotes";
import { useOfflineNoteDelete } from "@/hooks/offline/useOfflineNoteDelete";
import { noteKeys } from "@/constants/queryKeys";
import { pb } from "@/lib/pocketbase";
import NoteCard from "./NoteCard";
import UseNoteDialog from "./UseNoteDialog";
import PhotoViewerDialog from "@/components/shared/PhotoViewerDialog";

type FilterStatus = "all" | "unused" | "used";

export default function NotesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // State
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("unused");
  const [noteToDelete, setNoteToDelete] = useState<Note | null>(null);
  const [noteToUse, setNoteToUse] = useState<Note | null>(null);
  const [photoViewerData, setPhotoViewerData] = useState<{
    urls: string[];
    title: string;
    initialIndex: number;
  } | null>(null);

  // Queries
  const { data: allNotes = [], isLoading } = useNotes({ expand: "restaurant" });
  const deleteMutation = useOfflineNoteDelete();

  // Filter notes based on status
  const filteredNotes = useMemo(() => {
    if (filterStatus === "all") return allNotes;
    return allNotes.filter((note) =>
      filterStatus === "unused" ? note.status === "draft" : note.status === "used"
    );
  }, [allNotes, filterStatus]);

  // Build a map of photos for each note
  const [notePhotosMap, setNotePhotosMap] = useState<Record<string, NotePhoto[]>>({});

  // Fetch photos for all notes
  useMemo(() => {
    const fetchPhotos = async () => {
      const userId = pb.authStore.record?.id;
      if (!userId || allNotes.length === 0) return;

      try {
        const photos = await pb.collection("note_photos").getFullList<NotePhoto>({
          filter: `user = "${userId}"`,
          sort: "created",
        });

        const photosByNote: Record<string, NotePhoto[]> = {};
        for (const photo of photos) {
          if (!photosByNote[photo.note]) {
            photosByNote[photo.note] = [];
          }
          photosByNote[photo.note].push(photo);
        }
        setNotePhotosMap(photosByNote);
      } catch (error) {
        // Silent fail - photos are optional
      }
    };

    fetchPhotos();
  }, [allNotes]);

  // Handlers
  const handleEdit = useCallback(
    (noteId: string) => {
      navigate({ to: "/edit-note/$noteId", params: { noteId } });
    },
    [navigate]
  );

  const handleDelete = useCallback((note: Note) => {
    setNoteToDelete(note);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!noteToDelete) return;

    try {
      await deleteMutation.mutateAsync(noteToDelete.id);
      queryClient.invalidateQueries({ queryKey: noteKeys.all });
    } catch (error) {
      // Error handled by mutation
    } finally {
      setNoteToDelete(null);
    }
  }, [noteToDelete, deleteMutation, queryClient]);

  const handleUse = useCallback((note: Note) => {
    setNoteToUse(note);
  }, []);

  const handlePhotoClick = useCallback(
    (data: { urls: string[]; dishName: string; initialIndex?: number }) => {
      setPhotoViewerData({
        urls: data.urls,
        title: data.dishName,
        initialIndex: data.initialIndex || 0,
      });
    },
    []
  );

  const unusedCount = allNotes.filter((n) => n.status === "draft").length;
  const usedCount = allNotes.filter((n) => n.status === "used").length;

  if (isLoading) {
    return <LoadingState fullScreen message="Loading notes..." />;
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate({ to: "/home" })}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-2xl font-bold text-gray-900">My Notes</h1>
          </div>
          <Button
            size="sm"
            onClick={() => navigate({ to: "/log-note" })}
            data-testid="add-note-header-button"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add
          </Button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="bg-white border-b border-gray-200 px-4 py-2">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-500" />
          <div className="flex gap-2">
            <Button
              variant={filterStatus === "unused" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterStatus("unused")}
            >
              Unused ({unusedCount})
            </Button>
            <Button
              variant={filterStatus === "used" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterStatus("used")}
            >
              Used ({usedCount})
            </Button>
            <Button
              variant={filterStatus === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterStatus("all")}
            >
              All ({allNotes.length})
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto overscroll-contain p-4">
        {filteredNotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-12 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <Plus className="w-8 h-8 text-gray-400" />
            </div>
            <p className="text-gray-500 mb-4">
              {filterStatus === "unused"
                ? "No unused notes"
                : filterStatus === "used"
                ? "No used notes yet"
                : "No notes yet"}
            </p>
            <Button onClick={() => navigate({ to: "/log-note" })}>
              <Plus className="w-4 h-4 mr-2" />
              Log a Note
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredNotes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                photos={notePhotosMap[note.id] || []}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onUse={handleUse}
                onPhotoClick={handlePhotoClick}
              />
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!noteToDelete}
        onOpenChange={(open) => !open && setNoteToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Note</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this note? This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Use Note Dialog */}
      {noteToUse && (
        <UseNoteDialog
          note={noteToUse}
          notePhotos={notePhotosMap[noteToUse.id] || []}
          open={!!noteToUse}
          onOpenChange={(open) => !open && setNoteToUse(null)}
        />
      )}

      {/* Photo Viewer Dialog */}
      {photoViewerData && (
        <PhotoViewerDialog
          open={!!photoViewerData}
          onOpenChange={(open) => !open && setPhotoViewerData(null)}
          urls={photoViewerData.urls}
          title={photoViewerData.title}
          initialIndex={photoViewerData.initialIndex}
        />
      )}
    </div>
  );
}
