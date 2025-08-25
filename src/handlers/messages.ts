import type { TelegramMessage, ScheduleLesson, UserState, ParsedSchedule, DaySchedule, InlineKeyboardMarkup } from '../types';
import { TelegramService } from '../services/telegram';
import { DatabaseService } from '../services/database';
import { StateService } from '../services/state';
import { AIService } from '../services/ai';
import { BOT_MESSAGES, PERSIAN_WEEKDAYS, ENGLISH_WEEKDAYS } from '../config/constants';
import { isValidTimeFormat } from '../utils/time';
import { parsePersianDate, jalaliToGregorian, getPersianMonthName, formatSchedulePreview } from '../utils/persian';
import { CallbackHandler } from './callbacks';

export class MessageHandler {
  private messageBuffers = new Map<number, { text: string, timer: NodeJS.Timeout, thinkingMessageId?: number }>();
  private callbackHandler!: CallbackHandler;

  constructor(
    private telegram: TelegramService,
    private database: DatabaseService,
    private state: StateService,
    private ai: AIService,
    private adminChatId: string
  ) {}

  setCallbackHandler(handler: CallbackHandler) {
    this.callbackHandler = handler;
  }

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
      } else if (userState.name === "awaiting_schedule_text") {
        await this.handleAIScheduleInput(message);
        stateShouldBeCleared = false; // The AI flow manages its own state
      } else if (userState.name === "awaiting_ai_lesson_edit") {
        await this.handleAILessonEditInput(message, userState);
        stateShouldBeCleared = false; // The AI edit flow manages its own state
      } else if (userState.name === "broadcast_flow") {
        await this.handleBroadcastFlowMessage(message, userState);
        stateShouldBeCleared = false; // The broadcast flow manages its own state
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
   * Parses time string to minutes since midnight
   */
  private parseTimeToMinutes(timeStr: string): number {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  }

  private async handleBroadcastFlowMessage(message: TelegramMessage, userState: UserState): Promise<void> {
    const user = message.from!;
    const chat = message.chat;
    const text = message.text;

    const { audience, method } = userState.data;

    if (audience === 'specific' && !userState.data.recipients) {
        // Admin is providing the list of specific recipients
        if (!text) {
            await this.telegram.sendMessage(chat.id, "لطفا یک لیست معتبر از کاربران را وارد کنید.");
            return;
        }
        const recipients = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        if (recipients.length === 0) {
            await this.telegram.sendMessage(chat.id, "لیست خالی است. لطفاً حداقل یک شناسه یا نام کاربری وارد کنید.");
            return;
        }
        userState.data.recipients = recipients;
        await this.state.setState(user.id, userState);
        await this.telegram.sendMessage(chat.id, `✅ ${recipients.length} گیرنده ثبت شد.`);
        // Now ask for the message to broadcast
        const askMessage = "✉️ اکنون پیام مورد نظر برای ارسال را بفرستید.\n\n" +
                         "می‌توانید هر نوع پیامی (متن، عکس، ویدیو، فایل و...) را ارسال کنید.";
        await this.telegram.sendMessage(chat.id, askMessage);
    } else {
        // Admin is providing the message to broadcast
        userState.data.message = message;
        await this.state.setState(user.id, userState);

        // Show preview and ask for confirmation
        await this.showBroadcastPreview(chat.id, userState);
    }
  }

  private async showBroadcastPreview(chatId: number, userState: UserState): Promise<void> {
    const { method, audience, recipients, message } = userState.data;

    let previewText = " предпросмотр сообщения\n\n";
    previewText += `*ارسال:* ${method === 'forward' ? 'فوروارد از شما' : 'به عنوان پیام ربات'}\n`;
    previewText += `*به:* ${this.getAudienceText(audience, recipients)}\n\n`;
    previewText += "پیام شما به این صورت نمایش داده خواهد شد:\n";
    previewText += "=====================";

    await this.telegram.sendMessage(chatId, previewText, { parse_mode: 'Markdown' });

    // Send the actual message content as a preview
    if (method === 'forward') {
        await this.telegram.forwardMessage(chatId, message.chat.id, message.message_id);
    } else { // 'bot'
        if (message.text) {
            await this.telegram.sendMessage(chatId, message.text, message.reply_markup);
        } else if (message.photo) {
            await this.telegram.sendPhoto(chatId, message.photo[0].file_id, message.caption);
        } else if (message.video) {
            await this.telegram.sendVideo(chatId, message.video.file_id, message.caption);
        } else if (message.document) {
            await this.telegram.sendDocument(chatId, message.document.file_id, message.caption);
        } else if (message.audio) {
            await this.telegram.sendAudio(chatId, message.audio.file_id, message.caption);
        } else if (message.voice) {
            await this.telegram.sendVoice(chatId, message.voice.file_id, message.caption);
        } else {
            await this.telegram.sendMessage(chatId, "پیش نمایش برای این نوع پیام پشتیبانی نمی‌شود.");
        }
    }

    const confirmationText = "آیا پیام فوق را تایید می‌کنید؟";
    const replyMarkup: any = {
        inline_keyboard: [
            [
                { text: "✅ تایید و ارسال", callback_data: "broadcast:confirm_send" },
                { text: "❌ لغو", callback_data: "admin:broadcast" }
            ]
        ]
    };
    await this.telegram.sendMessage(chatId, confirmationText, replyMarkup);
  }

  private getAudienceText(audience: string, recipients?: string[]): string {
    switch (audience) {
        case 'users': return 'همه کاربران';
        case 'groups': return 'همه گروه‌ها';
        case 'both': return 'همه کاربران و گروه‌ها';
        case 'specific': return `${recipients?.length || 0} گیرنده خاص`;
        default: return 'ناشناخته';
    }
  }

  /**
   * Handles the multi-message input for the AI schedule parser.
   */
  private async handleAIScheduleInput(message: TelegramMessage): Promise<void> {
    const userId = message.from!.id;
    const chatId = message.chat.id;
    const buffer = this.messageBuffers.get(userId);

    if (buffer?.timer) {
      clearTimeout(buffer.timer);
    }

    const newText = buffer ? `${buffer.text}\n\n${message.text}` : message.text!;

    // If this is the first message in the sequence, send a "Thinking..." message.
    let thinkingMessageId = buffer?.thinkingMessageId;
    if (!buffer) {
        const thinkingMessage = await this.telegram.sendMessage(chatId, BOT_MESSAGES.AI_THINKING);
        if (thinkingMessage.ok && thinkingMessage.result) {
            thinkingMessageId = thinkingMessage.result.message_id;
        }
    }

    const timer = setTimeout(() => {
      this.processAIConversation(userId, chatId, thinkingMessageId);
      this.messageBuffers.delete(userId);
    }, 3000); // Wait 3 seconds for more messages

    this.messageBuffers.set(userId, { text: newText, timer, thinkingMessageId });
  }

  /**
   * Processes the collected text, calls the AI, and shows the preview.
   */
  private async processAIConversation(userId: number, chatId: number, thinkingMessageId?: number): Promise<void> {
    const buffer = this.messageBuffers.get(userId);
    if (!buffer) return;

    const fullText = buffer.text;
    await this.state.deleteState(userId);

    try {
      if (thinkingMessageId) {
          await this.telegram.editMessageText(chatId, thinkingMessageId, BOT_MESSAGES.AI_PROCESSING);
      } else {
          // Fallback in case the thinking message failed to send
          await this.telegram.sendMessage(chatId, BOT_MESSAGES.AI_PROCESSING);
      }

      const schedule = await this.ai.parseSchedule(fullText);

      // Store the parsed schedule in a new state, awaiting confirmation
      await this.state.setState(userId, {
        name: "awaiting_ai_confirmation",
        data: { schedule },
        expireAt: Date.now() + 15 * 60 * 1000, // 15 minutes to confirm/edit
      });

      const previewText = formatSchedulePreview(schedule);
      const replyMarkup: InlineKeyboardMarkup = {
          inline_keyboard: [
              [{ text: "✅ تایید و ذخیره", callback_data: "schedule:ai:confirm" }],
              [{ text: "✏️ ویرایش", callback_data: "schedule:ai:edit" }],
              [{ text: "❌ لغو", callback_data: "cancel_action" }]
          ]
      };

      await this.telegram.sendMessage(chatId, previewText, replyMarkup);

    } catch (error) {
      console.error(`[AI] Error processing schedule for user ${userId}:`, error);
      await this.telegram.sendMessage(chatId, BOT_MESSAGES.AI_ERROR);
    } finally {
        // Clean up the "processing" message
        if (thinkingMessageId) {
            await this.telegram.deleteMessage(chatId, thinkingMessageId);
        }
    }
  }

  private async handleAILessonEditInput(message: TelegramMessage, userState: UserState): Promise<void> {
    const user = message.from!;
    const text = message.text!;
    const { schedule, editTarget } = userState.data;
    const { weekType, day, lessonIndex } = editTarget;

    if (!this.isClassAdditionFormat(text)) {
      await this.telegram.sendMessage(message.chat.id, BOT_MESSAGES.INVALID_FORMAT);
      // Don't clear state, let user try again
      return;
    }

    const parts = text.split('-').map(part => part.trim());
    const [lessonName, startTime, endTime, location] = parts;

    // Additional validation
    if (!isValidTimeFormat(startTime) || !isValidTimeFormat(endTime) || this.parseTimeToMinutes(startTime) >= this.parseTimeToMinutes(endTime)) {
        await this.telegram.sendMessage(message.chat.id, BOT_MESSAGES.INVALID_TIME_ORDER);
        return;
    }

    const newLesson: ScheduleLesson = {
      lesson: lessonName,
      start_time: startTime,
      end_time: endTime,
      location: location,
    };

    // Update the schedule object
    const updatedSchedule = { ...schedule };
    (updatedSchedule as any)[`${weekType}_week_schedule`][day][lessonIndex] = newLesson;

    // Set the state back to confirmation, with the updated schedule
    await this.state.setState(user.id, {
      name: "awaiting_ai_confirmation",
      data: { schedule: updatedSchedule },
      expireAt: Date.now() + 15 * 60 * 1000,
    });

    // Use the callback handler to re-display the edit menu
    await this.telegram.sendMessage(message.chat.id, "✅ درس با موفقیت ویرایش شد. به لیست ویرایش بازگشتید.");

    // We need to simulate a callback query to re-enter the edit menu
    const fakeCallbackQuery: any = {
        data: 'schedule:ai:edit',
        from: user,
        message: {
            message_id: message.message_id,
            chat: message.chat,
            date: message.date,
        }
    };
    await this.callbackHandler.handleCallback(fakeCallbackQuery);
  }
}