import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { MaterialsPage } from "./pages/MaterialsPage";
import { WritePage } from "./pages/WritePage";
import type { ReactElement } from "react";

function RequireAuth({ children }: { children: ReactElement }) {
  const { user, loading } = useAuth();
  if (loading) {
    return <div className="center-loading">加载中…</div>;
  }
  return user ? children : <Navigate to="/login" replace />;
}

export function App() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to="/materials" replace /> : <LoginPage />}
      />
      <Route
        path="/register"
        element={user ? <Navigate to="/materials" replace /> : <RegisterPage />}
      />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/materials" element={<MaterialsPage />} />
        <Route path="/write" element={<WritePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/materials" replace />} />
    </Routes>
  );
}
