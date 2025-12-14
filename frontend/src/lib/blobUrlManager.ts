/**
 * Centralized blob URL lifecycle management
 * Prevents memory leaks from orphaned blob URLs in offline data sync
 *
 * Usage:
 * - Call create() when storing files in offline cache
 * - Call revoke() when data syncs or is deleted
 * - Call revokeAll() to cleanup everything (e.g., on logout)
 */
class BlobUrlManager {
  private urls = new Map<string, string>();

  /**
   * Create a blob URL and track it for cleanup
   * Automatically revokes old URL if recordId already exists
   */
  create(recordId: string, blob: Blob): string {
    // Revoke old URL if exists to prevent leak
    this.revoke(recordId);

    const url = URL.createObjectURL(blob);
    this.urls.set(recordId, url);
    return url;
  }

  /**
   * Revoke a specific blob URL by recordId
   */
  revoke(recordId: string): void {
    const url = this.urls.get(recordId);
    if (url) {
      URL.revokeObjectURL(url);
      this.urls.delete(recordId);
    }
  }

  /**
   * Revoke all tracked blob URLs
   * Use this when clearing cache or on app cleanup
   */
  revokeAll(): void {
    this.urls.forEach((url) => URL.revokeObjectURL(url));
    this.urls.clear();
  }

  /**
   * Get a blob URL by recordId (optional - for debugging)
   */
  get(recordId: string): string | undefined {
    return this.urls.get(recordId);
  }

  /**
   * Get count of tracked URLs (for monitoring)
   */
  get count(): number {
    return this.urls.size;
  }
}

// Singleton instance
export const blobUrlManager = new BlobUrlManager();

// Cleanup on page unload to prevent leaks
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    blobUrlManager.revokeAll();
  });
}
