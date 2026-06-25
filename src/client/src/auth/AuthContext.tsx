import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, clearToken, setToken, type User } from "../api";

type AuthState = {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // 启动时若本地有 token，校验登录态
  useEffect(() => {
    let alive = true;
    api<{ user: User }>("/auth/me")
      .then((data) => {
        if (alive) setUser(data.user);
      })
      .catch(() => {
        if (alive) setUser(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  async function authenticate(path: "/auth/login" | "/auth/register", username: string, password: string) {
    const data = await api<{ token: string; user: User }>(path, {
      method: "POST",
      body: { username, password },
    });
    setToken(data.token);
    setUser(data.user);
  }

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      login: (username, password) => authenticate("/auth/login", username, password),
      register: (username, password) => authenticate("/auth/register", username, password),
      logout: () => {
        clearToken();
        setUser(null);
      },
    }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth 必须在 AuthProvider 内使用");
  }
  return ctx;
}
