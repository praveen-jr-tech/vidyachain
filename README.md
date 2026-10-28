# VidyaChain — APAAR-AICTE Student Data Management and Verification Platform

A security-focused full-stack web application designed for academic credential management, institutional record isolation, SecureVault file storage, and privacy-preserving QR verification.

Built for the APAAR–AICTE Academic Trust Hackathon.

---

## 🏛️ System Architecture

- **Frontend**: React 18, Vite, Vanilla CSS Design System with 3D Card Dynamics, Lucide Icons
- **Backend**: Python FastAPI with Pydantic schema validation & parameterized SQLite operations
- **Database**: SQLite with automatic table migrations and relational integrity constraints (`PRAGMA foreign_keys=ON`)
- **Cryptography & Security**:
  - **Password Hashing**: OWASP-compliant `PBKDF2-HMAC-SHA256` with 600,000 iterations
  - **Multi-Factor Authentication (MFA)**: Built-in 2FA for privileged Administrator accounts
  - **Rate Limiting**: Brute-force protection on authentication and public verification endpoints
  - **Session Management**: Cryptographically signed bearer tokens with server-side blocklist revocation on logout
  - **Document Security**: Random UUID filenames stored outside the web root, SHA-256 baseline hashing, and integrity audit checks
  - **CSV Injection Prevention**: Automatic sanitization (`=, +, -, @`) on student data exports
  - **Role-Based Isolation**: Server-enforced student ownership and institution-level record separation

---

## 🌐 Live Public Deployment (Vercel)

VidyaChain includes native support for instant deployment on **Vercel**, **Netlify**, or any static cloud platform.
- **Root `vercel.json`** & **`package.json`** automatically build the React Vite application.
- **Standalone Prototype Engine**: In public live demo mode, all features (role switching between Student, Institution, Admin, and Verifier, CSV intake validation, SecureVault SHA-256 calculation, and QR token verification) run seamlessly in-browser with zero backend required.
- **One-Click Deploy**: Import the GitHub repo `https://github.com/praveen-jr-tech/vidyachain` into Vercel and click **Deploy**.

---

## 🚀 Quick Start Guide

### Prerequisites
- **Python**: 3.11+
- **Node.js**: 20+ (LTS recommended)
- **Git** (optional)

---

### Step 1: Start Backend API (Terminal 1)

#### Windows (PowerShell):
```powershell
# Navigate to the project root
cd "C:\Users\pra17\Documents\APEX NOVA\unicred_full_project"

# Activate the virtual environment
.\.venv\Scripts\Activate.ps1

# (Optional) Install dependencies if not already installed
pip install -r backend/requirements.txt

# Run the FastAPI backend server
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --app-dir backend --reload
```

#### macOS / Linux:
```bash
# Navigate to the project root
cd unicred_full_project

# Create & activate virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r backend/requirements.txt

# Run backend
python3 -m uvicorn main:app --host 127.0.0.1 --port 8000 --app-dir backend --reload
```

- **Backend API URL**: `http://127.0.0.1:8000`
- **Swagger Interactive API Docs**: `http://127.0.0.1:8000/docs`
- **Health Check**: `http://127.0.0.1:8000/api/health`

---

### Step 2: Start Frontend Web App (Terminal 2)

```bash
# Navigate to the frontend directory
cd frontend

# Install npm dependencies (first time only)
npm install

# Start Vite development server
npm run dev
```

- **Frontend Application URL**: `http://localhost:5173`

---

## 🔑 Prototype Personas & Credentials

All prototype accounts use the standard password: **`Prototype@2026`** *(or `Demo@12345`)*

| Role | Email Address | Access Level & Scope | Special Notes |
|---|---|---|---|
| **Student** | `student@vidyachain.org` | Personal record (`UC-2026-001`) only | Can upload documents, request corrections, issue QR tokens |
| **Institution** | `institution@vidyachain.org` | Northstar Institute of Technology | Can upload CSV, review records, approve/reject changes |
| **AICTE Admin** | `admin@vidyachain.org` | System-wide administrative governance | **Requires MFA OTP code: `123456`** |
| **Verifier** | `verifier@vidyachain.org` | Third-party credential verification | Validates QR tokens and credential references |

