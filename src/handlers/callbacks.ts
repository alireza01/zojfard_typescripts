import type { TelegramCallbackQuery, InlineKeyboardMarkup } from '../types';
import { TelegramService } from '../services/telegram';
import { DatabaseService } from '../services/database';
import { PDFService } from '../services/pdf';
import { StateService } from '../services/state';
import { CommandHandler } from './commands';
import { BOT_MESSAGES, PERSIAN_WEEKDAYS, ENGLISH_WEEKDAYS } from '../config/constants';
import { getWeekStatus, getPersianDate } from '../utils/persian';

export class CallbackHandler {
  private commandHandler: CommandHandler;

  constructor(
    private telegram: TelegramService,
    private database: DatabaseService,
    private pdf: PDFService,
    private state: StateService,
    private adminChatId: string
  ) {
    this.commandHandler = new CommandHandler(telegram, database, pdf, state, adminChatId);
  }

  /**
   * Handles callback queries - Complete implementation matching original JS
   */
  async handleCallback(callbackQuery: TelegramCallbackQuery): Promise<void> {
    const data = callbackQuery.data;
    const user = callbackQuery.from;
    const message = callbackQuery.message;

    if (!data || !user || !message) return;

    const userId = user.id;
    const chatId = message.chat.id;
    const messageId = message.message_id;
    const queryId = callbackQuery.id;

    // Answer callback query first
    await this.telegram.answerCallbackQuery(queryId);

    try {
      // Main menu callbacks
      if (data === "menu:help") {
        await this.handleMenuHelp(chatId, messageId, user);
      }
      else if (data === "menu:week_status") {
        await this.handleMenuWeekStatus(chatId, messageId, user);
      }
      else if (data === "menu:schedule") {
        await this.handleMenuSchedule(chatId, messageId, user);
      }
      
      // Schedule callbacks
      else if (data === "schedule:view:full") {
        await this.handleScheduleViewFull(chatId, messageId, user);
      }
      else if (data === "schedule:set:select_week") {
        await this.handleScheduleSetSelectWeek(chatId, messageId);
      }
      else if (data.startsWith("schedule:set:select_day:")) {
        await this.handleScheduleSetSelectDay(chatId, messageId, data);
      }
      else if (data.startsWith("schedule:set:show_day:")) {
        await this.handleScheduleSetShowDay(chatId, messageId, data, user);
      }
      else if (data.startsWith("schedule:set:ask_details:")) {
        await this.handleScheduleSetAskDetails(chatId, messageId, data, user);
      }
      
      // Delete callbacks
      else if (data === "schedule:delete:main") {
        await this.handleScheduleDeleteMain(chatId, messageId, user);
      }
      else if (data.startsWith("schedule:delete:confirm_week:")) {
        await this.handleScheduleDeleteConfirmWeek(chatId, messageId, data, user);
      }
      else if (data.startsWith("schedule:delete:select_week:")) {
        await this.handleScheduleDeleteSelectWeek(chatId, messageId, data);
      }
      else if (data.startsWith("schedule:delete:select_day:")) {
        await this.handleScheduleDeleteSelectDay(chatId, messageId, data);
      }
      else if (data.startsWith("schedule:delete:show_day:")) {
        await this.handleScheduleDeleteShowDay(chatId, messageId, data, user);
      }
      else if (data.startsWith("schedule:delete:confirm_day:")) {
        await this.handleScheduleDeleteDay(chatId, messageId, data, user);
      }
      else if (data.startsWith("schedule:delete:confirm_lesson:")) {
        await this.handleScheduleDeleteLesson(chatId, messageId, data, user);
      }

      // Absence callbacks
      else if (data.startsWith("absence:")) {
        await this.handleAbsenceCallback(chatId, messageId, data, user);
      }
      
      // PDF callback
      else if (data === "pdf:export") {
        await this.handlePdfExport(chatId, messageId, user);
      }
      
      // Admin callbacks
      else if (data === "admin:panel") {
        await this.handleAdminPanel(chatId, messageId, user);
      }
      else if (data === "admin:stats") {
        await this.handleAdminStats(chatId, messageId, user);
      }
      else if (data === "admin:broadcast" || data.startsWith("broadcast:")) {
        await this.handleBroadcastCallback(chatId, messageId, data, user);
      }
      
      // Teleport callbacks
      else if (data === "teleport:ask_date") {
        await this.handleTeleportAskDate(chatId, messageId, user);
      }
      
      // Cancel action
      else if (data === "cancel_action") {
        await this.handleCancelAction(chatId, messageId, user);
      }
      
      // Legacy callbacks for compatibility
      else if (data === "today" || data === "week" || data === "week_status" || 
               data === "generate_pdf" || data === "help" || data === "add_class" || 
               data === "delete_class") {
        await this.handleLegacyCallback(data, message, user);
      }

    } catch (error) {
      console.error('Error handling callback:', error);
      await this.telegram.editMessageText(
        chatId,
        messageId,
        BOT_MESSAGES.ERROR_OCCURRED
      );
    }
  }

  private async handleMenuHelp(chatId: number, messageId: number, user: any): Promise<void> {
    const isAdmin = String(chatId) === this.adminChatId;
    const isPrivate = true; // Callback queries are always from private chats in this context
    
    const helpMessage = BOT_MESSAGES.HELP(isAdmin, isPrivate);
    
    const replyMarkup: InlineKeyboardMarkup = {
      inline_keyboard: [
        [
          { text: "🔄 وضعیت هفته و برنامه امروز", callback_data: "menu:week_status" }
        ],
        [
          { text: "📅 مشاهده برنامه کامل", callback_data: "schedule:view:full" },
          { text: "⚙️ تنظیم/ویرایش برنامه", callback_data: "menu:schedule" }
        ],
        [
          { text: "📤 دریافت PDF برنامه", callback_data: "pdf:export" },
          { text: "🔮 تلپورت", callback_data: "teleport:ask_date" }
        ],
        ...(isAdmin ? [[{ text: "👑 پنل مدیریت", callback_data: "admin:panel" }]] : [])
      ].filter(row => row.length > 0)
    };

    await this.telegram.editMessageText(chatId, messageId, helpMessage, replyMarkup);
  }

  private async handleMenuWeekStatus(chatId: number, messageId: number, user: any): Promise<void> {
    const weekStatus = getWeekStatus();
    const persianDate = getPersianDate();
    
    let weekMessage = `${persianDate}\n\n📊 وضعیت هفته فعلی: *${weekStatus}*\n\n`;

    // Add today's schedule if in private chat
    const userSchedule = await this.database.getUserSchedule(user.id);
    const currentSchedule = weekStatus === "فرد" ? userSchedule.odd_week_schedule : userSchedule.even_week_schedule;
    
    // Get current day
    const now = new Date();
    const dayOfWeek = now.getDay();
    const dayMapping = [1, 2, 3, 4, 5, 6, 0]; // Convert to Persian week
    const todayIndex = dayMapping[dayOfWeek];
    
    if (todayIndex < 5) { // Weekday
      const todayDayKey = ENGLISH_WEEKDAYS[todayIndex];
      const todayPersianDay = PERSIAN_WEEKDAYS[todayIndex];
      const todaySchedule = currentSchedule[todayDayKey] || [];
      
      if (todaySchedule.length > 0) {
        weekMessage += `📅 *برنامه امروز (${todayPersianDay}):*\n\n`;
        todaySchedule.forEach((lesson, idx) => {
          const startMins = parseInt(lesson.start_time.split(':')[0]) * 60 + parseInt(lesson.start_time.split(':')[1]);
          let classNum = "";
          if (startMins >= 8*60 && startMins < 10*60) classNum = "(کلاس اول) ";
          else if (startMins >= 10*60 && startMins < 12*60) classNum = "(کلاس دوم) ";
          else if (startMins >= 13*60 && startMins < 15*60) classNum = "(کلاس سوم) ";
          else if (startMins >= 15*60 && startMins < 17*60) classNum = "(کلاس چهارم) ";
          else if (startMins >= 17*60 && startMins < 19*60) classNum = "(کلاس پنجم) ";
          
          weekMessage += `${idx + 1}. ${classNum}*${lesson.lesson}*\n`;
          weekMessage += `   ⏰ ${lesson.start_time}-${lesson.end_time} | 📍 ${lesson.location || '-'}\n`;
        });
      } else {
        weekMessage += `🎉 امروز ${todayPersianDay} کلاسی ندارید!`;
      }
    } else {
      weekMessage += `🥳 امروز آخر هفته است!`;
    }

    const replyMarkup: InlineKeyboardMarkup = {
      inline_keyboard: [
        [
          { text: "🔄 بروزرسانی", callback_data: "menu:week_status" }
        ],
        [
          { text: "📅 مشاهده برنامه کامل", callback_data: "schedule:view:full" },
          { text: "⚙️ تنظیم/ویرایش برنامه", callback_data: "menu:schedule" }
        ],
        [
          { text: "↩️ بازگشت به منوی اصلی", callback_data: "menu:help" }
        ]
      ]
    };

    await this.telegram.editMessageText(chatId, messageId, weekMessage, replyMarkup);
  }

