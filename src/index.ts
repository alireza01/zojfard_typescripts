import { TelegramBot } from './bot';
import type { BotConfig, TelegramUpdate } from './types';

// Cloudflare Workers environment interface
interface Env {
  BOT_TOKEN: string;
  ADMIN_CHAT_ID: string;
  SUPABASE_URL: string;
  SUPABASE_KEY: string;
}

// ExecutionContext interface for Cloudflare Workers
interface ExecutionContext {
  waitUntil(promise: Promise<any>): void;
  passThroughOnException(): void;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      // Validate environment variables
      if (!env.BOT_TOKEN || !env.ADMIN_CHAT_ID || !env.SUPABASE_URL || !env.SUPABASE_KEY) {
        console.error('Missing required environment variables');
        return new Response('Missing required environment variables', { status: 500 });
      }

      const config: BotConfig = {
        BOT_TOKEN: env.BOT_TOKEN,
        ADMIN_CHAT_ID: env.ADMIN_CHAT_ID,
        SUPABASE_URL: env.SUPABASE_URL,
        SUPABASE_KEY: env.SUPABASE_KEY
      };

      const bot = new TelegramBot(config);
      const url = new URL(request.url);

      // Handle webhook setup/removal endpoints
      if (request.method === 'GET') {
        if (url.pathname === '/') {
          return new Response('Telegram Schedule Bot is running!', { status: 200 });
        }
        
        if (url.pathname === '/set-webhook') {
          const webhookUrl = url.searchParams.get('url');
          if (!webhookUrl) {
            return new Response('Missing webhook URL parameter', { status: 400 });
          }
          
          const success = await bot.setWebhook(webhookUrl);
          return new Response(
            success ? 'Webhook set successfully' : 'Failed to set webhook',
            { status: success ? 200 : 500 }
          );
        }
        
        if (url.pathname === '/remove-webhook') {
          const success = await bot.removeWebhook();
          return new Response(
            success ? 'Webhook removed successfully' : 'Failed to remove webhook',
            { status: success ? 200 : 500 }
          );
        }
        
        if (url.pathname === '/bot-info') {
          const botInfo = await bot.getBotInfo();
          return new Response(JSON.stringify(botInfo, null, 2), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }

      // Handle Telegram webhook updates
      if (request.method === 'POST' && url.pathname === '/webhook') {
        try {
          const update: TelegramUpdate = await request.json();
          
          // Process update asynchronously
          ctx.waitUntil(bot.processUpdate(update));
          
          return new Response('OK', { status: 200 });
        } catch (error) {
          console.error('Error parsing webhook update:', error);
          return new Response('Invalid JSON', { status: 400 });
        }
      }

      // Handle health check
      if (request.method === 'GET' && url.pathname === '/health') {
        return new Response(JSON.stringify({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          version: '1.0.0'
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response('Not Found', { status: 404 });

    } catch (error) {
      console.error('Unhandled error in fetch handler:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  }
};

// Export types for external use
export type { BotConfig, TelegramUpdate } from './types';