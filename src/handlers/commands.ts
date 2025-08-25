import type { TelegramMessage, InlineKeyboardMarkup, BotStats } from '../types';
import { TelegramService } from '../services/telegram';
import { DatabaseService } from '../services/database';
import { PDFService } from '../services/pdf';
import { StateService } from '../services/state';
import { BOT_MESSAGES, PERSIAN_WEEKDAYS, PERSIAN_WEEKDAYS_FULL, ENGLISH_WEEKDAYS, REFERENCE_PERSIAN_DAY, REFERENCE_PERSIAN_MONTH, REFERENCE_PERSIAN_YEAR, REFERENCE_STATUS } from '../config/constants';
import { getPersianDate, getWeekStatus, parsePersianDate, jalaliToGregorian, getPersianMonthName } from '../utils/persian';
import { parseTime } from '../utils/time';

export class CommandHandler {
  constructor(
    private telegram: TelegramService,
    private database: DatabaseService,
    private pdf: PDFService,
    private state: StateService,
    private adminChatId: string
  ) {}

  /**
   * Handles /start command - Exact match with original JS
   */
  async handleStart(message: TelegramMessage): Promise<void> {
    const user = message.from;
    const chat = message.chat;
    
    if (!user) return;

    await this.database.logUsage(user, chat, '/start');

    try {
      if (chat.type === "private") {
        await this.database.addUser(user, chat);
        
        const welcomeMessage = BOT_MESSAGES.WELCOME_PRIVATE(user.first_name);
        const replyMarkup: InlineKeyboardMarkup = {
          inline_keyboard: [
            [
              { text: "🔄 وضعیت هفته و برنامه امروز", callback_data: "menu:week_status" },
            ],
            [
              { text: "📅 مشاهده برنامه کامل", callback_data: "schedule:view:full" },
              { text: "⚙️ تنظیم/ویرایش برنامه", callback_data: "menu:schedule" },
            ],
            [
              { text: "🚷 مدیریت غیبت‌ها", callback_data: "absence:menu" }
            ],
            [
              { text: "📤 دریافت PDF برنامه", callback_data: "pdf:export" },
              { text: "ℹ️ راهنما", callback_data: "menu:help" }
            ]
          ],
        };
        
        await this.telegram.sendMessage(chat.id, welcomeMessage, replyMarkup);
      } else if (chat.type === "group" || chat.type === "supergroup") {
        await this.database.addGroup(chat);
        const botInfo = await this.telegram.getBotInfo();
        const botUsername = botInfo.result?.username || "this_bot";
        
        await this.telegram.sendMessage(
          chat.id, 
          BOT_MESSAGES.WELCOME_GROUP(botUsername), 
          undefined, 
          message.message_id
        );
      }
    } catch (error) {
      console.error(`[Command:/start] Error for chat ${chat.id}: ${error}`);
      await this.telegram.sendMessage(chat.id, "⚠️ متاسفانه مشکلی در اجرای دستور /start پیش آمد.");
    }
  }

  /**
   * Handles /help command - Exact match with original JS
   */
  async handleHelp(message: TelegramMessage, fromCallback = false): Promise<void> {
    const user = message.from;
    const chat = message.chat;
    
    if (!user) return;

    await this.database.logUsage(user, chat, fromCallback ? "callback: menu:help" : "/help");

    try {
      const isAdmin = String(user.id) === this.adminChatId;
      const helpMessage = BOT_MESSAGES.HELP(isAdmin, chat.type === "private");
      
      const replyMarkup: InlineKeyboardMarkup = {
        inline_keyboard: [
          [
            { text: "🔄 وضعیت هفته و برنامه امروز", callback_data: "menu:week_status" },
          ],
          [
            { text: "📅 مشاهده برنامه کامل", callback_data: "schedule:view:full" },
            { text: "⚙️ تنظیم/ویرایش برنامه", callback_data: "menu:schedule" },
          ],
          [
            { text: "📤 دریافت PDF برنامه", callback_data: "pdf:export" },
            { text: "🔮 تلپورت", callback_data: "teleport:ask_date" }
          ],
          ...(isAdmin && chat.type === "private" ? [[{ text: "👑 پنل مدیریت", callback_data: "admin:panel" }]] : []),
        ].filter(row => row.length > 0)
      };

      if (fromCallback && 'message_id' in message) {
        await this.telegram.editMessageText(chat.id, message.message_id, helpMessage, replyMarkup);
      } else {
        await this.telegram.sendMessage(chat.id, helpMessage, replyMarkup, message.message_id);
      }
    } catch (error) {
      console.error(`[Command:/help] Error for chat ${chat.id}: ${error}`);
      const errorMsg = "⚠️ خطا در نمایش راهنما.";
      if (fromCallback && 'message_id' in message) {
        await this.telegram.editMessageText(chat.id, message.message_id, errorMsg);
      } else {
        await this.telegram.sendMessage(chat.id, errorMsg, undefined, message.message_id);
      }
    }
  }

