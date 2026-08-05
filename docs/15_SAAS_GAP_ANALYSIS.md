# 15 — SaaS Gap Analysis & Missing Features Specification

## 1. Executive Summary

**KAIO** (Kanban AI Organiser) has achieved significant feature depth as an AI-native meeting intelligence, Kanban task management, and timesheet tracking system. With Phase 4.95 completed, KAIO possesses robust capabilities including Playwright meeting bots, Deepgram Nova-3 speech diarization, LLM task extraction, weekly effort logging with row locking, real-time WebSocket event broadcasting, and global search.

However, in its current implementation, **KAIO operates primarily as an internal enterprise tool or single-tenant solution**, rather than a commercial, self-service **Software-as-a-Service (SaaS)** platform. Key infrastructure required for monetization, tenant isolation, enterprise compliance, third-party integrations, developer platform extensibility, and automated lifecycle management is missing.

This document provides a comprehensive **Gap Analysis** detailing the features, technical infrastructure, and architectural additions required to transform KAIO into a market-ready, enterprise-grade B2B SaaS platform.

---

## 2. Current SaaS Maturity Assessment

| Capability Area              | Current State                   | Target SaaS State                                                        | Maturity Gap                |
| ---------------------------- | ------------------------------- | ------------------------------------------------------------------------ | --------------------------- |
| **Monetization & Billing**   | Database schemas & UI built     | Tiered Subscriptions, Usage-Based Metering, Paywalls, Stripe Integration | **High (Needs Gateway)**    |
| **Tenant Isolation**         | Basic `organization_id` FK      | Strict Subdomain Routing, RLS Tenant Policies, White-Labeling            | **High**                    |
| **Authentication & IAM**     | Password + Cookie JWT           | SAML 2.0 / Okta SSO, OAuth Social Logins, MFA / Passkeys, SCIM 2.0       | **High**                    |
| **Integrations & Ecosystem** | Google Meet via Extension       | Zoom, Teams, Webex, Google/Outlook Calendar, Slack, Jira                 | **High**                    |
| **Developer Platform**       | Internal REST APIs              | Scoped API Keys, Rate Limiting, Outbound Webhooks Queue                  | **Critical (100% Missing)** |
| **Compliance & Privacy**     | Basic security log table        | GDPR/CCPA Tools (Export/Anonymization), Enterprise SIEM Audit Trail      | **High**                    |
| **Background Processing**    | Simple Asyncio background tasks | Dedicated Distributed Worker Queue (Redis + Celery/ARQ)                  | **High**                    |
| **Growth & Onboarding**      | **IMPLEMENTED (AppTour + DB)**  | Self-service signup, guided wizard, telemetry, in-app support            | **Resolved (Completed)**    |

---

## 3. Detailed Missing SaaS Feature Domains

### 3.1 Domain 1: Monetization, Billing & Metering Engine (Critical)

Currently, KAIO has no concept of pricing plans, subscriptions, payment processing, or usage metering.

#### Missing Features & Technical Requirements:

1. **Payment Gateway & Subscription Integration (Stripe / Paddle)**
   - Integration with Stripe Billing (Subscriptions, Invoices, Customer Portal, Webhook reconciliation).
   - Subscription tier definitions: **Free**, **Pro**, **Team**, and **Enterprise**.
   - Automatic subscription lifecycle handling: trial periods, renewals, payment failures (dunning management), cancellations, and upgrades/downgrades with prorated charges.

2. **Usage-Based Metering Engine**
   - Real-time metering of high-cost operational vectors:
     - **Meeting Audio Hours**: Deepgram transcription minutes used per month.
     - **AI Task Extraction Tokens**: LLM API token consumption per organization.
     - **Active User Seats**: Number of billable workspace members.
     - **Storage Quota**: WebM audio recordings and task attachment file storage (GB).
   - Metering aggregation pipeline writing to a dedicated `organization_usage` table.

3. **Feature Gating & Tier Enforcement Middleware**
   - Backend authorization decorators/middleware checking organization plan entitlements before allowing feature access:
     - _Free Plan_: Max 3 boards, 5 seats, 60 meeting mins/month, no timesheets.
     - _Pro Plan_: Unlimited boards, 15 seats, 500 meeting mins/month, basic timesheets.
     - _Enterprise Plan_: Unlimited seats, custom meeting quota, SSO, custom AI rules, dedicated SLA.

