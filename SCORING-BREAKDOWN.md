# Readiness Score Calculation Breakdown

## Overview
Each persona has a different set of sections with different weights. All sections are scored out of 100 points, then weighted and combined to create an overall score (0-100).

---

## 1. PROSPECT Persona
**5 Sections** | **Overall = Weighted Average**

### Section 1: Basics (Weight: 20%)
- `company_name`: Provided = +33 pts
- `industry`: Selected = +33 pts  
- `user_count`: Selected = +34 pts
- **Max: 100 points**

### Section 2: Scope Clarity (Weight: 25%)
- `modules_interested`: At least 1 = +40 pts (+5 per additional, max +40)
- `assisted_workflows`: Yes = +20, No = +10
- `contract_templates`: "All available" = +20, "Some" = +15, "Need help" = +5
- `assisted_migration`: Yes = +10, No = +5
- `legacy_contracts`: "All available" = +10, "Some" = +5, "Need help" = +0
- **Max: 100 points**

### Section 3: Systems & Integrations (Weight: 20%)
- `systems_used`: At least 1 = +50 pts (+5 per additional, max +50)
- `api_access`: Yes = +50, "Not sure" = +25, No = +0
- **Max: 100 points**

### Section 4: Timeline Readiness (Weight: 20%)
- `go_live_timeline`: Selected = +70 pts
- `biggest_concern`: Provided (optional) = +30 pts bonus
- **Max: 100 points** (70 if concern not provided, 100 if provided)

### Section 5: Additional Context (Weight: 15%)
- `internal_bottlenecks`: Provided = +33 pts
- `compliance_deadlines`: Provided = +33 pts
- `past_clm_experience`: Provided = +34 pts
- **Max: 100 points** (all optional)

**Overall Formula:**
```
(Section1 × 0.20) + (Section2 × 0.25) + (Section3 × 0.20) + (Section4 × 0.20) + (Section5 × 0.15)
```

**Status Thresholds:**
- 80-100: "Ready to Purchase"
- 60-79: "Ready with Preparation"
- 40-59: "Needs Preparation"
- 0-39: "Significant Preparation Required"

---

## 2. CUSTOMER Persona
**7 Sections** | **Overall = Weighted Average**

### Section 1: Stakeholders (Weight: 15%)
- `primary_contact_name` + `primary_contact_role`: Both = +40 pts
- `technical_contact_name` + `technical_contact_role`: Both = +40 pts
- `team_distribution`: At least 1 selected = +10 pts
- `decision_approver`: Selected = +10 pts
- **Max: 100 points**

### Section 2: Purchased Scope (Weight: 20%)
- `purchased_modules`: At least 1 = +40 pts (+5 per additional, max +40)
- `template_count`: Selected = +30 pts
- `template_readiness`: "Ready" = +30, "Partially ready" = +20, "Not ready" = +0
- **Max: 100 points**

### Section 3: Migration (Weight: 15%)
- `migration_needed`: Selected = +30 pts
- If migration ≠ "No":
  - `migration_contract_count`: Selected = +25 pts
  - `contract_storage`: Selected = +25 pts
  - `data_cleanliness`: Selected = +20 pts
- **Max: 100 points** (30 if migration = "No", 100 if all answered)

### Section 4: Integrations (Weight: 15%)
- `integration_systems`: At least 1 = +40 pts (+5 per additional, max +40)
- `api_access`: "Yes" = +30, "Not sure" = +15, "No" = +0
- `webhooks_support`: "Yes" = +30, "Not sure" = +15, "No" = +0
- **Max: 100 points**

### Section 5: Business Processes (Weight: 15%)
- `approval_complexity`: Selected = +50 pts
- `agreement_signers`: Selected = +50 pts
- **Max: 100 points**

### Section 6: Security & Access (Weight: 10%)
- `sso_required`: Selected = +35 pts
- `security_needs`: "Yes" = +35, "No" = +30
- `dpa_status`: "Signed" = +30, "In progress" = +20, "Not started" = +0
- **Max: 100 points**

### Section 7: Optional Uploads (Weight: 10%)
- `templates`: Array has files = +50 pts
- `sample_contracts`: Array has files = +50 pts
- **Max: 100 points** (0 if nothing, 50 if one, 100 if both)

**Overall Formula:**
```
(Section1 × 0.15) + (Section2 × 0.20) + (Section3 × 0.15) + (Section4 × 0.15) + 
(Section5 × 0.15) + (Section6 × 0.10) + (Section7 × 0.10)
```

**Status Thresholds:**
- 80-100: "Ready to Proceed"
- 60-79: "Ready with Minor Blockers"
- 40-59: "Needs Preparation"
- 0-39: "Significant Preparation Required"

---

## 3. IMPLEMENTATION MANAGER Persona
**5 Sections** | **Overall = Weighted Average** (Equal weights)

### Section 1: Customer Context (Weight: 20%)
- `customer_name`: Provided = +30 pts
- `package`: Selected = +30 pts
- `complexity`: Selected = +30 pts
- `known_risks`: At least 1 = +10 pts bonus (proactive identification)
- **Max: 100 points** (90 if no risks, 100 if risks identified)

### Section 2: Scope & Deliverables (Weight: 20%)
- `template_count`: Selected = +30 pts
- `workflow_complexity`: Selected = +30 pts
- `custom_development`: Selected = +20 pts
- `custom_development_details`: If "Yes" + details = +20 pts
- **Max: 100 points** (80 if no custom dev, 100 if "Yes" with details)

### Section 3: Migration Details (Weight: 20%)
- `csv_migration_required`: Selected = +33 pts
- `assisted_migration`: Selected = +33 pts
- `metadata_type`: Selected = +34 pts
- `migration_volume`: +0 pts (informational only)
- **Max: 100 points**

### Section 4: Integrations (Weight: 20%)
- `integration_types`: At least 1 = +40 pts (+5 per additional, max +40)
- `integration_engineering_effort`: Selected = +30 pts
- `integration_uat_rounds`: Selected = +30 pts
- `pre_known_blockers`: +0 pts (informational only)
- **Max: 100 points**

### Section 5: Timeline Expectations (Weight: 20%)
- `go_live_expectation`: Selected = +70 pts
- `known_blockers`: Provided (optional) = +30 pts bonus
- **Max: 100 points** (70 if blockers not provided, 100 if provided)

**Overall Formula:**
```
(Section1 × 0.20) + (Section2 × 0.20) + (Section3 × 0.20) + (Section4 × 0.20) + (Section5 × 0.20)
```

**Status Thresholds:**
- 80-100: "Plan Ready"
- 60-79: "Plan Ready with Notes"
- 40-59: "Incomplete Information"
- 0-39: "Significant Gaps"

---

## Key Differences

| Aspect | Prospect | Customer | Implementation Manager |
|--------|----------|----------|------------------------|
| **Sections** | 5 | 7 | 5 |
| **Highest Weight** | Scope Clarity (25%) | Purchased Scope (20%) | All equal (20% each) |
| **Focus** | Pre-purchase readiness | Implementation readiness | Plan generation readiness |
| **Unique Features** | Timeline concerns, preparation list | Uploads section, security focus | Known risks/blockers, custom dev details |
| **Calculation** | AI-powered (Gemini) | AI-powered (Gemini) | AI-powered (Gemini) + Rule-based plan |

---

## Notes

- All calculations are performed by **Gemini AI** based on structured prompts
- Missing/empty fields = 0 points for that component
- Bonus points are awarded for optional fields that provide additional context
- Section scores are capped at 100 points each
- Overall score is rounded to nearest integer
- Red flags, action items, and AI insights are generated alongside scores
