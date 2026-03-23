import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import api, {
  setAccessToken,
  setRefreshToken,
  getRefreshToken,
  clearTokens,
  normaliseError,
} from "@/lib/api";
import type { User, LoginRequest, TokenResponse } from "@/lib/types";

// ─── State shape ──────────────────────────────────────────────
interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  login: (credentials: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  clearError: () => void;
  _hydrateTokens: () => void;
}

// ─── Store ────────────────────────────────────────────────────
export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (credentials) => {
        set({ isLoading: true, error: null });
        try {
          const { data } = await api.post<TokenResponse>(
            "/auth/login",
            credentials
          );

          // Store access token in memory, refresh token in localStorage
          setAccessToken(data.access_token);
          setRefreshToken(data.refresh_token);

          set({
            user: data.user,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
        } catch (err) {
          const apiErr = normaliseError(err);
          set({
            isLoading: false,
            error: apiErr.message,
            isAuthenticated: false,
            user: null,
          });
          throw apiErr;
        }
      },

      logout: async () => {
        try {
          const refreshToken =
            typeof window !== "undefined"
              ? localStorage.getItem("pp_refresh_token")
              : null;
          if (refreshToken) {
            await api.post("/auth/logout", { refresh_token: refreshToken });
          }
        } catch {
          // Swallow — we're logging out regardless
        } finally {
          clearTokens();
          set({ user: null, isAuthenticated: false, error: null });
          if (typeof window !== "undefined") {
            window.location.href = "/login";
          }
        }
      },

      refreshUser: async () => {
        try {
          const { data } = await api.get<User>("/auth/me");
          set({ user: data, isAuthenticated: true });
        } catch {
          // Access token may have expired — interceptor will handle refresh
          set({ user: null, isAuthenticated: false });
        }
      },

      clearError: () => set({ error: null }),

      // Called on app mount to restore session from refresh token
      _hydrateTokens: async () => {
        const state = get();

        try {
          const refreshToken = getRefreshToken();
          if (!refreshToken) {
            clearTokens();
            set({ user: null, isAuthenticated: false });
            return;
          }

          const { data: refresh } = await api.post<{ access_token: string }>(
            "/auth/refresh",
            { refresh_token: refreshToken }
          );
          setAccessToken(refresh.access_token);

          const { data } = await api.get<User>("/auth/me");
          set({ user: data, isAuthenticated: true });
        } catch {
          clearTokens();
          set({ user: null, isAuthenticated: false });
        }
      },
    }),
    {
      name: "pp-auth",
      storage: createJSONStorage(() =>
        typeof window !== "undefined" ? localStorage : memoryStorage()
      ),
      // Only persist the user object and auth flag — NOT the access token
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

// ─── SSR-safe memory storage fallback ────────────────────────
function memoryStorage() {
  const store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
  };
}

// ─── Convenience selectors ────────────────────────────────────
export const selectUser = (state: AuthState) => state.user;
export const selectIsAuthenticated = (state: AuthState) => state.isAuthenticated;
export const selectAuthLoading = (state: AuthState) => state.isLoading;
export const selectAuthError = (state: AuthState) => state.error;

// ─── Permission check helper ──────────────────────────────────
export function useHasPermission(permission: string): boolean {
  const user = useAuthStore(selectUser);
  if (!user) return false;
  // Admin role has all permissions
  if (user.roles.some((r) => r.name === "admin")) return true;
  // For more granular checks, fetch permissions from /auth/me
  // For now: manager and staff have read access to most things
  return user.roles.length > 0;
}
