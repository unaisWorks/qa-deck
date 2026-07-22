# QA Deck — Prompt Library

**47 production-ready prompts covering the full QA lifecycle.**
Each card is self-contained: when to use it, what to paste in, the prompt, warnings, and follow-ups.

---

## How this library is built

Every prompt follows the same architecture. If you add cards later, follow this shape:

```
1. ROLE          — short. One line. Sets vocabulary, not intelligence.
2. TASK          — the actual ask, stated plainly
3. RULES         — constraints + what NOT to do (this is where quality comes from)
4. FORMAT        — exact output shape
5. {{INPUTS}}    — user-pasted context, in the middle
6. RESTATE       — the ask again, at the end
```

**Why instructions bookend the data:** models lose accuracy on content buried mid-context. Rules at the top, data in the middle, the ask repeated at the bottom.

**Why every prompt has a "don't invent — flag it" rule:** this is the single cheapest hallucination guard available. QA output that silently invents a business rule is worse than no output.

### Conventions

| Symbol | Meaning |
|---|---|
| `{{PLACEHOLDER}}` | Render as an input field in the card UI |
| **Follow-up** | Chain button — sends into the same conversation |
| ⚠️ | Show this note in the card, not hidden behind a tooltip |

### Universal UI recommendations

- **Every card gets a "What did you miss?" chain button.** First output is a draft. This one follow-up recovers more value than any prompt tweak.
- **Show a privacy warning on any card accepting code or data.** See the Safety appendix.
- **Never auto-run follow-ups.** The user should read the draft first.

---

# A. Requirements & Planning

---

## A1 · Requirement Ambiguity Analysis

**When to use:** Before writing a single test case. Catches defects at the cheapest possible stage.
**You'll need:** Requirement doc / user story / PRD
**Category:** Requirements & Analysis
**Subcategory:** Ambiguity Analysis
**Tags:** Requirements, Manual, Planning, Risk
**Testing type:** Manual
**Difficulty:** Intermediate
**Quality:** 5
**Time saved:** 15-20 min
**Output:** Markdown table
**Last updated:** 2026-07-22
**Variables:**
- `REQUIREMENT_DOC` — Requirement doc / user story / PRD

```
Act as a senior QA analyst reviewing requirements before test design begins.

Analyse the requirement below and identify every gap that would block or mislead
test design. Classify each issue as:

- AMBIGUOUS — open to more than one reasonable interpretation
- INCOMPLETE — a rule is implied but never stated
- CONTRADICTORY — conflicts with another statement in the document
- UNTESTABLE — no observable pass/fail condition exists
- MISSING NFR — no stated limit for performance, security, or accessibility

Output a table: ID | Section | Issue Type | What's unclear | Exact question to ask the BA

Rules:
- Do NOT invent business rules to fill gaps. Flag them.
- Do NOT manufacture issues for points that are already clear.
- Rank by risk — issues that could cause a production defect first.
- The "question to ask" must be answerable with a specific fact, not a discussion.

REQUIREMENT:
"""
{{REQUIREMENT_DOC}}
"""

Now produce the ambiguity table, highest risk first.
```

⚠️ **This is the highest-ROI card in the library.** A requirement gap caught here costs minutes. The same gap caught in UAT costs days.

**Follow-ups:**
- `Which of these gaps, if left unresolved, is most likely to cause a production defect? Explain the failure scenario.`
- `Draft a single Slack message to the BA covering the top 5 questions, ordered so the most blocking one is first.`

---

## A2 · Test Plan

**When to use:** Start of a release or project, when a signed-off plan document is required.
**You'll need:** Requirement doc + **your company's test plan template**
**Category:** Requirements & Analysis
**Subcategory:** Test Planning
**Tags:** Requirements, Planning, Documentation
**Testing type:** Manual
**Difficulty:** Intermediate
**Quality:** 4
**Time saved:** 30-45 min
**Output:** Markdown
**Last updated:** 2026-07-22
**Variables:**
- `PROJECT_NAME` — Project name
- `RELEASE` — Release / sprint
- `TEAM_SIZE_AND_DURATION` — Team size & timeline
- `YOUR_TEST_PLAN_TEMPLATE` — Your test plan template
- `REQUIREMENT_DOC` — Requirement doc

```
Act as a test lead drafting a test plan for stakeholder sign-off.

Use EXACTLY the template structure provided — same section names, same order.
Do not add, remove, or rename sections.

Rules:
- Fill each section only from the requirement. Where the requirement is silent,
  write "TBD — [the specific fact you need]" rather than inventing content.
- Be concrete: name actual modules, actual browsers, actual roles. Reject generic
  filler like "testing will be performed as required."
- Every claim must be defensible in a sign-off meeting.
- No section may be left empty.

PROJECT: {{PROJECT_NAME}}
RELEASE / SPRINT: {{RELEASE}}
TEAM & TIMELINE: {{TEAM_SIZE_AND_DURATION}}

TEMPLATE TO FOLLOW:
"""
{{YOUR_TEST_PLAN_TEMPLATE}}
"""

REQUIREMENT:
"""
{{REQUIREMENT_DOC}}
"""

Now produce the test plan following the template exactly, marking unknowns as TBD.
```

⚠️ **The template field is the whole card.** Without it you get a generic internet test plan — roughly 60% useful. With it, you get *yours*. Make this field prominent and encourage saving a default.

**Follow-ups:**
- `List every TBD you produced as a checklist of decisions I need to chase, with who likely owns each.`
- `Which sections are the weakest and why?`

---

## A3 · Test Strategy

**When to use:** Defining *how* your org tests — broader and longer-lived than a per-project plan.
**You'll need:** Product description, tech stack, team context
**Category:** Requirements & Analysis
**Subcategory:** Test Strategy
**Tags:** Requirements, Planning, Strategy
**Testing type:** Manual
**Difficulty:** Advanced
**Quality:** 4
**Time saved:** 30-45 min
**Output:** Markdown
**Last updated:** 2026-07-22

```
Act as a QA architect defining a test strategy.

A test strategy describes the APPROACH, not the schedule. Do not include
sprint dates, individual names, or per-story detail — that belongs in a test plan.

Cover:
1. Testing objectives tied to actual business risk (not "ensure quality")
2. Test levels — unit / integration / system / E2E — and who owns each
3. Test types in scope, and explicitly what is OUT of scope
4. Automation strategy: what gets automated, what stays manual, and the reasoning
5. Environment and test data approach
6. Entry / exit criteria per level
7. Defect management workflow
8. Risks to the strategy itself, with mitigations

Rules:
- Every "in scope" decision needs a one-line justification.
- Be explicit about trade-offs. A strategy with no trade-offs is a wish list.
- Test pyramid ratios must be justified against this product, not quoted as dogma.
- If the context below is insufficient for a section, say what you need.

PRODUCT: {{PRODUCT_DESCRIPTION}}
TECH STACK: {{STACK}}
TEAM: {{TEAM_COMPOSITION}}
CONSTRAINTS: {{TIMELINE_BUDGET_TOOLING}}

Now produce the test strategy.
```

**Follow-ups:**
- `What's the most expensive assumption in this strategy, and what happens if it's wrong?`

---

## A4 · Test Estimation

**When to use:** Sprint planning, release planning, or when asked "how long will testing take?"
**You'll need:** Scope list / backlog items
**Category:** Requirements & Analysis
**Subcategory:** Estimation
**Tags:** Planning, Estimation
**Testing type:** Manual
**Difficulty:** Intermediate
**Quality:** 4
**Time saved:** 15-20 min
**Output:** Markdown table
**Last updated:** 2026-07-22

```
Act as a test lead producing an estimate for planning.

Break the scope below into work items. For each: Item | Complexity (S/M/L) |
Optimistic (h) | Most Likely (h) | Pessimistic (h) | Expected (h) | Assumptions

Use the 3-point formula: Expected = (O + 4×M + P) / 6

Rules:
- Include effort people forget: environment setup, test data creation,
  regression, defect retest cycles, reporting, meetings.
- Every item needs at least one explicit assumption. An estimate without
  assumptions is a guess wearing a suit.
- Add a risk buffer line and justify the percentage with a named risk.
- If an item is too vague to estimate, output "CANNOT ESTIMATE — need [X]"
  rather than producing a number.
- Do not pad silently. Padding goes in the buffer line where it's visible.

SCOPE:
{{SCOPE_ITEMS}}
TEAM AVAILABLE: {{TEAM}}
KNOWN CONSTRAINTS: {{CONSTRAINTS}}

Now produce the estimate table, then a total with buffer.
```

⚠️ Treat the output as a **starting point for negotiation**, not a commitment. The assumptions column is the part you defend.

---

## A5 · Risk-Based Test Prioritization

**When to use:** When there isn't time to test everything — which is always.
**You'll need:** Feature list + any known defect history
**Category:** Requirements & Analysis
**Subcategory:** Risk Assessment
**Tags:** Risk, Planning, Prioritization
**Testing type:** Manual
**Difficulty:** Advanced
**Quality:** 4
**Time saved:** 20-30 min
**Output:** Markdown table
**Last updated:** 2026-07-22

```
Act as a QA lead applying risk-based testing.

Score each feature below:
- Business Impact if it fails (1-5) — revenue, legal, safety, reputation
- Likelihood of failure (1-5) — code churn, complexity, defect history,
  dependency count, team familiarity
- Risk Score = Impact × Likelihood

Output: Feature | Impact | Impact reasoning | Likelihood | Likelihood reasoning |
Risk Score | Recommended depth (Exhaustive / Standard / Smoke only / Not tested)

Then, in a separate section titled "Risk we are accepting", state explicitly:
- What you recommend NOT testing
- The specific failure that could reach production because of that choice
- What would have to be true for that to be an acceptable trade

Rules:
- Do not score everything 4-5. Forcing prioritization is the point of this exercise.
- Reasoning must reference something concrete from the input, not generic statements.

FEATURES: {{FEATURE_LIST}}
DEFECT HISTORY: {{PAST_DEFECTS_OR_NONE}}
RECENT CHANGES: {{WHAT_CHANGED_THIS_RELEASE}}
TIME AVAILABLE: {{TIME}}

Now produce the risk table, highest score first.
```

⚠️ **"Risk we are accepting" is the section that matters.** Anyone can list what to test. Stating what you're deliberately not testing — and owning it — is the senior move.

---

## A6 · Requirements Traceability Matrix

**When to use:** Audit, compliance, or proving coverage to stakeholders.
**You'll need:** Requirement IDs + test case IDs
**Category:** Requirements & Analysis
**Subcategory:** Traceability
**Tags:** Requirements, Traceability, Coverage
**Testing type:** Manual
**Difficulty:** Intermediate
**Quality:** 4
**Time saved:** 15-20 min
**Output:** Markdown table
**Last updated:** 2026-07-22

```
Act as a QA analyst building a Requirements Traceability Matrix.

Map every requirement to its covering test cases.

Output: Req ID | Requirement summary | Test Case IDs | Coverage
(Full / Partial / NONE) | Gap note

Then produce two summary sections:
1. UNCOVERED REQUIREMENTS — requirements with no test case. This is the point
   of the exercise; do not bury it.
2. ORPHAN TESTS — test cases that map to no requirement. Either the requirement
   is undocumented or the test is unnecessary. Flag which you suspect.

Rules:
- Do not mark coverage as Full unless the test cases verify every clause of
  the requirement, including negative behaviour.
- If mapping is ambiguous, mark Partial and explain — never assume.

REQUIREMENTS:
{{REQUIREMENTS_LIST}}
TEST CASES:
{{TEST_CASE_LIST}}

Now produce the RTM, then the uncovered and orphan sections.
```

