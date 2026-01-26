import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Users, DollarSign, CheckCircle, Clock, Trash2, Pencil, X, Save, Plus, Check, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { DeleteConfirmationDialog } from '@/components/ui/DeleteConfirmationDialog';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { getBill, markParticipantPaid, markParticipantPending, settleBill, deleteBill, updateBill, updateParticipantFull, updateBillItem, deleteBillItem, createBillItem } from '@/lib/billService';
import { formatCurrency, getBillSummary } from '@/lib/billCalculations';
import { pb, BillParticipant } from '@/lib/pocketbase';
import { useErrorHandler } from '@/hooks/ui/useErrorHandler';
import { ErrorDisplay } from '@/components/shared/ErrorDisplay';
import { ERROR_MESSAGES } from '@/lib/errorMessages';
import { useTrackEvent } from '@/hooks/ui/useTrackEvent';
import { ANALYTICS_EVENTS } from '@/constants/analyticsEvents';

// Types for editing itemized bills
interface ItemSplit {
  participantId: string; // Using participant.id (not user.id)
  type: 'percentage' | 'amount';
  value: number;
}

interface EditBillItem {
  id: string; // Can be DB id or temp id for new items
  isNew?: boolean; // True if this is a new item not yet in DB
  name: string;
  price: string;
  assignedTo: string[]; // Participant IDs for simple mode
  isAdvanced: boolean;
  advancedSplits: ItemSplit[]; // Custom splits for advanced mode
}

// Field error types for highlighting
interface FieldErrors {
  items: Map<string, string>; // itemId -> error message
  customTips: Map<string, string>; // participantId -> error message
  advancedSplits: Map<string, Map<string, string>>; // itemId -> (participantId -> error)
}

interface BillDetailViewProps {
  billId: string;
  onBack?: () => void;
}

