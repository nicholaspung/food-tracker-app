import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, Store, Camera } from "lucide-react";
import { ProcessType } from "@/types/photos";

interface ChoiceScreenProps {
  onSelectType: (type: ProcessType) => void;
  onBack: () => void;
}

/**
 * Choice Screen - Select between Restaurant Visit or Quick Track mode
 */
export function ChoiceScreen({ onSelectType, onBack }: ChoiceScreenProps) {
  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="flex items-center justify-between">
          <button
            onClick={onBack}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-2xl font-bold text-gray-900">Process Photos</h1>
          <div className="w-9" /> {/* Spacer for alignment */}
        </div>
        <p className="text-sm text-gray-500 mt-1">
          What would you like to track?
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 flex flex-col items-center justify-center gap-4">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Choose tracking type
        </h2>

        {/* Restaurant Visit Option */}
        <Card
          className="w-full max-w-md cursor-pointer hover:border-primary transition-colors"
          onClick={() => onSelectType("restaurant")}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Store className="w-5 h-5 text-primary" />
              Restaurant Visit
            </CardTitle>
            <CardDescription>
              Track a meal at a restaurant with multiple dishes
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Quick Track Items Option */}
        <Card
          className="w-full max-w-md cursor-pointer hover:border-primary transition-colors"
          onClick={() => onSelectType("quickTrack")}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Camera className="w-5 h-5 text-primary" />
              Quick Track Items
            </CardTitle>
            <CardDescription>
              Track individual items (snacks, groceries, homemade food, etc.)
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
