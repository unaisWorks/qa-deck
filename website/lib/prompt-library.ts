// GENERATED — do not edit by hand.
// Source: QA-Deck-Prompt-Library.md (repo root)
// Regenerate: node scripts/generate-prompt-library.mjs (run from website/)
//
// The remaining cards in the source doc are not yet included — see
// INCLUDED_IDS in scripts/generate-prompt-library.mjs to add more.

export type PromptCategory = "requirements" | "test-design" | "execution-defects" | "automation" | "specialized-testing" | "reporting-closure" | "learning-career";

export const PROMPT_CATEGORY_ORDER: readonly PromptCategory[] = ["requirements", "test-design", "execution-defects", "automation", "specialized-testing", "reporting-closure", "learning-career"];

export const PROMPT_CATEGORY_LABELS: Record<PromptCategory, string> = {
  "requirements": "Requirements & Planning",
  "test-design": "Test Design",
  "execution-defects": "Execution & Defects",
  "automation": "Automation",
  "specialized-testing": "Specialized Testing",
  "reporting-closure": "Reporting & Closure",
  "learning-career": "Learning & Career",
};

export interface PromptCard {
  id: string;
  category: PromptCategory;
  title: string;
  whenToUse: string;
  inputsNeeded: string[];
  prompt: string;
  warnings: string[];
  followUps: string[];
  /** Doc's own ⭐ — "highest-ROI in the library", not a per-PR scope flag. */
  featured: boolean;
}

