/**
 * @file dualCalendar.ts
 * @description Dual Hijri (Umm al-Qura) & Gregorian Calendar Utilities for A.N ERP
 * Complies with Section 1A (توجيه RTL كامل، تقويم مزدوج: هجري أم القرى + ميلادي).
 */

export interface DualDateDisplay {
  gregorianFormatted: string;
  hijriFormatted: string;
  combinedFormatted: string;
}

export class DualCalendar {
  /**
   * Formats a given date (or current date) into Arabic Hijri (Umm al-Qura) and Gregorian representation
   */
  public static format(date = new Date()): DualDateDisplay {
    // 1. Gregorian formatting in Arabic locale
    const gregorianFormatter = new Intl.DateTimeFormat('ar-SA', {
      calendar: 'gregory',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const gregorianFormatted = `${gregorianFormatter.format(date)} م`;

    // 2. Hijri formatting (Islamic / Umm al-Qura)
    const hijriFormatter = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', {
      calendar: 'islamic-umalqura',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const hijriFormatted = `${hijriFormatter.format(date)} هـ`;

    const combinedFormatted = `${hijriFormatted} | ${gregorianFormatted}`;

    return {
      gregorianFormatted,
      hijriFormatted,
      combinedFormatted,
    };
  }

  /**
   * Formats short operational date (e.g. 1448/03/24 هـ - 2026/09/13 م)
   */
  public static formatShort(date = new Date()): string {
    const gregStr = date.toISOString().split('T')[0];
    const hijriFormatter = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', {
      calendar: 'islamic-umalqura',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return `${hijriFormatter.format(date)} هـ (${gregStr} م)`;
  }
}
