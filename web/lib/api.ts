import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosError,
  InternalAxiosRequestConfig,
} from "axios";

// ─── Base instance ────────────────────────────────────────────
const api: AxiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000",
  timeout: 15_000,
  headers: {
    "Content-Type": "application/json",
  },
});

// ─── Token helpers ────────────────────────────────────────────
// Tokens are stored in memory (access) and localStorage (refresh).
// Never store the access token in localStorage — XSS risk.

let accessToken: string | null = null;

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

function setCookie(name: string, value: string | null) {
  if (typeof document === "undefined") return;
  if (!value) {
    document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
    return;
  }
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
}

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export function getRefreshToken() {
  if (typeof window === "undefined") return null;
  const local = localStorage.getItem("pp_refresh_token");
  if (local) return local;
  const cookie = getCookie("pp_refresh_token");
  if (cookie) {
    localStorage.setItem("pp_refresh_token", cookie);
    return cookie;
  }
  return null;
}

export function setRefreshToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) {
    localStorage.setItem("pp_refresh_token", token);
    setCookie("pp_refresh_token", token);
  } else {
    localStorage.removeItem("pp_refresh_token");
    setCookie("pp_refresh_token", null);
  }
}

export function clearTokens() {
  setAccessToken(null);
  setRefreshToken(null);
}

// ─── Request interceptor — attach access token ────────────────
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

function isLoginRequest(config: AxiosRequestConfig) {
  return config.url?.endsWith("/auth/login") ?? false;
}

// ─── Response interceptor — handle 401, auto-refresh ─────────
let isRefreshing = false;
let refreshQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

function processRefreshQueue(error: unknown, token: string | null) {
  refreshQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else if (token) {
      resolve(token);
    }
  });
  refreshQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as AxiosRequestConfig & {
      _retry?: boolean;
    };

    // Only retry on 401, and only once. A failed sign-in has no session to refresh.
    if (
      error.response?.status !== 401 ||
      originalRequest._retry ||
      isLoginRequest(originalRequest)
    ) {
      return Promise.reject(normaliseError(error));
    }

    // If already refreshing, queue this request
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        refreshQueue.push({ resolve, reject });
      }).then((token) => {
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${token}`;
        }
        return api(originalRequest);
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    const refreshToken = getRefreshToken();

    if (!refreshToken) {
      isRefreshing = false;
      processRefreshQueue(error, null);
      handleAuthFailure();
      return Promise.reject(normaliseError(error));
    }

    try {
      const { data } = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/auth/refresh`,
        { refresh_token: refreshToken }
      );

      const newAccessToken: string = data.access_token;
      setAccessToken(newAccessToken);
      processRefreshQueue(null, newAccessToken);

      if (originalRequest.headers) {
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
      }

      return api(originalRequest);
    } catch (refreshError) {
      processRefreshQueue(refreshError, null);
      handleAuthFailure();
      return Promise.reject(normaliseError(refreshError));
    } finally {
      isRefreshing = false;
    }
  }
);

// ─── Auth failure handler ─────────────────────────────────────
function handleAuthFailure() {
  clearTokens();
  // Redirect to login — works in browser only
  if (typeof window !== "undefined") {
    window.location.href = "/login";
  }
}

// ─── Error normaliser ─────────────────────────────────────────
export interface ApiError {
  message: string;
  status: number | null;
  detail: unknown;
}

export function normaliseError(error: unknown): ApiError {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status ?? null;
    const detail = error.response?.data?.detail ?? null;
    const message =
      typeof detail === "string"
        ? detail
        : validationMessage(detail) ??
          error.response?.data?.message ??
          error.message ??
          "An error occurred";
    return { message, status, detail };
  }
  if (isApiError(error)) {
    return error;
  }
  return {
    message: error instanceof Error ? error.message : "An unknown error occurred",
    status: null,
    detail: null,
  };
}

