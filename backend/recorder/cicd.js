/**
 * QA Deck — CI/CD Config Generator
 *
 * Generates production-ready CI/CD pipeline configs:
 *  - GitHub Actions (.github/workflows/qa-tests.yml)
 *  - Jenkins (Jenkinsfile)
 *
 * Supports all 4 frameworks × multiple options:
 *  - Browser: chromium / firefox / webkit (Playwright) | chrome / firefox (Selenium)
 *  - Parallelism: matrix / sharding
 *  - Reporting: JUnit XML, HTML, Allure
 *  - Environments: staging / production, PR triggers
 *  - Notifications: Slack, email
 */

// ─── Main entry ───────────────────────────────────────────────────────────────

function generateCICD(options = {}) {
  const {
    framework       = "selenium-python",
    projectName     = "qa-deck",
    pageType        = "page",
    baseUrl         = "https://staging.example.com",
    browsers        = ["chromium"],
    parallel        = false,
    reporters       = ["html", "junit"],
    slackWebhook    = false,
    emailNotify     = false,
    branches        = ["main", "develop"],
    prTrigger       = true,
    testCaseCount   = 10,
    useAllure       = false,
    nodeVersion     = "20",
    pythonVersion   = "3.11",
    javaVersion     = "17",
  } = options;

  const ctx = {
    framework,
    projectName: slugify(projectName),
    pageType,
    baseUrl,
    browsers,
    parallel,
    reporters,
    slackWebhook,
    emailNotify,
    branches,
    prTrigger,
    testCaseCount,
    useAllure,
    nodeVersion,
    pythonVersion,
    javaVersion,
    isPlaywright: framework.startsWith("playwright"),
    isPython: framework.includes("python"),
    isJava: framework.includes("java"),
    isTypeScript: framework.includes("typescript"),
    ext: framework.includes("java") ? "java" : framework.includes("typescript") ? "ts" : "py",
    runner: getRunner(framework),
    installCmd: getInstallCmd(framework),
    testCmd: getTestCmd(framework, parallel, reporters, useAllure),
    cacheKey: getCacheKey(framework),
  };

  return {
    githubActions: {
      filename: ".github/workflows/qa-tests.yml",
      content: generateGitHubActions(ctx),
    },
    jenkins: {
      filename: "Jenkinsfile",
      content: generateJenkinsfile(ctx),
    },
    dockerCompose: {
      filename: "docker-compose.ci.yml",
      content: generateDockerCompose(ctx),
    },
    makefileTargets: {
      filename: "Makefile",
      content: generateMakefile(ctx),
    },
  };
}

// ─── GitHub Actions ───────────────────────────────────────────────────────────

