import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { pb, MenuReviewRequest, MenuItem, MenuImage, Restaurant } from '@/lib/pocketbase';
import { logger } from '@/lib/logger';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Pencil, Trash2, X, Check } from 'lucide-react';
import {
  getPendingReviewRequests,
  updateReviewRequestStatus,
} from '@/services/menuReviewService';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface AdminMenuReviewsPageProps {
  onNavigateBack?: () => void;
}

interface ExpandedRequest {
  [key: string]: boolean;
}

interface EditingMenuItem {
  id: string;
  name: string;
  description: string;
}

export default function AdminMenuReviewsPage({ onNavigateBack: _onNavigateBack }: AdminMenuReviewsPageProps) {
  const queryClient = useQueryClient();
  const [expandedRequests, setExpandedRequests] = useState<ExpandedRequest>({});
  const [adminNotes, setAdminNotes] = useState<{ [key: string]: string }>({});
  const [selectedImage, setSelectedImage] = useState<{ url: string; name: string } | null>(null);
  const [editingItem, setEditingItem] = useState<EditingMenuItem | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);

  // Fetch pending review requests
  const { data: reviewRequests, isLoading, error } = useQuery({
    queryKey: ['adminReviewRequests'],
    queryFn: getPendingReviewRequests,
  });

  // Fetch menu items for a specific restaurant
  const fetchMenuItems = async (restaurantId: string): Promise<MenuItem[]> => {
    try {
      const items = await pb.collection('menu_items').getFullList<MenuItem>({
        filter: `restaurant = "${restaurantId}"`,
        sort: '-created',
        expand: 'sourceImage',
      });
      return items;
    } catch (err) {
      logger.error('Failed to fetch menu items:', err);
      return [];
    }
  };

  // Update menu item mutation
  const updateMenuItemMutation = useMutation({
    mutationFn: async ({ id, name, description }: { id: string; name: string; description: string }) => {
      return await pb.collection('menu_items').update(id, {
        name,
        description,
      });
    },
    onSuccess: (_, variables) => {
      logger.log('Menu item updated successfully');
      setEditingItem(null);
      // Invalidate the menu items query for this restaurant
      queryClient.invalidateQueries({ queryKey: ['menuItems'] });
    },
    onError: (err: any) => {
      logger.error('Failed to update menu item:', err);
      alert(err.message || 'Failed to update menu item');
    },
  });

  // Delete menu item mutation
  const deleteMenuItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      return await pb.collection('menu_items').delete(itemId);
    },
    onSuccess: () => {
      logger.log('Menu item deleted successfully');
      setDeletingItemId(null);
      // Invalidate the menu items query
      queryClient.invalidateQueries({ queryKey: ['menuItems'] });
    },
    onError: (err: any) => {
      logger.error('Failed to delete menu item:', err);
      alert(err.message || 'Failed to delete menu item');
      setDeletingItemId(null);
    },
  });

  // Update review request status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({
      requestId,
      status,
      notes,
    }: {
      requestId: string;
      status: 'reviewed' | 'dismissed';
      notes?: string;
    }) => {
      return await updateReviewRequestStatus(requestId, status, notes);
    },
    onSuccess: () => {
      logger.log('Review request status updated');
      // Refresh the review requests list
      queryClient.invalidateQueries({ queryKey: ['adminReviewRequests'] });
      // Clear admin notes for this request
      setAdminNotes((prev) => {
        const newNotes = { ...prev };
        delete newNotes[updateStatusMutation.variables?.requestId || ''];
        return newNotes;
      });
    },
    onError: (err: any) => {
      logger.error('Failed to update review request status:', err);
      alert(err.message || 'Failed to update review request');
    },
  });

  const toggleExpandRequest = (requestId: string) => {
    setExpandedRequests((prev) => ({
      ...prev,
      [requestId]: !prev[requestId],
    }));
  };

  const handleMarkAsReviewed = (requestId: string) => {
    updateStatusMutation.mutate({
      requestId,
      status: 'reviewed',
      notes: adminNotes[requestId],
    });
  };

  const handleDismiss = (requestId: string) => {
    updateStatusMutation.mutate({
      requestId,
      status: 'dismissed',
      notes: adminNotes[requestId],
    });
  };

  const handleEditMenuItem = (item: MenuItem) => {
    setEditingItem({
      id: item.id,
      name: item.name,
      description: item.description || '',
    });
  };

  const handleSaveMenuItem = () => {
    if (!editingItem) return;

    if (!editingItem.name.trim()) {
      alert('Name cannot be empty');
      return;
    }

    updateMenuItemMutation.mutate({
      id: editingItem.id,
      name: editingItem.name.trim(),
      description: editingItem.description.trim(),
    });
  };

  const handleCancelEdit = () => {
    setEditingItem(null);
  };

  const handleDeleteMenuItem = (itemId: string) => {
    setDeletingItemId(itemId);
  };

  const confirmDeleteMenuItem = () => {
    if (deletingItemId) {
      deleteMenuItemMutation.mutate(deletingItemId);
    }
  };

  const handleImageClick = (imageId: string, imageName: string) => {
    // Build the image URL
    const imageUrl = `${pb.baseUrl}/api/files/menu_images/${imageId}/${imageName}`;
    setSelectedImage({ url: imageUrl, name: imageName });
  };

  const getExpandedRestaurant = (request: MenuReviewRequest): Restaurant | undefined => {
    return (request as any).expand?.restaurant;
  };

  const getExpandedRequestedBy = (request: MenuReviewRequest): any => {
    return (request as any).expand?.requestedBy;
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full bg-gray-50">
        <div className="bg-white border-b border-gray-200 px-4 py-4">
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-gray-900">Menu Reviews</h1>
            <Badge variant="default" className="bg-purple-600">
              Admin Only
            </Badge>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Review reported restaurant menu items
          </p>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col h-full bg-gray-50">
        <div className="bg-white border-b border-gray-200 px-4 py-4">
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-gray-900">Menu Reviews</h1>
            <Badge variant="default" className="bg-purple-600">
              Admin Only
            </Badge>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <p className="text-red-500 mb-2">Failed to load review requests</p>
            <p className="text-sm text-gray-600">{(error as Error).message}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Image Enlargement Modal */}
      <AlertDialog open={selectedImage !== null} onOpenChange={() => setSelectedImage(null)}>
        <AlertDialogContent className="max-w-[90vw] max-h-[90vh] p-0">
          <AlertDialogHeader className="p-4 pb-2">
            <AlertDialogTitle>Menu Image</AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-gray-500">
              {selectedImage?.name}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="overflow-auto max-h-[calc(90vh-120px)] p-4">
            {selectedImage && (
              <img
                src={selectedImage.url}
                alt="Menu item"
                className="w-full h-auto"
              />
            )}
          </div>
          <AlertDialogFooter className="p-4 pt-2">
            <Button onClick={() => setSelectedImage(null)} className="w-full">
              Close
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Modal */}
      <AlertDialog open={deletingItemId !== null} onOpenChange={() => setDeletingItemId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Menu Item</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this menu item? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeletingItemId(null)}
              disabled={deleteMenuItemMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteMenuItem}
              disabled={deleteMenuItemMutation.isPending}
            >
              {deleteMenuItemMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex flex-col h-full bg-gray-50" data-testid="admin-menu-reviews-page">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 py-4">
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-gray-900">Menu Reviews</h1>
            <Badge variant="default" className="bg-purple-600">
              Admin Only
            </Badge>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Review reported restaurant menu items
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {!reviewRequests || reviewRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <div className="bg-gray-100 rounded-full p-6 mb-4">
                <Badge className="bg-green-600 text-white text-lg px-4 py-2">
                  All Clear
                </Badge>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                No pending reviews
              </h2>
              <p className="text-sm text-gray-600 max-w-md">
                There are currently no menu review requests pending. When users report issues with menu items, they will appear here.
              </p>
            </div>
          ) : (
            reviewRequests.map((request) => {
              const restaurant = getExpandedRestaurant(request);
              const requestedBy = getExpandedRequestedBy(request);
              const isExpanded = expandedRequests[request.id];

              return (
                <div
                  key={request.id}
                  className="bg-white rounded-lg border border-gray-200 overflow-hidden"
                  data-testid={`review-request-${request.id}`}
                >
                  {/* Request Header */}
                  <div className="p-4 space-y-3">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">
                        {restaurant?.name || 'Unknown Restaurant'}
                      </h2>
                      <p className="text-xs text-gray-500 mt-1">
                        Reported by: {requestedBy?.email || 'Unknown'} on{' '}
                        {new Date(request.created).toLocaleDateString()}
                      </p>
                    </div>

                    {request.reason && (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                        <p className="text-xs font-medium text-yellow-900 mb-1">
                          Reason for Report:
                        </p>
                        <p className="text-sm text-yellow-800">{request.reason}</p>
                      </div>
                    )}

                    {/* Expand/Collapse Button */}
                    <Button
                      onClick={() => toggleExpandRequest(request.id)}
                      variant="outline"
                      className="w-full flex items-center justify-center gap-2"
                      data-testid={`expand-request-${request.id}`}
                    >
                      {isExpanded ? (
                        <>
                          <ChevronUp className="w-4 h-4" />
                          Hide Menu Items
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-4 h-4" />
                          Show Menu Items
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Expanded Menu Items Section */}
                  {isExpanded && (
                    <MenuItemsList
                      restaurantId={request.restaurant}
                      editingItem={editingItem}
                      onEdit={handleEditMenuItem}
                      onSave={handleSaveMenuItem}
                      onCancelEdit={handleCancelEdit}
                      onDelete={handleDeleteMenuItem}
                      onImageClick={handleImageClick}
                      setEditingItem={setEditingItem}
                      isUpdating={updateMenuItemMutation.isPending}
                    />
                  )}

                  {/* Admin Notes and Actions */}
                  <div className="border-t border-gray-200 p-4 space-y-3 bg-gray-50">
                    <div>
                      <label className="text-xs font-medium text-gray-700 block mb-1">
                        Admin Notes (optional)
                      </label>
                      <Textarea
                        value={adminNotes[request.id] || ''}
                        onChange={(e) =>
                          setAdminNotes((prev) => ({
                            ...prev,
                            [request.id]: e.target.value,
                          }))
                        }
                        placeholder="Add any notes about this review..."
                        className="text-sm"
                        rows={2}
                        data-testid={`admin-notes-${request.id}`}
                      />
                    </div>

                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleMarkAsReviewed(request.id)}
                        disabled={updateStatusMutation.isPending}
                        className="flex-1 bg-green-600 hover:bg-green-700"
                        data-testid={`mark-reviewed-${request.id}`}
                      >
                        {updateStatusMutation.isPending &&
                        updateStatusMutation.variables?.requestId === request.id
                          ? 'Updating...'
                          : 'Mark as Reviewed'}
                      </Button>
                      <Button
                        onClick={() => handleDismiss(request.id)}
                        disabled={updateStatusMutation.isPending}
                        variant="outline"
                        className="flex-1"
                        data-testid={`dismiss-${request.id}`}
                      >
                        Dismiss
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}

// Separate component for menu items list to handle its own query
function MenuItemsList({
  restaurantId,
  editingItem,
  onEdit,
  onSave,
  onCancelEdit,
  onDelete,
  onImageClick,
  setEditingItem,
  isUpdating,
}: {
  restaurantId: string;
  editingItem: EditingMenuItem | null;
  onEdit: (item: MenuItem) => void;
  onSave: () => void;
  onCancelEdit: () => void;
  onDelete: (itemId: string) => void;
  onImageClick: (imageId: string, imageName: string) => void;
  setEditingItem: (item: EditingMenuItem | null) => void;
  isUpdating: boolean;
}) {
  const { data: menuItems, isLoading } = useQuery({
    queryKey: ['menuItems', restaurantId],
    queryFn: async () => {
      const items = await pb.collection('menu_items').getFullList<MenuItem>({
        filter: `restaurant = "${restaurantId}"`,
        sort: '-created',
        expand: 'sourceImage',
      });
      return items;
    },
  });

  const getExpandedSourceImage = (item: MenuItem): MenuImage | undefined => {
    return (item as any).expand?.sourceImage;
  };

  if (isLoading) {
    return (
      <div className="border-t border-gray-200 p-4">
        <p className="text-sm text-gray-500 text-center">Loading menu items...</p>
      </div>
    );
  }

  if (!menuItems || menuItems.length === 0) {
    return (
      <div className="border-t border-gray-200 p-4">
        <p className="text-sm text-gray-500 text-center">No menu items found for this restaurant</p>
      </div>
    );
  }

  return (
    <div className="border-t border-gray-200 p-4 space-y-3 bg-white">
      <h3 className="text-sm font-semibold text-gray-700 mb-2">
        Menu Items ({menuItems.length})
      </h3>
      {menuItems.map((item) => {
        const sourceImage = getExpandedSourceImage(item);
        const isEditing = editingItem?.id === item.id;

        return (
          <div
            key={item.id}
            className="border border-gray-200 rounded-md p-3 space-y-2"
            data-testid={`menu-item-${item.id}`}
          >
            {isEditing ? (
              // Edit Mode
              <div className="space-y-2">
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">
                    Name
                  </label>
                  <Input
                    value={editingItem.name}
                    onChange={(e) =>
                      setEditingItem({
                        ...editingItem,
                        name: e.target.value,
                      })
                    }
                    className="text-sm"
                    disabled={isUpdating}
                    data-testid={`edit-name-${item.id}`}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">
                    Description
                  </label>
                  <Textarea
                    value={editingItem.description}
                    onChange={(e) =>
                      setEditingItem({
                        ...editingItem,
                        description: e.target.value,
                      })
                    }
                    className="text-sm"
                    rows={2}
                    disabled={isUpdating}
                    data-testid={`edit-description-${item.id}`}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={onSave}
                    disabled={isUpdating}
                    size="sm"
                    className="flex-1 bg-green-600 hover:bg-green-700"
                    data-testid={`save-item-${item.id}`}
                  >
                    <Check className="w-3 h-3 mr-1" />
                    {isUpdating ? 'Saving...' : 'Save'}
                  </Button>
                  <Button
                    onClick={onCancelEdit}
                    disabled={isUpdating}
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    data-testid={`cancel-edit-${item.id}`}
                  >
                    <X className="w-3 h-3 mr-1" />
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              // View Mode
              <>
                <div className="flex items-start gap-3">
                  {/* Image Thumbnail */}
                  {sourceImage && (
                    <button
                      onClick={() => onImageClick(sourceImage.id, sourceImage.image)}
                      className="flex-shrink-0 w-16 h-16 rounded-md overflow-hidden border border-gray-200 hover:border-blue-500 transition-colors"
                      data-testid={`image-${item.id}`}
                    >
                      <img
                        src={`${pb.baseUrl}/api/files/menu_images/${sourceImage.id}/${sourceImage.image}?thumb=100x100`}
                        alt={item.name}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  )}

                  {/* Item Details */}
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold text-gray-900 break-words">
                      {item.name}
                    </h4>
                    {item.description && (
                      <p className="text-xs text-gray-600 mt-1 break-words">
                        {item.description}
                      </p>
                    )}
                    {item.isFromOCR && (
                      <Badge
                        variant="outline"
                        className="mt-2 text-xs border-blue-500 text-blue-700"
                      >
                        From OCR
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={() => onEdit(item)}
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    data-testid={`edit-item-${item.id}`}
                  >
                    <Pencil className="w-3 h-3 mr-1" />
                    Edit
                  </Button>
                  <Button
                    onClick={() => onDelete(item.id)}
                    variant="outline"
                    size="sm"
                    className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                    data-testid={`delete-item-${item.id}`}
                  >
                    <Trash2 className="w-3 h-3 mr-1" />
                    Delete
                  </Button>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
