import os
import uuid
import time
import json
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
import threading
from gemini_processor import process_call_transcript_with_gemini
from google_sheets_manager import append_call_data
from followup_processor import start_scheduler
import datetime

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)

# --- Twilio Configuration ---
TWILIO_SID = os.getenv("TWILIO_ACCOUNT_SID")
TWILIO_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
TWILIO_PHONE = os.getenv("TWILIO_PHONE_NUMBER")
TWILIO_WHATSAPP = os.getenv("TWILIO_WHATSAPP_NUMBER", "+14155238886")
MY_MOBILE = os.getenv("MY_MOBILE_NUMBER")
BASE_URL = os.getenv("BASE_URL", "http://localhost:5000")

twilio_client = None
try:
    from twilio.rest import Client
    from twilio.twiml.voice_response import VoiceResponse, Dial
    if TWILIO_SID and TWILIO_TOKEN:
        twilio_client = Client(TWILIO_SID, TWILIO_TOKEN)
        print(f"[OK] Twilio client initialized (SID: {TWILIO_SID[:8]}...)")
    else:
        print("[WARN]  Twilio credentials not found in .env — messaging & calling disabled")
except ImportError:
    print("[WARN]  Twilio package not installed — run: pip install twilio")

# --- In-memory store for call recordings (production: use a database) ---
CALL_RECORDINGS = []

