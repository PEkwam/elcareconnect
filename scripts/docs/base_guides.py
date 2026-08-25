#!/usr/bin/env python3
"""Regenerates the Care Connect base PDFs.

Outputs:
  docs-src/CareConnect_Developer_Guide_base.pdf  (merged with living sections by build-docs.mjs)
  public/docs/CareConnect_User_Guide.pdf

Run: python3 scripts/docs/base_guides.py
"""
import os
import subprocess
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, ListFlowable, ListItem,
)

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
BRAND = "Care Connect"
VERSION = "Version 3.0 - August 2026"
APP_URL = "https://elcareconnect.lovable.app"

def font(spec, name):
    path = subprocess.check_output(["fc-match", "-f", "%{file}", spec], text=True).strip()
    pdfmetrics.registerFont(TTFont(name, path))
    return name

BODY_F = font("DejaVu Sans", "DejaVuSans")
BOLD_F = font("DejaVu Sans:bold", "DejaVuSans-Bold")
MONO_F = font("DejaVu Sans Mono", "DejaVuMono")

ACCENT = colors.HexColor("#0F766E")
MUTED = colors.HexColor("#4B5563")
LINE = colors.HexColor("#D1D5DB")

ss = getSampleStyleSheet()
S = {
    "title": ParagraphStyle("t", parent=ss["Title"], fontName=BOLD_F, fontSize=26, textColor=ACCENT, spaceAfter=6),
    "subtitle": ParagraphStyle("st", parent=ss["Normal"], fontName=BODY_F, fontSize=12, textColor=MUTED, alignment=1, spaceAfter=2),
    "meta": ParagraphStyle("m", parent=ss["Normal"], fontName=BODY_F, fontSize=9, textColor=MUTED, alignment=1, spaceAfter=18),
    "h1": ParagraphStyle("h1", parent=ss["Heading1"], fontName=BOLD_F, fontSize=15, textColor=ACCENT, spaceBefore=16, spaceAfter=6),
    "h2": ParagraphStyle("h2", parent=ss["Heading2"], fontName=BOLD_F, fontSize=11.5, textColor=colors.HexColor("#111827"), spaceBefore=10, spaceAfter=4),
    "p": ParagraphStyle("p", parent=ss["Normal"], fontName=BODY_F, fontSize=9.5, leading=14, textColor=colors.HexColor("#1F2937"), alignment=TA_LEFT, spaceAfter=5),
    "li": ParagraphStyle("li", parent=ss["Normal"], fontName=BODY_F, fontSize=9.5, leading=13.5, textColor=colors.HexColor("#1F2937")),
    "code": ParagraphStyle("c", parent=ss["Normal"], fontName=MONO_F, fontSize=8, leading=11.5, textColor=colors.HexColor("#111827"),
                           backColor=colors.HexColor("#F3F4F6"), borderPadding=6, spaceBefore=4, spaceAfter=8),
    "th": ParagraphStyle("th", parent=ss["Normal"], fontName=BOLD_F, fontSize=8.5, leading=11.5, textColor=colors.white),
    "td": ParagraphStyle("td", parent=ss["Normal"], fontName=BODY_F, fontSize=8.5, leading=11.5, textColor=colors.HexColor("#1F2937")),
}


def p(text):
    return Paragraph(text, S["p"])


def bullets(items):
    return ListFlowable(
        [ListItem(Paragraph(i, S["li"]), leftIndent=14, value="bulletchar") for i in items],
        bulletType="bullet", bulletFontName=BODY_F, bulletFontSize=7, start="•",
        leftIndent=12, spaceAfter=6,
    )


def steps(items):
    return ListFlowable(
        [ListItem(Paragraph(i, S["li"]), leftIndent=16) for i in items],
        bulletType="1", bulletFontName=BODY_F, bulletFontSize=9, leftIndent=14, spaceAfter=6,
    )


