import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronDown, ChevronUp, StickyNote, MapPin } from "lucide-react";

interface NoteReferencePanelProps {
  noteContent: string;
  locationText?: string;
  /** Unique key for storing collapse state in sessionStorage */
  storageKey?: string;
}

/**
 * A collapsible panel to show note content for reference during tracking.
 * Remembers collapsed state in sessionStorage across screens.
 */
export function NoteReferencePanel({
  noteContent,
  locationText,
  storageKey = "noteReferencePanel",
}: NoteReferencePanelProps) {
  // Initialize collapsed state from sessionStorage
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const stored = sessionStorage.getItem(`${storageKey}_collapsed`);
    return stored === "true";
  });

  const toggleCollapsed = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    sessionStorage.setItem(`${storageKey}_collapsed`, String(newState));
  };

  return (
    <Card className="mb-4 border-amber-200 bg-amber-50/50">
      <CardContent className="py-3">
        <button
          type="button"
          onClick={toggleCollapsed}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <StickyNote className="w-4 h-4 text-amber-600" />
            <span className="text-sm font-semibold text-amber-800">
              Your Note
            </span>
          </div>
          {isCollapsed ? (
            <ChevronDown className="w-4 h-4 text-amber-600" />
          ) : (
            <ChevronUp className="w-4 h-4 text-amber-600" />
          )}
        </button>

        {!isCollapsed && (
          <div className="mt-3 space-y-2">
            {/* Note content in a quote block style */}
            <div className="border-l-4 border-amber-400 pl-3 py-1">
              <p className="text-sm text-gray-700 italic whitespace-pre-wrap">
                "{noteContent}"
              </p>
            </div>

            {/* Location if available */}
            {locationText && (
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <MapPin className="w-3 h-3" />
                <span>{locationText}</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
