import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

function getBearerToken(request: NextRequest) {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

function getDashboardProjectsUrl(request: NextRequest) {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}/dashboard/projects`;
}

export async function POST(request: NextRequest) {
  const idToken = getBearerToken(request);
  if (!idToken) {
    return NextResponse.json({ error: "Missing Firebase user token." }, { status: 401 });
  }

  try {
    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(idToken);
    const user = await adminAuth.getUser(decoded.uid);
    const customToken = await adminAuth.createCustomToken(decoded.uid);

    return NextResponse.json({
      uid: decoded.uid,
      email: user.email || decoded.email || "",
      displayName: user.displayName || decoded.name || decoded.email || "QA Deck User",
      photoURL: user.photoURL || null,
      customToken,
      dashboardProjectsUrl: getDashboardProjectsUrl(request),
    });
  } catch (error) {
    console.error("[QA Deck] Extension session failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to create an extension session.",
      },
      { status: 500 }
    );
  }
}
