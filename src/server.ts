import dotenv from 'dotenv';
// Load environment variables immediately
dotenv.config();

import express from 'express';
import cors from 'cors';
import nunjucks from 'nunjucks';
import twilio from 'twilio';
import { randomUUID } from 'crypto';
import * as path from 'path';

// Import our custom modules
import { processCallTranscriptWithGemini } from './geminiProcessor';
import { appendCallData } from './googleSheetsManager';
import { startScheduler } from './followupProcessor';

const app = express();
const port = process.env.PORT || 5000;

// --- Twilio Configuration ---
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE = process.env.TWILIO_PHONE_NUMBER;
const TWILIO_WHATSAPP = process.env.TWILIO_WHATSAPP_NUMBER || "+14155238886";
const MY_MOBILE = process.env.MY_MOBILE_NUMBER;
const BASE_URL = process.env.BASE_URL || "http://localhost:5000";

let twilioClient: any = null;
try {
  if (TWILIO_SID && TWILIO_TOKEN) {
    twilioClient = twilio(TWILIO_SID, TWILIO_TOKEN);
    console.log(`[OK] Twilio client initialized (SID: ${TWILIO_SID.substring(0, 8)}...)`);
  } else {
    console.warn("[WARN] Twilio credentials not found in .env — messaging & calling disabled");
  }
} catch (error) {
  console.error("[ERR] Failed to initialize Twilio client:", error);
}

// --- Middleware Configuration ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (under /static prefix to match Flask templates)
app.use('/static', express.static(path.join(process.cwd(), 'static')));

// Set up Nunjucks template engine
const env = nunjucks.configure('templates', {
  autoescape: true,
  express: app,
  watch: false
});

// Replicate Flask's url_for helper function
env.addGlobal('url_for', (type: string, options: { filename: string }) => {
  if (type === 'static' && options && options.filename) {
    return `/static/${options.filename}`;
  }
  return '';
});

// Middleware to inject the request path into template contexts (for active links in navigation)
app.use((req, res, next) => {
  res.locals.request = {
    path: req.path
  };
  next();
});

// --- In-memory store for call recordings (production: use a database) ---
interface CallRecording {
  id: string;
  recording_sid?: string;
  call_sid?: string;
  recording_url?: string;
  duration_seconds?: number;
  caller: string;
  status?: string;
  timestamp: number;
  transcript?: string;
  result?: any;
}
const CALL_RECORDINGS: CallRecording[] = [];

