"""Unit tests for the lead-arrival notification helpers.

Ports of the corresponding frontend unit tests for `lead-notification.ts`
(shouldNotifyForInquiry, buildLeadNotificationEmail) — pure logic, no DB.
"""
from __future__ import annotations

from app.services.email import build_lead_notification_email, should_notify_for_inquiry


class TestShouldNotifyForInquiry:
    def test_latest_inquiry_before_request_start_is_replay(self):
        assert should_notify_for_inquiry("2026-09-07T10:00:00+00:00", "2026-09-07T09:59:00+00:00") is False

    def test_latest_inquiry_after_request_start_is_new(self):
        assert should_notify_for_inquiry("2026-09-07T10:00:00+00:00", "2026-09-07T10:00:05+00:00") is True

    def test_latest_inquiry_at_request_start_is_new(self):
        assert should_notify_for_inquiry("2026-09-07T10:00:00+00:00", "2026-09-07T10:00:00+00:00") is True

    def test_missing_inquiry_is_no_notify(self):
        assert should_notify_for_inquiry("2026-09-07T10:00:00+00:00", None) is False


class TestBuildLeadNotificationEmail:
    def test_uses_enquiry_wording_not_booking(self):
        email = build_lead_notification_email({"name": "Priya"}, "Dharti")
        assert "enquiry" in email["text"].lower()
        assert "not a confirmed booking" in email["text"].lower()

    def test_subject_and_professional_name(self):
        email = build_lead_notification_email({"name": "Priya"}, "Dharti")
        assert email["subject"] == "New BeautyFolio enquiry"
        assert "Hi Dharti," in email["text"]

    def test_skips_empty_fields(self):
        email = build_lead_notification_email(
            {"name": "Priya", "phone": "", "location": None, "message": "  "}, "Dharti"
        )
        assert "Phone:" not in email["text"]
        assert "Location:" not in email["text"]

    def test_includes_provided_fields(self):
        email = build_lead_notification_email(
            {"name": "Priya", "phone": "9876543210", "service_requested": "Bridal Makeup"}, "Dharti"
        )
        assert "Phone: 9876543210" in email["text"]
        assert "Requested service: Bridal Makeup" in email["text"]

    def test_links_to_dashboard(self):
        email = build_lead_notification_email({"name": "Priya"}, "Dharti")
        assert "/dashboard/leads" in email["text"]