def code(text):
    return Paragraph(text.replace("\n", "<br/>").replace(" ", "&nbsp;"), S["code"])


def table(head, rows, widths):
    data = [[Paragraph(h, S["th"]) for h in head]]
    data += [[Paragraph(c, S["td"]) for c in r] for r in rows]
    t = Table(data, colWidths=[w * inch for w in widths], repeatRows=1, hAlign="LEFT")
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), ACCENT),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.4, LINE),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F9FAFB")]),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return t


def cover(subtitle):
    return [
        Spacer(1, 8),
        Paragraph(BRAND, S["title"]),
        Paragraph(subtitle, S["subtitle"]),
        Paragraph(f"{VERSION}  •  {APP_URL}", S["meta"]),
    ]


def build(path, subtitle, story):
    os.makedirs(os.path.dirname(path), exist_ok=True)

    def decorate(canvas, doc):
        canvas.saveState()
        canvas.setFont(BODY_F, 8)
        canvas.setFillColor(MUTED)
        canvas.drawString(0.75 * inch, 0.55 * inch, f"{BRAND} Platform")
        canvas.drawRightString(LETTER[0] - 0.75 * inch, 0.55 * inch, f"Page {doc.page}")
        canvas.setStrokeColor(LINE)
        canvas.line(0.75 * inch, 0.72 * inch, LETTER[0] - 0.75 * inch, 0.72 * inch)
        canvas.restoreState()

    SimpleDocTemplate(
        path, pagesize=LETTER, topMargin=0.7 * inch, bottomMargin=0.85 * inch,
        leftMargin=0.75 * inch, rightMargin=0.75 * inch, title=f"{BRAND} — {subtitle}",
        author=f"{BRAND} Platform", subject=subtitle,
    ).build(cover(subtitle) + story, onFirstPage=decorate, onLaterPages=decorate)
    print("wrote", os.path.relpath(path, ROOT))


