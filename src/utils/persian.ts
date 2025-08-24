import { DateTime } from 'luxon';
import { TEHRAN_TIMEZONE, PERSIAN_MONTHS, MS_PER_DAY, REFERENCE_PERSIAN_YEAR, REFERENCE_PERSIAN_MONTH, REFERENCE_PERSIAN_DAY, REFERENCE_STATUS } from '../config/constants';
import type { PersianDate } from '../types';

/**
 * Validates Persian date components
 */
export function isValidPersianDate(year: number, month: number, day: number): boolean {
  try {
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
    if (year < 1300 || year > 1500 || month < 1 || month > 12 || day < 1) return false;
    if (month <= 6 && day > 31) return false;
    if (month >= 7 && month <= 11 && day > 30) return false;
    if (month === 12) {
      const rem = year % 33;
      const isLeapYear = [1, 5, 9, 13, 17, 22, 26, 30].includes(rem);
      if (day > (isLeapYear ? 30 : 29)) return false;
    }
    return true;
  } catch (e) {
    console.error(`Error in isValidPersianDate: ${e}`);
    return false;
  }
}

/**
 * Parses Persian date string in various formats
 */
export function parsePersianDate(dateStr: string): PersianDate | null {
  try {
    if (!dateStr) return null;
    dateStr = String(dateStr).trim();
    
    // Convert Persian/Arabic digits to English
    const persianArabicDigits = /[۰-۹٠-٩]/g;
    const digitMap: { [key: string]: number } = {
      '۰': 0, '۱': 1, '۲': 2, '۳': 3, '۴': 4, '۵': 5, '۶': 6, '۷': 7, '۸': 8, '۹': 9,
      '٠': 0, '١': 1, '٢': 2, '٣': 3, '٤': 4, '٥': 5, '٦': 6, '٧': 7, '٨': 8, '٩': 9
    };
    dateStr = dateStr.replace(persianArabicDigits, d => String(digitMap[d]));
    dateStr = dateStr.replace(/[^\d\/\-\.]/g, ''); // Keep only digits and separators
    
    let parts: string[] = [];
    if (dateStr.includes('/')) parts = dateStr.split('/');
    else if (dateStr.includes('-')) parts = dateStr.split('-');
    else if (dateStr.includes('.')) parts = dateStr.split('.');
    else if (dateStr.length === 8 && /^\d{8}$/.test(dateStr)) {
      parts = [dateStr.substring(0, 4), dateStr.substring(4, 6), dateStr.substring(6, 8)];
    }
    else if (dateStr.length === 6 && /^\d{6}$/.test(dateStr)) {
      parts = ["14" + dateStr.substring(0, 2), dateStr.substring(2, 4), dateStr.substring(4, 6)];
    }
    else return null;
    
    if (parts.length !== 3) return null;
    
    const p1 = parseInt(parts[0], 10);
    const p2 = parseInt(parts[1], 10);
    const p3 = parseInt(parts[2], 10);
    
    if (isNaN(p1) || isNaN(p2) || isNaN(p3)) return null;
    
    let year: number, month: number, day: number;
    
    // Try different date formats
    if (p1 >= 1300 && p1 <= 1500 && p2 >= 1 && p2 <= 12 && p3 >= 1 && p3 <= 31) {
      year = p1; month = p2; day = p3; // YYYY/MM/DD
    }
    else if (p3 >= 1300 && p3 <= 1500 && p2 >= 1 && p2 <= 12 && p1 >= 1 && p1 <= 31) {
      year = p3; month = p2; day = p1; // DD/MM/YYYY
    }
    else if (p1 >= 1300 && p1 <= 1500 && p3 >= 1 && p3 <= 12 && p2 >= 1 && p2 <= 31) {
      year = p1; month = p3; day = p2; // YYYY/DD/MM
    }
    else if (p1 >= 0 && p1 <= 99 && p2 >= 1 && p2 <= 12 && p3 >= 1 && p3 <= 31) {
      year = 1400 + p1; month = p2; day = p3; // YY/MM/DD (Assume 14YY)
    }
    else return null;
    
    if (!isValidPersianDate(year, month, day)) return null;
    return { year, month, day };
  } catch (e) {
    console.error(`Date parse exception: ${e}`);
    return null;
  }
}

/**
 * Gets Persian month name by number
 */
export function getPersianMonthName(monthNumber: number): string {
  const month = parseInt(String(monthNumber));
  return (month >= 1 && month <= 12) ? PERSIAN_MONTHS[month - 1] : "نامعتبر";
}

/**
 * Converts Jalali (Persian) date to Gregorian
 */