function generateGitHubActions(ctx) {
  const { framework, projectName, baseUrl, browsers, parallel, branches, prTrigger,
          slackWebhook, emailNotify, useAllure, nodeVersion, pythonVersion, javaVersion,
          isPlaywright, isPython, isJava, isTypeScript, testCmd, reporters } = ctx;

  const branchList = branches.map(b => `      - ${b}`).join("\n");
  const browserMatrix = parallel && browsers.length > 1
    ? `    strategy:
      fail-fast: false
      matrix:
        browser: [${browsers.map(b => `"${b}"`).join(", ")}]`
    : "";

  const browserEnv = parallel && browsers.length > 1
    ? `          BROWSER: \${{ matrix.browser }}`
    : `          BROWSER: ${browsers[0]}`;

  const setupSteps = isJava ? `
      - name: Set up JDK ${javaVersion}
        uses: actions/setup-java@v4
        with:
          java-version: '${javaVersion}'
          distribution: 'temurin'
          cache: maven

      - name: Cache Maven packages
        uses: actions/cache@v4
        with:
          path: ~/.m2
          key: \${{ runner.os }}-m2-\${{ hashFiles('**/pom.xml') }}
          restore-keys: \${{ runner.os }}-m2` :
  isTypeScript ? `
      - name: Set up Node.js ${nodeVersion}
        uses: actions/setup-node@v4
        with:
          node-version: '${nodeVersion}'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install --with-deps ${browsers.join(" ")}` :
  /* Python */ `
      - name: Set up Python ${pythonVersion}
        uses: actions/setup-python@v5
        with:
          python-version: '${pythonVersion}'

      - name: Cache pip packages
        uses: actions/cache@v4
        with:
          path: ~/.cache/pip
          key: \${{ runner.os }}-pip-\${{ hashFiles('**/requirements.txt') }}
          restore-keys: \${{ runner.os }}-pip-

      - name: Install dependencies
        run: pip install -r requirements.txt${isPlaywright ? "\n\n      - name: Install Playwright browsers\n        run: playwright install --with-deps " + browsers.join(" ") : ""}`;

  const testStep = isJava ? `
      - name: Run tests
        env:
          BASE_URL: \${{ env.BASE_URL }}
          ${browserEnv}
        run: mvn test -Dsurefire.failIfNoSpecifiedTests=false

      - name: Publish Test Results
        uses: EnricoMi/publish-unit-test-result-action@v2
        if: always()
        with:
          files: target/surefire-reports/*.xml` :
  isTypeScript ? `
      - name: Run Playwright tests
        env:
          BASE_URL: \${{ env.BASE_URL }}
          ${browserEnv}
        run: ${testCmd}

      - name: Upload Playwright report
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report-\${{ matrix.browser || '${browsers[0]}' }}
          path: playwright-report/
          retention-days: 30` :
  /* Python */ `
      - name: Run tests
        env:
          BASE_URL: \${{ env.BASE_URL }}
          ${browserEnv}
        run: ${testCmd}

      - name: Upload test results
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: test-results-\${{ matrix.browser || '${browsers[0]}' }}
          path: |
            reports/
            test-results.xml
          retention-days: 30`;

  const allureSteps = useAllure ? `
      - name: Generate Allure report
        uses: simple-elf/allure-report-action@master
        if: always()
        with:
          allure_results: allure-results
          allure_history: allure-history

      - name: Deploy Allure report to GitHub Pages
        uses: peaceiris/actions-gh-pages@v3
        if: always()
        with:
          github_token: \${{ secrets.GITHUB_TOKEN }}
          publish_branch: gh-pages
          publish_dir: allure-history` : "";

  const slackStep = slackWebhook ? `
      - name: Notify Slack on failure
        uses: 8398a7/action-slack@v3
        if: failure()
        with:
          status: \${{ job.status }}
          fields: repo,message,commit,author,action,eventName,ref,workflow
          text: ':x: QA tests failed on \`\${{ github.ref_name }}\`'
        env:
          SLACK_WEBHOOK_URL: \${{ secrets.SLACK_WEBHOOK_URL }}` : "";

  const emailStep = emailNotify ? `
      - name: Send email on failure
        uses: dawidd6/action-send-mail@v3
        if: failure()
        with:
          server_address: smtp.gmail.com
          server_port: 465
          username: \${{ secrets.MAIL_USERNAME }}
          password: \${{ secrets.MAIL_PASSWORD }}
          subject: "QA Tests Failed — \${{ github.repository }} (\${{ github.ref_name }})"
          body: "Test suite failed on commit \${{ github.sha }}. View run: \${{ github.server_url }}/\${{ github.repository }}/actions/runs/\${{ github.run_id }}"
          to: \${{ secrets.NOTIFY_EMAIL }}
          from: QA Deck` : "";

  const prSection = prTrigger ? `
  pull_request:
    branches:
${branchList}
    types: [opened, synchronize, reopened]` : "";

  return `# QA Deck — Generated GitHub Actions Workflow
# Framework: ${framework}
# Generated: ${new Date().toISOString()}
#
# Required secrets:
#   BASE_URL_STAGING  — staging environment URL${slackWebhook ? "\n#   SLACK_WEBHOOK_URL — Slack incoming webhook" : ""}${emailNotify ? "\n#   MAIL_USERNAME, MAIL_PASSWORD, NOTIFY_EMAIL — email alerts" : ""}

name: QA Tests — ${projectName}

on:
  push:
    branches:
${branchList}
${prSection}
  workflow_dispatch:
    inputs:
      environment:
        description: 'Target environment'
        required: true
        default: 'staging'
        type: choice
        options: [staging, production]
      browser:
        description: 'Browser to test'
        required: false
        default: '${browsers[0]}'
        type: choice
        options: [${isPlaywright ? "chromium, firefox, webkit" : "chrome, firefox"}]

env:
  BASE_URL: \${{ secrets.BASE_URL_STAGING || '${baseUrl}' }}
  CI: true

jobs:
  qa-tests:
    name: QA Tests${parallel && browsers.length > 1 ? " (${{ matrix.browser }})" : ""}
    runs-on: ubuntu-latest
    timeout-minutes: 30
${browserMatrix}

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up environment variables
        run: |
          echo "RUN_ID=\${{ github.run_id }}" >> \$GITHUB_ENV
          echo "COMMIT_SHA=\${{ github.sha }}" >> \$GITHUB_ENV
          echo "BRANCH_NAME=\${{ github.ref_name }}" >> \$GITHUB_ENV
${setupSteps}
${testStep}
${allureSteps}
${slackStep}
${emailStep}

  # ── Summary job — runs after all matrix jobs complete ──────────────────────
  summary:
    name: Test Summary
    runs-on: ubuntu-latest
    needs: qa-tests
    if: always()
    steps:
      - name: Check result
        run: |
          if [ "\${{ needs.qa-tests.result }}" = "success" ]; then
            echo "✅ All QA tests passed"
          else
            echo "❌ QA tests failed — result: \${{ needs.qa-tests.result }}"
            exit 1
          fi
`.trimStart();
}

