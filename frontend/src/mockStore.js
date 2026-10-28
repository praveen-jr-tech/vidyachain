// VidyaChain Client-Side Prototype Engine & Fallback Store
// Ensures seamless, instant demonstration on public deployments (e.g. Vercel, Netlify)
// without requiring an active local backend process.

export const PROTOTYPE_PERSONAS = {
  admin: {
    id: 1,
    email: "admin@vidyachain.org",
    name: "VidyaChain Administrator",
    role: "admin",
    institution: null,
    student_id: null,
    mfa_enabled: 1
  },
  student: {
    id: 2,
    email: "student@vidyachain.org",
    name: "Aarav Sharma",
    role: "student",
    institution: "Northstar Institute of Technology",
    student_id: "UC-2026-001",
    mfa_enabled: 0
  },
  institution: {
    id: 3,
    email: "institution@vidyachain.org",
    name: "Dr. Sunita Rao (Dean)",
    role: "institution",
    institution: "Northstar Institute of Technology",
    student_id: null,
    mfa_enabled: 0
  },
  verifier: {
    id: 4,
    email: "verifier@vidyachain.org",
    name: "Authorized Verifier",
    role: "verifier",
    institution: null,
    student_id: null,
    mfa_enabled: 0
  }
};

const INITIAL_STUDENTS = [
  {
    student_id: "UC-2026-001",
    name: "Aarav Sharma",
    apaar_id: "APAAR123456789012",
    institution: "Northstar Institute of Technology",
    programme: "Computer Science",
    year: 2,
    status: "Verified",
    created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    student_id: "UC-2026-002",
    name: "Meera Iyer",
    apaar_id: "APAAR234567890123",
    institution: "Northstar Institute of Technology",
    programme: "Information Technology",
    year: 3,
    status: "Verified",
    created_at: new Date(Date.now() - 86400000 * 4).toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    student_id: "UC-2026-003",
    name: "Kabir Das",
    apaar_id: "APAAR345678901234",
    institution: "Riverbend College of Engineering",
    programme: "Electronics & Communication",
    year: 1,
    status: "Pending review",
    created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    student_id: "UC-2026-004",
    name: "Ananya Rao",
    apaar_id: "APAAR456789012345",
    institution: "Riverbend College of Engineering",
    programme: "Computer Science",
    year: 4,
    status: "Verified",
    created_at: new Date(Date.now() - 86400000 * 6).toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    student_id: "UC-2026-005",
    name: "Devansh Patel",
    apaar_id: "APAAR567890123456",
    institution: "Northstar Institute of Technology",
    programme: "Mechanical Engineering",
    year: 2,
    status: "Verified",
    created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    student_id: "UC-2026-006",
    name: "Pooja Hegde",
    apaar_id: "APAAR678901234567",
    institution: "Northstar Institute of Technology",
    programme: "Data Science & AI",
    year: 3,
    status: "Verified",
    created_at: new Date(Date.now() - 86400000 * 1).toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    student_id: "UC-2026-007",
    name: "Rohan Varma",
    apaar_id: "APAAR789012345678",
    institution: "Riverbend College of Engineering",
    programme: "Civil Engineering",
    year: 1,
    status: "Flagged",
    created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    student_id: "UC-2026-008",
    name: "Sneha Nambiar",
    apaar_id: "APAAR890123456789",
    institution: "Northstar Institute of Technology",
    programme: "Cybersecurity",
    year: 4,
    status: "Verified",
    created_at: new Date(Date.now() - 86400000 * 7).toISOString(),
    updated_at: new Date().toISOString()
  }
];

