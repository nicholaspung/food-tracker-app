/**
 * Sync Status Indicator
 *
 * Displays a floating badge showing:
 * - Online/offline status
 * - Number of pending sync operations
 * - Sync progress
 * - Manual sync trigger
 */

import { useState } from 'react';
import { useSync } from '@/contexts/SyncContext';
import { WifiOff, Cloud, CloudOff, RefreshCw, AlertCircle, CheckCircle2, X } from 'lucide-react';

export function SyncStatusIndicator() {
  const { isOnline, isSyncing, queueStats, syncError, triggerSync, retryFailedOperations, clearQueue } = useSync();
  const [showDetails, setShowDetails] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Don't show anything if we're online and have no pending operations
  if (isOnline && queueStats.total === 0 && !isSyncing) {
    return null;
  }

  const handleClick = () => {
    setShowDetails(!showDetails);
  };

  const handleSync = async () => {
    await triggerSync();
    setShowDetails(false);
  };

  const handleRetry = async () => {
    await retryFailedOperations();
    setShowDetails(false);
  };

  const handleClearQueue = async () => {
    await clearQueue();
    setShowClearConfirm(false);
    setShowDetails(false);
  };

  return (
    <>
      {/* Floating Status Badge */}
      <button
        onClick={handleClick}
        className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-3 py-2 rounded-full shadow-lg text-sm font-medium transition-all ${
          !isOnline
            ? 'bg-orange-500 text-white'
            : isSyncing
            ? 'bg-blue-500 text-white'
            : queueStats.failed > 0
            ? 'bg-red-500 text-white'
            : 'bg-green-500 text-white'
        }`}
        data-testid="sync-status-badge"
      >
        {!isOnline ? (
          <>
            <WifiOff size={16} />
            <span>Offline</span>
          </>
        ) : isSyncing ? (
          <>
            <RefreshCw size={16} className="animate-spin" />
            <span>Syncing...</span>
          </>
        ) : queueStats.failed > 0 ? (
          <>
            <AlertCircle size={16} />
            <span>{queueStats.failed} failed</span>
          </>
        ) : (
          <>
            <Cloud size={16} />
            <span>{queueStats.pending} pending</span>
          </>
        )}
      </button>

      {/* Details Modal */}
      {showDetails && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Sync Status</h2>
              <button
                onClick={() => setShowDetails(false)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X size={20} />
              </button>
            </div>

            {/* Connection Status */}
            <div className="mb-4">
              <div className={`flex items-center gap-2 p-3 rounded-lg ${
                isOnline ? 'bg-green-50 text-green-800' : 'bg-orange-50 text-orange-800'
              }`}>
                {isOnline ? (
                  <>
                    <CheckCircle2 size={20} />
                    <span className="font-medium">Online</span>
                  </>
                ) : (
                  <>
                    <CloudOff size={20} />
                    <span className="font-medium">Offline - Changes will sync when online</span>
                  </>
                )}
              </div>
            </div>

            {/* Queue Stats */}
            <div className="space-y-2 mb-4">
              <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <span className="text-gray-600">Pending operations</span>
                <span className="font-bold text-gray-900">{queueStats.pending}</span>
              </div>

              {queueStats.failed > 0 && (
                <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
                  <span className="text-red-600">Failed operations</span>
                  <span className="font-bold text-red-900">{queueStats.failed}</span>
                </div>
              )}

              <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <span className="text-gray-600">Total queued</span>
                <span className="font-bold text-gray-900">{queueStats.total}</span>
              </div>
            </div>

            {/* Error Message */}
            {syncError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-800 text-sm">{syncError}</p>
              </div>
            )}

            {/* Sync Status */}
            {isSyncing && (
              <div className="mb-4 flex items-center gap-2 text-blue-600">
                <RefreshCw size={16} className="animate-spin" />
                <span className="text-sm">Syncing changes...</span>
              </div>
            )}

            {/* Actions */}
            <div className="space-y-2">
              <div className="flex gap-2">
                {queueStats.failed > 0 && (
                  <button
                    onClick={handleRetry}
                    disabled={isSyncing || !isOnline}
                    className="flex-1 px-4 py-2 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Retry Failed
                  </button>
                )}

                <button
                  onClick={handleSync}
                  disabled={isSyncing || !isOnline || queueStats.total === 0}
                  className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSyncing ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <RefreshCw size={16} />
                      Sync Now
                    </>
                  )}
                </button>
              </div>

              {/* Clear All Button */}
              {queueStats.total > 0 && (
                <button
                  onClick={() => setShowClearConfirm(true)}
                  disabled={isSyncing}
                  className="w-full px-4 py-2 bg-red-100 text-red-700 rounded-lg font-medium hover:bg-red-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <X size={16} />
                  Clear All ({queueStats.total})
                </button>
              )}
            </div>

            {/* Help Text */}
            <p className="mt-4 text-xs text-gray-500 text-center">
              {isOnline
                ? 'Tap "Sync Now" to manually push changes to the server'
                : 'Changes will automatically sync when you\'re back online'}
            </p>
          </div>
        </div>
      )}

      {/* Confirmation Dialog for Clear All */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="flex-shrink-0 w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <AlertCircle className="text-red-600" size={24} />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-gray-900 mb-1">
                  Clear All Queued Operations?
                </h3>
                <p className="text-sm text-gray-600">
                  This will permanently remove {queueStats.total} {queueStats.total === 1 ? 'operation' : 'operations'} from the sync queue.
                  <strong className="block mt-1 text-red-600">
                    These changes will be lost and cannot be recovered.
                  </strong>
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg font-medium hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={handleClearQueue}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700"
              >
                Clear All
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