  private async handleMenuSchedule(chatId: number, messageId: number, user: any): Promise<void> {
    const scheduleMessage = BOT_MESSAGES.SCHEDULE_MANAGEMENT;
    
    const replyMarkup: InlineKeyboardMarkup = {
      inline_keyboard: [
        [
          { text: "⚙️ تنظیم / افزودن درس", callback_data: "schedule:set:select_week" },
          { text: "🗑️ حذف درس / روز / هفته", callback_data: "schedule:delete:main" }
        ],
        [
          { text: "📅 مشاهده برنامه کامل", callback_data: "schedule:view:full" },
          { text: "📤 خروجی PDF برنامه", callback_data: "pdf:export" }
        ],
        [
          { text: "↩️ بازگشت به منوی اصلی", callback_data: "menu:help" }
        ]
      ]
    };

    await this.telegram.editMessageText(chatId, messageId, scheduleMessage, replyMarkup);
  }

  private async handleScheduleViewFull(chatId: number, messageId: number, user: any): Promise<void> {
    const userSchedule = await this.database.getUserSchedule(user.id);
    const weekStatus = getWeekStatus();
    
    let scheduleMessage = `📅 *برنامه کامل شما*\n\n📊 وضعیت هفته فعلی: *${weekStatus}*\n\n`;
    
    // Show both odd and even weeks
    const weekTypes = [
      { type: 'odd', label: 'فرد', schedule: userSchedule.odd_week_schedule },
      { type: 'even', label: 'زوج', schedule: userSchedule.even_week_schedule }
    ];

    for (const weekData of weekTypes) {
      scheduleMessage += `🔸 *هفته ${weekData.label}:*\n`;
      
      let hasAnyClass = false;
      for (let i = 0; i < ENGLISH_WEEKDAYS.length; i++) {
        const englishDay = ENGLISH_WEEKDAYS[i];
        const persianDay = PERSIAN_WEEKDAYS[i];
        const dayLessons = weekData.schedule[englishDay] || [];

        if (dayLessons.length > 0) {
          hasAnyClass = true;
          scheduleMessage += `  📅 ${persianDay}:\n`;
          dayLessons.forEach((lesson, index) => {
            scheduleMessage += `    ${index + 1}. ${lesson.lesson}\n`;
            scheduleMessage += `       ⏰ ${lesson.start_time}-${lesson.end_time} | 📍 ${lesson.location}\n`;
          });
        }
      }
      
      if (!hasAnyClass) {
        scheduleMessage += `  _هیچ کلاسی تعریف نشده_\n`;
      }
      scheduleMessage += `\n`;
    }

    const replyMarkup: InlineKeyboardMarkup = {
      inline_keyboard: [
        [
          { text: "⚙️ تنظیم / افزودن درس", callback_data: "schedule:set:select_week" }
        ],
        [
          { text: "🗑️ حذف درس / روز / هفته", callback_data: "schedule:delete:main" }
        ],
        [
          { text: "📤 خروجی PDF", callback_data: "pdf:export" }
        ],
        [
          { text: "↩️ بازگشت به منوی اصلی", callback_data: "menu:help" }
        ]
      ]
    };

    await this.telegram.editMessageText(chatId, messageId, scheduleMessage, replyMarkup);
  }

  private async handleScheduleSetSelectWeek(chatId: number, messageId: number): Promise<void> {
    const message = BOT_MESSAGES.SCHEDULE_SETUP;
    
    const replyMarkup: InlineKeyboardMarkup = {
      inline_keyboard: [
        [
          { text: "هفته فرد 🟣", callback_data: "schedule:set:select_day:odd" },
          { text: "هفته زوج 🟢", callback_data: "schedule:set:select_day:even" }
        ],
        [
          { text: "↩️ بازگشت (منو برنامه)", callback_data: "menu:schedule" }
        ]
      ]
    };

    await this.telegram.editMessageText(chatId, messageId, message, replyMarkup);
  }

  private async handleBroadcastAskAudience(chatId: number, messageId: number, user: any): Promise<void> {
    const message = "👥 پیام به چه کسانی ارسال شود؟";

    const replyMarkup: InlineKeyboardMarkup = {
        inline_keyboard: [
            [
                { text: "👤 کاربران", callback_data: "broadcast:set_audience:users" },
                { text: "👥 گروه‌ها", callback_data: "broadcast:set_audience:groups" },
                { text: "👤+👥 هر دو", callback_data: "broadcast:set_audience:both" }
            ],
            [
                { text: "🎯 افراد خاص", callback_data: "broadcast:set_audience:specific" }
            ],
            [
                { text: "↩️ بازگشت", callback_data: "broadcast:send_new" }
            ]
        ]
    };

    await this.telegram.editMessageText(chatId, messageId, message, replyMarkup);
  }

  private async handleScheduleSetSelectDay(chatId: number, messageId: number, data: string): Promise<void> {
    const weekType = data.split(':')[3]; // odd or even
    const weekLabel = weekType === 'odd' ? 'فرد' : 'زوج';
    
    const message = BOT_MESSAGES.SCHEDULE_SELECT_DAY(weekLabel);
    
    const dayButtons = ENGLISH_WEEKDAYS.map((dayKey, index) => ({
      text: PERSIAN_WEEKDAYS[index],
      callback_data: `schedule:set:show_day:${weekType}:${dayKey}`
    }));
    
    const rows = [];
    for (let i = 0; i < dayButtons.length; i += 2) {
      if (i + 1 < dayButtons.length) {
        rows.push([dayButtons[i], dayButtons[i + 1]]);
      } else {
        rows.push([dayButtons[i]]);
      }
    }
    
    const replyMarkup: InlineKeyboardMarkup = {
      inline_keyboard: [
        ...rows,
        [{ text: "↩️ بازگشت (انتخاب هفته)", callback_data: "schedule:set:select_week" }]
      ]
    };

    await this.telegram.editMessageText(chatId, messageId, message, replyMarkup);
  }

  private async handleScheduleSetShowDay(chatId: number, messageId: number, data: string, user: any): Promise<void> {
    const parts = data.split(':');
    const weekType = parts[3];
    const day = parts[4];
    const weekLabel = weekType === 'odd' ? 'فرد' : 'زوج';
    const dayIndex = ENGLISH_WEEKDAYS.indexOf(day);
    const dayLabel = PERSIAN_WEEKDAYS[dayIndex];

    const userSchedule = await this.database.getUserSchedule(user.id);
    const schedule = weekType === 'odd' ? userSchedule.odd_week_schedule : userSchedule.even_week_schedule;
    const dayLessons = schedule[day] || [];

    let message = BOT_MESSAGES.SCHEDULE_DAY_VIEW(dayLabel, weekLabel);
    
    if (dayLessons.length === 0) {
      message += `_هیچ درسی برای این روز تعریف نشده._\n\n`;
    } else {
      dayLessons.forEach((lesson, index) => {
        message += `${index + 1}. *${lesson.lesson}*\n`;
        message += `   ⏰ ${lesson.start_time}-${lesson.end_time}\n`;
        message += `   📍 ${lesson.location}\n\n`;
      });
    }

    const replyMarkup: InlineKeyboardMarkup = {
      inline_keyboard: [
        [{ text: "➕ افزودن درس جدید", callback_data: `schedule:set:ask_details:${weekType}:${day}` }],
        [{ text: `↩️ بازگشت (انتخاب روز ${weekLabel})`, callback_data: `schedule:set:select_day:${weekType}` }]
      ]
    };

    await this.telegram.editMessageText(chatId, messageId, message, replyMarkup);
  }

