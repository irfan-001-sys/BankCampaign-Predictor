BANKING CAMPAIGN RESPONSE PREDICTION APP

Folder structure:
Banking_Campaign_App/
  backend/
    main.py
    bank_campaign_final.pkl   <-- copy this from the notebook output
    predictions.db            <-- created automatically
  frontend/
    index.html
    style.css
    script.js

IMPORTANT MODEL STEP:
1. Open Banking_Campaign_RandomForest_Clean.ipynb.
2. Run all cells from top to bottom after the updated defaults cell.
3. Copy the generated bank_campaign_final.pkl into backend/.
4. Install dependencies:
   python -m pip install pandas scikit-learn joblib fastapi uvicorn
5. Open terminal in the backend folder and run:
   python -m uvicorn main:app --reload
6. Open:
   http://127.0.0.1:8000
   http://127.0.0.1:8000/docs
   http://127.0.0.1:8000/health

SQLite prediction history is created automatically as predictions.db.
The frontend is served by FastAPI, so do not open index.html directly.
