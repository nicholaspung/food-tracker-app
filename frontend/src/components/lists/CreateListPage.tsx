import { useState } from "react";
import { useOfflineCreateList } from "@/hooks/offline/useOfflineListOperations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Lock, Users, Globe, ArrowLeft } from "lucide-react";
import { useErrorHandler } from "@/hooks/ui/useErrorHandler";
import { ErrorDisplay } from "@/components/shared/ErrorDisplay";
import { ERROR_MESSAGES } from "@/lib/errorMessages";

interface CreateListPageProps {
  onNavigateBack: () => void;
  onSuccess: (listId: string) => void;
}

export default function CreateListPage({
  onNavigateBack,
  onSuccess,
}: CreateListPageProps) {
  const [listName, setListName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"private" | "friends" | "public">("private");
  const { error, handleError, clearError } = useErrorHandler({
    source: 'CreateListPage',
    defaultSeverity: 'error',
  });

  const createListMutation = useOfflineCreateList({
    onSuccess: (data) => {
      onSuccess(data.id);
    },
    onError: (err) => {
      handleError(err, { customMessage: ERROR_MESSAGES.LISTS.CREATE_FAILED });
    },
  });

  const handleSubmit = async () => {
    clearError();

    // Client-side validation
    if (!listName.trim()) {
      handleError(new Error(ERROR_MESSAGES.VALIDATION.REQUIRED_FIELD("List name")));
      return;
    }

    if (listName.length > 100) {
      handleError(new Error(ERROR_MESSAGES.VALIDATION.MAX_LENGTH("List name", 100)));
      return;
    }

    if (description.length > 500) {
      handleError(new Error(ERROR_MESSAGES.VALIDATION.MAX_LENGTH("Description", 500)));
      return;
    }

    await createListMutation.mutateAsync({
      name: listName.trim(),
      description: description.trim() || undefined,
      visibility,
    });
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onNavigateBack}
            className="p-2"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Create New List</h1>
            <p className="text-sm text-gray-500">
              Organize your favorite restaurants
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Error Message */}
        <ErrorDisplay error={error} onClear={clearError} />

        {/* List Name */}
        <div className="space-y-2">
          <Label htmlFor="list-name">List Name *</Label>
          <Input
            id="list-name"
            placeholder="e.g., Best Pizza in Town"
            value={listName}
            onChange={(e) => setListName(e.target.value)}
            maxLength={100}
            required
            autoFocus
            data-testid="list-name-input"
          />
          <p className="text-xs text-gray-500">
            {listName.length}/100 characters
          </p>
        </div>

        {/* Description */}
        <div className="space-y-2">
          <Label htmlFor="description">Description (optional)</Label>
          <Textarea
            id="description"
            placeholder="Add a description for your list..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            rows={3}
            data-testid="list-description-input"
          />
          <p className="text-xs text-gray-500">
            {description.length}/500 characters
          </p>
        </div>

        {/* Visibility */}
        <div className="space-y-3">
          <Label>Visibility</Label>
          <div className="space-y-2">
            {/* Private Option */}
            <button
              type="button"
              onClick={() => setVisibility("private")}
              className={`w-full p-3 rounded-lg border-2 transition-all ${
                visibility === "private"
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
              data-testid="visibility-private"
            >
              <div className="flex items-start gap-3">
                <div
                  className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    visibility === "private"
                      ? "border-blue-500 bg-blue-500"
                      : "border-gray-300"
                  }`}
                >
                  {visibility === "private" && (
                    <div className="w-2.5 h-2.5 bg-white rounded-full" />
                  )}
                </div>
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-2 mb-1">
                    <Lock className="w-4 h-4 text-gray-600" />
                    <span className="font-semibold text-sm">Private</span>
                  </div>
                  <p className="text-xs text-gray-600">Only visible to you</p>
                </div>
              </div>
            </button>

            {/* Friends Option */}
            <button
              type="button"
              onClick={() => setVisibility("friends")}
              className={`w-full p-3 rounded-lg border-2 transition-all ${
                visibility === "friends"
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
              data-testid="visibility-friends"
            >
              <div className="flex items-start gap-3">
                <div
                  className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    visibility === "friends"
                      ? "border-blue-500 bg-blue-500"
                      : "border-gray-300"
                  }`}
                >
                  {visibility === "friends" && (
                    <div className="w-2.5 h-2.5 bg-white rounded-full" />
                  )}
                </div>
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-2 mb-1">
                    <Users className="w-4 h-4 text-blue-600" />
                    <span className="font-semibold text-sm">Friends</span>
                  </div>
                  <p className="text-xs text-gray-600">
                    Visible to your friends
                  </p>
                </div>
              </div>
            </button>

            {/* Public Option */}
            <button
              type="button"
              onClick={() => setVisibility("public")}
              className={`w-full p-3 rounded-lg border-2 transition-all ${
                visibility === "public"
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
              data-testid="visibility-public"
            >
              <div className="flex items-start gap-3">
                <div
                  className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    visibility === "public"
                      ? "border-blue-500 bg-blue-500"
                      : "border-gray-300"
                  }`}
                >
                  {visibility === "public" && (
                    <div className="w-2.5 h-2.5 bg-white rounded-full" />
                  )}
                </div>
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-2 mb-1">
                    <Globe className="w-4 h-4 text-green-600" />
                    <span className="font-semibold text-sm">Public</span>
                  </div>
                  <p className="text-xs text-gray-600">
                    Anyone can view this list
                  </p>
                </div>
              </div>
            </button>
          </div>
        </div>

      </div>

      {/* Bottom Action Buttons */}
      <div className="bg-white border-t border-gray-200 p-4">
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={onNavigateBack}
            disabled={createListMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="default"
            className="flex-1"
            onClick={handleSubmit}
            disabled={createListMutation.isPending || !listName.trim()}
            data-testid="create-list-submit"
          >
            {createListMutation.isPending ? "Creating..." : "Create List"}
          </Button>
        </div>
      </div>
    </div>
  );
}
