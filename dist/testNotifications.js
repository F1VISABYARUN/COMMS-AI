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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const twilio_1 = __importDefault(require("twilio"));
const nodemailer_1 = __importDefault(require("nodemailer"));
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE = process.env.TWILIO_PHONE_NUMBER;
const TWILIO_WHATSAPP = process.env.TWILIO_WHATSAPP_NUMBER || '+14155238886';
const MY_MOBILE = process.env.MY_MOBILE_NUMBER;
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const MY_EMAIL = process.env.MY_EMAIL || '';
async function testSMS() {
    console.log("\n--- Testing Twilio SMS ---");
    if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_PHONE) {
        console.error("[FAIL] Twilio credentials missing in .env.");
        return false;
    }
    if (!MY_MOBILE) {
        console.error("[FAIL] MY_MOBILE_NUMBER is not set in .env.");
        return false;
    }
    try {
        const client = (0, twilio_1.default)(TWILIO_SID, TWILIO_TOKEN);
        const message = await client.messages.create({
            body: "🔔 Heleo AI SMS Test: Your channel is fully configured and functional!",
            from: TWILIO_PHONE,
            to: MY_MOBILE
        });
        console.log(`[PASS] SMS sent successfully. SID: ${message.sid}`);
        return true;
    }
    catch (err) {
        console.error(`[FAIL] SMS failed:`, err.message);
        return false;
    }
}
async function testWhatsApp() {
    console.log("\n--- Testing Twilio WhatsApp ---");
    if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_WHATSAPP) {
        console.error("[FAIL] Twilio WhatsApp credentials missing in .env.");
        return false;
    }
    if (!MY_MOBILE) {
        console.error("[FAIL] MY_MOBILE_NUMBER is not set in .env.");
        return false;
    }
    try {
        const client = (0, twilio_1.default)(TWILIO_SID, TWILIO_TOKEN);
        // WhatsApp Sandbox format: 'whatsapp:+14155238886' and destination 'whatsapp:+91...'
        const waFrom = TWILIO_WHATSAPP.startsWith('whatsapp:') ? TWILIO_WHATSAPP : `whatsapp:${TWILIO_WHATSAPP}`;
        const waTo = MY_MOBILE.startsWith('whatsapp:') ? MY_MOBILE : `whatsapp:${MY_MOBILE}`;
        console.log(`Sending from ${waFrom} to ${waTo}...`);
        const message = await client.messages.create({
            body: "🔔 Heleo AI WhatsApp Test: Your channel is fully configured and functional!",
            from: waFrom,
            to: waTo
        });
        console.log(`[PASS] WhatsApp sent successfully. SID: ${message.sid}`);
        return true;
    }
    catch (err) {
        console.error(`[FAIL] WhatsApp failed:`, err.message);
        console.log(`[INFO] Note: For the Twilio WhatsApp Sandbox, the recipient phone number must first opt-in by sending a message (like "join <sandbox-code>") to the sandbox number.`);
        return false;
    }
}
async function testEmail() {
    console.log("\n--- Testing SMTP Email ---");
    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
        console.warn("[WARN] SMTP settings (SMTP_HOST, SMTP_USER, SMTP_PASS) not configured in .env. Skipping Email test.");
        return false;
    }
    if (!MY_EMAIL) {
        console.error("[FAIL] MY_EMAIL recipient is not set in .env.");
        return false;
    }
    try {
        const transporter = nodemailer_1.default.createTransport({
            host: SMTP_HOST,
            port: SMTP_PORT,
            secure: SMTP_PORT === 465,
            auth: {
                user: SMTP_USER,
                pass: SMTP_PASS
            }
        });
        const info = await transporter.sendMail({
            from: `"Heleo AI Test" <${SMTP_USER}>`,
            to: MY_EMAIL,
            subject: "🔔 Heleo AI Email Test",
            text: "Your SMTP Email channel is fully configured and functional!"
        });
        console.log(`[PASS] Email sent successfully. MessageID: ${info.messageId}`);
        return true;
    }
    catch (err) {
        console.error(`[FAIL] Email failed:`, err.message);
        return false;
    }
}
async function main() {
    console.log("=========================================");
    console.log(" TESTING CHANNELS: SMS, WHATSAPP, EMAIL");
    console.log("=========================================");
    await testSMS();
    await testWhatsApp();
    await testEmail();
    console.log("\n=========================================");
    console.log(" TESTING COMPLETED");
    console.log("=========================================");
}
main().catch(err => {
    console.error("Test execution failed:", err);
});
