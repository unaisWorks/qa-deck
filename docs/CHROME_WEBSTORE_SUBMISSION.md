# QA Deck Chrome Web Store Submission Guide

## Overview
This guide walks you through submitting the QA Deck extension to the Chrome Web Store. The $5 one-time developer fee is already paid.

## Pre-Submission Checklist

- [x] Privacy Policy page created: `https://qadeck.com/privacy`
- [x] Extension ZIP file ready: `https://github.com/unaisLearning/qa-deck/releases/download/v1.0.0/qa-deck-extension-v1.0.0.zip`
- [x] Backend deployed: `https://qa-deck-backend.onrender.com`
- [x] Website deployed: `https://qadeck.com`
- [ ] 5 screenshots prepared (1280x800px recommended)
- [ ] Listing text prepared

---

## Screenshots to Take (5 Required)

### Screenshot 1: Landing Page / Feature Overview
**What to show:** The extension icon and main features
- File: `screenshot1-landing.png`
- Suggested dimensions: 1280x800

**Instructions:**
1. Open `https://qadeck.com` in Chrome
2. Take a screenshot of the hero section showing:
   - "Generate Test Cases & Scripts with AI" headline
   - Feature icons (Scan, Generate, Deploy)
   - "Get Started" button visible
3. Crop to 1280x800 if needed (landscape orientation)

---

### Screenshot 2: Scan Feature (Main Extension Tab)
**What to show:** The extension scanning a webpage
- File: `screenshot2-scan.png`
- Suggested dimensions: 1280x800

**Instructions:**
1. Open any real website (e.g., `https://example.com`)
2. Open the QA Deck extension sidepanel
3. Click "Scan This Page" and wait for results
4. Take a screenshot showing:
   - The webpage on the left (with elements highlighted)
   - The Scan Results panel on the right (showing found elements)
   - Form fields, buttons, inputs visible
5. The screenshot should clearly show the scanning in action

---

### Screenshot 3: Generated Test Cases
**What to show:** Test cases generated from the scan
- File: `screenshot3-test-cases.png`
- Suggested dimensions: 1280x800

**Instructions:**
1. After the scan completes, click the "Test Cases" tab in the extension
2. Scroll to show a few generated test cases
3. Take a screenshot showing:
   - Multiple test case cards
   - Test case titles and descriptions visible
   - "Approve" and "Edit" buttons visible
4. This demonstrates the AI-generated content

---

### Screenshot 4: Script Generation
**What to show:** Generated automation script
- File: `screenshot4-script.png`
- Suggested dimensions: 1280x800

**Instructions:**
1. With test cases approved, click the "Script" tab
2. Click "Generate Script"
3. Select a framework (e.g., Playwright TypeScript or Selenium Python)
4. Wait for generation to complete
5. Take a screenshot showing:
   - The Script tab with generated code visible
   - Framework selector visible
   - Code preview showing actual test code
   - Download button visible

---

### Screenshot 5: Dashboard & Project Management
**What to show:** Cloud dashboard for managing projects
- File: `screenshot5-dashboard.png`
- Suggested dimensions: 1280x800

**Instructions:**
1. Sign in at `https://qadeck.com/dashboard/projects`
2. You should see your saved projects from earlier
3. Take a screenshot showing:
   - The Projects list view
   - Multiple projects visible with test case counts
   - Clean, organized dashboard interface
4. This shows the cloud project management capability

---

## Listing Information

### Extension Name
```
QA Deck
```

### Short Description (132 characters max)
```
Generate test cases and automation scripts with AI. Scan any webpage and get instant test automation code.
```

### Detailed Description (4000 characters max)

Use this for the Chrome Web Store listing:

