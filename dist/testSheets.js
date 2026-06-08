"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const googleSheetsManager_1 = require("./googleSheetsManager");
const SHEET_ID = "1GEP1JtBcybnpVfDmeEr58zEhKMM1CgvfQP15wgljBJs";
const today = new Date().toISOString().split('T')[0];
const testData = [today, "+15551234567", "Test connection call from TS AI", "None", "No", "", "Completed"];
async function main() {
    console.log(`Testing append to sheet ${SHEET_ID}...`);
    const success = await (0, googleSheetsManager_1.appendCallData)(SHEET_ID, testData);
    if (success) {
        console.log("Test passed! Row appended successfully.");
    }
    else {
        console.log("Test failed. Check credentials and sharing permissions.");
    }
}
main().catch(err => {
    console.error("Unhandle rejection in testSheets:", err);
});
