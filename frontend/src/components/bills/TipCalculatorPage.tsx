import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import TipCalculator from '@/components/bills/TipCalculator';

interface TipCalculatorPageProps {
  onNavigateBack?: () => void;
}

export default function TipCalculatorPage({ onNavigateBack }: TipCalculatorPageProps) {
  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="flex items-center gap-3">
          {onNavigateBack && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onNavigateBack}
              className="p-2"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
          )}
          <h1 className="text-2xl font-bold text-gray-900">Tip Calculator</h1>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 pb-20">
        <TipCalculator />
      </div>
    </div>
  );
}
