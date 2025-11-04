import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Camera,
  Copy,
  RotateCcw,
  Loader2,
  Check,
  Store,
  AlertTriangle,
  X,
  History,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { pb } from "@/lib/pocketbase";

interface RestaurantOption {
  name: string;
  confidence: "high" | "medium" | "low";
  reason?: string;
}

interface RestaurantNameResponse {
  found: boolean;
  options?: RestaurantOption[];
  language?: string;
  allText?: string;
  error?: string;
  reason?: string;
}

interface StoredResult {
  id: string;
  imagePreview: string;
  result: RestaurantNameResponse;
  timestamp: number;
  expanded?: boolean;
}

interface DailyUsage {
  date: string; // YYYY-MM-DD format
  count: number;
}

type Step = "capture" | "preview" | "processing" | "result";
type View = "capture" | "history";

const DAILY_LIMIT = 5;

// Helper function to get today's date string in YYYY-MM-DD format
const getTodayString = () => {
  const today = new Date();
  return today.toISOString().split('T')[0];
};

interface RestaurantNameFinderProps {
  onSelectName?: (name: string) => void;
  onClose?: () => void;
}

export default function RestaurantNameFinder(
  {
    onSelectName,
    onClose,
  }: RestaurantNameFinderProps = {} as RestaurantNameFinderProps
) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentStep, setCurrentStep] = useState<Step>("capture");
  const [currentView, setCurrentView] = useState<View>("capture");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [result, setResult] = useState<RestaurantNameResponse | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [storedResults, setStoredResults] = useState<StoredResult[]>([]);
  const [dailyUsage, setDailyUsage] = useState<DailyUsage>({ date: getTodayString(), count: 0 });
  const [isInitialized, setIsInitialized] = useState(false);

  // Load stored results and daily usage from localStorage on mount
  useEffect(() => {
    try {
      // Load history
      const saved = localStorage.getItem('restaurantNameFinderHistory');
      console.log('[RestaurantNameFinder] Loading history from localStorage:', saved);
      if (saved) {
        const parsed = JSON.parse(saved);
        console.log('[RestaurantNameFinder] Parsed history:', parsed);
        setStoredResults(parsed);
        // Set initial view to history if there are results
        if (parsed.length > 0) {
          console.log('[RestaurantNameFinder] Setting view to history');
          setCurrentView('history');
        }
      }

      // Load daily usage
      const savedUsage = localStorage.getItem('restaurantNameFinderDailyUsage');
      console.log('[RestaurantNameFinder] Loading daily usage from localStorage:', savedUsage);
      if (savedUsage) {
        const usage: DailyUsage = JSON.parse(savedUsage);
        const today = getTodayString();

        // Reset count if it's a new day
        if (usage.date !== today) {
          console.log('[RestaurantNameFinder] New day, resetting count');
          setDailyUsage({ date: today, count: 0 });
        } else {
          console.log('[RestaurantNameFinder] Loading saved usage:', usage);
          setDailyUsage(usage);
        }
      }

      // Mark as initialized so we can start saving changes
      setIsInitialized(true);
      console.log('[RestaurantNameFinder] Initialization complete');
    } catch (err) {
      console.error('Failed to load data from localStorage:', err);
      setIsInitialized(true); // Still mark as initialized even if there's an error
    }
  }, []);

  // Save stored results to localStorage whenever they change (but only after initialization)
  useEffect(() => {
    if (!isInitialized) {
      console.log('[RestaurantNameFinder] Skipping save - not initialized yet');
      return;
    }
    try {
      console.log('[RestaurantNameFinder] Saving history to localStorage:', storedResults);
      localStorage.setItem('restaurantNameFinderHistory', JSON.stringify(storedResults));
    } catch (err) {
      console.error('Failed to save history to localStorage:', err);
    }
  }, [storedResults, isInitialized]);

  // Save daily usage to localStorage whenever it changes (but only after initialization)
  useEffect(() => {
    if (!isInitialized) {
      console.log('[RestaurantNameFinder] Skipping daily usage save - not initialized yet');
      return;
    }
    try {
      console.log('[RestaurantNameFinder] Saving daily usage to localStorage:', dailyUsage);
      localStorage.setItem('restaurantNameFinderDailyUsage', JSON.stringify(dailyUsage));
    } catch (err) {
      console.error('Failed to save daily usage to localStorage:', err);
    }
  }, [dailyUsage, isInitialized]);

  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check daily limit
    const today = getTodayString();
    if (dailyUsage.date === today && dailyUsage.count >= DAILY_LIMIT) {
      setError(`Daily limit reached. You can process up to ${DAILY_LIMIT} photos per day. Try again tomorrow!`);
      // Clear file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError("Image is too large. Please select an image under 10MB");
      return;
    }

    // Validate file type
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file (JPEG, PNG, etc.)");
      return;
    }

    setError("");
    setResult(null);

    // Create preview URL for display - wait for it to load
    const reader = new FileReader();
    const imageDataUrl = await new Promise<string>((resolve) => {
      reader.onload = (e) => {
        resolve(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    });

    setImagePreview(imageDataUrl);

    // Automatically process the image with the preview
    await findRestaurantName(file, imageDataUrl);
  };

  const findRestaurantName = async (imageFile: File, imageDataUrl: string) => {
    setCurrentStep("processing");
    setIsProcessing(true);
    setError("");
    setResult(null);

    try {
      // Create FormData and upload to backend
      const formData = new FormData();
      formData.append("image", imageFile);

      // Use PocketBase SDK to send authenticated request
      const token = pb.authStore.token;
      const baseUrl = pb.baseUrl;

      const response = await fetch(`${baseUrl}/api/find-restaurant-name`, {
        method: "POST",
        headers: {
          Authorization: token ? `${token}` : "",
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ message: response.statusText }));
        throw new Error(errorData.message || "Failed to analyze image");
      }

      const data: RestaurantNameResponse = await response.json();
      console.log('[RestaurantNameFinder] API response:', data);

      // Increment daily usage count after successful API call
      const today = getTodayString();
      console.log('[RestaurantNameFinder] Incrementing daily usage, today:', today);
      setDailyUsage(prev => {
        const newUsage = prev.date === today
          ? { ...prev, count: prev.count + 1 }
          : { date: today, count: 1 };
        console.log('[RestaurantNameFinder] New usage:', newUsage);
        return newUsage;
      });

      if (data.error) {
        if (data.error === "NOT_RESTAURANT") {
          setError(
            `This doesn't appear to be a restaurant image. ${data.reason || ""}`
          );
        } else {
          setError(`Error: ${data.reason || "Unknown error"}`);
        }
        setResult(null);
        setCurrentStep("result");
      } else {
        setResult(data);
        setCurrentStep("result");

        // Save successful result to parking lot with the image data URL
        if (data.found && data.options && data.options.length > 0) {
          console.log('[RestaurantNameFinder] Saving result to history');
          const newStoredResult: StoredResult = {
            id: Date.now().toString(),
            imagePreview: imageDataUrl,
            result: data,
            timestamp: Date.now(),
            expanded: false,
          };
          console.log('[RestaurantNameFinder] New stored result:', newStoredResult);
          setStoredResults(prev => {
            const updated = [newStoredResult, ...prev];
            console.log('[RestaurantNameFinder] Updated stored results:', updated);
            return updated;
          });
        } else {
          console.log('[RestaurantNameFinder] NOT saving result - conditions not met:', {
            found: data.found,
            hasOptions: !!data.options,
            optionsLength: data.options?.length
          });
        }
      }
    } catch (err: any) {
      console.error("Restaurant name finder error:", err);
      setError(
        `Failed to analyze image: ${err.message || "Unknown error"}. Please try another image.`
      );
      setResult(null);
      setCurrentStep("result");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRetake = () => {
    setCurrentStep("capture");
    setImagePreview(null);
    setResult(null);
    setError("");
    setCopied(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const copyText = async (text: string) => {
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy text:", err);
      setError("Failed to copy text to clipboard");
    }
  };

  const toggleStoredResultExpansion = (id: string) => {
    setStoredResults(prev =>
      prev.map(stored =>
        stored.id === id ? { ...stored, expanded: !stored.expanded } : stored
      )
    );
  };

  const deleteStoredResult = (id: string) => {
    setStoredResults(prev => prev.filter(stored => stored.id !== id));
  };

  const getConfidenceBadge = (confidence?: string) => {
    switch (confidence) {
      case "high":
        return (
          <span className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded-full">
            High confidence
          </span>
        );
      case "medium":
        return (
          <span className="text-xs px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full">
            Medium confidence
          </span>
        );
      case "low":
        return (
          <span className="text-xs px-2 py-1 bg-orange-100 text-orange-800 rounded-full">
            Low confidence
          </span>
        );
      default:
        return null;
    }
  };

  // Step 2: Preview while processing
  if (currentStep === "preview" && imagePreview) {
    return (
      <div className="flex flex-col h-full bg-gray-900">
        {/* Header */}
        <div className="bg-gray-800 px-4 py-3 flex items-center justify-between">
          <h3 className="text-white font-semibold">Preview</h3>
          <button
            onClick={handleRetake}
            className="text-gray-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Full Screen Image Preview */}
        <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
          <img
            src={imagePreview}
            alt="Preview"
            className="max-w-full max-h-full object-contain"
          />
        </div>
      </div>
    );
  }

  // Step 3: Processing & Results
  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* File input (hidden, triggered by button) */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
        data-testid="restaurant-finder-input"
      />

      {/* Header with close button (only show if onClose is provided) */}
      {onClose && (
        <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">
            Find Restaurant Name
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Tab Switcher */}
      <div className="bg-white border-b border-gray-200">
        <div className="flex">
          <button
            onClick={() => setCurrentView("capture")}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              currentView === "capture"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <Camera className="w-4 h-4" />
              <span>Take Photo</span>
            </div>
          </button>
          <button
            onClick={() => setCurrentView("history")}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors relative ${
              currentView === "history"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <History className="w-4 h-4" />
              <span>History</span>
              {storedResults.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-xs bg-blue-600 text-white rounded-full">
                  {storedResults.length}
                </span>
              )}
            </div>
          </button>
        </div>
      </div>

      {/* Progress Indicator (only in capture view) */}
      {currentView === "capture" && currentStep !== "capture" && (
        <div className="bg-white border-b border-gray-200 px-4 py-3">
          <div className="flex items-center justify-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                currentStep === "preview" || currentStep === "processing"
                  ? "bg-blue-600 text-white"
                  : "bg-green-600 text-white"
              }`}
            >
              1
            </div>
            <div className="w-12 h-0.5 bg-gray-300"></div>
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                currentStep === "processing" || currentStep === "result"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-300 text-gray-600"
              }`}
            >
              2
            </div>
          </div>
          <div className="flex justify-between mt-2 text-xs text-gray-600">
            <span>Analyzing</span>
            <span>Result</span>
          </div>
        </div>
      )}

      {/* Capture View Content */}
      {currentView === "capture" && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Image Preview (small, in results) */}
        {imagePreview && currentStep === "result" && (
          <div className="bg-white rounded-lg border border-gray-200 p-3">
            <img
              src={imagePreview}
              alt="Captured"
              className="w-full h-auto rounded"
              style={{ maxHeight: "30vh", objectFit: "contain" }}
            />
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="p-3 text-sm text-red-500 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Processing State */}
        {isProcessing && (
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-purple-600" />
              <p className="text-sm text-gray-600">
                Analyzing image with AI...
              </p>
            </div>
            <p className="text-xs text-gray-500 text-center mt-2">
              Looking for restaurant names and text
            </p>
          </div>
        )}

        {/* Result: Restaurant Names Found */}
        {result &&
          result.found &&
          result.options &&
          result.options.length > 0 &&
          !isProcessing && (
            <div className="space-y-3">
              <div className="bg-green-50 rounded-lg border border-green-200 p-4">
                <div className="flex items-start gap-3 mb-3">
                  <Store className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-green-900 mb-1">
                      {result.options.length === 1
                        ? "Restaurant Found!"
                        : "Possible Restaurant Names"}
                    </h3>
                    <p className="text-xs text-green-700">
                      {result.options.length === 1
                        ? "AI detected a restaurant name in the image"
                        : `AI found ${result.options.length} possible interpretations`}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  {result.options.map((option, index) => (
                    <div
                      key={index}
                      className="bg-white rounded-md p-3 border border-green-300"
                    >
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <span className="text-lg font-bold text-gray-900 flex-1">
                          {option.name}
                        </span>
                        {getConfidenceBadge(option.confidence)}
                      </div>
                      {option.reason && (
                        <p className="text-xs text-gray-600 mb-2 italic">
                          {option.reason}
                        </p>
                      )}
                      {result.language && index === 0 && (
                        <p className="text-xs text-gray-500 mb-2">
                          Language: {result.language}
                        </p>
                      )}
                      <Button
                        onClick={() => {
                          copyText(option.name);
                          if (onSelectName) {
                            onSelectName(option.name);
                          }
                        }}
                        variant="default"
                        size="sm"
                        className="w-full"
                        data-testid={`copy-restaurant-name-${index}`}
                      >
                        {copied ? (
                          <>
                            <Check className="w-4 h-4 mr-1" />
                            {onSelectName ? "Selected!" : "Copied!"}
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4 mr-1" />
                            {onSelectName
                              ? `Select "${option.name}"`
                              : `Copy "${option.name}"`}
                          </>
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-blue-50 rounded-lg border border-blue-200 p-3">
                <p className="text-xs text-blue-800">
                  💡 Tip: Copy any name to search for the restaurant in the main
                  app
                </p>
              </div>
            </div>
          )}

        {/* Result: No Restaurant Name, but Text Found */}
        {result && !result.found && result.allText && !isProcessing && (
          <div className="space-y-3">
            <div className="bg-yellow-50 rounded-lg border border-yellow-200 p-4">
              <div className="flex items-start gap-3 mb-3">
                <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-yellow-900 mb-1">
                    No Clear Restaurant Name
                  </h3>
                  <p className="text-xs text-yellow-700">
                    AI couldn't identify a specific restaurant name, but found
                    this text:
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-md p-3 border border-yellow-300 mb-3">
                <p className="text-sm text-gray-800 whitespace-pre-wrap">
                  {result.allText}
                </p>
              </div>

              <Button
                onClick={() => copyText(result.allText!)}
                variant="default"
                size="sm"
                className="w-full"
                data-testid="copy-all-text-button"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 mr-1" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 mr-1" />
                    Copy All Text
                  </>
                )}
              </Button>
            </div>

            <div className="bg-blue-50 rounded-lg border border-blue-200 p-3">
              <p className="text-xs text-blue-800">
                💡 Try taking another photo from a different angle or closer to
                the restaurant sign
              </p>
            </div>
          </div>
        )}

        {/* Instructions */}
        {currentStep === "capture" && (
          <>
            <div className="bg-blue-50 rounded-lg border border-blue-200 p-4">
              <h3 className="text-sm font-semibold text-blue-900 mb-2">
                How to use:
              </h3>
              <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
                <li>Take a photo of a restaurant sign, storefront, or menu</li>
                <li>
                  AI will identify possible restaurant names automatically
                </li>
                <li>
                  Multiple interpretations provided with confidence levels
                </li>
                <li>Copy any name to search for it in the app</li>
                <li>
                  Works with multiple languages (Korean, Japanese, Chinese,
                  etc.)
                </li>
              </ul>
            </div>

            {/* Daily Usage Counter */}
            <div className={`rounded-lg border p-3 ${
              dailyUsage.count >= DAILY_LIMIT
                ? 'bg-red-50 border-red-200'
                : dailyUsage.count >= DAILY_LIMIT - 1
                  ? 'bg-yellow-50 border-yellow-200'
                  : 'bg-gray-50 border-gray-200'
            }`}>
              <div className="flex items-center justify-between">
                <p className={`text-sm font-medium ${
                  dailyUsage.count >= DAILY_LIMIT
                    ? 'text-red-800'
                    : dailyUsage.count >= DAILY_LIMIT - 1
                      ? 'text-yellow-800'
                      : 'text-gray-700'
                }`}>
                  Daily photos: {dailyUsage.count} / {DAILY_LIMIT}
                </p>
                <span className={`text-xs px-2 py-1 rounded-full ${
                  dailyUsage.count >= DAILY_LIMIT
                    ? 'bg-red-100 text-red-800'
                    : dailyUsage.count >= DAILY_LIMIT - 1
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-blue-100 text-blue-800'
                }`}>
                  {DAILY_LIMIT - dailyUsage.count} remaining
                </span>
              </div>
              {dailyUsage.count >= DAILY_LIMIT && (
                <p className="text-xs text-red-700 mt-2">
                  You've reached today's limit. Reset tomorrow.
                </p>
              )}
            </div>
          </>
        )}

        {/* Action Buttons */}
        <div className="space-y-2">
          {currentStep === "capture" ? (
            <>
              <Button
                onClick={() => fileInputRef.current?.click()}
                className="w-full"
                size="lg"
                data-testid="take-photo-button"
                disabled={dailyUsage.count >= DAILY_LIMIT}
              >
                <Camera className="w-5 h-5 mr-2" />
                {dailyUsage.count >= DAILY_LIMIT ? 'Daily Limit Reached' : 'Take Photo / Upload Image'}
              </Button>
              {dailyUsage.count < DAILY_LIMIT && (
                <p className="text-xs text-gray-500 text-center">
                  On mobile: Opens camera or photo library
                </p>
              )}
            </>
          ) : (
            currentStep === "result" && (
              <Button
                onClick={handleRetake}
                variant="outline"
                className="w-full"
                size="lg"
                data-testid="retake-button"
                disabled={isProcessing || dailyUsage.count >= DAILY_LIMIT}
              >
                <RotateCcw className="w-5 h-5 mr-2" />
                {dailyUsage.count >= DAILY_LIMIT ? 'Daily Limit Reached' : 'Take Another Photo'}
              </Button>
            )
          )}
        </div>
        </div>
      )}

      {/* History View Content */}
      {currentView === "history" && (
        <div className="flex-1 overflow-y-auto p-4">
          {storedResults.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <History className="w-16 h-16 text-gray-300 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                No History Yet
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Processed restaurant images will appear here for easy reference
              </p>
              <Button
                onClick={() => setCurrentView("capture")}
                variant="outline"
              >
                <Camera className="w-4 h-4 mr-2" />
                Take Your First Photo
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {storedResults.map((stored) => (
                <div
                  key={stored.id}
                  className="bg-white rounded-lg border border-gray-200 overflow-hidden"
                >
                  {/* Header - Always Visible */}
                  <div className="p-3 border-b border-gray-100">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <p className="text-xs text-gray-500 mb-1">
                          {new Date(stored.timestamp).toLocaleString()}
                        </p>
                        <p className="text-sm font-medium text-gray-900">
                          {stored.result.options && stored.result.options.length > 0
                            ? stored.result.options[0].name
                            : "Unnamed"}
                        </p>
                        {stored.result.options && stored.result.options.length > 1 && (
                          <p className="text-xs text-gray-500 mt-1">
                            +{stored.result.options.length - 1} more option
                            {stored.result.options.length - 1 !== 1 ? "s" : ""}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleStoredResultExpansion(stored.id)}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          {stored.expanded ? (
                            <ChevronUp className="w-5 h-5" />
                          ) : (
                            <ChevronDown className="w-5 h-5" />
                          )}
                        </button>
                        <button
                          onClick={() => deleteStoredResult(stored.id)}
                          className="text-gray-400 hover:text-red-600"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {stored.expanded && (
                    <div className="p-3 space-y-3">
                      {/* Image Preview */}
                      <img
                        src={stored.imagePreview}
                        alt="Restaurant"
                        className="w-full h-auto rounded"
                        style={{ maxHeight: "30vh", objectFit: "contain" }}
                      />

                      {/* All Options */}
                      <div className="space-y-2">
                        {stored.result.options?.map((option, index) => (
                          <div
                            key={index}
                            className="bg-gray-50 rounded-md p-3 border border-gray-200"
                          >
                            <div className="flex items-center justify-between gap-3 mb-2">
                              <span className="text-sm font-bold text-gray-900 flex-1">
                                {option.name}
                              </span>
                              {getConfidenceBadge(option.confidence)}
                            </div>
                            {option.reason && (
                              <p className="text-xs text-gray-600 mb-2 italic">
                                {option.reason}
                              </p>
                            )}
                            <Button
                              onClick={() => {
                                copyText(option.name);
                                if (onSelectName) {
                                  onSelectName(option.name);
                                }
                              }}
                              variant="default"
                              size="sm"
                              className="w-full"
                            >
                              {copied ? (
                                <>
                                  <Check className="w-4 h-4 mr-1" />
                                  {onSelectName ? "Selected!" : "Copied!"}
                                </>
                              ) : (
                                <>
                                  <Copy className="w-4 h-4 mr-1" />
                                  {onSelectName
                                    ? `Select "${option.name}"`
                                    : `Copy "${option.name}"`}
                                </>
                              )}
                            </Button>
                          </div>
                        ))}
                      </div>

                      {stored.result.language && (
                        <p className="text-xs text-gray-500">
                          Language: {stored.result.language}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
