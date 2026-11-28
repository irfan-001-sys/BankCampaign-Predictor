// =========================================================
// 1. API CONFIGURATION
// =========================================================

// Automatically connects to the same Render domain.
const API_BASE_URL = window.location.origin;


// =========================================================
// 2. HTML ELEMENTS
// =========================================================

const form = document.getElementById("prediction-form");
const predictButton = document.getElementById("predict-button");

const resultPlaceholder = document.getElementById("result-placeholder");
const resultContent = document.getElementById("result-content");

const errorBox = document.getElementById("error-box");
const historyBody = document.getElementById("history-body");
const apiStatus = document.getElementById("api-status");


// =========================================================
// 3. API CONNECTION CHECK
// =========================================================

async function checkApi() {

    try {

        const response = await fetch(`${API_BASE_URL}/health`);

        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }

        const data = await response.json();

        if (data.status !== "healthy" || !data.model_loaded) {
            throw new Error("Backend or ML model is unavailable.");
        }

        // Update API status
        apiStatus.innerHTML =
            '<span class="status-dot"></span> API Connected';

        apiStatus.style.color = "#16a36a";

        // Display model threshold
        document.getElementById("threshold-value").textContent =
            Number(data.threshold).toFixed(2);

        console.log("API Connected Successfully");
        console.log("Model:", data.model);
        console.log("Threshold:", data.threshold);

    }

    catch (error) {

        apiStatus.textContent = "API Offline";
        apiStatus.style.color = "#c34b55";

        console.error("API Health Error:", error);

    }

}


// =========================================================
// 4. ERROR DISPLAY
// =========================================================

function showError(message) {

    errorBox.textContent = message;

    errorBox.classList.remove("hidden");

    resultContent.classList.add("hidden");

    resultPlaceholder.classList.add("hidden");

}


// =========================================================
// 5. DISPLAY PREDICTION RESULT
// =========================================================

function displayResult(data) {

    resultPlaceholder.classList.add("hidden");

    errorBox.classList.add("hidden");

    resultContent.classList.remove("hidden");


    // Subscription result
    const isYes = data.subscription === "Yes";

    document.getElementById("result-status").textContent =
        data.prediction;

    document.getElementById("result-status")
        .classList.toggle("negative", !isYes);


    // Probability
    const probability = Number(data.probability);

    document.getElementById("probability-value").textContent =
        probability.toFixed(2);


    // Probability progress bar
    document.getElementById("probability-bar").style.width =
        `${Math.max(0, Math.min(100, probability))}%`;


    // Subscription
    document.getElementById("subscription-value").textContent =
        data.subscription;


    // Priority
    const priorityElement =
        document.getElementById("priority-value");

    priorityElement.textContent = data.priority;

    priorityElement.className =
        `priority-${data.priority.toLowerCase()}`;


    // Threshold
    document.getElementById("result-threshold").textContent =
        Number(data.threshold).toFixed(2);


    // Recommendation
    const recommendation =
        document.getElementById("recommendation");

    if (data.priority === "High") {

        recommendation.textContent =
            "High-priority lead: Contact this customer early in the campaign.";

    }

    else if (data.priority === "Medium") {

        recommendation.textContent =
            "Medium-priority lead: Consider contacting this customer after high-priority leads.";

    }

    else {

        recommendation.textContent =
            "Low-priority lead: This customer is less likely to subscribe at the current threshold.";

    }

}


// =========================================================
// 6. CUSTOMER PREDICTION
// =========================================================

form.addEventListener("submit", async (event) => {

    event.preventDefault();

    errorBox.classList.add("hidden");


    // Collect form data
    const formData = new FormData(form);

    const customer = Object.fromEntries(formData.entries());


    // Convert numeric inputs
    ["age", "campaign", "previous"].forEach((key) => {

        customer[key] = Number(customer[key]);

    });


    // Disable button
    predictButton.disabled = true;

    predictButton.querySelector("span").textContent =
        "Predicting...";


    try {

        const response = await fetch(`${API_BASE_URL}/predict`, {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify(customer)

        });


        const responseText = await response.text();

        console.log("Prediction API Status:", response.status);

        console.log("Prediction API Response:", responseText);


        if (!responseText) {

            throw new Error("Backend returned an empty response.");

        }


        let data;

        try {

            data = JSON.parse(responseText);

        }

        catch {

            throw new Error("Invalid response received from backend.");

        }


        if (!response.ok) {

            const detail = data.detail || "Prediction failed.";

            throw new Error(
                typeof detail === "string"
                    ? detail
                    : JSON.stringify(detail)
            );

        }


        // Display result
        displayResult(data);


        // Refresh prediction history
        await loadHistory();


    }

    catch (error) {

        console.error("Prediction Error:", error);

        showError(
            error.message || "Unable to connect to the prediction API."
        );

    }

    finally {

        predictButton.disabled = false;

        predictButton.querySelector("span").textContent =
            "Generate prediction";

    }

});


// =========================================================
// 7. LOAD PREDICTION HISTORY
// =========================================================

async function loadHistory() {

    try {

        const response = await fetch(
            `${API_BASE_URL}/history?limit=10`
        );


        if (!response.ok) {

            throw new Error("Could not load prediction history.");

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


        // Display history records
        historyBody.innerHTML = data.records.map((record) => {

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

                    <td>
                        ${Number(record.probability).toFixed(2)}%
                    </td>

                    <td>
                        ${record.priority}
                    </td>

                </tr>
            `;

        }).join("");


    }

    catch (error) {

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
// 8. REFRESH HISTORY BUTTON
// =========================================================

const refreshButton = document.getElementById("refresh-history");

if (refreshButton) {

    refreshButton.addEventListener("click", loadHistory);

}


// =========================================================
// 9. RESET FORM
// =========================================================

form.addEventListener("reset", () => {

    resultContent.classList.add("hidden");

    errorBox.classList.add("hidden");

    resultPlaceholder.classList.remove("hidden");

});


// =========================================================
// 10. INITIALIZE DASHBOARD
// =========================================================

async function initializeDashboard() {

    console.log("BankReach Dashboard Initializing...");

    console.log("API URL:", API_BASE_URL);

    await checkApi();

    await loadHistory();

    console.log("BankReach Dashboard Ready.");

}

initializeDashboard();
