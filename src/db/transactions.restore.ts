import { Transaction, CashVoucher, Notification, ActivityLog, AuditLog } from '../types';
import { db } from '../firebase';
import { StorageEngine } from './storage';
import { UsersModule } from './users';
import { LogsModule } from './logs';
import { StationsModule } from './stations';
import { CompaniesModule } from './companies';
import { TransactionsVoucherModule } from './transactions.voucher';
import { TransactionsHistoryModule } from './transactions.history';
import { CustodyService } from './custodyService';
import { writeBatch, doc } from 'firebase/firestore';
import { DEFAULT_TRANSACTIONS } from './defaults';

const cleanUndefined = (obj: any): any => {
  if (obj === null || obj === undefined) return null;
  if (Array.isArray(obj)) return obj.map(cleanUndefined);
  if (typeof obj === 'object') {
    const cleanObj: any = {};
    Object.keys(obj).forEach(k => {
      if (obj[k] !== undefined) {
        cleanObj[k] = cleanUndefined(obj[k]);
      }
    });
    return cleanObj;
  }
  return obj;
};

export class TransactionsRestoreModule {
  static async restoreTransaction(id: string): Promise<boolean> {
    const user = UsersModule.getActiveUser();
    if (!user) return false;

    const deletedTxList = TransactionsHistoryModule.getDeletedTransactions();
    const delRecord = deletedTxList.find(d => d.id === id || d.transaction_id === id);
    if (!delRecord) {
      console.error('restoreTransaction: Deleted transaction record not found', id);
      return false;
    }

    const txId = delRecord.transaction_id || id;
    const originalStatus = (delRecord.original_status || 'Pending') as any;

    const transactions = StorageEngine.getStored<Transaction[]>('transactions', DEFAULT_TRANSACTIONS);
    const tx = transactions.find(t => t.id === txId || t.id === id);
    if (!tx) {
      console.error('restoreTransaction: Transaction not found in local state', txId);
      return false;
    }

    let isAuthorized = false;
    if (user.role === 'Admin' || user.role === 'SystemAdmin') {
      isAuthorized = true;
    } else if (user.role === 'RegionalManager') {
      const stations = StationsModule.getStations();
      const txStation = stations.find(s => s.id === tx.station_id);
      if (txStation && txStation.region_id === user.region_id) {
        isAuthorized = true;
      } else if (!tx.station_id) {
        isAuthorized = true;
      }
    } else if (user.role === 'StationAdmin') {
      if (tx.station_id === user.station_id) {
        isAuthorized = true;
      }
    } else if (user.id === tx.created_by) {
      isAuthorized = true;
    }

    if (!isAuthorized) {
      LogsModule.addLog(user?.id || 'unknown', user?.full_name || 'Anonymous', 'Access Rejected', `Attempted to restore transaction ${tx.transaction_no} without correct privileges.`);
      return false;
    }

    const stations = StationsModule.getStations();
    const station = stations.find(s => s.id === tx.station_id);
    const stationName = station ? station.station_name : (tx.station_id || 'المحطة الرئيسية');
    
    const regions = StationsModule.getRegions();
    const region = station ? regions.find(r => r.id === station.region_id) : null;
    const regionName = region ? region.name : 'المنطقة الرئيسية';

    const updatedTxs = transactions.map(t => {
      if (t.id === tx.id) {
        return {
          ...t,
          status: originalStatus,
          updated_at: new Date().toISOString()
        };
      }
      return t;
    });

    const vouchers = TransactionsVoucherModule.getCashVouchers();
    let voucherToUpdateOrRecreate: CashVoucher | null = null;
    let isRecreatingVoucher = false;

    if (tx.voucher_no) {
      const existingVoucher = vouchers.find(v => v.voucher_no === tx.voucher_no);
      if (existingVoucher) {
        const expenseIds = existingVoucher.expense_ids || [];
        if (!expenseIds.includes(tx.id)) {
          expenseIds.push(tx.id);
        }
        const newAmount = existingVoucher.amount + tx.amount;
        voucherToUpdateOrRecreate = {
          ...existingVoucher,
          expense_ids: expenseIds,
          amount: newAmount,
          status: (existingVoucher.status === 'Rejected' ? 'Approved' : existingVoucher.status) as any
        };
      } else {
        isRecreatingVoucher = true;
        voucherToUpdateOrRecreate = {
          id: crypto.randomUUID(),
          voucher_no: tx.voucher_no,
          date: tx.voucher_date || tx.date || new Date().toISOString().split('T')[0],
          station_id: tx.station_id || '',
          company_id: tx.company_id || user.company_id || '',
          amount: tx.amount,
          amount_in_words: tx.amount_in_words || { ar: 'مسترجع', en: 'Restored' },
          recipient_name: tx.description || 'Restored Expense',
          status: (originalStatus === 'Settled' ? 'Settled' : 'Approved') as any,
          expense_ids: [tx.id],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
      }
    }

    if (originalStatus === 'Settled') {
      const amount = tx.amount;
      const stationId = tx.station_id;
      if (stationId) {
        const compId = tx.company_id || user.company_id || CompaniesModule.getSelectedCompanyId();
        CustodyService.restoreSettlement(stationId, compId, amount);
      }
    }

    const logId = crypto.randomUUID();
    const logDetails = `Restored transaction ${tx.transaction_no} worth ${tx.amount.toLocaleString()} EGP back to status: ${originalStatus}.`;
    const resolvedCompanyId = tx.company_id || user.company_id || '';
    const newLog: ActivityLog = {
      id: logId,
      user_id: user.id,
      user_name: user.full_name,
      action: 'Restore Transaction',
      details: logDetails,
      timestamp: new Date().toISOString(),
      company_id: resolvedCompanyId
    };

    const auditLogId = crypto.randomUUID();
    const newAuditLog: AuditLog = {
      id: auditLogId,
      user_id: user.id,
      user_name: user.full_name,
      user_role: user.role,
      action_type: 'RESTORE_TRANSACTION',
      description: logDetails,
      timestamp: new Date().toISOString(),
      details: { transaction_id: tx.id, restored_status: originalStatus },
      company_id: resolvedCompanyId
    };

    const notificationsToSend: Notification[] = [];
    const allUsers = UsersModule.getUsers();

    const restoredByRoleAr = user.role === 'StationAdmin' ? 'أمين عهدة محطة' : (user.role === 'RegionalManager' ? 'مدير منطقة' : (user.role === 'Admin' ? 'أدمن الشركة' : 'مشرف النظام'));
    const restoredByRoleEn = user.role === 'StationAdmin' ? 'Station Cashier' : (user.role === 'RegionalManager' ? 'Regional Manager' : (user.role === 'Admin' ? 'Company Admin' : 'System Admin'));

    const notificationTitleAr = `✅ تم استرجاع عملية: ${tx.transaction_no}`;
    const notificationTitleEn = `✅ Restored Transaction: ${tx.transaction_no}`;

    const notificationMessageAr = `قام [${user.full_name}] (${restoredByRoleAr}) باسترجاع عملية رقم (${tx.transaction_no}) بمبلغ (${tx.amount.toLocaleString()} ج.م) التابعة لمحطة [${stationName}]. الحالة المسترجعة: ${originalStatus}`;
    const notificationMessageEn = `[${user.full_name}] (${restoredByRoleEn}) restored transaction (${tx.transaction_no}) worth (${tx.amount.toLocaleString()} EGP) of station [${stationName}]. Restored status: ${originalStatus}`;

    if (user.role === 'StationAdmin') {
      const regionalManagers = allUsers.filter(u => 
        u.role === 'RegionalManager' && 
        u.company_id === tx.company_id && 
        (station && u.region_id === station.region_id)
      );
      const companyAdmins = allUsers.filter(u => u.role === 'Admin' && u.company_id === tx.company_id);

      regionalManagers.concat(companyAdmins).forEach(recipient => {
        notificationsToSend.push({
          id: crypto.randomUUID(),
          user_id: recipient.id,
          title_ar: notificationTitleAr,
          title_en: notificationTitleEn,
          message_ar: notificationMessageAr,
          message_en: notificationMessageEn,
          is_read: false,
          type: 'success',
          related_id: tx.id,
          created_at: new Date().toISOString()
        });
      });
    } else if (user.role === 'RegionalManager') {
      const companyAdmins = allUsers.filter(u => u.role === 'Admin' && u.company_id === tx.company_id);
      companyAdmins.forEach(ca => {
        notificationsToSend.push({
          id: crypto.randomUUID(),
          user_id: ca.id,
          title_ar: notificationTitleAr,
          title_en: notificationTitleEn,
          message_ar: notificationMessageAr,
          message_en: notificationMessageEn,
          is_read: false,
          type: 'success',
          related_id: tx.id,
          created_at: new Date().toISOString()
        });
      });
    }

    try {
      const batch = writeBatch(db);

      const restoredTxObj = {
        ...tx,
        status: originalStatus,
        updated_at: new Date().toISOString()
      };
      batch.set(doc(db, 'transactions', tx.id), cleanUndefined(restoredTxObj));

      if (delRecord) {
        batch.delete(doc(db, 'deleted_transactions', delRecord.id));
      }

      // Sync Station & Company custody back to Firestore
      if (originalStatus === 'Settled' && tx.station_id) {
        const freshStations = StationsModule.getStations();
        const freshStation = freshStations.find(s => s.id === tx.station_id);
        if (freshStation) {
          batch.set(doc(db, 'stations', freshStation.id), cleanUndefined(freshStation));
        }
        const freshCompanies = CompaniesModule.getCompanies();
        const freshComp = freshCompanies.find(c => c.id === (tx.company_id || user.company_id));
        if (freshComp) {
          batch.set(doc(db, 'companies', freshComp.id), cleanUndefined(freshComp));
        }
      }

      if (voucherToUpdateOrRecreate) {
        batch.set(doc(db, 'CashVouchers', voucherToUpdateOrRecreate.id), cleanUndefined(voucherToUpdateOrRecreate));
      }

      notificationsToSend.forEach(ntf => {
        batch.set(doc(db, 'Notifications', ntf.id), cleanUndefined(ntf));
      });

      batch.set(doc(db, 'logs', logId), cleanUndefined(newLog));
      batch.set(doc(db, 'AuditLogs', auditLogId), cleanUndefined(newAuditLog));

      await batch.commit();

      StorageEngine.setStored('transactions', updatedTxs);

      if (delRecord) {
        const remainingDeleted = deletedTxList.filter(d => d.id !== delRecord.id);
        TransactionsHistoryModule.saveDeletedTransactions(remainingDeleted);
      }

      if (voucherToUpdateOrRecreate) {
        const updatedVouchers = vouchers.map(v => v.id === voucherToUpdateOrRecreate!.id ? voucherToUpdateOrRecreate! : v);
        if (isRecreatingVoucher || !vouchers.some(v => v.id === voucherToUpdateOrRecreate!.id)) {
          updatedVouchers.unshift(voucherToUpdateOrRecreate);
        }
        StorageEngine.setStored('CashVouchers', updatedVouchers);
      }

      const currentNotifications = StorageEngine.getStored<Notification[]>('Notifications', []);
      notificationsToSend.forEach(n => currentNotifications.unshift(n));
      StorageEngine.setStored('Notifications', currentNotifications);

      const currentLogs = StorageEngine.getStored<ActivityLog[]>('logs', []);
      currentLogs.unshift(newLog);
      StorageEngine.setStored('logs', currentLogs.slice(0, 150));

      const currentAudit = StorageEngine.getStored<AuditLog[]>('AuditLogs', []);
      currentAudit.unshift(newAuditLog);
      StorageEngine.setStored('AuditLogs', currentAudit);

      return true;
    } catch (err) {
      console.error('Database transaction failed on restore. Error:', err);
      return false;
    }
  }
}
