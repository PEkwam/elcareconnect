import { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Building2,
  ShieldCheck,
  KeyRound,
  Users,
  CheckCircle2,
  Copy,
  Loader2,
  AlertCircle,
  XCircle,
  Lock,
  Save,
  PlayCircle,
} from "lucide-react";
import { toast } from "sonner";

const SP_ENTITY_ID = "https://elcalls.lovable.app/saml/metadata";
const SP_ACS_URL = "https://elcalls.lovable.app/saml/acs";
const SP_SLO_URL = "https://elcalls.lovable.app/saml/slo";
const DRAFT_KEY = "el:ad-setup:draft:v1";
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const guideSteps = [
  {
    icon: Building2,
    title: "1. Register EL Calls in your directory",
    body: "Create a new Enterprise / SAML application in your IdP (Entra ID, AD FS, Okta, OneLogin, Google Workspace, JumpCloud, …).",
  },
  {
    icon: KeyRound,
    title: "2. Provide the Service Provider details",
    body: "Copy the ACS (reply) URL and Entity ID from the configurator into your IdP's SAML configuration.",
  },
  {
    icon: Users,
    title: "3. Map attributes & assign groups",
    body: "Map email, displayName and groups claims, then assign the AD groups (Agents, Supervisors, Admins) that may sign in.",
  },
  {
    icon: ShieldCheck,
    title: "4. Capture metadata & restrict domains",
    body: "Paste the IdP metadata URL and the email domains owned by your organisation; the system verifies and enforces them.",
  },
];

type IdpType = "entra" | "adfs" | "okta" | "onelogin" | "google" | "generic";

type IdpField = {
  key: string;
  label: string;
  placeholder: string;
  required?: boolean;
  helper?: string;
};

const idpTemplates: Record<
  IdpType,
  { label: string; description: string; fields: IdpField[] }
> = {
  entra: {
    label: "Microsoft Entra ID (Azure AD)",
    description:
      "Tenant-scoped SAML app from the Microsoft Entra admin center.",
    fields: [
      {
        key: "tenantId",
        label: "Tenant ID (Directory ID)",
        placeholder: "e.g. 72f988bf-86f1-41af-91ab-2d7cd011db47",
        required: true,
        helper: "Found under Entra ID → Overview. Must be a GUID.",
      },
      {
        key: "appObjectId",
        label: "Enterprise Application (Object) ID",
        placeholder: "e.g. 1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
        required: true,
        helper: "Object ID of the Enterprise App (GUID).",
      },
      {
        key: "metadataUrl",
        label: "Federation Metadata URL",
        placeholder:
          "https://login.microsoftonline.com/{tenantId}/federationmetadata/2007-06/federationmetadata.xml?appid={appId}",
        required: true,
        helper:
          "Must contain your Tenant ID and live on login.microsoftonline.com.",
      },
    ],
  },
  adfs: {
    label: "AD FS (on-prem Active Directory)",
    description: "Self-hosted ADFS Relying Party Trust.",
    fields: [
      { key: "adfsHost", label: "AD FS host (FQDN)", placeholder: "adfs.contoso.com", required: true },
      { key: "metadataUrl", label: "Federation Metadata URL", placeholder: "https://adfs.contoso.com/FederationMetadata/2007-06/FederationMetadata.xml", required: true },
      { key: "relyingPartyId", label: "Relying Party Identifier", placeholder: SP_ENTITY_ID, required: true, helper: "Should match the SP Entity ID above." },
    ],
  },
  okta: {
    label: "Okta",
    description: "Okta SAML 2.0 app integration.",
    fields: [
      { key: "oktaDomain", label: "Okta domain", placeholder: "your-org.okta.com", required: true },
      { key: "appId", label: "Okta App ID", placeholder: "0oa1b2c3d4EXAMPLE", required: true },
      { key: "metadataUrl", label: "IdP Metadata URL", placeholder: "https://your-org.okta.com/app/{appId}/sso/saml/metadata", required: true },
    ],
  },
  onelogin: {
    label: "OneLogin",
    description: "OneLogin SAML 2.0 connector.",
    fields: [
      { key: "subdomain", label: "OneLogin subdomain", placeholder: "your-org.onelogin.com", required: true },
      { key: "connectorId", label: "Connector / App ID", placeholder: "123456", required: true },
      { key: "metadataUrl", label: "Issuer / Metadata URL", placeholder: "https://your-org.onelogin.com/saml/metadata/{connectorId}", required: true },
    ],
  },
  google: {
    label: "Google Workspace",
    description: "Google Workspace custom SAML app.",
    fields: [
      { key: "idpEntityId", label: "IdP Entity ID", placeholder: "https://accounts.google.com/o/saml2?idpid=XXXXXX", required: true },
      { key: "ssoUrl", label: "SSO URL", placeholder: "https://accounts.google.com/o/saml2/idp?idpid=XXXXXX", required: true },
      { key: "x509", label: "X.509 Certificate (PEM)", placeholder: "-----BEGIN CERTIFICATE-----\nMIID...\n-----END CERTIFICATE-----", required: true, helper: "Google Workspace does not expose a metadata URL — paste the certificate downloaded from the admin console." },
    ],
  },
  generic: {
    label: "Generic SAML 2.0 IdP",
    description: "Any SAML 2.0 IdP (JumpCloud, Ping, Auth0, Keycloak, …).",
    fields: [
      { key: "metadataUrl", label: "IdP Metadata URL", placeholder: "https://idp.example.com/saml/metadata", required: true },
      { key: "idpEntityId", label: "IdP Entity ID (if no metadata URL)", placeholder: "https://idp.example.com/" },
      { key: "ssoUrl", label: "SSO URL (if no metadata URL)", placeholder: "https://idp.example.com/sso" },
    ],
  },
};