  private async handleScheduleSetAskDetails(chatId: number, messageId: number, data: string, user: any): Promise<void> {
    const parts = data.split(':');
    const weekType = parts[3];
    const day = parts[4];
    const weekLabel = weekType === 'odd' ? 'فرد' : 'زوج';
    const dayIndex = ENGLISH_WEEKDAYS.indexOf(day);
    const dayLabel = PERSIAN_WEEKDAYS[dayIndex];

    const message = BOT_MESSAGES.SCHEDULE_ADD_LESSON(dayLabel, weekLabel);
    
    const replyMarkup: InlineKeyboardMarkup = {
      inline_keyboard: [
        [{ text: "❌ لغو و بازگشت", callback_data: `schedule:set:show_day:${weekType}:${day}` }]
      ]
    };

    // Set user state to expect lesson details
    await this.state.setState(user.id, {
      name: "awaiting_lesson_details",
      data: { weekType, day },
      expireAt: Date.now() + 5 * 60 * 1000 // 5 minutes
    });

    await this.telegram.editMessageText(chatId, messageId, message, replyMarkup);
  }

  // Add more callback handlers...
  private async handleScheduleDeleteMain(chatId: number, messageId: number, user: any): Promise<void> {
    const userSchedule = await this.database.getUserSchedule(user.id);
    const hasOddSchedule = Object.keys(userSchedule.odd_week_schedule).length > 0;
    const hasEvenSchedule = Object.keys(userSchedule.even_week_schedule).length > 0;

    if (!hasOddSchedule && !hasEvenSchedule) {
      await this.telegram.editMessageText(chatId, messageId, BOT_MESSAGES.NO_SCHEDULE, {
        inline_keyboard: [[{ text: "↩️ بازگشت", callback_data: "menu:schedule" }]]
      });
      return;
    }

    const message = BOT_MESSAGES.DELETE_SCHEDULE_MAIN;
    
    const replyMarkup: InlineKeyboardMarkup = {
      inline_keyboard: [
        [
          { text: "🗑️ حذف کل برنامه هفته فرد", callback_data: "schedule:delete:confirm_week:odd:prompt" },
          { text: "🗑️ حذف کل برنامه هفته زوج", callback_data: "schedule:delete:confirm_week:even:prompt" }
        ],
        [
          { text: "❌ حذف تمام دروس یک روز", callback_data: "schedule:delete:select_week:day" },
          { text: "🚫 حذف یک درس خاص", callback_data: "schedule:delete:select_week:lesson" }
        ],
        [
          { text: "↩️ بازگشت (منو برنامه)", callback_data: "menu:schedule" }
        ]
      ]
    };

    await this.telegram.editMessageText(chatId, messageId, message, replyMarkup);
  }

  private async handleScheduleDeleteSelectWeek(chatId: number, messageId: number, data: string): Promise<void> {
    const deleteType = data.split(':')[3]; // 'day' or 'lesson'
    const message = "لطفاً هفته‌ای که می‌خواهید از آن حذف کنید را انتخاب نمایید:";

    const replyMarkup: InlineKeyboardMarkup = {
      inline_keyboard: [
        [
          { text: "هفته فرد 🟣", callback_data: `schedule:delete:select_day:odd:${deleteType}` },
          { text: "هفته زوج 🟢", callback_data: `schedule:delete:select_day:even:${deleteType}` }
        ],
        [
          { text: "↩️ بازگشت (منو حذف)", callback_data: "schedule:delete:main" }
        ]
      ]
    };

    await this.telegram.editMessageText(chatId, messageId, message, replyMarkup);
  }

  private async handleScheduleDeleteSelectDay(chatId: number, messageId: number, data: string): Promise<void> {
    const parts = data.split(':');
    const weekType = parts[3];
    const deleteType = parts[4];
    const weekLabel = weekType === 'odd' ? 'فرد' : 'زوج';

    const message = `کدام روز از *هفته ${weekLabel}* را برای حذف انتخاب می‌کنید؟`;

    const dayButtons = ENGLISH_WEEKDAYS.map((dayKey, index) => ({
      text: PERSIAN_WEEKDAYS[index],
      callback_data: `schedule:delete:show_day:${weekType}:${dayKey}:${deleteType}`
    }));

    const rows = [];
    for (let i = 0; i < dayButtons.length; i += 2) {
      rows.push(i + 1 < dayButtons.length ? [dayButtons[i], dayButtons[i+1]] : [dayButtons[i]]);
    }

    const replyMarkup: InlineKeyboardMarkup = {
      inline_keyboard: [
        ...rows,
        [{ text: "↩️ بازگشت (انتخاب هفته)", callback_data: `schedule:delete:select_week:${deleteType}` }]
      ]
    };

    await this.telegram.editMessageText(chatId, messageId, message, replyMarkup);
  }

  private async handleScheduleDeleteShowDay(chatId: number, messageId: number, data: string, user: any): Promise<void> {
    const parts = data.split(':');
    const weekType = parts[3];
    const day = parts[4];
    const deleteType = parts[5];

    const weekLabel = weekType === 'odd' ? 'فرد' : 'زوج';
    const dayIndex = ENGLISH_WEEKDAYS.indexOf(day);
    const dayLabel = PERSIAN_WEEKDAYS[dayIndex];

    const userSchedule = await this.database.getUserSchedule(user.id);
    const schedule = weekType === 'odd' ? userSchedule.odd_week_schedule : userSchedule.even_week_schedule;
    const dayLessons = schedule[day] || [];

    if (dayLessons.length === 0) {
      await this.telegram.editMessageText(
        chatId,
        messageId,
        `هیچ درسی برای روز *${dayLabel}* هفته *${weekLabel}* ثبت نشده است.`,
        { inline_keyboard: [[{ text: "↩️ بازگشت", callback_data: `schedule:delete:select_day:${weekType}:${deleteType}` }]] }
      );
      return;
    }

    if (deleteType === 'day') {
      const message = `آیا از حذف تمام دروس روز *${dayLabel}* هفته *${weekLabel}* اطمینان دارید؟`;
      const replyMarkup: InlineKeyboardMarkup = {
        inline_keyboard: [
          [{ text: `✅ بله، حذف کن`, callback_data: `schedule:delete:confirm_day:${weekType}:${day}` }],
          [{ text: "❌ خیر، بازگشت", callback_data: `schedule:delete:select_day:${weekType}:${deleteType}` }]
        ]
      };
      await this.telegram.editMessageText(chatId, messageId, message, replyMarkup);
    } else { // deleteType === 'lesson'
      let message = `کدام درس از روز *${dayLabel}* هفته *${weekLabel}* را می‌خواهید حذف کنید؟\n\n`;
      const lessonButtons = dayLessons.map((lesson, index) => {
        const lessonIdentifier = `${lesson.lesson.replace(/\s/g, '_')}_${lesson.start_time}`;
        return [{
          text: `❌ ${lesson.lesson} (${lesson.start_time})`,
          callback_data: `schedule:delete:confirm_lesson:${weekType}:${day}:${index}`
        }];
      });

      const replyMarkup: InlineKeyboardMarkup = {
        inline_keyboard: [
          ...lessonButtons,
          [{ text: "↩️ بازگشت", callback_data: `schedule:delete:select_day:${weekType}:${deleteType}` }]
        ]
      };
      await this.telegram.editMessageText(chatId, messageId, message, replyMarkup);
    }
  }

  private async handlePdfExport(chatId: number, messageId: number, user: any): Promise<void> {
    try {
      const userSchedule = await this.database.getUserSchedule(user.id);
      
      // Check if user has any schedule
      const hasOddSchedule = Object.keys(userSchedule.odd_week_schedule).length > 0;
      const hasEvenSchedule = Object.keys(userSchedule.even_week_schedule).length > 0;
      
      if (!hasOddSchedule && !hasEvenSchedule) {
        await this.telegram.editMessageText(chatId, messageId, BOT_MESSAGES.NO_SCHEDULE);
        return;
      }

      const pdfBuffer = await this.pdf.generateSchedulePDF(userSchedule, user.id);
      const fileName = `schedule_${user.id}_${Date.now()}.pdf`;
      const fullName = `${user.first_name} ${user.last_name || ''}`.trim();

      await this.telegram.sendDocument(
        chatId,
        pdfBuffer,
        fileName,
        BOT_MESSAGES.PDF_GENERATED(fullName),
        {
          inline_keyboard: [
            [{ text: "↩️ بازگشت به منوی اصلی", callback_data: "menu:help" }]
          ]
        }
      );
    } catch (error) {
      console.error('Error in PDF export:', error);
      await this.telegram.editMessageText(
        chatId, 
        messageId, 
        "⚠️ متاسفانه در تولید PDF خطایی رخ داد. لطفاً دوباره تلاش کنید یا با ادمین تماس بگیرید.", 
        { inline_keyboard: [[{ text: "↩️ بازگشت", callback_data: "menu:schedule" }]] }
      );
    }
  }

