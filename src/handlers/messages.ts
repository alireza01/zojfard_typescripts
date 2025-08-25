import type { TelegramMessage, ScheduleLesson, UserState } from '../types';
import { TelegramService } from '../services/telegram';
import { DatabaseService } from '../services/database';
import { StateService } from '../services/state';
import { BOT_MESSAGES } from '../config/constants';
import { isValidTimeFormat } from '../utils/time';
import { parsePersianDate, jalaliToGregorian, getPersianMonthName } from '../utils/persian';

export class MessageHandler {
  constructor(
    private telegram: TelegramService,
    private database: DatabaseService,
    private state: StateService,
    private adminChatId: string
  ) {}

  /**
   * Handles text messages - Complete implementation matching original JS
   */
  async handleMessage(message: TelegramMessage): Promise<void> {
    const user = message.from;
    const chat = message.chat;
    const text = message.text;

    if (!user || !text) return;

    // Log usage
    await this.database.logUsage(user, chat, 'message');

    // Check if user has an active state (waiting for input)
    const userState = await this.state.getState(user.id);
    if (userState) {
      await this.handleStateBasedMessage(message, userState);
      return;
    }

    // Check if it's a class addition format
    if (this.isClassAdditionFormat(text)) {
      await this.handleClassAddition(message, text);
      return;
    }

    // Check if it's a broadcast message from admin
    if (String(chat.id) === this.adminChatId && message.reply_to_message) {
      await this.handleBroadcastMessage(message);
      return;
    }

    // Default response for unrecognized messages in private chat only
    if (chat.type === "private") {
      await this.telegram.sendMessage(
        chat.id,
        "❓ متوجه نشدم. لطفاً از دستورات موجود استفاده کنید یا /help را بزنید."
      );
    }
  }

  /**
   * Handles state-based messages (when user is expected to provide input)
   */
  private async handleStateBasedMessage(message: TelegramMessage, userState: UserState): Promise<void> {
    const user = message.from!;
    const chat = message.chat;

    try {
      let stateShouldBeCleared = true;

      if (userState.name === "awaiting_lesson_details") {
        const success = await this.handleLessonDetailsInput(message, userState.data);
        if (!success) {
          stateShouldBeCleared = false; // Don't clear state if format was invalid, let user retry
        }
      } else if (userState.name === "awaiting_teleport_date") {
        await this.handleTeleportDateInput(message);
      }
      
      if (stateShouldBeCleared) {
        await this.state.deleteState(user.id);
      }
    } catch (error) {
      console.error('Error handling state-based message:', error);
      await this.telegram.sendMessage(chat.id, BOT_MESSAGES.ERROR_OCCURRED);
      await this.state.deleteState(user.id); // Clear state on unexpected error
    }
  }

  /**
   * Handles lesson details input when user is adding a new lesson.
   * Returns true on success, false on validation failure.
   */
  private async handleLessonDetailsInput(message: TelegramMessage, stateData: any): Promise<boolean> {
    const user = message.from!;
    const chat = message.chat;
    const text = message.text!;
    const { weekType, day } = stateData;

    if (!this.isClassAdditionFormat(text)) {
      await this.telegram.sendMessage(chat.id, BOT_MESSAGES.INVALID_FORMAT);
      return false;
    }

    const parts = text.split('-').map(part => part.trim());
    const [lessonName, startTime, endTime, location] = parts;

    // Validate time format
    if (!isValidTimeFormat(startTime) || !isValidTimeFormat(endTime)) {
      await this.telegram.sendMessage(chat.id, BOT_MESSAGES.INVALID_TIME);
      return false;
    }

    // Parse start and end times to compare
    const startMinutes = this.parseTimeToMinutes(startTime);
    const endMinutes = this.parseTimeToMinutes(endTime);

    if (startMinutes >= endMinutes) {
      await this.telegram.sendMessage(chat.id, BOT_MESSAGES.INVALID_TIME_ORDER);
      return false;
    }

    const lesson: ScheduleLesson = {
      lesson: lessonName,
      start_time: startTime,
      end_time: endTime,
      location: location
    };

    try {
      await this.database.saveUserSchedule(user.id, weekType, day, lesson);
      await this.telegram.sendMessage(chat.id, BOT_MESSAGES.CLASS_ADDED);
      return true;
    } catch (error) {
      console.error('Error saving lesson:', error);
      await this.telegram.sendMessage(chat.id, BOT_MESSAGES.ERROR_OCCURRED);
      return true; // Still clear state on unexpected DB error
    }
  }