  /**
   * Handles /absences command
   */
  async handleAbsences(message: TelegramMessage, fromCallback = false): Promise<void> {
    const user = message.from;
    const chat = message.chat;

    if (!user) return;

    await this.database.logUsage(user, chat, fromCallback ? "callback: absence:menu" : "/absences");

    try {
      if (chat.type !== "private") {
        const botInfo = await this.telegram.getBotInfo();
        const botUsername = botInfo.result?.username || "this_bot";
        await this.telegram.sendMessage(
          chat.id,
          BOT_MESSAGES.PRIVATE_ONLY(botUsername),
          undefined,
          message.message_id
        );
        return;
      }

      await this.database.addUser(user, chat);

      const absenceMessage = "🚷 *مدیریت غیبت‌ها*\n\nاز این بخش می‌توانید غیبت‌های خود را مدیریت کنید.";
      const replyMarkup: InlineKeyboardMarkup = {
        inline_keyboard: [
          [
            { text: "➕ ثبت غیبت", callback_data: "absence:add_menu" },
            { text: "👁️ مشاهده و ویرایش غیبت‌ها", callback_data: "absence:list_all" },
          ],
          [{ text: "↩️ بازگشت به منوی اصلی", callback_data: "menu:help" }],
        ],
      };

      if (fromCallback && 'message_id' in message) {
        await this.telegram.editMessageText(chat.id, message.message_id, absenceMessage, replyMarkup);
      } else {
        await this.telegram.sendMessage(chat.id, absenceMessage, replyMarkup, message.message_id);
      }
    } catch (error) {
      console.error(`[Command:/absences] Error for chat ${chat.id}: ${error}`);
      const errorMsg = "⚠️ خطا در پردازش دستور /absences.";
      if (fromCallback && 'message_id' in message) {
        await this.telegram.editMessageText(chat.id, message.message_id, errorMsg);
      } else {
        await this.telegram.sendMessage(chat.id, errorMsg, undefined, message.message_id);
      }
    }
  }

  /**
   * Handles /today command
   */
  async handleToday(message: TelegramMessage): Promise<void> {
    const user = message.from;
    const chat = message.chat;
    
    if (!user) return;

    await this.database.logUsage(user, chat, '/today');

    try {
      const userSchedule = await this.database.getUserSchedule(user.id);
      const weekStatus = getWeekStatus();
      const currentSchedule = weekStatus === "فرد" ? userSchedule.odd_week_schedule : userSchedule.even_week_schedule;
      
      // Get current day in English
      const now = new Date();
      const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday
      const dayMapping = [1, 2, 3, 4, 5, 6, 0]; // Convert to Persian week (Saturday = 0)
      const persianDayIndex = dayMapping[dayOfWeek];
      const englishDay = ENGLISH_WEEKDAYS[persianDayIndex];
      const persianDay = PERSIAN_WEEKDAYS[persianDayIndex];

      const todayLessons = currentSchedule[englishDay] || [];

      let responseText = `📅 ${getPersianDate()}\n`;
      responseText += `📊 هفته ${weekStatus}\n\n`;

      if (todayLessons.length === 0) {
        responseText += `🎉 امروز ${persianDay} کلاسی ندارید!`;
      } else {
        responseText += `📚 برنامه امروز (${persianDay}):\n\n`;
        todayLessons.forEach((lesson, index) => {
          responseText += `${index + 1}. ${lesson.lesson}\n`;
          responseText += `   ⏰ ${lesson.start_time} - ${lesson.end_time}\n`;
          responseText += `   📍 ${lesson.location}\n\n`;
        });
      }

      await this.telegram.sendMessage(chat.id, responseText);
    } catch (error) {
      console.error('Error in handleToday:', error);
      await this.telegram.sendMessage(chat.id, BOT_MESSAGES.ERROR_OCCURRED);
    }
  }

