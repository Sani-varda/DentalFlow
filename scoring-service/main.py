from fastapi import FastAPI, Depends, HTTPException
from sqlmodel import Session
from database import get_session
from scorer import recalculate_all_scores_logic, calculate_patient_score
import time

app = FastAPI(title="DentaFlow Scoring Service")

@app.get("/api/v1/scoring/health")
def health_check():
    return {"status": "healthy", "timestamp": time.time()}

@app.post("/api/v1/scoring/recalculate")
def recalculate_scores(session: Session = Depends(get_session)):
    try:
        updated_count = recalculate_all_scores_logic(session)
        return {
            "status": "success",
            "message": f"Successfully recalculated scores for {updated_count} patients",
            "updated_count": updated_count
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/scoring/patient/{patient_id}")
def recalculate_patient_score_endpoint(patient_id: str, session: Session = Depends(get_session)):
    try:
        pattern = calculate_patient_score(session, patient_id)
        if not pattern:
            raise HTTPException(status_code=404, detail="Patient not found or has no appointments")
        return {
            "status": "success",
            "patient_id": patient_id,
            "score": pattern.pattern_score,
            "risk_level": pattern.risk_level
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