# Sample Data to make the demo work out of the box
SAMPLE_TRANSCRIPTS = {
    "insurance": {
        "title": "Auto & Property Coverage Update",
        "industry": "insurance",
        "caller": "Bob Henderson",
        "text": (
            "Bob: Hey Sarah, I need to add my new delivery truck to my commercial policy. "
            "It's a 2024 Ford F-250. Also, we sold the old warehouse on 5th Street last week, "
            "so we need to remove that property from our coverage. I'm a bit concerned the "
            "rate is going to spike. Can you email me the updated quote by Friday morning? "
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
            "Rahul: Hello, I saw your listing for the 3BHK flat in Kondapur. "
            "I am actually looking for something in Gachibowli or Financial District. "
            "My budget is around 2.2 Crores, but it must be East-facing. My family is "
            "very particular about Vastu compliance, especially the entrance. "
            "We want to schedule a site visit this Sunday, but only if you have an East-facing "
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
            "Meera: Hi, I'm calling to check if my thyroid lab results are ready. "
            "I had my blood work done on Tuesday. Dr. Prasad told me that we might "
            "need to adjust my dosage if my TSH is still high, as I've been feeling "
            "very fatigued. Can you send the report to my email? Also, I need to "
            "book a follow-up appointment with Dr. Prasad sometime next week, "
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
            "Sandeep: Hello, I want to inquire about the GRE classroom coaching. "
            "I'm planning to take the exam in November. Do you provide study materials "
            "and mock tests? Also, the fees seem a bit high for me. Do you offer "
            "any discounts or installment options? I want to attend a demo class "
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
            "Marcus: Yes, this is Marcus from logistics. Shipment #45218 is stuck "
            "at the Dallas hub. It was supposed to be delivered to our store today by 2 PM. "
            "This delay is holding up our inventory shelves. What is the delay reason, "
            "and when will it reach us? If it's not here by 9 AM tomorrow, we will have to "
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
}

# ============================================================
#  PAGE ROUTES
# ============================================================

@app.route('/')
def index():
    return render_template('upload.html')

@app.route('/results/<call_id>')
def results(call_id):
    return render_template('results.html', call_id=call_id)

@app.route('/history')
def history():
    return render_template('history.html')

# ============================================================
#  EXISTING API ROUTES
# ============================================================

@app.route('/api/samples')
def get_samples():
    return jsonify(SAMPLE_TRANSCRIPTS)

@app.route('/api/process', methods=['POST'])
def process_call():
    data = request.get_json() or {}
    text = data.get("text", "").strip()
    industry = data.get("industry", "general").lower()
    
    # AI Sim logic: If text matches a sample, return it. Otherwise, construct a custom result dynamically
    matched_sample = None
    for k, v in SAMPLE_TRANSCRIPTS.items():
        # Simple match check
        if v["text"][:30] in text or text[:30] in v["text"]:
            matched_sample = v
            break
            
    if matched_sample:
        result = matched_sample["mock_result"].copy()
    else:
        # Create a dynamic mock output for a custom text
        name_placeholder = "Customer"
        # Quick heuristic to find potential names in pasted text
        words = text.split()
        for i, word in enumerate(words):
            if word.istitle() and len(word) > 2 and word not in ["Hello", "I'm", "This", "They", "What", "When", "Call", "Client", "We", "The"]:
                name_placeholder = word
                if i + 1 < len(words) and words[i+1].istitle() and words[i+1] not in ["I", "A", "To", "On"]:
                    name_placeholder += f" {words[i+1]}"
                break
                
        result = {
            "summary": f"Custom call transcript processed for client in the {industry} sector. The customer discussed account details and requested follow-up actions regarding their current service requirements.",
            "caller_name": name_placeholder,
            "policy_type": f"General {industry.capitalize()} Account",
            "urgency": "medium" if "urgent" not in text.lower() and "emergency" not in text.lower() else "high",
            "intent": "Service inquiry and information update",
            "objections": ["Pricing concern" if "cost" in text.lower() or "price" in text.lower() or "fee" in text.lower() else "General review request"],
            "missing_info": ["Verification of account details"],
            "tasks": [
                {"title": f"Follow up with {name_placeholder} regarding their custom query", "due": "Friday", "priority": "high"},
                {"title": "Log call summary and details in client account", "due": "Tomorrow", "priority": "medium"}
            ],
            "follow_ups": {
                "whatsapp": f"Hi {name_placeholder}, thank you for speaking with me today. I am following up on your request and will have updates for you shortly. - Ops Support",
                "email": f"Subject: Following up on our discussion - {industry.capitalize()} Services\n\nDear {name_placeholder},\n\nThank you for your time on the phone today.\n\nI am compiling the information you requested and will get back to you by tomorrow with the next steps.\n\nBest regards,\nCustomer Operations",
                "sms": f"Hi {name_placeholder}, thanks for your call. I am checking on the details we discussed and will follow up shortly. Ops Team."
            }
        }

    # Add transaction metadata
    call_id = str(uuid.uuid4())
    processed_record = {
        "id": call_id,
        "title": matched_sample["title"] if matched_sample else f"Call with {result['caller_name']}",
        "industry": industry,
        "caller": result["caller_name"],
        "timestamp": int(time.time() * 1000),
        "transcript": text,
        "result": result
    }
    
    return jsonify(processed_record)

# ============================================================
#  TWILIO: CHECK STATUS
# ============================================================

@app.route('/api/twilio-status')
def twilio_status():
    """Check if Twilio is properly configured."""
    configured = twilio_client is not None
    return jsonify({
        "configured": configured,
        "phone_number": TWILIO_PHONE if configured else None,
        "whatsapp_number": TWILIO_WHATSAPP if configured else None,
        "base_url": BASE_URL
    })

# ============================================================
#  TWILIO: TEST INBOUND CALL (simulate someone calling you)
# ============================================================

@app.route('/api/test-inbound', methods=['POST'])
def test_inbound():
    """
    Simulates an inbound call by making Twilio call YOUR phone
    using the same /twilio/voice webhook. This way you can test
    the full inbound flow without making an international call.
    """
    if not twilio_client:
        return jsonify({"success": False, "error": "Twilio is not configured."}), 500

    try:
        call = twilio_client.calls.create(
            to=MY_MOBILE,
            from_=TWILIO_PHONE,
            url=f"{BASE_URL}/twilio/voice",
            record=True,
            recording_status_callback=f"{BASE_URL}/twilio/recording-status",
            recording_status_callback_event=["completed"]
        )
        print(f"[TEST] Simulated inbound call to your phone -- SID: {call.sid}")
        return jsonify({"success": True, "call_sid": call.sid, "message": "Your phone will ring now! This simulates a customer calling your Twilio number."})
    except Exception as e:
        print(f"[ERR] Test inbound failed: {e}")
        return jsonify({"success": False, "error": str(e)}), 400

# ============================================================
#  TWILIO: SEND SMS
# ============================================================

@app.route('/api/send-sms', methods=['POST'])
def send_sms():
    """Send an SMS message to a phone number."""
    if not twilio_client:
        return jsonify({"success": False, "error": "Twilio is not configured. Add credentials to your .env file."}), 500
    if not TWILIO_PHONE:
        return jsonify({"success": False, "error": "TWILIO_PHONE_NUMBER not set in .env"}), 500

    data = request.get_json() or {}
    to_number = data.get("to", "").strip()
    message_body = data.get("message", "").strip()

    if not to_number or not message_body:
        return jsonify({"success": False, "error": "Both 'to' (phone number) and 'message' are required."}), 400

    try:
        msg = twilio_client.messages.create(
            body=message_body,
            from_=TWILIO_PHONE,
            to=to_number
        )
        print(f"[SMS] SMS sent to {to_number} — SID: {msg.sid}")
        return jsonify({"success": True, "sid": msg.sid, "status": msg.status})
    except Exception as e:
        print(f"[ERR] SMS failed: {e}")
        return jsonify({"success": False, "error": str(e)}), 400

# ============================================================
#  TWILIO: SEND WHATSAPP
# ============================================================

@app.route('/api/send-whatsapp', methods=['POST'])
def send_whatsapp():
    """Send a WhatsApp message via Twilio Sandbox."""
    if not twilio_client:
        return jsonify({"success": False, "error": "Twilio is not configured. Add credentials to your .env file."}), 500

    data = request.get_json() or {}
    to_number = data.get("to", "").strip()
    message_body = data.get("message", "").strip()

    if not to_number or not message_body:
        return jsonify({"success": False, "error": "Both 'to' (phone number) and 'message' are required."}), 400

    # WhatsApp numbers must be prefixed with 'whatsapp:'
    whatsapp_to = f"whatsapp:{to_number}" if not to_number.startswith("whatsapp:") else to_number
    whatsapp_from = f"whatsapp:{TWILIO_WHATSAPP}"

    try:
        msg = twilio_client.messages.create(
            body=message_body,
            from_=whatsapp_from,
            to=whatsapp_to
        )
        print(f"[WA] WhatsApp sent to {to_number} — SID: {msg.sid}")
        return jsonify({"success": True, "sid": msg.sid, "status": msg.status})
    except Exception as e:
        print(f"[ERR] WhatsApp failed: {e}")
        return jsonify({"success": False, "error": str(e)}), 400

# ============================================================
#  TWILIO: OUTBOUND CALL (Click-to-Call Bridge)
# ============================================================

@app.route('/api/make-call', methods=['POST'])
def make_call():
    """
    Outbound click-to-call: 
    1. Twilio calls YOUR mobile phone first.
    2. When you pick up, Twilio dials the client/student.
    3. Both sides are connected and recorded.
    """
    if not twilio_client:
        return jsonify({"success": False, "error": "Twilio is not configured."}), 500
    if not TWILIO_PHONE:
        return jsonify({"success": False, "error": "TWILIO_PHONE_NUMBER not set in .env"}), 500
    if not MY_MOBILE:
        return jsonify({"success": False, "error": "MY_MOBILE_NUMBER not set in .env"}), 500

    data = request.get_json() or {}
    to_number = data.get("to", "").strip()

    if not to_number:
        return jsonify({"success": False, "error": "'to' (client phone number) is required."}), 400

    try:
        # Step 1: Twilio calls YOUR phone.
        # Step 2: When you answer, the TwiML at /twilio/outbound-connect dials the client.
        call = twilio_client.calls.create(
            to=MY_MOBILE,
            from_=TWILIO_PHONE,
            url=f"{BASE_URL}/twilio/outbound-connect?dial_to={to_number}",
            record=True,
            recording_status_callback=f"{BASE_URL}/twilio/recording-status",
            recording_status_callback_event=["completed"],
            status_callback=f"{BASE_URL}/twilio/call-status",
            status_callback_event=["completed"]
        )
        print(f"[CALL] Outbound call initiated — calling your phone, then bridging to {to_number} — SID: {call.sid}")
        return jsonify({"success": True, "call_sid": call.sid, "status": call.status})
    except Exception as e:
        print(f"[ERR] Outbound call failed: {e}")
        return jsonify({"success": False, "error": str(e)}), 400

@app.route('/twilio/outbound-connect', methods=['POST'])
def outbound_connect():
    """
    TwiML handler: When the owner answers their phone, 
    this tells Twilio to dial the client and bridge both calls.
    """
    dial_to = request.args.get("dial_to", "")
    response = VoiceResponse()
    response.say("Connecting your call now. Please wait.", voice="Polly.Aditi")
    dial = Dial(
        caller_id=TWILIO_PHONE,
        record="record-from-answer-dual",
        recording_status_callback=f"{BASE_URL}/twilio/recording-status",
        recording_status_callback_event="completed"
    )
    dial.number(dial_to)
    response.append(dial)
    return str(response), 200, {'Content-Type': 'text/xml'}

# ============================================================
#  TWILIO: INBOUND CALL HANDLER (Webhook)
# ============================================================

@app.route('/twilio/voice', methods=['POST'])
def inbound_voice():
    """
    Webhook: Twilio calls this URL when someone dials your Twilio number.
    
    Behavior:
    - Plays a greeting message.
    - Records the caller's message (voicemail style).
    - OR forwards the call to your mobile (live pickup).
    
    Configure this URL in your Twilio Console:
    Phone Number > Configure > "A Call Comes In" > Webhook > POST > https://your-ngrok-url/twilio/voice
    """
    caller = request.form.get("From", "Unknown")
    print(f"[IN] Inbound call from: {caller}")

    response = VoiceResponse()

    # Option A: Forward to your mobile + record
    if MY_MOBILE:
        response.say(
            "Thank you for calling. Please hold while we connect you.",
            voice="Polly.Aditi"
        )
        dial = Dial(
            caller_id=TWILIO_PHONE,
            record="record-from-answer-dual",
            recording_status_callback=f"{BASE_URL}/twilio/recording-status",
            recording_status_callback_event="completed",
            timeout=20  # Ring for 20 seconds, then go to voicemail
        )
        dial.number(MY_MOBILE)
        response.append(dial)

        # If no answer (timeout), take a voicemail
        response.say(
            "We are unable to take your call right now. Please leave a message after the tone.",
            voice="Polly.Aditi"
        )
        response.record(
            max_length=120,
            action=f"{BASE_URL}/twilio/voicemail-complete",
            recording_status_callback=f"{BASE_URL}/twilio/recording-status",
            recording_status_callback_event="completed",
            transcribe=False
        )
        response.say("We did not receive a message. Goodbye.", voice="Polly.Aditi")
    else:
        # No mobile configured — just take voicemail
        response.say(
            "Thank you for calling. Please leave your name, number, and message after the tone.",
            voice="Polly.Aditi"
        )
        response.record(
            max_length=120,
            action=f"{BASE_URL}/twilio/voicemail-complete",
            recording_status_callback=f"{BASE_URL}/twilio/recording-status",
            recording_status_callback_event="completed",
            transcribe=False
        )
        response.say("We did not receive a message. Goodbye.", voice="Polly.Aditi")

    return str(response), 200, {'Content-Type': 'text/xml'}

@app.route('/twilio/voicemail-complete', methods=['POST'])
def voicemail_complete():
    """Called after a voicemail recording finishes."""
    response = VoiceResponse()
    response.say("Thank you. Your message has been received. We will get back to you shortly. Goodbye.", voice="Polly.Aditi")
    response.hangup()
    return str(response), 200, {'Content-Type': 'text/xml'}

# ============================================================
#  TWILIO: RECORDING STATUS CALLBACK
# ============================================================

@app.route('/twilio/recording-status', methods=['POST'])
def recording_status():
    """
    Twilio sends this webhook when a call recording is ready.
    We store the recording URL and metadata for later AI processing.
    """
    recording_sid = request.form.get("RecordingSid", "")
    recording_url = request.form.get("RecordingUrl", "")
    call_sid = request.form.get("CallSid", "")
    duration = request.form.get("RecordingDuration", "0")
    caller = request.form.get("From", "Unknown")
    status = request.form.get("RecordingStatus", "")

    record = {
        "id": str(uuid.uuid4()),
        "recording_sid": recording_sid,
        "call_sid": call_sid,
        "recording_url": f"{recording_url}.mp3" if recording_url else "",
        "duration_seconds": int(duration),
        "caller": caller,
        "status": status,
        "timestamp": int(time.time() * 1000)
    }
    CALL_RECORDINGS.append(record)

    print(f"[REC]  Recording ready — SID: {recording_sid} | Duration: {duration}s | From: {caller}")
    print(f"   URL: {recording_url}.mp3")
    
    # In a production environment without Twilio Voice Intelligence, you would download the .mp3 here
    # and pass it to a Speech-to-Text API. For this integration demo, we use a placeholder transcript
    # or you could pass the raw audio URL to Gemini 1.5 Pro if it supports it.
    
    # We will simulate a transcript being generated from the call:
    transcript = f"Caller said they need to review the recent project proposal. They want me to call them back next Tuesday to discuss the pricing."
    
    # 1. Process the transcript with Gemini
    print(f"[AI] Sending transcript to Gemini for analysis...")
    ai_result = process_call_transcript_with_gemini(transcript, caller)
    
    if ai_result:
        # 2. Prepare data for Google Sheets
        today = datetime.datetime.now().strftime("%Y-%m-%d")
        summary = ai_result.get("summary", "")
        action_items = ai_result.get("action_items", "")
        follow_up_needed = ai_result.get("follow_up_needed", "No")
        reminder_date = ai_result.get("reminder_date", "")
        
        row_data = [
            today,
            caller,
            summary,
            action_items,
            follow_up_needed,
            reminder_date,
            "Pending" if follow_up_needed.lower() == "yes" else "N/A"
        ]
        
        # 3. Save to Google Sheets
        # The SHEET_ID is hardcoded in google_sheets_manager, or we can pass it here
        SHEET_ID = "1GEP1JtBcybnpVfDmeEr58zEhKMM1CgvfQP15wgljBJs"
        append_call_data(SHEET_ID, row_data)

    return jsonify({"status": "received"}), 200

# ============================================================
#  TWILIO: CALL STATUS CALLBACK
# ============================================================

@app.route('/twilio/call-status', methods=['POST'])
def call_status():
    """Twilio sends this when a call ends. Logs the final status."""
    call_sid = request.form.get("CallSid", "")
    call_status = request.form.get("CallStatus", "")
    duration = request.form.get("CallDuration", "0")
    caller = request.form.get("From", "Unknown")
    called = request.form.get("To", "Unknown")

    print(f"[STAT] Call ended — SID: {call_sid} | Status: {call_status} | Duration: {duration}s | {caller} → {called}")
    return jsonify({"status": "received"}), 200

# ============================================================
#  API: LIST RECORDINGS
# ============================================================

@app.route('/api/recordings')
def list_recordings():
    """Return all stored call recordings."""
    return jsonify(CALL_RECORDINGS)

# ============================================================
#  RUN SERVER
# ============================================================

if __name__ == '__main__':
    print("\n" + "=" * 60)
    print("  COMMS AI — Server Starting")
    print("=" * 60)
    if twilio_client:
        print(f"  [SMS] SMS From:      {TWILIO_PHONE}")
        print(f"  [WA] WhatsApp From: whatsapp:{TWILIO_WHATSAPP}")
        print(f"  [CALL] Bridge To:     {MY_MOBILE}")
        print(f"  [WEB] Webhook Base:  {BASE_URL}")
    else:
        print("  [WARN]  Twilio NOT configured — copy .env.example to .env and fill in credentials")
    print("=" * 60 + "\n")
    
    # Start the background follow-up scheduler
    scheduler = start_scheduler()
    
    # Running local server
    try:
        app.run(host='127.0.0.1', port=5000, debug=False, use_reloader=False)
    finally:
        scheduler.shutdown()