  /**
   * Handles /week command - Exact match with original JS
   */
  async handleWeek(message: TelegramMessage, fromCallback = false): Promise<void> {
    const user = message.from;
    const chat = message.chat;
    
    if (!user) return;

    await this.database.logUsage(user, chat, fromCallback ? "callback: menu:week_status" : "/week");

    try {
      const currentWeekStatus = getWeekStatus();
      const persianDate = getPersianDate();
      
      if (currentWeekStatus.includes("خطا") || currentWeekStatus.includes("نامشخص")) {
        const errorMsg = `❌ ${persianDate}\n\nخطا در محاسبه وضعیت هفته: ${currentWeekStatus}`;
        if (fromCallback && 'message_id' in message) {
          await this.telegram.editMessageText(chat.id, message.message_id, errorMsg);
        } else {
          await this.telegram.sendMessage(chat.id, errorMsg, undefined, message.message_id);
        }
        return;
      }

      const currentWeekEmoji = currentWeekStatus === "زوج" ? "🟢" : "🟣";
      const nextWeekStatus = currentWeekStatus === "زوج" ? "فرد" : "زوج";
      const nextWeekEmoji = nextWeekStatus === "زوج" ? "🟢" : "🟣";
      
      let weekMessage = `${persianDate}\n\n`;
      weekMessage += `${currentWeekEmoji} هفته فعلی: *${currentWeekStatus}* است\n`;
      weekMessage += `${nextWeekEmoji} هفته بعدی: *${nextWeekStatus}* خواهد بود\n\n`;
      
      let replyMarkup: InlineKeyboardMarkup = { inline_keyboard: [] };
      
      if (chat.type === "private") {
        const schedule = await this.database.getUserSchedule(user.id);
        const now = new Date();
        // Convert to Tehran timezone and get day index
        const todayIndex = (now.getDay() + 1) % 7; // Adjust for Persian week starting on Saturday
        const todayDayKey = ENGLISH_WEEKDAYS[todayIndex];
        const todayPersianDay = PERSIAN_WEEKDAYS_FULL[todayIndex];
        
        const todaySchedule = currentWeekStatus === "زوج"
          ? (schedule.even_week_schedule[todayDayKey] || [])
          : (schedule.odd_week_schedule[todayDayKey] || []);

        if (todayIndex < 5 && todaySchedule.length > 0) {
          weekMessage += `📅 *برنامه امروز (${todayPersianDay}):*\n\n`;
          todaySchedule.forEach((lesson, idx) => {
            const startMins = parseTime(lesson.start_time);
            let classNum = "";
            if (startMins && startMins >= 8*60 && startMins < 10*60) classNum = "(کلاس اول) ";
            else if (startMins && startMins >= 10*60 && startMins < 12*60) classNum = "(کلاس دوم) ";
            else if (startMins && startMins >= 13*60 && startMins < 15*60) classNum = "(کلاس سوم) ";
            else if (startMins && startMins >= 15*60 && startMins < 17*60) classNum = "(کلاس چهارم) ";
            else if (startMins && startMins >= 17*60 && startMins < 19*60) classNum = "(کلاس پنجم) ";
            
            weekMessage += `${idx + 1}. ${classNum}*${lesson.lesson}*\n`;
            weekMessage += `   ⏰ ${lesson.start_time}-${lesson.end_time} | 📍 ${lesson.location || '-'}\n`;
          });
        } else if (todayIndex < 5) {
          weekMessage += BOT_MESSAGES.NO_SCHEDULE_TODAY(todayPersianDay, currentWeekStatus);
        } else {
          weekMessage += BOT_MESSAGES.WEEKEND_MESSAGE(todayPersianDay);
        }

        replyMarkup = {
          inline_keyboard: [
            [
              { text: "🔄 بروزرسانی", callback_data: "menu:week_status" },
            ],
            [
              { text: "📅 مشاهده برنامه کامل", callback_data: "schedule:view:full" },
              { text: "⚙️ تنظیم/ویرایش برنامه", callback_data: "menu:schedule" },
            ],
            [{ text: "↩️ بازگشت به منوی اصلی", callback_data: "menu:help" }]
          ],
        };
      } else {
        replyMarkup = {
          inline_keyboard: [
            [{ text: "🔄 بروزرسانی وضعیت", callback_data: "menu:week_status" }],
          ],
        };
      }

      if (fromCallback && 'message_id' in message) {
        await this.telegram.editMessageText(chat.id, message.message_id, weekMessage, replyMarkup);
      } else {
        await this.telegram.sendMessage(chat.id, weekMessage, replyMarkup, message.message_id);
      }
    } catch (error) {
      console.error(`[Command:/week] Error for chat ${chat.id}: ${error}`);
      const errorMsg = "⚠️ خطا در پردازش دستور /week.";
      if (fromCallback && 'message_id' in message) {
        await this.telegram.editMessageText(chat.id, message.message_id, errorMsg);
      } else {
        await this.telegram.sendMessage(chat.id, errorMsg, undefined, message.message_id);
      }
    }
  }

