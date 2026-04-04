/**
 * QA Deck — Firebase Auth, Usage Tracking, and Cloud Project Sync
 * Uses Firebase REST APIs directly (no SDK, no CDN, CSP-safe).
 * The primary extension auth flow is a website-issued custom token bridge.
 */

(function () {
  const cfg = window.QA_DECK_FIREBASE || {};
  const API_KEY = cfg.apiKey || "";
  const PROJECT_ID = cfg.projectId || "";
  const WEBSITE_BASE_URL = cfg.websiteBaseUrl
    || deriveWebsiteBaseUrl(cfg.websiteProjectsUrl)
    || "https://qadeck.com";
  const WEBSITE_PROJECTS_URL = cfg.websiteProjectsUrl || `${WEBSITE_BASE_URL}/dashboard/projects`;
  const WEBSITE_CONNECT_URL = cfg.websiteConnectUrl || `${WEBSITE_BASE_URL}/dashboard/connect-extension`;
  const AUTH_STATE_EVENT = "qadeck-auth-changed";
  const USER_STORAGE_KEY = "qaDeckUser";
  const PENDING_SESSION_STORAGE_KEY = "qaDeckPendingWebsiteSession";

  if (!API_KEY || !PROJECT_ID) {
    console.warn("[QA Deck] Firebase config not found. Auth disabled. Set up src/firebase-config.js.");
    return;
  }

  const FIREBASE_AUTH_URL = "https://identitytoolkit.googleapis.com/v1/accounts";
  const SECURE_TOKEN_URL = `https://securetoken.googleapis.com/v1/token?key=${API_KEY}`;
  const FIRESTORE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

  let currentUser = null;
  let resolveAuthReady = null;
  let processingPendingSessionId = null;
  const authReady = new Promise((resolve) => { resolveAuthReady = resolve; });

  chrome.storage.local.get([USER_STORAGE_KEY, PENDING_SESSION_STORAGE_KEY], async (stored) => {
    currentUser = stored[USER_STORAGE_KEY] ? normalizeStoredUser(stored[USER_STORAGE_KEY]) : null;

    if (stored[PENDING_SESSION_STORAGE_KEY]) {
      await processPendingWebsiteSession(stored[PENDING_SESSION_STORAGE_KEY]);
    }

    if (currentUser) renderSignedIn(currentUser);
    else renderSignedOut();
    emitAuthState();
    resolveAuthReady?.(currentUser);
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;

    if (changes[USER_STORAGE_KEY] && !processingPendingSessionId) {
      currentUser = changes[USER_STORAGE_KEY].newValue
        ? normalizeStoredUser(changes[USER_STORAGE_KEY].newValue)
        : null;
      if (currentUser) renderSignedIn(currentUser);
      else renderSignedOut();
      emitAuthState();
    }

    if (changes[PENDING_SESSION_STORAGE_KEY]?.newValue) {
      processPendingWebsiteSession(changes[PENDING_SESSION_STORAGE_KEY].newValue);
    }
  });

  async function processPendingWebsiteSession(session) {
    if (!session?.customToken) return false;

    const sessionId = session.id || session.customToken;
    if (processingPendingSessionId === sessionId) return false;
    processingPendingSessionId = sessionId;

    try {
      setAuthLoading(true, "Connecting...");
      const firebaseUser = await exchangeCustomToken(session.customToken, session.profile || {});
      currentUser = firebaseUser;
      await chrome.storage.local.set({ [USER_STORAGE_KEY]: firebaseUser });
      await ensureUserDoc(firebaseUser, {
        connectedAt: session.connectedAt || new Date().toISOString(),
        version: session.extensionVersion || chrome.runtime.getManifest().version,
      });
      await chrome.storage.local.remove(PENDING_SESSION_STORAGE_KEY);
      renderSignedIn(firebaseUser);
      emitAuthState();
      return true;
    } catch (err) {
      console.error("[QA Deck Auth] Website connection failed:", err);
      setAuthError(err.message || "Connection failed");
      currentUser = null;
      await chrome.storage.local.remove([USER_STORAGE_KEY, PENDING_SESSION_STORAGE_KEY]);
      renderSignedOut();
      emitAuthState();
      return false;
    } finally {
      processingPendingSessionId = null;
      setAuthLoading(false);
    }
  }

  async function exchangeCustomToken(customToken, profile = {}) {
    const res = await fetch(`${FIREBASE_AUTH_URL}:signInWithCustomToken?key=${API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: customToken,
        returnSecureToken: true,
      }),
    });

    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error?.message || "Custom token sign-in failed");

    return normalizeStoredUser({
      uid: data.localId || profile.uid,
      email: profile.email || "",
      displayName: profile.displayName || profile.email || "QA Deck User",
      photoURL: profile.photoURL || "",
      idToken: data.idToken,
      refreshToken: data.refreshToken || "",
      idTokenExpiryAt: Date.now() + (Number(data.expiresIn || 3600) * 1000),
    });
  }

  function signOut() {
    currentUser = null;
    chrome.storage.local.remove([USER_STORAGE_KEY, PENDING_SESSION_STORAGE_KEY]);
    chrome.identity.clearAllCachedAuthTokens(() => {});
    renderSignedOut();
    emitAuthState();
  }

  async function ensureUserDoc(user, connectionMeta = {}) {
    const token = await refreshToken(false, user);
    if (!token) return;

    const now = new Date().toISOString();
    await firestorePatchData(`users/${user.uid}`, {
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      lastActiveAt: now,
      extensionConnected: true,
      extensionConnectedAt: connectionMeta.connectedAt || now,
      lastExtensionSeenAt: now,
      lastExtensionVersion: connectionMeta.version || chrome.runtime.getManifest().version,
    }, token);

    const totalsPath = `users/${user.uid}/usage/totals`;
    const existing = await firestoreGetData(totalsPath, token);
    if (!existing) {
      await firestorePatchData(totalsPath, {
        scansRun: 0,
        testsGenerated: 0,
        scriptsDownloaded: 0,
        lastUpdated: now,
      }, token);
    }
  }

  async function refreshToken(force = false, userOverride = null) {
    const user = userOverride || currentUser;
    if (!user) return null;

    if (!force && user.idToken && user.idTokenExpiryAt && (user.idTokenExpiryAt - Date.now()) > 60_000) {
      return user.idToken;
    }

    if (!user.refreshToken) {
      throw new Error("QA Deck session expired. Reconnect it from qadeck.com.");
    }

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: user.refreshToken,
    });
    const res = await fetch(SECURE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error("QA Deck session expired. Reconnect it from qadeck.com.");
    }

    const refreshed = normalizeStoredUser({
      ...user,
      idToken: data.id_token,
      refreshToken: data.refresh_token || user.refreshToken,
      idTokenExpiryAt: Date.now() + (Number(data.expires_in || 3600) * 1000),
    });
    currentUser = refreshed;
    await chrome.storage.local.set({ [USER_STORAGE_KEY]: refreshed });
    emitAuthState();
    return refreshed.idToken;
  }

  async function incrementUsage(field, count = 1) {
    if (!currentUser) return;
    const token = await refreshToken();
    if (!token) return;

    const totalsPath = `users/${currentUser.uid}/usage/totals`;
    const snap = await firestoreGetData(totalsPath, token);
    const current = Number(snap?.[field] || 0);
    const now = new Date().toISOString();

    await firestorePatchData(totalsPath, {
      [field]: current + count,
      lastUpdated: now,
    }, token);

    await firestorePatchData(`users/${currentUser.uid}`, {
      lastActiveAt: now,
      lastExtensionSeenAt: now,
      lastExtensionVersion: chrome.runtime.getManifest().version,
    }, token);
  }

  async function listProjects() {
    if (!currentUser) return [];
    const token = await refreshToken();
    const docs = await firestoreListCollection(`users/${currentUser.uid}/projects`, token);
    return docs
      .map((doc) => ({
        ...doc,
        location: "cloud",
        syncState: doc.syncState || "synced",
      }))
      .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  }

  async function createProject(metaInput) {
    if (!currentUser) throw new Error("Connect QA Deck on qadeck.com to create cloud projects");
    const token = await refreshToken();
    const now = new Date().toISOString();
    const id = metaInput.id || crypto.randomUUID();
    const meta = {
      id,
      name: metaInput.name || "Untitled Project",
      mode: metaInput.mode || "page",
      status: metaInput.status || "draft",
      tags: Array.isArray(metaInput.tags) ? metaInput.tags : [],
      sourceUrl: metaInput.sourceUrl || metaInput.url || "",
      activeFramework: metaInput.activeFramework || "selenium-python",
      artifactCounts: metaInput.artifactCounts || {
        scans: 0,
        journeys: 0,
        testCases: 0,
        scriptFiles: 0,
        cicdFiles: 0,
        notes: 0,
      },
      latestVersionId: metaInput.latestVersionId || "",
      createdAt: metaInput.createdAt || now,
      updatedAt: now,
      lastOpenedAt: now,
      syncState: "synced",
      location: "cloud",
      appId: metaInput.appId || null,
      appName: metaInput.appName || null,
      pageKey: metaInput.pageKey || null,
      pageLabel: metaInput.pageLabel || null,
    };

    const basePath = `users/${currentUser.uid}/projects/${id}`;
    await firestorePatchData(basePath, meta, token);
    await firestorePatchData(`${basePath}/activities/${crypto.randomUUID()}`, {
      id: crypto.randomUUID(),
      timestamp: now,
      type: "project_created",
      message: "Project created in the extension",
      versionId: "",
      actor: "extension",
    }, token);
    return meta;
  }

  async function saveProjectVersion(bundle) {
    if (!currentUser) throw new Error("Connect QA Deck on qadeck.com to sync projects");
    const token = await refreshToken();
    const uid = currentUser.uid;
    const basePath = `users/${uid}/projects/${bundle.meta.id}`;
    const meta = {
      ...bundle.meta,
      syncState: "synced",
      location: "cloud",
    };

    await firestorePatchData(basePath, meta, token);
    await firestorePatchData(`${basePath}/versions/${bundle.version.id}`, bundle.version, token);

    for (const activity of bundle.activities || []) {
      await firestorePatchData(`${basePath}/activities/${activity.id}`, activity, token);
    }

    for (const [kind, artifact] of Object.entries(bundle.artifacts || {})) {
      if (!artifact || kind === "scriptFiles") continue;
      await firestorePatchData(`${basePath}/versions/${bundle.version.id}/artifacts/${kind}`, {
        id: kind,
        kind,
        updatedAt: bundle.version.createdAt,
        payloadJson: JSON.stringify(artifact),
      }, token);
    }

    for (const [index, file] of (bundle.artifacts?.scriptFiles || []).entries()) {
      const docId = file.id || sanitizeDocId(file.filename || `file-${index + 1}`);
      await firestorePatchData(`${basePath}/versions/${bundle.version.id}/scriptFiles/${docId}`, {
        id: docId,
        filename: file.filename,
        content: file.content,
        key: file.key || null,
        group: file.group || "page",
        stepId: file.stepId || null,
        sortOrder: index,
      }, token);
    }

    return { success: true, projectId: meta.id };
  }

  async function getProjectBundle(projectId) {
    if (!currentUser) throw new Error("Connect QA Deck on qadeck.com to load cloud projects");
    const token = await refreshToken();
    const uid = currentUser.uid;
    const basePath = `users/${uid}/projects/${projectId}`;
    const meta = await firestoreGetData(basePath, token);
    if (!meta) throw new Error("Project not found");

    const versions = (await firestoreListCollection(`${basePath}/versions`, token))
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    const activities = (await firestoreListCollection(`${basePath}/activities`, token))
      .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
    const latestVersionId = meta.latestVersionId || versions[0]?.id || "";
    const latestVersion = latestVersionId
      ? (versions.find((version) => version.id === latestVersionId) || await firestoreGetData(`${basePath}/versions/${latestVersionId}`, token))
      : null;

    const artifacts = {
      scan: null,
      journey: null,
      testcases: null,
      cicd: null,
      notes: null,
      scriptFiles: [],
    };

    if (latestVersionId) {
      const artifactDocs = await firestoreListCollection(`${basePath}/versions/${latestVersionId}/artifacts`, token);
      artifactDocs.forEach((doc) => {
        if (doc.kind && Object.prototype.hasOwnProperty.call(artifacts, doc.kind)) {
          artifacts[doc.kind] = parsePayloadJson(doc.payloadJson);
        }
      });
      artifacts.scriptFiles = (await firestoreListCollection(`${basePath}/versions/${latestVersionId}/scriptFiles`, token))
        .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
    }

    return {
      meta: { ...meta, location: "cloud", syncState: meta.syncState || "synced" },
      latestVersion,
      versions,
      activities,
      artifacts,
    };
  }

  async function updateProjectMeta(projectId, patch) {
    if (!currentUser) throw new Error("Connect QA Deck on qadeck.com to update cloud projects");
    const token = await refreshToken();
    await firestorePatchData(`users/${currentUser.uid}/projects/${projectId}`, patch, token);
  }

  async function firestoreGetData(docPath, token) {
    try {
      const res = await fetch(`${FIRESTORE_URL}/${docPath}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      const data = await res.json();
      return fromFirestoreDoc(data);
    } catch {
      return null;
    }
  }

  async function firestoreListCollection(collectionPath, token) {
    const res = await fetch(`${FIRESTORE_URL}/${collectionPath}?pageSize=50`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      if (res.status === 404) return [];
      const errorText = await res.text();
      throw new Error(`Failed to list ${collectionPath}: ${errorText || res.status}`);
    }
    const data = await res.json();
    return (data.documents || []).map((doc) => fromFirestoreDoc(doc));
  }

  async function firestorePatchData(docPath, data, token) {
    const fields = toFirestoreFields(data);
    const fieldMask = Object.keys(fields).map((field) => `updateMask.fieldPaths=${encodeURIComponent(field)}`).join("&");
    const suffix = fieldMask ? `?${fieldMask}` : "";
    const res = await fetch(`${FIRESTORE_URL}/${docPath}${suffix}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ fields }),
    });
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(errorText || `Failed to write ${docPath}`);
    }
    return res.json();
  }

  function toFirestoreFields(data) {
    return Object.fromEntries(
      Object.entries(data || {})
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [key, toFirestoreValue(value)])
    );
  }

  function toFirestoreValue(value) {
    if (value === null) return { nullValue: null };
    if (Array.isArray(value)) {
      return {
        arrayValue: {
          values: value.map((item) => toFirestoreValue(item)),
        },
      };
    }
    if (typeof value === "boolean") return { booleanValue: value };
    if (typeof value === "number") {
      return Number.isInteger(value)
        ? { integerValue: String(value) }
        : { doubleValue: value };
    }
    if (typeof value === "object") {
      return {
        mapValue: {
          fields: toFirestoreFields(value),
        },
      };
    }
    return { stringValue: String(value) };
  }

  function fromFirestoreDoc(doc) {
    const payload = fromFirestoreValue({ mapValue: { fields: doc.fields || {} } }) || {};
    payload.id = payload.id || doc.name?.split("/").pop() || "";
    return payload;
  }

  function fromFirestoreValue(value) {
    if (!value || typeof value !== "object") return null;
    if (Object.prototype.hasOwnProperty.call(value, "stringValue")) return value.stringValue;
    if (Object.prototype.hasOwnProperty.call(value, "integerValue")) return Number(value.integerValue);
    if (Object.prototype.hasOwnProperty.call(value, "doubleValue")) return Number(value.doubleValue);
    if (Object.prototype.hasOwnProperty.call(value, "booleanValue")) return value.booleanValue;
    if (Object.prototype.hasOwnProperty.call(value, "nullValue")) return null;
    if (Object.prototype.hasOwnProperty.call(value, "timestampValue")) return value.timestampValue;
    if (value.arrayValue) return (value.arrayValue.values || []).map((item) => fromFirestoreValue(item));
    if (value.mapValue) {
      return Object.fromEntries(
        Object.entries(value.mapValue.fields || {}).map(([key, nested]) => [key, fromFirestoreValue(nested)])
      );
    }
    return null;
  }

  function normalizeStoredUser(user) {
    return {
      uid: user.uid,
      email: user.email || "",
      displayName: user.displayName || user.email || "User",
      photoURL: user.photoURL || "",
      idToken: user.idToken || "",
      refreshToken: user.refreshToken || "",
      idTokenExpiryAt: Number(user.idTokenExpiryAt || 0),
    };
  }

  function parsePayloadJson(value) {
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  function sanitizeDocId(value) {
    return String(value || "file")
      .replace(/[/.?#\[\]]+/g, "_")
      .replace(/\s+/g, "_")
      .slice(0, 120);
  }

  function emitAuthState() {
    window.dispatchEvent(new CustomEvent(AUTH_STATE_EVENT, {
      detail: {
        signedIn: !!currentUser,
        user: currentUser ? {
          uid: currentUser.uid,
          email: currentUser.email,
          displayName: currentUser.displayName,
          photoURL: currentUser.photoURL,
        } : null,
      },
    }));
  }

  function renderSignedIn(user) {
    const out = document.getElementById("auth-signed-out");
    const inn = document.getElementById("auth-signed-in");
    if (!out || !inn) return;
    out.classList.add("hidden");
    inn.classList.remove("hidden");

    const avatar = document.getElementById("auth-avatar");
    const name = document.getElementById("auth-display-name");
    const email = document.getElementById("auth-email");

    if (avatar) avatar.src = user.photoURL || "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
    if (name) name.textContent = user.displayName || "QA Deck User";
    if (email) email.textContent = user.email || "Connected";
  }

  function renderSignedOut() {
    const out = document.getElementById("auth-signed-out");
    const inn = document.getElementById("auth-signed-in");
    if (!out || !inn) return;
    out.classList.remove("hidden");
    inn.classList.add("hidden");
  }

  function setAuthLoading(loading, label = "Connecting...") {
    const btn = document.getElementById("auth-connect-btn");
    if (!btn) return;
    btn.disabled = loading;
    btn.textContent = loading ? label : "Connect via qadeck.com";
  }

  function setAuthError(message) {
    const btn = document.getElementById("auth-connect-btn");
    if (!btn) return;
    btn.textContent = message;
    setTimeout(() => { btn.textContent = "Connect via qadeck.com"; }, 3000);
  }

  function deriveWebsiteBaseUrl(projectsUrl) {
    if (!projectsUrl) return "";
    return projectsUrl.replace(/\/dashboard\/projects\/?$/, "");
  }

  async function openConnectExperience() {
    const tabs = await chrome.tabs.query({});
    const preferred = tabs.find((tab) => isKnownWebsiteOrigin(tab.url));
    const targetUrl = preferred?.url ? buildConnectUrl(preferred.url) : WEBSITE_CONNECT_URL;

    if (preferred?.id) {
      await chrome.tabs.update(preferred.id, { active: true, url: targetUrl });
      return;
    }

    chrome.tabs.create({ url: targetUrl });
  }

  function isKnownWebsiteOrigin(value) {
    try {
      const url = new URL(value);
      return (
        url.origin === "https://qadeck.com" ||
        url.origin === "https://www.qadeck.com" ||
        url.origin === "https://qa-deck-beryl.vercel.app" ||
        (url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1"))
      );
    } catch {
      return false;
    }
  }

  function buildConnectUrl(value) {
    try {
      const url = new URL(value);
      return `${url.origin}/dashboard/connect-extension`;
    } catch {
      return WEBSITE_CONNECT_URL;
    }
  }

  window.qadeckAuth = {
    ready: () => authReady,
    logScan: () => incrementUsage("scansRun"),
    logTests: (count) => incrementUsage("testsGenerated", count),
    logDownload: () => incrementUsage("scriptsDownloaded"),
    isSignedIn: () => !!currentUser,
    getUser: () => currentUser ? {
      uid: currentUser.uid,
      email: currentUser.email,
      displayName: currentUser.displayName,
      photoURL: currentUser.photoURL,
    } : null,
    getFreshIdToken: () => refreshToken(true),
    listProjects,
    getProjectBundle,
    createProject,
    saveProjectVersion,
    updateProjectMeta,
    getProjectsUrl: () => WEBSITE_PROJECTS_URL,
    getConnectUrl: () => WEBSITE_CONNECT_URL,
    openConnectUrl: openConnectExperience,
  };

  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("auth-connect-btn")?.addEventListener("click", openConnectExperience);
    document.getElementById("auth-signout-btn")?.addEventListener("click", signOut);
  });

  if (document.readyState !== "loading") {
    document.getElementById("auth-connect-btn")?.addEventListener("click", openConnectExperience);
    document.getElementById("auth-signout-btn")?.addEventListener("click", signOut);
  }
})();