---

# B. Test Design

---

## B1 · Test Scenarios

**When to use:** The layer between requirements and test cases. Get agreement here before writing 200 cases.
**You'll need:** Feature description
**Category:** Test Design
**Subcategory:** Test Scenarios
**Tags:** Test Design, Manual, Scenarios
**Testing type:** Manual
**Difficulty:** Beginner
**Quality:** 4
**Time saved:** 15-20 min
**Output:** Markdown table
**Last updated:** 2026-07-22

```
Act as a QA engineer identifying test scenarios.

A scenario is WHAT to test, not HOW. One line each. No steps, no test data.

Generate scenarios for the feature below, grouped by:
- Happy path
- Alternate flows
- Negative / error handling
- Boundary conditions
- Integration points (what this feature touches)
- Non-functional angles worth checking

Rules:
- One scenario per line, starting with a verb: "Verify that...", "Validate...".
- No implementation detail. No locators, no exact data values.
- Aim for coverage breadth, not depth — depth comes at the test case stage.
- Flag any scenario you cannot confirm from the description with [ASSUMPTION].

FEATURE: {{FEATURE_DESCRIPTION}}
BUSINESS RULES: {{RULES}}

Now produce the scenario list, grouped.
```

**Follow-ups:**
- `Which scenarios would a scripted regression suite typically miss? Add those.`
- `Rank these by risk and mark the minimum set for a smoke test.`

---

## B2 · Test Case Generation ⭐

**When to use:** The core workflow. Turning a feature into executable cases.
**You'll need:** Feature + **field-by-field detail** (or a screenshot)
**Category:** Test Design
**Subcategory:** Test Case Design
**Tags:** Test Design, Manual, Coverage
**Testing type:** Manual
**Difficulty:** Intermediate
**Quality:** 5
**Time saved:** 30-40 min
**Output:** Markdown table
**Last updated:** 2026-07-22
**Variables:**
- `FEATURE_NAME` — Feature name
- `FIELD_LIST` — Field-by-field detail (name, type, validation, mandatory)
- `BUSINESS_RULES` — Business rules

```
Act as a QA engineer writing test cases for direct Jira bulk upload.

Generate test cases for the feature below.

FORMAT — a markdown table with exactly these columns:
{{YOUR_COLUMNS}}
(default: Test Case ID | Module | Title | Precondition | Test Steps | Test Data |
Expected Result | Priority | Type | Technique)

COVERAGE — apply these techniques and name the technique in the last column:
- Equivalence partitioning: at least one valid and one invalid class per field
- Boundary value analysis: min-1, min, min+1, max-1, max, max+1
- Field-level validation for EVERY field listed below — none skipped
- Negative and error handling
- State transitions where applicable

Rules:
- ONE assertion per test case. Never "verify everything works correctly."
- Test Steps: numbered, and executable by someone who has never seen this app.
- Expected Result: observable. A specific message, state, value, or status code.
  Never "user should be able to..." — that is not verifiable.
- If a field's validation rule is not specified below, output
  [NEEDS CLARIFICATION: what rule?] instead of assuming one.
- Output ONLY the table. No prose before or after — this is being pasted directly.

FEATURE: {{FEATURE_NAME}}
FIELDS (name | type | validation | mandatory?):
{{FIELD_LIST}}
BUSINESS RULES:
{{BUSINESS_RULES}}

Now generate the test cases, grouped by module.
```

**Short version:**
```
Act as a QA engineer writing test cases.

Generate test cases for the feature below as a markdown table: Test Case ID | Title | Steps | Expected Result | Priority.

Cover the happy path, key validation rules, and obvious negative cases. One assertion per test case. Output only the table.

FEATURE: {{FEATURE_NAME}}
FIELDS: {{FIELD_LIST}}
BUSINESS RULES: {{BUSINESS_RULES}}

Now generate the test cases.
```

**Expert version:**
```
Act as a senior QA engineer producing an audit-ready test case suite for direct Jira bulk upload.

Generate test cases for the feature below.

FORMAT — a markdown table with exactly these columns:
{{YOUR_COLUMNS}}
(default: Test Case ID | Module | Title | Precondition | Test Steps | Test Data |
Expected Result | Priority | Type | Technique | Risk Justification)

COVERAGE — apply every technique below and name it in the Technique column; do not skip a technique because it feels redundant:
- Equivalence partitioning: at least one valid and one invalid class per field
- Boundary value analysis: min-1, min, min+1, max-1, max, max+1
- Pairwise/combinatorial coverage for any two or more fields that interact (e.g. role × permission, date range pairs)
- Field-level validation for EVERY field listed below — none skipped
- Negative and error handling, including malformed/injection-class input (standard published detection strings only)
- State transitions where applicable
- Accessibility: keyboard-only completion of the flow, screen-reader label presence
- Localization: Unicode input (Arabic RTL, CJK, emoji), locale-specific date/number formats

Rules:
- ONE assertion per test case. Never "verify everything works correctly."
- Test Steps: numbered, and executable by someone who has never seen this app.
- Expected Result: observable. A specific message, state, value, or status code.
  Never "user should be able to..." — that is not verifiable.
- Risk Justification: one line — why this case matters if it fails in production.
- If a field's validation rule is not specified below, output
  [NEEDS CLARIFICATION: what rule?] instead of assuming one.
- Output ONLY the table. No prose before or after — this is being pasted directly.

FEATURE: {{FEATURE_NAME}}
FIELDS (name | type | validation | mandatory?):
{{FIELD_LIST}}
BUSINESS RULES:
{{BUSINESS_RULES}}

Now generate the test cases, grouped by module, highest risk first within each module.
```

⚠️ **Field detail is what separates a usable output from a generic one.** If the user has a screenshot, tell them to attach it — vision models read forms accurately. If not, the field list field is mandatory. Consider making the card refuse to submit without one.

**Follow-ups (ship all three as buttons):**
- `What edge cases did you miss? Specifically consider: SQL injection, XSS, Unicode input (Arabic RTL, Chinese, emoji), leading/trailing whitespace, session timeout mid-flow, and rapid double-click submission.`
- `Group these into positive and negative sets and add a Priority column justified by risk.`
- `Which of these should be automated first and why? Which should stay manual?`

---

## B3 · Boundary Value & Equivalence Partitioning

**When to use:** Any numeric, date, or length-constrained field. Highest defect-per-test ratio of any technique.
**You'll need:** Field list with ranges
**Category:** Test Design
**Subcategory:** Boundary Value Analysis
**Tags:** Test Design, Boundary, Equivalence
**Testing type:** Manual
**Difficulty:** Intermediate
**Quality:** 4
**Time saved:** 15-20 min
**Output:** Markdown table
**Last updated:** 2026-07-22

```
Act as a QA engineer applying formal test design techniques.

For each field below, produce:

PART 1 — Equivalence Classes
Field | Valid classes | Invalid classes | One representative value per class

PART 2 — Boundary Values
Field | min-1 | min | min+1 | max-1 | max | max+1 | Expected behaviour at each

Rules:
- Include the boundaries most people forget: zero, negative, empty string, null,
  the value exactly at the limit, and one unit past it.
- For dates: leap day (29 Feb), month ends, DST transitions, year boundaries,
  timezone edges.
- For strings: 0 chars, 1 char, exactly max, max+1, and whitespace-only.
- State expected behaviour for every boundary. "Should error" is not enough —
  say WHICH error.
- If a boundary is undefined in the spec, flag it. Undefined boundaries are
  where production defects live.

FIELDS:
{{FIELDS_WITH_RANGES}}

Now produce both parts.
```

---

## B4 · Decision Table

**When to use:** Business logic with multiple interacting conditions (discounts, eligibility, pricing, permissions).
**You'll need:** The rules
**Category:** Test Design
**Subcategory:** Decision Tables
**Tags:** Test Design, Decision Table
**Testing type:** Manual
**Difficulty:** Intermediate
**Quality:** 4
**Time saved:** 15-20 min
**Output:** Markdown table
**Last updated:** 2026-07-22

```
Act as a QA engineer building a decision table.

Convert the business rules below into a decision table.

Structure:
- Rows: conditions (top) and actions (bottom)
- Columns: each rule / combination
- Cells: Y / N / — for conditions; X for triggered actions

Then produce:
1. The full table
2. COLLAPSED table — merge columns where a condition is irrelevant (—)
3. One test case per surviving column
4. IMPOSSIBLE COMBINATIONS — combinations that cannot occur, and why
5. UNDEFINED COMBINATIONS — combinations the rules don't cover ⚠️

Rules:
- Section 5 is the reason to do this exercise. Do not skip it or hand-wave it.
- Do not guess what an undefined combination should do. Flag it as a question.

BUSINESS RULES:
{{RULES}}

Now produce all five sections.
```

⚠️ Undefined combinations are the classic source of "nobody thought of that" production bugs. This card exists to surface them.

---

## B5 · State Transition Testing

**When to use:** Anything with a lifecycle — orders, tickets, sessions, approvals, subscriptions.
**You'll need:** States + allowed transitions
**Category:** Test Design
**Subcategory:** State Transition Testing
**Tags:** Test Design, State Transition
**Testing type:** Manual
**Difficulty:** Intermediate
**Quality:** 4
**Time saved:** 15-20 min
**Output:** Markdown table
**Last updated:** 2026-07-22

```
Act as a QA engineer designing state transition tests.

For the system below, produce:

1. STATE TABLE — Current State | Event | Next State | Guard condition
2. VALID TRANSITION TESTS — one per legal transition
3. INVALID TRANSITION TESTS — attempt every ILLEGAL transition and define the
   expected rejection. This is where real defects hide.
4. UNREACHABLE STATES — states with no path in
5. DEAD-END STATES — states with no path out (flag whether intentional)
6. Suggested coverage level (0-switch / 1-switch) and why

Rules:
- Section 3 must be exhaustive. For N states, systematically consider all N×N
  transitions and mark each legal or illegal.
- For each illegal transition, define the specific expected behaviour —
  error message, silent ignore, or exception. "Should not work" is not testable.
- Flag any transition the spec doesn't define.

STATES: {{STATES}}
EVENTS: {{EVENTS}}
DEFINED TRANSITIONS: {{TRANSITIONS}}

Now produce all six sections.
```

---

## B6 · Pairwise / Combinatorial

**When to use:** Config explosion — browsers × OS × roles × payment methods × locales.
**You'll need:** Parameters + their values
**Category:** Test Design
**Subcategory:** Combinatorial Testing
**Tags:** Test Design, Pairwise, Combinatorial
**Testing type:** Manual
**Difficulty:** Advanced
**Quality:** 4
**Time saved:** 15-20 min
**Output:** Markdown table
**Last updated:** 2026-07-22

