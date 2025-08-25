import type { 
  TelegramApiResponse, 
  TelegramMessage, 
  InlineKeyboardMarkup,
  BotInfo 
} from '../types';

export class TelegramService {
  private readonly baseUrl: string;

  constructor(private readonly botToken: string) {
    this.baseUrl = `https://api.telegram.org/bot${botToken}`;
  }

  /**
   * Makes API call to Telegram
   */
  private async apiCall<T = any>(method: string, payload: Record<string, any> = {}): Promise<TelegramApiResponse<T>> {
    const url = `${this.baseUrl}/${method}`;
    
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      
      const responseData = await response.json() as TelegramApiResponse<T>;
      
      if (!responseData.ok) {
        console.error(`[TelegramAPI:${method}] Error: ${responseData.error_code} - ${responseData.description}. Payload: ${JSON.stringify(payload)}`);
      }
      
      return responseData;
    } catch (error) {
      console.error(`[TelegramAPI:${method}] Network/Fetch Error: ${error}`);
      return { 
        ok: false, 
        description: `Network/Fetch Error: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }

  /**
   * Sends a text message
   */
  async sendMessage(
    chatId: string | number, 
    text: string, 
    replyMarkup?: InlineKeyboardMarkup, 
    replyToMessageId?: number
  ): Promise<TelegramApiResponse<TelegramMessage>> {
    const payload: Record<string, any> = {
      chat_id: String(chatId),
      text: text,
      parse_mode: "Markdown",
    };
    
    if (replyMarkup) payload.reply_markup = replyMarkup;
    if (replyToMessageId) payload.reply_to_message_id = replyToMessageId;
    
    return await this.apiCall<TelegramMessage>("sendMessage", payload);
  }

  /**
   * Edits message text
   */
  async editMessageText(
    chatId: string | number, 
    messageId: number, 
    text: string, 
    replyMarkup?: InlineKeyboardMarkup
  ): Promise<TelegramApiResponse<TelegramMessage>> {
    const payload: Record<string, any> = {
      chat_id: String(chatId),
      message_id: messageId,
      text: text,
      parse_mode: "Markdown",
    };
    
    if (replyMarkup) payload.reply_markup = replyMarkup;
    
    const response = await this.apiCall<TelegramMessage>("editMessageText", payload);
    
    if (!response.ok && !response.description?.includes("message is not modified")) {
      // Error already logged in apiCall
    }
    
    return response;
  }

  /**
   * Answers callback query
   */
  async answerCallbackQuery(queryId: string, text = "", showAlert = false): Promise<TelegramApiResponse> {
    const payload = {
      callback_query_id: queryId,
      text: text ? text.substring(0, 200) : undefined,
      show_alert: showAlert,
    };
    
    const response = await this.apiCall("answerCallbackQuery", payload);
    
    if (!response.ok && 
        !response.description?.includes("query is too old") && 
        !response.description?.includes("QUERY_ID_INVALID")) {
      // Error logged in apiCall
    }
    
    return response;
  }

  /**
   * Sends a document (PDF)
   */
  async sendDocument(
    chatId: string | number, 
    document: ArrayBuffer | string,
    filename: string, 
    caption?: string, 
    replyMarkup?: InlineKeyboardMarkup
  ): Promise<TelegramApiResponse> {
    if (typeof document === 'string') {
        const payload: Record<string, any> = {
            chat_id: String(chatId),
            document: document,
        };
        if (caption) payload.caption = caption;
        if (replyMarkup) payload.reply_markup = replyMarkup;
        return await this.apiCall("sendDocument", payload);
    }

    const form = new FormData();
    form.append("chat_id", String(chatId));
    form.append("document", new Blob([document], { type: "application/pdf" }), filename);
    
    if (caption) form.append("caption", caption);
    if (replyMarkup) form.append("reply_markup", JSON.stringify(replyMarkup));
    
    try {
      const response = await fetch(`${this.baseUrl}/sendDocument`, {
        method: "POST",
        body: form,
      });
      
      const responseData = await response.json() as TelegramApiResponse;
      
      if (!responseData.ok) {
        console.error(`[sendDocument] Error to ${chatId}: ${responseData.description}`);
      }
      
      return responseData;
    } catch (e) {
      console.error(`[sendDocument] Network/Fetch error to ${chatId}: ${e}`);
      return { 
        ok: false, 
        description: `Network/Fetch Error: ${e instanceof Error ? e.message : 'Unknown error'}` 
      };
    }
  }

  /**
   * Forwards a message
   */
  async forwardMessage(
    toChatId: string | number, 
    fromChatId: string | number, 
    messageId: number
  ): Promise<TelegramApiResponse<TelegramMessage>> {
    const payload = {
      chat_id: String(toChatId),
      from_chat_id: String(fromChatId),
      message_id: messageId,
      disable_notification: true,
    };
    
    return await this.apiCall<TelegramMessage>("forwardMessage", payload);
  }

  async sendPhoto(chatId: string | number, photo: string, caption?: string): Promise<TelegramApiResponse<TelegramMessage>> {
    const payload = {
      chat_id: String(chatId),
      photo: photo,
      caption: caption,
    };
    return await this.apiCall<TelegramMessage>("sendPhoto", payload);
  }

  async sendVideo(chatId: string | number, video: string, caption?: string): Promise<TelegramApiResponse<TelegramMessage>> {
    const payload = {
      chat_id: String(chatId),
      video: video,
      caption: caption,
    };
    return await this.apiCall<TelegramMessage>("sendVideo", payload);
  }

  async sendAudio(chatId: string | number, audio: string, caption?: string): Promise<TelegramApiResponse<TelegramMessage>> {
    const payload = {
      chat_id: String(chatId),
      audio: audio,
      caption: caption,
    };
    return await this.apiCall<TelegramMessage>("sendAudio", payload);
  }

  async sendVoice(chatId: string | number, voice: string, caption?: string): Promise<TelegramApiResponse<TelegramMessage>> {
    const payload = {
      chat_id: String(chatId),
      voice: voice,
      caption: caption,
    };
    return await this.apiCall<TelegramMessage>("sendVoice", payload);
  }

  /**
   * Gets bot information
   */
  async getBotInfo(): Promise<TelegramApiResponse<BotInfo>> {
    return await this.apiCall<BotInfo>("getMe");
  }

  /**
   * Deletes a message
   */
  async deleteMessage(chatId: string | number, messageId: number): Promise<TelegramApiResponse> {
    const payload = {
      chat_id: String(chatId),
      message_id: messageId,
    };

    return await this.apiCall("deleteMessage", payload);
  }
}