// FastAPI reports invalid input as a list of { loc, msg } entries
function validationMessage(detail: unknown): string | null {
  if (!Array.isArray(detail) || detail.length === 0) return null;
  return detail
    .map((item: { loc?: unknown[]; msg?: string }) => {
      const field = item.loc?.[item.loc.length - 1];
      return field && field !== "body" ? `${field}: ${item.msg}` : item.msg;
    })
    .join("; ");
}

export function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    "status" in error
  );
}

export function isRequestCancelled(error: unknown): boolean {
  if (axios.isCancel(error)) return true;
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (typeof error === "object" && error !== null) {
    const maybe = error as { name?: string; code?: string; message?: string };
    return (
      maybe.name === "AbortError" ||
      maybe.name === "CanceledError" ||
      maybe.code === "ERR_CANCELED" ||
      maybe.message === "canceled"
    );
  }
  return false;
}

// ─── Portal client (separate instance for client-facing auth) ──
export const portalApi: AxiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000",
  timeout: 15_000,
  headers: { "Content-Type": "application/json" },
});

let portalAccessToken: string | null = null;

export function setPortalAccessToken(token: string | null) {
  portalAccessToken = token;
}

export function getPortalRefreshToken() {
  if (typeof window === "undefined") return null;
  const local = localStorage.getItem("pp_portal_refresh");
  if (local) return local;
  const cookie = getCookie("pp_portal_refresh");
  if (cookie) {
    localStorage.setItem("pp_portal_refresh", cookie);
    return cookie;
  }
  return null;
}

export function setPortalRefreshToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) {
    localStorage.setItem("pp_portal_refresh", token);
    setCookie("pp_portal_refresh", token);
  } else {
    localStorage.removeItem("pp_portal_refresh");
    setCookie("pp_portal_refresh", null);
  }
}

export function clearPortalTokens() {
  setPortalAccessToken(null);
  setPortalRefreshToken(null);
}

portalApi.interceptors.request.use((config) => {
  if (portalAccessToken) {
    config.headers.Authorization = `Bearer ${portalAccessToken}`;
  }
  return config;
});

let isPortalRefreshing = false;
let portalRefreshQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

function processPortalRefreshQueue(error: unknown, token: string | null) {
  portalRefreshQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else if (token) {
      resolve(token);
    }
  });
  portalRefreshQueue = [];
}

portalApi.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const originalRequest = error.config as AxiosRequestConfig & {
      _retry?: boolean;
    };

    // After a full page load the access token is gone from memory, and a request
    // with no token is answered 403 rather than 401.
    const needsToken =
      error.response?.status === 401 ||
      (error.response?.status === 403 && !portalAccessToken);

    if (!needsToken || originalRequest._retry || isLoginRequest(originalRequest)) {
      return Promise.reject(normaliseError(error));
    }

    if (isPortalRefreshing) {
      return new Promise((resolve, reject) => {
        portalRefreshQueue.push({ resolve, reject });
      }).then((token) => {
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${token}`;
        }
        return portalApi(originalRequest);
      });
    }

    originalRequest._retry = true;
    isPortalRefreshing = true;

    const refreshToken = getPortalRefreshToken();
    if (!refreshToken) {
      isPortalRefreshing = false;
      processPortalRefreshQueue(error, null);
      clearPortalTokens();
      if (typeof window !== "undefined") {
        window.location.href = "/portal/login";
      }
      return Promise.reject(normaliseError(error));
    }

    try {
      const { data } = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/portal/auth/refresh`,
        { refresh_token: refreshToken }
      );

      const newAccessToken: string = data.access_token;
      setPortalAccessToken(newAccessToken);
      processPortalRefreshQueue(null, newAccessToken);

      if (originalRequest.headers) {
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
      }

      return portalApi(originalRequest);
    } catch (refreshError) {
      processPortalRefreshQueue(refreshError, null);
      clearPortalTokens();
      if (typeof window !== "undefined") {
        window.location.href = "/portal/login";
      }
      return Promise.reject(normaliseError(refreshError));
    } finally {
      isPortalRefreshing = false;
    }
  }
);

export default api;
