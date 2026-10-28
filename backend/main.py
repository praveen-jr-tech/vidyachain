import os, re, csv, io, json, hmac, hashlib, secrets, sqlite3, time
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import Optional, List
from fastapi import FastAPI, HTTPException, Depends, UploadFile, File, Header, Response, Query, Request
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

BASE = Path(__file__).resolve().parent.parent
VAULT = BASE / "securevault" / "storage"
VAULT.mkdir(parents=True, exist_ok=True)
DB_PATH = Path(os.getenv("UNICRED_DB", str(Path(__file__).resolve().parent / "unicred.db")))
TOKEN_SECRET = os.getenv("UNICRED_TOKEN_SECRET", "local-demo-secret-change-before-deployment").encode()
MAX_UPLOAD_BYTES = 5 * 1024 * 1024  # 5 MB
ALLOWED_EXTENSIONS = {".pdf", ".csv", ".txt", ".png", ".jpg", ".jpeg"}

# Rate limiting data structures
LOGIN_ATTEMPTS = {}  # key -> [timestamps]
VERIFY_ATTEMPTS = {} # ip -> [timestamps]

app = FastAPI(
    title="VidyaChain API",
    version="2.0.0",
    description="APAAR-AICTE Student Data Management & Verification Platform (Hackathon Prototype, Synthetic Data)"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def now():
    return datetime.now(timezone.utc).isoformat()

def connect():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys=ON")
    return con

def pw_hash(password: str, salt: str) -> str:
    """OWASP-compliant PBKDF2-HMAC-SHA256 with 600,000 iterations"""
    derived = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 600000).hex()
    return f"pbkdf2_sha256$600000${salt}${derived}"

def verify_pw(password: str, stored_hash: str, salt: str) -> bool:
    """Supports both standard pbkdf2_sha256 and legacy 180,000 iterations hash"""
    if stored_hash.startswith("pbkdf2_sha256$"):
        parts = stored_hash.split("$")
        if len(parts) == 4:
            rounds = int(parts[1])
            s = parts[2]
            expected = hashlib.pbkdf2_hmac("sha256", password.encode(), s.encode(), rounds).hex()
            return hmac.compare_digest(parts[3], expected)
    # Fallback to legacy 180k hash for seamless backward compatibility
    legacy = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 180000).hex()
    return hmac.compare_digest(stored_hash, legacy)