4. **Invoicing & Tax Compliance**
   - Automated PDF invoice generation, VAT/GST tax calculation via Stripe Tax, and self-service receipt downloads in Organization Settings.

---

### 3.2 Domain 2: Enterprise Multi-Tenancy & Custom Branding (High)

While models contain `organization_id` foreign keys, tenant boundaries rely solely on logical application code checks rather than strict architectural isolation or custom tenant routing.

#### Missing Features & Technical Requirements:

1. **Subdomain & Custom Domain Tenant Routing**
   - Tenant context resolution based on subdomains (e.g., `acme.kaio.app`) or custom domain mapping (e.g., `kanban.acme.com`).
   - Dynamic SSL certificate provisioning via Let's Encrypt / Caddy reverse proxy for custom tenant domains.

2. **Row-Level Security (RLS) & Tenant Hardening**
   - Enforcement of PostgreSQL Row-Level Security (`ENABLE ROW LEVEL SECURITY`) across all core tables (`boards`, `tasks`, `timesheets`, `meeting_sessions`) using `current_setting('app.current_organization_id')`.
   - Complete prevention of cross-tenant data leakage even in the event of application-layer coding errors.

3. **White-Labeling & Custom Branding**
   - Organization-specific themes: custom logos, primary brand colors, custom favicon, and customized transactional email headers.
   - White-labeled email notifications sent from client-configured domain SPF/DKIM records.

---

### 3.3 Domain 3: Enterprise IAM, SSO & Scoped Security (High)

KAIO currently supports standard email/password authentication with HTTP-only cookie JWTs, lacking enterprise identity provider integration and multi-factor security.

#### Missing Features & Technical Requirements:

1. **Enterprise Single Sign-On (SAML 2.0 & OIDC)**
   - Integration with Identity Providers (IdPs) including Okta, Azure AD / Entra ID, Ping Identity, and OneLogin via SAML 2.0 and OpenID Connect (OIDC).
   - Domain capture / Just-In-Time (JIT) provisioning: users signing up with `@acme.com` automatically get redirected to Acme's SAML IdP.

2. **Social OAuth Logins**
   - "Sign in with Google" and "Sign in with Microsoft" OAuth 2.0 flows for instant one-click signup and login.

3. **Multi-Factor Authentication (MFA / 2FA)**
   - Time-based One-Time Password (TOTP) support via Google Authenticator / Authy.
   - WebAuthn / Passkey support for hardware key authentication (YubiKey, Touch ID, Windows Hello).
   - Mandatory MFA enforcement policies at the Organization level.

4. **Granular Custom RBAC & Scoped Roles**
   - Expansion beyond static roles (`superadmin`, `admin`, `user`) to a flexible permission matrix:
     - Custom roles: _Project Manager_, _Financial Approver_, _Auditor_, _External Contractor_.
     - Granular permissions: `task:create`, `task:delete`, `timesheet:approve`, `meeting:rerun`, `billing:manage`.

5. **SCIM 2.0 Provisioning Protocol**
   - System for Cross-domain Identity Management (SCIM 2.0) server endpoints (`/scim/v2/Users`, `/scim/v2/Groups`) to automate user onboarding and deprovisioning directly from enterprise HR system (Okta/Azure AD).

---

### 3.4 Domain 4: Developer Platform & Integration Ecosystem (Critical)

KAIO currently operates in isolation with no outbound webhooks, public developer API, calendar auto-scheduling, or multi-platform meeting support.

#### Missing Features & Technical Requirements:

1. **Outbound Webhooks Platform**
   - Event subscription management UI for admins to register webhook endpoints.
   - Core webhook events: `task.created`, `task.moved`, `meeting.completed`, `timesheet.submitted`, `timesheet.approved`.
   - Delivery engine with HMAC-SHA256 signature verification (`X-Kaio-Signature`), exponential backoff retry policy, and Dead-Letter Queue (DLQ) tracking.

2. **Public Developer API & API Key Management**
   - Tenant-scoped API key generation (`sk_live_...`, `sk_test_...`) with custom permission scopes and expiration dates.
   - Dedicated Public OpenAPI / Swagger documentation portal.
   - API rate-limiting tier enforcement (e.g., 100 requests/min on Pro, 1000 requests/min on Enterprise).

