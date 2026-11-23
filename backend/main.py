from pathlib import Path
from datetime import datetime, timezone
import sqlite3

import joblib
import pandas as pd

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from pydantic import BaseModel, Field
from typing import Literal


# ---------------------------------------------------------
# 1. PATHS AND MODEL LOADING
# ---------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent

FRONTEND_DIR = PROJECT_DIR / "frontend"
MODEL_PATH = BASE_DIR / "bank_campaign_final.pkl"
DB_PATH = BASE_DIR / "predictions.db"


if not MODEL_PATH.exists():
    raise FileNotFoundError(f"Model file not found: {MODEL_PATH}")

if not FRONTEND_DIR.exists():
    raise FileNotFoundError(f"Frontend folder not found: {FRONTEND_DIR}")


# Load trained model bundle
bundle = joblib.load(MODEL_PATH)


required_keys = {
    "model",
    "scaler",
    "threshold",
    "feature_columns",
    "defaults",
    "categorical_categories"
}

missing_keys = required_keys.difference(bundle.keys())

if missing_keys:
    raise RuntimeError(
        "Model bundle is missing: "
        + ", ".join(sorted(missing_keys))
    )


# Extract model components
model = bundle["model"]
scaler = bundle["scaler"]

THRESHOLD = float(bundle["threshold"])

FEATURE_COLUMNS = bundle["feature_columns"]
DEFAULTS = bundle["defaults"]

CATEGORICAL_CATEGORIES = bundle["categorical_categories"]


# Optional value:
# This should be saved in the notebook model bundle.
# If unavailable, use the original default value.
PDAYS_SUCCESS_DEFAULT = bundle.get(
    "pdays_success_default",
    DEFAULTS.get("pdays", 999)
)


CATEGORICAL_COLUMNS = [
    "job",
    "marital",
    "education",
    "default",
    "housing",
    "loan",
    "contact",
    "month",
    "day_of_week",
    "poutcome"
]


# Check categorical information
for column in CATEGORICAL_COLUMNS:

    if column not in CATEGORICAL_CATEGORIES:
        raise RuntimeError(
            f"Missing categorical categories for: {column}"
        )


# ---------------------------------------------------------
# 2. REQUEST MODEL
# ---------------------------------------------------------

class CustomerInput(BaseModel):

    age: int = Field(default=35, ge=17, le=100)

    job: Literal[
        "admin.", "blue-collar", "entrepreneur",
        "housemaid", "management", "retired",
        "self-employed", "services", "student",
        "technician", "unemployed", "unknown"
    ] = "admin."

    marital: Literal[
        "divorced", "married", "single", "unknown"
    ] = "married"

    education: Literal[
        "basic.4y", "basic.6y", "basic.9y",
        "high.school", "illiterate",
        "professional.course",
        "university.degree", "unknown"
    ] = "university.degree"

    default: Literal["no", "unknown", "yes"] = "no"

    housing: Literal["no", "unknown", "yes"] = "yes"

    loan: Literal["no", "unknown", "yes"] = "no"

    month: Literal[
        "jan", "feb", "mar", "apr", "may", "jun",
        "jul", "aug", "sep", "oct", "nov", "dec"
    ] = "may"

    day_of_week: Literal[
        "mon", "tue", "wed", "thu", "fri"
    ] = "mon"

    campaign: int = Field(default=1, ge=1, le=100)

    previous: int = Field(default=0, ge=0, le=100)

    poutcome: Literal[
        "failure", "nonexistent", "success"
    ] = "nonexistent"


# ---------------------------------------------------------
# 3. FASTAPI APPLICATION
# ---------------------------------------------------------

app = FastAPI(
    title="Banking Campaign Response Prediction API",
    description=(
        "Predicts customer term-deposit subscription "
        "and contact priority using Random Forest."
    ),
    version="1.0.0"
)


# ---------------------------------------------------------
# 4. CORS CONFIGURATION
# ---------------------------------------------------------

app.add_middleware(
    CORSMiddleware,

    allow_origins=[
        "http://127.0.0.1:5500",
        "http://localhost:5500",
        "http://127.0.0.1:5501",
        "http://localhost:5501",
        "http://127.0.0.1:8000",
        "http://localhost:8000"
    ],

    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)


# ---------------------------------------------------------
# 5. FRONTEND STATIC FILES
# ---------------------------------------------------------

app.mount(
    "/static",
    StaticFiles(directory=str(FRONTEND_DIR)),
    name="static"
)


@app.get("/", include_in_schema=False)
def home():

    return FileResponse(FRONTEND_DIR / "index.html")


# ---------------------------------------------------------
# 6. DATABASE CONNECTION
# ---------------------------------------------------------

def get_connection():

    return sqlite3.connect(DB_PATH)


