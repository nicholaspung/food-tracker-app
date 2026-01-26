import { useState, useMemo, useRef, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Trash2, DollarSign, Check, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { pb } from '@/lib/pocketbase';
import { createBill } from '@/lib/billService';
import { validateBillName, getFirstError } from '@/lib/billValidation';
import { useErrorHandler } from '@/hooks/ui/useErrorHandler';
import { ErrorDisplay } from '@/components/shared/ErrorDisplay';
import { ERROR_MESSAGES } from '@/lib/errorMessages';
import { COLLECTIONS } from '@/constants/collections';
import { useTrackEvent } from '@/hooks/ui/useTrackEvent';
import { ANALYTICS_EVENTS } from '@/constants/analyticsEvents';
import type { Friendship, User } from '@/lib/pocketbase';

// Field error types for highlighting
interface FieldErrors {
  items: Map<string, string>; // itemId -> error message
  customTips: Map<string, string>; // participantUserId -> error message
  advancedSplits: Map<string, Map<string, string>>; // itemId -> (userId -> error)
}

interface CreateItemizedBillPageProps {
  onCancel: () => void;
  onSuccess: (billId: string) => void;
}

interface ItemSplit {
  userId: string;
  type: 'percentage' | 'amount';
  value: number;
}

interface BillItem {
  id: string;
  name: string;
  price: string;
  assignedTo: string[]; // User IDs for simple mode (equal split)
  isAdvanced: boolean;
  advancedSplits: ItemSplit[]; // Custom splits for advanced mode
}

interface Participant {
  userId: string;
  userName: string;
  isCurrentUser: boolean;
}

export default function CreateItemizedBillPage({
  onCancel,
  onSuccess,
}: CreateItemizedBillPageProps) {
  const queryClient = useQueryClient();
  const currentUserId = pb.authStore.record?.id || '';
  const currentUserName = pb.authStore.record?.name || pb.authStore.record?.email?.split('@')[0] || 'You';

  const [billName, setBillName] = useState('');
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const [items, setItems] = useState<BillItem[]>([]);
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [taxAmount, setTaxAmount] = useState('');
  const [tipAmount, setTipAmount] = useState('');
  const [customTipContributions, setCustomTipContributions] = useState<Map<string, number>>(new Map());
  const [payerId, setPayerId] = useState<string>(currentUserId);
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
    // Priority: items first, then custom tips, then advanced splits
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
    source: 'CreateItemizedBillPage',
    defaultSeverity: 'error',
  });
  const trackEvent = useTrackEvent();

  // Fetch friends list
  const { data: friendships } = useQuery({
    queryKey: ['friendships', currentUserId],
    queryFn: async () => {
      const records = await pb.collection(COLLECTIONS.FRIENDSHIPS).getFullList<Friendship>({
        filter: `(user="${currentUserId}" || friend="${currentUserId}") && status="accepted"`,
        expand: 'user,friend',
      });
      return records;
    },
    enabled: !!currentUserId,
  });

  // Get list of friend users
  const friends = useMemo(() => {
    return friendships
      ?.map(friendship => {
        const friendUser =
          friendship.user === currentUserId
            ? (friendship.expand?.friend as User)
            : (friendship.expand?.user as User);
        return friendUser;
      })
      .filter((friend): friend is User => friend !== undefined && friend !== null) || [];
  }, [friendships, currentUserId]);

  // Build participants list (current user + selected friends)
  const participants: Participant[] = useMemo(() => {
    const result: Participant[] = [
      { userId: currentUserId, userName: 'You', isCurrentUser: true },
    ];

    selectedFriendIds.forEach(friendId => {
      const friend = friends.find(f => f.id === friendId);
      if (friend) {
        result.push({
          userId: friendId,
          userName: friend.name || friend.email?.split('@')[0] || 'Unknown',
          isCurrentUser: false,
        });
      }
    });

    return result;
  }, [currentUserId, selectedFriendIds, friends]);

  // Calculate totals
  const subtotal = useMemo(() => {
    return items.reduce((sum, item) => {
      const price = parseFloat(item.price) || 0;
      return sum + price;
    }, 0);
  }, [items]);

  const tax = parseFloat(taxAmount) || 0;
  const tip = parseFloat(tipAmount) || 0;
  const total = subtotal + tax + tip;

  // Calculate amount per participant
  const participantTotals = useMemo(() => {
    const totals = new Map<string, number>();
    const itemTotals = new Map<string, number>(); // Track item-only totals for proportional calculations

    // Initialize all participants with 0
    participants.forEach(p => {
      totals.set(p.userId, 0);
      itemTotals.set(p.userId, 0);
    });

    // Add up item costs for each participant
    items.forEach(item => {
      const itemPrice = parseFloat(item.price) || 0;

      if (item.isAdvanced && item.advancedSplits.length > 0) {
        // Advanced mode: use custom splits
        item.advancedSplits.forEach(split => {
          const amount = split.type === 'percentage'
            ? (split.value / 100) * itemPrice
            : split.value;
          const current = totals.get(split.userId) || 0;
          const currentItems = itemTotals.get(split.userId) || 0;
          totals.set(split.userId, current + amount);
          itemTotals.set(split.userId, currentItems + amount);
        });
      } else {
        // Simple mode: equal split
        if (item.assignedTo.length > 0) {
          const pricePerPerson = itemPrice / item.assignedTo.length;
          item.assignedTo.forEach(userId => {
            const current = totals.get(userId) || 0;
            const currentItems = itemTotals.get(userId) || 0;
            totals.set(userId, current + pricePerPerson);
            itemTotals.set(userId, currentItems + pricePerPerson);
          });
        }
      }
    });

    // Distribute tax proportionally based on subtotal each person owes
    if (tax > 0 && subtotal > 0) {
      participants.forEach(p => {
        const personSubtotal = itemTotals.get(p.userId) || 0;
        const taxShare = (personSubtotal / subtotal) * tax;
        totals.set(p.userId, (totals.get(p.userId) || 0) + taxShare);
      });
    }

    // Distribute tip: custom contributions first, then proportional for the rest
    if (tip > 0 && subtotal > 0) {
      // Calculate total custom tip contributions
      let totalCustomTip = 0;
      customTipContributions.forEach((amount, userId) => {
        if (participants.some(p => p.userId === userId)) {
          totalCustomTip += amount;
        }
      });

      // Calculate remaining tip to distribute proportionally
      const remainingTip = Math.max(0, tip - totalCustomTip);

      // Calculate subtotal for participants WITHOUT custom tip (for proportional distribution)
      let subtotalWithoutCustomTip = 0;
      participants.forEach(p => {
        if (!customTipContributions.has(p.userId) || customTipContributions.get(p.userId) === 0) {
          subtotalWithoutCustomTip += itemTotals.get(p.userId) || 0;
        }
      });

      // Distribute tip to each participant
      participants.forEach(p => {
        const customTip = customTipContributions.get(p.userId);
        if (customTip !== undefined && customTip > 0) {
          // Use custom tip amount
          totals.set(p.userId, (totals.get(p.userId) || 0) + customTip);
        } else if (remainingTip > 0 && subtotalWithoutCustomTip > 0) {
          // Distribute remaining tip proportionally
          const personSubtotal = itemTotals.get(p.userId) || 0;
          const tipShare = (personSubtotal / subtotalWithoutCustomTip) * remainingTip;
          totals.set(p.userId, (totals.get(p.userId) || 0) + tipShare);
        }
      });
    }

    return totals;
  }, [items, participants, tax, tip, subtotal, customTipContributions]);

  const toggleFriend = (friendId: string) => {
    setSelectedFriendIds(prev => {
      const newIds = prev.includes(friendId)
        ? prev.filter(id => id !== friendId)
        : [...prev, friendId];

      // If removing a friend, also remove them from item assignments, advanced splits, and custom tips
      if (!newIds.includes(friendId)) {
        setItems(prevItems =>
          prevItems.map(item => ({
            ...item,
            assignedTo: item.assignedTo.filter(id => id !== friendId),
            advancedSplits: item.advancedSplits.filter(split => split.userId !== friendId),
          }))
        );
        // Remove from custom tip contributions
        setCustomTipContributions(prev => {
          const newMap = new Map(prev);
          newMap.delete(friendId);
          return newMap;
        });
        // Reset payer if they were removed
        if (payerId === friendId) {
          setPayerId(currentUserId);
        }
      }

      return newIds;
    });
  };

  const addItem = () => {
    if (!newItemName.trim()) {
      showValidation('Please enter an item name');
      return;
    }

    const price = parseFloat(newItemPrice);
    if (!newItemPrice || isNaN(price) || price <= 0) {
      showValidation('Please enter a valid price');
      return;
    }

    const newItem: BillItem = {
      id: Date.now().toString(),
      name: newItemName.trim(),
      price: newItemPrice,
      assignedTo: [], // Not assigned to anyone yet (simple mode)
      isAdvanced: false,
      advancedSplits: [],
    };

    setItems(prev => [...prev, newItem]);
    setNewItemName('');
    setNewItemPrice('');
    clearError();
  };

  const removeItem = (itemId: string) => {
    setItems(prev => prev.filter(item => item.id !== itemId));
  };

  const toggleItemAssignment = (itemId: string, userId: string) => {
    setItems(prev =>
      prev.map(item => {
        if (item.id !== itemId) return item;

        const isAssigned = item.assignedTo.includes(userId);
        return {
          ...item,
          assignedTo: isAssigned
            ? item.assignedTo.filter(id => id !== userId)
            : [...item.assignedTo, userId],
        };
      })
    );
  };

  const toggleAdvancedMode = (itemId: string) => {
    setItems(prev =>
      prev.map(item => {
        if (item.id !== itemId) return item;

        if (!item.isAdvanced) {
          // Switching to advanced mode: initialize splits from assignedTo
          const initialSplits: ItemSplit[] = item.assignedTo.length > 0
            ? item.assignedTo.map(userId => ({
                userId,
                type: 'percentage' as const,
                value: Math.round((100 / item.assignedTo.length) * 100) / 100,
              }))
            : [];
          return { ...item, isAdvanced: true, advancedSplits: initialSplits };
        } else {
          // Switching to simple mode: derive assignedTo from advancedSplits
          const newAssignedTo = item.advancedSplits
            .filter(split => split.value > 0)
            .map(split => split.userId);
          return { ...item, isAdvanced: false, assignedTo: newAssignedTo };
        }
      })
    );
  };

  const updateAdvancedSplit = (
    itemId: string,
    userId: string,
    field: 'type' | 'value',
    value: string | number
  ) => {
    setItems(prev =>
      prev.map(item => {
        if (item.id !== itemId) return item;

        const existingIndex = item.advancedSplits.findIndex(s => s.userId === userId);

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
          // Add new split for this user - use existing type if any, else default
          const existingType = item.advancedSplits[0]?.type || 'percentage';
          const newSplit: ItemSplit = {
            userId,
            type: field === 'type' ? (value as 'percentage' | 'amount') : existingType,
            value: field === 'value' ? (typeof value === 'number' ? value : parseFloat(value) || 0) : 0,
          };
          return { ...item, advancedSplits: [...item.advancedSplits, newSplit] };
        }
      })
    );
  };

  const removeAdvancedSplit = (itemId: string, userId: string) => {
    setItems(prev =>
      prev.map(item => {
        if (item.id !== itemId) return item;
        return {
          ...item,
          advancedSplits: item.advancedSplits.filter(s => s.userId !== userId),
        };
      })
    );
  };

  const toggleBreakdown = (userId: string) => {
    setExpandedBreakdowns(prev => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  };

  // Calculate detailed breakdown for a participant
  const getParticipantBreakdown = (userId: string) => {
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
    items.forEach(item => {
      const itemPrice = parseFloat(item.price) || 0;
      let amount = 0;

      if (item.isAdvanced && item.advancedSplits.length > 0) {
        const split = item.advancedSplits.find(s => s.userId === userId);
        if (split) {
          amount = split.type === 'percentage'
            ? (split.value / 100) * itemPrice
            : split.value;
        }
      } else if (item.assignedTo.includes(userId)) {
        amount = itemPrice / item.assignedTo.length;
      }

      if (amount > 0) {
        breakdown.items.push({ name: item.name, amount });
        breakdown.itemsTotal += amount;
      }
    });

    // Calculate tax share (proportional)
    if (tax > 0 && subtotal > 0) {
      breakdown.taxShare = (breakdown.itemsTotal / subtotal) * tax;
    }

    // Calculate tip share
    if (tip > 0) {
      const customTip = customTipContributions.get(userId);
      if (customTip !== undefined && customTip > 0) {
        breakdown.tipShare = customTip;
        breakdown.tipType = 'custom';
      } else if (subtotal > 0) {
        // Calculate remaining tip and distribute proportionally
        let totalCustomTip = 0;
        customTipContributions.forEach((amount, uid) => {
          if (participants.some(p => p.userId === uid)) {
            totalCustomTip += amount;
          }
        });
        const remainingTip = Math.max(0, tip - totalCustomTip);

        // Calculate subtotal for participants without custom tip
        let subtotalWithoutCustomTip = 0;
        participants.forEach(p => {
          if (!customTipContributions.has(p.userId) || customTipContributions.get(p.userId) === 0) {
            // Get their item total
            let pItemTotal = 0;
            items.forEach(item => {
              const itemPrice = parseFloat(item.price) || 0;
              if (item.isAdvanced && item.advancedSplits.length > 0) {
                const split = item.advancedSplits.find(s => s.userId === p.userId);
                if (split) {
                  pItemTotal += split.type === 'percentage'
                    ? (split.value / 100) * itemPrice
                    : split.value;
                }
              } else if (item.assignedTo.includes(p.userId)) {
                pItemTotal += itemPrice / item.assignedTo.length;
              }
            });
            subtotalWithoutCustomTip += pItemTotal;
          }
        });

        if (remainingTip > 0 && subtotalWithoutCustomTip > 0) {
          breakdown.tipShare = (breakdown.itemsTotal / subtotalWithoutCustomTip) * remainingTip;
        }
        breakdown.tipType = 'proportional';
      }
    }

    breakdown.total = breakdown.itemsTotal + breakdown.taxShare + breakdown.tipShare;

    return breakdown;
  };

  const updateCustomTipContribution = (userId: string, amount: string) => {
    const value = parseFloat(amount) || 0;
    setCustomTipContributions(prev => {
      const newMap = new Map(prev);
      if (value > 0) {
        newMap.set(userId, value);
      } else {
        newMap.delete(userId);
      }
      return newMap;
    });
  };

  const addParticipantToAdvancedSplit = (itemId: string, userId: string) => {
    setItems(prev =>
      prev.map(item => {
        if (item.id !== itemId) return item;
        if (item.advancedSplits.some(s => s.userId === userId)) return item;

        return {
          ...item,
          advancedSplits: [
            ...item.advancedSplits,
            { userId, type: 'percentage' as const, value: 0 },
          ],
        };
      })
    );
  };

  // Validate advanced split for an item
  const validateAdvancedSplit = (item: BillItem): { valid: boolean; error?: string } => {
    if (!item.isAdvanced || item.advancedSplits.length === 0) {
      return { valid: false, error: `"${item.name}" has no participants assigned` };
    }

    const itemPrice = parseFloat(item.price) || 0;

    // Check if all splits are the same type
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

  // Get validation status for an item (for UI display)
  const getAdvancedSplitStatus = (item: BillItem): { isValid: boolean; message: string } => {
    if (!item.isAdvanced) {
      return { isValid: true, message: '' };
    }

    if (item.advancedSplits.length === 0) {
      return { isValid: false, message: 'Add participants' };
    }

    const itemPrice = parseFloat(item.price) || 0;
    const types = new Set(item.advancedSplits.map(s => s.type));

    if (types.size > 1) {
      return { isValid: false, message: 'Mixed types' };
    }

    const splitType = item.advancedSplits[0]?.type;
    const total = item.advancedSplits.reduce((sum, split) => sum + split.value, 0);

    if (splitType === 'percentage') {
      if (Math.abs(total - 100) <= 0.01) {
        return { isValid: true, message: `100%` };
      }
      return { isValid: false, message: `${total.toFixed(1)}% of 100%` };
    } else {
      if (Math.abs(total - itemPrice) <= 0.01) {
        return { isValid: true, message: `$${itemPrice.toFixed(2)}` };
      }
      return { isValid: false, message: `$${total.toFixed(2)} of $${itemPrice.toFixed(2)}` };
    }
  };

  const createBillMutation = useMutation({
    mutationFn: async () => {
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

      // Validate bill name
      const nameValidation = validateBillName(billName);
      if (!nameValidation.isValid) {
        const msg = getFirstError(nameValidation) || 'Invalid bill name';
        errorMessages.push(msg);
        hasErrors = true;
      }

      // Validate friends selected
      if (selectedFriendIds.length === 0) {
        errorMessages.push('Please select at least one friend');
        hasErrors = true;
      }

      // Validate items exist
      if (items.length === 0) {
        errorMessages.push('Please add at least one item');
        hasErrors = true;
      }

      // Validate each item
      for (const item of items) {
        if (item.isAdvanced) {
          // Check all participants in advanced mode have values filled
          if (item.advancedSplits.length === 0) {
            newErrors.items.set(item.id, 'Add participants to split this item');
            hasErrors = true;
            continue;
          }

          // Check for empty values in advanced splits
          const splitErrors = new Map<string, string>();
          for (const split of item.advancedSplits) {
            if (split.value === 0 || split.value === undefined || isNaN(split.value)) {
              splitErrors.set(split.userId, 'Value required');
              hasErrors = true;
            }
          }
          if (splitErrors.size > 0) {
            newErrors.advancedSplits.set(item.id, splitErrors);
          }

          // Validate total
          const validation = validateAdvancedSplit(item);
          if (!validation.valid) {
            newErrors.items.set(item.id, validation.error || 'Invalid split');
            hasErrors = true;
          }
        } else if (item.assignedTo.length === 0) {
          newErrors.items.set(item.id, 'Assign participants');
          hasErrors = true;
        }
      }

      // Validate custom tip contributions - if ANY are set, ALL must be set AND sum must equal total tip
      if (customTipContributions.size > 0 && tip > 0) {
        let customTipSum = 0;
        for (const p of participants) {
          const customTip = customTipContributions.get(p.userId);
          if (customTip === undefined || customTip === 0 || isNaN(customTip)) {
            newErrors.customTips.set(p.userId, 'Required when using custom tips');
            hasErrors = true;
          } else {
            customTipSum += customTip;
          }
        }

        // Check that custom tips sum to total tip
        if (!hasErrors && Math.abs(customTipSum - tip) > 0.01) {
          const diff = customTipSum - tip;
          const diffText = diff > 0
            ? `$${diff.toFixed(2)} over`
            : `$${Math.abs(diff).toFixed(2)} under`;
          errorMessages.push(`Custom tips must sum to $${tip.toFixed(2)} (currently ${diffText})`);
          // Mark all custom tips as needing attention
          for (const p of participants) {
            newErrors.customTips.set(p.userId, `Sum must equal $${tip.toFixed(2)}`);
          }
          hasErrors = true;
        }
      }

      // Validate total
      if (total <= 0) {
        errorMessages.push('Total amount must be greater than $0');
        hasErrors = true;
      }

      // If there are errors, set them and scroll to first error
      if (hasErrors) {
        setFieldErrors(newErrors);
        // Collect all error messages for display
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

        // Scroll to first error
        setTimeout(() => scrollToFirstError(newErrors), 100);

        throw new Error(errorMessages[0] || 'Please fix the highlighted errors');
      }

      // Build participants array with calculated amounts and custom tip contributions
      const billParticipants = participants.map(p => {
        const customTip = customTipContributions.get(p.userId);
        return {
          user_id: p.userId,
          amount_owed: Math.round((participantTotals.get(p.userId) || 0) * 100) / 100,
          custom_tip_contribution: customTip && customTip > 0 ? customTip : null,
        };
      });

      // Build items array for itemized bill with split configuration
      const billItems = items.map(item => {
        // For advanced mode, get user IDs from advancedSplits
        // For simple mode, use assignedTo
        const assignedUserIds = item.isAdvanced
          ? item.advancedSplits.map(split => split.userId)
          : item.assignedTo;

        // Build split_config for advanced mode items
        const splitConfig = item.isAdvanced && item.advancedSplits.length > 0
          ? item.advancedSplits.map(split => ({
              participant_index: participants.findIndex(p => p.userId === split.userId),
              type: split.type,
              value: split.value,
            })).filter(config => config.participant_index !== -1)
          : undefined;

        return {
          item_name: item.name,
          price: parseFloat(item.price),
          assigned_to_indices: assignedUserIds.map(userId =>
            participants.findIndex(p => p.userId === userId)
          ).filter(idx => idx !== -1),
          split_mode: item.isAdvanced ? 'advanced' as const : 'simple' as const,
          split_config: splitConfig,
        };
      });

      // Create bill
      return await createBill({
        bill_name: billName,
        total_amount: Math.round(total * 100) / 100,
        tax: Math.round(tax * 100) / 100,
        tip: Math.round(tip * 100) / 100,
        fees: 0,
        split_mode: 'itemized',
        extras_split_mode: 'proportional',
        status: 'active',
        payer_id: payerId,
        participants: billParticipants,
        items: billItems,
      });
    },
    onSuccess: (data) => {
      // Clear any remaining errors on success
      clearFieldErrors();
      clearError();

      trackEvent(ANALYTICS_EVENTS.BILL_CREATED, {
        source: 'CreateItemizedBillPage',
        splitMode: 'itemized',
        participantCount: participants.length,
        itemCount: items.length,
        totalAmount: total,
      });

      queryClient.invalidateQueries({ queryKey: ['bills'] });
      onSuccess(data.id);
    },
    onError: (err) => {
      handleError(err, { customMessage: ERROR_MESSAGES.GENERIC.CREATE_FAILED("bill") });
    },
  });

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onCancel} className="p-2">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-900">Itemized Bill</h1>
            <p className="text-sm text-gray-500">Add items and assign to participants</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-32">
        {/* Error Display */}
        <ErrorDisplay error={error} onClear={clearError} />

        {/* Bill Name */}
        <Card className="p-4">
          <Label htmlFor="bill-name" className="text-base font-semibold">Bill Name</Label>
          <Input
            id="bill-name"
            placeholder="e.g., Dinner at Joe's"
            value={billName}
            onChange={e => setBillName(e.target.value)}
            className="mt-2"
          />
        </Card>

        {/* Select Friends */}
        <Card className="p-4">
          <Label className="text-base font-semibold">Split With</Label>
          <div className="border rounded-lg mt-2 max-h-48 overflow-y-auto">
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
            <div className="text-sm text-gray-600 mt-2">
              {selectedFriendIds.length} friend{selectedFriendIds.length !== 1 ? 's' : ''} selected
            </div>
          )}
        </Card>

        {/* Items Section */}
        {selectedFriendIds.length > 0 && (
          <Card className="p-4">
            <Label className="text-base font-semibold">Menu Items</Label>

            {/* Add Item Form */}
            <div className="flex gap-2 mt-3">
              <Input
                placeholder="Item name"
                value={newItemName}
                onChange={e => setNewItemName(e.target.value)}
                className="flex-1"
                onKeyDown={e => e.key === 'Enter' && addItem()}
              />
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="Price"
                value={newItemPrice}
                onChange={e => setNewItemPrice(e.target.value)}
                className="w-24"
                onKeyDown={e => e.key === 'Enter' && addItem()}
              />
              <Button onClick={addItem} size="icon">
                <Plus className="w-4 h-4" />
              </Button>
            </div>

            {/* Items List */}
            {items.length > 0 && (
              <div className="mt-4 space-y-3">
                {items.map(item => {
                  const splitStatus = getAdvancedSplitStatus(item);
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
                        </div>
                        <div className="flex items-center gap-1">
                          {/* Simple/Advanced Toggle */}
                          <div className="flex rounded-md border border-gray-300 text-xs overflow-hidden">
                            <button
                              type="button"
                              onClick={() => item.isAdvanced && toggleAdvancedMode(item.id)}
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
                              onClick={() => !item.isAdvanced && toggleAdvancedMode(item.id)}
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
                            onClick={() => removeItem(item.id)}
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
                            {participants.map(p => {
                              const isAssigned = item.assignedTo.includes(p.userId);
                              return (
                                <button
                                  key={p.userId}
                                  type="button"
                                  onClick={() => toggleItemAssignment(item.id, p.userId)}
                                  className={`px-3 py-1 rounded-full text-sm transition-colors whitespace-nowrap flex-shrink-0 ${
                                    isAssigned
                                      ? 'bg-blue-600 text-white'
                                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                  }`}
                                >
                                  {p.userName}
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
                          {item.advancedSplits.length < participants.length && (
                            <div className="flex items-center gap-2 mb-2">
                              <div className="relative flex-1">
                                <select
                                  className="w-full h-9 rounded-md border border-gray-300 bg-white px-3 pr-8 text-sm appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                  value=""
                                  onChange={e => {
                                    if (e.target.value) {
                                      addParticipantToAdvancedSplit(item.id, e.target.value);
                                    }
                                  }}
                                >
                                  <option value="">Add participant...</option>
                                  {participants
                                    .filter(p => !item.advancedSplits.some(s => s.userId === p.userId))
                                    .map(p => (
                                      <option key={p.userId} value={p.userId}>
                                        {p.userName}
                                      </option>
                                    ))}
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
                            const participant = participants.find(p => p.userId === split.userId);
                            const calculatedAmount = split.type === 'percentage'
                              ? (split.value / 100) * itemPrice
                              : split.value;
                            const splitError = splitErrors?.get(split.userId);

                            return (
                              <div
                                key={split.userId}
                                ref={(el) => setErrorRef(`split-${item.id}-${split.userId}`, el)}
                                className={`flex items-center gap-2 p-2 rounded border ${
                                  splitError ? 'bg-red-50 border-red-300' : 'bg-white border-gray-200'
                                }`}
                              >
                                <span className="font-medium text-sm min-w-[60px]">
                                  {participant?.userName || 'Unknown'}
                                </span>
                                <div className="relative">
                                  <select
                                    className="h-8 w-14 rounded-md border border-gray-300 bg-white pl-2 pr-6 text-sm appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    value={split.type}
                                    onChange={e => updateAdvancedSplit(item.id, split.userId, 'type', e.target.value)}
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
                                  onChange={e => updateAdvancedSplit(item.id, split.userId, 'value', e.target.value)}
                                  className={`w-20 h-8 text-sm ${splitError ? 'border-red-500 focus:ring-red-500' : ''}`}
                                  placeholder="0"
                                />
                                <span className="text-sm text-gray-500 min-w-[60px]">
                                  = ${calculatedAmount.toFixed(2)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => removeAdvancedSplit(item.id, split.userId)}
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

            {items.length === 0 && (
              <p className="text-sm text-gray-500 mt-3 text-center py-4">
                Add menu items above
              </p>
            )}
          </Card>
        )}

        {/* Tax & Tip Inputs */}
        {items.length > 0 && (
          <Card className="p-4 space-y-4">
            <div>
              <Label htmlFor="tax" className="text-base font-semibold">Tax Amount</Label>
              <Input
                id="tax"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={taxAmount}
                onChange={e => setTaxAmount(e.target.value)}
                className="mt-2"
              />
            </div>
            <div>
              <Label htmlFor="tip" className="text-base font-semibold">Total Tip Amount</Label>
              <Input
                id="tip"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={tipAmount}
                onChange={e => setTipAmount(e.target.value)}
                className="mt-2"
              />
              <p className="text-xs text-gray-500 mt-1">By default, tip is distributed proportionally based on each person's share</p>
            </div>

            {/* Custom Tip Contributions */}
            {tip > 0 && selectedFriendIds.length > 0 && (
              <div className="border-t pt-4">
                <Label className="text-sm font-semibold text-gray-700">
                  Custom Tip Contributions
                  {customTipContributions.size > 0 ? (
                    <span className="text-red-500 ml-1">*</span>
                  ) : (
                    <span className="font-normal text-gray-500 ml-1">(Optional)</span>
                  )}
                </Label>
                <p className="text-xs text-gray-500 mb-3">
                  {customTipContributions.size > 0
                    ? 'When using custom tips, all participants must have a tip amount entered.'
                    : 'If someone wants to contribute a specific tip amount, enter it below. The remaining tip will be split proportionally among others.'}
                </p>
                <div className="space-y-2">
                  {participants.map(p => {
                    const customTip = customTipContributions.get(p.userId) || 0;
                    const tipError = fieldErrors.customTips.get(p.userId);

                    // Calculate what their proportional tip would be (without custom)
                    let defaultProportionalTip = 0;
                    if (subtotal > 0) {
                      // Get item total for this participant
                      let itemTotal = 0;
                      items.forEach(item => {
                        const itemPrice = parseFloat(item.price) || 0;
                        if (item.isAdvanced && item.advancedSplits.length > 0) {
                          const split = item.advancedSplits.find(s => s.userId === p.userId);
                          if (split) {
                            itemTotal += split.type === 'percentage'
                              ? (split.value / 100) * itemPrice
                              : split.value;
                          }
                        } else if (item.assignedTo.includes(p.userId)) {
                          itemTotal += itemPrice / item.assignedTo.length;
                        }
                      });
                      defaultProportionalTip = (itemTotal / subtotal) * tip;
                    }

                    return (
                      <div
                        key={p.userId}
                        ref={(el) => setErrorRef(`tip-${p.userId}`, el)}
                        className={`flex items-center gap-2 p-2 rounded ${
                          tipError ? 'bg-red-50 border border-red-300' : 'bg-gray-50'
                        }`}
                      >
                        <span className="font-medium text-sm flex-1 min-w-[80px]">{p.userName}</span>
                        <span className="text-xs text-gray-400">
                          (default: ${defaultProportionalTip.toFixed(2)})
                        </span>
                        <div className="flex items-center gap-1">
                          <span className="text-sm text-gray-600">$</span>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder={defaultProportionalTip.toFixed(2)}
                            value={customTip || ''}
                            onChange={e => updateCustomTipContribution(p.userId, e.target.value)}
                            className={`w-20 h-8 text-sm ${tipError ? 'border-red-500 focus:ring-red-500' : ''}`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Custom tip summary */}
                {customTipContributions.size > 0 && (() => {
                  let totalCustom = 0;
                  customTipContributions.forEach((amount, userId) => {
                    if (participants.some(p => p.userId === userId)) {
                      totalCustom += amount;
                    }
                  });
                  const diff = totalCustom - tip;
                  const isValid = Math.abs(diff) <= 0.01;

                  return (
                    <div className={`mt-3 p-2 rounded text-sm ${
                      isValid ? 'bg-green-50 border border-green-200' : 'bg-orange-50 border border-orange-200'
                    }`}>
                      <div className="flex justify-between items-center">
                        <span className={isValid ? 'text-green-700' : 'text-orange-700'}>
                          Total custom tips:
                        </span>
                        <span className={`font-medium ${isValid ? 'text-green-700' : 'text-orange-700'}`}>
                          ${totalCustom.toFixed(2)} / ${tip.toFixed(2)}
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
                              {diff > 0 ? `$${diff.toFixed(2)} over` : `$${Math.abs(diff).toFixed(2)} under`} - must equal total tip
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </Card>
        )}

        {/* Totals Summary */}
        {items.length > 0 && (
          <Card className="p-4 bg-blue-50 border-blue-200">
            <div className="space-y-2">
              <div className="flex justify-between text-gray-700">
                <span>Subtotal:</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>
              {tax > 0 && (
                <div className="flex justify-between text-gray-700">
                  <span>Tax:</span>
                  <span>${tax.toFixed(2)}</span>
                </div>
              )}
              {tip > 0 && (
                <div className="flex justify-between text-gray-700">
                  <span>Tip:</span>
                  <span>${tip.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold text-blue-900 pt-2 border-t border-blue-200">
                <span>Total:</span>
                <span>${total.toFixed(2)}</span>
              </div>
            </div>
          </Card>
        )}

        {/* Payment Summary Section - Who Paid + Each Person Owes */}
        {items.length > 0 && selectedFriendIds.length > 0 && (
          <Card className="p-4 bg-green-50 border-green-200">
            <h3 className="text-base font-semibold text-green-900 mb-4">Payment Summary</h3>

            {/* Who Paid */}
            <div className="mb-4">
              <Label htmlFor="payer" className="text-sm font-medium text-green-800">Who paid the bill?</Label>
              <div className="relative mt-2">
                <select
                  id="payer"
                  value={payerId}
                  onChange={e => setPayerId(e.target.value)}
                  className="w-full h-11 rounded-md border border-green-300 bg-white px-3 py-2 text-sm appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                >
                  <option value={currentUserId}>Me ({currentUserName})</option>
                  {selectedFriendIds.map(friendId => {
                    const friend = friends.find(f => f.id === friendId);
                    if (!friend) return null;
                    return (
                      <option key={friendId} value={friendId}>
                        {friend.name || friend.email?.split('@')[0] || 'Unknown'}
                      </option>
                    );
                  })}
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                  <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-green-200 my-4" />

            {/* Each Person Owes */}
            <div>
              <Label className="text-sm font-medium text-green-800">Each Person Owes</Label>
              <div className="mt-2 space-y-2">
                {participants.map(p => {
                  const amount = participantTotals.get(p.userId) || 0;
                  const isPayer = p.userId === payerId;
                  const isExpanded = expandedBreakdowns.has(p.userId);
                  const breakdown = getParticipantBreakdown(p.userId);

                  return (
                    <div key={p.userId} className="bg-white rounded border border-green-200 overflow-hidden">
                      {/* Main row - clickable to expand */}
                      <button
                        type="button"
                        onClick={() => toggleBreakdown(p.userId)}
                        className="w-full flex justify-between items-center p-2 hover:bg-green-50 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-green-600" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-green-600" />
                          )}
                          <span className="font-medium text-gray-900">
                            {p.userName}
                            {isPayer && <span className="text-xs text-green-600 ml-2">(paid)</span>}
                          </span>
                        </div>
                        <span className={amount > 0 ? 'text-green-700 font-semibold' : 'text-gray-400'}>
                          ${amount.toFixed(2)}
                        </span>
                      </button>

                      {/* Collapsible breakdown */}
                      {isExpanded && (
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
                              <span>
                                Tax share
                                <span className="text-xs text-gray-400 ml-1">
                                  ({subtotal > 0 ? ((breakdown.itemsTotal / subtotal) * 100).toFixed(1) : 0}% of ${tax.toFixed(2)})
                                </span>
                              </span>
                              <span>${breakdown.taxShare.toFixed(2)}</span>
                            </div>
                          )}

                          {/* Tip share */}
                          {breakdown.tipShare > 0 && (
                            <div className="flex justify-between text-sm text-gray-600">
                              <span>
                                Tip
                                <span className="text-xs text-gray-400 ml-1">
                                  ({breakdown.tipType === 'custom' ? 'custom amount' : 'proportional'})
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
            </div>
          </Card>
        )}
      </div>

      {/* Bottom Actions */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 space-y-2">
        <Button
          onClick={() => createBillMutation.mutate()}
          className="w-full"
          disabled={
            createBillMutation.isPending ||
            !billName ||
            selectedFriendIds.length === 0 ||
            items.length === 0 ||
            total === 0
          }
        >
          <DollarSign className="w-4 h-4 mr-2" />
          {createBillMutation.isPending ? 'Creating...' : `Create Bill ($${total.toFixed(2)})`}
        </Button>
        <Button
          variant="outline"
          onClick={onCancel}
          className="w-full"
          disabled={createBillMutation.isPending}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
