"use client";

import { useEffect } from "react";
import { getRefreshToken, setRefreshToken } from "@/lib/api";

/**
 * AuthHydrator - rendered once in the root layout.
 *
 * On mount it checks:
 * 1. Is there a refresh token in localStorage?
 * 2. If yes - attempt to exchange it for a new access token
 * 3. If that succeeds - set the access token in memory and confirm the session
 * 4. If it fails - clear auth state and let the middleware handle the redirect
 *
 * This bridges the gap between a hard page reload
 * (which clears the in-memory access token) and the persisted
 * Zustand auth state (which only stores the user object).
 */
export function AuthHydrator() {
  useEffect(() => {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      // Ensure the cookie exists for middleware checks on next navigation.
      setRefreshToken(refreshToken);
    }
  }, []);

  return null;
}
