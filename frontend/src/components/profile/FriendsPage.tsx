import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { pb, Friendship } from "@/lib/pocketbase";
import { COLLECTIONS } from '@/constants/collections';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { DeleteConfirmationDialog } from "@/components/ui/DeleteConfirmationDialog";
import { LoadingState } from "@/components/ui/LoadingState";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QRCodeSVG } from "qrcode.react";
import {
  Users,
  UserPlus,
  Check,
  X,
  Copy,
  QrCode,
  ChevronRight,
  Scan,
  WifiOff,
} from "lucide-react";
import QRScanner from "@/components/shared/QRScanner";
import { useSync } from "@/contexts/SyncContext";
import { useErrorHandler } from "@/hooks/ui/useErrorHandler";
import { ErrorDisplay } from "@/components/shared/ErrorDisplay";
import { ERROR_MESSAGES } from "@/lib/errorMessages";

// Generate a unique friend code from user ID (base62 encoding for shorter code)
function generateFriendCode(userId: string): string {
  // Use first 8 chars of user ID and format nicely
  const cleanId = userId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return cleanId.slice(0, 8);
}

// FriendWithDetails inherits expand property from Friendship interface
interface FriendWithDetails extends Friendship {
  // No need to redefine expand - it's already in Friendship
}

export default function FriendsPage() {
  const [friendCode, setFriendCode] = useState("");
  const [showQRCode, setShowQRCode] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const { error, handleError, clearError, showSuccess, showValidation } = useErrorHandler({
    source: 'FriendsPage',
    defaultSeverity: 'error',
    autoClearMs: 3000,
  });
  const [friendToRemove, setFriendToRemove] =
    useState<FriendWithDetails | null>(null);
  const queryClient = useQueryClient();
  const { isOnline } = useSync();

  const currentUser = pb.authStore.record;
  const myFriendCode = currentUser ? generateFriendCode(currentUser.id) : "";

  // Fetch all friendships (sent and received)
  const { data: friendships = [], isLoading } = useQuery<FriendWithDetails[]>({
    queryKey: ["friendships"],
    queryFn: async () => {
      return await pb.collection(COLLECTIONS.FRIENDSHIPS).getFullList<FriendWithDetails>({
        sort: "-created",
        expand: "user,friend",
      });
    },
  });

  // Categorize friendships
  const { acceptedFriends, pendingReceived, pendingSent } = useMemo(() => {
    const accepted: FriendWithDetails[] = [];
    const received: FriendWithDetails[] = [];
    const sent: FriendWithDetails[] = [];

    friendships.forEach((friendship) => {
      if (friendship.status === "accepted") {
        accepted.push(friendship);
      } else if (friendship.status === "pending") {
        // If I'm the friend (receiver), it's a received request
        if (friendship.friend === currentUser?.id) {
          received.push(friendship);
        } else {
          sent.push(friendship);
        }
      }
    });

    return {
      acceptedFriends: accepted,
      pendingReceived: received,
      pendingSent: sent,
    };
  }, [friendships, currentUser?.id]);

  // Send friend request mutation
  const sendFriendRequestMutation = useMutation({
    mutationFn: async (code: string) => {
      if (!currentUser) throw new Error("Not authenticated");

      if (!isOnline) {
        throw new Error(ERROR_MESSAGES.FRIENDS.OFFLINE_LOOKUP);
      }

      // Find user by friend code using backend API
      const response = await pb.send(
        `/api/users/by-friend-code/${code.toUpperCase()}`,
        {
          method: "GET",
        }
      );

      if (!response.found) {
        throw new Error(ERROR_MESSAGES.FRIENDS.CODE_NOT_FOUND);
      }

      const targetUser = response.user;

      if (targetUser.id === currentUser.id) {
        throw new Error(ERROR_MESSAGES.FRIENDS.CANNOT_ADD_SELF);
      }

      // Check if friendship already exists
      const existingFriendship = friendships.find(
        (f) =>
          (f.user === currentUser.id && f.friend === targetUser.id) ||
          (f.user === targetUser.id && f.friend === currentUser.id)
      );

      if (existingFriendship) {
        throw new Error(ERROR_MESSAGES.FRIENDS.REQUEST_EXISTS);
      }

      // Create friend request
      return await pb.collection(COLLECTIONS.FRIENDSHIPS).create({
        user: currentUser.id,
        friend: targetUser.id,
        status: "pending",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["friendships"] });
      queryClient.invalidateQueries({
        queryKey: ["pendingFriendRequestsCount"],
      });
      setFriendCode("");
      showSuccess("Friend request sent!");
    },
    onError: (err: unknown) => {
      handleError(err, { customMessage: ERROR_MESSAGES.FRIENDS.SEND_REQUEST_FAILED });
    },
  });

  // Accept friend request mutation
  const acceptFriendRequestMutation = useMutation({
    mutationFn: async (friendshipId: string) => {
      return await pb.collection(COLLECTIONS.FRIENDSHIPS).update(friendshipId, {
        status: "accepted",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["friendships"] });
      queryClient.invalidateQueries({ queryKey: ["allVisits"] });
      queryClient.invalidateQueries({
        queryKey: ["pendingFriendRequestsCount"],
      });
    },
  });

  // Reject/Remove friend mutation
  const removeFriendMutation = useMutation({
    mutationFn: async (friendshipId: string) => {
      return await pb.collection(COLLECTIONS.FRIENDSHIPS).delete(friendshipId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["friendships"] });
      queryClient.invalidateQueries({ queryKey: ["allVisits"] });
      queryClient.invalidateQueries({
        queryKey: ["pendingFriendRequestsCount"],
      });
      setFriendToRemove(null);
    },
  });

  const handleSendFriendRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!friendCode.trim()) {
      showValidation(ERROR_MESSAGES.FRIENDS.CODE_REQUIRED);
      return;
    }
    await sendFriendRequestMutation.mutateAsync(friendCode.trim());
  };

  const copyFriendCode = () => {
    navigator.clipboard.writeText(myFriendCode);
    showSuccess("Friend code copied!");
  };

  const handleQRScan = (scannedCode: string) => {
    setFriendCode(scannedCode.toUpperCase());
    setShowScanner(false);
    showSuccess("QR code scanned! Review and send request.");
  };

  const getFriendInfo = (friendship: FriendWithDetails) => {
    const isSender = friendship.user === currentUser?.id;
    const friendData = isSender
      ? friendship.expand?.friend
      : friendship.expand?.user;
    // Use name if available, otherwise fall back to email username
    const friendName =
      friendData?.name || friendData?.email?.split("@")[0] || "Unknown";
    return { friendData, friendName, isSender };
  };

  if (isLoading) {
    return <LoadingState fullScreen message="Loading..." />;
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <h1 className="text-2xl font-bold text-gray-900">Friends</h1>
        <p className="text-sm text-gray-500 mt-1">
          {acceptedFriends.length} friend
          {acceptedFriends.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Main Tabs */}
        <Tabs
          defaultValue="friends-list"
          className="w-full h-full flex flex-col"
        >
          <div className="bg-white border-b border-gray-200 px-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="friends-list">Friends</TabsTrigger>
              <TabsTrigger value="add-friend">Add Friend</TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {/* Success/Error Messages */}
            <ErrorDisplay error={error} onClear={clearError} />

            {/* Friends List Tab */}
            <TabsContent value="friends-list" className="mt-0 space-y-4">
              {/* My Friend Code Section - at the top */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <QrCode className="w-5 h-5" />
                    My Friend Code
                  </CardTitle>
                  <CardDescription>
                    Share this code to let others add you as a friend
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 p-3 bg-blue-50 border-2 border-blue-200 rounded-lg text-center">
                      <span className="text-2xl font-bold text-blue-700 tracking-wider">
                        {myFriendCode}
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={copyFriendCode}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setShowQRCode(!showQRCode)}
                  >
                    <QrCode className="w-4 h-4 mr-2" />
                    {showQRCode ? "Hide" : "Show"} QR Code
                  </Button>
                  {showQRCode && (
                    <div className="flex justify-center p-4 bg-white border rounded-lg">
                      <QRCodeSVG value={myFriendCode} size={200} level="H" />
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Friends Sub-tabs */}
              <Tabs defaultValue="friends" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="friends">
                    Friends ({acceptedFriends.length})
                  </TabsTrigger>
                  <TabsTrigger value="received" className="relative">
                    <span>Requests ({pendingReceived.length})</span>
                    {pendingReceived.length > 0 && (
                      <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-1">
                        {pendingReceived.length > 9
                          ? "9+"
                          : pendingReceived.length}
                      </span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="sent">
                    Sent ({pendingSent.length})
                  </TabsTrigger>
                </TabsList>

                {/* Accepted Friends */}
                <TabsContent value="friends" className="space-y-3 mt-4">
                  {acceptedFriends.length === 0 ? (
                    <Card>
                      <CardContent className="text-center">
                        <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500">No friends yet</p>
                        <p className="text-sm text-gray-400 mt-1">
                          Add friends to see their food visits
                        </p>
                      </CardContent>
                    </Card>
                  ) : (
                    acceptedFriends.map((friendship) => {
                      const { friendName } = getFriendInfo(friendship);
                      return (
                        <Card key={friendship.id}>
                          <CardHeader>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                                  <Users className="w-5 h-5 text-blue-600" />
                                </div>
                                <div>
                                  <CardTitle className="text-base">
                                    {friendName}
                                  </CardTitle>
                                  <CardDescription className="text-xs">
                                    Friends since{" "}
                                    {new Date(
                                      friendship.created
                                    ).toLocaleDateString()}
                                  </CardDescription>
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setFriendToRemove(friendship)}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                Remove
                              </Button>
                            </div>
                          </CardHeader>
                        </Card>
                      );
                    })
                  )}
                </TabsContent>

                {/* Pending Received Requests */}
                <TabsContent value="received" className="space-y-3 mt-4">
                  {pendingReceived.length === 0 ? (
                    <Card>
                      <CardContent className="text-center">
                        <p className="text-gray-500">No pending requests</p>
                      </CardContent>
                    </Card>
                  ) : (
                    pendingReceived.map((friendship) => {
                      const { friendName } = getFriendInfo(friendship);
                      return (
                        <Card key={friendship.id}>
                          <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                                  <UserPlus className="w-5 h-5 text-orange-600" />
                                </div>
                                <div>
                                  <CardTitle className="text-base">
                                    {friendName}
                                  </CardTitle>
                                  <CardDescription className="text-xs">
                                    Sent{" "}
                                    {new Date(
                                      friendship.created
                                    ).toLocaleDateString()}
                                  </CardDescription>
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    acceptFriendRequestMutation.mutate(
                                      friendship.id
                                    )
                                  }
                                  disabled={
                                    acceptFriendRequestMutation.isPending
                                  }
                                  className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                >
                                  <Check className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    removeFriendMutation.mutate(friendship.id)
                                  }
                                  disabled={removeFriendMutation.isPending}
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          </CardHeader>
                        </Card>
                      );
                    })
                  )}
                </TabsContent>

                {/* Pending Sent Requests */}
                <TabsContent value="sent" className="space-y-3 mt-4">
                  {pendingSent.length === 0 ? (
                    <Card>
                      <CardContent className="text-center">
                        <p className="text-gray-500">No sent requests</p>
                      </CardContent>
                    </Card>
                  ) : (
                    pendingSent.map((friendship) => {
                      const { friendName } = getFriendInfo(friendship);
                      return (
                        <Card key={friendship.id}>
                          <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                                  <ChevronRight className="w-5 h-5 text-gray-600" />
                                </div>
                                <div>
                                  <CardTitle className="text-base">
                                    {friendName}
                                  </CardTitle>
                                  <CardDescription className="text-xs">
                                    <Badge
                                      variant="secondary"
                                      className="text-xs"
                                    >
                                      Pending
                                    </Badge>
                                  </CardDescription>
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  removeFriendMutation.mutate(friendship.id)
                                }
                                disabled={removeFriendMutation.isPending}
                                className="text-gray-600 hover:text-gray-700"
                              >
                                Cancel
                              </Button>
                            </div>
                          </CardHeader>
                        </Card>
                      );
                    })
                  )}
                </TabsContent>
              </Tabs>
            </TabsContent>

            {/* Add Friend Tab */}
            <TabsContent value="add-friend" className="mt-0 space-y-4">
              {!isOnline && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-orange-800 text-sm">
                    <WifiOff className="w-4 h-4" />
                    <span>You're offline. Friend code lookup requires internet connection.</span>
                  </div>
                </div>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    {isOnline ? <UserPlus className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
                    Add Friend {!isOnline && "(Offline)"}
                  </CardTitle>
                  <CardDescription>
                    Scan QR code or enter a friend code
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form
                    onSubmit={handleSendFriendRequest}
                    className="space-y-3"
                  >
                    <div className="space-y-2">
                      <Label htmlFor="friendCode">Friend Code</Label>
                      <Input
                        id="friendCode"
                        type="text"
                        placeholder="Enter 8-character code"
                        value={friendCode}
                        onChange={(e) =>
                          setFriendCode(e.target.value.toUpperCase())
                        }
                        maxLength={8}
                        className="uppercase text-center text-lg tracking-wider"
                        disabled={!isOnline}
                      />
                    </div>

                    {!isOnline && (
                      <p className="text-xs text-orange-600 text-center">
                        Friend code lookup requires internet connection
                      </p>
                    )}

                    <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-white px-2 text-gray-500">or</span>
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={() => setShowScanner(true)}
                      disabled={!isOnline}
                    >
                      {isOnline ? (
                        <><Scan className="w-4 h-4 mr-2" />Scan QR Code</>
                      ) : (
                        <><WifiOff className="w-4 h-4 mr-2" />Scan QR Code (Offline)</>
                      )}
                    </Button>

                    <Button
                      type="submit"
                      className="w-full"
                      disabled={!isOnline || sendFriendRequestMutation.isPending}
                    >
                      {!isOnline ? (
                        <><WifiOff className="w-4 h-4 mr-2" />Send Request (Offline)</>
                      ) : sendFriendRequestMutation.isPending ? (
                        "Sending..."
                      ) : (
                        "Send Friend Request"
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>
          </div>
        </Tabs>
      </div>

      {/* Remove Friend Confirmation Dialog */}
      <DeleteConfirmationDialog
        open={!!friendToRemove}
        onOpenChange={(open) => !open && setFriendToRemove(null)}
        onConfirm={() => friendToRemove && removeFriendMutation.mutate(friendToRemove.id)}
        title="Remove Friend?"
        description={
          <>
            Are you sure you want to remove{" "}
            <span className="font-semibold">
              {friendToRemove && getFriendInfo(friendToRemove).friendName}
            </span>{" "}
            from your friends? You will no longer see their visits.
          </>
        }
        confirmText="Remove"
        isDeleting={removeFriendMutation.isPending}
      />

      {/* QR Code Scanner */}
      {showScanner && (
        <QRScanner
          onScan={handleQRScan}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  );
}
