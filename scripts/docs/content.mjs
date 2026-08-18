// Single source of truth for "Living" sections of the developer guide.
// Edit this file (or the AD setup component) and the PDF auto-regenerates.
// Add a new entry to `livingSections` for every new feature so docs stay in sync.

export const livingSections = [
  {
    id: "ad-saml-sso",
    number: "18",
    title: "Active Directory (SAML SSO) Setup",
    sourceFiles: ["src/components/dashboard/ActiveDirectorySetup.tsx"],
    intro:
      "The Active Directory configurator (Setup → People → Active Directory) provides a guided, auto-validated workflow for connecting Care Connect to a corporate IdP. Implementation: src/components/dashboard/ActiveDirectorySetup.tsx.",
    subsections: [
      {
        title: "18.1 Supported IdP Types",
        body: "A discriminated idpTemplates map drives the dynamic field set per directory type: Microsoft Entra ID (Azure AD), AD FS, Okta, OneLogin, Google Workspace and Generic SAML 2.0. Selecting a type swaps the required fields and resets verification state.",
      },
      {
        title: "18.2 Draft Save & Resume",
        body: "Configuration is persisted as a draft in localStorage under key el:ad-setup:draft:v1. The draft preserves: selected IdP type, captured field values, allowed domains, pilot users, default role, enforcement toggles, break-glass email, and the verified metadata snapshot (when status is 'ok'). On dialog open the draft is hydrated and the user is notified. A 'Draft saved' badge plus a 'Resume Active Directory setup' CTA appear on the card when a draft exists. Submission clears the draft via clearDraft().",
      },
      {
        title: "18.3 Entra ID Consistency Validation",
        body: "When the IdP type is entra, an entraIssues memo runs the following checks before any checklist item turns green:",
        bullets: [
          "Tenant ID matches GUID regex ^[0-9a-f]{8}-...-[0-9a-f]{12}$",
          "Enterprise App Object ID matches the same GUID regex",
          "Federation Metadata URL host is login.microsoftonline.com (or .us)",
          "Metadata URL contains the supplied Tenant ID",
          "Metadata URL path includes /federationmetadata/",
          "After fetch, the returned entityID references the Tenant ID",
        ],
      },
      {
        title: "18.4 Test SSO Button",
        body: "runSsoTest() performs a live probe against the IdP. Preconditions: all required fields supplied, metadata verified, and (for Entra) consistency checks passing. The probe fetches the SSO endpoint extracted from the verified metadata using mode: 'no-cors'; an opaque response counts as reachable. The result is stored in ssoTest state as idle | running | success | error, surfaced both inline and as a checklist row with a specific failure reason.",
      },
      {
        title: "18.5 Auto-Verified Production Checklist",
        body: "The checklist is computed by an autoChecks memo — users cannot tick items manually. Each entry exposes label, done, and a why string explaining the current state. Green rows show a confirmation; red rows show the precise blocker.",
        bullets: [
          "All required IdP fields supplied — lists missing field labels when red.",
          "IdP details consistent — surfaces the first Entra consistency error.",
          "IdP metadata verified & reachable — reports HTTP/parse failure or asks for Verify click.",
          "Live SSO test passed — shows the probed hostname or the specific failure reason.",
          "Email domains allowlisted — lists malformed domains.",
          "Pilot users supplied (2-5 valid emails) — explains count or format violation.",
          "Single Logout + SSO enforcement enabled.",
          "Break-glass admin email captured (or explicitly disabled).",
        ],
        outro:
          "Submit is enabled only when every check is green. On submit the component dispatches a lovable:saml-sso-submit CustomEvent with the full payload and clears the draft. Server-side SAML trust finalisation is handled by Lovable Cloud SSO configuration.",
      },
      {
        title: "18.6 Service Provider Constants",
        bullets: [
          "Entity ID: https://elcareconnect.lovable.app/saml/metadata",
          "ACS / Reply URL: https://elcareconnect.lovable.app/saml/acs",
          "Single Logout URL: https://elcareconnect.lovable.app/saml/slo",
          "NameID format: emailAddress",
        ],
      },
    ],
  },
];

// Collect every file path the docs depend on so the Vite plugin can watch them.
export const watchedSourceFiles = Array.from(
  new Set(livingSections.flatMap((s) => s.sourceFiles ?? [])),
);
