from google_sheets_manager import get_sheets_client

SHEET_ID = "1GEP1JtBcybnpVfDmeEr58zEhKMM1CgvfQP15wgljBJs"

def setup_headers():
    client = get_sheets_client()
    if not client:
        return
        
    try:
        sheet = client.open_by_key(SHEET_ID).sheet1
        
        # Define the headers
        headers = ["Date", "Caller ID", "Summary", "Action Items", "Follow-up Needed", "Reminder Date", "Status"]
        
        # Insert them into the very first row (A1:G1)
        sheet.insert_row(headers, 1)
        print("[OK] Successfully created sections/headers in the Google Sheet!")
        
    except Exception as e:
        print(f"[ERR] Error setting up headers: {e}")

if __name__ == "__main__":
    setup_headers()
