import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import { PaginationControls } from '@/components/shared/PaginationControls';
import { PaginatedCollection } from '@/components/shared/PaginatedCollection';
import type { ReassignVisitRestaurantResult, UserModerationProfile } from '@/features/users/api';
import {
  getUserModerationProfile,
  reassignUserVisitRestaurant,
  searchAndCacheAdminGoogleRestaurants,
  searchAdminRestaurants,
  searchUserVisits,
} from '@/features/users/api';
import { formatDateTime, getCreatedUpdatedDisplay } from '@/lib/formatters';
import { pb } from '@/lib/pocketbase';
import type { FoodProductSummary, UserRestaurantRecord, VisitSummary } from '@/lib/types';

type UserDetailTab =
  | 'records'
  | 'feedback'
  | 'activity'
  | 'ratings'
  | 'food-products'
  | 'restaurants'
  | 'menu-items'
  | 'visits'
  | 'notes'
  | 'photos'
  | 'lists'
  | 'bills';

function formatCurrency(value?: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 'Unknown';
  }

  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
  }).format(value);
}

function getActivityTitle(entry: UserModerationProfile['feedEntries'][number]) {
  if (entry.contentType === 'food-product') {
    return entry.itemName?.trim() || entry.restaurantName?.trim() || 'Food Product';
  }

  return entry.restaurantName?.trim() || 'Visit';
}

function getActivitySummary(entry: UserModerationProfile['feedEntries'][number]) {
  if (entry.contentType === 'food-product') {
    const ratingText = typeof entry.rating === 'number' ? `Rating ${entry.rating}` : 'Food Product';
    return `${ratingText} • ${formatDateTime(entry.eventAt)}`;
  }

  const itemCount = entry.items?.length ?? 0;
  const itemLabel = itemCount === 1 ? '1 rated item' : `${itemCount} rated items`;
  return `${itemLabel} • ${formatDateTime(entry.eventAt)}`;
}

function getVisitRestaurantName(visit: VisitSummary) {
  return visit.expand?.restaurant?.name?.trim() || 'Unknown restaurant';
}

function getVisitRestaurantLocation(visit: VisitSummary) {
  return visit.expand?.restaurant?.location?.trim() || '';
}

function getFoodProductDisplayDate(product: FoodProductSummary) {
  return product.itemDate?.trim() || product.created;
}

function getFoodProductSubtitle(product: FoodProductSummary) {
  const locationText = product.locationText?.trim();
  const parts = [`Rating ${product.rating}`, formatDateTime(getFoodProductDisplayDate(product))];
  if (locationText) {
    parts.push(locationText);
  }

  return parts.join(' • ');
}

type RestaurantRepairSource = 'current' | 'cached' | 'google';

type RestaurantRepairMapEntry = UserRestaurantRecord & {
  repairSource: RestaurantRepairSource;
};

function isMappableRestaurant(restaurant: UserRestaurantRecord) {
  return typeof restaurant.latitude === 'number' && typeof restaurant.longitude === 'number';
}

function getRestaurantSourceLabel(source: RestaurantRepairSource) {
  switch (source) {
    case 'current':
      return 'current';
    case 'google':
      return 'Google';
    default:
      return 'cached';
  }
}

function createRestaurantMarkerIcon(source: RestaurantRepairSource, isSelected: boolean) {
  const classNames = [
    'restaurant-map-dot',
    `restaurant-map-dot-${source}`,
    isSelected ? 'restaurant-map-dot-selected' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return L.divIcon({
    className: 'restaurant-map-dot-wrapper',
    html: `<span class="${classNames}"></span>`,
    iconAnchor: [9, 9],
    iconSize: [18, 18],
    popupAnchor: [0, -10],
  });
}

function RestaurantRepairMap({
  currentRestaurantId,
  onSelectRestaurant,
  restaurants,
  selectedRestaurantId,
}: {
  currentRestaurantId: string;
  onSelectRestaurant: (restaurant: RestaurantRepairMapEntry) => void;
  restaurants: RestaurantRepairMapEntry[];
  selectedRestaurantId?: string;
}) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const mappableRestaurants = useMemo(
    () => restaurants.filter(isMappableRestaurant),
    [restaurants],
  );

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return;
    }

    const map = L.map(mapContainerRef.current, {
      attributionControl: true,
      zoomControl: true,
    }).setView([39.8283, -98.5795], 4);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    const markersLayer = L.layerGroup().addTo(map);
    mapRef.current = map;
    markersLayerRef.current = markersLayer;
    window.setTimeout(() => map.invalidateSize(), 0);

    return () => {
      map.remove();
      mapRef.current = null;
      markersLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const markersLayer = markersLayerRef.current;
    if (!map || !markersLayer) {
      return;
    }

    markersLayer.clearLayers();

    const bounds = L.latLngBounds([]);
    mappableRestaurants.forEach((restaurant) => {
      const lat = restaurant.latitude;
      const lng = restaurant.longitude;
      if (typeof lat !== 'number' || typeof lng !== 'number') {
        return;
      }

      const isCurrent = restaurant.id === currentRestaurantId;
      const isSelected = restaurant.id === selectedRestaurantId;
      const marker = L.marker([lat, lng], {
        icon: createRestaurantMarkerIcon(restaurant.repairSource, isSelected),
        keyboard: true,
        title: restaurant.name,
      });

      const popup = document.createElement('div');
      popup.className = 'restaurant-map-popup';
      const title = document.createElement('strong');
      title.textContent = restaurant.name;
      popup.append(title);

      const location = document.createElement('span');
      location.textContent = restaurant.location?.trim() || 'No address provided';
      popup.append(location);

      if (restaurant.placeId) {
        const placeId = document.createElement('span');
        placeId.className = 'text-muted';
        placeId.textContent = `Place id: ${restaurant.placeId}`;
        popup.append(placeId);
      }

      const source = document.createElement('span');
      source.className = 'tag';
      source.textContent = getRestaurantSourceLabel(restaurant.repairSource);
      popup.append(source);

      if (!isCurrent) {
        const selectButton = document.createElement('button');
        selectButton.className = 'button reverse restaurant-map-popup-button';
        selectButton.type = 'button';
        selectButton.textContent = isSelected ? 'Selected' : 'Select restaurant';
        selectButton.addEventListener('click', () => onSelectRestaurant(restaurant));
        popup.append(selectButton);
      }

      marker.bindPopup(popup);
      marker.on('click', () => {
        marker.openPopup();
      });
      marker.addTo(markersLayer);
      bounds.extend([lat, lng]);
    });

    if (bounds.isValid()) {
      map.fitBounds(bounds, {
        maxZoom: 15,
        padding: [28, 28],
      });
    }
  }, [currentRestaurantId, mappableRestaurants, onSelectRestaurant, selectedRestaurantId]);

  return (
    <div className="restaurant-repair-map-shell">
      <div className="restaurant-repair-map" ref={mapContainerRef} />
      {mappableRestaurants.length === 0 ? (
        <div className="restaurant-repair-map-empty">
          <strong>No mapped locations yet</strong>
          <span className="text-muted">Search results with coordinates will appear here.</span>
        </div>
      ) : null}
    </div>
  );
}