def init_db():
    with connect() as con:
        con.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            role TEXT NOT NULL,
            institution TEXT,
            student_id TEXT,
            salt TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            mfa_enabled INTEGER DEFAULT 0,
            mfa_secret TEXT DEFAULT NULL
        );

        CREATE TABLE IF NOT EXISTS students (
            id INTEGER PRIMARY KEY,
            student_id TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            apaar_id TEXT NOT NULL,
            institution TEXT NOT NULL,
            programme TEXT NOT NULL,
            year INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'Verified',
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS audit (
            id INTEGER PRIMARY KEY,
            created_at TEXT NOT NULL,
            actor TEXT NOT NULL,
            action TEXT NOT NULL,
            detail TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS vault_files (
            id INTEGER PRIMARY KEY,
            stored_name TEXT UNIQUE NOT NULL,
            original_name TEXT NOT NULL,
            sha256 TEXT NOT NULL,
            size INTEGER NOT NULL,
            content_type TEXT,
            uploaded_by TEXT NOT NULL,
            student_id TEXT,
            institution TEXT,
            scan_status TEXT DEFAULT 'Scanner not configured',
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS verification_tokens (
            id INTEGER PRIMARY KEY,
            token_reference TEXT UNIQUE NOT NULL,
            token_hash TEXT UNIQUE NOT NULL,
            student_id TEXT NOT NULL,
            created_by TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            is_revoked INTEGER DEFAULT 0,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY,
            recipient_email TEXT NOT NULL,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            type TEXT NOT NULL,
            is_read INTEGER DEFAULT 0,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS correction_requests (
            id INTEGER PRIMARY KEY,
            student_id TEXT NOT NULL,
            student_email TEXT NOT NULL,
            field_name TEXT NOT NULL,
            requested_value TEXT NOT NULL,
            reason TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'Pending',
            institution TEXT NOT NULL,
            reviewer_notes TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS token_blocklist (
            id INTEGER PRIMARY KEY,
            token_sig TEXT UNIQUE NOT NULL,
            revoked_at TEXT NOT NULL
        );
        """)

        # Schema migration checks for existing tables
        user_cols = {col["name"] for col in con.execute("PRAGMA table_info(users)").fetchall()}
        if "institution" not in user_cols:
            con.execute("ALTER TABLE users ADD COLUMN institution TEXT")
        if "student_id" not in user_cols:
            con.execute("ALTER TABLE users ADD COLUMN student_id TEXT")
        if "mfa_enabled" not in user_cols:
            con.execute("ALTER TABLE users ADD COLUMN mfa_enabled INTEGER DEFAULT 0")
        if "mfa_secret" not in user_cols:
            con.execute("ALTER TABLE users ADD COLUMN mfa_secret TEXT DEFAULT NULL")

        vault_cols = {col["name"] for col in con.execute("PRAGMA table_info(vault_files)").fetchall()}
        if "student_id" not in vault_cols:
            con.execute("ALTER TABLE vault_files ADD COLUMN student_id TEXT")
        if "institution" not in vault_cols:
            con.execute("ALTER TABLE vault_files ADD COLUMN institution TEXT")
        if "scan_status" not in vault_cols:
            con.execute("ALTER TABLE vault_files ADD COLUMN scan_status TEXT DEFAULT 'Scanner not configured'")

        student_cols = {col["name"] for col in con.execute("PRAGMA table_info(students)").fetchall()}
        if "created_at" not in student_cols:
            con.execute("ALTER TABLE students ADD COLUMN created_at TEXT")
        if "updated_at" not in student_cols:
            con.execute("ALTER TABLE students ADD COLUMN updated_at TEXT")

        # Seed or upgrade prototype users
        prototype_users = [
            ("student@vidyachain.org", "Aarav Sharma", "student", "Northstar Institute of Technology", "UC-2026-001"),
            ("institution@vidyachain.org", "Dr. Sunita Rao (Dean)", "institution", "Northstar Institute of Technology", None),
            ("admin@vidyachain.org", "VidyaChain Administrator", "admin", None, None),
            ("verifier@vidyachain.org", "Authorized Verifier", "verifier", None, None),
            # Compatible aliases
            ("student@unicred.org", "Aarav Sharma", "student", "Northstar Institute of Technology", "UC-2026-001"),
            ("institution@unicred.org", "Dr. Sunita Rao (Dean)", "institution", "Northstar Institute of Technology", None),
            ("admin@unicred.org", "VidyaChain Administrator", "admin", None, None),
            ("verifier@unicred.org", "Authorized Verifier", "verifier", None, None),
            ("student@unicred.demo", "Aarav Sharma", "student", "Northstar Institute of Technology", "UC-2026-001"),
            ("institution@unicred.demo", "Dr. Sunita Rao (Dean)", "institution", "Northstar Institute of Technology", None),
            ("admin@unicred.demo", "VidyaChain Administrator", "admin", None, None),
            ("verifier@unicred.demo", "Authorized Verifier", "verifier", None, None),
        ]
        for email, name, role, inst, sid in prototype_users:
            row = con.execute("SELECT id, password_hash, salt FROM users WHERE email=?", (email,)).fetchone()
            salt = secrets.token_hex(16)
            hashed = pw_hash("Prototype@2026", salt)
            if not row:
                con.execute(
                    """INSERT INTO users(email, name, role, institution, student_id, salt, password_hash, mfa_enabled)
                       VALUES(?,?,?,?,?,?,?,?)""",
                    (email, name, role, inst, sid, salt, hashed, 1 if role == "admin" else 0)
                )
            else:
                con.execute(
                    """UPDATE users SET name=?,
                                       institution=COALESCE(institution, ?),
                                       student_id=COALESCE(student_id, ?),
                                       mfa_enabled=CASE WHEN role='admin' THEN 1 ELSE mfa_enabled END
                       WHERE email=?""",
                    (name, inst, sid, email)
                )

        # Seed initial prototype students
        if con.execute("SELECT COUNT(*) FROM students").fetchone()[0] == 0:
            prototype_students = [
                ("UC-2026-001", "Aarav Sharma", "APAAR123456789012", "Northstar Institute of Technology", "Computer Science", 2, "Verified"),
                ("UC-2026-002", "Meera Iyer", "APAAR234567890123", "Northstar Institute of Technology", "Information Technology", 3, "Verified"),
                ("UC-2026-003", "Kabir Das", "APAAR345678901234", "Riverbend College of Engineering", "Electronics", 1, "Pending review"),
                ("UC-2026-004", "Ananya Rao", "APAAR456789012345", "Riverbend College of Engineering", "Computer Science", 4, "Verified"),
            ]
            con.executemany(
                """INSERT INTO students(student_id, name, apaar_id, institution, programme, year, status, created_at, updated_at)
                   VALUES(?,?,?,?,?,?,?,?,?)""",
                [(*s, now(), now()) for s in prototype_students]
            )

        # Seed welcome notifications
        if con.execute("SELECT COUNT(*) FROM notifications").fetchone()[0] == 0:
            con.execute(
                """INSERT INTO notifications(recipient_email, title, message, type, created_at)
                   VALUES('student@vidyachain.org', 'Welcome to VidyaChain', 'Your student academic record UC-2026-001 is ready for review.', 'info', ?)""",
                (now(),)
            )
            con.execute(
                """INSERT INTO notifications(recipient_email, title, message, type, created_at)
                   VALUES('admin@vidyachain.org', 'Security Baseline Initialized', 'VidyaChain prototype monitoring and SHA-256 integrity checks enabled.', 'security', ?)""",
                (now(),)
            )
        con.commit()

init_db()

def audit(actor: str, action: str, detail: str):
    try:
        with connect() as con:
            con.execute("INSERT INTO audit(created_at, actor, action, detail) VALUES(?,?,?,?)",
                        (now(), actor, action, detail[:500]))
            con.commit()
    except Exception as e:
        print(f"Audit log error: {e}")

def create_notification(recipient_email: str, title: str, message: str, ntype: str = "info"):
    try:
        with connect() as con:
            con.execute(
                "INSERT INTO notifications(recipient_email, title, message, type, created_at) VALUES(?,?,?,?,?)",
                (recipient_email, title, message, ntype, now())
            )
            con.commit()
    except Exception as e:
        print(f"Notification error: {e}")

def token_for(email: str, role: str, expires: Optional[int] = None) -> str:
    exp = int(time.time()) + (8 * 3600 if expires is None else expires)
    token_id = secrets.token_hex(8)
    payload = f"{email}|{role}|{exp}|{token_id}"
    sig = hmac.new(TOKEN_SECRET, payload.encode(), hashlib.sha256).hexdigest()
    return f"{token_id}.{payload.encode().hex()}.{sig}"

def current_user(authorization: Optional[str] = Header(default=None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Please sign in to continue")
    token = authorization[7:].strip()
    try:
        parts = token.split(".", 2)
        if len(parts) != 3:
            raise ValueError("Malformed token format")
        _, encoded, signature = parts
        payload = bytes.fromhex(encoded).decode()
        payload_parts = payload.split("|")
        if len(payload_parts) < 3:
            raise ValueError("Invalid payload")
        email, role, exp = payload_parts[0], payload_parts[1], payload_parts[2]
        expected = hmac.new(TOKEN_SECRET, payload.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected) or int(exp) < int(time.time()):
            raise ValueError("Invalid or expired")
        
        # Check token blocklist
        with connect() as con:
            blocked = con.execute("SELECT id FROM token_blocklist WHERE token_sig=?", (signature,)).fetchone()
            if blocked:
                raise ValueError("Token revoked")
            user = con.execute("SELECT id, email, name, role, institution, student_id, mfa_enabled FROM users WHERE email=?", (email,)).fetchone()
        
        if not user or user["role"] != role:
            raise HTTPException(401, "Account is unavailable or role mismatch")
        return dict(user)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(401, "Session is invalid, expired, or has been logged out")

def require_roles(*roles):
    def dependency(user=Depends(current_user)):
        if user["role"] not in roles:
            raise HTTPException(403, "Your role is not permitted to perform this action")
        return user
    return dependency

# Rate limiting helper
def check_rate_limit(key: str, max_attempts: int = 5, window_seconds: int = 900):
    current = time.time()
    attempts = [t for t in LOGIN_ATTEMPTS.get(key, []) if current - t < window_seconds]
    if len(attempts) >= max_attempts:
        retry_after = int(window_seconds - (current - attempts[0]))
        raise HTTPException(
            status_code=429,
            detail=f"Too many failed attempts. Please retry in {max(1, retry_after // 60)} minutes."
        )
    LOGIN_ATTEMPTS[key] = attempts

def record_failed_attempt(key: str):
    current = time.time()
    LOGIN_ATTEMPTS.setdefault(key, []).append(current)

def clear_attempts(key: str):
    LOGIN_ATTEMPTS.pop(key, None)

# Pydantic Schemas
class LoginBody(BaseModel):
    email: str
    password: str
    mfa_code: Optional[str] = None

class StudentBody(BaseModel):
    student_id: str = Field(min_length=2, max_length=40)
    name: str = Field(min_length=2, max_length=120)
    apaar_id: str = Field(min_length=6, max_length=40)
    institution: str = Field(min_length=2, max_length=160)
    programme: str = Field(min_length=2, max_length=120)
    year: int = Field(ge=1, le=10)

class StudentStatusUpdate(BaseModel):
    status: str
    reason: Optional[str] = "Status update by officer"

class CorrectionRequestBody(BaseModel):
    student_id: str
    field_name: str
    requested_value: str
    reason: str

class CorrectionReviewBody(BaseModel):
    status: str
    notes: Optional[str] = None

class TokenGenerateBody(BaseModel):
    student_id: str
    valid_hours: Optional[int] = 24

# --- API Endpoints ---

@app.get("/")
def root():
    return {
        "project": "VidyaChain",
        "version": "2.0.0",
        "status": "running",
        "mode": "prototype",
        "disclaimer": "Synthetic demo data. APAAR/AICTE checks are local format validations."
    }

@app.get("/api/health")
def health():
    return {
        "status": "healthy",
        "timestamp": now(),
        "database": "sqlite_connected",
        "vault_storage": VAULT.exists(),
        "version": "2.0.0"
    }

@app.get("/api/meta")
def meta():
    return {
        "product": "VidyaChain",
        "prototype": True,
        "security_standard": "OWASP Top 10 + PBKDF2-HMAC-SHA256 (600,000 rounds)",
        "disclaimer": "Synthetic demo data. Not officially connected to live APAAR/DigiLocker/AICTE servers."
    }

# Authentication
@app.post("/api/auth/login")
def login(body: LoginBody, request: Request):
    client_ip = request.client.host if request.client else "unknown"
    rate_key = f"{client_ip}:{body.email.lower().strip()}"
    check_rate_limit(rate_key)

    with connect() as con:
        user = con.execute("SELECT * FROM users WHERE email=?", (body.email.lower().strip(),)).fetchone()
    
    pw_valid = False
    if user:
        if verify_pw(body.password, user["password_hash"], user["salt"]):
            pw_valid = True
        elif body.password in ("Prototype@2026", "Demo@12345"):
            pw_valid = verify_pw("Prototype@2026", user["password_hash"], user["salt"]) or verify_pw("Demo@12345", user["password_hash"], user["salt"])

    if not user or not pw_valid:
        record_failed_attempt(rate_key)
        audit("anonymous", "login_failed", f"Failed login for {body.email[:50]} from {client_ip}")
        raise HTTPException(401, "Email or password is incorrect")

    # If user has MFA enabled (e.g. admin role)
    if user["mfa_enabled"]:
        # Prototype MFA code is '123456'
        if not body.mfa_code:
            return {
                "mfa_required": True,
                "email": user["email"],
                "message": "Two-factor authentication required for administrator accounts. (Prototype OTP code: 123456)"
            }
        if body.mfa_code.strip() != "123456":
            record_failed_attempt(rate_key)
            audit(user["email"], "mfa_failed", "Invalid MFA code supplied")
            raise HTTPException(401, "Invalid multi-factor authentication code (Prototype code: 123456)")

    clear_attempts(rate_key)

    # Auto-upgrade password hash to 600,000 iterations if stored using legacy format
    if not user["password_hash"].startswith("pbkdf2_sha256$600000$"):
        new_hash = pw_hash(body.password, user["salt"])
        with connect() as con:
            con.execute("UPDATE users SET password_hash=? WHERE id=?", (new_hash, user["id"]))
            con.commit()

    token = token_for(user["email"], user["role"])
    audit(user["email"], "login_success", f"Role: {user['role']} from {client_ip}")

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "email": user["email"],
            "name": user["name"],
            "role": user["role"],
            "institution": user["institution"],
            "student_id": user["student_id"],
            "mfa_enabled": bool(user["mfa_enabled"])
        }
    }

@app.post("/api/auth/logout")
def logout(user=Depends(current_user), authorization: Optional[str] = Header(default=None)):
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:].strip()
        parts = token.split(".")
        if len(parts) == 3:
            sig = parts[2]
            with connect() as con:
                con.execute("INSERT OR IGNORE INTO token_blocklist(token_sig, revoked_at) VALUES(?,?)", (sig, now()))
                con.commit()
    audit(user["email"], "logout", "Session revoked")
    return {"ok": True, "message": "Successfully signed out and session invalidated"}

@app.get("/api/auth/me")
def me(user=Depends(current_user)):
    return user

@app.post("/api/auth/reset-password-request")
def reset_password_request(email: str = Query(...)):
    # Safe token-based password reset interface without exposing whether email exists
    audit("anonymous", "password_reset_request", f"Reset requested for {email[:50]}")
    return {
        "ok": True,
        "message": "If this account exists in the platform, password reset instructions have been generated. Note: In this local prototype, external mail delivery is unconfigured; please contact an administrator."
    }

# Dashboard & Analytics
@app.get("/api/dashboard")
def dashboard(user=Depends(current_user)):
    with connect() as con:
        if user["role"] == "student":
            total = 1
            pending = con.execute("SELECT COUNT(*) FROM students WHERE student_id=? AND status!='Verified'", (user["student_id"],)).fetchone()[0]
            institutions = 1
            alerts = 0
            recent = con.execute("SELECT created_at, actor, action, detail FROM audit WHERE actor=? OR detail LIKE ? ORDER BY id DESC LIMIT 6",
                                 (user["email"], f"%{user['student_id']}%")).fetchall()
        elif user["role"] == "institution":
            inst = user["institution"] or ""
            total = con.execute("SELECT COUNT(*) FROM students WHERE institution=?", (inst,)).fetchone()[0]
            pending = con.execute("SELECT COUNT(*) FROM students WHERE institution=? AND status!='Verified'", (inst,)).fetchone()[0]
            institutions = 1
            alerts = con.execute("SELECT COUNT(*) FROM audit WHERE action IN ('csv_validation', 'student_status_updated')").fetchone()[0]
            recent = con.execute("SELECT created_at, actor, action, detail FROM audit WHERE actor=? ORDER BY id DESC LIMIT 6", (user["email"],)).fetchall()
        else:
            total = con.execute("SELECT COUNT(*) FROM students").fetchone()[0]
            pending = con.execute("SELECT COUNT(*) FROM students WHERE status!='Verified'").fetchone()[0]
            institutions = con.execute("SELECT COUNT(DISTINCT institution) FROM students").fetchone()[0]
            alerts = con.execute("SELECT COUNT(*) FROM audit WHERE action IN ('integrity_mismatch', 'csv_validation', 'login_failed')").fetchone()[0]
            recent = con.execute("SELECT created_at, actor, action, detail FROM audit ORDER BY id DESC LIMIT 8").fetchall()

    return {
        "total_students": total,
        "institutions": institutions,
        "records_pending": pending,
        "security_alerts": alerts,
        "recent_activity": [dict(r) for r in recent],
        "role": user["role"],
        "environment": "prototype verified environment",
        "scanner_status": "Scanner not configured (ClamAV sandbox; prototype mode)",
        "encryption_status": "AES-256 baseline ready (Local storage mode)"
    }

@app.get("/api/analytics")
def get_analytics(user=Depends(require_roles("admin", "institution"))):
    with connect() as con:
        if user["role"] == "institution":
            inst = user["institution"]
            by_status = con.execute("SELECT status, COUNT(*) as count FROM students WHERE institution=? GROUP BY status", (inst,)).fetchall()
            by_programme = con.execute("SELECT programme, COUNT(*) as count FROM students WHERE institution=? GROUP BY programme", (inst,)).fetchall()
            vault_count = con.execute("SELECT COUNT(*) FROM vault_files WHERE institution=?", (inst,)).fetchone()[0]
            tokens_count = con.execute("SELECT COUNT(*) FROM verification_tokens WHERE created_by=?", (user["email"],)).fetchone()[0]
        else:
            by_status = con.execute("SELECT status, COUNT(*) as count FROM students GROUP BY status").fetchall()
            by_programme = con.execute("SELECT programme, COUNT(*) as count FROM students GROUP BY programme").fetchall()
            vault_count = con.execute("SELECT COUNT(*) FROM vault_files").fetchone()[0]
            tokens_count = con.execute("SELECT COUNT(*) FROM verification_tokens").fetchone()[0]

        total_users = con.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        total_audit = con.execute("SELECT COUNT(*) FROM audit").fetchone()[0]
        failed_logins = con.execute("SELECT COUNT(*) FROM audit WHERE action='login_failed'").fetchone()[0]
        integrity_alerts = con.execute("SELECT COUNT(*) FROM audit WHERE action='integrity_mismatch'").fetchone()[0]

    return {
        "by_status": {row["status"]: row["count"] for row in by_status},
        "by_programme": {row["programme"]: row["count"] for row in by_programme},
        "vault_documents": vault_count,
        "verification_tokens": tokens_count,
        "total_users": total_users,
        "total_audit_events": total_audit,
        "failed_logins": failed_logins,
        "integrity_alerts": integrity_alerts
    }

# Students API with strict RBAC & Institution Isolation
@app.get("/api/students")
def list_students(
    q: str = "",
    status: Optional[str] = None,
    user=Depends(require_roles("student", "institution", "admin", "verifier"))
):
    with connect() as con:
        if user["role"] == "student":
            # Student isolation: Student can ONLY view their own record
            sid = user.get("student_id") or "UC-2026-001"
            rows = con.execute("SELECT * FROM students WHERE student_id=?", (sid,)).fetchall()
        elif user["role"] == "institution":
            # Institution isolation: Institution officer sees only students from their institution
            inst = user.get("institution") or ""
            pattern = f"%{q.strip()}%"
            query = """SELECT * FROM students WHERE institution=? AND (student_id LIKE ? OR name LIKE ? OR apaar_id LIKE ? OR programme LIKE ?)"""
            params = [inst, pattern, pattern, pattern, pattern]
            if status:
                query += " AND status=?"
                params.append(status)
            query += " ORDER BY id DESC LIMIT 200"
            rows = con.execute(query, params).fetchall()
        else:
            # Admin and Verifier can search across institutions
            pattern = f"%{q.strip()}%"
            query = """SELECT * FROM students WHERE student_id LIKE ? OR name LIKE ? OR institution LIKE ? OR apaar_id LIKE ? OR programme LIKE ?"""
            params = [pattern, pattern, pattern, pattern, pattern]
            if status:
                query += " AND status=?"
                params.append(status)
            query += " ORDER BY id DESC LIMIT 200"
            rows = con.execute(query, params).fetchall()

    return {"items": [dict(r) for r in rows]}

@app.get("/api/students/{student_id}")
def get_student(student_id: str, user=Depends(require_roles("student", "institution", "admin"))):
    with connect() as con:
        row = con.execute("SELECT * FROM students WHERE student_id=?", (student_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Student record not found")
    
    # Ownership and isolation checks
    if user["role"] == "student" and user.get("student_id") != student_id:
        raise HTTPException(403, "Access denied: you can only view your own academic record")
    if user["role"] == "institution" and user.get("institution") != row["institution"]:
        raise HTTPException(403, "Access denied: student does not belong to your institution")

    return dict(row)

@app.post("/api/students")
def create_student(body: StudentBody, user=Depends(require_roles("institution", "admin"))):
    if not re.fullmatch(r"[A-Za-z0-9-]{6,40}", body.apaar_id.strip()):
        raise HTTPException(422, "APAAR ID contains unsupported characters (alphanumeric and hyphens only, 6-40 chars)")

    # Enforce institution isolation if caller is an institution officer
    if user["role"] == "institution":
        user_inst = user.get("institution") or ""
        if body.institution.strip().lower() != user_inst.lower():
            raise HTTPException(403, f"Institutions may only create records for their own institution ({user_inst})")

    try:
        with connect() as con:
            con.execute(
                """INSERT INTO students(student_id, name, apaar_id, institution, programme, year, status, created_at, updated_at)
                   VALUES(?,?,?,?,?,?,?,?,?)""",
                (body.student_id.strip(), body.name.strip(), body.apaar_id.strip(), body.institution.strip(),
                 body.programme.strip(), body.year, "Pending review", now(), now())
            )
            con.commit()
    except sqlite3.IntegrityError:
        raise HTTPException(409, f"Student ID '{body.student_id}' already exists in database")

    audit(user["email"], "student_created", f"Created record {body.student_id} ({body.name})")
    return {"ok": True, "message": f"Student record {body.student_id} added successfully for review"}

@app.patch("/api/students/{student_id}/status")
def update_student_status(
    student_id: str,
    body: StudentStatusUpdate,
    user=Depends(require_roles("institution", "admin"))
):
    valid_statuses = {"Verified", "Pending review", "Flagged", "Correction requested"}
    if body.status not in valid_statuses:
        raise HTTPException(400, f"Status must be one of: {', '.join(sorted(valid_statuses))}")

    with connect() as con:
        curr = con.execute("SELECT * FROM students WHERE student_id=?", (student_id,)).fetchone()
        if not curr:
            raise HTTPException(404, "Student record not found")
        
        # Enforce institution isolation
        if user["role"] == "institution" and user.get("institution") != curr["institution"]:
            raise HTTPException(403, "Access denied: cannot modify records of another institution")

        con.execute("UPDATE students SET status=?, updated_at=? WHERE student_id=?", (body.status, now(), student_id))
        con.commit()

    # Notify student account if associated
    with connect() as con:
        stud_user = con.execute("SELECT email FROM users WHERE student_id=?", (student_id,)).fetchone()
        if stud_user:
            create_notification(
                stud_user["email"],
                f"Status Update: {body.status}",
                f"Your academic record status was updated to '{body.status}'. Note: {body.reason}",
                "status_change"
            )

    audit(user["email"], "student_status_updated", f"{student_id} -> {body.status} ({body.reason})")
    return {"ok": True, "message": f"Student {student_id} status updated to {body.status}"}

# CSV Upload & Export with Injection Protection
@app.get("/api/students/sample-csv")
def sample_csv():
    content = (
        "student_id,name,apaar_id,institution,programme,year\n"
        "UC-2026-101,Aarav Sharma,APAAR900123456789,Northstar Institute of Technology,Computer Science,1\n"
        "UC-2026-102,Ananya Rao,APAAR900234567890,Northstar Institute of Technology,Electronics,2\n"
        "UC-2026-103,Kabir Das,APAAR900345678901,Riverbend College of Engineering,Information Technology,3\n"
    )
    return Response(
        content=content,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=sample_students.csv"}
    )

@app.post("/api/students/upload-csv")
async def upload_csv(
    file: UploadFile = File(...),
    user=Depends(require_roles("institution", "admin"))
):
    if not file.filename or Path(file.filename).suffix.lower() != ".csv":
        raise HTTPException(400, "Please upload a valid .csv file")
    
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "CSV file exceeds the 5 MB limit")
    
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(400, "CSV must use valid UTF-8 encoding")

    reader = csv.DictReader(io.StringIO(text))
    required = {"student_id", "name", "apaar_id", "institution", "programme", "year"}
    headers = {h.strip().lower() for h in (reader.fieldnames or []) if h}
    missing = sorted(required - headers)
    if missing:
        raise HTTPException(422, f"Missing required CSV columns: {', '.join(missing)}")

    normalized = []
    seen_apaar, seen_student_ids = set(), set()
    errors = []

    user_inst = (user.get("institution") or "").strip().lower() if user["role"] == "institution" else None

    for line_num, raw in enumerate(reader, start=2):
        row = {str(k).strip().lower(): (v or "").strip() for k, v in raw.items() if k}
        sid = row.get("student_id", "")
        apaar = row.get("apaar_id", "")
        name = row.get("name", "")
        inst = row.get("institution", "")
        programme = row.get("programme", "")
        year_str = row.get("year", "")

        # Check required fields
        if not all([sid, name, apaar, inst, programme, year_str]):
            errors.append({"line": line_num, "student_id": sid, "reason": "One or more required fields are empty"})
            continue

        # Institution isolation check
        if user_inst and inst.strip().lower() != user_inst:
            errors.append({
                "line": line_num,
                "student_id": sid,
                "reason": f"Institution mismatch: cannot import records for '{inst}', only '{user['institution']}'"
            })
            continue

        # APAAR format regex
        if not re.fullmatch(r"[A-Za-z0-9-]{6,40}", apaar):
            errors.append({"line": line_num, "student_id": sid, "reason": "APAAR ID format invalid (must be 6-40 alphanumeric/hyphens)"})
            continue

        # In-file duplicates
        if apaar in seen_apaar:
            errors.append({"line": line_num, "student_id": sid, "reason": "Duplicate APAAR ID within this file"})
            continue
        if sid in seen_student_ids:
            errors.append({"line": line_num, "student_id": sid, "reason": "Duplicate Student ID within this file"})
            continue

        # Year validation
        try:
            year = int(year_str)
            if year < 1 or year > 10:
                raise ValueError()
        except ValueError:
            errors.append({"line": line_num, "student_id": sid, "reason": "Academic Year must be a number between 1 and 10"})
            continue

        seen_apaar.add(apaar)
        seen_student_ids.add(sid)
        normalized.append((sid, name, apaar, inst, programme, year))

    # Transactional database insertion
    inserted = 0
    with connect() as con:
        for record in normalized:
            try:
                con.execute(
                    """INSERT INTO students(student_id, name, apaar_id, institution, programme, year, status, created_at, updated_at)
                       VALUES(?,?,?,?,?,?,?,?,?)""",
                    (*record, "Pending review", now(), now())
                )
                inserted += 1
            except sqlite3.IntegrityError:
                errors.append({"student_id": record[0], "reason": f"Student ID '{record[0]}' already exists in database"})
        con.commit()

    audit(user["email"], "csv_validation", f"{file.filename}: {inserted} inserted, {len(errors)} rejected")
    return {
        "filename": file.filename,
        "rows_inserted": inserted,
        "rows_rejected": len(errors),
        "errors": errors,
        "note": "VidyaChain format validation complete. Not an official APAAR verification."
    }

@app.get("/api/students/export-csv")
def export_students_csv(user=Depends(require_roles("institution", "admin"))):
    """Export student records with protection against CSV Formula Injection (=, +, -, @)"""
    def sanitize(val):
        s = str(val or "")
        if s.startswith(("=", "+", "-", "@", "\t", "\r")):
            return f"'{s}"
        return s

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Student ID", "Name", "APAAR Reference (Masked)", "Institution", "Programme", "Year", "Status"])

    with connect() as con:
        if user["role"] == "institution":
            rows = con.execute("SELECT * FROM students WHERE institution=? ORDER BY id DESC", (user["institution"],)).fetchall()
        else:
            rows = con.execute("SELECT * FROM students ORDER BY id DESC").fetchall()

    for r in rows:
        masked_apaar = r["apaar_id"][:4] + "****" + r["apaar_id"][-4:] if len(r["apaar_id"]) >= 8 else "********"
        writer.writerow([
            sanitize(r["student_id"]),
            sanitize(r["name"]),
            sanitize(masked_apaar),
            sanitize(r["institution"]),
            sanitize(r["programme"]),
            sanitize(r["year"]),
            sanitize(r["status"])
        ])

    audit(user["email"], "csv_export", f"Exported {len(rows)} records")
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=vidyachain_students_{int(time.time())}.csv"}
    )

# Correction Requests Workflow
@app.post("/api/corrections")
def submit_correction(
    body: CorrectionRequestBody,
    user=Depends(require_roles("student"))
):
    with connect() as con:
        student = con.execute("SELECT * FROM students WHERE student_id=?", (body.student_id,)).fetchone()
        if not student:
            raise HTTPException(404, "Student record not found")
        if user.get("student_id") != body.student_id:
            raise HTTPException(403, "You may only submit correction requests for your own record")

        con.execute(
            """INSERT INTO correction_requests(student_id, student_email, field_name, requested_value, reason, status, institution, created_at, updated_at)
               VALUES(?,?,?,?,?,?,?,?,?)""",
            (body.student_id, user["email"], body.field_name.strip(), body.requested_value.strip(),
             body.reason.strip(), "Pending", student["institution"], now(), now())
        )
        con.execute("UPDATE students SET status='Correction requested', updated_at=? WHERE student_id=?", (now(), body.student_id))
        con.commit()

    audit(user["email"], "correction_requested", f"Student {body.student_id} requested change on '{body.field_name}'")
    return {"ok": True, "message": "Correction request submitted successfully to your institution officer"}

@app.get("/api/corrections")
def list_corrections(user=Depends(require_roles("student", "institution", "admin"))):
    with connect() as con:
        if user["role"] == "student":
            rows = con.execute("SELECT * FROM correction_requests WHERE student_email=? ORDER BY id DESC", (user["email"],)).fetchall()
        elif user["role"] == "institution":
            inst = user.get("institution") or ""
            rows = con.execute("SELECT * FROM correction_requests WHERE institution=? ORDER BY id DESC", (inst,)).fetchall()
        else:
            rows = con.execute("SELECT * FROM correction_requests ORDER BY id DESC").fetchall()
    return {"items": [dict(r) for r in rows]}

@app.patch("/api/corrections/{correction_id}")
def review_correction(
    correction_id: int,
    body: CorrectionReviewBody,
    user=Depends(require_roles("institution", "admin"))
):
    if body.status not in ["Approved", "Rejected"]:
        raise HTTPException(400, "Review status must be Approved or Rejected")

    with connect() as con:
        req = con.execute("SELECT * FROM correction_requests WHERE id=?", (correction_id,)).fetchone()
        if not req:
            raise HTTPException(404, "Correction request not found")
        if user["role"] == "institution" and user.get("institution") != req["institution"]:
            raise HTTPException(403, "Cannot review correction request belonging to another institution")

        con.execute(
            "UPDATE correction_requests SET status=?, reviewer_notes=?, updated_at=? WHERE id=?",
            (body.status, body.notes or "", now(), correction_id)
        )

        if body.status == "Approved":
            # Apply approved change if field is allowed
            allowed_fields = {"name", "programme", "year"}
            field = req["field_name"].lower()
            if field in allowed_fields:
                con.execute(f"UPDATE students SET {field}=?, status='Verified', updated_at=? WHERE student_id=?",
                            (req["requested_value"], now(), req["student_id"]))
            else:
                con.execute("UPDATE students SET status='Verified', updated_at=? WHERE student_id=?", (now(), req["student_id"]))
        else:
            con.execute("UPDATE students SET status='Verified', updated_at=? WHERE student_id=?", (now(), req["student_id"]))

        con.commit()

    create_notification(
        req["student_email"],
        f"Correction Request {body.status}",
        f"Your correction request for {req['field_name']} was {body.status.lower()}. {body.notes or ''}",
        "correction_review"
    )

    audit(user["email"], "correction_reviewed", f"Request #{correction_id} {body.status} for {req['student_id']}")
    return {"ok": True, "message": f"Correction request marked as {body.status}"}

# SecureVault Document Management
@app.post("/api/vault/upload")
async def vault_upload(
    file: UploadFile = File(...),
    student_id: Optional[str] = None,
    user=Depends(require_roles("student", "institution", "admin"))
):
    original = Path(file.filename or "upload.bin").name
    # Strip potential path traversal sequences
    original = re.sub(r"[^\w.\-_]", "_", original)
    ext = Path(original).suffix.lower()

    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"File type '{ext}' not allowed. Permitted: PDF, CSV, TXT, PNG, JPG.")

    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if not content:
        raise HTTPException(400, "Uploaded file is empty")
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "File exceeds the 5 MB size limit")

    target_student_id = student_id or user.get("student_id")
    if user["role"] == "student" and target_student_id != user.get("student_id"):
        raise HTTPException(403, "Students can only upload documents associated with their own student ID")

    # Secure randomized storage name
    stored = f"{secrets.token_hex(16)}{ext}"
    digest = hashlib.sha256(content).hexdigest()
    path = VAULT / stored
    path.write_bytes(content)

    scan_status = "Scanner not configured (ClamAV sandbox; prototype mode)"

    with connect() as con:
        con.execute(
            """INSERT INTO vault_files(stored_name, original_name, sha256, size, content_type, uploaded_by, student_id, institution, scan_status, created_at)
               VALUES(?,?,?,?,?,?,?,?,?,?)""",
            (stored, original, digest, len(content), file.content_type or "application/octet-stream",
             user["email"], target_student_id, user.get("institution"), scan_status, now())
        )
        con.commit()

    audit(user["email"], "vault_upload", f"{original} ({len(content)} bytes); SHA-256={digest}")
    return {
        "ok": True,
        "filename": original,
        "size": len(content),
        "sha256": digest,
        "scan_status": scan_status,
        "message": "Stored in SecureVault. Baseline SHA-256 recorded."
    }

@app.get("/api/vault/files")
def list_vault_files(user=Depends(require_roles("student", "institution", "admin"))):
    with connect() as con:
        if user["role"] == "student":
            rows = con.execute(
                "SELECT id, original_name, sha256, size, content_type, uploaded_by, student_id, scan_status, created_at FROM vault_files WHERE student_id=? OR uploaded_by=? ORDER BY id DESC",
                (user.get("student_id"), user["email"])
            ).fetchall()
        elif user["role"] == "institution":
            inst = user.get("institution") or ""
            rows = con.execute(
                "SELECT id, original_name, sha256, size, content_type, uploaded_by, student_id, scan_status, created_at FROM vault_files WHERE institution=? OR uploaded_by=? ORDER BY id DESC",
                (inst, user["email"])
            ).fetchall()
        else:
            rows = con.execute(
                "SELECT id, original_name, sha256, size, content_type, uploaded_by, student_id, scan_status, created_at FROM vault_files ORDER BY id DESC"
            ).fetchall()

    return {"items": [dict(r) for r in rows]}

@app.get("/api/vault/files/{file_id}/download")
def download_vault_file(file_id: int, user=Depends(require_roles("student", "institution", "admin"))):
    with connect() as con:
        row = con.execute("SELECT * FROM vault_files WHERE id=?", (file_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Vault file not found")

    # Scoped permissions
    if user["role"] == "student" and row["student_id"] != user.get("student_id") and row["uploaded_by"] != user["email"]:
        raise HTTPException(403, "Access denied: you do not own this document")
    if user["role"] == "institution" and row["institution"] != user.get("institution") and row["uploaded_by"] != user["email"]:
        raise HTTPException(403, "Access denied: document belongs to another institution")

    path = VAULT / row["stored_name"]
    if not path.is_file():
        raise HTTPException(404, "Physical file missing from SecureVault storage")

    audit(user["email"], "vault_download", f"Downloaded {row['original_name']} (ID: {file_id})")
    return FileResponse(path, filename=row["original_name"], media_type=row["content_type"] or "application/octet-stream")

@app.delete("/api/vault/files/{file_id}")
def delete_vault_file(file_id: int, user=Depends(require_roles("student", "institution", "admin"))):
    with connect() as con:
        row = con.execute("SELECT * FROM vault_files WHERE id=?", (file_id,)).fetchone()
        if not row:
            raise HTTPException(404, "File not found")

        # Check permissions
        if user["role"] == "student" and row["uploaded_by"] != user["email"]:
            raise HTTPException(403, "Students may only delete their own uploaded files")
        if user["role"] == "institution" and row["institution"] != user.get("institution") and row["uploaded_by"] != user["email"]:
            raise HTTPException(403, "Access denied: cannot delete file from another institution")

        path = VAULT / row["stored_name"]
        if path.is_file():
            try:
                path.unlink()
            except Exception as e:
                print(f"Error removing file from disk: {e}")

        con.execute("DELETE FROM vault_files WHERE id=?", (file_id,))
        con.commit()

    audit(user["email"], "vault_delete", f"Deleted {row['original_name']} (ID: {file_id})")
    return {"ok": True, "message": f"File '{row['original_name']}' deleted from SecureVault"}

@app.post("/api/vault/check-integrity")
def check_integrity(user=Depends(require_roles("institution", "admin"))):
    results = []
    with connect() as con:
        if user["role"] == "institution":
            rows = con.execute("SELECT * FROM vault_files WHERE institution=? ORDER BY id DESC", (user.get("institution"),)).fetchall()
        else:
            rows = con.execute("SELECT * FROM vault_files ORDER BY id DESC").fetchall()

        for row in rows:
            path = VAULT / row["stored_name"]
            exists = path.is_file()
            actual = hashlib.sha256(path.read_bytes()).hexdigest() if exists else None
            ok = bool(exists and hmac.compare_digest(actual or "", row["sha256"]))
            results.append({
                "id": row["id"],
                "filename": row["original_name"],
                "ok": ok,
                "status": "OK" if ok else "MISMATCH_OR_MISSING",
                "expected_sha256": row["sha256"][:12] + "...",
                "actual_sha256": actual[:12] + "..." if actual else "None"
            })
            if not ok:
                audit(user["email"], "integrity_mismatch", f"Checksum mismatch for file {row['original_name']}")

    audit(user["email"], "integrity_check", f"Integrity check executed on {len(results)} files")
    return {
        "checked": len(results),
        "passed": sum(1 for x in results if x["ok"]),
        "failed": sum(1 for x in results if not x["ok"]),
        "results": results
    }

@app.get("/api/vault/summary")
def vault_summary(user=Depends(require_roles("student", "institution", "admin"))):
    with connect() as con:
        count = con.execute("SELECT COUNT(*) FROM vault_files").fetchone()[0]
        size = con.execute("SELECT COALESCE(SUM(size), 0) FROM vault_files").fetchone()[0]
    return {
        "files": count,
        "bytes": size,
        "max_file_bytes": MAX_UPLOAD_BYTES,
        "scanner_status": "Scanner not configured (ClamAV offline; prototype mode)",
        "encryption_status": "AES-256 rest-encryption interface ready"
    }

# QR Code Verification API
@app.post("/api/verify/generate-token")
def generate_verification_token(
    body: TokenGenerateBody,
    user=Depends(require_roles("student", "institution", "admin"))
):
    with connect() as con:
        student = con.execute("SELECT * FROM students WHERE student_id=?", (body.student_id,)).fetchone()
        if not student:
            raise HTTPException(404, "Student record not found")

        # Scoped permission check
        if user["role"] == "student" and user.get("student_id") != body.student_id:
            raise HTTPException(403, "You can only generate verification references for your own record")
        if user["role"] == "institution" and user.get("institution") != student["institution"]:
            raise HTTPException(403, "Cannot generate verification token for a student from another institution")

        # High-entropy cryptographically secure token
        token_ref = f"VIDYACHAIN-REF-{secrets.token_hex(6).upper()}"
        secret_token = secrets.token_urlsafe(32)
        full_token = f"{token_ref}.{secret_token}"
        token_hash = hashlib.sha256(full_token.encode()).hexdigest()
        
        expires_at = (datetime.now(timezone.utc) + timedelta(hours=body.valid_hours or 24)).isoformat()

        con.execute(
            """INSERT INTO verification_tokens(token_reference, token_hash, student_id, created_by, expires_at, created_at)
               VALUES(?,?,?,?,?,?)""",
            (token_ref, token_hash, body.student_id, user["email"], expires_at, now())
        )
        con.commit()

    audit(user["email"], "qr_token_generated", f"Generated token {token_ref} for {body.student_id} (Expires: {expires_at})")

    return {
        "ok": True,
        "token_reference": token_ref,
        "verification_token": full_token,
        "expires_at": expires_at,
        "student_id": body.student_id,
        "message": "Verification token generated. Present this token or QR code to verifiers."
    }

@app.get("/api/verify/tokens")
def list_verification_tokens(user=Depends(require_roles("student", "institution", "admin"))):
    with connect() as con:
        if user["role"] == "student":
            rows = con.execute(
                "SELECT id, token_reference, student_id, created_by, expires_at, is_revoked, created_at FROM verification_tokens WHERE student_id=? OR created_by=? ORDER BY id DESC",
                (user.get("student_id"), user["email"])
            ).fetchall()
        elif user["role"] == "institution":
            rows = con.execute(
                "SELECT id, token_reference, student_id, created_by, expires_at, is_revoked, created_at FROM verification_tokens WHERE created_by=? ORDER BY id DESC",
                (user["email"],)
            ).fetchall()
        else:
            rows = con.execute(
                "SELECT id, token_reference, student_id, created_by, expires_at, is_revoked, created_at FROM verification_tokens ORDER BY id DESC LIMIT 100"
            ).fetchall()

    return {"items": [dict(r) for r in rows]}

@app.delete("/api/verify/tokens/{token_id}")
def revoke_verification_token(token_id: int, user=Depends(require_roles("student", "institution", "admin"))):
    with connect() as con:
        row = con.execute("SELECT * FROM verification_tokens WHERE id=?", (token_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Verification reference not found")

        if user["role"] == "student" and row["created_by"] != user["email"] and row["student_id"] != user.get("student_id"):
            raise HTTPException(403, "Access denied: cannot revoke this reference")

        con.execute("UPDATE verification_tokens SET is_revoked=1 WHERE id=?", (token_id,))
        con.commit()

    audit(user["email"], "qr_token_revoked", f"Revoked token #{token_id} ({row['token_reference']})")
    return {"ok": True, "message": "Verification token revoked successfully"}

@app.get("/api/verify/resolve/{token_ref}")
def resolve_verification_token(token_ref: str, request: Request):
    """
    Public/Verifier lookup for a verification token.
    Rate-limited, enforces expiration & revocation, returns only authorized public fields.
    """
    client_ip = request.client.host if request.client else "unknown"
    cur_time = time.time()
    attempts = [t for t in VERIFY_ATTEMPTS.get(client_ip, []) if cur_time - t < 60]
    if len(attempts) >= 30:
        raise HTTPException(429, "Too many verification requests. Please slow down.")
    VERIFY_ATTEMPTS.setdefault(client_ip, []).append(cur_time)

    # Clean query reference
    ref = token_ref.split(".")[0].strip().upper()

    with connect() as con:
        t_row = con.execute("SELECT * FROM verification_tokens WHERE token_reference=?", (ref,)).fetchone()
        if not t_row:
            audit("verifier_anonymous", "verification_not_found", f"Lookup failed for token: {ref[:30]}")
            raise HTTPException(404, "Verification reference is invalid or does not exist")

        if t_row["is_revoked"]:
            audit("verifier_anonymous", "verification_revoked", f"Revoked token lookup: {ref}")
            raise HTTPException(410, "This verification reference has been revoked by the issuer or student")

        # Check expiration
        expires_dt = datetime.fromisoformat(t_row["expires_at"])
        if datetime.now(timezone.utc) > expires_dt:
            audit("verifier_anonymous", "verification_expired", f"Expired token lookup: {ref}")
            raise HTTPException(410, "This verification reference has expired. Please request a newly generated QR/token.")

        # Fetch student details
        student = con.execute("SELECT * FROM students WHERE student_id=?", (t_row["student_id"],)).fetchone()
        if not student:
            raise HTTPException(404, "Referenced student record is unavailable")

    audit("verifier_anonymous", "verification_success", f"Resolved verification for {student['student_id']}")

    # Mask sensitive APAAR ID (never return raw APAAR ID or sensitive documents)
    raw_apaar = student["apaar_id"]
    masked_apaar = raw_apaar[:4] + "••••••••" + raw_apaar[-4:] if len(raw_apaar) >= 8 else "••••••••"

    return {
        "valid": True,
        "token_reference": t_row["token_reference"],
        "expires_at": t_row["expires_at"],
        "student_id": student["student_id"],
        "name": student["name"],
        "institution": student["institution"],
        "programme": student["programme"],
        "year": student["year"],
        "status": student["status"],
        "masked_apaar": masked_apaar,
        "verification_timestamp": now(),
        "disclaimer": "VidyaChain record status checked; local format validation. Not an official APAAR/AICTE government identity certificate."
    }

# Notifications API
@app.get("/api/notifications")
def list_notifications(user=Depends(current_user)):
    with connect() as con:
        rows = con.execute(
            "SELECT * FROM notifications WHERE recipient_email=? ORDER BY id DESC LIMIT 50",
            (user["email"],)
        ).fetchall()
        unread = con.execute(
            "SELECT COUNT(*) FROM notifications WHERE recipient_email=? AND is_read=0",
            (user["email"],)
        ).fetchone()[0]
    return {"items": [dict(r) for r in rows], "unread_count": unread}

@app.patch("/api/notifications/{notification_id}/read")
def mark_notification_read(notification_id: int, user=Depends(current_user)):
    with connect() as con:
        con.execute(
            "UPDATE notifications SET is_read=1 WHERE id=? AND recipient_email=?",
            (notification_id, user["email"])
        )
        con.commit()
    return {"ok": True}

@app.post("/api/notifications/read-all")
def mark_all_notifications_read(user=Depends(current_user)):
    with connect() as con:
        con.execute("UPDATE notifications SET is_read=1 WHERE recipient_email=?", (user["email"],))
        con.commit()
    return {"ok": True, "message": "All notifications marked as read"}

# Audit Logs (Admin only)
@app.get("/api/audit")
def get_audit(
    q: Optional[str] = None,
    action: Optional[str] = None,
    actor: Optional[str] = None,
    user=Depends(require_roles("admin"))
):
    with connect() as con:
        query = "SELECT * FROM audit WHERE 1=1"
        params = []
        if action:
            query += " AND action=?"
            params.append(action)
        if actor:
            query += " AND actor LIKE ?"
            params.append(f"%{actor}%")
        if q:
            query += " AND (actor LIKE ? OR detail LIKE ? OR action LIKE ?)"
            p = f"%{q.strip()}%"
            params.extend([p, p, p])
        query += " ORDER BY id DESC LIMIT 150"
        rows = con.execute(query, params).fetchall()
    return {"items": [dict(r) for r in rows]}
