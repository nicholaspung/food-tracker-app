import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Users, DollarSign, CheckCircle, Clock, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { getBill, markParticipantPaid, markParticipantPending, settleBill, deleteBill } from '@/lib/billService';
import { formatCurrency, getBillSummary } from '@/lib/billCalculations';
import { pb } from '@/lib/pocketbase';

interface BillDetailViewProps {
  billId: string;
  onBack?: () => void;
}

export default function BillDetailView({ billId, onBack }: BillDetailViewProps) {
  const queryClient = useQueryClient();
  const currentUserId = pb.authStore.record?.id || '';
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showSettleDialog, setShowSettleDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: bill, isLoading, error: queryError } = useQuery({
    queryKey: ['bill', billId],
    queryFn: () => getBill(billId),
    enabled: !!billId,
  });

  // Helper function to safely get participant name
  const getParticipantName = (participant: any, isCurrentUser: boolean) => {
    if (isCurrentUser) return 'You';

    // Try to get name from expanded user data
    if (participant.expand?.user?.name) {
      return participant.expand.user.name;
    }

    // Try participant_name for non-app users
    if (participant.participant_name) {
      return participant.participant_name;
    }

    // Try email username from expanded user
    if (participant.expand?.user?.email) {
      return participant.expand.user.email.split('@')[0];
    }

    return 'Unknown';
  };

  const togglePaymentMutation = useMutation({
    mutationFn: async (participantId: string) => {
      const participant = bill?.participants.find(p => p.id === participantId);
      if (!participant) throw new Error('Participant not found');

      if (participant.paid_status === 'paid') {
        return await markParticipantPending(participantId);
      } else {
        return await markParticipantPaid(participantId, 'other');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bill', billId] });
      queryClient.invalidateQueries({ queryKey: ['bills'] });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to update payment status');
    },
  });

  const settleBillMutation = useMutation({
    mutationFn: () => settleBill(billId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bill', billId] });
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      setShowSettleDialog(false);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to settle bill');
    },
  });

  const deleteBillMutation = useMutation({
    mutationFn: () => deleteBill(billId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      onBack?.();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to delete bill');
    },
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mb-4"></div>
        <p className="text-gray-600">Loading bill...</p>
      </div>
    );
  }

  if (queryError) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <div className="bg-red-50 rounded-full p-6 mb-4">
          <DollarSign className="w-12 h-12 text-red-600" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Error loading bill</h2>
        <p className="text-sm text-gray-600 text-center max-w-md mb-4">
          {queryError instanceof Error ? queryError.message : 'An unknown error occurred'}
        </p>
        <Button onClick={onBack} variant="outline">
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to Bills
        </Button>
      </div>
    );
  }

  if (!bill) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <div className="bg-red-50 rounded-full p-6 mb-4">
          <DollarSign className="w-12 h-12 text-red-600" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Bill not found</h2>
        <Button onClick={onBack} variant="outline" className="mt-4">
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to Bills
        </Button>
      </div>
    );
  }

  // Safety check for participants array
  if (!bill.participants || !Array.isArray(bill.participants)) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <div className="bg-red-50 rounded-full p-6 mb-4">
          <DollarSign className="w-12 h-12 text-red-600" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Error loading bill data</h2>
        <p className="text-sm text-gray-600 text-center max-w-md mb-4">
          Bill participants data is invalid or missing
        </p>
        <Button onClick={onBack} variant="outline">
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to Bills
        </Button>
      </div>
    );
  }

  const summary = getBillSummary(bill.participants, currentUserId);
  const isCreator = bill.creator_user === currentUserId;
  const canEdit = isCreator && bill.status === 'active';

  const daysSinceCreated = Math.floor(
    (Date.now() - new Date(bill.created).getTime()) / (1000 * 60 * 60 * 24)
  );

  return (
    <>
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Bill?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this bill and all related data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteBillMutation.mutate()}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Settle Confirmation Dialog */}
      <AlertDialog open={showSettleDialog} onOpenChange={setShowSettleDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark Bill as Settled?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the bill as settled. You can reopen it later if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => settleBillMutation.mutate()}>
              Mark as Settled
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex flex-col h-full bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 py-4">
          <div className="flex items-center gap-3 mb-3">
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-gray-900 truncate">
                {bill.bill_name}
              </h1>
              <p className="text-sm text-gray-500">
                {daysSinceCreated === 0
                  ? 'Created today'
                  : `Created ${daysSinceCreated}d ago`}
              </p>
            </div>
            {bill.status === 'settled' && (
              <Badge className="bg-blue-100 text-blue-800">Settled</Badge>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Error Alert */}
          {error && (
            <Alert variant="destructive">
              <div className="text-sm">{error}</div>
            </Alert>
          )}

          {/* Summary Card */}
          <Card className="p-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Summary</h2>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Total Amount:</span>
                <span className="font-bold">{formatCurrency(bill.total_amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Split Type:</span>
                <span className="capitalize">{bill.split_mode}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Participants:</span>
                <span>{bill.participants.length} people</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Paid:</span>
                <span>
                  {summary.paidCount} of {summary.totalCount}
                </span>
              </div>

              {isCreator && summary.youAreOwed > 0 && (
                <div className="flex justify-between pt-2 border-t">
                  <span className="text-green-600 font-medium">You're owed:</span>
                  <span className="font-bold text-green-600">
                    {formatCurrency(summary.youAreOwed)}
                  </span>
                </div>
              )}

              {summary.youOwe > 0 && (
                <div className="flex justify-between pt-2 border-t">
                  <span className="text-orange-600 font-medium">You owe:</span>
                  <span className="font-bold text-orange-600">
                    {formatCurrency(summary.youOwe)}
                  </span>
                </div>
              )}
            </div>
          </Card>

          {/* Participants */}
          <Card className="p-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Users className="w-5 h-5" />
              Participants
            </h2>
            <div className="space-y-3">
              {bill.participants.map(participant => {
                const isCurrentUser = participant.user === currentUserId;
                const isPaid = participant.paid_status === 'paid';

                return (
                  <div
                    key={participant.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">
                        {getParticipantName(participant, isCurrentUser)}
                        {bill.creator_user === participant.user && (
                          <Badge variant="outline" className="ml-2 text-xs">
                            Paid
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-gray-600">
                        {formatCurrency(participant.amount_owed)}
                      </div>
                    </div>

                    {canEdit && !isCurrentUser ? (
                      <Button
                        variant={isPaid ? 'outline' : 'default'}
                        size="sm"
                        onClick={() => togglePaymentMutation.mutate(participant.id)}
                        disabled={togglePaymentMutation.isPending}
                        className={isPaid ? 'text-green-600 border-green-600' : ''}
                      >
                        {isPaid ? (
                          <>
                            <CheckCircle className="w-4 h-4 mr-1" />
                            Paid
                          </>
                        ) : (
                          <>
                            <Clock className="w-4 h-4 mr-1" />
                            Mark Paid
                          </>
                        )}
                      </Button>
                    ) : (
                      <div>
                        {isPaid ? (
                          <Badge className="bg-green-100 text-green-800">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Paid
                          </Badge>
                        ) : (
                          <Badge className="bg-orange-100 text-orange-800">
                            <Clock className="w-3 h-3 mr-1" />
                            Pending
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Actions */}
          {canEdit && (
            <Card className="p-4">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">Actions</h2>
              <div className="space-y-2">
                {summary.isFullyPaid && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setShowSettleDialog(true)}
                    disabled={settleBillMutation.isPending}
                  >
                    Mark as Settled
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="w-full text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={() => setShowDeleteDialog(true)}
                  disabled={deleteBillMutation.isPending}
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Delete Bill
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