  private async handleAdminPanel(chatId: number, messageId: number, user: any): Promise<void> {
    if (String(chatId) !== this.adminChatId) {
      await this.telegram.editMessageText(chatId, messageId, BOT_MESSAGES.ADMIN_ONLY);
      return;
    }

    const weekStatus = getWeekStatus();
    const adminMessage = BOT_MESSAGES.ADMIN_PANEL(weekStatus);
    
    const replyMarkup: InlineKeyboardMarkup = {
      inline_keyboard: [
        [
          { text: "📊 آمار ربات", callback_data: "admin:stats" }
        ],
        [
          { text: "↩️ بازگشت به منوی اصلی", callback_data: "menu:help" }
        ]
      ]
    };

    await this.telegram.editMessageText(chatId, messageId, adminMessage, replyMarkup);
  }

  private async handleAdminStats(chatId: number, messageId: number, user: any): Promise<void> {
    if (String(chatId) !== this.adminChatId) {
      await this.telegram.editMessageText(chatId, messageId, BOT_MESSAGES.ADMIN_ONLY);
      return;
    }

    try {
      const stats = await this.database.getBotStats();
      const currentStatus = getWeekStatus();
      
      let statsMessage = `📊 *آمار ربات (Supabase)*\n\n`;
      statsMessage += `📅 وضعیت هفته فعلی: *${currentStatus}*\n\n`;
      statsMessage += `👤 کاربران ثبت شده: ${stats.userCount}\n`;
      statsMessage += `👥 گروه‌های ثبت شده: ${stats.groupCount}\n`;
      statsMessage += `🗓️ کاربران با برنامه: ${stats.scheduleCount}\n`;
      statsMessage += `📢 رکوردهای اعلان: ${stats.broadcastCount}\n\n`;
      statsMessage += `📈 کل استفاده ثبت شده: ${stats.usageCount}\n\n`;
      
      if (stats.topCommands.length > 0) {
        statsMessage += `🔥 *پرکاربردترین دستورات:*\n`;
        stats.topCommands.forEach(([command, count], index) => {
          statsMessage += `${index + 1}. \`${command}\`: ${count} بار\n`;
        });
      }

      const statsReplyMarkup: InlineKeyboardMarkup = {
        inline_keyboard: [
          [{ text: "🔄 بروزرسانی آمار", callback_data: "admin:stats" }],
          [{ text: "↩️ بازگشت به پنل ادمین", callback_data: "admin:panel" }]
        ]
      };

      await this.telegram.editMessageText(chatId, messageId, statsMessage, statsReplyMarkup);
    } catch (error) {
      console.error('Error in admin stats:', error);
      const errorMsg = "⚠️ خطا در دریافت آمار.";
      const errorReplyMarkup: InlineKeyboardMarkup = {
        inline_keyboard: [[{ text: "↩️ بازگشت", callback_data: "admin:panel" }]]
      };
      await this.telegram.editMessageText(chatId, messageId, errorMsg, errorReplyMarkup);
    }
  }

  private async handleTeleportAskDate(chatId: number, messageId: number, user: any): Promise<void> {
    await this.state.setState(user.id, {
      name: "awaiting_teleport_date",
      expireAt: Date.now() + 5 * 60 * 1000 // 5 minutes
    });

    const message = "🔮 لطفاً تاریخ شمسی مورد نظر را به فرمت `سال/ماه/روز` ارسال کنید (مثال: `1403/08/25`).";
    
    const replyMarkup: InlineKeyboardMarkup = {
      inline_keyboard: [
        [{ text: "❌ لغو", callback_data: "cancel_action" }]
      ]
    };

    await this.telegram.editMessageText(chatId, messageId, message, replyMarkup);
  }

  private async handleBroadcastCallback(chatId: number, messageId: number, data: string, user: any): Promise<void> {
    const parts = data.split(':');
    const action = parts[1];

    if (data === 'admin:broadcast') {
        await this.handleBroadcastMenu(chatId, messageId, user);
        return;
    }

    if (action === 'send_new') {
        await this.handleBroadcastSendNew(chatId, messageId, user);
    } else if (action === 'set_method') {
        const method = parts[2]; // 'forward' or 'bot'
        await this.state.setState(user.id, {
            name: 'broadcast_flow',
            data: { method: method },
            expireAt: Date.now() + 15 * 60 * 1000 // 15 minutes to complete the flow
        });
        await this.handleBroadcastAskAudience(chatId, messageId, user);
    } else if (action === 'set_audience') {
        const audience = parts[2]; // 'users', 'groups', 'both', 'specific'
        const userState = await this.state.getState(user.id);
        if (!userState || userState.name !== 'broadcast_flow') {
            // State lost or invalid, restart
            await this.telegram.editMessageText(chatId, messageId, "⚠️ خطایی رخ داد، لطفاً از ابتدا شروع کنید.", {
                inline_keyboard: [[{ text: "شروع مجدد", callback_data: "admin:broadcast" }]]
            });
            return;
        }

        userState.data.audience = audience;


        if (audience === 'specific') {
            await this.state.setState(user.id, userState);
            await this.handleBroadcastAskSpecific(chatId, messageId, user);
        } else {
            await this.state.setState(user.id, userState);
            await this.handleBroadcastAskMessage(chatId, messageId, user);
        }
    } else if (action === 'confirm_send') {
        await this.handleBroadcastConfirmSend(chatId, messageId, user);
    } else if (action === 'delete_last') {
        await this.handleBroadcastDeleteLast(chatId, messageId, user);
    } else if (action === 'delete_multiple') {
        await this.handleBroadcastDeleteMultiple(chatId, messageId, user);
    } else if (action === 'toggle_delete') {
        const broadcastId = parseInt(parts[2]);
        await this.handleBroadcastToggleDelete(chatId, messageId, user, broadcastId);
    } else if (action === 'confirm_delete_multiple') {
        await this.handleBroadcastConfirmDeleteMultiple(chatId, messageId, user);
    }
    // other broadcast actions will go here
  }

