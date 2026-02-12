import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAddTastingItem } from '@/hooks/api/useTastingSessions';

interface AddTastingItemFormProps {
  sessionId: string;
}

export default function AddTastingItemForm({ sessionId }: AddTastingItemFormProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [showDescription, setShowDescription] = useState(false);
  const addItem = useAddTastingItem();

  const handleSubmit = async () => {
    if (!name.trim()) return;
    try {
      await addItem.mutateAsync({
        sessionId,
        name: name.trim(),
        description: description.trim() || undefined,
      });
      setName('');
      setDescription('');
      setShowDescription(false);
    } catch {
      // Error handled by mutation
    }
  };

  return (
    <div className="bg-white rounded-lg p-4">
      <h3 className="font-medium text-gray-900 mb-3">Add Food Item</h3>
      <div className="space-y-2">
        <div className="flex gap-2">
          <Input
            placeholder="Item name (e.g., Pad Thai)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSubmit(); } }}
            className="flex-1"
          />
          <Button
            onClick={handleSubmit}
            disabled={addItem.isPending || !name.trim()}
            size="sm"
            className="bg-purple-600 hover:bg-purple-700"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        {!showDescription ? (
          <button
            type="button"
            className="text-xs text-purple-600 hover:text-purple-700"
            onClick={() => setShowDescription(true)}
          >
            + Add description
          </button>
        ) : (
          <Input
            placeholder="Optional description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="text-sm"
          />
        )}
      </div>
    </div>
  );
}
