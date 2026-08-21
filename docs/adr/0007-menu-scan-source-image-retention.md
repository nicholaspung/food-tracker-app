# Menu scan source image retention

Successful menu scans tied to a selected **Restaurant** may store a resized **Menu Scan Source Image** in `menu_images` and return its `sourceImageId` for later catalog workflows. The retained image supports uploader access, admin menu inventory, menu review, and **Catalog Contribution** evidence.

**Menu Scan Source Images** are distinct from **Receipt Scan** images. ADR-0002 applies only to receipt scans: receipt photos are transient and failed, invalid, or low-confidence receipt extraction debug output may be retained for 30 days. Menu scan retention follows the `menu_images` collection behavior instead.

Access is restricted to the uploader and admins. The current retention policy has no time-based cleanup window; records are retained until the related **Restaurant** or uploader account is deleted, unless a future product/security decision introduces a shorter retention period.

Raw collection creation is disabled. The trusted `/api/parse-menu` workflow is the only creation path: it verifies that the authenticated user can access the selected **Restaurant**, stores that canonical relation, and derives `uploadedBy` from the authenticated user. Internal saves remain available to this workflow, including when an administrator scans a private **Restaurant**.
