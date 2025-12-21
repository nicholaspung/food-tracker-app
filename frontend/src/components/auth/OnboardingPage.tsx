import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronRight, ChevronLeft, UtensilsCrossed, Users, MapPin, Star } from "lucide-react";

interface OnboardingPageProps {
  onNavigateToSignUp: () => void;
  onNavigateToLogin: () => void;
}

const screens = [
  {
    icon: UtensilsCrossed,
    title: "Welcome to Yummy Recs",
    description: "Your one-stop shop to track what you ordered and see what your friends ordered to create your own local recommendation network.",
    gradient: "from-orange-500 to-red-500",
  },
  {
    icon: Star,
    title: "Rate & Remember",
    description: "Never forget that amazing dish you had. Rate your meals, add photos, and keep notes about what you loved (or didn't).",
    gradient: "from-yellow-500 to-orange-500",
  },
  {
    icon: Users,
    title: "Share with Friends",
    description: "Build your personal food network. See what your friends are eating and get authentic recommendations from people you trust.",
    gradient: "from-blue-500 to-purple-500",
  },
  {
    icon: MapPin,
    title: "Discover Local Gems",
    description: "Find the best dishes at every restaurant. Track your favorite spots and never wonder \"what should I order?\" again.",
    gradient: "from-green-500 to-teal-500",
  },
];

export default function OnboardingPage({ onNavigateToSignUp, onNavigateToLogin }: OnboardingPageProps) {
  const [currentScreen, setCurrentScreen] = useState(0);
  const isLastScreen = currentScreen === screens.length - 1;
  const isFirstScreen = currentScreen === 0;

  const handleNext = () => {
    if (isLastScreen) {
      onNavigateToSignUp();
    } else {
      setCurrentScreen((prev) => Math.min(prev + 1, screens.length - 1));
    }
  };

  const handleBack = () => {
    setCurrentScreen((prev) => Math.max(prev - 1, 0));
  };

  const currentScreenData = screens[currentScreen];
  const Icon = currentScreenData.icon;

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-background to-muted">
      {/* Logo Header */}
      {isFirstScreen && (
        <div className="pt-8 pb-4 flex justify-center items-center gap-3">
          <img
            src="/logo-speech-bubble-plate.svg"
            alt="Yummy Recs Logo"
            className="w-16 h-16"
          />
          <div className="text-2xl font-bold text-foreground">
            Yummy Recs
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        {/* Icon with gradient background */}
        <div className={`w-24 h-24 rounded-full bg-gradient-to-br ${currentScreenData.gradient} flex items-center justify-center mb-8 shadow-lg`}>
          <Icon className="w-12 h-12 text-white" strokeWidth={2} />
        </div>

        {/* Title */}
        <h1 className="text-3xl font-bold text-center mb-4 text-foreground px-4">
          {currentScreenData.title}
        </h1>

        {/* Description */}
        <p className="text-lg text-center text-muted-foreground w-full px-4 mb-8 leading-relaxed">
          {currentScreenData.description}
        </p>

        {/* Progress indicators */}
        <div className="flex gap-2 mb-12">
          {screens.map((_, index) => (
            <div
              key={index}
              className={`h-2 rounded-full transition-all duration-300 ${
                index === currentScreen
                  ? "w-8 bg-primary"
                  : "w-2 bg-muted-foreground/30"
              }`}
            />
          ))}
        </div>

        {/* Navigation buttons */}
        <div className="w-full px-4 space-y-3">
          <Button
            onClick={handleNext}
            className="w-full h-12 text-lg font-semibold"
            size="lg"
          >
            {isLastScreen ? "Get Started" : "Next"}
            {!isLastScreen && <ChevronRight className="ml-2 h-5 w-5" />}
          </Button>

          {!isFirstScreen && (
            <Button
              onClick={handleBack}
              variant="ghost"
              className="w-full"
              size="lg"
            >
              <ChevronLeft className="mr-2 h-5 w-5" />
              Back
            </Button>
          )}
        </div>
      </div>

      {/* Already have account link */}
      <div className="pb-8 text-center">
        <button
          onClick={onNavigateToLogin}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors underline"
        >
          Already have an account? Sign in
        </button>
      </div>
    </div>
  );
}
