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
        await this.handleScheduleDeleteMain(chatId, messageId, user);
      }
      else if (data.startsWith("schedule:delete:select_week:")) {
        await this.handleScheduleSetSelectWeek(chatId, messageId);
      }
      else if (data.startsWith("schedule:delete:select_day:")) {
        await this.handleScheduleSetSelectDay(chatId, messageId, data);
      }
      else if (data.startsWith("schedule:delete:lesson:")) {
        await this.handleScheduleDeleteMain(chatId, messageId, user);
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
      
      // Teleport callbacks
      else if (data === "teleport:ask_date") {
        await this.handleTeleportAskDate(chatId, messageId, user);
      }
      
      // Broadcast callbacks
      else if (data === "broadcast_users") {
        await this.handleBroadcastUsers(chatId, messageId, user);
      }
      else if (data === "broadcast_groups") {
        await this.handleBroadcastGroups(chatId, messageId, user);
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
      await this.telegram.editMessageText(chatId, messageId, BOT_MESSAGES.NO_SCHEDULE);
      return;
    }

    const message = BOT_MESSAGES.DELETE_SCHEDULE_MAIN;
    
    const replyMarkup: InlineKeyboardMarkup = {
      inline_keyboard: [
        [
          { text: "🟣 حذف کل هفته فرد", callback_data: "schedule:delete:confirm_week:odd" },
          { text: "🟢 حذف کل هفته زوج", callback_data: "schedule:delete:confirm_week:even" }
        ],
        [
          { text: "🗑️ حذف دروس یک روز خاص", callback_data: "schedule:delete:select_week:day" },
          { text: "❌ حذف یک درس خاص", callback_data: "schedule:delete:select_week:lesson" }
        ],
        [
          { text: "↩️ بازگشت (منو برنامه)", callback_data: "menu:schedule" }
        ]
      ]
    };

    await this.telegram.editMessageText(chatId, messageId, message, replyMarkup);
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
            [{ text: "↩️ بازگشت به منوی برنامه", callback_data: "menu:schedule" }]
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

  private async handleBroadcastUsers(chatId: number, messageId: number, user: any): Promise<void> {
    if (String(chatId) !== this.adminChatId) {
      await this.telegram.editMessageText(chatId, messageId, BOT_MESSAGES.ADMIN_ONLY);
      return;
    }

    await this.telegram.editMessageText(
      chatId,
      messageId,
      "📢 پیام مورد نظر برای ارسال به تمام کاربران را ارسال کنید:"
    );
  }

  private async handleBroadcastGroups(chatId: number, messageId: number, user: any): Promise<void> {
    if (String(chatId) !== this.adminChatId) {
      await this.telegram.editMessageText(chatId, messageId, BOT_MESSAGES.ADMIN_ONLY);
      return;
    }

    await this.telegram.editMessageText(
      chatId,
      messageId,
      "📢 پیام مورد نظر برای ارسال به تمام گروه‌ها را ارسال کنید:"
    );
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
    const weekType = data.split(':')[3] as 'odd' | 'even';
    const weekLabel = weekType === 'odd' ? 'فرد' : 'زوج';
    
    try {
      await this.database.deleteEntireWeekSchedule(user.id, weekType);
      
      const successMessage = `✅ تمام برنامه هفته ${weekLabel} با موفقیت حذف شد.`;
      const replyMarkup: InlineKeyboardMarkup = {
        inline_keyboard: [
          [{ text: "↩️ بازگشت به منوی برنامه", callback_data: "menu:schedule" }]
        ]
      };
      
      await this.telegram.editMessageText(chatId, messageId, successMessage, replyMarkup);
    } catch (error) {
      console.error('Error deleting week schedule:', error);
      await this.telegram.editMessageText(chatId, messageId, BOT_MESSAGES.ERROR_OCCURRED);
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
        const successMessage = `✅ تمام دروس روز ${dayLabel} از هفته ${weekLabel} حذف شد.`;
        const replyMarkup: InlineKeyboardMarkup = {
          inline_keyboard: [
            [{ text: "↩️ بازگشت به منوی حذف", callback_data: "schedule:delete:main" }]
          ]
        };
        
        await this.telegram.editMessageText(chatId, messageId, successMessage, replyMarkup);
      } else {
        await this.telegram.editMessageText(chatId, messageId, "❌ هیچ درسی برای حذف یافت نشد.");
      }
    } catch (error) {
      console.error('Error deleting day schedule:', error);
      await this.telegram.editMessageText(chatId, messageId, BOT_MESSAGES.ERROR_OCCURRED);
    }
  }
}