def create_database():

    with get_connection() as conn:

        conn.execute("""
            CREATE TABLE IF NOT EXISTS prediction_history (

                id INTEGER PRIMARY KEY AUTOINCREMENT,

                created_at TEXT NOT NULL,

                age INTEGER NOT NULL,

                prediction TEXT NOT NULL,

                subscription TEXT NOT NULL,

                probability REAL NOT NULL,

                threshold REAL NOT NULL,

                priority TEXT NOT NULL,

                input_data TEXT NOT NULL

            )
        """)

        conn.commit()


@app.on_event("startup")
def startup_event():

    create_database()


# ---------------------------------------------------------
# 7. HEALTH CHECK API
# ---------------------------------------------------------

@app.get("/health")
def health():

    return {
        "status": "healthy",
        "model_loaded": True,
        "model": type(model).__name__,
        "threshold": THRESHOLD
    }


# ---------------------------------------------------------
# 8. PREPARE CUSTOMER INPUT
# ---------------------------------------------------------

def make_model_input(customer: CustomerInput):

    values = customer.model_dump()

    # Add hidden features
    hidden_columns = [
        "contact",
        "emp.var.rate",
        "cons.price.idx",
        "cons.conf.idx",
        "euribor3m",
        "nr.employed"
    ]

    for column in hidden_columns:

        if column not in DEFAULTS:
            raise ValueError(
                f"Missing hidden default: {column}"
            )

        values[column] = DEFAULTS[column]

    # Previous contact information
    if customer.poutcome == "success" and customer.previous > 0:

        values["pdays"] = PDAYS_SUCCESS_DEFAULT

    else:

        values["pdays"] = DEFAULTS.get("pdays", 999)

    # Create one-row DataFrame
    raw_row = pd.DataFrame([values])

    # Apply exact categorical levels from training
    for column in CATEGORICAL_COLUMNS:

        categories = CATEGORICAL_CATEGORIES[column]

        raw_row[column] = pd.Categorical(
            raw_row[column],
            categories=categories
        )

    # One-hot encoding
    encoded_row = pd.get_dummies(
        raw_row,
        columns=CATEGORICAL_COLUMNS,
        drop_first=True,
        dtype=int
    )

    # Match exact training features and order
    encoded_row = encoded_row.reindex(
        columns=FEATURE_COLUMNS,
        fill_value=0
    )

    return encoded_row


# ---------------------------------------------------------
# 9. PREDICTION API
# ---------------------------------------------------------

@app.post("/predict")
def predict(customer: CustomerInput):

    try:

        # Prepare input
        input_frame = make_model_input(customer)

        # Scale input
        scaled_input = scaler.transform(input_frame)

        # Get probability for YES
        yes_index = list(model.classes_).index(1)

        probability = float(
            model.predict_proba(scaled_input)[0, yes_index]
        )

        # Apply selected threshold
        subscription = (
            "Yes"
            if probability >= THRESHOLD
            else "No"
        )

        prediction = (
            "Customer Likely to Subscribe"
            if subscription == "Yes"
            else "Customer Unlikely to Subscribe"
        )

        # Determine priority
        if probability >= 0.60:

            priority = "High"

        elif probability >= THRESHOLD:

            priority = "Medium"

        else:

            priority = "Low"

        # Save prediction history
        created_at = datetime.now(timezone.utc).isoformat()

        input_json = customer.model_dump_json()

        with get_connection() as conn:

            cursor = conn.execute(
                """
                INSERT INTO prediction_history
                (
                    created_at,
                    age,
                    prediction,
                    subscription,
                    probability,
                    threshold,
                    priority,
                    input_data
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,

                (
                    created_at,
                    customer.age,
                    prediction,
                    subscription,
                    round(probability * 100, 2),
                    THRESHOLD,
                    priority,
                    input_json
                )
            )

            record_id = cursor.lastrowid

            conn.commit()

        # Return prediction result
        return {
            "success": True,
            "id": record_id,
            "prediction": prediction,
            "subscription": subscription,
            "probability": round(probability * 100, 2),
            "threshold": THRESHOLD,
            "priority": priority
        }

    except Exception as exc:

        raise HTTPException(
            status_code=500,
            detail=str(exc)
        )


# ---------------------------------------------------------
# 10. PREDICTION HISTORY API
# ---------------------------------------------------------

@app.get("/history")
def history(limit: int = 10):

    limit = max(1, min(limit, 100))

    with get_connection() as conn:

        conn.row_factory = sqlite3.Row

        rows = conn.execute(
            """
            SELECT
                id,
                created_at,
                age,
                prediction,
                subscription,
                probability,
                threshold,
                priority

            FROM prediction_history

            ORDER BY id DESC

            LIMIT ?
            """,

            (limit,)
        ).fetchall()

    return {
        "success": True,
        "records": [
            dict(row)
            for row in rows
        ]
    }


# ---------------------------------------------------------
# 11. CLEAR HISTORY API
# ---------------------------------------------------------

@app.delete("/history")
def clear_history():

    with get_connection() as conn:

        conn.execute(
            "DELETE FROM prediction_history"
        )

        conn.commit()

    return {
        "success": True,
        "message": "Prediction history cleared."
    }