const INITIAL_VAULT_FILES = [
  {
    id: 1,
    student_id: "UC-2026-001",
    filename: "UC-2026-001_Semester_Transcript.pdf",
    original_name: "UC-2026-001_Semester_Transcript.pdf",
    sha256: "9b3c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855a",
    sha256_hash: "9b3c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855a",
    file_size: 245760,
    created_at: new Date(Date.now() - 86400000 * 4).toISOString(),
    status: "Baseline verified",
    scan_status: "Clean (Verified)",
    uploaded_by: "student@vidyachain.org"
  },
  {
    id: 2,
    student_id: null,
    filename: "Northstar_AICTE_Accreditation_Certificate.pdf",
    original_name: "Northstar_AICTE_Accreditation_Certificate.pdf",
    sha256: "a41d8cd98f00b204e9800998ecf8427e02580a82743bc40b37f40776997d9e48",
    sha256_hash: "a41d8cd98f00b204e9800998ecf8427e02580a82743bc40b37f40776997d9e48",
    file_size: 1310720,
    created_at: new Date(Date.now() - 86400000 * 8).toISOString(),
    status: "Baseline verified",
    scan_status: "Clean (Verified)",
    uploaded_by: "institution@vidyachain.org"
  },
  {
    id: 3,
    student_id: "UC-2026-001",
    filename: "Aarav_Sharma_APAAR_National_E-Badge.pdf",
    original_name: "Aarav_Sharma_APAAR_National_E-Badge.pdf",
    sha256: "bf86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
    sha256_hash: "bf86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
    file_size: 186368,
    created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    status: "Baseline verified",
    scan_status: "Clean (Verified)",
    uploaded_by: "student@vidyachain.org"
  },
  {
    id: 4,
    student_id: null,
    filename: "Riverbend_Degree_Verification_Batch2025.pdf",
    original_name: "Riverbend_Degree_Verification_Batch2025.pdf",
    sha256: "ce884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8",
    sha256_hash: "ce884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8",
    file_size: 552960,
    created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    status: "Baseline verified",
    scan_status: "Clean (Verified)",
    uploaded_by: "admin@vidyachain.org"
  }
];

const INITIAL_TOKENS = [
  {
    id: 1,
    token_reference: "VIDYACHAIN-REF-789ABC",
    student_id: "UC-2026-001",
    disclosed_fields: ["name", "student_id", "institution", "programme", "year", "status"],
    expires_at: new Date(Date.now() + 86400000 * 7).toISOString(),
    created_at: new Date(Date.now() - 3600000 * 4).toISOString(),
    is_active: 1
  },
  {
    id: 2,
    token_reference: "VIDYACHAIN-REF-234DEF",
    student_id: "UC-2026-002",
    disclosed_fields: ["name", "student_id", "institution", "status"],
    expires_at: new Date(Date.now() + 86400000 * 3).toISOString(),
    created_at: new Date(Date.now() - 3600000 * 12).toISOString(),
    is_active: 1
  }
];

const INITIAL_AUDIT = [
  { id: 101, actor_email: "admin@vidyachain.org", action: "SYSTEM_INITIALIZED", target: "VidyaChain Core", status: "SUCCESS", created_at: new Date(Date.now() - 1000 * 60 * 120).toISOString() },
  { id: 102, actor_email: "admin@vidyachain.org", action: "MFA_LOGIN_SUCCESS", target: "admin_portal", status: "SUCCESS", created_at: new Date(Date.now() - 1000 * 60 * 95).toISOString() },
  { id: 103, actor_email: "institution@vidyachain.org", action: "CSV_INTAKE_PROCESSED", target: "Northstar Institute", status: "SUCCESS", created_at: new Date(Date.now() - 1000 * 60 * 75).toISOString() },
  { id: 104, actor_email: "student@vidyachain.org", action: "QR_TOKEN_GENERATED", target: "VIDYACHAIN-REF-789ABC", status: "SUCCESS", created_at: new Date(Date.now() - 1000 * 60 * 40).toISOString() },
  { id: 105, actor_email: "verifier@vidyachain.org", action: "TOKEN_VERIFICATION_CHECK", target: "VIDYACHAIN-REF-789ABC", status: "SUCCESS", created_at: new Date(Date.now() - 1000 * 60 * 15).toISOString() }
];

const INITIAL_NOTIFICATIONS = [
  { id: 1, recipient_email: "student@vidyachain.org", title: "Welcome to VidyaChain", message: "Your student academic record UC-2026-001 is ready for review.", type: "info", is_read: 0, created_at: new Date(Date.now() - 86400000).toISOString() },
  { id: 2, recipient_email: "admin@vidyachain.org", title: "Security Baseline Initialized", message: "VidyaChain prototype monitoring and SHA-256 integrity checks enabled.", type: "security", is_read: 0, created_at: new Date(Date.now() - 86400000 * 2).toISOString() },
  { id: 3, recipient_email: "institution@vidyachain.org", title: "Batch Verification Complete", message: "8 student records verified under Northstar Institute of Technology.", type: "info", is_read: 1, created_at: new Date(Date.now() - 86400000 * 3).toISOString() }
];

const STORAGE_KEYS = {
  STUDENTS: "vidyachain_mock_students",
  VAULT: "vidyachain_mock_vault",
  TOKENS: "vidyachain_mock_tokens",
  AUDIT: "vidyachain_mock_audit",
  NOTIFICATIONS: "vidyachain_mock_notifications"
};

function readStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn("Storage write failed", e);
  }
}

export class MockDataService {
  static getStudents(role, user) {
    const list = readStorage(STORAGE_KEYS.STUDENTS, INITIAL_STUDENTS);
    if (role === "student") {
      return list.filter(s => s.student_id === (user?.student_id || "UC-2026-001"));
    }
    if (role === "institution") {
      const inst = user?.institution || "Northstar Institute of Technology";
      return list.filter(s => s.institution.toLowerCase().includes(inst.toLowerCase()) || inst.toLowerCase().includes(s.institution.toLowerCase()));
    }
    return list;
  }

  static getDashboard(role, user) {
    const all = readStorage(STORAGE_KEYS.STUDENTS, INITIAL_STUDENTS);
    const vault = readStorage(STORAGE_KEYS.VAULT, INITIAL_VAULT_FILES);
    const visible = this.getStudents(role, user);
    const pending = visible.filter(s => s.status === "Pending review").length;
    const flagged = visible.filter(s => s.status === "Flagged").length;

    return {
      total_students: visible.length,
      records_pending: pending,
      security_alerts: flagged,
      vault_documents: vault.length,
      integrity_score: "99.8%",
      encryption_standard: "OWASP PBKDF2-HMAC-SHA256 (600,000 Rounds)",
      active_role: role
    };
  }

  static getVaultFiles(role, user) {
    const files = readStorage(STORAGE_KEYS.VAULT, INITIAL_VAULT_FILES);
    if (role === "student") {
      return files.filter(f => !f.student_id || f.student_id === user?.student_id);
    }
    return files;
  }

  static getTokens(role, user) {
    const tokens = readStorage(STORAGE_KEYS.TOKENS, INITIAL_TOKENS);
    if (role === "student") {
      return tokens.filter(t => t.student_id === user?.student_id);
    }
    return tokens;
  }

  static getAudit() {
    return readStorage(STORAGE_KEYS.AUDIT, INITIAL_AUDIT);
  }

  static getNotifications(user) {
    const list = readStorage(STORAGE_KEYS.NOTIFICATIONS, INITIAL_NOTIFICATIONS);
    if (!user) return list;
    return list.filter(n => !n.recipient_email || n.recipient_email === user.email || user.role === "admin");
  }

  static addAuditLog(actorEmail, action, target, status = "SUCCESS") {
    const current = readStorage(STORAGE_KEYS.AUDIT, INITIAL_AUDIT);
    const item = {
      id: Date.now(),
      actor_email: actorEmail || "user@vidyachain.org",
      action,
      target,
      status,
      created_at: new Date().toISOString()
    };
    const updated = [item, ...current].slice(0, 100);
    writeStorage(STORAGE_KEYS.AUDIT, updated);
    return item;
  }

  static updateStudentStatus(studentId, newStatus, actorEmail) {
    const list = readStorage(STORAGE_KEYS.STUDENTS, INITIAL_STUDENTS);
    const updated = list.map(s => s.student_id === studentId ? { ...s, status: newStatus, updated_at: new Date().toISOString() } : s);
    writeStorage(STORAGE_KEYS.STUDENTS, updated);
    this.addAuditLog(actorEmail, "RECORD_STATUS_CHANGED", `${studentId} -> ${newStatus}`);
    return updated;
  }

