"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const supabaseClient_1 = require("./supabaseClient");
async function main() {
    console.log("=========================================");
    console.log(" AUDITING LATEST RECORDINGS FROM DATABASE");
    console.log("=========================================\n");
    const { data, error } = await supabaseClient_1.supabase
        .from('recordings')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(10);
    if (error) {
        console.error("[ERR] Failed to retrieve recordings:", error);
        return;
    }
    if (!data || data.length === 0) {
        console.log("No recordings found in the database.");
        return;
    }
    console.log(`Found ${data.length} recordings. Reviewing the last 10 entries:\n`);
    data.forEach((rec, idx) => {
        console.log(`[#${idx + 1}] ID: ${rec.id}`);
        console.log(`    Date:      ${new Date(rec.timestamp).toISOString()}`);
        console.log(`    Caller:    ${rec.caller}`);
        console.log(`    Title:     ${rec.title}`);
        console.log(`    Industry:  ${rec.industry}`);
        console.log(`    Source:    ${rec.source}`);
        if (rec.result) {
            const res = rec.result;
            console.log(`    AI Result Extracted:`);
            console.log(`      • Urgency:           ${res.urgency}`);
            console.log(`      • Policy/Service:    ${res.policy_type}`);
            console.log(`      • Intent:            ${res.intent}`);
            console.log(`      • Follow Up Needed:  ${res.follow_up_needed}`);
            console.log(`      • Reminder Date:     ${res.reminder_date || 'None'}`);
            console.log(`      • Follow Up Status:  ${res.follow_up_status || 'None'}`);
            console.log(`      • Email:             ${res.caller_email || 'None'}`);
            console.log(`      • Summary:           ${res.summary}`);
            console.log(`      • Action Items:      ${res.action_items || 'None'}`);
            console.log(`      • Tasks Count:       ${res.tasks ? res.tasks.length : 0}`);
            if (res.tasks && res.tasks.length > 0) {
                res.tasks.forEach((t, tid) => {
                    console.log(`        - Task ${tid + 1}: [${t.priority}] ${t.title} (Due: ${t.due})`);
                });
            }
        }
        else {
            console.log(`    [WARN] No parsed result object found for this call record.`);
        }
        console.log("-----------------------------------------");
    });
}
main().catch(err => {
    console.error("Audit script failed:", err);
});
