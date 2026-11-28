// =========================================================
// BANKREACH - BANKING CAMPAIGN DASHBOARD
// =========================================================

const API_BASE_URL = window.location.origin;

// HTML Elements
const form = document.getElementById("prediction-form");
const predictButton = document.getElementById("predict-button");

const resultPlaceholder = document.getElementById("result-placeholder");
const resultContent = document.getElementById("result-content");

const errorBox = document.getElementById("error-box");
const historyBody = document.getElementById("history-body");
const apiStatus = document.getElementById("api-status");


// =========================================================
// 1. API STATUS
// =========================================================

function updateApiStatus(isOnline) {

    if (isOnline) {

        apiStatus.innerHTML =
            '<span class="status-dot"></span> API Connected';

        apiStatus.style.color = "#16a36a";

    } else {

        apiStatus.innerHTML =
            '<span class="status-dot"></span> API Offline';

        apiStatus.style.color = "#c34b55";

    }

}


async function checkApi() {

    try {

        const response = await fetch("/health", {
            method: "GET",
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        console.log("Health Check:", data);

        if (data.status === "healthy" && data.model_loaded === true) {

            updateApiStatus(true);

            const thresholdElement =
                document.getElementById("threshold-value");

            if (thresholdElement) {
                thresholdElement.textContent =
                    Number(data.threshold).toFixed(2);
            }

            return true;

        }

        throw new Error("Model is not loaded");

    } catch (error) {

        console.error("API Health Check Failed:", error);

        updateApiStatus(false);

        return false;

    }

}


// =========================================================
// 2. ERROR DISPLAY
// =========================================================

function showError(message) {

    errorBox.textContent = message;

    errorBox.classList.remove("hidden");

    resultContent.classList.add("hidden");

    resultPlaceholder.classList.add("hidden");

}


// =========================================================
// 3. DISPLAY PREDICTION
// =========================================================

function displayResult(data) {

    resultPlaceholder.classList.add("hidden");

    errorBox.classList.add("hidden");

    resultContent.classList.remove("hidden");

    const isYes = data.subscription === "Yes";

    document.getElementById("result-status").textContent =
        data.prediction;

    document.getElementById("result-status")
        .classList.toggle("negative", !isYes);

    const probability = Number(data.probability);

    document.getElementById("probability-value").textContent =
        probability.toFixed(2);

    document.getElementById("probability-bar").style.width =
        `${Math.max(0, Math.min(100, probability))}%`;

    document.getElementById("subscription-value").textContent =
        data.subscription;

    const priorityElement =
        document.getElementById("priority-value");

    priorityElement.textContent = data.priority;

    priorityElement.className =
        `priority-${data.priority.toLowerCase()}`;

    document.getElementById("result-threshold").textContent =
        Number(data.threshold).toFixed(2);

    document.getElementById("recommendation").textContent =
        data.priority === "High"
            ? "High-priority lead: Contact this customer early in the campaign."
            : data.priority === "Medium"
                ? "Medium-priority lead: Contact after high-priority customers."
                : "Low-priority lead: This customer is less likely to subscribe at the current threshold.";

}


// =========================================================
// 4. CUSTOMER PREDICTION
// =========================================================

form.addEventListener("submit", async (event) => {

    event.preventDefault();

    errorBox.classList.add("hidden");

    const formData = new FormData(form);

    const customer = Object.fromEntries(formData.entries());

    ["age", "campaign", "previous"].forEach(key => {
        customer[key] = Number(customer[key]);
    });

    predictButton.disabled = true;

    predictButton.querySelector("span").textContent =
        "Predicting...";

    try {

        const response = await fetch("/predict", {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify(customer)

        });

        const data = await response.json();

        if (!response.ok) {

            throw new Error(
                typeof data.detail === "string"
                    ? data.detail
                    : JSON.stringify(data.detail || "Prediction failed")
            );

        }

        // Successful prediction confirms backend availability.
        updateApiStatus(true);

        displayResult(data);

        await loadHistory();

    } catch (error) {

        console.error("Prediction Error:", error);

        showError(error.message);

    } finally {

        predictButton.disabled = false;

        predictButton.querySelector("span").textContent =
            "Generate prediction";

    }

});


// =========================================================
// 5. PREDICTION HISTORY
// =========================================================

async function loadHistory() {

    try {

        const response = await fetch("/history?limit=10", {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error("History unavailable");
        }

        const data = await response.json();

        if (!data.records || data.records.length === 0) {

            historyBody.innerHTML = `
                <tr>
                    <td colspan="6" class="empty-table">
                        No predictions recorded yet.
                    </td>
                </tr>
            `;

            return;

        }

        historyBody.innerHTML = data.records.map(record => {

            const date = new Date(record.created_at).toLocaleString();

            const isYes = record.subscription === "Yes";

            return `
                <tr>
                    <td>#${record.id}</td>
                    <td>${date}</td>
                    <td>${record.age}</td>
                    <td>
                        <span class="table-badge ${isYes ? "" : "no"}">
                            ${record.subscription}
                        </span>
                    </td>
                    <td>${Number(record.probability).toFixed(2)}%</td>
                    <td>${record.priority}</td>
                </tr>
            `;

        }).join("");

    } catch (error) {

        console.error("History Error:", error);

        historyBody.innerHTML = `
            <tr>
                <td colspan="6" class="empty-table">
                    History is currently unavailable.
                </td>
            </tr>
        `;

    }

}


// =========================================================
// 6. REFRESH HISTORY
// =========================================================

const refreshButton =
    document.getElementById("refresh-history");

if (refreshButton) {
    refreshButton.addEventListener("click", loadHistory);
}


// =========================================================
// 7. RESET FORM
// =========================================================

form.addEventListener("reset", () => {

    resultContent.classList.add("hidden");

    errorBox.classList.add("hidden");

    resultPlaceholder.classList.remove("hidden");

});


// =========================================================
// 8. INITIALIZE DASHBOARD
// =========================================================

async function initializeDashboard() {

    console.log("BankReach Initializing...");

    await checkApi();

    await loadHistory();

    console.log("Dashboard Ready");

}

initializeDashboard();