// Sample data for demo
const SAMPLE_TRANSCRIPTS: { [key: string]: any } = {
  "insurance": {
    "title": "Auto & Property Coverage Update",
    "industry": "insurance",
    "caller": "Bob Henderson",
    "text": (
      "Bob: Hey Sarah, I need to add my new delivery truck to my commercial policy. " +
      "It's a 2024 Ford F-250. Also, we sold the old warehouse on 5th Street last week, " +
      "so we need to remove that property from our coverage. I'm a bit concerned the " +
      "rate is going to spike. Can you email me the updated quote by Friday morning? " +
      "I also need to send you the VIN of the truck once I get it from the dealer."
    ),
    "mock_result": {
      "summary": "Client Bob Henderson wants to add a 2024 Ford F-250 to his commercial auto policy and remove a warehouse on 5th Street. He is concerned about premium increases and requested a quote by Friday morning. Needs to provide the vehicle VIN.",
      "caller_name": "Bob Henderson",
      "policy_type": "Commercial Auto & Property",
      "urgency": "high",
      "intent": "Policy endorsement (add vehicle, remove property)",
      "objections": ["Concerned about premium rates spiking due to new vehicle"],
      "missing_info": ["VIN for the 2024 Ford F-250"],
      "tasks": [
        {"title": "Remove warehouse on 5th Street from property schedule", "due": "Friday", "priority": "high"},
        {"title": "Generate updated Commercial Auto quote for 2024 Ford F-250", "due": "Friday", "priority": "high"},
        {"title": "Follow up with Bob to collect the F-250 VIN", "due": "Monday", "priority": "medium"}
      ],
      "follow_ups": {
        "whatsapp": "Hi Bob, I'm processing the updates to your policy. I'll have the quote to add the 2024 Ford F-250 and remove the 5th Street warehouse ready by Friday. In the meantime, please send over the VIN of the F-250 as soon as you receive it from the dealer. Thanks! - Sarah",
        "email": "Subject: Policy Endorsement Update - Bob's Deliveries\n\nDear Bob,\n\nI am currently working on updating your commercial coverage. I am removing the 5th Street warehouse and adding the 2024 Ford F-250 to your policy. I will have the formal quote ready for your review by Friday morning.\n\nCould you please reply with the vehicle's VIN once it is available from the dealer so we can bind the coverage?\n\nBest regards,\nSarah\nBrightside Insurance",
        "sms": "Bob, working on your auto policy updates. Will have your quote by Friday morning. Please text me the VIN for the F-250 when you get it. Thanks, Sarah."
      }
    }
  },
  "real_estate": {
    "title": "Gachibowli 3BHK Search",
    "industry": "real_estate",
    "caller": "Rahul Reddy",
    "text": (
      "Rahul: Hello, I saw your listing for the 3BHK flat in Kondapur. " +
      "I am actually looking for something in Gachibowli or Financial District. " +
      "My budget is around 2.2 Crores, but it must be East-facing. My family is " +
      "very particular about Vastu compliance, especially the entrance. " +
      "We want to schedule a site visit this Sunday, but only if you have an East-facing " +
      "apartment available with a park view. We want to move in before Dussehra."
    ),
    "mock_result": {
      "summary": "Buyer Rahul Reddy is looking for an East-facing 3BHK apartment in Gachibowli or Financial District with a budget of ₹2.2 Crores. Vastu compliance (entrance) and park views are strict requirements. Target move-in is before Dussehra. Requested a site visit this Sunday.",
      "caller_name": "Rahul Reddy",
      "policy_type": "3BHK Residential (Buy)",
      "urgency": "high",
      "intent": "Property search / scheduling site visit",
      "objections": ["Strictly vastu-compliant (East-facing entry only)", "Must have park views"],
      "missing_info": ["Preferred timing for Sunday site visit", "Confirmation of exact configuration preferences"],
      "tasks": [
        {"title": "Filter matching East-facing 3BHK inventory in Gachibowli", "due": "Thursday", "priority": "high"},
        {"title": "Coordinate and book site visit for Rahul on Sunday", "due": "Sunday", "priority": "high"},
        {"title": "Send brochure of Gachibowli park-view projects to Rahul", "due": "Friday", "priority": "medium"}
      ],
      "follow_ups": {
        "whatsapp": "Hi Rahul, great speaking with you. I am filtering our East-facing, Vastu-compliant 3BHK inventory in Gachibowli that features park views. Let's block your Sunday morning for the site visits. Does 10:30 AM work for you? - Srinivas",
        "email": "Subject: East-facing 3BHK Options - Gachibowli / Financial District\n\nDear Rahul,\n\nIt was a pleasure speaking with you regarding your home search. I have identified three excellent Vastu-compliant, East-facing 3BHK apartments in Gachibowli that match your ₹2.2 Crore budget and include park views.\n\nI would love to schedule a tour of these projects this Sunday. Please let me know what time works best for you and your family.\n\nBest regards,\nSrinivas\nElite Realty",
        "sms": "Rahul, I have found 3 East-facing, Vastu-compliant 3BHKs in Gachibowli within your budget. Let's schedule tours this Sunday morning. Let me know what time works. Srinivas."
      }
    }
  },
  "clinic": {
    "title": "Thyroid Lab Follow-up",
    "industry": "clinic",
    "caller": "Meera Sharma",
    "text": (
      "Meera: Hi, I'm calling to check if my thyroid lab results are ready. " +
      "I had my blood work done on Tuesday. Dr. Prasad told me that we might " +
      "need to adjust my dosage if my TSH is still high, as I've been feeling " +
      "very fatigued. Can you send the report to my email? Also, I need to " +
      "book a follow-up appointment with Dr. Prasad sometime next week, " +
      "preferably in the evening after 5 PM."
    ),
    "mock_result": {
      "summary": "Patient Meera Sharma called to retrieve thyroid lab results from Tuesday. Reports fatigue symptoms. Dr. Prasad plans dosage adjustment based on TSH levels. Wants report emailed and a follow-up appointment booked next week after 5 PM.",
      "caller_name": "Meera Sharma",
      "policy_type": "Endocrinology / Follow-up",
      "urgency": "medium",
      "intent": "Lab results retrieval and follow-up booking",
      "objections": ["Experiencing persistent fatigue under current dosage"],
      "missing_info": ["Patient's email address confirmation", "Thyroid panel lab reports from lab desk"],
      "tasks": [
        {"title": "Retrieve Tuesday thyroid lab reports from lab desk", "due": "Today", "priority": "high"},
        {"title": "Email lab reports to Meera and flag to Dr. Prasad", "due": "Today", "priority": "high"},
        {"title": "Book follow-up appointment for next week after 5 PM", "due": "Friday", "priority": "medium"}
      ],
      "follow_ups": {
        "whatsapp": "Hi Meera, I am pulling your thyroid lab reports from the lab desk now. Once received, I will email them over and schedule your follow-up with Dr. Prasad next week after 5 PM. I will send options shortly. - Clinic Admin",
        "email": "Subject: Thyroid Lab Results & Follow-up Appointment - Meera Sharma\n\nDear Meera,\n\nI have requested your thyroid panel results from our laboratory. Once retrieved, I will email them directly to you and flag them to Dr. Prasad for review.\n\nFor your follow-up appointment next week, would Tuesday at 5:30 PM or Thursday at 6:00 PM work best for you?\n\nSincerely,\nAditi\nCare Diagnostics Clinic",
        "sms": "Meera, retrieving your Tuesday lab results. Will email them shortly. Can we book your follow-up with Dr. Prasad next Tuesday at 5:30 PM? Let me know. Aditi."
      }
    }
  },
  "coaching": {
    "title": "GRE Training Inquiry",
    "industry": "coaching",
    "caller": "Sandeep Kumar",
    "text": (
      "Sandeep: Hello, I want to inquire about the GRE classroom coaching. " +
      "I'm planning to take the exam in November. Do you provide study materials " +
      "and mock tests? Also, the fees seem a bit high for me. Do you offer " +
      "any discounts or installment options? I want to attend a demo class " +
      "this Saturday before registering. Can you send the schedule and fee details to WhatsApp?"
    ),
    "mock_result": {
      "summary": "Prospective student Sandeep Kumar inquired about GRE classroom coaching for a November exam. Asked about study materials, mock tests, fee discounts, and installment plans. Requested to attend a demo class this Saturday. Wants details sent to WhatsApp.",
      "caller_name": "Sandeep Kumar",
      "policy_type": "GRE Prep Course",
      "urgency": "medium",
      "intent": "Course inquiry and demo class registration",
      "objections": ["Course pricing is high; requested discount/installments"],
      "missing_info": ["Sandeep's academic background / diagnostic target score"],
      "tasks": [
        {"title": "Send GRE course details and fee structure via WhatsApp", "due": "Today", "priority": "high"},
        {"title": "Book Sandeep for the GRE Saturday morning demo class", "due": "Friday", "priority": "high"},
        {"title": "Consult manager on installment approval for Sandeep", "due": "Thursday", "priority": "medium"}
      ],
      "follow_ups": {
        "whatsapp": "Hi Sandeep, thank you for inquiring about our GRE Prep course. Here is the link to the Saturday demo class schedule (10 AM - 12 PM). I've reserved a seat for you. I will share the installment structure details below. - GRE Prep Academy",
        "email": "Subject: GRE Classroom Prep - Saturday Demo Class Invitation\n\nDear Sandeep,\n\nThank you for reaching out to us. Our classroom program includes 8 full-length mock tests and comprehensive study materials designed for the updated GRE syllabus.\n\nI have reserved a slot for you in our upcoming free Demo Class this Saturday at 10:00 AM. I have also attached our standard brochure and our flexible installment payment schedule for your review.\n\nBest regards,\nAnjali\nAcademy of Prep",
        "sms": "Sandeep, course brochure sent. I've booked your seat for the free GRE Demo Class this Saturday at 10 AM. Let me know if you need location details. Anjali."
      }
    }
  },
  "logistics": {
    "title": "Delayed Shipment Routing",
    "industry": "logistics",
    "caller": "Marcus Vance",
    "text": (
      "Marcus: Yes, this is Marcus from logistics. Shipment #45218 is stuck " +
      "at the Dallas hub. It was supposed to be delivered to our store today by 2 PM. " +
      "This delay is holding up our inventory shelves. What is the delay reason, " +
      "and when will it reach us? If it's not here by 9 AM tomorrow, we will have to " +
      "cancel the shipment and request a full refund. Let the dispatch manager know."
    ),
    "mock_result": {
      "summary": "Logistics coordinator Marcus Vance called regarding shipment #45218 stuck at the Dallas hub, missed today's 2 PM delivery deadline. Delays inventory scheduling. Requires reason and ETA. Threatens cancellation and refund if not delivered by 9 AM tomorrow. Dispatch manager notified.",
      "caller_name": "Marcus Vance",
      "policy_type": "Shipment #45218 (LTL Cargo)",
      "urgency": "high",
      "intent": "Delivery escalation and cancellation warning",
      "objections": ["Critical shipment delay; threatening refund/cancellation"],
      "missing_info": ["Hub status updates from the Dallas local supervisor"],
      "tasks": [
        {"title": "Escalate shipment #45218 to Dallas Hub supervisor for status check", "due": "Today", "priority": "high"},
        {"title": "Provide delay explanation and verified ETA to Marcus", "due": "Today", "priority": "high"},
        {"title": "Alert dispatch manager regarding Marcus's cancellation threat", "due": "Today", "priority": "high"}
      ],
      "follow_ups": {
        "whatsapp": "Marcus, dispatch manager is reviewing Shipment #45218. We are contacting the Dallas hub supervisor for an immediate update. We will provide the delay reason and a verified delivery window within 30 minutes. - Logistics Operations",
        "email": "Subject: URGENT: Delivery Escalation - Shipment #45218\n\nDear Marcus,\n\nI have escalated Shipment #45218 directly to our terminal manager at the Dallas hub. We are verifying the cause of the delay and securing priority routing to ensure it reaches you as early as possible.\n\nI will follow up by 4 PM with a confirmed delivery time for tomorrow morning.\n\nBest regards,\nOperations Desk\nTransitLogix",
        "sms": "Marcus, Shipment #45218 has been flagged to Dallas supervisor. We are confirming delivery timing for tomorrow morning and will call you by 4 PM. Operations."
      }
    }
  }
};

