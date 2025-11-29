# Engagement Features Workplan

## Executive Summary

This document outlines the implementation plan for three key engagement features designed to transform the app from a "track meals" tool into a "food social network" with daily active usage.

**Goal**: Increase user retention and data quality by creating multiple reasons to open the app beyond just logging visits.

**Strategic Features:**
1. **Personal Insights Dashboard** - Habitual weekly check-ins
2. **Social Interactions** - Notification loops for daily engagement
3. **Explore Feed** - Discovery sessions when browsing

**Restaurant Value**: These features generate the exact data restaurants would pay for (preferences, social influence, trends, pre-purchase intent signals).

---

## Strategic Rationale

### Current Problem
The app only has value **when users are eating out**, leading to:
- Low daily active usage
- Users forget to track visits
- Inconsistent data (bad for restaurant insights)
- No viral growth loops

### Solution Approach
Create **multiple engagement touchpoints**:
- **Insights** → Habitual usage (check stats weekly)
- **Social interactions** → Notification loops (open daily)
- **Explore feed** → Discovery sessions (open when bored)

### Value for Restaurant Insights Business
1. **"Want to try" data** - Pre-purchase intent signals (more valuable than post-purchase reviews)
2. **Social influence scores** - Which dishes drive the most shares/likes
3. **Trend forecasting** - Early signals of emerging cuisines/dishes
4. **Competitive benchmarking** - Rating comparisons
5. **User segmentation** - Influencers vs. casual diners

---

## Phase 1: Personal Insights Dashboard

**Timeline**: 2-4 weeks
**Priority**: HIGH - Fastest win with immediate user value

### Overview
Give users a reason to open the app when NOT eating by showing personalized statistics, trends, and shareable year-end summaries.

### 1.1 Database Requirements

**New Collection: `user_stats`** (Cached Statistics)
```javascript
collection: "user_stats"

Fields:
- user (relation to users, required, unique)
- statsType (select, required)
  - "weekly"
  - "monthly"
  - "yearly"
  - "all_time"
- periodStart (date, required) // e.g., 2025-11-11 for week starting Nov 11
- periodEnd (date, required)
- data (json, required) // Statistics object
- lastCalculated (date, auto)
- created (autodate)
- updated (autodate)

Indexes:
- user + statsType + periodStart (composite, unique)

Rules:
- User can only view their own stats
- System updates via cron jobs
```

**Statistics Data Structure** (`data` field):
```json
{
  "summary": {
    "totalVisits": 12,
    "uniqueRestaurants": 8,
    "totalDishes": 24,
    "averageRating": 3.8
  },
  "topRestaurants": [
    {
      "restaurantId": "xxx",
      "restaurantName": "Sushi Palace",
      "visitCount": 3,
      "averageRating": 4.5
    }
  ],
  "topCuisines": [
    {
      "cuisineType": "Japanese",
      "visitCount": 5,
      "percentage": 41.7
    }
  ],
  "ratingDistribution": {
    "dontEatEver": 1,
    "skip": 3,
    "okay": 8,
    "eatAgain": 10,
    "eatOften": 2
  },
  "favoriteItems": [
    {
      "foodItemId": "xxx",
      "name": "Spicy Tuna Roll",
      "restaurantName": "Sushi Palace",
      "rating": 5,
      "timesOrdered": 3
    }
  ],
  "trends": {
    "changeFromPrevious": {
      "visits": "+25%",
      "uniqueRestaurants": "+2"
    },
    "emerging": "You've been eating more Italian this month"
  },
  "spending": {
    "total": 245.50, // If user tracks bill splits
    "average": 20.46,
    "mostExpensive": {
      "restaurantName": "Fine Dining",
      "amount": 85.00
    }
  }
}
```

### 1.2 Backend Implementation

**New File: `backend/analytics/stats.go`**

```go
package analytics

import (
  "time"
  "github.com/pocketbase/pocketbase/core"
)

// StatsType represents different time periods for stats
type StatsType string

const (
  StatsWeekly  StatsType = "weekly"
  StatsMonthly StatsType = "monthly"
  StatsYearly  StatsType = "yearly"
  StatsAllTime StatsType = "all_time"
)

// CalculateUserStats computes statistics for a user and period
func CalculateUserStats(app core.App, userID string, statsType StatsType, periodStart, periodEnd time.Time) (*UserStats, error) {
  // Fetch all visits in period
  visits := fetchVisitsInPeriod(app, userID, periodStart, periodEnd)

  // Calculate summary metrics
  summary := calculateSummary(visits)

  // Calculate top restaurants
  topRestaurants := calculateTopRestaurants(visits)

  // Calculate cuisine distribution
  topCuisines := calculateTopCuisines(visits)

  // Calculate rating distribution
  ratingDist := calculateRatingDistribution(visits)

  // Calculate favorite items
  favoriteItems := calculateFavoriteItems(visits)

  // Calculate trends (compare to previous period)
  trends := calculateTrends(app, userID, visits, statsType, periodStart)

  // Calculate spending (if available from bill splits)
  spending := calculateSpending(app, userID, periodStart, periodEnd)

  return &UserStats{
    Summary:             summary,
    TopRestaurants:      topRestaurants,
    TopCuisines:         topCuisines,
    RatingDistribution:  ratingDist,
    FavoriteItems:       favoriteItems,
    Trends:              trends,
    Spending:            spending,
  }, nil
}

// SaveUserStats saves calculated stats to database
func SaveUserStats(app core.App, userID string, statsType StatsType, periodStart, periodEnd time.Time, stats *UserStats) error {
  collection := app.FindCollectionByNameOrId("user_stats")

  // Check if record exists
  existing := findExistingStats(app, userID, statsType, periodStart)

  var record *core.Record
  if existing != nil {
    record = existing
  } else {
    record = core.NewRecord(collection)
    record.Set("user", userID)
    record.Set("statsType", string(statsType))
    record.Set("periodStart", periodStart)
    record.Set("periodEnd", periodEnd)
  }

  record.Set("data", stats)
  record.Set("lastCalculated", time.Now())

  return app.Save(record)
}
```

**New File: `backend/analytics/calculations.go`**

