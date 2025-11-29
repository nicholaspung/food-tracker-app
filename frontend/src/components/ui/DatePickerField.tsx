import { useState } from "react";
import { Calendar } from "lucide-react";
import { Label } from "./label";
import { Input } from "./input";
import { Button } from "./button";
import { formatLocalDateForDisplay, getTodayLocalDateString } from "@/lib/dateUtils";

interface DatePickerFieldProps {
  value: string;
  onChange: (value: string) => void;
  maxDate?: string;
  label?: string;
}

export function DatePickerField({
  value,
  onChange,
  maxDate = getTodayLocalDateString(),
  label = "Date",
}: DatePickerFieldProps) {
  const [showDateEdit, setShowDateEdit] = useState(false);

  if (!value) {
    return null;
  }

  return (
    <div>
      {!showDateEdit ? (
        <div
          className="flex items-center justify-between p-2.5 bg-white rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors"
          onClick={() => setShowDateEdit(true)}
        >
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-600" />
            <span className="text-sm font-medium text-gray-900">
              {formatLocalDateForDisplay(value)}
            </span>
          </div>
          <span className="text-xs text-gray-500">Tap to change</span>
        </div>
      ) : (
        <div className="p-2.5 rounded-lg bg-white border border-gray-200 space-y-2">
          <Label className="text-xs text-gray-600">{label}</Label>
          <Input
            type="date"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            max={maxDate}
            className="text-sm"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDateEdit(false)}
            className="w-full"
          >
            Done
          </Button>
        </div>
      )}
    </div>
  );
}
