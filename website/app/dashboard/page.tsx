"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function DashboardLandingPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard/projects");
  }, [router]);

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-green border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
