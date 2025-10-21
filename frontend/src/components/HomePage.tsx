import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { pb, Visit, Restaurant, FoodItem } from '@/lib/pocketbase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar, MapPin, Utensils, Pencil, ChevronDown, ChevronRight } from 'lucide-react';

const RATING_LABELS = [
  "Don't eat ever",
  'Try once',
  'Eat once in a while',
  'Eat occasionally',
  'Eat often',
];

const RATING_COLORS = [
  'bg-red-500',
  'bg-orange-500',
  'bg-yellow-500',
  'bg-lime-500',
  'bg-green-500',
];

interface VisitWithDetails extends Visit {
  restaurant?: Restaurant;
  foodItems?: FoodItem[];
}

interface HomePageProps {
  onEditVisit?: (visitId: string) => void;
}

// Helper to get month key (YYYY-MM)
function getMonthKey(date: string): string {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Helper to get day key (YYYY-MM-DD)
function getDayKey(date: string): string {
  return date.split('T')[0];
}

// Helper to format month label
function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
}

// Helper to format day label
function formatDayLabel(dayKey: string): string {
  const date = new Date(dayKey + 'T00:00:00');
  return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

// Helper to get date N months ago
function getDateMonthsAgo(months: number): Date {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  date.setHours(0, 0, 0, 0);
  return date;
}

export default function HomePage({ onEditVisit }: HomePageProps = {}) {
  const [monthsToLoad, setMonthsToLoad] = useState(1); // Start with 1 month
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set([getMonthKey(new Date().toISOString())])); // Current month expanded by default

  // Fetch all visits
  const { data: visits = [], isLoading: visitsLoading } = useQuery<Visit[]>({
    queryKey: ['allVisits'],
    queryFn: async () => {
      return await pb.collection('visits').getFullList({
        sort: '-visitDate',
      });
    },
  });

  // Fetch all restaurants
  const { data: restaurants = [] } = useQuery<Restaurant[]>({
    queryKey: ['restaurants'],
    queryFn: async () => {
      return await pb.collection('restaurants').getFullList();
    },
  });

  // Fetch all food items
  const { data: foodItems = [] } = useQuery<FoodItem[]>({
    queryKey: ['allFoodItems'],
    queryFn: async () => {
      return await pb.collection('food_items').getFullList({
        sort: '-created',
      });
    },
  });

  // Combine data
  const visitsWithDetails: VisitWithDetails[] = useMemo(() =>
    visits.map((visit) => ({
      ...visit,
      restaurant: restaurants.find((r) => r.id === visit.restaurant),
      foodItems: foodItems.filter((item) => item.visit === visit.id),
    })),
    [visits, restaurants, foodItems]
  );

  // Filter visits based on monthsToLoad
  const cutoffDate = useMemo(() => getDateMonthsAgo(monthsToLoad), [monthsToLoad]);
  const filteredVisits = useMemo(() =>
    visitsWithDetails.filter(visit => new Date(visit.visitDate) >= cutoffDate),
    [visitsWithDetails, cutoffDate]
  );

  // Check if there are more visits to load
  const hasMoreVisits = visitsWithDetails.length > filteredVisits.length;

  // Group visits by month, then by day
  const groupedVisits = useMemo(() => {
    const byMonth: Record<string, Record<string, VisitWithDetails[]>> = {};

    filteredVisits.forEach((visit) => {
      const monthKey = getMonthKey(visit.visitDate);
      const dayKey = getDayKey(visit.visitDate);

      if (!byMonth[monthKey]) {
        byMonth[monthKey] = {};
      }
      if (!byMonth[monthKey][dayKey]) {
        byMonth[monthKey][dayKey] = [];
      }
      byMonth[monthKey][dayKey].push(visit);
    });

    // Sort months descending
    const sortedMonths = Object.keys(byMonth).sort((a, b) => b.localeCompare(a));

    return sortedMonths.map(monthKey => ({
      monthKey,
      monthLabel: formatMonthLabel(monthKey),
      days: Object.keys(byMonth[monthKey])
        .sort((a, b) => b.localeCompare(a)) // Sort days descending
        .map(dayKey => ({
          dayKey,
          dayLabel: formatDayLabel(dayKey),
          visits: byMonth[monthKey][dayKey],
        })),
    }));
  }, [filteredVisits]);

  const toggleMonth = (monthKey: string) => {
    setExpandedMonths(prev => {
      const newSet = new Set(prev);
      if (newSet.has(monthKey)) {
        newSet.delete(monthKey);
      } else {
        newSet.add(monthKey);
      }
      return newSet;
    });
  };

  const loadMoreMonths = () => {
    setMonthsToLoad(prev => prev + 1);
  };

  if (visitsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (visits.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4">
        <Utensils className="w-16 h-16 text-gray-300 mb-4" />
        <p className="text-gray-500 text-center mb-2">No visits yet</p>
        <p className="text-sm text-gray-400 text-center">
          Tap the + button to add your first visit
        </p>
      </div>
    );
  }

  if (filteredVisits.length === 0 && hasMoreVisits) {
    return (
      <div className="flex flex-col h-full bg-gray-50">
        <div className="bg-white border-b border-gray-200 px-4 py-4">
          <h1 className="text-2xl font-bold text-gray-900">My Visits</h1>
          <p className="text-sm text-gray-500 mt-1">{visits.length} total visits</p>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <p className="text-gray-500 text-center mb-4">No visits in the last month</p>
          <Button onClick={loadMoreMonths} variant="outline">
            Load Older Visits
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <h1 className="text-2xl font-bold text-gray-900">My Visits</h1>
        <p className="text-sm text-gray-500 mt-1">
          Showing {filteredVisits.length} of {visits.length} visit{visits.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {groupedVisits.map(({ monthKey, monthLabel, days }) => (
          <div key={monthKey} className="space-y-3">
            {/* Month Header */}
            <button
              onClick={() => toggleMonth(monthKey)}
              className="w-full flex items-center justify-between p-3 bg-white rounded-lg border hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                {expandedMonths.has(monthKey) ? (
                  <ChevronDown className="w-5 h-5 text-gray-600" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-gray-600" />
                )}
                <h2 className="text-lg font-semibold text-gray-900">{monthLabel}</h2>
              </div>
              <span className="text-sm text-gray-500">
                {days.reduce((sum, day) => sum + day.visits.length, 0)} visit{days.reduce((sum, day) => sum + day.visits.length, 0) !== 1 ? 's' : ''}
              </span>
            </button>

            {/* Month Content */}
            {expandedMonths.has(monthKey) && (
              <div className="space-y-4 pl-2">
                {days.map(({ dayKey, dayLabel, visits: dayVisits }) => (
                  <div key={dayKey} className="space-y-3">
                    {/* Day Header */}
                    <div className="flex items-center gap-2 px-2">
                      <Calendar className="w-4 h-4 text-gray-500" />
                      <h3 className="text-sm font-medium text-gray-700">{dayLabel}</h3>
                    </div>

                    {/* Visits for this day */}
                    <div className="space-y-3">
                      {dayVisits.map((visit) => (
                        <Card key={visit.id}>
                          <CardHeader className="pb-3">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <CardTitle className="text-lg">{visit.restaurant?.name}</CardTitle>
                                <CardDescription className="flex items-center gap-1 mt-1">
                                  <MapPin className="w-3 h-3" />
                                  {visit.restaurant?.location}
                                  {visit.restaurant?.cuisineType && ` • ${visit.restaurant.cuisineType}`}
                                </CardDescription>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => onEditVisit?.(visit.id)}
                                data-testid={`edit-visit-${visit.id}`}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                            </div>
                          </CardHeader>
                          <CardContent>
                            {visit.foodItems && visit.foodItems.length > 0 ? (
                              <div className="space-y-2">
                                {visit.foodItems.map((item) => (
                                  <div
                                    key={item.id}
                                    className="flex items-start justify-between gap-3 p-3 bg-gray-50 rounded-lg"
                                  >
                                    <div className="flex-1 min-w-0">
                                      <p className="font-medium text-gray-900">{item.name}</p>
                                      {item.description && (
                                        <p className="text-sm text-gray-500 mt-0.5">{item.description}</p>
                                      )}
                                      {item.notes && (
                                        <p className="text-xs text-gray-600 mt-1 italic">"{item.notes}"</p>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                      <div
                                        className={`w-3 h-3 rounded-full ${
                                          RATING_COLORS[item.rating - 1] || 'bg-gray-300'
                                        }`}
                                      />
                                      <span className="text-xs text-gray-600 whitespace-nowrap">
                                        {RATING_LABELS[item.rating - 1] || 'Unknown'}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-gray-400 italic">No items recorded</p>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Load More Button */}
        {hasMoreVisits && (
          <div className="pt-2 pb-4">
            <Button onClick={loadMoreMonths} variant="outline" className="w-full">
              Load Older Visits
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