```
Act as a QA engineer applying combinatorial test design.

Parameters and values:
{{PARAMETERS_AND_VALUES}}

Produce:
1. Total exhaustive combination count (show the multiplication)
2. A pairwise (2-wise) covering set — every pair of values from every pair of
   parameters appears at least once
3. The reduction achieved (exhaustive → pairwise, as a percentage)
4. CONSTRAINTS — combinations that are invalid or impossible, excluded and why
5. FORCED COMBINATIONS — high-risk combos that must be tested regardless of
   whether pairwise selected them (production traffic, known-fragile pairings)

Rules:
- Verify your covering set actually achieves pairwise coverage. State how you
  checked.
- Pairwise catches interaction defects between two parameters. It does NOT catch
  3-way interactions. State this limitation explicitly and name any 3-way
  combination that warrants a forced test.

Now produce all five sections.
```

⚠️ ⚠️ **Verify the covering set before trusting it.** Generating a correct pairwise array is a combinatorial algorithm, and models make silent arithmetic errors here. For anything critical, cross-check with a dedicated tool (PICT, AllPairs). This card is for a fast draft, not a proof.

---

## B7 · Test Data Generation

**When to use:** You need realistic, adversarial data for a form or API.
**You'll need:** Field list with types
**Category:** Test Design
**Subcategory:** Test Data Generation
**Tags:** Test Design, Data, Boundary, Security
**Testing type:** Manual
**Difficulty:** Intermediate
**Quality:** 4
**Time saved:** 15-20 min
**Output:** Markdown table
**Last updated:** 2026-07-22
**Variables:**
- `FIELD_LIST` — Field list with types and constraints

```
Act as a QA engineer preparing test data.

Generate test data for the fields below covering every category:

- Valid / happy path
- Boundary: min, max, min-1, max+1, empty, null
- Type violations: text in numeric, numeric in date, etc.
- Format violations: malformed email, phone, postcode
- Whitespace: leading, trailing, only-spaces, tabs, newlines
- Length: 1 char, exactly at limit, limit+1, 10,000 chars
- Unicode: Arabic (RTL), Chinese (CJK), emoji, accented Latin, combining chars
- Injection detection strings: standard published SQLi and XSS test strings
- Special characters: quotes, backslashes, angle brackets, null bytes

Output: Field | Value | Category | Expected Behaviour | Priority

Rules:
- Synthetic data only. Never generate anything resembling real PII, real card
  numbers (use standard test card numbers), or real emails at real domains.
- Use only well-known published detection strings for injection categories —
  the goal is to verify input handling, not to build an exploit.
- Expected behaviour must be specific: which error, which field, which message.

FIELDS (name | type | constraints):
{{FIELD_LIST}}

Now produce the test data table, grouped by field.
```

⚠️ Use domains like `example.com` and standard test card numbers. Never paste real customer data into any AI tool.

---

## B8 · BDD / Gherkin from User Story

**When to use:** Converting a story + AC into feature files.
**You'll need:** User story + acceptance criteria
**Category:** Test Design
**Subcategory:** BDD/Gherkin
**Tags:** Test Design, BDD, Gherkin
**Technologies:** Cucumber, Gherkin
**Testing type:** Manual, Automation
**Difficulty:** Intermediate
**Quality:** 5
**Time saved:** 20-30 min
**Output:** Gherkin
**Last updated:** 2026-07-22
**Variables:**
- `USER_STORY` — User story
- `ACCEPTANCE_CRITERIA` — Acceptance criteria

```
Act as a BDD practitioner writing feature files.

Convert the user story below into Gherkin.

Rules — these are the ones that matter:
- DECLARATIVE, not imperative. Write "When the user submits invalid credentials",
  NOT "When the user clicks #username and types 'x' and clicks #submit".
  UI mechanics belong in step definitions, never in the feature file.
- One behaviour per scenario. If a scenario has two Thens testing two different
  things, split it.
- Use Scenario Outline + Examples when the same behaviour repeats with different
  data. Do not copy-paste near-identical scenarios.
- Background only for genuinely shared preconditions — not as a dumping ground.
- Every Then is a single observable outcome.
- No technical detail: no locators, no endpoints, no SQL, no status codes unless
  the story is explicitly about an API contract.
- The feature file should be readable by a product owner who has never seen code.
- If an acceptance criterion is untestable as written, flag it rather than
  inventing a testable version.

USER STORY:
{{USER_STORY}}
ACCEPTANCE CRITERIA:
{{ACCEPTANCE_CRITERIA}}

Now produce the feature file.
```

⚠️ Imperative Gherkin is the most common BDD failure. The declarative rule above is doing most of the work in this prompt — don't trim it.

**Follow-ups:**
- `Generate the step definitions in {{LANGUAGE}} using {{FRAMEWORK}}, keeping all UI detail here rather than in the feature file.`

---

# C. Execution & Defects

---

## C1 · Exploratory Testing Charters

**When to use:** Time-boxed discovery. Finds what scripted tests structurally cannot.
**You'll need:** The area to explore
**Category:** Execution
**Subcategory:** Exploratory Testing
**Tags:** Exploratory, Manual, Charter
**Testing type:** Manual
**Difficulty:** Intermediate
**Quality:** 4
**Time saved:** 15-20 min
**Output:** Markdown
**Last updated:** 2026-07-22

```
Act as an exploratory testing coach using session-based test management.

Design {{N}} exploratory charters for the area below.

Format each as:
EXPLORE (target) WITH (resources) TO DISCOVER (information)

Then for each: Timebox (mins) | Test ideas to try | Oracles (how you'll know
it's wrong) | Risk being investigated

Rules:
- Charters are about DISCOVERY, not confirmation. If it can be written as a
  scripted test case, it is not a charter — rewrite it.
- Name the oracle explicitly for each. "It looks wrong" is not an oracle.
  Valid oracles: a spec, a comparable product, consistency with itself,
  user expectation, a standard.
- Include at least two charters targeting what a scripted suite structurally
  misses: interruptions, concurrency, stale state, back-button, session expiry,
  network drop mid-transaction, rapid repeated actions.
- Vary the lens: some charters should be data-focused, some flow-focused,
  some stress-focused.

AREA: {{AREA_OR_FEATURE}}
KNOWN RISKS: {{RISKS_OR_UNKNOWN}}
TIME AVAILABLE: {{TIME}}

Now produce the charters.
```

⚠️ Underused technique. Exploratory testing finds the defects scripted suites are blind to by design — because a scripted suite can only check what someone already thought of.

---

## C2 · Bug Report

**When to use:** Turning rough observation into something a dev can act on with zero follow-up questions.
**You'll need:** Your raw notes
**Category:** Execution
**Subcategory:** Defect Reporting
**Tags:** Defects, Reporting, Manual
**Testing type:** Manual
**Difficulty:** Beginner
**Quality:** 5
**Time saved:** 10-15 min
**Output:** Markdown
**Last updated:** 2026-07-22
**Variables:**
- `YOUR_NOTES` — Your raw notes

```
Act as a QA engineer filing a defect.

Turn the raw notes below into a bug report a developer can act on without asking
a single follow-up question.

Output:
**Summary:** one line — what's broken, where, under what condition.
  Never "doesn't work" or "issue with X".
**Environment:** build, OS, browser/device, environment
**Preconditions:**
**Steps to Reproduce:** numbered and MINIMAL
**Expected Result:**
**Actual Result:**
**Frequency:** always / intermittent (X of Y attempts)
**Severity + justification:**
**Attachments to capture:**
**Missing info I need to add:**

Rules:
- Steps must be MINIMAL. Strip every step that isn't required to trigger the bug.
  A 12-step repro that could be 4 steps wastes developer time.
- Separate OBSERVATION from INTERPRETATION. Report what was seen. Any theory
  about the cause goes under a clearly labelled "Possible cause (unverified)"
  and nowhere else.
- If a detail needed for reproduction is missing from my notes, list it under
  "Missing info I need to add" — do NOT invent it.
- Expected Result must cite the source: the requirement, the spec, or the
  reasonable-user standard. State which.

RAW NOTES:
{{YOUR_NOTES}}

Now produce the bug report.
```

⚠️ The observation/interpretation split is what makes a report credible. A report that asserts a wrong cause gets dismissed along with the actual bug.

**Follow-ups:**
- `Reduce the reproduction steps to the absolute minimum. Which steps can be removed and still trigger it?`
- `Write the {{JIRA/Azure/Linear}} formatted version ready to paste.`

---

## C3 · Bug Triage — Severity vs Priority

**When to use:** Grooming a defect backlog, or defending a severity call.
**You'll need:** Bug list
**Category:** Execution
**Subcategory:** Defect Triage
**Tags:** Defects, Triage, Severity, Priority
**Testing type:** Manual
**Difficulty:** Intermediate
**Quality:** 4
**Time saved:** 10-15 min
**Output:** Markdown table
**Last updated:** 2026-07-22

```
Act as a QA lead triaging defects.

Severity and Priority are independent. Do not conflate them.
- SEVERITY = technical impact if it occurs (Critical / High / Medium / Low)
- PRIORITY = business urgency to fix (P1 / P2 / P3 / P4)

For each defect: ID | Summary | Severity + why | Priority + why | Recommended
action (Fix now / Fix this release / Backlog / Won't fix + rationale)

Then produce a section on ANY defect where severity and priority diverge
sharply — a High-severity/P4 or a Low-severity/P1. These are the ones that get
argued about; pre-arm the justification.

Rules:
- Do not mark everything Critical/P1. If everything is urgent, nothing is.
- Priority reasoning must reference business impact: users affected, revenue,
  workaround availability, reputational or legal exposure.
- For any "Won't fix", state the risk being accepted in plain language.

DEFECTS:
{{DEFECT_LIST}}
RELEASE CONTEXT: {{TIMELINE_AND_CONSTRAINTS}}

Now produce the triage table, then the divergence section.
```

---

## C4 · Root Cause Analysis — Five Whys

**When to use:** A defect with a likely single causal chain. Fast RCA for a ticket.
**You'll need:** The problem statement
**Category:** Execution
**Subcategory:** Root Cause Analysis
**Tags:** RCA, Defects, Five Whys
**Testing type:** Manual
**Difficulty:** Intermediate
**Quality:** 4
**Time saved:** 15-20 min
**Output:** Markdown
**Last updated:** 2026-07-22
**Variables:**
- `PROBLEM_STATEMENT` — Problem statement
- `EVIDENCE` — What we know

```
Act as a Root Cause Analyst.

Problem: {{PROBLEM_STATEMENT}}
What we know: {{EVIDENCE}}

Ask "why" this problem exists. Then repeat "why" against your own answer four
more times, digging one layer deeper each time.

Rules:
- Stop descending when you reach something ACTIONABLE — a process, a decision,
  or a missing control. "Human error" and "someone forgot" are not root causes;
  they are the point at which you have stopped thinking.
- Each Why must follow logically from the previous answer. Do not jump layers.
- If a link in the chain is a guess rather than something the evidence supports,
  label it [ASSUMPTION — needs verification].
- The final Why should reveal a SYSTEMIC gap, not an individual's mistake.

Then produce:
- ROOT CAUSE (one sentence)
- IMMEDIATE FIX (stops the bleeding now)
- SYSTEMIC FIX (prevents this entire class of defect recurring)
- HOW WE'D KNOW IT WORKED (the signal that confirms the fix)
```

⚠️ If your chain terminates at "the tester missed it", you stopped one Why too early. Keep going until you find the *process* that made the miss likely.

---

## C5 · Root Cause Analysis — Fishbone (Ishikawa)

