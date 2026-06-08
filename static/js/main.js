// Comms AI — Frontend Logic

document.addEventListener("DOMContentLoaded", () => {

    // ---- LOCAL STORAGE STATE ----
    const getRecords = () => JSON.parse(localStorage.getItem("commsai_records")) || [];
    const saveRecords = (records) => localStorage.setItem("commsai_records", JSON.stringify(records));

    const updateStats = () => {
        const records = getRecords();
        const el = (id) => document.getElementById(id);
        if (!el("stat-total-calls")) return;

        let totalTasks = 0, urgentTasks = 0;
        records.forEach(r => {
            if (r.result && r.result.tasks) {
                totalTasks += r.result.tasks.length;
                if (r.result.urgency === "high") {
                    urgentTasks += r.result.tasks.filter(t => t.priority === "high").length;
                }
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

        // Processing animation
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

        // File upload
        if (audioInput) {
            audioInput.addEventListener("change", () => {
                if (audioInput.files && audioInput.files[0]) {
                    textInput.value = `[Uploaded audio: ${audioInput.files[0].name}]\n\nProcessing speech-to-text...`;
                    textInput.focus();
                }
            });
        }

        processBtn.addEventListener("click", () => {
            const transcript = textInput.value.trim();
            if (!transcript) {
                alert("Please paste a transcript or select a demo preset first.");
                return;
            }
            runProcessing(transcript, selectedIndustry);
        });
    };

    // ---- SCREEN 2: RESULTS PAGE ----
    const initResultsPage = () => {
        if (typeof window.CURRENT_CALL_ID === 'undefined') return;

        const callId = window.CURRENT_CALL_ID;
        const records = getRecords();
        const idx = records.findIndex(r => r.id === callId);

        if (idx === -1) {
            alert("Record not found.");
            window.location.href = "/";
            return;
        }

        const call = records[idx];
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
        document.getElementById("save-approve-btn").addEventListener("click", () => {
            res.summary = document.getElementById("call-summary").value.trim();
            res.caller_name = document.getElementById("field-caller-name").value.trim();
            res.policy_type = document.getElementById("field-policy-type").value.trim();
            res.urgency = document.getElementById("field-urgency").value;
            res.intent = document.getElementById("field-intent").value.trim();
            res.follow_ups[activeTab] = msgTextarea.value.trim();
            res.objections = Array.from(document.querySelectorAll(".objection-item-input")).map(i => i.value.trim());
            res.missing_info = Array.from(document.querySelectorAll(".missing-item-input")).map(i => i.value.trim());

            records[idx] = call;
            saveRecords(records);

            const saveBtn = document.getElementById("save-approve-btn");
            saveBtn.innerHTML = `<i class="fa-solid fa-spinner animate-spin"></i> Saving...`;
            setTimeout(() => { window.location.href = "/history"; }, 600);
        });

    };

    // ---- SCREEN 3: HISTORY PAGE ----
    const initHistoryPage = () => {
        const historyList = document.getElementById("history-list");
        const emptyState = document.getElementById("empty-state");
        const searchInput = document.getElementById("search-input");
        const filterChips = document.querySelectorAll("#filter-chips button");

        if (!historyList || !emptyState) return;

        let activeFilter = "all";
        let searchQuery = "";

        const renderHistory = () => {
            const records = getRecords();

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
                    ? "bg-red-50 text-red-600"
                    : res.urgency === "medium"
                    ? "bg-amber-50 text-amber-600"
                    : "bg-gray-50 text-gray-500";

                div.className = `history-card ${urgencyBorder} border-l-[3px]`;
                div.innerHTML = `
                    <div class="space-y-1.5 flex-grow max-w-2xl">
                        <div class="flex items-center gap-2">
                            <span class="badge badge-accent uppercase text-[9px]">${call.industry}</span>
                            <span class="badge ${urgencyBadge} uppercase text-[9px]">${res.urgency}</span>
                            <span class="text-[10px] text-gray-400 font-medium">${formatTimestamp(call.timestamp)}</span>
                        </div>
                        <h4 class="font-semibold text-gray-900 text-sm tracking-tight">Call with ${call.caller}</h4>
                        <p class="text-xs text-gray-500 line-clamp-2 leading-relaxed">${res.summary}</p>
                    </div>

                    <div class="flex items-center gap-4 flex-shrink-0 self-end md:self-auto">
                        <div class="text-right hidden sm:block">
                            <span class="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">Tasks</span>
                            <span class="text-xs font-semibold text-gray-800">${res.tasks ? res.tasks.length : 0}</span>
                        </div>
                        <div class="w-7 h-7 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-400">
                            <i class="fa-solid fa-chevron-right text-[10px]"></i>
                        </div>
                    </div>
                `;

                div.addEventListener("click", () => {
                    window.location.href = `/results/${call.id}`;
                });

                historyList.appendChild(div);
            });

            updateStats();
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

    // ---- INIT ----
    initUploadPage();
    initResultsPage();
    initHistoryPage();
});
