// Core Types
export interface BotConfig {
  BOT_TOKEN: string;
  ADMIN_CHAT_ID: string;
  SUPABASE_URL: string;
  SUPABASE_KEY: string;
}

export interface BotInfo {
  id: string;
  username: string;
  first_name: string;
}

// Telegram Types
export interface TelegramUser {
  id: number;
  is_bot?: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  date: number;
  chat: TelegramChat;
  text?: string;
  reply_to_message?: TelegramMessage;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

// Schedule Types
export interface ScheduleLesson {
  lesson: string;
  start_time: string;
  end_time: string;
  location: string;
}

export interface DaySchedule {
  [day: string]: ScheduleLesson[];
}

export interface UserSchedule {
  odd_week_schedule: DaySchedule;
  even_week_schedule: DaySchedule;
}

// Persian Date Types
export interface PersianDate {
  year: number;
  month: number;
  day: number;
}

// Database Types
export interface DatabaseUser {
  user_id: number;
  chat_id?: number;
  full_name?: string;
  username?: string;
  created_at?: string;
  last_seen_at?: string;
  is_active?: boolean;
  updated_at?: string;
}

export interface DatabaseGroup {
  group_id: number;
  group_name: string;
  created_at?: string;
  last_seen_at?: string;
  is_active?: boolean;
  updated_at?: string;
}

export interface BotUsage {
  usage_id?: number;
  user_id?: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  command?: string;
  chat_type?: string;
  chat_id?: number;
  chat_title?: string;
  timestamp?: string;
}

// Keyboard Types
export interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

// API Response Types
export interface TelegramApiResponse<T = any> {
  ok: boolean;
  result?: T;
  error_code?: number;
  description?: string;
}

// State Management Types
export interface UserState {
  name: string;
  data?: any;
  expireAt?: number;
}

// Broadcast Types
export interface BroadcastRecord {
  id: number;
  admin_message_id: number;
  admin_chat_id: number;
  method: string;
  target_description: string;
  status: string;
  success_count: number;
  fail_count: number;
  created_at: string;
  updated_at: string;
}

// Statistics Types
export interface BotStats {
  userCount: number;
  groupCount: number;
  usageCount: number;
  scheduleCount: number;
  broadcastCount: number;
  topCommands: [string, number][];
}