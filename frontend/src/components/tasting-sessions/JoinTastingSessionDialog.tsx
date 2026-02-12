import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useJoinTastingSession } from '@/hooks/api/useTastingSessions';
import { useErrorHandler } from '@/hooks/ui/useErrorHandler';

interface JoinTastingSessionDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (sessionId: string) => void;
}

export default function JoinTastingSessionDialog({
  open,
  onClose,
  onSuccess,
}: JoinTastingSessionDialogProps) {
  const [code, setCode] = useState('');
  const joinSession = useJoinTastingSession();
  const { error, handleError, clearError } = useErrorHandler({ source: 'JoinTastingSession' });

  const handleJoin = async () => {
    clearError();
    const trimmedCode = code.trim().toUpperCase();
    if (trimmedCode.length !== 6) {
      handleError(new Error('Please enter a valid 6-character code'));
      return;
    }

    try {
      const result = await joinSession.mutateAsync(trimmedCode);
      setCode('');
      onSuccess(result.sessionId);
    } catch (err) {
      handleError(err);
    }
  };

  const handleClose = () => {
    setCode('');
    clearError();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose(); }}>
      <DialogContent className="w-[95vw] max-w-md">
        <DialogHeader>
          <DialogTitle>Join Tasting Session</DialogTitle>
          <DialogDescription>
            Enter the 6-character invite code shared by the session leader.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <div className="p-3 bg-red-50 text-red-800 rounded-lg text-sm">
              {error.message}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="invite-code">Invite Code</Label>
            <Input
              id="invite-code"
              placeholder="e.g., ABC123"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleJoin(); } }}
              className="text-center text-2xl tracking-[0.5em] font-mono uppercase"
              maxLength={6}
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={handleClose} className="flex-1">
              Cancel
            </Button>
            <Button
              onClick={handleJoin}
              disabled={joinSession.isPending || code.trim().length !== 6}
              className="flex-1"
            >
              {joinSession.isPending ? 'Joining...' : 'Join Session'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
