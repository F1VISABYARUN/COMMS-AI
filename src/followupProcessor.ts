import twilio from 'twilio';
import cron from 'node-cron';
import nodemailer from 'nodemailer';
import { getPendingReminders, markReminderCompleted } from './googleSheetsManager';

const SHEET_ID = "1GEP1JtBcybnpVfDmeEr58zEhKMM1CgvfQP15wgljBJs";

// --- Twilio Settings ---
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE = process.env.TWILIO_PHONE_NUMBER;

let twilioClient: any = null;
if (TWILIO_SID && TWILIO_TOKEN) {
  twilioClient = twilio(TWILIO_SID, TWILIO_TOKEN);
}

// --- SMTP Email Settings ---
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const MY_EMAIL = process.env.MY_EMAIL || '';

let emailTransporter: nodemailer.Transporter | null = null;
if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
  emailTransporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465, // true for 465 port (SSL), false for other ports (TLS/StartTLS)
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    }
  });
}

/**
 * Sends a notification email to the business owner with call action items.
 */
async function sendEmailNotification(toEmail: string, caller: string, summary: string, actionItems: string, isCustomer: boolean): Promise<boolean> {
  if (!emailTransporter || !SMTP_USER) {
    console.warn("[WARN] SMTP Email settings not configured in .env. Skipping email dispatch.");
    return false;
  }

  const subject = isCustomer 
    ? `Follow-up: Our recent conversation` 
    : `🔔 Follow-up Reminder: Call with ${caller}`;

  const text = isCustomer
    ? `Hi,\n\nFollowing up on our recent call, here is a summary of what we discussed and the next steps:\n\n` +
      `Summary: ${summary}\n` +
      `Action Items: ${actionItems}\n\n` +
      `Please let me know if you have any questions!\n\nBest regards,\nSupport Team`
    : `You have a pending follow-up reminder.\n\n` +
      `Caller: ${caller}\n` +
      `Summary: ${summary}\n` +
      `Action Items: ${actionItems}\n\n` +
      `This reminder has been processed and marked as Completed in Google Sheets.`;

  const mailOptions = {
    from: `"Comms AI Platform" <${SMTP_USER}>`,
    to: toEmail,
    subject: subject,
    text: text
  };

  try {
    await emailTransporter.sendMail(mailOptions);
    console.log(`[EMAIL] Follow-up email sent successfully to ${toEmail}`);
    return true;
  } catch (error) {
    console.error(`[ERR] Failed to send email notification to ${toEmail}:`, error);
    return false;
  }
}

/**
 * Checks Google Sheets for pending follow-up reminders due today or in the past
 * and dispatches them via Twilio SMS and SMTP Email.
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
    
    // Headers: Date, Caller ID, Summary, Action Items, Follow-up Needed, Reminder Date, Status, Email
    const reminderDate = data['Reminder Date'] || '';
    const caller = data['Caller ID'] || 'Unknown';
    const summary = data['Summary'] || '';
    const actionItems = data['Action Items'] || '';
    const email = data['Email'] || '';

    // Check if the reminder is due today or in the past
    if (reminderDate && reminderDate <= today) {
      console.log(`[!] Sending follow-up to ${caller} (Due: ${reminderDate})`);
      
      let smsSent = true;
      let emailSent = true;

      // 1. Dispatch SMS to the Caller/Customer via Twilio
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
          smsSent = false;
        }
      } else {
        console.warn(`[WARN] Twilio not configured or invalid caller phone (${caller}). Skipping SMS.`);
        smsSent = false; // set to false if not configured to avoid false success reporting, or true if we want to bypass. Let's keep false.
      }

      // 2. Dispatch Email alert to the Customer (if email exists) or the Owner (as backup)
      const recipientEmail = email || MY_EMAIL;
      const isCustomer = !!email;

      if (recipientEmail && emailTransporter) {
        emailSent = await sendEmailNotification(recipientEmail, caller, summary, actionItems, isCustomer);
      } else {
        console.warn(`[WARN] No recipient email (no customer email and MY_EMAIL not set) or SMTP transporter not configured. Skipping Email.`);
        emailSent = false;
      }

      // 3. Mark as completed in Google Sheets if at least one notification was dispatched
      if (smsSent || emailSent) {
        await markReminderCompleted(SHEET_ID, rowIndex);
        console.log(`[OK] Follow-up processed and marked as completed for row ${rowIndex}.`);
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
