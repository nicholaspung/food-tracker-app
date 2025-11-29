import { Users } from "lucide-react";

type EntityType = "item" | "visit" | "visits";

interface VisibilityToggleProps {
  value: "friends" | "private";
  onChange: (value: "friends" | "private") => void;
  entityType: EntityType;
  disabled?: boolean;
}

const ENTITY_CONFIG: Record<
  EntityType,
  {
    label: string;
    friendsDescription: string;
    privateDescription: string;
  }
> = {
  item: {
    label: "Friends can view this item",
    friendsDescription: "Your friends will be able to see this quick track item",
    privateDescription: "Only you will be able to see this item",
  },
  visit: {
    label: "Friends can view this visit",
    friendsDescription:
      "Your friends will be able to see this visit and your ratings",
    privateDescription: "Only you will be able to see this visit",
  },
  visits: {
    label: "Friends can view these visits",
    friendsDescription:
      "Your friends will be able to see these visits and your ratings",
    privateDescription: "Only you will be able to see these visits",
  },
};

export function VisibilityToggle({
  value,
  onChange,
  entityType,
  disabled = false,
}: VisibilityToggleProps) {
  const config = ENTITY_CONFIG[entityType];

  return (
    <div className="p-3 bg-white rounded-lg border border-gray-200">
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={value === "friends"}
          onChange={(e) => onChange(e.target.checked ? "friends" : "private")}
          disabled={disabled}
          className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
        />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-gray-600" />
            <span className="text-sm font-medium">{config.label}</span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {value === "friends"
              ? config.friendsDescription
              : config.privateDescription}
          </p>
        </div>
      </label>
    </div>
  );
}