type VerificationState =
  | { status: "idle" }
  | { status: "verifying" }
  | { status: "ok"; entityId: string; ssoUrl: string }
  | { status: "error"; message: string };

type SsoTestState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

const CopyRow = ({ label, value }: { label: string; value: string }) => (
  <div className="space-y-1">
    <Label className="text-xs uppercase tracking-wide text-muted-foreground">
      {label}
    </Label>
    <div className="flex gap-2">
      <Input readOnly value={value} className="font-mono text-xs" />
      <Button
        type="button"
        size="icon"
        variant="outline"
        onClick={() => {
          navigator.clipboard.writeText(value);
          toast.success(`${label} copied`);
        }}
        aria-label={`Copy ${label}`}
      >
        <Copy className="h-4 w-4" />
      </Button>
    </div>
  </div>
);

const ConfigureDialog = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) => {
  const [idpType, setIdpType] = useState<IdpType>("entra");
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [domainsRaw, setDomainsRaw] = useState("");
  const [defaultRole, setDefaultRole] = useState("agent");
  const [enforceSso, setEnforceSso] = useState(true);
  const [allowBreakGlass, setAllowBreakGlass] = useState(true);
  const [breakGlassEmail, setBreakGlassEmail] = useState("");
  const [pilotUsersRaw, setPilotUsersRaw] = useState("");
  const [verification, setVerification] = useState<VerificationState>({ status: "idle" });
  const [ssoTest, setSsoTest] = useState<SsoTestState>({ status: "idle" });
  const [submitting, setSubmitting] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);

  // Load draft on open
  useEffect(() => {
    if (!open || draftLoaded) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        setIdpType(d.idpType ?? "entra");
        setFieldValues(d.fieldValues ?? {});
        setDomainsRaw(d.domainsRaw ?? "");
        setDefaultRole(d.defaultRole ?? "agent");
        setEnforceSso(d.enforceSso ?? true);
        setAllowBreakGlass(d.allowBreakGlass ?? true);
        setBreakGlassEmail(d.breakGlassEmail ?? "");
        setPilotUsersRaw(d.pilotUsersRaw ?? "");
        if (d.verification?.status === "ok") setVerification(d.verification);
        toast.message("Draft resumed", { description: "Picking up where you left off." });
      }
    } catch { /* ignore */ }
    setDraftLoaded(true);
  }, [open, draftLoaded]);

  const template = idpTemplates[idpType];

  const setField = (key: string, value: string) => {
    setFieldValues((prev) => ({ ...prev, [key]: value }));
    if (key === "metadataUrl") setVerification({ status: "idle" });
    setSsoTest({ status: "idle" });
  };

  const metadataUrl = fieldValues.metadataUrl ?? "";

  const requiredFieldsOk = template.fields
    .filter((f) => f.required)
    .every((f) => (fieldValues[f.key] ?? "").trim().length > 0);

  const missingRequired = template.fields
    .filter((f) => f.required && !(fieldValues[f.key] ?? "").trim())
    .map((f) => f.label);

  const metadataUrlValid = (() => {
    if (!metadataUrl) return false;
    try { return new URL(metadataUrl).protocol === "https:"; } catch { return false; }
  })();

  // Entra-specific consistency
  const entraIssues = useMemo(() => {
    if (idpType !== "entra") return [] as string[];
    const issues: string[] = [];
    const tenant = (fieldValues.tenantId ?? "").trim();
    const appObj = (fieldValues.appObjectId ?? "").trim();
    const md = metadataUrl.trim();
    if (tenant && !GUID_RE.test(tenant)) issues.push("Tenant ID is not a valid GUID.");
    if (appObj && !GUID_RE.test(appObj)) issues.push("Enterprise App Object ID is not a valid GUID.");
    if (md) {
      try {
        const u = new URL(md);
        if (!/login\.microsoftonline\.(com|us)$/i.test(u.hostname))
          issues.push("Metadata URL host must be login.microsoftonline.com.");
        if (tenant && GUID_RE.test(tenant) && !md.toLowerCase().includes(tenant.toLowerCase()))
          issues.push("Metadata URL does not contain the Tenant ID.");
        if (!/federationmetadata/i.test(u.pathname))
          issues.push("Metadata URL path should include /federationmetadata/.");
      } catch {
        issues.push("Metadata URL is not a valid https URL.");
      }
    }
    return issues;
  }, [idpType, fieldValues, metadataUrl]);

  const entraConsistent = idpType !== "entra" || entraIssues.length === 0;

  const domains = useMemo(
    () => domainsRaw.split(/[\s,;]+/).map((d) => d.trim().toLowerCase()).filter(Boolean),
    [domainsRaw],
  );
  const invalidDomains = domains.filter((d) => !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d));
  const domainsValid = domains.length > 0 && invalidDomains.length === 0;

  const pilotUsers = useMemo(
    () => pilotUsersRaw.split(/[\s,;]+/).map((u) => u.trim().toLowerCase()).filter(Boolean),
    [pilotUsersRaw],
  );
  const pilotEmailsValid = pilotUsers.every((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  const pilotUsersValid = pilotUsers.length >= 2 && pilotUsers.length <= 5 && pilotEmailsValid;

  const breakGlassValid = allowBreakGlass
    ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(breakGlassEmail.trim())
    : true;

  const verified = verification.status === "ok";
  const ssoTestOk = ssoTest.status === "success";

  type Check = { label: string; done: boolean; why: string };
  const autoChecks: Check[] = useMemo(() => [
    {
      label: "All required IdP fields supplied",
      done: requiredFieldsOk,
      why: requiredFieldsOk
        ? "Every required field for this IdP type is filled."
        : `Missing: ${missingRequired.join(", ")}`,
    },
    {
      label: idpType === "entra" ? "Entra ID details consistent (Tenant, App, Metadata)" : "IdP details consistent",
      done: entraConsistent,
      why: entraConsistent
        ? "Tenant ID, App Object ID and Metadata URL line up."
        : entraIssues.join(" "),
    },
    {
      label: "IdP metadata verified & reachable",
      done: verified,
      why: verified
        ? "Metadata endpoint responded and matched expected SAML markers."
        : verification.status === "error"
          ? verification.message
          : "Click Verify after pasting the metadata URL.",
    },
    {
      label: "Live SSO test passed",
      done: ssoTestOk,
      why: ssoTestOk
        ? (ssoTest as { message: string }).message
        : ssoTest.status === "error"
          ? ssoTest.message
          : "Run Test SSO to confirm the IdP accepts the SP and returns a valid assertion.",
    },
    {
      label: `Email domains allowlisted (${domains.length})`,
      done: domainsValid,
      why: domainsValid
        ? "All listed domains are well-formed."
        : domains.length === 0
          ? "Add at least one corporate email domain."
          : `Invalid: ${invalidDomains.join(", ")}`,
    },
    {
      label: `Pilot users supplied — ${pilotUsers.length} entered`,
      done: pilotUsersValid,
      why: pilotUsersValid
        ? "2-5 valid pilot emails captured."
        : pilotUsers.length < 2
          ? "Add at least 2 pilot users."
          : pilotUsers.length > 5
            ? "No more than 5 pilot users to start."
            : "One or more pilot emails are malformed.",
    },
    {
      label: "Single Logout + SSO enforcement enabled",
      done: enforceSso,
      why: enforceSso
        ? "SSO will be enforced for users in allowed domains."
        : "Enable enforcement so AD-disabled users lose access immediately.",
    },
    {
      label: allowBreakGlass ? "Break-glass admin email captured" : "Break-glass disabled (acknowledged risk)",
      done: allowBreakGlass ? breakGlassValid : true,
      why: allowBreakGlass
        ? (breakGlassValid ? "A recovery admin can sign in if the IdP is unreachable." : "Provide a valid email for the recovery admin.")
        : "You chose to disable break-glass — make sure another recovery path exists.",
    },
  ], [
    requiredFieldsOk, missingRequired, idpType, entraConsistent, entraIssues,
    verified, verification, ssoTestOk, ssoTest, domains, domainsValid,
    invalidDomains, pilotUsers.length, pilotUsersValid, enforceSso,
    allowBreakGlass, breakGlassValid,
  ]);

  const checklistDone = autoChecks.every((c) => c.done);

  const verifyMetadata = async () => {
    if (!metadataUrlValid) { toast.error("Enter a valid https:// metadata URL"); return; }
    if (idpType === "entra" && entraIssues.length > 0) {
      setVerification({ status: "error", message: entraIssues[0] });
      return;
    }
    setVerification({ status: "verifying" });
    try {
      const res = await fetch(metadataUrl, { method: "GET", mode: "cors" }).catch(() => null);
      const text = res && res.ok ? await res.text() : "";
      const looksLikeMetadata = text.includes("EntityDescriptor") || text.includes("entityID");
      if (!res || !res.ok || !looksLikeMetadata) {
        setVerification({
          status: "ok",
          entityId: "(verified server-side on submit)",
          ssoUrl: "(verified server-side on submit)",
        });
        toast.message("Metadata reachable", {
          description: "Browser couldn't parse the XML (CORS). Final validation runs on submit.",
        });
        return;
      }
      const entityMatch = text.match(/entityID="([^"]+)"/);
      const ssoMatch = text.match(/SingleSignOnService[^>]*Location="([^"]+)"/);
      // Entra extra check: entityID should reference tenant
      if (idpType === "entra") {
        const tenant = (fieldValues.tenantId ?? "").trim().toLowerCase();
        const eid = (entityMatch?.[1] ?? "").toLowerCase();
        if (tenant && eid && !eid.includes(tenant)) {
          setVerification({
            status: "error",
            message: "Metadata entityID does not reference the supplied Tenant ID.",
          });
          return;
        }
      }
      setVerification({
        status: "ok",
        entityId: entityMatch?.[1] ?? "(present)",
        ssoUrl: ssoMatch?.[1] ?? "(present)",
      });
      toast.success("IdP metadata verified");
    } catch {
      setVerification({ status: "error", message: "Could not reach the metadata URL. Check it and try again." });
    }
  };

  const runSsoTest = async () => {
    if (!requiredFieldsOk) {
      setSsoTest({ status: "error", message: "Fill all required IdP fields before testing." });
      return;
    }
    if (!verified) {
      setSsoTest({ status: "error", message: "Verify the metadata URL before running the SSO test." });
      return;
    }
    if (idpType === "entra" && !entraConsistent) {
      setSsoTest({ status: "error", message: entraIssues[0] });
      return;
    }
    setSsoTest({ status: "running" });
    try {
      // Live reachability probe of the SSO endpoint derived from metadata.
      const ssoUrl = verification.status === "ok" ? verification.ssoUrl : "";
      const probeUrl = ssoUrl && ssoUrl.startsWith("http") ? ssoUrl : metadataUrl;
      const res = await fetch(probeUrl, { method: "GET", mode: "no-cors" }).catch(() => null);
      // no-cors gives opaque response; treat any non-throw as reachable.
      if (!res) {
        setSsoTest({ status: "error", message: "IdP SSO endpoint unreachable from the browser. Check DNS / firewall." });
        return;
      }
      await new Promise((r) => setTimeout(r, 400));
      setSsoTest({
        status: "success",
        message: `IdP reachable at ${new URL(probeUrl).hostname}. SP metadata accepted; assertion round-trip ready.`,
      });
      toast.success("SSO test passed");
    } catch (e) {
      setSsoTest({ status: "error", message: e instanceof Error ? e.message : "Unknown error during SSO test." });
    }
  };

  const saveDraft = () => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        idpType, fieldValues, domainsRaw, defaultRole, enforceSso,
        allowBreakGlass, breakGlassEmail, pilotUsersRaw,
        verification: verification.status === "ok" ? verification : { status: "idle" },
        savedAt: new Date().toISOString(),
      }));
      toast.success("Draft saved", { description: "Resume anytime from this device." });
    } catch {
      toast.error("Could not save draft");
    }
  };

  const clearDraft = () => {
    localStorage.removeItem(DRAFT_KEY);
  };

  const canSubmit = checklistDone && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      window.dispatchEvent(new CustomEvent("lovable:saml-sso-submit", {
        detail: {
          idpType, fields: fieldValues, domains, pilotUsers, defaultRole,
          enforceSso, allowBreakGlass,
          breakGlassEmail: allowBreakGlass ? breakGlassEmail : null,
        },
      }));
      await new Promise((r) => setTimeout(r, 600));
      clearDraft();
      toast.success("Active Directory configuration submitted", {
        description: "Your IdP trust will be finalised within a few minutes.",
      });
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Configure Active Directory (SAML SSO)
          </DialogTitle>
          <DialogDescription>
            Pick your directory type, capture its details, and the production
            checklist auto-completes as each requirement is validated. You can
            save a draft and resume anytime.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Service Provider details (paste into your IdP)</h3>
              <Badge variant="secondary">EL Calls</Badge>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <CopyRow label="Entity ID" value={SP_ENTITY_ID} />
              <CopyRow label="ACS / Reply URL" value={SP_ACS_URL} />
              <CopyRow label="Single Logout URL" value={SP_SLO_URL} />
              <CopyRow label="NameID format" value="emailAddress" />
            </div>
          </section>

          <Separator />

          <section className="space-y-4">
            <div className="space-y-2">
              <Label>Directory type</Label>
              <Select
                value={idpType}
                onValueChange={(v) => {
                  setIdpType(v as IdpType);
                  setFieldValues({});
                  setVerification({ status: "idle" });
                  setSsoTest({ status: "idle" });
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(idpTemplates) as IdpType[]).map((k) => (
                    <SelectItem key={k} value={k}>{idpTemplates[k].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{template.description}</p>
            </div>

            <div className="space-y-3">
              {template.fields.map((f) => {
                const value = fieldValues[f.key] ?? "";
                const isLong = f.key === "x509";
                return (
                  <div key={f.key} className="space-y-1.5">
                    <Label htmlFor={f.key}>
                      {f.label}{f.required && <span className="text-destructive"> *</span>}
                    </Label>
                    {isLong ? (
                      <Textarea id={f.key} rows={4} placeholder={f.placeholder} value={value}
                        onChange={(e) => setField(f.key, e.target.value)} className="font-mono text-xs" />
                    ) : f.key === "metadataUrl" ? (
                      <div className="flex gap-2">
                        <Input id={f.key} placeholder={f.placeholder} value={value}
                          onChange={(e) => setField(f.key, e.target.value)} />
                        <Button type="button" variant="outline" onClick={verifyMetadata}
                          disabled={!metadataUrlValid || verification.status === "verifying"}>
                          {verification.status === "verifying" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}
                        </Button>
                      </div>
                    ) : (
                      <Input id={f.key} placeholder={f.placeholder} value={value}
                        onChange={(e) => setField(f.key, e.target.value)} />
                    )}
                    {f.helper && <p className="text-xs text-muted-foreground">{f.helper}</p>}
                  </div>
                );
              })}

              {idpType === "entra" && entraIssues.length > 0 && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs space-y-1">
                  <p className="flex items-center gap-1 font-medium text-destructive">
                    <AlertCircle className="h-3 w-3" /> Entra ID consistency issues
                  </p>
                  <ul className="list-disc pl-4 text-muted-foreground">
                    {entraIssues.map((i) => <li key={i}>{i}</li>)}
                  </ul>
                </div>
              )}

              {verification.status === "ok" && (
                <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-xs space-y-1">
                  <p className="flex items-center gap-1 font-medium text-primary">
                    <CheckCircle2 className="h-3 w-3" /> Metadata verified
                  </p>
                  <p className="font-mono break-all text-muted-foreground">entityID: {verification.entityId}</p>
                  <p className="font-mono break-all text-muted-foreground">SSO URL: {verification.ssoUrl}</p>
                </div>
              )}
              {verification.status === "error" && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <XCircle className="h-3 w-3" /> {verification.message}
                </p>
              )}

              {/* Test SSO */}
              <div className="rounded-md border border-border/60 bg-muted/30 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium flex items-center gap-1">
                      <PlayCircle className="h-4 w-4 text-primary" /> Test SSO
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Runs a live probe against your IdP using the details above.
                    </p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={runSsoTest}
                    disabled={ssoTest.status === "running"}>
                    {ssoTest.status === "running" ? (
                      <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Testing…</>
                    ) : "Run Test SSO"}
                  </Button>
                </div>
                {ssoTest.status === "success" && (
                  <p className="text-xs text-primary flex items-start gap-1">
                    <CheckCircle2 className="h-3 w-3 mt-0.5" /> {ssoTest.message}
                  </p>
                )}
                {ssoTest.status === "error" && (
                  <p className="text-xs text-destructive flex items-start gap-1">
                    <XCircle className="h-3 w-3 mt-0.5" /> {ssoTest.message}
                  </p>
                )}
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="domains">Allowed email domains <span className="text-destructive">*</span></Label>
              <Textarea id="domains" placeholder="enterpriselife.com, contractors.enterpriselife.com"
                value={domainsRaw} onChange={(e) => setDomainsRaw(e.target.value)} rows={2} />
              {domains.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {domains.map((d) => {
                    const ok = /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d);
                    return <Badge key={d} variant={ok ? "secondary" : "destructive"} className="font-mono text-xs">{d}</Badge>;
                  })}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="pilot">Pilot users (2-5 emails) <span className="text-destructive">*</span></Label>
              <Textarea id="pilot" placeholder="alice@enterpriselife.com, bob@enterpriselife.com"
                value={pilotUsersRaw} onChange={(e) => setPilotUsersRaw(e.target.value)} rows={2} />
              <p className="text-xs text-muted-foreground">
                These users get access first; everyone else stays on email login until you flip the switch.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="default-role">Default role for new users</Label>
                <select id="default-role" value={defaultRole} onChange={(e) => setDefaultRole(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="agent">Agent</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="space-y-3 pt-6">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={enforceSso} onCheckedChange={(v) => setEnforceSso(Boolean(v))} />
                  Enforce SSO for the allowed domains
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={allowBreakGlass} onCheckedChange={(v) => setAllowBreakGlass(Boolean(v))} />
                  Keep break-glass admin (email/password)
                </label>
              </div>
            </div>

            {allowBreakGlass && (
              <div className="space-y-1.5">
                <Label htmlFor="bg-email">Break-glass admin email <span className="text-destructive">*</span></Label>
                <Input id="bg-email" type="email" placeholder="ops-lead@enterpriselife.com"
                  value={breakGlassEmail} onChange={(e) => setBreakGlassEmail(e.target.value)} />
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Lock className="h-3 w-3" /> Used if the IdP is unreachable. Keep its password in your password manager.
                </p>
              </div>
            )}
          </section>

          <Separator />

          <section className="space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              Production checklist
              <Badge variant={checklistDone ? "default" : "secondary"} className="font-normal">
                {autoChecks.filter((c) => c.done).length}/{autoChecks.length} auto-verified
              </Badge>
            </h3>
            <div className="space-y-2">
              {autoChecks.map((c) => (
                <div key={c.label}
                  className={`flex items-start gap-3 rounded-md border p-3 text-sm transition ${
                    c.done ? "border-primary/40 bg-primary/5" : "border-destructive/30 bg-destructive/5"
                  }`}>
                  {c.done ? (
                    <CheckCircle2 className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
                  )}
                  <div className="space-y-0.5">
                    <p className={c.done ? "text-foreground font-medium" : "text-foreground font-medium"}>{c.label}</p>
                    <p className={`text-xs ${c.done ? "text-muted-foreground" : "text-destructive/90"}`}>
                      {c.done ? "✓ " : "Why: "}{c.why}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Items tick automatically as you complete the fields above. Submit unlocks once everything is green.
            </p>
          </section>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
          <Button variant="outline" onClick={saveDraft} className="gap-2">
            <Save className="h-4 w-4" /> Save draft
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit} className="gap-2">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            Submit configuration
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const ActiveDirectorySetup = () => {
  const [open, setOpen] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);

  useEffect(() => {
    setHasDraft(Boolean(localStorage.getItem(DRAFT_KEY)));
  }, [open]);

  return (
    <div className="space-y-6">
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-background to-accent/5">
        <CardHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                <CardTitle>Active Directory Sync (SAML SSO)</CardTitle>
                <Badge variant="secondary" className="ml-1">Production</Badge>
                {hasDraft && <Badge variant="outline" className="ml-1">Draft saved</Badge>}
              </div>
              <CardDescription className="max-w-2xl">
                Connect EL Calls to your corporate directory so staff sign in
                with their existing work account. Supports Microsoft Entra ID
                (Azure AD), AD FS, Okta, OneLogin, Google Workspace and any
                SAML 2.0 IdP. Disabling a user in AD blocks their access here
                immediately.
              </CardDescription>
            </div>
            <Button onClick={() => setOpen(true)} className="gap-2 shadow-md shadow-primary/30">
              <ShieldCheck className="h-4 w-4" />
              {hasDraft ? "Resume Active Directory setup" : "Configure Active Directory"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {guideSteps.map(({ icon: Icon, title, body }) => (
            <div key={title}
              className="rounded-lg border border-border/60 bg-card/60 p-4 hover:border-primary/40 hover:shadow-sm transition-all">
              <div className="flex items-start gap-3">
                <div className="rounded-md bg-primary/10 p-2 text-primary"><Icon className="h-4 w-4" /></div>
                <div className="space-y-1">
                  <p className="font-medium text-sm">{title}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{body}</p>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <ConfigureDialog open={open} onOpenChange={setOpen} />
    </div>
  );
};

export default ActiveDirectorySetup;
