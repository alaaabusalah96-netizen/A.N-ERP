import { Transaction, DeletedTransaction, Notification, ActivityLog, AuditLog } from '../types';
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

export class TransactionsDeleteModule {
  static async deleteTransaction(id: string, reason: string): Promise<boolean> {
    const user = UsersModule.getActiveUser();
    if (!user) return false;

    const transactions = StorageEngine.getStored<Transaction[]>('transactions', DEFAULT_TRANSACTIONS);
    const tx = transactions.find(t => t.id === id);
    if (!tx) return false;

    if (tx.status === 'Settled') {
      LogsModule.addLog(
        user?.id || 'unknown',
        user?.full_name || 'Anonymous',
        'Delete Rejected',
        `Attempted to delete settled transaction ${tx.transaction_no}. Blocked for security.`
      );
      return false;
    }

    // Permissions check
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
      LogsModule.addLog(user?.id || 'unknown', user?.full_name || 'Anonymous', 'Access Rejected', `Attempted to delete transaction ${tx.transaction_no} without correct privileges.`);
      return false;
    }

    const stations = StationsModule.getStations();
    const station = stations.find(s => s.id === tx.station_id);
    const stationName = station ? station.station_name : (tx.station_id || 'المحطة الرئيسية');
    
    const regions = StationsModule.getRegions();
    const region = station ? regions.find(r => r.id === station.region_id) : null;
    const regionName = region ? region.name : 'المنطقة الرئيسية';

    const updatedTxs = transactions.map(t => {
      if (t.id === id) {
        return {
          ...t,
          status: 'Deleted' as any,
          updated_at: new Date().toISOString()
        };
      }
      return t;
    });

    const vouchers = TransactionsVoucherModule.getCashVouchers();
    const updatedVouchers = vouchers.map(v => {
      if (v.expense_ids && v.expense_ids.includes(id)) {
        const remainingIds = v.expense_ids.filter(eid => eid !== id);
        const newAmount = Math.max(0, v.amount - tx.amount);
        return {
          ...v,
          expense_ids: remainingIds,
          amount: newAmount,
          status: (remainingIds.length === 0 ? 'Rejected' : v.status) as any
        };
      }
      return v;
    });

    const deletedRecordId = crypto.randomUUID();
    const deletedRecord: DeletedTransaction = {
      id: deletedRecordId,
      transaction_id: tx.id,
      transaction_no: tx.transaction_no,
      transaction_data: tx,
      transaction_type: 'Expense',
      amount: tx.amount,
      created_by_name: tx.created_by === 'user-regular' ? 'Mariam Ali' : (tx.created_by === 'user-admin' ? 'Ahmed El-Sayed' : tx.created_by),
      deleted_by_name: user.full_name,
      deleted_by_role: user.role,
      deleted_at: new Date().toISOString(),
      delete_reason: reason,
      station_name: stationName,
      region_name: regionName,
      branch: stationName,
      company_id: tx.company_id || user.company_id || '',
      description: tx.description,
      original_status: tx.status
    };

    const notificationsToSend: Notification[] = [];
    const allUsers = UsersModule.getUsers();

    const deletedByRoleAr = user.role === 'StationAdmin' ? 'أمين عهدة محطة' : (user.role === 'RegionalManager' ? 'مدير منطقة' : (user.role === 'Admin' ? 'أدمن الشركة' : 'مشرف النظام'));
    const deletedByRoleEn = user.role === 'StationAdmin' ? 'Station Cashier' : (user.role === 'RegionalManager' ? 'Regional Manager' : (user.role === 'Admin' ? 'Company Admin' : 'System Admin'));

    const notificationTitleAr = `⚠️ تم حذف عملية: ${tx.transaction_no}`;
    const notificationTitleEn = `⚠️ Deleted Transaction: ${tx.transaction_no}`;

    const notificationMessageAr = `قام [${user.full_name}] (${deletedByRoleAr}) بحذف عملية رقم (${tx.transaction_no}) بمبلغ (${tx.amount.toLocaleString()} ج.م) التابعة لمحطة [${stationName}]. سبب الحذف: ${reason}`;
    const notificationMessageEn = `[${user.full_name}] (${deletedByRoleEn}) deleted transaction (${tx.transaction_no}) worth (${tx.amount.toLocaleString()} EGP) of station [${stationName}]. Reason: ${reason}`;

