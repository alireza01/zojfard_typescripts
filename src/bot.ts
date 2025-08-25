import type { TelegramUpdate, BotConfig } from './types';
import { TelegramService } from './services/telegram';
import { DatabaseService } from './services/database';
import { PDFService } from './services/pdf';
import { StateService } from './services/state';
import { AIService } from './services/ai'; // Import AI Service
import { CommandHandler } from './handlers/commands';
import { CallbackHandler } from './handlers/callbacks';
import { MessageHandler } from './handlers/messages';
import { BOT_MESSAGES } from './config/constants';

export class TelegramBot {
  private telegram: TelegramService;
  private database: DatabaseService;
  private pdf: PDFService;
  private state: StateService;
  private ai: AIService; // Add AI Service instance
  private commandHandler: CommandHandler;
  private callbackHandler: CallbackHandler;
  private messageHandler: MessageHandler;

  constructor(private config: BotConfig) {
    this.telegram = new TelegramService(config.BOT_TOKEN);
    this.database = new DatabaseService(config.SUPABASE_URL, config.SUPABASE_KEY);
    this.pdf = new PDFService();
    this.state = new StateService();
    this.ai = new AIService(this.database); // Initialize AI Service
    
    this.commandHandler = new CommandHandler(
      this.telegram, 
      this.database, 
      this.pdf, 
      this.state,
      config.ADMIN_CHAT_ID
    );
    
    this.callbackHandler = new CallbackHandler(
      this.telegram, 
      this.database, 
      this.pdf, 
      this.state,
      this.ai, // Pass AI service
      config.ADMIN_CHAT_ID
    );
    
    this.messageHandler = new MessageHandler(
      this.telegram,
      this.database,
      this.state,
      this.ai, // Pass AI service
      config.ADMIN_CHAT_ID
    );
    this.messageHandler.setCallbackHandler(this.callbackHandler);
  }

  /**
   * Processes incoming Telegram update
   */
  async processUpdate(update: TelegramUpdate): Promise<void> {
    try {
      console.log(`[Bot] Processing update ${update.update_id}`);

      // Handle callback queries
      if (update.callback_query) {
        await this.callbackHandler.handleCallback(update.callback_query);
        return;
      }

      // Handle messages
      if (update.message) {
        const message = update.message;
        const text = message.text;

        // Handle commands
        if (text?.startsWith('/')) {
          const command = text.split(' ')[0].toLowerCase();
          
          switch (command) {
            case '/start':
              await this.commandHandler.handleStart(message);
              break;
            case '/help':
              await this.commandHandler.handleHelp(message);
              break;
            case '/today':
              await this.commandHandler.handleToday(message);
              break;
            case '/week':
              await this.commandHandler.handleWeek(message);
              break;
            case '/schedule':
              await this.commandHandler.handleSchedule(message);
              break;
            case '/absences':
              await this.commandHandler.handleAbsences(message);
              break;
            case '/status':
              await this.commandHandler.handleStatus(message);
              break;
            case '/pdf':
              await this.commandHandler.handlePDF(message);
              break;
            case '/admin':
              await this.commandHandler.handleAdmin(message);
              break;
            case '/stats':
              await this.commandHandler.handleStats(message);
              break;
            case '/teleport':
              await this.commandHandler.handleTeleport(message);
              break;
            case '/broadcast':
              await this.commandHandler.handleBroadcast(message);
              break;
            default:
              if (message.chat.type === "private") {
                const commandPart = command.substring(1); // Remove the /
                await this.telegram.sendMessage(
                  message.chat.id,
                  BOT_MESSAGES.UNKNOWN_COMMAND(commandPart),
                  undefined,
                  message.message_id
                );
              }
              break;
          }
        } else {
          // Handle regular text messages
          await this.messageHandler.handleMessage(message);
        }
      }

    } catch (error) {
      console.error(`[Bot] Error processing update ${update.update_id}:`, error);
      
      // Try to notify admin about the error
      try {
        await this.telegram.sendMessage(
          this.config.ADMIN_CHAT_ID,
          `🆘 خطا در پردازش update ${update.update_id}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      } catch (notifyError) {
        console.error('[Bot] Failed to notify admin about error:', notifyError);
      }
    }
  }

  /**
   * Gets bot information
   */
  async getBotInfo() {
    return await this.telegram.getBotInfo();
  }

  /**
   * Sets webhook (for production)
   */
  async setWebhook(webhookUrl: string): Promise<boolean> {
    try {
      const response = await fetch(`https://api.telegram.org/bot${this.config.BOT_TOKEN}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: webhookUrl })
      });

      const result = await response.json() as { ok: boolean };
      console.log('[Bot] Webhook set result:', result);
      return result.ok;
    } catch (error) {
      console.error('[Bot] Error setting webhook:', error);
      return false;
    }
  }

  /**
   * Removes webhook (for development)
   */
  async removeWebhook(): Promise<boolean> {
    try {
      const response = await fetch(`https://api.telegram.org/bot${this.config.BOT_TOKEN}/deleteWebhook`, {
        method: 'POST'
      });

      const result = await response.json() as { ok: boolean };
      console.log('[Bot] Webhook removed result:', result);
      return result.ok;
    } catch (error) {
      console.error('[Bot] Error removing webhook:', error);
      return false;
    }
  }
}