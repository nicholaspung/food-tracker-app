import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface HomePageProps {
  onNavigateToProfile?: () => void;
}

export default function HomePage({ onNavigateToProfile }: HomePageProps) {

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4" data-testid="home-page">
      <div className="w-full max-w-md">
        <Card className="w-full">
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