**When to use:** Cause unknown, or multiple factors likely converged. Team retro after an incident.
**You'll need:** The problem statement
**Category:** Execution
**Subcategory:** Root Cause Analysis
**Tags:** RCA, Defects, Fishbone
**Testing type:** Manual
**Difficulty:** Advanced
**Quality:** 4
**Time saved:** 15-20 min
**Output:** Markdown
**Last updated:** 2026-07-22

```
Act as a Quality Improvement Specialist.

Build an Ishikawa (fishbone) analysis for: {{PROBLEM_STATEMENT}}

Explore causes across EXACTLY these four categories — do not substitute your own:
- PEOPLE — skills, awareness, communication, handoffs
- PROCESS — workflow gaps, missing checks, unclear ownership
- TECHNOLOGY — code, architecture, tooling, test infrastructure
- ENVIRONMENT — test data, staging fidelity, timing, external dependencies

For each category: list 2-4 contributing causes, then break each into sub-causes.

Then produce:
1. The full breakdown by category
2. RANKING — which single category most likely dominates, and why
3. THE ISOLATION TEST — for the top branch, what evidence would confirm or
   rule it out?
4. Preventive measure per category

Rules:
- These branches are meant to be INDEPENDENT contributors, not a chain. If your
  branches all depend on each other, use Five Whys instead and say so.
- Do not force content into a category. If Environment genuinely contributed
  nothing, say so — an empty branch is a finding.

CONTEXT: {{WHAT_HAPPENED}}
```

⚠️ **Naming the four categories explicitly is deliberate.** Left open, the model invents its own categories and results stop being comparable between analyses.

💡 **The pro combo:** Fishbone to map all branches → pick the dominant branch → Five Whys to drill into it.

---

## C6 · Defect Leakage / Escape Analysis

**When to use:** After any defect reaches production. Answers "why didn't we catch this?"
**You'll need:** The escaped defect + your test coverage for that area
**Category:** Execution
**Subcategory:** Defect Metrics
**Tags:** Defects, Metrics, Escape Analysis
**Testing type:** Manual
**Difficulty:** Advanced
**Quality:** 4
**Time saved:** 15-20 min
**Output:** Markdown
**Last updated:** 2026-07-22

```
Act as a QA manager conducting escape analysis.

A defect reached production. Determine why our process failed to catch it.

Analyse:
1. WHERE it should have been caught — unit / integration / system / UAT.
   Name the specific phase.
2. WHY that phase missed it. Classify as:
   - Test case never existed (design gap)
   - Test case existed but was wrong
   - Test case existed but wasn't run
   - Test case ran but the environment couldn't reproduce the condition
   - Requirement gap — nobody knew it should behave differently
3. WHY the gap existed — the process reason behind the reason
4. WHAT WOULD HAVE CAUGHT IT — the specific test, check, or gate
5. WHAT ELSE IS AT RISK — what other features share this same blind spot?

Rules:
- This is a process analysis, NOT a performance review. Do not attribute the
  escape to an individual. If your answer names a person, rewrite it as a
  system gap.
- Section 5 is the real deliverable. One escaped defect usually means a
  category of undetectable defects. Find the category.
- If the escape was an accepted risk rather than a miss, say so — those are
  different problems with different fixes.

DEFECT: {{DEFECT_DETAILS}}
OUR COVERAGE FOR THIS AREA: {{EXISTING_TESTS}}
WHEN/HOW IT WAS FOUND: {{DISCOVERY}}
```

⚠️ Section 5 is why this card exists. One escape usually reveals a class of blind spots, not a one-off.

---

# D. Automation

---

## D1 · Framework Scaffolding

**When to use:** Setting up a new automation project from zero.
**You'll need:** Language, tools, target
**Category:** Automation
**Subcategory:** Framework Setup
**Tags:** Automation, Framework, Setup
**Technologies:** Selenium, Playwright, pytest, TestNG, JUnit
**Testing type:** Automation
**Difficulty:** Intermediate
**Quality:** 4
**Time saved:** 45-60 min
**Output:** Markdown / code
**Last updated:** 2026-07-22
**Variables:**
- `Java / Python / JS / C#` — Language type=select options=Java,Python,JS,C#
- `Maven / Gradle / pip / npm` — Build tool type=select options=Maven,Gradle,pip,npm
- `TestNG / JUnit / pytest / Playwright Test` — Test framework type=select options=TestNG,JUnit,pytest,Playwright Test
- `Selenium / Playwright / Rest Assured / requests` — Automation library type=select options=Selenium,Playwright,Rest Assured,requests
- `Allure / ExtentReports / built-in` — Reporting type=select options=Allure,ExtentReports,built-in
- `IntelliJ / VS Code / PyCharm` — IDE type=select options=IntelliJ,VS Code,PyCharm

```
Act as an SDET setting up a new automation framework.

Give me step-by-step instructions to create:
LANGUAGE: {{Java / Python / JS / C#}}
BUILD TOOL: {{Maven / Gradle / pip / npm}}
TEST FRAMEWORK: {{TestNG / JUnit / pytest / Playwright Test}}
AUTOMATION: {{Selenium / Playwright / Rest Assured / requests}}
REPORTING: {{Allure / ExtentReports / built-in}}
IDE: {{IntelliJ / VS Code / PyCharm}}

Include: project creation, dependency file, folder structure, one working
smoke test proving the setup works, and how to run it.

CRITICAL RULES:
- For EVERY dependency, output the version as {{VERIFY_VERSION}} rather than a
  number, and add a note telling me where to check the current release.
  Do NOT supply version numbers from memory.
- Folder structure must separate: config, page objects/API clients, utilities,
  test data, tests, reports.
- The smoke test must be genuinely runnable, not pseudo-code.
- If a step depends on my environment (Java version, PATH, drivers), say so
  explicitly rather than assuming.
```

⚠️ ⚠️ **THE VERSION TRAP — this is the #1 documented failure in AI-assisted setup.**
Models supply dependency versions from training data, which is always stale. Real observed example: an AI confidently supplied TestNG 4.1 when the actual current release was 7.9 — the build broke, and the error message pointed nowhere near the real cause.
**Always check Maven Central / PyPI / npm yourself.** Consider having QA Deck link these directly on this card.

**Follow-ups:**
- `I'm getting this error: {{ERROR}}. What's the cause and fix?`
- `Add a CI config for {{Jenkins/GitHub Actions/GitLab}} that runs this on every PR.`

---

## D2 · Page Object Model

**When to use:** Structuring UI automation so it survives contact with a changing app.
**You'll need:** Page description or screenshot, and your existing POM if you have one
**Category:** Automation
**Subcategory:** Page Object Model
**Tags:** Automation, POM, Selenium, Playwright
**Technologies:** Selenium, Playwright
**Testing type:** Automation
**Difficulty:** Intermediate
**Quality:** 4
**Time saved:** 20-30 min
**Output:** Code
**Last updated:** 2026-07-22

```
Act as an SDET writing a Page Object.

Create a page object for the page described below in {{LANGUAGE}} using
{{FRAMEWORK}}.

{{IF_YOU_HAVE_ONE}} Match this existing page object's structure and conventions
exactly:
"""
{{EXISTING_POM_EXAMPLE}}
"""

Rules:
- Page objects expose BEHAVIOUR, not elements. Method names describe user
  intent: loginAs(user, pass), not clickSubmitButton().
- NO assertions inside the page object. Assertions live in tests.
- Methods that navigate away return the next page object.
- Locators: private, and ordered by preference — test id > accessible role/label
  > stable attribute > CSS. Never index-based or absolute XPath.
  If I haven't given you a stable locator, flag it as
  [NEEDS TEST ID] rather than inventing a fragile one.
- No hard waits. Use explicit waits on the actual condition — visible, clickable,
  or stable — never on mere presence.
- No test data hardcoded in the page object.

PAGE: {{PAGE_DESCRIPTION_OR_ATTACH_SCREENSHOT}}
ELEMENTS: {{ELEMENT_LIST_WITH_LOCATORS}}
```

⚠️ Attaching your existing page object is what makes the output match your codebase instead of a tutorial.

---

## D3 · UI Test Script

**When to use:** Writing an automated UI test from a manual test case.
**You'll need:** The test case + your framework conventions
**Category:** Automation
**Subcategory:** UI Automation
**Tags:** Automation, UI, Script
**Technologies:** Selenium, Playwright, Cypress
**Testing type:** Automation, Frontend
**Difficulty:** Intermediate
**Quality:** 4
**Time saved:** 20-30 min
**Output:** Code
**Last updated:** 2026-07-22

```
Act as an SDET automating a UI test.

Convert the manual test case below into an automated test in {{LANGUAGE}}
using {{FRAMEWORK}}.

{{IF_YOU_HAVE_ONE}} Follow this existing test's conventions exactly:
"""
{{EXISTING_TEST_EXAMPLE}}
"""

Rules:
- Use the page object pattern. No raw locators in the test body.
- NO hard sleeps. Explicit waits on the real condition only.
- One logical assertion per test. Use soft assertions only where multiple
  independent checks genuinely belong in one test.
- Assertion messages must say what was expected and what was found.
- Test must be independent: creates its own data, cleans up after itself,
  and passes when run in isolation OR in parallel OR in any order.
- No dependency on another test having run first.
- If the manual test case is ambiguous about the expected result, flag it
  rather than choosing an interpretation.

MANUAL TEST CASE:
{{TEST_CASE}}
```

---

## D4 · API Automation Script

**When to use:** Automating an API test.
**You'll need:** Endpoint details + sample response
**Category:** Automation
**Subcategory:** API Automation
**Tags:** Automation, API, Script
**Technologies:** REST Assured, requests, Playwright
**Testing type:** Automation, API, Backend
**Difficulty:** Intermediate
**Quality:** 4
**Time saved:** 20-30 min
**Output:** Code
**Last updated:** 2026-07-22

```
Act as an SDET automating an API test.

Create an API test in {{LANGUAGE}} using {{Rest Assured / requests / supertest}}.

ENDPOINT: {{METHOD}} {{URL}}
HEADERS: {{HEADERS}}
REQUEST BODY: {{BODY_OR_NA}}
EXPECTED RESPONSE:
"""
{{SAMPLE_RESPONSE}}
"""

Produce:
1. Positive test — status code, schema, and business-critical field values
2. 4-5 negative tests — invalid auth, malformed body, missing required field,
   non-existent resource, wrong content type
3. JSON schema validation against the response structure
4. The test runner config file

Rules:
- Assert on SCHEMA plus specific field values, not just status code.
  A 200 with a wrong body is still a bug.
- No hardcoded environment URLs — externalise to config.
- No credentials in code — read from env vars, and say which.
- Each negative test asserts the specific error code AND error message.
- For dependency versions, output {{VERIFY_VERSION}} — do not supply from memory.
```

⚠️ Never paste real API keys, tokens, or production endpoints into this field.

---

## D5 · Locator Strategy Review

**When to use:** Your suite breaks every time the UI changes.
**You'll need:** Your locators
**Category:** Automation
**Subcategory:** Locator Strategy
**Tags:** Automation, Locators, Review
**Technologies:** Selenium, Playwright
**Testing type:** Automation
**Difficulty:** Advanced
**Quality:** 4
**Time saved:** 15-20 min
**Output:** Markdown table
**Last updated:** 2026-07-22

