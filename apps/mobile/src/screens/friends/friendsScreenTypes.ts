export type MainTab = 'my-code' | 'friends-list';
export type FriendsSubTab = 'friends' | 'requests' | 'sent';
export type FriendRemoveOperationName = 'friend.remove' | 'friend.request.reject' | 'friend.request.cancel';
export type FriendActionName = 'accept' | 'reject' | 'cancel' | 'remove';

export const FRIEND_ACTION_BY_OPERATION: Record<'friend.accept' | FriendRemoveOperationName, FriendActionName> = {
  'friend.accept': 'accept',
  'friend.remove': 'remove',
  'friend.request.reject': 'reject',
  'friend.request.cancel': 'cancel',
};