// ============================================================
//  PAGE ROUTES
// ============================================================

app.get('/', (req, res) => {
  res.render('upload.html');
});

app.get('/results/:callId', (req, res) => {
  res.render('results.html', { call_id: req.params.callId });
});

app.get('/history', (req, res) => {
  res.render('history.html');
});

// ============================================================
//  EXISTING API ROUTES
// ============================================================

app.get('/api/samples', (req, res) => {
  res.json(SAMPLE_TRANSCRIPTS);
});

app.post('/api/process', async (req, res) => {
  const data = req.body || {};
  const text = (data.text || "").trim();
  const industry = (data.industry || "general").toLowerCase();

  // AI Sim logic: If text matches a sample, return it. Otherwise, construct a custom result dynamically
  let matchedSample: any = null;
  for (const k of Object.keys(SAMPLE_TRANSCRIPTS)) {
    const sample = SAMPLE_TRANSCRIPTS[k];
    if (sample.text.substring(0, 30) === text.substring(0, 30) || text.substring(0, 30) === sample.text.substring(0, 30)) {
      matchedSample = sample;
      break;
    }
  }

  let result: any;
  if (matchedSample) {
    result = { ...matchedSample.mock_result };
  } else {
    // Create a dynamic mock output for custom text
    let namePlaceholder = "Customer";
    const words = text.split(/\s+/);
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      // Basic heuristic for capitalised names
      if (word.length > 2 && word[0] === word[0].toUpperCase() && !["Hello", "I'm", "This", "They", "What", "When", "Call", "Client", "We", "The"].includes(word)) {
        namePlaceholder = word;
        if (i + 1 < words.length && words[i + 1][0] === words[i + 1][0].toUpperCase() && !["I", "A", "To", "On"].includes(words[i + 1])) {
          namePlaceholder += ` ${words[i + 1]}`;
        }
        break;
      }
    }

    result = {
      "summary": `Custom call transcript processed for client in the ${industry} sector. The customer discussed account details and requested follow-up actions regarding their current service requirements.`,
      "caller_name": namePlaceholder,
      "policy_type": `General ${industry.charAt(0).toUpperCase() + industry.slice(1)} Account`,
      "urgency": (text.toLowerCase().includes("urgent") || text.toLowerCase().includes("emergency")) ? "high" : "medium",
      "intent": "Service inquiry and information update",
      "objections": [(text.toLowerCase().includes("cost") || text.toLowerCase().includes("price") || text.toLowerCase().includes("fee")) ? "Pricing concern" : "General review request"],
      "missing_info": ["Verification of account details"],
      "tasks": [
        { "title": `Follow up with ${namePlaceholder} regarding their custom query`, "due": "Friday", "priority": "high" },
        { "title": "Log call summary and details in client account", "due": "Tomorrow", "priority": "medium" }
      ],
      "follow_ups": {
        "whatsapp": `Hi ${namePlaceholder}, thank you for speaking with me today. I am following up on your request and will have updates for you shortly. - Ops Support`,
        "email": `Subject: Following up on our discussion - ${industry.charAt(0).toUpperCase() + industry.slice(1)} Services\n\nDear ${namePlaceholder},\n\nThank you for your time on the phone today.\n\nI am compiling the information you requested and will get back to you by tomorrow with the next steps.\n\nBest regards,\nCustomer Operations`,
        "sms": `Hi ${namePlaceholder}, thanks for your call. I am checking on the details we discussed and will follow up shortly. Ops Team.`
      }
    };
  }

  const callId = randomUUID();
  const processedRecord = {
    id: callId,
    title: matchedSample ? matchedSample.title : `Call with ${result.caller_name}`,
    industry: industry,
    caller: result.caller_name,
    timestamp: Date.now(),
    transcript: text,
    result: result
  };

  CALL_RECORDINGS.push(processedRecord);
  res.json(processedRecord);
});

