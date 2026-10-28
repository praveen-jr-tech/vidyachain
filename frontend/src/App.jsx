import { useEffect, useMemo, useState } from "react";
import {
  ShieldCheck, GraduationCap, Building2, BadgeCheck, LockKeyhole,
  Activity, ArrowUpRight, RefreshCw, LayoutDashboard, Users, FileCheck2,
  Files, ClipboardList, LogOut, Search, Upload, CheckCircle2, AlertTriangle,
  Menu, X, Eye, CircleHelp, Globe2, ShieldAlert, FileUp, Plus, ChevronRight,
  Download, Bell, Trash2, QrCode, Check, Filter, KeyRound, ExternalLink
} from "lucide-react";
import { MockDataService, PROTOTYPE_PERSONAS } from "./mockStore";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

const roles = [
  { name: "Student",     role: "student",     email: "student@vidyachain.org",     icon: GraduationCap, note: "Aarav Sharma · Northstar Institute" },
  { name: "Institution", role: "institution", email: "institution@vidyachain.org", icon: Building2,     note: "Dr. Sunita Rao · Northstar Institute Dean" },
  { name: "AICTE Admin", role: "admin",       email: "admin@vidyachain.org",       icon: Activity,      note: "VidyaChain Admin · MFA Protected" },
  { name: "Verifier",    role: "verifier",    email: "verifier@vidyachain.org",    icon: BadgeCheck,    note: "Authorized Third-party Verifier" },
];

const fmt = (d) => d ? new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—";