  private async handleBroadcastConfirmSend(chatId: number, messageId: number, user: any): Promise<void> {
    const userState = await this.state.getState(user.id);
    if (!userState || userState.name !== 'broadcast_flow' || !userState.data.message) {
        await this.telegram.editMessageText(chatId, messageId, "⚠️ اطلاعات ارسال منقضی شده یا نامعتبر است. لطفاً دوباره تلاش کنید.", {
            inline_keyboard: [[{ text: "شروع مجدد", callback_data: "admin:broadcast" }]]
        });
        return;
    }

    // Acknowledge the confirmation
    await this.telegram.editMessageText(chatId, messageId, "✅ تایید شد. در حال آماده سازی برای ارسال...");

    const { method, audience, recipients, message } = userState.data;
    const startTime = Date.now();
    let successCount = 0;
    let failCount = 0;
    let sentCount = 0;

    let targetUsers: { user_id: number; chat_id: number; }[] = [];
    let targetGroups: { group_id: number; }[] = [];

    if (audience === 'users' || audience === 'both') {
        const users = await this.database.getAllUsers();
        targetUsers.push(...users.map(u => ({ user_id: u.user_id, chat_id: u.chat_id })));
    }
    if (audience === 'groups' || audience === 'both') {
        const groups = await this.database.getAllGroups();
        targetGroups.push(...groups.map(g => ({ group_id: g.group_id })));
    }
    if (audience === 'specific' && recipients) {
        for (const r of recipients) {
            if (!r.startsWith('@')) {
                const id = parseInt(r);
                if (!isNaN(id)) {
                    if (id > 0) {
                        targetUsers.push({ user_id: id, chat_id: id });
                    } else {
                        targetGroups.push({ group_id: id });
                    }
                }
            }
        }
    }

    targetUsers = [...new Map(targetUsers.map(item => [item.chat_id, item])).values()];
    targetGroups = [...new Map(targetGroups.map(item => [item.group_id, item])).values()];

    const totalTargets = targetUsers.length + targetGroups.length;

    const statusMessage = await this.telegram.sendMessage(chatId, `🚀 شروع ارسال به ${totalTargets} گیرنده... (0/${totalTargets})`);
    const broadcastId = await this.database.createBroadcast(message.message_id, chatId);

    const sendPromises = [];

    const updateStatusMessage = async () => {
        if (statusMessage.ok && statusMessage.result) {
            await this.telegram.editMessageText(
                chatId,
                statusMessage.result.message_id,
                `🚀 در حال ارسال... (${sentCount}/${totalTargets})`
            );
        }
    };

    const processTarget = async (targetId: number, isUser: boolean) => {
        let sentMessage;
        try {
            if (method === 'forward') {
                sentMessage = await this.telegram.forwardMessage(targetId, message.chat.id, message.message_id);
            } else { // 'bot'
                if (message.text) {
                    sentMessage = await this.telegram.sendMessage(targetId, message.text, message.reply_markup);
                } else if (message.photo) {
                    sentMessage = await this.telegram.sendPhoto(targetId, message.photo[0].file_id, message.caption);
                } else if (message.video) {
                    sentMessage = await this.telegram.sendVideo(targetId, message.video.file_id, message.caption);
                } else if (message.document) {
                    sentMessage = await this.telegram.sendDocument(targetId, message.document.file_id, message.document.file_name, message.caption);
                } else if (message.audio) {
                    sentMessage = await this.telegram.sendAudio(targetId, message.audio.file_id, message.caption);
                } else if (message.voice) {
                    sentMessage = await this.telegram.sendVoice(targetId, message.voice.file_id, message.caption);
                }
            }

            if (sentMessage && sentMessage.ok) {
                await this.database.logBroadcastMessage(broadcastId, isUser ? targetId : null, !isUser ? targetId : null, sentMessage.result.message_id, 'success');
                successCount++;
            } else {
                throw new Error(sentMessage?.description || 'Failed to send message');
            }
        } catch (e) {
            failCount++;
            await this.database.logBroadcastMessage(broadcastId, isUser ? targetId : null, !isUser ? targetId : null, -1, 'failed');
        }
        sentCount++;
        if (sentCount % 10 === 0) {
            await updateStatusMessage();
        }
    };

    for (const target of targetUsers) {
        sendPromises.push(processTarget(target.chat_id, true));
        await new Promise(r => setTimeout(r, 50));
    }
    for (const target of targetGroups) {
        sendPromises.push(processTarget(target.group_id, false));
        await new Promise(r => setTimeout(r, 50));
    }

    await Promise.all(sendPromises);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    const report = `📊 *گزارش ارسال همگانی*\n\n` +
                   `✅ موفق: ${successCount}\n` +
                   `❌ ناموفق: ${failCount}\n` +
                   `👥 کل گیرندگان: ${totalTargets}\n` +
                   `⏱️ مدت زمان: ${duration} ثانیه`;

    if (statusMessage.ok && statusMessage.result) {
        await this.telegram.editMessageText(chatId, statusMessage.result.message_id, report, { parse_mode: 'Markdown' });
    } else {
        await this.telegram.sendMessage(chatId, report, { parse_mode: 'Markdown' });
    }

    await this.state.deleteState(user.id);
  }

  private async handleBroadcastMenu(chatId: number, messageId: number, user: any): Promise<void> {
    if (String(chatId) !== this.adminChatId) {
      await this.telegram.editMessageText(chatId, messageId, BOT_MESSAGES.ADMIN_ONLY);
      return;
    }

    const message = "📢 *پنل ارسال پیام همگانی*\n\n" +
                    "از این بخش می‌توانید پیام‌های خود را به کاربران و گروه‌ها ارسال کنید.";

    const replyMarkup: InlineKeyboardMarkup = {
      inline_keyboard: [
        [
          { text: "✉️ ارسال پیام جدید", callback_data: "broadcast:send_new" },
        ],
        [
          { text: "🗑 حذف آخرین پیام", callback_data: "broadcast:delete_last" },
          { text: "🗑🗑 حذف چند پیام اخیر", callback_data: "broadcast:delete_multiple" }
        ],
        [
          { text: "↩️ بازگشت به پنل ادمین", callback_data: "admin:panel" }
        ]
      ]
    };

    await this.telegram.editMessageText(chatId, messageId, message, replyMarkup);
  }

  private async handleBroadcastDeleteLast(chatId: number, messageId: number, user: any): Promise<void> {
    if (String(chatId) !== this.adminChatId) {
        await this.telegram.editMessageText(chatId, messageId, BOT_MESSAGES.ADMIN_ONLY);
        return;
    }

    await this.telegram.editMessageText(chatId, messageId, "🗑 در حال یافتن و حذف آخرین پیام همگانی...");

    const lastBroadcast = await this.database.getLastBroadcast();
    if (!lastBroadcast) {
        await this.telegram.editMessageText(chatId, messageId, "❌ هیچ پیام همگانی برای حذف یافت نشد.");
        return;
    }

    const messagesToDelete = await this.database.getBroadcastMessages(lastBroadcast.id);
    let successCount = 0;
    let failCount = 0;

    for (const msg of messagesToDelete) {
        const targetChatId = msg.user_id || msg.group_id;
        if (targetChatId) {
            const { ok } = await this.telegram.deleteMessage(targetChatId, msg.message_id);
            if (ok) {
                successCount++;
            } else {
                failCount++;
            }
        }
    }

    await this.database.deleteBroadcast(lastBroadcast.id);

    const report = `✅ عملیات حذف انجام شد.\n\n` +
                   `🗑 ${successCount} پیام با موفقیت حذف شد.\n` +
                   `⚠️ ${failCount} پیام حذف نشد (ممکن است توسط کاربر حذف شده باشد).`;

    await this.telegram.editMessageText(chatId, messageId, report, {
        inline_keyboard: [[{ text: "↩️ بازگشت", callback_data: "admin:broadcast" }]]
    });
  }

  private async handleBroadcastDeleteMultiple(chatId: number, messageId: number, user: any): Promise<void> {
    if (String(chatId) !== this.adminChatId) {
        await this.telegram.editMessageText(chatId, messageId, BOT_MESSAGES.ADMIN_ONLY);
        return;
    }

    const broadcasts = await this.database.getBroadcasts(5); // Get last 5 broadcasts
    if (broadcasts.length === 0) {
        await this.telegram.editMessageText(chatId, messageId, "❌ هیچ پیام همگانی برای حذف یافت نشد.");
        return;
    }

    const message = "🗑 کدام پیام‌ها را می‌خواهید حذف کنید؟\n\n" +
                    "لطفاً پیام‌های مورد نظر را انتخاب کرده و سپس دکمه تایید را بزنید.";

    const keyboard = broadcasts.map(b => ([{
        text: `پیام از ${new Date(b.created_at).toLocaleString('fa-IR')}`,
        callback_data: `broadcast:toggle_delete:${b.id}`
    }]));

    keyboard.push([{ text: "✅ تایید حذف موارد انتخاب شده", callback_data: "broadcast:confirm_delete_multiple" }]);
    keyboard.push([{ text: "↩️ بازگشت", callback_data: "admin:broadcast" }]);

    const replyMarkup: any = {
        inline_keyboard: keyboard
    };

    await this.telegram.editMessageText(chatId, messageId, message, replyMarkup);
  }