*Note: Legacy aliases (`@unicred.org`, `@unicred.demo`) remain active for full backward compatibility.*

---

## 🧪 Running Automated Tests

A comprehensive test suite verifies authentication, password hashing, rate limiting, role isolation, CSV validation, SecureVault integrity, and QR verification.

Run the test suite using Python's standard runner:

```powershell
# Windows PowerShell:
.\.venv\Scripts\python -m unittest backend/test_unicred.py

# macOS / Linux:
python3 -m unittest backend/test_unicred.py
```

Expected result:
```
.......
----------------------------------------------------------------------
Ran 7 tests in ~7.5s

OK
```

---

## 📋 Platform Walkthrough & Presentation Guide

Follow this 5-minute presentation script to showcase the platform:

1. **Public Landing Page (`http://localhost:5173`)**:
   - Showcase the 3D rotating shield hero, trust metrics, and platform overview.
2. **Student Experience**:
   - Log in as `student@vidyachain.org`.
   - Show personal student record with **masked APAAR identifier** (`APAAR12••••••••9012`).
   - Click **"Request Correction"** to submit a change request for Degree Programme.
   - Upload a sample PDF/PNG certificate to **SecureVault** and view the recorded SHA-256 hash.
   - Click **"QR Token"** to generate an ephemeral verification token reference.
3. **Institution Operations**:
   - Sign out and log in as `institution@vidyachain.org`.
   - Point out **Institution Isolation**: only Northstar Institute students are visible.
   - Navigate to **"Data Intake & CSV"**:
     - Download the sample CSV template.
     - Upload `sample_students.csv` and show real-time format and duplicate checks.
     - Click **"Export Safe CSV"** to demonstrate CSV injection protection.
     - Approve the student's pending correction request.
4. **Third-Party Verifier**:
   - Log in as `verifier@vidyachain.org` (or open Verification workspace).
   - Enter a token reference (e.g. `VIDYACHAIN-REF-XXXXXX`) or click an active verified reference.
   - View the verified credential card displaying validated fields without exposing private student documents.
5. **AICTE Administrator**:
   - Sign in as `admin@vidyachain.org` — demonstrate the **MFA 2FA prompt** (Prototype OTP: `123456`).
   - Open **"Audit & Security"** to inspect chronological audit entries.
   - Open **"SecureVault"** and click **"Run Integrity Audit"** to verify file integrity on disk.

---

## 🚀 Pushing to GitHub

To push this repository to GitHub:

```bash
# 1. Initialize git (if not already initialized)
git init

# 2. Stage all files
git add .

# 3. Create initial launch commit
git commit -m "feat: launch VidyaChain APAAR-AICTE student data verification platform prototype"

# 4. Link your GitHub remote repository
git remote add origin https://github.com/<YOUR-USERNAME>/<YOUR-REPO-NAME>.git

# 5. Push to main branch
git branch -M main
git push -u origin main
```

---

## 🔒 Security Architecture & Governance Notes

### What Works Locally (Offline)
- Zero-trust RBAC and institution-level record isolation.
- OWASP PBKDF2-HMAC-SHA256 password security (600,000 iterations).
- Login rate limiting and failed attempt monitoring.
- Ephemeral QR verification tokens with expiration and instant revocation.
- SecureVault file isolation with cryptographic SHA-256 baselines.
- CSV sanitization against formula injection attacks.

### Prototype Disclaimers & Production Roadmap
- **Synthetic Data Only**: All records and APAAR numbers in this demonstration are synthetic.
- **Format Validation vs Official Verification**: Local format checks confirm length and syntax, but do not claim official connection to live DigiLocker, ABC, or AICTE backend APIs without authorized government credentials.
- **Malware Scanning**: Displays `"Scanner not configured (prototype sandbox)"` truthfully. In production, connect ClamAV daemon (`clamd`) at port 3310.
- **Database**: Uses SQLite with foreign keys enabled. For enterprise scale, migrate to PostgreSQL with read replicas.
