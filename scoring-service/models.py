from datetime import datetime
from typing import Optional, List
from sqlmodel import Field, SQLModel, Relationship, create_engine, Session, select
from decimal import Decimal
import enum

class AppointmentStatus(str, enum.Enum):
    SCHEDULED = "SCHEDULED"
    COMPLETED = "COMPLETED"
    NO_SHOW = "NO_SHOW"
    CANCELLED = "CANCELLED"
    RESCHEDULED = "RESCHEDULED"

class RiskLevel(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"

class Patient(SQLModel, table=True):
    __tablename__ = "patients"
    id: str = Field(primary_key=True, alias="patient_id")
    name: str
    clinic_id: str
    
    appointments: List["Appointment"] = Relationship(back_populates="patient")
    no_show_pattern: Optional["NoShowPattern"] = Relationship(back_populates="patient")

class Appointment(SQLModel, table=True):
    __tablename__ = "appointments"
    id: str = Field(primary_key=True, alias="appt_id")
    patient_id: str = Field(foreign_key="patients.patient_id")
    clinic_id: str
    scheduled_time: datetime = Field(alias="scheduled_time")
    status: AppointmentStatus = Field(default=AppointmentStatus.SCHEDULED)
    
    patient: Patient = Relationship(back_populates="appointments")

class NoShowPattern(SQLModel, table=True):
    __tablename__ = "no_show_patterns"
    id: str = Field(primary_key=True)
    patient_id: str = Field(foreign_key="patients.patient_id", unique=True)
    pattern_score: float = Field(default=0.0)
    last_no_show_date: Optional[datetime] = None
    chronic_flag: bool = Field(default=False)
    risk_level: RiskLevel = Field(default=RiskLevel.LOW)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    patient: Patient = Relationship(back_populates="no_show_pattern")
