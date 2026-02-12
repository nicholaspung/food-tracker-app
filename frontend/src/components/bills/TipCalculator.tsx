import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type TipMode = 'percentage' | 'custom';

const PRESET_PERCENTAGES = [15, 18, 20, 25];

export default function TipCalculator() {
  const [subtotal, setSubtotal] = useState('');
  const [taxes, setTaxes] = useState('');
  const [tipMode, setTipMode] = useState<TipMode>('percentage');
  const [tipPercent, setTipPercent] = useState(18);
  const [customTipAmount, setCustomTipAmount] = useState('');

  const parsedSubtotal = parseFloat(subtotal) || 0;
  const parsedTaxes = parseFloat(taxes) || 0;
  const parsedCustomTip = parseFloat(customTipAmount) || 0;
  const total = parsedSubtotal + parsedTaxes;

  const tipAmount = useMemo(() => {
    if (tipMode === 'custom') return parsedCustomTip;
    return parsedSubtotal * (tipPercent / 100);
  }, [tipMode, parsedCustomTip, parsedSubtotal, tipPercent]);

  const finalTotal = total + tipAmount;

  const handleMoneyInput = (value: string, setter: (v: string) => void) => {
    if (value === '' || /^\d*\.?\d{0,2}$/.test(value)) {
      setter(value);
    }
  };

  return (
    <div className="space-y-5">
      {/* Bill Inputs Card */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Bill Details</h3>
        <div>
          <Label htmlFor="tip-subtotal" className="text-sm font-medium text-gray-700">
            Subtotal
          </Label>
          <div className="relative mt-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-lg font-medium">$</span>
            <Input
              id="tip-subtotal"
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={subtotal}
              onChange={(e) => handleMoneyInput(e.target.value, setSubtotal)}
              className="pl-8 h-12 text-lg"
              data-testid="tip-subtotal"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="tip-taxes" className="text-sm font-medium text-gray-700">
            Taxes
          </Label>
          <div className="relative mt-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-lg font-medium">$</span>
            <Input
              id="tip-taxes"
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={taxes}
              onChange={(e) => handleMoneyInput(e.target.value, setTaxes)}
              className="pl-8 h-12 text-lg"
              data-testid="tip-taxes"
            />
          </div>
        </div>

        <div className="pt-2 border-t border-gray-100">
          <div className="flex items-center justify-between py-2">
            <span className="text-sm font-medium text-gray-700">Total</span>
            <span className="text-lg font-semibold text-gray-900" data-testid="tip-total">
              ${total.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Tip Mode Tabs */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex bg-gray-100 p-1 m-3 rounded-lg">
          <button
            type="button"
            onClick={() => setTipMode('percentage')}
            className={`flex-1 py-2.5 text-sm font-semibold text-center rounded-md transition-all ${
              tipMode === 'percentage'
                ? 'bg-white text-emerald-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            data-testid="tip-tab-percentage"
          >
            Tip Percentage
          </button>
          <button
            type="button"
            onClick={() => setTipMode('custom')}
            className={`flex-1 py-2.5 text-sm font-semibold text-center rounded-md transition-all ${
              tipMode === 'custom'
                ? 'bg-white text-emerald-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            data-testid="tip-tab-custom"
          >
            Specific Amount
          </button>
        </div>

        <div className="px-4 pb-4">
          {tipMode === 'percentage' ? (
            <div className="space-y-4">
              {/* Preset buttons */}
              <div className="flex gap-2">
                {PRESET_PERCENTAGES.map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setTipPercent(pct)}
                    className={`flex-1 py-3 rounded-xl text-base font-semibold transition-colors ${
                      tipPercent === pct
                        ? 'bg-emerald-600 text-white shadow-md'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                    data-testid={`tip-preset-${pct}`}
                  >
                    {pct}%
                  </button>
                ))}
              </div>

              {/* Slider */}
              <div className="space-y-1">
                <input
                  type="range"
                  min={0}
                  max={50}
                  step={1}
                  value={tipPercent}
                  onChange={(e) => setTipPercent(parseInt(e.target.value, 10))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                  data-testid="tip-slider"
                />
                <div className="flex justify-between text-xs text-gray-400">
                  <span>0%</span>
                  <span className="text-sm font-semibold text-emerald-600">{tipPercent}%</span>
                  <span>50%</span>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <Label htmlFor="tip-custom" className="text-sm font-medium text-gray-700">
                Enter tip amount
              </Label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-lg font-medium">$</span>
                <Input
                  id="tip-custom"
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={customTipAmount}
                  onChange={(e) => handleMoneyInput(e.target.value, setCustomTipAmount)}
                  className="pl-8 h-12 text-lg"
                  data-testid="tip-custom-amount"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Result */}
      <div className={`rounded-xl border-2 p-5 space-y-3 transition-colors ${
        parsedSubtotal > 0
          ? 'bg-emerald-50 border-emerald-300'
          : 'bg-gray-50 border-gray-200'
      }`}>
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium text-gray-600">Tip amount</span>
          <span className={`text-2xl font-bold ${
            parsedSubtotal > 0 ? 'text-emerald-700' : 'text-gray-400'
          }`} data-testid="tip-result">
            ${tipAmount.toFixed(2)}
          </span>
        </div>
        <div className="border-t border-emerald-200 pt-3">
          <div className="flex justify-between items-center">
            <span className="text-base font-semibold text-gray-700">Total with tip</span>
            <span className={`text-xl font-bold ${
              parsedSubtotal > 0 ? 'text-gray-900' : 'text-gray-400'
            }`} data-testid="tip-total-result">
              ${finalTotal.toFixed(2)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
