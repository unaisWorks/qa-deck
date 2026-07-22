// GENERATED — do not edit by hand.
// Source: QA-Deck-Prompt-Library.md (repo root)
// Regenerate: node scripts/generate-prompt-library.mjs (run from website/)
//
// Cards are included automatically once they have a **Category:** line in
// the source doc resolving to one of the 12 categories below. To add a new
// prompt: write it in the .md following the existing card shape, then
// regenerate — no changes needed here or in any component.

export type PromptCategory = "requirements-analysis" | "test-design" | "api-testing" | "database-testing" | "ui-testing" | "mobile-testing" | "security-testing" | "performance-testing" | "automation" | "execution" | "ai-qa" | "reporting";

export const PROMPT_CATEGORY_ORDER: readonly PromptCategory[] = ["requirements-analysis", "test-design", "api-testing", "database-testing", "ui-testing", "mobile-testing", "security-testing", "performance-testing", "automation", "execution", "ai-qa", "reporting"];

export const PROMPT_CATEGORY_LABELS: Record<PromptCategory, string> = {
  "requirements-analysis": "Requirements & Analysis",
  "test-design": "Test Design",
  "api-testing": "API Testing",
  "database-testing": "Database Testing",
  "ui-testing": "UI Testing",
  "mobile-testing": "Mobile Testing",
  "security-testing": "Security Testing",
  "performance-testing": "Performance Testing",
  "automation": "Automation",
  "execution": "Execution",
  "ai-qa": "AI QA",
  "reporting": "Reporting",
};

export type Difficulty = "Beginner" | "Intermediate" | "Advanced" | "Senior QA";

export type TestingType =
  | "AI" | "Manual" | "Automation" | "Backend" | "Frontend"
  | "API" | "Database" | "Security" | "Performance";

export type PromptVariableType =
  | "text" | "textarea" | "select" | "checkbox" | "radio"
  | "date" | "number" | "multiselect" | "tag";

export interface PromptVariable {
  /** Must exactly match a {{TOKEN}} substring in this card's `prompt`. */
  token: string;
  label: string;
  placeholder?: string;
  /** Defaults to "text" when omitted. */
  type?: PromptVariableType;
  required?: boolean;
  /** Only present (and only meaningful) for select/radio/multiselect. */
  options?: string[];
  multiline?: boolean;
}

export interface PromptCard {
  id: string;
  category: PromptCategory;
  /** Open-ended — new topics need zero code changes, only new .md content. */
  subcategory: string;
  title: string;
  description: string;
  whenToUse: string;
  inputsNeeded: string[];
  tags: string[];
  technologies: string[];
  testingType: TestingType[];
  difficulty: Difficulty;
  qualityScore: 1 | 2 | 3 | 4 | 5;
  estimatedTimeSaved: string;
  outputFormat: string;
  /** "YYYY-MM-DD" */
  lastUpdated: string;
  /** Curated allowlist of fillable {{TOKEN}}s — see prompt-template-engine.tsx for why this isn't auto-inferred from the prompt text. */
  variables: PromptVariable[];
  prompt: string;
  /** Optional hand-authored length variants. Absent on most cards — callers should fall back to `prompt`. */
  promptShort?: string;
  promptExpert?: string;
  warnings: string[];
  followUps: string[];
  /** Doc's own ⭐ — "highest-ROI in the library", not a per-PR scope flag. */
  featured: boolean;
}

