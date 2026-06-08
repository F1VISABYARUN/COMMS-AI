import twilio from 'twilio';
import cron from 'node-cron';
import { getPendingReminders, markReminderCompleted } from './googleSheetsManager';

const SHEET_ID = "1GEP1JtBcybnpVfDmeEr58zEhKMM1CgvfQP15wgljBJs";

const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE = process.env.TWILIO_PHONE_NUMBER;

let twilioClient: any = null;
if (TWILIO_SID && TWILIO_TOKEN) {
  twilioClient = twilio(TWILIO_SID, TWILIO_TOKEN);
}

/**
 * Checks Google Sheets for pending follow-up reminders due today or in the past
 * and dispatches them via Twilio.
 */
export async function checkAndSendFollowups(): Promise<void> {
  console.log(`\n[${new Date().toISOString()}] Checking Google Sheets for pending follow-ups...`);
  const pending = await getPendingReminders(SHEET_ID);

  if (!pending || pending.length === 0) {
    console.log("[OK] No pending follow-ups found.");
    return;
  }

  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

  for (const item of pending) {
    const rowIndex = item.row_index;
    const data = item.data;
    
    // Headers: Date, Caller ID, Summary, Action Items, Follow-up Needed, Reminder Date, Status
    const reminderDate = data['Reminder Date'] || '';
    const caller = data['Caller ID'] || 'Unknown';
    const summary = data['Summary'] || '';
    const actionItems = data['Action Items'] || '';

    // Check if the reminder is due today or in the past
    if (reminderDate && reminderDate <= today) {
      console.log(`[!] Sending follow-up to ${caller} (Due: ${reminderDate})`);
      
      let sentSuccessfully = true;

      // Only attempt to send SMS if twilio client is ready, and caller number is valid/not Unknown
      if (twilioClient && TWILIO_PHONE && caller !== 'Unknown' && !caller.includes('Unknown')) {
        try {
          const body = `Hi, following up on our previous call. Summary of discussed items: ${summary.substring(0, 100)}... Action items: ${actionItems.substring(0, 100)}... Let me know if you need anything else!`;
          await twilioClient.messages.create({
            body,
            from: TWILIO_PHONE,
            to: caller
          });
          console.log(`[SMS] Follow-up SMS sent successfully to ${caller}`);
        } catch (error) {
          console.error(`[ERR] Failed to send follow-up SMS to ${caller}:`, error);
          sentSuccessfully = false;
        }
      } else {
        console.warn(`[WARN] Twilio not configured or invalid caller phone (${caller}). Skipping SMS.`);
      }

      if (sentSuccessfully) {
        // Mark as completed in Google Sheets
        await markReminderCompleted(SHEET_ID, rowIndex);
        console.log(`[OK] Follow-up sent and marked as completed for row ${rowIndex}.`);
      }
    }
  }
}

/**
 * Starts the cron scheduler to run every 1 minute.
 */
export function startScheduler(): void {
  cron.schedule('*/1 * * * *', async () => {
    try {
      await checkAndSendFollowups();
    } catch (error) {
      console.error('[ERR] Error in follow-up cron job:', error);
    }
  });
  console.log("[OK] Follow-up Scheduler started! It will check Google Sheets every 1 minute.");
}