3. **Calendar Integration & Automated Bot Scheduling**
   - Sync with **Google Calendar API** and **Microsoft Outlook Calendar API**.
   - Automated detection of video call links in upcoming calendar events to automatically schedule Playwright bot instances without manual URL entry.

4. **Multi-Platform Video Conference Support**
   - Expansion beyond Google Meet to support **Zoom Meetings** (via Zoom Web SDK / Playwright / WebRTC bot) and **Microsoft Teams** meeting capture.

5. **Third-Party SaaS Integrations**
   - **Slack Bot App**: Interactive notifications, slash commands (`/kaio task create`), and daily meeting summary digests.
   - **Microsoft Teams App**: Channel tab integration and meeting bot sync.
   - **Jira & GitHub Sync**: Two-way task synchronization between KAIO boards and Jira issues or GitHub Issues/PRs.

---

### 3.5 Domain 5: Compliance, Privacy & Data Governance (High)

SaaS buyers in enterprise segments require strict adherence to regulatory standards (GDPR, CCPA, SOC 2 Type II, HIPAA).

#### Missing Features & Technical Requirements:

1. **GDPR & CCPA Self-Service Privacy Tools**
   - **Data Portability / Export**: One-click machine-readable ZIP export containing all user/org data (tasks, timesheets, transcripts, audit logs).
   - **Right-to-be-Forgotten (Hard Delete & Anonymization)**: Automated workflow to scrub personal data, anonymize activity logs, and permanently delete audio recordings.

2. **Enterprise Audit Trail Engine & SIEM Integration**
   - Centralized immutable audit trail logging all high-impact actions (role changes, data deletion, timesheet overrides, API key creation, export operations).
   - Real-time audit log streaming to enterprise SIEM platforms (Splunk, Datadog, AWS CloudWatch, Elastic).

3. **Data Retention & Automated Archival Policies**
   - Organization-configurable retention policies: auto-delete raw WebM meeting recordings after 30/60/90 days while preserving attributed text transcripts.
   - Automatic archival of inactive boards and closed timesheets.

4. **Encryption Key Management (BYOK / CMEK)**
   - Customer-Managed Encryption Keys (CMEK) integration allowing enterprise customers to encrypt audio assets and database records using their own AWS KMS or Azure Key Vault keys.

---

### 3.6 Domain 6: Product Growth, Self-Service Onboarding & Telemetry (High)

Currently, workspace onboarding requires seed scripts or manual invitation links created by existing admins.

#### Missing Features & Technical Requirements:

1. **Self-Service Organization Creation & Onboarding Wizard**
   - Public registration flow allowing new users to sign up, create an organization, invite team members, and select a subscription plan.
   - Interactive product tour guiding users through extension installation, board setup, and calendar sync.

2. **In-App Customer Support & Knowledge Base**
   - Integrated helpdesk widget (Intercom, Zendesk, or Crisp) for real-time customer support chat.
   - In-app searchable documentation widget and ticket submission form.

3. **Product Telemetry & Usage Analytics**
   - Integration with Product Analytics engines (PostHog / Mixpanel) to measure user engagement, feature adoption (e.g., global search frequency, transcript editor edits), and conversion funnels.

4. **In-App Announcements & Feature Release Banners**
   - Widget displaying product updates, release notes, and system maintenance alerts directly within the application header.

---

### 3.7 Domain 7: Infrastructure, High Availability & Operations (High)

KAIO currently runs background tasks inside standard Python `asyncio` loops, which are subject to memory leaks, process crashes, and lack distributed scheduling.

#### Missing Features & Technical Requirements:

1. **Distributed Asynchronous Task Engine (Redis + Celery / ARQ)**
   - Offload heavy tasks (FFmpeg audio processing, Deepgram API calls, LLM extraction, email dispatch, webhooks) to a distributed worker pool backed by Redis.
   - Task retry queue, concurrency control, and task status monitoring UI in Admin panel.

2. **API Rate Limiting & Denial-of-Service Protection**
   - Redis-backed Token Bucket rate limiting middleware protecting FastAPI endpoints against abuse, brute-force login attempts, and DDoS attacks.

3. **Observability & Application Performance Monitoring (APM)**
   - Integration with **Sentry** for full-stack frontend/backend crash tracking.
   - **Prometheus** metrics exporter and **Grafana** dashboards for API latency (p95/p99), DB connection pool utilization, and bot success rates.
   - Distributed tracing via **OpenTelemetry**.