// ─── Jenkinsfile ──────────────────────────────────────────────────────────────

function generateJenkinsfile(ctx) {
  const { framework, projectName, baseUrl, browsers, parallel, branches, slackWebhook,
          emailNotify, useAllure, nodeVersion, pythonVersion, javaVersion,
          isPlaywright, isPython, isJava, isTypeScript, testCmd } = ctx;

  const agentLabel = isJava ? "java-agent" : "python-agent";

  const toolBlock = isJava ? `
        jdk 'JDK-${javaVersion}'
        maven 'Maven-3.9'` :
  isTypeScript ? `
        nodejs 'Node-${nodeVersion}'` :
  `
        // Python available via system or pyenv`;

  const installStage = isJava ? `
        stage('Install Dependencies') {
            steps {
                sh 'mvn dependency:resolve -q'
            }
        }` :
  isTypeScript ? `
        stage('Install Dependencies') {
            steps {
                sh 'npm ci'
                sh 'npx playwright install --with-deps ${browsers.join(" ")}'
            }
        }` :
  `
        stage('Install Dependencies') {
            steps {
                sh '''
                    python${pythonVersion.split('.')[0]} -m venv .venv
                    . .venv/bin/activate
                    pip install --upgrade pip -q
                    pip install -r requirements.txt -q${isPlaywright ? "\n                    playwright install --with-deps " + browsers.join(" ") : ""}
                '''
            }
        }`;

  const testStage = isJava ? `
        stage('Run Tests') {
            steps {
                script {
                    try {
                        sh """
                            mvn test \\
                                -DBASE_URL=\${BASE_URL} \\
                                -DBROWSER=\${BROWSER}
                        """
                    } catch (err) {
                        currentBuild.result = 'UNSTABLE'
                        throw err
                    }
                }
            }
            post {
                always {
                    junit 'target/surefire-reports/*.xml'
                    archiveArtifacts artifacts: 'target/surefire-reports/**', allowEmptyArchive: true
                }
            }
        }` :
  isTypeScript ? `
        stage('Run Tests') {
            steps {
                script {
                    try {
                        sh """
                            ${testCmd} \\
                                --reporter=junit \\
                                --output-dir=test-results
                        """
                    } catch (err) {
                        currentBuild.result = 'UNSTABLE'
                        throw err
                    }
                }
            }
            post {
                always {
                    junit 'test-results/*.xml'
                    publishHTML([
                        allowMissing: true,
                        alwaysLinkToLastBuild: true,
                        keepAll: true,
                        reportDir: 'playwright-report',
                        reportFiles: 'index.html',
                        reportName: 'Playwright Report'
                    ])
                }
            }
        }` :
  `
        stage('Run Tests') {
            steps {
                script {
                    try {
                        sh """
                            . .venv/bin/activate
                            ${testCmd}
                        """
                    } catch (err) {
                        currentBuild.result = 'UNSTABLE'
                        throw err
                    }
                }
            }
            post {
                always {
                    junit 'reports/junit.xml'
                    publishHTML([
                        allowMissing: true,
                        alwaysLinkToLastBuild: true,
                        keepAll: true,
                        reportDir: 'reports/html',
                        reportFiles: 'index.html',
                        reportName: 'Test Report'
                    ])
                }
            }
        }`;

  const allureStage = useAllure ? `
        stage('Allure Report') {
            steps {
                allure([
                    includeProperties: false,
                    jdk: '',
                    properties: [],
                    reportBuildPolicy: 'ALWAYS',
                    results: [[path: 'allure-results']]
                ])
            }
        }` : "";

  const notifyBlock = slackWebhook ? `
        failure {
            slackSend(
                channel: '#qa-alerts',
                color: 'danger',
                message: """❌ *QA Tests FAILED*
Pipeline: \${env.JOB_NAME} #\${env.BUILD_NUMBER}
Branch: \${env.BRANCH_NAME}
URL: \${env.BUILD_URL}"""
            )
        }
        success {
            slackSend(
                channel: '#qa-alerts',
                color: 'good',
                message: "✅ QA Tests passed — \${env.JOB_NAME} #\${env.BUILD_NUMBER}"
            )
        }` :
  emailNotify ? `
        failure {
            emailext(
                subject: "QA Tests FAILED — \${env.JOB_NAME} #\${env.BUILD_NUMBER}",
                body: """<h3>QA Test Failure</h3>
<p>Pipeline: <a href="\${env.BUILD_URL}">\${env.JOB_NAME} #\${env.BUILD_NUMBER}</a></p>
<p>Branch: \${env.BRANCH_NAME}</p>""",
                mimeType: 'text/html',
                recipientProviders: [[$class: 'DevelopersRecipientProvider'], [$class: 'RequesterRecipientProvider']]
            )
        }` : `
        failure {
            echo 'Tests failed — check console output for details'
        }`;

  const parallelBrowsers = parallel && browsers.length > 1 ? `
        stage('Cross-Browser Tests') {
            parallel {
                ${browsers.map(b => `stage('${b}') {
                    steps {
                        script {
                            env.BROWSER = '${b}'
                        }
                        sh 'echo "Running on browser: ${b}"'
                    }
                }`).join("\n                ")}
            }
        }` : "";

  return `// QA Deck — Generated Jenkinsfile
// Framework: ${framework}
// Generated: ${new Date().toISOString()}
//
// Required Jenkins plugins:
//   - Pipeline
//   - HTML Publisher
//   - JUnit
${useAllure ? "//   - Allure Jenkins Plugin" : ""}
${slackWebhook ? "//   - Slack Notification" : ""}
${isTypeScript || isJava ? `//   - NodeJS Plugin (Node ${nodeVersion})` : ""}
//
// Required Jenkins credentials:
//   - BASE_URL  — environment variable with target URL
${slackWebhook ? "//   - SLACK_TOKEN — Slack bot token" : ""}

pipeline {
    agent {
        label '${agentLabel}'
    }

    tools {${toolBlock}
    }

    options {
        timeout(time: 30, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '20'))
        disableConcurrentBuilds()
        timestamps()
    }

    triggers {
        // Poll SCM every 15 minutes (or use webhooks)
        pollSCM('H/15 * * * *')
    }

    parameters {
        choice(
            name: 'ENVIRONMENT',
            choices: ['staging', 'production'],
            description: 'Target environment'
        )
        choice(
            name: 'BROWSER',
            choices: [${isPlaywright ?
              "'chromium', 'firefox', 'webkit'" :
              "'chrome', 'firefox'"}],
            description: 'Browser to run tests in'
        )
        booleanParam(
            name: 'RUN_SMOKE_ONLY',
            defaultValue: false,
            description: 'Run only smoke tests (faster)'
        )
    }

    environment {
        BASE_URL    = credentials('BASE_URL') ?: '${baseUrl}'
        BROWSER     = "\${params.BROWSER}"
        CI          = 'true'
        REPORT_DIR  = "reports/\${BUILD_NUMBER}"
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
                sh 'git log --oneline -5'
            }
        }
