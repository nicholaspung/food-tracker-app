import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { APP_VERSION } from '@/lib/version';
import { Sparkles, ArrowRight } from 'lucide-react';

interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  summary: string;
  features?: string[];
  improvements?: string[];
  fixes?: string[];
}

const STORAGE_KEY = 'whats-new-seen-version';

export function WhatsNewDialog() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const { data: changelog } = useQuery<ChangelogEntry[]>({
    queryKey: ['changelog'],
    queryFn: async () => {
      const response = await fetch('/changelog.json');
      if (!response.ok) {
        throw new Error('Failed to fetch changelog');
      }
      return response.json();
    },
  });

  // Check if user has seen this version's What's New
  useEffect(() => {
    const seenVersion = localStorage.getItem(STORAGE_KEY);

    // Show dialog if:
    // 1. We have changelog data
    // 2. User hasn't seen this version
    if (changelog && changelog.length > 0 && seenVersion !== APP_VERSION) {
      setOpen(true);
    }
  }, [changelog]);

  const handleClose = () => {
    // Mark this version as seen
    localStorage.setItem(STORAGE_KEY, APP_VERSION);
    setOpen(false);
  };

  const handleViewFullChangelog = () => {
    handleClose();
    navigate({ to: '/whats-new' });
  };

  if (!changelog || changelog.length === 0) {
    return null;
  }

  // Get the latest entry
  const latestEntry = changelog[0];

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-5 h-5 text-blue-600" />
            <Badge variant="default" className="bg-blue-600">
              v{latestEntry.version}
            </Badge>
          </div>
          <DialogTitle className="text-xl">{latestEntry.title}</DialogTitle>
          <DialogDescription className="text-sm text-gray-600">
            {latestEntry.summary}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Features */}
          {latestEntry.features && latestEntry.features.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center">
                <span className="mr-1.5">✨</span> New Features
              </h3>
              <ul className="space-y-1.5">
                {latestEntry.features.slice(0, 5).map((feature, idx) => (
                  <li key={idx} className="text-sm text-gray-700 flex items-start">
                    <span className="mr-2 mt-0.5 text-gray-400">•</span>
                    <span className="flex-1">{feature}</span>
                  </li>
                ))}
              </ul>
              {latestEntry.features.length > 5 && (
                <p className="text-xs text-gray-500 mt-2">
                  + {latestEntry.features.length - 5} more features
                </p>
              )}
            </div>
          )}

          {/* Improvements */}
          {latestEntry.improvements && latestEntry.improvements.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center">
                <span className="mr-1.5">🚀</span> Improvements
              </h3>
              <ul className="space-y-1.5">
                {latestEntry.improvements.slice(0, 3).map((improvement, idx) => (
                  <li key={idx} className="text-sm text-gray-700 flex items-start">
                    <span className="mr-2 mt-0.5 text-gray-400">•</span>
                    <span className="flex-1">{improvement}</span>
                  </li>
                ))}
              </ul>
              {latestEntry.improvements.length > 3 && (
                <p className="text-xs text-gray-500 mt-2">
                  + {latestEntry.improvements.length - 3} more improvements
                </p>
              )}
            </div>
          )}

          {/* Bug Fixes */}
          {latestEntry.fixes && latestEntry.fixes.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center">
                <span className="mr-1.5">🐛</span> Bug Fixes
              </h3>
              <ul className="space-y-1.5">
                {latestEntry.fixes.slice(0, 3).map((fix, idx) => (
                  <li key={idx} className="text-sm text-gray-700 flex items-start">
                    <span className="mr-2 mt-0.5 text-gray-400">•</span>
                    <span className="flex-1">{fix}</span>
                  </li>
                ))}
              </ul>
              {latestEntry.fixes.length > 3 && (
                <p className="text-xs text-gray-500 mt-2">
                  + {latestEntry.fixes.length - 3} more fixes
                </p>
              )}
            </div>
          )}

          {/* Instructions */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-xs text-blue-900">
              <span className="font-semibold">💡 Tip:</span> You can always review this
              and previous updates by going to{' '}
              <span className="font-semibold">Profile → What's New</span>
            </p>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={handleViewFullChangelog}
            className="w-full sm:w-auto"
          >
            View Full Changelog
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
          <Button onClick={handleClose} className="w-full sm:w-auto">
            Got it!
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
