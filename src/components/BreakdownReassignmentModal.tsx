import React, { useState } from 'react';
import { 
  ShieldAlert, ArrowRightLeft, MapPin, CheckCircle2, Clock, Truck, 
  Sparkles, PauseCircle, Calendar, User, Layers, CheckSquare, Split,
  AlertTriangle, Map 
} from 'lucide-react';
import { Vehicle, Trip, TripStop, BreakdownDecisionType } from '../types/fleet';
import { FleetBusinessEngine } from '../lib/enterprise/fleet_engine';
import LeafletMapPickerModal from './LeafletMapPickerModal';

interface BreakdownReassignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  vehicle: Vehicle | null;
  companyId: string;
  activeUserId: string;
  onReassigned: () => void;
  isRtl: boolean;
}

export default function BreakdownReassignmentModal({
  isOpen,
  onClose,
  vehicle,
  companyId,
  activeUserId,
  onReassigned,
  isRtl
}: BreakdownReassignmentModalProps) {
  if (!isOpen || !vehicle) return null;

  const affectedTrips = FleetBusinessEngine.getOpenTripsForVehicle(companyId, vehicle.id);
  const allVehicles = FleetBusinessEngine.getVehiclesByOrgUnit(companyId);

  // Scope: Either whole trip or individual task redistribution
  const [mode, setMode] = useState<'WHOLE_TRIP' | 'INDIVIDUAL_TASK'>('WHOLE_TRIP');
  const [selectedTripId, setSelectedTripId] = useState<string>(affectedTrips[0]?.id || '');
  const [selectedStopId, setSelectedStopId] = useState<string>('');
  
  const activeTrip = affectedTrips.find(t => t.id === selectedTripId) || affectedTrips[0];
  const eligibleStops = (activeTrip?.stops || []).filter(s => s.sequence > 1 && s.status !== 'COMPLETED' && s.status !== 'SKIPPED');

  const [decisionType, setDecisionType] = useState<BreakdownDecisionType>('REASSIGN');
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
  const [selectedDriverName, setSelectedDriverName] = useState<string>('');
  const [postponeUntil, setPostponeUntil] = useState<string>(() => {
    const tmrw = new Date();
    tmrw.setDate(tmrw.getDate() + 1);
    return tmrw.toISOString().slice(0, 16);
  });
  const [customReason, setCustomReason] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [busyVehicleWarning, setBusyVehicleWarning] = useState<string | null>(null);

  // Manual map picker state (no silent fallback)
  const [manualCoords, setManualCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [showMapPicker, setShowMapPicker] = useState(false);

  // Target coordinates for proximity calculation (no silent fallback)
  const targetStop = eligibleStops.find(s => s.id === selectedStopId);
  const detectedCoords = (targetStop?.location?.lat && targetStop?.location?.lng)
    ? { lat: targetStop.location.lat, lng: targetStop.location.lng }
    : (vehicle.last_known_location?.lat && vehicle.last_known_location?.lng)
    ? { lat: vehicle.last_known_location.lat, lng: vehicle.last_known_location.lng }
    : (activeTrip?.startLocation?.lat && activeTrip?.startLocation?.lng)
    ? { lat: activeTrip.startLocation.lat, lng: activeTrip.startLocation.lng }
    : null;

  const targetCoords = manualCoords || detectedCoords;

  const candidateVehicles = targetCoords
    ? FleetBusinessEngine.suggestNearestVehiclesForTasks(
        companyId,
        targetCoords,
        vehicle.id
      )
    : allVehicles
        .filter(v => v.id !== vehicle.id && !['BREAKDOWN', 'OUT_OF_SERVICE', 'MAINTENANCE', 'INACTIVE'].includes(v.status))
        .map(v => ({
          vehicle: v,
          distanceKm: 99999,
          lastLocationLabel: v.last_known_location?.label
        }));

  const selectedTargetVehicle = allVehicles.find(v => v.id === selectedVehicleId);

  const handleVehicleSelect = (vehId: string) => {
    setSelectedVehicleId(vehId);
    const v = allVehicles.find(item => item.id === vehId);
    if (v?.driverName) {
      setSelectedDriverName(v.driverName);
    } else if (activeTrip?.driver_id) {
      setSelectedDriverName(activeTrip.driver_id);
    }
  };

  const handleExecuteDecision = async (confirmed: boolean = false) => {
    if (!selectedTripId) return;
    if (mode === 'INDIVIDUAL_TASK' && !selectedStopId) return;
    if (decisionType === 'REASSIGN' && !selectedVehicleId) return;

    if (!confirmed && mode === 'WHOLE_TRIP' && decisionType === 'REASSIGN') {
      const conflictingTrips = FleetBusinessEngine.getOpenTripsForVehicle(companyId, selectedVehicleId)
        .filter(t => t.id !== selectedTripId);
      if (conflictingTrips.length > 0) {
        setBusyVehicleWarning(
          isRtl
            ? `تنبيه: المركبة البديلة مسندة بالفعل لمشوار مفتوح آخر (${conflictingTrips[0].id}). تأكيد السحب يتطلب توضيح السبب في حقل السبب أدناه ثم الضغط على تأكيد مرة أخرى.`
            : `Warning: the replacement vehicle is already on another open trip (${conflictingTrips[0].id}). Confirming requires a reason below, then press Confirm again.`
        );
        return;
      }
    }

    try {
      setSubmitting(true);

      if (mode === 'INDIVIDUAL_TASK') {
        const stopName = targetStop?.taskTitle || targetStop?.location?.label || 'مهمة';
        const defaultReason = decisionType === 'REASSIGN'
          ? (isRtl ? `تحويل مهمة (${stopName}) من المركبة المتعطلة (${vehicle.plateNumber}) إلى (${selectedTargetVehicle?.plateNumber || selectedVehicleId})` : `Reassigned task ${stopName} from ${vehicle.plateNumber} to ${selectedTargetVehicle?.plateNumber || selectedVehicleId}`)
          : decisionType === 'POSTPONE'
          ? (isRtl ? `تأجيل مهمة (${stopName}) نظراً لتعطل المركبة (${vehicle.plateNumber})` : `Postponed task ${stopName} due to breakdown`)
          : (isRtl ? `تعليق مهمة (${stopName}) بانتظار قرار لاحق` : `Suspended task ${stopName}`);

        await FleetBusinessEngine.executeIndividualStopDecision(
          companyId,
          activeUserId,
          {
            tripId: selectedTripId,
            stopId: selectedStopId,
            decision: decisionType,
            fromVehicleId: vehicle.id,
            toVehicleId: decisionType === 'REASSIGN' ? selectedVehicleId : undefined,
            toDriverId: decisionType === 'REASSIGN' ? (selectedDriverName || selectedTargetVehicle?.driverName || activeTrip?.driver_id) : undefined,
            reason: customReason.trim() || defaultReason,
            postponedUntil: decisionType === 'POSTPONE' ? postponeUntil : undefined
          }
        );

        const msg = decisionType === 'REASSIGN'
          ? (isRtl ? `تمت إعادة إسناد المهمة (${stopName}) للمركبة البديلة بنجاح` : 'Task successfully reassigned')
          : decisionType === 'POSTPONE'
          ? (isRtl ? `تم تأجيل المهمة (${stopName}) بنجاح` : 'Task postponed')
          : (isRtl ? `تم تعليق المهمة (${stopName})` : 'Task suspended');

        setSuccessMsg(msg);
      } else {
        // Whole Trip
        const defaultReason = decisionType === 'REASSIGN'
          ? (isRtl ? `تعطل المركبة (${vehicle.plateNumber}) وإعادة الإسناد للمركبة (${selectedTargetVehicle?.plateNumber || selectedVehicleId})` : `Vehicle breakdown (${vehicle.plateNumber}) reassigned to ${selectedTargetVehicle?.plateNumber || selectedVehicleId}`)
          : decisionType === 'POSTPONE'
          ? (isRtl ? `تأجيل المشوار نظراً لتعطل المركبة (${vehicle.plateNumber})` : `Trip postponed due to breakdown of vehicle ${vehicle.plateNumber}`)
          : (isRtl ? `تعليق المشوار بانتظار قرار لاحق بعد تعطل المركبة (${vehicle.plateNumber})` : `Trip suspended pending future decision`);

        await FleetBusinessEngine.executeBreakdownDecision(
          companyId,
          activeUserId,
          {
            tripId: selectedTripId,
            decision: decisionType,
            fromVehicleId: vehicle.id,
            toVehicleId: decisionType === 'REASSIGN' ? selectedVehicleId : undefined,
            toDriverId: decisionType === 'REASSIGN' ? (selectedDriverName || selectedTargetVehicle?.driverName || activeTrip?.driver_id) : undefined,
            reason: customReason.trim() || defaultReason,
            postponedUntil: decisionType === 'POSTPONE' ? postponeUntil : undefined,
            confirmDespiteConflict: confirmed
          }
        );

        const msg = decisionType === 'REASSIGN'
          ? (isRtl ? 'تمت إعادة إسناد المشوار بالكامل للمركبة البديلة بنجاح' : 'Trip successfully reassigned')
          : decisionType === 'POSTPONE'
          ? (isRtl ? 'تم تأجيل المشوار بنجاح' : 'Trip successfully postponed')
          : (isRtl ? 'تم تعليق المشوار لقرار لاحق' : 'Trip suspended for later decision');

        setSuccessMsg(msg);
      }

      setTimeout(() => {
        setSuccessMsg(null);
        onReassigned();
        onClose();
      }, 1200);
    } catch (err) {
      console.error('Breakdown decision failed:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-rose-50/50 dark:bg-rose-950/30">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-rose-600 text-white rounded-2xl shadow-sm">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 dark:text-white text-base">
                {isRtl ? 'قرارات المشرف عند عطل المركبة والمهام' : 'Vehicle Breakdown & Task Decisions'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isRtl ? 'إعادة إسناد كامل المشوار أو توزيع كل مهمة على حدة مع اقتراح الأقرب جغرافياً' : 'Reassign entire trip or distribute individual tasks with nearest vehicle matching'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm font-bold p-1.5"
          >
            ✕
          </button>
        </div>

        {/* Vehicle Context Banner */}
        <div className="p-3 sm:px-5 bg-rose-50/30 dark:bg-rose-950/20 border-b border-rose-100 dark:border-rose-900/40 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-rose-800 dark:text-rose-300 block">
              {isRtl ? 'المركبة المتعطلة:' : 'Broken Vehicle:'}
            </span>
            <div className="text-sm font-extrabold text-slate-900 dark:text-white">
              {vehicle.plateNumber} ({vehicle.make} {vehicle.model}) - <span className="font-mono text-rose-600">{vehicle.code}</span>
            </div>
            {vehicle.last_known_location && (
              <div className="text-[11px] font-medium text-slate-600 dark:text-slate-300 flex items-center gap-1 mt-0.5">
                <MapPin className="h-3 w-3 text-rose-500" />
                <span>
                  {isRtl ? 'آخر موقع مسجل:' : 'Last location:'} {vehicle.last_known_location.label || `${vehicle.last_known_location.lat.toFixed(3)}, ${vehicle.last_known_location.lng.toFixed(3)}`}
                </span>
              </div>
            )}
          </div>
          <div className="px-3 py-1 bg-white/80 dark:bg-slate-900/80 border border-rose-200 dark:border-rose-800 rounded-xl text-xs font-bold text-rose-700 dark:text-rose-300">
            {affectedTrips.length} {isRtl ? 'مشاوير مفتوحة' : 'Open trips affected'}
          </div>
        </div>

        {affectedTrips.length === 0 ? (
          <div className="p-8 text-center bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-500 text-xs font-medium m-4">
            <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
            {isRtl ? 'لا توجد مشاوير أو مهام مفتوحة مسندة لهذه المركبة حالياً.' : 'No active trips assigned to this vehicle.'}
          </div>
        ) : (
          <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
            {/* Mode Switch: Whole Trip vs Individual Task */}
            <div className="flex items-center gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl">
              <button
                type="button"
                onClick={() => {
                  setMode('WHOLE_TRIP');
                  setSelectedStopId('');
                }}
                className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                  mode === 'WHOLE_TRIP'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs font-black'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                <span>{isRtl ? 'إسناد / معالجة المشوار بالكامل' : 'Whole Trip Decision'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setMode('INDIVIDUAL_TASK');
                  if (eligibleStops.length > 0 && !selectedStopId) {
                    setSelectedStopId(eligibleStops[0].id);
                  }
                }}
                className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                  mode === 'INDIVIDUAL_TASK'
                    ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-xs font-black'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <Split className="h-3.5 w-3.5" />
                <span>{isRtl ? 'توزيع مهام فردية (كل مهمة لعربية)' : 'Distribute Individual Tasks'}</span>
              </button>
            </div>

            {/* Step 1: Select Trip */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                {isRtl ? '1. اختر المشوار المراد معالجته:' : '1. Select trip to handle:'}
              </label>
              <div className="space-y-2">
                {affectedTrips.map(trip => (
                  <label
                    key={trip.id}
                    className={`flex items-start justify-between p-3 rounded-2xl border cursor-pointer transition-all ${
                      selectedTripId === trip.id
                        ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="affectedTrip"
                        checked={selectedTripId === trip.id}
                        onChange={() => {
                          setSelectedTripId(trip.id);
                          const stops = (trip.stops || []).filter(s => s.sequence > 1 && s.status !== 'COMPLETED' && s.status !== 'SKIPPED');
                          if (stops.length > 0) setSelectedStopId(stops[0].id);
                        }}
                        className="text-indigo-600 focus:ring-indigo-500"
                      />
                      <div>
                        <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                          <span>{trip.tripType}</span>
                          {trip.isEmergency && (
                            <span className="px-1.5 py-0.5 text-[9px] font-black rounded bg-rose-100 text-rose-700">
                              {isRtl ? 'طارئ ⚡' : 'Emergency'}
                            </span>
                          )}
                          <span className="font-mono text-slate-500 text-[10px]">{new Date(trip.scheduledAt).toLocaleString(isRtl ? 'ar-EG' : 'en-US')}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          {isRtl ? 'المهام:' : 'Tasks:'} {trip.stops.map(s => s.taskTitle || s.location.label).filter(Boolean).join(' ← ')}
                        </div>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 text-[10px] font-bold rounded-lg bg-amber-50 text-amber-700 border border-amber-200">
                      {trip.status}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Individual Task Selector (if in INDIVIDUAL_TASK mode) */}
            {mode === 'INDIVIDUAL_TASK' && (
              <div className="p-3 bg-indigo-50/50 dark:bg-indigo-950/30 rounded-2xl border border-indigo-200 dark:border-indigo-800 space-y-2">
                <label className="block text-xs font-black text-indigo-950 dark:text-indigo-200">
                  {isRtl ? 'اختر المهمة الفردية المراد توزيعها أو تأجيلها:' : 'Select individual task to reassign/postpone:'}
                </label>

                {eligibleStops.length === 0 ? (
                  <p className="text-xs text-slate-500">{isRtl ? 'لا توجد مهام متبقية معلقة في هذا المشوار' : 'No pending stops left'}</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {eligibleStops.map(stop => (
                      <label
                        key={stop.id}
                        className={`p-2.5 rounded-xl border cursor-pointer flex items-center justify-between text-xs transition-all ${
                          selectedStopId === stop.id
                            ? 'bg-indigo-600 text-white border-indigo-600 font-bold shadow-sm'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="individualStop"
                            checked={selectedStopId === stop.id}
                            onChange={() => setSelectedStopId(stop.id)}
                            className="text-indigo-600"
                          />
                          <div>
                            <div>{stop.taskTitle || stop.location.label}</div>
                            <div className={`text-[10px] ${selectedStopId === stop.id ? 'text-indigo-100' : 'text-slate-400'}`}>
                              {stop.location.label}
                            </div>
                          </div>
                        </div>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                          selectedStopId === stop.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {stop.status}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Step 2: Choose Decision Type */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                {isRtl ? '2. قرار المشرف:' : '2. Supervisor decision:'}
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setDecisionType('REASSIGN')}
                  className={`p-3 rounded-2xl border text-center transition-all flex flex-col items-center gap-1 ${
                    decisionType === 'REASSIGN'
                      ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-extrabold shadow-sm'
                      : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                  }`}
                >
                  <ArrowRightLeft className="h-4 w-4" />
                  <span className="text-xs">{isRtl ? 'إعادة إسناد الآن' : 'Reassign Now'}</span>
                  <span className="text-[10px] opacity-75">{isRtl ? 'تحويل لعربية بديلة' : 'Transfer vehicle'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDecisionType('POSTPONE')}
                  className={`p-3 rounded-2xl border text-center transition-all flex flex-col items-center gap-1 ${
                    decisionType === 'POSTPONE'
                      ? 'border-amber-600 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 font-extrabold shadow-sm'
                      : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                  }`}
                >
                  <Calendar className="h-4 w-4" />
                  <span className="text-xs">{isRtl ? 'تأجيل' : 'Postpone'}</span>
                  <span className="text-[10px] opacity-75">{isRtl ? 'تحديد موعد لاحق' : 'Reschedule'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDecisionType('SUSPEND')}
                  className={`p-3 rounded-2xl border text-center transition-all flex flex-col items-center gap-1 ${
                    decisionType === 'SUSPEND'
                      ? 'border-slate-600 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-extrabold shadow-sm'
                      : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                  }`}
                >
                  <PauseCircle className="h-4 w-4" />
                  <span className="text-xs">{isRtl ? 'تعليق' : 'Suspend'}</span>
                  <span className="text-[10px] opacity-75">{isRtl ? 'قرار لاحق' : 'Decide later'}</span>
                </button>
              </div>
            </div>

            {/* Decision Details Body */}
            {decisionType === 'REASSIGN' && (
              <div className="space-y-3 p-3.5 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800">
                {/* Warning if no location is available */}
                {!targetCoords ? (
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 rounded-2xl text-xs space-y-2">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                      <div className="font-bold">
                        {isRtl 
                          ? 'تعذر تحديد الموقع، لا يمكن تسجيل هذا الإجراء بدون تفعيل GPS أو تحديد الموقع عبر الخريطة.'
                          : 'Unable to determine location, this action cannot be recorded without GPS or selecting the location on the map.'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowMapPicker(true)}
                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-black text-xs rounded-xl shadow-xs flex items-center gap-1.5 transition-all"
                    >
                      <Map className="h-3.5 w-3.5" />
                      <span>{isRtl ? 'تحديد موقع العطل يدويًا على الخريطة' : 'Pick location on map'}</span>
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        {isRtl ? 'اقتراحات أقرب سيارات متاحة (مرتبة حسب المسافة وتوفير السولار):' : 'Nearest available vehicles (sorted by distance & fuel economy):'}
                      </span>
                      {manualCoords && (
                        <span className="px-2 py-0.5 text-[10px] font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 rounded-lg">
                          {isRtl ? 'موقع محدد يدويًا' : 'Manual Location'}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowMapPicker(true)}
                        className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold hover:underline flex items-center gap-1"
                      >
                        <Map className="h-3 w-3" />
                        <span>{isRtl ? 'تغيير الموقع بالخريطة' : 'Change on map'}</span>
                      </button>
                      <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                        <Sparkles className="h-3 w-3" />
                        {isRtl ? 'حساب جغرافي' : 'Geo Match'}
                      </span>
                    </div>
                  </div>
                )}

                {candidateVehicles.length === 0 ? (
                  <div className="p-3 text-center text-xs text-slate-500">
                    {isRtl ? 'لا توجد مركبات بديلة متاحة حالياً.' : 'No alternative vehicles available.'}
                  </div>
                ) : (
                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                    {candidateVehicles.map((cand, idx) => {
                      const isNearest = idx === 0 && cand.distanceKm < 9999;
                      const isSelected = selectedVehicleId === cand.vehicle.id;

                      return (
                        <label
                          key={cand.vehicle.id}
                          className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-all ${
                            isSelected
                              ? 'border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/40'
                              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <input
                              type="radio"
                              name="candidateVehicle"
                              checked={isSelected}
                              onChange={() => handleVehicleSelect(cand.vehicle.id)}
                              className="text-emerald-600 focus:ring-emerald-500"
                            />
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                                  {cand.vehicle.plateNumber} ({cand.vehicle.make} {cand.vehicle.model})
                                </span>
                                <span className="font-mono text-[10px] font-bold text-slate-500">
                                  {cand.vehicle.code}
                                </span>
                                {isNearest && (
                                  <span className="px-1.5 py-0.5 text-[9px] font-black rounded bg-emerald-100 text-emerald-800 border border-emerald-300">
                                    {isRtl ? 'الأقرب ⚡' : 'Nearest ⚡'}
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-0.5">
                                <span>{isRtl ? 'السائق الأساسي:' : 'Default driver:'} {cand.vehicle.driverName || '-'}</span>
                                <span>•</span>
                                <span>{cand.lastLocationLabel || '-'}</span>
                              </div>
                            </div>
                          </div>

                          <div className="text-right rtl:text-left font-mono">
                            {cand.distanceKm < 9999 ? (
                              <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded-lg border border-indigo-200/60">
                                ~ {cand.distanceKm} KM
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400">
                                {isRtl ? 'الموقع غير محدد' : 'Unknown loc'}
                              </span>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}

                {/* Driver Flexibility input */}
                {selectedVehicleId && (
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                      <User className="h-3 w-3 text-indigo-500" />
                      {isRtl ? 'السائق المنفذ (يمكن تشغيل أي سائق متاح على العربية البديلة):' : 'Assigned Driver:'}
                    </label>
                    <input
                      type="text"
                      value={selectedDriverName}
                      onChange={e => setSelectedDriverName(e.target.value)}
                      placeholder={isRtl ? 'اسم السائق أو رقم تعريفه' : 'Driver name or ID'}
                      className="w-full text-xs p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      {isRtl ? 'يتم حفظ العربية والسائق بشكل مستقل في السجل التشغيلي.' : 'Vehicle and driver are tracked independently.'}
                    </p>
                  </div>
                )}
              </div>
            )}

            {decisionType === 'POSTPONE' && (
              <div className="p-3 bg-amber-50/50 dark:bg-amber-950/30 rounded-2xl border border-amber-200 dark:border-amber-800 space-y-2">
                <label className="block text-xs font-bold text-amber-900 dark:text-amber-300">
                  {isRtl ? 'الموعد الجديد للمشوار/المهمة بعد التأجيل:' : 'Postponed until date/time:'}
                </label>
                <input
                  type="datetime-local"
                  value={postponeUntil}
                  onChange={e => setPostponeUntil(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>
            )}

            {/* Custom Reason & Audit trail */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                {isRtl ? 'سبب القرار وملاحظات المشرف الميداني (تسجيل أثر):' : 'Decision reason / notes:'}
              </label>
              <textarea
                value={customReason}
                onChange={e => setCustomReason(e.target.value)}
                rows={2}
                placeholder={isRtl ? 'اكتب ملاحظات العطل أو سبب التأجيل/الإسناد...' : 'Enter reason or operational notes...'}
                className="w-full text-xs p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {successMsg && (
              <div className="p-3 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-2xl text-xs font-bold flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}
          </div>
        )}

        {busyVehicleWarning && (
          <div className="mx-4 mb-3 p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-2xl">
            <p className="text-xs font-bold text-amber-900 dark:text-amber-300">{busyVehicleWarning}</p>
            <p className="text-[10px] text-amber-700 dark:text-amber-400 mt-1">
              {isRtl ? 'اكتب السبب في حقل "السبب" أعلاه، ثم اضغط تأكيد وحفظ القرار التشغيلي مرة أخرى للمتابعة.' : 'Fill the Reason field above, then press Confirm Decision again to proceed.'}
            </p>
          </div>
        )}

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
          >
            {isRtl ? 'إلغاء' : 'Cancel'}
          </button>

          {affectedTrips.length > 0 && (
            <button
              type="button"
              disabled={submitting || (decisionType === 'REASSIGN' && (!selectedVehicleId || !targetCoords)) || (mode === 'INDIVIDUAL_TASK' && !selectedStopId) || (!!busyVehicleWarning && !customReason.trim())}
              onClick={() => handleExecuteDecision(!!busyVehicleWarning)}
              className="px-5 py-2.5 text-xs font-black bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl shadow-md transition-all flex items-center gap-2"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>
                {submitting
                  ? (isRtl ? 'جارٍ التنفيذ...' : 'Executing...')
                  : busyVehicleWarning
                  ? (isRtl ? 'تأكيد السحب رغم الانشغال' : 'Confirm anyway')
                  : (isRtl ? 'تأكيد وحفظ القرار التشغيلي' : 'Confirm Decision')}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Manual Location Leaflet Map Picker Modal */}
      {showMapPicker && (
        <LeafletMapPickerModal
          isOpen={showMapPicker}
          onClose={() => setShowMapPicker(false)}
          onConfirm={(coords) => {
            setManualCoords(coords);
            setShowMapPicker(false);
          }}
          initialLat={targetCoords?.lat}
          initialLng={targetCoords?.lng}
          stopLabel={isRtl ? `موقع تعطل المركبة (${vehicle.plateNumber})` : `Breakdown location for ${vehicle.plateNumber}`}
          isRtl={isRtl}
        />
      )}
    </div>
  );
}
