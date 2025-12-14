import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, DollarSign, Users, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { listBills } from '@/lib/billService';
import { formatCurrency, getBillSummary } from '@/lib/billCalculations';
import { pb } from '@/lib/pocketbase';
import CreateEvenSplitBillDialog from '@/components/bills/CreateEvenSplitBillDialog';
import CreateCustomSplitBillDialog from '@/components/bills/CreateCustomSplitBillDialog';
import BillDetailView from '@/components/bills/BillDetailView';
import type { BillWithDetails } from '@/lib/billService';

type FilterType = 'all' | 'you_owe' | 'you_are_owed' | 'settled';
type CreateDialogType = 'even' | 'custom' | null;

export default function BillsListView() {
  const [filter, setFilter] = useState<FilterType>('all');
  const [showCreateDialog, setShowCreateDialog] = useState<CreateDialogType>(null);
  const [selectedBillId, setSelectedBillId] = useState<string | null>(null);
  const currentUserId = pb.authStore.record?.id || '';

  // Show detail view if a bill is selected
  if (selectedBillId) {
    return (
      <BillDetailView
        billId={selectedBillId}
        onBack={() => setSelectedBillId(null)}
      />
    );
  }

  const { data: bills, isLoading, error } = useQuery({
    queryKey: ['bills', filter],
    queryFn: () => listBills(filter),
    enabled: !!currentUserId,
  });

  const renderBillCard = (bill: BillWithDetails) => {
    // Safety check for participants
    if (!bill.participants || !Array.isArray(bill.participants)) {
      return null;
    }

    const summary = getBillSummary(bill.participants, currentUserId);
    const isCreator = bill.creator_user === currentUserId;

    let statusColor = 'bg-gray-100 text-gray-800';
    let statusText = 'Active';
    let amountText = '';
    let amountColor = 'text-gray-900';

    if (bill.status === 'settled') {
      statusColor = 'bg-blue-100 text-blue-800';
      statusText = 'Settled';
      amountText = formatCurrency(summary.totalOwed);
    } else if (isCreator && summary.youAreOwed > 0) {
      statusColor = 'bg-green-100 text-green-800';
      statusText = 'You\'re owed';
      amountText = formatCurrency(summary.youAreOwed);
      amountColor = 'text-green-600';
    } else if (summary.youOwe > 0) {
      statusColor = 'bg-orange-100 text-orange-800';
      statusText = 'You owe';
      amountText = formatCurrency(summary.youOwe);
      amountColor = 'text-orange-600';
    } else if (summary.isFullyPaid) {
      statusColor = 'bg-blue-100 text-blue-800';
      statusText = 'Paid';
      amountText = formatCurrency(summary.totalOwed);
    }

    const participantCount = bill.participants.length;
    const daysSinceCreated = Math.floor(
      (Date.now() - new Date(bill.created).getTime()) / (1000 * 60 * 60 * 24)
    );
    const timeAgo =
      daysSinceCreated === 0
        ? 'Today'
        : daysSinceCreated === 1
        ? '1d ago'
        : `${daysSinceCreated}d ago`;

    return (
      <Card
        key={bill.id}
        className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setSelectedBillId(bill.id)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-5 h-5 text-gray-400 flex-shrink-0" />
              <h3 className="text-lg font-semibold text-gray-900 truncate">
                {bill.bill_name}
              </h3>
            </div>

            <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
              <div className="flex items-center gap-1">
                <Users className="w-4 h-4" />
                <span>{participantCount} people</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                <span>{timeAgo}</span>
              </div>
            </div>

            {bill.status !== 'settled' && (
              <div className="text-sm text-gray-500">
                {summary.paidCount} of {summary.totalCount} paid
              </div>
            )}
          </div>

          <div className="flex flex-col items-end gap-2">
            <Badge className={statusColor}>{statusText}</Badge>
            {amountText && (
              <div className={`text-lg font-bold ${amountColor}`}>
                {amountText}
              </div>
            )}
          </div>
        </div>
      </Card>
    );
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mb-4"></div>
        <p className="text-gray-600">Loading bills...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <div className="bg-red-50 rounded-full p-6 mb-4">
          <DollarSign className="w-12 h-12 text-red-600" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Error loading bills</h2>
        <p className="text-sm text-gray-600 text-center max-w-md">
          {error instanceof Error ? error.message : 'An unknown error occurred'}
        </p>
      </div>
    );
  }

  const filteredBills = bills || [];

  return (
    <>
      <CreateEvenSplitBillDialog
        open={showCreateDialog === 'even'}
        onClose={() => setShowCreateDialog(null)}
        onSuccess={billId => setSelectedBillId(billId)}
      />

      <CreateCustomSplitBillDialog
        open={showCreateDialog === 'custom'}
        onClose={() => setShowCreateDialog(null)}
        onSuccess={billId => setSelectedBillId(billId)}
      />

      <div className="flex flex-col h-full bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold text-gray-900">Bills</h1>
            <div className="flex gap-2">
              <Button onClick={() => setShowCreateDialog('even')} size="sm" variant="outline">
                Even Split
              </Button>
              <Button onClick={() => setShowCreateDialog('custom')} size="sm">
                <Plus className="w-4 h-4 mr-1" />
                Custom
              </Button>
            </div>
          </div>

        {/* Filters */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          {[
            { value: 'all', label: 'All' },
            { value: 'you_owe', label: 'You Owe' },
            { value: 'you_are_owed', label: 'You\'re Owed' },
            { value: 'settled', label: 'Settled' },
          ].map(({ value, label }) => (
            <Button
              key={value}
              variant={filter === value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(value as FilterType)}
              className="whitespace-nowrap"
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      {/* Bills List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {filteredBills.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <div className="bg-gray-100 rounded-full p-6 mb-4">
              <DollarSign className="w-12 h-12 text-gray-400" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              No bills yet
            </h2>
            <p className="text-sm text-gray-600 max-w-md mb-4">
              Split bills with friends and track payments easily
            </p>
            <div className="flex gap-2">
              <Button onClick={() => setShowCreateDialog('even')} variant="outline">
                Even Split
              </Button>
              <Button onClick={() => setShowCreateDialog('custom')}>
                <Plus className="w-4 h-4 mr-1" />
                Custom Split
              </Button>
            </div>
          </div>
        ) : (
          filteredBills.map(bill => renderBillCard(bill))
        )}
      </div>
    </div>
    </>
  );
}