export const PROMPT_CARDS: PromptCard[] = [
  {
    "id": "A1",
    "category": "requirements",
    "title": "Requirement Ambiguity Analysis",
    "whenToUse": "Before writing a single test case. Catches defects at the cheapest possible stage.",
    "inputsNeeded": [
      "Requirement doc / user story / PRD"
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
    "category": "requirements",
    "title": "Test Plan",
    "whenToUse": "Start of a release or project, when a signed-off plan document is required.",
    "inputsNeeded": [
      "Requirement doc",
      "your company's test plan template"
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
    "id": "B2",
    "category": "test-design",
    "title": "Test Case Generation",
    "whenToUse": "The core workflow. Turning a feature into executable cases.",
    "inputsNeeded": [
      "Feature",
      "field-by-field detail (or a screenshot)"
    ],
    "prompt": "Act as a QA engineer writing test cases for direct Jira bulk upload.\n\nGenerate test cases for the feature below.\n\nFORMAT — a markdown table with exactly these columns:\n{{YOUR_COLUMNS}}\n(default: Test Case ID | Module | Title | Precondition | Test Steps | Test Data |\nExpected Result | Priority | Type | Technique)\n\nCOVERAGE — apply these techniques and name the technique in the last column:\n- Equivalence partitioning: at least one valid and one invalid class per field\n- Boundary value analysis: min-1, min, min+1, max-1, max, max+1\n- Field-level validation for EVERY field listed below — none skipped\n- Negative and error handling\n- State transitions where applicable\n\nRules:\n- ONE assertion per test case. Never \"verify everything works correctly.\"\n- Test Steps: numbered, and executable by someone who has never seen this app.\n- Expected Result: observable. A specific message, state, value, or status code.\n  Never \"user should be able to...\" — that is not verifiable.\n- If a field's validation rule is not specified below, output\n  [NEEDS CLARIFICATION: what rule?] instead of assuming one.\n- Output ONLY the table. No prose before or after — this is being pasted directly.\n\nFEATURE: {{FEATURE_NAME}}\nFIELDS (name | type | validation | mandatory?):\n{{FIELD_LIST}}\nBUSINESS RULES:\n{{BUSINESS_RULES}}\n\nNow generate the test cases, grouped by module.",
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
    "id": "B7",
    "category": "test-design",
    "title": "Test Data Generation",
    "whenToUse": "You need realistic, adversarial data for a form or API.",
    "inputsNeeded": [
      "Field list with types"
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
    "title": "BDD / Gherkin from User Story",
    "whenToUse": "Converting a story + AC into feature files.",
    "inputsNeeded": [
      "User story",
      "acceptance criteria"
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
    "id": "C2",
    "category": "execution-defects",
    "title": "Bug Report",
    "whenToUse": "Turning rough observation into something a dev can act on with zero follow-up questions.",
    "inputsNeeded": [
      "Your raw notes"
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
    "id": "C4",
    "category": "execution-defects",
    "title": "Root Cause Analysis — Five Whys",
    "whenToUse": "A defect with a likely single causal chain. Fast RCA for a ticket.",
    "inputsNeeded": [
      "The problem statement"
    ],
    "prompt": "Act as a Root Cause Analyst.\n\nProblem: {{PROBLEM_STATEMENT}}\nWhat we know: {{EVIDENCE}}\n\nAsk \"why\" this problem exists. Then repeat \"why\" against your own answer four\nmore times, digging one layer deeper each time.\n\nRules:\n- Stop descending when you reach something ACTIONABLE — a process, a decision,\n  or a missing control. \"Human error\" and \"someone forgot\" are not root causes;\n  they are the point at which you have stopped thinking.\n- Each Why must follow logically from the previous answer. Do not jump layers.\n- If a link in the chain is a guess rather than something the evidence supports,\n  label it [ASSUMPTION — needs verification].\n- The final Why should reveal a SYSTEMIC gap, not an individual's mistake.\n\nThen produce:\n- ROOT CAUSE (one sentence)\n- IMMEDIATE FIX (stops the bleeding now)\n- SYSTEMIC FIX (prevents this entire class of defect recurring)\n- HOW WE'D KNOW IT WORKED (the signal that confirms the fix)",
    "warnings": [
      "If your chain terminates at \"the tester missed it\", you stopped one Why too early. Keep going until you find the process that made the miss likely."
    ],
    "followUps": [],
    "featured": false
  },
  {
    "id": "D1",
    "category": "automation",
    "title": "Framework Scaffolding",
    "whenToUse": "Setting up a new automation project from zero.",
    "inputsNeeded": [
      "Language, tools, target"
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
    "id": "D6",
    "category": "automation",
    "title": "Flaky Test Diagnosis",
    "whenToUse": "A test that passes sometimes. The highest-value automation card here.",
    "inputsNeeded": [
      "The test code",
      "the failure pattern"
    ],
    "prompt": "Act as an SDET diagnosing test flakiness.\n\nIdentify every source of non-determinism in the test below, ranked by likelihood\nof causing the described failure pattern.\n\nCheck specifically for:\n- TIMING — hard sleeps; waiting on presence instead of the real condition\n  (visible / clickable / network idle / animation complete); race between\n  assertion and state settling\n- SHARED STATE — test order dependency; data left behind by a previous run;\n  static/global state; collisions under parallel execution\n- TEST DATA — hardcoded IDs; data that expires; data another test mutates;\n  assumptions about record count or ordering\n- ENVIRONMENT — network latency; animations; lazy loading; virtualised lists;\n  timezone or clock; CI resource contention\n- LOCATORS — index or position based; matches multiple elements; resolves before\n  the element is stable\n- EXTERNAL — third-party service; real network calls; unstubbed dependency\n\nOutput: Cause | Evidence in the code | Fix | Confidence (High/Med/Low)\n\nRules:\n- Do NOT suggest increasing sleep durations or adding retries. Both hide\n  flakiness rather than fixing it. If retry is genuinely the only option,\n  say so explicitly and justify it.\n- Rank by likelihood given the stated failure pattern — a test that only fails\n  in parallel points somewhere very different from one that fails at 9am daily.\n- If the cause can't be determined from the code alone, say exactly what logs,\n  traces, video, or timing data you'd need.\n\nFAILURE PATTERN: {{e.g. fails ~1 in 5 runs, only in CI, only in parallel}}\nTEST CODE:\n\"\"\"\n{{CODE}}\n\"\"\"",
    "warnings": [
      "\"Add a retry\" is not a fix. A retried flaky test is a defect you've agreed to stop seeing. The prompt blocks this on purpose."
    ],
    "followUps": [],
    "featured": true
  },
  {
    "id": "E5",
    "category": "specialized-testing",
    "title": "Security Test Checklist (OWASP)",
    "whenToUse": "Adding a security lens to functional QA.",
    "inputsNeeded": [
      "Feature description",
      "tech context"
    ],
    "prompt": "Act as a security-aware QA engineer — not a penetration tester.\n\nProduce a security VERIFICATION checklist for the feature below, mapped to the\nOWASP Top 10 and relevant ASVS controls.\n\nFor each applicable risk: OWASP category | What to verify | How to check it\n(standard tooling or manual observation) | What a failure looks like |\nEscalate to security specialist? (Y/N)\n\nCover as applicable: broken access control, injection, authentication and\nsession handling, sensitive data exposure, security misconfiguration, insecure\ndirect object references, rate limiting, security headers, error message leakage.\n\nRules:\n- Scope this to verification a QA engineer can legitimately perform on a system\n  their organisation authorises them to test.\n- Do NOT include exploit code, weaponised payloads, or attack chains. Standard\n  published detection strings only — the goal is to verify the control exists,\n  not to breach it.\n- Explicitly mark anything requiring a qualified security specialist. QA finding\n  the gap is valuable; QA freelancing an exploit is not.\n- For each item, state the control being verified — not the attack.\n\nFEATURE: {{FEATURE}}\nAUTH MODEL: {{AUTH}}\nDATA SENSITIVITY: {{WHAT_DATA_IT_HANDLES}}",
    "warnings": [
      "Authorisation is not optional. Only test systems your organisation has explicitly authorised you to test. Findings go to your security team, never to a public channel."
    ],
    "followUps": [],
    "featured": false
  },
  {
    "id": "F1",
    "category": "reporting-closure",
    "title": "Test Metrics",
    "whenToUse": "Reporting progress and quality with numbers.",
    "inputsNeeded": [
      "Raw counts"
    ],
    "prompt": "Act as a QA lead producing test metrics.\n\nCalculate and present:\n\nBase counts: requirements, test cases written, executed, passed, failed,\nblocked, not run. Defects by severity. Defects by status.\n\nDerived: % executed, % passed (of executed), % failed, % blocked,\nrequirement coverage %, defect density, defect removal efficiency,\ndefect leakage (if prod data given).\n\nOutput a table, then a short interpretation section.\n\nRules:\n- Show every formula. A metric with no visible formula is not auditable.\n- Compute % passed against EXECUTED, not against total. Reporting pass rate\n  against untested cases inflates the number and misleads the reader.\n- Flag any metric that is misleading in isolation — blocked cases hiding real\n  risk, high pass rate on shallow tests, coverage % with no depth measure.\n- Do NOT invent numbers. If a metric can't be computed from the data below,\n  output \"insufficient data\" and say what's needed.\n- The interpretation must state what the numbers do NOT tell us.\n\nDATA:\n{{RAW_COUNTS}}",
    "warnings": [
      "Metrics get gamed the moment they become targets. This prompt is deliberately blunt about what each number hides."
    ],
    "followUps": [],
    "featured": false
  },
  {
    "id": "F3",
    "category": "reporting-closure",
    "title": "Release Go / No-Go",
    "whenToUse": "The decision meeting. The most consequential thing QA does.",
    "inputsNeeded": [
      "Test results",
      "open defects",
      "release context"
    ],
    "prompt": "Act as a QA manager preparing a go/no-go recommendation.\n\nOutput in this order:\n\n1. **RECOMMENDATION** — GO / GO WITH CONDITIONS / NO-GO. First line. Unambiguous.\n2. **THE THREE FACTS THAT DRIVE IT** — the evidence, not the reasoning\n3. **CONDITIONS** — if conditional: exactly what must be true before shipping,\n   each with an owner and a verification step\n4. **OPEN RISKS** — each with likelihood and blast radius (who's affected, how badly)\n5. **WHAT WE DID NOT TEST** — and the specific risk we're accepting\n6. **ROLLBACK TRIGGER** — what to watch post-release, the number that means\n   roll back, and who decides\n7. **WHAT I CANNOT ASSESS** — gaps in my own data\n\nRules:\n- Lead with the recommendation. Do not build up to it.\n- Do NOT soften a NO-GO. If the data says no-go, say no-go in those words.\n  A hedged no-go gets read as a go.\n- Separate FACT from JUDGEMENT and label which is which.\n- Section 6 is not optional. A release with no defined rollback trigger has no\n  rollback plan, only a rollback hope.\n- If the data below is insufficient to make the call, say so and name what's\n  missing rather than producing a confident guess.\n\nTEST RESULTS: {{RESULTS}}\nOPEN DEFECTS: {{DEFECTS_WITH_SEVERITY}}\nRELEASE CONTEXT: {{DATE_PRESSURE_BUSINESS_DRIVERS}}\nROLLBACK CAPABILITY: {{CAN_WE_ROLL_BACK_HOW_FAST}}",
    "warnings": [
      "This is a recommendation, not a decision. QA presents evidence and a position; the business owns the call. But present the position clearly — a hedged recommendation transfers no information."
    ],
    "followUps": [],
    "featured": true
  }
];