  /**
   * Handles teleport date input
   */
  private async handleTeleportDateInput(message: TelegramMessage): Promise<void> {
    const user = message.from!;
    const chat = message.chat;
    const text = message.text!;

    const parsedDate = parsePersianDate(text);
    if (!parsedDate) {
      await this.telegram.sendMessage(chat.id, BOT_MESSAGES.TELEPORT_INVALID);
      return;
    }

    try {
      const gregorianArray = jalaliToGregorian(parsedDate.year, parsedDate.month, parsedDate.day);
      if (!gregorianArray) {
        await this.telegram.sendMessage(chat.id, BOT_MESSAGES.TELEPORT_INVALID);
        return;
      }

      const targetDate = new Date(Date.UTC(gregorianArray[0], gregorianArray[1] - 1, gregorianArray[2]));
      const now = new Date();
      
      if (targetDate <= now) {
        await this.telegram.sendMessage(chat.id, BOT_MESSAGES.TELEPORT_PAST);
        return;
      }

      // Calculate week status for target date (simplified version)
      const weekStatus = this.calculateWeekStatusForDate(targetDate);
      const monthName = getPersianMonthName(parsedDate.month);
      
      let teleportMessage = `🔮 *تلپورت به آینده*\n\n`;
      teleportMessage += `📅 تاریخ: ${parsedDate.day} ${monthName} ${parsedDate.year}\n`;
      teleportMessage += `📊 وضعیت هفته: *${weekStatus}*\n\n`;
      
      if (chat.type === "private") {
        const userSchedule = await this.database.getUserSchedule(user.id);
        const schedule = weekStatus === "فرد" ? userSchedule.odd_week_schedule : userSchedule.even_week_schedule;
        
        // Get day of week for target date
        const dayOfWeek = targetDate.getUTCDay();
        const dayMapping = [1, 2, 3, 4, 5, 6, 0]; // Convert to Persian week
        const persianDayIndex = dayMapping[dayOfWeek];
        
        if (persianDayIndex < 5) { // Weekday
          const englishDay = ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday'][persianDayIndex];
          const persianDay = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه'][persianDayIndex];
          const dayLessons = schedule[englishDay] || [];
          
          teleportMessage += `📚 برنامه آن روز (${persianDay}):\n\n`;
          
          if (dayLessons.length === 0) {
            teleportMessage += `🎉 در آن روز کلاسی ندارید!`;
          } else {
            dayLessons.forEach((lesson, idx) => {
              teleportMessage += `${idx + 1}. *${lesson.lesson}*\n`;
              teleportMessage += `   ⏰ ${lesson.start_time}-${lesson.end_time} | 📍 ${lesson.location || '-'}\n`;
            });
          }
        } else {
          teleportMessage += `🥳 آن روز آخر هفته است!`;
        }
      }

      await this.telegram.sendMessage(chat.id, teleportMessage);
    } catch (error) {
      console.error('Error in teleport date handling:', error);
      await this.telegram.sendMessage(chat.id, BOT_MESSAGES.ERROR_OCCURRED);
    }
  }

  /**
   * Calculates week status for a specific date (simplified version)
   */
  private calculateWeekStatusForDate(targetDate: Date): string {
    try {
      // Simplified calculation - in real implementation this would use the same logic as getWeekStatus
      const refDate = new Date('2024-02-10'); // Approximate reference date
      const timeDiff = targetDate.getTime() - refDate.getTime();
      const daysDiff = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
      const weeksPassed = Math.floor(daysDiff / 7);
      return weeksPassed % 2 === 0 ? "فرد" : "زوج";
    } catch (e) {
      return "نامشخص";
    }
  }

