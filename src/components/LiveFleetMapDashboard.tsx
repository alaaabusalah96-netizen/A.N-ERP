import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { 
  Navigation, Truck, RefreshCw, Radio, MapPin, Gauge, Clock, 
  Calendar, CheckCircle2, AlertCircle, ArrowUpRight, Compass,
  Layers, ShieldAlert, Sparkles, User, Map as MapIcon, ChevronRight, Play
} from 'lucide-react';
import { Trip, Vehicle, TripBreadcrumbTrack, TripBreadcrumbPoint } from '../types/fleet';
import { FleetBusinessEngine } from '../lib/enterprise/fleet_engine';
import TripRouteReplayModal from './TripRouteReplayModal';

interface LiveFleetMapDashboardProps {
  companyId: string;
  language: 'ar' | 'en';
  vehicles: Vehicle[];
  trips: Trip[];
  onRefreshData: () => void;
}

export default function LiveFleetMapDashboard({
  companyId,
  language,
  vehicles,
  trips,
  onRefreshData
}: LiveFleetMapDashboardProps) {
  const isRtl = language === 'ar';

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const polylineLayerRef = useRef<L.Polyline | null>(null);
  const stopsLayerRef = useRef<L.LayerGroup | null>(null);

  // Active in-progress trips (DISPATCHED or IN_PROGRESS)
  const activeTrips = trips.filter(t => t.status === 'DISPATCHED' || t.status === 'IN_PROGRESS');

  const [selectedTripId, setSelectedTripId] = useState<string | null>(() => {
    return activeTrips.length > 0 ? activeTrips[0].id : null;
  });
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState<TripBreadcrumbTrack | null>(null);
  const [showReplayModal, setShowReplayModal] = useState(false);

  // Auto-refresh interval (every 30 seconds matching tracking throttle)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      handleManualRefresh();
    }, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, companyId, selectedTripId]);

  // Keep selected trip synced if list changes
  useEffect(() => {
    if (activeTrips.length > 0) {
      if (!selectedTripId || !activeTrips.some(t => t.id === selectedTripId)) {
        setSelectedTripId(activeTrips[0].id);
      }
    } else {
      setSelectedTripId(null);
      setSelectedTrack(null);
    }
  }, [trips]);

  // Load track when selected trip changes
  useEffect(() => {
    if (selectedTripId) {
      const track = FleetBusinessEngine.getTripTrack(companyId, selectedTripId);
      setSelectedTrack(track);
    } else {
      setSelectedTrack(null);
    }
  }, [selectedTripId, companyId, lastRefreshedAt]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    onRefreshData();
    if (selectedTripId) {
      const track = FleetBusinessEngine.getTripTrack(companyId, selectedTripId);
      setSelectedTrack(track);
    }
    setLastRefreshedAt(new Date());
    setTimeout(() => setIsRefreshing(false), 500);
  };

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const defaultCenter: [number, number] = [30.0444, 31.2357]; // Cairo center as default regional coordinate (Egypt-based fleet)
      const map = L.map(mapContainerRef.current, {
        zoomControl: true,
        scrollWheelZoom: true,
      }).setView(defaultCenter, 7);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);

      markersLayerRef.current = L.layerGroup().addTo(map);
      stopsLayerRef.current = L.layerGroup().addTo(map);

      mapInstanceRef.current = map;
    }

    // Force size invalidation in case of hidden container rendering
    const timer = setTimeout(() => {
      mapInstanceRef.current?.invalidateSize();
    }, 200);

    return () => {
      clearTimeout(timer);
    };
  }, []);

  // Render Markers & Breadcrumbs Polyline onto Leaflet Map
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !markersLayerRef.current || !stopsLayerRef.current) return;

    markersLayerRef.current.clearLayers();
    stopsLayerRef.current.clearLayers();

    if (polylineLayerRef.current) {
      map.removeLayer(polylineLayerRef.current);
      polylineLayerRef.current = null;
    }

    const boundsLatLngs: [number, number][] = [];

    // 1. Render all active vehicles
    activeTrips.forEach(trip => {
      const vehicle = vehicles.find(v => v.id === trip.vehicle_id);
      const track = FleetBusinessEngine.getTripTrack(companyId, trip.id);
      
      // Determine latest known coordinate
      const latestCoord = track?.last_point 
        ? { lat: track.last_point.lat, lng: track.last_point.lng }
        : vehicle?.last_known_location
        ? { lat: vehicle.last_known_location.lat, lng: vehicle.last_known_location.lng }
        : trip.startLocation && typeof trip.startLocation.lat === 'number' && typeof trip.startLocation.lng === 'number'
        ? { lat: trip.startLocation.lat, lng: trip.startLocation.lng }
        : null;

      if (latestCoord && typeof latestCoord.lat === 'number' && typeof latestCoord.lng === 'number') {
        const isSelected = trip.id === selectedTripId;
        boundsLatLngs.push([latestCoord.lat, latestCoord.lng]);

        // Custom Vehicle Live Marker
        const vehicleDivHtml = `
          <div class="relative flex items-center justify-center">
            ${isSelected ? '<span class="absolute -inset-2 rounded-full bg-indigo-500/40 animate-ping"></span>' : ''}
            <div class="w-9 h-9 rounded-2xl flex items-center justify-center shadow-lg border-2 ${
              isSelected 
                ? 'bg-indigo-600 border-white text-white scale-110' 
                : 'bg-slate-900 border-indigo-400 text-indigo-200'
            } transition-all">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/>
                <path d="M15 18H9"/>
                <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/>
                <circle cx="17" cy="18" r="2"/>
                <circle cx="7" cy="18" r="2"/>
              </svg>
            </div>
            <div class="absolute -bottom-5 px-1.5 py-0.5 rounded-md bg-slate-950/90 text-white font-mono text-[9px] font-black whitespace-nowrap shadow-xs">
              ${vehicle?.plateNumber || vehicle?.code || trip.vehicle_id}
            </div>
          </div>
        `;

        const vehIcon = L.divIcon({
          className: 'live-vehicle-marker',
          html: vehicleDivHtml,
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        });

        const marker = L.marker([latestCoord.lat, latestCoord.lng], { icon: vehIcon });
        marker.on('click', () => {
          setSelectedTripId(trip.id);
        });

        marker.bindPopup(`
          <div style="font-family: sans-serif; min-width: 170px; direction: ${isRtl ? 'rtl' : 'ltr'}; text-align: ${isRtl ? 'right' : 'left'};">
            <div style="font-weight: 800; font-size: 13px; color: #1e1b4b; margin-bottom: 4px;">
              ${vehicle?.plateNumber || trip.vehicle_id}
            </div>
            <div style="font-size: 11px; color: #475569; margin-bottom: 2px;">
              <strong>${isRtl ? 'السائق:' : 'Driver:'}</strong> ${vehicle?.driverName || trip.driver_id}
            </div>
            <div style="font-size: 11px; color: #475569; margin-bottom: 4px;">
              <strong>${isRtl ? 'المهمة:' : 'Task:'}</strong> ${trip.tripType}
            </div>
            <div style="font-size: 10px; color: #6366f1; font-weight: bold;">
              ${isRtl ? 'حالة الحركة: في الطريق 🛰️' : 'Status: En Route 🛰️'}
            </div>
          </div>
        `);

        markersLayerRef.current.addLayer(marker);
      }
    });

    // 2. Render Polyline & Stops for Selected Trip
    if (selectedTripId) {
      const activeTrip = activeTrips.find(t => t.id === selectedTripId);
      if (activeTrip) {
        // Draw Stops markers
        activeTrip.stops.forEach((stop, sIdx) => {
          if (stop.location && typeof stop.location.lat === 'number' && typeof stop.location.lng === 'number') {
            boundsLatLngs.push([stop.location.lat, stop.location.lng]);

            const isCompleted = stop.status === 'COMPLETED';
            const isArrived = stop.status === 'ARRIVED';
            const isStart = sIdx === 0;

            const stopDivHtml = `
              <div class="flex items-center justify-center">
                <div class="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black text-white shadow-md border-2 border-white ${
                  isStart ? 'bg-emerald-600' : isCompleted ? 'bg-emerald-500' : isArrived ? 'bg-blue-600' : 'bg-slate-700'
                }">
                  ${isStart ? '★' : isCompleted ? '✓' : stop.sequence}
                </div>
              </div>
            `;

            const stopIcon = L.divIcon({
              className: 'live-stop-marker',
              html: stopDivHtml,
              iconSize: [24, 24],
              iconAnchor: [12, 12]
            });

            const stopMarker = L.marker([stop.location.lat, stop.location.lng], { icon: stopIcon });
            stopMarker.bindPopup(`
              <div style="font-family: sans-serif; min-width: 140px; direction: ${isRtl ? 'rtl' : 'ltr'}; text-align: ${isRtl ? 'right' : 'left'};">
                <div style="font-weight: 800; font-size: 12px; color: #0f172a;">
                  ${stop.taskTitle || stop.location.label || (isStart ? 'نقطة الانطلاق' : `المحطة ${stop.sequence}`)}
                </div>
                <div style="font-size: 10px; color: #64748b; margin-top: 2px;">
                  ${isRtl ? 'الحالة:' : 'Status:'} ${stop.status}
                </div>
              </div>
            `);
            stopsLayerRef.current.addLayer(stopMarker);
          }
        });

        // Draw breadcrumbs polyline if track points exist
        if (selectedTrack && selectedTrack.points && selectedTrack.points.length > 0) {
          const polylineCoords: [number, number][] = selectedTrack.points.map(p => [p.lat, p.lng]);
          polylineCoords.forEach(c => boundsLatLngs.push(c));

          polylineLayerRef.current = L.polyline(polylineCoords, {
            color: '#4f46e5',
            weight: 5,
            opacity: 0.85,
            smoothFactor: 1,
            dashArray: '8, 8',
            lineJoin: 'round'
          }).addTo(map);
        }
      }
    }

    // Fit map bounds if there are coordinates
    if (boundsLatLngs.length > 0) {
      try {
        const bounds = L.latLngBounds(boundsLatLngs.map(([lat, lng]) => L.latLng(lat, lng)));
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
      } catch (err) {
        console.warn('Map bounds fit warning:', err);
      }
    }
  }, [activeTrips, selectedTripId, selectedTrack, vehicles, isRtl]);

  const selectedTrip = activeTrips.find(t => t.id === selectedTripId);
  const selectedVehicle = selectedTrip ? vehicles.find(v => v.id === selectedTrip.vehicle_id) : null;

  return (
    <div className="space-y-4">
      {/* Top Header Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-600 text-white rounded-2xl shadow-md">
            <Radio className="h-6 w-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                {isRtl ? 'خريطة التتبع اللحظي ومسارات الأسطول' : 'Live Fleet Tracking & Breadcrumbs Map'}
              </h2>
              <span className="px-2.5 py-0.5 text-xs font-black rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                {activeTrips.length} {isRtl ? 'مركبات في مهمة ميدانية' : 'Active Dispatched'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {isRtl 
                ? 'تتبع لحظي دقيق ومباشر لخط سير المركبات أثناء المشاوير الميدانية النشطة (تحديث تلقائي كل 30 ثانية)' 
                : 'Near real-time live GPS breadcrumbs for active field trips (auto-refreshed every 30s)'}
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            type="button"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-2 text-xs font-bold rounded-xl border flex items-center gap-1.5 transition-all ${
              autoRefresh 
                ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800' 
                : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-emerald-500 animate-ping' : 'bg-slate-400'}`}></span>
            <span>{isRtl ? (autoRefresh ? 'التحديث التلقائي: مفعّل' : 'التحديث التلقائي: معطل') : (autoRefresh ? 'Auto Refresh: ON' : 'Auto Refresh: OFF')}</span>
          </button>

          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="px-3.5 py-2 text-xs font-black bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/70 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-xl flex items-center gap-1.5 transition-all shadow-xs disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRtl ? 'تحديث الآن' : 'Refresh Now'}</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Left/Right Sidebar + Map */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Active Vehicles & Trips List */}
        <div className="lg:col-span-4 space-y-3">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <Truck className="h-4 w-4 text-indigo-600" />
                <span>{isRtl ? 'المركبات في المشاوير الميدانية' : 'Vehicles in Active Trips'}</span>
              </h3>
              <span className="text-[10px] font-mono text-slate-400">
                {isRtl ? 'آخر تحديث:' : 'Updated:'} {lastRefreshedAt.toLocaleTimeString(isRtl ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>

            {activeTrips.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <CheckCircle2 className="h-10 w-10 text-slate-400 mx-auto" />
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isRtl ? 'لا توجد مشاوير نشطة على الطريق حالياً' : 'No active trips en route right now'}
                </p>
                <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                  {isRtl 
                    ? 'عندما يبدأ السائق الرحلة الميدانية من بوابة السائق، ستظهر المركبة ومسارها المباشر تلقائياً هنا.' 
                    : 'When a driver starts a field trip, the vehicle and live breadcrumb track will appear here automatically.'}
                </p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[520px] overflow-y-auto pr-1">
                {activeTrips.map(trip => {
                  const veh = vehicles.find(v => v.id === trip.vehicle_id);
                  const isSelected = trip.id === selectedTripId;
                  const track = FleetBusinessEngine.getTripTrack(companyId, trip.id);
                  const pointsCount = track?.points?.length || 0;
                  const distanceKm = track?.total_distance_km || 0;

                  return (
                    <div
                      key={trip.id}
                      onClick={() => setSelectedTripId(trip.id)}
                      className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-indigo-50/90 dark:bg-indigo-950/60 border-indigo-500 shadow-md scale-[1.01]'
                          : 'bg-slate-50 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className={`p-2 rounded-xl text-white ${isSelected ? 'bg-indigo-600' : 'bg-slate-800'}`}>
                            <Truck className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-black text-slate-900 dark:text-white">
                                {veh?.plateNumber || trip.vehicle_id}
                              </span>
                              <span className="font-mono text-[10px] text-slate-400">
                                {veh?.code}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                              {trip.tripType}
                            </p>
                          </div>
                        </div>

                        <span className="px-2 py-0.5 text-[10px] font-black rounded-lg bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 animate-pulse">
                          {isRtl ? 'في الطريق' : 'Live'}
                        </span>
                      </div>

                      {/* Details row */}
                      <div className="mt-3 pt-2.5 border-t border-slate-200/60 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400">
                        <div className="flex items-center gap-1">
                          <User className="h-3.5 w-3.5 text-indigo-500" />
                          <span>{veh?.driverName || trip.driver_id}</span>
                        </div>
                        <div className="flex items-center gap-2 font-mono text-[10px]">
                          <span>{pointsCount} {isRtl ? 'نقطة تتبع' : 'pts'}</span>
                          <span>•</span>
                          <span className="font-bold text-indigo-600 dark:text-indigo-400">{distanceKm} {isRtl ? 'كم' : 'km'}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Selected Vehicle & Track Summary Card */}
          {selectedTrip && (
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 sm:p-5 border border-indigo-200 dark:border-indigo-900/60 shadow-md space-y-3 bg-linear-to-b from-indigo-50/40 via-white to-white dark:from-indigo-950/20 dark:via-slate-900 dark:to-slate-900">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-indigo-600" />
                  <span>{isRtl ? 'بيانات المسار المباشر (Breadcrumbs)' : 'Selected Route Telemetry'}</span>
                </h4>
                <span className="text-[10px] font-mono text-indigo-600 dark:text-indigo-400 font-bold bg-indigo-100 dark:bg-indigo-900/60 px-2 py-0.5 rounded-lg">
                  #{selectedTrip.id.slice(-6)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800">
                  <span className="text-[10px] text-slate-400 block">{isRtl ? 'المسافة المقطوعة' : 'Distance Traveled'}</span>
                  <span className="text-sm font-black text-indigo-600 dark:text-indigo-400 font-mono">
                    {selectedTrack?.total_distance_km || 0} {isRtl ? 'كم' : 'km'}
                  </span>
                </div>
                <div className="p-2.5 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800">
                  <span className="text-[10px] text-slate-400 block">{isRtl ? 'نقاط التتبع المسجلة' : 'Logged Breadcrumbs'}</span>
                  <span className="text-sm font-black text-slate-800 dark:text-slate-200 font-mono">
                    {selectedTrack?.points?.length || 0} {isRtl ? 'نقطة' : 'pts'}
                  </span>
                </div>
              </div>

              {selectedTrack?.last_point && (
                <div className="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-950 text-[11px] space-y-1 border border-slate-200/60 dark:border-slate-800">
                  <div className="flex items-center justify-between text-slate-500">
                    <span>{isRtl ? 'آخر إحداثيات مستلمة:' : 'Latest GPS Ping:'}</span>
                    <span className="font-mono text-[10px]">
                      {new Date(selectedTrack.last_point.timestamp).toLocaleTimeString(isRtl ? 'ar-EG' : 'en-US')}
                    </span>
                  </div>
                  <div className="font-mono text-[10px] text-slate-700 dark:text-slate-300 truncate">
                    Lat: {selectedTrack.last_point.lat.toFixed(5)}, Lng: {selectedTrack.last_point.lng.toFixed(5)}
                    {selectedTrack.last_point.accuracy && ` (±${Math.round(selectedTrack.last_point.accuracy)}m)`}
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => setShowReplayModal(true)}
                className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 shadow-xs transition-colors"
              >
                <Play className="h-4 w-4" />
                <span>{isRtl ? 'إعادة تشغيل مسار المشوار وتتبع السرعة' : 'Replay Route & Telemetry'}</span>
              </button>
            </div>
          )}
        </div>

        {/* Leaflet Map Interactive Container */}
        <div className="lg:col-span-8">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-3 border border-slate-200 dark:border-slate-800 shadow-md flex flex-col h-[560px] relative overflow-hidden">
            <div 
              ref={mapContainerRef} 
              className="w-full h-full rounded-2xl z-10"
              style={{ minHeight: '520px' }}
            />

            {/* Map Legend Overlay */}
            <div className="absolute bottom-6 left-6 rtl:left-auto rtl:right-6 z-20 bg-slate-900/90 backdrop-blur-md text-white p-3 rounded-2xl border border-white/10 shadow-xl text-xs space-y-2 max-w-xs">
              <div className="font-black text-[11px] text-indigo-300 border-b border-white/10 pb-1 flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5" />
                <span>{isRtl ? 'دليل الخريطة اللحظية' : 'Map Legend'}</span>
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                <div className="w-3.5 h-3.5 rounded-full bg-indigo-600 border border-white shrink-0"></div>
                <span>{isRtl ? 'مركبة نشطة في المشوار (Live)' : 'Active Trip Vehicle'}</span>
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                <div className="w-3 h-3 rounded-full bg-emerald-600 shrink-0"></div>
                <span>{isRtl ? 'نقطة البداية / محطة مكتملة' : 'Start / Completed Stop'}</span>
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                <div className="w-5 h-0.5 bg-indigo-500 border-t-2 border-dashed border-indigo-400 shrink-0"></div>
                <span>{isRtl ? 'مسار المشوار المسجل (Breadcrumbs)' : 'Logged Breadcrumb Polyline'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Route Replay Modal */}
      {selectedTrip && (
        <TripRouteReplayModal
          isOpen={showReplayModal}
          onClose={() => setShowReplayModal(false)}
          trip={selectedTrip}
          companyId={companyId}
          isRtl={isRtl}
        />
      )}
    </div>
  );
}
