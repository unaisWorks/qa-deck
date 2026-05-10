import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  updateProfile,
  type User,
} from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { doc, setDoc, serverTimestamp, getDoc } from "firebase/firestore";
import { auth, db } from "./firebase";

const googleProvider = new GoogleAuthProvider();

function requireAuth() {
  if (!auth) throw new Error("Firebase not configured. Add your keys to .env.local");
  return auth;
}
function requireDb() {
  if (!db) throw new Error("Firebase not configured. Add your keys to .env.local");
  return db;
}

export async function createUserDoc(user: User) {
  const database = requireDb();
  const ref = doc(database, "users", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      email: user.email,
      displayName: user.displayName || "",
      photoURL: user.photoURL || "",
      createdAt: serverTimestamp(),
      lastActiveAt: serverTimestamp(),
    });
    await setDoc(doc(database, "users", user.uid, "usage", "totals"), {
      scansRun: 0,
      testsGenerated: 0,
      scriptsDownloaded: 0,
      lastUpdated: serverTimestamp(),
    });
  }
}

export async function signUpWithEmail(name: string, email: string, password: string) {
  const cred = await createUserWithEmailAndPassword(requireAuth(), email, password);
  await updateProfile(cred.user, { displayName: name });
  await createUserDoc({ ...cred.user, displayName: name });
  return cred.user;
}

export async function signInWithEmail(email: string, password: string) {
  const cred = await signInWithEmailAndPassword(requireAuth(), email, password);
  await createUserDoc(cred.user);
  return cred.user;
}

export async function signInWithGoogle() {
  const result = await signInWithPopup(requireAuth(), googleProvider);
  await createUserDoc(result.user);
  return result.user;
}

export async function signOut() {
  await firebaseSignOut(requireAuth());
}

export function getAuthErrorMessage(error: unknown, mode: "signin" | "signup" | "google" = "signin") {
  if (!(error instanceof FirebaseError)) {
    if (error instanceof Error) return error.message;
    return "Something went wrong. Please try again.";
  }

  switch (error.code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Invalid email or password.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/email-already-in-use":
      return "An account with this email already exists.";
    case "auth/weak-password":
      return "Password is too weak. Use at least 6 characters.";
    case "auth/popup-closed-by-user":
      return "Google sign-in was canceled before completion.";
    case "auth/popup-blocked":
      return "The browser blocked the sign-in window. Please allow popups and try again.";
    case "auth/cancelled-popup-request":
      return "Another sign-in request is already in progress.";
    case "auth/operation-not-allowed":
      return mode === "google"
        ? "Google sign-in is not enabled in Firebase for this project."
        : "Email/password sign-in is not enabled in Firebase for this project.";
    case "auth/account-exists-with-different-credential":
      return "An account already exists with this email using a different sign-in method.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a bit and try again.";
    case "auth/network-request-failed":
      return "Network error. Check your connection and try again.";
    default:
      return error.message || "Authentication failed. Please try again.";
  }
}
