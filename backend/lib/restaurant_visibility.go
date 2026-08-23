package lib

import "strings"

// CanAccessRestaurant applies the shared Restaurant visibility policy.
func CanAccessRestaurant(
	ownerID string,
	visibility string,
	viewerUserID string,
	isAdmin bool,
	acceptedFriendIDs map[string]struct{},
) bool {
	if isAdmin {
		return true
	}

	trimmedOwnerID := strings.TrimSpace(ownerID)
	if trimmedOwnerID != "" && trimmedOwnerID == strings.TrimSpace(viewerUserID) {
		return true
	}

	switch strings.TrimSpace(visibility) {
	case "public":
		return true
	case "friends":
		_, isAcceptedFriend := acceptedFriendIDs[trimmedOwnerID]
		return trimmedOwnerID != "" && isAcceptedFriend
	default:
		return false
	}
}