```
Act as an SDET reviewing locator robustness.

For each locator below, assess its fragility and propose a better one.

Output: Current locator | Fragility (High/Med/Low) | Why it will break |
Recommended locator | Requires a dev change? (Y/N)

Preference order — state which tier each locator sits in:
1. Dedicated test id (data-testid) — best
2. Accessible role + name — good, and doubles as an a11y check
3. Stable semantic attribute (name, aria-label)
4. Text content — acceptable if not localised
5. Scoped CSS — last resort
6. XPath by position/index, auto-generated classes — never

Rules:
- Flag every locator that depends on: element position, sibling order,
  auto-generated class names, or styling.
- Where the fix needs a dev to add a test id, say so — that's a real ask
  with a real payoff, and worth raising.
- Do not recommend a locator you cannot verify exists from what I've given you.

LOCATORS:
{{LOCATOR_LIST}}
DOM SNIPPET (if available):
{{DOM}}
```

---

## D6 · Flaky Test Diagnosis ⭐

**When to use:** A test that passes sometimes. The highest-value automation card here.
**You'll need:** The test code + the failure pattern
**Category:** Automation
**Subcategory:** Flaky Test Diagnosis
**Tags:** Automation, Flaky Tests, Diagnosis
**Testing type:** Automation
**Difficulty:** Advanced
**Quality:** 5
**Time saved:** 30-45 min
**Output:** Markdown table
**Last updated:** 2026-07-22
**Variables:**
- `CODE` — The test code

```
Act as an SDET diagnosing test flakiness.

Identify every source of non-determinism in the test below, ranked by likelihood
of causing the described failure pattern.

Check specifically for:
- TIMING — hard sleeps; waiting on presence instead of the real condition
  (visible / clickable / network idle / animation complete); race between
  assertion and state settling
- SHARED STATE — test order dependency; data left behind by a previous run;
  static/global state; collisions under parallel execution
- TEST DATA — hardcoded IDs; data that expires; data another test mutates;
  assumptions about record count or ordering
- ENVIRONMENT — network latency; animations; lazy loading; virtualised lists;
  timezone or clock; CI resource contention
- LOCATORS — index or position based; matches multiple elements; resolves before
  the element is stable
- EXTERNAL — third-party service; real network calls; unstubbed dependency

Output: Cause | Evidence in the code | Fix | Confidence (High/Med/Low)

Rules:
- Do NOT suggest increasing sleep durations or adding retries. Both hide
  flakiness rather than fixing it. If retry is genuinely the only option,
  say so explicitly and justify it.
- Rank by likelihood given the stated failure pattern — a test that only fails
  in parallel points somewhere very different from one that fails at 9am daily.
- If the cause can't be determined from the code alone, say exactly what logs,
  traces, video, or timing data you'd need.

FAILURE PATTERN: {{e.g. fails ~1 in 5 runs, only in CI, only in parallel}}
TEST CODE:
"""
{{CODE}}
"""
```

**Short version:**
```
Act as an SDET diagnosing test flakiness.

Identify the most likely sources of non-determinism in the test below, ranked by likelihood.

Check for: hard waits/timing, shared test state, hardcoded test data, unstable locators, real network calls.

Output: Cause | Fix | Confidence (High/Med/Low)

Do NOT suggest retries or longer sleeps as the fix.

FAILURE PATTERN: {{e.g. fails ~1 in 5 runs, only in CI, only in parallel}}
TEST CODE:
"""
{{CODE}}
"""
```

**Expert version:**
```
Act as a principal SDET running a formal flakiness RCA.

Identify every source of non-determinism in the test below, ranked by likelihood
of causing the described failure pattern. Go deeper than a surface read — trace
the actual execution order and timing assumptions.

Check specifically for:
- TIMING — hard sleeps; waiting on presence instead of the real condition
  (visible / clickable / network idle / animation complete); race between
  assertion and state settling; assertion firing before an async state update flushes
- SHARED STATE — test order dependency; data left behind by a previous run;
  static/global state; collisions under parallel execution; shared fixtures
  mutated across tests
- TEST DATA — hardcoded IDs; data that expires; data another test mutates;
  assumptions about record count or ordering
- ENVIRONMENT — network latency; animations; lazy loading; virtualised lists;
  timezone or clock; CI resource contention; container cold-start variance
- LOCATORS — index or position based; matches multiple elements; resolves before
  the element is stable
- INFRASTRUCTURE DRIFT — browser/driver version mismatch between local and CI;
  flaky third-party test infrastructure (grid, device farm)
- EXTERNAL — third-party service; real network calls; unstubbed dependency

Output: Cause | Evidence in the code | Fix | Confidence (High/Med/Low) | Effort to fix (S/M/L)

Then produce:
- A MINIMAL REPRODUCTION — the smallest version of this test that still exhibits
  the failure, so it can be run in a tight loop to confirm the fix
- A FIX, as a ready-to-apply diff against the code below, for the single
  highest-confidence cause

Rules:
- Do NOT suggest increasing sleep durations or adding retries. Both hide
  flakiness rather than fixing it. If retry is genuinely the only option,
  say so explicitly and justify it.
- Rank by likelihood given the stated failure pattern — a test that only fails
  in parallel points somewhere very different from one that fails at 9am daily.
- If the cause can't be determined from the code alone, say exactly what logs,
  traces, video, or timing data you'd need.

FAILURE PATTERN: {{e.g. fails ~1 in 5 runs, only in CI, only in parallel}}
TEST CODE:
"""
{{CODE}}
"""
```

⚠️ **"Add a retry" is not a fix.** A retried flaky test is a defect you've agreed to stop seeing. The prompt blocks this on purpose.

---

## D7 · Test Code Review

**When to use:** Before merging test code — yours or a teammate's.
**You'll need:** The code
**Category:** Automation
**Subcategory:** Code Review
**Tags:** Automation, Code Review
**Testing type:** Automation
**Difficulty:** Advanced
**Quality:** 4
**Time saved:** 20-30 min
**Output:** Markdown
**Last updated:** 2026-07-22

```
Act as a senior SDET reviewing test code before merge.

Review the code below. For each finding: Severity (Blocker/Major/Minor/Nit) |
Line | Issue | Why it matters | Suggested fix

Check for:
- Reliability: hard waits, timing assumptions, order dependency, shared state
- Assertions: missing, weak (assertTrue with no message), multiple unrelated
  assertions in one test, asserting on implementation rather than behaviour
- Structure: page object violations, duplicated logic, test data in test bodies
- Maintainability: naming that doesn't say what's being tested, magic numbers,
  dead code, commented-out tests
- Coverage: what this test claims to cover vs what it actually verifies
- Cleanup: leaked data, unclosed resources, no teardown
- Security: hardcoded credentials, real data, committed secrets

Rules:
- Lead with Blockers. Do not bury a real problem under style nits.
- For each finding, explain the FAILURE it would cause — not just that it
  violates a rule.
- If the test would pass while the feature is broken, that is a Blocker.
  Say so loudly.
- Acknowledge what's done well. A review that's only negative gets ignored.

CODE:
"""
{{CODE}}
"""
```

---

## D8 · CI/CD Pipeline Config

**When to use:** Wiring your suite into CI.
**You'll need:** Repo details + tooling
**Category:** Automation
**Subcategory:** CI/CD
**Tags:** Automation, CI/CD, DevOps
**Technologies:** Jenkins, GitHub Actions, GitLab CI
**Testing type:** Automation
**Difficulty:** Advanced
**Quality:** 4
**Time saved:** 30-45 min
**Output:** YAML / config
**Last updated:** 2026-07-22

```
Act as an SDET configuring CI for a test suite.

Create a {{Jenkins / GitHub Actions / GitLab CI / Azure Pipelines}} config that:
- Triggers on: {{PR / merge to main / nightly / manual}}
- Runs: {{TEST_COMMAND}}
- Publishes: {{Allure / JUnit XML / HTML}} report
- Fails the build when: {{criteria}}

Include:
- Dependency and browser caching
- Parallel execution setup
- Artifact retention for reports, screenshots, and video on failure
- Secrets handled via the platform's secret store — NEVER in the config file
- A retry policy that is explicit and visible, not silent

Rules:
- Secrets referenced by name only. If your output contains anything resembling
  a credential, you have made an error.
- For action/plugin versions, output {{VERIFY_VERSION}} — do not supply from
  memory.
- Explain what each stage does — I need to maintain this, not just paste it.
- State any assumption about the runner environment explicitly.

REPO: {{LANGUAGE_AND_BUILD_TOOL}}
TEST TYPES: {{unit / api / e2e}}
```

⚠️ Review any generated CI config before committing. A pipeline that silently retries until green is worse than no pipeline.

---

# E. Specialized Testing

---

## E1 · API Contract & Schema Testing

**When to use:** Verifying an API honours its contract — the tests that catch breaking changes.
**You'll need:** API spec or sample responses
**Category:** API Testing
**Subcategory:** Contract Validation
**Tags:** API, Contract, Schema, Regression
**Technologies:** REST, OpenAPI, JSON Schema
**Testing type:** API, Backend
**Difficulty:** Advanced
**Quality:** 4
**Time saved:** 20-30 min
**Output:** Markdown table
**Last updated:** 2026-07-22

```
Act as an API test engineer designing contract tests.

For the API below, design tests covering:

1. SCHEMA — required fields present, types correct, no unexpected fields,
   nullable handling, nested object structure, array item shape
2. STATUS CODES — every documented code, plus the undocumented ones that will
   happen anyway (400, 401, 403, 404, 405, 409, 415, 422, 429, 500)
3. HEADERS — content-type, caching, CORS, rate limit headers, security headers
4. CONTRACT STABILITY — what a consumer depends on that must not change:
   field names, types, enum values, required-ness, pagination shape
5. BACKWARD COMPATIBILITY — which changes would break existing consumers

Output: Test ID | Category | What's verified | Request | Expected | Breaks
consumers if it fails? (Y/N)

Rules:
- Distinguish contract tests (does the API honour its promise?) from functional
  tests (does the business logic work?). This card is contract only.
- For section 5, be specific: "renaming userId to user_id breaks any consumer
  parsing that field" — not "changes may break things".
- If the spec doesn't define behaviour for a case, flag it. Undefined contract
  behaviour is a contract defect.

API SPEC / SAMPLE:
"""
{{SPEC_OR_SAMPLES}}
"""
```

---

## E2 · Performance Test Strategy

**When to use:** Before writing a single load script. Most perf testing fails here, not in the tooling.
**You'll need:** App description + expected load
**Category:** Performance Testing
**Subcategory:** Performance Strategy
**Tags:** Performance, Strategy, Load
**Testing type:** Performance
**Difficulty:** Advanced
**Quality:** 4
**Time saved:** 30-45 min
**Output:** Markdown
**Last updated:** 2026-07-22

