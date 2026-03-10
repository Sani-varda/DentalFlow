import os
from sqlmodel import create_engine, Session
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "../server/.env"))

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise ValueError("DATABASE_URL not found in .env")

# SQLModel expects postgresql:// but Prisma/libpq often uses postgres://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine = create_engine(DATABASE_URL)

def get_session():
    with Session(engine) as session:
        yield session
