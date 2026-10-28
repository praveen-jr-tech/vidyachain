import unittest
import urllib.request
import urllib.parse
import json
import time

BASE_URL = "http://127.0.0.1:8000"

def request_json(path, method="GET", data=None, headers=None):
    url = f"{BASE_URL}{path}"
    req_headers = {"Content-Type": "application/json"}
    if headers:
        req_headers.update(headers)
    encoded_data = json.dumps(data).encode("utf-8") if data is not None else None
    req = urllib.request.Request(url, data=encoded_data, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(req) as response:
            body = response.read().decode("utf-8")
            return response.status, json.loads(body) if body else {}
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        try:
            parsed = json.loads(body)
        except Exception:
            parsed = {"detail": body}
        return e.code, parsed

def login_as(email="student@vidyachain.org", password="Prototype@2026", mfa_code=None):
    payload = {"email": email, "password": password}
    if mfa_code:
        payload["mfa_code"] = mfa_code
    status, res = request_json("/api/auth/login", method="POST", data=payload)
    if status == 200 and "access_token" in res:
        return res["access_token"]
    if res.get("mfa_required"):
        # Retry with prototype MFA code
        payload["mfa_code"] = "123456"
        status, res = request_json("/api/auth/login", method="POST", data=payload)
        return res.get("access_token")
    return None

class TestVidyaChainBackend(unittest.TestCase):

    def test_01_health_and_meta(self):
        status, res = request_json("/api/health")
        self.assertEqual(status, 200)
        self.assertEqual(res.get("status"), "healthy")

        status, res = request_json("/api/meta")
        self.assertEqual(status, 200)
        self.assertTrue(res.get("prototype"))

    def test_02_auth_login_and_mfa(self):
        # 1. Invalid password
        status, res = request_json("/api/auth/login", method="POST", data={"email": "student@vidyachain.org", "password": "WrongPassword"})
        self.assertEqual(status, 401)

        # 2. Student login (no MFA needed)
        status, res = request_json("/api/auth/login", method="POST", data={"email": "student@vidyachain.org", "password": "Prototype@2026"})
        self.assertEqual(status, 200)
        self.assertIn("access_token", res)
        self.assertEqual(res["user"]["role"], "student")

        # 3. Admin login requires MFA code
        status, res = request_json("/api/auth/login", method="POST", data={"email": "admin@vidyachain.org", "password": "Prototype@2026"})
        self.assertEqual(status, 200)
        self.assertTrue(res.get("mfa_required"))

        # Admin login with valid MFA code
        status, res = request_json("/api/auth/login", method="POST", data={"email": "admin@vidyachain.org", "password": "Prototype@2026", "mfa_code": "123456"})
        self.assertEqual(status, 200)
        self.assertIn("access_token", res)

    def test_03_student_isolation(self):
        token = login_as("student@vidyachain.org")
        self.assertIsNotNone(token)
        headers = {"Authorization": f"Bearer {token}"}

        # Student should only see their own record
        status, res = request_json("/api/students", headers=headers)
        self.assertEqual(status, 200)
        items = res.get("items", [])
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["student_id"], "UC-2026-001")

        # Student cannot access another student's record by ID
        status, res = request_json("/api/students/UC-2026-003", headers=headers)
        self.assertEqual(status, 403)

    def test_04_institution_isolation(self):
        token = login_as("institution@vidyachain.org")
        self.assertIsNotNone(token)
        headers = {"Authorization": f"Bearer {token}"}

        # Institution officer belongs to "Northstar Institute of Technology"
        status, res = request_json("/api/students", headers=headers)
        self.assertEqual(status, 200)
        for item in res.get("items", []):
            self.assertEqual(item["institution"], "Northstar Institute of Technology")

        # Cannot update status of student from another institution (UC-2026-003 is Riverbend)
        status, res = request_json("/api/students/UC-2026-003/status", method="PATCH",
                                   data={"status": "Verified"}, headers=headers)
        self.assertEqual(status, 403)

    def test_05_qr_verification_token_flow(self):
        inst_token = login_as("institution@vidyachain.org")
        headers = {"Authorization": f"Bearer {inst_token}"}

        # Generate verification token for UC-2026-001
        status, res = request_json("/api/verify/generate-token", method="POST",
                                   data={"student_id": "UC-2026-001", "valid_hours": 24}, headers=headers)
        self.assertEqual(status, 200)
        token_ref = res.get("token_reference")
        self.assertTrue(token_ref.startswith("VIDYACHAIN-REF-") or token_ref.startswith("UNICRED-REF-"))

        # Public resolution without auth
        status, resolved = request_json(f"/api/verify/resolve/{token_ref}")
        self.assertEqual(status, 200)
        self.assertTrue(resolved.get("valid"))
        self.assertEqual(resolved.get("student_id"), "UC-2026-001")
        self.assertTrue("masked_apaar" in resolved)
        self.assertIn("••••", resolved["masked_apaar"])

    def test_06_notifications_and_audit(self):
        admin_token = login_as("admin@vidyachain.org")
        headers = {"Authorization": f"Bearer {admin_token}"}

        # Fetch notifications
        status, res = request_json("/api/notifications", headers=headers)
        self.assertEqual(status, 200)
        self.assertIn("items", res)

        # Mark all read
        status, res = request_json("/api/notifications/read-all", method="POST", headers=headers)
        self.assertEqual(status, 200)

        # Audit logs (Admin only)
        status, res = request_json("/api/audit", headers=headers)
        self.assertEqual(status, 200)
        self.assertGreater(len(res.get("items", [])), 0)

    def test_07_logout_revocation(self):
        token = login_as("student@vidyachain.org")
        headers = {"Authorization": f"Bearer {token}"}

        # Successful auth check
        status, res = request_json("/api/auth/me", headers=headers)
        self.assertEqual(status, 200)

        # Revoke session via logout
        status, res = request_json("/api/auth/logout", method="POST", headers=headers)
        self.assertEqual(status, 200)

        # Further calls with revoked token should fail with 401
        status, res = request_json("/api/auth/me", headers=headers)
        self.assertEqual(status, 401)

if __name__ == "__main__":
    unittest.main()
