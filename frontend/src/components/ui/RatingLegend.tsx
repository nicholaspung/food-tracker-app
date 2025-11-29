import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ChevronDown, ChevronUp } from "lucide-react";
import { RATING_OPTIONS } from "@/lib/ratingConstants";

interface RatingLegendProps {
  initiallyExpanded?: boolean;
}

export function RatingLegend({ initiallyExpanded = false }: RatingLegendProps) {
  const [isExpanded, setIsExpanded] = useState(initiallyExpanded);

  return (
    <Card className="border-2 border-blue-200 bg-blue-50/30 py-4">
      <CardContent className="px-4">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between"
        >
          <Label className="text-sm font-semibold text-gray-700 cursor-pointer">
            Rating Guide
          </Label>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-gray-600" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-600" />
          )}
        </button>
        {isExpanded && (
          <div className="space-y-2 mt-3">
            {RATING_OPTIONS.map((option) => (
              <div key={option.value} className="flex items-center gap-3">
                <div
                  className={`${option.color} text-white w-8 h-8 rounded-md flex items-center justify-center font-bold text-sm flex-shrink-0`}
                >
                  {option.value}
                </div>
                <span className="text-sm text-gray-700">
                  {option.label}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
