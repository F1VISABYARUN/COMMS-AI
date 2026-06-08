import { google } from 'googleapis';
import * as path from 'path';
import * as fs from 'fs';

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive'
];

const CREDENTIALS_FILE = path.join(process.cwd(), 'google_credentials.json');

function getAuthClient() {
  // Try loading from Environment Variable first (best for cloud hosts)
  const envCreds = process.env.GOOGLE_CREDS_JSON;
  if (envCreds) {
    try {
      // Clean up potential escaping issues from environment variable panels
      let cleanCreds = envCreds.trim();
      if (cleanCreds.startsWith('\\')) {
        cleanCreds = cleanCreds.substring(1);
      }
      if (cleanCreds.endsWith('\\')) {
        cleanCreds = cleanCreds.substring(0, cleanCreds.length - 1);
      }
      
      const credentials = JSON.parse(cleanCreds);
      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: SCOPES,
      });
      return auth;
    } catch (error) {
      console.error(`[ERR] Failed to authenticate with Google Sheets using GOOGLE_CREDS_JSON env var:`, error);
    }
  }

  // Fallback to local credentials file
  if (!fs.existsSync(CREDENTIALS_FILE)) {
    console.error(`[ERR] Google credentials file not found at ${CREDENTIALS_FILE} and GOOGLE_CREDS_JSON environment variable is not set.`);
    return null;
  }
  
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: CREDENTIALS_FILE,
      scopes: SCOPES,
    });
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