// ============================================================
//  TWILIO: CHECK STATUS
// ============================================================

app.get('/api/twilio-status', (req, res) => {
  const configured = twilioClient !== null;
  res.json({
    configured: configured,
    phone_number: configured ? TWILIO_PHONE : null,
    whatsapp_number: configured ? TWILIO_WHATSAPP : null,
    base_url: BASE_URL
  });
});

// ============================================================
//  TWILIO: TEST INBOUND CALL (simulate someone calling you)
// ============================================================

app.post('/api/test-inbound', async (req, res) => {
  if (!twilioClient) {
    res.status(500).json({ success: false, error: "Twilio is not configured." });
    return;
  }

  try {
    const call = await twilioClient.calls.create({
      to: MY_MOBILE,
      from: TWILIO_PHONE,
      url: `${BASE_URL}/twilio/voice`,
      record: true,
      recordingStatusCallback: `${BASE_URL}/twilio/recording-status`,
      recordingStatusCallbackEvent: ['completed']
    });
    console.log(`[TEST] Simulated inbound call to your phone -- SID: ${call.sid}`);
    res.json({
      success: true,
      call_sid: call.sid,
      message: "Your phone will ring now! This simulates a customer calling your Twilio number."
    });
  } catch (error: any) {
    console.error(`[ERR] Test inbound failed:`, error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// ============================================================
//  TWILIO: SEND SMS
// ============================================================

app.post('/api/send-sms', async (req, res) => {
  if (!twilioClient) {
    res.status(500).json({ success: false, error: "Twilio is not configured. Add credentials to your .env file." });
    return;
  }
  if (!TWILIO_PHONE) {
    res.status(500).json({ success: false, error: "TWILIO_PHONE_NUMBER not set in .env" });
    return;
  }

  const data = req.body || {};
  const toNumber = (data.to || "").trim();
  const messageBody = (data.message || "").trim();

  if (!toNumber || !messageBody) {
    res.status(400).json({ success: false, error: "Both 'to' (phone number) and 'message' are required." });
    return;
  }

  try {
    const msg = await twilioClient.messages.create({
      body: messageBody,
      from: TWILIO_PHONE,
      to: toNumber
    });
    console.log(`[SMS] SMS sent to ${toNumber} — SID: ${msg.sid}`);
    res.json({ success: true, sid: msg.sid, status: msg.status });
  } catch (error: any) {
    console.error(`[ERR] SMS failed:`, error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// ============================================================
//  TWILIO: SEND WHATSAPP
// ============================================================

app.post('/api/send-whatsapp', async (req, res) => {
  if (!twilioClient) {
    res.status(500).json({ success: false, error: "Twilio is not configured. Add credentials to your .env file." });
    return;
  }

  const data = req.body || {};
  const toNumber = (data.to || "").trim();
  const messageBody = (data.message || "").trim();

  if (!toNumber || !messageBody) {
    res.status(400).json({ success: false, error: "Both 'to' (phone number) and 'message' are required." });
    return;
  }

  const whatsappTo = toNumber.startsWith("whatsapp:") ? toNumber : `whatsapp:${toNumber}`;
  const whatsappFrom = `whatsapp:${TWILIO_WHATSAPP}`;

  try {
    const msg = await twilioClient.messages.create({
      body: messageBody,
      from: whatsappFrom,
      to: whatsappTo
    });
    console.log(`[WA] WhatsApp sent to ${toNumber} — SID: ${msg.sid}`);
    res.json({ success: true, sid: msg.sid, status: msg.status });
  } catch (error: any) {
    console.error(`[ERR] WhatsApp failed:`, error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// ============================================================
//  TWILIO: OUTBOUND CALL (Click-to-Call Bridge)
// ============================================================

app.post('/api/make-call', async (req, res) => {
  if (!twilioClient) {
    res.status(500).json({ success: false, error: "Twilio is not configured." });
    return;
  }
  if (!TWILIO_PHONE) {
    res.status(500).json({ success: false, error: "TWILIO_PHONE_NUMBER not set in .env" });
    return;
  }
  if (!MY_MOBILE) {
    res.status(500).json({ success: false, error: "MY_MOBILE_NUMBER not set in .env" });
    return;
  }

  const data = req.body || {};
  const toNumber = (data.to || "").trim();

  if (!toNumber) {
    res.status(400).json({ success: false, error: "'to' (client phone number) is required." });
    return;
  }

  try {
    const call = await twilioClient.calls.create({
      to: MY_MOBILE,
      from: TWILIO_PHONE,
      url: `${BASE_URL}/twilio/outbound-connect?dial_to=${encodeURIComponent(toNumber)}`,
      record: true,
      recordingStatusCallback: `${BASE_URL}/twilio/recording-status`,
      recordingStatusCallbackEvent: ['completed'],
      statusCallback: `${BASE_URL}/twilio/call-status`,
      statusCallbackEvent: ['completed']
    });
    console.log(`[CALL] Outbound call initiated — calling your phone, then bridging to ${toNumber} — SID: ${call.sid}`);
    res.json({ success: true, call_sid: call.sid, status: call.status });
  } catch (error: any) {
    console.error(`[ERR] Outbound call failed:`, error);
    res.status(400).json({ success: false, error: error.message });
  }
});

app.post('/twilio/outbound-connect', (req, res) => {
  const dialTo = req.query.dial_to as string || '';
  const response = new twilio.twiml.VoiceResponse();
  response.say({ voice: 'Polly.Aditi' }, "Connecting your call now. Please wait.");
  
  const dial = response.dial({
    callerId: TWILIO_PHONE,
    record: 'record-from-answer-dual',
    recordingStatusCallback: `${BASE_URL}/twilio/recording-status`,
    recordingStatusCallbackEvent: ['completed']
  });
  dial.number(dialTo);

  res.type('text/xml');
  res.send(response.toString());
});

// ============================================================
//  TWILIO: INBOUND CALL HANDLER (Webhook)
// ============================================================

app.post('/twilio/voice', (req, res) => {
  const caller = req.body.From || "Unknown";
  console.log(`[IN] Inbound call from: ${caller}`);

  const response = new twilio.twiml.VoiceResponse();

  if (MY_MOBILE) {
    response.say({ voice: 'Polly.Aditi' }, "Thank you for calling. Please hold while we connect you.");
    const dial = response.dial({
      callerId: TWILIO_PHONE,
      record: 'record-from-answer-dual',
      recordingStatusCallback: `${BASE_URL}/twilio/recording-status`,
      recordingStatusCallbackEvent: ['completed'],
      timeout: 20
    });
    dial.number(MY_MOBILE);

    // If no answer, take voicemail
    response.say({ voice: 'Polly.Aditi' }, "We are unable to take your call right now. Please leave a message after the tone.");
    response.record({
      maxLength: 120,
      action: `${BASE_URL}/twilio/voicemail-complete`,
      recordingStatusCallback: `${BASE_URL}/twilio/recording-status`,
      recordingStatusCallbackEvent: ['completed'],
      transcribe: false
    });
    response.say({ voice: 'Polly.Aditi' }, "We did not receive a message. Goodbye.");
  } else {
    // Just take voicemail
    response.say({ voice: 'Polly.Aditi' }, "Thank you for calling. Please leave your name, number, and message after the tone.");
    response.record({
      maxLength: 120,
      action: `${BASE_URL}/twilio/voicemail-complete`,
      recordingStatusCallback: `${BASE_URL}/twilio/recording-status`,
      recordingStatusCallbackEvent: ['completed'],
      transcribe: false
    });
    response.say({ voice: 'Polly.Aditi' }, "We did not receive a message. Goodbye.");
  }

  res.type('text/xml');
  res.send(response.toString());
});

app.post('/twilio/voicemail-complete', (req, res) => {
  const response = new twilio.twiml.VoiceResponse();
  response.say({ voice: 'Polly.Aditi' }, "Thank you. Your message has been received. We will get back to you shortly. Goodbye.");
  response.hangup();
  
  res.type('text/xml');
  res.send(response.toString());
});

// ============================================================
//  TWILIO: RECORDING STATUS CALLBACK
// ============================================================

app.post('/twilio/recording-status', async (req, res) => {
  const recordingSid = req.body.RecordingSid || "";
  const recordingUrl = req.body.RecordingUrl || "";
  const callSid = req.body.CallSid || "";
  const duration = req.body.RecordingDuration || "0";
  const caller = req.body.From || "Unknown";
  const status = req.body.RecordingStatus || "";

  const record: CallRecording = {
    id: randomUUID(),
    recording_sid: recordingSid,
    call_sid: callSid,
    recording_url: recordingUrl ? `${recordingUrl}.mp3` : "",
    duration_seconds: parseInt(duration, 10),
    caller: caller,
    status: status,
    timestamp: Date.now()
  };
  CALL_RECORDINGS.push(record);

  console.log(`[REC] Recording ready — SID: ${recordingSid} | Duration: ${duration}s | From: ${caller}`);
  console.log(`   URL: ${recordingUrl}.mp3`);

  // Placeholder transcript (in production, you would transcribe audio)
  const transcript = "Caller said they need to review the recent project proposal. They want me to call them back next Tuesday to discuss the pricing.";
  record.transcript = transcript;

  // 1. Process the transcript with Gemini
  console.log(`[AI] Sending transcript to Gemini for analysis...`);
  const aiResult = await processCallTranscriptWithGemini(transcript, caller);
  record.result = aiResult;

  if (aiResult) {
    // 2. Prepare data for Google Sheets
    const today = new Date().toISOString().split('T')[0];
    const summary = aiResult.summary || "";
    const actionItems = aiResult.action_items || "";
    const followUpNeeded = aiResult.follow_up_needed || "No";
    const reminderDate = aiResult.reminder_date || "";
    const callerEmail = aiResult.caller_email || "";

    const rowData = [
      today,
      caller,
      summary,
      actionItems,
      followUpNeeded,
      reminderDate,
      followUpNeeded.toLowerCase() === "yes" ? "Pending" : "N/A",
      callerEmail
    ];

    // 3. Save to Google Sheets
    const SHEET_ID = "1GEP1JtBcybnpVfDmeEr58zEhKMM1CgvfQP15wgljBJs";
    await appendCallData(SHEET_ID, rowData);
  }

  res.json({ status: "received" });
});

// ============================================================
//  TWILIO: CALL STATUS CALLBACK
// ============================================================

app.post('/twilio/call-status', (req, res) => {
  const callSid = req.body.CallSid || "";
  const callStatus = req.body.CallStatus || "";
  const duration = req.body.CallDuration || "0";
  const caller = req.body.From || "Unknown";
  const called = req.body.To || "Unknown";

  console.log(`[STAT] Call ended — SID: ${callSid} | Status: ${callStatus} | Duration: ${duration}s | ${caller} → ${called}`);
  res.json({ status: "received" });
});

// ============================================================
//  API: LIST RECORDINGS
// ============================================================

app.get('/api/recordings', (req, res) => {
  res.json(CALL_RECORDINGS);
});

// ============================================================
//  RUN SERVER
// ============================================================

const server = app.listen(port, () => {
  console.log("\n" + "=".repeat(60));
  console.log("  COMMS AI — Server Starting");
  console.log("=".repeat(60));
  if (twilioClient) {
    console.log(`  [SMS] SMS From:      ${TWILIO_PHONE}`);
    console.log(`  [WA] WhatsApp From: whatsapp:${TWILIO_WHATSAPP}`);
    console.log(`  [CALL] Bridge To:     ${MY_MOBILE}`);
    console.log(`  [WEB] Webhook Base:  ${BASE_URL}`);
  } else {
    console.log("  [WARN] Twilio NOT configured — check .env credentials");
  }
  console.log("=".repeat(60) + "\n");

  // Start the background follow-up scheduler
  startScheduler();
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log("\nShutting down server...");
  server.close(() => {
    console.log("Server closed.");
    process.exit(0);
  });
});
