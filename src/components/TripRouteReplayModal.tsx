import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { 
  X, Play, Pause, RotateCcw, FastForward, Gauge, Clock, 
  MapPin, Truck, Fuel, Navigation, ShieldCheck, Compass,
  CheckCircle2, AlertCircle, ChevronRight, ChevronLeft
} from 'lucide-react';
import { Trip, TripBreadcrumbTrack, TripBreadcrumbPoint, TripTelemetryAnalysis } from '../types/fleet';
import { FleetBusinessEngine } from '../lib/enterprise/fleet_engine';

interface TripRouteReplayModalProps {
  isOpen: boolean;
  onClose: () => void;
  trip: Trip | null;
  companyId: string;
  isRtl?: boolean;
}

export default function TripRouteReplayModal({
  isOpen,
  onClose,
  trip,
  companyId,
  isRtl = true
}: TripRouteReplayModalProps) {
  if (!isOpen || !trip) return null;

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const polylineLayerRef = useRef<L.Polyline | null>(null);
  const vehicleMarkerRef = useRef<L.Marker | null>(null);
  const stopsLayerRef = useRef<L.LayerGroup | null>(null);

  const [track, setTrack] = useState<TripBreadcrumbTrack | null>(null);
  const [telemetry, setTelemetry] = useState<TripTelemetryAnalysis | null>(null);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playSpeed, setPlaySpeed] = useState<number>(1); // 1x, 2x, 5x, 10x
  const playTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Load track and telemetry
  useEffect(() => {
    if (trip && companyId) {
      const tr = FleetBusinessEngine.getTripTrack(companyId, trip.id);
      setTrack(tr);
      const tel = FleetBusinessEngine.analyzeTripTelemetry(companyId, trip.id);
      setTelemetry(tel);
      setCurrentIndex(0);
      setIsPlaying(false);
    }
  }, [trip, companyId]);

  const points: TripBreadcrumbPoint[] = track?.points || [];
  const currentPoint = points[currentIndex] || null;

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const defaultCenter: [number, number] = [24.7136, 46.6753];
      const map = L.map(mapContainerRef.current, {
        zoomControl: true,
        scrollWheelZoom: true,
      }).setView(defaultCenter, 12);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);

      stopsLayerRef.current = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;
    }

    const timer = setTimeout(() => {
      mapInstanceRef.current?.invalidateSize();
    }, 200);

    return () => {
      clearTimeout(timer);
    };
  }, []);

  // Render static elements: Stops and Route Polyline
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !stopsLayerRef.current) return;

    stopsLayerRef.current.clearLayers();
    if (polylineLayerRef.current) {
      map.removeLayer(polylineLayerRef.current);
      polylineLayerRef.current = null;
    }

    const boundsLatLngs: [number, number][] = [];

    // 1. Render route polyline
    if (points.length > 0) {
      const latlngs: [number, number][] = points.map(p => [p.lat, p.lng]);
      boundsLatLngs.push(...latlngs);

      polylineLayerRef.current = L.polyline(latlngs, {
        color: '#2563eb', // Blue-600
        weight: 4,
        opacity: 0.8,
        lineCap: 'round',
        lineJoin: 'round',
        dashArray: '2, 6'
      }).addTo(map);
    }

    // 2. Render stops
    (trip.stops || []).forEach(stop => {
      if (stop.location && typeof stop.location.lat === 'number' && typeof stop.location.lng === 'number') {
        boundsLatLngs.push([stop.location.lat, stop.location.lng]);

        const isStart = stop.sequence === 1;
        const isCompleted = stop.status === 'COMPLETED' || stop.status === 'ARRIVED';
        const isSkipped = stop.status === 'SKIPPED' || stop.status === 'REASSIGNED';

        const bgCol = isStart ? '#059669' : isCompleted ? '#2563eb' : isSkipped ? '#9333ea' : '#d97706';
        const label = isStart ? 'S' : `${stop.sequence}`;

        const stopIcon = L.divIcon({
          className: 'custom-stop-marker',
          html: `
            <div style="
              background-color: ${bgCol};
              color: white;
              width: 26px;
              height: 26px;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              font-weight: bold;
              font-size: 11px;
              border: 2px solid white;
              box-shadow: 0 2px 6px rgba(0,0,0,0.3);
            ">
              ${label}
            </div>
          `,
          iconSize: [26, 26],
          iconAnchor: [13, 13]
        });

        const stopMarker = L.marker([stop.location.lat, stop.location.lng], { icon: stopIcon });
        stopMarker.bindPopup(`
          <div style="font-family: sans-serif; text-align: ${isRtl ? 'right' : 'left'}; min-width: 160px;">
            <div style="font-weight: bold; color: #1e293b; font-size: 13px; margin-bottom: 2px;">
              ${isStart ? (isRtl ? 'نقطة الانطلاق' : 'Origin') : (stop.taskTitle || stop.location.label)}
            </div>
            <div style="font-size: 11px; color: #64748b; margin-bottom: 4px;">
              ${stop.location.label}
            </div>
            <div style="font-size: 10px; font-weight: 600; color: ${bgCol};">
              ${isRtl ? 'الحالة:' : 'Status:'} ${stop.status}
            </div>
            ${stop.arrivedAt ? `<div style="font-size: 9px; color: #94a3b8; margin-top: 2px;">${isRtl ? 'وقت الوصول:' : 'Arrived:'} ${new Date(stop.arrivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>` : ''}
          </div>
        `);

        stopsLayerRef.current?.addLayer(stopMarker);
      }
    });

    // Fit map bounds
    if (boundsLatLngs.length > 0) {
      try {
        const bounds = L.latLngBounds(boundsLatLngs);
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
      } catch (err) {
        console.warn('Map fitBounds notice:', err);
      }
    }
  }, [track, trip]);

  // Update animated vehicle marker position when currentIndex changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (!currentPoint) {
      if (vehicleMarkerRef.current) {
        map.removeLayer(vehicleMarkerRef.current);
        vehicleMarkerRef.current = null;
      }
      return;
    }

    const currentSpeedKmh = typeof currentPoint.speed === 'number' && !isNaN(currentPoint.speed)
      ? (currentPoint.speed > 10 ? currentPoint.speed : Math.round(currentPoint.speed * 3.6))
      : 0;

    const vehicleIcon = L.divIcon({
      className: 'custom-vehicle-replay-marker',
      html: `
        <div style="position: relative; display: flex; flex-direction: column; align-items: center;">
          <div style="
            background: linear-gradient(135deg, #2563eb, #1d4ed8);
            color: white;
            padding: 6px;
            border-radius: 50%;
            border: 2.5px solid white;
            box-shadow: 0 4px 12px rgba(37,99,235,0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            transform: rotate(${currentPoint.heading || 0}deg);
            transition: transform 0.2s ease;
          ">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="12 2 19 21 12 17 5 21 12 2"></polygon>
            </svg>
          </div>
          <div style="
            margin-top: 2px;
            background-color: rgba(15, 23, 42, 0.85);
            color: #38bdf8;
            font-size: 9px;
            font-weight: 800;
            padding: 1px 5px;
            border-radius: 4px;
            white-space: nowrap;
          ">
            ${currentSpeedKmh} كم/س
          </div>
        </div>
      `,
      iconSize: [40, 48],
      iconAnchor: [20, 24]
    });

    if (!vehicleMarkerRef.current) {
      vehicleMarkerRef.current = L.marker([currentPoint.lat, currentPoint.lng], { icon: vehicleIcon, zIndexOffset: 1000 }).addTo(map);
    } else {
      vehicleMarkerRef.current.setLatLng([currentPoint.lat, currentPoint.lng]);
      vehicleMarkerRef.current.setIcon(vehicleIcon);
    }
  }, [currentIndex, currentPoint]);

  // Playback timer ticker
  useEffect(() => {
    if (!isPlaying) {
      if (playTimerRef.current) {
        clearInterval(playTimerRef.current);
        playTimerRef.current = null;
      }
      return;
    }

    const intervalMs = Math.max(100, 1000 / playSpeed);
    playTimerRef.current = setInterval(() => {
      setCurrentIndex(prev => {
        if (prev >= points.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, intervalMs);

    return () => {
      if (playTimerRef.current) {
        clearInterval(playTimerRef.current);
        playTimerRef.current = null;
      }
    };
  }, [isPlaying, playSpeed, points.length]);

  const handlePlayToggle = () => {
    if (points.length === 0) return;
    if (currentIndex >= points.length - 1) {
      setCurrentIndex(0);
    }
    setIsPlaying(prev => !prev);
  };

  const handleRestart = () => {
    setIsPlaying(false);
    setCurrentIndex(0);
  };

  const handleStepForward = () => {
    setIsPlaying(false);
    if (currentIndex < points.length - 1) {
      setCurrentIndex(prev => prev + 1);
    }
  };

  const handleStepBack = () => {
    setIsPlaying(false);
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  };

  const currentSpeed = currentPoint && typeof currentPoint.speed === 'number' && !isNaN(currentPoint.speed)
    ? (currentPoint.speed > 10 ? currentPoint.speed : Math.round(currentPoint.speed * 3.6))
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/75 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-5xl h-[92vh] max-h-[850px] shadow-2xl flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-800/40">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-2xl">
              <Navigation className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold text-slate-800 dark:text-slate-100">
                  {isRtl ? 'إعادة تشغيل المسار وتتبع حركة المشوار' : 'Historical Route Replay & Telemetry'}
                </h2>
                <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  {trip.tripType || (isRtl ? 'مشوار' : 'Trip')}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                {isRtl 
                  ? `المركبة: ${trip.vehicle_id} | السائق: ${trip.driver_id} | التاريخ: ${new Date(trip.scheduledAt).toLocaleDateString()}` 
                  : `Vehicle: ${trip.vehicle_id} | Driver: ${trip.driver_id} | Date: ${new Date(trip.scheduledAt).toLocaleDateString()}`}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Telemetry Quick Bar */}
        {telemetry && (
          <div className="px-6 py-2.5 bg-slate-100/60 dark:bg-slate-800/60 border-b border-slate-200/80 dark:border-slate-800/80 grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <div>
                <span className="text-slate-400 block text-[10px]">{isRtl ? 'المسافة المقطوعة' : 'Distance'}</span>
                <span className="font-extrabold text-slate-700 dark:text-slate-200">{telemetry.totalDistanceKm} كم</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Gauge className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <div>
                <span className="text-slate-400 block text-[10px]">{isRtl ? 'السرعة القصوى / المتوسطة' : 'Max / Avg Speed'}</span>
                <span className="font-extrabold text-slate-700 dark:text-slate-200">{telemetry.maxSpeedKmh} / {telemetry.avgMovingSpeedKmh} كم/س</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <div>
                <span className="text-slate-400 block text-[10px]">{isRtl ? 'مدة الحركة / التوقف' : 'Moving / Idle'}</span>
                <span className="font-extrabold text-slate-700 dark:text-slate-200">{telemetry.movingDurationMinutes} د / {telemetry.idleDurationMinutes} د</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Fuel className="h-4 w-4 text-rose-600 dark:text-rose-400" />
              <div>
                <span className="text-slate-400 block text-[10px]">{isRtl ? 'تقدير الوقود' : 'Est. Fuel'}</span>
                <span className="font-extrabold text-slate-700 dark:text-slate-200">{telemetry.estimatedFuelLiters} لتر</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              <div>
                <span className="text-slate-400 block text-[10px]">{isRtl ? 'المحطات المنجزة' : 'Completed Stops'}</span>
                <span className="font-extrabold text-slate-700 dark:text-slate-200">{telemetry.completedStops} من {telemetry.totalStops}</span>
              </div>
            </div>
          </div>
        )}

        {/* Map View Canvas */}
        <div className="flex-1 relative w-full h-full min-h-[300px] bg-slate-100 dark:bg-slate-950">
          <div ref={mapContainerRef} className="absolute inset-0 z-0" />

          {/* Floating Current Telemetry Overlay */}
          {currentPoint && (
            <div className="absolute top-3 right-3 z-10 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-3.5 py-2.5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-lg text-xs space-y-1">
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-400 font-medium">{isRtl ? 'الوقت المسجل:' : 'Timestamp:'}</span>
                <span className="font-mono font-bold text-slate-700 dark:text-slate-200">
                  {new Date(currentPoint.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>

              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-400 font-medium">{isRtl ? 'السرعة الآن:' : 'Speed:'}</span>
                <span className="font-bold text-blue-600 dark:text-blue-400">
                  {currentSpeed} كم/س
                </span>
              </div>

              {typeof currentPoint.heading === 'number' && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-400 font-medium">{isRtl ? 'الاتجاه:' : 'Heading:'}</span>
                  <span className="font-mono text-slate-600 dark:text-slate-300">
                    {Math.round(currentPoint.heading)}°
                  </span>
                </div>
              )}
            </div>
          )}

          {points.length === 0 && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-6">
              <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 text-center max-w-sm shadow-xl space-y-2">
                <AlertCircle className="h-10 w-10 text-amber-500 mx-auto" />
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                  {isRtl ? 'لا توجد إحداثيات مسار مسجلة بعد' : 'No GPS trajectory recorded yet'}
                </h3>
                <p className="text-xs text-slate-500">
                  {isRtl 
                    ? 'يتم تسجيل نقاط التتبع تلقائياً أثناء تنفيذ المشوار من بوابة السائق.' 
                    : 'Breadcrumbs are recorded automatically as the driver executes the trip.'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Playback Controls & Timeline Scrubber */}
        <div className="p-4 sm:p-5 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
          
          {/* Progress slider */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-semibold text-slate-500">
              <span>{isRtl ? 'بداية المسار' : 'Start'}</span>
              <span>
                {points.length > 0 
                  ? `${currentIndex + 1} / ${points.length} (${Math.round(((currentIndex + 1) / points.length) * 100)}%)` 
                  : '0 / 0'}
              </span>
              <span>{isRtl ? 'نهاية المسار' : 'End'}</span>
            </div>

            <input
              type="range"
              min={0}
              max={Math.max(0, points.length - 1)}
              value={currentIndex}
              disabled={points.length === 0}
              onChange={(e) => {
                setIsPlaying(false);
                setCurrentIndex(Number(e.target.value));
              }}
              className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600 focus:outline-none"
            />
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* Restart */}
              <button
                type="button"
                onClick={handleRestart}
                disabled={points.length === 0}
                className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                title={isRtl ? 'إعادة من البداية' : 'Restart from beginning'}
              >
                <RotateCcw className="h-4 w-4" />
              </button>

              {/* Step Back */}
              <button
                type="button"
                onClick={handleStepBack}
                disabled={points.length === 0 || currentIndex === 0}
                className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                title={isRtl ? 'النقطة السابقة' : 'Step backward'}
              >
                {isRtl ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              </button>

              {/* Play / Pause */}
              <button
                type="button"
                onClick={handlePlayToggle}
                disabled={points.length === 0}
                className={`px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 shadow-sm transition-all ${
                  isPlaying
                    ? 'bg-amber-600 hover:bg-amber-700 text-white'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                } disabled:opacity-50`}
              >
                {isPlaying ? (
                  <>
                    <Pause className="h-4 w-4" />
                    <span>{isRtl ? 'إيقاف مؤقت' : 'Pause'}</span>
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    <span>{isRtl ? 'تشغيل المسار' : 'Play Route'}</span>
                  </>
                )}
              </button>

              {/* Step Forward */}
              <button
                type="button"
                onClick={handleStepForward}
                disabled={points.length === 0 || currentIndex >= points.length - 1}
                className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                title={isRtl ? 'النقطة التالية' : 'Step forward'}
              >
                {isRtl ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
            </div>

            {/* Playback speed presets */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
              {[1, 2, 5, 10].map(sp => (
                <button
                  key={sp}
                  type="button"
                  onClick={() => setPlaySpeed(sp)}
                  className={`px-2.5 py-1 text-[11px] font-extrabold rounded-lg transition-all ${
                    playSpeed === sp
                      ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  {sp}x
                </button>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