  private async handleBroadcastToggleDelete(chatId: number, messageId: number, user: any, broadcastId: number): Promise<void> {
    const userState = await this.state.getState(user.id) || { name: 'broadcast_delete', data: { selected: [] } };
    if (userState.name !== 'broadcast_delete') {
        userState.name = 'broadcast_delete';
        userState.data = { selected: [] };
    }

    const selected = userState.data.selected || [];
    const index = selected.indexOf(broadcastId);
    if (index > -1) {
        selected.splice(index, 1);
    } else {
        selected.push(broadcastId);
    }
    userState.data.selected = selected;
    await this.state.setState(user.id, userState);

    // Update the keyboard to show the new selection state
    const broadcasts = await this.database.getBroadcasts(5);
    const keyboard = broadcasts.map(b => {
        const isSelected = selected.includes(b.id);
        return [{
            text: `${isSelected ? '✅' : '🔲'} پیام از ${new Date(b.created_at).toLocaleString('fa-IR')}`,
            callback_data: `broadcast:toggle_delete:${b.id}`
        }];
    });

    keyboard.push([{ text: "✅ تایید حذف موارد انتخاب شده", callback_data: "broadcast:confirm_delete_multiple" }]);
    keyboard.push([{ text: "↩️ بازگشت", callback_data: "admin:broadcast" }]);

    const replyMarkup: any = {
        inline_keyboard: keyboard
    };

    await this.telegram.editMessageText(chatId, messageId, "🗑 کدام پیام‌ها را می‌خواهید حذف کنید؟", replyMarkup);
  }

  private async handleBroadcastConfirmDeleteMultiple(chatId: number, messageId: number, user: any): Promise<void> {
    const userState = await this.state.getState(user.id);
    if (!userState || userState.name !== 'broadcast_delete' || !userState.data.selected || userState.data.selected.length === 0) {
        await this.telegram.editMessageText(chatId, messageId, "❌ هیچ پیامی برای حذف انتخاب نشده است.", {
            inline_keyboard: [[{ text: "بازگشت", callback_data: "broadcast:delete_multiple" }]]
        });
        return;
    }

    await this.telegram.editMessageText(chatId, messageId, `🗑 در حال حذف ${userState.data.selected.length} پیام همگانی...`);

    let successCount = 0;
    let failCount = 0;

    for (const broadcastId of userState.data.selected) {
        const messagesToDelete = await this.database.getBroadcastMessages(broadcastId);
        for (const msg of messagesToDelete) {
            const targetChatId = msg.user_id || msg.group_id;
            if (targetChatId) {
                const { ok } = await this.telegram.deleteMessage(targetChatId, msg.message_id);
                if (ok) {
                    successCount++;
                } else {
                    failCount++;
                }
            }
        }
        await this.database.deleteBroadcast(broadcastId);
    }

    await this.state.deleteState(user.id);

    const report = `✅ عملیات حذف انجام شد.\n\n` +
                   `🗑 ${successCount} پیام با موفقیت حذف شد.\n` +
                   `⚠️ ${failCount} پیام حذف نشد (ممکن است توسط کاربر حذف شده باشد).`;

    await this.telegram.editMessageText(chatId, messageId, report, {
        inline_keyboard: [[{ text: "↩️ بازگشت", callback_data: "admin:broadcast" }]]
    });
  }

  private async handleBroadcastSendNew(chatId: number, messageId: number, user: any): Promise<void> {
    if (String(chatId) !== this.adminChatId) {
      await this.telegram.editMessageText(chatId, messageId, BOT_MESSAGES.ADMIN_ONLY);
      return;
    }

    const message = "📢 *پنل ارسال پیام همگانی*\n\n" +
                    "از این بخش می‌توانید پیام‌های خود را به کاربران و گروه‌ها ارسال کنید.";

    const replyMarkup: InlineKeyboardMarkup = {
      inline_keyboard: [
        [
          { text: "✉️ ارسال پیام جدید", callback_data: "broadcast:send_new" },
        ],
        [
          { text: "🗑 حذف آخرین پیام", callback_data: "broadcast:delete_last" },
          { text: "🗑🗑 حذف چند پیام اخیر", callback_data: "broadcast:delete_multiple" }
        ],
        [
          { text: "↩️ بازگشت به پنل ادمین", callback_data: "admin:panel" }
        ]
      ]
    };

    await this.telegram.editMessageText(chatId, messageId, message, replyMarkup);
  }

  private async handleBroadcastDeleteLast(chatId: number, messageId: number, user: any): Promise<void> {
    if (String(chatId) !== this.adminChatId) {
        await this.telegram.editMessageText(chatId, messageId, BOT_MESSAGES.ADMIN_ONLY);
        return;
    }

    await this.telegram.editMessageText(chatId, messageId, "🗑 در حال یافتن و حذف آخرین پیام همگانی...");

    const lastBroadcast = await this.database.getLastBroadcast();
    if (!lastBroadcast) {
        await this.telegram.editMessageText(chatId, messageId, "❌ هیچ پیام همگانی برای حذف یافت نشد.");
        return;
    }

    const messagesToDelete = await this.database.getBroadcastMessages(lastBroadcast.id);
    let successCount = 0;
    let failCount = 0;

    for (const msg of messagesToDelete) {
        const targetChatId = msg.user_id || msg.group_id;
        if (targetChatId) {
            const { ok } = await this.telegram.deleteMessage(targetChatId, msg.message_id);
            if (ok) {
                successCount++;
            } else {
                failCount++;
            }
        }
    }

    await this.database.deleteBroadcast(lastBroadcast.id);

    const report = `✅ عملیات حذف انجام شد.\n\n` +
                   `🗑 ${successCount} پیام با موفقیت حذف شد.\n` +
                   `⚠️ ${failCount} پیام حذف نشد (ممکن است توسط کاربر حذف شده باشد).`;

    await this.telegram.editMessageText(chatId, messageId, report, {
        inline_keyboard: [[{ text: "↩️ بازگشت", callback_data: "admin:broadcast" }]]
    });
  }

  private async handleBroadcastSendNew(chatId: number, messageId: number, user: any): Promise<void> {
    if (String(chatId) !== this.adminChatId) {
        await this.telegram.editMessageText(chatId, messageId, BOT_MESSAGES.ADMIN_ONLY);
        return;
    }

    const message = "❓ چگونه می‌خواهید پیام را ارسال کنید؟";

    const replyMarkup: InlineKeyboardMarkup = {
        inline_keyboard: [
            [
                { text: "👤 فوروارد از طرف ادمین", callback_data: "broadcast:set_method:forward" },
                { text: "🤖 به عنوان پیام ربات", callback_data: "broadcast:set_method:bot" }
            ],
            [
                { text: "↩️ بازگشت", callback_data: "admin:broadcast" }
            ]
        ]
    };

    await this.telegram.editMessageText(chatId, messageId, message, replyMarkup);
  }

  private async handleBroadcastAskSpecific(chatId: number, messageId: number, user: any): Promise<void> {
    const userState = await this.state.getState(user.id);
    if (!userState) return;

    const message = "🎯 لطفاً لیست شناسه‌های چت یا نام‌های کاربری را ارسال کنید.\n\n" +
                    "هر شناسه یا نام کاربری را در یک خط جدید وارد کنید.\n" +
                    "مثال:\n" +
                    "12345678\n" +
                    "@username1\n" +
                    "-100123456789"; // Example for a group chat ID

    const replyMarkup: InlineKeyboardMarkup = {
        inline_keyboard: [
            [
                { text: "↩️ بازگشت", callback_data: "broadcast:set_method:" + userState.data.method }
            ]
        ]
    };

    await this.telegram.editMessageText(chatId, messageId, message, replyMarkup);
  }

  private async handleBroadcastAskMessage(chatId: number, messageId: number, user: any): Promise<void> {
    const userState = await this.state.getState(user.id);
    if (!userState) return; // should not happen

    const message = "✉️ اکنون پیام مورد نظر برای ارسال را بفرستید.\n\n" +
                    "می‌توانید هر نوع پیامی (متن، عکس، ویدیو، فایل و...) را ارسال کنید.";

    const replyMarkup: InlineKeyboardMarkup = {
        inline_keyboard: [
            [
                { text: "↩️ بازگشت", callback_data: "broadcast:set_audience:" + userState.data.audience }
            ]
        ]
    };

    await this.telegram.editMessageText(chatId, messageId, message, replyMarkup);
  }

  private async handleCancelAction(chatId: number, messageId: number, user: any): Promise<void> {
    await this.state.deleteState(user.id);
    const replyMarkup: InlineKeyboardMarkup = {
      inline_keyboard: [
        [{ text: "↩️ بازگشت به منوی اصلی", callback_data: "menu:help" }]
      ]
    };

    await this.telegram.editMessageText(chatId, messageId, "عملیات لغو شد.", replyMarkup);
  }

