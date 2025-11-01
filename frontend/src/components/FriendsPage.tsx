import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { pb, Friendship } from "@/lib/pocketbase";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
} from "lucide-react";
import QRScanner from "@/components/QRScanner";

// Generate a unique friend code from user ID (base62 encoding for shorter code)
function generateFriendCode(userId: string): string {
  // Use first 8 chars of user ID and format nicely
  const cleanId = userId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return cleanId.slice(0, 8);
}

interface FriendWithDetails extends Friendship {
  expand?: {
    user?: { id: string; email: string; name?: string };
    friend?: { id: string; email: string; name?: string };
  };
}

export default function FriendsPage() {
  const [friendCode, setFriendCode] = useState("");
  const [showQRCode, setShowQRCode] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [friendToRemove, setFriendToRemove] =
    useState<FriendWithDetails | null>(null);
  const queryClient = useQueryClient();

  const currentUser = pb.authStore.record;
  const myFriendCode = currentUser ? generateFriendCode(currentUser.id) : "";

  // Fetch all friendships (sent and received)
  const { data: friendships = [], isLoading } = useQuery<FriendWithDetails[]>({
    queryKey: ["friendships"],
    queryFn: async () => {
      return await pb.collection("friendships").getFullList<FriendWithDetails>({
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

      // Find user by friend code using backend API
      const response = await pb.send(
        `/api/users/by-friend-code/${code.toUpperCase()}`,
        {
          method: "GET",
        }
      );

      if (!response.found) {
        throw new Error("Friend code not found");
      }

      const targetUser = response.user;

      if (targetUser.id === currentUser.id) {
        throw new Error("Cannot add yourself as a friend");
      }

      // Check if friendship already exists
      const existingFriendship = friendships.find(
        (f) =>
          (f.user === currentUser.id && f.friend === targetUser.id) ||
          (f.user === targetUser.id && f.friend === currentUser.id)
      );

      if (existingFriendship) {
        throw new Error("Friend request already exists");
      }

      // Create friend request
      return await pb.collection("friendships").create({
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
      setSuccess("Friend request sent!");
      setError("");
      setTimeout(() => setSuccess(""), 3000);
    },
    onError: (err: any) => {
      setError(err.message || "Failed to send friend request");
      setSuccess("");
    },
  });

  // Accept friend request mutation
  const acceptFriendRequestMutation = useMutation({
    mutationFn: async (friendshipId: string) => {
      return await pb.collection("friendships").update(friendshipId, {
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
      return await pb.collection("friendships").delete(friendshipId);
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
      setError("Please enter a friend code");
      return;
    }
    await sendFriendRequestMutation.mutateAsync(friendCode.trim());
  };

  const copyFriendCode = () => {
    navigator.clipboard.writeText(myFriendCode);
    setSuccess("Friend code copied!");
    setTimeout(() => setSuccess(""), 2000);
  };

  const handleQRScan = (scannedCode: string) => {
    setFriendCode(scannedCode.toUpperCase());
    setShowScanner(false);
    setSuccess("QR code scanned! Review and send request.");
    setTimeout(() => setSuccess(""), 3000);
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
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
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
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
                {error}
              </div>
            )}
            {success && (
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md text-sm text-green-600">
                {success}
              </div>
            )}

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
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <UserPlus className="w-5 h-5" />
                    Add Friend
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
                      />
                    </div>

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
                    >
                      <Scan className="w-4 h-4 mr-2" />
                      Scan QR Code
                    </Button>

                    <Button
                      type="submit"
                      className="w-full"
                      disabled={sendFriendRequestMutation.isPending}
                    >
                      {sendFriendRequestMutation.isPending
                        ? "Sending..."
                        : "Send Friend Request"}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>
          </div>
        </Tabs>
      </div>

      {/* Remove Friend Confirmation Dialog */}
      <AlertDialog
        open={!!friendToRemove}
        onOpenChange={(open) => !open && setFriendToRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Friend?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove{" "}
              <span className="font-semibold">
                {friendToRemove && getFriendInfo(friendToRemove).friendName}
              </span>{" "}
              from your friends? You will no longer see their visits.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeFriendMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                friendToRemove && removeFriendMutation.mutate(friendToRemove.id)
              }
              disabled={removeFriendMutation.isPending}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {removeFriendMutation.isPending ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
