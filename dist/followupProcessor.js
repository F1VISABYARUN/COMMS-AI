"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkAndSendFollowups = checkAndSendFollowups;
exports.startScheduler = startScheduler;
const twilio_1 = __importDefault(require("twilio"));
const node_cron_1 = __importDefault(require("node-cron"));
const nodemailer_1 = __importDefault(require("nodemailer"));
const googleSheetsManager_1 = require("./googleSheetsManager");
const supabaseClient_1 = require("./supabaseClient");
const SHEET_ID = "1GEP1JtBcybnpVfDmeEr58zEhKMM1CgvfQP15wgljBJs";
// --- Twilio Settings ---
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE = process.env.TWILIO_PHONE_NUMBER;
let twilioClient = null;
if (TWILIO_SID && TWILIO_TOKEN) {
    twilioClient = (0, twilio_1.default)(TWILIO_SID, TWILIO_TOKEN);
}
// --- SMTP Email Settings ---
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const MY_EMAIL = process.env.MY_EMAIL || '';
let emailTransporter = null;
if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    emailTransporter = nodemailer_1.default.createTransport({
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
async function sendEmailNotification(toEmail, caller, summary, actionItems, isCustomer) {
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
    }
    catch (error) {
        console.error(`[ERR] Failed to send email notification to ${toEmail}:`, error);
        return false;
    }
}
/**
 * Checks Google Sheets for pending follow-up reminders due today or in the past
 * and dispatches them via Twilio SMS and SMTP Email.
 */
async function checkAndSendFollowups() {
    console.log(`\n[${new Date().toISOString()}] Checking Google Sheets for pending follow-ups...`);
    const pending = await (0, googleSheetsManager_1.getPendingReminders)(SHEET_ID);
    if (!pending || pending.length === 0) {
        console.log("[OK] No pending follow-ups found.");
        return;
    }
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    for (const item of pending) {
        const rowIndex = item.row_index;
        const data = item.data;
        // Headers: Date, Caller ID, Summary, Action Items, Follow-up Needed, Reminder Date, Status, Email, Call ID
        const reminderDate = data['Reminder Date'] || '';
        const caller = data['Caller ID'] || 'Unknown';
        const summary = data['Summary'] || '';
        const actionItems = data['Action Items'] || '';
        const email = data['Email'] || '';
        // Validate reminder date string. Must match YYYY-MM-DD
        let targetDate = reminderDate.trim();
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (targetDate && !dateRegex.test(targetDate)) {
            console.warn(`[WARN] Invalid reminder date format "${targetDate}" for row ${rowIndex}. Processing immediately.`);
            targetDate = today;
        }
        // Check if the reminder is due today or in the past
        if (targetDate && targetDate <= today) {
            console.log(`[!] Sending follow-up to ${caller} (Due: ${targetDate})`);
            let smsSent = true;
            let emailSent = true;
            // 1. Dispatch SMS to the Caller/Customer via Twilio
            if (twilioClient && TWILIO_PHONE && caller !== 'Unknown' && !caller.includes('Unknown')) {
                let targetPhone = caller.trim();
                if (!targetPhone.startsWith('+')) {
                    if (/^\d+$/.test(targetPhone)) {
                        if (targetPhone.length === 10) {
                            const myMobile = process.env.MY_MOBILE_NUMBER || '';
                            if (myMobile.startsWith('+91')) {
                                targetPhone = '+91' + targetPhone;
                            }
                            else {
                                targetPhone = '+1' + targetPhone;
                            }
                        }
                        else {
                            targetPhone = '+' + targetPhone;
                        }
                    }
                }
                try {
                    const body = `Hi, following up on our previous call. Summary of discussed items: ${summary.substring(0, 100)}... Action items: ${actionItems.substring(0, 100)}... Let me know if you need anything else!`;
                    await twilioClient.messages.create({
                        body,
                        from: TWILIO_PHONE,
                        to: targetPhone
                    });
                    console.log(`[SMS] Follow-up SMS sent successfully to ${targetPhone}`);
                }
                catch (error) {
                    console.error(`[ERR] Failed to send follow-up SMS to ${targetPhone}:`, error);
                    smsSent = false;
                }
            }
            else {
                console.warn(`[WARN] Twilio not configured or invalid caller phone (${caller}). Skipping SMS.`);
                smsSent = false;
            }
            // 2. Dispatch Email alert to the Customer (if email exists) or the Owner (as backup)
            const recipientEmail = email || MY_EMAIL;
            const isCustomer = !!email;
            if (recipientEmail && emailTransporter) {
                emailSent = await sendEmailNotification(recipientEmail, caller, summary, actionItems, isCustomer);
            }
            else {
                console.warn(`[WARN] No recipient email (no customer email and MY_EMAIL not set) or SMTP transporter not configured. Skipping Email.`);
                emailSent = false;
            }
            // 3. Mark as completed in Google Sheets and Supabase if at least one notification was dispatched
            if (smsSent || emailSent) {
                await (0, googleSheetsManager_1.markReminderCompleted)(SHEET_ID, rowIndex);
                console.log(`[OK] Follow-up processed and marked as completed in Sheets for row ${rowIndex}.`);
                // Sync follow-up status to Supabase using Call ID
                const callId = data['Call ID'] || '';
                if (callId) {
                    try {
                        const { data: record, error: fetchErr } = await supabaseClient_1.supabase
                            .from('recordings')
                            .select('result')
                            .eq('id', callId)
                            .maybeSingle();
                        if (!fetchErr && record && record.result) {
                            const updatedResult = { ...record.result, follow_up_status: 'Completed' };
                            const { error: updateErr } = await supabaseClient_1.supabase
                                .from('recordings')
                                .update({ result: updatedResult })
                                .eq('id', callId);
                            if (updateErr) {
                                console.error(`[ERR] Failed to update follow-up status in Supabase for call ${callId}:`, updateErr);
                            }
                            else {
                                console.log(`[OK] Synced follow-up status to Completed in Supabase for call ${callId}`);
                            }
                        }
                    }
                    catch (dbErr) {
                        console.error(`[ERR] Exception syncing Supabase follow-up status:`, dbErr);
                    }
                }
            }
        }
    }
}
/**
 * Starts the cron scheduler to run every 1 minute.
 */
function startScheduler() {
    node_cron_1.default.schedule('*/1 * * * *', async () => {
        try {
            await checkAndSendFollowups();
        }
        catch (error) {
            console.error('[ERR] Error in follow-up cron job:', error);
        }
    });
    console.log("[OK] Follow-up Scheduler started! It will check Google Sheets every 1 minute.");
}
