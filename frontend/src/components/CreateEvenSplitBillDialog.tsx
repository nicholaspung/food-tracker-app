import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { pb } from '@/lib/pocketbase';
import { createBill } from '@/lib/billService';
import { calculateEvenSplit } from '@/lib/billCalculations';
import {
  validateBillName,
  validateTotalAmount,
  getFirstError,
} from '@/lib/billValidation';
import type { Friendship, User } from '@/lib/pocketbase';

interface CreateEvenSplitBillDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: (billId: string) => void;
}

export default function CreateEvenSplitBillDialog({
  open,
  onClose,
  onSuccess,
}: CreateEvenSplitBillDialogProps) {
  const queryClient = useQueryClient();
  const currentUserId = pb.authStore.record?.id || '';

  const [billName, setBillName] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

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

  const createBillMutation = useMutation({
    mutationFn: async () => {
      // Validate inputs
      const nameValidation = validateBillName(billName);
      if (!nameValidation.isValid) {
        throw new Error(getFirstError(nameValidation) || 'Invalid bill name');
      }

      const amount = parseFloat(totalAmount);
      const amountValidation = validateTotalAmount(amount);
      if (!amountValidation.isValid) {
        throw new Error(getFirstError(amountValidation) || 'Invalid amount');
      }

      if (selectedFriendIds.length === 0) {
        throw new Error('Please select at least one friend');
      }

      // Calculate even split
      const numberOfPeople = selectedFriendIds.length + 1; // Friends + current user
      const amountPerPerson = calculateEvenSplit(amount, numberOfPeople);

      // Build participants array
      const participants = [
        // Current user (paid)
        {
          user_id: currentUserId,
          amount_owed: amountPerPerson,
        },
        // Selected friends (pending)
        ...selectedFriendIds.map(friendId => ({
          user_id: friendId,
          amount_owed: amountPerPerson,
        })),
      ];

      // Create bill
      return await createBill({
        bill_name: billName,
        total_amount: amount,
        tax: 0,
        tip: 0,
        fees: 0,
        split_mode: 'even',
        extras_split_mode: 'equal',
        status: 'active',
        participants,
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      resetForm();
      onClose();
      // Call onSuccess after closing to avoid state updates on unmounted component
      setTimeout(() => onSuccess?.(data.id), 0);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to create bill');
    },
  });

  const resetForm = () => {
    setBillName('');
    setTotalAmount('');
    setSelectedFriendIds([]);
    setError(null);
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

  const amountPerPerson =
    totalAmount && selectedFriendIds.length > 0
      ? calculateEvenSplit(
          parseFloat(totalAmount) || 0,
          selectedFriendIds.length + 1
        )
      : 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Even Split Bill</DialogTitle>
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

          {/* Total Amount */}
          <div className="space-y-2">
            <Label htmlFor="total-amount">Total Amount ($)</Label>
            <Input
              id="total-amount"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={totalAmount}
              onChange={e => setTotalAmount(e.target.value)}
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
                        selectedFriendIds.includes(friend.id)
                          ? 'bg-blue-50'
                          : ''
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
                            <div className="text-sm text-gray-500">
                              {friend.email}
                            </div>
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

          {/* Preview */}
          {amountPerPerson > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="text-sm text-blue-900 font-medium mb-1">
                Split Preview
              </div>
              <div className="text-2xl font-bold text-blue-900">
                ${amountPerPerson.toFixed(2)}
              </div>
              <div className="text-sm text-blue-700">
                per person ({selectedFriendIds.length + 1} people)
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
            disabled={createBillMutation.isPending || !billName || !totalAmount || selectedFriendIds.length === 0}
          >
            {createBillMutation.isPending ? 'Creating...' : 'Create Bill'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
