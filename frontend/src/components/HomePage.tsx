import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { pb } from "@/lib/pocketbase";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";

interface HomePageProps {
  onLogout?: () => void;
  onNavigateToProfile?: () => void;
  onNavigateToWhatsNew?: () => void;
}

interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  summary: string;
}

const LAST_VIEWED_VERSION_KEY = 'lastViewedChangelogVersion';

export default function HomePage({ onLogout, onNavigateToProfile, onNavigateToWhatsNew }: HomePageProps) {
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);

  // Load dismissed version from localStorage on mount
  useEffect(() => {
    const lastViewed = localStorage.getItem(LAST_VIEWED_VERSION_KEY);
    setDismissedVersion(lastViewed);
  }, []);

  // Fetch changelog to check for new releases
  const { data: changelog } = useQuery<ChangelogEntry[]>({
    queryKey: ['changelog'],
    queryFn: async () => {
      const response = await fetch('/changelog.json');
      if (!response.ok) {
        throw new Error('Failed to fetch changelog');
      }
      return response.json();
    },
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });

  const latestVersion = changelog?.[0]?.version;
  const hasNewRelease = latestVersion && latestVersion !== dismissedVersion;

  const handleLogout = () => {
    pb.authStore.clear();
    console.log("User logged out");
    onLogout?.();
  };

  const handleDismissUpdate = () => {
    if (latestVersion) {
      localStorage.setItem(LAST_VIEWED_VERSION_KEY, latestVersion);
      setDismissedVersion(latestVersion);
    }
  };

  const handleViewWhatsNew = () => {
    if (latestVersion) {
      localStorage.setItem(LAST_VIEWED_VERSION_KEY, latestVersion);
      setDismissedVersion(latestVersion);
    }
    onNavigateToWhatsNew?.();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4" data-testid="home-page">
      <div className="w-full max-w-md space-y-4">
        {/* New Release Notification */}
        {hasNewRelease && (
          <Card className="border-blue-500 border-2 bg-blue-50" data-testid="new-release-banner">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="default" className="bg-blue-600">
                      New Update
                    </Badge>
                    <span className="text-xs font-semibold text-blue-900">
                      v{latestVersion}
                    </span>
                  </div>
                  <CardDescription className="text-blue-800 text-sm">
                    {changelog?.[0]?.title}
                  </CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDismissUpdate}
                  className="h-6 w-6 p-0 text-blue-600 hover:text-blue-800 hover:bg-blue-100"
                  data-testid="dismiss-update-button"
                  aria-label="Dismiss update notification"
                >
                  ✕
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <Button
                onClick={handleViewWhatsNew}
                className="w-full bg-blue-600 hover:bg-blue-700"
                data-testid="view-whats-new-button"
              >
                View What's New
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Main Home Card */}
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
            <Button
              onClick={handleViewWhatsNew}
              variant="outline"
              className="w-full"
              data-testid="whats-new-button"
            >
              What's New
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
    </div>
  );
}
