from apscheduler.schedulers.background import BackgroundScheduler
import datetime
from google_sheets_manager import get_pending_reminders, mark_reminder_completed
import os

# We would import your SMS/Email sending functions here
# For example: from twilio_helper import send_sms

SHEET_ID = "1GEP1JtBcybnpVfDmeEr58zEhKMM1CgvfQP15wgljBJs"

def check_and_send_followups():
    print(f"\n[{datetime.datetime.now()}] Checking Google Sheets for pending follow-ups...")
    pending = get_pending_reminders(SHEET_ID)
    
    if not pending:
        print("[OK] No pending follow-ups found.")
        return
        
    today = datetime.datetime.now().strftime("%Y-%m-%d")
    
    for item in pending:
        row_index = item['row_index']
        data = item['data']
        reminder_date = data.get('Reminder Date', '')
        caller = data.get('Caller ID', 'Unknown')
        
        # Check if the reminder is due today or in the past
        if reminder_date and reminder_date <= today:
            print(f"[!] Sending follow-up to {caller} (Due: {reminder_date})")
            
            # TODO: Add logic here to send the actual Email and SMS via Twilio
            # send_sms(caller, "Hi, following up on our previous call...")
            # send_email(...)
            
            # Mark as completed
            mark_reminder_completed(SHEET_ID, row_index)
            print(f"[OK] Follow-up sent and marked as completed for row {row_index}.")

def start_scheduler():
    scheduler = BackgroundScheduler()
    # Run every 10 minutes for the demo, but usually this would be once a day
    scheduler.add_job(func=check_and_send_followups, trigger="interval", minutes=1)
    scheduler.start()
    print("[OK] Follow-up Scheduler started! It will check Google Sheets every 1 minute.")
    return scheduler