Helper functions for stat calculations:
```go
func calculateSummary(visits []*Visit) Summary {
  uniqueRestaurants := make(map[string]bool)
  totalDishes := 0
  totalRating := 0.0
  ratingCount := 0

  for _, visit := range visits {
    uniqueRestaurants[visit.RestaurantID] = true

    for _, item := range visit.FoodItems {
      totalDishes++
      if item.Rating > 0 {
        totalRating += float64(item.Rating)
        ratingCount++
      }
    }
  }

  avgRating := 0.0
  if ratingCount > 0 {
    avgRating = totalRating / float64(ratingCount)
  }

  return Summary{
    TotalVisits:         len(visits),
    UniqueRestaurants:   len(uniqueRestaurants),
    TotalDishes:         totalDishes,
    AverageRating:       avgRating,
  }
}

func calculateTopRestaurants(visits []*Visit) []TopRestaurant {
  restaurantMap := make(map[string]*RestaurantStats)

  for _, visit := range visits {
    if _, exists := restaurantMap[visit.RestaurantID]; !exists {
      restaurantMap[visit.RestaurantID] = &RestaurantStats{
        RestaurantID:   visit.RestaurantID,
        RestaurantName: visit.RestaurantName,
        VisitCount:     0,
        TotalRating:    0.0,
        RatingCount:    0,
      }
    }

    stats := restaurantMap[visit.RestaurantID]
    stats.VisitCount++

    for _, item := range visit.FoodItems {
      if item.Rating > 0 {
        stats.TotalRating += float64(item.Rating)
        stats.RatingCount++
      }
    }
  }

  // Convert to slice and sort by visit count
  topRestaurants := make([]TopRestaurant, 0)
  for _, stats := range restaurantMap {
    avgRating := 0.0
    if stats.RatingCount > 0 {
      avgRating = stats.TotalRating / float64(stats.RatingCount)
    }

    topRestaurants = append(topRestaurants, TopRestaurant{
      RestaurantID:   stats.RestaurantID,
      RestaurantName: stats.RestaurantName,
      VisitCount:     stats.VisitCount,
      AverageRating:  avgRating,
    })
  }

  sort.Slice(topRestaurants, func(i, j int) bool {
    return topRestaurants[i].VisitCount > topRestaurants[j].VisitCount
  })

  // Return top 5
  if len(topRestaurants) > 5 {
    return topRestaurants[:5]
  }
  return topRestaurants
}
```

### 1.3 Custom API Endpoints

**Endpoint 1: `GET /api/stats/current-week`**

Returns stats for the current week (Monday-Sunday).

```go
// Response
{
  "statsType": "weekly",
  "periodStart": "2025-11-11T00:00:00Z",
  "periodEnd": "2025-11-17T23:59:59Z",
  "lastCalculated": "2025-11-17T10:30:00Z",
  "data": {
    "summary": { /* ... */ },
    "topRestaurants": [ /* ... */ ],
    "topCuisines": [ /* ... */ ],
    "ratingDistribution": { /* ... */ },
    "favoriteItems": [ /* ... */ ],
    "trends": { /* ... */ }
  }
}
```

**Endpoint 2: `GET /api/stats/current-month`**

Returns stats for the current calendar month.

**Endpoint 3: `GET /api/stats/current-year`**

Returns stats for the current calendar year.

**Endpoint 4: `GET /api/stats/all-time`**

Returns all-time statistics.

**Endpoint 5: `GET /api/stats/yearly-wrapped`**

Returns special year-end summary with shareable format.

```go
// Response (enhanced for sharing)
{
  "year": 2025,
  "highlights": {
    "totalVisits": 156,
    "uniqueRestaurants": 87,
    "totalDishes": 312,
    "topRestaurant": {
      "name": "Sushi Palace",
      "visits": 12
    },
    "topCuisine": {
      "name": "Japanese",
      "percentage": 28
    },
    "adventureScore": 87, // % of unique restaurants vs total visits
    "favoriteMonth": "August", // Month with most visits
    "longestStreak": {
      "days": 14,
      "startDate": "2025-06-01"
    }
  },
  "shareUrl": "https://app.foodtracker.com/wrapped/2025/xxx", // Public shareable link
  "shareImage": "https://cdn.foodtracker.com/wrapped/2025/user_xxx.png" // Generated image
}
```

**Endpoint 6: `POST /api/stats/refresh`**

Forces recalculation of stats for the current user.

```go
// Request
{
  "statsType": "weekly" // or "monthly", "yearly", "all_time"
}

// Response
{
  "success": true,
  "lastCalculated": "2025-11-17T15:45:00Z"
}
```

### 1.4 Cron Jobs

**Job 1: Weekly Stats Calculation** (Runs every Monday at 1:00 AM)
```go
func calculateWeeklyStatsForAllUsers(app core.App) {
  users := fetchAllActiveUsers(app)

  // Previous week (Monday to Sunday)
  now := time.Now()
  lastMonday := getLastMonday(now)
  lastSunday := lastMonday.AddDate(0, 0, 6)

  for _, user := range users {
    stats, err := CalculateUserStats(app, user.Id, StatsWeekly, lastMonday, lastSunday)
    if err != nil {
      log.Printf("Error calculating weekly stats for user %s: %v", user.Id, err)
      continue
    }

    SaveUserStats(app, user.Id, StatsWeekly, lastMonday, lastSunday, stats)
  }
}
```

**Job 2: Monthly Stats Calculation** (Runs on 1st of each month at 2:00 AM)
```go
func calculateMonthlyStatsForAllUsers(app core.App) {
  users := fetchAllActiveUsers(app)

  // Previous month
  now := time.Now()
  firstOfLastMonth := time.Date(now.Year(), now.Month()-1, 1, 0, 0, 0, 0, now.Location())
  lastOfLastMonth := firstOfLastMonth.AddDate(0, 1, -1)

  for _, user := range users {
    stats, err := CalculateUserStats(app, user.Id, StatsMonthly, firstOfLastMonth, lastOfLastMonth)
    if err != nil {
      continue
    }

    SaveUserStats(app, user.Id, StatsMonthly, firstOfLastMonth, lastOfLastMonth, stats)
  }
}
```