  /**
   * Checks if message is in class addition format - Exact match with original JS
   */
  private isClassAdditionFormat(text: string): boolean {
    const parts = text.split('-').map(part => part.trim());
    return parts.length === 4 && 
           parts[0].length > 0 && 
           isValidTimeFormat(parts[1]) && 
           isValidTimeFormat(parts[2]) && 
           parts[3].length > 0;
  }

  /**
   * Handles class addition from formatted message - Exact match with original JS
   */
  private async handleClassAddition(message: TelegramMessage, text: string): Promise<void> {
    const user = message.from!;
    const chat = message.chat;

    try {
      const parts = text.split('-').map(part => part.trim());
      
      if (parts.length !== 4) {
        await this.telegram.sendMessage(chat.id, BOT_MESSAGES.INVALID_FORMAT);
        return;
      }

      const [lessonName, startTime, endTime, location] = parts;

      // Validate time format
      if (!isValidTimeFormat(startTime) || !isValidTimeFormat(endTime)) {
        await this.telegram.sendMessage(chat.id, BOT_MESSAGES.INVALID_TIME);
        return;
      }

      // Parse start and end times to compare
      const startMinutes = this.parseTimeToMinutes(startTime);
      const endMinutes = this.parseTimeToMinutes(endTime);

      if (startMinutes >= endMinutes) {
        await this.telegram.sendMessage(chat.id, BOT_MESSAGES.INVALID_TIME_ORDER);
        return;
      }

      const lesson: ScheduleLesson = {
        lesson: lessonName,
        start_time: startTime,
        end_time: endTime,
        location: location
      };

      // This would need proper state management to know which week/day to add to
      // For now, we'll show an error message asking user to use the proper flow
      await this.telegram.sendMessage(
        chat.id, 
        "لطفاً از منوی برنامه و دکمه‌های مربوطه برای افزودن درس استفاده کنید.\n\n/schedule → تنظیم/افزودن درس"
      );

    } catch (error) {
      console.error('Error in handleClassAddition:', error);
      await this.telegram.sendMessage(chat.id, BOT_MESSAGES.ERROR_OCCURRED);
    }
  }

  /**
   * Handles broadcast message from admin
   */
  private async handleBroadcastMessage(message: TelegramMessage): Promise<void> {
    const user = message.from!;
    const chat = message.chat;
    const text = message.text!;
    const replyTo = message.reply_to_message!;

    try {
      // Determine broadcast type based on replied message
      let broadcastType: 'users' | 'groups' = 'users';
      
      if (replyTo.text?.includes('گروه')) {
        broadcastType = 'groups';
      }

      await this.telegram.sendMessage(
        chat.id,
        `📤 شروع ارسال پیام به ${broadcastType === 'users' ? 'کاربران' : 'گروه‌ها'}...`
      );

      let successCount = 0;
      let failCount = 0;

      if (broadcastType === 'users') {
        const users = await this.database.getAllUsers();
        
        for (const dbUser of users) {
          if (!dbUser.chat_id) continue;
          
          try {
            await this.telegram.sendMessage(dbUser.chat_id, text);
            successCount++;
            
            // Add small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 50));
          } catch (error) {
            console.error(`Failed to send to user ${dbUser.user_id}:`, error);
            failCount++;
          }
        }
      } else {
        const groups = await this.database.getAllGroups();
        
        for (const group of groups) {
          try {
            await this.telegram.sendMessage(group.group_id, text);
            successCount++;
            
            // Add small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 50));
          } catch (error) {
            console.error(`Failed to send to group ${group.group_id}:`, error);
            failCount++;
          }
        }
      }

      // Send report
      const reportText = `📊 گزارش ارسال:\n\n` +
                        `✅ موفق: ${successCount}\n` +
                        `❌ ناموفق: ${failCount}\n` +
                        `📊 کل: ${successCount + failCount}`;

      await this.telegram.sendMessage(chat.id, reportText);

    } catch (error) {
      console.error('Error in handleBroadcastMessage:', error);
      await this.telegram.sendMessage(chat.id, BOT_MESSAGES.ERROR_OCCURRED);
    }
  }

  /**
   * Parses time string to minutes since midnight
   */
  private parseTimeToMinutes(timeStr: string): number {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  }
}