function getVisitRestaurantLatitude(visit: VisitSummary) {
  return visit.expand?.restaurant?.latitude;
}

function getVisitRestaurantLongitude(visit: VisitSummary) {
  return visit.expand?.restaurant?.longitude;
}

function isMappableVisit(visit: VisitSummary) {
  const latitude = getVisitRestaurantLatitude(visit);
  const longitude = getVisitRestaurantLongitude(visit);
  return typeof latitude === 'number' && typeof longitude === 'number';
}

function buildVisitCoordinateKey(visit: VisitSummary) {
  const latitude = getVisitRestaurantLatitude(visit);
  const longitude = getVisitRestaurantLongitude(visit);
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return '';
  }

  return `${latitude.toFixed(6)}:${longitude.toFixed(6)}`;
}

function UserVisitRepairMap({
  onReassignVisit,
  onSelectVisit,
  selectedVisitId,
  visits,
}: {
  onReassignVisit: (visit: VisitSummary) => void;
  onSelectVisit: (visit: VisitSummary) => void;
  selectedVisitId?: string;
  visits: VisitSummary[];
}) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const markerByVisitIdRef = useRef<Record<string, L.Marker>>({});
  const previousGroupKeysRef = useRef('');
  const visitGroups = useMemo(() => {
    const groupsByCoordinate = new Map<
      string,
      {
        latitude: number;
        longitude: number;
        visits: VisitSummary[];
      }
    >();

    for (const visit of visits) {
      const latitude = getVisitRestaurantLatitude(visit);
      const longitude = getVisitRestaurantLongitude(visit);
      if (typeof latitude !== 'number' || typeof longitude !== 'number') {
        continue;
      }

      const key = buildVisitCoordinateKey(visit);
      const existingGroup = groupsByCoordinate.get(key);
      if (existingGroup) {
        existingGroup.visits.push(visit);
      } else {
        groupsByCoordinate.set(key, {
          latitude,
          longitude,
          visits: [visit],
        });
      }
    }

    return Array.from(groupsByCoordinate.values());
  }, [visits]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return;
    }

    const map = L.map(mapContainerRef.current, {
      attributionControl: true,
      zoomControl: true,
    }).setView([39.8283, -98.5795], 4);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    const markersLayer = L.layerGroup().addTo(map);
    mapRef.current = map;
    markersLayerRef.current = markersLayer;
    window.setTimeout(() => map.invalidateSize(), 0);

    return () => {
      map.remove();
      mapRef.current = null;
      markersLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const markersLayer = markersLayerRef.current;
    if (!map || !markersLayer) {
      return;
    }

    markersLayer.clearLayers();
    markerByVisitIdRef.current = {};

    const bounds = L.latLngBounds([]);
    const groupKeys = visitGroups
      .map((group) => `${group.latitude.toFixed(6)}:${group.longitude.toFixed(6)}:${group.visits.map((visit) => visit.id).join(',')}`)
      .join('|');
    for (const group of visitGroups) {
      const selectedVisit = group.visits.find((visit) => visit.id === selectedVisitId);
      const primaryVisit = selectedVisit ?? group.visits[0];
      const marker = L.marker([group.latitude, group.longitude], {
        icon: createRestaurantMarkerIcon('cached', Boolean(selectedVisit)),
        keyboard: true,
        title: getVisitRestaurantName(primaryVisit),
      });

      const popup = document.createElement('div');
      popup.className = 'restaurant-map-popup visit-repair-map-popup';

      const title = document.createElement('strong');
      title.textContent = getVisitRestaurantName(primaryVisit);
      popup.append(title);

      const location = document.createElement('span');
      location.textContent = getVisitRestaurantLocation(primaryVisit) || 'No address provided';
      popup.append(location);

      for (const visit of group.visits.slice(0, 4)) {
        const visitWrap = document.createElement('div');
        visitWrap.className = 'visit-repair-popup-item';

        const visitDate = document.createElement('span');
        visitDate.textContent = formatDateTime(visit.visitDate ?? visit.created);
        visitWrap.append(visitDate);

        const visitId = document.createElement('span');
        visitId.className = 'text-muted';
        visitId.textContent = `Visit id: ${visit.id}`;
        visitWrap.append(visitId);

        const repairButton = document.createElement('button');
        repairButton.className = 'button reverse restaurant-map-popup-button';
        repairButton.type = 'button';
        repairButton.textContent = 'Reassign restaurant';
        repairButton.addEventListener('click', () => onReassignVisit(visit));
        visitWrap.append(repairButton);

        popup.append(visitWrap);
      }

      if (group.visits.length > 4) {
        const overflow = document.createElement('span');
        overflow.className = 'text-muted';
        overflow.textContent = `${group.visits.length - 4} more visit(s) at this location`;
        popup.append(overflow);
      }

      marker.bindPopup(popup);
      marker.on('click', () => {
        onSelectVisit(primaryVisit);
        marker.openPopup();
      });
      for (const visit of group.visits) {
        markerByVisitIdRef.current[visit.id] = marker;
      }
      marker.addTo(markersLayer);
      bounds.extend([group.latitude, group.longitude]);
    }

    if (bounds.isValid() && previousGroupKeysRef.current !== groupKeys) {
      map.fitBounds(bounds, {
        maxZoom: 15,
        padding: [28, 28],
      });
    }
    previousGroupKeysRef.current = groupKeys;
  }, [onReassignVisit, onSelectVisit, selectedVisitId, visitGroups]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedVisitId) {
      return;
    }

    const marker = markerByVisitIdRef.current[selectedVisitId];
    if (!marker) {
      return;
    }

    const target = marker.getLatLng();
    const targetZoom = Math.max(map.getZoom(), 15);
    map.flyTo(target, targetZoom, {
      duration: 0.45,
    });
    marker.openPopup();
  }, [selectedVisitId]);

  return (
    <div className="visit-repair-map-shell">
      <div className="visit-repair-map" ref={mapContainerRef} />
      {visitGroups.length === 0 ? (
        <div className="restaurant-repair-map-empty">
          <strong>No mapped visits yet</strong>
          <span className="text-muted">Mapped visit records will appear here.</span>
        </div>
      ) : null}
    </div>
  );
}