**Job 3: Yearly Wrapped Generation** (Runs on January 1st at 3:00 AM)
```go
func generateYearlyWrappedForAllUsers(app core.App) {
  users := fetchAllActiveUsers(app)

  previousYear := time.Now().Year() - 1
  yearStart := time.Date(previousYear, 1, 1, 0, 0, 0, 0, time.UTC)
  yearEnd := time.Date(previousYear, 12, 31, 23, 59, 59, 0, time.UTC)

  for _, user := range users {
    stats, err := CalculateUserStats(app, user.Id, StatsYearly, yearStart, yearEnd)
    if err != nil {
      continue
    }

    SaveUserStats(app, user.Id, StatsYearly, yearStart, yearEnd, stats)

    // Generate shareable wrapped image
    generateWrappedImage(app, user, stats, previousYear)

    // Send notification
    sendYearlyWrappedNotification(user, previousYear)
  }
}
```

### 1.5 Frontend Implementation

**New Route: `frontend/src/routes/stats.tsx`**

Main insights dashboard page.

```tsx
import { useQuery } from '@tanstack/react-query'
import { pb } from '@/lib/pocketbase'
import { StatsCard } from '@/components/stats/StatsCard'
import { TopRestaurants } from '@/components/stats/TopRestaurants'
import { CuisineChart } from '@/components/stats/CuisineChart'
import { RatingDistribution } from '@/components/stats/RatingDistribution'
import { TrendsSection } from '@/components/stats/TrendsSection'
import { ShareButton } from '@/components/stats/ShareButton'

export function StatsPage() {
  const [period, setPeriod] = useState<'week' | 'month' | 'year' | 'all'>('week')

  const { data: stats, isLoading } = useQuery({
    queryKey: ['stats', period],
    queryFn: async () => {
      const endpoint = `/api/stats/current-${period === 'all' ? 'all-time' : period}`
      return pb.send(endpoint)
    }
  })

  if (isLoading) return <LoadingSpinner />
  if (!stats) return null

  return (
    <div className="stats-page">
      <header className="stats-header">
        <h1>Your Food Journey</h1>
        <PeriodSelector value={period} onChange={setPeriod} />
      </header>

      {/* Summary Cards */}
      <div className="stats-grid">
        <StatsCard
          label="Visits"
          value={stats.data.summary.totalVisits}
          trend={stats.data.trends?.changeFromPrevious?.visits}
        />
        <StatsCard
          label="Restaurants"
          value={stats.data.summary.uniqueRestaurants}
          trend={stats.data.trends?.changeFromPrevious?.uniqueRestaurants}
        />
        <StatsCard
          label="Dishes Tried"
          value={stats.data.summary.totalDishes}
        />
        <StatsCard
          label="Avg Rating"
          value={stats.data.summary.averageRating.toFixed(1)}
          icon="⭐"
        />
      </div>

      {/* Trends Insight */}
      {stats.data.trends?.emerging && (
        <TrendsSection message={stats.data.trends.emerging} />
      )}

      {/* Top Restaurants */}
      <TopRestaurants restaurants={stats.data.topRestaurants} />

      {/* Cuisine Breakdown */}
      <CuisineChart cuisines={stats.data.topCuisines} />

      {/* Rating Distribution */}
      <RatingDistribution distribution={stats.data.ratingDistribution} />

      {/* Favorite Dishes */}
      <FavoriteItems items={stats.data.favoriteItems} />

      {/* Share Button */}
      <ShareButton stats={stats} period={period} />
    </div>
  )
}
```

**New Component: `frontend/src/components/stats/StatsCard.tsx`**

```tsx
interface StatsCardProps {
  label: string
  value: number | string
  trend?: string // e.g., "+25%", "-2"
  icon?: string
}

export function StatsCard({ label, value, trend, icon }: StatsCardProps) {
  const trendDirection = trend?.startsWith('+') ? 'up' : 'down'

  return (
    <div className="stats-card">
      <div className="stats-card-header">
        <span className="stats-label">{label}</span>
        {icon && <span className="stats-icon">{icon}</span>}
      </div>
      <div className="stats-value">{value}</div>
      {trend && (
        <div className={`stats-trend ${trendDirection}`}>
          {trend} from last period
        </div>
      )}
    </div>
  )
}
```

**New Component: `frontend/src/components/stats/ShareButton.tsx`**

Generates shareable image/story for social media.

```tsx
export function ShareButton({ stats, period }: { stats: any, period: string }) {
  const [isGenerating, setIsGenerating] = useState(false)

  async function handleShare() {
    setIsGenerating(true)

    try {
      // Generate shareable image using canvas or server endpoint
      const imageBlob = await generateStatsImage(stats, period)

      // Use native share API (works on mobile)
      if (navigator.share && navigator.canShare({ files: [imageBlob] })) {
        await navigator.share({
          title: `My Food Stats - ${period}`,
          text: `I visited ${stats.data.summary.totalVisits} restaurants this ${period}!`,
          files: [new File([imageBlob], 'my-food-stats.png', { type: 'image/png' })]
        })
      } else {
        // Fallback: Download image
        downloadImage(imageBlob, `food-stats-${period}.png`)
      }
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <button
      onClick={handleShare}
      disabled={isGenerating}
      className="share-stats-button"
    >
      {isGenerating ? 'Generating...' : 'Share My Stats'}
    </button>
  )
}
```

### 1.6 Yearly Wrapped Feature

**New Route: `frontend/src/routes/wrapped/$year.tsx`**

Special year-end summary page.

