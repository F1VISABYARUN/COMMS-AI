import { GoogleGenerativeAI } from '@google/generative-ai';
import https from 'https';
import http from 'http';

/**
 * Downloads a Twilio recording as a Buffer.
 * Twilio recordings require Basic auth (AccountSid:AuthToken).
 */
export async function downloadTwilioRecording(recordingUrl: string): Promise<Buffer | null> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    console.error('[ERR] Cannot download recording: TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN not set.');
    return null;
  }

  // Ensure we're using the .mp3 URL
  const url = recordingUrl.endsWith('.mp3') ? recordingUrl : `${recordingUrl}.mp3`;

  return new Promise((resolve) => {
    const makeRequest = (requestUrl: string, redirectCount: number = 0) => {
      if (redirectCount > 5) {
        console.error('[ERR] Too many redirects while downloading recording.');
        resolve(null);
        return;
      }

      const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
      const parsedUrl = new URL(requestUrl);
      const client = parsedUrl.protocol === 'https:' ? https : http;

      const options = {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        headers: {
          'Authorization': `Basic ${auth}`
        }
      };

      const req = client.request(options, (res) => {
        // Handle redirects (Twilio often 301/302 to a different URL)
        if (res.statusCode && (res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
          console.log(`[REC] Following redirect to: ${res.headers.location.substring(0, 80)}...`);
          makeRequest(res.headers.location, redirectCount + 1);
          return;
        }

        if (res.statusCode !== 200) {
          console.error(`[ERR] Recording download failed with status ${res.statusCode}`);
          resolve(null);
          return;
        }

        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          console.log(`[OK] Recording downloaded: ${(buffer.length / 1024).toFixed(1)} KB`);
          resolve(buffer);
        });
      });

      req.on('error', (error) => {
        console.error('[ERR] Failed to download recording:', error.message);
        resolve(null);
      });

      req.setTimeout(30000, () => {
        console.error('[ERR] Recording download timed out.');
        req.destroy();
        resolve(null);
      });

      req.end();
    };

    makeRequest(url);
  });
}

/**
 * Sends audio bytes directly to Gemini for transcription + analysis in one shot.
 * This avoids needing a separate speech-to-text service.
 */
export async function processCallAudioWithGemini(audioBuffer: Buffer, callerId: string): Promise<any> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("[ERR] GEMINI_API_KEY is not set.");
    return null;
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const audioBase64 = audioBuffer.toString('base64');

    const prompt = `
You are an AI assistant. You will be given an audio recording of a phone call.
Caller ID: ${callerId}

Tasks:
1. First, transcribe the audio recording into text.
2. Then, analyze the transcript and provide a comprehensive JSON response.

Your JSON response MUST have ALL of the following exact keys:
- "transcript": The full text transcription of the phone call audio.
- "summary": A brief 2-3 sentence summary of the call.
- "caller_name": The name of the caller if mentioned, otherwise "Unknown Caller".
- "policy_type": The type of service/account discussed (e.g. "Insurance Policy", "Real Estate Inquiry", "Medical Consultation", "General Inquiry").
- "urgency": Strictly one of "high", "medium", or "low".
- "intent": A short phrase describing the caller's primary intent (e.g. "Policy update request", "Appointment booking").
- "objections": An array of strings listing any concerns or objections raised by the caller. If none, use an empty array [].
- "missing_info": An array of strings listing any information still needed. If none, use an empty array [].
- "tasks": An array of task objects, each with keys: "title" (string), "due" (string like "Today", "Tomorrow", "Friday", "Next Week"), "priority" ("high" or "medium"). Include 2-4 actionable tasks.
- "follow_ups": An object with exactly 3 keys:
    - "whatsapp": A brief, friendly WhatsApp follow-up message to the caller.
    - "email": A professional follow-up email (include Subject: line).
    - "sms": A short SMS follow-up message.
- "action_items": A single comma-separated string listing the main action items.
- "follow_up_needed": Strictly "Yes" or "No".
- "reminder_date": If follow up is needed, a date in YYYY-MM-DD format. Otherwise empty string "".
- "caller_email": If the caller mentions their email, extract it. Otherwise empty string "".

Respond ONLY with valid JSON. Do not include markdown formatting or backticks.
`;


    const result = await model.generateContent([
      { text: prompt },
      {
        inlineData: {
          mimeType: 'audio/mpeg',
          data: audioBase64
        }
      }
    ]);

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
    console.log(`[AI] Audio analysis complete — transcript length: ${(data.transcript || '').length} chars`);
    return data;
  } catch (error) {
    console.error(`[ERR] Failed to process audio with Gemini:`, error);
    return null;
  }
}

/**
 * Sends the call transcript text to Gemini to extract a summary, action items,
 * and determine if a follow-up is needed.
 * Used as a fallback when audio processing fails or for manually entered transcripts.
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
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

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
