# Comms AI: Prioritized Remediation Plan

This code review and architectural audit report identifies robustness issues, edge cases, and structural flaws across the Comms AI codebase. The issues have been categorized by priority, with specific file locations, line numbers, and actionable code adjustments.

## Critical Priority

### 1. Silent Failure Fallback to Fake Mock Data
**Location:** `src/server.ts` (Lines 326-352)
**Issue:** If the Gemini AI audio processing fails, `processedRecord` remains null. Instead of alerting the user or returning an error, the code falls back to reading an empty string from `data.text` and generates fake, hardcoded mock data. This completely obscures real errors in production.
**Remediation:** Explicitly reject the request if the audio processing pipeline fails.
```typescript
// Add inside the if (data.audio) block (around line 350)
if (data.audio) {
  // ... existing try/catch logic ...
  if (!processedRecord) {
    return res.status(500).json({ success: false, error: "AI processing failed. Please try again." });
  }
}
```

### 2. Infinite Retry Loop on Dispatch Failure
**Location:** `src/followupProcessor.ts` (Lines 167-200)
**Issue:** In `checkAndSendFollowups()`, the code only marks a reminder as 'Completed' `if (smsSent || emailSent)`. If both Twilio and SMTP fail (e.g. invalid phone/email), the reminder stays 'Pending'. The 1-minute cron job will infinitely retry this same bad record, draining API rate limits and spamming logs.
**Remediation:** Transition the state even if the dispatch fails permanently to avoid infinite loops.
```typescript
// Modify line 168
if (smsSent || emailSent) {
  await markReminderCompleted(SHEET_ID, rowIndex);
  // ... existing Supabase sync ...
} else {
  console.warn(`[ERR] Both SMS and Email failed for row ${rowIndex}. Marking as completed to prevent infinite loop.`);
  await markReminderCompleted(SHEET_ID, rowIndex); // or create/use markReminderFailed
}
```

### 3. Unconditional Redirect on Save Failure (Data Loss)
**Location:** `static/js/main.js` (Lines 681-694)
**Issue:** The `save-approve-btn` executes a POST. If `!response.ok` or a network error occurs, it is logged, but the page unconditionally navigates away (`window.location.href = "/history"`), causing the user to lose all in-progress work without seeing an error alert.
**Remediation:** Halt navigation and alert the user if the request fails.
```javascript
if (!response.ok) {
    alert("Failed to save changes to the database.");
    saveBtn.innerHTML = originalHTML; 
    saveBtn.disabled = false;
    return; // Prevent redirect
}
```

## High Priority

### 4. Fragile Gemini JSON Extraction
**Location:** `src/geminiProcessor.ts` (Lines 146-154)
**Issue:** The markdown cleanup logic checks `text.endsWith("\`\`\`")`. If the model adds conversational text after the code block, the suffix check fails, backticks remain, and `JSON.parse(text)` throws a `SyntaxError`, causing the entire processing to fail.
**Remediation:** Use regex extraction to safely grab the JSON block regardless of surrounding text.
```typescript
// Replace lines 146-154 with regex extraction
const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
if (match) {
  text = match[1];
} else {
  if (text.startsWith("```json")) text = text.substring(7);
  else if (text.startsWith("```")) text = text.substring(3);
  if (text.endsWith("```")) text = text.substring(0, text.length - 3);
}
text = text.trim();
```

### 5. Dynamic Array Data Loss in UI
**Location:** `static/js/main.js` (Lines ~372-423)
**Issue:** When clicking `add-objection-btn` or `add-missing-btn`, an empty string is pushed to the array and `renderObjections()` is called immediately. `renderObjections()` resets `innerHTML`, destroying any un-saved text the user had just typed into the existing input fields.
**Remediation:** Sync the DOM state back to the array before re-rendering.
```javascript
document.getElementById("add-objection-btn")?.addEventListener("click", () => {
    res.objections = Array.from(document.querySelectorAll(".objection-item-input")).map(i => i.value.trim());
    res.objections.push("New concern");
    renderObjections();
});
```

## Medium Priority

### 6. Stat Tracking Mismatch
**Location:** `static/js/main.js` (Lines 50-51)
**Issue:** The frontend counts `urgentTasks` by summing individual high-priority tasks inside high-urgency calls. However, the backend dashboard stats measure "High Urgency Alerts" by counting the calls themselves. This leads to a desynchronized UI where the numbers don't match.
**Remediation:** Standardize the metric to count calls, matching the backend.
```javascript
// Replace task-filter mapping calculation
if (r.result && r.result.urgency === "high") { 
  urgentTasks++; 
}
```

### 7. Desynchronized KPI Stats Logic
**Location:** `static/js/main.js` (Line 41)
**Issue:** The `updateStats()` function only fetches local storage records. When `initHistoryPage()` merges local storage with server records, the KPI numbers are still computed using only local data.
**Remediation:** Refactor `updateStats` to accept the merged array instead of re-reading local storage.

## Low Priority

### 8. Dark Mode Configuration Mismatch
**Location:** `templates/layout.html` (Line 9) & `static/css/style.css`
**Issue:** Tailwind CSS is loaded via CDN without configuration. The application manually toggles a `.dark-mode` class on the `body`, but Tailwind expects OS-level media queries (`prefers-color-scheme`) by default. As a result, inline `dark:` utility classes are ignored, and the app falls back to brittle manual overrides.
**Remediation:** Configure Tailwind for class-based dark mode.
```html
<script src="https://cdn.tailwindcss.com"></script>
<script>
    tailwind.config = { darkMode: ['class', '.dark-mode'] }
</script>
```

### 9. Invalid Action Links
**Location:** `templates/history.html` (Lines 12, 83) & `templates/results.html` (Line 18)
**Issue:** The "New Call" and "Process Your First Call" buttons route to `/` (landing page) instead of `/process`. The "Cancel" button in `results.html` routes to `/` instead of `/history`.
**Remediation:** Update `href` attributes to point to the correct internal dashboard routes.

### 10. Mobile Sidebar Overflow
**Location:** `templates/layout.html` (Line 37)
**Issue:** The mobile sidebar (`#sidebar-panel`) lacks explicit absolute positioning coordinates. Since it uses `fixed`, it defaults to normal document flow, potentially causing overflow and z-index overlap bugs.
**Remediation:** Add `inset-y-0 left-0 top-[53px]` to the sidebar classes.