```tsx
export function YearlyWrappedPage() {
  const { year } = useParams()

  const { data: wrapped } = useQuery({
    queryKey: ['wrapped', year],
    queryFn: () => pb.send(`/api/stats/yearly-wrapped?year=${year}`)
  })

  if (!wrapped) return <LoadingSpinner />

  return (
    <div className="wrapped-page">
      {/* Full-screen slides with animations */}
      <WrappedSlide>
        <h1>Your {year} Food Journey</h1>
        <p>{wrapped.highlights.totalVisits} restaurants visited</p>
      </WrappedSlide>

      <WrappedSlide>
        <h2>Top Restaurant</h2>
        <p className="big-number">{wrapped.highlights.topRestaurant.name}</p>
        <p>{wrapped.highlights.topRestaurant.visits} visits</p>
      </WrappedSlide>

      <WrappedSlide>
        <h2>Favorite Cuisine</h2>
        <p className="big-number">{wrapped.highlights.topCuisine.name}</p>
        <p>{wrapped.highlights.topCuisine.percentage}% of your visits</p>
      </WrappedSlide>

      <WrappedSlide>
        <h2>Adventure Score</h2>
        <p className="big-number">{wrapped.highlights.adventureScore}</p>
        <p>You tried {wrapped.highlights.uniqueRestaurants} different places!</p>
      </WrappedSlide>

      <WrappedSlide>
        <ShareWrappedButton wrapped={wrapped} year={year} />
      </WrappedSlide>
    </div>
  )
}
```

---

## Phase 2: Social Interactions (Likes + Want to Try)

**Timeline**: 3-4 weeks
**Priority**: HIGH - Creates notification loops

### Overview
Add social validation and discovery intent signals through likes and "want to try" bookmarks. These create notification loops that drive daily engagement.

### 2.1 Database Schema

**New Collection: `likes`**
```javascript
collection: "likes"

Fields:
- user (relation to users, required) // Who liked
- targetType (select, required)
  - "visit"
  - "food_item"
- targetId (text, required) // ID of visit or food_item
- created (autodate)

Indexes:
- user + targetType + targetId (composite, unique) // Prevent duplicate likes

Rules:
- User can only create/delete their own likes
- Anyone can view likes on public/friend content
```

**New Collection: `want_to_try`**
```javascript
collection: "want_to_try"

Fields:
- user (relation to users, required) // Who wants to try
- foodItem (relation to food_items, required) // What dish
- restaurant (relation to restaurants, required) // Where (denormalized for performance)
- sourceVisit (relation to visits, optional) // Which friend's visit inspired this
- notes (text, optional) // Personal notes
- priority (select, default: "medium")
  - "low"
  - "medium"
  - "high"
- tried (bool, default: false) // Marked true when user creates visit with this item
- triedVisit (relation to visits, optional) // Link to visit where they tried it
- created (autodate)

Indexes:
- user + foodItem (composite, unique)
- user + tried (composite) // Fast lookup of pending items

Rules:
- User can only create/update/delete their own bookmarks
- User can view their own + friends' bookmarks (respecting visit visibility)
```

**New Collection: `notifications`**
```javascript
collection: "notifications"

Fields:
- user (relation to users, required) // Recipient
- actorUser (relation to users, optional) // Who triggered the notification
- type (select, required)
  - "like_visit"
  - "like_food_item"
  - "want_to_try"
  - "friend_request"
  - "friend_accepted"
  - "friend_tried_your_rec" // Friend tried your recommended dish
- targetType (select, optional)
  - "visit"
  - "food_item"
  - "friendship"
- targetId (text, optional) // ID of target object
- message (text, required) // "John liked your visit to Sushi Palace"
- read (bool, default: false)
- created (autodate)

Indexes:
- user + read (composite)
- user + created (composite)

Rules:
- User can only view/update their own notifications
```

### 2.2 Backend Implementation

**New File: `backend/social/likes.go`**

```go
package social

import (
  "github.com/pocketbase/pocketbase/core"
)

// CreateLike adds a like to a visit or food item
func CreateLike(app core.App, userID, targetType, targetID string) error {
  // Check if already liked
  existing := findLike(app, userID, targetType, targetID)
  if existing != nil {
    return errors.New("Already liked")
  }

  // Create like
  collection := app.FindCollectionByNameOrId("likes")
  record := core.NewRecord(collection)
  record.Set("user", userID)
  record.Set("targetType", targetType)
  record.Set("targetId", targetID)

  if err := app.Save(record); err != nil {
    return err
  }

  // Create notification for content owner
  targetOwnerID := getTargetOwnerID(app, targetType, targetID)
  if targetOwnerID != userID { // Don't notify self
    createNotification(app, targetOwnerID, userID, "like_"+targetType, targetType, targetID)
  }

  return nil
}

// RemoveLike removes a like
func RemoveLike(app core.App, userID, targetType, targetID string) error {
  like := findLike(app, userID, targetType, targetID)
  if like == nil {
    return errors.New("Like not found")
  }

  return app.Delete(like)
}

// GetLikeCount returns number of likes for a target
func GetLikeCount(app core.App, targetType, targetID string) int {
  count, _ := app.CountRecords("likes",
    "targetType = {:type} AND targetId = {:id}",
    dbx.Params{"type": targetType, "id": targetID},
  )
  return int(count)
}

// HasUserLiked checks if user has liked a target
func HasUserLiked(app core.App, userID, targetType, targetID string) bool {
  like := findLike(app, userID, targetType, targetID)
  return like != nil
}
```

**New File: `backend/social/want_to_try.go`**

```go
// CreateWantToTry bookmarks a dish to try later
func CreateWantToTry(app core.App, userID, foodItemID, restaurantID string, sourceVisitID string, notes string) error {
  // Check if already bookmarked
  existing := findWantToTry(app, userID, foodItemID)
  if existing != nil {
    return errors.New("Already bookmarked")
  }

  collection := app.FindCollectionByNameOrId("want_to_try")
  record := core.NewRecord(collection)
  record.Set("user", userID)
  record.Set("foodItem", foodItemID)
  record.Set("restaurant", restaurantID)
  record.Set("sourceVisit", sourceVisitID)
  record.Set("notes", notes)
  record.Set("priority", "medium")
  record.Set("tried", false)

  if err := app.Save(record); err != nil {
    return err
  }

  // Create notification for visit owner (if from friend's visit)
  if sourceVisitID != "" {
    visitOwnerID := getVisitOwnerID(app, sourceVisitID)
    if visitOwnerID != userID {
      createNotification(app, visitOwnerID, userID, "want_to_try", "food_item", foodItemID)
    }
  }

  return nil
}

// MarkAsTried marks a bookmarked dish as tried
func MarkAsTried(app core.App, wantToTryID, visitID string) error {
  wantToTry := findWantToTryByID(app, wantToTryID)
  if wantToTry == nil {
    return errors.New("Bookmark not found")
  }

  wantToTry.Set("tried", true)
  wantToTry.Set("triedVisit", visitID)

  // Create notification for original recommender
  sourceVisitID := wantToTry.GetString("sourceVisit")
  if sourceVisitID != "" {
    visitOwnerID := getVisitOwnerID(app, sourceVisitID)
    userID := wantToTry.GetString("user")

    if visitOwnerID != userID {
      createNotification(app, visitOwnerID, userID, "friend_tried_your_rec", "food_item", wantToTry.GetString("foodItem"))
    }
  }

  return app.Save(wantToTry)
}
```