  /**
   * Handles /status command
   */
  async handleStatus(message: TelegramMessage): Promise<void> {
    const user = message.from;
    const chat = message.chat;
    
    if (!user) return;

    await this.database.logUsage(user, chat, '/status');

    const weekStatus = getWeekStatus();
    const persianDate = getPersianDate();
    
    const responseText = `${persianDate}\n\n📊 وضعیت هفته فعلی: ${weekStatus}`;
    
    await this.telegram.sendMessage(chat.id, responseText);
  }

  /**
   * Handles /schedule command - Exact match with original JS
   */
  async handleSchedule(message: TelegramMessage, fromCallback = false): Promise<void> {
    const user = message.from;
    const chat = message.chat;
    
    if (!user) return;

    await this.database.logUsage(user, chat, fromCallback ? "callback: menu:schedule" : "/schedule");

    try {
      if (chat.type !== "private") {
        const botInfo = await this.telegram.getBotInfo();
        const botUsername = botInfo.result?.username || "this_bot";
        await this.telegram.sendMessage(
          chat.id, 
          BOT_MESSAGES.PRIVATE_ONLY(botUsername), 
          undefined, 
          message.message_id
        );
        return;
      }

      await this.database.addUser(user, chat);
      
      const scheduleMessage = BOT_MESSAGES.SCHEDULE_MANAGEMENT;
      const replyMarkup: InlineKeyboardMarkup = {
        inline_keyboard: [
          [
            { text: "⚙️ تنظیم / افزودن درس", callback_data: "schedule:set:select_week" },
            { text: "🗑️ حذف درس / روز / هفته", callback_data: "schedule:delete:main" },
          ],
          [
            { text: "📅 مشاهده برنامه کامل", callback_data: "schedule:view:full" },
            { text: "📤 خروجی PDF برنامه", callback_data: "pdf:export" }
          ],
          [{ text: "↩️ بازگشت به منوی اصلی", callback_data: "menu:help" }],
        ],
      };

      if (fromCallback && 'message_id' in message) {
        await this.telegram.editMessageText(chat.id, message.message_id, scheduleMessage, replyMarkup);
      } else {
        await this.telegram.sendMessage(chat.id, scheduleMessage, replyMarkup, message.message_id);
      }
    } catch (error) {
      console.error(`[Command:/schedule] Error for chat ${chat.id}: ${error}`);
      const errorMsg = "⚠️ خطا در پردازش دستور /schedule.";
      if (fromCallback && 'message_id' in message) {
        await this.telegram.editMessageText(chat.id, message.message_id, errorMsg);
      } else {
        await this.telegram.sendMessage(chat.id, errorMsg, undefined, message.message_id);
      }
    }
  }

  /**
   * Handles /pdf command
   */
  async handlePDF(message: TelegramMessage): Promise<void> {
    const user = message.from;
    const chat = message.chat;
    
    if (!user) return;

    await this.database.logUsage(user, chat, '/pdf');

    try {
      await this.telegram.sendMessage(chat.id, BOT_MESSAGES.PDF_GENERATING);

      const userSchedule = await this.database.getUserSchedule(user.id);
      
      // Check if user has any schedule
      const hasOddSchedule = Object.keys(userSchedule.odd_week_schedule).length > 0;
      const hasEvenSchedule = Object.keys(userSchedule.even_week_schedule).length > 0;
      
      if (!hasOddSchedule && !hasEvenSchedule) {
        await this.telegram.sendMessage(chat.id, BOT_MESSAGES.NO_SCHEDULE);
        return;
      }

      const fullName = `${user.first_name || ""} ${user.last_name || ""}`.trim() || `کاربر ${user.id}`;
      const pdfBuffer = await this.pdf.generateSchedulePDF(userSchedule, user.id);
      const filename = `schedule_${fullName.replace(/[^a-zA-Z0-9]/g, '_')}_${user.id}.pdf`;

      await this.telegram.sendDocument(
        chat.id,
        pdfBuffer,
        filename,
        BOT_MESSAGES.PDF_GENERATED(fullName)
      );
    } catch (error) {
      console.error('Error in handlePDF:', error);
      await this.telegram.sendMessage(chat.id, BOT_MESSAGES.ERROR_OCCURRED);
    }
  }

