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
                            class="task-checkbox h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500 accent-violet-600 transition-all duration-150 hover:scale-110 active:scale-90">
                        <input type="text" value="${task.title}" data-index="${i}"
                            class="task-title-input bg-transparent border-0 border-b border-transparent focus:border-violet-400 text-xs text-gray-800 focus:outline-none w-full transition-all duration-150 hover:border-gray-200 dark:hover:border-gray-800 ${task.completed ? 'line-through text-gray-400' : ''}">
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

                div.className = `history-card ${urgencyBorder} border-l-[3px] cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors`;
                div.innerHTML = `
                    <div class="space-y-1.5 flex-grow max-w-2xl">
                        <div class="flex flex-wrap items-center gap-2">
                            <span class="badge badge-accent uppercase text-[9px]">${call.industry}</span>
                            <span class="badge ${urgencyBadge} uppercase text-[9px]">${res.urgency}</span>
                            <span class="badge ${followUpBadge} uppercase text-[9px]">Follow-up: ${followUpStatus}</span>
                            <span class="text-[10px] text-gray-400 dark:text-gray-500 font-medium">${formatTimestamp(call.timestamp)}${reminderStr}</span>
                        </div>
                        <h4 class="font-semibold text-gray-900 dark:text-white text-sm tracking-tight">Call with ${call.caller}</h4>
                        <p class="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed">${res.summary}</p>
                    </div>

                    <div class="flex items-center gap-4 flex-shrink-0 self-end md:self-auto">
                        <div class="text-right hidden sm:block">
                            <span class="block text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Tasks</span>
                            <span class="text-xs font-semibold text-gray-800 dark:text-gray-200">${res.tasks ? res.tasks.length : 0}</span>
                        </div>
                        <div class="w-7 h-7 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-400 dark:bg-gray-800 dark:border-gray-700">
                            <i class="fa-solid fa-chevron-right text-[10px]"></i>
                        </div>
                    </div>
`;

                div.addEventListener("click", () => {
                    if (typeof openCallDrawer === 'function') {
                        openCallDrawer(call.id);
                    } else {
                        window.location.href = `/results/${call.id}`;
                    }
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
    };

         // ---- SCREEN 0: HOMEPAGE (DASHBOARD) ----
    const initHomePage = async () => {
        const homeCalls = document.getElementById("home-stat-calls");
        const homeUrgent = document.getElementById("home-stat-urgent");
        const homeTasks = document.getElementById("home-stat-tasks");
        const activityFeed = document.getElementById("home-activity-feed");

        if (!homeCalls) return; // Not on homepage

        // Slogan Banner localStorage Close Logic
        const sloganBanner = document.getElementById("slogan-welcome-banner");
        const closeSloganBtn = document.getElementById("close-slogan-btn");
        if (sloganBanner && closeSloganBtn) {
            if (localStorage.getItem("hide-welcome-slogan") === "true") {
                sloganBanner.classList.add("slogan-banner-hide");
            }
            closeSloganBtn.addEventListener("click", () => {
                sloganBanner.classList.add("slogan-banner-hide");
                localStorage.setItem("hide-welcome-slogan", "true");
            });
        }

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

            // Weekly call volume trend chart drawing logic
            const drawWeeklyTrendChart = (weeklyTrend) => {
                const svg = document.getElementById("weekly-trend-chart");
                const linePath = document.getElementById("chart-line-path");
                const areaPath = document.getElementById("chart-area-path");
                const weeklyTotalEl = document.getElementById("chart-weekly-total");
                
                if (!svg || !linePath || !areaPath || !weeklyTrend || weeklyTrend.length === 0) return;

                // Add SVG line self-drawing animations on load
                linePath.classList.remove("svg-draw-path");
                areaPath.classList.remove("svg-draw-path");
                void linePath.offsetWidth; // Force reflow to restart animation
                linePath.classList.add("svg-draw-path");

                // Update weekly total
                const totalTrendCalls = weeklyTrend.reduce((sum, day) => sum + day.count, 0);
                if (weeklyTotalEl) {
                    weeklyTotalEl.textContent = totalTrendCalls;
                }

                // Chart padding and boundaries (based on viewBox 0 0 500 150)
                const paddingLeft = 40;
                const paddingRight = 20;
                const paddingTop = 15;
                const paddingBottom = 30; // space for x-axis labels
                
                const width = 500 - paddingLeft - paddingRight; // 440
                const height = 150 - paddingTop - paddingBottom; // 105

                const maxVal = Math.max(...weeklyTrend.map(d => d.count), 5); // default min height scale of 5
                
                // Set Y-axis labels dynamically
                const yMaxEl = document.getElementById("y-axis-val-max");
                const yMid2El = document.getElementById("y-axis-val-mid2");
                const yMid1El = document.getElementById("y-axis-val-mid1");
                if (yMaxEl) yMaxEl.textContent = maxVal;
                if (yMid2El) yMid2El.textContent = Math.round(maxVal * 2 / 3);
                if (yMid1El) yMid1El.textContent = Math.round(maxVal / 3);

                // Compute points
                const points = weeklyTrend.map((day, idx) => {
                    const x = paddingLeft + (idx * (width / (weeklyTrend.length - 1)));
                    const y = paddingTop + height - ((day.count / maxVal) * height);
                    return { x, y, data: day };
                });

                // Generate Bezier Curve path
                let lineD = "";
                if (points.length > 0) {
                    lineD = `M ${points[0].x} ${points[0].y}`;
                    for (let i = 0; i < points.length - 1; i++) {
                        const p0 = points[i];
                        const p1 = points[i + 1];
                        // Control points for smooth bezier curve
                        const cpX1 = p0.x + (p1.x - p0.x) / 3;
                        const cpY1 = p0.y;
                        const cpX2 = p0.x + 2 * (p1.x - p0.x) / 3;
                        const cpY2 = p1.y;
                        lineD += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${p1.x} ${p1.y}`;
                    }
                }
                
                linePath.setAttribute("d", lineD);

                // Area path starts at first point, goes to last point, drops to x-axis, and returns to first point x-axis
                if (points.length > 0) {
                    const areaD = `${lineD} L ${points[points.length - 1].x} ${paddingTop + height} L ${points[0].x} ${paddingTop + height} Z`;
                    areaPath.setAttribute("d", areaD);
                }

                // Render X-Axis Labels dynamically to match API days
                const xAxisGroup = document.getElementById("chart-x-labels");
                if (xAxisGroup) {
                    xAxisGroup.innerHTML = points.map(p => `
                        <text x="${p.x}" y="140">${p.data.day}</text>
                    `).join("");
                }

                // Interactive hover logic
                const focusLine = document.getElementById("chart-focus-line");
                const focusDot = document.getElementById("chart-focus-dot");
                const tooltip = document.getElementById("chart-tooltip");
                const tooltipDate = document.getElementById("tooltip-date");
                const tooltipValue = document.getElementById("tooltip-value");

                // Generate invisible hover regions (matching actual X coordinates)
                const hoverRegionsGroup = document.getElementById("chart-hover-regions");
                if (hoverRegionsGroup) {
                    hoverRegionsGroup.innerHTML = "";
                    points.forEach((p, idx) => {
                        const rectX = idx === 0 ? p.x - 20 : p.x - (width / (weeklyTrend.length - 1)) / 2;
                        const rectWidth = idx === 0 ? 20 + (width / (weeklyTrend.length - 1)) / 2 :
                                         idx === weeklyTrend.length - 1 ? 20 + (width / (weeklyTrend.length - 1)) / 2 :
                                         (width / (weeklyTrend.length - 1));
                        
                        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                        rect.setAttribute("x", rectX);
                        rect.setAttribute("y", paddingTop);
                        rect.setAttribute("width", rectWidth);
                        rect.setAttribute("height", height);
                        rect.setAttribute("fill", "transparent");
                        rect.setAttribute("class", "cursor-pointer");
                        
                        rect.addEventListener("mouseenter", () => {
                            if (focusLine) {
                                focusLine.setAttribute("x1", p.x);
                                focusLine.setAttribute("x2", p.x);
                                focusLine.classList.remove("opacity-0");
                            }
                            if (focusDot) {
                                focusDot.setAttribute("cx", p.x);
                                focusDot.setAttribute("cy", p.y);
                                focusDot.classList.remove("opacity-0");
                            }
                            if (tooltip) {
                                if (tooltipDate) {
                                    const [year, month, day] = p.data.date.split('-');
                                    const localDate = new Date(year, month - 1, day);
                                    tooltipDate.textContent = localDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
                                }
                                if (tooltipValue) tooltipValue.textContent = `${p.data.count} Call${p.data.count === 1 ? '' : 's'}`;
                                
                                // Position tooltip relative to the wrapper card
                                const tooltipWidth = tooltip.offsetWidth || 100;
                                const tooltipHeight = tooltip.offsetHeight || 40;
                                
                                // Calculate position percentage relative to viewBox
                                const xPercent = (p.x / 500) * 100;
                                const yPercent = (p.y / 150) * 100;
                                
                                tooltip.style.left = `calc(${xPercent}% - ${tooltipWidth / 2}px)`;
                                tooltip.style.top = `calc(${yPercent}% - ${tooltipHeight + 12}px)`;
                                tooltip.classList.remove("opacity-0");
                            }
                        });

                        rect.addEventListener("mouseleave", () => {
                            if (focusLine) focusLine.classList.add("opacity-0");
                            if (focusDot) focusDot.classList.add("opacity-0");
                            if (tooltip) tooltip.classList.add("opacity-0");
                        });

                        hoverRegionsGroup.appendChild(rect);
                    });
                    
                    hoverRegionsGroup.classList.remove("opacity-0");
                }
            };

            if (data.weeklyTrend) {
                drawWeeklyTrendChart(data.weeklyTrend);
            }

            // Populate Platform Connection Status Card
            const sheetsBadge = document.getElementById("home-sheets-badge");
            const sheetsDetail = document.getElementById("home-sheets-detail");
            const dbCount = document.getElementById("home-db-count");
            const dbBadge = document.getElementById("home-supabase-badge");
            const twilioPhone = document.getElementById("home-twilio-phone");
            const twilioBadge = document.getElementById("home-twilio-badge");

            if (sheetsBadge || dbBadge || twilioBadge) {
                try {
                    const statusRes = await fetch('/api/sync-status');
                    if (statusRes.ok) {
                        const statusData = await statusRes.json();
                        
                        // Google Sheets Status
                        if (statusData.google_sheets) {
                            if (statusData.google_sheets.connected) {
                                if (sheetsBadge) {
                                    sheetsBadge.textContent = "Active";
                                    sheetsBadge.className = "px-2 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/30";
                                }
                                if (sheetsDetail) {
                                    sheetsDetail.textContent = "Synced with CRM logger";
                                }
                            } else {
                                if (sheetsBadge) {
                                    sheetsBadge.textContent = "Error";
                                    sheetsBadge.className = "px-2 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400 border border-red-100 dark:border-red-900/30";
                                }
                                if (sheetsDetail) {
                                    sheetsDetail.textContent = "Authentication failed";
                                }
                            }
                        }

                        // Supabase Status
                        if (statusData.supabase) {
                            if (statusData.supabase.configured) {
                                if (dbBadge) {
                                    dbBadge.textContent = "Online";
                                    dbBadge.className = "px-2 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/30";
                                }
                                if (dbCount) {
                                    dbCount.textContent = `${statusData.supabase.record_count} recording records`;
                                }
                            } else {
                                if (dbBadge) {
                                    dbBadge.textContent = "Offline";
                                    dbBadge.className = "px-2 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400 border border-red-100 dark:border-red-900/30";
                                }
                                if (dbCount) {
                                    dbCount.textContent = "Database unconfigured";
                                }
                            }
                        }

                        // Twilio Status
                        if (statusData.twilio) {
                            if (statusData.twilio.configured) {
                                if (twilioBadge) {
                                    twilioBadge.textContent = "Active";
                                    twilioBadge.className = "px-2 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/30";
                                }
                                if (twilioPhone) {
                                    twilioPhone.textContent = statusData.twilio.phone || "Voice lines active";
                                }
                            } else {
                                if (twilioBadge) {
                                    twilioBadge.textContent = "Offline";
                                    twilioBadge.className = "px-2 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400 border border-red-100 dark:border-red-900/30";
                                }
                                if (twilioPhone) {
                                    twilioPhone.textContent = "Twilio credentials missing";
                                }
                            }
                        }
                    }
                } catch (statusErr) {
                    console.warn("Failed to fetch connection status details:", statusErr);
                }
            }

            // Shared Call Card HTML template builder to keep code DRY
            const createCallItemHTML = (call) => {
                const res = call.result;
                if (!res) return "";

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

                return `
                    <div class="history-card ${urgencyBorder} border-l-[3px]" data-call-id="${call.id}">
                        <div class="space-y-1.5 flex-grow max-w-2xl text-left">
                            <div class="flex flex-wrap items-center gap-2">
                                <span class="badge badge-accent uppercase text-[9px]">${call.industry}</span>
                                <span class="badge ${urgencyBadge} uppercase text-[9px]">${res.urgency === 'high' ? '🔴 High Urgency' : res.urgency}</span>
                                <span class="badge ${followUpBadge} uppercase text-[9px]">Follow-up: ${followUpStatus}</span>
                                <span class="text-[10px] text-gray-400 dark:text-gray-500 font-medium">${formatTimestamp(call.timestamp)}${reminderStr}</span>
                            </div>
                            <h4 class="font-semibold text-gray-900 dark:text-white text-sm tracking-tight">Call with ${call.caller}</h4>
                            <p class="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed">${res.summary}</p>
                        </div>

                        <div class="flex items-center gap-4 flex-shrink-0 self-end md:self-auto">
                            <div class="text-right hidden sm:block">
                                <span class="block text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Actions</span>
                                <span class="text-xs font-semibold text-gray-800 dark:text-gray-200">${res.tasks ? res.tasks.length : 0}</span>
                            </div>
                            <div class="w-7 h-7 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-400 dark:bg-gray-800 dark:border-gray-700">
                                <i class="fa-solid fa-chevron-right text-[10px]"></i>
                            </div>
                        </div>
                    </div>
                `;
            };

            // Unified Activity Feed rendering logic
            const allRecords = await loadAllUnifiedRecords();
            let currentTab = "all"; // Default active tab

            const renderActivityFeed = (tab) => {
                currentTab = tab;
                if (!activityFeed) return;

                // Filter records based on active tab
                let filtered = [];
                if (tab === "all") {
                    filtered = allRecords.slice(0, 8); // Limit to top 8 recent items for clean layout
                } else if (tab === "hot") {
                    filtered = allRecords.filter(r => r.result && r.result.urgency === 'high');
                } else if (tab === "pending") {
                    filtered = allRecords.filter(r => r.result && (r.result.follow_up_status === 'Pending' || r.result.follow_up_needed === 'Yes'));
                }

                if (filtered.length === 0) {
                    let emptyMsg = "";
                    let emptyIcon = "fa-folder-open";
                    if (tab === "all") {
                        emptyMsg = "No client calls processed yet. Click \"Process Call\" to begin.";
                    } else if (tab === "hot") {
                        emptyMsg = "No active high-urgency alerts. All loops are closed!";
                        emptyIcon = "fa-circle-check text-emerald-500";
                    } else if (tab === "pending") {
                        emptyMsg = "No pending action items found.";
                        emptyIcon = "fa-circle-check text-emerald-500";
                    }

                    activityFeed.innerHTML = `
                        <div class="card p-6 text-center text-gray-400 text-xs flex flex-col items-center justify-center py-10 space-y-2">
                            <i class="fa-solid ${emptyIcon} text-lg"></i>
                            <span>${emptyMsg}</span>
                        </div>
                    `;
                } else {
                    activityFeed.innerHTML = "";
                    filtered.forEach(call => {
                        const tempEl = document.createElement("div");
                        tempEl.innerHTML = createCallItemHTML(call);
                        const card = tempEl.firstElementChild;
                        if (!card) return;

                        card.addEventListener("click", () => {
                            if (typeof openCallDrawer === 'function') {
                                openCallDrawer(call.id);
                            } else {
                                window.location.href = `/results/${call.id}`;
                            }
                        });

                        activityFeed.appendChild(card);
                    });
                }
            };

            // Bind Unified Activity Feed tab click handlers
            const tabAllBtn = document.getElementById("feed-tab-all");
            const tabHotBtn = document.getElementById("feed-tab-hot");
            const tabPendingBtn = document.getElementById("feed-tab-pending");

            const setupTabListeners = () => {
                const tabs = [
                    { btn: tabAllBtn, name: "all" },
                    { btn: tabHotBtn, name: "hot" },
                    { btn: tabPendingBtn, name: "pending" }
                ];

                tabs.forEach(t => {
                    if (t.btn) {
                        t.btn.addEventListener("click", () => {
                            tabs.forEach(o => {
                                if (o.btn) o.btn.classList.remove("active");
                            });
                            t.btn.classList.add("active");
                            renderActivityFeed(t.name);
                        });
                    }
                });
            };

            // Initialize feed list and bind tab events
            renderActivityFeed("all");
            setupTabListeners();

        } catch (err) {
            console.error("Dashboard stats loading failed", err);
            if (activityFeed) {
                activityFeed.innerHTML = `<div class="text-center py-6 text-red-500 text-xs font-semibold">Failed to load recent memories.</div>`;
            }
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
            tr.className = "hover:bg-violet-50/20 dark:hover:bg-violet-950/10 cursor-pointer transition-all duration-150 hover:scale-[1.005] border-b border-gray-50 dark:border-gray-800/60";

            const urgencyBadge = contact.urgency === "high"
                ? `<span class="badge bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400 uppercase text-[8px] font-bold"><i class="fa-solid fa-fire text-red-500"></i> Hot Lead</span>`
                : `<span class="badge bg-gray-50 text-gray-400 dark:bg-gray-800 dark:text-gray-500 uppercase text-[8px]">Standard</span>`;

            tr.innerHTML = `
                <td class="py-3.5 px-2">
                    <input type="checkbox" value="${contact.phone}" data-urgency="${contact.urgency}" class="recipient-checkbox h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500 accent-violet-600 dark:border-gray-700 dark:bg-gray-900 transition-all duration-150 hover:scale-110 active:scale-90">
                </td>
                <td class="py-3.5 px-3 font-semibold text-gray-950 dark:text-white">${contact.name}</td>
                <td class="py-3.5 px-3 font-mono">${contact.phone}</td>
                <td class="py-3.5 px-3 uppercase text-[10px] font-bold text-gray-400 dark:text-gray-500">${contact.industry}</td>
                <td class="py-3.5 px-3">${urgencyBadge}</td>
                <td class="py-3.5 px-3 text-right font-medium text-gray-500 dark:text-gray-400">${contact.task_count} pending</td>
            `;
            tr.addEventListener("click", (e) => {
                // Prevent triggering toggle twice if the click is on the checkbox itself
                if (e.target.type !== "checkbox") {
                    const cb = tr.querySelector(".recipient-checkbox");
                    if (cb) {
                        cb.checked = !cb.checked;
                        cb.dispatchEvent(new Event('change'));
                    }
                }
            });
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
            const isDark = document.documentElement.classList.contains("dark");
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
            document.body.classList.add("theme-transitioning");
            const isDark = document.documentElement.classList.toggle("dark");
            localStorage.setItem("theme", isDark ? "dark" : "light");
            updateThemeUI();
            setTimeout(() => {
                document.body.classList.remove("theme-transitioning");
            }, 350);
        });
    };

    // ---- GLOBAL HEADER LOGIC ----
    const initGlobalHeader = () => {
        const searchInput = document.getElementById("global-search-input");
        const datetimeDisplay = document.getElementById("header-datetime-display");
        const notificationBtn = document.getElementById("header-notification-btn");
        const notificationBadge = document.getElementById("header-notification-badge");
        const notificationDropdown = document.getElementById("header-notification-dropdown");
        const clearBtn = document.getElementById("header-notification-clear");
        const notificationList = document.getElementById("header-notification-list");
        const sheetsBadge = document.getElementById("header-sheets-badge");

        // 1. Update Sheets integration status badge dynamically
        if (sheetsBadge) {
            fetch('/api/sync-status')
                .then(res => res.json())
                .then(data => {
                    if (data && data.google_sheets) {
                        if (data.google_sheets.connected) {
                            sheetsBadge.innerHTML = `<i class="fa-brands fa-google text-emerald-500 mr-0.5"></i> Sheets Connected`;
                            sheetsBadge.className = "badge badge-green uppercase text-[9px]";
                        } else {
                            sheetsBadge.innerHTML = `<i class="fa-brands fa-google text-red-500 mr-0.5"></i> Sheets Disconnected`;
                            sheetsBadge.className = "badge badge-red uppercase text-[9px]";
                        }
                    }
                })
                .catch(err => {
                    console.warn('Failed to load sync status for header:', err);
                });
        }

        // 2. Toggle notification dropdown panel when the bell button is clicked, and close it when clicking outside.
        if (notificationBtn && notificationDropdown) {
            notificationBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                notificationDropdown.classList.toggle("opacity-0");
                notificationDropdown.classList.toggle("scale-95");
                notificationDropdown.classList.toggle("pointer-events-none");
                notificationDropdown.classList.toggle("opacity-100");
                notificationDropdown.classList.toggle("scale-100");
            });

            document.addEventListener("click", (e) => {
                if (!notificationDropdown.contains(e.target) && !notificationBtn.contains(e.target)) {
                    notificationDropdown.classList.add("opacity-0", "scale-95", "pointer-events-none");
                    notificationDropdown.classList.remove("opacity-100", "scale-100");
                }
            });
        }

        // 3. Clear button in notifications dropdown should empty the list and hide the red dot badge.
        if (clearBtn) {
            clearBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                if (notificationList) {
                    notificationList.innerHTML = `
                        <div class="px-4 py-3 text-center text-gray-400 text-xs">
                            No new alerts
                        </div>
                    `;
                }
                if (notificationBadge) {
                    notificationBadge.classList.add("hidden");
                }
            });
        }

        // 4. Update the live date/time display immediately on load and then every 60 seconds.
        if (datetimeDisplay) {
            const updateDateTime = () => {
                const now = new Date();
                const formatted = now.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                });
                datetimeDisplay.innerHTML = `<i class="fa-regular fa-clock text-gray-400"></i> ${formatted}`;
            };
            updateDateTime();
            setInterval(updateDateTime, 60000);
        }

        // 5. Synchronize #global-search-input text changes with the history timeline #search-input field (if present on the page), triggering input event.
        if (searchInput) {
            // Support auto-populating global search input if ?q= is in the URL.
            const urlParams = new URLSearchParams(window.location.search);
            const queryParam = urlParams.get('q');
            if (queryParam) {
                searchInput.value = queryParam;
            }

            const pageSearchInput = document.getElementById("search-input");
            if (pageSearchInput) {
                // If on history page, set initial search if queryParam is present
                if (queryParam) {
                    pageSearchInput.value = queryParam;
                    // Trigger input event to filter results initially
                    pageSearchInput.dispatchEvent(new Event("input", { bubbles: true }));
                }

                searchInput.addEventListener("input", (e) => {
                    pageSearchInput.value = e.target.value;
                    pageSearchInput.dispatchEvent(new Event("input", { bubbles: true }));
                });
            } else {
                // If #search-input is not present, pressing Enter on the global search input should redirect to /history?q=QUERY_STRING
                searchInput.addEventListener("keydown", (e) => {
                    if (e.key === "Enter") {
                        const val = encodeURIComponent(e.target.value.trim());
                        window.location.href = `/history?q=${val}`;
                    }
                });
            }
        }
    };

    // ---- SCREEN 6: QUICK ACTION CALL PROCESSOR (DASHBOARD SIDEBAR) ----
    const initQuickActionCard = () => {
        const tabText = document.getElementById("quick-tab-text");
        const tabAudio = document.getElementById("quick-tab-audio");
        const textContainer = document.getElementById("quick-text-container");
        const audioContainer = document.getElementById("quick-audio-container");
        const audioFileInput = document.getElementById("quick-audio-file");
        const audioFileLabel = document.getElementById("quick-audio-label");
        const industrySelect = document.getElementById("quick-industry-select");
        const submitBtn = document.getElementById("quick-submit-btn");
        const statusMsg = document.getElementById("quick-status-msg");
        const loadingIndicator = document.getElementById("quick-loading-indicator");
        const loadingText = document.getElementById("quick-loading-text");
        const loadingPercent = document.getElementById("quick-loading-percent");
        const loadingBar = document.getElementById("quick-loading-bar");
        const transcriptInput = document.getElementById("quick-transcript-input");

        if (!submitBtn) return;

        let activeTab = "text"; // "text" or "audio"
        let selectedAudioFile = null;

        // Tab selection switching
        const setTab = (tab) => {
            activeTab = tab;
            if (tab === "text") {
                tabText.classList.add("text-violet-600", "dark:text-violet-400", "border-b-2", "border-violet-500", "dark:border-violet-400", "font-semibold");
                tabText.classList.remove("text-gray-400", "dark:text-gray-500", "border-transparent", "font-medium");
                
                tabAudio.classList.remove("text-violet-600", "dark:text-violet-400", "border-b-2", "border-violet-500", "dark:border-violet-400", "font-semibold");
                tabAudio.classList.add("text-gray-400", "dark:text-gray-500", "border-transparent", "font-medium");
                
                textContainer.classList.remove("hidden");
                audioContainer.classList.add("hidden");
            } else {
                tabAudio.classList.add("text-violet-600", "dark:text-violet-400", "border-b-2", "border-violet-500", "dark:border-violet-400", "font-semibold");
                tabAudio.classList.remove("text-gray-400", "dark:text-gray-500", "border-transparent", "font-medium");
                
                tabText.classList.remove("text-violet-600", "dark:text-violet-400", "border-b-2", "border-violet-500", "dark:border-violet-400", "font-semibold");
                tabText.classList.add("text-gray-400", "dark:text-gray-500", "border-transparent", "font-medium");
                
                audioContainer.classList.remove("hidden");
                textContainer.classList.add("hidden");
            }
        };

        tabText.addEventListener("click", () => setTab("text"));
        tabAudio.addEventListener("click", () => setTab("audio"));

        // File upload selection
        audioFileInput.addEventListener("change", () => {
            if (audioFileInput.files && audioFileInput.files[0]) {
                selectedAudioFile = audioFileInput.files[0];
                audioFileLabel.textContent = selectedAudioFile.name;
                audioFileLabel.classList.add("text-violet-600", "dark:text-violet-400", "font-semibold");
            }
        });

        // Drag and drop events for the audio container
        const dropZone = audioFileInput.parentElement;
        if (dropZone) {
            ['dragenter', 'dragover'].forEach(eventName => {
                dropZone.addEventListener(eventName, (e) => {
                    e.preventDefault();
                    dropZone.classList.add("border-violet-400", "bg-violet-50/20");
                }, false);
            });

            ['dragleave', 'drop'].forEach(eventName => {
                dropZone.addEventListener(eventName, (e) => {
                    e.preventDefault();
                    dropZone.classList.remove("border-violet-400", "bg-violet-50/20");
                }, false);
            });

            dropZone.addEventListener('drop', (e) => {
                const dt = e.dataTransfer;
                const files = dt.files;
                if (files && files[0] && files[0].type.startsWith("audio/")) {
                    selectedAudioFile = files[0];
                    audioFileInput.files = files; // Sync the input files
                    audioFileLabel.textContent = selectedAudioFile.name;
                    audioFileLabel.classList.add("text-violet-600", "dark:text-violet-400", "font-semibold");
                } else {
                    showStatusMsg("Please drop a valid audio file.", false);
                }
            }, false);
        }

        const showStatusMsg = (msg, isSuccess) => {
            statusMsg.textContent = msg;
            statusMsg.className = `text-xs py-2 px-3 rounded-lg font-medium border transition-all duration-300 ${
                isSuccess 
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/50" 
                    : "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/20 dark:text-red-400 dark:border-red-900/50"
            }`;
            statusMsg.classList.remove("hidden");
            setTimeout(() => {
                statusMsg.classList.add("hidden");
            }, 6000);
        };

        const updateProgress = (text, percent) => {
            if (loadingText) loadingText.textContent = text;
            if (loadingPercent) loadingPercent.textContent = `${percent}%`;
            if (loadingBar) loadingBar.style.width = `${percent}%`;
        };

        submitBtn.addEventListener("click", async () => {
            const industry = industrySelect.value;
            statusMsg.classList.add("hidden");

            if (activeTab === "text") {
                const text = transcriptInput.value.trim();
                if (!text) {
                    showStatusMsg("Please paste a conversation transcript.", false);
                    return;
                }

                // Show processing indicator
                submitBtn.classList.add("hidden");
                loadingIndicator.classList.remove("hidden");
                
                const steps = [
                    { text: "Parsing transcript...", pct: 20 },
                    { text: "Identifying speakers...", pct: 40 },
                    { text: "Extracting intent & tasks...", pct: 70 },
                    { text: "Generating follow-up draft...", pct: 90 }
                ];

                for (const step of steps) {
                    updateProgress(step.text, step.pct);
                    await new Promise(r => setTimeout(r, 600));
                }

                try {
                    const response = await fetch("/api/process", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ text, industry })
                    });

                    if (response.ok) {
                        const newCall = await response.json();
                        
                        // Save to local storage for visual sync if used
                        const records = getRecords();
                        records.unshift(newCall);
                        saveRecords(records);
                        
                        updateProgress("Analysis completed!", 100);
                        await new Promise(r => setTimeout(r, 400));
                        
                        // Clear input
                        transcriptInput.value = "";
                        
                        // Success notification
                        showStatusMsg("Call processed successfully! Dashboard refreshed.", true);
                        
                        // Dynamically refresh dashboard stats and timeline
                        await initHomePage();
                    } else {
                        const err = await response.json();
                        showStatusMsg(err.error || "Analysis failed.", false);
                    }
                } catch (err) {
                    showStatusMsg("Network error. Please try again.", false);
                } finally {
                    loadingIndicator.classList.add("hidden");
                    submitBtn.classList.remove("hidden");
                }

            } else {
                // Audio file upload
                if (!selectedAudioFile) {
                    showStatusMsg("Please select or drop an audio file.", false);
                    return;
                }

                submitBtn.classList.add("hidden");
                loadingIndicator.classList.remove("hidden");
                updateProgress("Reading audio file...", 10);

                const reader = new FileReader();
                reader.onload = async () => {
                    const base64Data = reader.result.split(',')[1];
                    
                    const steps = [
                        { text: "Uploading audio stream...", pct: 30 },
                        { text: "Transcribing call...", pct: 60 },
                        { text: "Analyzing with Gemini...", pct: 80 },
                        { text: "Generating follow-up draft...", pct: 95 }
                    ];

                    for (const step of steps) {
                        updateProgress(step.text, step.pct);
                        await new Promise(r => setTimeout(r, 800));
                    }

                    try {
                        const response = await fetch("/api/process", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                audio: base64Data,
                                fileName: selectedAudioFile.name,
                                mimeType: selectedAudioFile.type,
                                industry
                            })
                        });

                        if (response.ok) {
                            const newCall = await response.json();
                            
                            const records = getRecords();
                            records.unshift(newCall);
                            saveRecords(records);
                            
                            updateProgress("Analysis completed!", 100);
                            await new Promise(r => setTimeout(r, 400));
                            
                            // Reset inputs
                            selectedAudioFile = null;
                            audioFileInput.value = "";
                            audioFileLabel.textContent = "Import .mp3, .wav, .m4a";
                            audioFileLabel.classList.remove("text-violet-600", "dark:text-violet-400", "font-semibold");
                            
                            showStatusMsg("Audio call processed! Dashboard refreshed.", true);
                            await initHomePage();
                        } else {
                            const err = await response.json();
                            showStatusMsg(err.error || "Audio analysis failed.", false);
                        }
                    } catch (err) {
                        showStatusMsg("Network error processing audio.", false);
                    } finally {
                        loadingIndicator.classList.add("hidden");
                        submitBtn.classList.remove("hidden");
                    }
                };

                reader.onerror = () => {
                    showStatusMsg("Failed to read file.", false);
                    loadingIndicator.classList.add("hidden");
                    submitBtn.classList.remove("hidden");
                };

                reader.readAsDataURL(selectedAudioFile);
            }
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
    initGlobalHeader();
    initQuickActionCard();
    initDrawerEvents();
    initLandingDemo();
    initCrmSheetsDemo();
    initScrollReveal();
});

// ---- M4: SIDE DRAWER LOGIC ----
const openCallDrawer = async (callId) => {
    const overlay = document.getElementById("drawer-overlay");
    const drawer = document.getElementById("call-drawer");
    const content = document.getElementById("drawer-content");

    if (!overlay || !drawer || !content) {
        window.location.href = `/results/${callId}`;
        return;
    }

    // Show Drawer
    overlay.classList.remove("hidden");
    void overlay.offsetWidth; // force reflow
    overlay.classList.remove("opacity-0");
    overlay.classList.add("opacity-100");
    
    drawer.classList.remove("translate-x-full");
    drawer.classList.add("translate-x-0");

    content.innerHTML = `
        <div class="flex items-center justify-center py-20">
            <i class="fa-solid fa-spinner animate-spin text-3xl text-violet-500"></i>
        </div>
    `;

    try {
        const res = await fetch(`/api/recordings/${callId}`);
        const callData = await res.json();
        
        if (!callData || callData.error) {
            content.innerHTML = `<div class="text-red-500 p-4">${callData?.error || 'Error loading call details.'}</div>`;
            return;
        }

        const data = callData.result;
        
        let html = `
            <!-- Summary -->
            <div>
                <h4 class="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-bold mb-2">Summary</h4>
                <p class="text-sm text-gray-800 dark:text-gray-200 leading-relaxed">${data.summary || 'N/A'}</p>
            </div>

            <!-- Tags -->
            <div class="grid grid-cols-2 gap-4">
                <div class="p-3 bg-gray-50 dark:bg-slate-800/50 rounded-xl border border-gray-100 dark:border-slate-700">
                    <span class="block text-[10px] uppercase font-bold text-gray-400 dark:text-gray-500 mb-1">Intent</span>
                    <span class="font-semibold text-gray-900 dark:text-white text-sm">${data.intent || 'Unknown'}</span>
                </div>
                <div class="p-3 bg-gray-50 dark:bg-slate-800/50 rounded-xl border border-gray-100 dark:border-slate-700">
                    <span class="block text-[10px] uppercase font-bold text-gray-400 dark:text-gray-500 mb-1">Urgency</span>
                    <span class="font-semibold text-gray-900 dark:text-white text-sm capitalize">${data.urgency || 'Normal'}</span>
                </div>
            </div>
        `;

        if (callData.recording_url) {
            html += `
            <div>
                <h4 class="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-bold mb-2">Audio</h4>
                <audio controls class="w-full h-10 rounded-lg outline-none">
                    <source src="${callData.recording_url}" type="audio/mpeg">
                    Your browser does not support the audio element.
                </audio>
            </div>
            `;
        }

        // Added Call Transcription Panel
        if (callData.transcript) {
            html += `
            <div>
                <h4 class="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-bold mb-2">Transcript</h4>
                <div class="p-3 bg-gray-50 dark:bg-slate-800/40 rounded-xl border border-gray-100 dark:border-slate-800 text-xs text-gray-600 dark:text-gray-400 max-h-36 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                    ${callData.transcript}
                </div>
            </div>
            `;
        }

        if (data.objections && data.objections.length > 0) {
            html += `
            <div>
                <h4 class="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-bold mb-2">Objections</h4>
                <ul class="space-y-2">
                    ${data.objections.map(obj => `
                        <li class="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                            <i class="fa-solid fa-triangle-exclamation text-amber-500 mt-1 text-[10px]"></i>
                            <span>${obj}</span>
                        </li>
                    `).join('')}
                </ul>
            </div>
            `;
        }

        if (data.tasks && data.tasks.length > 0) {
            html += `
            <div>
                <h4 class="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-bold mb-2">Tasks</h4>
                <ul class="space-y-2">
                    ${data.tasks.map(task => {
                        const priority = (task.priority || 'medium').toLowerCase();
                        let priorityClass = '';
                        if (priority === 'high') {
                            priorityClass = 'bg-red-50 text-red-600 dark:bg-red-950/20 dark:text-red-400 border-red-100 dark:border-red-900/30';
                        } else if (priority === 'medium') {
                            priorityClass = 'bg-blue-50 text-blue-600 dark:bg-blue-950/20 dark:text-blue-400 border-blue-100 dark:border-blue-900/30';
                        } else {
                            priorityClass = 'bg-gray-50 text-gray-600 dark:bg-gray-800/30 dark:text-gray-400 border-gray-100 dark:border-gray-700/50';
                        }
                        
                        return `
                        <li class="flex flex-col gap-1.5 text-xs text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-slate-800/50 p-2.5 rounded-lg border border-gray-100 dark:border-slate-700">
                            <div class="flex items-start gap-2">
                                <i class="fa-regular fa-square-check text-emerald-500 mt-0.5"></i>
                                <span class="font-medium text-gray-900 dark:text-white">${task.title || task}</span>
                            </div>
                            <div class="flex items-center gap-2 pl-5">
                                <span class="px-1.5 py-0.5 rounded text-[8px] font-bold border uppercase tracking-wider ${priorityClass}">${priority}</span>
                                <span class="text-[9px] text-gray-400 font-medium">Due: ${task.due || 'TBD'}</span>
                            </div>
                        </li>
                        `;
                    }).join('')}
                </ul>
            </div>
            `;
        }
        
        html += `
            <div class="pt-4 border-t border-gray-200 dark:border-slate-800">
                <a href="/results/${callId}" class="w-full btn-primary px-4 py-2.5 rounded-lg text-sm text-center block transition-all hover:scale-[1.02] active:scale-95">
                    View Full Details
                </a>
            </div>
        `;

        content.innerHTML = html;

    } catch (e) {
        content.innerHTML = `<div class="text-red-500 p-4">Failed to load details.</div>`;
    }
};

const closeCallDrawer = () => {
    const overlay = document.getElementById("drawer-overlay");
    const drawer = document.getElementById("call-drawer");
    if (!overlay || !drawer) return;

    overlay.classList.remove("opacity-100");
    overlay.classList.add("opacity-0");
    drawer.classList.remove("translate-x-0");
    drawer.classList.add("translate-x-full");

    setTimeout(() => {
        overlay.classList.add("hidden");
    }, 300);
};

const initDrawerEvents = () => {
    const overlay = document.getElementById("drawer-overlay");
    const closeBtn = document.getElementById("close-drawer");

    if (overlay) overlay.addEventListener("click", closeCallDrawer);
    if (closeBtn) closeBtn.addEventListener("click", closeCallDrawer);
};

// ---- M4: LANDING PAGE DEMO LOGIC ----
const initLandingDemo = () => {
    const playBtn = document.getElementById("play-demo-btn");
    const overlay = document.getElementById("play-demo-overlay");
    const contentBox = document.getElementById("demo-content");
    
    // Core dynamic elements inside the 4 cards
    const card1 = document.getElementById("sim-card-1");
    const card2 = document.getElementById("sim-card-2");
    const card3 = document.getElementById("sim-card-3");
    const card4 = document.getElementById("sim-card-4");
    
    const cardContainers = document.querySelectorAll(".flash-card-container");
    
    const transcriptEl = document.getElementById("demo-transcript");
    const draftEl = document.getElementById("demo-draft");
    const statusEl = document.getElementById("demo-status");
    const resetBtn = document.getElementById("reset-demo-btn");
    const canvas = document.getElementById("voice-wave-canvas");
    
    // Card-specific inner elements for fade-in animations
    const spinnerEl = document.getElementById("demo-analyzing-spinner");
    const tagsEl = document.getElementById("demo-ai-tags");
    const sheetsRowEl = document.getElementById("demo-sheets-row");

    if (!playBtn) return; // Not on landing page

    const fullTranscript = '"Hello, I need to check IAS exam details and coaching installment pricing. Can you schedule a demo slot this Saturday?"';
    const fullDraft = '"Hi Rahul, I\'ve reserved your seat for this Saturday\'s IAS Demo Class. Here are details on installment structures..."';

    let typingTimeout = null;
    let transitionTimeouts = [];
    let isPlaying = false;
    let wavePhase = 0;
    let animationFrameId = null;

    // --- CANVAS VISUALIZER CODE ---
    let ctx = canvas ? canvas.getContext("2d") : null;

    const resizeCanvas = () => {
        if (!canvas) return;
        canvas.width = window.innerWidth;
        canvas.height = canvas.parentElement.clientHeight || 180;
    };

    if (canvas) {
        resizeCanvas();
        window.addEventListener("resize", resizeCanvas);
    }

    const drawWaveform = () => {
        if (!canvas || !ctx) return;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        const width = canvas.width;
        const height = canvas.height;
        const centerY = height / 2;
        
        wavePhase += 0.05;
        
        const state = statusEl.textContent.toLowerCase();

        if (state.includes("listening")) {
            ctx.lineWidth = 1.5;
            const waves = [
                { color: "rgba(124, 58, 237, 0.45)", freq: 0.005, amp: 55, speed: 0.04 },
                { color: "rgba(59, 130, 246, 0.35)", freq: 0.012, amp: 38, speed: -0.05 },
                { color: "rgba(167, 139, 250, 0.25)", freq: 0.008, amp: 48, speed: 0.03 },
                { color: "rgba(99, 102, 241, 0.20)", freq: 0.018, amp: 28, speed: -0.02 }
            ];

            waves.forEach(w => {
                ctx.beginPath();
                ctx.strokeStyle = w.color;
                const speechJitter = 0.5 + Math.abs(Math.sin(wavePhase * 3)) * 0.5;
                const currentAmp = w.amp * speechJitter;
                for (let x = 0; x < width; x++) {
                    const envelope = Math.sin((x / width) * Math.PI);
                    const y = centerY + Math.sin(x * w.freq + wavePhase * w.speed * 8) * currentAmp * envelope;
                    if (x === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.stroke();
            });

        } else if (state.includes("processing") || state.includes("syncing")) {
            const radius = 35 + Math.sin(wavePhase * 2) * 5;
            ctx.save();
            ctx.translate(width / 2, centerY);
            ctx.rotate(wavePhase * 0.3);
            const numBars = 36;
            ctx.lineWidth = 2;
            for (let i = 0; i < numBars; i++) {
                const angle = (i / numBars) * Math.PI * 2;
                const barHeight = 5 + Math.sin(wavePhase * 4 + i) * 5;
                const startX = Math.cos(angle) * radius;
                const startY = Math.sin(angle) * radius;
                const endX = Math.cos(angle) * (radius + barHeight);
                const endY = Math.sin(angle) * (radius + barHeight);
                const opacity = 0.2 + (Math.sin(wavePhase * 2 + i * 0.15) * 0.25);
                ctx.strokeStyle = `rgba(139, 92, 246, ${opacity})`;
                ctx.beginPath();
                ctx.moveTo(startX, startY);
                ctx.lineTo(endX, endY);
                ctx.stroke();
            }
            const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, radius + 10);
            glow.addColorStop(0, "rgba(124, 58, 237, 0.15)");
            glow.addColorStop(0.7, "rgba(139, 92, 246, 0.04)");
            glow.addColorStop(1, "transparent");
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(0, 0, radius + 10, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

        } else if (state.includes("drafting")) {
            ctx.lineWidth = 1.5;
            const waves = [
                { color: "rgba(16, 185, 129, 0.40)", freq: 0.006, amp: 45, speed: 0.03 },
                { color: "rgba(139, 92, 246, 0.28)", freq: 0.012, amp: 30, speed: -0.025 }
            ];
            waves.forEach(w => {
                ctx.beginPath();
                ctx.strokeStyle = w.color;
                const currentAmp = w.amp * (0.8 + Math.cos(wavePhase * 1.5) * 0.2);
                for (let x = 0; x < width; x++) {
                    const envelope = Math.sin((x / width) * Math.PI);
                    const y = centerY + Math.sin(x * w.freq + wavePhase * w.speed * 8) * currentAmp * envelope;
                    if (x === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.stroke();
            });

        } else {
            ctx.lineWidth = 1.5;
            const waves = [
                { color: "rgba(124, 58, 237, 0.28)", freq: 0.004, amp: 45, speed: 0.015 },
                { color: "rgba(59, 130, 246, 0.22)", freq: 0.009, amp: 32, speed: -0.01 }
            ];
            waves.forEach(w => {
                ctx.beginPath();
                ctx.strokeStyle = w.color;
                const currentAmp = w.amp * (0.8 + Math.cos(wavePhase * 0.5) * 0.2);
                for (let x = 0; x < width; x++) {
                    const envelope = Math.sin((x / width) * Math.PI);
                    const y = centerY + Math.sin(x * w.freq + wavePhase * w.speed * 8) * currentAmp * envelope;
                    if (x === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.stroke();
            });
        }

        animationFrameId = requestAnimationFrame(drawWaveform);
    };

    if (canvas && ctx) {
        drawWaveform();
    }

    const typeText = (element, text, speed, callback) => {
        let i = 0;
        element.textContent = "";
        element.classList.remove("border-transparent");
        element.classList.add("border-violet-500", "animate-pulse");
        
        const typeChar = () => {
            if (i < text.length) {
                element.textContent += text.charAt(i);
                i++;
                typingTimeout = setTimeout(typeChar, speed);
            } else {
                element.classList.remove("border-violet-500", "animate-pulse");
                element.classList.add("border-transparent");
                if (callback) callback();
            }
        };
        typeChar();
    };

    const runDemo = () => {
        if (isPlaying) return;
        isPlaying = true;

        // Hide overlay, unblur content
        if (overlay) {
            overlay.classList.add("opacity-0");
            setTimeout(() => overlay.classList.add("hidden"), 300);
        }
        if (contentBox) {
            contentBox.classList.remove("opacity-30", "blur-[2px]");
        }
        
        // Reset sub-elements states
        if (transcriptEl) transcriptEl.textContent = "Connecting call...";
        if (draftEl) draftEl.textContent = "Follow-up will type itself...";
        if (spinnerEl) spinnerEl.classList.add("hidden");
        if (tagsEl) tagsEl.classList.add("opacity-0");
        if (sheetsRowEl) sheetsRowEl.classList.add("opacity-0");

        // Lock manual hover effects
        cardContainers.forEach(container => {
            container.classList.add("simulating");
        });

        // Unflip all cards first to start simulation fresh
        document.querySelectorAll(".flash-card").forEach(c => c.classList.remove("flipped"));
        
        resetBtn.classList.remove("hidden");
        
        statusEl.textContent = "Listening...";
        statusEl.className = "px-2.5 py-1 rounded bg-blue-50 text-blue-600 font-semibold text-[10px] border border-blue-100/50 animate-pulse";

        // Step 1: Flip Card 1 and start typing transcript
        transitionTimeouts.push(setTimeout(() => {
            if (card1) card1.classList.add("flipped");
            
            typeText(transcriptEl, fullTranscript, 30, () => {
                // Step 2: Flip Card 2 (AI Parsing)
                statusEl.textContent = "Processing";
                statusEl.className = "px-2.5 py-1 rounded bg-amber-50 text-amber-600 font-semibold text-[10px] border border-amber-100/50";
                
                transitionTimeouts.push(setTimeout(() => {
                    if (card2) card2.classList.add("flipped");
                    if (spinnerEl) spinnerEl.classList.remove("hidden");
                    
                    transitionTimeouts.push(setTimeout(() => {
                        if (spinnerEl) spinnerEl.classList.add("hidden");
                        if (tagsEl) {
                            tagsEl.classList.remove("opacity-0");
                            tagsEl.classList.add("opacity-100");
                        }
                        
                        // Step 3: Flip Card 3 (CRM Sync)
                        statusEl.textContent = "Syncing Sheets";
                        statusEl.className = "px-2.5 py-1 rounded bg-emerald-55 text-emerald-600 font-semibold text-[10px] border border-emerald-100/50";
                        
                        transitionTimeouts.push(setTimeout(() => {
                            if (card3) card3.classList.add("flipped");
                            transitionTimeouts.push(setTimeout(() => {
                                if (sheetsRowEl) {
                                    sheetsRowEl.classList.remove("opacity-0");
                                    sheetsRowEl.classList.add("opacity-100");
                                }
                                
                                // Step 4: Flip Card 4 (WhatsApp follow-up)
                                statusEl.textContent = "Drafting Follow-up";
                                statusEl.className = "px-2.5 py-1 rounded bg-violet-50 text-violet-700 font-semibold text-[10px] border border-violet-100/50";
                                
                                transitionTimeouts.push(setTimeout(() => {
                                    if (card4) card4.classList.add("flipped");
                                    
                                    typeText(draftEl, fullDraft, 20, () => {
                                        statusEl.textContent = "Completed";
                                        statusEl.className = "px-2.5 py-1 rounded bg-emerald-50 text-emerald-600 font-semibold text-[10px] border border-emerald-100/50";
                                        isPlaying = false;
                                    });
                                }, 1000));
                                
                            }, 500));
                        }, 1500));
                        
                    }, 1500));
                }, 800));
            });
        }, 300));
    };

    const resetDemo = () => {
        isPlaying = false;
        clearTimeout(typingTimeout);
        transitionTimeouts.forEach(t => clearTimeout(t));
        transitionTimeouts = [];
        
        // Restore overlay and remove hover lock
        if (overlay) {
            overlay.classList.remove("hidden");
            void overlay.offsetWidth;
            overlay.classList.remove("opacity-0");
        }
        if (contentBox) {
            contentBox.classList.add("opacity-30", "blur-[2px]");
        }
        
        cardContainers.forEach(container => {
            container.classList.remove("simulating");
        });

        // Unflip all cards
        document.querySelectorAll(".flash-card").forEach(c => c.classList.remove("flipped"));
        
        // Clear content
        if (transcriptEl) transcriptEl.textContent = "Click Simulate to begin...";
        if (draftEl) draftEl.textContent = "Follow-up will type itself...";
        if (spinnerEl) spinnerEl.classList.add("hidden");
        if (tagsEl) tagsEl.classList.add("opacity-0");
        if (sheetsRowEl) sheetsRowEl.classList.add("opacity-0");
        
        statusEl.textContent = "Ready";
        statusEl.className = "px-2.5 py-1 rounded bg-emerald-55 text-emerald-600 font-semibold text-[10px] border border-emerald-100/50";
        resetBtn.classList.add("hidden");
    };

    // --- OUTBOUND CALL DEMO TRIGGER ---
    const triggerCallBtn = document.getElementById("trigger-call-demo-btn");
    const demoPhoneInput = document.getElementById("demo-phone-input");
    const demoCallStatusMsg = document.getElementById("demo-call-status-msg");

    if (triggerCallBtn && demoPhoneInput) {
        triggerCallBtn.addEventListener("click", async () => {
            const phone = demoPhoneInput.value.trim();
            if (!phone) {
                alert("Please enter your phone number with country code (e.g. +91...)");
                return;
            }

            triggerCallBtn.disabled = true;
            const origHTML = triggerCallBtn.innerHTML;
            triggerCallBtn.innerHTML = `<i class="fa-solid fa-spinner animate-spin"></i> Dialing...`;

            if (demoCallStatusMsg) {
                demoCallStatusMsg.textContent = "Connecting to Twilio outbound engine...";
                demoCallStatusMsg.className = "text-[10px] text-violet-400 font-semibold mt-1 block animate-pulse";
                demoCallStatusMsg.classList.remove("hidden");
            }

            statusEl.textContent = "Listening...";
            statusEl.className = "px-2.5 py-1 rounded bg-blue-50 text-blue-600 font-semibold text-[10px] border border-blue-100/50 animate-pulse";
            resetBtn.classList.remove("hidden");
            if (overlay) overlay.classList.add("opacity-0");
            setTimeout(() => { if (overlay) overlay.classList.add("hidden") }, 300);
            if (contentBox) contentBox.classList.remove("opacity-30", "blur-[2px]");

            try {
                const res = await fetch("/api/trigger-demo-call", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ phone })
                });
                const data = await res.json();

                if (data.success) {
                    if (demoCallStatusMsg) {
                        demoCallStatusMsg.textContent = "📞 Phone ringing! Answer to talk with Heleo AI Receptionist.";
                        demoCallStatusMsg.className = "text-[10px] text-emerald-500 font-semibold mt-1 block";
                    }
                } else {
                    if (demoCallStatusMsg) {
                        demoCallStatusMsg.textContent = `❌ Call failed: ${data.error}`;
                        demoCallStatusMsg.className = "text-[10px] text-red-500 font-semibold mt-1 block";
                    }
                    triggerCallBtn.disabled = false;
                    triggerCallBtn.innerHTML = origHTML;
                    statusEl.textContent = "Ready";
                    statusEl.className = "px-2.5 py-1 rounded bg-emerald-55 text-emerald-600 font-semibold text-[10px] border border-emerald-100/50";
                }
            } catch (err) {
                if (demoCallStatusMsg) {
                    demoCallStatusMsg.textContent = `❌ Network error: ${err.message}`;
                    demoCallStatusMsg.className = "text-[10px] text-red-500 font-semibold mt-1 block";
                }
                triggerCallBtn.disabled = false;
                triggerCallBtn.innerHTML = origHTML;
                statusEl.textContent = "Ready";
                statusEl.className = "px-2.5 py-1 rounded bg-emerald-55 text-emerald-600 font-semibold text-[10px] border border-emerald-100/50";
            }
        });
    }

    playBtn.addEventListener("click", runDemo);
    resetBtn.addEventListener("click", resetDemo);
};

// ---- M4: CRM & SHEETS AUTO-FILING SIMULATOR ----
const initCrmSheetsDemo = () => {
    const runBtn = document.getElementById("run-sync-demo-btn");
    const resetBtn = document.getElementById("reset-sync-demo-btn");
    
    if (!runBtn) return;
    
    const callTimer = document.getElementById("call-timer");
    const callTimerIdle = document.getElementById("call-timer-idle");
    const avatarIcon = document.getElementById("agent-avatar-icon");
    const callSubtitle = document.getElementById("call-subtitle");
    const dialogHistory = document.getElementById("phone-dialog-history");
    const dialogPlaceholder = document.getElementById("phone-dialog-placeholder");
    
    const pulse1 = document.getElementById("pulse-c1");
    const pulse2 = document.getElementById("pulse-c2");
    const pulse3 = document.getElementById("pulse-c3");
    
    const scellTime = document.getElementById("scell-time");
    const scellContact = document.getElementById("scell-contact");
    const scellCourse = document.getElementById("scell-course");
    const scellObjections = document.getElementById("scell-objections");
    const scellStatus = document.getElementById("scell-status");
    
    let timerInterval = null;
    let timeouts = [];
    let isRunning = false;

    const typeCell = (element, text, speed, callback) => {
        let i = 0;
        element.textContent = "";
        element.classList.add("typing-cell");
        
        const typeChar = () => {
            if (i < text.length) {
                element.textContent += text.charAt(i);
                i++;
                timeouts.push(setTimeout(typeChar, speed));
            } else {
                element.classList.remove("typing-cell");
                if (callback) callback();
            }
        };
        typeChar();
    };

    const addDialogBubble = (sender, text) => {
        if (dialogPlaceholder) {
            dialogPlaceholder.style.display = "none";
        }
        
        const bubble = document.createElement("div");
        bubble.className = `phone-dialog-bubble ${sender}`;
        bubble.textContent = text;
        dialogHistory.appendChild(bubble);
        dialogHistory.scrollTop = dialogHistory.scrollHeight;
    };

    const runSyncDemo = () => {
        if (isRunning) return;
        isRunning = true;
        
        runBtn.disabled = true;
        runBtn.classList.add("opacity-50");
        resetBtn.classList.remove("hidden");
        resetBtn.disabled = true;
        resetBtn.classList.add("opacity-50");
        
        if (callTimerIdle) callTimerIdle.classList.add("hidden");
        if (callTimer) {
            callTimer.classList.remove("hidden");
            callTimer.textContent = "CALL LIVE: 00:00";
        }
        
        let seconds = 0;
        timerInterval = setInterval(() => {
            seconds++;
            const secStr = seconds < 10 ? `0${seconds}` : seconds;
            if (callTimer) callTimer.textContent = `CALL LIVE: 00:${secStr}`;
        }, 1000);

        if (pulse1) pulse1.style.display = "block";
        if (pulse2) pulse2.style.display = "block";
        if (pulse3) pulse3.style.display = "block";
        if (avatarIcon) avatarIcon.classList.add("active-speaking");
        if (callSubtitle) {
            callSubtitle.textContent = "AI Agent Connected";
            callSubtitle.className = "text-[10px] font-bold tracking-wider text-violet-400 uppercase animate-pulse";
        }
        
        if (dialogHistory) {
            dialogHistory.innerHTML = "";
        }

        // 1. Dialogue bubble 1
        timeouts.push(setTimeout(() => {
            addDialogBubble("customer", "Hello, I wanted to inquire about the UPSC IAS foundation course fees. Do you have any demo classes this Saturday? Also, can I pay in installments?");
        }, 1000));

        // 2. Dialogue bubble 2
        timeouts.push(setTimeout(() => {
            addDialogBubble("agent", "Hi! Yes, we have a demo class scheduled this Saturday at 10:00 AM. I've reserved a seat for you. Regarding fees, the course fee is ₹45,000, and we offer installment EMI options.");
        }, 4000));

        // 3. Dialogue bubble 3
        timeouts.push(setTimeout(() => {
            addDialogBubble("customer", "That sounds perfect. My name is Rahul R. Please send the EMI details to my WhatsApp.");
        }, 7500));

        // 4. Dialogue bubble 4
        timeouts.push(setTimeout(() => {
            addDialogBubble("agent", "Got it, Rahul. I've updated your record and confirmed your demo seat. I will automatically dispatch the installment payment link via WhatsApp right now.");
        }, 10500));

        // 5. Hang up Call (at 13.5s)
        timeouts.push(setTimeout(() => {
            clearInterval(timerInterval);
            if (pulse1) pulse1.style.display = "none";
            if (pulse2) pulse2.style.display = "none";
            if (pulse3) pulse3.style.display = "none";
            if (avatarIcon) avatarIcon.classList.remove("active-speaking");
            if (callTimer) {
                callTimer.innerHTML = '<i class="fa-solid fa-phone-slash text-red-500 mr-1"></i> CALL ENDED';
                callTimer.className = "text-red-400 font-bold";
            }
            if (callSubtitle) {
                callSubtitle.textContent = "Processing Call...";
                callSubtitle.className = "text-[10px] font-bold tracking-wider text-amber-500 uppercase animate-pulse";
            }

            // 6. Auto-Filing in Google Sheets CRM starts (at 14.5s)
            timeouts.push(setTimeout(() => {
                const cells = [
                    document.getElementById("srow-num"),
                    scellTime,
                    scellContact,
                    scellCourse,
                    scellObjections,
                    scellStatus
                ];
                cells.forEach(c => {
                    if (c) c.classList.add("highlight-new");
                });

                if (callSubtitle) {
                    callSubtitle.textContent = "Syncing CRM Sheets...";
                    callSubtitle.className = "text-[10px] font-bold tracking-wider text-emerald-500 uppercase animate-pulse";
                }

                if (scellTime) scellTime.textContent = "05:30 PM";
                
                if (scellStatus) {
                    scellStatus.innerHTML = '<span class="px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 text-[9px] font-bold border border-amber-100 animate-pulse">⌛ Parsing...</span>';
                }

                typeCell(scellContact, "Rahul R.", 60, () => {
                    typeCell(scellCourse, "UPSC Prep", 60, () => {
                        typeCell(scellObjections, "EMI & Fees Plan", 60, () => {
                            if (scellStatus) {
                                scellStatus.innerHTML = '<span class="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[9px] font-bold border border-emerald-100">✅ Synced</span>';
                            }
                            if (callSubtitle) {
                                callSubtitle.textContent = "Session Complete";
                                callSubtitle.className = "text-[10px] font-bold tracking-wider text-emerald-600 uppercase";
                            }
                            isRunning = false;
                            resetBtn.disabled = false;
                            resetBtn.classList.remove("opacity-50");
                        });
                    });
                });

            }, 1000));

        }, 13500));
    };

    const resetSyncDemo = () => {
        isRunning = false;
        clearInterval(timerInterval);
        timeouts.forEach(t => clearTimeout(t));
        timeouts = [];
        
        runBtn.disabled = false;
        runBtn.classList.remove("opacity-50");
        resetBtn.classList.add("hidden");
        
        if (callTimerIdle) callTimerIdle.classList.remove("hidden");
        if (callTimer) {
            callTimer.classList.add("hidden");
            callTimer.textContent = "CALL LIVE: 00:00";
            callTimer.className = "text-emerald-400";
        }
        if (pulse1) pulse1.style.display = "none";
        if (pulse2) pulse2.style.display = "none";
        if (pulse3) pulse3.style.display = "none";
        if (avatarIcon) avatarIcon.classList.remove("active-speaking");
        if (callSubtitle) {
            callSubtitle.textContent = "Click below to start";
            callSubtitle.className = "text-[10px] font-bold tracking-wider text-slate-400 uppercase";
        }
        if (dialogHistory) {
            dialogHistory.innerHTML = "";
            if (dialogPlaceholder) {
                dialogPlaceholder.style.display = "block";
                dialogHistory.appendChild(dialogPlaceholder);
            }
        }

        const dynamicCells = [
            document.getElementById("srow-num"),
            scellTime,
            scellContact,
            scellCourse,
            scellObjections,
            scellStatus
        ];
        dynamicCells.forEach(c => {
            if (c) {
                c.classList.remove("highlight-new");
                if (c.id !== "srow-num") c.textContent = "—";
            }
        });
    };

    runBtn.addEventListener("click", runSyncDemo);
    resetBtn.addEventListener("click", resetSyncDemo);
};

// ---- M4: SCROLL REVEAL (INTERSECTION OBSERVER) ----
const initScrollReveal = () => {
    const observerOptions = {
        root: null,
        rootMargin: "0px",
        threshold: 0.1
    };

    const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add("opacity-100", "translate-y-0");
                entry.target.classList.remove("opacity-0", "translate-y-10");
                obs.unobserve(entry.target);
            }
        });
    }, observerOptions);

    // Apply to sections, cards, or major blocks that don't already have an animation class
    const revealElements = document.querySelectorAll("section, .card, .history-card, .stat-card");
    revealElements.forEach(el => {
        // Skip elements that already have complex animations
        if (!el.classList.contains('animate-fade-in')) {
            el.classList.add("transition-all", "duration-700", "ease-out", "opacity-0", "translate-y-10");
            observer.observe(el);
        }
    });
};

