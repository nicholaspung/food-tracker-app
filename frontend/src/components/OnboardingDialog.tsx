import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { pb } from '@/lib/pocketbase';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface OnboardingDialogProps {
  open: boolean;
  onComplete: () => void;
}

export default function OnboardingDialog({ open, onComplete }: OnboardingDialogProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const updateNameMutation = useMutation({
    mutationFn: async (newName: string) => {
      const userId = pb.authStore.record?.id;
      if (!userId) throw new Error('Not authenticated');

      return await pb.collection('users').update(userId, {
        name: newName,
      });
    },
    onSuccess: () => {
      onComplete();
    },
    onError: (err: any) => {
      setError(err.message || 'Failed to update name');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Please enter your name');
      return;
    }

    updateNameMutation.mutate(name.trim());
  };

  const handleSkip = () => {
    onComplete();
  };

  return (
    <AlertDialog open={open} onOpenChange={(isOpen) => !isOpen && handleSkip()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Welcome! 👋</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4">
              <p>Let's get you set up. What should we call you?</p>

              {error && (
                <div className="p-3 text-sm text-red-500 bg-red-50 border border-red-200 rounded-md">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="onboarding-name">Your Name</Label>
                  <Input
                    id="onboarding-name"
                    type="text"
                    placeholder="Enter your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={updateNameMutation.isPending}
                    autoFocus
                    data-testid="onboarding-name-input"
                  />
                  <p className="text-xs text-gray-500">
                    This will be shown to your friends when you share visits
                  </p>
                </div>
              </form>

              <p className="text-xs text-gray-400">
                You can always change this later in your profile
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <div className="flex flex-col gap-2 w-full">
            <Button
              type="submit"
              onClick={handleSubmit}
              disabled={updateNameMutation.isPending}
              className="w-full"
              data-testid="onboarding-submit-button"
            >
              {updateNameMutation.isPending ? 'Saving...' : 'Continue'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleSkip}
              disabled={updateNameMutation.isPending}
              className="w-full"
              data-testid="onboarding-skip-button"
            >
              Skip for Now
            </Button>
          </div>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