${installStage}
${parallelBrowsers}
${testStage}
${allureStage}

        stage('Archive Results') {
            steps {
                archiveArtifacts(
                    artifacts: 'reports/**,${isTypeScript ? "playwright-report/**" : ""}',
                    allowEmptyArchive: true,
                    fingerprint: true
                )
            }
        }
    }

    post {
        always {
            cleanWs(cleanWhenNotBuilt: false, cleanWhenAborted: true, cleanWhenFailure: false)
        }
${notifyBlock}
    }
}
`;
}

// ─── Docker Compose for local CI simulation ───────────────────────────────────

function generateDockerCompose(ctx) {
  const { framework, baseUrl, browsers, isPlaywright, isJava, isTypeScript, pythonVersion, nodeVersion, javaVersion } = ctx;

  const serviceImage = isJava
    ? `maven:3.9-eclipse-temurin-${javaVersion}`
    : isTypeScript
    ? `mcr.microsoft.com/playwright:v1.40.0-jammy`
    : isPlaywright
    ? `mcr.microsoft.com/playwright/python:v1.40.0-jammy`
    : `python:${pythonVersion}-slim`;

  const installCmd = isJava
    ? "mvn dependency:resolve -q"
    : isTypeScript
    ? "npm ci && npx playwright install"
    : `pip install -r requirements.txt -q${isPlaywright ? " && playwright install" : ""}`;

  const testCmd = isJava
    ? "mvn test"
    : isTypeScript
    ? "npx playwright test --reporter=html"
    : isPlaywright
    ? "pytest tests/ -v --html=reports/report.html --self-contained-html"
    : "pytest tests/ -v --html=reports/report.html --self-contained-html";

  return `# QA Deck — Docker Compose for local CI simulation