export default function BillDetailView({ billId, onBack }: BillDetailViewProps) {
  const queryClient = useQueryClient();
  const currentUserId = pb.authStore.record?.id || '';
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showSettleDialog, setShowSettleDialog] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editBillName, setEditBillName] = useState('');
  const [editTax, setEditTax] = useState('');
  const [editTip, setEditTip] = useState('');
  const [editCustomTips, setEditCustomTips] = useState<Map<string, number>>(new Map());
  // Item editing state (for itemized bills)
  const [editItems, setEditItems] = useState<EditBillItem[]>([]);
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [expandedBreakdowns, setExpandedBreakdowns] = useState<Set<string>>(new Set());
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({
    items: new Map(),
    customTips: new Map(),
    advancedSplits: new Map(),
  });

  // Refs for scrolling to errors
  const errorRefs = useRef<Map<string, HTMLElement | null>>(new Map());
  const setErrorRef = useCallback((key: string, el: HTMLElement | null) => {
    if (el) {
      errorRefs.current.set(key, el);
    } else {
      errorRefs.current.delete(key);
    }
  }, []);

  const scrollToFirstError = useCallback((errors: FieldErrors) => {
    const firstItemError = Array.from(errors.items.keys())[0];
    if (firstItemError) {
      const el = errorRefs.current.get(`item-${firstItemError}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const firstTipError = Array.from(errors.customTips.keys())[0];
    if (firstTipError) {
      const el = errorRefs.current.get(`tip-${firstTipError}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    for (const [itemId, splitErrors] of errors.advancedSplits) {
      const firstSplitError = Array.from(splitErrors.keys())[0];
      if (firstSplitError) {
        const el = errorRefs.current.get(`split-${itemId}-${firstSplitError}`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
    }
  }, []);

  const clearFieldErrors = useCallback(() => {
    setFieldErrors({
      items: new Map(),
      customTips: new Map(),
      advancedSplits: new Map(),
    });
  }, []);

  const { error, handleError, clearError, showValidation } = useErrorHandler({
    source: 'BillDetailView',
    defaultSeverity: 'error',
  });
  const trackEvent = useTrackEvent();

  const { data: bill, isLoading, error: queryError } = useQuery({
    queryKey: ['bill', billId],
    queryFn: () => getBill(billId),
    enabled: !!billId,
  });

  // Create a Map for O(1) participant lookups by ID
  const participantsById = useMemo(() => {
    const map = new Map<string, BillParticipant>();
    bill?.participants?.forEach((participant) => {
      map.set(participant.id, participant);
    });
    return map;
  }, [bill?.participants]);

  // Helper function to safely get participant name
  const getParticipantName = (participant: BillParticipant, isCurrentUser: boolean) => {
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
      const participant = participantsById.get(participantId);
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
      handleError(err, { customMessage: ERROR_MESSAGES.GENERIC.UPDATE_FAILED("payment status") });
    },
  });

  const settleBillMutation = useMutation({
    mutationFn: () => settleBill(billId),
    onSuccess: () => {
      // Track bill settled
      if (bill) {
        trackEvent(ANALYTICS_EVENTS.BILL_SETTLED, {
          source: 'BillDetailView',
          splitMode: bill.split_mode,
          participantCount: bill.participants?.length || 0,
          totalAmount: bill.total_amount,
          daysSinceCreated: Math.floor(
            (Date.now() - new Date(bill.created).getTime()) / (1000 * 60 * 60 * 24)
          ),
        });
      }

      queryClient.invalidateQueries({ queryKey: ['bill', billId] });
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      setShowSettleDialog(false);
    },
    onError: (err) => {
      handleError(err, { customMessage: "Failed to settle bill" });
    },
  });

  const deleteBillMutation = useMutation({
    mutationFn: () => deleteBill(billId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      onBack?.();
    },
    onError: (err) => {
      handleError(err, { customMessage: ERROR_MESSAGES.GENERIC.DELETE_FAILED("bill") });
    },
  });

  const saveBillMutation = useMutation({
    mutationFn: async () => {
      if (!bill) throw new Error('Bill not found');
      if (!editPreview) throw new Error('Preview not calculated');

      // Clear previous errors
      clearFieldErrors();
      clearError();

      const newErrors: FieldErrors = {
        items: new Map(),
        customTips: new Map(),
        advancedSplits: new Map(),
      };
      let hasErrors = false;
      const errorMessages: string[] = [];

      const newTax = parseFloat(editTax) || 0;
      const newTip = parseFloat(editTip) || 0;

      // For itemized bills, validate items
      if (bill.split_mode === 'itemized') {
        if (editItems.length === 0) {
          errorMessages.push('Please add at least one item');
          hasErrors = true;
        }

        // Validate each item
        for (const item of editItems) {
          if (item.isAdvanced) {
            // Check all participants have values filled
            if (item.advancedSplits.length === 0) {
              newErrors.items.set(item.id, 'Add participants to split this item');
              hasErrors = true;
              continue;
            }

            // Check for empty values
            const splitErrors = new Map<string, string>();
            for (const split of item.advancedSplits) {
              if (split.value === 0 || split.value === undefined || isNaN(split.value)) {
                splitErrors.set(split.participantId, 'Value required');
                hasErrors = true;
              }
            }
            if (splitErrors.size > 0) {
              newErrors.advancedSplits.set(item.id, splitErrors);
            }

            // Validate total
            const validation = validateEditAdvancedSplit(item);
            if (!validation.valid) {
              newErrors.items.set(item.id, validation.error || 'Invalid split');
              hasErrors = true;
            }
          } else if (item.assignedTo.length === 0) {
            newErrors.items.set(item.id, 'Assign participants');
            hasErrors = true;
          }
        }
      }

      // Validate custom tip contributions - if ANY are set, ALL must be set AND sum must equal total tip
      if (editCustomTips.size > 0 && newTip > 0) {
        let customTipSum = 0;
        for (const participant of bill.participants) {
          const customTip = editCustomTips.get(participant.id);
          if (customTip === undefined || customTip === 0 || isNaN(customTip)) {
            newErrors.customTips.set(participant.id, 'Required when using custom tips');
            hasErrors = true;
          } else {
            customTipSum += customTip;
          }
        }

        // Check that custom tips sum to total tip
        if (!hasErrors && Math.abs(customTipSum - newTip) > 0.01) {
          const diff = customTipSum - newTip;
          const diffText = diff > 0
            ? `$${diff.toFixed(2)} over`
            : `$${Math.abs(diff).toFixed(2)} under`;
          errorMessages.push(`Custom tips must sum to $${newTip.toFixed(2)} (currently ${diffText})`);
          // Mark all custom tips as needing attention
          for (const participant of bill.participants) {
            newErrors.customTips.set(participant.id, `Sum must equal $${newTip.toFixed(2)}`);
          }
          hasErrors = true;
        }
      }

      // If there are errors, set them and scroll to first error
      if (hasErrors) {
        setFieldErrors(newErrors);
        for (const [, msg] of newErrors.items) {
          if (!errorMessages.includes(msg)) errorMessages.push(msg);
        }
        for (const [, msg] of newErrors.customTips) {
          if (!errorMessages.includes(msg)) errorMessages.push(msg);
        }
        for (const [, splitMap] of newErrors.advancedSplits) {
          for (const [, msg] of splitMap) {
            if (!errorMessages.includes(msg)) errorMessages.push(msg);
          }
        }

        setTimeout(() => scrollToFirstError(newErrors), 100);
        throw new Error(errorMessages[0] || 'Please fix the highlighted errors');
      }

      const subtotal = editPreview.subtotal;
      const newTotal = subtotal + newTax + newTip;

      // Update the bill
      await updateBill(billId, {
        bill_name: editBillName,
        tax: Math.round(newTax * 100) / 100,
        tip: Math.round(newTip * 100) / 100,
        total_amount: Math.round(newTotal * 100) / 100,
      });

      // For itemized bills, update items
      if (bill.split_mode === 'itemized' && bill.items) {
        const existingItemIds = new Set(bill.items.map(i => i.id));
        const editItemIds = new Set(editItems.filter(i => !i.isNew).map(i => i.id));

        // Delete removed items
        for (const existingId of existingItemIds) {
          if (!editItemIds.has(existingId)) {
            await deleteBillItem(existingId);
          }
        }

        // Update existing items and create new ones
        for (const item of editItems) {
          const assignedToParticipantIds = item.isAdvanced
            ? item.advancedSplits.map(s => s.participantId)
            : item.assignedTo;

          const splitConfig = item.isAdvanced && item.advancedSplits.length > 0
            ? item.advancedSplits.map(split => ({
                participant_id: split.participantId,
                type: split.type,
                value: split.value,
              }))
            : null;

          if (item.isNew) {
            // Create new item
            await createBillItem(billId, {
              item_name: item.name,
              price: parseFloat(item.price) || 0,
              assigned_to: assignedToParticipantIds,
              split_mode: item.isAdvanced ? 'advanced' : 'simple',
              split_config: splitConfig,
            });
          } else {
            // Update existing item
            await updateBillItem(item.id, {
              item_name: item.name,
              price: parseFloat(item.price) || 0,
              assigned_to: assignedToParticipantIds,
              split_mode: item.isAdvanced ? 'advanced' : 'simple',
              split_config: splitConfig,
            });
          }
        }
      }

      // Update each participant with new amounts and custom tips
      for (const participant of bill.participants) {
        const newAmount = editPreview.participantPreviews.get(participant.id) || 0;
        const customTip = editCustomTips.get(participant.id);

        await updateParticipantFull(
          participant.id,
          newAmount,
          customTip && customTip > 0 ? customTip : null
        );
      }
    },
    onSuccess: () => {
      // Clear any remaining errors on success
      clearFieldErrors();
      clearError();

      queryClient.invalidateQueries({ queryKey: ['bill', billId] });
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      setIsEditMode(false);
    },
    onError: (err) => {
      handleError(err, { customMessage: ERROR_MESSAGES.GENERIC.UPDATE_FAILED("bill") });
    },
  });

  // Initialize edit values when entering edit mode
  useEffect(() => {
    if (isEditMode && bill) {
      setEditBillName(bill.bill_name);
      setEditTax(bill.tax.toString());
      setEditTip(bill.tip.toString());

      // Load custom tip contributions from participants
      const customTips = new Map<string, number>();
      bill.participants.forEach(p => {
        if (p.custom_tip_contribution && p.custom_tip_contribution > 0) {
          customTips.set(p.id, p.custom_tip_contribution);
        }
      });
      setEditCustomTips(customTips);

      // Load items for itemized bills
      if (bill.split_mode === 'itemized' && bill.items) {
        const loadedItems: EditBillItem[] = bill.items.map(item => {
          const isAdvanced = item.split_mode === 'advanced';
          const advancedSplits: ItemSplit[] = isAdvanced && item.split_config
            ? item.split_config.map(config => ({
                participantId: config.participant_id,
                type: config.type,
                value: config.value,
              }))
            : [];

          return {
            id: item.id,
            isNew: false,
            name: item.item_name,
            price: item.price.toString(),
            assignedTo: isAdvanced ? [] : item.assigned_to,
            isAdvanced,
            advancedSplits,
          };
        });
        setEditItems(loadedItems);
      }

      // Reset new item inputs
      setNewItemName('');
      setNewItemPrice('');
      setExpandedBreakdowns(new Set());
    }
  }, [isEditMode, bill]);

  // Helper to update custom tip for a participant
  const updateEditCustomTip = (participantId: string, value: string) => {
    const amount = parseFloat(value) || 0;
    setEditCustomTips(prev => {
      const newMap = new Map(prev);
      if (amount > 0) {
        newMap.set(participantId, amount);
      } else {
        newMap.delete(participantId);
      }
      return newMap;
    });
  };

  // ============ Item editing functions (for itemized bills) ============

  const addEditItem = () => {
    if (!newItemName.trim()) {
      showValidation('Please enter an item name');
      return;
    }
    const price = parseFloat(newItemPrice);
    if (!newItemPrice || isNaN(price) || price <= 0) {
      showValidation('Please enter a valid price');
      return;
    }

    const newItem: EditBillItem = {
      id: `new_${Date.now()}`,
      isNew: true,
      name: newItemName.trim(),
      price: newItemPrice,
      assignedTo: [],
      isAdvanced: false,
      advancedSplits: [],
    };

    setEditItems(prev => [...prev, newItem]);
    setNewItemName('');
    setNewItemPrice('');
  };

  const removeEditItem = (itemId: string) => {
    setEditItems(prev => prev.filter(item => item.id !== itemId));
  };

  const toggleEditItemAssignment = (itemId: string, participantId: string) => {
    setEditItems(prev =>
      prev.map(item => {
        if (item.id !== itemId) return item;
        const isAssigned = item.assignedTo.includes(participantId);
        return {
          ...item,
          assignedTo: isAssigned
            ? item.assignedTo.filter(id => id !== participantId)
            : [...item.assignedTo, participantId],
        };
      })
    );
  };

  const toggleEditItemAdvancedMode = (itemId: string) => {
    setEditItems(prev =>
      prev.map(item => {
        if (item.id !== itemId) return item;

        if (!item.isAdvanced) {
          // Switching to advanced mode: initialize splits from assignedTo
          const initialSplits: ItemSplit[] = item.assignedTo.length > 0
            ? item.assignedTo.map(participantId => ({
                participantId,
                type: 'percentage' as const,
                value: Math.round((100 / item.assignedTo.length) * 100) / 100,
              }))
            : [];
          return { ...item, isAdvanced: true, advancedSplits: initialSplits };
        } else {
          // Switching to simple mode: derive assignedTo from advancedSplits
          const newAssignedTo = item.advancedSplits
            .filter(split => split.value > 0)
            .map(split => split.participantId);
          return { ...item, isAdvanced: false, assignedTo: newAssignedTo };
        }
      })
    );
  };

  const updateEditAdvancedSplit = (
    itemId: string,
    participantId: string,
    field: 'type' | 'value',
    value: string | number
  ) => {
    setEditItems(prev =>
      prev.map(item => {
        if (item.id !== itemId) return item;

        const existingIndex = item.advancedSplits.findIndex(s => s.participantId === participantId);

        if (existingIndex >= 0) {
          let newSplits = [...item.advancedSplits];
          if (field === 'type') {
            const newType = value as 'percentage' | 'amount';
            // When changing type, update ALL participants to the same type and reset values
            newSplits = newSplits.map(split => ({
              ...split,
              type: newType,
              value: 0, // Reset all values when type changes
            }));
          } else {
            newSplits[existingIndex] = {
              ...newSplits[existingIndex],
              value: typeof value === 'number' ? value : parseFloat(value) || 0,
            };
          }
          return { ...item, advancedSplits: newSplits };
        } else {
          // Add new split - use existing type if any, else default
          const existingType = item.advancedSplits[0]?.type || 'percentage';
          const newSplit: ItemSplit = {
            participantId,
            type: field === 'type' ? (value as 'percentage' | 'amount') : existingType,
            value: field === 'value' ? (typeof value === 'number' ? value : parseFloat(value) || 0) : 0,
          };
          return { ...item, advancedSplits: [...item.advancedSplits, newSplit] };
        }
      })
    );
  };

  const removeEditAdvancedSplit = (itemId: string, participantId: string) => {
    setEditItems(prev =>
      prev.map(item => {
        if (item.id !== itemId) return item;
        return {
          ...item,
          advancedSplits: item.advancedSplits.filter(s => s.participantId !== participantId),
        };
      })
    );
  };

  const addParticipantToEditAdvancedSplit = (itemId: string, participantId: string) => {
    setEditItems(prev =>
      prev.map(item => {
        if (item.id !== itemId) return item;
        if (item.advancedSplits.some(s => s.participantId === participantId)) return item;
        return {
          ...item,
          advancedSplits: [
            ...item.advancedSplits,
            { participantId, type: 'percentage' as const, value: 0 },
          ],
        };
      })
    );
  };

  const toggleEditBreakdown = (participantId: string) => {
    setExpandedBreakdowns(prev => {
      const newSet = new Set(prev);
      if (newSet.has(participantId)) {
        newSet.delete(participantId);
      } else {
        newSet.add(participantId);
      }
      return newSet;
    });
  };

  // Validate advanced split for an item
  const validateEditAdvancedSplit = (item: EditBillItem): { valid: boolean; error?: string } => {
    if (!item.isAdvanced || item.advancedSplits.length === 0) {
      return { valid: false, error: `"${item.name}" has no participants assigned` };
    }

    const itemPrice = parseFloat(item.price) || 0;
    const types = new Set(item.advancedSplits.map(s => s.type));
    if (types.size > 1) {
      return { valid: false, error: `"${item.name}": all splits must use the same type (% or $)` };
    }

    const splitType = item.advancedSplits[0]?.type;
    const total = item.advancedSplits.reduce((sum, split) => sum + split.value, 0);

    if (splitType === 'percentage') {
      if (Math.abs(total - 100) > 0.01) {
        return { valid: false, error: `"${item.name}": percentages must sum to 100% (currently ${total.toFixed(1)}%)` };
      }
    } else {
      if (Math.abs(total - itemPrice) > 0.01) {
        return { valid: false, error: `"${item.name}": amounts must sum to $${itemPrice.toFixed(2)} (currently $${total.toFixed(2)})` };
      }
    }

    return { valid: true };
  };

  // Get validation status for display
  const getEditAdvancedSplitStatus = (item: EditBillItem): { isValid: boolean; message: string } => {
    if (!item.isAdvanced) return { isValid: true, message: '' };
    if (item.advancedSplits.length === 0) return { isValid: false, message: 'Add participants' };

    const itemPrice = parseFloat(item.price) || 0;
    const types = new Set(item.advancedSplits.map(s => s.type));
    if (types.size > 1) return { isValid: false, message: 'Mixed types' };

    const splitType = item.advancedSplits[0]?.type;
    const total = item.advancedSplits.reduce((sum, split) => sum + split.value, 0);

    if (splitType === 'percentage') {
      if (Math.abs(total - 100) <= 0.01) return { isValid: true, message: '100%' };
      return { isValid: false, message: `${total.toFixed(1)}% of 100%` };
    } else {
      if (Math.abs(total - itemPrice) <= 0.01) return { isValid: true, message: `$${itemPrice.toFixed(2)}` };
      return { isValid: false, message: `$${total.toFixed(2)} of $${itemPrice.toFixed(2)}` };
    }
  };

  // Calculate subtotal from edit items (for itemized bills)
  const editSubtotal = useMemo(() => {
    if (!isEditMode || !bill || bill.split_mode !== 'itemized') return 0;
    return editItems.reduce((sum, item) => {
      const price = parseFloat(item.price) || 0;
      return sum + price;
    }, 0);
  }, [isEditMode, bill, editItems]);

  // Calculate preview totals when editing (accounting for items, custom tips)
  const editPreview = useMemo(() => {
    if (!bill || !isEditMode) return null;

    const newTax = parseFloat(editTax) || 0;
    const newTip = parseFloat(editTip) || 0;

    // For itemized bills, calculate subtotal from items. Otherwise use original subtotal.
    const subtotal = bill.split_mode === 'itemized' ? editSubtotal : (bill.total_amount - bill.tax - bill.tip);
    const newTotal = subtotal + newTax + newTip;

    // Calculate preview for each participant based on items
    const participantPreviews = new Map<string, number>();
    const itemTotals = new Map<string, number>(); // Track item-only totals

    // Initialize all participants with 0
    bill.participants.forEach(p => {
      participantPreviews.set(p.id, 0);
      itemTotals.set(p.id, 0);
    });

    // For itemized bills, calculate from editItems
    if (bill.split_mode === 'itemized') {
      editItems.forEach(item => {
        const itemPrice = parseFloat(item.price) || 0;

        if (item.isAdvanced && item.advancedSplits.length > 0) {
          // Advanced mode: use custom splits
          item.advancedSplits.forEach(split => {
            const amount = split.type === 'percentage'
              ? (split.value / 100) * itemPrice
              : split.value;
            const current = itemTotals.get(split.participantId) || 0;
            itemTotals.set(split.participantId, current + amount);
          });
        } else {
          // Simple mode: equal split
          if (item.assignedTo.length > 0) {
            const pricePerPerson = itemPrice / item.assignedTo.length;
            item.assignedTo.forEach(participantId => {
              const current = itemTotals.get(participantId) || 0;
              itemTotals.set(participantId, current + pricePerPerson);
            });
          }
        }
      });
    } else {
      // For non-itemized bills, use original amounts
      const oldExtras = bill.tax + bill.tip;
      const oldSubtotal = bill.total_amount - oldExtras;
      bill.participants.forEach(p => {
        let participantSubtotal = 0;
        if (oldSubtotal > 0 && oldExtras > 0) {
          participantSubtotal = p.amount_owed * (oldSubtotal / bill.total_amount);
        } else if (oldSubtotal > 0) {
          participantSubtotal = p.amount_owed;
        }
        itemTotals.set(p.id, participantSubtotal);
      });
    }

    // Calculate total custom tip contributions
    let totalCustomTip = 0;
    editCustomTips.forEach((amount) => {
      totalCustomTip += amount;
    });
    const remainingTip = Math.max(0, newTip - totalCustomTip);

    // Calculate subtotal for participants WITHOUT custom tip
    let subtotalWithoutCustomTip = 0;
    bill.participants.forEach(p => {
      if (!editCustomTips.has(p.id) || editCustomTips.get(p.id) === 0) {
        subtotalWithoutCustomTip += itemTotals.get(p.id) || 0;
      }
    });

    // Calculate final amounts for each participant
    bill.participants.forEach(participant => {
      const participantSubtotal = itemTotals.get(participant.id) || 0;

      // Start with item subtotal
      let newAmount = participantSubtotal;

      // Add tax share (proportional)
      if (newTax > 0 && subtotal > 0) {
        newAmount += (participantSubtotal / subtotal) * newTax;
      }

      // Add tip share (custom or proportional)
      const customTip = editCustomTips.get(participant.id);
      if (customTip && customTip > 0) {
        newAmount += customTip;
      } else if (remainingTip > 0 && subtotalWithoutCustomTip > 0) {
        newAmount += (participantSubtotal / subtotalWithoutCustomTip) * remainingTip;
      }

      participantPreviews.set(participant.id, newAmount);
    });

    return { subtotal, newTax, newTip, newTotal, totalCustomTip, remainingTip, participantPreviews, itemTotals };
  }, [bill, isEditMode, editTax, editTip, editCustomTips, editItems, editSubtotal]);

  // Get detailed breakdown for a participant in edit mode
  const getEditParticipantBreakdown = (participantId: string) => {
    if (!bill || !editPreview) return null;

    const breakdown: {
      items: { name: string; amount: number }[];
      itemsTotal: number;
      taxShare: number;
      tipShare: number;
      tipType: 'custom' | 'proportional';
      total: number;
    } = {
      items: [],
      itemsTotal: 0,
      taxShare: 0,
      tipShare: 0,
      tipType: 'proportional',
      total: 0,
    };

    // Calculate items
    editItems.forEach(item => {
      const itemPrice = parseFloat(item.price) || 0;
      let amount = 0;

      if (item.isAdvanced && item.advancedSplits.length > 0) {
        const split = item.advancedSplits.find(s => s.participantId === participantId);
        if (split) {
          amount = split.type === 'percentage'
            ? (split.value / 100) * itemPrice
            : split.value;
        }
      } else if (item.assignedTo.includes(participantId)) {
        amount = itemPrice / item.assignedTo.length;
      }

      if (amount > 0) {
        breakdown.items.push({ name: item.name, amount });
        breakdown.itemsTotal += amount;
      }
    });

    // Calculate tax share
    if (editPreview.newTax > 0 && editPreview.subtotal > 0) {
      breakdown.taxShare = (breakdown.itemsTotal / editPreview.subtotal) * editPreview.newTax;
    }

    // Calculate tip share
    const customTip = editCustomTips.get(participantId);
    if (customTip && customTip > 0) {
      breakdown.tipShare = customTip;
      breakdown.tipType = 'custom';
    } else if (editPreview.remainingTip > 0) {
      // Get subtotal for people without custom tips
      let subtotalWithoutCustomTip = 0;
      bill.participants.forEach(p => {
        if (!editCustomTips.has(p.id) || editCustomTips.get(p.id) === 0) {
          subtotalWithoutCustomTip += editPreview.itemTotals.get(p.id) || 0;
        }
      });

      if (subtotalWithoutCustomTip > 0) {
        breakdown.tipShare = (breakdown.itemsTotal / subtotalWithoutCustomTip) * editPreview.remainingTip;
      }
      breakdown.tipType = 'proportional';
    }

    breakdown.total = breakdown.itemsTotal + breakdown.taxShare + breakdown.tipShare;
    return breakdown;
  };

  if (isLoading) {
    return <LoadingState fullScreen message="Loading bill..." />;
  }

  if (queryError) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <ErrorState
          title="Error loading bill"
          message={queryError instanceof Error ? queryError.message : 'An unknown error occurred'}
        />
        <Button onClick={onBack} variant="outline" className="mt-4">
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
        <ErrorState
          title="Error loading bill data"
          message="Bill participants data is invalid or missing"
        />
        <Button onClick={onBack} variant="outline" className="mt-4">
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
      <DeleteConfirmationDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        onConfirm={() => deleteBillMutation.mutate()}
        title="Delete Bill?"
        description="This will permanently delete this bill and all related data. This action cannot be undone."
        isDeleting={deleteBillMutation.isPending}
      />

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
            <Button variant="ghost" size="sm" onClick={isEditMode ? () => setIsEditMode(false) : onBack}>
              {isEditMode ? <X className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
            </Button>
            <div className="flex-1 min-w-0">
              {isEditMode ? (
                <Input
                  value={editBillName}
                  onChange={e => setEditBillName(e.target.value)}
                  className="text-xl font-bold"
                  placeholder="Bill name"
                />
              ) : (
                <>
                  <h1 className="text-2xl font-bold text-gray-900 truncate">
                    {bill.bill_name}
                  </h1>
                  <p className="text-sm text-gray-500">
                    {daysSinceCreated === 0
                      ? 'Created today'
                      : `Created ${daysSinceCreated}d ago`}
                  </p>
                </>
              )}
            </div>
            {bill.status === 'settled' && (
              <Badge className="bg-blue-100 text-blue-800">Settled</Badge>
            )}
            {canEdit && !isEditMode && (
              <Button variant="outline" size="sm" onClick={() => setIsEditMode(true)}>
                <Pencil className="w-4 h-4" />
              </Button>
            )}
            {isEditMode && (
              <Button
                size="sm"
                onClick={() => saveBillMutation.mutate()}
                disabled={saveBillMutation.isPending || !editBillName.trim()}
              >
                <Save className="w-4 h-4 mr-1" />
                {saveBillMutation.isPending ? 'Saving...' : 'Save'}
              </Button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Error Alert */}
          <ErrorDisplay error={error} onClear={clearError} />

          {/* Summary Card */}
          <Card className="p-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Summary</h2>
            <div className="space-y-2">
              {isEditMode && editPreview ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Subtotal:</span>
                    <span>{formatCurrency(editPreview.subtotal)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <Label htmlFor="edit-tax" className="text-gray-600">Tax:</Label>
                    <div className="flex items-center gap-1">
                      <span className="text-gray-500">$</span>
                      <Input
                        id="edit-tax"
                        type="number"
                        step="0.01"
                        min="0"
                        value={editTax}
                        onChange={e => setEditTax(e.target.value)}
                        className="w-24 h-8 text-right"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <Label htmlFor="edit-tip" className="text-gray-600">Total Tip:</Label>
                    <div className="flex items-center gap-1">
                      <span className="text-gray-500">$</span>
                      <Input
                        id="edit-tip"
                        type="number"
                        step="0.01"
                        min="0"
                        value={editTip}
                        onChange={e => setEditTip(e.target.value)}
                        className="w-24 h-8 text-right"
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  {/* Custom Tip Contributions */}
                  {(parseFloat(editTip) || 0) > 0 && (
                    <div className="border-t pt-3 mt-3">
                      <Label className="text-sm font-medium text-gray-700">
                        Custom Tip Contributions
                        {editCustomTips.size > 0 ? (
                          <span className="text-red-500 ml-1">*</span>
                        ) : (
                          <span className="font-normal text-gray-500 ml-1">(Optional)</span>
                        )}
                      </Label>
                      <p className="text-xs text-gray-500 mb-2">
                        {editCustomTips.size > 0
                          ? 'When using custom tips, all participants must have a tip amount entered.'
                          : 'Override tip for specific people (leave blank for proportional)'}
                      </p>
                      <div className="space-y-2">
                        {bill.participants.map(participant => {
                          const isCurrentUser = participant.user === currentUserId;
                          const customTip = editCustomTips.get(participant.id) || 0;
                          const participantName = getParticipantName(participant, isCurrentUser);
                          const tipError = fieldErrors.customTips.get(participant.id);

                          return (
                            <div
                              key={participant.id}
                              ref={(el) => setErrorRef(`tip-${participant.id}`, el)}
                              className={`flex items-center justify-between p-2 rounded ${
                                tipError ? 'bg-red-50 border border-red-300' : 'bg-gray-50'
                              }`}
                            >
                              <span className="text-sm font-medium">{participantName}</span>
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-gray-500">$</span>
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={customTip || ''}
                                  onChange={e => updateEditCustomTip(participant.id, e.target.value)}
                                  className={`w-20 h-7 text-sm text-right ${tipError ? 'border-red-500 focus:ring-red-500' : ''}`}
                                  placeholder="auto"
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {editPreview && editCustomTips.size > 0 && (() => {
                        const newTipAmount = parseFloat(editTip) || 0;
                        const diff = editPreview.totalCustomTip - newTipAmount;
                        const isValid = Math.abs(diff) <= 0.01;

                        return (
                          <div className={`mt-2 p-2 rounded text-sm ${
                            isValid ? 'bg-green-50 border border-green-200' : 'bg-orange-50 border border-orange-200'
                          }`}>
                            <div className="flex justify-between items-center">
                              <span className={isValid ? 'text-green-700' : 'text-orange-700'}>
                                Total custom tips:
                              </span>
                              <span className={`font-medium ${isValid ? 'text-green-700' : 'text-orange-700'}`}>
                                {formatCurrency(editPreview.totalCustomTip)} / {formatCurrency(newTipAmount)}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 mt-1">
                              {isValid ? (
                                <>
                                  <Check className="w-3 h-3 text-green-600" />
                                  <span className="text-xs text-green-600">Tips sum correctly</span>
                                </>
                              ) : (
                                <>
                                  <AlertCircle className="w-3 h-3 text-orange-600" />
                                  <span className="text-xs text-orange-600">
                                    {diff > 0 ? `${formatCurrency(diff)} over` : `${formatCurrency(Math.abs(diff))} under`} - must equal total tip
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  <div className="flex justify-between pt-2 border-t">
                    <span className="font-medium">New Total:</span>
                    <span className="font-bold">{formatCurrency(editPreview.newTotal)}</span>
                  </div>
                  {editPreview.newTotal !== bill.total_amount && (
                    <div className="text-xs text-gray-500 text-right">
                      (was {formatCurrency(bill.total_amount)})
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Amount:</span>
                    <span className="font-bold">{formatCurrency(bill.total_amount)}</span>
                  </div>
                  {bill.tax > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Tax:</span>
                      <span className="text-gray-500">{formatCurrency(bill.tax)}</span>
                    </div>
                  )}
                  {bill.tip > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Tip:</span>
                      <span className="text-gray-500">{formatCurrency(bill.tip)}</span>
                    </div>
                  )}
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
                </>
              )}
            </div>
          </Card>

          {/* Items Section (Edit Mode for Itemized Bills) */}
          {isEditMode && bill.split_mode === 'itemized' && (
            <Card className="p-4">
              <Label className="text-base font-semibold">Menu Items</Label>

              {/* Add Item Form */}
              <div className="flex gap-2 mt-3">
                <Input
                  placeholder="Item name"
                  value={newItemName}
                  onChange={e => setNewItemName(e.target.value)}
                  className="flex-1"
                  onKeyDown={e => e.key === 'Enter' && addEditItem()}
                />
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Price"
                  value={newItemPrice}
                  onChange={e => setNewItemPrice(e.target.value)}
                  className="w-24"
                  onKeyDown={e => e.key === 'Enter' && addEditItem()}
                />
                <Button onClick={addEditItem} size="icon">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>

              {/* Items List */}
              {editItems.length > 0 && (
                <div className="mt-4 space-y-3">
                  {editItems.map(item => {
                    const splitStatus = getEditAdvancedSplitStatus(item);
                    const itemPrice = parseFloat(item.price) || 0;
                    const itemError = fieldErrors.items.get(item.id);
                    const splitErrors = fieldErrors.advancedSplits.get(item.id);
                    const hasItemError = !!itemError || (splitErrors && splitErrors.size > 0);

                    return (
                      <div
                        key={item.id}
                        ref={(el) => setErrorRef(`item-${item.id}`, el)}
                        className={`border rounded-lg p-3 ${
                          hasItemError ? 'border-red-500 bg-red-50' : 'border-gray-200 bg-gray-50'
                        }`}
                      >
                        {/* Item Header */}
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex-1">
                            <span className="font-medium">{item.name}</span>
                            <span className="text-gray-600 ml-2">${itemPrice.toFixed(2)}</span>
                            {item.isNew && (
                              <Badge variant="outline" className="ml-2 text-xs text-green-600 border-green-300">
                                New
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            {/* Simple/Advanced Toggle */}
                            <div className="flex rounded-md border border-gray-300 text-xs overflow-hidden">
                              <button
                                type="button"
                                onClick={() => item.isAdvanced && toggleEditItemAdvancedMode(item.id)}
                                className={`px-2 py-1 ${
                                  !item.isAdvanced
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-white text-gray-600 hover:bg-gray-100'
                                }`}
                              >
                                Simple
                              </button>
                              <button
                                type="button"
                                onClick={() => !item.isAdvanced && toggleEditItemAdvancedMode(item.id)}
                                className={`px-2 py-1 ${
                                  item.isAdvanced
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-white text-gray-600 hover:bg-gray-100'
                                }`}
                              >
                                Advanced
                              </button>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeEditItem(item.id)}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50 p-1"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>

                        {/* Simple Mode: Assignment Chips */}
                        {!item.isAdvanced && (
                          <>
                            <div className="flex gap-2 overflow-x-auto pb-1">
                              {bill.participants.map(p => {
                                const isAssigned = item.assignedTo.includes(p.id);
                                const isCurrentUser = p.user === currentUserId;
                                const participantName = getParticipantName(p, isCurrentUser);
                                return (
                                  <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => toggleEditItemAssignment(item.id, p.id)}
                                    className={`px-3 py-1 rounded-full text-sm transition-colors whitespace-nowrap flex-shrink-0 ${
                                      isAssigned
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                    }`}
                                  >
                                    {participantName}
                                  </button>
                                );
                              })}
                            </div>
                            {item.assignedTo.length === 0 && (
                              <p className="text-xs text-orange-600 mt-1">Not assigned yet</p>
                            )}
                          </>
                        )}

                        {/* Advanced Mode: Custom Splits */}
                        {item.isAdvanced && (
                          <div className="space-y-2">
                            {/* Add Participant Dropdown */}
                            {item.advancedSplits.length < bill.participants.length && (
                              <div className="flex items-center gap-2 mb-2">
                                <div className="relative flex-1">
                                  <select
                                    className="w-full h-9 rounded-md border border-gray-300 bg-white px-3 pr-8 text-sm appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    value=""
                                    onChange={e => {
                                      if (e.target.value) {
                                        addParticipantToEditAdvancedSplit(item.id, e.target.value);
                                      }
                                    }}
                                  >
                                    <option value="">Add participant...</option>
                                    {bill.participants
                                      .filter(p => !item.advancedSplits.some(s => s.participantId === p.id))
                                      .map(p => {
                                        const isCurrentUser = p.user === currentUserId;
                                        return (
                                          <option key={p.id} value={p.id}>
                                            {getParticipantName(p, isCurrentUser)}
                                          </option>
                                        );
                                      })}
                                  </select>
                                  <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                                    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Split Rows */}
                            {item.advancedSplits.map(split => {
                              const participant = participantsById.get(split.participantId);
                              if (!participant) return null;
                              const isCurrentUser = participant.user === currentUserId;
                              const participantName = getParticipantName(participant, isCurrentUser);
                              const calculatedAmount = split.type === 'percentage'
                                ? (split.value / 100) * itemPrice
                                : split.value;
                              const splitError = splitErrors?.get(split.participantId);

                              return (
                                <div
                                  key={split.participantId}
                                  ref={(el) => setErrorRef(`split-${item.id}-${split.participantId}`, el)}
                                  className={`flex items-center gap-2 p-2 rounded border ${
                                    splitError ? 'bg-red-50 border-red-300' : 'bg-white border-gray-200'
                                  }`}
                                >
                                  <span className="font-medium text-sm min-w-[60px]">
                                    {participantName}
                                  </span>
                                  <div className="relative">
                                    <select
                                      className="h-8 w-14 rounded-md border border-gray-300 bg-white pl-2 pr-6 text-sm appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                      value={split.type}
                                      onChange={e => updateEditAdvancedSplit(item.id, split.participantId, 'type', e.target.value)}
                                    >
                                      <option value="percentage">%</option>
                                      <option value="amount">$</option>
                                    </select>
                                    <div className="absolute inset-y-0 right-0 flex items-center pr-1 pointer-events-none">
                                      <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                      </svg>
                                    </div>
                                  </div>
                                  <Input
                                    type="number"
                                    step={split.type === 'percentage' ? '1' : '0.01'}
                                    min="0"
                                    max={split.type === 'percentage' ? '100' : undefined}
                                    value={split.value || ''}
                                    onChange={e => updateEditAdvancedSplit(item.id, split.participantId, 'value', e.target.value)}
                                    className={`w-20 h-8 text-sm ${splitError ? 'border-red-500 focus:ring-red-500' : ''}`}
                                    placeholder="0"
                                  />
                                  <span className="text-sm text-gray-500 min-w-[60px]">
                                    = ${calculatedAmount.toFixed(2)}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => removeEditAdvancedSplit(item.id, split.participantId)}
                                    className="text-red-500 hover:text-red-700 p-1"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              );
                            })}

                            {/* Validation Status */}
                            {item.advancedSplits.length > 0 && (
                              <div className={`flex items-center gap-1 text-xs mt-1 ${
                                splitStatus.isValid ? 'text-green-600' : 'text-orange-600'
                              }`}>
                                {splitStatus.isValid ? (
                                  <Check className="w-3 h-3" />
                                ) : (
                                  <AlertCircle className="w-3 h-3" />
                                )}
                                <span>Total: {splitStatus.message}</span>
                              </div>
                            )}

                            {item.advancedSplits.length === 0 && (
                              <p className="text-xs text-orange-600 mt-1">Add participants to split this item</p>
                            )}
                          </div>
                        )}

                        {/* Item-level error message */}
                        {itemError && (
                          <p className="text-xs text-red-600 mt-2 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            {itemError}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {editItems.length === 0 && (
                <p className="text-sm text-gray-500 mt-3 text-center py-4">
                  Add menu items above
                </p>
              )}
            </Card>
          )}

          {/* Payment Summary in Edit Mode (for itemized bills) */}
          {isEditMode && bill.split_mode === 'itemized' && editItems.length > 0 && (
            <Card className="p-4 bg-green-50 border-green-200">
              <h3 className="text-base font-semibold text-green-900 mb-4">Payment Preview</h3>
              <div className="space-y-2">
                {bill.participants.map(participant => {
                  const isCurrentUser = participant.user === currentUserId;
                  const participantName = getParticipantName(participant, isCurrentUser);
                  const amount = editPreview?.participantPreviews.get(participant.id) || 0;
                  const isExpanded = expandedBreakdowns.has(participant.id);
                  const breakdown = getEditParticipantBreakdown(participant.id);

                  return (
                    <div key={participant.id} className="bg-white rounded border border-green-200 overflow-hidden">
                      {/* Main row - clickable to expand */}
                      <button
                        type="button"
                        onClick={() => toggleEditBreakdown(participant.id)}
                        className="w-full flex justify-between items-center p-2 hover:bg-green-50 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-green-600" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-green-600" />
                          )}
                          <span className="font-medium text-gray-900">{participantName}</span>
                        </div>
                        <span className={amount > 0 ? 'text-green-700 font-semibold' : 'text-gray-400'}>
                          ${amount.toFixed(2)}
                        </span>
                      </button>

                      {/* Collapsible breakdown */}
                      {isExpanded && breakdown && (
                        <div className="border-t border-green-100 bg-green-50/50 p-3 space-y-2">
                          {/* Items breakdown */}
                          {breakdown.items.length > 0 && (
                            <div>
                              <div className="text-xs font-medium text-gray-500 mb-1">Items:</div>
                              {breakdown.items.map((item, idx) => (
                                <div key={idx} className="flex justify-between text-sm text-gray-600 pl-2">
                                  <span>{item.name}</span>
                                  <span>${item.amount.toFixed(2)}</span>
                                </div>
                              ))}
                              <div className="flex justify-between text-sm font-medium text-gray-700 pl-2 pt-1 border-t border-green-100 mt-1">
                                <span>Items subtotal</span>
                                <span>${breakdown.itemsTotal.toFixed(2)}</span>
                              </div>
                            </div>
                          )}

                          {/* Tax share */}
                          {breakdown.taxShare > 0 && (
                            <div className="flex justify-between text-sm text-gray-600">
                              <span>Tax share</span>
                              <span>${breakdown.taxShare.toFixed(2)}</span>
                            </div>
                          )}

                          {/* Tip share */}
                          {breakdown.tipShare > 0 && (
                            <div className="flex justify-between text-sm text-gray-600">
                              <span>
                                Tip
                                <span className="text-xs text-gray-400 ml-1">
                                  ({breakdown.tipType === 'custom' ? 'custom' : 'proportional'})
                                </span>
                              </span>
                              <span>${breakdown.tipShare.toFixed(2)}</span>
                            </div>
                          )}

                          {/* Total */}
                          <div className="flex justify-between text-sm font-semibold text-green-800 pt-2 border-t border-green-200">
                            <span>Total</span>
                            <span>${breakdown.total.toFixed(2)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-green-700 mt-2">Tap a person to see breakdown</p>
            </Card>
          )}

          {/* Participants */}
          <Card className="p-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Users className="w-5 h-5" />
              Participants
              {isEditMode && (
                <span className="text-sm font-normal text-gray-500">(preview)</span>
              )}
            </h2>
            <div className="space-y-3">
              {bill.participants.map(participant => {
                const isCurrentUser = participant.user === currentUserId;
                const isPaid = participant.paid_status === 'paid';
                const isParticipantTheCreator = bill.creator_user === participant.user;
                const isBillActive = bill.status === 'active';

                // Get preview amount if in edit mode
                const previewAmount = isEditMode && editPreview
                  ? editPreview.participantPreviews.get(participant.id) ?? participant.amount_owed
                  : participant.amount_owed;
                const displayAmount = previewAmount;
                const amountChanged = isEditMode && editPreview && Math.abs(previewAmount - participant.amount_owed) > 0.01;

                // Determine what actions the current user can take on this participant:
                // - Creator can toggle others between paid/unpaid (not themselves)
                // - Participants can mark themselves as paid (but only creator can mark them unpaid)
                const creatorCanToggle = isCreator && !isCurrentUser && isBillActive && !isEditMode;
                const participantCanMarkSelfPaid = isCurrentUser && !isCreator && !isPaid && isBillActive && !isEditMode;
                const canTakeAction = creatorCanToggle || participantCanMarkSelfPaid;

                return (
                  <div
                    key={participant.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">
                        {getParticipantName(participant, isCurrentUser)}
                        {isParticipantTheCreator && (
                          <Badge variant="outline" className="ml-2 text-xs">
                            Organizer
                          </Badge>
                        )}
                        {!isEditMode && participant.custom_tip_contribution && participant.custom_tip_contribution > 0 && (
                          <Badge variant="outline" className="ml-2 text-xs text-purple-600 border-purple-300">
                            Custom tip: {formatCurrency(participant.custom_tip_contribution)}
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm">
                        <span className={amountChanged ? 'text-blue-600 font-medium' : 'text-gray-600'}>
                          {formatCurrency(displayAmount)}
                        </span>
                        {amountChanged && (
                          <span className="text-xs text-gray-400 ml-1">
                            (was {formatCurrency(participant.amount_owed)})
                          </span>
                        )}
                      </div>
                    </div>

                    {canTakeAction ? (
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
                            {creatorCanToggle ? 'Mark Unpaid' : 'Paid'}
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

          {/* Items (for itemized bills) */}
          {bill.split_mode === 'itemized' && bill.items && bill.items.length > 0 && !isEditMode && (
            <Card className="p-4">
              <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <DollarSign className="w-5 h-5" />
                Items
              </h2>
              <div className="space-y-3">
                {bill.items.map(item => {
                  // Get participant names for this item
                  const assignedNames = item.assigned_to.map(participantId => {
                    const participant = participantsById.get(participantId);
                    if (!participant) return 'Unknown';
                    return getParticipantName(participant, participant.user === currentUserId);
                  });

                  return (
                    <div key={item.id} className="border rounded-lg p-3 bg-gray-50">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="font-medium">{item.item_name}</span>
                          <span className="text-gray-600 ml-2">{formatCurrency(item.price)}</span>
                        </div>
                        {item.split_mode === 'advanced' && (
                          <Badge variant="outline" className="text-xs text-blue-600 border-blue-300">
                            Custom split
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-gray-500 mt-1">
                        {item.split_mode === 'advanced' && item.split_config ? (
                          <div className="space-y-1">
                            {item.split_config.map((config, idx) => {
                              const participant = participantsById.get(config.participant_id);
                              const name = participant
                                ? getParticipantName(participant, participant.user === currentUserId)
                                : 'Unknown';
                              const amount = config.type === 'percentage'
                                ? (config.value / 100) * item.price
                                : config.value;
                              return (
                                <div key={idx} className="flex justify-between text-xs">
                                  <span>{name}</span>
                                  <span>
                                    {config.type === 'percentage' ? `${config.value}%` : formatCurrency(config.value)}
                                    {' '}= {formatCurrency(amount)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <span>Split by: {assignedNames.join(', ')}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

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