# ----------------------------------------------------------------------------- user guide
def user_story():
    s = []
    s += [Paragraph("1. Introduction", S["h1"]),
          p(f"{BRAND} is an AI-assisted customer engagement platform for insurance and care teams. It combines "
            "automated voice campaigns, live agent calling in the browser, real-time supervision, multilingual IVR, "
            "appointment booking and analytics in a single workspace."),
          p("This manual covers everything a non-technical user needs: signing in, navigating the workspace, running "
            "campaigns, managing clients and agents, handling live calls, scheduling appointments, reviewing analytics "
            "and handling privacy requests.")]

    s += [Paragraph("2. Getting started", S["h1"]),
          Paragraph("2.1 Accessing the platform", S["h2"]),
          p(f"Open {APP_URL} in Chrome, Edge or Safari. The app is responsive and also works on tablets. Microphone "
            "permission is required for browser calling and voice-to-text."),
          Paragraph("2.2 Signing in", S["h2"]),
          p("Enter the email and password from your invitation email, or use your organisation's single sign-on if "
            "Active Directory has been connected. New agents receive a one-time link that opens a password-setup "
            "screen; the same screen is used for password resets. If you see \"Invalid login credentials\", check the "
            "email address first, then ask an administrator to re-issue the invitation."),
          Paragraph("2.3 First-run checklist for administrators", S["h2"]),
          bullets([
              "Setup → Telephony: set the default caller ID, bridge phone and carrier credentials, then run Verify.",
              "Setup → People: invite your supervisors and agents, and assign roles.",
              "Setup → Catalog: create the Product Types and Campaign Types your team sells.",
              "Setup → Voice &amp; Languages: upload recordings and build the IVR menu.",
              "Dashboard → Clients: import your client list and tag it.",
              "Dashboard → Campaigns: create your first campaign and enqueue a small test run.",
              "Publish the app for production use.",
          ])]

    s += [Paragraph("3. Workspace tour", S["h1"]),
          p("A collapsible left sidebar handles navigation; the top header holds the search palette, theme toggle and "
            "your status widget. Items you do not have access to are hidden."),
          table(["Section", "Audience", "Purpose"], [
              ["Dashboard", "All signed-in users", "Analytics, Campaigns, Calls, Appointments and Clients tabs."],
              ["Supervisor", "Supervisors and admins", "Live queue, agent states, escalations."],
              ["Campaign Analytics", "Admins", "Per-campaign results with client drill-down."],
              ["Setup", "Admins", "People, voice, telephony, catalogue and secrets."],
              ["Miscellaneous", "Admins", "Notes, transcripts, transfers, callbacks, leaderboard, knowledge base."],
              ["Profile", "All", "Display name, avatar, password and privacy requests."],
              ["Documentation", "All", "This guide, in-app and searchable."],
          ], [1.5, 1.6, 3.9])]

    s += [Paragraph("4. Roles and permissions", S["h1"]),
          p("Roles are enforced by the database, not by the menus. Hiding a menu never grants or removes access."),
          table(["Role", "Can do"], [
              ["user", "Dashboard, call tools, profile and documentation."],
              ["agent", "As user, plus presence, skills and routed call handling."],
              ["supervisor", "Adds the supervisor console for live floor monitoring."],
              ["admin", "Adds Setup, admin tools in Miscellaneous, and Campaign Analytics."],
              ["super_admin", "Adds Active Directory SSO, SIP trunks and app secrets."],
          ], [1.4, 5.6])]

    s += [Paragraph("5. Clients", S["h1"]),
          p("Dashboard → Clients holds the client master list. Add records individually, or use Import CSV for bulk "
            "loads and map the columns before saving."),
          bullets([
              "Phone numbers are normalised to international E.164 format automatically, so a local number such as "
              "0246052499 is stored as +233246052499.",
              "Numbers that cannot be normalised are rejected with a clear message rather than a database error.",
              "Tag clients so campaigns can target a segment instead of a hand-picked list.",
          ])]

    s += [Paragraph("6. Campaigns", S["h1"]),
          Paragraph("6.1 Campaign types", S["h2"]),
          p("Setup → Catalog → Campaign Types defines the reusable templates (for example Premium Reminder or "
            "Payment Follow-up), including the prompt, default IVR menu, retry policy and language defaults."),
          Paragraph("6.2 Creating a campaign", S["h2"]),
          steps([
              "Dashboard → Campaigns → New campaign; choose a campaign type, name and tags.",
              "Clients tab: use Add one for a single contact, or attach a tagged segment. Product Type is a dropdown "
              "fed by Setup → Catalog → Product Types, and the due date uses a date picker so every record is stored "
              "in the same format.",
              "Recordings tab: pick the intro recording and any language-specific audio.",
              "Translations tab: supply localised prompt text per supported language.",
              "Set the dialing window, maximum concurrent calls and retry attempts, then enqueue.",
          ]),
          Paragraph("6.3 Monitoring a run", S["h2"]),
          p("The progress panel shows dialed, connected, answered, voicemail, failed and pending counts in real time. "
            "Administrators can pause, resume, cancel or retry failed calls, and every control action is written to the "
            "audit log. Calls that stall are reconciled automatically against the telephony provider."),
          Paragraph("6.4 Recordings and transcripts", S["h2"]),
          p("Recordings appear within seconds of call completion. Transcripts are generated automatically and are "
            "searchable; a sentiment score is attached to each conversation.")]

    s += [Paragraph("7. Live call handling", S["h1"]),
          Paragraph("7.1 Your status", S["h2"]),
          table(["Status", "Meaning"], [
              ["Available", "Ready for routed calls; the session timer runs."],
              ["On call", "Currently handling a conversation."],
              ["On break", "Temporarily unavailable; excluded from routing."],
              ["Away", "Signed in but not at the desk."],
              ["Offline", "Not working. Timers stop and reset."],
          ], [1.4, 5.6]),
          p("Signing out or closing the browser moves you to Offline automatically and clears the timer; signing back "
            "in starts a fresh session. Time in state is visible to supervisors."),
          Paragraph("7.2 Receiving a routed call", S["h2"]),
          p("Smart routing scores agents on skills, language proficiency and recent performance. When you are chosen, "
            "the call panel opens with caller details, client history, suggested tags and one-click transfer."),
          Paragraph("7.3 Transfers and callbacks", S["h2"]),
          p("Transfer lists only Available colleagues and attaches a handover summary generated from the live "
            "transcript. If the customer asks to be called back, use the Callback Scheduler; past dates roll forward "
            "to the next working day.")]

    s += [Paragraph("8. Appointments", S["h1"]),
          p("Appointments booked by an agent or captured by the IVR keypad flow appear in Dashboard → Appointments. "
            "Confirmation emails are sent when the booking is saved, in the language the caller selected.")]

    s += [Paragraph("9. IVR and multilingual audio", S["h1"]),
          bullets([
              "Setup → Voice &amp; Languages → IVR Menu binds each keypad digit to an action: play a prompt, gather "
              "input, transfer to an agent, book an appointment or escalate.",
              "Languages defines what callers can be served in; Audio holds the per-language recordings.",
              "System Recordings holds shared prompts such as intros and closings.",
          ])]

    s += [Paragraph("10. Supervision and analytics", S["h1"]),
          bullets([
              "Supervisor console: live agent states, queue depth, transfers and escalation alerts.",
              "Dashboard → Analytics: live volumes, outcomes and sentiment trends for the current day.",
              "Campaign Analytics: results by time range with drill-down to the clients contacted.",
              "Leaderboard: agent ranking by handled volume and outcomes.",
              "Knowledge base and AI policy notes: the approved answers agents should use on calls.",
          ])]

    s += [Paragraph("11. Administration", S["h1"]),
          bullets([
              "People: invite agents, assign roles, and maintain skills used by routing.",
              "Telephony: caller ID and bridge settings live in Call Settings; carrier credentials live in SIP Trunks. "
              "Both must be correct before outbound campaigns will connect. Use Verify to test.",
              "Catalog: Product Types and Campaign Types. Deactivate retired entries instead of deleting them so "
              "history stays readable.",
              "Secrets: API keys are stored server-side and are never exposed to the browser.",
              "Active Directory: connect Entra ID, AD FS, Okta, OneLogin, Google Workspace or generic SAML 2.0 with a "
              "guided, self-verifying checklist.",
          ])]

    s += [Paragraph("12. Privacy and data protection", S["h1"]),
          bullets([
              "Profile → Privacy exports every record tied to an account.",
              "Deletion requests anonymise personal identifiers while preserving aggregate call statistics.",
              "Recordings and transcripts are restricted to staff roles, enforced in the database.",
          ])]

    s += [Paragraph("13. Troubleshooting", S["h1"]),
          table(["Symptom", "Likely cause", "Fix"], [
              ["Browser call will not connect", "Microphone blocked", "Re-allow microphone in browser settings."],
              ["No calls routed to you", "You are not Available", "Set your status to Available in the header."],
              ["Invalid login credentials", "Wrong email or password", "Retry carefully, then reset the password."],
              ["Client will not save", "Phone number cannot be normalised", "Enter a valid local or +country number."],
              ["Product Type missing", "Not in the catalogue", "Add it in Setup → Catalog → Product Types."],
              ["Campaign not dialing", "Outside the dialing window", "Check campaign hours and timezone."],
              ["Timer keeps running", "Status left on Available", "Set Offline; closing the browser also clears it."],
          ], [1.9, 1.9, 3.2])]

    s += [Paragraph("14. Glossary", S["h1"]),
          table(["Term", "Meaning"], [
              ["ACW", "After-call work: wrap-up time once a call ends."],
              ["DTMF", "Touch-tone keypad input."],
              ["E.164", "International phone format, e.g. +233246052499."],
              ["IVR", "Interactive voice response menu."],
              ["RLS", "Row-level security: per-row database access rules."],
              ["SSO", "Single sign-on via your corporate directory."],
          ], [1.4, 5.6])]

    s += [Paragraph("15. Support", S["h1"]),
          p(f"Use Officer Chat inside the app for day-to-day questions, and contact your administrator for account or "
            f"escalation issues. Production URL: {APP_URL}.")]
    return s


