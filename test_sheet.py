from google_sheets_manager import append_call_data
import datetime

# The ID of the sheet from the URL
SHEET_ID = "1GEP1JtBcybnpVfDmeEr58zEhKMM1CgvfQP15wgljBJs"

today = datetime.datetime.now().strftime("%Y-%m-%d")
test_data = [today, "+15551234567", "Test connection call from AI", "None", "No", "", "Completed"]

print(f"Testing append to sheet {SHEET_ID}...")
success = append_call_data(SHEET_ID, test_data)

if success:
    print("Test passed! Row appended successfully.")
else:
    print("Test failed. Check credentials and sharing permissions.")
