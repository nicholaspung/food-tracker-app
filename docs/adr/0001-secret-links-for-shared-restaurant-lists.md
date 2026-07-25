# Use Secret Links For Shared Restaurant Lists

Shared Restaurant Lists use revocable secret links instead of reintroducing public Restaurant List visibility. The codebase previously removed public list visibility, so secret links preserve the current private/friends visibility model while still allowing a low-friction recipient-facing view for people who are not yet users.

The link grants a capability-scoped, live projection of the current Restaurant List rather than generic public access to its source records. Guest responses omit source-user identifiers and may include recommendation photo previews that are present on the requested page of the Shared Restaurant List.

Guest photo files are served only through the active share link. Each request revalidates the photo identifier and filename against the current shared-list page before reading the protected Visit photo; the link does not grant direct access to the underlying Visit, Visit Item, or `visit_photos` record, and it cannot be used to enumerate or fetch an unlisted photo.

Regenerating or disabling the share link revokes the old capability. Removing the associated recommendation from the Restaurant List, or moving it outside the requested live page, also removes that guest photo path.
