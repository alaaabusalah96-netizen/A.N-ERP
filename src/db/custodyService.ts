import { Station, Company } from '../types';
import { db } from '../firebase';
import { doc, updateDoc, increment } from 'firebase/firestore';

export class CustodyService {
  static async updateStationCustodyAtomic(stationId: string, amountChange: number): Promise<void> {
    if (!stationId) return;
    
    // الاعتماد الحصري والذري الكامل على خادم Firestore لتفادي تصادم الشبكة و Race Conditions
    const stationRef = doc(db, 'stations', stationId);
    await updateDoc(stationRef, {
      custody_amount: increment(amountChange)
    });
  }

  static async updateCompanyCustodyAtomic(companyId: string, amountChange: number): Promise<void> {
    if (!companyId) return;
    
    // الاعتماد الحصري والذري الكامل على خادم Firestore لتفادي تصادم الشبكة و Race Conditions
    const companyRef = doc(db, 'companies', companyId);
    await updateDoc(companyRef, {
      custody_value: increment(amountChange)
    });
  }

  static updateStationCustody(stationId: string, amountChange: number): void {
    if (!stationId) return;
    CustodyService.updateStationCustodyAtomic(stationId, amountChange).catch(err => {
      console.error('Failed to update station custody atomically:', err);
    });
  }

  static updateCompanyCustody(companyId: string, amountChange: number): void {
    if (!companyId) return;
    CustodyService.updateCompanyCustodyAtomic(companyId, amountChange).catch(err => {
      console.error('Failed to update company custody atomically:', err);
    });
  }

  static applySettlement(stationId: string, companyId: string, amount: number): void {
    CustodyService.updateStationCustody(stationId, -amount);
    CustodyService.updateCompanyCustody(companyId, -amount);
  }

  static rollbackSettlement(stationId: string, companyId: string, amount: number): void {
    CustodyService.updateStationCustody(stationId, amount);
    CustodyService.updateCompanyCustody(companyId, amount);
  }

  static restoreSettlement(stationId: string, companyId: string, amount: number): void {
    // Restoration of a deleted settled expense means we re-deduct it from the active custody
    CustodyService.updateStationCustody(stationId, -amount);
    CustodyService.updateCompanyCustody(companyId, -amount);
  }
}

