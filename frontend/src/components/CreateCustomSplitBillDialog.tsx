import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X, DollarSign } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { pb } from '@/lib/pocketbase';
import { createBill } from '@/lib/billService';
import { validateBillName, getFirstError } from '@/lib/billValidation';
import type { Friendship, User } from '@/lib/pocketbase';

interface CreateCustomSplitBillDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: (billId: string) => void;
}

interface ParticipantAmount {
  userId: string;
  userName: string;
  amount: string; // String for input control
}

export default function CreateCustomSplitBillDialog({
  open,
  onClose,
  onSuccess,
}: CreateCustomSplitBillDialogProps) {
  const queryClient = useQueryClient();
  const currentUserId = pb.authStore.record?.id || '';
  const currentUserEmail = pb.authStore.record?.email || '';

  const [billName, setBillName] = useState('');
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const [participantAmounts, setParticipantAmounts] = useState<ParticipantAmount[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pendingBillId, setPendingBillId] = useState<string | null>(null);

  // Fetch friends list
  const { data: friendships } = useQuery({
    queryKey: ['friendships', currentUserId],
    queryFn: async () => {
      const records = await pb.collection('friendships').getFullList<Friendship>({
        filter: `(user="${currentUserId}" || friend="${currentUserId}") && status="accepted"`,
        expand: 'user,friend',
      });
      return records;
    },
    enabled: open && !!currentUserId,
  });

  // Get list of friend users
  const friends =
    friendships
      ?.map(friendship => {
        const friendUser =
          friendship.user === currentUserId
            ? (friendship.expand?.friend as User)
            : (friendship.expand?.user as User);
        return friendUser;
      })
      .filter((friend): friend is User => friend !== undefined && friend !== null) || [];

  // Update participant amounts when friends are selected/deselected
  useEffect(() => {
    const newParticipants: ParticipantAmount[] = [
      // Current user always first
      {
        userId: currentUserId,
        userName: 'You',
        amount: participantAmounts.find(p => p.userId === currentUserId)?.amount || '',
      },
      // Selected friends
      ...selectedFriendIds.map(friendId => {
        const friend = friends.find(f => f.id === friendId);
        const existingAmount = participantAmounts.find(p => p.userId === friendId);
        return {
          userId: friendId,
          userName: friend?.name || friend?.email?.split('@')[0] || 'Unknown',
          amount: existingAmount?.amount || '',
        };
      }),
    ];
    setParticipantAmounts(newParticipants);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFriendIds, currentUserId]);

  const createBillMutation = useMutation({
    mutationFn: async () => {
      // Validate inputs
      const nameValidation = validateBillName(billName);
      if (!nameValidation.isValid) {
        throw new Error(getFirstError(nameValidation) || 'Invalid bill name');
      }

      if (selectedFriendIds.length === 0) {
        throw new Error('Please select at least one friend');
      }

      // Validate all amounts are entered and valid
      for (const participant of participantAmounts) {
        const amount = parseFloat(participant.amount);
        if (!participant.amount || isNaN(amount) || amount <= 0) {
          throw new Error(`Please enter a valid amount for ${participant.userName}`);
        }
      }

      // Calculate total
      const totalAmount = participantAmounts.reduce(
        (sum, p) => sum + parseFloat(p.amount),
        0
      );

      if (totalAmount <= 0) {
        throw new Error('Total amount must be greater than $0');
      }

      // Build participants array
      const participants = participantAmounts.map(p => ({
        user_id: p.userId,
        amount_owed: parseFloat(p.amount),
      }));

      // Create bill
      return await createBill({
        bill_name: billName,
        total_amount: totalAmount,
        tax: 0,
        tip: 0,
        fees: 0,
        split_mode: 'custom',
        extras_split_mode: 'equal',
        status: 'active',
        participants,
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      setPendingBillId(data.id);
      resetForm();
      onClose();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to create bill');
    },
  });

  // Navigate to bill detail after dialog is fully closed
  useEffect(() => {
    if (!open && pendingBillId) {
      onSuccess?.(pendingBillId);
      setPendingBillId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pendingBillId]);

  const resetForm = () => {
    setBillName('');
    setSelectedFriendIds([]);
    setParticipantAmounts([]);
    setError(null);
    setPendingBillId(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const toggleFriend = (friendId: string) => {
    setSelectedFriendIds(prev =>
      prev.includes(friendId)
        ? prev.filter(id => id !== friendId)
        : [...prev, friendId]
    );
  };

  const updateParticipantAmount = (userId: string, amount: string) => {
    setParticipantAmounts(prev =>
      prev.map(p => (p.userId === userId ? { ...p, amount } : p))
    );
  };

  const totalAmount = participantAmounts.reduce((sum, p) => {
    const amount = parseFloat(p.amount);
    return sum + (isNaN(amount) ? 0 : amount);
  }, 0);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Custom Split Bill</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Bill Name */}
          <div className="space-y-2">
            <Label htmlFor="bill-name">Bill Name</Label>
            <Input
              id="bill-name"
              placeholder="e.g., Dinner at Joe's"
              value={billName}
              onChange={e => setBillName(e.target.value)}
            />
          </div>

          {/* Select Friends */}
          <div className="space-y-2">
            <Label>Split With (select friends)</Label>
            <div className="border rounded-lg max-h-48 overflow-y-auto">
              {friends.length === 0 ? (
                <div className="p-4 text-center text-gray-500 text-sm">
                  No friends found. Add friends first to split bills with them.
                </div>
              ) : (
                <div className="divide-y">
                  {friends.map(friend => (
                    <button
                      key={friend.id}
                      type="button"
                      onClick={() => toggleFriend(friend.id)}
                      className={`w-full p-3 text-left hover:bg-gray-50 transition-colors ${
                        selectedFriendIds.includes(friend.id) ? 'bg-blue-50' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={selectedFriendIds.includes(friend.id)}
                          onChange={() => {}}
                          className="w-4 h-4"
                        />
                        <div>
                          <div className="font-medium text-gray-900">
                            {friend.name || friend.email?.split('@')[0] || 'Unknown'}
                          </div>
                          {friend.name && (
                            <div className="text-sm text-gray-500">{friend.email}</div>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {selectedFriendIds.length > 0 && (
              <div className="text-sm text-gray-600">
                {selectedFriendIds.length} friend
                {selectedFriendIds.length !== 1 ? 's' : ''} selected
              </div>
            )}
          </div>

          {/* Per-Person Amounts */}
          {participantAmounts.length > 0 && (
            <div className="space-y-2">
              <Label>Enter Amount Each Person Owes</Label>
              <div className="space-y-3">
                {participantAmounts.map(participant => (
                  <div
                    key={participant.userId}
                    className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900">
                        {participant.userName}
                      </div>
                    </div>
                    <div className="w-32">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={participant.amount}
                        onChange={e =>
                          updateParticipantAmount(participant.userId, e.target.value)
                        }
                        className="text-right"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Total Preview */}
          {totalAmount > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-blue-900 font-medium">Total Bill</div>
                <div className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-blue-900" />
                  <div className="text-2xl font-bold text-blue-900">
                    ${totalAmount.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <Alert variant="destructive">
              <div className="flex items-start gap-2">
                <X className="w-4 h-4 mt-0.5" />
                <div className="text-sm">{error}</div>
              </div>
            </Alert>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={handleClose}
            className="flex-1"
            disabled={createBillMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={() => createBillMutation.mutate()}
            className="flex-1"
            disabled={
              createBillMutation.isPending ||
              !billName ||
              selectedFriendIds.length === 0 ||
              totalAmount === 0
            }
          >
            {createBillMutation.isPending ? 'Creating...' : 'Create Bill'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
