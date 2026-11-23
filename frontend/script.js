const API_BASE_URL = "http://127.0.0.1:8000";
const form = document.getElementById("prediction-form");
const predictButton = document.getElementById("predict-button");
const resultPlaceholder = document.getElementById("result-placeholder");
const resultContent = document.getElementById("result-content");
const errorBox = document.getElementById("error-box");
const historyBody = document.getElementById("history-body");
const apiStatus = document.getElementById("api-status");

async function checkApi() {
    try {
        const response = await fetch(`${API_BASE_URL}/health`);

        if (!response.ok) {
            throw new Error("API unavailable");
        }

        const data = await response.json();

        apiStatus.innerHTML =
            '<span class="status-dot"></span> API Connected';

        document.getElementById("threshold-value").textContent =
            Number(data.threshold).toFixed(2);

    } catch (error) {
        apiStatus.textContent = "API Offline";
        apiStatus.style.color = "#c34b55";
        console.error("API Health Error:", error);
    }
}
function showError(message) {
    errorBox.textContent = message;
    errorBox.classList.remove("hidden");
    resultContent.classList.add("hidden");
    resultPlaceholder.classList.add("hidden");
}

function displayResult(data) {
    resultPlaceholder.classList.add("hidden");
    errorBox.classList.add("hidden");
    resultContent.classList.remove("hidden");

    const isYes = data.subscription === "Yes";
    document.getElementById("result-status").textContent = data.prediction;
    document.getElementById("result-status").classList.toggle("negative", !isYes);

    document.getElementById("probability-value").textContent =
        Number(data.probability).toFixed(2);
    document.getElementById("probability-bar").style.width =
        `${Math.max(0, Math.min(100, Number(data.probability)))}%`;

    document.getElementById("subscription-value").textContent = data.subscription;

    const priorityElement = document.getElementById("priority-value");
    priorityElement.textContent = data.priority;
    priorityElement.className = `priority-${data.priority.toLowerCase()}`;

    document.getElementById("result-threshold").textContent =
        Number(data.threshold).toFixed(2);

    document.getElementById("recommendation").textContent =
        data.priority === "High"
            ? "High-priority lead: consider contacting this customer early in the campaign."
            : data.priority === "Medium"
                ? "Medium-priority lead: consider contacting this customer after high-priority leads."
                : "Low-priority lead: this customer is less likely to subscribe at the current threshold.";
}

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorBox.classList.add("hidden");

    const formData = new FormData(form);
    const customer = Object.fromEntries(formData.entries());

    ["age", "campaign", "previous"].forEach((key) => {
        customer[key] = Number(customer[key]);
    });

    predictButton.disabled = true;
    predictButton.querySelector("span").textContent = "Predicting...";

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

const data = JSON.parse(responseText);

if (!response.ok) {
    const detail = data.detail || "Prediction failed.";
    throw new Error(
        typeof detail === "string" ? detail : JSON.stringify(detail)
    );
}

displayResult(data);
await loadHistory();
    } catch (error) {
        showError(error.message || "Unable to connect to the prediction API.");
    } finally {
        predictButton.disabled = false;
        predictButton.querySelector("span").textContent = "Generate prediction";
    }
});

async function loadHistory() {
    try {
       const response = await fetch(`${API_BASE_URL}/history?limit=10`);
        if (!response.ok) throw new Error("Could not load history");
        const data = await response.json();

        if (!data.records.length) {
            historyBody.innerHTML =
                '<tr><td colspan="6" class="empty-table">No predictions recorded yet.</td></tr>';
            return;
        }

        historyBody.innerHTML = data.records.map((record) => {
            const date = new Date(record.created_at).toLocaleString();
            const isYes = record.subscription === "Yes";
            return `
                <tr>
                    <td>#${record.id}</td>
                    <td>${date}</td>
                    <td>${record.age}</td>
                    <td><span class="table-badge ${isYes ? "" : "no"}">${record.subscription}</span></td>
                    <td>${Number(record.probability).toFixed(2)}%</td>
                    <td>${record.priority}</td>
                </tr>
            `;
        }).join("");
    } catch (error) {
        historyBody.innerHTML =
            '<tr><td colspan="6" class="empty-table">History is currently unavailable.</td></tr>';
    }
}

document.getElementById("refresh-history").addEventListener("click", loadHistory);

form.addEventListener("reset", () => {
    resultContent.classList.add("hidden");
    errorBox.classList.add("hidden");
    resultPlaceholder.classList.remove("hidden");
});

checkApi();
loadHistory();
