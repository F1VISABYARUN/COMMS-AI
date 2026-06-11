// Comms AI — Frontend Logic

document.addEventListener("DOMContentLoaded", () => {

    // ---- LOCAL STORAGE STATE ----
    const getRecords = () => JSON.parse(localStorage.getItem("commsai_records")) || [];
    const saveRecords = (records) => localStorage.setItem("commsai_records", JSON.stringify(records));

    const fetchServerRecordings = async () => {
        try {
            const res = await fetch('/api/recordings');
            if (!res.ok) return [];
            const data = await res.json();
            // Normalize server records to match the dashboard format
            return data.filter(r => r.result).map(r => ({
                id: r.id,
                title: r.title || `Call from ${r.caller}`,
                industry: r.industry || 'general',
                caller: r.result?.caller_name || r.caller || 'Unknown',
                timestamp: r.timestamp,
                transcript: r.transcript || '',
                recording_url: r.recording_url || '',
                duration_seconds: r.duration_seconds || 0,
                source: 'twilio',
                result: r.result
            }));
        } catch (e) {
            console.warn('Could not fetch server recordings:', e);
            return [];
        }
    };

    const loadAllUnifiedRecords = async () => {
        const serverRecords = await fetchServerRecordings();
        const localRecords = getRecords();
        const localIds = new Set(localRecords.map(r => r.id));
        const uniqueServerRecords = serverRecords.filter(r => !localIds.has(r.id));
        return [...localRecords, ...uniqueServerRecords].sort((a, b) => b.timestamp - a.timestamp);
    };

    const updateStats = (recordsArray) => {
        const records = recordsArray || getRecords();
        const el = (id) => document.getElementById(id);
        if (!el("stat-total-calls")) return;

        let totalTasks = 0, urgentTasks = 0;
        records.forEach(r => {
            if (r.result && r.result.tasks) {
                totalTasks += r.result.tasks.length;
            }
            if (r.result && r.result.urgency === "high") { 
                urgentTasks++; 
            }
        });

        el("stat-total-calls").textContent = records.length;
        el("stat-urgent-tasks").textContent = urgentTasks;
        el("stat-total-tasks").textContent = totalTasks;
    };

    const formatTimestamp = (ts) => {
        return new Date(ts).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    };

    // ---- SCREEN 1: UPLOAD PAGE ----
    const initUploadPage = () => {
        const textInput = document.getElementById("transcript-input");
        const processBtn = document.getElementById("process-btn");
        const industryButtons = document.querySelectorAll(".industry-btn");
        const sampleButtons = document.querySelectorAll(".sample-preset-btn");
        const audioInput = document.getElementById("audio-file");

        let selectedIndustry = "insurance";
        let selectedAudioFile = null;
        if (!textInput || !processBtn) return;

        const setIndustryActive = (industry) => {
            selectedIndustry = industry;
            industryButtons.forEach(btn => {
                const ind = btn.getAttribute("data-industry");
                if (ind === industry) {
                    btn.classList.add("active");
                } else {
                    btn.classList.remove("active");
                }
            });
        };

        setIndustryActive(selectedIndustry);

        industryButtons.forEach(btn => {
            btn.addEventListener("click", () => {
                setIndustryActive(btn.getAttribute("data-industry"));
            });
        });

        // Load demo presets
        sampleButtons.forEach(btn => {
            btn.addEventListener("click", async () => {
                selectedAudioFile = null;
                textInput.disabled = false;
                const sampleKey = btn.getAttribute("data-sample");
                try {
                    const res = await fetch("/api/samples");
                    const samples = await res.json();
                    const target = samples[sampleKey];
                    if (target) {
                        textInput.value = target.text;
                        setIndustryActive(target.industry);
                        textInput.focus();
                        // Brief highlight
                        textInput.style.borderColor = "#7c3aed";
                        textInput.style.boxShadow = "0 0 0 3px rgba(124,58,237,0.08)";
                        setTimeout(() => {
                            textInput.style.borderColor = "";
                            textInput.style.boxShadow = "";
                        }, 500);
                    }
                } catch (e) {
                    console.error("Failed to load samples", e);
                }
            });
        });

        // Processing animation for text
        const runProcessing = async (text, industry) => {
            const loader = document.getElementById("processing-loader");
            const statusLabel = document.getElementById("loader-status");
            if (!loader || !statusLabel) return;

            loader.classList.remove("hidden");
            loader.classList.add("flex");

            const steps = [
                "Parsing conversation structure...",
                "Identifying speakers and entities...",
                "Extracting intent and urgency...",
                "Generating action items...",
                "Composing follow-up drafts..."
            ];

            for (const step of steps) {
                statusLabel.textContent = step;
                await new Promise(r => setTimeout(r, 500));
            }

            try {
                const response = await fetch("/api/process", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ text, industry })
                });

                if (response.ok) {
                    const newCall = await response.json();
                    const records = getRecords();
                    records.unshift(newCall);
                    saveRecords(records);
                    window.location.href = `/results/${newCall.id}`;
                }
            } catch (err) {
                console.error("Processing failed", err);
                loader.classList.add("hidden");
                loader.classList.remove("flex");
                alert("Processing failed. Please try again.");
            }
        };

        // Processing animation for audio
        const runAudioProcessing = async (file, industry) => {
            const loader = document.getElementById("processing-loader");
            const statusLabel = document.getElementById("loader-status");
            if (!loader || !statusLabel) return;

            loader.classList.remove("hidden");
            loader.classList.add("flex");

            statusLabel.textContent = "Reading audio file...";
            
            // Read file as base64
            const reader = new FileReader();
            reader.onload = async () => {
                const base64Data = reader.result.split(',')[1];
                
                const steps = [
                    "Uploading audio stream...",
                    "Gemini processing audio...",
                    "Transcribing conversation...",
                    "Extracting actions and intent...",
                    "Generating follow-up draft..."
                ];

                for (const step of steps) {
                    statusLabel.textContent = step;
                    await new Promise(r => setTimeout(r, 600));
                }

                try {
                    const response = await fetch("/api/process", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ 
                            audio: base64Data, 
                            fileName: file.name,
                            mimeType: file.type,
                            industry 
                        })
                    });

                    if (response.ok) {
                        const newCall = await response.json();
                        const records = getRecords();
                        records.unshift(newCall);
                        saveRecords(records);
                        window.location.href = `/results/${newCall.id}`;
                    } else {
                        const errData = await response.json();
                        alert("Processing failed: " + (errData.error || "Unknown server error"));
                        loader.classList.add("hidden");
                        loader.classList.remove("flex");
                    }
                } catch (err) {
                    console.error("Audio processing failed", err);
                    loader.classList.add("hidden");
                    loader.classList.remove("flex");
                    alert("Processing failed. Please try again.");
                }
            };

            reader.onerror = () => {
                alert("Failed to read audio file.");
                loader.classList.add("hidden");
                loader.classList.remove("flex");
            };

            reader.readAsDataURL(file);
        };

        // File upload event
        if (audioInput) {
            audioInput.addEventListener("change", () => {
                if (audioInput.files && audioInput.files[0]) {
                    selectedAudioFile = audioInput.files[0];
                    textInput.value = `[Uploaded audio: ${selectedAudioFile.name}]\n\nReady to process audio file...`;
                    textInput.disabled = true;
                }
            });
        }

        // Text area input change
        textInput.addEventListener("input", () => {
            if (textInput.value === "") {
                selectedAudioFile = null;
                textInput.disabled = false;
            }
        });

        // Click Process
        processBtn.addEventListener("click", () => {
            if (selectedAudioFile) {
                runAudioProcessing(selectedAudioFile, selectedIndustry);
            } else {
                const transcript = textInput.value.trim();
                if (!transcript) {
                    alert("Please paste a transcript or select a demo preset first.");
                    return;
                }
                runProcessing(transcript, selectedIndustry);
            }
        });
    };

    // ---- SCREEN 2: RESULTS PAGE ----
    const initResultsPage = async () => {
        if (typeof window.CURRENT_CALL_ID === 'undefined') return;

        const callId = window.CURRENT_CALL_ID;
        let call = null;

        try {
            const response = await fetch(`/api/recordings/${callId}`);
            if (response.ok) {
                call = await response.json();
            }
        } catch (e) {
            console.warn("Could not fetch recording from server, trying local storage:", e);
        }

        if (!call) {
            const records = getRecords();
            call = records.find(r => r.id === callId);
        }

        if (!call || !call.result) {
            alert("Record not found.");
            window.location.href = "/";
            return;
        }

        const res = call.result;

        // Header
        document.getElementById("call-title").textContent = `Call with ${res.caller_name || "Unknown"}`;

        const indBadge = document.getElementById("call-industry-badge");
        indBadge.textContent = call.industry;
        indBadge.className = "badge badge-accent uppercase text-[10px]";

        const urgBadge = document.getElementById("call-urgency-badge");
        urgBadge.className = "badge uppercase text-[10px]";
        if (res.urgency === "high") {
            urgBadge.textContent = "🔴 High Urgency";
            urgBadge.classList.add("badge-red");
        } else if (res.urgency === "medium") {
            urgBadge.textContent = "🟡 Medium";
            urgBadge.classList.add("badge-amber");
        } else {
            urgBadge.textContent = "🟢 Low";
            urgBadge.classList.add("badge-green");
        }

        // Industry label
        const labelPT = document.getElementById("label-policy-type");
        if (labelPT) {
            const labels = {
                insurance: "Policy / Coverage Type",
                real_estate: "Property Category",
                clinic: "Clinic Department",
                coaching: "Training Course",
                logistics: "Shipment / Cargo Type"
            };
            labelPT.textContent = labels[call.industry] || "Account / Category";
        }

        // Populate fields
        document.getElementById("call-summary").value = res.summary;
        document.getElementById("field-caller-name").value = res.caller_name;
        document.getElementById("field-policy-type").value = res.policy_type;
        document.getElementById("field-urgency").value = res.urgency;
        document.getElementById("field-intent").value = res.intent;

        let reminderDateVal = "";
        if (res.reminder_date) {
            const match = res.reminder_date.match(/^\d{4}-\d{2}-\d{2}$/);
            if (match) {
                reminderDateVal = res.reminder_date;
            }
        }
        document.getElementById("field-reminder-date").value = reminderDateVal;
        
        const followUpStatusVal = res.follow_up_status || (res.follow_up_needed === "Yes" ? "Pending" : "N/A");
        document.getElementById("field-follow-up-status").value = followUpStatusVal;

        // Transcript toggle
        const transcriptToggle = document.getElementById("transcript-toggle-btn");
        const transcriptBody = document.getElementById("transcript-body");
        const transcriptChevron = document.getElementById("transcript-chevron");

        if (transcriptToggle && transcriptBody) {
            transcriptBody.textContent = call.transcript;
            transcriptToggle.addEventListener("click", () => {
                transcriptBody.classList.toggle("hidden");
                transcriptChevron.classList.toggle("rotate-180");
            });
        }

        // Objections
        const objContainer = document.getElementById("objections-container");
        const renderObjections = () => {
            objContainer.innerHTML = "";
            res.objections.forEach((obj, i) => {
                const div = document.createElement("div");
                div.className = "flex items-center gap-2";
                div.innerHTML = `
                    <input type="text" value="${obj}" class="objection-item-input form-input w-full px-3 py-2 rounded-lg text-xs">
                    <button data-index="${i}" class="remove-obj-btn text-gray-300 hover:text-red-500 p-1 transition-colors">
                        <i class="fa-solid fa-trash-can text-xs"></i>
                    </button>
                `;
                objContainer.appendChild(div);
            });
            document.querySelectorAll(".remove-obj-btn").forEach(btn => {
                btn.addEventListener("click", () => {
                    res.objections.splice(parseInt(btn.getAttribute("data-index")), 1);
                    renderObjections();
                });
            });
        };

        document.getElementById("add-objection-btn")?.addEventListener("click", () => {
            res.objections = Array.from(document.querySelectorAll(".objection-item-input")).map(i => i.value.trim());
            res.objections.push("New concern");
            renderObjections();
        });

        // Missing Info
        const missingContainer = document.getElementById("missing-container");
        const renderMissing = () => {
            missingContainer.innerHTML = "";
            res.missing_info.forEach((info, i) => {
                const div = document.createElement("div");
                div.className = "flex items-center gap-2";
                div.innerHTML = `
                    <input type="text" value="${info}" class="missing-item-input form-input w-full px-3 py-2 rounded-lg text-xs">
                    <button data-index="${i}" class="remove-missing-btn text-gray-300 hover:text-red-500 p-1 transition-colors">
                        <i class="fa-solid fa-trash-can text-xs"></i>
                    </button>
                `;
                missingContainer.appendChild(div);
            });
            document.querySelectorAll(".remove-missing-btn").forEach(btn => {
                btn.addEventListener("click", () => {
                    res.missing_info.splice(parseInt(btn.getAttribute("data-index")), 1);
                    renderMissing();
                });
            });
        };

        document.getElementById("add-missing-btn")?.addEventListener("click", () => {
            res.missing_info = Array.from(document.querySelectorAll(".missing-item-input")).map(i => i.value.trim());
            res.missing_info.push("New requirement");
            renderMissing();
        });

        renderObjections();
        renderMissing();

        // Tasks
        const tasksContainer = document.getElementById("tasks-container");
        const renderTasks = () => {
            tasksContainer.innerHTML = "";
            res.tasks.forEach((task, i) => {
                const div = document.createElement("div");
                div.className = "task-row flex-col md:flex-row items-start md:items-center";

                const badgeClass = task.priority === "high"
                    ? "bg-red-50 text-red-600 border border-red-200"
                    : "bg-blue-50 text-blue-600 border border-blue-200";

                div.innerHTML = `
                    <div class="flex items-center gap-3 flex-grow w-full">
                        <input type="checkbox" ${task.completed ? 'checked' : ''} data-index="${i}"
                            class="task-checkbox h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500 accent-violet-600">
                        <input type="text" value="${task.title}" data-index="${i}"
                            class="task-title-input bg-transparent border-0 border-b border-transparent focus:border-violet-400 text-xs text-gray-800 focus:outline-none w-full ${task.completed ? 'line-through text-gray-400' : ''}">
                    </div>
                    <div class="flex items-center gap-2 self-end md:self-auto flex-shrink-0 mt-2 md:mt-0">
                        <span class="px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${badgeClass}">${task.priority}</span>
                        <input type="text" value="${task.due}" data-index="${i}"
                            class="task-due-input form-input px-2.5 py-1 rounded-lg text-[10px] w-20 text-center uppercase tracking-wider font-semibold">
                        <button data-index="${i}" class="remove-task-btn text-gray-300 hover:text-red-500 p-1 transition-colors">
                            <i class="fa-solid fa-circle-minus text-sm"></i>
                        </button>
                    </div>
                `;
                tasksContainer.appendChild(div);
            });

            document.querySelectorAll(".task-checkbox").forEach(box => {
                box.addEventListener("change", () => {
                    res.tasks[parseInt(box.getAttribute("data-index"))].completed = box.checked;
                    renderTasks();
                });
            });
            document.querySelectorAll(".task-title-input").forEach(input => {
                input.addEventListener("change", () => {
                    res.tasks[parseInt(input.getAttribute("data-index"))].title = input.value.trim();
                });
            });
            document.querySelectorAll(".task-due-input").forEach(input => {
                input.addEventListener("change", () => {
                    res.tasks[parseInt(input.getAttribute("data-index"))].due = input.value.trim();
                });
            });
            document.querySelectorAll(".remove-task-btn").forEach(btn => {
                btn.addEventListener("click", () => {
                    res.tasks.splice(parseInt(btn.getAttribute("data-index")), 1);
                    renderTasks();
                });
            });
        };

        document.getElementById("add-task-btn")?.addEventListener("click", () => {
            res.tasks.push({ title: "New action item", due: "Friday", priority: "medium", completed: false });
            renderTasks();
        });

        renderTasks();

        // Follow-up tabs
        const tabs = document.querySelectorAll(".follow-up-tab");
        const msgTextarea = document.getElementById("message-draft");
        const copyBtn = document.getElementById("copy-message-btn");
        const sendBtn = document.getElementById("send-message-btn");
        const callBtn = document.getElementById("make-call-btn");
        const phoneInput = document.getElementById("recipient-phone");
        const statusDiv = document.getElementById("send-status");
        let activeTab = "whatsapp";

        const showStatus = (message, isSuccess) => {
            if (!statusDiv) return;
            statusDiv.textContent = message;
            statusDiv.className = `text-xs text-center py-2 rounded-lg font-semibold ${
                isSuccess
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-red-50 text-red-600 border border-red-200"
            }`;
            statusDiv.classList.remove("hidden");
            setTimeout(() => statusDiv.classList.add("hidden"), 5000);
        };

        const setTabActive = (tabName) => {
            activeTab = tabName;
            tabs.forEach(tab => {
                if (tab.getAttribute("data-tab") === tabName) {
                    tab.classList.add("active");
                } else {
                    tab.classList.remove("active");
                }
            });
            msgTextarea.value = (res.follow_ups && res.follow_ups[tabName]) || "";

            // Update send button label based on active tab
            if (sendBtn) {
                const labels = { whatsapp: "Send WhatsApp", email: "Send Email", sms: "Send SMS" };
                sendBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> ${labels[tabName] || "Send"}`;
            }
        };

        setTabActive(activeTab);

        tabs.forEach(tab => {
            tab.addEventListener("click", () => {
                res.follow_ups[activeTab] = msgTextarea.value;
                setTabActive(tab.getAttribute("data-tab"));
            });
        });

        // Copy to clipboard
        if (copyBtn) {
            copyBtn.addEventListener("click", () => {
                res.follow_ups[activeTab] = msgTextarea.value;
                navigator.clipboard.writeText(msgTextarea.value).then(() => {
                    const orig = copyBtn.innerHTML;
                    copyBtn.innerHTML = `<i class="fa-solid fa-check text-emerald-600"></i> Copied!`;
                    copyBtn.className = "py-2.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center gap-1.5";
                    setTimeout(() => {
                        copyBtn.innerHTML = orig;
                        copyBtn.className = "btn-secondary py-2.5 rounded-lg text-xs flex items-center justify-center gap-1.5";
                    }, 1500);
                });
            });
        }

        // Send SMS or WhatsApp
        if (sendBtn) {
            sendBtn.addEventListener("click", async () => {
                const phone = phoneInput ? phoneInput.value.trim() : "";
                const message = msgTextarea.value.trim();

                if (!phone) {
                    showStatus("Please enter a phone number with country code (e.g. +91...)", false);
                    if (phoneInput) phoneInput.focus();
                    return;
                }
                if (!message) {
                    showStatus("Message is empty. Write something first.", false);
                    return;
                }

                // Determine which API to call based on active tab
                let endpoint = "";
                if (activeTab === "sms") {
                    endpoint = "/api/send-sms";
                } else if (activeTab === "whatsapp") {
                    endpoint = "/api/send-whatsapp";
                } else if (activeTab === "email") {
                    // Email sending not implemented via Twilio — just copy for now
                    showStatus("Email sending not connected yet. Use Copy to send manually.", false);
                    return;
                }

                // Update button state
                const origHTML = sendBtn.innerHTML;
                sendBtn.innerHTML = `<i class="fa-solid fa-spinner animate-spin"></i> Sending...`;
                sendBtn.disabled = true;

                try {
                    const resp = await fetch(endpoint, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ to: phone, message: message })
                    });
                    const result = await resp.json();

                    if (result.success) {
                        showStatus(`✅ ${activeTab === "sms" ? "SMS" : "WhatsApp"} sent successfully! (SID: ${result.sid})`, true);
                    } else {
                        showStatus(`❌ Failed: ${result.error}`, false);
                    }
                } catch (err) {
                    showStatus(`❌ Network error: ${err.message}`, false);
                } finally {
                    sendBtn.innerHTML = origHTML;
                    sendBtn.disabled = false;
                }
            });
        }

        // Make outbound call
        if (callBtn) {
            callBtn.addEventListener("click", async () => {
                const phone = phoneInput ? phoneInput.value.trim() : "";
                if (!phone) {
                    showStatus("Please enter the phone number to call.", false);
                    if (phoneInput) phoneInput.focus();
                    return;
                }

                if (!confirm(`This will:\n1. Ring YOUR mobile phone first.\n2. When you answer, connect you to ${phone}.\n3. Record the call.\n\nProceed?`)) {
                    return;
                }

                const origHTML = callBtn.innerHTML;
                callBtn.innerHTML = `<i class="fa-solid fa-spinner animate-spin"></i> Initiating Call...`;
                callBtn.disabled = true;

                try {
                    const resp = await fetch("/api/make-call", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ to: phone })
                    });
                    const result = await resp.json();

                    if (result.success) {
                        showStatus(`📞 Call initiated! Your phone will ring now. (SID: ${result.call_sid})`, true);
                    } else {
                        showStatus(`❌ Call failed: ${result.error}`, false);
                    }
                } catch (err) {
                    showStatus(`❌ Network error: ${err.message}`, false);
                } finally {
                    callBtn.innerHTML = origHTML;
                    callBtn.disabled = false;
                }
            });
        }

        // Save
        document.getElementById("save-approve-btn").addEventListener("click", async () => {
            res.summary = document.getElementById("call-summary").value.trim();
            res.caller_name = document.getElementById("field-caller-name").value.trim();
            res.policy_type = document.getElementById("field-policy-type").value.trim();
            res.urgency = document.getElementById("field-urgency").value;
            res.intent = document.getElementById("field-intent").value.trim();
            res.reminder_date = document.getElementById("field-reminder-date").value;
            res.follow_up_status = document.getElementById("field-follow-up-status").value;
            res.follow_up_needed = res.follow_up_status !== "N/A" ? "Yes" : "No";
            res.follow_ups[activeTab] = msgTextarea.value.trim();
            res.objections = Array.from(document.querySelectorAll(".objection-item-input")).map(i => i.value.trim());
            res.missing_info = Array.from(document.querySelectorAll(".missing-item-input")).map(i => i.value.trim());

            call.caller = res.caller_name;
            call.title = `Call with ${res.caller_name}`;

            const records = getRecords();
            const idx = records.findIndex(r => r.id === callId);
            if (idx !== -1) {
                records[idx] = call;
            } else {
                records.unshift(call);
            }
            saveRecords(records);

            const saveBtn = document.getElementById("save-approve-btn");
            const originalHTML = saveBtn.innerHTML;
            saveBtn.innerHTML = `<i class="fa-solid fa-spinner animate-spin"></i> Saving...`;
            saveBtn.disabled = true;

            try {
                const response = await fetch(`/api/recordings/${callId}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(call)
                });
                if (!response.ok) {
                    alert("Failed to save changes to the database.");
                    saveBtn.innerHTML = originalHTML; 
                    saveBtn.disabled = false;
                    return; // Prevent redirect
                }
            } catch (err) {
                console.error("Network error updating database:", err);
            }

            window.location.href = "/history";
        });

    };

    // ---- SCREEN 3: HISTORY PAGE ----
    const initHistoryPage = async () => {
        const historyList = document.getElementById("history-list");
        const emptyState = document.getElementById("empty-state");
        const searchInput = document.getElementById("search-input");
        const filterChips = document.querySelectorAll("#filter-chips button");

        if (!historyList || !emptyState) return;

        let activeFilter = "all";
        let searchQuery = "";

        // Fetch real Twilio call recordings from server
        const serverRecords = await fetchServerRecordings();

        const renderHistory = () => {
            const localRecords = getRecords();
            // Merge local + server records, server records take priority
            const localIds = new Set(localRecords.map(r => r.id));
            const uniqueServerRecords = serverRecords.filter(r => !localIds.has(r.id));
            const records = [...localRecords, ...uniqueServerRecords].sort((a, b) => b.timestamp - a.timestamp);

            const filtered = records.filter(r => {
                const res = r.result;
                const matchFilter = activeFilter === "all" || r.industry === activeFilter;
                const q = searchQuery.toLowerCase();
                const matchSearch = q === "" ||
                    (r.caller && r.caller.toLowerCase().includes(q)) ||
                    (res.summary && res.summary.toLowerCase().includes(q)) ||
                    (res.policy_type && res.policy_type.toLowerCase().includes(q)) ||
                    (r.title && r.title.toLowerCase().includes(q));
                return matchFilter && matchSearch;
            });

            if (filtered.length === 0) {
                historyList.innerHTML = "";
                emptyState.classList.remove("hidden");
                emptyState.classList.add("flex");
                return;
            }

            emptyState.classList.add("hidden");
            emptyState.classList.remove("flex");
            historyList.innerHTML = "";

            filtered.forEach(call => {
                const res = call.result;
                const div = document.createElement("div");

                const urgencyBorder = res.urgency === "high" ? "border-l-red-500"
                    : res.urgency === "medium" ? "border-l-amber-400"
                    : "border-l-emerald-400";

                const urgencyBadge = res.urgency === "high"
                    ? "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400"
                    : res.urgency === "medium"
                    ? "bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400"
                    : "bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400";

                const followUpStatus = res.follow_up_status || (res.follow_up_needed === "Yes" ? "Pending" : "N/A");
                let followUpBadge = "";
                if (followUpStatus === "Completed") {
                    followUpBadge = "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50";
                } else if (followUpStatus === "Pending") {
                    followUpBadge = "bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800/50";
                } else {
                    followUpBadge = "bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400 border border-gray-200 dark:border-gray-700";
                }
                const reminderStr = res.reminder_date ? ` • Reminder: ${res.reminder_date}` : '';

                div.className = `history-card ${urgencyBorder} border-l-[3px]`;
                div.innerHTML = `
                    <div class="space-y-1.5 flex-grow max-w-2xl">
                        <div class="flex flex-wrap items-center gap-2">
                            <span class="badge badge-accent uppercase text-[9px]">${call.industry}</span>
                            <span class="badge ${urgencyBadge} uppercase text-[9px]">${res.urgency}</span>
                            <span class="badge ${followUpBadge} uppercase text-[9px]">Follow-up: ${followUpStatus}</span>
                            <span class="text-[10px] text-gray-400 font-medium">${formatTimestamp(call.timestamp)}${reminderStr}</span>
                        </div>
                        <h4 class="font-semibold text-gray-900 text-sm tracking-tight">Call with ${call.caller}</h4>
                        <p class="text-xs text-gray-500 line-clamp-2 leading-relaxed">${res.summary}</p>
                    </div>

                    <div class="flex items-center gap-4 flex-shrink-0 self-end md:self-auto">
                        <div class="text-right hidden sm:block">
                            <span class="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">Tasks</span>
                            <span class="text-xs font-semibold text-gray-800">${res.tasks ? res.tasks.length : 0}</span>
                        </div>
                        <div class="w-7 h-7 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-400 dark:bg-gray-800 dark:border-gray-700">
                            <i class="fa-solid fa-chevron-right text-[10px]"></i>
                        </div>
                    </div>
`;

                div.addEventListener("click", () => {
                    window.location.href = `/results/${call.id}`;
                });

                historyList.appendChild(div);
            });

            updateStats(records);
        };

        // Filter chips
        filterChips.forEach(chip => {
            chip.addEventListener("click", () => {
                activeFilter = chip.getAttribute("data-filter");
                filterChips.forEach(c => {
                    if (c.getAttribute("data-filter") === activeFilter) {
                        c.classList.add("active");
                    } else {
                        c.classList.remove("active");
                    }
                });
                renderHistory();
            });
        });

        // Search
        searchInput.addEventListener("input", (e) => {
            searchQuery = e.target.value;
            renderHistory();
        });

        renderHistory();
    };

    // ---- SCREEN 0: HOMEPAGE (DASHBOARD) ----
    const initHomePage = async () => {
        const homeCalls = document.getElementById("home-stat-calls");
        const homeUrgent = document.getElementById("home-stat-urgent");
        const homeTasks = document.getElementById("home-stat-tasks");
        const recentFeed = document.getElementById("home-recent-feed");

        if (!homeCalls) return; // Not on homepage

        try {
            const res = await fetch('/api/dashboard-stats');
            if (!res.ok) throw new Error("Failed to load dashboard statistics");
            const data = await res.json();

            // Animate counting numbers
            const animateValue = (el, start, end, duration) => {
                if (start === end) {
                    el.textContent = end;
                    return;
                }
                let current = start;
                const range = end - start;
                const increment = end > start ? 1 : -1;
                const stepTime = Math.abs(Math.floor(duration / range));
                const timer = setInterval(() => {
                    current += increment;
                    el.textContent = current;
                    if (current === end) {
                        clearInterval(timer);
                    }
                }, stepTime || 20);
            };

            animateValue(homeCalls, 0, data.totalCalls, 400);
            animateValue(homeUrgent, 0, data.urgentCalls, 400);
            animateValue(homeTasks, 0, data.totalTasks, 400);

            // Populate Recent feed
            if (!data.recentCalls || data.recentCalls.length === 0) {
                recentFeed.innerHTML = `
                    <div class="card p-6 text-center text-gray-400 text-xs flex flex-col items-center justify-center py-10 space-y-2">
                        <i class="fa-solid fa-folder-open text-lg"></i>
                        <span>No client calls processed yet. Click "Process Call" to begin.</span>
                    </div>
                `;
            } else {
                recentFeed.innerHTML = "";
                data.recentCalls.forEach(call => {
                    const res = call.result;
                    if (!res) return;
                    const div = document.createElement("div");

                    const urgencyBorder = res.urgency === "high" ? "border-l-red-500"
                        : res.urgency === "medium" ? "border-l-amber-400"
                        : "border-l-emerald-400";

                    const urgencyBadge = res.urgency === "high"
                        ? "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400"
                        : res.urgency === "medium"
                        ? "bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400"
                        : "bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400";

                    const followUpStatus = res.follow_up_status || (res.follow_up_needed === "Yes" ? "Pending" : "N/A");
                    let followUpBadge = "";
                    if (followUpStatus === "Completed") {
                        followUpBadge = "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50";
                    } else if (followUpStatus === "Pending") {
                        followUpBadge = "bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800/50";
                    } else {
                        followUpBadge = "bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400 border border-gray-200 dark:border-gray-700";
                    }
                    const reminderStr = res.reminder_date ? ` • Reminder: ${res.reminder_date}` : '';

                    div.className = `history-card ${urgencyBorder} border-l-[3px]`;
                    div.innerHTML = `
                        <div class="space-y-1.5 flex-grow max-w-2xl text-left">
                            <div class="flex flex-wrap items-center gap-2">
                                <span class="badge badge-accent uppercase text-[9px]">${call.industry}</span>
                                <span class="badge ${urgencyBadge} uppercase text-[9px]">${res.urgency}</span>
                                <span class="badge ${followUpBadge} uppercase text-[9px]">Follow-up: ${followUpStatus}</span>
                                <span class="text-[10px] text-gray-400 font-medium">${formatTimestamp(call.timestamp)}${reminderStr}</span>
                            </div>
                            <h4 class="font-semibold text-gray-900 text-sm tracking-tight">Call with ${call.caller}</h4>
                            <p class="text-xs text-gray-500 line-clamp-2 leading-relaxed">${res.summary}</p>
                        </div>

                        <div class="flex items-center gap-4 flex-shrink-0 self-end md:self-auto">
                            <div class="text-right hidden sm:block">
                                <span class="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">Actions</span>
                                <span class="text-xs font-semibold text-gray-800">${res.tasks ? res.tasks.length : 0}</span>
                            </div>
                            <div class="w-7 h-7 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-400 dark:bg-gray-800 dark:border-gray-700">
                                <i class="fa-solid fa-chevron-right text-[10px]"></i>
                            </div>
                        </div>
                    `;

                    div.addEventListener("click", () => {
                        window.location.href = `/results/${call.id}`;
                    });

                    recentFeed.appendChild(div);
                });
            }

            // Populate Hot Leads feed
            const hotLeadsFeed = document.getElementById("home-hot-leads-feed");
            if (hotLeadsFeed) {
                const allRecords = await loadAllUnifiedRecords();
                const hotLeads = allRecords.filter(r => r.result && r.result.urgency === 'high');

                if (hotLeads.length === 0) {
                    hotLeadsFeed.innerHTML = `
                        <div class="p-4 bg-gray-50/50 border border-gray-150 rounded-xl text-center text-gray-400 text-[10px] flex items-center justify-center gap-1.5 py-6">
                            <i class="fa-solid fa-circle-check text-green-500"></i>
                            <span>No active high-urgency alerts. All loops are closed!</span>
                        </div>
                    `;
                } else {
                    hotLeadsFeed.innerHTML = "";
                    hotLeads.forEach(call => {
                        const res = call.result;
                        const div = document.createElement("div");
                        const followUpStatus = res.follow_up_status || (res.follow_up_needed === "Yes" ? "Pending" : "N/A");
                        
                        let followUpBadge = "";
                        if (followUpStatus === "Completed") {
                            followUpBadge = "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50";
                        } else if (followUpStatus === "Pending") {
                            followUpBadge = "bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800/50 animate-pulse";
                        } else {
                            followUpBadge = "bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400 border border-gray-200 dark:border-gray-700";
                        }
                        const reminderStr = res.reminder_date ? ` • Reminder: ${res.reminder_date}` : '';

                        div.className = `history-card border-l-[3px] border-l-red-500`;
                        div.innerHTML = `
                            <div class="space-y-1.5 flex-grow max-w-2xl text-left">
                                <div class="flex flex-wrap items-center gap-2">
                                    <span class="badge badge-accent uppercase text-[9px]">${call.industry}</span>
                                    <span class="badge bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400 uppercase text-[9px]">🔴 High Urgency</span>
                                    <span class="badge ${followUpBadge} uppercase text-[9px]">Follow-up: ${followUpStatus}</span>
                                    <span class="text-[10px] text-gray-400 font-medium">${formatTimestamp(call.timestamp)}${reminderStr}</span>
                                </div>
                                <h4 class="font-semibold text-gray-900 text-sm tracking-tight">Call with ${call.caller}</h4>
                                <p class="text-xs text-gray-500 line-clamp-2 leading-relaxed">${res.summary}</p>
                            </div>

                            <div class="flex items-center gap-4 flex-shrink-0 self-end md:self-auto">
                                <div class="text-right hidden sm:block">
                                    <span class="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">Actions</span>
                                    <span class="text-xs font-semibold text-gray-800">${res.tasks ? res.tasks.length : 0}</span>
                                </div>
                                <div class="w-7 h-7 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-400 dark:bg-gray-800 dark:border-gray-700">
                                    <i class="fa-solid fa-chevron-right text-[10px]"></i>
                                </div>
                            </div>
                        `;

                        div.addEventListener("click", () => {
                            window.location.href = `/results/${call.id}`;
                        });
                        hotLeadsFeed.appendChild(div);
                    });
                }
            }

        } catch (err) {
            console.error("Dashboard stats loading failed", err);
            recentFeed.innerHTML = `<div class="text-center py-6 text-red-500 text-xs font-semibold">Failed to load recent memories.</div>`;
        }
    };

    // ---- SCREEN 4: CAMPAIGNS PAGE ----
    const initCampaignsPage = async () => {
        const recipientsList = document.getElementById("recipients-list");
        if (!recipientsList) return;

        const selectAllBtn = document.getElementById("select-all-btn");
        const selectHotBtn = document.getElementById("select-hot-btn");
        const clearSelectBtn = document.getElementById("clear-select-btn");
        const selectedCountLabel = document.getElementById("selected-count");
        const campaignMessage = document.getElementById("campaign-message");
        const templateSelect = document.getElementById("template-select");
        const sendCampaignBtn = document.getElementById("send-campaign-btn");
        const statusDiv = document.getElementById("campaign-status");

        const smsBtn = document.getElementById("channel-sms");
        const waBtn = document.getElementById("channel-whatsapp");

        let activeChannel = "sms"; // Default

        // Set up channel toggles
        if (smsBtn && waBtn) {
            smsBtn.addEventListener("click", () => {
                activeChannel = "sms";
                smsBtn.className = "px-3 py-2 rounded-lg text-xs font-semibold border border-violet-500 bg-violet-50 text-violet-700 flex items-center justify-center gap-1.5 transition-all";
                waBtn.className = "px-3 py-2 rounded-lg text-xs font-semibold border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 flex items-center justify-center gap-1.5 transition-all";
            });
            waBtn.addEventListener("click", () => {
                activeChannel = "whatsapp";
                waBtn.className = "px-3 py-2 rounded-lg text-xs font-semibold border border-emerald-500 bg-emerald-50 text-emerald-700 flex items-center justify-center gap-1.5 transition-all";
                smsBtn.className = "px-3 py-2 rounded-lg text-xs font-semibold border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 flex items-center justify-center gap-1.5 transition-all";
            });
        }

        const showCampaignStatus = (message, isSuccess) => {
            if (!statusDiv) return;
            statusDiv.textContent = message;
            statusDiv.className = `text-xs text-center py-2.5 rounded-lg font-semibold ${
                isSuccess
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-red-50 text-red-600 border border-red-200"
            }`;
            statusDiv.classList.remove("hidden");
            setTimeout(() => statusDiv.classList.add("hidden"), 8000);
        };

        // Render recipient table
        const records = await loadAllUnifiedRecords();
        
        // Group uniquely by phone number
        const uniqueContactsMap = new Map();
        records.forEach(r => {
            const res = r.result;
            if (!res) return;
            
            // Clean up phone number to extract a clean string
            const rawPhone = r.caller || res.caller_name || 'Unknown';
            if (rawPhone.toLowerCase().includes('unknown') || rawPhone.toLowerCase().includes('manual')) return;
            
            // If already added, skip or update to highest urgency
            const existing = uniqueContactsMap.get(rawPhone);
            if (existing) {
                if (res.urgency === 'high') {
                    existing.urgency = 'high';
                }
                existing.task_count += (res.tasks ? res.tasks.length : 0);
            } else {
                uniqueContactsMap.set(rawPhone, {
                    name: res.caller_name || 'Prospect',
                    phone: rawPhone,
                    industry: r.industry,
                    urgency: res.urgency,
                    task_count: res.tasks ? res.tasks.length : 0
                });
            }
        });

        const contacts = Array.from(uniqueContactsMap.values());

        if (contacts.length === 0) {
            recipientsList.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center py-8 text-gray-400 text-xs">
                        No valid contacts with phone numbers found in the database.
                    </td>
                </tr>
            `;
            return;
        }

        recipientsList.innerHTML = "";
        contacts.forEach((contact, idx) => {
            const tr = document.createElement("tr");
            tr.className = "hover:bg-gray-50/50 transition-colors border-b border-gray-50";

            const urgencyBadge = contact.urgency === "high"
                ? `<span class="badge bg-red-50 text-red-600 uppercase text-[8px] font-bold"><i class="fa-solid fa-fire text-red-500"></i> Hot Lead</span>`
                : `<span class="badge bg-gray-50 text-gray-400 uppercase text-[8px]">Standard</span>`;

            tr.innerHTML = `
                <td class="py-3.5 px-2">
                    <input type="checkbox" value="${contact.phone}" data-urgency="${contact.urgency}" class="recipient-checkbox h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500 accent-violet-600">
                </td>
                <td class="py-3.5 px-3 font-semibold text-gray-950">${contact.name}</td>
                <td class="py-3.5 px-3 font-mono">${contact.phone}</td>
                <td class="py-3.5 px-3 uppercase text-[10px] font-bold text-gray-400">${contact.industry}</td>
                <td class="py-3.5 px-3">${urgencyBadge}</td>
                <td class="py-3.5 px-3 text-right font-medium text-gray-500">${contact.task_count} pending</td>
            `;
            recipientsList.appendChild(tr);
        });

        const checkboxes = document.querySelectorAll(".recipient-checkbox");

        const updateSelectedCount = () => {
            const checkedCount = document.querySelectorAll(".recipient-checkbox:checked").length;
            if (selectedCountLabel) selectedCountLabel.textContent = checkedCount;
        };

        checkboxes.forEach(cb => {
            cb.addEventListener("change", updateSelectedCount);
        });

        // Bulk Selection Button Event Listeners
        if (selectAllBtn) {
            selectAllBtn.addEventListener("click", () => {
                checkboxes.forEach(cb => cb.checked = true);
                updateSelectedCount();
            });
        }

        if (selectHotBtn) {
            selectHotBtn.addEventListener("click", () => {
                checkboxes.forEach(cb => {
                    const urgency = cb.getAttribute("data-urgency");
                    cb.checked = (urgency === "high");
                });
                updateSelectedCount();
            });
        }

        if (clearSelectBtn) {
            clearSelectBtn.addEventListener("click", () => {
                checkboxes.forEach(cb => cb.checked = false);
                updateSelectedCount();
            });
        }

        // Load templates dynamically into message composer
        if (templateSelect && campaignMessage) {
            templateSelect.addEventListener("change", () => {
                const val = templateSelect.value;
                const templates = {
                    ias_demo: "Hi! Following up on your inquiry. We've reserved a seat for you in our upcoming free IAS Prep Demo Class this Saturday at 10:00 AM. Please reach our center 10 mins early. See you there! - Amigos IAS",
                    pricing_installment: "Hello, regarding your coaching registration details: we offer flexible installment payment options (3 parts across 3 months) to make enrollment easier. Let us know if you want us to send the registration form via email. - Support Desk",
                    followup_general: "Hi, thank you for contacting us. I am following up on our recent conversation to check if you had any questions regarding the service details. Let me know if you would like to schedule a quick call today. - Operations Team"
                };
                campaignMessage.value = templates[val] || "";
            });
        }

        // Send campaign broadcast
        if (sendCampaignBtn) {
            sendCampaignBtn.addEventListener("click", async () => {
                const checked = Array.from(document.querySelectorAll(".recipient-checkbox:checked")).map(cb => cb.value);
                const msg = campaignMessage ? campaignMessage.value.trim() : "";

                if (checked.length === 0) {
                    showCampaignStatus("Please select at least one target recipient checkbox.", false);
                    return;
                }
                if (!msg) {
                    showCampaignStatus("Message content cannot be empty. Please compose a message.", false);
                    return;
                }

                if (!confirm(`You are about to send a bulk campaign to ${checked.length} recipient(s) via Twilio ${activeChannel === 'sms' ? 'SMS' : 'WhatsApp'}.\n\nProceed?`)) {
                    return;
                }

                const origHTML = sendCampaignBtn.innerHTML;
                sendCampaignBtn.innerHTML = `<i class="fa-solid fa-spinner animate-spin"></i> Dispatching Broadcast...`;
                sendCampaignBtn.disabled = true;

                try {
                    const response = await fetch("/api/bulk-message", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ numbers: checked, message: msg, channel: activeChannel })
                    });
                    const data = await response.json();

                    if (data.success) {
                        const successes = data.results.filter(r => r.success).length;
                        const failures = data.results.filter(r => !r.success).length;
                        showCampaignStatus(`✅ Campaign sent! Successful: ${successes} | Failed: ${failures}`, true);
                    } else {
                        showCampaignStatus(`❌ Error sending campaign: ${data.error}`, false);
                    }
                } catch (err) {
                    showCampaignStatus(`❌ Network error: ${err.message}`, false);
                } finally {
                    sendCampaignBtn.innerHTML = origHTML;
                    sendCampaignBtn.disabled = false;
                }
            });
        }
    };

    // ---- SCREEN 5: SYNC PAGE ----
    const initSyncPage = async () => {
        const triggerBtn = document.getElementById("trigger-sync-btn");
        const statusDiv = document.getElementById("trigger-status");

        const sheetsBadge = document.getElementById("google-sheets-badge");
        const sheetIdLabel = document.getElementById("sheet-id-label");
        const sheetLink = document.getElementById("sheet-link");

        const twilioBadge = document.getElementById("twilio-badge");
        const twilioPhoneLabel = document.getElementById("twilio-phone-label");
        const twilioWhatsappLabel = document.getElementById("twilio-whatsapp-label");

        const supabaseBadge = document.getElementById("supabase-badge");
        const dbCountLabel = document.getElementById("db-count-label");
        const dbPendingLabel = document.getElementById("db-pending-label");

        if (!triggerBtn && !sheetsBadge) return; // Not on sync page

        const showSyncResult = (message, isSuccess) => {
            if (!statusDiv) return;
            statusDiv.textContent = message;
            statusDiv.className = `text-xs text-center py-2.5 rounded-lg font-semibold ${
                isSuccess
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-red-50 text-red-600 border border-red-200"
            }`;
            statusDiv.classList.remove("hidden");
            setTimeout(() => statusDiv.classList.add("hidden"), 8000);
        };

        const loadSyncStatus = async () => {
            try {
                const res = await fetch('/api/sync-status');
                if (!res.ok) throw new Error("Status endpoint returned error");
                const data = await res.json();

                // 1. Google Sheets status
                if (data.google_sheets) {
                    const sheetId = data.google_sheets.sheet_id;
                    if (data.google_sheets.connected) {
                        sheetsBadge.textContent = "🟢 Active Connection";
                        sheetsBadge.className = "badge badge-green uppercase text-[9px]";
                    } else {
                        sheetsBadge.textContent = "🔴 Auth Failed";
                        sheetsBadge.className = "badge badge-red uppercase text-[9px]";
                    }
                    if (sheetIdLabel) {
                        sheetIdLabel.textContent = sheetId;
                    }
                    if (sheetLink) {
                        sheetLink.href = `https://docs.google.com/spreadsheets/d/${sheetId}/edit`;
                    }
                }

                // 2. Twilio status
                if (data.twilio) {
                    if (data.twilio.configured) {
                        twilioBadge.textContent = "🟢 Active";
                        twilioBadge.className = "badge badge-green uppercase text-[9px]";
                    } else {
                        twilioBadge.textContent = "🔴 Unconfigured";
                        twilioBadge.className = "badge badge-red uppercase text-[9px]";
                    }
                    if (twilioPhoneLabel) {
                        twilioPhoneLabel.textContent = `Phone: ${data.twilio.phone || 'Not Configured'}`;
                    }
                    if (twilioWhatsappLabel) {
                        twilioWhatsappLabel.textContent = `WA: whatsapp:${data.twilio.whatsapp || 'Not Configured'}`;
                    }
                }

                // 3. Supabase status
                if (data.supabase) {
                    if (data.supabase.configured) {
                        supabaseBadge.textContent = "🟢 Online";
                        supabaseBadge.className = "badge badge-green uppercase text-[9px]";
                    } else {
                        supabaseBadge.textContent = "🔴 Offline";
                        supabaseBadge.className = "badge badge-red uppercase text-[9px]";
                    }
                    if (dbCountLabel) {
                        dbCountLabel.textContent = `Records Store: ${data.supabase.record_count || 0} calls`;
                    }
                    if (dbPendingLabel) {
                        dbPendingLabel.textContent = `Pending Follow-ups: ${data.supabase.pending_count || 0} active`;
                    }
                }
            } catch (err) {
                console.error("Failed to load sync status metrics", err);
            }
        };

        // Initial Load
        await loadSyncStatus();

        // Manual Trigger Sync Button
        if (triggerBtn) {
            triggerBtn.addEventListener("click", async () => {
                const origHTML = triggerBtn.innerHTML;
                triggerBtn.innerHTML = `<i class="fa-solid fa-spinner animate-spin"></i> Executing Cron Scheduler...`;
                triggerBtn.disabled = true;

                try {
                    const response = await fetch("/api/sync-trigger", { method: "POST" });
                    const result = await response.json();

                    if (result.success) {
                        showSyncResult("✅ Sync job run successfully. Checked spreadsheet and sent due follow-ups.", true);
                        await loadSyncStatus(); // Reload numbers
                    } else {
                        showSyncResult(`❌ Sync job failed: ${result.error}`, false);
                    }
                } catch (err) {
                    showSyncResult(`❌ Network error executing sync job: ${err.message}`, false);
                } finally {
                    triggerBtn.innerHTML = origHTML;
                    triggerBtn.disabled = false;
                }
            });
        }
    };

    // ---- DARK MODE TOGGLE ----
    const initThemeToggle = () => {
        const toggleBtn = document.getElementById("theme-toggle-btn");
        const toggleIcon = document.getElementById("theme-toggle-icon");
        const toggleText = document.getElementById("theme-toggle-text");

        if (!toggleBtn) return;

        const updateThemeUI = () => {
            const isDark = document.body.classList.contains("dark-mode");
            if (isDark) {
                if (toggleIcon) {
                    toggleIcon.className = "fa-solid fa-sun text-amber-500";
                }
                if (toggleText) {
                    toggleText.textContent = "Light Mode";
                }
            } else {
                if (toggleIcon) {
                    toggleIcon.className = "fa-solid fa-moon text-violet-500";
                }
                if (toggleText) {
                    toggleText.textContent = "Dark Mode";
                }
            }
        };

        // Initialize UI based on current class
        updateThemeUI();

        toggleBtn.addEventListener("click", () => {
            const isDark = document.body.classList.toggle("dark-mode");
            localStorage.setItem("theme", isDark ? "dark" : "light");
            updateThemeUI();
        });
    };

    // ---- INIT ----
    initHomePage();
    initUploadPage();
    initResultsPage();
    initHistoryPage();
    initCampaignsPage();
    initSyncPage();
    initThemeToggle();
});