---

### 3.8 Domain 8: Advanced AI Capabilities & Quota Management (Medium)

#### Missing Features & Technical Requirements:

1. **Bring Your Own Key (BYOK) AI Models**
   - Enterprise settings allowing organizations to supply their own OpenAI, Anthropic, or Deepgram API keys for processing, ensuring custom data privacy contracts.

2. **Custom AI Prompt Templates & Extraction Rules**
   - Custom prompt configuration per board (e.g., Engineering extraction vs. Sales discovery meeting extraction rules).

---

## 4. Prioritized SaaS Transformation Roadmap

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                   SAAS ROADMAP                                          │
├─────────────────────────┬─────────────────────────┬─────────────────────────────────────┤
│  PHASE 5.1 (FOUNDATION) │  PHASE 5.2 (GROWTH)     │  PHASE 5.3 (ENTERPRISE READINESS)   │
│  Target: Months 1-2     │  Target: Months 3-4     │  Target: Months 5-6                 │
├─────────────────────────┼─────────────────────────┼─────────────────────────────────────┤
│ • Stripe Billing Engine │ • Public API & API Keys │ • SAML 2.0 & Okta SSO               │
│ • Redis + ARQ Worker    │ • Outbound Webhook Queue│ • SCIM 2.0 User Provisioning        │
│ • Rate Limiting         │ • Google/Outlook Sync   │ • GDPR Export & Scrubbing           │
│ • Self-Service Signup   │ • Slack & Teams Apps    │ • Subdomain & Custom Branding       │
│ • Usage Metering        │ • Zoom / Teams Bots     │ • BYOK AI Encryption (CMEK)         │
└─────────────────────────┴─────────────────────────┴─────────────────────────────────────┘
```

---

## 5. Required Database Architecture Additions

To support these SaaS capabilities, the PostgreSQL schema will require new canonical tables and stored functions. Below is the blueprint of required schema additions:

```sql
-- 1. Subscription & Billing Core
CREATE TABLE billing_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    stripe_customer_id VARCHAR(255) UNIQUE NOT NULL,
    stripe_subscription_id VARCHAR(255) UNIQUE,
    plan_tier VARCHAR(50) NOT NULL CHECK (plan_tier IN ('free', 'pro', 'team', 'enterprise')),
    status VARCHAR(50) NOT NULL CHECK (status IN ('active', 'trialling', 'past_due', 'canceled', 'unpaid')),
    current_period_start TIMESTAMPTZ NOT NULL,
    current_period_end TIMESTAMPTZ NOT NULL,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Usage Metering Ledger
CREATE TABLE usage_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    metric_type VARCHAR(50) NOT NULL CHECK (metric_type IN ('meeting_minutes', 'ai_tokens', 'storage_bytes', 'seats')),
    quantity NUMERIC(12, 2) NOT NULL,
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Developer API Keys
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_by_user_id UUID NOT NULL REFERENCES users(id),
    key_hash VARCHAR(255) NOT NULL UNIQUE,
    key_prefix VARCHAR(16) NOT NULL,
    name VARCHAR(100) NOT NULL,
    scopes TEXT[] NOT NULL DEFAULT ARRAY['read'],
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Outbound Webhook Subscriptions
CREATE TABLE webhook_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    target_url TEXT NOT NULL,
    secret_key VARCHAR(255) NOT NULL,
    subscribed_events TEXT[] NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. SAML / Identity Provider Config
CREATE TABLE sso_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    idp_entity_id TEXT NOT NULL,
    sso_url TEXT NOT NULL,
    x509_certificate TEXT NOT NULL,
    enforce_sso BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 6. Summary & Recommendations

KAIO has built an exceptional core application foundation with advanced features such as real-time audio pipeline processing, dynamic speaker attribution, enterprise timesheet management, and WebSocket real-time synchronization.

To transition from a **feature-complete application** to a **scalable, high-ARR commercial SaaS business**, the immediate technical priorities are:

1. **Implement Stripe Billing & Usage Metering** to monetize meeting recording minutes and seats.
2. **Deploy Redis + ARQ Worker Queue** to isolate heavy bot and AI operations from API request threads.
3. **Build the Developer Platform (API Keys & Outbound Webhooks)** to enable integration into client workflows.
4. **Implement Enterprise SSO (SAML 2.0)** to unlock sales to mid-market and enterprise accounts.
