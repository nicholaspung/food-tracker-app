import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { pb } from "@/lib/pocketbase";

interface HomePageProps {
  onLogout?: () => void;
  onNavigateToProfile?: () => void;
}

export default function HomePage({ onLogout, onNavigateToProfile }: HomePageProps) {
  const handleLogout = () => {
    pb.authStore.clear();
    console.log("User logged out");
    onLogout?.();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4" data-testid="home-page">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl text-center" data-testid="home-title">
            Welcome!
          </CardTitle>
          <CardDescription className="text-center" data-testid="home-description">
            User is authenticated
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={onNavigateToProfile}
            className="w-full"
            data-testid="profile-button"
          >
            View Profile
          </Button>
          <Button
            onClick={handleLogout}
            variant="outline"
            className="w-full"
            data-testid="logout-button"
          >
            Log Out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
