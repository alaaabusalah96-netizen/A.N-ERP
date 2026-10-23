import React from 'react';
import { Plus, Users, Phone, Mail, Hash, Eye } from 'lucide-react';
import { PurchasingBusinessEngine } from '../../lib/enterprise/purchasing_engine';
import { Vendor } from '../../types/purchasing';

export interface PurchasingVendorsTabProps {
  isRtl: boolean;
  companyId: string;
  vendors: Vendor[];
  setShowAddVendor: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedVendorForStatement: React.Dispatch<React.SetStateAction<Vendor | null>>;
}

export default function PurchasingVendorsTab({
  isRtl,
  companyId,
  vendors,
  setShowAddVendor,
  setSelectedVendorForStatement
}: PurchasingVendorsTabProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-extrabold text-slate-800 dark:text-slate-100">
            {isRtl ? 'دليل الموردين وكشوف حسابات الدائنين (AP Ledger)' : 'Vendors Directory & Accounts Payable Ledger'}
          </h2>
          <p className="text-xs text-slate-500">
            {isRtl ? 'إدارة الموردين والاطلاع على كشف حساب الشحنات والمسدادات والرصيد المتبقي' : 'Vendor contacts and detailed financial statement history'}
          </p>
        </div>
        <button
          onClick={() => setShowAddVendor(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md transition-all"
        >
          <Plus className="h-4 w-4" />
          {isRtl ? 'إضافة مورد جديد' : 'New Vendor'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {vendors.length === 0 ? (
          <div className="col-span-full text-center py-12 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800">
            <Users className="h-12 w-12 text-slate-400 mx-auto mb-3 opacity-50" />
            <p className="text-sm font-bold text-slate-600 dark:text-slate-400">
              {isRtl ? 'لا يوجد موردون مسجلون بعد' : 'No vendors registered yet'}
            </p>
          </div>
        ) : (
          vendors.map(vendor => {
            const stmt = PurchasingBusinessEngine.getVendorAPStatement(companyId, vendor.id);

            return (
              <div key={vendor.id} className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-all space-y-3 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded-lg">
                      {vendor.code}
                    </span>
                    <span className="text-[10px] bg-emerald-500/10 text-emerald-600 px-2 py-0.5 rounded-full font-bold">
                      {vendor.status}
                    </span>
                  </div>

                  <h3 className="font-extrabold text-slate-900 dark:text-slate-100 text-base">
                    {isRtl ? vendor.nameAr : vendor.nameEn}
                  </h3>

                  <div className="space-y-1 text-xs text-slate-500">
                    {vendor.phone && <p className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-slate-400" />{vendor.phone}</p>}
                    {vendor.email && <p className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-slate-400" />{vendor.email}</p>}
                    {vendor.taxNo && <p className="flex items-center gap-1.5"><Hash className="h-3.5 w-3.5 text-slate-400" />{isRtl ? 'الرقم الضريبي:' : 'Tax:'} {vendor.taxNo}</p>}
                  </div>
                </div>

                {/* Quick Financial Summary */}
                <div className="bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-100 dark:border-slate-800 space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">{isRtl ? 'إجمالي المشتريات:' : 'Invoiced:'}</span>
                    <span className="font-bold">{stmt.totalInvoiced.toLocaleString()} EGP</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">{isRtl ? 'إجمالي المسدد:' : 'Paid:'}</span>
                    <span className="font-bold text-emerald-600">{stmt.totalPaid.toLocaleString()} EGP</span>
                  </div>
                  <div className="flex justify-between text-xs border-t border-slate-200 dark:border-slate-700 pt-1">
                    <span className="font-bold text-slate-700 dark:text-slate-300">{isRtl ? 'صافي المتبقي للمورد:' : 'Net Payable:'}</span>
                    <span className="font-extrabold text-indigo-600">{stmt.netBalance.toLocaleString()} EGP</span>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedVendorForStatement(vendor)}
                  className="w-full py-2 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 text-indigo-600 border border-indigo-200 dark:border-indigo-800 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                >
                  <Eye className="h-3.5 w-3.5" />
                  {isRtl ? 'عرض كشف حساب المورد (Ledger)' : 'View Statement'}
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
