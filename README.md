# DentaFlow: Modern Clinic Management & Intelligence Suite

DentaFlow is a production-grade, full-stack application designed to modernize dental clinic operations. It combines intuitive patient management with an AI-driven intelligence layer to predict patient behavior and automate high-value interactions.

---

## System Architecture

DentaFlow operates on a **Distributed Service Architecture** to ensure scalability, reliability, and modularity:

1.  **Core API (Node.js/Express)**: The primary backend handling authentication (RBAC), patient records, scheduling logic, and third-party integrations (Twilio, SendGrid).
2.  **Intelligence Service (Python/FastAPI)**: A dedicated microservice for high-scale data analysis, calculating no-show risk scores, and identifying behavioral patterns.
3.  **Client Dashboard (React 19)**: A state-of-the-art frontend featuring a glassmorphic dark mode UI, real-time updates via Socket.IO, and interactive analytics.
4.  **Worker Layer (BullMQ/Redis)**: Asynchronous background processing for automated reminders, data compliance (7-year retention), and audit logging.

---

## Key Features

### Appointment & Patient Flow
- **Smart Scheduling**: Conflict-free booking with automated multi-channel notifications.
- **Patient Profiles**: Comprehensive history, contactability status, and risk profiling.
- **RBAC**: Secure access controls for Admins, Staff, and Practitioners.

### AI Intelligence Layer
- **No-Show Prediction**: Real-time scoring of patient reliability using behavioral pattern matching.
- **Chronic Canceller Detection**: Flags high-risk patients to optimize clinic utilization.
- **Automated Rescheduling**: Intelligent workflows for missed appointments.

### Communication Engine
- **Multi-Channel**: Integrated SMS (Twilio), WhatsApp, and Email (SendGrid).
- **Template System**: 15+ dynamic templates for reminders, post-op care, and marketing.
- **Real-time Updates**: Live notification streams for clinic staff.

### Compliance & Security
- **Data Retention**: Automated 7-year retention policy for clinical records.
- **Audit Logs**: Immutable tracking of all sensitive PHI/PII interactions.
- **Privacy First**: Built-in masking for sensitive data in real-time streams.

---

## Getting Started

### Prerequisites
- **Node.js** v20+
- **Python** v3.10+
- **PostgreSQL** (via Prisma)
- **Redis** (for background jobs)

### 1. Core API Setup
```bash
cd server
npm install
cp .env.example .env
npx prisma migrate dev
npm run dev
```

### 2. Intelligence Service Setup
```bash
cd scoring-service
python -m venv venv
source venv/bin/activate # Windows: venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

### 3. Frontend Dashboard Setup
```bash
cd client
npm install
npm run dev
```

---

## Tech Stack

- **Frontend**: React 19, Vite, Tailwind CSS, Framer Motion, Zustand
- **Backend (Core)**: Node.js, Express, TypeScript, Prisma, BullMQ, Socket.io
- **Backend (Intelligence)**: Python, FastAPI, SQLModel, Pydantic
- **Storage**: PostgreSQL (DB), Redis (Queue/Cache)
- **Deployment**: Docker Compose ready

---

## 📄 License
This project is licensed under the MIT License.

---
*Built with ❤️ for Modern Dentistry.*
