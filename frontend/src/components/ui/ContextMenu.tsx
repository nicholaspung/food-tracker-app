import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

export interface ContextMenuOption {
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  destructive?: boolean;
}

interface ContextMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  options: ContextMenuOption[];
}

/**
 * Mobile-friendly context menu / action sheet.
 * Slides up from the bottom of the screen.
 *
 * @example
 * <ContextMenu
 *   open={showMenu}
 *   onOpenChange={setShowMenu}
 *   title="Actions"
 *   options={[
 *     { label: 'Edit', icon: Pencil, onClick: handleEdit },
 *     { label: 'Delete', icon: Trash2, onClick: handleDelete, destructive: true },
 *   ]}
 * />
 */
export function ContextMenu({
  open,
  onOpenChange,
  title,
  options,
}: ContextMenuProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            'fixed inset-0 z-50 bg-black/50',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            'fixed bottom-0 left-0 right-0 z-50',
            'bg-white rounded-t-2xl shadow-lg',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
            'duration-200'
          )}
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-10 h-1 bg-gray-300 rounded-full" />
          </div>

          {/* Title */}
          {title && (
            <DialogPrimitive.Title className="px-4 pb-2 text-sm font-medium text-gray-500 text-center">
              {title}
            </DialogPrimitive.Title>
          )}

          {/* Options */}
          <div className="px-2 pb-2">
            {options.map((option, index) => {
              const Icon = option.icon;
              return (
                <button
                  key={index}
                  onClick={() => {
                    option.onClick();
                    onOpenChange(false);
                  }}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-3.5 rounded-xl',
                    'text-left text-base font-medium',
                    'active:bg-gray-100 transition-colors',
                    option.destructive
                      ? 'text-red-600'
                      : 'text-gray-900'
                  )}
                >
                  {Icon && (
                    <Icon
                      className={cn(
                        'w-5 h-5',
                        option.destructive ? 'text-red-600' : 'text-gray-600'
                      )}
                    />
                  )}
                  {option.label}
                </button>
              );
            })}
          </div>

          {/* Cancel button */}
          <div className="px-2 pb-4">
            <DialogPrimitive.Close asChild>
              <button
                className={cn(
                  'w-full py-3.5 rounded-xl',
                  'bg-gray-100 text-gray-900 font-semibold text-base',
                  'active:bg-gray-200 transition-colors'
                )}
              >
                Cancel
              </button>
            </DialogPrimitive.Close>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