export function jalaliToGregorian(jy: number, jm: number, jd: number): [number, number, number] | null {
  try {
    jy = parseInt(String(jy));
    jm = parseInt(String(jm));
    jd = parseInt(String(jd));
    
    if (isNaN(jy) || isNaN(jm) || isNaN(jd)) {
      throw new Error("Invalid input to jalaliToGregorian");
    }
    
    let gy = jy <= 979 ? 621 : 1600;
    jy -= jy <= 979 ? 0 : 979;
    
    let days = 365 * jy + Math.floor(jy / 33) * 8 + Math.floor(((jy % 33) + 3) / 4) + 78 + jd + 
               (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
    
    gy += 400 * Math.floor(days / 146097);
    days %= 146097;
    
    if (days > 36524) {
      gy += 100 * Math.floor(--days / 36524);
      days %= 36524;
      if (days >= 365) days++;
    }
    
    gy += 4 * Math.floor(days / 1461);
    days %= 1461;
    gy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
    
    let gd = days + 1;
    const sal_a = [0, 31, (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    
    let gm: number;
    for (gm = 0; gm < 13 && gd > sal_a[gm]; gm++) gd -= sal_a[gm];
    
    return [gy, gm, gd];
  } catch (e) {
    console.error(`Error in jalaliToGregorian(${jy},${jm},${jd}): ${e}`);
    return null;
  }
}

/**
 * Gets current Persian date string
 */
export function getPersianDate(): string {
  try {
    const now = DateTime.now().setZone(TEHRAN_TIMEZONE);
    const weekday = now.setLocale("fa-IR").toLocaleString({ weekday: "long" });
    const day = now.setLocale("fa-IR-u-nu-latn").toLocaleString({ day: "numeric" });
    const month = now.setLocale("fa-IR").toLocaleString({ month: "long" });
    const year = now.setLocale("fa-IR-u-nu-latn").toLocaleString({ year: "numeric" });
    
    if (!weekday || !day || !month || !year) {
      throw new Error("One or more Persian date components could not be retrieved.");
    }
    
    return `📅 امروز ${weekday} ${day} ${month} سال ${year} است`;
  } catch (e) {
    console.error(`Error generating Persian date: ${e}`);
    const fallbackDate = DateTime.now().setZone(TEHRAN_TIMEZONE).toISODate();
    return `📅 Date (Gregorian): ${fallbackDate} (Error displaying Persian date)`;
  }
}

/**
 * Gets start of Persian week (Saturday) in UTC
 */
export function getStartOfWeekPersian(date: Date): Date {
  const targetDate = new Date(date.getTime());
  const dayOfWeekUTC = targetDate.getUTCDay(); // Sunday = 0, Saturday = 6
  const daysToSubtract = (dayOfWeekUTC + 1) % 7;
  targetDate.setUTCDate(targetDate.getUTCDate() - daysToSubtract);
  targetDate.setUTCHours(0, 0, 0, 0);
  return targetDate;
}

/**
 * Determines current week status (odd/even)
 */
export function getWeekStatus(): string {
  try {
    // Calculate reference date in Gregorian
    const refGregorianArray = jalaliToGregorian(REFERENCE_PERSIAN_YEAR, REFERENCE_PERSIAN_MONTH, REFERENCE_PERSIAN_DAY);
    if (!refGregorianArray || refGregorianArray.length !== 3) {
      throw new Error("jalaliToGregorian returned invalid data.");
    }
    
    const REFERENCE_DATE_GREGORIAN = new Date(Date.UTC(refGregorianArray[0], refGregorianArray[1] - 1, refGregorianArray[2]));
    REFERENCE_DATE_GREGORIAN.setUTCHours(0, 0, 0, 0);
    
    if (isNaN(REFERENCE_DATE_GREGORIAN.getTime())) {
      throw new Error("Calculated Gregorian reference date is invalid.");
    }
    
    const now = DateTime.now().setZone(TEHRAN_TIMEZONE);
    const todayTehranAsUTC = new Date(Date.UTC(now.year, now.month - 1, now.day));
    todayTehranAsUTC.setUTCHours(0, 0, 0, 0);
    
    const currentWeekStartDate = getStartOfWeekPersian(todayTehranAsUTC);
    const referenceWeekStartDate = getStartOfWeekPersian(REFERENCE_DATE_GREGORIAN);
    
    if (isNaN(currentWeekStartDate.getTime()) || isNaN(referenceWeekStartDate.getTime())) {
      throw new Error("Invalid date calculation");
    }
    
    const timeDifference = currentWeekStartDate.getTime() - referenceWeekStartDate.getTime();
    const daysDifference = Math.floor(timeDifference / MS_PER_DAY);
    const weeksPassed = Math.floor(daysDifference / 7);
    
    const currentStatus = weeksPassed % 2 === 0 
      ? REFERENCE_STATUS 
      : (REFERENCE_STATUS as string) === "زوج" ? "فرد" : "زوج";
    
    return currentStatus;
  } catch (e) {
    console.error(`Error in getWeekStatus: ${e}`);
    return "نامشخص (خطا)";
  }
}

/**
 * Reshapes Persian text for PDF display (fixes reversed text issue)
 * This is an improved version that handles mixed LTR/RTL content better
 */
export function reshapePersianText(text: string): string {
  if (typeof text !== 'string' || !text.trim()) {
    return text; // Return as is if not a non-empty string
  }
  
  const persianRegex = /[\u0600-\u06FF]/;
  if (!persianRegex.test(text)) {
    return text; // If no Persian characters, return as is (e.g., "-")
  }
  
  // Handle mixed content by splitting on spaces and processing each word
  const words = text.split(' ');
  const processedWords = words.map(word => {
    // If word contains Persian characters, reverse it
    if (persianRegex.test(word)) {
      // Check if it's purely Persian or mixed
      const hasNumbers = /\d/.test(word);
      const hasEnglish = /[a-zA-Z]/.test(word);
      
      if (hasNumbers || hasEnglish) {
        // For mixed content, we need more sophisticated handling
        // For now, just return as is to avoid breaking numbers/English
        return word;
      } else {
        // Pure Persian word - reverse it
        return word.split('').reverse().join('');
      }
    }
    return word; // Non-Persian word, return as is
  });
  
  return processedWords.join(' ');
}