**New File: `backend/social/notifications.go`**

```go
// CreateNotification creates a new notification
func createNotification(app core.App, recipientID, actorID, notifType, targetType, targetID string) error {
  collection := app.FindCollectionByNameOrId("notifications")
  record := core.NewRecord(collection)

  record.Set("user", recipientID)
  record.Set("actorUser", actorID)
  record.Set("type", notifType)
  record.Set("targetType", targetType)
  record.Set("targetId", targetID)
  record.Set("message", formatNotificationMessage(app, notifType, actorID, targetType, targetID))
  record.Set("read", false)

  return app.Save(record)
}

// Format notification message based on type
func formatNotificationMessage(app core.App, notifType, actorID, targetType, targetID string) string {
  actor := getUserName(app, actorID)

  switch notifType {
  case "like_visit":
    restaurant := getRestaurantNameFromVisit(app, targetID)
    return fmt.Sprintf("%s liked your visit to %s", actor, restaurant)

  case "like_food_item":
    foodItem := getFoodItemName(app, targetID)
    return fmt.Sprintf("%s liked your dish: %s", actor, foodItem)

  case "want_to_try":
    foodItem := getFoodItemName(app, targetID)
    return fmt.Sprintf("%s wants to try your recommendation: %s", actor, foodItem)

  case "friend_tried_your_rec":
    foodItem := getFoodItemName(app, targetID)
    return fmt.Sprintf("%s tried your recommendation: %s!", actor, foodItem)

  default:
    return "New notification"
  }
}

// GetUnreadCount returns count of unread notifications
func GetUnreadCount(app core.App, userID string) int {
  count, _ := app.CountRecords("notifications",
    "user = {:user} AND read = false",
    dbx.Params{"user": userID},
  )
  return int(count)
}
```

### 2.3 Custom API Endpoints

**Endpoint 1: `POST /api/likes`**

Create a like.

```go
// Request
{
  "targetType": "visit", // or "food_item"
  "targetId": "xxx"
}

// Response
{
  "id": "like_xxx",
  "created": "2025-11-17T10:30:00Z"
}
```

**Endpoint 2: `DELETE /api/likes/:id`**

Remove a like.

**Endpoint 3: `GET /api/likes/count/:targetType/:targetId`**

Get like count for a target.

```go
// Response
{
  "count": 12,
  "hasUserLiked": true
}
```

**Endpoint 4: `POST /api/want-to-try`**

Bookmark a dish to try.

```go
// Request
{
  "foodItemId": "xxx",
  "restaurantId": "xxx",
  "sourceVisitId": "xxx", // optional
  "notes": "Friend recommended this",
  "priority": "high"
}

// Response
{
  "id": "wtt_xxx",
  "created": "2025-11-17T10:30:00Z"
}
```

**Endpoint 5: `GET /api/want-to-try/list`**

Get user's want-to-try list.

```go
// Query params: ?tried=false&priority=high

// Response
{
  "items": [
    {
      "id": "wtt_xxx",
      "foodItem": {
        "id": "fi_xxx",
        "name": "Spicy Tuna Roll",
        "rating": 5
      },
      "restaurant": {
        "id": "rest_xxx",
        "name": "Sushi Palace"
      },
      "sourceVisit": {
        "id": "visit_xxx",
        "user": {
          "name": "John"
        }
      },
      "notes": "Friend recommended",
      "priority": "high",
      "tried": false,
      "created": "2025-11-15T10:00:00Z"
    }
  ],
  "totalCount": 15,
  "pendingCount": 12
}
```

**Endpoint 6: `PATCH /api/want-to-try/:id/mark-tried`**

Mark bookmark as tried.

```go
// Request
{
  "visitId": "visit_xxx" // Visit where they tried it
}

// Response
{
  "success": true
}
```

**Endpoint 7: `GET /api/notifications`**

Get user's notifications.

```go
// Query params: ?read=false&limit=20&offset=0

// Response
{
  "items": [
    {
      "id": "notif_xxx",
      "type": "like_visit",
      "actorUser": {
        "id": "user_xxx",
        "name": "John",
        "avatar": "..."
      },
      "message": "John liked your visit to Sushi Palace",
      "targetType": "visit",
      "targetId": "visit_xxx",
      "read": false,
      "created": "2025-11-17T10:30:00Z"
    }
  ],
  "unreadCount": 5
}
```

**Endpoint 8: `PATCH /api/notifications/mark-all-read`**

Mark all notifications as read.

**Endpoint 9: `GET /api/food-items/:id/social-stats`**

Get social stats for a food item.

```go
// Response
{
  "likeCount": 12,
  "wantToTryCount": 8,
  "hasUserLiked": true,
  "hasUserBookmarked": false,
  "recentLikes": [
    {
      "user": {
        "name": "John",
        "avatar": "..."
      },
      "created": "2025-11-17T10:00:00Z"
    }
  ]
}
```

### 2.4 Frontend Implementation

**Update: `frontend/src/components/VisitCard.tsx`**

Add like button and social stats.

