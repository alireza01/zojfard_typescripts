import { SCHEDULE_TIME_REGEX, LUNCH_START_MINUTES, LUNCH_END_MINUTES } from '../config/constants';
import type { ScheduleLesson } from '../types';

/**
 * Parses time string to minutes since midnight
 */
export function parseTime(timeStr: string): number | null {
  if (!timeStr || !SCHEDULE_TIME_REGEX.test(timeStr)) {
    console.warn(`Invalid time format for parsing: ${timeStr}`);
    return null;
  }
  
  try {
    const parts = timeStr.split(":");
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    
    if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      console.warn(`Invalid time values after parsing: ${timeStr}`);
      return null;
    }
    
    return hours * 60 + minutes;
  } catch (e) {
    console.error(`Error parsing time string ${timeStr}:`, e);
    return null;
  }
}

/**
 * Formats duration in minutes to Persian text
 */
export function formatDuration(totalMinutes: number): string {
  if (totalMinutes <= 0) return "-";
  
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const result: string[] = [];
  
  if (hours > 0) result.push(`${hours} ساعت`);
  if (minutes > 0) result.push(`${minutes} دقیقه`);
  
  return result.join(" و ") || "-";
}

/**
 * Calculates idle time between two lessons
 */
export function calculateIdleTime(prevLesson: ScheduleLesson | undefined, currLesson: ScheduleLesson | undefined): string {
  try {
    const prevEnd = parseTime(prevLesson?.end_time || '');
    const currStart = parseTime(currLesson?.start_time || '');
    
    if (prevEnd === null || currStart === null || prevEnd >= currStart) return "-";
    
    let idleMinutes = 0;
    
    // Handle lunch break
    if (prevEnd < LUNCH_END_MINUTES && currStart > LUNCH_START_MINUTES) {
      const idleBeforeLunch = Math.max(0, LUNCH_START_MINUTES - prevEnd);
      const idleAfterLunch = Math.max(0, currStart - LUNCH_END_MINUTES);
      idleMinutes = idleBeforeLunch + idleAfterLunch;
    } else {
      idleMinutes = currStart - prevEnd;
    }
    
    return idleMinutes > 0 ? formatDuration(idleMinutes) : "-";
  } catch (e) {
    console.error("Error calculating idle time:", e);
    return "خطا";
  }
}

/**
 * Validates time format
 */
export function isValidTimeFormat(timeStr: string): boolean {
  return SCHEDULE_TIME_REGEX.test(timeStr);
}