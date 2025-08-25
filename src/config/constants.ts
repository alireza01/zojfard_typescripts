// Persian Constants
export const PERSIAN_WEEKDAYS = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه"];
export const PERSIAN_WEEKDAYS_FULL = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنج‌شنبه", "جمعه"];
export const ENGLISH_WEEKDAYS = ["saturday", "sunday", "monday", "tuesday", "wednesday"];

export const PERSIAN_MONTHS = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"
];

// Time Constants
export const TEHRAN_TIMEZONE = "Asia/Tehran";
export const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const LUNCH_START_MINUTES = 12 * 60; // 12:00
export const LUNCH_END_MINUTES = 13 * 60;   // 13:00

// Reference Point for Week Calculation
export const REFERENCE_PERSIAN_YEAR = 1403;
export const REFERENCE_PERSIAN_MONTH = 11; // بهمن
export const REFERENCE_PERSIAN_DAY = 20;
export const REFERENCE_STATUS = "فرد"; // "فرد" (odd) or "زوج" (even)

// Regex Patterns
export const SCHEDULE_TIME_REGEX = /^(?:[01]\d|2[0-3]|[89]):[0-5]\d$/;

// Text Direction
export const LRM = "\u200E"; // Left-to-Right Mark for PDF text

// Font URL
export const VAZIR_FONT_URL = "https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/fonts/ttf/Vazirmatn-Regular.ttf";

