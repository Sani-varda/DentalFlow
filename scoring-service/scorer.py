import uuid
from datetime import datetime
from sqlmodel import Session, select
from models import Patient, Appointment, NoShowPattern, AppointmentStatus, RiskLevel

DECAY_FACTOR = 0.85
CHRONIC_THRESHOLD = 0.5  # Should match env.CHRONIC_THRESHOLD if possible

def calculate_patient_score(session: Session, patient_id: str) -> NoShowPattern:
    now = datetime.utcnow()
    
    # Get all appointments for the patient
    appointments = session.exec(
        select(Appointment)
        .where(Appointment.patient_id == patient_id)
        .order_by(Appointment.scheduled_time.desc())
    ).all()
    
    total_count = len(appointments)
    if total_count == 0:
        return None
        
    no_shows = [a for a in appointments if a.status == AppointmentStatus.NO_SHOW]
    
    score = 0.0
    for ns in no_shows:
        # Scheduled time is already a datetime object
        days_ago = (now - ns.scheduled_time.replace(tzinfo=None)).days
        # Decay per month (30 days)
        recency_weight = (DECAY_FACTOR ** (max(days_ago, 0) / 30.0))
        score += recency_weight
        
    # Normalize: ratio of weighted no-shows to total appointments, capped at 1.0
    # Following Node.js logic: score / max(totalAppointments * 0.3, 1)
    normalized_score = min(score / max(total_count * 0.3, 1.0), 1.0)
    rounded_score = round(normalized_score, 2)
    
    risk_level = RiskLevel.LOW
    if rounded_score >= 0.7:
        risk_level = RiskLevel.HIGH
    elif rounded_score >= 0.3:
        risk_level = RiskLevel.MEDIUM
        
    chronic_flag = rounded_score >= CHRONIC_THRESHOLD
    last_no_show_date = no_shows[0].scheduled_time if no_shows else None
    
    # Check if pattern exists
    pattern = session.exec(
        select(NoShowPattern).where(NoShowPattern.patient_id == patient_id)
    ).first()
    
    if not pattern:
        pattern = NoShowPattern(
            id=str(uuid.uuid4()),
            patient_id=patient_id,
            pattern_score=rounded_score,
            risk_level=risk_level,
            chronic_flag=chronic_flag,
            last_no_show_date=last_no_show_date,
            updated_at=now
        )
        session.add(pattern)
    else:
        pattern.pattern_score = rounded_score
        pattern.risk_level = risk_level
        pattern.chronic_flag = chronic_flag
        pattern.last_no_show_date = last_no_show_date
        pattern.updated_at = now
        
    session.commit()
    session.refresh(pattern)
    return pattern

def recalculate_all_scores_logic(session: Session) -> int:
    patients = session.exec(select(Patient)).all()
    updated_count = 0
    for patient in patients:
        res = calculate_patient_score(session, patient.id)
        if res:
            updated_count += 1
    return updated_count
