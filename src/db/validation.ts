import { Transaction, AppUser, CashVoucher } from '../types';
import { UsersModule } from './users';
import { CompaniesModule } from './companies';
import { StationsModule } from './stations';
import { StorageEngine } from './storage';
import { db } from '../firebase';
import { doc, runTransaction } from 'firebase/firestore';

export class ValidationEngine {
  static validateTransaction(
    data: Partial<Transaction>,
    user: AppUser | null
  ): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 1. Required Fields
    if (data.amount === undefined || data.amount === null) {
      errors.push('المبلغ مطلوب / Amount is required.');
    }
    if (!data.description || data.description.trim() === '') {
      errors.push('الوصف مطلوب / Description is required.');
    }
    if (!data.category_id) {
      errors.push('التصنيف مطلوب / Category is required.');
    }

    // 2. Amount Validation
    if (data.amount !== undefined && data.amount !== null) {
      if (typeof data.amount !== 'number' || isNaN(data.amount) || data.amount <= 0) {
        errors.push('يجب أن يكون المبلغ قيمة موجبة أكبر من صفر / Amount must be a positive number greater than zero.');
      }
    }

    // 3. Date Validation
    if (data.date) {
      const parsedDate = new Date(data.date);
      if (isNaN(parsedDate.getTime())) {
        errors.push('صيغة التاريخ غير صحيحة / Invalid date format.');
      } else {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 2); // Allow slight timezone differences
        if (parsedDate > tomorrow) {
          errors.push('لا يمكن تسجيل عملية بتاريخ مستقبلي / Cannot register a transaction with a future date.');
        }
      }
    }

    // 4. Company & Station & Region validation
    const targetCompanyId = data.company_id || user?.company_id || CompaniesModule.getSelectedCompanyId();
    if (!targetCompanyId) {
      errors.push('الشركة غير محددة / Company is not specified.');
    } else {
      const companies = CompaniesModule.getCompanies();
      if (!companies.some(c => c.id === targetCompanyId)) {
        errors.push('الشركة المحددة غير صالحة / The specified company is invalid.');
      }
    }

    const targetStationId = data.station_id || user?.station_id;
    if (!targetStationId) {
      errors.push('يجب ربط الحركة بمحطة أو فرع محدد / A station must be specified for this transaction.');
    } else {
      const stations = StationsModule.getStations();
      const station = stations.find(s => s.id === targetStationId);
      if (!station) {
        errors.push('المحطة المحددة غير صالحة / The specified station is invalid.');
      } else if (station.company_id !== targetCompanyId) {
        errors.push('المحطة لا تتبع الشركة المحددة / Station does not belong to the selected company.');
      }
    }

    // 5. Category Validation
    if (data.category_id) {
      const categories = StorageEngine.getStored<any[]>('categories', []);
      if (!categories.some(cat => cat.id === data.category_id)) {
        errors.push('التصنيف المحدد غير موجود بالنظام / Selected expense category does not exist.');
      }
    }

    // 6. Voucher details validation
    if (data.status === 'Under Settlement' && !data.voucher_no) {
      errors.push('رقم السند مطلوب للتسوية / Voucher number is required for under-settlement status.');
    }

    // 7. Permission Validation
    if (user) {
      const isSystemAdmin = user.role === 'SystemAdmin';
      const isStationAdmin = user.role === 'StationAdmin';
      
      if (!isSystemAdmin) {
        const perms = user.permissions;
        if (data.id) {
          // Update validation
          if (!perms?.edit_expense) {
            errors.push('ليس لديك صلاحية تعديل المعاملات / You do not have permission to edit transactions.');
          }
        } else {
          // Create validation
          if (!perms?.create_expense) {
            errors.push('ليس لديك صلاحية إنشاء معاملة / You do not have permission to create transactions.');
          }
        }
      }
    }

    // 8. Prevent duplicate transaction_no or invoice_no in the same station (excluding Deleted ones)
    if (data.transaction_no && data.transaction_no.trim() !== '') {
      const txNo = data.transaction_no.trim();
      const stationId = data.station_id || user?.station_id;
      if (stationId) {
        const txs = StorageEngine.getStored<Transaction[]>('transactions', []);
        const isDuplicate = txs.some(t => 
          t.id !== data.id && 
          t.status !== 'Deleted' && 
          (t.status as string) !== 'deleted' &&
          t.station_id === stationId && 
          ((t.transaction_no || '').trim().toLowerCase() === txNo.toLowerCase() || 
           (t.invoice_no && t.invoice_no.trim().toLowerCase() === txNo.toLowerCase()))
        );
        if (isDuplicate) {
          errors.push('رقم المستند مكرر لهذه المحطة / Document number is duplicated for this station.');
        }
      }
    }

    if (data.invoice_no && data.invoice_no.trim() !== '') {
      const invNo = data.invoice_no.trim();
      const stationId = data.station_id || user?.station_id;
      if (stationId) {
        const txs = StorageEngine.getStored<Transaction[]>('transactions', []);
        const isDuplicate = txs.some(t => 
          t.id !== data.id && 
          t.status !== 'Deleted' && 
          (t.status as string) !== 'deleted' &&
          t.station_id === stationId && 
          ((t.invoice_no && t.invoice_no.trim().toLowerCase() === invNo.toLowerCase()) ||
           (t.transaction_no || '').trim().toLowerCase() === invNo.toLowerCase())
        );
        if (isDuplicate) {
          errors.push('رقم الفاتورة مكرر لهذه المحطة / Invoice number is duplicated for this station.');
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  static validateVoucher(
    data: Partial<CashVoucher>,
    user: AppUser | null
  ): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!data.voucher_no || data.voucher_no.trim() === '') {
      errors.push('رقم السند مطلوب / Voucher number is required.');
    }

    if (data.amount === undefined || data.amount === null || data.amount <= 0) {
      errors.push('يجب أن يكون مبلغ السند قيمة موجبة / Voucher amount must be a positive number.');
    }

    if (!data.expense_ids || data.expense_ids.length === 0) {
      errors.push('يجب ربط السند بمصروف واحد على الأقل / Voucher must be linked to at least one expense.');
    }

    if (user && user.role !== 'SystemAdmin') {
      const perms = user.permissions;
      if (!perms?.create_voucher) {
        errors.push('ليس لديك صلاحية إنشاء سند صرف / You do not have permission to create cash vouchers.');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

export async function reserveInvoiceNumber(stationId: string, invoiceNo: string): Promise<boolean> {
  const cleanInvoiceNo = invoiceNo.trim().toLowerCase();
  const uniqueKey = `${stationId}_${cleanInvoiceNo}`;
  const lockRef = doc(db, 'unique_invoice_locks', uniqueKey);
  
  try {
    // محاولة إنشاء المستند ذرياً بشرط عدم وجوده مسبقاً لمنع التكرار والتصادم تحت الضغط العالي
    const success = await runTransaction(db, async (transaction) => {
      const docSnapshot = await transaction.get(lockRef);
      if (docSnapshot.exists()) {
        return false; // المستند موجود بالفعل، فشل حجز الرقم المكرر
      }
      transaction.set(lockRef, {
        reserved_at: new Date().toISOString(),
        station_id: stationId,
        invoice_no: cleanInvoiceNo
      });
      return true; // نجح الحجز الحصري
    });
    return success;
  } catch (error) {
    console.error('Error reserving invoice number in transaction:', error);
    return false;
  }
}

export * from './companyGuard';