```tsx
export function VisitCard({ visit }: { visit: Visit }) {
  const [likeCount, setLikeCount] = useState(visit.likeCount || 0)
  const [hasLiked, setHasLiked] = useState(visit.hasUserLiked || false)

  async function handleLike() {
    if (hasLiked) {
      await pb.send(`/api/likes/${visit.likeId}`, { method: 'DELETE' })
      setHasLiked(false)
      setLikeCount(prev => prev - 1)
    } else {
      const result = await pb.send('/api/likes', {
        method: 'POST',
        body: { targetType: 'visit', targetId: visit.id }
      })
      setHasLiked(true)
      setLikeCount(prev => prev + 1)
    }
  }

  return (
    <div className="visit-card">
      <div className="visit-header">
        <h3>{visit.restaurantName}</h3>
        <button
          onClick={handleLike}
          className={`like-button ${hasLiked ? 'liked' : ''}`}
        >
          {hasLiked ? '❤️' : '🤍'} {likeCount > 0 && likeCount}
        </button>
      </div>

      {/* Visit content */}
      <VisitContent visit={visit} />
    </div>
  )
}
```

**New Component: `frontend/src/components/FoodItemCard.tsx`**

Food item card with like and want-to-try buttons.

```tsx
export function FoodItemCard({ item, visit }: { item: FoodItem, visit: Visit }) {
  const [socialStats, setSocialStats] = useState(item.socialStats)

  async function handleWantToTry() {
    await pb.send('/api/want-to-try', {
      method: 'POST',
      body: {
        foodItemId: item.id,
        restaurantId: visit.restaurant,
        sourceVisitId: visit.id,
        priority: 'medium'
      }
    })

    toast.success('Added to your Want to Try list!')
    setSocialStats(prev => ({ ...prev, wantToTryCount: prev.wantToTryCount + 1 }))
  }

  return (
    <div className="food-item-card">
      <div className="food-item-header">
        <span className="food-name">{item.name}</span>
        <RatingBadge rating={item.rating} />
      </div>

      {item.photo && <img src={item.photo} alt={item.name} />}

      <div className="food-item-actions">
        <button onClick={handleLike} className="action-button">
          {socialStats.hasUserLiked ? '❤️' : '🤍'} {socialStats.likeCount}
        </button>

        {!socialStats.hasUserBookmarked && (
          <button onClick={handleWantToTry} className="action-button">
            🔖 Want to Try {socialStats.wantToTryCount > 0 && `(${socialStats.wantToTryCount})`}
          </button>
        )}

        {socialStats.hasUserBookmarked && (
          <span className="bookmarked">✅ Bookmarked</span>
        )}
      </div>

      {socialStats.wantToTryCount > 0 && (
        <div className="social-proof">
          {socialStats.wantToTryCount} {socialStats.wantToTryCount === 1 ? 'person wants' : 'people want'} to try this
        </div>
      )}
    </div>
  )
}
```

**New Route: `frontend/src/routes/want-to-try.tsx`**

Want to try list page.

```tsx
export function WantToTryPage() {
  const [filter, setFilter] = useState<'all' | 'pending' | 'tried'>('pending')

  const { data: items } = useQuery({
    queryKey: ['want-to-try', filter],
    queryFn: () => pb.send(`/api/want-to-try/list?tried=${filter === 'tried'}`)
  })

  return (
    <div className="want-to-try-page">
      <header>
        <h1>Want to Try</h1>
        <FilterTabs value={filter} onChange={setFilter} />
      </header>

      {items?.totalCount === 0 ? (
        <EmptyState
          title="No dishes bookmarked yet"
          description="Tap 'Want to Try' on your friends' dishes to save them here"
        />
      ) : (
        <div className="want-to-try-list">
          {items?.items.map(item => (
            <WantToTryCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}
```

**New Component: `frontend/src/components/NotificationBell.tsx`**

Notification bell with badge.

```tsx
export function NotificationBell() {
  const { data: notifs } = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => pb.send('/api/notifications?read=false'),
    refetchInterval: 30000 // Poll every 30 seconds
  })

  const unreadCount = notifs?.unreadCount || 0

  return (
    <Link to="/notifications" className="notification-bell">
      🔔
      {unreadCount > 0 && (
        <span className="notification-badge">{unreadCount}</span>
      )}
    </Link>
  )
}
```

**New Route: `frontend/src/routes/notifications.tsx`**

Notifications page.

```tsx
export function NotificationsPage() {
  const queryClient = useQueryClient()

  const { data: notifs } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => pb.send('/api/notifications')
  })

  useEffect(() => {
    // Mark all as read when viewing page
    pb.send('/api/notifications/mark-all-read', { method: 'PATCH' })
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['notifications'] })
      })
  }, [])

  return (
    <div className="notifications-page">
      <h1>Notifications</h1>

      {notifs?.items.length === 0 ? (
        <EmptyState title="No notifications yet" />
      ) : (
        <div className="notifications-list">
          {notifs?.items.map(notif => (
            <NotificationCard key={notif.id} notification={notif} />
          ))}
        </div>
      )}
    </div>
  )
}
```

---

## Phase 3: Explore Feed / Discovery

**Timeline**: 3-4 weeks
**Priority**: MEDIUM - Adds discovery, less critical than Phases 1-2

### Overview
Create a discovery feed showing trending restaurants, top dishes, and new openings beyond the user's friend network.

### 3.1 Database Requirements

**New Collection: `trending_stats`** (Cached trending data)
```javascript
collection: "trending_stats"

Fields:
- trendType (select, required)
  - "restaurants_weekly"
  - "restaurants_monthly"
  - "dishes_weekly"
  - "dishes_monthly"
  - "cuisines_weekly"
- periodStart (date, required)
- periodEnd (date, required)
- city (text, optional) // For city-specific trends
- data (json, required) // Trending items array
- lastCalculated (date, auto)
- created (autodate)

Indexes:
- trendType + periodStart (composite)
- trendType + city + periodStart (composite)

Rules:
- Everyone can view
- Only system can create/update
```

**Trending Data Structure** (`data` field):
```json
{
  "items": [
    {
      "rank": 1,
      "restaurantId": "xxx",
      "restaurantName": "Sushi Palace",
      "cuisineType": "Japanese",
      "visitCount": 45,
      "uniqueUsers": 23,
      "averageRating": 4.3,
      "trendScore": 87.5, // Weighted score based on recency + rating + uniqueness
      "coverPhoto": "https://...",
      "topDish": {
        "name": "Spicy Tuna Roll",
        "rating": 4.8
      }
    }
  ]
}
```