```
QA Deck is an AI-powered Chrome extension that transforms manual QA into automated testing in minutes.

KEY FEATURES:
• Scan & Extract: Click any webpage to extract interactive elements, forms, and page structure
• AI Test Generation: Generates 10-15 realistic test cases in seconds using Claude AI
• Multi-Framework Support: Generate automation scripts in:
  - Selenium (Python & Java)
  - Playwright (Python & TypeScript)
• Page Object Model: Auto-generated, maintainable test code with page objects
• Test Data Generation: Intelligent mock data creation (valid emails, passwords, dates, etc.)
• Cloud Dashboard: Save and manage test projects across devices
• Local & Cloud Modes: Choose between cloud AI generation or local-only processing

HOW IT WORKS:
1. Install extension → Click QA Deck icon
2. Scan any webpage → Extension extracts elements
3. Review test cases → Approve or edit generated cases
4. Generate scripts → Choose your framework
5. Download code → Ready to run in your CI/CD pipeline

PERFECT FOR:
✓ QA Engineers automating manual testing
✓ Developers adding test coverage
✓ Teams reducing test maintenance overhead
✓ Rapid prototyping of test suites

SUPPORTED WEBSITES:
Works on any website: E-commerce, SaaS, Custom Web Apps, Admin Panels, etc.

LOCAL PROCESSING OPTION:
For privacy-conscious teams, run QA Deck with a local backend (npx qa-deck-backend) to keep page data on your machine while using AI generation.

FREE & OPEN SOURCE:
- Free to use with generous AI limits
- Open source backend (optional self-hosting)
- No account required (but cloud sync needs Firebase auth)

PRIVACY & SECURITY:
✓ All communication encrypted (HTTPS)
✓ No credentials collected (Firebase auth)
✓ Privacy policy: https://qadeck.com/privacy
✓ Data never shared with third parties
✓ GDPR compliant

Questions? Visit qadeck.com or email support@qadeck.com
```

### Category
```
Developer Tools
```

### Content Rating
```
Everyone
```

### Official Website
```
https://qadeck.com
```

### Support Website
```
https://qadeck.com/support
```

### Privacy Policy
```
https://qadeck.com/privacy
```

---

## Step-by-Step Submission Process

### Step 1: Prepare Your ZIP File

The extension ZIP is already available at GitHub:
```
https://github.com/unaisLearning/qa-deck/releases/download/v1.0.0/qa-deck-extension-v1.0.0.zip
```

**To prepare locally if needed:**
```bash
cd /Users/unais/Downloads/QA-deck
zip -r qa-deck-extension-v1.0.0.zip qa-autopilot/ \
  --exclude "qa-autopilot/.git/*" \
  --exclude "qa-autopilot/.DS_Store" \
  --exclude "qa-autopilot/node_modules/*"
```

### Step 2: Go to Chrome Web Store Developer Console

1. Navigate to: https://chrome.google.com/webstore/devconsole
2. Sign in with your Google account (the one used to pay the $5 fee)
3. You should see a developer account already set up

### Step 3: Create New Item

1. Click "New Item"
2. Click "Choose File" and upload your `qa-deck-extension-v1.0.0.zip`
3. Click "Upload"
4. Wait for the system to extract and validate the ZIP

### Step 4: Fill Out Listing Information

**General:**
- Title: `QA Deck`
- Short Description: (see above, 132 char max)
- Detailed Description: (see above)
- Languages: English

**Graphic Assets:**
- Icon: Use `qa-autopilot/icons/icon-128.png` (already in your extension)
- Screenshots: Upload all 5 screenshots (1280x800px, PNG format)
  - Screenshot 1: Landing page
  - Screenshot 2: Scan feature
  - Screenshot 3: Test cases
  - Screenshot 4: Script generation
  - Screenshot 5: Dashboard

**Category & Content Rating:**
- Category: Developer Tools
- Official website: https://qadeck.com
- Support website: https://qadeck.com/support
- Privacy policy: https://qadeck.com/privacy