// Bot Messages - Exact match with original JS
export const BOT_MESSAGES = {
  WELCOME_PRIVATE: (firstName: string) => `سلام ${firstName}! 👋

به ربات مدیریت برنامه هفتگی و وضعیت دانشگاه خوش آمدید. 🎓

*امکانات اصلی:*
🔄 *وضعیت هفته:* نمایش زوج/فرد بودن هفته و برنامه امروز شما.
📅 *برنامه شما:* مشاهده و مدیریت کامل برنامه هفتگی.
⚙️ *تنظیم برنامه:* افزودن، ویرایش و حذف کلاس‌ها.
📤 *خروجی PDF:* دریافت فایل PDF زیبا از برنامه.

👇 از دکمه‌های زیر استفاده کنید:`,

  WELCOME_GROUP: (botUsername: string) => `سلام! 👋 من ربات وضعیت هفته هستم.
برای دیدن وضعیت از /week استفاده کنید.
برای تنظیم برنامه شخصی، لطفاً در چت خصوصی با من (@${botUsername}) صحبت کنید.`,

  HELP: (isAdmin: boolean, isPrivate: boolean) => {
    let helpMessage = `🔰 *راهنمای ربات برنامه هفتگی* 🔰

*دستورات و دکمه‌ها:*
🔄 */week* یا دکمه *وضعیت هفته*: نمایش زوج/فرد بودن هفته فعلی/بعدی + برنامه امروز شما (در خصوصی).
📅 */schedule* یا دکمه *تنظیم برنامه*: ورود به منوی مدیریت برنامه (تنظیم، مشاهده، حذف).
📄 دکمه *دریافت PDF*: ساخت و ارسال فایل PDF برنامه شما.
🔮 */teleport* یا دکمه *تلپورت*: بررسی وضعیت هفته در تاریخ آینده. می‌توانید تاریخ را مستقیماً بعد از دستور بنویسید (مثال: \`/teleport 1403/08/25\`) یا از دکمه استفاده کرده و تاریخ را در مرحله بعد وارد کنید.
ℹ️ */help* یا دکمه *راهنما*: نمایش همین پیام.

`;

    if (isAdmin && isPrivate) {
      helpMessage += `*دستورات ادمین (فقط خصوصی):*
👑 */admin* یا دکمه *پنل مدیریت*: نمایش پنل.
📊 */stats* یا دکمه *آمار*: نمایش آمار ربات.

`;
    }

    helpMessage += `*نکات:*
• ربات را می‌توانید به گروه‌های درسی اضافه کنید.
• تمام امکانات مدیریت برنامه و PDF فقط در چت خصوصی در دسترس هستند.
• تاریخ‌ها را به فرمت شمسی \`سال/ماه/روز\` وارد کنید.
• محاسبه هفته بر اساس تاریخ مرجع ${REFERENCE_PERSIAN_DAY} ${getPersianMonthName(REFERENCE_PERSIAN_MONTH)} ${REFERENCE_PERSIAN_YEAR} (هفته *${REFERENCE_STATUS}*) است.

ساخته شده با ❤️ توسط @alirezamozii`;

    return helpMessage;
  },

  SCHEDULE_MANAGEMENT: `📅 *مدیریت برنامه هفتگی*

از دکمه‌های زیر برای تنظیم، مشاهده، حذف یا گرفتن خروجی PDF برنامه خود استفاده کنید:`,

  SCHEDULE_SETUP: `📅 *تنظیم برنامه هفتگی*

برنامه کدام هفته را می‌خواهید تنظیم یا ویرایش کنید؟`,

  SCHEDULE_SELECT_DAY: (weekLabel: string) => `📅 *تنظیم برنامه هفته ${weekLabel}*

لطفاً روز مورد نظر را انتخاب کنید:`,

  SCHEDULE_DAY_VIEW: (dayLabel: string, weekLabel: string) => `🗓️ *برنامه روز ${dayLabel} - هفته ${weekLabel}*

`,

  SCHEDULE_ADD_LESSON: (dayLabel: string, weekLabel: string) => `➕ *افزودن درس به ${dayLabel} (هفته ${weekLabel})*

لطفاً اطلاعات درس را در یک پیام و با فرمت زیر ارسال کنید:
\`نام کامل درس\` - \`ساعت شروع\` - \`ساعت پایان\` - \`محل برگزاری\`

*مثال:*
\`برنامه سازی پیشرفته\` - \`8:00\` - \`10:00\` - \`کلاس 309 ابریشم چیان\`

*نکات:*
• از خط تیره (-) برای جدا کردن بخش‌ها استفاده کنید.
• ساعت‌ها را به فرمت \`HH:MM\` (مانند \`13:30\` یا \`08:00\`) وارد کنید.`,

  DELETE_SCHEDULE_MAIN: `🗑️ *حذف برنامه*

کدام بخش از برنامه را می‌خواهید حذف کنید؟
*توجه:* این عملیات غیرقابل بازگشت است.`,

  NO_SCHEDULE: "_هنوز هیچ درسی برای هیچ هفته‌ای تنظیم نکرده‌اید._",
  
  NO_SCHEDULE_TODAY: (dayName: string, weekStatus: string) => `🗓️ شما برای امروز (${dayName}) در هفته *${weekStatus}* برنامه‌ای تنظیم نکرده‌اید.`,

  WEEKEND_MESSAGE: (dayName: string) => `🥳 امروز ${dayName} است! آخر هفته خوبی داشته باشید.`,
  
  INVALID_TIME: "⚠️ فرمت زمان باید به صورت `HH:MM` باشد. مثال: `08:30` یا `13:45`",
  
  INVALID_TIME_ORDER: "⚠️ ساعت شروع باید قبل از ساعت پایان و معتبر باشد.",

  INVALID_FORMAT: `⚠️ فرمت وارد شده صحیح نیست. لطفاً با فرمت زیر وارد کنید:
\`نام درس\` - \`ساعت شروع\` - \`ساعت پایان\` - \`محل برگزاری\``,
  
  CLASS_ADDED: "✅ درس با موفقیت اضافه شد.",
  
  CLASS_DELETED: "✅ درس با موفقیت حذف شد.",
  
  ERROR_OCCURRED: "⚠️ متاسفانه مشکلی پیش آمد.",
  
  ADMIN_ONLY: "⛔️ این دستور مخصوص ادمین و فقط در چت خصوصی قابل استفاده است.",
  
  PDF_GENERATING: "⏳ در حال آماده‌سازی PDF برنامه شما...",
  
  PDF_GENERATED: (fullName: string) => `📅 برنامه هفتگی شما - ${fullName}`,

  PRIVATE_ONLY: (botUsername: string) => `⚠️ مدیریت برنامه هفتگی فقط در چت خصوصی با من (@${botUsername}) امکان‌پذیر است.`,

  ADMIN_PANEL: (weekStatus: string) => `👑 *پنل مدیریت ربات*

وضعیت هفته فعلی: *${weekStatus}*`,

  STATS_LOADING: "📊 در حال دریافت آمار...",

  TELEPORT_PROMPT: "🔮 لطفاً تاریخ شمسی مورد نظر را به فرمت `سال/ماه/روز` ارسال کنید (مثال: `1403/08/25`).",

  TELEPORT_INVALID: `⚠️ تاریخ وارد شده نامعتبر است.
فرمت: \`سال/ماه/روز\` (مثال: \`/teleport 1404/02/10\`)`,

  TELEPORT_PAST: "🕰 این تاریخ در گذشته است. لطفاً تاریخی در آینده وارد کنید.",

  UNKNOWN_COMMAND: (command: string) => `❓ دستور \`${command}\` را متوجه نشدم. لطفاً از /help استفاده کنید.`,

  SCHEDULE_ERROR: "⚠️ خطا در پردازش برنامه.",

  STARTUP_ERROR: "⚠️ متاسفانه مشکلی در اجرای دستور /start پیش آمد.",

  HELP_ERROR: "⚠️ خطا در نمایش راهنما.",

  WEEK_ERROR: "⚠️ خطا در پردازش دستور /week.",

  STATS_FETCHING: "📊 در حال دریافت آمار...",

  ABSENCE_WARNING: (lessonName: string) => `⚠️ *هشدار غیبت*\n\nدانشجوی گرامی، تعداد غیبت‌های شما در درس *${lessonName}* به *2* جلسه رسیده است.`,

  ABSENCE_DANGER: (lessonName: string) => `🚨 *خطر حذف درس*\n\nدانشجوی گرامی، تعداد غیبت‌های شما در درس *${lessonName}* به *3* جلسه رسیده است. لطفاً در اسرع وقت با استاد خود صحبت کنید.`
};

// Helper function for getting Persian month name (needed for HELP message)
function getPersianMonthName(monthNumber: number): string {
  const month = parseInt(String(monthNumber));
  return (month >= 1 && month <= 12) ? PERSIAN_MONTHS[month - 1] : "نامعتبر";
}