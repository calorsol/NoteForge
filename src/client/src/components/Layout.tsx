import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">
          <span className="brand-dot" /> NoteForge
        </span>
        <nav className="nav">
          <NavLink to="/materials" className={({ isActive }) => (isActive ? "active" : "")}>
            资料库
          </NavLink>
          <NavLink to="/write" className={({ isActive }) => (isActive ? "active" : "")}>
            写作中心
          </NavLink>
        </nav>
        <div className="topbar-right">
          <span>{user?.username}</span>
          <button className="btn btn-sm btn-ghost" onClick={handleLogout}>
            退出
          </button>
        </div>
      </header>
      <div className="page">
        <Outlet />
      </div>
    </div>
  );
}
