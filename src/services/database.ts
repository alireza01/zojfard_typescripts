import { createClient, SupabaseClient } from '@supabase/supabase-js';
/*
CREATE TABLE broadcasts (
    id SERIAL PRIMARY KEY,
    message_id INTEGER NOT NULL,
    chat_id BIGINT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE broadcast_messages (
    id SERIAL PRIMARY KEY,
    broadcast_id INTEGER REFERENCES broadcasts(id) ON DELETE CASCADE,
    user_id BIGINT,
    group_id BIGINT,
    message_id INTEGER NOT NULL,
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    status VARCHAR(20) DEFAULT 'sent'
);
*/
import type {
    DatabaseUser,
    DatabaseGroup,
    BotUsage,
    UserSchedule,
    ScheduleLesson,
    TelegramUser,
    TelegramChat,
    DaySchedule,
    BotStats,
    UserAbsence
} from '../types';
import { ENGLISH_WEEKDAYS } from '../config/constants';
import { parseTime } from '../utils/time';

export class DatabaseService {
    private supabase: SupabaseClient;

    constructor(supabaseUrl: string, supabaseKey: string) {
        this.supabase = createClient(supabaseUrl, supabaseKey, {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
                detectSessionInUrl: false,
            }
        });
    }

    /**
     * Logs bot usage
     */
    async logUsage(user: TelegramUser, chat: TelegramChat, command: string): Promise<void> {
        if (!user || !chat) {
            console.warn("[Log] Skipping usage log due to missing user or chat info.");
            return;
        }

        try {
            const payload: BotUsage = {
                user_id: user.id,
                first_name: user.first_name?.substring(0, 255),
                last_name: user.last_name?.substring(0, 255),
                username: user.username?.substring(0, 255),
                command: command?.substring(0, 255) || "unknown_action",
                chat_type: chat.type?.substring(0, 50),
                chat_id: chat.id,
                chat_title: (chat.title || "").substring(0, 255),
            };

            const { error } = await this.supabase.from("bot_usage").insert(payload);

            if (error) {
                console.error(`[Log] Supabase usage log error for user ${user.id}: ${error.message} - Payload: ${JSON.stringify(payload)}`);
            }
        } catch (e) {
            console.error(`[Log] Exception preparing usage log: ${e}`);
        }
    }

    /**
     * Adds or updates user
     */
    async addUser(user: TelegramUser, chat: TelegramChat): Promise<{ success: boolean; error?: string; warning?: string }> {
        if (!user || !user.id || !chat || !chat.id) {
            console.error(`[Data] Invalid user or chat object in addUser`);
            return { success: false, error: "Invalid user or chat data" };
        }

        try {
            const fullName = `${user.first_name || ""} ${user.last_name || ""}`.trim() || "کاربر تلگرام";

            const { error } = await this.supabase.from("users").upsert({
                user_id: user.id,
                chat_id: chat.id,
                full_name: fullName.substring(0, 255),
                username: user.username?.substring(0, 255),
                last_seen_at: new Date().toISOString(),
            }, { onConflict: "user_id" });

            if (error) {
                if (error.code === '23505' && error.details?.includes('chat_id')) {
                    console.warn(`[Data] Chat ID ${chat.id} already exists for a different user. Ignoring upsert for user ${user.id}.`);
                    return { success: true, warning: "Chat ID conflict ignored" };
                } else {
                    console.error(`[Data] Error upserting user ${user.id} / chat ${chat.id}: ${error.message}`);
                    return { success: false, error: error.message };
                }
            }

            console.log(`[Data] User ${user.id} (${fullName}) added/updated.`);
            return { success: true };
        } catch (e) {
            console.error(`[Data] Exception in addUser for ${user.id}: ${e}`);
            return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
        }
    }

    /**
     * Adds or updates group
     */
    async addGroup(chat: TelegramChat): Promise<void> {
        if (!chat || !chat.id || (chat.type !== "group" && chat.type !== "supergroup")) return;

        try {
            const { error } = await this.supabase.from("groups").upsert({
                group_id: chat.id,
                group_name: (chat.title || `گروه ${chat.id}`).substring(0, 255),
                last_seen_at: new Date().toISOString(),
            }, { onConflict: "group_id" });

            if (error) {
                console.error(`[Data] Error upserting group ${chat.id}: ${error.message}`);
            } else {
                console.log(`[Data] Group ${chat.title || chat.id} added/updated.`);
            }
        } catch (e) {
            console.error(`[Data] Exception in addGroup for ${chat.id}: ${e}`);
        }
    }

    /**
     * Gets user schedule
     */
    async getUserSchedule(userId: number): Promise<UserSchedule> {
        try {
            const { data, error } = await this.supabase
                .from("user_schedules")
                .select("odd_week_schedule, even_week_schedule")
                .eq("user_id", userId)
                .maybeSingle();

            if (error) throw error;

            const oddSchedule = (data?.odd_week_schedule && typeof data.odd_week_schedule === 'object' && !Array.isArray(data.odd_week_schedule))
                ? data.odd_week_schedule as DaySchedule : {};
            const evenSchedule = (data?.even_week_schedule && typeof data.even_week_schedule === 'object' && !Array.isArray(data.even_week_schedule))
                ? data.even_week_schedule as DaySchedule : {};

            const cleanSchedule = (schedule: DaySchedule): DaySchedule => {
                const cleaned: DaySchedule = {};
                for (const day of ENGLISH_WEEKDAYS) {
                    if (Array.isArray(schedule[day])) {
                        cleaned[day] = schedule[day].filter((lesson: any) =>
                            lesson && typeof lesson.lesson === 'string' &&
                            typeof lesson.start_time === 'string' && /^(?:[01]\d|2[0-3]|[89]):[0-5]\d$/.test(lesson.start_time) &&
                            typeof lesson.end_time === 'string' && /^(?:[01]\d|2[0-3]|[89]):[0-5]\d$/.test(lesson.end_time) &&
                            typeof lesson.location === 'string'
                        ).sort((a: ScheduleLesson, b: ScheduleLesson) => (parseTime(a.start_time) ?? 9999) - (parseTime(b.start_time) ?? 9999));
                    } else {
                        cleaned[day] = []; // Ensure day exists as an empty array if no lessons
                    }
                }
                return cleaned;
            };

            return {
                odd_week_schedule: cleanSchedule(oddSchedule),
                even_week_schedule: cleanSchedule(evenSchedule)
            };
        } catch (e) {
            console.error(`[Schedule] Error fetching schedule for user ${userId}: ${e}`);
            return { odd_week_schedule: {}, even_week_schedule: {} };
        }
    }

    /**
     * Saves user schedule lesson
     */
    async saveUserSchedule(userId: number, weekType: 'odd' | 'even', day: string, lesson: ScheduleLesson): Promise<void> {
        try {
            const currentSchedules = await this.getUserSchedule(userId);
            const scheduleField = weekType === "odd" ? "odd_week_schedule" : "even_week_schedule";
            const daySchedule = currentSchedules[scheduleField]?.[day] || [];

            const updatedDaySchedule = [...daySchedule, lesson];
            updatedDaySchedule.sort((a, b) => (parseTime(a.start_time) ?? 9999) - (parseTime(b.start_time) ?? 9999));

            const finalWeekSchedule = {
                ...(currentSchedules[scheduleField] || {}),
                [day]: updatedDaySchedule
            };

            const updatePayload = {
                user_id: userId,
                [scheduleField]: finalWeekSchedule,
                [weekType === "odd" ? "even_week_schedule" : "odd_week_schedule"]: currentSchedules[weekType === "odd" ? "even_week_schedule" : "odd_week_schedule"],
                updated_at: new Date().toISOString(),
            };

            const { error } = await this.supabase
                .from("user_schedules")
                .upsert(updatePayload, { onConflict: "user_id" });

            if (error) throw error;

            console.log(`[Schedule] Saved lesson for user ${userId}, week ${weekType}, day ${day}`);
        } catch (e) {
            console.error(`[Schedule] Error saving schedule for user ${userId}: ${e}`);
            throw e;
        }
    }

    /**
     * Deletes a lesson from user schedule
     */
    async deleteUserScheduleLesson(userId: number, weekType: 'odd' | 'even', day: string, lessonIndex: number): Promise<boolean> {
        try {
            const currentSchedules = await this.getUserSchedule(userId);
            const scheduleField = weekType === "odd" ? "odd_week_schedule" : "even_week_schedule";

            if (!currentSchedules[scheduleField]?.[day] || !currentSchedules[scheduleField][day][lessonIndex]) {
                console.warn(`[Schedule] Lesson index ${lessonIndex} not found for deletion: user ${userId}, week ${weekType}, day ${day}`);
                return false;
            }

            const updatedDaySchedule = [...currentSchedules[scheduleField][day]];
            const deletedLesson = updatedDaySchedule.splice(lessonIndex, 1)[0];

            const finalWeekSchedule = {
                ...currentSchedules[scheduleField],
                [day]: updatedDaySchedule
            };

            if (updatedDaySchedule.length === 0) {
                delete finalWeekSchedule[day];
            }

            const { error } = await this.supabase
                .from("user_schedules")
                .update({
                    [scheduleField]: finalWeekSchedule,
                    updated_at: new Date().toISOString(),
                })
                .eq("user_id", userId);

            if (error) throw error;

            console.log(`[Schedule] Lesson '${deletedLesson.lesson}' deleted for user ${userId}, week ${weekType}, day ${day}`);
            return true;
        } catch (e) {
            console.error(`[Schedule] Error deleting lesson for user ${userId}: ${e}`);
            throw e;
        }
    }

    /**
     * Gets all absences for a user
     */
    async getAbsences(userId: number): Promise<UserAbsence[]> {
        try {
            const { data, error } = await this.supabase
                .from("user_absences")
                .select("*")
                .eq("user_id", userId);

            if (error) throw error;
            return data || [];
        } catch (e) {
            console.error(`[Absence] Error fetching absences for user ${userId}: ${e}`);
            return [];
        }
    }

    /**
     * Upserts a user's absence count for a specific lesson and returns the new count.
     * This relies on a PostgreSQL function `upsert_absence` to be created in the database.
     */
    async upsertAbsence(userId: number, lessonName: string, change: number): Promise<number> {
        try {
            const { data, error } = await this.supabase.rpc('upsert_absence', {
                p_user_id: userId,
                p_lesson_name: lessonName,
                p_change: change,
            });

            if (error) {
                console.error(`[Absence] RPC error for upsert_absence for user ${userId}, lesson ${lessonName}:`, error);
                throw error;
            }

            console.log(`[Absence] Upserted absence for user ${userId}, lesson '${lessonName}', change ${change}. New count: ${data}`);
            return data as number;
        } catch (e) {
            console.error(`[Absence] Exception in upsertAbsence for user ${userId}, lesson ${lessonName}: ${e}`);
            throw e;
        }
    }

    /**
     * Deletes the absence record for a specific lesson for a user.
     */
    async deleteAbsence(userId: number, lessonName: string): Promise<boolean> {
        try {
            const { error } = await this.supabase
                .from("user_absences")
                .delete()
                .eq("user_id", userId)
                .eq("lesson_name", lessonName);

            if (error) throw error;

            console.log(`[Absence] Deleted absence record for user ${userId}, lesson '${lessonName}'`);
            return true;
        } catch (e) {
            console.error(`[Absence] Error deleting absence for user ${userId}, lesson ${lessonName}: ${e}`);
            return false;
        }
    }

    /**
     * Gets all users for broadcasting
     */
    async getAllUsers(): Promise<DatabaseUser[]> {
        try {
            const { data, error } = await this.supabase
                .from("users")
                .select("user_id, chat_id, full_name, username")
                .eq("is_active", true);

            if (error) throw error;
            return data || [];
        } catch (e) {
            console.error(`[Data] Error fetching all users: ${e}`);
            return [];
        }
    }

    /**
     * Gets all groups for broadcasting
     */
    async getAllGroups(): Promise<DatabaseGroup[]> {
        try {
            const { data, error } = await this.supabase
                .from("groups")
                .select("group_id, group_name")
                .eq("is_active", true);

            if (error) throw error;
            return data || [];
        } catch (e) {
            console.error(`[Data] Error fetching all groups: ${e}`);
            return [];
        }
    }

    /**
     * Gets user count for stats
     */
    async getUserCount(): Promise<number> {
        try {
            const { count, error } = await this.supabase
                .from("users")
                .select('user_id', { count: 'exact', head: true });

            if (error) throw error;
            return count ?? 0;
        } catch (e) {
            console.error(`[Data] Error fetching user count: ${e}`);
            return 0;
        }
    }

    /**
     * Gets group count for stats
     */
    async getGroupCount(): Promise<number> {
        try {
            const { count, error } = await this.supabase
                .from("groups")
                .select('group_id', { count: 'exact', head: true });

            if (error) throw error;
            return count ?? 0;
        } catch (e) {
            console.error(`[Data] Error fetching group count: ${e}`);
            return 0;
        }
    }

    /**
     * Gets usage count for stats
     */
    async getUsageCount(): Promise<number> {
        try {
            const { count, error } = await this.supabase
                .from("bot_usage")
                .select('*', { count: 'exact', head: true });

            if (error) throw error;
            return count ?? 0;
        } catch (e) {
            console.error(`[Data] Error fetching usage count: ${e}`);
            return 0;
        }
    }

    /**
     * Gets schedule count for stats
     */
    async getScheduleCount(): Promise<number> {
        try {
            const { count, error } = await this.supabase
                .from("user_schedules")
                .select('user_id', { count: 'exact', head: true });

            if (error) throw error;
            return count ?? 0;
        } catch (e) {
            console.error(`[Data] Error fetching schedule count: ${e}`);
            return 0;
        }
    }

    /**
     * Deletes a day from user schedule
     */
    async deleteUserScheduleDay(userId: number, weekType: 'odd' | 'even', day: string): Promise<boolean> {
        try {
            const currentSchedules = await this.getUserSchedule(userId);
            const scheduleField = weekType === "odd" ? "odd_week_schedule" : "even_week_schedule";

            if (!currentSchedules[scheduleField]?.[day]) {
                console.log(`[Schedule] No lessons found to delete for user ${userId}, week ${weekType}, day ${day}`);
                return false;
            }

            const finalWeekSchedule = { ...currentSchedules[scheduleField] };
            delete finalWeekSchedule[day];

            const { error } = await this.supabase
                .from("user_schedules")
                .update({
                    [scheduleField]: finalWeekSchedule,
                    updated_at: new Date().toISOString(),
                })
                .eq("user_id", userId);

            if (error) throw error;

            console.log(`[Schedule] All lessons deleted for user ${userId}, week ${weekType}, day ${day}`);
            return true;
        } catch (e) {
            console.error(`[Schedule] Error deleting schedule day for user ${userId}: ${e}`);
            throw e;
        }
    }

    /**
     * Deletes entire week schedule
     */
    async deleteEntireWeekSchedule(userId: number, weekType: 'odd' | 'even'): Promise<boolean> {
        try {
            const scheduleField = weekType === "odd" ? "odd_week_schedule" : "even_week_schedule";

            const { error } = await this.supabase
                .from("user_schedules")
                .update({
                    [scheduleField]: {},
                    updated_at: new Date().toISOString(),
                })
                .eq("user_id", userId);

            if (error) throw error;

            console.log(`[Schedule] Entire ${weekType} week schedule deleted for user ${userId}`);
            return true;
        } catch (e) {
            console.error(`[Schedule] Error deleting entire ${weekType} schedule for user ${userId}: ${e}`);
            throw e;
        }
    }

    /**
     * Gets bot statistics - Exact match with original JS
     */
    async getBotStats(): Promise<BotStats> {
        try {
            const [usersResult, groupsResult, usageResult, scheduleResult] = await Promise.all([
                this.supabase.from("users").select("user_id", { count: 'exact' }),
                this.supabase.from("groups").select("group_id", { count: 'exact' }),
                this.supabase.from("bot_usage").select("usage_id, command"),
                this.supabase.from("user_schedules").select("user_id", { count: 'exact' })
            ]);

            const userCount = usersResult.count || 0;
            const groupCount = groupsResult.count || 0;
            const usageCount = usageResult.data?.length || 0;
            const scheduleCount = scheduleResult.count || 0;
            const broadcastCount = 0; // Placeholder - would need broadcasts table

            // Calculate top commands
            const commandCounts: { [key: string]: number } = {};
            if (usageResult.data) {
                usageResult.data.forEach((usage: any) => {
                    const command = usage.command || 'unknown';
                    commandCounts[command] = (commandCounts[command] || 0) + 1;
                });
            }

            const topCommands = Object.entries(commandCounts)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 7) as [string, number][];

            return {
                userCount,
                groupCount,
                usageCount,
                scheduleCount,
                broadcastCount,
                topCommands
            };
        } catch (e) {
            console.error(`[Data] Error fetching bot stats: ${e}`);
            return {
                userCount: 0,
                groupCount: 0,
                usageCount: 0,
                scheduleCount: 0,
                broadcastCount: 0,
                topCommands: []
            };
        }
    }

    /**
     * Creates a new broadcast record and returns its ID.
     */
    async createBroadcast(messageId: number, chatId: number): Promise<number> {
        try {
            const { data, error } = await this.supabase
                .from('broadcasts')
                .insert({
                    message_id: messageId,
                    chat_id: chatId,
                })
                .select('id')
                .single();

            if (error) throw error;
            return data.id;
        } catch (e) {
            console.error(`[Data] Error creating broadcast: ${e}`);
            throw e;
        }
    }

    /**
     * Logs a message sent as part of a broadcast.
     */
    async logBroadcastMessage(broadcastId: number, userId: number | null, groupId: number | null, messageId: number, status: string): Promise<void> {
        try {
            const { error } = await this.supabase
                .from('broadcast_messages')
                .insert({
                    broadcast_id: broadcastId,
                    user_id: userId,
                    group_id: groupId,
                    message_id: messageId,
                    status: status,
                });

            if (error) throw error;
        } catch (e) {
            console.error(`[Data] Error logging broadcast message: ${e}`);
        }
    }

    /**
     * Gets the last broadcast.
     */
    async getLastBroadcast(): Promise<{ id: number; message_id: number; chat_id: number; } | null> {
        try {
            const { data, error } = await this.supabase
                .from('broadcasts')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (error) throw error;
            return data;
        } catch (e) {
            console.error(`[Data] Error getting last broadcast: ${e}`);
            return null;
        }
    }

    /**
     * Gets a list of recent broadcasts.
     */
    async getBroadcasts(limit = 5): Promise<{ id: number; message_id: number; created_at: string; }[]> {
        try {
            const { data, error } = await this.supabase
                .from('broadcasts')
                .select('id, message_id, created_at')
                .order('created_at', { ascending: false })
                .limit(limit);

            if (error) throw error;
            return data || [];
        } catch (e) {
            console.error(`[Data] Error getting broadcasts: ${e}`);
            return [];
        }
    }

    /**
     * Gets all messages for a given broadcast.
     */
    async getBroadcastMessages(broadcastId: number): Promise<{ id: number; user_id: number | null; group_id: number | null; message_id: number; }[]> {
        try {
            const { data, error } = await this.supabase
                .from('broadcast_messages')
                .select('id, user_id, group_id, message_id')
                .eq('broadcast_id', broadcastId);

            if (error) throw error;
            return data || [];
        } catch (e) {
            console.error(`[Data] Error getting broadcast messages: ${e}`);
            return [];
        }
    }

    /**
     * Deletes a broadcast and all its associated messages.
     */
    async deleteBroadcast(broadcastId: number): Promise<boolean> {
        try {
            const { error } = await this.supabase
                .from('broadcasts')
                .delete()
                .eq('id', broadcastId);

            if (error) throw error;
            return true;
        } catch (e) {
            console.error(`[Data] Error deleting broadcast: ${e}`);
            return false;
        }
    }

    /**
     * Gets all active API keys for a given service.
     */
    async getApiKeys(service = 'gemini'): Promise<string[]> {
        try {
            const { data, error } = await this.supabase
                .from('api_keys')
                .select('api_key')
                .eq('service', service)
                .eq('is_active', true);

            if (error) throw error;

            return data ? data.map(item => item.api_key) : [];
        } catch (e) {
            console.error(`[Data] Error fetching API keys for service ${service}: ${e}`);
            return [];
        }
    }

    /**
     * Saves the full schedule for a user, overwriting existing data.
     */
    async saveFullSchedule(userId: number, schedule: UserSchedule): Promise<void> {
        try {
            const updatePayload = {
                user_id: userId,
                odd_week_schedule: schedule.odd_week_schedule,
                even_week_schedule: schedule.even_week_schedule,
                updated_at: new Date().toISOString(),
            };

            const { error } = await this.supabase
                .from("user_schedules")
                .upsert(updatePayload, { onConflict: "user_id" });

            if (error) throw error;

            console.log(`[Schedule] Full schedule saved for user ${userId}`);
        } catch (e) {
            console.error(`[Schedule] Error saving full schedule for user ${userId}: ${e}`);
            throw e;
        }
    }
}