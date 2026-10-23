import React, { useState } from 'react';
import {
  X,
  Plus,
  ArrowUp,
  ArrowDown,
  Trash2,
  Share2,
  CheckCircle2,
  Clock,
  MapPin,
  AlertCircle,
  Truck,
  User,
  ArrowRightLeft,
  Navigation,
  FileText
} from 'lucide-react';
import { Trip, TripStop, Vehicle, TripLocation } from '../types/fleet';
import { FleetBusinessEngine } from '../lib/enterprise/fleet_engine';

interface TripStopsManagerModalProps {
  trip: Trip;
  companyId: string;
  currentUserId: string;
  allTrips: Trip[];
  vehicles: Vehicle[];
  drivers: Array<{ id: string; name: string }>;
  onClose: () => void;
  onTripUpdated: (updatedTrip: Trip) => void;
}

const COMMON_TASK_TYPES = [
  'بوسطة ومراسلات',
  'استبدال اسطوانات غاز',
  'تسليم واستلام بضاعة',
  'صيانة ميدانية طارئة',
  'فحص موقع وتشغيل',
  'تحصيل مستندات وفواتير',
  'مهمة إدارية عامة'
];

export const TripStopsManagerModal: React.FC<TripStopsManagerModalProps> = ({
  trip,
  companyId,
  currentUserId,
  allTrips,
  vehicles,
  drivers,
  onClose,
  onTripUpdated
}) => {
  const [currentTrip, setCurrentTrip] = useState<Trip>(trip);
  const [isAddingStop, setIsAddingStop] = useState(false);
  const [newStopTaskTitle, setNewStopTaskTitle] = useState('');
  const [newStopLabel, setNewStopLabel] = useState('');
  const [newStopNotes, setNewStopNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Reassignment / Transfer Sub-flow
  const [reassigningStop, setReassigningStop] = useState<TripStop | null>(null);
  const [reassignMode, setReassignMode] = useState<'EXISTING_TRIP' | 'NEW_TRIP'>('EXISTING_TRIP');
  const [targetTripId, setTargetTripId] = useState('');
  const [newTripVehicleId, setNewTripVehicleId] = useState('');
  const [newTripDriverId, setNewTripDriverId] = useState('');
  const [reassignReason, setReassignReason] = useState('');

  // Skip / Cancel Sub-flow
  const [skippingStop, setSkippingStop] = useState<TripStop | null>(null);
  const [skipReason, setSkipReason] = useState('');

  // Candidate active trips for reassignment
  const candidateTrips = allTrips.filter(
    t => t.id !== currentTrip.id && t.company_id === companyId && t.status !== 'COMPLETED' && t.status !== 'CANCELLED'
  );

  const handleAddStop = async () => {
    if (!newStopLabel.trim() && !newStopTaskTitle.trim()) {
      setErrorMsg('يرجى تحديد عنوان المهمة أو اسم الموقع');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      const loc: TripLocation = {
        label: newStopLabel.trim() || newStopTaskTitle.trim()
      };

      const updated = await FleetBusinessEngine.addStopToTrip(
        companyId,
        currentUserId,
        currentTrip.id,
        {
          taskTitle: newStopTaskTitle.trim() || undefined,
          notes: newStopNotes.trim() || undefined,
          location: loc
        }
      );

      setCurrentTrip(updated);
      onTripUpdated(updated);
      setIsAddingStop(false);
      setNewStopTaskTitle('');
      setNewStopLabel('');
      setNewStopNotes('');
      setSuccessMsg('تمت إضافة المحطة إلى خط السير بنجاح');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err?.message || 'تعذر إضافة المحطة');
    } finally {
      setLoading(false);
    }
  };

  const handleMoveStop = async (index: number, direction: 'UP' | 'DOWN') => {
    const stops = [...currentTrip.stops];
    const targetIndex = direction === 'UP' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= stops.length) return;

    // Swap
    const temp = stops[index];
    stops[index] = stops[targetIndex];
    stops[targetIndex] = temp;

    setLoading(true);
    setErrorMsg(null);
    try {
      const orderedIds = stops.map(s => s.id);
      const updated = await FleetBusinessEngine.reorderTripStops(
        companyId,
        currentUserId,
        currentTrip.id,
        orderedIds
      );
      setCurrentTrip(updated);
      onTripUpdated(updated);
      setSuccessMsg('تم تحديث ترتيب المحطات بنجاح');
      setTimeout(() => setSuccessMsg(null), 2500);
    } catch (err: any) {
      setErrorMsg(err?.message || 'تعذر إعادة ترتيب المحطات');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmSkip = async () => {
    if (!skippingStop) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const updated = await FleetBusinessEngine.skipOrCancelStop(
        companyId,
        currentUserId,
        currentTrip.id,
        skippingStop.id,
        skipReason.trim() || 'تخطي بقرار المشرف'
      );
      setCurrentTrip(updated);
      onTripUpdated(updated);
      setSkippingStop(null);
      setSkipReason('');
      setSuccessMsg('تم تخطي المحطة مع حفظ سبب القرار');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err?.message || 'تعذر تخطي المحطة');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmReassign = async () => {
    if (!reassigningStop) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      if (reassignMode === 'EXISTING_TRIP') {
        if (!targetTripId) {
          setErrorMsg('يرجى اختيار المشوار المستهدف للتحويل إليه');
          setLoading(false);
          return;
        }
        const { sourceTrip } = await FleetBusinessEngine.reassignStopToAnotherTrip(
          companyId,
          currentUserId,
          currentTrip.id,
          reassigningStop.id,
          targetTripId,
          reassignReason
        );
        setCurrentTrip(sourceTrip);
        onTripUpdated(sourceTrip);
        setSuccessMsg('تم تحويل المهمة إلى المشوار الآخر بنجاح');
      } else {
        if (!newTripVehicleId || !newTripDriverId) {
          setErrorMsg('يرجى اختيار المركبة والسائق لإنشاء المشوار الجديد');
          setLoading(false);
          return;
        }
        const { sourceTrip } = await FleetBusinessEngine.splitStopToNewTrip(
          companyId,
          currentUserId,
          currentTrip.id,
          reassigningStop.id,
          {
            vehicle_id: newTripVehicleId,
            driver_id: newTripDriverId,
            notes: reassignReason
          }
        );
        setCurrentTrip(sourceTrip);
        onTripUpdated(sourceTrip);
        setSuccessMsg('تم فصل المهمة في مشوار جديد للمركبة البديلة');
      }
      setReassigningStop(null);
      setReassignReason('');
      setTargetTripId('');
      setNewTripVehicleId('');
      setNewTripDriverId('');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err?.message || 'تعذر إعادة توزيع المهمة');
    } finally {
      setLoading(false);
    }
  };

  const getStopStatusBadge = (status: TripStop['status']) => {
    switch (status) {
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <CheckCircle2 className="w-3.5 h-3.5" /> مكتملة
          </span>
        );
      case 'ARRIVED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 border border-indigo-300">
            <Navigation className="w-3.5 h-3.5" /> وصل الموقع
          </span>
        );
      case 'IN_PROGRESS':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
            <Clock className="w-3.5 h-3.5" /> جارية
          </span>
        );
      case 'SKIPPED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">
            <X className="w-3.5 h-3.5" /> متخطاة / ملغاة
          </span>
        );
      case 'REASSIGNED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-300">
            <ArrowRightLeft className="w-3.5 h-3.5" /> محولة لمشوار آخر
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300">
            <Clock className="w-3.5 h-3.5" /> قيد الانتظار
          </span>
        );
    }
  };

  const assignedVehicle = vehicles.find(v => v.id === currentTrip.vehicle_id);
  const assignedDriver = drivers.find(d => d.id === currentTrip.driver_id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-right" dir="rtl">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-100 text-blue-700 rounded-xl">
              <MapPin className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                إدارة محطات ومهام المشوار ({currentTrip.tripType})
              </h3>
              <p className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                <span>المركبة: <strong className="text-slate-800">{assignedVehicle?.plateNumber || assignedVehicle?.code || currentTrip.vehicle_id}</strong></span>
                <span>•</span>
                <span>السائق: <strong className="text-slate-800">{assignedDriver?.name || currentTrip.driver_id}</strong></span>
                <span>•</span>
                <span>الحالة: <strong className="text-blue-700">{currentTrip.status}</strong></span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notifications */}
        {errorMsg && (
          <div className="mx-6 mt-4 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2 font-medium">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="mx-6 mt-4 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* Action Bar */}
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm font-bold text-slate-800">
              قائمة المحطات والمهام الميدانية ({currentTrip.stops.length} محطات)
            </div>
            {currentTrip.status !== 'COMPLETED' && currentTrip.status !== 'CANCELLED' && (
              <button
                onClick={() => setIsAddingStop(!isAddingStop)}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition shadow-xs"
              >
                <Plus className="w-4 h-4" />
                {isAddingStop ? 'إلغاء الإضافة' : 'إضافة محطة / مهمة جديدة'}
              </button>
            )}
          </div>

          {/* Add Stop Inline Form */}
          {isAddingStop && (
            <div className="p-4 bg-blue-50/60 border border-blue-200 rounded-xl space-y-3 animate-in fade-in duration-150">
              <div className="font-bold text-xs text-blue-900 flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-blue-700" />
                إضافة مهمة / محطة جديدة لخط سير هذا المشوار
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    نوع المهمة (اختر أو اكتب مخصصاً)
                  </label>
                  <input
                    type="text"
                    list="task-types-list"
                    value={newStopTaskTitle}
                    onChange={e => setNewStopTaskTitle(e.target.value)}
                    placeholder="مثال: بوسطة ومراسلات، استبدال أنابيب..."
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                  <datalist id="task-types-list">
                    {COMMON_TASK_TYPES.map(t => (
                      <option key={t} value={t} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    اسم الموقع أو الوجهة <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newStopLabel}
                    onChange={e => setNewStopLabel(e.target.value)}
                    placeholder="مثال: فرع الدقي، مستودع المحطة..."
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  ملاحظات أو تفاصيل المهمة للسائق
                </label>
                <input
                  type="text"
                  value={newStopNotes}
                  onChange={e => setNewStopNotes(e.target.value)}
                  placeholder="مثال: استلام ظرف من الأستاذ أحمد، إحضار إيصال..."
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => setIsAddingStop(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  إلغاء
                </button>
                <button
                  onClick={handleAddStop}
                  disabled={loading}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 shadow-xs"
                >
                  {loading ? 'جاري الحفظ...' : 'تأكيد إضافة المحطة'}
                </button>
              </div>
            </div>
          )}

          {/* Stops List */}
          <div className="space-y-3">
            {currentTrip.stops.map((stop, idx) => {
              const isFirst = idx === 0;
              const isLast = idx === currentTrip.stops.length - 1;
              const isPending = stop.status === 'PENDING';
              const canModify = currentTrip.status !== 'COMPLETED' && currentTrip.status !== 'CANCELLED';

              return (
                <div
                  key={stop.id}
                  className={`p-4 rounded-xl border transition-all ${
                    stop.status === 'COMPLETED'
                      ? 'bg-emerald-50/30 border-emerald-200'
                      : stop.status === 'SKIPPED'
                      ? 'bg-slate-50 border-slate-200 opacity-60'
                      : stop.status === 'REASSIGNED'
                      ? 'bg-purple-50/30 border-purple-200'
                      : 'bg-white border-slate-200 hover:border-blue-300 shadow-xs'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    {/* Stop Info */}
                    <div className="flex items-start gap-3 flex-1">
                      <div className="flex flex-col items-center justify-center w-7 h-7 rounded-full bg-slate-100 text-slate-700 font-bold text-xs shrink-0 mt-0.5 border border-slate-300">
                        {idx + 1}
                      </div>
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-slate-900">
                            {stop.taskTitle || stop.location.label || 'محطة رحلة'}
                          </span>
                          {getStopStatusBadge(stop.status)}
                          {isFirst && (
                            <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-semibold border border-blue-200">
                              نقطة البداية
                            </span>
                          )}
                        </div>

                        <div className="text-xs text-slate-600 flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>الموقع: <strong>{stop.location.label}</strong></span>
                          {stop.location.lat && stop.location.lng && (
                            <span className="text-[10px] text-slate-400">({stop.location.lat.toFixed(4)}, {stop.location.lng.toFixed(4)})</span>
                          )}
                        </div>

                        {stop.notes && (
                          <div className="text-xs text-slate-500 bg-slate-50 p-2 rounded border border-slate-100">
                            <span className="font-semibold text-slate-700">ملاحظات:</span> {stop.notes}
                          </div>
                        )}

                        {stop.skippedReason && (
                          <div className="text-xs text-rose-700 bg-rose-50 p-2 rounded border border-rose-100">
                            <span className="font-semibold">سبب التخطي:</span> {stop.skippedReason}
                          </div>
                        )}

                        {stop.arrivedAt && (
                          <div className="text-[11px] text-indigo-700 flex items-center gap-1">
                            <Navigation className="w-3 h-3" />
                            <span>تم تسجيل الوصول: {new Date(stop.arrivedAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Operational Actions */}
                    {canModify && isPending && (
                      <div className="flex items-center gap-1 shrink-0">
                        {/* Reorder Buttons */}
                        <button
                          onClick={() => handleMoveStop(idx, 'UP')}
                          disabled={isFirst || loading}
                          title="تحريك لأعلى في خط السير"
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded disabled:opacity-20 transition"
                        >
                          <ArrowUp className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleMoveStop(idx, 'DOWN')}
                          disabled={isLast || loading}
                          title="تحريك لأسفل في خط السير"
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded disabled:opacity-20 transition"
                        >
                          <ArrowDown className="w-4 h-4" />
                        </button>

                        {/* Reassign to another vehicle/trip */}
                        <button
                          onClick={() => setReassigningStop(stop)}
                          title="إعادة توزيع المهمة لسائق/مركبة أخرى"
                          className="p-1.5 text-purple-600 hover:bg-purple-50 rounded transition flex items-center gap-1 text-xs font-semibold"
                        >
                          <Share2 className="w-4 h-4" />
                          <span className="hidden sm:inline">تحويل</span>
                        </button>

                        {/* Skip/Cancel stop */}
                        <button
                          onClick={() => setSkippingStop(stop)}
                          title="تخطي أو إلغاء هذه المحطة"
                          className="p-1.5 text-rose-500 hover:bg-rose-50 rounded transition"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Skip Stop Dialog */}
          {skippingStop && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-3">
              <div className="font-bold text-xs text-rose-900 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600" />
                تأكيد تخطي المحطة: ({skippingStop.taskTitle || skippingStop.location.label})
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  سبب التخطي أو عدم التنفيذ <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={skipReason}
                  onChange={e => setSkipReason(e.target.value)}
                  placeholder="مثال: الفرع مغلق، تعذر التواصل مع المستلم، تأجيل للغد..."
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-rose-500 bg-white"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => setSkippingStop(null)}
                  className="px-3 py-1.5 text-xs text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  إلغاء
                </button>
                <button
                  onClick={handleConfirmSkip}
                  disabled={loading}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-rose-600 rounded-lg hover:bg-rose-700 disabled:opacity-50"
                >
                  {loading ? 'جاري الحفظ...' : 'تأكيد التخطي'}
                </button>
              </div>
            </div>
          )}

          {/* Reassign / Transfer Stop Dialog */}
          {reassigningStop && (
            <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl space-y-3">
              <div className="font-bold text-xs text-purple-900 flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4 text-purple-600" />
                إعادة توزيع المهمة: ({reassigningStop.taskTitle || reassigningStop.location.label})
              </div>

              {/* Mode Toggle */}
              <div className="flex items-center gap-4 text-xs font-semibold text-slate-700">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="reassign-mode"
                    checked={reassignMode === 'EXISTING_TRIP'}
                    onChange={() => setReassignMode('EXISTING_TRIP')}
                    className="text-purple-600 focus:ring-purple-500"
                  />
                  <span>إضافة لمشوار قائم بالفعل</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="reassign-mode"
                    checked={reassignMode === 'NEW_TRIP'}
                    onChange={() => setReassignMode('NEW_TRIP')}
                    className="text-purple-600 focus:ring-purple-500"
                  />
                  <span>إنشاء مشوار منفصل جديد لسائق آخر</span>
                </label>
              </div>

              {reassignMode === 'EXISTING_TRIP' ? (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    اختر المشوار المستهدف للتحويل إليه
                  </label>
                  {candidateTrips.length === 0 ? (
                    <div className="text-xs text-slate-500 bg-white p-3 rounded-lg border border-slate-200">
                      لا توجد مشاوير نشطة أخرى متاحة حالياً. يمكنك استخدام خيار "إنشاء مشوار منفصل جديد".
                    </div>
                  ) : (
                    <select
                      value={targetTripId}
                      onChange={e => setTargetTripId(e.target.value)}
                      className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-purple-500 bg-white"
                    >
                      <option value="">-- اختر المشوار المستهدف --</option>
                      {candidateTrips.map(ct => {
                        const v = vehicles.find(veh => veh.id === ct.vehicle_id);
                        const d = drivers.find(drv => drv.id === ct.driver_id);
                        return (
                          <option key={ct.id} value={ct.id}>
                            {ct.tripType} - مركبة: ({v?.plateNumber || v?.code || ct.vehicle_id}) - سائق: ({d?.name || ct.driver_id}) - {ct.status}
                          </option>
                        );
                      })}
                    </select>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      المركبة البديلة
                    </label>
                    <select
                      value={newTripVehicleId}
                      onChange={e => setNewTripVehicleId(e.target.value)}
                      className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-purple-500 bg-white"
                    >
                      <option value="">-- اختر المركبة --</option>
                      {vehicles.filter(v => v.id !== currentTrip.vehicle_id && v.status === 'ACTIVE').map(v => (
                        <option key={v.id} value={v.id}>
                          {v.code} - {v.plateNumber} ({v.make} {v.model})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      السائق البديل
                    </label>
                    <select
                      value={newTripDriverId}
                      onChange={e => setNewTripDriverId(e.target.value)}
                      className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-purple-500 bg-white"
                    >
                      <option value="">-- اختر السائق --</option>
                      {drivers.filter(d => d.id !== currentTrip.driver_id).map(d => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  سبب إعادة التوزيع / التوجيه
                </label>
                <input
                  type="text"
                  value={reassignReason}
                  onChange={e => setReassignReason(e.target.value)}
                  placeholder="مثال: تخفيف العبء عن السائق، قرب المركبة الأخرى من الموقع..."
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-purple-500 bg-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => setReassigningStop(null)}
                  className="px-3 py-1.5 text-xs text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  إلغاء
                </button>
                <button
                  onClick={handleConfirmReassign}
                  disabled={loading}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50"
                >
                  {loading ? 'جاري التحويل...' : 'تأكيد إعادة التوزيع'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            يمكنك إضافة مهام، إعادة ترتيب خط السير، أو تحويل أي مهمة معلقة لسائق آخر في أي وقت.
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 text-white rounded-xl text-xs font-bold hover:bg-slate-900 transition"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
