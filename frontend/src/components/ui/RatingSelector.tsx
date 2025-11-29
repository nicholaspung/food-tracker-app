import { RATING_OPTIONS } from "@/lib/ratingConstants";

interface RatingSelectorProps {
  value: number | null;
  onChange: (value: number) => void;
  disabled?: boolean;
}

export function RatingSelector({
  value,
  onChange,
  disabled = false,
}: RatingSelectorProps) {
  return (
    <div>
      <div className="grid grid-cols-5 gap-2">
        {RATING_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            disabled={disabled}
            className={`p-3 rounded-lg text-white text-center text-xs font-medium transition-all ${
              option.color
            } ${
              value === option.value
                ? "ring-2 ring-offset-2 ring-blue-500"
                : "opacity-60 hover:opacity-100"
            }`}
          >
            {option.value}
          </button>
        ))}
      </div>
      <p className="text-xs text-gray-600 mt-2 text-center">
        {RATING_OPTIONS.find((o) => o.value === value)?.label}
      </p>
    </div>
  );
}