```
Act as a performance test engineer designing a strategy.

Produce a performance test strategy for the system below.

Cover:
1. OBJECTIVES — tied to a real business threshold, not "make sure it's fast"
2. WORKLOAD MODEL — which user journeys, at what mix, at what rate.
   Base it on realistic behaviour, not uniform distribution.
3. TEST TYPES and what each answers:
   - Load — does it meet SLA at expected volume?
   - Stress — where does it break, and how does it break?
   - Spike — does it survive a sudden surge?
   - Soak — does it degrade over time (memory leaks, connection exhaustion)?
   - Volume — does it cope with large data sets?
4. METRICS + PASS/FAIL THRESHOLDS — response time percentiles (p50/p90/p95/p99),
   throughput, error rate, resource utilisation, saturation points
5. ENVIRONMENT — what fidelity is required, and what results are invalid without
6. TEST DATA — volume needed, and why production-like data volume matters
7. WHAT THIS WILL NOT TELL US — the limits of the exercise

Rules:
- Use PERCENTILES, never averages. An average response time hides the users
  having a bad time. Say this explicitly in the metrics section.
- Every threshold needs a source: an SLA, a competitor benchmark, or a stated
  business requirement. A threshold with no source is a number you made up —
  flag it as [NEEDS BUSINESS INPUT].
- If the environment can't support valid results, say so up front. A perf test
  on a downsized environment produces confident, wrong numbers.

SYSTEM: {{DESCRIPTION}}
EXPECTED LOAD: {{USERS_TPS_PEAK}}
SLA / TARGETS: {{TARGETS_OR_UNKNOWN}}
ENVIRONMENT: {{ENV_DETAILS}}
```

⚠️ **"Average response time" is how perf reports lie.** If your app averages 200ms but p99 is 8 seconds, 1 in 100 requests is a furious customer. The prompt enforces percentiles.

---

## E3 · Load Test Script

**When to use:** Building the actual script once the strategy exists.
**You'll need:** Endpoint/flow + load profile
**Category:** Performance Testing
**Subcategory:** Load Testing
**Tags:** Performance, Load, Script
**Technologies:** k6, JMeter, Gatling
**Testing type:** Performance
**Difficulty:** Advanced
**Quality:** 4
**Time saved:** 20-30 min
**Output:** Code
**Last updated:** 2026-07-22

```
Act as a performance engineer writing a load test script.

Create a {{JMeter / k6 / Gatling / Locust}} script for the flow below.

FLOW: {{USER_JOURNEY_STEPS}}
ENDPOINTS: {{ENDPOINTS_WITH_METHODS}}
AUTH: {{AUTH_TYPE}}
LOAD PROFILE: {{users}} users, {{rampup}} ramp-up, {{duration}} duration

Include:
- Realistic think time between steps — real users pause, load generators don't
- Correlation: extract dynamic values (tokens, IDs, CSRF) from responses and
  reuse them. Hardcoded session tokens make the test measure nothing.
- Parameterisation from a data file — every VU using the same login measures
  cache, not capacity
- Assertions on response validity, not just status code. A fast 200 returning
  an error page is not a pass.
- Thresholds matching the SLA
- Reporting output config

Rules:
- No hardcoded credentials — externalise and say how.
- Explain WHY each correlation is needed. Missed correlation is the most common
  reason a load test produces meaningless results.
- Flag anything requiring environment-specific setup.
- For tool/plugin versions, output {{VERIFY_VERSION}}.
```

⚠️ ⚠️ **Only run load tests against environments you own and are authorised to test.** Load testing third-party or shared infrastructure without written permission may be unlawful and will get you blocked.

---

## E4 · Performance Results Analysis

**When to use:** You have numbers and need to know what they mean.
**You'll need:** Results data
**Category:** Performance Testing
**Subcategory:** Results Analysis
**Tags:** Performance, Analysis, Metrics
**Testing type:** Performance
**Difficulty:** Advanced
**Quality:** 4
**Time saved:** 15-20 min
**Output:** Markdown
**Last updated:** 2026-07-22

```
Act as a performance engineer analysing test results.

Analyse the results below and produce:

1. VERDICT — pass / fail against the stated thresholds, first line, unambiguous
2. WHAT THE NUMBERS SAY — read the percentile spread, not the average.
   A wide p50→p99 gap means inconsistency; call it out.
3. BOTTLENECK HYPOTHESIS — where the constraint appears to be
   (app / DB / network / external dependency), and the evidence for it
4. IS THE TEST ITSELF VALID? — check for: load generator saturation, missing
   correlation, unrealistic think time, cache warming, insufficient data volume.
   An invalid test produces confident, wrong numbers.
5. WHAT I'D INVESTIGATE NEXT — specific, ordered
6. WHAT I CANNOT CONCLUDE from this data

Rules:
- Section 4 comes before any conclusion. If the test is invalid, say so and stop
  — do not analyse noise.
- Distinguish correlation from causation. "Response time rose as users rose"
  is not a root cause.
- Do not speculate about code you haven't seen. Say what you'd need.
- If error rate is non-zero, address it before discussing response times —
  fast failures look like good performance.

THRESHOLDS: {{SLA}}
RESULTS:
"""
{{RESULTS_DATA}}
"""
RESOURCE METRICS: {{CPU_MEM_DB_IF_AVAILABLE}}
```

---

## E5 · Security Test Checklist (OWASP)

**When to use:** Adding a security lens to functional QA.
**You'll need:** Feature description + tech context
**Category:** Security Testing
**Subcategory:** OWASP Checklist
**Tags:** Security, OWASP, Checklist
**Testing type:** Security
**Difficulty:** Advanced
**Quality:** 5
**Time saved:** 30-45 min
**Output:** Markdown table
**Last updated:** 2026-07-22
**Variables:**
- `FEATURE` — Feature type=text required
- `AUTH` — Auth model type=select options=OAuth2,JWT,Session,API Key,Basic Auth,None
- `WHAT_DATA_IT_HANDLES` — Data sensitivity type=textarea required

```
Act as a security-aware QA engineer — not a penetration tester.

Produce a security VERIFICATION checklist for the feature below, mapped to the
OWASP Top 10 and relevant ASVS controls.

For each applicable risk: OWASP category | What to verify | How to check it
(standard tooling or manual observation) | What a failure looks like |
Escalate to security specialist? (Y/N)

Cover as applicable: broken access control, injection, authentication and
session handling, sensitive data exposure, security misconfiguration, insecure
direct object references, rate limiting, security headers, error message leakage.

Rules:
- Scope this to verification a QA engineer can legitimately perform on a system
  their organisation authorises them to test.
- Do NOT include exploit code, weaponised payloads, or attack chains. Standard
  published detection strings only — the goal is to verify the control exists,
  not to breach it.
- Explicitly mark anything requiring a qualified security specialist. QA finding
  the gap is valuable; QA freelancing an exploit is not.
- For each item, state the control being verified — not the attack.

FEATURE: {{FEATURE}}
AUTH MODEL: {{AUTH}}
DATA SENSITIVITY: {{WHAT_DATA_IT_HANDLES}}
```

⚠️ **Authorisation is not optional.** Only test systems your organisation has explicitly authorised you to test. Findings go to your security team, never to a public channel.

---

## E6 · Accessibility Audit (WCAG)

**When to use:** WCAG conformance — legally required in many markets.
**You'll need:** Page/component description
**Category:** UI Testing
**Subcategory:** Accessibility
**Tags:** Accessibility, WCAG, UI
**Testing type:** Frontend
**Difficulty:** Intermediate
**Quality:** 4
**Time saved:** 20-30 min
**Output:** Markdown table
**Last updated:** 2026-07-22

```
Act as an accessibility specialist.

Produce a WCAG 2.2 Level AA audit checklist for the component below.

For each criterion: WCAG SC (number + name) | Level | What to check |
How to check (tool or manual) | Pass condition | Automatable? (Y/N/Partial)

Organise by POUR: Perceivable, Operable, Understandable, Robust.

Rules:
- Be explicit that automated tools catch roughly 30-40% of WCAG issues. Mark
  clearly which items REQUIRE manual or assistive-technology verification —
  keyboard-only navigation, screen reader announcement, focus order, focus
  visibility, and meaningful alt text cannot be automated.
- Include the checks people skip: focus order matching visual order, focus
  visible at all times, error identification announced to AT, target size,
  colour not used as the sole information carrier, 200% zoom without loss.
- Pass conditions must be specific and measurable: "contrast ratio at least
  4.5:1 for text under 18pt", not "sufficient contrast".
- If a criterion doesn't apply to this component, say so rather than padding.

COMPONENT: {{DESCRIPTION}}
INTERACTIONS: {{WHAT_USERS_DO}}
```

---

## E7 · Mobile Test Coverage

**When to use:** Native or hybrid mobile testing — where the failure modes have nothing to do with your business logic.
**You'll need:** App + feature description
**Category:** Mobile Testing
**Subcategory:** Coverage Strategy
**Tags:** Mobile, Coverage, Strategy
**Technologies:** Android, iOS
**Testing type:** Manual
**Difficulty:** Intermediate
**Quality:** 4
**Time saved:** 20-30 min
**Output:** Markdown table
**Last updated:** 2026-07-22

```
Act as a mobile QA engineer.

Produce a test coverage plan for the mobile feature below.

Cover the dimensions that don't exist on web:
1. INTERRUPTIONS — incoming call, alarm, notification, low battery warning
2. LIFECYCLE — background/foreground, force kill and relaunch, OS-initiated
   process death with state restoration, app update while data exists
3. NETWORK — WiFi, 5G, 4G, 3G, airplane mode, flaky/intermittent, WiFi↔cellular
   handover mid-request, captive portal, offline mode and sync-on-reconnect
4. PERMISSIONS — granted, denied, "only while using", revoked while running,
   first-launch flow vs later
5. DEVICE — screen sizes, notch/cutout/dynamic island, low storage, low memory,
   low battery, OS versions in your support matrix
6. INPUT — soft keyboard covering fields, rotation mid-input, autofill,
   copy/paste, hardware back button (Android), swipe-back (iOS)
7. PLATFORM CONVENTIONS — where iOS and Android should legitimately differ

Output: Category | Scenario | Steps | Expected | Priority | Real device required?

Rules:
- Interruption and lifecycle scenarios are where mobile defects actually live.
  Weight them accordingly — do not treat them as an afterthought.
- Mark clearly what an emulator CANNOT validate: real network conditions,
  actual battery/thermal behaviour, real camera/sensors, biometrics, push
  delivery, performance under real device constraints.
- State expected behaviour specifically. "App should handle it gracefully" is
  not testable.

APP: {{APP_DESCRIPTION}}
FEATURE: {{FEATURE}}
PLATFORMS: {{iOS/Android + versions}}
```

⚠️ Emulators can't validate real network, battery, thermal, biometrics, or push delivery. Budget real-device time for those categories.

---

## E8 · Cross-Browser Test Matrix

**When to use:** Deciding what to test where — without a 400-combination matrix nobody runs.
**You'll need:** App type + audience data
**Category:** UI Testing
**Subcategory:** Cross-Browser Testing
**Tags:** Cross-Browser, UI, Matrix
**Testing type:** Frontend
**Difficulty:** Intermediate
**Quality:** 4
**Time saved:** 15-20 min
**Output:** Markdown table
**Last updated:** 2026-07-22