### 3.2 Backend Implementation

**New File: `backend/analytics/trending.go`**

```go
package analytics

// CalculateTrendingRestaurants finds trending restaurants in a time period
func CalculateTrendingRestaurants(app core.App, periodStart, periodEnd time.Time, city string) ([]TrendingRestaurant, error) {
  // Fetch all visits in period
  query := "visitDate >= ? AND visitDate <= ? AND visibility != 'private'"
  params := []any{periodStart, periodEnd}

  if city != "" {
    query += " AND restaurant.city = ?"
    params = append(params, city)
  }

  visits := fetchVisitsByQuery(app, query, params...)

  // Aggregate by restaurant
  restaurantStats := make(map[string]*RestaurantTrendStats)

  for _, visit := range visits {
    if _, exists := restaurantStats[visit.RestaurantID]; !exists {
      restaurantStats[visit.RestaurantID] = &RestaurantTrendStats{
        RestaurantID:   visit.RestaurantID,
        RestaurantName: visit.RestaurantName,
        VisitCount:     0,
        UniqueUsers:    make(map[string]bool),
        TotalRating:    0.0,
        RatingCount:    0,
      }
    }

    stats := restaurantStats[visit.RestaurantID]
    stats.VisitCount++
    stats.UniqueUsers[visit.UserID] = true

    for _, item := range visit.FoodItems {
      if item.Rating > 0 {
        stats.TotalRating += float64(item.Rating)
        stats.RatingCount++
      }
    }
  }

  // Calculate trend scores
  trending := make([]TrendingRestaurant, 0)
  for _, stats := range restaurantStats {
    avgRating := 0.0
    if stats.RatingCount > 0 {
      avgRating = stats.TotalRating / float64(stats.RatingCount)
    }

    // Trend score: weighted combination of visits, unique users, and rating
    // Favor places with more unique users (indicates broad appeal)
    trendScore := (float64(stats.VisitCount) * 0.3) +
                  (float64(len(stats.UniqueUsers)) * 0.5) +
                  (avgRating * 4.0) // Scale rating to ~20 points

    trending = append(trending, TrendingRestaurant{
      Rank:           0, // Set after sorting
      RestaurantID:   stats.RestaurantID,
      RestaurantName: stats.RestaurantName,
      VisitCount:     stats.VisitCount,
      UniqueUsers:    len(stats.UniqueUsers),
      AverageRating:  avgRating,
      TrendScore:     trendScore,
    })
  }

  // Sort by trend score
  sort.Slice(trending, func(i, j int) bool {
    return trending[i].TrendScore > trending[j].TrendScore
  })

  // Set ranks
  for i := range trending {
    trending[i].Rank = i + 1
  }

  return trending, nil
}

// CalculateTrendingDishes finds trending dishes across all restaurants
func CalculateTrendingDishes(app core.App, periodStart, periodEnd time.Time) ([]TrendingDish, error) {
  // Similar logic but aggregate by food item name + restaurant
  // ...
}
```

**Cron Job: Calculate Weekly Trends** (Runs every Monday at 4:00 AM)
```go
func calculateWeeklyTrends(app core.App) {
  now := time.Now()
  lastMonday := getLastMonday(now)
  lastSunday := lastMonday.AddDate(0, 0, 6)

  // Calculate restaurant trends
  trends, err := CalculateTrendingRestaurants(app, lastMonday, lastSunday, "")
  if err != nil {
    log.Printf("Error calculating trending restaurants: %v", err)
    return
  }

  // Save to trending_stats
  saveTrendingStats(app, "restaurants_weekly", lastMonday, lastSunday, "", trends)

  // Calculate dish trends
  dishTrends, _ := CalculateTrendingDishes(app, lastMonday, lastSunday)
  saveTrendingStats(app, "dishes_weekly", lastMonday, lastSunday, "", dishTrends)
}
```

### 3.3 Custom API Endpoints

**Endpoint 1: `GET /api/explore/trending-restaurants`**

```go
// Query params: ?period=week&city=Seattle&limit=20

// Response
{
  "periodStart": "2025-11-11T00:00:00Z",
  "periodEnd": "2025-11-17T23:59:59Z",
  "city": "Seattle", // or null for all cities
  "items": [
    {
      "rank": 1,
      "restaurant": {
        "id": "rest_xxx",
        "name": "Sushi Palace",
        "cuisineType": "Japanese",
        "coverPhoto": "https://..."
      },
      "stats": {
        "visitCount": 45,
        "uniqueUsers": 23,
        "averageRating": 4.3
      },
      "topDish": {
        "name": "Spicy Tuna Roll",
        "rating": 4.8
      }
    }
  ]
}
```

**Endpoint 2: `GET /api/explore/trending-dishes`**

**Endpoint 3: `GET /api/explore/new-restaurants`**

Returns recently added restaurants (from last 30 days).

**Endpoint 4: `GET /api/explore/top-rated`**

Returns highest-rated restaurants (all time, min 5 visits).

### 3.4 Frontend Implementation

**New Route: `frontend/src/routes/explore.tsx`**

```tsx
export function ExplorePage() {
  const [activeTab, setActiveTab] = useState<'trending' | 'top-rated' | 'new'>('trending')

  return (
    <div className="explore-page">
      <header>
        <h1>Explore</h1>
        <TabNav value={activeTab} onChange={setActiveTab} />
      </header>

      {activeTab === 'trending' && <TrendingTab />}
      {activeTab === 'top-rated' && <TopRatedTab />}
      {activeTab === 'new' && <NewRestaurantsTab />}
    </div>
  )
}

function TrendingTab() {
  const { data: trending } = useQuery({
    queryKey: ['explore', 'trending'],
    queryFn: () => pb.send('/api/explore/trending-restaurants?period=week')
  })

  return (
    <div className="trending-tab">
      <h2>Trending This Week</h2>

      {trending?.items.map((item, idx) => (
        <TrendingRestaurantCard key={item.restaurant.id} item={item} rank={idx + 1} />
      ))}
    </div>
  )
}
```

---

## Implementation Timeline