    if (user.role === 'StationAdmin') {
      const regionalManagers = allUsers.filter(u => 
        u.role === 'RegionalManager' && 
        u.company_id === tx.company_id && 
        (station && u.region_id === station.region_id)
      );

      const companyAdmins = allUsers.filter(u => 
        u.role === 'Admin' && 
        u.company_id === tx.company_id
      );

      regionalManagers.forEach(rm => {
        notificationsToSend.push({
          id: crypto.randomUUID(),
          user_id: rm.id,
          title_ar: notificationTitleAr,
          title_en: notificationTitleEn,
          message_ar: notificationMessageAr,
          message_en: notificationMessageEn,
          is_read: false,
          type: 'warning',
          related_id: deletedRecordId,
          created_at: new Date().toISOString()
        });
      });

      companyAdmins.forEach(ca => {
        notificationsToSend.push({
          id: crypto.randomUUID(),
          user_id: ca.id,
          title_ar: notificationTitleAr,
          title_en: notificationTitleEn,
          message_ar: notificationMessageAr,
          message_en: notificationMessageEn,
          is_read: false,
          type: 'warning',
          related_id: deletedRecordId,
          created_at: new Date().toISOString()
        });
      });

    } else if (user.role === 'RegionalManager') {
      const companyAdmins = allUsers.filter(u => 
        u.role === 'Admin' && 
        u.company_id === tx.company_id
      );

      companyAdmins.forEach(ca => {
        notificationsToSend.push({
          id: crypto.randomUUID(),
          user_id: ca.id,
          title_ar: notificationTitleAr,
          title_en: notificationTitleEn,
          message_ar: notificationMessageAr,
          message_en: notificationMessageEn,
          is_read: false,
          type: 'warning',
          related_id: deletedRecordId,
          created_at: new Date().toISOString()
        });
      });
    }

    const logId = crypto.randomUUID();
    const logDetails = `Deleted transaction ${tx.transaction_no} worth ${tx.amount.toLocaleString()} EGP. Reason: ${reason}`;
    const resolvedCompanyId = tx.company_id || user.company_id || '';
    const newLog: ActivityLog = {
      id: logId,
      user_id: user.id,
      user_name: user.full_name,
      action: 'Delete Transaction',
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
      action_type: 'DELETE_TRANSACTION',
      description: logDetails,
      timestamp: new Date().toISOString(),
      details: { before: tx, delete_reason: reason },
      company_id: resolvedCompanyId
    };

    try {
      const batch = writeBatch(db);

      // Rollback custody if Settled
      if ((tx.status as any) === 'Settled') {
        const amount = tx.amount;
        const stationId = tx.station_id;
        if (stationId) {
          const compId = tx.company_id || user.company_id || CompaniesModule.getSelectedCompanyId();
          CustodyService.rollbackSettlement(stationId, compId, amount);
          
          // Re-load the modified records to commit them via batch safely
          const freshStations = StationsModule.getStations();
          const freshStation = freshStations.find(s => s.id === stationId);
          if (freshStation) {
            batch.set(doc(db, 'stations', stationId), cleanUndefined(freshStation));
          }
          const freshCompanies = CompaniesModule.getCompanies();
          const freshComp = freshCompanies.find(c => c.id === compId);
          if (freshComp) {
            batch.set(doc(db, 'companies', compId), cleanUndefined(freshComp));
          }
        }
      }

      const updatedTxObj = {
        ...tx,
        status: 'Deleted' as any,
        updated_at: new Date().toISOString()
      };
      batch.set(doc(db, 'transactions', tx.id), cleanUndefined(updatedTxObj));

      updatedVouchers.forEach(v => {
        if (v.expense_ids && v.expense_ids.length === 0) {
          batch.delete(doc(db, 'CashVouchers', v.id));
        } else {
          batch.set(doc(db, 'CashVouchers', v.id), cleanUndefined(v));
        }
      });

      batch.set(doc(db, 'deleted_transactions', deletedRecordId), cleanUndefined(deletedRecord));

      notificationsToSend.forEach(ntf => {
        batch.set(doc(db, 'Notifications', ntf.id), cleanUndefined(ntf));
      });

      batch.set(doc(db, 'logs', logId), cleanUndefined(newLog));
      batch.set(doc(db, 'AuditLogs', auditLogId), cleanUndefined(newAuditLog));

      await batch.commit();

      StorageEngine.setStored('transactions', updatedTxs);

      const currentDeleted = TransactionsHistoryModule.getDeletedTransactions();
      currentDeleted.unshift(deletedRecord);
      TransactionsHistoryModule.saveDeletedTransactions(currentDeleted);

      const remainingVouchers = updatedVouchers.filter(v => v.expense_ids && v.expense_ids.length > 0);
      StorageEngine.setStored('CashVouchers', remainingVouchers);

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
      console.error('Database transaction failed. Changes rolled back. Error:', err);
      return false;
    }
  }
}