function ReassignVisitRestaurantModal({
  onClose,
  onReassigned,
  userId,
  visit,
}: {
  onClose: () => void;
  onReassigned: (result: ReassignVisitRestaurantResult) => void;
  userId: string;
  visit: VisitSummary;
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRestaurant, setSelectedRestaurant] = useState<UserRestaurantRecord | null>(null);
  const [googleRestaurants, setGoogleRestaurants] = useState<UserRestaurantRecord[]>([]);
  const [googleSearchError, setGoogleSearchError] = useState<string | null>(null);
  const [locationBias, setLocationBias] = useState(getVisitRestaurantLocation(visit));
  const [reason, setReason] = useState('');
  const trimmedSearchTerm = searchTerm.trim();
  const trimmedReason = reason.trim();
  const currentRestaurantId = visit.restaurant?.trim() || '';
  const currentRestaurant = visit.expand?.restaurant;
  const currentRestaurantEntry: RestaurantRepairMapEntry | null =
    currentRestaurantId && currentRestaurant
      ? {
          created: currentRestaurant.created ?? '',
          id: currentRestaurantId,
          isGooglePlace: currentRestaurant.isGooglePlace,
          latitude: currentRestaurant.latitude,
          location: currentRestaurant.location,
          longitude: currentRestaurant.longitude,
          name: currentRestaurant.name?.trim() || 'Current restaurant',
          placeId: currentRestaurant.placeId,
          repairSource: 'current',
          updated: currentRestaurant.updated ?? '',
          visibility: currentRestaurant.visibility,
        }
      : null;

  const restaurantsQuery = useQuery({
    enabled: trimmedSearchTerm.length > 0,
    queryKey: ['admin', 'restaurants', 'search', trimmedSearchTerm],
    queryFn: () => searchAdminRestaurants(trimmedSearchTerm),
  });

  const googleSearchMutation = useMutation({
    mutationFn: () =>
      searchAndCacheAdminGoogleRestaurants({
        latitude: currentRestaurant?.latitude,
        locationText: locationBias,
        longitude: currentRestaurant?.longitude,
        query: trimmedSearchTerm,
        radius: 5000,
      }),
    onError: (error) => {
      setGoogleSearchError(
        error instanceof Error ? error.message : 'Could not search Google Places.',
      );
    },
    onSuccess: (result) => {
      setGoogleSearchError(null);
      setGoogleRestaurants(result.items);
    },
  });

  const reassignMutation = useMutation({
    mutationFn: () =>
      reassignUserVisitRestaurant({
        reason: trimmedReason,
        restaurantId: selectedRestaurant?.id ?? '',
        userId,
        visitId: visit.id,
      }),
    onSuccess: (result) => {
      onReassigned(result);
    },
  });

  const localRestaurants = restaurantsQuery.data ?? [];
  const mapRestaurants = useMemo(() => {
    const merged = new Map<string, RestaurantRepairMapEntry>();
    if (currentRestaurantEntry) {
      merged.set(currentRestaurantEntry.id, currentRestaurantEntry);
    }

    for (const restaurant of localRestaurants) {
      merged.set(restaurant.id, {
        ...restaurant,
        repairSource: restaurant.id === currentRestaurantId ? 'current' : 'cached',
      });
    }

    for (const restaurant of googleRestaurants) {
      const existing = merged.get(restaurant.id);
      merged.set(restaurant.id, {
        ...restaurant,
        repairSource:
          restaurant.id === currentRestaurantId
            ? 'current'
            : existing?.repairSource === 'cached'
              ? 'cached'
              : 'google',
      });
    }

    return Array.from(merged.values());
  }, [currentRestaurantEntry, currentRestaurantId, googleRestaurants, localRestaurants]);

  const searchResults = mapRestaurants.filter((restaurant) => restaurant.id !== currentRestaurantId);
  const canSearchGoogle = trimmedSearchTerm.length > 0 && !googleSearchMutation.isPending;
  const canSubmit =
    Boolean(selectedRestaurant) &&
    selectedRestaurant?.id !== currentRestaurantId &&
    trimmedReason.length > 0 &&
    !reassignMutation.isPending;

  return (
    <div className="moderation-modal-backdrop" role="presentation">
      <form
        aria-label="Reassign visit restaurant"
        className="moderation-action-modal"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) {
            reassignMutation.mutate();
          }
        }}
      >
        <div className="summary-row">
          <div>
            <p className="eyebrow">Visit repair</p>
            <h3>Reassign restaurant</h3>
          </div>
          <button className="button ghost" onClick={onClose} type="button">
            Close
          </button>
        </div>

        <div className="state-panel">
          <strong>{getVisitRestaurantName(visit)}</strong>
          <span className="text-muted">Visit id: {visit.id}</span>
          {getVisitRestaurantLocation(visit) ? (
            <span className="text-muted">{getVisitRestaurantLocation(visit)}</span>
          ) : null}
          <span className="text-muted">
            {formatDateTime(visit.visitDate ?? visit.created)}
          </span>
        </div>

        <div className="field">
          <label htmlFor="restaurant-repair-search">Find existing restaurant</label>
          <input
            className="input"
            id="restaurant-repair-search"
            onChange={(event) => {
              setSearchTerm(event.target.value);
              setSelectedRestaurant(null);
              setGoogleRestaurants([]);
              setGoogleSearchError(null);
            }}
            placeholder="Search by name, location, or place id"
            type="search"
            value={searchTerm}
          />
        </div>

        <div className="field">
          <label htmlFor="restaurant-repair-location-bias">Search near</label>
          <input
            className="input"
            id="restaurant-repair-location-bias"
            onChange={(event) => setLocationBias(event.target.value)}
            placeholder="City, address, or neighborhood"
            type="text"
            value={locationBias}
          />
        </div>

        <div className="restaurant-repair-map-layout">
          <RestaurantRepairMap
            currentRestaurantId={currentRestaurantId}
            onSelectRestaurant={(restaurant) => {
              if (restaurant.id !== currentRestaurantId) {
                setSelectedRestaurant(restaurant);
              }
            }}
            restaurants={mapRestaurants}
            selectedRestaurantId={selectedRestaurant?.id}
          />

          <div className="restaurant-repair-results-panel">
            <div className="summary-row">
              <strong>Restaurant matches</strong>
              <button
                className="button reverse"
                disabled={!canSearchGoogle}
                onClick={() => googleSearchMutation.mutate()}
                type="button"
              >
                {googleSearchMutation.isPending ? 'Searching Google...' : 'Search Google Places'}
              </button>
            </div>

            {restaurantsQuery.isError ? (
              <div className="state-panel error">
                <strong>Could not search cached restaurants</strong>
                <span className="text-muted">
                  {restaurantsQuery.error instanceof Error
                    ? restaurantsQuery.error.message
                    : 'Try another search.'}
                </span>
              </div>
            ) : null}

            {googleSearchError ? (
              <div className="state-panel error">
                <strong>Could not search Google Places</strong>
                <span className="text-muted">{googleSearchError}</span>
              </div>
            ) : null}

            {trimmedSearchTerm && restaurantsQuery.isLoading ? (
              <div className="state-panel">
                <strong>Searching cached restaurants...</strong>
              </div>
            ) : null}

            {trimmedSearchTerm && !restaurantsQuery.isLoading && searchResults.length === 0 ? (
              <div className="state-panel">
                <span className="text-muted">No cached restaurants matched. Try Google Places.</span>
              </div>
            ) : null}

            {searchResults.length > 0 ? (
              <div className="inline-list restaurant-repair-results-list">
                {searchResults.map((restaurant) => {
                  const isSelected = selectedRestaurant?.id === restaurant.id;

                  return (
                    <button
                      className={`list-item restaurant-repair-result ${isSelected ? 'selected' : ''}`}
                      key={restaurant.id}
                      onClick={() => setSelectedRestaurant(restaurant)}
                      type="button"
                    >
                      <div className="summary-row">
                        <strong>{restaurant.name}</strong>
                        <div className="tag-row">
                          <span className="tag">{getRestaurantSourceLabel(restaurant.repairSource)}</span>
                          {restaurant.isGooglePlace ? <span className="tag">Google place</span> : null}
                          {restaurant.visibility ? <span className="tag">{restaurant.visibility}</span> : null}
                          {isMappableRestaurant(restaurant) ? <span className="tag">mapped</span> : null}
                        </div>
                      </div>
                      <span className="text-muted">{restaurant.location || 'No location provided'}</span>
                      {restaurant.placeId ? (
                        <span className="text-muted">Place id: {restaurant.placeId}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>

        <div className="field">
          <label htmlFor="restaurant-repair-reason">Repair reason</label>
          <textarea
            className="textarea"
            id="restaurant-repair-reason"
            onChange={(event) => setReason(event.target.value)}
            placeholder="Explain why this visit is being reassigned."
            value={reason}
          />
        </div>

        {reassignMutation.isError ? (
          <div className="state-panel error">
            <strong>Could not reassign visit</strong>
            <span className="text-muted">
              {reassignMutation.error instanceof Error
                ? reassignMutation.error.message
                : 'The repair could not be completed.'}
            </span>
          </div>
        ) : null}

        <div className="button-row access-actions">
          <button className="button ghost" onClick={onClose} type="button">
            Cancel
          </button>
          <button className="button primary" disabled={!canSubmit} type="submit">
            {reassignMutation.isPending ? 'Reassigning...' : 'Reassign restaurant'}
          </button>
        </div>
      </form>
    </div>
  );
}

function UserDetailTabPanel({
  activeTab,
  onSelectTab,
  profile,
  userId,
}: {
  activeTab: UserDetailTab;
  onSelectTab: (tab: UserDetailTab) => void;
  profile: UserModerationProfile;
  userId: string;
}) {
  const VISITS_PER_PAGE = 25;
  const VISITS_MAP_PER_PAGE = 50;
  const queryClient = useQueryClient();
  const [visitToRepair, setVisitToRepair] = useState<VisitSummary | null>(null);
  const [repairSuccessMessage, setRepairSuccessMessage] = useState<string | null>(null);
  const [visitSearchTerm, setVisitSearchTerm] = useState('');
  const [visitViewMode, setVisitViewMode] = useState<'list' | 'map'>('list');
  const [visitPage, setVisitPage] = useState(1);
  const [selectedMapVisitId, setSelectedMapVisitId] = useState<string | undefined>();
  const visitMapRowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const trimmedVisitSearchTerm = visitSearchTerm.trim();
  const visitPageSize = visitViewMode === 'map' ? VISITS_MAP_PER_PAGE : VISITS_PER_PAGE;
  const visitsQuery = useQuery({
    enabled: activeTab === 'visits',
    queryKey: [
      'admin',
      visitViewMode === 'map' ? 'user-visits-map' : 'user-visits',
      userId,
      trimmedVisitSearchTerm,
      visitPage,
    ],
    queryFn: () =>
      searchUserVisits({
        page: visitPage,
        perPage: visitPageSize,
        mappedOnly: visitViewMode === 'map',
        search: trimmedVisitSearchTerm,
        userId,
      }),
  });

  useEffect(() => {
    if (activeTab !== 'visits' || visitViewMode !== 'map' || !selectedMapVisitId) {
      return;
    }

    visitMapRowRefs.current[selectedMapVisitId]?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
    });
  }, [activeTab, selectedMapVisitId, visitViewMode]);

  const totalRecordCount =
    profile.recentFoodItems.length +
    profile.recentFoodProducts.length +
    profile.recentRestaurants.length +
    profile.recentMenuItems.length +
    profile.recentVisits.length +
    profile.recentNotes.length +
    profile.recentPhotos.length +
    profile.restaurantLists.length +
    profile.recentBills.length;

  const overviewCards: Array<{
    tab: Exclude<UserDetailTab, 'records' | 'feedback' | 'activity'>;
    label: string;
    count: number;
    hint: string;
  }> = [
    {
      tab: 'ratings',
      label: 'Ratings',
      count: profile.recentFoodItems.length,
      hint: profile.recentFoodItems[0]
        ? `Latest: ${profile.recentFoodItems[0].name} on ${formatDateTime(profile.recentFoodItems[0].created)}`
        : 'No ratings recorded yet.',
    },
    {
      tab: 'food-products',
      label: 'Food products',
      count: profile.recentFoodProducts.length,
      hint: profile.recentFoodProducts[0]
        ? `Latest: ${profile.recentFoodProducts[0].name} on ${formatDateTime(getFoodProductDisplayDate(profile.recentFoodProducts[0]))}`
        : 'No food products logged yet.',
    },
    {
      tab: 'restaurants',
      label: 'Restaurants',
      count: profile.recentRestaurants.length,
      hint: profile.recentRestaurants[0]
        ? `Latest: ${profile.recentRestaurants[0].name}`
        : 'No restaurants created yet.',
    },
    {
      tab: 'menu-items',
      label: 'Menu items',
      count: profile.recentMenuItems.length,
      hint: profile.recentMenuItems[0]
        ? `Latest: ${profile.recentMenuItems[0].name}`
        : 'No menu items created yet.',
    },
    {
      tab: 'visits',
      label: 'Visits',
      count: profile.recentVisits.length,
      hint: profile.recentVisits[0]
        ? `Latest: ${formatDateTime(profile.recentVisits[0].visitDate ?? profile.recentVisits[0].created)}`
        : 'No visits recorded yet.',
    },
    {
      tab: 'notes',
      label: 'Notes',
      count: profile.recentNotes.length,
      hint: profile.recentNotes[0]
        ? `Latest: ${formatDateTime(profile.recentNotes[0].created)}`
        : 'No notes recorded yet.',
    },
    {
      tab: 'photos',
      label: 'Photos',
      count: profile.recentPhotos.length,
      hint: profile.recentPhotos[0]
        ? `Latest: ${formatDateTime(profile.recentPhotos[0].created)}`
        : 'No photos uploaded yet.',
    },
    {
      tab: 'lists',
      label: 'Lists',
      count: profile.restaurantLists.length,
      hint: profile.restaurantLists[0]
        ? `Latest: ${profile.restaurantLists[0].name}`
        : 'No restaurant lists yet.',
    },
    {
      tab: 'bills',
      label: 'Bills',
      count: profile.recentBills.length,
      hint: profile.recentBills[0]
        ? `Latest: ${profile.recentBills[0].billName}`
        : 'No bills found for this user.',
    },
  ];

  if (activeTab === 'records') {
    return (
      <div className="tab-panel">
        <div className="tab-panel-heading">
          <h3>User-created records</h3>
          <span className="text-muted">
            {totalRecordCount} recent records across ratings, food products, restaurants, menu
            items, visits, notes, photos, lists, and bills.
          </span>
        </div>

        <div className="record-overview-grid">
          {overviewCards.map((card) => (
            <button
              className="record-overview-card"
              key={card.tab}
              onClick={() => onSelectTab(card.tab)}
              type="button"
            >
              <div className="summary-row">
                <strong>{card.label}</strong>
                <span className="tag">{card.count}</span>
              </div>
              <span className="text-muted">{card.hint}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (activeTab === 'feedback') {
    return (
      <div className="tab-panel">
        <div className="tab-panel-heading">
          <h3>Recent feedback</h3>
          <span className="text-muted">
            {profile.recentFeedback.length} recent feedback threads from this user.
          </span>
        </div>

        {profile.recentFeedback.length === 0 ? (
          <span className="text-muted">No feedback threads for this user.</span>
        ) : (
          <PaginatedCollection items={profile.recentFeedback} itemsPerPage={10}>
            {(pageThreads) => (
              <div className="inline-list">
                {pageThreads.map((thread) => (
                  <div className="list-item" key={thread.id}>
                    <div className="summary-row">
                      <strong>{thread.title}</strong>
                      <span className={`status-pill ${thread.status}`}>{thread.status}</span>
                    </div>
                    <span className="text-muted">{thread.description}</span>
                    <span className="text-muted">Updated {formatDateTime(thread.updated)}</span>
                  </div>
                ))}
              </div>
            )}
          </PaginatedCollection>
        )}
      </div>
    );
  }

  if (activeTab === 'activity') {
    return (
      <div className="tab-panel">
        <div className="tab-panel-heading">
          <h3>Activity feed</h3>
          <span className="text-muted">
            {profile.feedEntries.length} recent feed entries across visits and food products.
          </span>
        </div>

        {profile.feedEntries.length === 0 ? (
          <span className="text-muted">No recent feed activity for this user.</span>
        ) : (
          <PaginatedCollection items={profile.feedEntries} itemsPerPage={10}>
            {(pageEntries) => (
              <div className="inline-list">
                {pageEntries.map((entry) => (
                  <div className="list-item" key={`${entry.contentType}-${entry.id}`}>
                    <div className="summary-row">
                      <strong>{getActivityTitle(entry)}</strong>
                      <div className="tag-row">
                        <span className="tag">{entry.contentType}</span>
                        {entry.visibility ? <span className="tag">{entry.visibility}</span> : null}
                      </div>
                    </div>
                    <span className="text-muted">{getActivitySummary(entry)}</span>
                    {entry.locationText ? <span className="text-muted">{entry.locationText}</span> : null}
                    {entry.notes ? <span className="text-muted">{entry.notes}</span> : null}
                  </div>
                ))}
              </div>
            )}
          </PaginatedCollection>
        )}
      </div>
    );
  }

  if (activeTab === 'ratings') {
    return (
      <div className="tab-panel">
        <div className="tab-panel-heading">
          <h3>Ratings</h3>
          <span className="text-muted">
            {profile.recentFoodItems.length} recent ratings created by this user.
          </span>
        </div>

        {profile.recentFoodItems.length === 0 ? (
          <span className="text-muted">No ratings found for this user.</span>
        ) : (
          <PaginatedCollection items={profile.recentFoodItems} itemsPerPage={12}>
            {(pageItems) => (
              <div className="inline-list">
                {pageItems.map((item) => (
                  <div className="list-item" key={item.id}>
                    <strong>{item.name}</strong>
                    <span className="text-muted">
                      Rating {item.rating} • {formatDateTime(item.created)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </PaginatedCollection>
        )}
      </div>
    );
  }

  if (activeTab === 'food-products') {
    return (
      <div className="tab-panel">
        <div className="tab-panel-heading">
          <h3>Food products</h3>
          <span className="text-muted">
            {profile.recentFoodProducts.length} recent food products logged by this user.
          </span>
        </div>

        {profile.recentFoodProducts.length === 0 ? (
          <span className="text-muted">No recent food products found for this user.</span>
        ) : (
          <PaginatedCollection items={profile.recentFoodProducts} itemsPerPage={12}>
            {(pageProducts) => (
              <div className="inline-list">
                {pageProducts.map((product) => (
                  <div className="list-item" key={product.id}>
                    <div className="summary-row">
                      <strong>{product.name}</strong>
                      <div className="tag-row">
                        {product.visibility ? <span className="tag">{product.visibility}</span> : null}
                        {product.itemCategory?.trim() ? (
                          <span className="tag">{product.itemCategory}</span>
                        ) : null}
                      </div>
                    </div>
                    <span className="text-muted">{getFoodProductSubtitle(product)}</span>
                    <span className="text-muted">Food product id: {product.id}</span>
                    {product.notes?.trim() ? (
                      <span className="text-muted">{product.notes}</span>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </PaginatedCollection>
        )}
      </div>
    );
  }

  if (activeTab === 'restaurants') {
    return (
      <div className="tab-panel">
        <div className="tab-panel-heading">
          <h3>Restaurants</h3>
          <span className="text-muted">
            {profile.recentRestaurants.length} restaurants created by this user.
          </span>
        </div>

        {profile.recentRestaurants.length === 0 ? (
          <span className="text-muted">No restaurants created by this user.</span>
        ) : (
          <PaginatedCollection items={profile.recentRestaurants} itemsPerPage={12}>
            {(pageRestaurants) => (
              <div className="inline-list">
                {pageRestaurants.map((restaurant) => (
                  <div className="list-item" key={restaurant.id}>
                    <div className="summary-row">
                      <strong>{restaurant.name}</strong>
                      {restaurant.visibility ? <span className="tag">{restaurant.visibility}</span> : null}
                    </div>
                    <span className="text-muted">{restaurant.location || 'No location provided'}</span>
                    <span className="text-muted">Created {formatDateTime(restaurant.created)}</span>
                  </div>
                ))}
              </div>
            )}
          </PaginatedCollection>
        )}
      </div>
    );
  }

  if (activeTab === 'menu-items') {
    return (
      <div className="tab-panel">
        <div className="tab-panel-heading">
          <h3>Menu items</h3>
          <span className="text-muted">
            {profile.recentMenuItems.length} menu items created by this user.
          </span>
        </div>

        {profile.recentMenuItems.length === 0 ? (
          <span className="text-muted">No menu items created by this user.</span>
        ) : (
          <PaginatedCollection items={profile.recentMenuItems} itemsPerPage={12}>
            {(pageItems) => (
              <div className="inline-list">
                {pageItems.map((item) => (
                  <div className="list-item" key={item.id}>
                    <div className="summary-row">
                      <strong>{item.name}</strong>
                      {item.visibility ? <span className="tag">{item.visibility}</span> : null}
                    </div>
                    <span className="text-muted">
                      {item.restaurantName ?? 'Unknown restaurant'} • {formatDateTime(item.created)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </PaginatedCollection>
        )}
      </div>
    );
  }

  if (activeTab === 'visits') {
    const visitItems = visitsQuery.data?.items ?? [];
    const visitSummaryText = trimmedVisitSearchTerm
      ? `Search results for "${trimmedVisitSearchTerm}".`
      : visitViewMode === 'map'
        ? 'Showing mapped visits recorded by this user.'
        : 'Showing visits recorded by this user.';
    const visitEmptyText = trimmedVisitSearchTerm
      ? visitViewMode === 'map'
        ? 'No mapped visits matched that search.'
        : 'No visits matched that search.'
      : visitViewMode === 'map'
        ? 'No mapped visits found for this user.'
        : 'No visits found for this user.';
    const shouldShowVisitResults =
      !visitsQuery.isLoading && !visitsQuery.isError && visitItems.length > 0;

    return (
      <div className="tab-panel">
        <div className="tab-panel-heading">
          <h3>Visits</h3>
          <span className="text-muted">{visitSummaryText}</span>
        </div>

        <div className="segmented-control visit-view-toggle" aria-label="Visit view mode">
          <button
            className={`segmented-control-option ${visitViewMode === 'list' ? 'active' : ''}`}
            onClick={() => {
              setVisitViewMode('list');
              setVisitPage(1);
              setSelectedMapVisitId(undefined);
            }}
            type="button"
          >
            List
          </button>
          <button
            className={`segmented-control-option ${visitViewMode === 'map' ? 'active' : ''}`}
            onClick={() => {
              setVisitViewMode('map');
              setVisitPage(1);
              setSelectedMapVisitId(undefined);
            }}
            type="button"
          >
            Map
          </button>
        </div>

        <div className="field">
          <label htmlFor="admin-user-visits-search">Search visits</label>
          <input
            className="input"
            id="admin-user-visits-search"
            onChange={(event) => {
              setVisitSearchTerm(event.target.value);
              setVisitPage(1);
              setSelectedMapVisitId(undefined);
            }}
            placeholder="Search by restaurant, location, or place id"
            type="search"
            value={visitSearchTerm}
          />
        </div>

        {repairSuccessMessage ? (
          <div className="state-panel success">
            <strong>{repairSuccessMessage}</strong>
          </div>
        ) : null}

        {visitsQuery.isLoading ? (
          <div className="state-panel">
            <strong>Loading visits...</strong>
          </div>
        ) : null}

        {visitsQuery.isError ? (
          <div className="state-panel error">
            <strong>Could not load visits</strong>
            <span className="text-muted">
              {visitsQuery.error instanceof Error ? visitsQuery.error.message : 'Try again.'}
            </span>
            <button className="button reverse" onClick={() => void visitsQuery.refetch()} type="button">
              Retry
            </button>
          </div>
        ) : null}

        {!visitsQuery.isLoading && !visitsQuery.isError && visitItems.length === 0 ? (
          <span className="text-muted">{visitEmptyText}</span>
        ) : null}

        {shouldShowVisitResults ? (
          <>
            {visitsQuery.data ? (
              <PaginationControls
                currentPage={visitsQuery.data.page}
                endItem={
                  visitsQuery.data.totalItems === 0
                    ? 0
                    : Math.min(visitsQuery.data.page * visitsQuery.data.perPage, visitsQuery.data.totalItems)
                }
                position="top"
                setCurrentPage={setVisitPage}
                startItem={
                  visitsQuery.data.totalItems === 0
                    ? 0
                    : (visitsQuery.data.page - 1) * visitsQuery.data.perPage + 1
                }
                totalItems={visitsQuery.data.totalItems}
                totalPages={Math.max(1, visitsQuery.data.totalPages)}
              />
            ) : null}

            {visitViewMode === 'map' ? (
              <div className="visit-repair-map-layout">
                <UserVisitRepairMap
                  onReassignVisit={(visit) => {
                    setRepairSuccessMessage(null);
                    setVisitToRepair(visit);
                  }}
                  onSelectVisit={(visit) => setSelectedMapVisitId(visit.id)}
                  selectedVisitId={selectedMapVisitId}
                  visits={visitItems}
                />
                <div className="visit-repair-map-results">
                  {visitItems.map((visit) => {
                    const isSelected = selectedMapVisitId === visit.id;

                    return (
                      <div
                        className={`list-item restaurant-repair-result ${isSelected ? 'selected' : ''}`}
                        key={visit.id}
                        onClick={() => setSelectedMapVisitId(visit.id)}
                        ref={(element) => {
                          visitMapRowRefs.current[visit.id] = element;
                        }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setSelectedMapVisitId(visit.id);
                          }
                        }}
                      >
                        <div className="summary-row">
                          <strong>{getVisitRestaurantName(visit)}</strong>
                          {isMappableVisit(visit) ? <span className="tag">mapped</span> : null}
                        </div>
                        <span className="text-muted">Visit id: {visit.id}</span>
                        {getVisitRestaurantLocation(visit) ? (
                          <span className="text-muted">{getVisitRestaurantLocation(visit)}</span>
                        ) : null}
                        <span className="text-muted">{formatDateTime(visit.visitDate ?? visit.created)}</span>
                        <button
                          className="button reverse visit-repair-map-row-action"
                          onClick={(event) => {
                            event.stopPropagation();
                            setRepairSuccessMessage(null);
                            setVisitToRepair(visit);
                          }}
                          type="button"
                        >
                          Reassign restaurant
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="inline-list">
                {visitItems.map((visit) => (
                  <div className="list-item" key={visit.id}>
                    <div className="summary-row">
                      <strong>{getVisitRestaurantName(visit)}</strong>
                      <button
                        className="button reverse"
                        onClick={() => {
                          setRepairSuccessMessage(null);
                          setVisitToRepair(visit);
                        }}
                        type="button"
                      >
                        Reassign restaurant
                      </button>
                    </div>
                    <span className="text-muted">Visit id: {visit.id}</span>
                    {getVisitRestaurantLocation(visit) ? (
                      <span className="text-muted">{getVisitRestaurantLocation(visit)}</span>
                    ) : null}
                    <span className="text-muted">{formatDateTime(visit.visitDate ?? visit.created)}</span>
                  </div>
                ))}
              </div>
            )}

            {visitsQuery.data ? (
              <PaginationControls
                currentPage={visitsQuery.data.page}
                endItem={
                  visitsQuery.data.totalItems === 0
                    ? 0
                    : Math.min(visitsQuery.data.page * visitsQuery.data.perPage, visitsQuery.data.totalItems)
                }
                setCurrentPage={setVisitPage}
                startItem={
                  visitsQuery.data.totalItems === 0
                    ? 0
                    : (visitsQuery.data.page - 1) * visitsQuery.data.perPage + 1
                }
                totalItems={visitsQuery.data.totalItems}
                totalPages={Math.max(1, visitsQuery.data.totalPages)}
              />
            ) : null}
          </>
        ) : null}

        {visitToRepair ? (
          <ReassignVisitRestaurantModal
            onClose={() => setVisitToRepair(null)}
            onReassigned={(result) => {
              const repairedVisit = visitToRepair;
              setVisitToRepair(null);
              setRepairSuccessMessage(
                `Visit ${repairedVisit.id} was reassigned. Moved ${result.menuItemRepair.movedMenuItemIds.length} menu item(s), created ${result.menuItemRepair.createdMenuItemIds.length} menu item(s), deleted ${result.menuItemRepair.deletedDuplicateMenuItemIds.length} duplicate(s).`,
              );
              void queryClient.invalidateQueries({
                queryKey: ['admin', 'user-profile', userId],
              });
              void queryClient.invalidateQueries({
                predicate: (query) =>
                  Array.isArray(query.queryKey) &&
                  query.queryKey[0] === 'admin' &&
                  (query.queryKey[1] === 'user-visits' || query.queryKey[1] === 'user-visits-map') &&
                  query.queryKey[2] === userId,
              });
              void queryClient.invalidateQueries({
                queryKey: ['admin', 'restaurants'],
              });
            }}
            userId={userId}
            visit={visitToRepair}
          />
        ) : null}
      </div>
    );
  }

  if (activeTab === 'notes') {
    return (
      <div className="tab-panel">
        <div className="tab-panel-heading">
          <h3>Notes</h3>
          <span className="text-muted">
            {profile.recentNotes.length} recent notes created by this user.
          </span>
        </div>

        {profile.recentNotes.length === 0 ? (
          <span className="text-muted">No recent notes found for this user.</span>
        ) : (
          <PaginatedCollection items={profile.recentNotes} itemsPerPage={12}>
            {(pageNotes) => (
              <div className="inline-list">
                {pageNotes.map((note) => (
                  <div className="list-item" key={note.id}>
                    <strong>Note</strong>
                    <span className="text-muted">{note.content}</span>
                    <span className="text-muted">Created {formatDateTime(note.created)}</span>
                  </div>
                ))}
              </div>
            )}
          </PaginatedCollection>
        )}
      </div>
    );
  }

  if (activeTab === 'photos') {
    return (
      <div className="tab-panel">
        <div className="tab-panel-heading">
          <h3>Photos</h3>
          <span className="text-muted">
            {profile.recentPhotos.length} recent photos uploaded by this user.
          </span>
        </div>

        {profile.recentPhotos.length === 0 ? (
          <span className="text-muted">No recent photos found for this user.</span>
        ) : (
          <PaginatedCollection items={profile.recentPhotos} itemsPerPage={8}>
            {(pagePhotos) => (
              <div className="inline-list">
                {pagePhotos.map((photo) => {
                  const fileName = photo.photo?.trim();
                  const collectionName = photo.collectionName?.trim() || 'visit_photos';
                  const photoUrl = fileName
                    ? pb.files.getURL(
                        {
                          id: photo.id,
                          collectionName,
                        },
                        fileName,
                      )
                    : null;

                  return (
                    <div className="list-item" key={photo.id}>
                      {photoUrl ? <img alt="User upload" className="photo-thumb" src={photoUrl} /> : null}
                      {!photoUrl ? (
                        <span className="text-muted">Photo preview unavailable for this upload.</span>
                      ) : null}
                      <span className="text-muted">Uploaded {formatDateTime(photo.created)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </PaginatedCollection>
        )}
      </div>
    );
  }

  if (activeTab === 'lists') {
    return (
      <div className="tab-panel">
        <div className="tab-panel-heading">
          <h3>Lists</h3>
          <span className="text-muted">
            {profile.restaurantLists.length} restaurant lists created by this user.
          </span>
        </div>

        {profile.restaurantLists.length === 0 ? (
          <span className="text-muted">No restaurant lists found for this user.</span>
        ) : (
          <PaginatedCollection items={profile.restaurantLists} itemsPerPage={10}>
            {(pageLists) => (
              <div className="inline-list">
                {pageLists.map((list) => {
                  const activityDisplay = getCreatedUpdatedDisplay(list.created, list.updated, {
                    createdLabel: 'Created',
                  });

                  return (
                    <div className="list-item" key={list.id}>
                      <div className="summary-row">
                        <strong>{list.name}</strong>
                        <div className="tag-row">
                          <span className="tag">{list.visibility}</span>
                          {list.isDefault ? <span className="tag">default</span> : null}
                          {list.isCollaborative ? <span className="tag">collaborative</span> : null}
                        </div>
                      </div>
                      <span className="text-muted">{list.description || 'No description provided.'}</span>
                      <span className="text-muted">
                        {list.items.length} items • {activityDisplay.label} {activityDisplay.value}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </PaginatedCollection>
        )}
      </div>
    );
  }

  return (
    <div className="tab-panel">
      <div className="tab-panel-heading">
        <h3>Bills</h3>
        <span className="text-muted">{profile.recentBills.length} bills tied to this user.</span>
      </div>

      {profile.recentBills.length === 0 ? (
        <span className="text-muted">No bills found for this user.</span>
      ) : (
        <PaginatedCollection items={profile.recentBills} itemsPerPage={10}>
          {(pageBills) => (
            <div className="inline-list">
              {pageBills.map((bill) => (
                <div className="list-item" key={bill.id}>
                  <div className="summary-row">
                    <strong>{bill.billName}</strong>
                    <div className="tag-row">
                      <span className="tag">{bill.status}</span>
                      <span className="tag">{bill.splitMode}</span>
                      <span className="tag">{bill.isCreator ? 'creator' : 'participant'}</span>
                    </div>
                  </div>
                  <span className="text-muted">
                    {formatCurrency(bill.totalAmount)} total • {bill.participantCount} participants •{' '}
                    {bill.itemCount} items
                  </span>
                  {typeof bill.amountOwed === 'number' ? (
                    <span className="text-muted">
                      User owes {formatCurrency(bill.amountOwed)}
                      {bill.paidStatus ? ` • ${bill.paidStatus}` : ''}
                      {bill.paymentMethod ? ` via ${bill.paymentMethod}` : ''}
                    </span>
                  ) : null}
                  <span className="text-muted">Updated {formatDateTime(bill.updated)}</span>
                </div>
              ))}
            </div>
          )}
        </PaginatedCollection>
      )}
    </div>
  );
}

export function UserDetailPage() {
  const { userId = '' } = useParams();
  const [activeTab, setActiveTab] = useState<UserDetailTab>('records');

  const profileQuery = useQuery({
    enabled: Boolean(userId),
    queryKey: ['admin', 'user-profile', userId],
    queryFn: () => getUserModerationProfile(userId),
  });

  return (
    <>
      <section className="panel">
        <div className="summary-row">
          <div>
            <p className="eyebrow">User detail</p>
            <h2 style={{ marginBottom: 0 }}>
              {profileQuery.data?.user.email ?? 'Loading account...'}
            </h2>
          </div>
          <Link className="button ghost" to="/users">
            Back to users
          </Link>
        </div>
      </section>

      {profileQuery.isLoading ? (
        <section className="state-panel">
          <strong>Loading user profile...</strong>
        </section>
      ) : null}

      {profileQuery.isError ? (
        <section className="state-panel error">
          <strong>Could not load this user</strong>
          <span className="text-muted">The user may have been removed or the query failed.</span>
        </section>
      ) : null}

      {profileQuery.data ? (
        <>
          <section className="metric-grid">
            <div className="metric-card">
              <span className="text-muted">Recent visits</span>
              <div className="metric-value">{profileQuery.data.recentVisits.length}</div>
            </div>
            <div className="metric-card">
              <span className="text-muted">Ratings</span>
              <div className="metric-value">{profileQuery.data.recentFoodItems.length}</div>
            </div>
            <div className="metric-card">
              <span className="text-muted">Food products</span>
              <div className="metric-value">{profileQuery.data.recentFoodProducts.length}</div>
            </div>
            <div className="metric-card">
              <span className="text-muted">Recent notes</span>
              <div className="metric-value">{profileQuery.data.recentNotes.length}</div>
            </div>
            <div className="metric-card">
              <span className="text-muted">Recent photos</span>
              <div className="metric-value">{profileQuery.data.recentPhotos.length}</div>
            </div>
            <div className="metric-card">
              <span className="text-muted">Restaurants created</span>
              <div className="metric-value">{profileQuery.data.recentRestaurants.length}</div>
            </div>
            <div className="metric-card">
              <span className="text-muted">Menu items created</span>
              <div className="metric-value">{profileQuery.data.recentMenuItems.length}</div>
            </div>
            <div className="metric-card">
              <span className="text-muted">Lists</span>
              <div className="metric-value">{profileQuery.data.restaurantLists.length}</div>
            </div>
            <div className="metric-card">
              <span className="text-muted">Bills</span>
              <div className="metric-value">{profileQuery.data.recentBills.length}</div>
            </div>
          </section>

          <section className="detail-grid user-detail-grid">
            <article className="detail-card">
              <div>
                <p className="eyebrow">Activity explorer</p>
                <h3>Recent feedback and user-created records</h3>
              </div>

              <div aria-label="User detail tabs" className="tab-bar" role="tablist">
                {[
                  {
                    id: 'records',
                    label: 'User-created records',
                    count:
                      profileQuery.data.recentFoodItems.length +
                      profileQuery.data.recentFoodProducts.length +
                      profileQuery.data.recentRestaurants.length +
                      profileQuery.data.recentMenuItems.length +
                      profileQuery.data.recentVisits.length +
                      profileQuery.data.recentNotes.length +
                      profileQuery.data.recentPhotos.length +
                      profileQuery.data.restaurantLists.length +
                      profileQuery.data.recentBills.length,
                  },
                  {
                    id: 'feedback',
                    label: 'Recent feedback',
                    count: profileQuery.data.recentFeedback.length,
                  },
                  {
                    id: 'activity',
                    label: 'Activity feed',
                    count: profileQuery.data.feedEntries.length,
                  },
                  {
                    id: 'ratings',
                    label: 'Ratings',
                    count: profileQuery.data.recentFoodItems.length,
                  },
                  {
                    id: 'food-products',
                    label: 'Food products',
                    count: profileQuery.data.recentFoodProducts.length,
                  },
                  {
                    id: 'restaurants',
                    label: 'Restaurants',
                    count: profileQuery.data.recentRestaurants.length,
                  },
                  {
                    id: 'menu-items',
                    label: 'Menu items',
                    count: profileQuery.data.recentMenuItems.length,
                  },
                  {
                    id: 'visits',
                    label: 'Visits',
                    count: profileQuery.data.recentVisits.length,
                  },
                  {
                    id: 'notes',
                    label: 'Notes',
                    count: profileQuery.data.recentNotes.length,
                  },
                  {
                    id: 'photos',
                    label: 'Photos',
                    count: profileQuery.data.recentPhotos.length,
                  },
                  {
                    id: 'lists',
                    label: 'Lists',
                    count: profileQuery.data.restaurantLists.length,
                  },
                  {
                    id: 'bills',
                    label: 'Bills',
                    count: profileQuery.data.recentBills.length,
                  },
                ].map((tab) => (
                  <button
                    aria-selected={activeTab === tab.id}
                    className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as UserDetailTab)}
                    role="tab"
                    type="button"
                  >
                    {tab.label} ({tab.count})
                  </button>
                ))}
              </div>

              <div className="divider" />

              <UserDetailTabPanel
                activeTab={activeTab}
                onSelectTab={setActiveTab}
                profile={profileQuery.data}
                userId={userId}
              />
            </article>

            <aside className="detail-card user-detail-sidebar">
              <div>
                <p className="eyebrow">Account snapshot</p>
                <h3>Identity and support history</h3>
              </div>

              <div className="summary-list">
                <div className="summary-row">
                  <span className="text-muted">Email</span>
                  <strong>{profileQuery.data.user.email}</strong>
                </div>
                <div className="summary-row">
                  <span className="text-muted">Name</span>
                  <strong>{profileQuery.data.user.name?.trim() || 'No display name'}</strong>
                </div>
                <div className="summary-row">
                  <span className="text-muted">Joined</span>
                  <strong>{formatDateTime(profileQuery.data.user.created)}</strong>
                </div>
                <div className="summary-row">
                  <span className="text-muted">Access</span>
                  <div className="tag-row">
                    <span className="tag">
                      {profileQuery.data.user.isAdmin ? 'admin' : 'user'}
                    </span>
                    {profileQuery.data.user.isSubscriber ? (
                      <span className="tag">subscriber</span>
                    ) : null}
                    {profileQuery.data.user.isBetaUser ? <span className="tag">beta</span> : null}
                  </div>
                </div>
              </div>

              <div className="divider" />

              <div className="summary-list">
                <h3 style={{ marginBottom: 0 }}>Activity summary</h3>
                <div className="summary-row">
                  <span className="text-muted">Feedback threads</span>
                  <strong>{profileQuery.data.recentFeedback.length}</strong>
                </div>
                <div className="summary-row">
                  <span className="text-muted">Feed entries</span>
                  <strong>{profileQuery.data.feedEntries.length}</strong>
                </div>
                <div className="summary-row">
                  <span className="text-muted">Ratings</span>
                  <strong>{profileQuery.data.recentFoodItems.length}</strong>
                </div>
                <div className="summary-row">
                  <span className="text-muted">Food products</span>
                  <strong>{profileQuery.data.recentFoodProducts.length}</strong>
                </div>
                <div className="summary-row">
                  <span className="text-muted">Restaurants created</span>
                  <strong>{profileQuery.data.recentRestaurants.length}</strong>
                </div>
                <div className="summary-row">
                  <span className="text-muted">Menu items created</span>
                  <strong>{profileQuery.data.recentMenuItems.length}</strong>
                </div>
                <div className="summary-row">
                  <span className="text-muted">Visits</span>
                  <strong>{profileQuery.data.recentVisits.length}</strong>
                </div>
                <div className="summary-row">
                  <span className="text-muted">Notes</span>
                  <strong>{profileQuery.data.recentNotes.length}</strong>
                </div>
                <div className="summary-row">
                  <span className="text-muted">Photos</span>
                  <strong>{profileQuery.data.recentPhotos.length}</strong>
                </div>
                <div className="summary-row">
                  <span className="text-muted">Lists</span>
                  <strong>{profileQuery.data.restaurantLists.length}</strong>
                </div>
                <div className="summary-row">
                  <span className="text-muted">Bills</span>
                  <strong>{profileQuery.data.recentBills.length}</strong>
                </div>
              </div>
            </aside>
          </section>
        </>
      ) : null}
    </>
  );
}