# ----------------------------------------------------------------------------- developer guide
def dev_story():
    s = []
    s += [Paragraph("1. Stack overview", S["h1"]),
          p("Frontend: React 18, Vite 5, TypeScript 5, Tailwind v3, shadcn/ui, TanStack Query, React Router v6. "
            "Backend: Lovable Cloud (managed Postgres with RLS, Deno edge functions, Realtime broadcast, Storage). "
            "Voice: Twilio Programmable Voice plus browser WebRTC. AI: Lovable AI Gateway."),
          Paragraph("1.1 Repository layout", S["h2"]),
          code("src/\n  components/          shadcn UI and feature panels (dashboard/)\n"
               "  data/documentation.ts in-app documentation content\n"
               "  hooks/               useAuth, useUserRole, useWebRTCCall, useAgentPresence\n"
               "  integrations/supabase generated client + types (DO NOT EDIT)\n"
               "  pages/               route components\n"
               "  lib/                 phone, normalisers, utilities\n"
               "supabase/\n  functions/           Deno edge functions (one folder = one function)\n"
               "  migrations/          timestamped SQL\n"
               "scripts/docs/          PDF generators for this guide\n"
               "public/docs/           generated User and Developer PDFs")]

    s += [Paragraph("2. Routing and navigation", S["h1"]),
          p("React Router v6 with ScrollToTop remounting on pathname change. ProtectedRoute requires a session; "
            "AdminRoute additionally requires admin or super_admin via useUserRole, which reads user_roles. Sidebar "
            "filtering is cosmetic — the database is the source of truth."),
          table(["Route", "Guard", "Purpose"], [
              ["/", "public", "Sign in."],
              ["/landing", "public", "Marketing splash."],
              ["/dashboard", "auth", "Analytics, Campaigns, Calls, Appointments, Clients."],
              ["/supervisor", "auth", "Live supervision console."],
              ["/setup", "admin", "People, voice, telephony, catalogue, secrets."],
              ["/miscellaneous", "admin", "Notes, transcripts, transfers, leaderboard, shifts."],
              ["/campaign-analytics", "admin", "Campaign reporting."],
              ["/call, /voice", "auth", "WebRTC panel and AI voice interface."],
              ["/profile", "auth", "Profile, password, privacy."],
              ["/documentation", "auth", "In-app docs, role-filtered chapters."],
          ], [1.7, 1.0, 4.3])]

    s += [Paragraph("3. Data model", S["h1"]),
          Paragraph("3.1 Core tables", S["h2"]),
          table(["Table", "Purpose"], [
              ["profiles", "Public user info linked to the auth user."],
              ["user_roles", "Role assignment; separate table to prevent privilege escalation."],
              ["clients", "Customer master records with tags and E.164 phone constraint."],
              ["call_campaigns / campaign_types", "Campaign definitions and templates."],
              ["campaign_runs / campaign_jobs", "Per-execution and per-target rows."],
              ["outbound_calls", "One row per dialed call; six composite indexes."],
              ["outbound_call_events (+ monthly partitions)", "Append-only Twilio status callback log."],
              ["call_queue / call_transfers", "Live routing primitives."],
              ["agent_status / agent_skills / agent_shifts", "Presence, capabilities and rota, keyed by user_id."],
              ["product_types / knowledge_base", "Catalogue and agent answers."],
              ["escalation_settings / emergency_alerts", "Escalation rules and raised alerts."],
              ["call_transcriptions / campaign_recordings", "ASR output and recording metadata."],
              ["ivr_menu_options / supported_languages", "IVR configuration and localisation."],
              ["audit_log / error_events / system_health_metrics", "Observability."],
          ], [2.6, 4.4]),
          Paragraph("3.2 Row level security", S["h2"]),
          p("Every public table is RLS-enabled. The pattern is: create the table, GRANT to the roles the policies "
            "allow, enable RLS, then create policies that delegate to security-definer helpers. Agent presence, "
            "skills and shifts are scoped by user_id rather than by email match."),
          code("create or replace function public.has_role(_uid uuid, _role app_role)\n"
               "returns boolean language sql stable security definer\n"
               "set search_path = public as $$\n"
               "  select exists(select 1 from public.user_roles where user_id=_uid and role=_role)\n$$;\n\n"
               "create policy \"Admins manage all\" on public.call_campaigns\n"
               "for all to authenticated using (public.has_role(auth.uid(),'admin'));"),
          p("Partitions (outbound_call_events_YYYY_MM) are RLS-enabled on creation and carry explicit select policies "
            "for supervisors and admins. Security-definer routines are not executable by anon, and only role-check "
            "helpers remain executable by authenticated; reporting routines are service-role only. Materialised views "
            "are not exposed through the API and are read via gated RPCs.")]

    s += [Paragraph("4. Edge functions", S["h1"]),
          p("Functions live under supabase/functions/<name> with index.ts as the entrypoint. Shared helpers in "
            "_shared/ cover Twilio signature validation, idempotency, rate limiting, audit logging, phone parsing and "
            "monitoring."),
          table(["Function", "Auth", "Purpose"], [
              ["ai-voice-call", "Twilio signature", "Initial TwiML for the outbound dialer."],
              ["ai-voice-call-status", "Twilio signature", "Appends every status into outbound_call_events."],
              ["ai-voice-call-dtmf*", "Twilio signature", "Keypad flows including language and appointments."],
              ["ai-voice-call-bridge-ivr", "Twilio signature", "Connects callers to the configured IVR menu."],
              ["process-call-events", "CRON_SECRET", "Drains the event log into outbound_calls in batches."],
              ["campaign-scheduler", "Staff JWT", "Plans campaign runs inside dialing windows."],
              ["campaign-enqueue", "Staff JWT", "Normalises phones and enqueues campaign jobs."],
              ["campaign-worker", "CRON_SECRET", "Claims jobs and triggers dials."],
              ["campaign-control", "Staff JWT", "Pause, resume, cancel, retry; audited."],
              ["retry-campaign-calls", "CRON_SECRET or staff", "Re-attempts failed jobs per retry policy."],
              ["reconcile-call-status", "CRON_SECRET", "Reconciles stuck calls against the carrier."],
              ["smart-call-routing", "Staff JWT", "Scores agents by skills, proficiency and performance."],
              ["analyze-call-sentiment", "Internal", "Sentiment per transcript turn."],
              ["transcribe-call / voice-to-text", "Staff JWT", "Chunked transcription with a payload cap."],
              ["officer-chat / ai-policy-notes", "Authenticated", "Assistants grounded in the knowledge base."],
              ["send-agent-invitation", "Staff JWT", "Server forces invitedBy = caller identity."],
              ["send-escalation-notification", "Staff JWT", "Recipients read from escalation_settings only."],
              ["send-appointment-email / send-payment-email", "Internal", "Transactional email."],
              ["manage-agents / manage-app-secrets", "Admin JWT", "Administrative CRUD."],
              ["twilio-recent-calls / twilio-verify", "Staff JWT", "Telephony diagnostics."],
              ["suggest-tag", "Staff JWT", "Heuristic plus AI tag suggestions."],
              ["sample-data", "Staff JWT", "Seeds demo data."],
              ["gdpr-export / gdpr-delete", "Admin JWT", "Privacy operations."],
              ["realtime-chat", "Authenticated", "Relay for the live chat panel."],
          ], [2.3, 1.5, 3.2]),
          Paragraph("4.1 Error handling contract", S["h2"]),
          p("Functions log the full error server-side and return a safe message to the client."),
          code("try { /* work */ }\ncatch (e) {\n  console.error('fn-name failed', e);\n"
               "  return new Response(JSON.stringify({ error: 'An unexpected error occurred' }),\n"
               "    { status: 500, headers: corsJson });\n}"),
          Paragraph("4.2 Webhook security", S["h2"]),
          p("Inbound carrier callbacks validate the X-Twilio-Signature header using the auth token secret, with replay "
            "protection keyed on CallSid plus CallStatus.")]

    s += [Paragraph("5. Performance architecture", S["h1"]),
          Paragraph("5.1 Index strategy", S["h2"]),
          bullets([
              "twilio_call_sid — webhook lookups.",
              "campaign_id + created_at desc — campaign dashboards.",
              "call_status + created_at desc — live queues.",
              "agent_email + created_at desc — agent performance.",
              "phone_number — fallback matching.",
              "client_id + created_at desc — client-level queries.",
          ]),
          Paragraph("5.2 Event log and partitioning", S["h2"]),
          bullets([
              "The status webhook performs a pure insert into outbound_call_events, range-partitioned by month.",
              "process-call-events drains batches on a short cron interval.",
              "Call ids resolve via twilio_call_sid or parent_sid, then a single update applies the final state.",
              "create_outbound_call_events_partition() pre-creates next month's partition and enables RLS.",
          ]),
          code("select public.process_outbound_call_events(500);"),
          Paragraph("5.3 Load test results (k6)", S["h2"]),
          table(["Scenario", "Load", "p95", "Result"], [
              ["Campaign execution", "200 RPS, 5m", "220 ms", "98.4% OK, DB CPU 55%."],
              ["Concurrent dialing", "500 active calls", "n/a", "Stable; carrier quota is the cap."],
              ["Webhook processing", "1200 RPS", "85 ms", "100% OK after the event-log redesign."],
              ["Dashboard traffic", "200 vUsers, 10m", "180 ms", "99.9% OK; indexes cut p95 sixfold."],
          ], [1.7, 1.6, 0.8, 2.9])]

    s += [Paragraph("6. Security", S["h1"]),
          bullets([
              "Roles live only in user_roles and are checked through security-definer helpers.",
              "RLS on every public table and every partition, with explicit GRANTs.",
              "Execute on security-definer routines is revoked from public and anon; reporting routines are "
              "service-role only.",
              "Materialised views are not reachable through the API.",
              "Edge functions classify auth as carrier-signed, authenticated, staff JWT, admin JWT or CRON_SECRET.",
              "Service-role credentials are never used on the client.",
              "Generic client errors, full server-side logging, rate limiting on expensive endpoints.",
              "Audit entries for role changes, privacy operations, secret reads and escalations.",
              f"Auth redirects pinned to {APP_URL}; sign-out clears client state and returns to '/'.",
          ])]

    s += [Paragraph("7. Realtime and presence", S["h1"]),
          p("Realtime broadcast carries live transcription, queue and transfer changes, the supervisor view and "
            "officer-chat streaming. useAgentPresence heartbeats while the tab is open, marks a stale session as new "
            "on sign-in, and writes an offline state with cleared timers on sign-out or tab close (a keepalive request "
            "covers the unload path)."),
          Paragraph("8. WebRTC calling", S["h1"]),
          p("useWebRTCCall creates one peer connection per call. SDP and ICE exchange rides a Realtime channel scoped "
            "to the call id; ICE servers are fetched from a signed edge function.")]

    s += [Paragraph("9. AI integrations", S["h1"]),
          bullets([
              "Officer Chat and AI policy notes run through the Lovable AI Gateway.",
              "Tag suggestions combine a heuristic pass with an AI fallback.",
              "Sentiment is computed per transcript turn and stored with the transcription.",
              "Transcription is chunked to stay inside the payload cap.",
          ])]

    s += [Paragraph("10. Local development", S["h1"]),
          code("bun install\nbun run dev            # vite on :8080\nbunx vitest run        # unit tests\n"
               "bunx tsgo --noEmit     # typecheck\nbun run docs:build     # regenerate the developer PDF\n\n"
               "# never edit src/integrations/supabase/{client,types}.ts (auto-generated)")]

    s += [Paragraph("11. Documentation pipeline", S["h1"]),
          bullets([
              "src/data/documentation.ts is the in-app documentation content, rendered by src/pages/Documentation.tsx "
              "with role-filtered chapters and search.",
              "scripts/docs/base_guides.py regenerates the two base PDFs in Care Connect branding.",
              "scripts/docs/content.mjs holds living sections appended to the developer PDF; the Vite plugin "
              "regenerates the PDF whenever those sources change.",
          ])]

    s += [Paragraph("12. Migrations", S["h1"]),
          p("Every create table in public is followed in the same migration by GRANTs, RLS enable and policies. "
            "Backfills that add ownership columns must populate them before the new policies are enforced."),
          Paragraph("13. Observability", S["h1"]),
          bullets([
              "error_events and system_health_metrics capture failures and health snapshots.",
              "audit_log records role changes, secret reads and privacy operations.",
              "Cloud function logs are the primary live debugging surface.",
          ]),
          Paragraph("14. Testing", S["h1"]),
          bullets([
              "Unit tests with vitest, including phone normalisation and shared function helpers.",
              "Load tests with k6 under load-tests/scripts.",
          ]),
          Paragraph("15. Deployment", S["h1"]),
          p("Publish from Lovable; custom domains map to the published URL. Cron schedules for process-call-events, "
            "campaign-worker, reconcile-call-status and retry-campaign-calls are configured in Lovable Cloud, and "
            "CRON_SECRET protects every cron-triggered endpoint."),
          Paragraph("16. Extending the platform", S["h1"]),
          bullets([
              "New campaign type: insert into campaign_types, add IVR options, deploy.",
              "New product type: add it in Setup → Catalog so campaign forms pick it up automatically.",
              "New language: add the supported language, upload audio, add translation strings.",
              "New role: extend the role enum, add policies, update route guards.",
              "New AI feature: use the AI gateway; never embed third-party keys in the client.",
          ]),
          Paragraph("17. Coding conventions", S["h1"]),
          bullets([
              "Semantic Tailwind tokens only; no hardcoded colour utilities.",
              "Long forms split into tabs so action buttons stay visible.",
              "Officer chat rendered as a floating, non-modal side panel.",
              "Collapsible sidebar; scroll to top on every navigation.",
          ]),
          Paragraph("18. Appendix: useful RPCs", S["h1"]),
          table(["RPC", "Returns", "Used for"], [
              ["has_role(uid, role)", "boolean", "RLS policies."],
              ["is_admin() / is_staff() / is_supervisor_or_admin()", "boolean", "Edge function gating."],
              ["process_outbound_call_events(limit)", "integer", "Drainer cron."],
              ["create_outbound_call_events_partition(date)", "void", "Monthly partition creation."],
          ], [3.0, 1.0, 3.0])]
    return s


if __name__ == "__main__":
    build(os.path.join(ROOT, "public/docs/CareConnect_User_Guide.pdf"),
          "Complete User Manual — Agents, Supervisors and Administrators", user_story())
    build(os.path.join(ROOT, "docs-src/CareConnect_Developer_Guide_base.pdf"),
          "Developer Guide — Architecture, Data Model, Edge Functions, Security", dev_story())
