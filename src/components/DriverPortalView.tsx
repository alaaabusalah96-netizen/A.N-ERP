import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Play, MapPin, CheckCircle2, Navigation, MessageSquare, 
  Truck, User, Calendar, Clock, AlertCircle, Sparkles, Loader2, Map,
  Radio, Wifi, ShieldAlert, ClipboardCheck
} from 'lucide-react';
import { Trip, TripStop, Vehicle } from '../types/fleet';
import { UserPermissions } from '../types';
import { FleetBusinessEngine } from '../lib/enterprise/fleet_engine';
import { StorageEngine } from '../db/storage';
import LeafletMapPickerModal from './LeafletMapPickerModal';
import VehicleInspectionModal from './VehicleInspectionModal';

interface DriverPortalViewProps {
  trips: Trip[];
  companyId: string;
  activeUser: {
    id: string;
    full_name?: string;
    role?: string;
    permissions?: UserPermissions;
  };
  isRtl: boolean;
  onRefresh: () => void;
  onOpenChat: (trip: Trip) => void;
  showToast: (type: 'success' | 'error' | 'info', message: string) => void;
}

export default function DriverPortalView({
  trips,
  companyId,
  activeUser,
  isRtl,
  onRefresh,
  onOpenChat,
  showToast
}: DriverPortalViewProps) {
  const hasAccess = Boolean(
    activeUser?.permissions?.execute_trip_tasks ||
    activeUser?.permissions?.manage_fleet ||
    activeUser?.role === 'SystemAdmin'
  );

  if (!hasAccess) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-12 border border-slate-200/80 dark:border-slate-800/80 text-center space-y-3">
        <AlertCircle className="h-12 w-12 text-rose-500 mx-auto" />
        <h3 className="text-base font-extrabold text-slate-800 dark:text-slate-100">
          {isRtl ? 'غير مصرح لك بالوصول لهذه البوابة' : 'Access Denied: You are not authorized to access this portal'}
        </h3>
        <p className="text-xs text-slate-500 max-w-md mx-auto">
          {isRtl 
            ? 'يتطلب الوصول لهذه البوابة تفعيل صلاحية تنفيذ مهام السائق الميدانية أو إدارة الأسطول.' 
            : 'Access requires field trip tasks execution or fleet management permissions.'}
        </p>
      </div>
    );
  }

  const [gpsLoadingId, setGpsLoadingId] = useState<string | null>(null);
  const [selectedTripForInspection, setSelectedTripForInspection] = useState<Trip | null>(null);
  const [mapPickerAction, setMapPickerAction] = useState<{
    type: 'START' | 'STOP' | 'COMPLETE';
    trip: Trip;
    stop?: TripStop;
    initialLat?: number;
    initialLng?: number;
    label?: string;
  } | null>(null);

  // Live GPS Tracking State & Refs
  const [isLiveTracking, setIsLiveTracking] = useState(false);
  const [lastLivePingTime, setLastLivePingTime] = useState<Date | null>(null);
  const [liveTrackingNotice, setLiveTrackingNotice] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastRecordedTimeRef = useRef<number>(0);

  // Strict matching only: t.driver_id === activeUser.id
  const driverName = activeUser.full_name || '';
  const displayTrips = trips.filter(t => t.driver_id === activeUser.id);

  // Active in-progress trip that qualifies for live near-realtime tracking
  const activeDispatchedTrip = displayTrips.find(t => t.status === 'DISPATCHED' || t.status === 'IN_PROGRESS');

  // Live Trip Tracking Hook (Runs strictly during active trips, cleans up on complete, breakdown, unmount, background)
  useEffect(() => {
    // If no active in-progress trip, ensure any existing watch is immediately cleared
    if (!activeDispatchedTrip) {
      if (watchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setIsLiveTracking(false);
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation || !navigator.geolocation.watchPosition) {
      console.warn('Geolocation watchPosition is not supported on this browser/device.');
      return;
    }

    const currentTripId = activeDispatchedTrip.id;
    const currentVehicleId = activeDispatchedTrip.vehicle_id;

    setIsLiveTracking(true);
    setLiveTrackingNotice(null);

    const onPositionSuccess = (pos: GeolocationPosition) => {
      const now = Date.now();
      // Throttle: 30 seconds minimum between recorded breadcrumb points
      if (now - lastRecordedTimeRef.current < 30000) {
        return;
      }

      FleetBusinessEngine.recordTripBreadcrumbPoint(
        companyId,
        currentTripId,
        currentVehicleId,
        activeUser.id,
        {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          speed: pos.coords.speed,
          heading: pos.coords.heading,
          timestamp: new Date().toISOString()
        },
        30
      ).then(async res => {
        if (res.recorded) {
          lastRecordedTimeRef.current = now;
          setLastLivePingTime(new Date());
          setLiveTrackingNotice(null);

          // Phase 3: Auto Geofence arrival check
          try {
            const arrivalRes = await FleetBusinessEngine.autoProcessTripArrivals(
              companyId,
              currentTripId,
              activeUser.id,
              {
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
                timestamp: new Date().toISOString()
              },
              200 // 200m geofence radius
            );
            if (arrivalRes.newlyArrivedStops.length > 0) {
              const stopTitle = arrivalRes.newlyArrivedStops[0].taskTitle || arrivalRes.newlyArrivedStops[0].location.label || 'المحطة';
              showToast('info', isRtl ? `تم تسجيل الوصول التلقائي إلى: ${stopTitle}` : `Auto-arrived at: ${stopTitle}`);
              onRefresh();
            }
          } catch (err) {
            console.warn('Geofence auto arrival check notice:', err);
          }
        }
      }).catch(err => {
        console.warn('Live tracking breadcrumb record error:', err);
      });
    };

    const onPositionError = (err: GeolocationPositionError) => {
      console.warn('Live GPS watch signal notice (non-fatal):', err.message);
      if (err.code === err.PERMISSION_DENIED) {
        setLiveTrackingNotice(isRtl ? 'تم رفض إذن GPS للتتبع المباشر' : 'GPS permission denied for live tracking');
      } else if (err.code === err.POSITION_UNAVAILABLE) {
        setLiveTrackingNotice(isRtl ? 'إشارة GPS ضعيفة مؤقتاً - جاري المحاولة' : 'GPS signal weak, retrying');
      }
    };

    // Avoid duplicate watchers
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    const watchId = navigator.geolocation.watchPosition(
      onPositionSuccess,
      onPositionError,
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 5000
      }
    );
    watchIdRef.current = watchId;

    // Handle tab backgrounding and unloads to conserve battery and avoid orphaned watches
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        if (watchIdRef.current !== null && navigator.geolocation) {
          navigator.geolocation.clearWatch(watchIdRef.current);
          watchIdRef.current = null;
        }
      } else if (document.visibilityState === 'visible') {
        if (watchIdRef.current === null && navigator.geolocation) {
          const newWatchId = navigator.geolocation.watchPosition(
            onPositionSuccess,
            onPositionError,
            { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 }
          );
          watchIdRef.current = newWatchId;
        }
      }
    };

    const handleBeforeUnload = () => {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleBeforeUnload);

    return () => {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleBeforeUnload);
      setIsLiveTracking(false);
    };
  }, [activeDispatchedTrip?.id, activeDispatchedTrip?.status, companyId, activeUser.id, isRtl]);

  // Geolocation helper for explicit user actions - No silent fallback, throws clear error on failure
  const captureGpsPosition = (): Promise<{ lat: number; lng: number; accuracy?: number }> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error(isRtl ? 'تعذر تحديد الموقع، لا يمكن تسجيل هذا الإجراء بدون تفعيل GPS' : 'Unable to determine location, this action cannot be recorded without GPS'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy
          });
        },
        (err) => {
          console.warn('GPS location access denied or unavailable:', err);
          reject(new Error(isRtl ? 'تعذر تحديد الموقع، لا يمكن تسجيل هذا الإجراء بدون تفعيل GPS' : 'Unable to determine location, this action cannot be recorded without GPS'));
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  };

  const handleStartTrip = async (trip: Trip) => {
    try {
      setGpsLoadingId(`start-${trip.id}`);
      const coords = await captureGpsPosition();
      await FleetBusinessEngine.startTrip(companyId, activeUser.id, trip.id, {
        lat: coords.lat,
        lng: coords.lng,
        accuracy: coords.accuracy,
        label: isRtl ? 'موقع بداية الرحلة الميداني' : 'Field Trip Start Location'
      });
      showToast('success', isRtl ? 'تم بدء الرحلة وتسجيل موقع الانطلاق عبر GPS' : 'Trip started with GPS point');
      onRefresh();
    } catch (err: any) {
      console.error(err);
      showToast('error', err.message || (isRtl ? 'تعذر تحديد الموقع، لا يمكن تسجيل هذا الإجراء بدون تفعيل GPS' : 'Unable to determine location, this action cannot be recorded without GPS'));
    } finally {
      setGpsLoadingId(null);
    }
  };

  const handleRecordArrival = async (trip: Trip, stop: TripStop) => {
    try {
      setGpsLoadingId(`stop-${stop.id}`);
      const coords = await captureGpsPosition();
      await FleetBusinessEngine.recordStopArrival(companyId, activeUser.id, trip.id, stop.id, {
        lat: coords.lat,
        lng: coords.lng,
        accuracy: coords.accuracy,
        label: stop.location.label || stop.taskTitle || 'نقطة الوصول'
      });
      showToast('success', isRtl ? `تم تسجيل الوصول وتأكيد إحداثيات المهمة: ${stop.taskTitle || stop.location.label}` : 'Arrival recorded successfully');
      onRefresh();
    } catch (err: any) {
      console.error(err);
      showToast('error', err.message || (isRtl ? 'تعذر تحديد الموقع، لا يمكن تسجيل هذا الإجراء بدون تفعيل GPS' : 'Unable to determine location, this action cannot be recorded without GPS'));
    } finally {
      setGpsLoadingId(null);
    }
  };

  const handleCompleteTrip = async (trip: Trip) => {
    try {
      setGpsLoadingId(`end-${trip.id}`);
      const coords = await captureGpsPosition();
      await FleetBusinessEngine.completeTrip(companyId, activeUser.id, trip.id, {
        lat: coords.lat,
        lng: coords.lng,
        accuracy: coords.accuracy,
        label: isRtl ? 'نهاية الرحلة' : 'Trip End'
      });
      showToast('success', isRtl ? 'تم إنهاء المشوار بنجاح وإعادة حالة المركبة لمتاحة' : 'Trip completed and vehicle active');
      onRefresh();
    } catch (err: any) {
      console.error(err);
      showToast('error', err.message || (isRtl ? 'تعذر تحديد الموقع، لا يمكن تسجيل هذا الإجراء بدون تفعيل GPS' : 'Unable to determine location, this action cannot be recorded without GPS'));
    } finally {
      setGpsLoadingId(null);
    }
  };

  const handleManualMapConfirm = async (coords: { lat: number; lng: number }) => {
    if (!mapPickerAction) return;
    const { type, trip, stop } = mapPickerAction;
    try {
      if (type === 'START') {
        await FleetBusinessEngine.startTrip(companyId, activeUser.id, trip.id, {
          lat: coords.lat,
          lng: coords.lng,
          label: isRtl ? 'موقع بداية الرحلة (يدوي من الخريطة)' : 'Field Trip Start Location (Manual Map)'
        });
        showToast('success', isRtl ? 'تم بدء الرحلة وتسجيل موقع الانطلاق عبر الخريطة' : 'Trip started with map location');
      } else if (type === 'STOP' && stop) {
        await FleetBusinessEngine.recordStopArrival(companyId, activeUser.id, trip.id, stop.id, {
          lat: coords.lat,
          lng: coords.lng,
          label: stop.location.label || stop.taskTitle || 'نقطة الوصول (يدوي من الخريطة)'
        });
        showToast('success', isRtl ? `تم تسجيل الوصول وتأكيد إحداثيات المهمة: ${stop.taskTitle || stop.location.label}` : 'Arrival recorded successfully');
      } else if (type === 'COMPLETE') {
        await FleetBusinessEngine.completeTrip(companyId, activeUser.id, trip.id, {
          lat: coords.lat,
          lng: coords.lng,
          label: isRtl ? 'نهاية الرحلة (يدوي من الخريطة)' : 'Trip End (Manual Map)'
        });
        showToast('success', isRtl ? 'تم إنهاء المشوار بنجاح وإعادة حالة المركبة لمتاحة' : 'Trip completed and vehicle active');
      }
      onRefresh();
    } catch (err: any) {
      console.error(err);
      showToast('error', err.message || (isRtl ? 'تعذر إتمام الإجراء' : 'Failed to perform action'));
    } finally {
      setMapPickerAction(null);
    }
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto pb-12">
      {/* Driver Header Banner */}
      <div className="p-4 sm:p-5 bg-linear-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl shadow-xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-500/20 border border-indigo-400/30 rounded-2xl">
            <Navigation className="h-6 w-6 text-indigo-300" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-black">
                {isRtl ? 'لوحة تحكم السائق الميدانية' : 'Driver Field Portal'}
              </h2>
              <span className="px-2 py-0.5 text-[10px] font-black rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse">
                GPS Live
              </span>
            </div>
            <p className="text-xs text-slate-300">
              {isRtl 
                ? `مرحباً بك يا كابتن ${driverName || activeUser.id} - تنفيذ فوري للمشاوير والمهام الميدانية`
                : `Welcome ${driverName || activeUser.id} - Direct field task execution`}
            </p>
          </div>
        </div>

        <div className="text-right rtl:text-left">
          <span className="text-xs font-mono font-bold bg-white/10 px-3 py-1.5 rounded-xl border border-white/10">
            {displayTrips.length} {isRtl ? 'مشاوير معينة' : 'Trips assigned'}
          </span>
        </div>
      </div>

      {/* Trips List */}
      {displayTrips.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
          <h3 className="text-sm font-black text-slate-900 dark:text-white">
            {isRtl ? 'لا توجد مشاوير معلقة مسندة إليك حالياً' : 'No pending trips assigned to you'}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            {isRtl ? 'سيظهر هنا أي مشوار أو مهمة طارئة يتم إسنادها إليك من إدارة الحركة فوراً.' : 'Any scheduled or emergency trip assigned to you will appear here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {displayTrips.map(trip => {
            const isDispatched = ['DISPATCHED', 'IN_PROGRESS'].includes(trip.status);
            const isCompleted = trip.status === 'COMPLETED';
            const isDraftOrPending = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED'].includes(trip.status);

            const pendingStops = trip.stops.filter(s => s.sequence > 1 && s.status !== 'COMPLETED' && s.status !== 'SKIPPED');
            const allStopsCompleted = pendingStops.length === 0 && isDispatched;

            return (
              <div 
                key={trip.id}
                className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-md overflow-hidden transition-all hover:border-indigo-300 dark:hover:border-indigo-800"
              >
                {/* Trip Top Status Header */}
                <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-950/50">
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-2xl ${
                      trip.isEmergency 
                        ? 'bg-rose-500 text-white animate-pulse shadow-md'
                        : 'bg-indigo-600 text-white shadow-xs'
                    }`}>
                      <Truck className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-black text-slate-900 dark:text-white">
                          {trip.tripType}
                        </h3>
                        {trip.isEmergency && (
                          <span className="px-2 py-0.5 text-[10px] font-black rounded-lg bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border border-rose-300">
                            {isRtl ? 'طارئ ⚡' : 'Emergency ⚡'}
                          </span>
                        )}
                        <span className="font-mono text-xs text-slate-400">
                          #{trip.id.slice(-6)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        <span>{isRtl ? 'المركبة:' : 'Vehicle:'} <strong>{trip.vehicle_id}</strong></span>
                        <span>•</span>
                        <span>{isRtl ? 'الموعد:' : 'Scheduled:'} {new Date(trip.scheduledAt).toLocaleTimeString(isRtl ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Safety Inspection button */}
                    <button
                      type="button"
                      onClick={() => setSelectedTripForInspection(trip)}
                      className="px-3 py-2 text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 transition-all shadow-xs"
                      title={isRtl ? 'إجراء فحص السلامة ومعاينة المركبة' : 'Conduct Vehicle Safety Inspection'}
                    >
                      <ClipboardCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      <span>{isRtl ? 'فحص السلامة' : 'Inspection'}</span>
                    </button>

                    {/* Chat with supervisor button */}
                    <button
                      type="button"
                      onClick={() => onOpenChat(trip)}
                      className="px-3 py-2 text-xs font-bold bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 rounded-xl border border-indigo-200 dark:border-indigo-800 flex items-center gap-1.5 transition-all shadow-xs"
                    >
                      <MessageSquare className="h-4 w-4 text-indigo-600" />
                      <span>{isRtl ? 'شات المشوار' : 'Trip Chat'}</span>
                    </button>

                    <span className={`px-3 py-1 text-xs font-black rounded-xl border ${
                      isCompleted ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300' :
                      isDispatched ? 'bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950 dark:text-blue-300 animate-pulse' :
                      'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950 dark:text-amber-300'
                    }`}>
                      {isCompleted ? (isRtl ? 'مكتمل' : 'Completed') :
                       isDispatched ? (isRtl ? 'في الطريق' : 'In Progress') :
                       (isRtl ? 'جاهز للبدء' : 'Ready')}
                    </span>
                  </div>
                </div>

                {/* Live GPS Tracking Active Indicator Banner */}
                {isDispatched && (
                  <div className="mx-4 sm:mx-5 mt-4 p-3 rounded-2xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2.5">
                      <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                      </span>
                      <div>
                        <p className="font-bold text-slate-800 dark:text-slate-200">
                          {isRtl ? 'التتبع اللحظي المباشر قيد العمل' : 'Live GPS Breadcrumb Tracking Active'}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {isRtl 
                            ? 'يتم تسجيل إحداثيات المسار تلقائياً كل 30 ثانية لتحديث خريطة الحركة.' 
                            : 'Route coordinates are recorded automatically every 30s for the live fleet dashboard.'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right rtl:text-left shrink-0">
                      {lastLivePingTime && (
                        <span className="font-mono text-[10px] text-indigo-600 dark:text-indigo-400 font-bold bg-indigo-100 dark:bg-indigo-900/60 px-2 py-1 rounded-lg">
                          {isRtl ? 'آخر إشارة:' : 'Last ping:'} {lastLivePingTime.toLocaleTimeString(isRtl ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      )}
                      {liveTrackingNotice && (
                        <span className="text-[10px] text-amber-600 dark:text-amber-400 block mt-0.5">
                          {liveTrackingNotice}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Stops Checklist */}
                <div className="p-4 sm:p-5 space-y-3">
                  <div className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                    <span>{isRtl ? 'محطات ومهام المشوار:' : 'Trip Stops & Tasks:'}</span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {trip.stops.filter(s => s.status === 'COMPLETED' || s.status === 'SKIPPED').length} / {trip.stops.length} {isRtl ? 'منجز' : 'Done'}
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {trip.stops.map((stop, sIdx) => {
                      const isStartStop = stop.sequence === 1;
                      const isArrived = stop.status === 'ARRIVED' || stop.status === 'COMPLETED';
                      const isSkipped = stop.status === 'SKIPPED';

                      return (
                        <div
                          key={stop.id}
                          className={`p-3.5 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                            stop.status === 'COMPLETED'
                              ? 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                              : isSkipped
                              ? 'bg-slate-100 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 opacity-60'
                              : stop.status === 'ARRIVED'
                              ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-300 text-blue-900 dark:text-blue-200'
                              : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-black shrink-0 mt-0.5 ${
                              stop.status === 'COMPLETED'
                                ? 'bg-emerald-600 text-white'
                                : stop.status === 'ARRIVED'
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                            }`}>
                              {stop.status === 'COMPLETED' ? '✓' : stop.sequence}
                            </div>
                            <div>
                              <div className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                                <span>{stop.taskTitle || stop.location.label}</span>
                                {isStartStop && (
                                  <span className="px-1.5 py-0.2 text-[9px] font-bold rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                    {isRtl ? 'البداية' : 'Start'}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5">
                                <MapPin className="h-3 w-3 text-slate-400 shrink-0" />
                                <span>{stop.location.label}</span>
                              </div>
                              {stop.notes && (
                                <p className="text-[10px] text-amber-700 dark:text-amber-300 mt-1 italic">
                                  {stop.notes}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Stop Action: Record GPS Arrival if dispatched */}
                          {isDispatched && !isStartStop && !isCompleted && !isSkipped && (
                            <div className="shrink-0 flex items-center gap-2">
                              {stop.status === 'ARRIVED' || stop.status === 'COMPLETED' ? (
                                <span className="px-3 py-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/80 rounded-xl flex items-center gap-1">
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                  {isRtl ? 'تم تسجيل الوصول والموقع' : 'Arrival Confirmed'}
                                </span>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    disabled={gpsLoadingId === `stop-${stop.id}`}
                                    onClick={() => handleRecordArrival(trip, stop)}
                                    className="w-full sm:w-auto px-4 py-2.5 text-xs font-black bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl shadow-md flex items-center justify-center gap-2 transition-all active:scale-95"
                                  >
                                    {gpsLoadingId === `stop-${stop.id}` ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Navigation className="h-4 w-4" />
                                    )}
                                    <span>{isRtl ? 'وصلت للموقع (GPS)' : 'Arrived (GPS)'}</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => setMapPickerAction({
                                      type: 'STOP',
                                      trip,
                                      stop,
                                      initialLat: stop.location.lat,
                                      initialLng: stop.location.lng,
                                      label: stop.location.label || stop.taskTitle
                                    })}
                                    title={isRtl ? 'تحديد الوصول يدويًا من الخريطة' : 'Select arrival point on map'}
                                    className="p-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl border border-slate-200 dark:border-slate-700 transition-all"
                                  >
                                    <Map className="h-4 w-4 text-blue-600" />
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Big Primary Driver Actions Footer */}
                <div className="p-4 sm:p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {isDraftOrPending && (isRtl ? 'جاهز للانطلاق؟ اضغط لبدء الرحلة وتسجيل نقطة البداية:' : 'Ready to start?')}
                    {isDispatched && (isRtl ? 'عند إنهاء كافة المحطات، اضغط إنهاء الرحلة:' : 'When all stops are done:')}
                    {isCompleted && (isRtl ? 'تم إنهاء المشوار بنجاح.' : 'Trip completed.')}
                  </div>

                  <div className="w-full sm:w-auto flex items-center gap-2">
                    {/* 1. Start Trip Big Button */}
                    {isDraftOrPending && (
                      <div className="flex items-center gap-2 w-full sm:w-auto">
                        <button
                          type="button"
                          disabled={gpsLoadingId === `start-${trip.id}`}
                          onClick={() => handleStartTrip(trip)}
                          className="flex-1 sm:flex-initial px-6 py-3.5 text-sm font-black bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-2xl shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95"
                        >
                          {gpsLoadingId === `start-${trip.id}` ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                          ) : (
                            <Play className="h-5 w-5 fill-current" />
                          )}
                          <span>{isRtl ? 'بداية الرحلة (GPS)' : 'Start Trip (GPS)'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setMapPickerAction({
                            type: 'START',
                            trip,
                            initialLat: trip.startLocation?.lat,
                            initialLng: trip.startLocation?.lng,
                            label: isRtl ? 'نقطة البداية' : 'Start Point'
                          })}
                          title={isRtl ? 'تحديد موقع البداية يدويًا على الخريطة' : 'Select start location on map'}
                          className="p-3.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-2xl border border-slate-200 dark:border-slate-700 transition-all"
                        >
                          <Map className="h-5 w-5 text-emerald-600" />
                        </button>
                      </div>
                    )}

                    {/* 2. Complete Trip Big Button */}
                    {isDispatched && (
                      <div className="flex items-center gap-2 w-full sm:w-auto">
                        <button
                          type="button"
                          disabled={gpsLoadingId === `end-${trip.id}`}
                          onClick={() => handleCompleteTrip(trip)}
                          className="flex-1 sm:flex-initial px-6 py-3.5 text-sm font-black bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-2xl shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95"
                        >
                          {gpsLoadingId === `end-${trip.id}` ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-5 w-5" />
                          )}
                          <span>{isRtl ? 'إنهاء الرحلة بالكامل' : 'Complete Trip'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setMapPickerAction({
                            type: 'COMPLETE',
                            trip,
                            initialLat: trip.startLocation?.lat,
                            initialLng: trip.startLocation?.lng,
                            label: isRtl ? 'نهاية الرحلة' : 'End Point'
                          })}
                          title={isRtl ? 'تحديد موقع النهاية يدويًا على الخريطة' : 'Select end location on map'}
                          className="p-3.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-2xl border border-slate-200 dark:border-slate-700 transition-all"
                        >
                          <Map className="h-5 w-5 text-indigo-600" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Manual Map Picker Alternative */}
      {mapPickerAction && (
        <LeafletMapPickerModal
          isOpen={Boolean(mapPickerAction)}
          onClose={() => setMapPickerAction(null)}
          onConfirm={handleManualMapConfirm}
          initialLat={mapPickerAction.initialLat}
          initialLng={mapPickerAction.initialLng}
          stopLabel={mapPickerAction.label || (isRtl ? 'تحديد الموقع يدويًا' : 'Manual Location')}
          isRtl={isRtl}
        />
      )}

      {/* Digital Safety Inspection Modal */}
      {selectedTripForInspection && (() => {
        const allVehs = StorageEngine.getStored<Vehicle[]>('fleet_vehicles_items', []);
        const currentVeh = allVehs.find(v => v.id === selectedTripForInspection.vehicle_id) || {
          id: selectedTripForInspection.vehicle_id,
          company_id: companyId,
          code: selectedTripForInspection.vehicle_id,
          plateNumber: selectedTripForInspection.vehicle_id,
          make: 'Fleet',
          model: 'Vehicle',
          year: 2024,
          type: 'TRUCK',
          status: 'ACTIVE',
          odometerReading: 0,
          fuelCapacity: 80,
          createdAt: ''
        } as Vehicle;

        return (
          <VehicleInspectionModal
            isOpen={Boolean(selectedTripForInspection)}
            onClose={() => setSelectedTripForInspection(null)}
            vehicle={currentVeh}
            driverId={activeUser.id}
            driverName={driverName}
            tripId={selectedTripForInspection.id}
            companyId={companyId}
            isRtl={isRtl}
            onInspectionSubmitted={(record) => {
              showToast('success', isRtl ? 'تم تسجيل واعتماد فحص السلامة بنجاح' : 'Safety inspection recorded successfully');
              setSelectedTripForInspection(null);
              onRefresh();
            }}
          />
        );
      })()}
    </div>
  );
}