# Usage: docker-compose -f docker-compose.ci.yml up --abort-on-container-exit

version: '3.8'

services:
  qa-tests:
    image: ${serviceImage}
    working_dir: /app
    volumes:
      - .:/app
      - /app/${isJava ? ".m2" : isTypeScript ? "node_modules" : ".venv"}
    environment:
      - BASE_URL=${baseUrl}
      - BROWSER=${browsers[0]}
      - CI=true
      - PYTHONDONTWRITEBYTECODE=1
    command: >
      sh -c "${installCmd} &&
             ${testCmd}"
    ${!isJava && !isTypeScript && !isPlaywright ? `# For Selenium, you need a browser service:
    depends_on:
      - selenium-hub` : ""}

${!isJava && !isTypeScript && !isPlaywright ? `  selenium-hub:
    image: selenium/standalone-chrome:latest
    ports:
      - "4444:4444"
    environment:
      - SE_NODE_MAX_SESSIONS=3
    shm_size: '2g'` : ""}

volumes:
  ${isJava ? "maven-cache" : isTypeScript ? "node-cache" : "pip-cache"}:
`;
}

// ─── Makefile ─────────────────────────────────────────────────────────────────

function generateMakefile(ctx) {
  const { framework, isJava, isTypeScript, isPlaywright, isPython, browsers, useAllure } = ctx;

  const installTarget = isJava
    ? `install:\n\tmvn dependency:resolve -q`
    : isTypeScript
    ? `install:\n\tnpm ci\n\tnpx playwright install --with-deps`
    : `install:\n\tpip install -r requirements.txt${isPlaywright ? "\n\tplaywright install --with-deps" : ""}`;

  const testTarget = isJava
    ? `test:\n\tmvn test\n\ntest-smoke:\n\tmvn test -Dgroups=smoke\n\ntest-regression:\n\tmvn test -Dgroups=regression`
    : isTypeScript
    ? `test:\n\tnpx playwright test\n\ntest-smoke:\n\tnpx playwright test --grep @smoke\n\ntest-headed:\n\tnpx playwright test --headed\n\ntest-debug:\n\tnpx playwright test --debug`
    : `test:\n\tpytest tests/ -v\n\ntest-smoke:\n\tpytest tests/ -v -m smoke\n\ntest-parallel:\n\tpytest tests/ -v -n auto\n\ntest-html:\n\tpytest tests/ -v --html=reports/report.html --self-contained-html`;

  const browserTargets = browsers.map(b =>
    `test-${b}:\n\tBROWSER=${b} ${isTypeScript ? `npx playwright test --project=${b}` : isJava ? `mvn test -DBROWSER=${b}` : `pytest tests/ -v`}`
  ).join("\n\n");

  const allureTargets = useAllure
    ? `\nallure-open:\n\tallure serve allure-results\n\nallure-report:\n\tallure generate allure-results --clean -o allure-report`
    : "";

  return `.PHONY: install test clean help ${browsers.map(b => `test-${b}`).join(" ")}