| Phase | Feature | Backend | Frontend | Testing | Total |
|-------|---------|---------|----------|---------|-------|
| **Phase 1** | **Personal Insights Dashboard** | **5 days** | **5 days** | **2 days** | **12 days** |
| | - Database schema & stats calculations | 2 days | - | - | |
| | - API endpoints & cron jobs | 2 days | - | 1 day | |
| | - Frontend dashboard UI | - | 3 days | - | |
| | - Yearly Wrapped feature | 1 day | 2 days | 1 day | |
| **Phase 2** | **Social Interactions** | **4 days** | **5 days** | **2 days** | **11 days** |
| | - Database schema (likes, want-to-try, notifications) | 1 day | - | - | |
| | - Backend social logic | 2 days | - | 1 day | |
| | - Frontend like/bookmark UI | - | 2 days | - | |
| | - Notifications system | 1 day | 2 days | - | |
| | - Want to Try list page | - | 1 day | 1 day | |
| **Phase 3** | **Explore Feed** | **3 days** | **4 days** | **2 days** | **9 days** |
| | - Trending calculations & cron | 2 days | - | 1 day | |
| | - API endpoints | 1 day | - | - | |
| | - Explore page UI | - | 3 days | 1 day | |
| | - Filters & search | - | 1 day | - | |
| **Total** | | **12 days** | **14 days** | **6 days** | **32 days** |

**MVP Timeline (Phases 1-2)**: ~23 days
**Full Timeline (All Phases)**: ~32 days

---

## Success Metrics

### Phase 1 Metrics (Insights Dashboard)
- **Weekly Active Users (WAU)** checking stats: Target 40%+ of MAU
- **Share rate** of stats: Target 15%+ of users share weekly/yearly stats
- **Time in app**: Increase by 2-3 minutes per session
- **Return rate**: Users opening app without logging visits (target: 30%+)

### Phase 2 Metrics (Social Interactions)
- **Daily Active Users (DAU)**: Target 2x increase from notifications
- **Like engagement rate**: Target 20%+ of visits receive likes
- **Want to Try conversion**: Target 10%+ of bookmarked items get tried
- **Notification open rate**: Target 60%+ click-through from notifications
- **Friend engagement**: Target 50%+ of users with friends interact weekly

### Phase 3 Metrics (Explore Feed)
- **Discovery rate**: Target 30%+ of users browse Explore monthly
- **New restaurant visits**: Target 15%+ of visits from Explore discoveries
- **Session length**: Target 5+ minutes browsing Explore
- **Trending accuracy**: Target 70%+ of trending places visited by new users

### Overall Engagement Goals
- **DAU/MAU ratio**: Increase from ~10% to 30%+
- **Retention (Day 7)**: Increase from ~40% to 60%+
- **Retention (Day 30)**: Increase from ~20% to 40%+
- **Visit tracking frequency**: Increase from 60% to 85%+ of meals tracked

---

## Restaurant Insights Value Proposition

With these features implemented, you can sell restaurants:

### Tier 1: Basic Insights ($99/month)
- Monthly trending report (are we trending?)
- Like and "want to try" counts for menu items
- Competitive ranking in neighborhood

### Tier 2: Premium Insights ($299/month)
- Real-time dashboard of social signals
- Pre-purchase intent data ("want to try" trends)
- Influencer identification (who drives most engagement?)
- Menu optimization recommendations

### Tier 3: Enterprise ($999/month)
- Full API access to anonymized data
- Custom cohort analysis
- A/B testing for menu changes
- Early warning system for negative trends

---

## Testing Checklist

### Phase 1 (Insights Dashboard)
- [ ] Weekly stats calculated correctly for all users
- [ ] Monthly stats update on 1st of month
- [ ] Yearly Wrapped generated on Jan 1
- [ ] Stats match actual visit/rating data
- [ ] Trends calculate percentage changes correctly
- [ ] Share button generates correct images
- [ ] Stats refresh on demand works
- [ ] Empty state shows for new users

### Phase 2 (Social Interactions)
- [ ] Likes can be added/removed
- [ ] Like counts update in real-time
- [ ] Notifications created when like is added
- [ ] Want to Try bookmarks created correctly
- [ ] Duplicate bookmarks prevented
- [ ] Mark as Tried updates bookmark
- [ ] Notification sent when friend tries recommendation
- [ ] Notification badge shows correct count
- [ ] All notifications marked read on page view

### Phase 3 (Explore Feed)
- [ ] Trending calculations run on schedule
- [ ] Trending results sorted by trend score
- [ ] City filters work correctly
- [ ] New restaurants show recent additions only
- [ ] Top-rated requires minimum visit threshold
- [ ] Explore feed excludes private visits
- [ ] Discovery clicks tracked for analytics

---

## Next Steps

When ready to implement:

1. **Phase 1 (Weeks 1-2)**: Personal Insights Dashboard
   - Day 1-2: Database schema + stats calculation logic
   - Day 3-4: API endpoints + cron jobs
   - Day 5-6: Frontend dashboard UI
   - Day 7-8: Yearly Wrapped feature
   - Day 9-10: Testing + bug fixes

2. **Phase 2 (Weeks 3-4)**: Social Interactions
   - Day 11-12: Database schema + backend social logic
   - Day 13-14: Like/bookmark UI components
   - Day 15-16: Notifications system
   - Day 17-18: Want to Try list page
   - Day 19-20: Testing + bug fixes

3. **Phase 3 (Weeks 5-6)**: Explore Feed
   - Day 21-23: Trending calculations + API
   - Day 24-27: Explore page UI + filters
   - Day 28-29: Testing + bug fixes
   - Day 30: Launch preparation

4. **Launch Communication**:
   - Announce features via in-app What's New
   - Send email to existing users highlighting new capabilities
   - Create tutorial/onboarding for new social features

5. **Monitor & Iterate**:
   - Track success metrics weekly
   - Gather user feedback on Insights Dashboard
   - A/B test notification frequency/types
   - Refine trending algorithms based on user engagement

---

**Last Updated**: 2025-11-18
**Document Owner**: Food Tracker App
**Status**: Planning / Ready for Implementation
