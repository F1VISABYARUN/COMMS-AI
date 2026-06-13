import { supabase } from './supabaseClient';

const PORT = process.env.PORT || 5000;
const API_URL = `http://127.0.0.1:${PORT}/api/process`;

const TEST_PAYLOADS = [
  {
    caller: "+1 (555) 019-2831",
    industry: "insurance",
    text: "Hello, this is John Miller calling. I want to check my health insurance policy coverage details. Can you confirm if dental cleanings are covered under my basic plan? Please email me the brochure at john.miller@testing.com. I need this urgently."
  },
  {
    caller: "+91 98765 43210",
    industry: "real_estate",
    text: "Hi support, my name is Sara Khan. I would like to schedule a walk-through for the 3-bedroom apartment on 5th Avenue next Monday. Please follow up and let me know the timing. My email is sara.khan@realestate.com."
  },
  {
    caller: "+15559876543",
    industry: "clinic",
    text: "Hey, this is Robert. I called to reschedule my doctor consultation for tomorrow morning. Please send a reminder. My email is robert.reschedule@clinic.com."
  }
];

async function sendRequest(payload: typeof TEST_PAYLOADS[0], index: number) {
  console.log(`[TEST-${index}] Dispatching parallel query for caller: ${payload.caller}...`);
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[TEST-${index}] [FAIL] Server returned status ${response.status}:`, errText);
      return { success: false, index };
    }

    const data = await response.json();
    console.log(`[TEST-${index}] [SUCCESS] Parsed successfully. Call ID: ${data.id}`);
    console.log(`    Caller Name:   ${data.result?.caller_name || 'N/A'}`);
    console.log(`    Urgency:       ${data.result?.urgency || 'N/A'}`);
    console.log(`    Reminder Date: ${data.result?.reminder_date || 'N/A'}`);
    
    // Check if inserted in Supabase
    const { data: dbRecord, error: dbErr } = await supabase
      .from('recordings')
      .select('id, caller, result')
      .eq('id', data.id)
      .maybeSingle();

    if (dbErr || !dbRecord) {
      console.error(`[TEST-${index}] [DB_FAIL] Recording was not found in Supabase!`, dbErr);
      return { success: false, index };
    }
    console.log(`[TEST-${index}] [DB_OK] Confirmed recording is stored in Supabase.`);
    return { success: true, index, id: data.id };
  } catch (err: any) {
    console.error(`[TEST-${index}] [ERR] Request exception occurred:`, err.message);
    return { success: false, index };
  }
}

async function runParallelTests() {
  console.log("=========================================");
  console.log(" STARTING CONCURRENT AGENT RUN LOOPS");
  console.log("=========================================\n");

  const start = Date.now();
  
  // Trigger requests concurrently using Promise.all
  const promises = TEST_PAYLOADS.map((payload, idx) => sendRequest(payload, idx + 1));
  const results = await Promise.all(promises);

  const duration = ((Date.now() - start) / 1000).toFixed(2);
  const successCount = results.filter(r => r.success).length;

  console.log("\n=========================================");
  console.log(" LOOPS COMPLETED");
  console.log(` Duration:    ${duration} seconds`);
  console.log(` Successes:   ${successCount} / ${TEST_PAYLOADS.length}`);
  console.log("=========================================\n");

  if (successCount === TEST_PAYLOADS.length) {
    console.log("[PASS] All parallel agents executed and saved states correctly!");
  } else {
    console.log("[FAIL] One or more parallel runs failed. Review console logs above.");
    process.exit(1);
  }
}

runParallelTests().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