```
Act as a QA engineer designing a cross-browser test matrix.

Produce a PRIORITISED matrix — not an exhaustive one. An exhaustive matrix
never gets run.

1. TIER 1 (full regression) — justify each entry with audience data or business
   requirement
2. TIER 2 (smoke only) — justify
3. TIER 3 (best effort / not tested) — state the risk being accepted
4. WHAT ACTUALLY DIFFERS between engines — be specific:
   Blink vs Gecko vs WebKit rendering, date/number input handling, CSS feature
   support, font rendering, scroll behaviour, storage limits, autoplay policy
5. WHAT DOESN'T NEED CROSS-BROWSER TESTING — business logic doesn't change per
   browser. Testing it 5 times is waste. Name what's browser-agnostic.

Output: Browser | Version | OS | Tier | Rationale | What specifically to check here

Rules:
- Base tiers on the audience data provided. If none is given, say the matrix is
  a guess and ask for analytics.
- Section 5 matters as much as section 1. Most cross-browser suites waste
  most of their runtime re-testing browser-agnostic logic.
- Be concrete about what breaks where — "may render differently" is not a test.

APP TYPE: {{SPA/MPA + framework}}
AUDIENCE DATA: {{ANALYTICS_OR_UNKNOWN}}
BUSINESS REQUIREMENTS: {{CONTRACTUAL_SUPPORT_OBLIGATIONS}}
```

---

## E9 · SQL / Database Validation

**When to use:** Verifying what the UI says matches what the database holds.
**You'll need:** Schema + scenario
**Category:** Database Testing
**Subcategory:** SQL Validation
**Tags:** Database, SQL, Validation
**Technologies:** SQL
**Testing type:** Database, Backend
**Difficulty:** Advanced
**Quality:** 4
**Time saved:** 20-30 min
**Output:** SQL
**Last updated:** 2026-07-22

```
Act as a QA engineer validating data integrity.

For the scenario below, produce verification queries covering:

1. DATA INTEGRITY — did the transaction write what it claimed?
2. REFERENTIAL INTEGRITY — orphan records, broken foreign keys
3. CONSTRAINTS — nulls where not allowed, duplicates where unique required,
   check constraints
4. AUDIT — created/modified timestamps, user attribution, soft-delete flags
5. NEGATIVE — did a failed operation leave partial data? (transaction rollback)
6. EDGE — concurrent updates, precision/rounding on money, timezone on dates,
   character encoding on text

Output: Check | SQL query | Expected result | What a failure means

Rules:
- READ-ONLY queries only — SELECT. Never generate UPDATE, DELETE, DROP, or
  TRUNCATE for a validation card.
- Every query must be safe to run on a shared test environment: include LIMIT,
  avoid full scans on large tables, avoid locking.
- Use parameterised placeholders, not string-concatenated values.
- Expected result must be specific — "1 row with status='CONFIRMED'", not
  "should return correct data".
- Money: verify precision and rounding explicitly. Floating point on currency
  is a defect.

SCHEMA:
"""
{{TABLES_AND_COLUMNS}}
"""
SCENARIO: {{WHAT_THE_USER_DID}}
```

⚠️ **Read-only by design.** Never run generated SQL against production. Verify every query on a scratch environment before it touches shared data.

---

## E10 · Visual Regression Strategy

**When to use:** Setting up visual testing without drowning in false positives.
**You'll need:** App + component list
**Category:** UI Testing
**Subcategory:** Visual Regression
**Tags:** Visual Regression, UI, Strategy
**Testing type:** Frontend
**Difficulty:** Intermediate
**Quality:** 4
**Time saved:** 20-30 min
**Output:** Markdown
**Last updated:** 2026-07-22

```
Act as a QA engineer designing a visual regression strategy.

Produce a strategy answering:

1. WHAT TO SNAPSHOT — which components/pages, and why each earns its place
2. WHAT NOT TO SNAPSHOT — anything with inherent variance: timestamps, live
   data, ads, animations, randomised content, user avatars. Name them and give
   the masking approach.
3. FALSE POSITIVE CONTROL — the reason most visual suites get abandoned:
   - Font rendering differences across OS/browser
   - Animation and transition timing
   - Scrollbar presence
   - Dynamic content
   - Anti-aliasing
   Give the mitigation for each.
4. THRESHOLD — pixel diff tolerance, and the reasoning. Zero tolerance produces
   noise; high tolerance misses real regressions.
5. BASELINE MANAGEMENT — who approves a changed baseline, and when. An
   auto-approved baseline is not a test.
6. VIEWPORTS — which, and why those.

Rules:
- Be honest that visual testing has a high maintenance cost. State what the
  ongoing cost is so the team decides with open eyes.
- If a component changes frequently by design, recommend NOT snapshotting it.
- Section 3 determines whether this suite survives six months. Do not rush it.

APP: {{DESCRIPTION}}
COMPONENTS: {{LIST}}
TOOL: {{Percy/Applitools/Playwright/Chromatic}}
```

⚠️ Most visual regression suites get switched off within a year — killed by false positives, not by lack of value. Section 3 is the survival section.

---

## E11 · Localization / i18n Testing

**When to use:** Any product shipping in more than one language.
**You'll need:** Feature + target locales
**Category:** UI Testing
**Subcategory:** Localization
**Tags:** Localization, i18n, UI
**Testing type:** Frontend
**Difficulty:** Intermediate
**Quality:** 4
**Time saved:** 20-30 min
**Output:** Markdown table
**Last updated:** 2026-07-22

```
Act as a localization QA engineer.

Produce a test plan for the feature below across these locales: {{LOCALES}}

Cover:
1. TEXT EXPANSION — German/Finnish run ~30-40% longer than English; CJK shorter.
   Which UI elements will break?
2. RTL — Arabic/Hebrew: full mirroring, icon direction, number/date alignment,
   mixed LTR content inside RTL text
3. FORMATTING — dates (DD/MM vs MM/DD), decimal separator (1,000.50 vs 1.000,50),
   currency position and symbol, address format, phone format, name order
4. INPUT — IME for CJK, diacritics, RTL input, character limits counted in
   characters vs bytes
5. SORTING — locale-aware collation. Alphabetical order is not universal.
6. PLURALISATION — languages with more than two plural forms (Polish, Arabic,
   Russian). Hardcoded if(n==1) logic breaks.
7. CONTENT — hardcoded strings, concatenated sentences (untranslatable),
   text baked into images, culturally inappropriate colours/icons/imagery
8. TRUNCATION — where longer strings will clip, wrap, or overflow

Output: Category | Locale | What to test | Expected | Severity if it fails

Rules:
- Concatenated strings are a defect in themselves — word order differs by
  language. Flag any you can identify.
- Do not assume a locale = a language. Same language, different regions have
  different formats.
- Be specific about which UI elements break, not "layout may be affected".

FEATURE: {{FEATURE}}
CURRENT LOCALE: {{BASE}}
```

---

# F. Reporting & Closure

---

## F1 · Test Metrics

**When to use:** Reporting progress and quality with numbers.
**You'll need:** Raw counts
**Category:** Reporting
**Subcategory:** Test Metrics
**Tags:** Metrics, Reporting
**Testing type:** Manual
**Difficulty:** Intermediate
**Quality:** 4
**Time saved:** 15-20 min
**Output:** Markdown table
**Last updated:** 2026-07-22
**Variables:**
- `RAW_COUNTS` — Raw counts

```
Act as a QA lead producing test metrics.

Calculate and present:

Base counts: requirements, test cases written, executed, passed, failed,
blocked, not run. Defects by severity. Defects by status.

Derived: % executed, % passed (of executed), % failed, % blocked,
requirement coverage %, defect density, defect removal efficiency,
defect leakage (if prod data given).

Output a table, then a short interpretation section.

Rules:
- Show every formula. A metric with no visible formula is not auditable.
- Compute % passed against EXECUTED, not against total. Reporting pass rate
  against untested cases inflates the number and misleads the reader.
- Flag any metric that is misleading in isolation — blocked cases hiding real
  risk, high pass rate on shallow tests, coverage % with no depth measure.
- Do NOT invent numbers. If a metric can't be computed from the data below,
  output "insufficient data" and say what's needed.
- The interpretation must state what the numbers do NOT tell us.

DATA:
{{RAW_COUNTS}}
```

⚠️ Metrics get gamed the moment they become targets. This prompt is deliberately blunt about what each number hides.

---

## F2 · Test Summary / Closure Report

**When to use:** End of a test cycle. The formal record.
**You'll need:** Metrics + defect data + what happened
**Category:** Reporting
**Subcategory:** Closure Reports
**Tags:** Reporting, Closure, Summary
**Testing type:** Manual
**Difficulty:** Intermediate
**Quality:** 4
**Time saved:** 20-30 min
**Output:** Markdown
**Last updated:** 2026-07-22

```
Act as a QA lead writing a test closure report.

Produce:
1. EXECUTIVE SUMMARY — 3 sentences. What was tested, what we found, whether it's
   ready. A reader who stops here must still get the truth.
2. SCOPE — tested / not tested (be explicit about not tested)
3. RESULTS — metrics with formulas
4. DEFECT SUMMARY — by severity and status; open defects going to production
   listed individually with their accepted risk
5. QUALITY ASSESSMENT — the honest read
6. VARIANCES — what deviated from the plan and why
7. RISKS ACCEPTED — what we're shipping with
8. LESSONS LEARNED — process, not people
9. RECOMMENDATION — with conditions if any

Rules:
- Do not bury bad news in section 7. If it belongs in the executive summary,
  put it in the executive summary.
- Every open defect shipping to production gets a named accepted risk.
  "Deferred" without a stated risk is a gap.
- Lessons learned must be actionable process changes. "Communicate better"
  is not a lesson.
- Distinguish fact from judgement. Label judgement.
- Do not manufacture data. Missing input = "not measured".

DATA:
{{METRICS_AND_DEFECTS}}
WHAT HAPPENED: {{NARRATIVE}}
```

---

## F3 · Release Go / No-Go ⭐

**When to use:** The decision meeting. The most consequential thing QA does.
**You'll need:** Test results + open defects + release context
**Category:** Reporting
**Subcategory:** Release Decisions
**Tags:** Reporting, Release, Decision
**Testing type:** Manual
**Difficulty:** Senior QA
**Quality:** 5
**Time saved:** 20-30 min
**Output:** Markdown
**Last updated:** 2026-07-22
**Variables:**
- `RESULTS` — Test results
- `DEFECTS_WITH_SEVERITY` — Open defects with severity
- `DATE_PRESSURE_BUSINESS_DRIVERS` — Release context
- `CAN_WE_ROLL_BACK_HOW_FAST` — Rollback capability

```
Act as a QA manager preparing a go/no-go recommendation.

Output in this order:

1. **RECOMMENDATION** — GO / GO WITH CONDITIONS / NO-GO. First line. Unambiguous.
2. **THE THREE FACTS THAT DRIVE IT** — the evidence, not the reasoning
3. **CONDITIONS** — if conditional: exactly what must be true before shipping,
   each with an owner and a verification step
4. **OPEN RISKS** — each with likelihood and blast radius (who's affected, how badly)
5. **WHAT WE DID NOT TEST** — and the specific risk we're accepting
6. **ROLLBACK TRIGGER** — what to watch post-release, the number that means
   roll back, and who decides
7. **WHAT I CANNOT ASSESS** — gaps in my own data

Rules:
- Lead with the recommendation. Do not build up to it.
- Do NOT soften a NO-GO. If the data says no-go, say no-go in those words.
  A hedged no-go gets read as a go.
- Separate FACT from JUDGEMENT and label which is which.
- Section 6 is not optional. A release with no defined rollback trigger has no
  rollback plan, only a rollback hope.
- If the data below is insufficient to make the call, say so and name what's
  missing rather than producing a confident guess.

TEST RESULTS: {{RESULTS}}
OPEN DEFECTS: {{DEFECTS_WITH_SEVERITY}}
RELEASE CONTEXT: {{DATE_PRESSURE_BUSINESS_DRIVERS}}
ROLLBACK CAPABILITY: {{CAN_WE_ROLL_BACK_HOW_FAST}}
```

