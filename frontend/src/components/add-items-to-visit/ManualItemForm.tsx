import { Plus, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ManualItemFormProps {
  // Visibility state
  showManualAdd: boolean;
  onShowChange: (show: boolean) => void;

  // Form state
  itemName: string;
  onItemNameChange: (name: string) => void;
  isAdding: boolean;

  // Actions
  onSubmit: () => void;

  // Context
  isOnline: boolean;

  // Ref for mobile scrolling
  manualItemInputRef: React.RefObject<HTMLInputElement | null>;
}

export default function ManualItemForm({
  showManualAdd,
  onShowChange,
  itemName,
  onItemNameChange,
  isAdding,
  onSubmit,
  isOnline,
  manualItemInputRef,
}: ManualItemFormProps) {
  return (
    <>
      {/* Manual add section */}
      {!showManualAdd ? (
        <div className="space-y-2">
          <Button
            variant="outline"
            className="w-full bg-white"
            onClick={() => onShowChange(true)}
            disabled={!isOnline}
          >
            {isOnline ? (
              <>
                <Plus className="w-4 h-4 mr-2" />
                Can't find it? Add manually
              </>
            ) : (
              <>
                <WifiOff className="w-4 h-4 mr-2" />
                Add Manually (Offline)
              </>
            )}
          </Button>
          {!isOnline && (
            <p className="text-xs text-orange-600 text-center">
              Adding menu items requires internet connection
            </p>
          )}
        </div>
      ) : (
        <Card className="border-2 border-blue-500 bg-white">
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="manualItemName">Item Name</Label>
              <Input
                ref={manualItemInputRef}
                id="manualItemName"
                value={itemName}
                onChange={(e) => onItemNameChange(e.target.value)}
                placeholder="Enter item name"
                onKeyDown={(e) => e.key === "Enter" && onSubmit()}
                disabled={!isOnline}
              />
            </div>
            {!isOnline && (
              <div className="p-2 bg-orange-50 border border-orange-200 rounded text-xs text-orange-800">
                <div className="flex items-center gap-2">
                  <WifiOff className="w-3 h-3" />
                  <span>You're offline. Cannot add new menu items.</span>
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <Button
                className="flex-1"
                onClick={onSubmit}
                disabled={!isOnline || !itemName.trim() || isAdding}
              >
                {!isOnline ? (
                  <>
                    <WifiOff className="w-4 h-4 mr-2" />
                    Add Item (Offline)
                  </>
                ) : isAdding ? (
                  "Adding..."
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Item
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  onShowChange(false);
                  onItemNameChange("");
                }}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