# QA Deck — Makefile
# Generated: ${new Date().toISOString()}

${installTarget}

${testTarget}

${browserTargets}

${allureTargets}

clean:
${isJava ? "\tmvn clean" : isTypeScript ? "\trm -rf test-results/ playwright-report/" : "\trm -rf reports/ .pytest_cache/ __pycache__/"}

ci: install test

docker-test:
\tdocker-compose -f docker-compose.ci.yml up --abort-on-container-exit --exit-code-from qa-tests

help:
\t@echo "Available targets:"
\t@grep -E '^[a-zA-Z_-]+:' Makefile | awk -F: '{print "  " $$1}'
`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getRunner(framework) {
  const map = {
    "selenium-python": "pytest", "selenium-java": "TestNG",
    "playwright-python": "pytest-playwright", "playwright-typescript": "Playwright Test",
  };
  return map[framework] || "pytest";
}

function getInstallCmd(framework) {
  if (framework.includes("java")) return "mvn dependency:resolve";
  if (framework.includes("typescript")) return "npm ci && npx playwright install";
  if (framework.includes("playwright")) return "pip install -r requirements.txt && playwright install";
  return "pip install -r requirements.txt";
}

function getTestCmd(framework, parallel, reporters, useAllure) {
  const junitFlag = reporters.includes("junit");
  const htmlFlag = reporters.includes("html");
  const allureFlag = useAllure;

  if (framework === "playwright-typescript") {
    const flags = ["--reporter=list"];
    if (junitFlag) flags.push("--reporter=junit");
    if (allureFlag) flags.push("'allure-playwright'");
    return `npx playwright test ${flags.join(" ")}`;
  }
  if (framework === "selenium-java" || framework === "playwright-java") {
    return `mvn test${junitFlag ? " -Dsurefire.reportFormat=xml" : ""}`;
  }
  // Python (pytest)
  const args = ["pytest tests/ -v"];
  if (parallel) args.push("-n auto");
  if (junitFlag) args.push("--junit-xml=reports/junit.xml");
  if (htmlFlag) args.push("--html=reports/html/report.html --self-contained-html");
  if (allureFlag) args.push("--alluredir=allure-results");
  return args.join(" ");
}

function getCacheKey(framework) {
  if (framework.includes("java")) return "~/.m2/repository";
  if (framework.includes("typescript")) return "~/.npm";
  return "~/.cache/pip";
}

function slugify(str) {
  return (str || "project")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

module.exports = { generateCICD };
