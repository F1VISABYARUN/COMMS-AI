import { google } from 'googleapis';
import * as path from 'path';
import * as fs from 'fs';

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive'
];

const CREDENTIALS_FILE = path.join(process.cwd(), 'google_credentials.json');

/**
 * Cleans up a JSON string that may have been mangled by hosting panel env var editors.
 * Hostinger (and similar panels) often:
 *  - Wrap the entire value in extra quotes
 *  - Double-escape backslashes (\\\\n → \\n)
 *  - Escape inner double quotes (\\" → ")
 *  - Add leading/trailing backslashes
 */
function cleanEnvJson(raw: string): string {
  let s = raw.trim();

  // Strip surrounding single or double quotes added by the panel
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.substring(1, s.length - 1);
  }

  // Strip leading/trailing backslashes
  while (s.startsWith('\\')) s = s.substring(1);
  while (s.endsWith('\\')) s = s.substring(0, s.length - 1);
  s = s.trim();

  // Replace escaped double quotes \" → "
  s = s.replace(/\\"/g, '"');

  // Fix double-escaped newlines: \\\\n → \\n (literal four-char sequence to two-char)
  // This handles cases where the panel stored \\n as \\\\n
  s = s.replace(/\\\\n/g, '\\n');

  // Fix triple/quad-escaped newlines just in case
  s = s.replace(/\\\\\\\\n/g, '\\n');

  return s;
}

function getAuthClient() {
  // Try loading from Environment Variable first (best for cloud hosts)
  const envCreds = process.env.GOOGLE_CREDS_JSON;
  if (envCreds) {
    try {
      const cleanCreds = cleanEnvJson(envCreds);
      const credentials = JSON.parse(cleanCreds);
      console.log(`[OK] Google Sheets credentials loaded from GOOGLE_CREDS_JSON env var (project: ${credentials.project_id || 'unknown'})`);
      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: SCOPES,
      });
      return auth;
    } catch (error) {
      console.error(`[ERR] Failed to parse GOOGLE_CREDS_JSON env var:`, error);
      // Log the first 80 chars to help debug without leaking the full key
      console.error(`[DEBUG] GOOGLE_CREDS_JSON starts with: ${envCreds.substring(0, 80)}...`);
    }
  }

  // Fallback to local credentials file
  if (!fs.existsSync(CREDENTIALS_FILE)) {
    if (envCreds) {
      // We already tried the env var and it failed — don't mislead with "not set"
      console.error(`[ERR] Google credentials file not found at ${CREDENTIALS_FILE} and GOOGLE_CREDS_JSON env var could not be parsed (see error above).`);
    } else {
      console.error(`[ERR] Google credentials file not found at ${CREDENTIALS_FILE} and GOOGLE_CREDS_JSON environment variable is not set.`);
    }
    return null;
  }
  
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: CREDENTIALS_FILE,
      scopes: SCOPES,
    });
    console.log(`[OK] Google Sheets credentials loaded from file: ${CREDENTIALS_FILE}`);
    return auth;
  } catch (error) {
    console.error(`[ERR] Failed to authenticate with Google Sheets:`, error);
    return null;
  }
}

/**
 * Appends a row of data to the specified Google Sheet.
 * rowData should be: [Date, Caller ID, Summary, Action Items, Follow-up Needed, Reminder Date, Status]
 */
export async function appendCallData(sheetId: string, rowData: any[]): Promise<boolean> {
  const auth = getAuthClient();
  if (!auth) return false;
  
  try {
    const sheets = google.sheets({ version: 'v4', auth });
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: 'Sheet1!A:H',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [rowData]
      }
    });
    console.log(`[OK] Successfully appended data to Google Sheet '${sheetId}'`);
    return true;
  } catch (error) {
    console.error(`[ERR] Error appending to Google Sheet:`, error);
    return false;
  }
}

/**
 * Reads the Google Sheet and returns all rows where Status is 'Pending'.
 * Returns a list of dictionaries with row index and data.
 */
export async function getPendingReminders(sheetId: string): Promise<any[]> {
  const auth = getAuthClient();
  if (!auth) return [];
  
  try {
    const sheets = google.sheets({ version: 'v4', auth });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: 'Sheet1!A:H',
    });
    
    const rows = response.data.values;
    if (!rows || rows.length <= 1) {
      console.log(`[OK] No data rows found in sheet.`);
      return [];
    }
    
    // First row is headers
    const headers = rows[0];
    const pending: any[] = [];
    
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const record: { [key: string]: any } = {};
      headers.forEach((header, index) => {
        record[header] = row[index] !== undefined ? row[index] : '';
      });
      
      if (record['Status']?.toString().toLowerCase() === 'pending') {
        pending.push({
          row_index: i + 1, // 1-indexed, so row 2 corresponds to rows[1]
          data: record
        });
      }
    }
    return pending;
  } catch (error) {
    console.error(`[ERR] Error reading pending reminders:`, error);
    return [];
  }
}

/**
 * Updates the 'Status' column (column G, 7th column) to 'Completed' for a specific row.
 */
export async function markReminderCompleted(sheetId: string, rowIndex: number): Promise<boolean> {
  const auth = getAuthClient();
  if (!auth) return false;
  
  try {
    const sheets = google.sheets({ version: 'v4', auth });
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `Sheet1!G${rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [['Completed']]
      }
    });
    console.log(`[OK] Marked row ${rowIndex} as Completed`);
    return true;
  } catch (error) {
    console.error(`[ERR] Error updating status in row ${rowIndex}:`, error);
    return false;
  }
}
