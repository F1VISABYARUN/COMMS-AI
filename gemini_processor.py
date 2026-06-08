import os
import json
import google.generativeai as genai

def process_call_transcript_with_gemini(transcript, caller_id):
    """
    Sends the call transcript to Gemini to extract a summary, action items, 
    and determine if a follow-up is needed.
    """
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("[ERR] GEMINI_API_KEY is not set.")
        return None

    genai.configure(api_key=api_key)
    
    # Use Gemini 1.5 Pro (or default recommended model)
    model = genai.GenerativeModel('gemini-1.5-pro')
    
    prompt = f"""
    You are an AI assistant analyzing a phone call transcript.
    Caller ID: {caller_id}
    
    Transcript:
    {transcript}
    
    Task:
    Analyze the transcript and provide a JSON response with the following exact keys:
    - "summary": A brief 2-3 sentence summary of the call.
    - "action_items": A single string listing the main action items, separated by commas.
    - "follow_up_needed": A string, strictly "Yes" or "No".
    - "reminder_date": If follow up is needed, provide a date in YYYY-MM-DD format (e.g., if they say "tomorrow", calculate based on context, or just return "YYYY-MM-DD" relative to today. Since you don't know today's date, output a realistic target date or just "Next Week").
    
    Respond ONLY with valid JSON. Do not include markdown formatting or backticks.
    """
    
    try:
        response = model.generate_content(prompt)
        # Clean up the response in case it has markdown code blocks
        text = response.text.replace("```json", "").replace("```", "").strip()
        data = json.loads(text)
        return data
    except Exception as e:
        print(f"[ERR] Failed to process transcript with Gemini: {e}")
        return {
            "summary": "Error processing call summary.",
            "action_items": "",
            "follow_up_needed": "No",
            "reminder_date": ""
        }
