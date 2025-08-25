import { GoogleGenerativeAI } from '@google/generai';
import { DatabaseService } from './database';
import { SYSTEM_PROMPT } from '../config/prompts';
import type { ParsedSchedule } from '../types';

const MAX_RETRIES = 3;

export class AIService {
    constructor(private database: DatabaseService) {}

    /**
     * Parses schedule text using Gemini AI with retry logic.
     * @param text The unstructured schedule text from the user.
     * @returns A structured schedule object.
     * @throws An error if all retry attempts fail.
     */
    async parseSchedule(text: string): Promise<ParsedSchedule> {
        let availableKeys = await this.database.getApiKeys('gemini');
        if (availableKeys.length === 0) {
            console.error('[AI] No active API keys found in the database.');
            throw new Error('No active API keys available.');
        }

        const triedKeys = new Set<string>();

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            const keysToTry = availableKeys.filter(k => !triedKeys.has(k));

            if (keysToTry.length === 0) {
                console.error(`[AI] Attempt ${attempt}: No new API keys available to try.`);
                // Reset for next potential call if all keys were exhausted
                availableKeys = await this.database.getApiKeys('gemini');
                if (availableKeys.length === 0) {
                   throw new Error('All available API keys failed and no new keys were found.');
                }
                triedKeys.clear();
                // continue to the next attempt with the reset list
                continue;
            }

            const randomKey = keysToTry[Math.floor(Math.random() * keysToTry.length)];
            triedKeys.add(randomKey);

            console.log(`[AI] Attempt ${attempt} of ${MAX_RETRIES} using a random API key.`);

            try {
                const ai = new GoogleGenerativeAI(randomKey);

                const model = ai.getGenerativeModel({
                    model: 'gemini-2.5-flash',
                    generationConfig: { responseMimeType: 'application/json' },
                    systemInstruction: SYSTEM_PROMPT,
                });

                const result = await model.generateContentStream(text);

                let responseText = '';
                for await (const chunk of result.stream) {
                    responseText += chunk.text();
                }

                // Basic validation
                if (!responseText) {
                    throw new Error('AI returned an empty response.');
                }

                const parsedJson = JSON.parse(responseText) as ParsedSchedule;

                // More validation can be added here to check the structure of parsedJson
                if (!parsedJson.odd_week_schedule || !parsedJson.even_week_schedule) {
                    throw new Error('AI response is missing required schedule structure.');
                }

                console.log('[AI] Successfully parsed schedule text.');
                return parsedJson;

            } catch (error) {
                console.error(`[AI] Attempt ${attempt} failed with key ending in ...${randomKey.slice(-4)}:`, error);
                if (attempt >= MAX_RETRIES) {
                    console.error('[AI] All retry attempts have failed.');
                    throw new Error('Failed to parse schedule with AI after multiple attempts.');
                }
            }
        }

        // This part should not be reached if MAX_RETRIES > 0
        throw new Error('Failed to get a successful response from the AI service.');
    }
}