  /**
   * Handles /admin command - Exact match with original JS
   */
  async handleAdmin(message: TelegramMessage, fromCallback = false): Promise<void> {
    const user = message.from;
    const chat = message.chat;
    
    if (!user) return;

    const isAdmin = String(user.id) === this.adminChatId;
    await this.database.logUsage(user, chat, fromCallback ? "callback: admin:panel" : "/admin");

    if (!isAdmin || chat.type !== "private") {
      await this.telegram.sendMessage(chat.id, BOT_MESSAGES.ADMIN_ONLY, undefined, message.message_id);
      return;
    }

    const weekStatus = getWeekStatus();
    const adminMessage = BOT_MESSAGES.ADMIN_PANEL(weekStatus);
    const replyMarkup: InlineKeyboardMarkup = {
      inline_keyboard: [
        [
          { text: "📊 آمار ربات", callback_data: "admin:stats" },
        ],
        [
          { text: "↩️ بازگشت به منوی اصلی", callback_data: "menu:help" },
        ]
      ],
    };

    if (fromCallback && 'message_id' in message) {
      await this.telegram.editMessageText(chat.id, message.message_id, adminMessage, replyMarkup);
    } else {
      await this.telegram.sendMessage(chat.id, adminMessage, replyMarkup, message.message_id);
    }
  }

  /**
   * Handles /stats command - Exact match with original JS
   */
  async handleStats(message: TelegramMessage, fromCallback = false): Promise<void> {
    const user = message.from;
    const chat = message.chat;
    
    if (!user) return;

    const isAdmin = String(user.id) === this.adminChatId;
    await this.database.logUsage(user, chat, fromCallback ? "callback: admin:stats" : "/stats");

    if (!isAdmin || chat.type !== "private") {
      await this.telegram.sendMessage(chat.id, BOT_MESSAGES.ADMIN_ONLY, undefined, message.message_id);
      return;
    }

    if (fromCallback) {
      await this.telegram.answerCallbackQuery(
        (message as any).callback_query_id, 
        BOT_MESSAGES.STATS_LOADING
      );
    }

    try {
      // Get stats from database
      const [usersResult, groupsResult, usageResult, scheduleResult] = await Promise.all([
        this.database.getUserCount(),
        this.database.getGroupCount(),
        this.database.getUsageCount(),
        this.database.getScheduleCount()
      ]);

      const currentStatus = getWeekStatus();
      
      let statsMessage = `📊 *آمار ربات (Supabase)*\n\n`;
      statsMessage += `📅 وضعیت هفته فعلی: *${currentStatus}*\n`;
      statsMessage += `👤 کاربران ثبت شده: ${usersResult}\n`;
      statsMessage += `👥 گروه‌های ثبت شده: ${groupsResult}\n`;
      statsMessage += `🗓️ کاربران با برنامه: ${scheduleResult}\n`;
      statsMessage += `📈 کل استفاده ثبت شده: ${usageResult}\n\n`;

      const statsReplyMarkup: InlineKeyboardMarkup = {
        inline_keyboard: [
          [{ text: "🔄 بروزرسانی آمار", callback_data: "admin:stats" }],
          [{ text: "↩️ بازگشت به پنل ادمین", callback_data: "admin:panel" }],
        ],
      };

      if (fromCallback && 'message_id' in message) {
        await this.telegram.editMessageText(chat.id, message.message_id, statsMessage, statsReplyMarkup);
        if ((message as any).callback_query_id) {
          await this.telegram.answerCallbackQuery((message as any).callback_query_id);
        }
      } else {
        await this.telegram.sendMessage(chat.id, statsMessage, statsReplyMarkup, message.message_id);
      }
    } catch (e) {
      console.error(`[Command:/stats] Error: ${e}`);
      const errorMsg = "خطا در دریافت آمار از Supabase.";
      if (fromCallback && 'message_id' in message) {
        if ((message as any).callback_query_id) {
          await this.telegram.answerCallbackQuery((message as any).callback_query_id, errorMsg, true);
        }
        await this.telegram.editMessageText(
          chat.id, 
          message.message_id, 
          errorMsg, 
          { inline_keyboard: [[{ text: "↩️ بازگشت", callback_data: "admin:panel" }]] }
        );
      } else {
        await this.telegram.sendMessage(chat.id, errorMsg, undefined, message.message_id);
      }
    }
  }