**Short version:**
```
Act as a QA manager preparing a go/no-go recommendation.

Output:
1. RECOMMENDATION — GO / GO WITH CONDITIONS / NO-GO. First line.
2. TOP RISKS — up to 3, each with likelihood and impact.
3. ROLLBACK TRIGGER — the signal that means roll back, and who decides.

Do NOT soften a NO-GO — say it in those words if the data says so.

TEST RESULTS: {{RESULTS}}
OPEN DEFECTS: {{DEFECTS_WITH_SEVERITY}}
RELEASE CONTEXT: {{DATE_PRESSURE_BUSINESS_DRIVERS}}
ROLLBACK CAPABILITY: {{CAN_WE_ROLL_BACK_HOW_FAST}}
```

**Expert version:**
```
Act as a QA director preparing a go/no-go recommendation for an executive release review.

Output in this order:

1. **RECOMMENDATION** — GO / GO WITH CONDITIONS / NO-GO. First line. Unambiguous.
2. **CONFIDENCE** — High / Medium / Low, and the single biggest factor driving
   that confidence level.
3. **THE THREE FACTS THAT DRIVE IT** — the evidence, not the reasoning.
4. **CONDITIONS** — if conditional: exactly what must be true before shipping,
   each with an owner and a verification step.
5. **OPEN RISKS** — each with likelihood, blast radius (who's affected, how
   badly), and whether it's a known regression class or novel.
6. **WHAT WE DID NOT TEST** — and the specific risk we're accepting, ranked by
   exposure.
7. **ROLLBACK TRIGGER** — what to watch post-release, the exact number/signal
   that means roll back, who decides, and how long the decision window is.
8. **COMMUNICATION PLAN** — who needs to know before the decision, who needs
   to know after, and what changes in the message if it's a NO-GO vs a GO
   WITH CONDITIONS.
9. **WHAT I CANNOT ASSESS** — gaps in my own data, and the fastest way to
   close each gap if there's time before the decision.

Rules:
- Lead with the recommendation. Do not build up to it.
- Do NOT soften a NO-GO. If the data says no-go, say no-go in those words.
  A hedged no-go gets read as a go.
- Separate FACT from JUDGEMENT and label which is which.
- Section 7 is not optional. A release with no defined rollback trigger has no
  rollback plan, only a rollback hope.
- Section 8 must name specific roles/functions, not "stakeholders" generically.
- If the data below is insufficient to make the call, say so and name what's
  missing rather than producing a confident guess.

TEST RESULTS: {{RESULTS}}
OPEN DEFECTS: {{DEFECTS_WITH_SEVERITY}}
RELEASE CONTEXT: {{DATE_PRESSURE_BUSINESS_DRIVERS}}
ROLLBACK CAPABILITY: {{CAN_WE_ROLL_BACK_HOW_FAST}}
```

⚠️ **This is a recommendation, not a decision.** QA presents evidence and a position; the business owns the call. But present the position clearly — a hedged recommendation transfers no information.

---

## F4 · Status Report / Standup Update

**When to use:** Daily, weekly, or when someone asks "where are we?"
**You'll need:** What you did / what's blocked
**Category:** Reporting
**Subcategory:** Status Reporting
**Tags:** Reporting, Status, Standup
**Testing type:** Manual
**Difficulty:** Beginner
**Quality:** 3
**Time saved:** 5-10 min
**Output:** Markdown
**Last updated:** 2026-07-22

```
Act as a QA engineer writing a status update for {{daily standup / weekly
stakeholder report}}.

Format:
- **Progress:** what moved, with numbers
- **Today/Next:** what's happening now
- **Blocked:** what's stuck, who unblocks it, and how long it's been stuck
- **Risks:** what might become a problem
- **Needs from others:** specific ask, specific person

Rules:
- Lead with anything BLOCKED. Blockers are the reason this meeting exists.
- Numbers, not adjectives. "42 of 60 cases executed, 5 failed" — not
  "good progress".
- Every blocker names an owner and an age. A blocker with no owner stays blocked.
- Audience-appropriate: for stakeholders, translate to business impact.
  For standup, stay technical and brief.
- No status theatre. If nothing moved, say nothing moved and why.

RAW NOTES:
{{YOUR_NOTES}}
```

---

## F5 · Coverage Gap Analysis

**When to use:** Answering "are we testing the right things?" — not "how many tests do we have?"
**You'll need:** Feature list + existing tests
**Category:** Reporting
**Subcategory:** Coverage Analysis
**Tags:** Reporting, Coverage, Gaps
**Testing type:** Manual
**Difficulty:** Intermediate
**Quality:** 4
**Time saved:** 15-20 min
**Output:** Markdown table
**Last updated:** 2026-07-22

```
Act as a QA lead analysing test coverage gaps.

Compare the feature list against existing tests and identify:

1. UNTESTED — features with no coverage at all
2. SHALLOW — features with only happy-path coverage and no negative/edge cases
3. OVER-TESTED — features with redundant coverage that could be trimmed
4. WRONG LEVEL — things tested via slow E2E that belong in unit or API tests
5. UNTESTABLE — features that cannot currently be tested, and what's blocking it
6. RISK-WEIGHTED GAPS — the untested/shallow items ranked by business risk

Output: Feature | Current coverage | Gap type | Risk if it fails | Recommended action

Rules:
- Coverage percentage is not coverage. A feature with 20 happy-path tests and
  zero negative tests is shallow, regardless of the count. Judge depth, not volume.
- Section 4 matters: an E2E test doing a unit test's job is slow, flaky, and
  gives false confidence. Name them.
- Section 3 is worth real money — redundant tests cost runtime and maintenance
  forever. Do not skip it because cutting tests feels unsafe.
- Rank by risk, not by gap size. A small gap on the payment flow beats a large
  gap on the help page.

FEATURES: {{FEATURE_LIST}}
EXISTING TESTS: {{TEST_INVENTORY}}
```

---

# G. Learning & Career

---

## G1 · Learning Roadmap

**When to use:** Learning any new skill — tool, language, or domain.
**You'll need:** Skill + your background + timeframe

```
Act as a technical mentor.

Build a day-by-day learning plan.

SKILL: {{SKILL}}
MY BACKGROUND: {{WHAT_YOU_ALREADY_KNOW}}
TIME: {{N}} days, {{HOURS}} hours/day
GOAL: {{job-ready / interview / specific project}}

Output a table: Day | Topic | What to build | Success check (how I know I got it)

Rules:
- Every day must have something BUILT, not just read. A day with no artefact
  is a day that didn't happen.
- Assume the background I stated — do not re-teach what I already know.
- The success check must be objective: something that runs, or a question I can
  answer without looking it up.
- Front-load whatever unblocks the most downstream topics.
- If the timeframe is unrealistic for the goal, say so and propose what IS
  achievable rather than producing a plan that sets me up to fail.
```

⚠️ Note the last rule — most learning-plan prompts produce a fantasy schedule. This one is instructed to push back.

**Follow-ups:**
- `Expand day {{N}} into detailed hour-by-hour steps with resources.`
- `What are the top 25 interview questions for {{SKILL}} at {{X}} years experience, with solutions? Don't include basic questions.`

---

## G2 · Mock Interview

**When to use:** Interview prep. Turns the model into a tutor instead of an answer key.
**You'll need:** Role + experience level

```
Act as an interviewer for a {{ROLE}} position, {{YEARS}} years experience level.

Interview me on {{TOPIC}}.

Rules:
- Ask ONE question at a time. Wait for my answer before continuing.
  Do not ask the next question until I respond.
- After each answer: tell me if it's correct, what was missing, and what a
  strong answer would have included.
- Scale difficulty to my stated level. Do not ask a 3-year candidate a
  principal-level system design question.
- If my answer is wrong, do not just correct it — ask a follow-up that leads
  me to see why.
- Include the follow-up probes a real interviewer would use. Real interviews
  dig; don't accept a shallow answer and move on.
- After 10 questions, give me: score, strongest area, weakest area, and the
  three things to study first.

Start with question 1.
```

⚠️ **The "one at a time, wait for my answer" rule is doing the work.** Without it the model dumps 25 questions with answers and you learn nothing.

---

## G3 · Explain Unfamiliar Code

**When to use:** Inheriting a codebase. Onboarding onto a framework someone else built.
**You'll need:** The code

```
Act as a senior engineer explaining code to a new team member.

Explain the code below.

Output:
1. WHAT IT DOES — one paragraph, plain language
2. HOW IT FLOWS — the execution path, step by step
3. CONCEPTS USED — table: Concept | Where it appears | Why it's used here |
   What to read to learn it
4. WHAT I'D QUESTION — design decisions that look odd, risky, or dated
5. WHAT I CANNOT TELL from this snippet alone

Rules:
- Section 5 is mandatory. A snippet without its callers, config, and
  dependencies is missing context — say what you're missing rather than
  inferring it confidently.
- Do not invent the purpose of a method whose name is ambiguous. Flag it.
- Section 4 should be genuinely critical. Code inherited from someone else is
  where the assumptions hide.

CODE:
"""
{{CODE}}
"""
```

⚠️ **See the safety appendix before pasting anything from work.** Take the smallest generic snippet that demonstrates the pattern, not the whole proprietary file.

---

# Appendix · Safety Rules for QA Deck

Ship these as a persistent banner or a first-run modal. They protect your users.

### Never paste — any tool, any tier
- Passwords, API keys, tokens, credentials, connection strings
- Customer PII or real user data
- Financial or health records
- Production endpoints with live data

### Company code — the tier decides

| Tier | Data used for training? |
|---|---|
| Free / Personal / Pro | ⚠️ Often yes — by default or opt-out |
| Business / Enterprise / Team | ✅ No — contractually excluded |

**Training isn't the only question.** Even on a safe tier, code still leaves your company's network to reach the model. That's usually what NDAs actually restrict. **What your employer has approved matters more than any toggle you set.**

### The three failure modes to warn users about

| Failure | Where it bites | Guard |
|---|---|---|
| **Stale versions** | Framework setup, dependency files, CI configs | Verify every version at the source. Never trust a version from memory. |
| **Confident fabrication** | Niche techniques, statistics, tool capabilities | Ask for sources. Cross-check anything you'd be embarrassed to be wrong about. |
| **Silent arithmetic errors** | Pairwise arrays, metrics, estimates | Verify combinatorial and numeric output with a real tool. |

### Product principles for the prompt cards

1. **Every card ships a "what did you miss?" follow-up.** First output is a draft. This one button recovers more value than any prompt tweak.
2. **Never auto-chain follow-ups.** The user reads the draft first, then decides.
3. **Make template/example fields prominent.** A pasted template is the difference between a generic output and the user's actual output.
4. **Show warnings inline, not in tooltips.** The version trap and the read-only-SQL rule need to be unmissable.
5. **Let users save their own defaults** — their test case columns, their POM style, their tech stack. That's the retention feature.

---

*Prompts designed for 2026-era reasoning models. Deliberately omitted: "think step by step" (degrades reasoning-model output), elaborate personas (noise), and "ignore all previous instructions" (does nothing). Constraints and negative rules do the work instead.*