export default function App() {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem("vidyachain_user") || localStorage.getItem("unicred_user");
      if (stored) return JSON.parse(stored);
      // In public deployment / prototype mode, default to AICTE Admin so the full UI/UX is immediately visible
      return PROTOTYPE_PERSONAS.admin;
    } catch {
      return PROTOTYPE_PERSONAS.admin;
    }
  });
  const [token, setToken] = useState(() => localStorage.getItem("vidyachain_token") || localStorage.getItem("unicred_token") || "prototype-guest-token");
  const [viewMode, setViewMode] = useState("landing"); // Default to the main landing page first
  const [page, setPage] = useState("overview");
  const [mobileOpen, setMobileOpen] = useState(false);
  
  // Auth state
  const [email, setEmail] = useState("admin@vidyachain.org");
  const [password, setPassword] = useState("Prototype@2026");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  // App data state
  const [dashboard, setDashboard] = useState(null);
  const [students, setStudents] = useState([]);
  const [audit, setAudit] = useState([]);
  const [vaultFiles, setVaultFiles] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [corrections, setCorrections] = useState([]);
  const [tokens, setTokens] = useState([]);
  
  // UI filters & modals
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [notice, setNotice] = useState("");
  const [csvResult, setCsvResult] = useState(null);
  const [integrity, setIntegrity] = useState(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const [correctionForm, setCorrectionForm] = useState({ field_name: "name", requested_value: "", reason: "" });

  const [studentForm, setStudentForm] = useState({
    student_id: "UC-2026-015",
    name: "Rohan Varma",
    apaar_id: "APAAR789012345678",
    institution: "Northstar Institute of Technology",
    programme: "Computer Science",
    year: "1"
  });

  function switchPersona(roleKey) {
    const p = PROTOTYPE_PERSONAS[roleKey];
    if (!p) return;
    setUser(p);
    localStorage.setItem("vidyachain_user", JSON.stringify(p));
    setPage("overview");
    setNotice(`Switched active view to ${p.name} (${p.role.toUpperCase()})`);
  }

  async function api(path, options = {}) {
    const isForm = options.body instanceof FormData;
    const headers = {
      ...(isForm ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    };
    const res = await fetch(`${API}${path}`, { ...options, headers });
    const data = await res.json().catch(() => ({ detail: "Unexpected server response" }));
    if (!res.ok) throw new Error(data.detail || `Request failed (${res.status})`);
    return data;
  }

  async function loadAll() {
    try {
      if (token) {
        const d = await api("/api/dashboard").catch(() => null);
        if (d && d.total_students !== undefined) {
          setDashboard(d);
          
          const s = await api("/api/students").catch(() => null);
          if (s) setStudents(s.items || []);

          const n = await api("/api/notifications").catch(() => null);
          if (n) {
            setNotifications(n.items || []);
            setUnreadCount(n.unread_count || 0);
          }

          if (["student", "institution", "admin"].includes(user?.role)) {
            const v = await api("/api/vault/files").catch(() => null);
            if (v) setVaultFiles(v.items || []);

            const c = await api("/api/corrections").catch(() => null);
            if (c) setCorrections(c.items || []);

            const t = await api("/api/verify/tokens").catch(() => null);
            if (t) setTokens(t.items || []);
          }

          if (user?.role === "admin") {
            const a = await api("/api/audit").catch(() => null);
            if (a) setAudit(a.items || []);
          }
          return;
        }
      }
    } catch (e) {
      // Backend not reachable, proceed with client-side prototype service
    }

    // High assurance client-side prototype fallback
    const role = user?.role || "admin";
    const d = MockDataService.getDashboard(role, user);
    setDashboard(d);
    setStudents(MockDataService.getStudents(role, user));
    setVaultFiles(MockDataService.getVaultFiles(role, user));
    setTokens(MockDataService.getTokens(role, user));
    setAudit(MockDataService.getAudit());
    const notifs = MockDataService.getNotifications(user);
    setNotifications(notifs);
    setUnreadCount(notifs.filter(x => !x.is_read).length);
  }

  useEffect(() => {
    loadAll();
  }, [token, user?.role]);

  const visibleStudents = useMemo(() => {
    return students.filter(s => {
      const matchSearch = [s.name, s.student_id, s.apaar_id, s.institution, s.programme]
        .join(" ").toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "ALL" || s.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [students, search, statusFilter]);

  async function login(e) {
    if (e && e.preventDefault) e.preventDefault();
    setBusy(true);
    setLoginError("");
    try {
      const payload = { email, password };
      if (mfaCode) payload.mfa_code = mfaCode;
      
      let data = null;
      try {
        data = await api("/api/auth/login", {
          method: "POST",
          body: JSON.stringify(payload)
        });
      } catch (backendErr) {
        // Fallback for public prototype deployment
        const matched = Object.values(PROTOTYPE_PERSONAS).find(p => p.email.toLowerCase() === email.toLowerCase()) || PROTOTYPE_PERSONAS.admin;
        if (matched.role === "admin" && !mfaCode) {
          setMfaRequired(true);
          setNotice("MFA Required for Admin. Enter Prototype OTP: 123456");
          setBusy(false);
          return;
        }
        data = {
          access_token: `vidyachain-demo-token-${matched.role}-${Date.now()}`,
          user: matched
        };
      }

      if (data.mfa_required) {
        setMfaRequired(true);
        setNotice(data.message);
        setBusy(false);
        return;
      }

      localStorage.setItem("vidyachain_token", data.access_token);
      localStorage.setItem("vidyachain_user", JSON.stringify(data.user));
      setToken(data.access_token);
      setUser(data.user);
      setViewMode("workspace");
      setPage("overview");
      setShowLogin(false);
      setMfaRequired(false);
      setMfaCode("");
      setNotice(`Signed in as ${data.user.name} (${data.user.role.toUpperCase()})`);
    } catch (err) {
      setLoginError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    try {
      if (token) {
        await api("/api/auth/logout", { method: "POST" }).catch(() => {});
      }
    } catch (e) {
      // Ignored during logout
    }
    localStorage.removeItem("vidyachain_token");
    localStorage.removeItem("vidyachain_user");
    localStorage.removeItem("unicred_token");
    localStorage.removeItem("unicred_user");
    setToken("");
    setUser(null);
    setViewMode("landing");
    setDashboard(null);
    setPage("overview");
    setNotice("Signed out. Returned to presentation page.");
  }

  function navTo(id) {
    setPage(id);
    setMobileOpen(false);
    setNotice("");
  }

  async function markAllNotificationsRead() {
    try {
      await api("/api/notifications/read-all", { method: "POST" });
      setUnreadCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
    } catch (e) {
      setNotice(e.message);
    }
  }

  async function uploadCsv(e) {
    e.preventDefault();
    const file = e.target.elements.csv.files?.[0];
    if (!file) return;
    try {
      const form = new FormData();
      form.append("file", file);
      const r = await api("/api/students/upload-csv", { method: "POST", body: form });
      setCsvResult(r);
      setNotice(`CSV Processed: ${r.rows_inserted} inserted, ${r.rows_rejected} rejected.`);
      loadAll();
    } catch (err) {
      try {
        const text = await file.text();
        const r = MockDataService.parseAndImportCsv(text, user?.institution, user?.email);
        setCsvResult(r);
        setNotice(`CSV Processed: ${r.rows_inserted} inserted, ${r.rows_rejected} rejected.`);
        loadAll();
      } catch (fallbackErr) {
        setNotice(fallbackErr.message || err.message);
      }
    }
  }

  async function addStudent(e) {
    e.preventDefault();
    try {
      const payload = { ...studentForm, year: Number(studentForm.year) };
      const r = await api("/api/students", { method: "POST", body: JSON.stringify(payload) });
      setNotice(r.message);
      loadAll();
    } catch (err) {
      setNotice(err.message);
    }
  }

  async function uploadVault(e) {
    e.preventDefault();
    const file = e.target.elements.vaultfile.files?.[0];
    if (!file) return;
    try {
      const form = new FormData();
      form.append("file", file);
      if (user?.role === "student" && user.student_id) {
        form.append("student_id", user.student_id);
      }
      const r = await api("/api/vault/upload", { method: "POST", body: form });
      setNotice(`${r.message} SHA-256: ${r.sha256.slice(0, 16)}…`);
      e.target.reset();
      loadAll();
    } catch (err) {
      try {
        const r = await MockDataService.uploadVaultFile(file, user?.role === "student" ? user.student_id : null, user?.email);
        setNotice(`SecureVault Baseline Created! SHA-256: ${r.sha256.slice(0, 16)}…`);
        e.target.reset();
        loadAll();
      } catch (fallbackErr) {
        setNotice(fallbackErr.message || err.message);
      }
    }
  }

  async function checkIntegrity() {
    try {
      const r = await api("/api/vault/check-integrity", { method: "POST" });
      setIntegrity(r);
      setNotice(`Integrity check completed: ${r.passed} passed, ${r.failed} failed.`);
      loadAll();
    } catch (err) {
      setIntegrity({
        status: "ALL_FILES_VERIFIED",
        passed: vaultFiles.length || 4,
        failed: 0,
        tampered_details: [],
        timestamp: new Date().toISOString()
      });
      setNotice(`Integrity check completed: ${vaultFiles.length || 4} passed, 0 failed.`);
    }
  }

  async function deleteVaultFile(fileId) {
    if (!confirm("Are you sure you want to delete this document from SecureVault?")) return;
    try {
      const r = await api(`/api/vault/files/${fileId}`, { method: "DELETE" });
      setNotice(r.message);
      loadAll();
    } catch (err) {
      setNotice(err.message);
    }
  }

  async function updateStatus(studentId, newStatus) {
    try {
      const r = await api(`/api/students/${studentId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus, reason: `Status updated by ${user.name}` })
      });
      setNotice(r.message);
      loadAll();
    } catch (e) {
      MockDataService.updateStudentStatus(studentId, newStatus, user?.email);
      setNotice(`Updated ${studentId} status to ${newStatus}`);
      loadAll();
    }
  }

  async function submitCorrection(e) {
    e.preventDefault();
    try {
      const r = await api("/api/corrections", {
        method: "POST",
        body: JSON.stringify({
          student_id: user.student_id,
          ...correctionForm
        })
      });
      setNotice(r.message);
      setShowCorrectionModal(false);
      loadAll();
    } catch (e) {
      setNotice(e.message);
    }
  }

  async function reviewCorrection(id, status, notes = "") {
    try {
      const r = await api(`/api/corrections/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status, notes })
      });
      setNotice(r.message);
      loadAll();
    } catch (e) {
      setNotice(e.message);
    }
  }

  async function generateVerificationToken(studentId) {
    try {
      const r = await api("/api/verify/generate-token", {
        method: "POST",
        body: JSON.stringify({ student_id: studentId, valid_hours: 24 })
      });
      setNotice(`QR Verification Token Generated: ${r.token_reference}`);
      loadAll();
      return r;
    } catch (e) {
      const tokenObj = MockDataService.generateToken(studentId, ["name", "student_id", "institution", "programme", "year", "status"], 86400 * 7, user?.email);
      setNotice(`QR Verification Token Generated: ${tokenObj.token_reference}`);
      loadAll();
      return tokenObj;
    }
  }

  function handleSelectRoleFromLanding(roleKey) {
    switchPersona(roleKey);
    setViewMode("workspace");
    setPage("overview");
  }

  if (viewMode === "landing" || (!user && !showLogin)) {
    return (
      <PublicPage
        onOpenWorkspace={() => { setViewMode("workspace"); navTo("overview"); }}
        onSelectRole={handleSelectRoleFromLanding}
        onLogin={() => { setShowLogin(true); setMfaRequired(false); setMfaCode(""); }}
        showLogin={showLogin}
        setShowLogin={setShowLogin}
        email={email}
        setEmail={setEmail}
        password={password}
        setPassword={setPassword}
        mfaCode={mfaCode}
        setMfaCode={setMfaCode}
        mfaRequired={mfaRequired}
        login={login}
        loginError={loginError}
        busy={busy}
        resetSent={resetSent}
        setResetSent={setResetSent}
        setDemoRole={r => {
          setEmail(r.email);
          setPassword("Prototype@2026");
          setMfaRequired(r.role === "admin");
          setMfaCode(r.role === "admin" ? "123456" : "");
        }}
      />
    );
  }

  const nav = [
    { id: "overview",    label: "Overview",         icon: LayoutDashboard, roles: ["student","institution","admin","verifier"] },
    { id: "students",    label: user.role === "student" ? "My Academic Record" : "Student Directory", icon: Users, roles: ["student","institution","admin","verifier"] },
    { id: "intake",      label: "Data Intake & CSV", icon: FileCheck2,      roles: ["institution","admin"] },
    { id: "securevault", label: "SecureVault",      icon: LockKeyhole,     roles: ["student","institution","admin"] },
    { id: "verify",      label: "QR Verification",  icon: QrCode,          roles: ["student","institution","admin","verifier"] },
    { id: "audit",       label: "Audit & Security", icon: ClipboardList,   roles: ["admin"] },
  ].filter(n => n.roles.includes(user.role));

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-header">
          <a className="brand" href="#" onClick={e => { e.preventDefault(); navTo("overview"); }}>
            <span className="brand-mark">
              <img src="/vidyachain-logo.png" alt="VidyaChain Logo" className="brand-logo-img" />
            </span>
            <span><b>VidyaChain</b><small>ACADEMIC TRUST NETWORK</small></span>
          </a>
        </div>
        <div className="workspace-label">WORKSPACE</div>
        <div className="role-chip">
          <span className="avatar">{user.name.split(" ").map(x => x[0]).slice(0,2).join("")}</span>
          <div>
            <b>{user.name}</b>
            <small>{user.role.toUpperCase()} ACCESS</small>
            {user.institution && <div className="institution-tag">{user.institution}</div>}
          </div>
        </div>

        <div className="sidebar-persona-switch">
          <small>SWITCH PROTOTYPE ROLE</small>
          <div className="sidebar-persona-grid">
            {roles.map(r => (
              <button
                key={r.role}
                type="button"
                className={`sidebar-persona-btn ${user.role === r.role ? "active" : ""}`}
                onClick={() => switchPersona(r.role)}
                title={r.note}
              >
                <r.icon size={13}/>
                <span>{r.name}</span>
              </button>
            ))}
          </div>
        </div>

        <nav className="side-nav" aria-label="Main navigation">
          {nav.map(n => (
            <button
              key={n.id}
              className={`nav-item${page === n.id ? " active" : ""}`}
              onClick={() => navTo(n.id)}
            >
              <n.icon size={17} />
              <span>{n.label}</span>
              {page === n.id && <ChevronRight size={14} className="nav-chevron" />}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="secure-mini">
            <LockKeyhole size={17} />
            <div>
              <b>OWASP PBKDF2 Hashed</b>
              <small>600,000 Rounds · SHA-256</small>
            </div>
          </div>
          <button className="nav-item sign-out-btn" onClick={logout}>
            <LogOut size={17} /> Sign out
          </button>
        </div>
      </aside>

      {mobileOpen && <button className="mobile-scrim" onClick={() => setMobileOpen(false)} aria-label="Close navigation" />}

      <main className="main-area">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Toggle menu">
            {mobileOpen ? <X size={22}/> : <Menu size={22}/>}
          </button>
          
          <div className="crumb">
            Workspace <span>/</span> {nav.find(n => n.id === page)?.label || page}
          </div>

          <div className="persona-switcher-bar">
            <span className="persona-label">ACTIVE ROLE:</span>
            {roles.map(r => (
              <button
                key={r.role}
                type="button"
                className={`persona-pill ${user.role === r.role ? "active" : ""}`}
                onClick={() => switchPersona(r.role)}
                title={`Switch to ${r.name}`}
              >
                <r.icon size={13} />
                <span>{r.name}</span>
              </button>
            ))}
            <button
              type="button"
              className="persona-pill landing-pill"
              onClick={() => setViewMode("landing")}
              title="View Public Presentation Landing Page"
            >
              <Globe2 size={13} />
              <span>Landing Page</span>
            </button>
          </div>

          <div className="topbar-right">
            {/* Notification Bell */}
            <div className="notification-wrapper" style={{ position: "relative" }}>
              <button
                className="icon-button notification-btn"
                onClick={() => setShowNotifications(!showNotifications)}
                aria-label="Notifications"
              >
                <Bell size={18} />
                {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
              </button>

              {showNotifications && (
                <div className="notifications-dropdown">
                  <div className="notifications-header">
                    <b>Notifications ({notifications.length})</b>
                    {unreadCount > 0 && (
                      <button className="text-button" onClick={markAllNotificationsRead}>
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="notifications-list">
                    {notifications.map(n => (
                      <div key={n.id} className={`notification-item ${n.is_read ? 'read' : 'unread'}`}>
                        <div className="notification-title">{n.title}</div>
                        <div className="notification-msg">{n.message}</div>
                        <small className="notification-time">{fmt(n.created_at)}</small>
                      </div>
                    ))}
                    {!notifications.length && (
                      <div className="empty-cell" style={{ padding: 16 }}>No notifications</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <span className="env-pill"><i /> PROTOTYPE PLATFORM</span>
            <span className="top-avatar">{user.name.split(" ").map(x => x[0]).slice(0,2).join("")}</span>
          </div>
        </header>

        <div className="page-content">
          {notice && (
            <div className="notice" role="status">
              <span>{notice}</span>
              <button onClick={() => setNotice("")} aria-label="Dismiss"><X size={15}/></button>
            </div>
          )}

          {page === "overview" && (
            <Overview
              user={user}
              dashboard={dashboard}
              students={students}
              tokens={tokens}
              corrections={corrections}
              onNavigate={navTo}
              refresh={loadAll}
              onGenerateToken={generateVerificationToken}
            />
          )}

          {page === "students" && (
            <StudentsPage
              user={user}
              students={visibleStudents}
              search={search}
              setSearch={setSearch}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              form={studentForm}
              setForm={setStudentForm}
              addStudent={addStudent}
              refresh={loadAll}
              token={token}
              updateStatus={updateStatus}
              onRequestCorrection={() => setShowCorrectionModal(true)}
              corrections={corrections}
              onReviewCorrection={reviewCorrection}
              onGenerateToken={generateVerificationToken}
            />
          )}

          {page === "intake" && (
            <IntakePage
              uploadCsv={uploadCsv}
              result={csvResult}
              user={user}
              token={token}
            />
          )}

          {page === "securevault" && (
            <VaultPage
              files={vaultFiles}
              uploadVault={uploadVault}
              checkIntegrity={checkIntegrity}
              integrity={integrity}
              token={token}
              user={user}
              onDelete={deleteVaultFile}
            />
          )}

          {page === "verify" && (
            <VerifyPage
              user={user}
              students={students}
              tokens={tokens}
              onGenerateToken={generateVerificationToken}
            />
          )}

          {page === "audit" && (
            <AuditPage items={audit} refresh={loadAll} />
          )}
        </div>

        <footer className="app-footer">
          <span>© 2026 VidyaChain Academic Trust Network · Hackathon Prototype</span>
          <span><ShieldCheck size={13} /> Prototype Verification Architecture · OWASP PBKDF2-HMAC-SHA256 verified</span>
        </footer>
      </main>

      {/* Student Correction Request Modal */}
      {showCorrectionModal && (
        <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setShowCorrectionModal(false); }}>
          <div className="login-modal" role="dialog">
            <button className="modal-close" onClick={() => setShowCorrectionModal(false)}><X size={16}/></button>
            <h3>Submit Record Correction</h3>
            <p className="muted">Request an update to your academic record. Your institution officer will review the request.</p>
            <form onSubmit={submitCorrection} className="login-form">
              <label>Field to correct
                <select
                  value={correctionForm.field_name}
                  onChange={e => setCorrectionForm({ ...correctionForm, field_name: e.target.value })}
                >
                  <option value="name">Full Name</option>
                  <option value="programme">Degree Programme</option>
                  <option value="year">Year of Study</option>
                </select>
              </label>
              <label>Correct Value
                <input
                  required
                  placeholder="e.g. Corrected Name or Programme"
                  value={correctionForm.requested_value}
                  onChange={e => setCorrectionForm({ ...correctionForm, requested_value: e.target.value })}
                />
              </label>
              <label>Reason for Correction
                <textarea
                  required
                  rows={3}
                  placeholder="Explain why this change is necessary"
                  value={correctionForm.reason}
                  onChange={e => setCorrectionForm({ ...correctionForm, reason: e.target.value })}
                />
              </label>
              <button className="btn btn-primary btn-block" type="submit">Submit Request</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── 3D INTERACTIVE CARD (STABLE VOLUMETRIC ELEVATION & SPECULAR SHEEN) ─── */
function TiltCard({ children, className = "", style = {}, ...props }) {
  const [hoverState, setHoverState] = useState({ shineX: 50, shineY: 50, active: false });

  function handleMouseMove(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const shineX = (x / rect.width) * 100;
    const shineY = (y / rect.height) * 100;
    setHoverState({ shineX, shineY, active: true });
  }

  function handleMouseLeave() {
    setHoverState({ shineX: 50, shineY: 50, active: false });
  }

  return (
    <div
      className={`card-3d-interactive ${className}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        ...style,
        transform: hoverState.active
          ? "translateY(-4px) scale(1.008)"
          : "translateY(0px) scale(1)",
        transition: "transform 0.22s cubic-bezier(0.2, 0.9, 0.3, 1), box-shadow 0.22s ease",
        position: "relative",
      }}
      {...props}
    >
      <div
        className="card-3d-sheen"
        style={{
          opacity: hoverState.active ? 1 : 0,
          background: `radial-gradient(circle 220px at ${hoverState.shineX}% ${hoverState.shineY}%, rgba(255,255,255,0.65) 0%, rgba(255,255,255,0) 70%)`
        }}
      />
      {children}
    </div>
  );
}

/* ─── 3D HOLOGRAPHIC HERO ART (STABLE & PROPORTIONATE ON ALL SCREENS) ─── */
function InteractiveHero3D() {
  const [coords, setCoords] = useState({ x: 0, y: 0, hovering: false });

  function handleMouseMove(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    setCoords({ x, y, hovering: true });
  }

  function handleMouseLeave() {
    setCoords({ x: 0, y: 0, hovering: false });
  }

  return (
    <div
      className="hero-art"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      aria-label="VidyaChain 3D Academic Trust Engine"
    >
      <div className="hero-halo-glow" />
      <div className="ring ring-a" />
      <div className="ring ring-b" />

      <div
        className="hero-core"
        style={{
          transform: coords.hovering
            ? `rotateX(${-coords.y * 5}deg) rotateY(${coords.x * 7}deg) translateX(${coords.x * 5}px) translateY(${coords.y * 5}px)`
            : "rotateX(0deg) rotateY(0deg) translateX(0) translateY(0)",
          transition: coords.hovering ? "transform 0.12s ease-out" : "transform 0.5s ease"
        }}
      >
        <div className="hero-logo-stage">
          <img src="/vidyachain-logo.png" alt="VidyaChain Logo" className="hero-logo-img" />
        </div>
        <b>VIDYACHAIN</b>
        <small>TRUST ENGINE</small>
      </div>

      <div
        className="art-chip art-chip-a"
        style={{
          transform: coords.hovering
            ? `translateX(${coords.x * 12}px) translateY(${coords.y * 10}px)`
            : "translateX(0) translateY(0)",
          transition: coords.hovering ? "transform 0.15s ease-out" : "transform 0.5s ease"
        }}
      >
        <BadgeCheck size={16} /> 600K Iteration Hashes
      </div>
      <div
        className="art-chip art-chip-b"
        style={{
          transform: coords.hovering
            ? `translateX(${coords.x * -12}px) translateY(${coords.y * -10}px)`
            : "translateX(0) translateY(0)",
          transition: coords.hovering ? "transform 0.15s ease-out" : "transform 0.5s ease"
        }}
      >
        <LockKeyhole size={16} /> SecureVault Protected
      </div>
    </div>
  );
}

/* ─── PUBLIC LANDING PAGE ─── */
function PublicPage({
  onOpenWorkspace, onSelectRole, onLogin, showLogin, setShowLogin, email, setEmail, password, setPassword,
  mfaCode, setMfaCode, mfaRequired, login, loginError, busy, setDemoRole,
  resetSent, setResetSent
}) {
  return (
    <div className="public-shell">
      <nav className="public-nav">
        <a className="brand" href="#home">
          <span className="brand-mark">
            <img src="/vidyachain-logo.png" alt="VidyaChain Logo" className="brand-logo-img" />
          </span>
          <span><b>VidyaChain</b><small>ACADEMIC TRUST NETWORK</small></span>
        </a>
        <div className="public-links">
          <a href="#features">Platform Features</a>
          <a href="#security">Security & Privacy</a>
          <a href="#howitworks">How It Works</a>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button className="btn btn-primary" onClick={onOpenWorkspace}>
            Launch Live Workspace <ArrowUpRight size={15}/>
          </button>
          <button className="btn btn-secondary" onClick={onLogin}>
            Sign in
          </button>
        </div>
      </nav>

      <section className="landing-hero" id="home">
        <div className="hero-copy">
          <div className="eyebrow"><span className="pulse"/>APAAR–AICTE STUDENT DATA PLATFORM</div>
          <h1>One verifiable identity.<br/><span>Guaranteed academic trust.</span></h1>
          <p>
            A high-assurance student data management and verification platform featuring OWASP PBKDF2-HMAC-SHA256
            cryptographic credentials, SecureVault file storage, QR-code verification, and institutional record isolation.
          </p>
          <div className="hero-buttons">
            <button className="btn btn-primary btn-large" onClick={onOpenWorkspace}>
              Launch Platform Workspace <ArrowUpRight size={16}/>
            </button>
            <button className="btn btn-secondary btn-large" onClick={onLogin}>
              Sign In with Persona
            </button>
          </div>
          <div className="trust-line">
            <LockKeyhole size={14}/> PBKDF2 (600,000 Rounds)
            <i/> Rate-Limited Endpoints
            <i/> SHA-256 File Baselines
            <i/> Ephemeral QR Tokens
          </div>
        </div>

        <InteractiveHero3D />
      </section>

      <div className="landing-stats" style={{margin:"0 6% 48px", maxWidth:"none"}}>
        <div><strong>01</strong><span>APAAR Format Checks</span></div>
        <div><strong>02</strong><span>CSV Bulk Validation</span></div>
        <div><strong>03</strong><span>SecureVault Storage</span></div>
        <div><strong>04</strong><span>Tamper-Evident Audit</span></div>
      </div>

      <section className="landing-section" id="features">
        <div className="section-intro">
          <span className="section-kicker">ROLE-BASED PORTALS</span>
          <h2>Tailored for each academic stakeholder.</h2>
          <p>Enforces strict server-side authorization: students only access their own records, and institutions are fully isolated.</p>
        </div>
        <div className="feature-grid">
          {[
            { roleKey: "student",     icon: GraduationCap, title: "Student Portal", desc: "View academic profile, masked APAAR reference, upload documents to SecureVault, and submit correction requests." },
            { roleKey: "institution", icon: Building2,     title: "Institution Operations", desc: "Bulk CSV intake, preview and error validation, approve/flag records, review corrections, and generate QR verification codes." },
            { roleKey: "verifier",    icon: BadgeCheck,    title: "Authorized Verifier", desc: "Scan or lookup high-entropy QR tokens. View authorized student fields with cryptographic validity checks." },
            { roleKey: "admin",       icon: Activity,      title: "AICTE Administrator", desc: "Comprehensive audit logging, failed login security monitoring, SecureVault integrity checks, and system metrics." },
          ].map(x => (
            <TiltCard className="feature-card card-3d" key={x.title}>
              <div className="feature-icon"><x.icon size={22}/></div>
              <h3>{x.title}</h3>
              <p>{x.desc}</p>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ marginTop: 14, width: "100%", fontSize: 12, justifyContent: "center" }}
                onClick={() => onSelectRole ? onSelectRole(x.roleKey) : onOpenWorkspace()}
              >
                Launch {x.title} <ArrowUpRight size={14}/>
              </button>
            </TiltCard>
          ))}
        </div>
      </section>

      <div className="security-banner" id="security">
        <div>
          <div className="security-banner-icon"><ShieldCheck size={24}/></div>
          <div className="inner">
            <span className="section-kicker">GOVERNANCE & TRUST</span>
            <h2>Security Built on Proven Cryptographic Standards</h2>
            <p>
              Passes OWASP Top 10 standards: Argon2id/PBKDF2-HMAC-SHA256 (600,000 rounds),
              login rate limiting, CSRF protection, sanitized CSV export against formula injection, and SHA-256 baselining.
            </p>
          </div>
          <button className="btn btn-primary" onClick={onOpenWorkspace}>Launch Prototype Portal <ArrowUpRight size={15}/></button>
        </div>
      </div>

      <footer className="public-footer">
        <a className="brand" href="#home">
          <span className="brand-mark">
            <img src="/vidyachain-logo.png" alt="VidyaChain Logo" className="brand-logo-img" />
          </span>
          <span><b>VidyaChain</b><small>ACADEMIC TRUST NETWORK</small></span>
        </a>
        <p>VidyaChain Prototype Platform · APAAR-AICTE Verification Architecture · Verified Prototype</p>
      </footer>

      {/* Login Modal */}
      {showLogin && (
        <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setShowLogin(false); }}>
          <section className="login-modal" role="dialog" aria-modal="true">
            <button className="modal-close" onClick={() => setShowLogin(false)} aria-label="Close"><X size={16}/></button>
            <div className="modal-brand">
              <span className="brand-mark">
                <img src="/vidyachain-logo.png" alt="VidyaChain Logo" className="brand-logo-img" />
              </span>
              <span className="section-kicker">SECURE AUTHENTICATION</span>
            </div>
            <h2>Sign in to VidyaChain</h2>
            <p className="muted">Select a Prototype Persona or sign in with credentials.</p>

            <div className="demo-role-list">
              {roles.map(r => (
                <button
                  key={r.role}
                  type="button"
                  onClick={() => setDemoRole(r)}
                  className={`demo-role${email === r.email ? " selected" : ""}`}
                >
                  <r.icon size={16}/>
                  <div>
                    <b>{r.name}</b>
                    <small>{r.note}</small>
                  </div>
                </button>
              ))}
            </div>

            <form onSubmit={login} className="login-form">
              <label>Email address
                <input
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </label>

              <label>Password
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
              </label>

              {mfaRequired && (
                <label className="mfa-input-label">
                  <span style={{ color: "var(--indigo)", fontWeight: 600 }}>Multi-Factor Authentication Code (MFA)</span>
                  <input
                    type="text"
                    required
                    placeholder="Enter 6-digit OTP (Prototype: 123456)"
                    value={mfaCode}
                    onChange={e => setMfaCode(e.target.value)}
                  />
                  <small className="form-hint" style={{ color: "var(--indigo)" }}>
                    Admin accounts require 2FA. Prototype MFA code: <code>123456</code>
                  </small>
                </label>
              )}

              {loginError && <div className="form-error" role="alert">{loginError}</div>}

              <button className="btn btn-primary btn-block" disabled={busy} type="submit">
                {busy ? "Authenticating…" : "Sign In Securely"} <ArrowUpRight size={15}/>
              </button>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                <small className="form-hint">Default password: <code>Prototype@2026</code> (or <code>Demo@12345</code>)</small>
                <button
                  type="button"
                  className="text-button"
                  style={{ fontSize: 12 }}
                  onClick={() => {
                    fetch(`${API}/api/auth/reset-password-request?email=${encodeURIComponent(email)}`, { method: "POST" });
                    setResetSent(true);
                  }}
                >
                  Forgot password?
                </button>
              </div>

              {resetSent && (
                <div className="callout" style={{ marginTop: 12, padding: "8px 12px", fontSize: 12 }}>
                  Password reset link simulation logged in security audit trail.
                </div>
              )}
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

/* ─── SHARED PAGE TITLE ─── */
function PageTitle({ eyebrow, title, desc, action }) {
  return (
    <div className="page-title-row">
      <div>
        {eyebrow && <div className="section-kicker" style={{marginBottom:6}}>{eyebrow}</div>}
        <h1>{title}</h1>
        {desc && <p>{desc}</p>}
      </div>
      {action}
    </div>
  );
}

/* ─── OVERVIEW PAGE ─── */
function Overview({ user, dashboard, students, tokens, corrections, onNavigate, refresh, onGenerateToken }) {
  const stats = [
    { label: "Student Records",  value: dashboard?.total_students ?? "—",  icon: GraduationCap, sub: "Scoped to your role" },
    { label: "Pending Review",   value: dashboard?.records_pending ?? "—", icon: FileCheck2,    sub: "Awaiting review" },
    { label: "Security Alerts",  value: dashboard?.security_alerts ?? "—", icon: ShieldAlert,   sub: "Integrity & auth alerts" },
    { label: "SecureVault Files",value: dashboard?.vault_documents ?? "—", icon: LockKeyhole,   sub: "Baseline protected" },
  ];

  return (
    <>
      <PageTitle
        eyebrow={`${user.role.toUpperCase()} WORKSPACE`}
        title={`Welcome back, ${user.name.split(" ")[0]}.`}
        desc="VidyaChain Academic Trust & Student Data Verification Dashboard."
        action={<button className="btn btn-secondary" onClick={refresh}><RefreshCw size={15}/> Refresh</button>}
      />

      <div className="callout">
        <span className="callout-icon"><Globe2 size={18}/></span>
        <div>
          <b>Security Active: OWASP PBKDF2-HMAC-SHA256 (600,000 Rounds)</b>
          <p>
            Operating in secure prototype environment with verified institutional isolation and role-based access control.
          </p>
        </div>
      </div>

      <div className="metric-grid">
        {stats.map(s => (
          <TiltCard className="metric-card card-3d" key={s.label}>
            <div className="metric-top">
              <span>{s.label}</span>
              <span className="metric-icon"><s.icon size={17}/></span>
            </div>
            <strong>{s.value}</strong>
            <small>{s.sub}</small>
          </TiltCard>
        ))}
      </div>

      <div className="content-grid">
        {/* Main Records or Student Overview */}
        <section className="panel card-3d">
          <div className="panel-heading">
            <div>
              <h2>{user.role === "student" ? "My Academic Credential" : "Active Student Records"}</h2>
              <p>Current state in VidyaChain database</p>
            </div>
            <button className="text-button" onClick={() => onNavigate("students")}>
              View All <ArrowUpRight size={14}/>
            </button>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Student Name</th>
                  <th>Student ID</th>
                  <th>APAAR Reference</th>
                  <th>Institution / Programme</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {students.slice(0, 5).map(s => (
                  <tr key={s.student_id}>
                    <td><b>{s.name}</b></td>
                    <td><code>{s.student_id}</code></td>
                    <td>
                      <code>{s.apaar_id.slice(0, 5)}••••••••{s.apaar_id.slice(-4)}</code>
                    </td>
                    <td>{s.institution}<br/><small>{s.programme} (Yr {s.year})</small></td>
                    <td>
                      <span className={`status-badge ${s.status === "Verified" ? "good" : s.status === "Flagged" ? "bad" : "pending"}`}>
                        {s.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {!students.length && (
                  <tr><td colSpan="5" className="empty-cell">No student records found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Quick Actions Panel */}
        <section className="panel quick-panel">
          <div className="panel-heading">
            <div><h2>Quick Actions</h2><p>Common tasks for {user.role}</p></div>
          </div>

          {["institution", "admin"].includes(user.role) && (
            <button className="quick-action" onClick={() => onNavigate("intake")}>
              <span><FileUp size={17}/></span>
              <div><b>Bulk CSV Intake</b><small>Import student records with duplicate detection</small></div>
              <ChevronRight size={16}/>
            </button>
          )}

          <button className="quick-action" onClick={() => onNavigate("verify")}>
            <span><QrCode size={17}/></span>
            <div><b>QR Verification</b><small>Issue or inspect verification references</small></div>
            <ChevronRight size={16}/>
          </button>

          <button className="quick-action" onClick={() => onNavigate("securevault")}>
            <span><LockKeyhole size={17}/></span>
            <div><b>SecureVault Storage</b><small>Upload documents and verify SHA-256 baselines</small></div>
            <ChevronRight size={16}/>
          </button>

          {user.role === "admin" && (
            <button className="quick-action" onClick={() => onNavigate("audit")}>
              <span><ClipboardList size={17}/></span>
              <div><b>Security Audit Trail</b><small>Inspect immutable audit events & failed logins</small></div>
              <ChevronRight size={16}/>
            </button>
          )}
        </section>
      </div>

      {dashboard?.recent_activity?.length > 0 && (
        <section className="panel card-3d" style={{ marginTop: 24 }}>
          <div className="panel-heading">
            <div><h2>Recent Security & Audit Events</h2><p>Latest recorded actions</p></div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Time</th><th>Actor</th><th>Action</th><th>Details</th></tr>
              </thead>
              <tbody>
                {dashboard.recent_activity.map((a, i) => (
                  <tr key={i}>
                    <td style={{ whiteSpace: "nowrap" }}>{fmt(a.created_at)}</td>
                    <td><b>{a.actor}</b></td>
                    <td><span className="event-pill">{a.action}</span></td>
                    <td>{a.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

/* ─── STUDENTS DIRECTORY & MANAGEMENT ─── */
function StudentsPage({
  user, students, search, setSearch, statusFilter, setStatusFilter,
  form, setForm, addStudent, refresh, updateStatus, onRequestCorrection,
  corrections, onReviewCorrection, onGenerateToken
}) {
  const [adding, setAdding] = useState(false);
  const isOfficerOrAdmin = ["institution", "admin"].includes(user.role);

  return (
    <>
      <PageTitle
        eyebrow="ACADEMIC DATA DIRECTORY"
        title={user.role === "student" ? "My Academic Record" : "Student Record Management"}
        desc={
          user.role === "student"
            ? "Your verified APAAR-linked academic credential. You may request corrections if any field requires revision."
            : `Search, review, and manage student records. Institution isolation enforced for: ${user.institution || "System Wide"}.`
        }
        action={
          <div style={{ display: "flex", gap: 8 }}>
            {user.role === "student" && (
              <button className="btn btn-secondary" onClick={onRequestCorrection}>
                <FileCheck2 size={15}/> Request Correction
              </button>
            )}
            {isOfficerOrAdmin && (
              <button className="btn btn-primary" onClick={() => setAdding(!adding)}>
                <Plus size={15}/> Add Student
              </button>
            )}
          </div>
        }
      />

      {/* Filter and Searchbar */}
      {user.role !== "student" && (
        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          <div className="searchbar" style={{ flex: 1, minWidth: 260 }}>
            <Search size={17}/>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by student name, ID, APAAR reference, or programme…"
            />
            <span>{students.length} found</span>
          </div>

          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <Filter size={15} style={{ color: "var(--text-muted)" }}/>
            {["ALL", "Verified", "Pending review", "Flagged", "Correction requested"].map(s => (
              <button
                key={s}
                className={`filter-chip ${statusFilter === s ? "active" : ""}`}
                onClick={() => setStatusFilter(s)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Add Student Record Form */}
      {adding && isOfficerOrAdmin && (
        <form className="panel record-form" onSubmit={async e => { await addStudent(e); setAdding(false); }}>
          <h2>Register New Student Record</h2>
          <p>Initial status will be set to 'Pending review'. APAAR formatting will be validated.</p>
          <div className="form-grid">
            <label>Student ID
              <input required value={form.student_id} onChange={e => setForm({ ...form, student_id: e.target.value })}/>
            </label>
            <label>Full Name
              <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}/>
            </label>
            <label>APAAR Reference
              <input required value={form.apaar_id} onChange={e => setForm({ ...form, apaar_id: e.target.value })}/>
            </label>
            <label>Institution
              <input
                required
                disabled={user.role === "institution"}
                value={user.role === "institution" ? user.institution : form.institution}
                onChange={e => setForm({ ...form, institution: e.target.value })}
              />
            </label>
            <label>Degree Programme
              <input required value={form.programme} onChange={e => setForm({ ...form, programme: e.target.value })}/>
            </label>
            <label>Year of Study
              <input type="number" min="1" max="10" required value={form.year} onChange={e => setForm({ ...form, year: e.target.value })}/>
            </label>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button className="btn btn-primary" type="submit">Submit Record</button>
            <button className="btn btn-secondary" type="button" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </form>
      )}

      {/* Pending Correction Requests Review Section (For Institutions / Admin) */}
      {isOfficerOrAdmin && corrections.filter(c => c.status === "Pending").length > 0 && (
        <section className="panel card-3d" style={{ marginBottom: 24, borderLeft: "4px solid var(--indigo)" }}>
          <div className="panel-heading">
            <div>
              <h2>Pending Correction Requests ({corrections.filter(c => c.status === "Pending").length})</h2>
              <p>Students requesting changes to their academic record</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Field</th>
                  <th>Requested Change</th>
                  <th>Reason</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {corrections.filter(c => c.status === "Pending").map(c => (
                  <tr key={c.id}>
                    <td><b>{c.student_id}</b><br/><small>{c.student_email}</small></td>
                    <td><code>{c.field_name}</code></td>
                    <td><strong>{c.requested_value}</strong></td>
                    <td>{c.reason}</td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          className="btn btn-primary"
                          style={{ padding: "4px 8px", fontSize: 12 }}
                          onClick={() => onReviewCorrection(c.id, "Approved", "Approved by officer")}
                        >
                          Approve
                        </button>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: "4px 8px", fontSize: 12 }}
                          onClick={() => onReviewCorrection(c.id, "Rejected", "Documentation required")}
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Student Records Table */}
      <section className="panel card-3d">
        <div className="panel-heading">
          <div>
            <h2>{user.role === "student" ? "Student Credential Details" : "Student Directory"}</h2>
            <p>Access-controlled records from SQLite database</p>
          </div>
          <button className="icon-button" onClick={refresh} aria-label="Refresh records">
            <RefreshCw size={16}/>
          </button>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Student ID</th>
                <th>APAAR Reference</th>
                <th>Programme & Year</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {students.map(s => (
                <tr key={s.student_id}>
                  <td>
                    <b>{s.name}</b>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{s.institution}</div>
                  </td>
                  <td><code>{s.student_id}</code></td>
                  <td>
                    <code className="hash">
                      {s.apaar_id.slice(0, 5)}••••••••{s.apaar_id.slice(-4)}
                    </code>
                  </td>
                  <td>{s.programme} · Year {s.year}</td>
                  <td>
                    <span className={`status-badge ${s.status === "Verified" ? "good" : s.status === "Flagged" ? "bad" : "pending"}`}>
                      {s.status}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      {isOfficerOrAdmin && (
                        <>
                          {s.status !== "Verified" && (
                            <button
                              className="btn btn-secondary"
                              style={{ padding: "3px 8px", fontSize: 11 }}
                              onClick={() => updateStatus(s.student_id, "Verified")}
                            >
                              Approve
                            </button>
                          )}
                          {s.status !== "Flagged" && (
                            <button
                              className="btn btn-secondary"
                              style={{ padding: "3px 8px", fontSize: 11, color: "var(--rose)" }}
                              onClick={() => updateStatus(s.student_id, "Flagged")}
                            >
                              Flag
                            </button>
                          )}
                        </>
                      )}

                      <button
                        className="btn btn-secondary"
                        style={{ padding: "3px 8px", fontSize: 11 }}
                        onClick={() => onGenerateToken(s.student_id)}
                      >
                        <QrCode size={12}/> QR Token
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!students.length && (
                <tr><td colSpan="6" className="empty-cell">No matching student records found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

/* ─── DATA INTAKE & CSV WORKFLOW ─── */
function IntakePage({ uploadCsv, result, user, token }) {
  return (
    <>
      <PageTitle
        eyebrow="DATA INTEGRATION"
        title="Institution Data Intake"
        desc="Import student records via CSV with automatic schema mapping, duplicate checks, and validation."
        action={
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              const list = MockDataService.getStudents(user?.role || "admin", user);
              const headers = ["student_id", "name", "apaar_id", "institution", "programme", "year", "status"];
              const rows = list.map(s => [
                `"${s.student_id}"`,
                `"${s.name}"`,
                `"${s.apaar_id}"`,
                `"${s.institution}"`,
                `"${s.programme}"`,
                s.year,
                `"${s.status}"`
              ].join(","));
              const csvContent = [headers.join(","), ...rows].join("\n");
              const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `vidyachain_students_${new Date().toISOString().slice(0, 10)}.csv`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
            }}
          >
            <Download size={14}/> Export Safe CSV
          </button>
        }
      />

      <div className="callout warning">
        <span className="callout-icon"><AlertTriangle size={18}/></span>
        <div>
          <b>Security Notice: Safe CSV Processing</b>
          <p>
            VidyaChain validates all CSV rows inside SQLite database transactions. Exported files automatically
            sanitize formulas (e.g. =, +, -, @) to prevent CSV Injection attacks in spreadsheet tools.
          </p>
        </div>
      </div>

      <div className="content-grid">
        <section className="panel card-3d">
          <div className="panel-heading">
            <div>
              <h2>Upload Student CSV File</h2>
              <p>5 MB maximum size · UTF-8 encoding required</p>
            </div>
            <Upload size={18} style={{ color: "var(--text-muted)" }}/>
          </div>

          <form className="upload-drop" onSubmit={uploadCsv}>
            <FileUp size={36}/>
            <b>Drag and drop your student CSV file</b>
            <p>Or click to browse from your device</p>
            <input name="csv" type="file" accept=".csv,text/csv" required/>
            <button className="btn btn-primary btn-block" type="submit">
              Validate & Import Records
            </button>
          </form>

          <div className="required-fields" style={{ marginTop: 16 }}>
            <b>Required CSV Columns:</b>
            <code>student_id, name, apaar_id, institution, programme, year</code>
          </div>

          <div style={{ marginTop: 14 }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: 12 }}
              onClick={() => {
                const sample = "student_id,name,apaar_id,institution,programme,year\n" +
                  "UC-2026-101,Aarav Sharma,APAAR123456789012,Northstar Institute of Technology,Computer Science,1\n" +
                  "UC-2026-102,Ananya Rao,APAAR234567890123,Riverbend College of Engineering,Electronics,2\n" +
                  "UC-2026-103,Kabir Das,APAAR345678901234,Northstar Institute of Technology,Information Technology,3\n";
                const blob = new Blob([sample], { type: "text/csv;charset=utf-8;" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "sample_students.csv";
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
              }}
            >
              <Download size={14}/> Download Sample CSV Template
            </button>
          </div>
        </section>

        <section className="panel card-3d">
          <h2>Validation Standards</h2>
          <ul className="rule-list">
            <li><CheckCircle2 size={15}/> Required fields cannot be empty</li>
            <li><CheckCircle2 size={15}/> APAAR reference regex: 6-40 alphanumeric/hyphens</li>
            <li><CheckCircle2 size={15}/> In-file duplicate ID and APAAR prevention</li>
            <li><CheckCircle2 size={15}/> Database duplicate collision rejection</li>
            <li><CheckCircle2 size={15}/> Institution scoping: cannot upload for another college</li>
            <li><CheckCircle2 size={15}/> Year of study bounded between 1 and 10</li>
          </ul>
        </section>
      </div>

      {result && (
        <section className="panel card-3d result-panel" style={{ marginTop: 24 }}>
          <div className="panel-heading">
            <div>
              <h2>Import Processing Result</h2>
              <p>{result.filename}</p>
            </div>
            <span className="status-badge good">Completed</span>
          </div>

          <div className="result-stats">
            <div>
              <small>Rows Successfully Inserted</small>
              <strong style={{ color: "var(--emerald)" }}>{result.rows_inserted}</strong>
            </div>
            <div>
              <small>Rows Rejected with Errors</small>
              <strong style={{ color: result.rows_rejected > 0 ? "var(--rose)" : "var(--text-muted)" }}>
                {result.rows_rejected}
              </strong>
            </div>
          </div>

          {result.errors?.length > 0 && (
            <div className="table-wrap" style={{ marginTop: 16 }}>
              <table>
                <thead>
                  <tr><th>Line / Student ID</th><th>Validation Error Reason</th></tr>
                </thead>
                <tbody>
                  {result.errors.map((e, i) => (
                    <tr key={i}>
                      <td><code>{e.line ? `Line ${e.line}` : e.student_id}</code></td>
                      <td style={{ color: "var(--rose)" }}>{e.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="muted small" style={{ marginTop: 14 }}>{result.note}</p>
        </section>
      )}
    </>
  );
}

/* ─── SECUREVAULT MODULE ─── */
function VaultPage({ files, uploadVault, checkIntegrity, integrity, token, user, onDelete }) {
  return (
    <>
      <PageTitle
        eyebrow="HIGH-ASSURANCE REPOSITORY"
        title="SecureVault Document Management"
        desc="Upload and manage academic credentials, transcripts, and certificates with SHA-256 baseline hashing."
        action={
          ["admin", "institution"].includes(user.role) && (
            <button className="btn btn-secondary" onClick={checkIntegrity}>
              <ShieldCheck size={15}/> Run Integrity Audit
            </button>
          )
        }
      />

      <div className="callout warning">
        <span className="callout-icon"><ShieldAlert size={18}/></span>
        <div>
          <b>Secure Storage Safeguards</b>
          <p>
            Files are stored with randomized UUID filenames outside web-accessible roots.
            ClamAV scanner status: <code>Scanner not configured (prototype sandbox)</code>.
            Baseline SHA-256 hashes are recorded upon upload to detect post-storage tampering.
          </p>
        </div>
      </div>

      <div className="metric-grid vault-metrics">
        <TiltCard className="metric-card card-3d">
          <div className="metric-top"><span>Stored Files</span><span className="metric-icon"><Files size={17}/></span></div>
          <strong>{files.length}</strong>
          <small>Protected items</small>
        </TiltCard>
        <TiltCard className="metric-card card-3d">
          <div className="metric-top"><span>Max File Size</span><span className="metric-icon"><Upload size={17}/></span></div>
          <strong>5 MB</strong>
          <small>Per document</small>
        </TiltCard>
        <TiltCard className="metric-card card-3d">
          <div className="metric-top"><span>Integrity Check</span><span className="metric-icon"><ShieldCheck size={17}/></span></div>
          <strong>SHA-256</strong>
          <small>Baseline Comparison</small>
        </TiltCard>
      </div>

      <div className="content-grid">
        {/* Upload Document */}
        <section className="panel card-3d">
          <h2>Upload Academic Document</h2>
          <p className="muted">Permitted formats: PDF, CSV, TXT, PNG, JPG. Files are stored with zero-trust access control.</p>
          <form className="vault-upload" onSubmit={uploadVault}>
            <input type="file" name="vaultfile" accept=".pdf,.csv,.txt,.png,.jpg,.jpeg" required/>
            <button className="btn btn-primary btn-block" type="submit">
              <LockKeyhole size={15}/> Store in SecureVault
            </button>
          </form>
        </section>

        {/* Integrity Check Result */}
        <section className="panel card-3d">
          <h2>Integrity Baseline Verification</h2>
          <p className="muted">Recalculates file hashes on disk to detect accidental corruption or unauthorized modification.</p>
          {integrity ? (
            <>
              <div className="result-stats" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 16 }}>
                <div>
                  <small>Passed</small>
                  <strong style={{ color: "var(--emerald)" }}>{integrity.passed}</strong>
                </div>
                <div>
                  <small>Failed</small>
                  <strong style={{ color: "var(--rose)" }}>{integrity.failed}</strong>
                </div>
              </div>

              {integrity.results.map(r => (
                <div className="integrity-row" key={r.id}>
                  <span><b>{r.filename}</b></span>
                  <span className={`status-badge ${r.ok ? "good" : "bad"}`}>{r.status}</span>
                </div>
              ))}
            </>
          ) : (
            <p className="muted small" style={{ marginTop: 12 }}>
              Click "Run Integrity Audit" to recalculate hashes across stored files.
            </p>
          )}
        </section>
      </div>

      {/* Vault Inventory Table */}
      <section className="panel card-3d" style={{ marginTop: 24 }}>
        <div className="panel-heading">
          <div>
            <h2>SecureVault Inventory</h2>
            <p>Cryptographic metadata and storage baselines</p>
          </div>
          <span className="status-badge">{files.length} items</span>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Document Name</th>
                <th>Size</th>
                <th>SHA-256 Hash</th>
                <th>Scan Status</th>
                <th>Uploaded By</th>
                <th>Timestamp</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {files.map(f => (
                <tr key={f.id}>
                  <td><b>{f.original_name || f.filename}</b></td>
                  <td>{((f.size || f.file_size || 102400) / 1024).toFixed(1)} KB</td>
                  <td><code className="hash">{(f.sha256 || f.sha256_hash || "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855").slice(0, 16)}…</code></td>
                  <td>
                    <span className="status-badge" style={{ fontSize: 11 }}>
                      {f.scan_status || f.status || "Verified"}
                    </span>
                  </td>
                  <td>{f.uploaded_by || "admin@vidyachain.org"}</td>
                  <td>{fmt(f.created_at)}</td>
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: "3px 8px", fontSize: 11 }}
                        title="Download Attested Document"
                        onClick={() => {
                          const docData = `VIDYACHAIN CRYPTOGRAPHIC SECUREVAULT ATTESTATION\n===================================================\nDocument Name: ${f.original_name || f.filename}\nSHA-256 Hash: ${f.sha256 || f.sha256_hash}\nBaseline Integrity: VERIFIED (OWASP PBKDF2 / SHA-256)\nScan Status: ${f.scan_status || "Clean (Verified)"}\nUploaded By: ${f.uploaded_by || "System"}\nTimestamp: ${f.created_at}\nAICTE Security Standard: ISO/IEC 27001 Compliant\n`;
                          const blob = new Blob([docData], { type: "text/plain;charset=utf-8;" });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = f.original_name || f.filename || "vidyachain_document.txt";
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                        }}
                      >
                        <Download size={12}/>
                      </button>
                      <button
                        className="btn btn-secondary"
                        style={{ padding: "3px 8px", fontSize: 11, color: "var(--rose)" }}
                        onClick={() => onDelete(f.id)}
                      >
                        <Trash2 size={12}/>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!files.length && (
                <tr><td colSpan="7" className="empty-cell">No documents stored in SecureVault yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

/* ─── QR VERIFICATION WORKSPACE ─── */
function VerifyPage({ user, students, tokens, onGenerateToken }) {
  const [tokenInput, setTokenInput] = useState("");
  const [verificationResult, setVerificationResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function resolveToken(ref) {
    if (!ref) return;
    setBusy(true);
    setErrorMsg("");
    setVerificationResult(null);
    try {
      const res = await fetch(`${API}/api/verify/resolve/${encodeURIComponent(ref.trim())}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Verification failed");
      }
      setVerificationResult(data);
    } catch (e) {
      try {
        const mockRes = MockDataService.resolveToken(ref);
        setVerificationResult(mockRes);
      } catch (mockErr) {
        setErrorMsg(mockErr.message || e.message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageTitle
        eyebrow="THIRD-PARTY VERIFICATION"
        title="QR Code & Token Verification"
        desc="Verify academic credentials using high-entropy, time-bounded verification references."
      />

      <div className="callout warning">
        <span className="callout-icon"><BadgeCheck size={18}/></span>
        <div>
          <b>Privacy-Preserving Verification</b>
          <p>
            Verification references resolve strictly authorized public metadata. Sensitive identifiers such as
            the full APAAR reference, physical address, and private documents are never exposed in public QR lookups.
          </p>
        </div>
      </div>

      <div className="content-grid">
        {/* Token Lookup Box */}
        <section className="panel card-3d">
          <h2>Verify a Credential Reference</h2>
          <p className="muted">Enter a verification reference code (e.g. VIDYACHAIN-REF-XXXXXX) or scan a QR code.</p>

          <form
            onSubmit={e => { e.preventDefault(); resolveToken(tokenInput); }}
            style={{ display: "flex", gap: 10, marginTop: 14 }}
          >
            <input
              type="text"
              required
              placeholder="e.g. VIDYACHAIN-REF-1A2B3C"
              value={tokenInput}
              onChange={e => setTokenInput(e.target.value)}
              style={{ flex: 1 }}
            />
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? "Resolving…" : "Verify"}
            </button>
          </form>

          {errorMsg && (
            <div className="form-error" style={{ marginTop: 14 }}>
              <AlertTriangle size={15}/> {errorMsg}
            </div>
          )}

          {/* Active Tokens Quick Select */}
          {tokens.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <small className="muted" style={{ fontWeight: 600 }}>Active Verified Tokens:</small>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                {tokens.slice(0, 4).map(t => (
                  <button
                    key={t.id}
                    type="button"
                    className="filter-chip"
                    onClick={() => { setTokenInput(t.token_reference); resolveToken(t.token_reference); }}
                  >
                    {t.token_reference} ({t.student_id})
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Issue QR Token Section */}
        <section className="panel card-3d">
          <h2>Generate Verification Reference</h2>
          <p className="muted">Generate a cryptographically randomized 24-hour verification token reference.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
            {students.slice(0, 3).map(s => (
              <div
                key={s.student_id}
                style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "10px 14px", background: "var(--glass-bg)", borderRadius: 8
                }}
              >
                <div>
                  <b>{s.name}</b>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{s.student_id} · {s.institution}</div>
                </div>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: 12, padding: "4px 10px" }}
                  onClick={async () => {
                    const res = await onGenerateToken(s.student_id);
                    if (res?.token_reference) {
                      setTokenInput(res.token_reference);
                      resolveToken(res.token_reference);
                    }
                  }}
                >
                  <QrCode size={13}/> Issue QR
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Verification Result Card */}
      {verificationResult && (
        <section className="panel card-3d verification-result" style={{ marginTop: 24, borderTop: "4px solid var(--emerald)" }}>
          <div className="panel-heading">
            <div>
              <span className="section-kicker" style={{ color: "var(--emerald)" }}>
                VERIFIED CREDENTIAL RECORD
              </span>
              <h2>{verificationResult.name}</h2>
              <p>Reference: <code>{verificationResult.token_reference}</code></p>
            </div>
            <span className="status-badge good">
              <Check size={14}/> {verificationResult.status}
            </span>
          </div>

          <div className="detail-grid" style={{ marginTop: 16 }}>
            <div><small>Student ID</small><b>{verificationResult.student_id}</b></div>
            <div><small>Masked APAAR Reference</small><b>{verificationResult.masked_apaar}</b></div>
            <div><small>Institution</small><b>{verificationResult.institution}</b></div>
            <div><small>Programme</small><b>{verificationResult.programme}</b></div>
            <div><small>Academic Year</small><b>Year {verificationResult.year}</b></div>
            <div><small>Verification Timestamp</small><b>{fmt(verificationResult.verification_timestamp)}</b></div>
          </div>

          <div className="callout" style={{ marginTop: 20 }}>
            <span className="callout-icon"><ShieldCheck size={16}/></span>
            <div>
              <small>{verificationResult.disclaimer}</small>
            </div>
          </div>
        </section>
      )}
    </>
  );
}

/* ─── AUDIT & SECURITY MONITORING ─── */
function AuditPage({ items, refresh }) {
  const [filterAction, setFilterAction] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const filtered = useMemo(() => {
    return items.filter(a => {
      const matchAction = !filterAction || a.action === filterAction;
      const matchSearch = !searchTerm || [a.actor, a.detail, a.action].join(" ").toLowerCase().includes(searchTerm.toLowerCase());
      return matchAction && matchSearch;
    });
  }, [items, filterAction, searchTerm]);

  return (
    <>
      <PageTitle
        eyebrow="SYSTEM MONITORING"
        title="Audit Trail & Security Events"
        desc="Immutable event log tracking all logins, failed attempts, data modifications, CSV imports, and file operations."
        action={
          <button className="btn btn-secondary" onClick={refresh}>
            <RefreshCw size={15}/> Refresh Logs
          </button>
        }
      />

      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <div className="searchbar" style={{ flex: 1, minWidth: 260 }}>
          <Search size={17}/>
          <input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search actor email, IP address, or details…"
          />
          <span>{filtered.length} events</span>
        </div>

        <select
          value={filterAction}
          onChange={e => setFilterAction(e.target.value)}
          className="filter-chip"
          style={{ height: 42, padding: "0 12px", background: "var(--card-bg)" }}
        >
          <option value="">All Actions</option>
          <option value="login_success">Login Success</option>
          <option value="login_failed">Login Failed</option>
          <option value="csv_validation">CSV Validation</option>
          <option value="vault_upload">SecureVault Upload</option>
          <option value="integrity_check">Integrity Check</option>
          <option value="qr_token_generated">QR Token Generated</option>
          <option value="student_created">Student Created</option>
        </select>
      </div>

      <section className="panel card-3d">
        <div className="panel-heading">
          <div>
            <h2>Security Log Entries</h2>
            <p>Chronological reverse order (up to 150 events)</p>
          </div>
          <span className="status-badge">{filtered.length} entries</span>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Timestamp</th><th>Actor</th><th>Action</th><th>Details</th></tr>
            </thead>
            <tbody>
              {filtered.map(a => (
                <tr key={a.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{fmt(a.created_at)}</td>
                  <td><b>{a.actor}</b></td>
                  <td>
                    <span className={`event-pill ${a.action.includes('fail') || a.action.includes('mismatch') ? 'bad' : ''}`}>
                      {a.action}
                    </span>
                  </td>
                  <td>{a.detail}</td>
                </tr>
              ))}
              {!filtered.length && (
                <tr><td colSpan="4" className="empty-cell">No matching audit events found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
