import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Sends the call transcript to Gemini to extract a summary, action items,
 * and determine if a follow-up is needed.
 */
export async function processCallTranscriptWithGemini(transcript: string, callerId: string): Promise<any> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("[ERR] GEMINI_API_KEY is not set.");
    return {
      summary: "Error: GEMINI_API_KEY is not set.",
      action_items: "",
      follow_up_needed: "No",
      reminder_date: ""
    };
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
You are an AI assistant analyzing a phone call transcript.
Caller ID: ${callerId}

Transcript:
${transcript}

Task:
Analyze the transcript and provide a JSON response with the following exact keys:
- "summary": A brief 2-3 sentence summary of the call.
- "action_items": A single string listing the main action items, separated by commas.
- "follow_up_needed": A string, strictly "Yes" or "No".
- "reminder_date": If follow up is needed, provide a date in YYYY-MM-DD format (e.g., if they say "tomorrow", calculate based on context, or just return "YYYY-MM-DD" relative to today. Since you don't know today's date, output a realistic target date or just "Next Week").
- "caller_email": If the caller mentions their email address in the transcript (e.g., "my email is me@example.com"), extract it. Otherwise, return an empty string "".

Respond ONLY with valid JSON. Do not include markdown formatting or backticks.
`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    let text = response.text().trim();

    // Clean up potential markdown JSON code block wrappers
    if (text.startsWith("```json")) {
      text = text.substring(7);
    } else if (text.startsWith("```")) {
      text = text.substring(3);
    }
    if (text.endsWith("```")) {
      text = text.substring(0, text.length - 3);
    }
    text = text.trim();

    const data = JSON.parse(text);
    return data;
  } catch (error) {
    console.error(`[ERR] Failed to process transcript with Gemini:`, error);
    return {
      summary: "Error processing call summary.",
      action_items: "",
      follow_up_needed: "No",
      reminder_date: ""
    };
  }
}
