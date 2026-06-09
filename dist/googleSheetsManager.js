"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.appendCallData = appendCallData;
exports.getPendingReminders = getPendingReminders;
exports.markReminderCompleted = markReminderCompleted;
const googleapis_1 = require("googleapis");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive'
];
const CREDENTIALS_FILE = path.join(process.cwd(), 'google_credentials.json');
function getAuthClient() {
    // ═══════════════════════════════════════════════════════════
    //  METHOD 1: Individual env vars (BEST for Hostinger)
    //  No JSON parsing needed — completely avoids escaping issues
    // ═══════════════════════════════════════════════════════════
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    const privateKeyRaw = process.env.GOOGLE_PRIVATE_KEY;
    const projectId = process.env.GOOGLE_PROJECT_ID;
    if (clientEmail && privateKeyRaw) {
        try {
            // The private key PEM uses real newlines, but env vars may store them as:
            //   \n  (literal backslash + n)  — normal case
            //   \\n (double-escaped)         — Hostinger adds extra backslash
            // Handle double-escaped first, then single-escaped
            const privateKey = privateKeyRaw
                .replace(/\\\\n/g, '\n')
                .replace(/\\n/g, '\n');
            const auth = new googleapis_1.google.auth.GoogleAuth({
                credentials: {
                    type: 'service_account',
                    project_id: projectId || '',
                    client_email: clientEmail,
                    private_key: privateKey,
                },
                scopes: SCOPES,
            });
            console.log(`[OK] Google Sheets auth via individual env vars (email: ${clientEmail})`);
            return auth;
        }
        catch (error) {
            console.error(`[ERR] Failed to auth with individual env vars:`, error);
        }
    }
    // ═══════════════════════════════════════════════════════════
    //  METHOD 2: Base64-encoded JSON (GOOGLE_CREDS_BASE64)
    //  Set it once with: base64 google_credentials.json
    // ═══════════════════════════════════════════════════════════
    const base64Creds = process.env.GOOGLE_CREDS_BASE64;
    if (base64Creds) {
        try {
            const decoded = Buffer.from(base64Creds.trim(), 'base64').toString('utf-8');
            const credentials = JSON.parse(decoded);
            const auth = new googleapis_1.google.auth.GoogleAuth({
                credentials,
                scopes: SCOPES,
            });
            console.log(`[OK] Google Sheets auth via GOOGLE_CREDS_BASE64 (project: ${credentials.project_id || 'unknown'})`);
            return auth;
        }
        catch (error) {
            console.error(`[ERR] Failed to parse GOOGLE_CREDS_BASE64:`, error);
        }
    }
    // ═══════════════════════════════════════════════════════════
    //  METHOD 3: Raw JSON env var (GOOGLE_CREDS_JSON) — last resort
    // ═══════════════════════════════════════════════════════════
    const envCreds = process.env.GOOGLE_CREDS_JSON;
    if (envCreds) {
        try {
            // Aggressive cleanup for hosting panels that mangle JSON
            let s = envCreds.trim();
            // Strip surrounding quotes
            if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
                s = s.substring(1, s.length - 1);
            }
            // Remove ALL backslashes that precede non-JSON-escape characters
            // Valid JSON escapes after \: " \ / b f n r t u
            // Everything else (like \{ \} \p \a etc.) is invalid — strip the backslash
            s = s.replace(/\\([^"\\\/bfnrtu])/g, '$1');
            // Fix double-escaped sequences: \\n → \n, \\t → \t, etc.
            s = s.replace(/\\\\n/g, '\\n');
            s = s.replace(/\\\\t/g, '\\t');
            s = s.replace(/\\\\r/g, '\\r');
            const credentials = JSON.parse(s);
            const auth = new googleapis_1.google.auth.GoogleAuth({
                credentials,
                scopes: SCOPES,
            });
            console.log(`[OK] Google Sheets auth via GOOGLE_CREDS_JSON (project: ${credentials.project_id || 'unknown'})`);
            return auth;
        }
        catch (error) {
            console.error(`[ERR] Failed to parse GOOGLE_CREDS_JSON:`, error);
            console.error(`[DEBUG] First 80 chars: ${envCreds.substring(0, 80)}...`);
        }
    }
    // ═══════════════════════════════════════════════════════════
    //  METHOD 4: Local credentials file (dev only)
    // ═══════════════════════════════════════════════════════════
    if (fs.existsSync(CREDENTIALS_FILE)) {
        try {
            const auth = new googleapis_1.google.auth.GoogleAuth({
                keyFile: CREDENTIALS_FILE,
                scopes: SCOPES,
            });
            console.log(`[OK] Google Sheets auth via local file: ${CREDENTIALS_FILE}`);
            return auth;
        }
        catch (error) {
            console.error(`[ERR] Failed to auth with credentials file:`, error);
            return null;
        }
    }
    console.error(`[ERR] No Google credentials found. Set one of these on Hostinger:`);
    console.error(`  → GOOGLE_CLIENT_EMAIL + GOOGLE_PRIVATE_KEY (recommended)`);
    console.error(`  → GOOGLE_CREDS_BASE64`);
    console.error(`  → GOOGLE_CREDS_JSON`);
    return null;
}
/**
 * Appends a row of data to the specified Google Sheet.
 * rowData should be: [Date, Caller ID, Summary, Action Items, Follow-up Needed, Reminder Date, Status, Email, Call ID]
 */
async function appendCallData(sheetId, rowData) {
    const auth = getAuthClient();
    if (!auth)
        return false;
    try {
        const sheets = googleapis_1.google.sheets({ version: 'v4', auth });
        await sheets.spreadsheets.values.append({
            spreadsheetId: sheetId,
            range: 'Sheet1!A:I',
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [rowData]
            }
        });
        console.log(`[OK] Successfully appended data to Google Sheet '${sheetId}'`);
        return true;
    }
    catch (error) {
        console.error(`[ERR] Error appending to Google Sheet:`, error);
        return false;
    }
}
/**
 * Reads the Google Sheet and returns all rows where Status is 'Pending'.
 * Returns a list of dictionaries with row index and data.
 */
async function getPendingReminders(sheetId) {
    const auth = getAuthClient();
    if (!auth)
        return [];
    try {
        const sheets = googleapis_1.google.sheets({ version: 'v4', auth });
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: sheetId,
            range: 'Sheet1!A:I',
        });
        const rows = response.data.values;
        if (!rows || rows.length <= 1) {
            console.log(`[OK] No data rows found in sheet.`);
            return [];
        }
        // First row is headers
        const headers = rows[0];
        const pending = [];
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const record = {};
            headers.forEach((header, index) => {
                record[header] = row[index] !== undefined ? row[index] : '';
            });
            // Fallback for Call ID if not mapped via header names
            if (row[8] !== undefined && !record['Call ID']) {
                record['Call ID'] = row[8];
            }
            if (record['Status']?.toString().toLowerCase() === 'pending') {
                pending.push({
                    row_index: i + 1, // 1-indexed, so row 2 corresponds to rows[1]
                    data: record
                });
            }
        }
        return pending;
    }
    catch (error) {
        console.error(`[ERR] Error reading pending reminders:`, error);
        return [];
    }
}
/**
 * Updates the 'Status' column (column G, 7th column) to 'Completed' for a specific row.
 */
async function markReminderCompleted(sheetId, rowIndex) {
    const auth = getAuthClient();
    if (!auth)
        return false;
    try {
        const sheets = googleapis_1.google.sheets({ version: 'v4', auth });
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
    }
    catch (error) {
        console.error(`[ERR] Error updating status in row ${rowIndex}:`, error);
        return false;
    }
}
