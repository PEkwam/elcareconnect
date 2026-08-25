export type DocBlock =
  | { type: "p"; text: string }
  | { type: "list"; items: string[] }
  | { type: "steps"; items: string[] }
  | { type: "table"; head: string[]; rows: string[][] }
  | { type: "note"; text: string };

export type DocSection = {
  id: string;
  title: string;
  summary: string;
  blocks: DocBlock[];
};

export type DocChapter = {
  id: string;
  title: string;
  description: string;
  /** Minimum access level required to see this chapter. */
  access: "all" | "admin" | "superAdmin";
  sections: DocSection[];
};

export const docChapters: DocChapter[] = [
  {
    id: "getting-started",
    title: "Getting started",
    description: "Sign in, find your way around, and set up your profile.",
    access: "all",
    sections: [
      {
        id: "sign-in",
        title: "Signing in",
        summary: "How to access Care Connect and what happens on first login.",
        blocks: [
          {
            type: "steps",
            items: [
              "Open the Care Connect URL and land on the sign-in screen.",
              "Enter the email and password supplied in your invitation email, or use your organisation's single sign-on if Active Directory has been enabled.",
              "On first sign-in, open Profile and set your display name and avatar so colleagues can recognise you on the supervisor console.",
            ],
          },
          {
            type: "note",
            text: "If you see \"Invalid login credentials\", confirm the email is correct and use Reset password on the Profile page or ask an administrator to re-issue your invitation.",
          },
        ],
      },
      {
        id: "navigation",
        title: "Navigating the workspace",
        summary: "Sidebar, header controls, command palette, and the Officer Chat assistant.",
        blocks: [
          {
            type: "list",
            items: [
              "Sidebar — moves between Dashboard, Supervisor, Setup, Miscellaneous, Campaign Analytics, Documentation and Profile. Items you cannot access are hidden.",
              "Header — contains your status widget, the theme toggle and quick actions.",
              "Command palette — opens a keyboard-driven jump list for pages and common actions.",
              "Officer Chat — the floating assistant on Dashboard and Miscellaneous; ask it questions about clients, campaigns and policies.",
            ],
          },
        ],
      },
      {
        id: "profile",
        title: "Your profile and privacy",
        summary: "Display name, avatar, password changes and data requests.",
        blocks: [
          {
            type: "p",
            text: "The Profile page holds your display name, avatar upload, password reset and role badge. The privacy panel lets you export every record tied to your account or request deletion; exports and deletions are processed by the backend and anonymise your operational history rather than removing shared call records.",
          },
        ],
      },
    ],
  },
  {
    id: "daily-work",
    title: "Daily work",
    description: "Status, calls, appointments and the tools agents use every shift.",
    access: "all",
    sections: [
      {
        id: "status",
        title: "Status and presence",
        summary: "How your availability and timers behave across a shift.",
        blocks: [
          {
            type: "p",
            text: "Set your state from the My Status control in the header. Presence is shared live with supervisors and drives call routing.",
          },
          {
            type: "table",
            head: ["Status", "Meaning"],
            rows: [
              ["Available", "Ready to receive routed calls; the session timer runs."],
              ["On call", "Currently handling a conversation."],
              ["On break", "Temporarily unavailable; excluded from routing."],
              ["Away", "Signed in but not at the desk."],
              ["Offline", "Not working. Timers stop and reset."],
            ],
          },
          {
            type: "note",
            text: "Signing out or closing the browser moves you to Offline automatically and clears the timer. Signing back in starts a fresh session.",
          },
        ],
      },
      {
        id: "calls",
        title: "Handling calls",
        summary: "Live queue, browser calling, transfers and callbacks.",
        blocks: [
          {
            type: "list",
            items: [
              "Calls tab (Dashboard) — the live agent queue plus a searchable history of recent calls with outcome and sentiment.",
              "Call panel — place and answer calls in the browser without a desk phone.",
              "Route call — send a call to the best-matched agent using skills and availability.",
              "Transfers and callbacks — hand a call to a colleague or schedule a return call from Miscellaneous → Call management.",
              "Transcripts and sentiment — recordings are transcribed and scored so supervisors can review tone and outcomes.",
            ],
          },
        ],
      },
      {
        id: "clients",
        title: "Clients",
        summary: "Adding, importing and maintaining client records.",
        blocks: [
          {
            type: "steps",
            items: [
              "Open Dashboard → Clients to browse and edit existing records.",
              "Use Import CSV for bulk loads; the file's columns are mapped to client fields before saving.",
              "Phone numbers are normalised to international E.164 format automatically, so local formats such as 0246052499 are accepted and stored as +233246052499.",
              "Assign clients to a campaign to include them in an outbound run.",
            ],
          },
        ],
      },
      {
        id: "appointments",
        title: "Appointments",
        summary: "Booking and tracking scheduled follow-ups.",
        blocks: [
          {
            type: "p",
            text: "The Appointments tab lists upcoming and past bookings. Appointments can be created by an agent or captured automatically during an automated call when the client selects a slot from the keypad menu. Confirmation emails are sent when the booking is saved.",
          },
        ],
      },
    ],
  },
  {
    id: "campaigns",
    title: "Campaigns",
    description: "Build, run and measure outbound campaigns.",
    access: "all",
    sections: [
      {
        id: "campaign-build",
        title: "Building a campaign",
        summary: "Create a campaign, attach clients and configure the message.",
        blocks: [
          {
            type: "steps",
            items: [
              "Dashboard → Campaigns → New campaign. Give it a name, campaign type and tags.",
              "Clients tab: add contacts individually with Add one, or attach an existing client segment. Product type and due date use the catalogue dropdown and date picker so values stay consistent.",
              "Recordings tab: choose the intro recording and any language-specific audio callers should hear.",
              "Translations tab: provide localised prompt text for each supported language.",
            ],
          },
          {
            type: "note",
            text: "Product Type options come from Setup → Catalog → Product Types. Add a product type there first if it is missing from the dropdown.",
          },
        ],
      },
      {
        id: "campaign-run",
        title: "Running and controlling a run",
        summary: "Queueing, progress, pausing and retries.",
        blocks: [
          {
            type: "list",
            items: [
              "Enqueue builds the job list, validating and normalising every phone number.",
              "The progress panel shows queued, in-flight, completed and failed counts in real time.",
              "Administrators can pause, resume, cancel or retry failed calls; every control action is recorded in the audit log.",
              "Calls that stall are reconciled automatically against the telephony provider so statuses do not stay stuck.",
            ],
          },
        ],
      },
      {
        id: "campaign-analytics",
        title: "Campaign analytics",
        summary: "Measuring results across time ranges and campaigns.",
        blocks: [
          {
            type: "p",
            text: "Campaign Analytics (admins) reports connection rates, outcomes and sentiment by time range, with drill-down to the individual clients contacted in a run. The Dashboard's Analytics tab shows the same signals live for the current day.",
          },
        ],
      },
    ],
  },
  {
    id: "supervision",
    title: "Supervision",
    description: "Monitoring the floor, coaching and performance.",
    access: "all",
    sections: [
      {
        id: "supervisor-console",
        title: "Supervisor console",
        summary: "Live agent states, queue depth and alerts.",
        blocks: [
          {
            type: "list",
            items: [
              "Agent grid with current status and time in state.",
              "Live queue with waiting callers and routing decisions.",
              "Escalation alerts raised by agents or triggered by rules.",
            ],
          },
        ],
      },
      {
        id: "performance",
        title: "Performance and coaching",
        summary: "Leaderboard, shifts and knowledge base.",
        blocks: [
          {
            type: "list",
            items: [
              "Leaderboard (Miscellaneous) ranks agents on handled volume and outcomes.",
              "Shift scheduler (admins) plans coverage and links agents to skills.",
              "Knowledge base holds the approved answers agents should use on calls.",
              "Customer notes and AI policy notes capture context that carries between conversations.",
            ],
          },
        ],
      },
    ],
  },
  {
    id: "administration",
    title: "Administration",
    description: "Setup, people, telephony and catalogue configuration.",
    access: "admin",
    sections: [
      {
        id: "people",
        title: "People and roles",
        summary: "Inviting users and granting the right access level.",
        blocks: [
          {
            type: "table",
            head: ["Role", "Access"],
            rows: [
              ["user", "Dashboard, call tools, profile and documentation."],
              ["agent", "Same as user, plus agent presence, skills and queue assignment."],
              ["supervisor", "Adds the supervisor console for live floor monitoring."],
              ["admin", "Adds Setup, Miscellaneous admin tools and Campaign Analytics."],
              ["super_admin", "Adds Active Directory, SIP trunks and app secrets."],
            ],
          },
          {
            type: "p",
            text: "Manage accounts in Setup → People. Users receives role assignment, Agents handles agent records and invitations, and Skills defines the competencies used by call routing.",
          },
        ],
      },
      {
        id: "voice",
        title: "Voice and languages",
        summary: "Languages, audio assets, system recordings and the keypad menu.",
        blocks: [
          {
            type: "list",
            items: [
              "Languages — the set of languages callers can be served in.",
              "Audio — per-language uploads used by automated calls.",
              "System recordings — shared prompts such as intros and closings.",
              "IVR menu — the keypad options callers hear and where each one leads.",
            ],
          },
        ],
      },
      {
        id: "telephony",
        title: "Telephony",
        summary: "Caller ID, escalation rules and carrier connectivity.",
        blocks: [
          {
            type: "list",
            items: [
              "Call settings — default caller ID, the dial-me-first behaviour and the admin bridge phone.",
              "Escalation — who is notified when a call is escalated and how.",
              "SIP trunks (super admin) — carrier credentials and routing. Use Verify to confirm the account details before going live.",
            ],
          },
          {
            type: "note",
            text: "Caller-ID and bridge settings live in Call settings, while carrier credentials live in SIP trunks. Both must be correct before outbound campaigns will connect.",
          },
        ],
      },
      {
        id: "catalog",
        title: "Catalogue",
        summary: "Product types and campaign types.",
        blocks: [
          {
            type: "p",
            text: "Product Types defines the insurance products referenced by clients and campaigns; each entry has a code, name, description and active flag. Campaign Types classifies campaigns for reporting. Deactivate rather than delete entries that are no longer sold so historical records stay readable.",
          },
        ],
      },
    ],
  },
  {
    id: "platform",
    title: "Platform and security",
    description: "Architecture, integrations and data protection.",
    access: "superAdmin",
    sections: [
      {
        id: "architecture",
        title: "Architecture",
        summary: "How the pieces fit together.",
        blocks: [
          {
            type: "p",
            text: "Care Connect is a React front end backed by Lovable Cloud. The database holds clients, campaigns, calls, agent presence and configuration, with row-level security policies restricting every table to the roles allowed to read or change it. Serverless functions handle telephony webhooks, campaign workers, transcription, sentiment scoring, email and data-protection requests.",
          },
        ],
      },
      {
        id: "sso",
        title: "Active Directory (SAML SSO)",
        summary: "Connecting a corporate identity provider.",
        blocks: [
          {
            type: "p",
            text: "Setup → People → Active Directory guides the connection for Microsoft Entra ID, AD FS, Okta, OneLogin, Google Workspace or generic SAML 2.0. Fields adapt to the chosen provider, drafts are saved as you go, and the production checklist verifies itself — submission is only possible once every check passes.",
          },
          {
            type: "list",
            items: [
              "Entity ID: https://elcareconnect.lovable.app/saml/metadata",
              "ACS / Reply URL: https://elcareconnect.lovable.app/saml/acs",
              "Single logout URL: https://elcareconnect.lovable.app/saml/slo",
              "NameID format: emailAddress",
            ],
          },
        ],
      },
      {
        id: "secrets",
        title: "Secrets and integrations",
        summary: "Where credentials live and how they are used.",
        blocks: [
          {
            type: "p",
            text: "Application secrets are stored server-side and managed from Setup → Secrets. They are never exposed to the browser; functions read them at runtime. Rotate a secret by updating it in that panel — no redeploy is required.",
          },
        ],
      },
      {
        id: "data-protection",
        title: "Data protection",
        summary: "Export, deletion and retention.",
        blocks: [
          {
            type: "list",
            items: [
              "Users can export every record tied to their account from the Profile privacy panel.",
              "Deletion requests anonymise personal identifiers while preserving aggregate call statistics.",
              "Call recordings and transcripts are restricted to staff roles; access is enforced in the database, not only in the interface.",
            ],
          },
        ],
      },
    ],
  },
];
