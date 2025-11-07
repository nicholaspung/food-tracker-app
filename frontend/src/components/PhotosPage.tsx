import { useQuery } from "@tanstack/react-query";
import { pb } from "@/lib/pocketbase";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ImageOff } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import DishPhotoCard from "./DishPhotoCard";

export default function PhotosPage() {
  const navigate = useNavigate();

  // Fetch all visit photos for the current user
  const { data: photos, isLoading, error } = useQuery({
    queryKey: ["visit_photos"],
    queryFn: async () => {
      const user = pb.authStore.record;
      if (!user) throw new Error("Not authenticated");

      // Fetch photos with expanded relations
      const records = await pb.collection("visit_photos").getFullList({
        filter: `user = "${user.id}"`,
        expand: "food_item,food_item.visit,food_item.visit.restaurant",
        sort: "-created",
      });

      return records;
    },
  });

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate({ to: "/home" })}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Dish Photos</h1>
            <p className="text-sm text-gray-500">
              {photos?.length || 0} photo{photos?.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading && (
          <div className="flex items-center justify-center h-64">
            <p className="text-gray-500">Loading photos...</p>
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center h-64">
            <p className="text-red-500">Error loading photos</p>
          </div>
        )}

        {!isLoading && !error && photos?.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-center px-4">
            <ImageOff className="w-16 h-16 text-gray-400 mb-4" />
            <h2 className="text-xl font-semibold text-gray-700 mb-2">
              No photos yet
            </h2>
            <p className="text-gray-500 mb-6">
              Start capturing your favorite dishes when you record a visit!
            </p>
            <Button onClick={() => navigate({ to: "/add-visit" })}>
              Record a Visit
            </Button>
          </div>
        )}

        {!isLoading && !error && photos && photos.length > 0 && (
          <div className="space-y-4">
            {photos.map((photo) => (
              <DishPhotoCard key={photo.id} photoRecord={photo as any} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
