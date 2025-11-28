import { useNavigate } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Utensils, Zap, Images, ChevronRight, ArrowLeft } from "lucide-react";

export default function AddVisitOptionSelector() {
  const navigate = useNavigate();

  const options = [
    {
      id: "restaurant-visit",
      title: "Track Restaurant Visit",
      description: "Full experience with restaurant, menu items, and ratings",
      icon: Utensils,
      color: "bg-blue-500",
      path: "/add-visit/select-restaurant",
    },
    {
      id: "quick-track",
      title: "Quick Track Item",
      description: "Quickly rate any item without a restaurant",
      icon: Zap,
      color: "bg-green-500",
      path: "/quick-track",
    },
    {
      id: "process-photos",
      title: "Process Saved Photos",
      description: "Upload multiple photos and rate each one",
      icon: Images,
      color: "bg-purple-500",
      path: "/process-photos",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b">
        <div className="flex items-center justify-between p-4">
          <button
            onClick={() => navigate({ to: "/home" })}
            className="p-2 hover:bg-accent rounded-lg transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-xl font-semibold">Add New</h1>
          <div className="w-9" /> {/* Spacer for alignment */}
        </div>
      </div>

      {/* Options */}
      <div className="p-4 space-y-3">
        <p className="text-sm text-muted-foreground mb-4">
          Choose how you want to track your food:
        </p>

        {options.map((option) => {
          const Icon = option.icon;
          return (
            <button
              key={option.id}
              onClick={() => navigate({ to: option.path })}
              className="w-full text-left"
            >
              <Card className="hover:shadow-lg transition-shadow border-2 hover:border-primary">
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    {/* Icon */}
                    <div
                      className={`${option.color} p-3 rounded-lg flex-shrink-0`}
                    >
                      <Icon className="h-6 w-6 text-white" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-base mb-1">
                        {option.title}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {option.description}
                      </p>
                    </div>

                    {/* Arrow */}
                    <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-1" />
                  </div>
                </CardContent>
              </Card>
            </button>
          );
        })}
      </div>
    </div>
  );
}