  /**
   * Handles /teleport command - Exact match with original JS
   */
  async handleTeleport(message: TelegramMessage): Promise<void> {
    const user = message.from;
    const chat = message.chat;
    const text = message.text || '';
    
    if (!user) return;

    await this.database.logUsage(user, chat, '/teleport');

    const parts = text.trim().split(/\s+/);
    if (parts.length < 2) {
      await this.telegram.sendMessage(chat.id, BOT_MESSAGES.TELEPORT_PROMPT);
      return;
    }

    const persianDateStr = parts.slice(1).join(' ');
    const parsedDate = parsePersianDate(persianDateStr);
    
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

      // Calculate week status for target date
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
          const englishDay = ENGLISH_WEEKDAYS[persianDayIndex];
          const persianDay = PERSIAN_WEEKDAYS[persianDayIndex];
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

      const replyMarkup: InlineKeyboardMarkup = {
        inline_keyboard: [
          [{ text: "🔮 تلپورت دوباره", callback_data: "teleport:ask_date" }],
          [{ text: "↩️ بازگشت به منوی اصلی", callback_data: "menu:help" }]
        ]
      };

      await this.telegram.sendMessage(chat.id, teleportMessage, replyMarkup);
    } catch (error) {
      console.error(`[Command:/teleport] Error:`, error);
      await this.telegram.sendMessage(chat.id, BOT_MESSAGES.ERROR_OCCURRED);
    }
  }



  /**
   * Handles admin broadcast command
   */
  async handleBroadcast(message: TelegramMessage): Promise<void> {
    const user = message.from;
    const chat = message.chat;
    
    if (!user || String(chat.id) !== this.adminChatId) {
      await this.telegram.sendMessage(chat.id, BOT_MESSAGES.ADMIN_ONLY);
      return;
    }

    await this.database.logUsage(user, chat, '/broadcast');

    const keyboard: InlineKeyboardMarkup = {
      inline_keyboard: [
        [
          { text: "👥 ارسال به کاربران", callback_data: "broadcast_users" },
          { text: "👥 ارسال به گروه‌ها", callback_data: "broadcast_groups" }
        ]
      ]
    };

    await this.telegram.sendMessage(
      chat.id,
      "📢 انتخاب کنید که پیام را به کدام دسته ارسال کنید:",
      keyboard
    );
  }



  /**
   * Calculates week status for a specific date
   */
  private calculateWeekStatusForDate(targetDate: Date): string {
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
      
      const currentWeekStartDate = this.getStartOfWeekPersian(targetDate);
      const referenceWeekStartDate = this.getStartOfWeekPersian(REFERENCE_DATE_GREGORIAN);
      
      if (isNaN(currentWeekStartDate.getTime()) || isNaN(referenceWeekStartDate.getTime())) {
        throw new Error("Invalid date calculation");
      }
      
      const timeDifference = currentWeekStartDate.getTime() - referenceWeekStartDate.getTime();
      const daysDifference = Math.floor(timeDifference / (24 * 60 * 60 * 1000));
      const weeksPassed = Math.floor(daysDifference / 7);
      
      const currentStatus = weeksPassed % 2 === 0 
        ? REFERENCE_STATUS 
        : (REFERENCE_STATUS as string) === "زوج" ? "فرد" : "زوج";
      
      return currentStatus;
    } catch (e) {
      console.error(`Error in calculateWeekStatusForDate: ${e}`);
      return "نامشخص (خطا)";
    }
  }

  /**
   * Gets start of Persian week (Saturday) in UTC
   */
  private getStartOfWeekPersian(date: Date): Date {
    const targetDate = new Date(date.getTime());
    const dayOfWeekUTC = targetDate.getUTCDay(); // Sunday = 0, Saturday = 6
    const daysToSubtract = (dayOfWeekUTC + 1) % 7;
    targetDate.setUTCDate(targetDate.getUTCDate() - daysToSubtract);
    targetDate.setUTCHours(0, 0, 0, 0);
    return targetDate;
  }
}