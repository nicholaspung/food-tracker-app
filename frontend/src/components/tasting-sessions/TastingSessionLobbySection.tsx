import { useState } from 'react';
import { Copy, Check, RefreshCw, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useGenerateInviteCode } from '@/hooks/api/useTastingSessions';
import type { TastingSessionParticipant, TastingSessionInvite } from '@/lib/pocketbase';

interface TastingSessionLobbySectionProps {
  sessionId: string;
  participants: TastingSessionParticipant[];
  invites: TastingSessionInvite[];
  isLeader: boolean;
}

export default function TastingSessionLobbySection({
  sessionId,
  participants,
  invites,
  isLeader,
}: TastingSessionLobbySectionProps) {
  const [copied, setCopied] = useState(false);
  const generateCode = useGenerateInviteCode();

  // Get the most recent unused invite code
  const activeInvite = invites.find(inv => !inv.used_by && new Date(inv.expires_at) > new Date());
  const inviteCode = activeInvite?.code;

  const handleCopy = async () => {
    if (!inviteCode) return;
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for non-HTTPS
      const textArea = document.createElement('textarea');
      textArea.value = inviteCode;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleGenerateNew = async () => {
    try {
      await generateCode.mutateAsync(sessionId);
    } catch {
      // Error handled by mutation
    }
  };

  return (
    <div className="bg-white rounded-lg p-4 space-y-4">
      {/* Invite Code Section */}
      <div>
        <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
          <Users className="w-4 h-4" />
          Invite Friends
        </h3>
        {inviteCode ? (
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-purple-50 border-2 border-purple-200 rounded-lg p-3 text-center">
              <p className="text-2xl font-mono font-bold tracking-[0.3em] text-purple-700">
                {inviteCode}
              </p>
              <p className="text-xs text-gray-500 mt-1">Share this code with friends</p>
            </div>
            <div className="flex flex-col gap-2">
              <Button variant="outline" size="sm" onClick={handleCopy} className="min-w-[80px]">
                {copied ? (
                  <><Check className="w-4 h-4 mr-1 text-green-600" />Copied</>
                ) : (
                  <><Copy className="w-4 h-4 mr-1" />Copy</>
                )}
              </Button>
              {isLeader && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleGenerateNew}
                  disabled={generateCode.isPending}
                  className="min-w-[80px]"
                >
                  <RefreshCw className={`w-4 h-4 mr-1 ${generateCode.isPending ? 'animate-spin' : ''}`} />
                  New
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-3">
            {isLeader ? (
              <Button onClick={handleGenerateNew} disabled={generateCode.isPending} variant="outline">
                <RefreshCw className={`w-4 h-4 mr-2 ${generateCode.isPending ? 'animate-spin' : ''}`} />
                Generate Invite Code
              </Button>
            ) : (
              <p className="text-sm text-gray-500">No active invite code</p>
            )}
          </div>
        )}
      </div>

      {/* Participant List */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-2">
          Participants ({participants.length})
        </h4>
        <div className="space-y-2">
          {participants.map((participant) => (
            <div key={participant.id} className="flex items-center gap-2">
              <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                <span className="text-purple-600 font-medium text-xs">
                  {(participant.expand?.user?.name || participant.expand?.user?.email || '?')[0].toUpperCase()}
                </span>
              </div>
              <span className="text-sm text-gray-700">
                {participant.expand?.user?.name || participant.expand?.user?.email || 'Unknown'}
              </span>
              {participant.expand?.session?.leader === participant.user && (
                <Badge variant="outline" className="text-xs">Leader</Badge>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