  static generateToken(studentId, disclosedFields, ttlSeconds, actorEmail) {
    const tokens = readStorage(STORAGE_KEYS.TOKENS, INITIAL_TOKENS);
    const tokenRef = `VIDYACHAIN-REF-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const ttl = ttlSeconds || 86400 * 7;
    const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();

    const newToken = {
      id: Date.now(),
      token_reference: tokenRef,
      student_id: studentId,
      disclosed_fields: disclosedFields || ["name", "student_id", "institution", "programme", "year", "status"],
      expires_at: expiresAt,
      created_at: new Date().toISOString(),
      is_active: 1
    };

    const updated = [newToken, ...tokens];
    writeStorage(STORAGE_KEYS.TOKENS, updated);
    this.addAuditLog(actorEmail, "QR_TOKEN_GENERATED", tokenRef);
    return newToken;
  }

  static resolveToken(tokenRef) {
    const tokens = readStorage(STORAGE_KEYS.TOKENS, INITIAL_TOKENS);
    const students = readStorage(STORAGE_KEYS.STUDENTS, INITIAL_STUDENTS);
    const cleanRef = (tokenRef || "").trim().toUpperCase();

    const foundToken = tokens.find(t => t.token_reference.toUpperCase() === cleanRef && t.is_active);
    if (!foundToken) {
      throw new Error("Verification reference token not found or expired");
    }

    const student = students.find(s => s.student_id === foundToken.student_id);
    if (!student) {
      throw new Error("Referenced student record not found in registry");
    }

    const disclosed = {};
    for (const f of foundToken.disclosed_fields) {
      if (student[f] !== undefined) {
        disclosed[f] = student[f];
      }
    }

    this.addAuditLog("verifier@vidyachain.org", "TOKEN_RESOLVED", cleanRef);

    return {
      valid: true,
      token_reference: foundToken.token_reference,
      expires_at: foundToken.expires_at,
      created_at: foundToken.created_at,
      student_record: disclosed,
      verification_status: "CRYPTOGRAPHICALLY_VERIFIED",
      trust_level: "HIGH_ASSURANCE",
      timestamp: new Date().toISOString()
    };
  }

  static async uploadVaultFile(file, studentId, actorEmail) {
    const files = readStorage(STORAGE_KEYS.VAULT, INITIAL_VAULT_FILES);
    let hashHex = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    try {
      if (window.crypto?.subtle && file) {
        const buffer = await file.arrayBuffer();
        const digest = await window.crypto.subtle.digest("SHA-256", buffer);
        hashHex = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
      }
    } catch {
      // fallback mock hash
      hashHex = Array.from({length: 64}, () => Math.floor(Math.random()*16).toString(16)).join("");
    }

    const newFile = {
      id: Date.now(),
      student_id: studentId || null,
      filename: file?.name || "Uploaded_Document.pdf",
      original_name: file?.name || "Uploaded_Document.pdf",
      sha256: hashHex,
      sha256_hash: hashHex,
      file_size: file?.size || 102400,
      created_at: new Date().toISOString(),
      status: "Baseline verified",
      scan_status: "Clean (Verified)",
      uploaded_by: actorEmail || "admin@vidyachain.org"
    };

    const updated = [newFile, ...files];
    writeStorage(STORAGE_KEYS.VAULT, updated);
    this.addAuditLog(actorEmail, "VAULT_FILE_UPLOADED", newFile.filename);
    return newFile;
  }

  static parseAndImportCsv(csvText, institution, actorEmail) {
    const lines = csvText.trim().split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) throw new Error("CSV file must have a header row and at least one student record");

    const header = lines[0].split(",").map(h => h.trim().toLowerCase());
    const idIdx = header.indexOf("student_id");
    const nameIdx = header.indexOf("name");
    const apaarIdx = header.indexOf("apaar_id");
    const instIdx = header.indexOf("institution");
    const progIdx = header.indexOf("programme");
    const yrIdx = header.indexOf("year");

    if (idIdx === -1 || nameIdx === -1 || apaarIdx === -1) {
      throw new Error("CSV missing required columns: student_id, name, apaar_id");
    }

    const currentStudents = readStorage(STORAGE_KEYS.STUDENTS, INITIAL_STUDENTS);
    let inserted = 0;
    let rejected = 0;
    const newStudents = [...currentStudents];

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(",").map(p => p.trim());
      const sid = parts[idIdx];
      const sname = parts[nameIdx];
      const sapaar = parts[apaarIdx];
      const sinst = (instIdx !== -1 && parts[instIdx]) ? parts[instIdx] : (institution || "Northstar Institute of Technology");
      const sprog = (progIdx !== -1 && parts[progIdx]) ? parts[progIdx] : "Computer Science";
      const syr = (yrIdx !== -1 && parseInt(parts[yrIdx])) ? parseInt(parts[yrIdx]) : 1;

      if (!sid || !sname || !sapaar || sapaar.length < 12) {
        rejected++;
        continue;
      }

      if (newStudents.some(s => s.student_id === sid || s.apaar_id === sapaar)) {
        rejected++;
        continue;
      }

      newStudents.push({
        student_id: sid,
        name: sname,
        apaar_id: sapaar,
        institution: sinst,
        programme: sprog,
        year: syr,
        status: "Verified",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      inserted++;
    }

    writeStorage(STORAGE_KEYS.STUDENTS, newStudents);
    this.addAuditLog(actorEmail, "CSV_IMPORT_COMPLETED", `${inserted} added, ${rejected} rejected`);

    return {
      success: true,
      rows_inserted: inserted,
      rows_rejected: rejected,
      total_processed: lines.length - 1
    };
  }
}
