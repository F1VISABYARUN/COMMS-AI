import gspread
from google.oauth2.service_account import Credentials
import os

# Define the scope
SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive'
]

# Provide the path to the service account JSON file
CREDENTIALS_FILE = 'google_credentials.json'

def get_sheets_client():
    """Authenticate and return the gspread client."""
    if not os.path.exists(CREDENTIALS_FILE):
        print(f"[ERR] Google credentials file not found at {CREDENTIALS_FILE}")
        return None
        
    try:
        credentials = Credentials.from_service_account_file(
            CREDENTIALS_FILE, scopes=SCOPES
        )
        client = gspread.authorize(credentials)
        return client
    except Exception as e:
        print(f"[ERR] Failed to authenticate with Google Sheets: {e}")
        return None

def append_call_data(sheet_id, data_row):
    """
    Appends a row of data to the specified Google Sheet.
    data_row should be a list: [Date, Caller ID, Summary, Action Items, Follow-up Needed, Reminder Date, Status]
    """
    client = get_sheets_client()
    if not client:
        return False
        
    try:
        # Open the sheet by ID
        sheet = client.open_by_key(sheet_id).sheet1
        
        # Append the row
        sheet.append_row(data_row)
        print(f"[OK] Successfully appended data to Google Sheet '{sheet_id}'")
        return True
    except gspread.exceptions.SpreadsheetNotFound:
        print(f"[ERR] Google Sheet '{sheet_id}' not found. Make sure you shared it with the service account email!")
        return False
    except Exception as e:
        print(f"[ERR] Error appending to Google Sheet: {e}")
        return False

def get_pending_reminders(sheet_id):
    """
    Reads the Google Sheet and returns all rows where Status is 'Pending'.
    Returns a list of dictionaries with row index and data.
    """
    client = get_sheets_client()
    if not client:
        return []
        
    try:
        sheet = client.open_by_key(sheet_id).sheet1
        records = sheet.get_all_records()
        
        pending = []
        for i, row in enumerate(records):
            # i+2 because get_all_records() skips header (row 1) and lists are 0-indexed
            if row.get('Status', '').lower() == 'pending':
                pending.append({
                    'row_index': i + 2,
                    'data': row
                })
        return pending
    except Exception as e:
        print(f"[ERR] Error reading pending reminders: {e}")
        return []

def mark_reminder_completed(sheet_id, row_index):
    """
    Updates the 'Status' column to 'Completed' for a specific row.
    Assumes 'Status' is the 7th column (G).
    """
    client = get_sheets_client()
    if not client:
        return False
        
    try:
        sheet = client.open_by_key(sheet_id).sheet1
        # Update column G (Status) to 'Completed'
        sheet.update_cell(row_index, 7, 'Completed')
        print(f"[OK] Marked row {row_index} as Completed")
        return True
    except Exception as e:
        print(f"[ERR] Error updating status in row {row_index}: {e}")
        return False