export const PROMPT_CARDS: PromptCard[] = [
  {
    "id": "A1",
    "category": "requirements-analysis",
    "subcategory": "Ambiguity Analysis",
    "title": "Requirement Ambiguity Analysis",
    "description": "Before writing a single test case. Catches defects at the cheapest possible stage.",
    "whenToUse": "Before writing a single test case. Catches defects at the cheapest possible stage.",
    "inputsNeeded": [
      "Requirement doc / user story / PRD"
    ],
    "tags": [
      "Requirements",
      "Manual",
      "Planning",
      "Risk"
    ],
    "technologies": [],
    "testingType": [
      "Manual"
    ],
    "difficulty": "Intermediate",
    "qualityScore": 5,
    "estimatedTimeSaved": "15-20 min",
    "outputFormat": "Markdown table",
    "lastUpdated": "2026-07-22",
    "variables": [
      {
        "token": "REQUIREMENT_DOC",
        "label": "Requirement doc / user story / PRD"
      }
    ],
    "prompt": "Act as a senior QA analyst reviewing requirements before test design begins.\n\nAnalyse the requirement below and identify every gap that would block or mislead\ntest design. Classify each issue as:\n\n- AMBIGUOUS — open to more than one reasonable interpretation\n- INCOMPLETE — a rule is implied but never stated\n- CONTRADICTORY — conflicts with another statement in the document\n- UNTESTABLE — no observable pass/fail condition exists\n- MISSING NFR — no stated limit for performance, security, or accessibility\n\nOutput a table: ID | Section | Issue Type | What's unclear | Exact question to ask the BA\n\nRules:\n- Do NOT invent business rules to fill gaps. Flag them.\n- Do NOT manufacture issues for points that are already clear.\n- Rank by risk — issues that could cause a production defect first.\n- The \"question to ask\" must be answerable with a specific fact, not a discussion.\n\nREQUIREMENT:\n\"\"\"\n{{REQUIREMENT_DOC}}\n\"\"\"\n\nNow produce the ambiguity table, highest risk first.",
    "warnings": [
      "This is the highest-ROI card in the library. A requirement gap caught here costs minutes. The same gap caught in UAT costs days."
    ],
    "followUps": [
      "Which of these gaps, if left unresolved, is most likely to cause a production defect? Explain the failure scenario.",
      "Draft a single Slack message to the BA covering the top 5 questions, ordered so the most blocking one is first."
    ],
    "featured": false
  },
  {
    "id": "A2",
    "category": "requirements-analysis",
    "subcategory": "Test Planning",
    "title": "Test Plan",
    "description": "Start of a release or project, when a signed-off plan document is required.",
    "whenToUse": "Start of a release or project, when a signed-off plan document is required.",
    "inputsNeeded": [
      "Requirement doc",
      "your company's test plan template"
    ],
    "tags": [
      "Requirements",
      "Planning",
      "Documentation"
    ],
    "technologies": [],
    "testingType": [
      "Manual"
    ],
    "difficulty": "Intermediate",
    "qualityScore": 4,
    "estimatedTimeSaved": "30-45 min",
    "outputFormat": "Markdown",
    "lastUpdated": "2026-07-22",
    "variables": [
      {
        "token": "PROJECT_NAME",
        "label": "Project name"
      },
      {
        "token": "RELEASE",
        "label": "Release / sprint"
      },
      {
        "token": "TEAM_SIZE_AND_DURATION",
        "label": "Team size & timeline"
      },
      {
        "token": "YOUR_TEST_PLAN_TEMPLATE",
        "label": "Your test plan template"
      },
      {
        "token": "REQUIREMENT_DOC",
        "label": "Requirement doc"
      }
    ],
    "prompt": "Act as a test lead drafting a test plan for stakeholder sign-off.\n\nUse EXACTLY the template structure provided — same section names, same order.\nDo not add, remove, or rename sections.\n\nRules:\n- Fill each section only from the requirement. Where the requirement is silent,\n  write \"TBD — [the specific fact you need]\" rather than inventing content.\n- Be concrete: name actual modules, actual browsers, actual roles. Reject generic\n  filler like \"testing will be performed as required.\"\n- Every claim must be defensible in a sign-off meeting.\n- No section may be left empty.\n\nPROJECT: {{PROJECT_NAME}}\nRELEASE / SPRINT: {{RELEASE}}\nTEAM & TIMELINE: {{TEAM_SIZE_AND_DURATION}}\n\nTEMPLATE TO FOLLOW:\n\"\"\"\n{{YOUR_TEST_PLAN_TEMPLATE}}\n\"\"\"\n\nREQUIREMENT:\n\"\"\"\n{{REQUIREMENT_DOC}}\n\"\"\"\n\nNow produce the test plan following the template exactly, marking unknowns as TBD.",
    "warnings": [
      "The template field is the whole card. Without it you get a generic internet test plan — roughly 60% useful. With it, you get yours. Make this field prominent and encourage saving a default."
    ],
    "followUps": [
      "List every TBD you produced as a checklist of decisions I need to chase, with who likely owns each.",
      "Which sections are the weakest and why?"
    ],
    "featured": false
  },
  {
    "id": "A3",
    "category": "requirements-analysis",
    "subcategory": "Test Strategy",
    "title": "Test Strategy",
    "description": "Defining *how* your org tests — broader and longer-lived than a per-project plan.",
    "whenToUse": "Defining *how* your org tests — broader and longer-lived than a per-project plan.",
    "inputsNeeded": [
      "Product description, tech stack, team context"
    ],
    "tags": [
      "Requirements",
      "Planning",
      "Strategy"
    ],
    "technologies": [],
    "testingType": [
      "Manual"
    ],
    "difficulty": "Advanced",
    "qualityScore": 4,
    "estimatedTimeSaved": "30-45 min",
    "outputFormat": "Markdown",
    "lastUpdated": "2026-07-22",
    "variables": [],
    "prompt": "Act as a QA architect defining a test strategy.\n\nA test strategy describes the APPROACH, not the schedule. Do not include\nsprint dates, individual names, or per-story detail — that belongs in a test plan.\n\nCover:\n1. Testing objectives tied to actual business risk (not \"ensure quality\")\n2. Test levels — unit / integration / system / E2E — and who owns each\n3. Test types in scope, and explicitly what is OUT of scope\n4. Automation strategy: what gets automated, what stays manual, and the reasoning\n5. Environment and test data approach\n6. Entry / exit criteria per level\n7. Defect management workflow\n8. Risks to the strategy itself, with mitigations\n\nRules:\n- Every \"in scope\" decision needs a one-line justification.\n- Be explicit about trade-offs. A strategy with no trade-offs is a wish list.\n- Test pyramid ratios must be justified against this product, not quoted as dogma.\n- If the context below is insufficient for a section, say what you need.\n\nPRODUCT: {{PRODUCT_DESCRIPTION}}\nTECH STACK: {{STACK}}\nTEAM: {{TEAM_COMPOSITION}}\nCONSTRAINTS: {{TIMELINE_BUDGET_TOOLING}}\n\nNow produce the test strategy.",
    "warnings": [],
    "followUps": [
      "What's the most expensive assumption in this strategy, and what happens if it's wrong?"
    ],
    "featured": false
  },
  {
    "id": "A4",
    "category": "requirements-analysis",
    "subcategory": "Estimation",
    "title": "Test Estimation",
    "description": "Sprint planning, release planning, or when asked \"how long will testing take?\"",
    "whenToUse": "Sprint planning, release planning, or when asked \"how long will testing take?\"",
    "inputsNeeded": [
      "Scope list / backlog items"
    ],
    "tags": [
      "Planning",
      "Estimation"
    ],
    "technologies": [],
    "testingType": [
      "Manual"
    ],
    "difficulty": "Intermediate",
    "qualityScore": 4,
    "estimatedTimeSaved": "15-20 min",
    "outputFormat": "Markdown table",
    "lastUpdated": "2026-07-22",
    "variables": [],
    "prompt": "Act as a test lead producing an estimate for planning.\n\nBreak the scope below into work items. For each: Item | Complexity (S/M/L) |\nOptimistic (h) | Most Likely (h) | Pessimistic (h) | Expected (h) | Assumptions\n\nUse the 3-point formula: Expected = (O + 4×M + P) / 6\n\nRules:\n- Include effort people forget: environment setup, test data creation,\n  regression, defect retest cycles, reporting, meetings.\n- Every item needs at least one explicit assumption. An estimate without\n  assumptions is a guess wearing a suit.\n- Add a risk buffer line and justify the percentage with a named risk.\n- If an item is too vague to estimate, output \"CANNOT ESTIMATE — need [X]\"\n  rather than producing a number.\n- Do not pad silently. Padding goes in the buffer line where it's visible.\n\nSCOPE:\n{{SCOPE_ITEMS}}\nTEAM AVAILABLE: {{TEAM}}\nKNOWN CONSTRAINTS: {{CONSTRAINTS}}\n\nNow produce the estimate table, then a total with buffer.",
    "warnings": [
      "Treat the output as a starting point for negotiation, not a commitment. The assumptions column is the part you defend."
    ],
    "followUps": [],
    "featured": false
  },
  {
    "id": "A5",
    "category": "requirements-analysis",
    "subcategory": "Risk Assessment",
    "title": "Risk-Based Test Prioritization",
    "description": "When there isn't time to test everything — which is always.",
    "whenToUse": "When there isn't time to test everything — which is always.",
    "inputsNeeded": [
      "Feature list",
      "any known defect history"
    ],
    "tags": [
      "Risk",
      "Planning",
      "Prioritization"
    ],
    "technologies": [],
    "testingType": [
      "Manual"
    ],
    "difficulty": "Advanced",
    "qualityScore": 4,
    "estimatedTimeSaved": "20-30 min",
    "outputFormat": "Markdown table",
    "lastUpdated": "2026-07-22",
    "variables": [],
    "prompt": "Act as a QA lead applying risk-based testing.\n\nScore each feature below:\n- Business Impact if it fails (1-5) — revenue, legal, safety, reputation\n- Likelihood of failure (1-5) — code churn, complexity, defect history,\n  dependency count, team familiarity\n- Risk Score = Impact × Likelihood\n\nOutput: Feature | Impact | Impact reasoning | Likelihood | Likelihood reasoning |\nRisk Score | Recommended depth (Exhaustive / Standard / Smoke only / Not tested)\n\nThen, in a separate section titled \"Risk we are accepting\", state explicitly:\n- What you recommend NOT testing\n- The specific failure that could reach production because of that choice\n- What would have to be true for that to be an acceptable trade\n\nRules:\n- Do not score everything 4-5. Forcing prioritization is the point of this exercise.\n- Reasoning must reference something concrete from the input, not generic statements.\n\nFEATURES: {{FEATURE_LIST}}\nDEFECT HISTORY: {{PAST_DEFECTS_OR_NONE}}\nRECENT CHANGES: {{WHAT_CHANGED_THIS_RELEASE}}\nTIME AVAILABLE: {{TIME}}\n\nNow produce the risk table, highest score first.",
    "warnings": [
      "\"Risk we are accepting\" is the section that matters. Anyone can list what to test. Stating what you're deliberately not testing — and owning it — is the senior move."
    ],
    "followUps": [],
    "featured": false
  },
  {
    "id": "A6",
    "category": "requirements-analysis",
    "subcategory": "Traceability",
    "title": "Requirements Traceability Matrix",
    "description": "Audit, compliance, or proving coverage to stakeholders.",
    "whenToUse": "Audit, compliance, or proving coverage to stakeholders.",
    "inputsNeeded": [
      "Requirement IDs",
      "test case IDs"
    ],
    "tags": [
      "Requirements",
      "Traceability",
      "Coverage"
    ],
    "technologies": [],
    "testingType": [
      "Manual"
    ],
    "difficulty": "Intermediate",
    "qualityScore": 4,
    "estimatedTimeSaved": "15-20 min",
    "outputFormat": "Markdown table",
    "lastUpdated": "2026-07-22",
    "variables": [],
    "prompt": "Act as a QA analyst building a Requirements Traceability Matrix.\n\nMap every requirement to its covering test cases.\n\nOutput: Req ID | Requirement summary | Test Case IDs | Coverage\n(Full / Partial / NONE) | Gap note\n\nThen produce two summary sections:\n1. UNCOVERED REQUIREMENTS — requirements with no test case. This is the point\n   of the exercise; do not bury it.\n2. ORPHAN TESTS — test cases that map to no requirement. Either the requirement\n   is undocumented or the test is unnecessary. Flag which you suspect.\n\nRules:\n- Do not mark coverage as Full unless the test cases verify every clause of\n  the requirement, including negative behaviour.\n- If mapping is ambiguous, mark Partial and explain — never assume.\n\nREQUIREMENTS:\n{{REQUIREMENTS_LIST}}\nTEST CASES:\n{{TEST_CASE_LIST}}\n\nNow produce the RTM, then the uncovered and orphan sections.",
    "warnings": [],
    "followUps": [],
    "featured": false
  },
  {
    "id": "B1",
    "category": "test-design",
    "subcategory": "Test Scenarios",
    "title": "Test Scenarios",
    "description": "The layer between requirements and test cases. Get agreement here before writing 200 cases.",
    "whenToUse": "The layer between requirements and test cases. Get agreement here before writing 200 cases.",
    "inputsNeeded": [
      "Feature description"
    ],
    "tags": [
      "Test Design",
      "Manual",
      "Scenarios"
    ],
    "technologies": [],
    "testingType": [
      "Manual"
    ],
    "difficulty": "Beginner",
    "qualityScore": 4,
    "estimatedTimeSaved": "15-20 min",
    "outputFormat": "Markdown table",
    "lastUpdated": "2026-07-22",
    "variables": [],
    "prompt": "Act as a QA engineer identifying test scenarios.\n\nA scenario is WHAT to test, not HOW. One line each. No steps, no test data.\n\nGenerate scenarios for the feature below, grouped by:\n- Happy path\n- Alternate flows\n- Negative / error handling\n- Boundary conditions\n- Integration points (what this feature touches)\n- Non-functional angles worth checking\n\nRules:\n- One scenario per line, starting with a verb: \"Verify that...\", \"Validate...\".\n- No implementation detail. No locators, no exact data values.\n- Aim for coverage breadth, not depth — depth comes at the test case stage.\n- Flag any scenario you cannot confirm from the description with [ASSUMPTION].\n\nFEATURE: {{FEATURE_DESCRIPTION}}\nBUSINESS RULES: {{RULES}}\n\nNow produce the scenario list, grouped.",
    "warnings": [],
    "followUps": [
      "Which scenarios would a scripted regression suite typically miss? Add those.",
      "Rank these by risk and mark the minimum set for a smoke test."
    ],
    "featured": false
  },
  {
    "id": "B2",
    "category": "test-design",
    "subcategory": "Test Case Design",
    "title": "Test Case Generation",
    "description": "The core workflow. Turning a feature into executable cases.",
    "whenToUse": "The core workflow. Turning a feature into executable cases.",
    "inputsNeeded": [
      "Feature",
      "field-by-field detail (or a screenshot)"
    ],
    "tags": [
      "Test Design",
      "Manual",
      "Coverage"
    ],
    "technologies": [],
    "testingType": [
      "Manual"
    ],
    "difficulty": "Intermediate",
    "qualityScore": 5,
    "estimatedTimeSaved": "30-40 min",
    "outputFormat": "Markdown table",
    "lastUpdated": "2026-07-22",
    "variables": [
      {
        "token": "FEATURE_NAME",
        "label": "Feature name"
      },
      {
        "token": "FIELD_LIST",
        "label": "Field-by-field detail (name, type, validation, mandatory)"
      },
      {
        "token": "BUSINESS_RULES",
        "label": "Business rules"
      }
    ],
    "prompt": "Act as a QA engineer writing test cases for direct Jira bulk upload.\n\nGenerate test cases for the feature below.\n\nFORMAT — a markdown table with exactly these columns:\n{{YOUR_COLUMNS}}\n(default: Test Case ID | Module | Title | Precondition | Test Steps | Test Data |\nExpected Result | Priority | Type | Technique)\n\nCOVERAGE — apply these techniques and name the technique in the last column:\n- Equivalence partitioning: at least one valid and one invalid class per field\n- Boundary value analysis: min-1, min, min+1, max-1, max, max+1\n- Field-level validation for EVERY field listed below — none skipped\n- Negative and error handling\n- State transitions where applicable\n\nRules:\n- ONE assertion per test case. Never \"verify everything works correctly.\"\n- Test Steps: numbered, and executable by someone who has never seen this app.\n- Expected Result: observable. A specific message, state, value, or status code.\n  Never \"user should be able to...\" — that is not verifiable.\n- If a field's validation rule is not specified below, output\n  [NEEDS CLARIFICATION: what rule?] instead of assuming one.\n- Output ONLY the table. No prose before or after — this is being pasted directly.\n\nFEATURE: {{FEATURE_NAME}}\nFIELDS (name | type | validation | mandatory?):\n{{FIELD_LIST}}\nBUSINESS RULES:\n{{BUSINESS_RULES}}\n\nNow generate the test cases, grouped by module.",
    "promptShort": "Act as a QA engineer writing test cases.\n\nGenerate test cases for the feature below as a markdown table: Test Case ID | Title | Steps | Expected Result | Priority.\n\nCover the happy path, key validation rules, and obvious negative cases. One assertion per test case. Output only the table.\n\nFEATURE: {{FEATURE_NAME}}\nFIELDS: {{FIELD_LIST}}\nBUSINESS RULES: {{BUSINESS_RULES}}\n\nNow generate the test cases.",
    "promptExpert": "Act as a senior QA engineer producing an audit-ready test case suite for direct Jira bulk upload.\n\nGenerate test cases for the feature below.\n\nFORMAT — a markdown table with exactly these columns:\n{{YOUR_COLUMNS}}\n(default: Test Case ID | Module | Title | Precondition | Test Steps | Test Data |\nExpected Result | Priority | Type | Technique | Risk Justification)\n\nCOVERAGE — apply every technique below and name it in the Technique column; do not skip a technique because it feels redundant:\n- Equivalence partitioning: at least one valid and one invalid class per field\n- Boundary value analysis: min-1, min, min+1, max-1, max, max+1\n- Pairwise/combinatorial coverage for any two or more fields that interact (e.g. role × permission, date range pairs)\n- Field-level validation for EVERY field listed below — none skipped\n- Negative and error handling, including malformed/injection-class input (standard published detection strings only)\n- State transitions where applicable\n- Accessibility: keyboard-only completion of the flow, screen-reader label presence\n- Localization: Unicode input (Arabic RTL, CJK, emoji), locale-specific date/number formats\n\nRules:\n- ONE assertion per test case. Never \"verify everything works correctly.\"\n- Test Steps: numbered, and executable by someone who has never seen this app.\n- Expected Result: observable. A specific message, state, value, or status code.\n  Never \"user should be able to...\" — that is not verifiable.\n- Risk Justification: one line — why this case matters if it fails in production.\n- If a field's validation rule is not specified below, output\n  [NEEDS CLARIFICATION: what rule?] instead of assuming one.\n- Output ONLY the table. No prose before or after — this is being pasted directly.\n\nFEATURE: {{FEATURE_NAME}}\nFIELDS (name | type | validation | mandatory?):\n{{FIELD_LIST}}\nBUSINESS RULES:\n{{BUSINESS_RULES}}\n\nNow generate the test cases, grouped by module, highest risk first within each module.",
    "warnings": [
      "Field detail is what separates a usable output from a generic one. If the user has a screenshot, tell them to attach it — vision models read forms accurately. If not, the field list field is mandatory. Consider making the card refuse to submit without one."
    ],
    "followUps": [
      "What edge cases did you miss? Specifically consider: SQL injection, XSS, Unicode input (Arabic RTL, Chinese, emoji), leading/trailing whitespace, session timeout mid-flow, and rapid double-click submission.",
      "Group these into positive and negative sets and add a Priority column justified by risk.",
      "Which of these should be automated first and why? Which should stay manual?"
    ],
    "featured": true
  },
  {
    "id": "B3",
    "category": "test-design",
    "subcategory": "Boundary Value Analysis",
    "title": "Boundary Value & Equivalence Partitioning",
    "description": "Any numeric, date, or length-constrained field. Highest defect-per-test ratio of any technique.",
    "whenToUse": "Any numeric, date, or length-constrained field. Highest defect-per-test ratio of any technique.",
    "inputsNeeded": [
      "Field list with ranges"
    ],
    "tags": [
      "Test Design",
      "Boundary",
      "Equivalence"
    ],
    "technologies": [],
    "testingType": [
      "Manual"
    ],
    "difficulty": "Intermediate",
    "qualityScore": 4,
    "estimatedTimeSaved": "15-20 min",
    "outputFormat": "Markdown table",
    "lastUpdated": "2026-07-22",
    "variables": [],
    "prompt": "Act as a QA engineer applying formal test design techniques.\n\nFor each field below, produce:\n\nPART 1 — Equivalence Classes\nField | Valid classes | Invalid classes | One representative value per class\n\nPART 2 — Boundary Values\nField | min-1 | min | min+1 | max-1 | max | max+1 | Expected behaviour at each\n\nRules:\n- Include the boundaries most people forget: zero, negative, empty string, null,\n  the value exactly at the limit, and one unit past it.\n- For dates: leap day (29 Feb), month ends, DST transitions, year boundaries,\n  timezone edges.\n- For strings: 0 chars, 1 char, exactly max, max+1, and whitespace-only.\n- State expected behaviour for every boundary. \"Should error\" is not enough —\n  say WHICH error.\n- If a boundary is undefined in the spec, flag it. Undefined boundaries are\n  where production defects live.\n\nFIELDS:\n{{FIELDS_WITH_RANGES}}\n\nNow produce both parts.",
    "warnings": [],
    "followUps": [],
    "featured": false
  },
  {
    "id": "B4",
    "category": "test-design",
    "subcategory": "Decision Tables",
    "title": "Decision Table",
    "description": "Business logic with multiple interacting conditions (discounts, eligibility, pricing, permissions).",
    "whenToUse": "Business logic with multiple interacting conditions (discounts, eligibility, pricing, permissions).",
    "inputsNeeded": [
      "The rules"
    ],
    "tags": [
      "Test Design",
      "Decision Table"
    ],
    "technologies": [],
    "testingType": [
      "Manual"
    ],
    "difficulty": "Intermediate",
    "qualityScore": 4,
    "estimatedTimeSaved": "15-20 min",
    "outputFormat": "Markdown table",
    "lastUpdated": "2026-07-22",
    "variables": [],
    "prompt": "Act as a QA engineer building a decision table.\n\nConvert the business rules below into a decision table.\n\nStructure:\n- Rows: conditions (top) and actions (bottom)\n- Columns: each rule / combination\n- Cells: Y / N / — for conditions; X for triggered actions\n\nThen produce:\n1. The full table\n2. COLLAPSED table — merge columns where a condition is irrelevant (—)\n3. One test case per surviving column\n4. IMPOSSIBLE COMBINATIONS — combinations that cannot occur, and why\n5. UNDEFINED COMBINATIONS — combinations the rules don't cover ⚠️\n\nRules:\n- Section 5 is the reason to do this exercise. Do not skip it or hand-wave it.\n- Do not guess what an undefined combination should do. Flag it as a question.\n\nBUSINESS RULES:\n{{RULES}}\n\nNow produce all five sections.",
    "warnings": [
      "Undefined combinations are the classic source of \"nobody thought of that\" production bugs. This card exists to surface them."
    ],
    "followUps": [],
    "featured": false
  },
  {
    "id": "B5",
    "category": "test-design",
    "subcategory": "State Transition Testing",
    "title": "State Transition Testing",
    "description": "Anything with a lifecycle — orders, tickets, sessions, approvals, subscriptions.",
    "whenToUse": "Anything with a lifecycle — orders, tickets, sessions, approvals, subscriptions.",
    "inputsNeeded": [
      "States",
      "allowed transitions"
    ],
    "tags": [
      "Test Design",
      "State Transition"
    ],
    "technologies": [],
    "testingType": [
      "Manual"
    ],
    "difficulty": "Intermediate",
    "qualityScore": 4,
    "estimatedTimeSaved": "15-20 min",
    "outputFormat": "Markdown table",
    "lastUpdated": "2026-07-22",
    "variables": [],
    "prompt": "Act as a QA engineer designing state transition tests.\n\nFor the system below, produce:\n\n1. STATE TABLE — Current State | Event | Next State | Guard condition\n2. VALID TRANSITION TESTS — one per legal transition\n3. INVALID TRANSITION TESTS — attempt every ILLEGAL transition and define the\n   expected rejection. This is where real defects hide.\n4. UNREACHABLE STATES — states with no path in\n5. DEAD-END STATES — states with no path out (flag whether intentional)\n6. Suggested coverage level (0-switch / 1-switch) and why\n\nRules:\n- Section 3 must be exhaustive. For N states, systematically consider all N×N\n  transitions and mark each legal or illegal.\n- For each illegal transition, define the specific expected behaviour —\n  error message, silent ignore, or exception. \"Should not work\" is not testable.\n- Flag any transition the spec doesn't define.\n\nSTATES: {{STATES}}\nEVENTS: {{EVENTS}}\nDEFINED TRANSITIONS: {{TRANSITIONS}}\n\nNow produce all six sections.",
    "warnings": [],
    "followUps": [],
    "featured": false
  },
  {
    "id": "B6",
    "category": "test-design",
    "subcategory": "Combinatorial Testing",
    "title": "Pairwise / Combinatorial",
    "description": "Config explosion — browsers × OS × roles × payment methods × locales.",
    "whenToUse": "Config explosion — browsers × OS × roles × payment methods × locales.",
    "inputsNeeded": [
      "Parameters",
      "their values"
    ],
    "tags": [
      "Test Design",
      "Pairwise",
      "Combinatorial"
    ],
    "technologies": [],
    "testingType": [
      "Manual"
    ],
    "difficulty": "Advanced",
    "qualityScore": 4,
    "estimatedTimeSaved": "15-20 min",
    "outputFormat": "Markdown table",
    "lastUpdated": "2026-07-22",
    "variables": [],
    "prompt": "Act as a QA engineer applying combinatorial test design.\n\nParameters and values:\n{{PARAMETERS_AND_VALUES}}\n\nProduce:\n1. Total exhaustive combination count (show the multiplication)\n2. A pairwise (2-wise) covering set — every pair of values from every pair of\n   parameters appears at least once\n3. The reduction achieved (exhaustive → pairwise, as a percentage)\n4. CONSTRAINTS — combinations that are invalid or impossible, excluded and why\n5. FORCED COMBINATIONS — high-risk combos that must be tested regardless of\n   whether pairwise selected them (production traffic, known-fragile pairings)\n\nRules:\n- Verify your covering set actually achieves pairwise coverage. State how you\n  checked.\n- Pairwise catches interaction defects between two parameters. It does NOT catch\n  3-way interactions. State this limitation explicitly and name any 3-way\n  combination that warrants a forced test.\n\nNow produce all five sections.",
    "warnings": [
      "Verify the covering set before trusting it. Generating a correct pairwise array is a combinatorial algorithm, and models make silent arithmetic errors here. For anything critical, cross-check with a dedicated tool (PICT, AllPairs). This card is for a fast draft, not a proof."
    ],
    "followUps": [],
    "featured": false
  },
  {
    "id": "B7",
    "category": "test-design",
    "subcategory": "Test Data Generation",
    "title": "Test Data Generation",
    "description": "You need realistic, adversarial data for a form or API.",
    "whenToUse": "You need realistic, adversarial data for a form or API.",
    "inputsNeeded": [
      "Field list with types"
    ],
    "tags": [
      "Test Design",
      "Data",
      "Boundary",
      "Security"
    ],
    "technologies": [],
    "testingType": [
      "Manual"
    ],
    "difficulty": "Intermediate",
    "qualityScore": 4,
    "estimatedTimeSaved": "15-20 min",
    "outputFormat": "Markdown table",
    "lastUpdated": "2026-07-22",
    "variables": [
      {
        "token": "FIELD_LIST",
        "label": "Field list with types and constraints"
      }
    ],
    "prompt": "Act as a QA engineer preparing test data.\n\nGenerate test data for the fields below covering every category:\n\n- Valid / happy path\n- Boundary: min, max, min-1, max+1, empty, null\n- Type violations: text in numeric, numeric in date, etc.\n- Format violations: malformed email, phone, postcode\n- Whitespace: leading, trailing, only-spaces, tabs, newlines\n- Length: 1 char, exactly at limit, limit+1, 10,000 chars\n- Unicode: Arabic (RTL), Chinese (CJK), emoji, accented Latin, combining chars\n- Injection detection strings: standard published SQLi and XSS test strings\n- Special characters: quotes, backslashes, angle brackets, null bytes\n\nOutput: Field | Value | Category | Expected Behaviour | Priority\n\nRules:\n- Synthetic data only. Never generate anything resembling real PII, real card\n  numbers (use standard test card numbers), or real emails at real domains.\n- Use only well-known published detection strings for injection categories —\n  the goal is to verify input handling, not to build an exploit.\n- Expected behaviour must be specific: which error, which field, which message.\n\nFIELDS (name | type | constraints):\n{{FIELD_LIST}}\n\nNow produce the test data table, grouped by field.",
    "warnings": [
      "Use domains like example.com and standard test card numbers. Never paste real customer data into any AI tool."
    ],
    "followUps": [],
    "featured": false
  },
  {
    "id": "B8",
    "category": "test-design",
    "subcategory": "BDD/Gherkin",
    "title": "BDD / Gherkin from User Story",
    "description": "Converting a story + AC into feature files.",
    "whenToUse": "Converting a story + AC into feature files.",
    "inputsNeeded": [
      "User story",
      "acceptance criteria"
    ],
    "tags": [
      "Test Design",
      "BDD",
      "Gherkin"
    ],
    "technologies": [
      "Cucumber",
      "Gherkin"
    ],
    "testingType": [
      "Manual",
      "Automation"
    ],
    "difficulty": "Intermediate",
    "qualityScore": 5,
    "estimatedTimeSaved": "20-30 min",
    "outputFormat": "Gherkin",
    "lastUpdated": "2026-07-22",
    "variables": [
      {
        "token": "USER_STORY",
        "label": "User story"
      },
      {
        "token": "ACCEPTANCE_CRITERIA",
        "label": "Acceptance criteria"
      }
    ],
    "prompt": "Act as a BDD practitioner writing feature files.\n\nConvert the user story below into Gherkin.\n\nRules — these are the ones that matter:\n- DECLARATIVE, not imperative. Write \"When the user submits invalid credentials\",\n  NOT \"When the user clicks #username and types 'x' and clicks #submit\".\n  UI mechanics belong in step definitions, never in the feature file.\n- One behaviour per scenario. If a scenario has two Thens testing two different\n  things, split it.\n- Use Scenario Outline + Examples when the same behaviour repeats with different\n  data. Do not copy-paste near-identical scenarios.\n- Background only for genuinely shared preconditions — not as a dumping ground.\n- Every Then is a single observable outcome.\n- No technical detail: no locators, no endpoints, no SQL, no status codes unless\n  the story is explicitly about an API contract.\n- The feature file should be readable by a product owner who has never seen code.\n- If an acceptance criterion is untestable as written, flag it rather than\n  inventing a testable version.\n\nUSER STORY:\n{{USER_STORY}}\nACCEPTANCE CRITERIA:\n{{ACCEPTANCE_CRITERIA}}\n\nNow produce the feature file.",
    "warnings": [
      "Imperative Gherkin is the most common BDD failure. The declarative rule above is doing most of the work in this prompt — don't trim it."
    ],
    "followUps": [
      "Generate the step definitions in {{LANGUAGE}} using {{FRAMEWORK}}, keeping all UI detail here rather than in the feature file."
    ],
    "featured": false
  },
  {
    "id": "C1",
    "category": "execution",
    "subcategory": "Exploratory Testing",
    "title": "Exploratory Testing Charters",
    "description": "Time-boxed discovery. Finds what scripted tests structurally cannot.",
    "whenToUse": "Time-boxed discovery. Finds what scripted tests structurally cannot.",
    "inputsNeeded": [
      "The area to explore"
    ],
    "tags": [
      "Exploratory",
      "Manual",
      "Charter"
    ],
    "technologies": [],
    "testingType": [
      "Manual"
    ],
    "difficulty": "Intermediate",
    "qualityScore": 4,
    "estimatedTimeSaved": "15-20 min",
    "outputFormat": "Markdown",
    "lastUpdated": "2026-07-22",
    "variables": [],
    "prompt": "Act as an exploratory testing coach using session-based test management.\n\nDesign {{N}} exploratory charters for the area below.\n\nFormat each as:\nEXPLORE (target) WITH (resources) TO DISCOVER (information)\n\nThen for each: Timebox (mins) | Test ideas to try | Oracles (how you'll know\nit's wrong) | Risk being investigated\n\nRules:\n- Charters are about DISCOVERY, not confirmation. If it can be written as a\n  scripted test case, it is not a charter — rewrite it.\n- Name the oracle explicitly for each. \"It looks wrong\" is not an oracle.\n  Valid oracles: a spec, a comparable product, consistency with itself,\n  user expectation, a standard.\n- Include at least two charters targeting what a scripted suite structurally\n  misses: interruptions, concurrency, stale state, back-button, session expiry,\n  network drop mid-transaction, rapid repeated actions.\n- Vary the lens: some charters should be data-focused, some flow-focused,\n  some stress-focused.\n\nAREA: {{AREA_OR_FEATURE}}\nKNOWN RISKS: {{RISKS_OR_UNKNOWN}}\nTIME AVAILABLE: {{TIME}}\n\nNow produce the charters.",
    "warnings": [
      "Underused technique. Exploratory testing finds the defects scripted suites are blind to by design — because a scripted suite can only check what someone already thought of."
    ],
    "followUps": [],
    "featured": false
  },
  {
    "id": "C2",
    "category": "execution",
    "subcategory": "Defect Reporting",
    "title": "Bug Report",
    "description": "Turning rough observation into something a dev can act on with zero follow-up questions.",
    "whenToUse": "Turning rough observation into something a dev can act on with zero follow-up questions.",
    "inputsNeeded": [
      "Your raw notes"
    ],
    "tags": [
      "Defects",
      "Reporting",
      "Manual"
    ],
    "technologies": [],
    "testingType": [
      "Manual"
    ],
    "difficulty": "Beginner",
    "qualityScore": 5,
    "estimatedTimeSaved": "10-15 min",
    "outputFormat": "Markdown",
    "lastUpdated": "2026-07-22",
    "variables": [
      {
        "token": "YOUR_NOTES",
        "label": "Your raw notes"
      }
    ],
    "prompt": "Act as a QA engineer filing a defect.\n\nTurn the raw notes below into a bug report a developer can act on without asking\na single follow-up question.\n\nOutput:\n**Summary:** one line — what's broken, where, under what condition.\n  Never \"doesn't work\" or \"issue with X\".\n**Environment:** build, OS, browser/device, environment\n**Preconditions:**\n**Steps to Reproduce:** numbered and MINIMAL\n**Expected Result:**\n**Actual Result:**\n**Frequency:** always / intermittent (X of Y attempts)\n**Severity + justification:**\n**Attachments to capture:**\n**Missing info I need to add:**\n\nRules:\n- Steps must be MINIMAL. Strip every step that isn't required to trigger the bug.\n  A 12-step repro that could be 4 steps wastes developer time.\n- Separate OBSERVATION from INTERPRETATION. Report what was seen. Any theory\n  about the cause goes under a clearly labelled \"Possible cause (unverified)\"\n  and nowhere else.\n- If a detail needed for reproduction is missing from my notes, list it under\n  \"Missing info I need to add\" — do NOT invent it.\n- Expected Result must cite the source: the requirement, the spec, or the\n  reasonable-user standard. State which.\n\nRAW NOTES:\n{{YOUR_NOTES}}\n\nNow produce the bug report.",
    "warnings": [
      "The observation/interpretation split is what makes a report credible. A report that asserts a wrong cause gets dismissed along with the actual bug."
    ],
    "followUps": [
      "Reduce the reproduction steps to the absolute minimum. Which steps can be removed and still trigger it?",
      "Write the {{JIRA/Azure/Linear}} formatted version ready to paste."
    ],
    "featured": false
  },
  {
    "id": "C3",
    "category": "execution",
    "subcategory": "Defect Triage",
    "title": "Bug Triage — Severity vs Priority",
    "description": "Grooming a defect backlog, or defending a severity call.",
    "whenToUse": "Grooming a defect backlog, or defending a severity call.",
    "inputsNeeded": [
      "Bug list"
    ],
    "tags": [
      "Defects",
      "Triage",
      "Severity",
      "Priority"
    ],
    "technologies": [],
    "testingType": [
      "Manual"
    ],
    "difficulty": "Intermediate",
    "qualityScore": 4,
    "estimatedTimeSaved": "10-15 min",
    "outputFormat": "Markdown table",
    "lastUpdated": "2026-07-22",
    "variables": [],
    "prompt": "Act as a QA lead triaging defects.\n\nSeverity and Priority are independent. Do not conflate them.\n- SEVERITY = technical impact if it occurs (Critical / High / Medium / Low)\n- PRIORITY = business urgency to fix (P1 / P2 / P3 / P4)\n\nFor each defect: ID | Summary | Severity + why | Priority + why | Recommended\naction (Fix now / Fix this release / Backlog / Won't fix + rationale)\n\nThen produce a section on ANY defect where severity and priority diverge\nsharply — a High-severity/P4 or a Low-severity/P1. These are the ones that get\nargued about; pre-arm the justification.\n\nRules:\n- Do not mark everything Critical/P1. If everything is urgent, nothing is.\n- Priority reasoning must reference business impact: users affected, revenue,\n  workaround availability, reputational or legal exposure.\n- For any \"Won't fix\", state the risk being accepted in plain language.\n\nDEFECTS:\n{{DEFECT_LIST}}\nRELEASE CONTEXT: {{TIMELINE_AND_CONSTRAINTS}}\n\nNow produce the triage table, then the divergence section.",
    "warnings": [],
    "followUps": [],
    "featured": false
  },
  {
    "id": "C4",
    "category": "execution",
    "subcategory": "Root Cause Analysis",
    "title": "Root Cause Analysis — Five Whys",
    "description": "A defect with a likely single causal chain. Fast RCA for a ticket.",
    "whenToUse": "A defect with a likely single causal chain. Fast RCA for a ticket.",
    "inputsNeeded": [
      "The problem statement"
    ],
    "tags": [
      "RCA",
      "Defects",
      "Five Whys"
    ],
    "technologies": [],
    "testingType": [
      "Manual"
    ],
    "difficulty": "Intermediate",
    "qualityScore": 4,
    "estimatedTimeSaved": "15-20 min",
    "outputFormat": "Markdown",
    "lastUpdated": "2026-07-22",
    "variables": [
      {
        "token": "PROBLEM_STATEMENT",
        "label": "Problem statement"
      },
      {
        "token": "EVIDENCE",
        "label": "What we know"
      }
    ],
    "prompt": "Act as a Root Cause Analyst.\n\nProblem: {{PROBLEM_STATEMENT}}\nWhat we know: {{EVIDENCE}}\n\nAsk \"why\" this problem exists. Then repeat \"why\" against your own answer four\nmore times, digging one layer deeper each time.\n\nRules:\n- Stop descending when you reach something ACTIONABLE — a process, a decision,\n  or a missing control. \"Human error\" and \"someone forgot\" are not root causes;\n  they are the point at which you have stopped thinking.\n- Each Why must follow logically from the previous answer. Do not jump layers.\n- If a link in the chain is a guess rather than something the evidence supports,\n  label it [ASSUMPTION — needs verification].\n- The final Why should reveal a SYSTEMIC gap, not an individual's mistake.\n\nThen produce:\n- ROOT CAUSE (one sentence)\n- IMMEDIATE FIX (stops the bleeding now)\n- SYSTEMIC FIX (prevents this entire class of defect recurring)\n- HOW WE'D KNOW IT WORKED (the signal that confirms the fix)",
    "warnings": [
      "If your chain terminates at \"the tester missed it\", you stopped one Why too early. Keep going until you find the process that made the miss likely."
    ],
    "followUps": [],
    "featured": false
  },
  {
    "id": "C5",
    "category": "execution",
    "subcategory": "Root Cause Analysis",
    "title": "Root Cause Analysis — Fishbone (Ishikawa)",
    "description": "Cause unknown, or multiple factors likely converged. Team retro after an incident.",
    "whenToUse": "Cause unknown, or multiple factors likely converged. Team retro after an incident.",
    "inputsNeeded": [
      "The problem statement"
    ],
    "tags": [
      "RCA",
      "Defects",
      "Fishbone"
    ],
    "technologies": [],
    "testingType": [
      "Manual"
    ],
    "difficulty": "Advanced",
    "qualityScore": 4,
    "estimatedTimeSaved": "15-20 min",
    "outputFormat": "Markdown",
    "lastUpdated": "2026-07-22",
    "variables": [],
    "prompt": "Act as a Quality Improvement Specialist.\n\nBuild an Ishikawa (fishbone) analysis for: {{PROBLEM_STATEMENT}}\n\nExplore causes across EXACTLY these four categories — do not substitute your own:\n- PEOPLE — skills, awareness, communication, handoffs\n- PROCESS — workflow gaps, missing checks, unclear ownership\n- TECHNOLOGY — code, architecture, tooling, test infrastructure\n- ENVIRONMENT — test data, staging fidelity, timing, external dependencies\n\nFor each category: list 2-4 contributing causes, then break each into sub-causes.\n\nThen produce:\n1. The full breakdown by category\n2. RANKING — which single category most likely dominates, and why\n3. THE ISOLATION TEST — for the top branch, what evidence would confirm or\n   rule it out?\n4. Preventive measure per category\n\nRules:\n- These branches are meant to be INDEPENDENT contributors, not a chain. If your\n  branches all depend on each other, use Five Whys instead and say so.\n- Do not force content into a category. If Environment genuinely contributed\n  nothing, say so — an empty branch is a finding.\n\nCONTEXT: {{WHAT_HAPPENED}}",
    "warnings": [
      "Naming the four categories explicitly is deliberate. Left open, the model invents its own categories and results stop being comparable between analyses."
    ],
    "followUps": [],
    "featured": false
  },
  {
    "id": "C6",
    "category": "execution",
    "subcategory": "Defect Metrics",
    "title": "Defect Leakage / Escape Analysis",
    "description": "After any defect reaches production. Answers \"why didn't we catch this?\"",
    "whenToUse": "After any defect reaches production. Answers \"why didn't we catch this?\"",
    "inputsNeeded": [
      "The escaped defect",
      "your test coverage for that area"
    ],
    "tags": [
      "Defects",
      "Metrics",
      "Escape Analysis"
    ],
    "technologies": [],
    "testingType": [
      "Manual"
    ],
    "difficulty": "Advanced",
    "qualityScore": 4,
    "estimatedTimeSaved": "15-20 min",
    "outputFormat": "Markdown",
    "lastUpdated": "2026-07-22",
    "variables": [],
    "prompt": "Act as a QA manager conducting escape analysis.\n\nA defect reached production. Determine why our process failed to catch it.\n\nAnalyse:\n1. WHERE it should have been caught — unit / integration / system / UAT.\n   Name the specific phase.\n2. WHY that phase missed it. Classify as:\n   - Test case never existed (design gap)\n   - Test case existed but was wrong\n   - Test case existed but wasn't run\n   - Test case ran but the environment couldn't reproduce the condition\n   - Requirement gap — nobody knew it should behave differently\n3. WHY the gap existed — the process reason behind the reason\n4. WHAT WOULD HAVE CAUGHT IT — the specific test, check, or gate\n5. WHAT ELSE IS AT RISK — what other features share this same blind spot?\n\nRules:\n- This is a process analysis, NOT a performance review. Do not attribute the\n  escape to an individual. If your answer names a person, rewrite it as a\n  system gap.\n- Section 5 is the real deliverable. One escaped defect usually means a\n  category of undetectable defects. Find the category.\n- If the escape was an accepted risk rather than a miss, say so — those are\n  different problems with different fixes.\n\nDEFECT: {{DEFECT_DETAILS}}\nOUR COVERAGE FOR THIS AREA: {{EXISTING_TESTS}}\nWHEN/HOW IT WAS FOUND: {{DISCOVERY}}",
    "warnings": [
      "Section 5 is why this card exists. One escape usually reveals a class of blind spots, not a one-off."
    ],
    "followUps": [],
    "featured": false
  },
  {
    "id": "D1",
    "category": "automation",
    "subcategory": "Framework Setup",
    "title": "Framework Scaffolding",
    "description": "Setting up a new automation project from zero.",
    "whenToUse": "Setting up a new automation project from zero.",
    "inputsNeeded": [
      "Language, tools, target"
    ],
    "tags": [
      "Automation",
      "Framework",
      "Setup"
    ],
    "technologies": [
      "Selenium",
      "Playwright",
      "pytest",
      "TestNG",
      "JUnit"
    ],
    "testingType": [
      "Automation"
    ],
    "difficulty": "Intermediate",
    "qualityScore": 4,
    "estimatedTimeSaved": "45-60 min",
    "outputFormat": "Markdown / code",
    "lastUpdated": "2026-07-22",
    "variables": [
      {
        "token": "Java / Python / JS / C#",
        "label": "Language",
        "type": "select",
        "options": [
          "Java",
          "Python",
          "JS",
          "C#"
        ]
      },
      {
        "token": "Maven / Gradle / pip / npm",
        "label": "Build tool",
        "type": "select",
        "options": [
          "Maven",
          "Gradle",
          "pip",
          "npm"
        ]
      },
      {
        "token": "TestNG / JUnit / pytest / Playwright Test",
        "label": "Test framework",
        "type": "select",
        "options": [
          "TestNG",
          "JUnit",
          "pytest",
          "Playwright Test"
        ]
      },
      {
        "token": "Selenium / Playwright / Rest Assured / requests",
        "label": "Automation library",
        "type": "select",
        "options": [
          "Selenium",
          "Playwright",
          "Rest Assured",
          "requests"
        ]
      },
      {
        "token": "Allure / ExtentReports / built-in",
        "label": "Reporting",
        "type": "select",
        "options": [
          "Allure",
          "ExtentReports",
          "built-in"
        ]
      },
      {
        "token": "IntelliJ / VS Code / PyCharm",
        "label": "IDE",
        "type": "select",
        "options": [
          "IntelliJ",
          "VS Code",
          "PyCharm"
        ]
      }
    ],
    "prompt": "Act as an SDET setting up a new automation framework.\n\nGive me step-by-step instructions to create:\nLANGUAGE: {{Java / Python / JS / C#}}\nBUILD TOOL: {{Maven / Gradle / pip / npm}}\nTEST FRAMEWORK: {{TestNG / JUnit / pytest / Playwright Test}}\nAUTOMATION: {{Selenium / Playwright / Rest Assured / requests}}\nREPORTING: {{Allure / ExtentReports / built-in}}\nIDE: {{IntelliJ / VS Code / PyCharm}}\n\nInclude: project creation, dependency file, folder structure, one working\nsmoke test proving the setup works, and how to run it.\n\nCRITICAL RULES:\n- For EVERY dependency, output the version as {{VERIFY_VERSION}} rather than a\n  number, and add a note telling me where to check the current release.\n  Do NOT supply version numbers from memory.\n- Folder structure must separate: config, page objects/API clients, utilities,\n  test data, tests, reports.\n- The smoke test must be genuinely runnable, not pseudo-code.\n- If a step depends on my environment (Java version, PATH, drivers), say so\n  explicitly rather than assuming.",
    "warnings": [
      "THE VERSION TRAP — this is the #1 documented failure in AI-assisted setup. Models supply dependency versions from training data, which is always stale. Real observed example: an AI confidently supplied TestNG 4.1 when the actual current release was 7.9 — the build broke, and the error message pointed nowhere near the real cause. Always check Maven Central / PyPI / npm yourself. Consider having QA Deck link these directly on this card."
    ],
    "followUps": [
      "I'm getting this error: {{ERROR}}. What's the cause and fix?",
      "Add a CI config for {{Jenkins/GitHub Actions/GitLab}} that runs this on every PR."
    ],
    "featured": false
  },
  {
    "id": "D2",
    "category": "automation",
    "subcategory": "Page Object Model",
    "title": "Page Object Model",
    "description": "Structuring UI automation so it survives contact with a changing app.",
    "whenToUse": "Structuring UI automation so it survives contact with a changing app.",
    "inputsNeeded": [
      "Page description or screenshot, and your existing POM if you have one"
    ],
    "tags": [
      "Automation",
      "POM",
      "Selenium",
      "Playwright"
    ],
    "technologies": [
      "Selenium",
      "Playwright"
    ],
    "testingType": [
      "Automation"
    ],
    "difficulty": "Intermediate",
    "qualityScore": 4,
    "estimatedTimeSaved": "20-30 min",
    "outputFormat": "Code",
    "lastUpdated": "2026-07-22",
    "variables": [],
    "prompt": "Act as an SDET writing a Page Object.\n\nCreate a page object for the page described below in {{LANGUAGE}} using\n{{FRAMEWORK}}.\n\n{{IF_YOU_HAVE_ONE}} Match this existing page object's structure and conventions\nexactly:\n\"\"\"\n{{EXISTING_POM_EXAMPLE}}\n\"\"\"\n\nRules:\n- Page objects expose BEHAVIOUR, not elements. Method names describe user\n  intent: loginAs(user, pass), not clickSubmitButton().\n- NO assertions inside the page object. Assertions live in tests.\n- Methods that navigate away return the next page object.\n- Locators: private, and ordered by preference — test id > accessible role/label\n  > stable attribute > CSS. Never index-based or absolute XPath.\n  If I haven't given you a stable locator, flag it as\n  [NEEDS TEST ID] rather than inventing a fragile one.\n- No hard waits. Use explicit waits on the actual condition — visible, clickable,\n  or stable — never on mere presence.\n- No test data hardcoded in the page object.\n\nPAGE: {{PAGE_DESCRIPTION_OR_ATTACH_SCREENSHOT}}\nELEMENTS: {{ELEMENT_LIST_WITH_LOCATORS}}",
    "warnings": [
      "Attaching your existing page object is what makes the output match your codebase instead of a tutorial."
    ],
    "followUps": [],
    "featured": false
  },
  {
    "id": "D3",
    "category": "automation",
    "subcategory": "UI Automation",
    "title": "UI Test Script",
    "description": "Writing an automated UI test from a manual test case.",
    "whenToUse": "Writing an automated UI test from a manual test case.",
    "inputsNeeded": [
      "The test case",
      "your framework conventions"
    ],
    "tags": [
      "Automation",
      "UI",
      "Script"
    ],
    "technologies": [
      "Selenium",
      "Playwright",
      "Cypress"
    ],
    "testingType": [
      "Automation",
      "Frontend"
    ],
    "difficulty": "Intermediate",
    "qualityScore": 4,
    "estimatedTimeSaved": "20-30 min",
    "outputFormat": "Code",
    "lastUpdated": "2026-07-22",
    "variables": [],
    "prompt": "Act as an SDET automating a UI test.\n\nConvert the manual test case below into an automated test in {{LANGUAGE}}\nusing {{FRAMEWORK}}.\n\n{{IF_YOU_HAVE_ONE}} Follow this existing test's conventions exactly:\n\"\"\"\n{{EXISTING_TEST_EXAMPLE}}\n\"\"\"\n\nRules:\n- Use the page object pattern. No raw locators in the test body.\n- NO hard sleeps. Explicit waits on the real condition only.\n- One logical assertion per test. Use soft assertions only where multiple\n  independent checks genuinely belong in one test.\n- Assertion messages must say what was expected and what was found.\n- Test must be independent: creates its own data, cleans up after itself,\n  and passes when run in isolation OR in parallel OR in any order.\n- No dependency on another test having run first.\n- If the manual test case is ambiguous about the expected result, flag it\n  rather than choosing an interpretation.\n\nMANUAL TEST CASE:\n{{TEST_CASE}}",
    "warnings": [],
    "followUps": [],
    "featured": false
  },
  {
    "id": "D4",
    "category": "automation",
    "subcategory": "API Automation",
    "title": "API Automation Script",
    "description": "Automating an API test.",
    "whenToUse": "Automating an API test.",
    "inputsNeeded": [
      "Endpoint details",
      "sample response"
    ],
    "tags": [
      "Automation",
      "API",
      "Script"
    ],
    "technologies": [
      "REST Assured",
      "requests",
      "Playwright"
    ],
    "testingType": [
      "Automation",
      "API",
      "Backend"
    ],
    "difficulty": "Intermediate",
    "qualityScore": 4,
    "estimatedTimeSaved": "20-30 min",
    "outputFormat": "Code",
    "lastUpdated": "2026-07-22",
    "variables": [],
    "prompt": "Act as an SDET automating an API test.\n\nCreate an API test in {{LANGUAGE}} using {{Rest Assured / requests / supertest}}.\n\nENDPOINT: {{METHOD}} {{URL}}\nHEADERS: {{HEADERS}}\nREQUEST BODY: {{BODY_OR_NA}}\nEXPECTED RESPONSE:\n\"\"\"\n{{SAMPLE_RESPONSE}}\n\"\"\"\n\nProduce:\n1. Positive test — status code, schema, and business-critical field values\n2. 4-5 negative tests — invalid auth, malformed body, missing required field,\n   non-existent resource, wrong content type\n3. JSON schema validation against the response structure\n4. The test runner config file\n\nRules:\n- Assert on SCHEMA plus specific field values, not just status code.\n  A 200 with a wrong body is still a bug.\n- No hardcoded environment URLs — externalise to config.\n- No credentials in code — read from env vars, and say which.\n- Each negative test asserts the specific error code AND error message.\n- For dependency versions, output {{VERIFY_VERSION}} — do not supply from memory.",
    "warnings": [
      "Never paste real API keys, tokens, or production endpoints into this field."
    ],
    "followUps": [],
    "featured": false
  },
  {
    "id": "D5",
    "category": "automation",
    "subcategory": "Locator Strategy",
    "title": "Locator Strategy Review",
    "description": "Your suite breaks every time the UI changes.",
    "whenToUse": "Your suite breaks every time the UI changes.",
    "inputsNeeded": [
      "Your locators"
    ],
    "tags": [
      "Automation",
      "Locators",
      "Review"
    ],
    "technologies": [
      "Selenium",
      "Playwright"
    ],
    "testingType": [
      "Automation"
    ],
    "difficulty": "Advanced",
    "qualityScore": 4,
    "estimatedTimeSaved": "15-20 min",
    "outputFormat": "Markdown table",
    "lastUpdated": "2026-07-22",
    "variables": [],
    "prompt": "Act as an SDET reviewing locator robustness.\n\nFor each locator below, assess its fragility and propose a better one.\n\nOutput: Current locator | Fragility (High/Med/Low) | Why it will break |\nRecommended locator | Requires a dev change? (Y/N)\n\nPreference order — state which tier each locator sits in:\n1. Dedicated test id (data-testid) — best\n2. Accessible role + name — good, and doubles as an a11y check\n3. Stable semantic attribute (name, aria-label)\n4. Text content — acceptable if not localised\n5. Scoped CSS — last resort\n6. XPath by position/index, auto-generated classes — never\n\nRules:\n- Flag every locator that depends on: element position, sibling order,\n  auto-generated class names, or styling.\n- Where the fix needs a dev to add a test id, say so — that's a real ask\n  with a real payoff, and worth raising.\n- Do not recommend a locator you cannot verify exists from what I've given you.\n\nLOCATORS:\n{{LOCATOR_LIST}}\nDOM SNIPPET (if available):\n{{DOM}}",
    "warnings": [],
    "followUps": [],
    "featured": false
  },
  {
    "id": "D6",
    "category": "automation",
    "subcategory": "Flaky Test Diagnosis",
    "title": "Flaky Test Diagnosis",
    "description": "A test that passes sometimes. The highest-value automation card here.",
    "whenToUse": "A test that passes sometimes. The highest-value automation card here.",
    "inputsNeeded": [
      "The test code",
      "the failure pattern"
    ],
    "tags": [
      "Automation",
      "Flaky Tests",
      "Diagnosis"
    ],
    "technologies": [],
    "testingType": [
      "Automation"
    ],
    "difficulty": "Advanced",
    "qualityScore": 5,
    "estimatedTimeSaved": "30-45 min",
    "outputFormat": "Markdown table",
    "lastUpdated": "2026-07-22",
    "variables": [
      {
        "token": "CODE",
        "label": "The test code"
      }
    ],
    "prompt": "Act as an SDET diagnosing test flakiness.\n\nIdentify every source of non-determinism in the test below, ranked by likelihood\nof causing the described failure pattern.\n\nCheck specifically for:\n- TIMING — hard sleeps; waiting on presence instead of the real condition\n  (visible / clickable / network idle / animation complete); race between\n  assertion and state settling\n- SHARED STATE — test order dependency; data left behind by a previous run;\n  static/global state; collisions under parallel execution\n- TEST DATA — hardcoded IDs; data that expires; data another test mutates;\n  assumptions about record count or ordering\n- ENVIRONMENT — network latency; animations; lazy loading; virtualised lists;\n  timezone or clock; CI resource contention\n- LOCATORS — index or position based; matches multiple elements; resolves before\n  the element is stable\n- EXTERNAL — third-party service; real network calls; unstubbed dependency\n\nOutput: Cause | Evidence in the code | Fix | Confidence (High/Med/Low)\n\nRules:\n- Do NOT suggest increasing sleep durations or adding retries. Both hide\n  flakiness rather than fixing it. If retry is genuinely the only option,\n  say so explicitly and justify it.\n- Rank by likelihood given the stated failure pattern — a test that only fails\n  in parallel points somewhere very different from one that fails at 9am daily.\n- If the cause can't be determined from the code alone, say exactly what logs,\n  traces, video, or timing data you'd need.\n\nFAILURE PATTERN: {{e.g. fails ~1 in 5 runs, only in CI, only in parallel}}\nTEST CODE:\n\"\"\"\n{{CODE}}\n\"\"\"",
    "promptShort": "Act as an SDET diagnosing test flakiness.\n\nIdentify the most likely sources of non-determinism in the test below, ranked by likelihood.\n\nCheck for: hard waits/timing, shared test state, hardcoded test data, unstable locators, real network calls.\n\nOutput: Cause | Fix | Confidence (High/Med/Low)\n\nDo NOT suggest retries or longer sleeps as the fix.\n\nFAILURE PATTERN: {{e.g. fails ~1 in 5 runs, only in CI, only in parallel}}\nTEST CODE:\n\"\"\"\n{{CODE}}\n\"\"\"",
    "promptExpert": "Act as a principal SDET running a formal flakiness RCA.\n\nIdentify every source of non-determinism in the test below, ranked by likelihood\nof causing the described failure pattern. Go deeper than a surface read — trace\nthe actual execution order and timing assumptions.\n\nCheck specifically for:\n- TIMING — hard sleeps; waiting on presence instead of the real condition\n  (visible / clickable / network idle / animation complete); race between\n  assertion and state settling; assertion firing before an async state update flushes\n- SHARED STATE — test order dependency; data left behind by a previous run;\n  static/global state; collisions under parallel execution; shared fixtures\n  mutated across tests\n- TEST DATA — hardcoded IDs; data that expires; data another test mutates;\n  assumptions about record count or ordering\n- ENVIRONMENT — network latency; animations; lazy loading; virtualised lists;\n  timezone or clock; CI resource contention; container cold-start variance\n- LOCATORS — index or position based; matches multiple elements; resolves before\n  the element is stable\n- INFRASTRUCTURE DRIFT — browser/driver version mismatch between local and CI;\n  flaky third-party test infrastructure (grid, device farm)\n- EXTERNAL — third-party service; real network calls; unstubbed dependency\n\nOutput: Cause | Evidence in the code | Fix | Confidence (High/Med/Low) | Effort to fix (S/M/L)\n\nThen produce:\n- A MINIMAL REPRODUCTION — the smallest version of this test that still exhibits\n  the failure, so it can be run in a tight loop to confirm the fix\n- A FIX, as a ready-to-apply diff against the code below, for the single\n  highest-confidence cause\n\nRules:\n- Do NOT suggest increasing sleep durations or adding retries. Both hide\n  flakiness rather than fixing it. If retry is genuinely the only option,\n  say so explicitly and justify it.\n- Rank by likelihood given the stated failure pattern — a test that only fails\n  in parallel points somewhere very different from one that fails at 9am daily.\n- If the cause can't be determined from the code alone, say exactly what logs,\n  traces, video, or timing data you'd need.\n\nFAILURE PATTERN: {{e.g. fails ~1 in 5 runs, only in CI, only in parallel}}\nTEST CODE:\n\"\"\"\n{{CODE}}\n\"\"\"",
    "warnings": [
      "\"Add a retry\" is not a fix. A retried flaky test is a defect you've agreed to stop seeing. The prompt blocks this on purpose."
    ],
    "followUps": [],
    "featured": true
  },
  {
    "id": "D7",
    "category": "automation",
    "subcategory": "Code Review",
    "title": "Test Code Review",
    "description": "Before merging test code — yours or a teammate's.",
    "whenToUse": "Before merging test code — yours or a teammate's.",
    "inputsNeeded": [
      "The code"
    ],
    "tags": [
      "Automation",
      "Code Review"
    ],
    "technologies": [],
    "testingType": [
      "Automation"
    ],
    "difficulty": "Advanced",
    "qualityScore": 4,
    "estimatedTimeSaved": "20-30 min",
    "outputFormat": "Markdown",
    "lastUpdated": "2026-07-22",
    "variables": [],
    "prompt": "Act as a senior SDET reviewing test code before merge.\n\nReview the code below. For each finding: Severity (Blocker/Major/Minor/Nit) |\nLine | Issue | Why it matters | Suggested fix\n\nCheck for:\n- Reliability: hard waits, timing assumptions, order dependency, shared state\n- Assertions: missing, weak (assertTrue with no message), multiple unrelated\n  assertions in one test, asserting on implementation rather than behaviour\n- Structure: page object violations, duplicated logic, test data in test bodies\n- Maintainability: naming that doesn't say what's being tested, magic numbers,\n  dead code, commented-out tests\n- Coverage: what this test claims to cover vs what it actually verifies\n- Cleanup: leaked data, unclosed resources, no teardown\n- Security: hardcoded credentials, real data, committed secrets\n\nRules:\n- Lead with Blockers. Do not bury a real problem under style nits.\n- For each finding, explain the FAILURE it would cause — not just that it\n  violates a rule.\n- If the test would pass while the feature is broken, that is a Blocker.\n  Say so loudly.\n- Acknowledge what's done well. A review that's only negative gets ignored.\n\nCODE:\n\"\"\"\n{{CODE}}\n\"\"\"",
    "warnings": [],
    "followUps": [],
    "featured": false
  },
  {
    "id": "D8",
    "category": "automation",
    "subcategory": "CI/CD",
    "title": "CI/CD Pipeline Config",
    "description": "Wiring your suite into CI.",
    "whenToUse": "Wiring your suite into CI.",
    "inputsNeeded": [
      "Repo details",
      "tooling"
    ],
    "tags": [
      "Automation",
      "CI/CD",
      "DevOps"
    ],
    "technologies": [
      "Jenkins",
      "GitHub Actions",
      "GitLab CI"
    ],
    "testingType": [
      "Automation"
    ],
    "difficulty": "Advanced",
    "qualityScore": 4,
    "estimatedTimeSaved": "30-45 min",
    "outputFormat": "YAML / config",
    "lastUpdated": "2026-07-22",
    "variables": [],
    "prompt": "Act as an SDET configuring CI for a test suite.\n\nCreate a {{Jenkins / GitHub Actions / GitLab CI / Azure Pipelines}} config that:\n- Triggers on: {{PR / merge to main / nightly / manual}}\n- Runs: {{TEST_COMMAND}}\n- Publishes: {{Allure / JUnit XML / HTML}} report\n- Fails the build when: {{criteria}}\n\nInclude:\n- Dependency and browser caching\n- Parallel execution setup\n- Artifact retention for reports, screenshots, and video on failure\n- Secrets handled via the platform's secret store — NEVER in the config file\n- A retry policy that is explicit and visible, not silent\n\nRules:\n- Secrets referenced by name only. If your output contains anything resembling\n  a credential, you have made an error.\n- For action/plugin versions, output {{VERIFY_VERSION}} — do not supply from\n  memory.\n- Explain what each stage does — I need to maintain this, not just paste it.\n- State any assumption about the runner environment explicitly.\n\nREPO: {{LANGUAGE_AND_BUILD_TOOL}}\nTEST TYPES: {{unit / api / e2e}}",
    "warnings": [
      "Review any generated CI config before committing. A pipeline that silently retries until green is worse than no pipeline."
    ],
    "followUps": [],
    "featured": false
  },
  {
    "id": "E1",
    "category": "api-testing",
    "subcategory": "Contract Validation",
    "title": "API Contract & Schema Testing",
    "description": "Verifying an API honours its contract — the tests that catch breaking changes.",
    "whenToUse": "Verifying an API honours its contract — the tests that catch breaking changes.",
    "inputsNeeded": [
      "API spec or sample responses"
    ],
    "tags": [
      "API",
      "Contract",
      "Schema",
      "Regression"
    ],
    "technologies": [
      "REST",
      "OpenAPI",
      "JSON Schema"
    ],
    "testingType": [
      "API",
      "Backend"
    ],
    "difficulty": "Advanced",
    "qualityScore": 4,
    "estimatedTimeSaved": "20-30 min",
    "outputFormat": "Markdown table",
    "lastUpdated": "2026-07-22",
    "variables": [],
    "prompt": "Act as an API test engineer designing contract tests.\n\nFor the API below, design tests covering:\n\n1. SCHEMA — required fields present, types correct, no unexpected fields,\n   nullable handling, nested object structure, array item shape\n2. STATUS CODES — every documented code, plus the undocumented ones that will\n   happen anyway (400, 401, 403, 404, 405, 409, 415, 422, 429, 500)\n3. HEADERS — content-type, caching, CORS, rate limit headers, security headers\n4. CONTRACT STABILITY — what a consumer depends on that must not change:\n   field names, types, enum values, required-ness, pagination shape\n5. BACKWARD COMPATIBILITY — which changes would break existing consumers\n\nOutput: Test ID | Category | What's verified | Request | Expected | Breaks\nconsumers if it fails? (Y/N)\n\nRules:\n- Distinguish contract tests (does the API honour its promise?) from functional\n  tests (does the business logic work?). This card is contract only.\n- For section 5, be specific: \"renaming userId to user_id breaks any consumer\n  parsing that field\" — not \"changes may break things\".\n- If the spec doesn't define behaviour for a case, flag it. Undefined contract\n  behaviour is a contract defect.\n\nAPI SPEC / SAMPLE:\n\"\"\"\n{{SPEC_OR_SAMPLES}}\n\"\"\"",
    "warnings": [],
    "followUps": [],
    "featured": false
  },
  {
    "id": "E2",
    "category": "performance-testing",
    "subcategory": "Performance Strategy",
    "title": "Performance Test Strategy",
    "description": "Before writing a single load script. Most perf testing fails here, not in the tooling.",
    "whenToUse": "Before writing a single load script. Most perf testing fails here, not in the tooling.",
    "inputsNeeded": [
      "App description",
      "expected load"
    ],
    "tags": [
      "Performance",
      "Strategy",
      "Load"
    ],
    "technologies": [],
    "testingType": [
      "Performance"
    ],
    "difficulty": "Advanced",
    "qualityScore": 4,
    "estimatedTimeSaved": "30-45 min",
    "outputFormat": "Markdown",
    "lastUpdated": "2026-07-22",
    "variables": [],
    "prompt": "Act as a performance test engineer designing a strategy.\n\nProduce a performance test strategy for the system below.\n\nCover:\n1. OBJECTIVES — tied to a real business threshold, not \"make sure it's fast\"\n2. WORKLOAD MODEL — which user journeys, at what mix, at what rate.\n   Base it on realistic behaviour, not uniform distribution.\n3. TEST TYPES and what each answers:\n   - Load — does it meet SLA at expected volume?\n   - Stress — where does it break, and how does it break?\n   - Spike — does it survive a sudden surge?\n   - Soak — does it degrade over time (memory leaks, connection exhaustion)?\n   - Volume — does it cope with large data sets?\n4. METRICS + PASS/FAIL THRESHOLDS — response time percentiles (p50/p90/p95/p99),\n   throughput, error rate, resource utilisation, saturation points\n5. ENVIRONMENT — what fidelity is required, and what results are invalid without\n6. TEST DATA — volume needed, and why production-like data volume matters\n7. WHAT THIS WILL NOT TELL US — the limits of the exercise\n\nRules:\n- Use PERCENTILES, never averages. An average response time hides the users\n  having a bad time. Say this explicitly in the metrics section.\n- Every threshold needs a source: an SLA, a competitor benchmark, or a stated\n  business requirement. A threshold with no source is a number you made up —\n  flag it as [NEEDS BUSINESS INPUT].\n- If the environment can't support valid results, say so up front. A perf test\n  on a downsized environment produces confident, wrong numbers.\n\nSYSTEM: {{DESCRIPTION}}\nEXPECTED LOAD: {{USERS_TPS_PEAK}}\nSLA / TARGETS: {{TARGETS_OR_UNKNOWN}}\nENVIRONMENT: {{ENV_DETAILS}}",
    "warnings": [
      "\"Average response time\" is how perf reports lie. If your app averages 200ms but p99 is 8 seconds, 1 in 100 requests is a furious customer. The prompt enforces percentiles."
    ],
    "followUps": [],
    "featured": false
  },
  {
    "id": "E3",
    "category": "performance-testing",
    "subcategory": "Load Testing",
    "title": "Load Test Script",
    "description": "Building the actual script once the strategy exists.",
    "whenToUse": "Building the actual script once the strategy exists.",
    "inputsNeeded": [
      "Endpoint/flow",
      "load profile"
    ],
    "tags": [
      "Performance",
      "Load",
      "Script"
    ],
    "technologies": [
      "k6",
      "JMeter",
      "Gatling"
    ],
    "testingType": [
      "Performance"
    ],
    "difficulty": "Advanced",
    "qualityScore": 4,
    "estimatedTimeSaved": "20-30 min",
    "outputFormat": "Code",
    "lastUpdated": "2026-07-22",
    "variables": [],
    "prompt": "Act as a performance engineer writing a load test script.\n\nCreate a {{JMeter / k6 / Gatling / Locust}} script for the flow below.\n\nFLOW: {{USER_JOURNEY_STEPS}}\nENDPOINTS: {{ENDPOINTS_WITH_METHODS}}\nAUTH: {{AUTH_TYPE}}\nLOAD PROFILE: {{users}} users, {{rampup}} ramp-up, {{duration}} duration\n\nInclude:\n- Realistic think time between steps — real users pause, load generators don't\n- Correlation: extract dynamic values (tokens, IDs, CSRF) from responses and\n  reuse them. Hardcoded session tokens make the test measure nothing.\n- Parameterisation from a data file — every VU using the same login measures\n  cache, not capacity\n- Assertions on response validity, not just status code. A fast 200 returning\n  an error page is not a pass.\n- Thresholds matching the SLA\n- Reporting output config\n\nRules:\n- No hardcoded credentials — externalise and say how.\n- Explain WHY each correlation is needed. Missed correlation is the most common\n  reason a load test produces meaningless results.\n- Flag anything requiring environment-specific setup.\n- For tool/plugin versions, output {{VERIFY_VERSION}}.",
    "warnings": [
      "Only run load tests against environments you own and are authorised to test. Load testing third-party or shared infrastructure without written permission may be unlawful and will get you blocked."
    ],
    "followUps": [],
    "featured": false
  },
  {
    "id": "E4",
    "category": "performance-testing",
    "subcategory": "Results Analysis",
    "title": "Performance Results Analysis",
    "description": "You have numbers and need to know what they mean.",
    "whenToUse": "You have numbers and need to know what they mean.",
    "inputsNeeded": [
      "Results data"
    ],
    "tags": [
      "Performance",
      "Analysis",
      "Metrics"
    ],
    "technologies": [],
    "testingType": [
      "Performance"
    ],
    "difficulty": "Advanced",
    "qualityScore": 4,
    "estimatedTimeSaved": "15-20 min",
    "outputFormat": "Markdown",
    "lastUpdated": "2026-07-22",
    "variables": [],
    "prompt": "Act as a performance engineer analysing test results.\n\nAnalyse the results below and produce:\n\n1. VERDICT — pass / fail against the stated thresholds, first line, unambiguous\n2. WHAT THE NUMBERS SAY — read the percentile spread, not the average.\n   A wide p50→p99 gap means inconsistency; call it out.\n3. BOTTLENECK HYPOTHESIS — where the constraint appears to be\n   (app / DB / network / external dependency), and the evidence for it\n4. IS THE TEST ITSELF VALID? — check for: load generator saturation, missing\n   correlation, unrealistic think time, cache warming, insufficient data volume.\n   An invalid test produces confident, wrong numbers.\n5. WHAT I'D INVESTIGATE NEXT — specific, ordered\n6. WHAT I CANNOT CONCLUDE from this data\n\nRules:\n- Section 4 comes before any conclusion. If the test is invalid, say so and stop\n  — do not analyse noise.\n- Distinguish correlation from causation. \"Response time rose as users rose\"\n  is not a root cause.\n- Do not speculate about code you haven't seen. Say what you'd need.\n- If error rate is non-zero, address it before discussing response times —\n  fast failures look like good performance.\n\nTHRESHOLDS: {{SLA}}\nRESULTS:\n\"\"\"\n{{RESULTS_DATA}}\n\"\"\"\nRESOURCE METRICS: {{CPU_MEM_DB_IF_AVAILABLE}}",
    "warnings": [],
    "followUps": [],
    "featured": false
  },
  {
    "id": "E5",
    "category": "security-testing",
    "subcategory": "OWASP Checklist",
    "title": "Security Test Checklist (OWASP)",
    "description": "Adding a security lens to functional QA.",
    "whenToUse": "Adding a security lens to functional QA.",
    "inputsNeeded": [
      "Feature description",
      "tech context"
    ],
    "tags": [
      "Security",
      "OWASP",
      "Checklist"
    ],
    "technologies": [],
    "testingType": [
      "Security"
    ],
    "difficulty": "Advanced",
    "qualityScore": 5,
    "estimatedTimeSaved": "30-45 min",
    "outputFormat": "Markdown table",
    "lastUpdated": "2026-07-22",
    "variables": [
      {
        "token": "FEATURE",
        "label": "Feature",
        "type": "text",
        "required": true
      },
      {
        "token": "AUTH",
        "label": "Auth model",
        "type": "select",
        "options": [
          "OAuth2",
          "JWT",
          "Session",
          "API Key",
          "Basic Auth",
          "None"
        ]
      },
      {
        "token": "WHAT_DATA_IT_HANDLES",
        "label": "Data sensitivity",
        "type": "textarea",
        "required": true,
        "multiline": true
      }
    ],
    "prompt": "Act as a security-aware QA engineer — not a penetration tester.\n\nProduce a security VERIFICATION checklist for the feature below, mapped to the\nOWASP Top 10 and relevant ASVS controls.\n\nFor each applicable risk: OWASP category | What to verify | How to check it\n(standard tooling or manual observation) | What a failure looks like |\nEscalate to security specialist? (Y/N)\n\nCover as applicable: broken access control, injection, authentication and\nsession handling, sensitive data exposure, security misconfiguration, insecure\ndirect object references, rate limiting, security headers, error message leakage.\n\nRules:\n- Scope this to verification a QA engineer can legitimately perform on a system\n  their organisation authorises them to test.\n- Do NOT include exploit code, weaponised payloads, or attack chains. Standard\n  published detection strings only — the goal is to verify the control exists,\n  not to breach it.\n- Explicitly mark anything requiring a qualified security specialist. QA finding\n  the gap is valuable; QA freelancing an exploit is not.\n- For each item, state the control being verified — not the attack.\n\nFEATURE: {{FEATURE}}\nAUTH MODEL: {{AUTH}}\nDATA SENSITIVITY: {{WHAT_DATA_IT_HANDLES}}",
    "warnings": [
      "Authorisation is not optional. Only test systems your organisation has explicitly authorised you to test. Findings go to your security team, never to a public channel."
    ],
    "followUps": [],
    "featured": false
  },
  {
    "id": "E6",
    "category": "ui-testing",
    "subcategory": "Accessibility",
    "title": "Accessibility Audit (WCAG)",
    "description": "WCAG conformance — legally required in many markets.",
    "whenToUse": "WCAG conformance — legally required in many markets.",
    "inputsNeeded": [
      "Page/component description"
    ],
    "tags": [
      "Accessibility",
      "WCAG",
      "UI"
    ],
    "technologies": [],
    "testingType": [
      "Frontend"
    ],
    "difficulty": "Intermediate",
    "qualityScore": 4,
    "estimatedTimeSaved": "20-30 min",
    "outputFormat": "Markdown table",
    "lastUpdated": "2026-07-22",
    "variables": [],
    "prompt": "Act as an accessibility specialist.\n\nProduce a WCAG 2.2 Level AA audit checklist for the component below.\n\nFor each criterion: WCAG SC (number + name) | Level | What to check |\nHow to check (tool or manual) | Pass condition | Automatable? (Y/N/Partial)\n\nOrganise by POUR: Perceivable, Operable, Understandable, Robust.\n\nRules:\n- Be explicit that automated tools catch roughly 30-40% of WCAG issues. Mark\n  clearly which items REQUIRE manual or assistive-technology verification —\n  keyboard-only navigation, screen reader announcement, focus order, focus\n  visibility, and meaningful alt text cannot be automated.\n- Include the checks people skip: focus order matching visual order, focus\n  visible at all times, error identification announced to AT, target size,\n  colour not used as the sole information carrier, 200% zoom without loss.\n- Pass conditions must be specific and measurable: \"contrast ratio at least\n  4.5:1 for text under 18pt\", not \"sufficient contrast\".\n- If a criterion doesn't apply to this component, say so rather than padding.\n\nCOMPONENT: {{DESCRIPTION}}\nINTERACTIONS: {{WHAT_USERS_DO}}",
    "warnings": [],
    "followUps": [],
    "featured": false
  },
  {
    "id": "E7",
    "category": "mobile-testing",
    "subcategory": "Coverage Strategy",
    "title": "Mobile Test Coverage",
    "description": "Native or hybrid mobile testing — where the failure modes have nothing to do with your business logic.",
    "whenToUse": "Native or hybrid mobile testing — where the failure modes have nothing to do with your business logic.",
    "inputsNeeded": [
      "App",
      "feature description"
    ],
    "tags": [
      "Mobile",
      "Coverage",
      "Strategy"
    ],
    "technologies": [
      "Android",
      "iOS"
    ],
    "testingType": [
      "Manual"
    ],
    "difficulty": "Intermediate",
    "qualityScore": 4,
    "estimatedTimeSaved": "20-30 min",
    "outputFormat": "Markdown table",
    "lastUpdated": "2026-07-22",
    "variables": [],
    "prompt": "Act as a mobile QA engineer.\n\nProduce a test coverage plan for the mobile feature below.\n\nCover the dimensions that don't exist on web:\n1. INTERRUPTIONS — incoming call, alarm, notification, low battery warning\n2. LIFECYCLE — background/foreground, force kill and relaunch, OS-initiated\n   process death with state restoration, app update while data exists\n3. NETWORK — WiFi, 5G, 4G, 3G, airplane mode, flaky/intermittent, WiFi↔cellular\n   handover mid-request, captive portal, offline mode and sync-on-reconnect\n4. PERMISSIONS — granted, denied, \"only while using\", revoked while running,\n   first-launch flow vs later\n5. DEVICE — screen sizes, notch/cutout/dynamic island, low storage, low memory,\n   low battery, OS versions in your support matrix\n6. INPUT — soft keyboard covering fields, rotation mid-input, autofill,\n   copy/paste, hardware back button (Android), swipe-back (iOS)\n7. PLATFORM CONVENTIONS — where iOS and Android should legitimately differ\n\nOutput: Category | Scenario | Steps | Expected | Priority | Real device required?\n\nRules:\n- Interruption and lifecycle scenarios are where mobile defects actually live.\n  Weight them accordingly — do not treat them as an afterthought.\n- Mark clearly what an emulator CANNOT validate: real network conditions,\n  actual battery/thermal behaviour, real camera/sensors, biometrics, push\n  delivery, performance under real device constraints.\n- State expected behaviour specifically. \"App should handle it gracefully\" is\n  not testable.\n\nAPP: {{APP_DESCRIPTION}}\nFEATURE: {{FEATURE}}\nPLATFORMS: {{iOS/Android + versions}}",
    "warnings": [
      "Emulators can't validate real network, battery, thermal, biometrics, or push delivery. Budget real-device time for those categories."
    ],
    "followUps": [],
    "featured": false
  },
  {
    "id": "E8",
    "category": "ui-testing",
    "subcategory": "Cross-Browser Testing",
    "title": "Cross-Browser Test Matrix",
    "description": "Deciding what to test where — without a 400-combination matrix nobody runs.",
    "whenToUse": "Deciding what to test where — without a 400-combination matrix nobody runs.",
    "inputsNeeded": [
      "App type",
      "audience data"
    ],
    "tags": [
      "Cross-Browser",
      "UI",
      "Matrix"
    ],
    "technologies": [],
    "testingType": [
      "Frontend"
    ],
    "difficulty": "Intermediate",
    "qualityScore": 4,
    "estimatedTimeSaved": "15-20 min",
    "outputFormat": "Markdown table",
    "lastUpdated": "2026-07-22",
    "variables": [],
    "prompt": "Act as a QA engineer designing a cross-browser test matrix.\n\nProduce a PRIORITISED matrix — not an exhaustive one. An exhaustive matrix\nnever gets run.\n\n1. TIER 1 (full regression) — justify each entry with audience data or business\n   requirement\n2. TIER 2 (smoke only) — justify\n3. TIER 3 (best effort / not tested) — state the risk being accepted\n4. WHAT ACTUALLY DIFFERS between engines — be specific:\n   Blink vs Gecko vs WebKit rendering, date/number input handling, CSS feature\n   support, font rendering, scroll behaviour, storage limits, autoplay policy\n5. WHAT DOESN'T NEED CROSS-BROWSER TESTING — business logic doesn't change per\n   browser. Testing it 5 times is waste. Name what's browser-agnostic.\n\nOutput: Browser | Version | OS | Tier | Rationale | What specifically to check here\n\nRules:\n- Base tiers on the audience data provided. If none is given, say the matrix is\n  a guess and ask for analytics.\n- Section 5 matters as much as section 1. Most cross-browser suites waste\n  most of their runtime re-testing browser-agnostic logic.\n- Be concrete about what breaks where — \"may render differently\" is not a test.\n\nAPP TYPE: {{SPA/MPA + framework}}\nAUDIENCE DATA: {{ANALYTICS_OR_UNKNOWN}}\nBUSINESS REQUIREMENTS: {{CONTRACTUAL_SUPPORT_OBLIGATIONS}}",
    "warnings": [],
    "followUps": [],
    "featured": false
  },
  {
    "id": "E9",
    "category": "database-testing",
    "subcategory": "SQL Validation",
    "title": "SQL / Database Validation",
    "description": "Verifying what the UI says matches what the database holds.",
    "whenToUse": "Verifying what the UI says matches what the database holds.",
    "inputsNeeded": [
      "Schema",
      "scenario"
    ],
    "tags": [
      "Database",
      "SQL",
      "Validation"
    ],
    "technologies": [
      "SQL"
    ],
    "testingType": [
      "Database",
      "Backend"
    ],
    "difficulty": "Advanced",
    "qualityScore": 4,
    "estimatedTimeSaved": "20-30 min",
    "outputFormat": "SQL",
    "lastUpdated": "2026-07-22",
    "variables": [],
    "prompt": "Act as a QA engineer validating data integrity.\n\nFor the scenario below, produce verification queries covering:\n\n1. DATA INTEGRITY — did the transaction write what it claimed?\n2. REFERENTIAL INTEGRITY — orphan records, broken foreign keys\n3. CONSTRAINTS — nulls where not allowed, duplicates where unique required,\n   check constraints\n4. AUDIT — created/modified timestamps, user attribution, soft-delete flags\n5. NEGATIVE — did a failed operation leave partial data? (transaction rollback)\n6. EDGE — concurrent updates, precision/rounding on money, timezone on dates,\n   character encoding on text\n\nOutput: Check | SQL query | Expected result | What a failure means\n\nRules:\n- READ-ONLY queries only — SELECT. Never generate UPDATE, DELETE, DROP, or\n  TRUNCATE for a validation card.\n- Every query must be safe to run on a shared test environment: include LIMIT,\n  avoid full scans on large tables, avoid locking.\n- Use parameterised placeholders, not string-concatenated values.\n- Expected result must be specific — \"1 row with status='CONFIRMED'\", not\n  \"should return correct data\".\n- Money: verify precision and rounding explicitly. Floating point on currency\n  is a defect.\n\nSCHEMA:\n\"\"\"\n{{TABLES_AND_COLUMNS}}\n\"\"\"\nSCENARIO: {{WHAT_THE_USER_DID}}",
    "warnings": [
      "Read-only by design. Never run generated SQL against production. Verify every query on a scratch environment before it touches shared data."
    ],
    "followUps": [],
    "featured": false
  },
  {
    "id": "E10",
    "category": "ui-testing",
    "subcategory": "Visual Regression",
    "title": "Visual Regression Strategy",
    "description": "Setting up visual testing without drowning in false positives.",
    "whenToUse": "Setting up visual testing without drowning in false positives.",
    "inputsNeeded": [
      "App",
      "component list"
    ],
    "tags": [
      "Visual Regression",
      "UI",
      "Strategy"
    ],
    "technologies": [],
    "testingType": [
      "Frontend"
    ],
    "difficulty": "Intermediate",
    "qualityScore": 4,
    "estimatedTimeSaved": "20-30 min",
    "outputFormat": "Markdown",
    "lastUpdated": "2026-07-22",
    "variables": [],
    "prompt": "Act as a QA engineer designing a visual regression strategy.\n\nProduce a strategy answering:\n\n1. WHAT TO SNAPSHOT — which components/pages, and why each earns its place\n2. WHAT NOT TO SNAPSHOT — anything with inherent variance: timestamps, live\n   data, ads, animations, randomised content, user avatars. Name them and give\n   the masking approach.\n3. FALSE POSITIVE CONTROL — the reason most visual suites get abandoned:\n   - Font rendering differences across OS/browser\n   - Animation and transition timing\n   - Scrollbar presence\n   - Dynamic content\n   - Anti-aliasing\n   Give the mitigation for each.\n4. THRESHOLD — pixel diff tolerance, and the reasoning. Zero tolerance produces\n   noise; high tolerance misses real regressions.\n5. BASELINE MANAGEMENT — who approves a changed baseline, and when. An\n   auto-approved baseline is not a test.\n6. VIEWPORTS — which, and why those.\n\nRules:\n- Be honest that visual testing has a high maintenance cost. State what the\n  ongoing cost is so the team decides with open eyes.\n- If a component changes frequently by design, recommend NOT snapshotting it.\n- Section 3 determines whether this suite survives six months. Do not rush it.\n\nAPP: {{DESCRIPTION}}\nCOMPONENTS: {{LIST}}\nTOOL: {{Percy/Applitools/Playwright/Chromatic}}",
    "warnings": [
      "Most visual regression suites get switched off within a year — killed by false positives, not by lack of value. Section 3 is the survival section."
    ],
    "followUps": [],
    "featured": false
  },
  {
    "id": "E11",
    "category": "ui-testing",
    "subcategory": "Localization",
    "title": "Localization / i18n Testing",
    "description": "Any product shipping in more than one language.",
    "whenToUse": "Any product shipping in more than one language.",
    "inputsNeeded": [
      "Feature",
      "target locales"
    ],
    "tags": [
      "Localization",
      "i18n",
      "UI"
    ],
    "technologies": [],
    "testingType": [
      "Frontend"
    ],
    "difficulty": "Intermediate",
    "qualityScore": 4,
    "estimatedTimeSaved": "20-30 min",
    "outputFormat": "Markdown table",
    "lastUpdated": "2026-07-22",
    "variables": [],
    "prompt": "Act as a localization QA engineer.\n\nProduce a test plan for the feature below across these locales: {{LOCALES}}\n\nCover:\n1. TEXT EXPANSION — German/Finnish run ~30-40% longer than English; CJK shorter.\n   Which UI elements will break?\n2. RTL — Arabic/Hebrew: full mirroring, icon direction, number/date alignment,\n   mixed LTR content inside RTL text\n3. FORMATTING — dates (DD/MM vs MM/DD), decimal separator (1,000.50 vs 1.000,50),\n   currency position and symbol, address format, phone format, name order\n4. INPUT — IME for CJK, diacritics, RTL input, character limits counted in\n   characters vs bytes\n5. SORTING — locale-aware collation. Alphabetical order is not universal.\n6. PLURALISATION — languages with more than two plural forms (Polish, Arabic,\n   Russian). Hardcoded if(n==1) logic breaks.\n7. CONTENT — hardcoded strings, concatenated sentences (untranslatable),\n   text baked into images, culturally inappropriate colours/icons/imagery\n8. TRUNCATION — where longer strings will clip, wrap, or overflow\n\nOutput: Category | Locale | What to test | Expected | Severity if it fails\n\nRules:\n- Concatenated strings are a defect in themselves — word order differs by\n  language. Flag any you can identify.\n- Do not assume a locale = a language. Same language, different regions have\n  different formats.\n- Be specific about which UI elements break, not \"layout may be affected\".\n\nFEATURE: {{FEATURE}}\nCURRENT LOCALE: {{BASE}}",
    "warnings": [],
    "followUps": [],
    "featured": false
  },
  {
    "id": "F1",
    "category": "reporting",
    "subcategory": "Test Metrics",
    "title": "Test Metrics",
    "description": "Reporting progress and quality with numbers.",
    "whenToUse": "Reporting progress and quality with numbers.",
    "inputsNeeded": [
      "Raw counts"
    ],
    "tags": [
      "Metrics",
      "Reporting"
    ],
    "technologies": [],
    "testingType": [
      "Manual"
    ],
    "difficulty": "Intermediate",
    "qualityScore": 4,
    "estimatedTimeSaved": "15-20 min",
    "outputFormat": "Markdown table",
    "lastUpdated": "2026-07-22",
    "variables": [
      {
        "token": "RAW_COUNTS",
        "label": "Raw counts"
      }
    ],
    "prompt": "Act as a QA lead producing test metrics.\n\nCalculate and present:\n\nBase counts: requirements, test cases written, executed, passed, failed,\nblocked, not run. Defects by severity. Defects by status.\n\nDerived: % executed, % passed (of executed), % failed, % blocked,\nrequirement coverage %, defect density, defect removal efficiency,\ndefect leakage (if prod data given).\n\nOutput a table, then a short interpretation section.\n\nRules:\n- Show every formula. A metric with no visible formula is not auditable.\n- Compute % passed against EXECUTED, not against total. Reporting pass rate\n  against untested cases inflates the number and misleads the reader.\n- Flag any metric that is misleading in isolation — blocked cases hiding real\n  risk, high pass rate on shallow tests, coverage % with no depth measure.\n- Do NOT invent numbers. If a metric can't be computed from the data below,\n  output \"insufficient data\" and say what's needed.\n- The interpretation must state what the numbers do NOT tell us.\n\nDATA:\n{{RAW_COUNTS}}",
    "warnings": [
      "Metrics get gamed the moment they become targets. This prompt is deliberately blunt about what each number hides."
    ],
    "followUps": [],
    "featured": false
  },
  {
    "id": "F2",
    "category": "reporting",
    "subcategory": "Closure Reports",
    "title": "Test Summary / Closure Report",
    "description": "End of a test cycle. The formal record.",
    "whenToUse": "End of a test cycle. The formal record.",
    "inputsNeeded": [
      "Metrics",
      "defect data",
      "what happened"
    ],
    "tags": [
      "Reporting",
      "Closure",
      "Summary"
    ],
    "technologies": [],
    "testingType": [
      "Manual"
    ],
    "difficulty": "Intermediate",
    "qualityScore": 4,
    "estimatedTimeSaved": "20-30 min",
    "outputFormat": "Markdown",
    "lastUpdated": "2026-07-22",
    "variables": [],
    "prompt": "Act as a QA lead writing a test closure report.\n\nProduce:\n1. EXECUTIVE SUMMARY — 3 sentences. What was tested, what we found, whether it's\n   ready. A reader who stops here must still get the truth.\n2. SCOPE — tested / not tested (be explicit about not tested)\n3. RESULTS — metrics with formulas\n4. DEFECT SUMMARY — by severity and status; open defects going to production\n   listed individually with their accepted risk\n5. QUALITY ASSESSMENT — the honest read\n6. VARIANCES — what deviated from the plan and why\n7. RISKS ACCEPTED — what we're shipping with\n8. LESSONS LEARNED — process, not people\n9. RECOMMENDATION — with conditions if any\n\nRules:\n- Do not bury bad news in section 7. If it belongs in the executive summary,\n  put it in the executive summary.\n- Every open defect shipping to production gets a named accepted risk.\n  \"Deferred\" without a stated risk is a gap.\n- Lessons learned must be actionable process changes. \"Communicate better\"\n  is not a lesson.\n- Distinguish fact from judgement. Label judgement.\n- Do not manufacture data. Missing input = \"not measured\".\n\nDATA:\n{{METRICS_AND_DEFECTS}}\nWHAT HAPPENED: {{NARRATIVE}}",
    "warnings": [],
    "followUps": [],
    "featured": false
  },
  {
    "id": "F3",
    "category": "reporting",
    "subcategory": "Release Decisions",
    "title": "Release Go / No-Go",
    "description": "The decision meeting. The most consequential thing QA does.",
    "whenToUse": "The decision meeting. The most consequential thing QA does.",
    "inputsNeeded": [
      "Test results",
      "open defects",
      "release context"
    ],
    "tags": [
      "Reporting",
      "Release",
      "Decision"
    ],
    "technologies": [],
    "testingType": [
      "Manual"
    ],
    "difficulty": "Senior QA",
    "qualityScore": 5,
    "estimatedTimeSaved": "20-30 min",
    "outputFormat": "Markdown",
    "lastUpdated": "2026-07-22",
    "variables": [
      {
        "token": "RESULTS",
        "label": "Test results"
      },
      {
        "token": "DEFECTS_WITH_SEVERITY",
        "label": "Open defects with severity"
      },
      {
        "token": "DATE_PRESSURE_BUSINESS_DRIVERS",
        "label": "Release context"
      },
      {
        "token": "CAN_WE_ROLL_BACK_HOW_FAST",
        "label": "Rollback capability"
      }
    ],
    "prompt": "Act as a QA manager preparing a go/no-go recommendation.\n\nOutput in this order:\n\n1. **RECOMMENDATION** — GO / GO WITH CONDITIONS / NO-GO. First line. Unambiguous.\n2. **THE THREE FACTS THAT DRIVE IT** — the evidence, not the reasoning\n3. **CONDITIONS** — if conditional: exactly what must be true before shipping,\n   each with an owner and a verification step\n4. **OPEN RISKS** — each with likelihood and blast radius (who's affected, how badly)\n5. **WHAT WE DID NOT TEST** — and the specific risk we're accepting\n6. **ROLLBACK TRIGGER** — what to watch post-release, the number that means\n   roll back, and who decides\n7. **WHAT I CANNOT ASSESS** — gaps in my own data\n\nRules:\n- Lead with the recommendation. Do not build up to it.\n- Do NOT soften a NO-GO. If the data says no-go, say no-go in those words.\n  A hedged no-go gets read as a go.\n- Separate FACT from JUDGEMENT and label which is which.\n- Section 6 is not optional. A release with no defined rollback trigger has no\n  rollback plan, only a rollback hope.\n- If the data below is insufficient to make the call, say so and name what's\n  missing rather than producing a confident guess.\n\nTEST RESULTS: {{RESULTS}}\nOPEN DEFECTS: {{DEFECTS_WITH_SEVERITY}}\nRELEASE CONTEXT: {{DATE_PRESSURE_BUSINESS_DRIVERS}}\nROLLBACK CAPABILITY: {{CAN_WE_ROLL_BACK_HOW_FAST}}",
    "promptShort": "Act as a QA manager preparing a go/no-go recommendation.\n\nOutput:\n1. RECOMMENDATION — GO / GO WITH CONDITIONS / NO-GO. First line.\n2. TOP RISKS — up to 3, each with likelihood and impact.\n3. ROLLBACK TRIGGER — the signal that means roll back, and who decides.\n\nDo NOT soften a NO-GO — say it in those words if the data says so.\n\nTEST RESULTS: {{RESULTS}}\nOPEN DEFECTS: {{DEFECTS_WITH_SEVERITY}}\nRELEASE CONTEXT: {{DATE_PRESSURE_BUSINESS_DRIVERS}}\nROLLBACK CAPABILITY: {{CAN_WE_ROLL_BACK_HOW_FAST}}",
    "promptExpert": "Act as a QA director preparing a go/no-go recommendation for an executive release review.\n\nOutput in this order:\n\n1. **RECOMMENDATION** — GO / GO WITH CONDITIONS / NO-GO. First line. Unambiguous.\n2. **CONFIDENCE** — High / Medium / Low, and the single biggest factor driving\n   that confidence level.\n3. **THE THREE FACTS THAT DRIVE IT** — the evidence, not the reasoning.\n4. **CONDITIONS** — if conditional: exactly what must be true before shipping,\n   each with an owner and a verification step.\n5. **OPEN RISKS** — each with likelihood, blast radius (who's affected, how\n   badly), and whether it's a known regression class or novel.\n6. **WHAT WE DID NOT TEST** — and the specific risk we're accepting, ranked by\n   exposure.\n7. **ROLLBACK TRIGGER** — what to watch post-release, the exact number/signal\n   that means roll back, who decides, and how long the decision window is.\n8. **COMMUNICATION PLAN** — who needs to know before the decision, who needs\n   to know after, and what changes in the message if it's a NO-GO vs a GO\n   WITH CONDITIONS.\n9. **WHAT I CANNOT ASSESS** — gaps in my own data, and the fastest way to\n   close each gap if there's time before the decision.\n\nRules:\n- Lead with the recommendation. Do not build up to it.\n- Do NOT soften a NO-GO. If the data says no-go, say no-go in those words.\n  A hedged no-go gets read as a go.\n- Separate FACT from JUDGEMENT and label which is which.\n- Section 7 is not optional. A release with no defined rollback trigger has no\n  rollback plan, only a rollback hope.\n- Section 8 must name specific roles/functions, not \"stakeholders\" generically.\n- If the data below is insufficient to make the call, say so and name what's\n  missing rather than producing a confident guess.\n\nTEST RESULTS: {{RESULTS}}\nOPEN DEFECTS: {{DEFECTS_WITH_SEVERITY}}\nRELEASE CONTEXT: {{DATE_PRESSURE_BUSINESS_DRIVERS}}\nROLLBACK CAPABILITY: {{CAN_WE_ROLL_BACK_HOW_FAST}}",
    "warnings": [
      "This is a recommendation, not a decision. QA presents evidence and a position; the business owns the call. But present the position clearly — a hedged recommendation transfers no information."
    ],
    "followUps": [],
    "featured": true
  },
  {
    "id": "F4",
    "category": "reporting",
    "subcategory": "Status Reporting",
    "title": "Status Report / Standup Update",
    "description": "Daily, weekly, or when someone asks \"where are we?\"",
    "whenToUse": "Daily, weekly, or when someone asks \"where are we?\"",
    "inputsNeeded": [
      "What you did / what's blocked"
    ],
    "tags": [
      "Reporting",
      "Status",
      "Standup"
    ],
    "technologies": [],
    "testingType": [
      "Manual"
    ],
    "difficulty": "Beginner",
    "qualityScore": 3,
    "estimatedTimeSaved": "5-10 min",
    "outputFormat": "Markdown",
    "lastUpdated": "2026-07-22",
    "variables": [],
    "prompt": "Act as a QA engineer writing a status update for {{daily standup / weekly\nstakeholder report}}.\n\nFormat:\n- **Progress:** what moved, with numbers\n- **Today/Next:** what's happening now\n- **Blocked:** what's stuck, who unblocks it, and how long it's been stuck\n- **Risks:** what might become a problem\n- **Needs from others:** specific ask, specific person\n\nRules:\n- Lead with anything BLOCKED. Blockers are the reason this meeting exists.\n- Numbers, not adjectives. \"42 of 60 cases executed, 5 failed\" — not\n  \"good progress\".\n- Every blocker names an owner and an age. A blocker with no owner stays blocked.\n- Audience-appropriate: for stakeholders, translate to business impact.\n  For standup, stay technical and brief.\n- No status theatre. If nothing moved, say nothing moved and why.\n\nRAW NOTES:\n{{YOUR_NOTES}}",
    "warnings": [],
    "followUps": [],
    "featured": false
  },
  {
    "id": "F5",
    "category": "reporting",
    "subcategory": "Coverage Analysis",
    "title": "Coverage Gap Analysis",
    "description": "Answering \"are we testing the right things?\" — not \"how many tests do we have?\"",
    "whenToUse": "Answering \"are we testing the right things?\" — not \"how many tests do we have?\"",
    "inputsNeeded": [
      "Feature list",
      "existing tests"
    ],
    "tags": [
      "Reporting",
      "Coverage",
      "Gaps"
    ],
    "technologies": [],
    "testingType": [
      "Manual"
    ],
    "difficulty": "Intermediate",
    "qualityScore": 4,
    "estimatedTimeSaved": "15-20 min",
    "outputFormat": "Markdown table",
    "lastUpdated": "2026-07-22",
    "variables": [],
    "prompt": "Act as a QA lead analysing test coverage gaps.\n\nCompare the feature list against existing tests and identify:\n\n1. UNTESTED — features with no coverage at all\n2. SHALLOW — features with only happy-path coverage and no negative/edge cases\n3. OVER-TESTED — features with redundant coverage that could be trimmed\n4. WRONG LEVEL — things tested via slow E2E that belong in unit or API tests\n5. UNTESTABLE — features that cannot currently be tested, and what's blocking it\n6. RISK-WEIGHTED GAPS — the untested/shallow items ranked by business risk\n\nOutput: Feature | Current coverage | Gap type | Risk if it fails | Recommended action\n\nRules:\n- Coverage percentage is not coverage. A feature with 20 happy-path tests and\n  zero negative tests is shallow, regardless of the count. Judge depth, not volume.\n- Section 4 matters: an E2E test doing a unit test's job is slow, flaky, and\n  gives false confidence. Name them.\n- Section 3 is worth real money — redundant tests cost runtime and maintenance\n  forever. Do not skip it because cutting tests feels unsafe.\n- Rank by risk, not by gap size. A small gap on the payment flow beats a large\n  gap on the help page.\n\nFEATURES: {{FEATURE_LIST}}\nEXISTING TESTS: {{TEST_INVENTORY}}",
    "warnings": [],
    "followUps": [],
    "featured": false
  }
];