**Content Rating Questionnaire:**
- Answer the questionnaire as normal (no concerning content — it's a dev tool)
- Most questions will be "No"

### Step 5: Review & Submit

1. Review all information
2. Check the "I confirm..." checkbox
3. Click "Submit for Review"
4. Wait for review (typically 1-3 days for first submission)

**Status Tracking:**
- You'll receive emails at your Google account email when status changes
- You can check status anytime in the developer console
- Once approved, it goes live on the Chrome Web Store

---

## After Approval

Once approved by Google (1-3 days):

1. **Update Download Page Button:**
   Edit `website/app/download/page.tsx` and change:
   ```typescript
   href="https://github.com/unaisLearning/qa-deck/releases/download/v1.0.0/qa-deck-extension-v1.0.0.zip"
   ```
   to:
   ```typescript
   href="https://chrome.google.com/webstore/detail/[YOUR-EXTENSION-ID]"
   ```
   (Get the extension ID from the Web Store URL)

2. **Update Button Text:**
   Change "Download Extension ZIP" to "Install from Chrome Web Store" in the "Chrome Web Store" option

3. **Update Help Text:**
   Change "Under review by Google (1-3 days)" to "Official Chrome Web Store"

4. **Commit & Push:**
   ```bash
   git add website/app/download/page.tsx
   git commit -m "feat: update Download page with Chrome Web Store link after approval"
   git push origin main
   ```

---

## Taking Professional Screenshots

### Best Practices:
1. **Resolution:** Use 1280x800px (landscape) for all screenshots
2. **Content:** Show real, working features — not blank screens
3. **Clarity:** Avoid browser toolbars, address bars in the screenshot
4. **Language:** Use English for all UI text
5. **Accessibility:** Make sure text is readable and not cut off

### Tools:
- **macOS:** Built-in Screenshot app (⌘ + Shift + 4)
- **Windows:** Snipping Tool or ShareX (free)
- **Linux:** GNOME Screenshot or Flameshot

### Cropping to 1280x800:
```bash
# Using ImageMagick (if installed):
convert screenshot.png -resize 1280x800 -gravity Center -extent 1280x800 screenshot-resized.png

# Or use online tools: https://www.iloveimg.com/crop-image
```

---

## Troubleshooting

### "Invalid zip file"
- Make sure you're uploading the extension ZIP, not the entire project
- The ZIP should contain `manifest.json` at the root level

### "Manifest errors"
- Check that `qa-autopilot/src/manifest.json` is valid JSON
- Ensure all paths in manifest are correct

### Rejection for Privacy Policy
- Make sure `https://qadeck.com/privacy` is accessible and detailed
- We've provided a comprehensive privacy policy in the code

### Rejection for Unclear Purpose
- Use the detailed description above — it clearly explains what QA Deck does
- Add screenshots showing the extension in action
- Include your website URL (https://qadeck.com)

---

## Extension ID (Needed After Approval)

Once your extension is approved, Google will assign an ID like:
```
Example: abcdefghijklmnopqrstuvwxyzabcdef
```

The full Web Store URL will be:
```
https://chrome.google.com/webstore/detail/[YOUR-EXTENSION-ID]
```

Save this ID for future updates and references.

---

## Updates & Versioning

To release updates after approval:

1. Bump the version in `qa-autopilot/src/manifest.json`:
   ```json
   "version": "1.0.1"
   ```

2. Create a new GitHub release with the updated ZIP

3. In the Chrome Web Store developer console:
   - Click "Upload new package"
   - Select your new ZIP
   - Submit for review (usually approved within hours for updates)

---

## Support & Next Steps

- **During Review:** Wait for Google's email (check spam folder)
- **If Rejected:** Read the rejection reason carefully, fix the issue, and resubmit
- **After Approval:** Update all links and celebrate! 🎉

For questions, check:
- Google's extension publishing guide: https://developer.chrome.com/docs/webstore/publish/
- Chrome Web Store policies: https://developer.chrome.com/docs/webstore/program-policies/