  // Legacy callback handler for backward compatibility
  private async handleLegacyCallback(data: string, message: any, user: any): Promise<void> {
    // Create fake message for command handler
    const fakeMessage = {
      message_id: message.message_id,
      from: user,
      date: Math.floor(Date.now() / 1000),
      chat: message.chat
    };

    switch (data) {
      case 'today':
        await this.commandHandler.handleToday(fakeMessage);
        break;
      case 'week':
        await this.commandHandler.handleWeek(fakeMessage);
        break;
      case 'week_status':
        await this.commandHandler.handleStatus(fakeMessage);
        break;
      case 'generate_pdf':
        await this.commandHandler.handlePDF(fakeMessage);
        break;
      case 'help':
        await this.commandHandler.handleHelp(fakeMessage);
        break;
      // Add more legacy handlers as needed
    }
  }

  /**
   * Handles schedule deletion confirmation
   */
  private async handleScheduleDeleteConfirmWeek(chatId: number, messageId: number, data: string, user: any): Promise<void> {
    const parts = data.split(':');
    const weekType = parts[3] as 'odd' | 'even';
    const action = parts[4];
    const weekLabel = weekType === 'odd' ? 'فرد' : 'زوج';

    if (action === 'prompt') {
      const message = `⚠️ *اخطار!*\n\nآیا از حذف *تمام* برنامه هفته *${weekLabel}* اطمینان دارید؟ این عمل غیرقابل بازگشت است.`;
      const replyMarkup: InlineKeyboardMarkup = {
        inline_keyboard: [
          [
            { text: `✅ بله، کل هفته ${weekLabel} حذف شود`, callback_data: `schedule:delete:confirm_week:${weekType}:confirm` }
          ],
          [
            { text: `❌ خیر، بازگشت`, callback_data: `schedule:delete:main` }
          ]
        ]
      };
      await this.telegram.editMessageText(chatId, messageId, message, replyMarkup);
      return;
    }
    
    try {
      await this.database.deleteEntireWeekSchedule(user.id, weekType);
      
      const successMessage = `✅ تمام برنامه هفته *${weekLabel}* با موفقیت حذف شد.`;
      const replyMarkup: InlineKeyboardMarkup = {
        inline_keyboard: [
          [{ text: "↩️ بازگشت به منوی حذف", callback_data: "schedule:delete:main" }]
        ]
      };
      
      await this.telegram.editMessageText(chatId, messageId, successMessage, replyMarkup);
    } catch (error) {
      console.error('Error deleting week schedule:', error);
      await this.telegram.editMessageText(chatId, messageId, BOT_MESSAGES.ERROR_OCCURRED, {
         inline_keyboard: [[{ text: "↩️ بازگشت", callback_data: "schedule:delete:main" }]]
      });
    }
  }

  /**
   * Handles schedule deletion by day
   */
  private async handleScheduleDeleteDay(chatId: number, messageId: number, data: string, user: any): Promise<void> {
    const parts = data.split(':');
    const weekType = parts[3] as 'odd' | 'even';
    const day = parts[4];
    const weekLabel = weekType === 'odd' ? 'فرد' : 'زوج';
    const dayIndex = ENGLISH_WEEKDAYS.indexOf(day);
    const dayLabel = PERSIAN_WEEKDAYS[dayIndex];
    
    try {
      const success = await this.database.deleteUserScheduleDay(user.id, weekType, day);
      
      if (success) {
        const successMessage = `✅ تمام دروس روز *${dayLabel}* از هفته *${weekLabel}* حذف شد.`;
        const replyMarkup: InlineKeyboardMarkup = {
          inline_keyboard: [
            [{ text: "↩️ بازگشت به منوی حذف", callback_data: "schedule:delete:main" }]
          ]
        };
        await this.telegram.editMessageText(chatId, messageId, successMessage, replyMarkup);
      } else {
        await this.telegram.editMessageText(chatId, messageId, "❌ هیچ درسی برای حذف در این روز یافت نشد.", {
          inline_keyboard: [[{ text: "↩️ بازگشت", callback_data: `schedule:delete:select_day:${weekType}:day` }]]
        });
      }
    } catch (error) {
      console.error('Error deleting day schedule:', error);
      await this.telegram.editMessageText(chatId, messageId, BOT_MESSAGES.ERROR_OCCURRED, {
         inline_keyboard: [[{ text: "↩️ بازگشت", callback_data: "schedule:delete:main" }]]
      });
    }
  }

  /**
   * Handles deletion of a single lesson
   */
  private async handleScheduleDeleteLesson(chatId: number, messageId: number, data: string, user: any): Promise<void> {
    const parts = data.split(':');
    const weekType = parts[3] as 'odd' | 'even';
    const day = parts[4];
    const lessonIndex = parseInt(parts[5], 10);

    try {
      const success = await this.database.deleteUserScheduleLesson(user.id, weekType, day, lessonIndex);

      if (success) {
        const successMessage = `✅ درس مورد نظر با موفقیت حذف شد.`;
        // Refresh the lesson list view
        await this.handleScheduleDeleteShowDay(chatId, messageId, `schedule:delete:show_day:${weekType}:${day}:lesson`, user);
        await this.telegram.answerCallbackQuery(data, successMessage);

      } else {
        await this.telegram.editMessageText(chatId, messageId, "❌ درس مورد نظر برای حذف یافت نشد. ممکن است قبلا حذف شده باشد.", {
          inline_keyboard: [[{ text: "↩️ بازگشت", callback_data: `schedule:delete:show_day:${weekType}:${day}:lesson` }]]
        });
      }
    } catch (error) {
      console.error('Error deleting lesson:', error);
      await this.telegram.editMessageText(chatId, messageId, BOT_MESSAGES.ERROR_OCCURRED, {
         inline_keyboard: [[{ text: "↩️ بازگشت", callback_data: "schedule:delete:main" }]]
      });
    }
  }

  // =================================================================
  // Absence Management Callbacks
  // =================================================================

  private async getUniqueLessonNames(userId: number): Promise<string[]> {
    const userSchedule = await this.database.getUserSchedule(userId);
    const lessonSet = new Set<string>();

    const processSchedule = (schedule: any) => {
        if (!schedule) return;
        Object.values(schedule).forEach((day: any) => {
            if (Array.isArray(day)) {
                day.forEach((lesson: any) => lessonSet.add(lesson.lesson));
            }
        });
    };

    processSchedule(userSchedule.odd_week_schedule);
    processSchedule(userSchedule.even_week_schedule);

    return Array.from(lessonSet).sort();
  }

  private async handleAbsenceCallback(chatId: number, messageId: number, data: string, user: any): Promise<void> {
      const parts = data.split(':');
      const action = parts[1];
      const lessonName = parts.length > 2 ? parts.slice(2).join(':') : undefined;

      const fakeMessage = { from: user, chat: { id: chatId }, message_id: messageId, date: Date.now() / 1000 };

      switch (action) {
          case 'menu':
              await this.commandHandler.handleAbsences(fakeMessage, true);
              break;
          case 'add_menu':
              await this.handleAbsenceAddMenu(chatId, messageId);
              break;
          case 'list_all':
              await this.handleAbsenceListAll(chatId, messageId, user.id);
              break;
          case 'edit':
              if (lessonName) {
                  await this.handleAbsenceEdit(chatId, messageId, user.id, lessonName);
              }
              break;
          case 'increment':
              if (lessonName) {
                  await this.handleAbsenceIncrement(chatId, messageId, user.id, lessonName);
              }
              break;
          case 'decrement':
              if (lessonName) {
                  await this.handleAbsenceDecrement(chatId, messageId, user.id, lessonName);
              }
              break;
          case 'clear':
              if (lessonName) {
                  await this.handleAbsenceClear(chatId, messageId, user.id, lessonName);
              }
              break;
          case 'add_by_day_picker':
              await this.handleAbsenceAddByDayPicker(chatId, messageId);
              break;
          case 'add_for_day':
              const day = parts[2];
              if (day) {
                  await this.handleAbsenceAddForDay(chatId, messageId, user, day);
              }
              break;
          case 'add_by_course_picker':
              await this.handleAbsenceAddByCoursePicker(chatId, messageId, user.id);
              break;
      }
  }

