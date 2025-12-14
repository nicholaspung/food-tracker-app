import { AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { MenuItem, pb, User } from "@/lib/pocketbase";
import MenuScanStep from "@/components/visits/shared/MenuScanStep";

interface OCRMenuIntegrationProps {
  // Scan mode state
  showScanMenu: boolean;

  // Restaurant context
  restaurantId: string;
  restaurantName: string;

  // Callbacks
  onItemsExtracted: (items: MenuItem[], debugInfo?: any) => void;
  onCancel: () => void;

  // Admin debug data
  debugData: any;
}

export default function OCRMenuIntegration({
  showScanMenu,
  restaurantId,
  restaurantName,
  onItemsExtracted,
  onCancel,
  debugData,
}: OCRMenuIntegrationProps) {
  const [showDebugData, setShowDebugData] = useState(false);

  // If in scan mode, show MenuScanStep
  if (showScanMenu) {
    return (
      <MenuScanStep
        restaurantId={restaurantId}
        restaurantName={restaurantName}
        onItemsExtracted={onItemsExtracted}
        onSkip={onCancel}
      />
    );
  }

  // Otherwise, render admin debug panel (if applicable)
  const user = pb.authStore.record as User | null;
  const isAdmin = user?.isAdmin === true;

  // Only show for admins when debug data is available
  if (!isAdmin || !debugData) {
    return null;
  }

  return (
    <Card className="border-2 border-purple-500 bg-purple-50">
      <CardContent className="pt-4 space-y-2">
        <button
          onClick={() => setShowDebugData(!showDebugData)}
          className="w-full flex items-center justify-between text-sm font-semibold text-purple-900"
        >
          <span className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            Admin Debug View (Last Gemini Response)
          </span>
          {showDebugData ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>

        {showDebugData && (
          <div className="space-y-3 text-xs">
            {/* Raw Response */}
            <div>
              <div className="font-semibold text-purple-900 mb-1">
                Raw Response:
              </div>
              <pre className="bg-white p-2 rounded border border-purple-300 overflow-x-auto text-purple-900 whitespace-pre-wrap break-words">
                {debugData.rawResponse}
              </pre>
            </div>

            {/* Model Info */}
            <div>
              <div className="font-semibold text-purple-900 mb-1">Model:</div>
              <div className="bg-white p-2 rounded border border-purple-300 text-purple-900">
                {debugData.model}
              </div>
            </div>

            {/* Candidates Count */}
            <div>
              <div className="font-semibold text-purple-900 mb-1">
                Candidates Count:
              </div>
              <div className="bg-white p-2 rounded border border-purple-300 text-purple-900">
                {debugData.candidatesCount}
              </div>
            </div>

            {/* Finish Reason */}
            {debugData.finishReason !== undefined && (
              <div>
                <div className="font-semibold text-purple-900 mb-1">
                  Finish Reason:
                </div>
                <div className="bg-white p-2 rounded border border-purple-300 text-purple-900">
                  {JSON.stringify(debugData.finishReason)}
                </div>
              </div>
            )}

            {/* Parts */}
            {debugData.parts && debugData.parts.length > 0 && (
              <div>
                <div className="font-semibold text-purple-900 mb-1">
                  Parts ({debugData.parts.length}):
                </div>
                <pre className="bg-white p-2 rounded border border-purple-300 overflow-x-auto text-purple-900 whitespace-pre-wrap break-words max-h-40">
                  {JSON.stringify(debugData.parts, null, 2)}
                </pre>
              </div>
            )}

            {/* Safety Ratings */}
            {debugData.safetyRatings && (
              <div>
                <div className="font-semibold text-purple-900 mb-1">
                  Safety Ratings:
                </div>
                <pre className="bg-white p-2 rounded border border-purple-300 overflow-x-auto text-purple-900 whitespace-pre-wrap break-words max-h-40">
                  {JSON.stringify(debugData.safetyRatings, null, 2)}
                </pre>
              </div>
            )}

            {/* Full JSON */}
            <div>
              <div className="font-semibold text-purple-900 mb-1">
                Full Debug JSON:
              </div>
              <pre className="bg-white p-2 rounded border border-purple-300 overflow-x-auto text-purple-900 whitespace-pre-wrap break-words max-h-60">
                {JSON.stringify(debugData, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