  private async handleAbsenceAddMenu(chatId: number, messageId: number): Promise<void> {
    const text = "➕ *ثبت غیبت*\n\nچگونه می‌خواهید غیبت را ثبت کنید؟";
    const replyMarkup: InlineKeyboardMarkup = {
        inline_keyboard: [
            [
                { text: "🗓 بر اساس روز هفته", callback_data: "absence:add_by_day_picker" },
                { text: "📚 بر اساس درس خاص", callback_data: "absence:add_by_course_picker" },
            ],
            [
                { text: "↩️ بازگشت", callback_data: "absence:menu" }
            ]
        ]
    };
    await this.telegram.editMessageText(chatId, messageId, text, replyMarkup);
  }

  private async handleAbsenceAddByDayPicker(chatId: number, messageId: number): Promise<void> {
      const text = "🗓 *ثبت غیبت بر اساس روز*\n\nلطفا روز مورد نظر را انتخاب کنید. با انتخاب هر روز، برای تمام کلاس‌های آن روز یک غیبت ثبت می‌شود.";

      const dayButtons = PERSIAN_WEEKDAYS.slice(0, 5).map((day, index) => ({
          text: day,
          callback_data: `absence:add_for_day:${ENGLISH_WEEKDAYS[index]}`
      }));

      const rows = [];
      for (let i = 0; i < dayButtons.length; i += 2) {
          if (i + 1 < dayButtons.length) {
              rows.push([dayButtons[i], dayButtons[i+1]]);
          } else {
              rows.push([dayButtons[i]]);
          }
      }

      const replyMarkup: InlineKeyboardMarkup = {
          inline_keyboard: [
              ...rows,
              [
                  { text: "↩️ بازگشت", callback_data: "absence:add_menu" }
              ]
          ]
      };
      await this.telegram.editMessageText(chatId, messageId, text, replyMarkup);
  }

  private async handleAbsenceAddByCoursePicker(chatId: number, messageId: number, userId: number): Promise<void> {
      const text = "📚 *ثبت غیبت بر اساس درس*\n\nلطفا درسی که می‌خواهید برای آن غیبت ثبت کنید را انتخاب نمایید.";
      const lessons = await this.getUniqueLessonNames(userId);

      if (lessons.length === 0) {
          await this.telegram.editMessageText(chatId, messageId, "شما هنوز هیچ درسی در برنامه خود ثبت نکرده‌اید. ابتدا از منوی اصلی برنامه خود را تنظیم کنید.", {
              inline_keyboard: [[{ text: "↩️ بازگشت", callback_data: "absence:add_menu" }]]
          });
          return;
      }

      const lessonButtons = lessons.map(lesson => ([{
          text: lesson,
          callback_data: `absence:edit:${lesson}`
      }]));

      const replyMarkup: InlineKeyboardMarkup = {
          inline_keyboard: [
              ...lessonButtons,
              [
                  { text: "↩️ بازگشت", callback_data: "absence:add_menu" }
              ]
          ]
      };
      await this.telegram.editMessageText(chatId, messageId, text, replyMarkup);
  }

  private async handleAbsenceListAll(chatId: number, messageId: number, userId: number): Promise<void> {
    const text = "👁️ *مشاهده و ویرایش غیبت‌ها*\n\nدر لیست زیر، دروسی که برای آن‌ها غیبت ثبت کرده‌اید به همراه تعداد غیبت‌ها نمایش داده شده است. با کلیک بر روی هر درس می‌توانید آن را ویرایش کنید.";
    const allLessons = await this.getUniqueLessonNames(userId);
    const absences = await this.database.getAbsences(userId);
    const absenceMap = new Map(absences.map(a => [a.lesson_name, a.absence_count]));

    if (allLessons.length === 0) {
        await this.telegram.editMessageText(chatId, messageId, "شما هنوز هیچ درسی در برنامه خود ثبت نکرده‌اید.", {
            inline_keyboard: [[{ text: "↩️ بازگشت", callback_data: "absence:menu" }]]
        });
        return;
    }

    const lessonButtons = allLessons.map(lesson => {
        const count = absenceMap.get(lesson) || 0;
        return [{ text: `${lesson} (${count} غیبت)`, callback_data: `absence:edit:${lesson}` }];
    });

    const replyMarkup: InlineKeyboardMarkup = {
        inline_keyboard: [
            ...lessonButtons,
            [
                { text: "↩️ بازگشت", callback_data: "absence:menu" }
            ]
        ]
    };
    await this.telegram.editMessageText(chatId, messageId, text, replyMarkup);
  }

  private async handleAbsenceEdit(chatId: number, messageId: number, userId: number, lessonName: string): Promise<void> {
      const absences = await this.database.getAbsences(userId);
      const absence = absences.find(a => a.lesson_name === lessonName);
      const count = absence ? absence.absence_count : 0;

      const text = `✏️ *ویرایش غیبت‌های درس: ${lessonName}*\n\nتعداد غیبت‌های ثبت شده: *${count}*`;

      const replyMarkup: InlineKeyboardMarkup = {
          inline_keyboard: [
              [
                  { text: "➕", callback_data: `absence:increment:${lessonName}` },
                  { text: "➖", callback_data: `absence:decrement:${lessonName}` },
              ],
              [
                  { text: "🗑️ پاک کردن تمام غیبت‌ها", callback_data: `absence:clear:${lessonName}` }
              ],
              [
                  { text: "↩️ بازگشت به لیست", callback_data: "absence:list_all" }
              ]
          ]
      };
      await this.telegram.editMessageText(chatId, messageId, text, replyMarkup);
  }

  private async handleAbsenceIncrement(chatId: number, messageId: number, userId: number, lessonName: string): Promise<void> {
      const newCount = await this.database.upsertAbsence(userId, lessonName, 1);
      await this.handleAbsenceEdit(chatId, messageId, userId, lessonName);

      if (newCount === 2) {
          await this.telegram.sendMessage(chatId, BOT_MESSAGES.ABSENCE_WARNING(lessonName));
      } else if (newCount === 3) {
          await this.telegram.sendMessage(chatId, BOT_MESSAGES.ABSENCE_DANGER(lessonName));
      }
  }

  private async handleAbsenceDecrement(chatId: number, messageId: number, userId: number, lessonName: string): Promise<void> {
      await this.database.upsertAbsence(userId, lessonName, -1);
      await this.handleAbsenceEdit(chatId, messageId, userId, lessonName);
  }

  private async handleAbsenceClear(chatId: number, messageId: number, userId: number, lessonName: string): Promise<void> {
      await this.database.deleteAbsence(userId, lessonName);
      await this.handleAbsenceEdit(chatId, messageId, userId, lessonName);
  }

  private async handleAbsenceAddForDay(chatId: number, messageId: number, user: any, day: string): Promise<void> {
      const userSchedule = await this.database.getUserSchedule(user.id);
      const dayLessons = new Set<string>();

      const oddDaySchedule = userSchedule.odd_week_schedule[day] || [];
      const evenDaySchedule = userSchedule.even_week_schedule[day] || [];

      oddDaySchedule.forEach(l => dayLessons.add(l.lesson));
      evenDaySchedule.forEach(l => dayLessons.add(l.lesson));

      if (dayLessons.size === 0) {
          await this.telegram.editMessageText(chatId, messageId, "در این روز هیچ کلاسی برای ثبت غیبت وجود ندارد.", {
              inline_keyboard: [[{ text: "↩️ بازگشت", callback_data: "absence:add_by_day_picker" }]]
          });
          return;
      }

      let reportMessage = "✅ *غیبت‌های روزانه ثبت شد*\n\n";
      for (const lessonName of dayLessons) {
          const newCount = await this.database.upsertAbsence(user.id, lessonName, 1);
          reportMessage += `- *${lessonName}*: ${newCount} غیبت\n`;

          if (newCount === 2) {
              await this.telegram.sendMessage(chatId, BOT_MESSAGES.ABSENCE_WARNING(lessonName));
          } else if (newCount === 3) {
              await this.telegram.sendMessage(chatId, BOT_MESSAGES.ABSENCE_DANGER(lessonName));
          }
      }

      await this.telegram.editMessageText(chatId, messageId, reportMessage, {
          inline_keyboard: [[{ text: "↩️ بازگشت به منوی غیبت", callback_data: "absence:menu" }]]
      });
  }
}