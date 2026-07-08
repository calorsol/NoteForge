import { useCallback, useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { loadStealth, saveStealth } from "../appearance";

const NORMAL_TITLE = "NoteForge";
const STEALTH_TITLE = "内部文档中心";

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [stealth, setStealth] = useState(loadStealth);

  const toggleStealth = useCallback(() => setStealth((value) => !value), []);

  useEffect(() => {
    document.documentElement.dataset.stealth = stealth ? "on" : "off";
    document.title = stealth ? STEALTH_TITLE : NORMAL_TITLE;
    saveStealth(stealth);
  }, [stealth]);

  // 老板键：Ctrl + ` 一键进出伪装模式。
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey && !event.altKey && !event.metaKey && event.code === "Backquote") {
        event.preventDefault();
        toggleStealth();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleStealth]);

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">
          <span className="brand-dot" /> {stealth ? STEALTH_TITLE : NORMAL_TITLE}
        </span>
        <nav className="nav">
          <NavLink to="/materials" className={({ isActive }) => (isActive ? "active" : "")}>
            {stealth ? "文档" : "资料库"}
          </NavLink>
          <NavLink to="/write" className={({ isActive }) => (isActive ? "active" : "")}>
            写作中心
          </NavLink>
        </nav>
        <div className="topbar-right">
          <button
            className="btn btn-sm btn-ghost stealth-toggle"
            onClick={toggleStealth}
            title="Ctrl + ` 一键切换"
          >
            {stealth ? "退出阅读模式" : "阅读模式"}
          </button>
          {!stealth && (
            <>
              <span>{user?.username}</span>
              <button className="btn btn-sm btn-ghost" onClick={handleLogout}>
                退出
              </button>
            </>
          )}
        </div>
      </header>
      <div className="page">
        <Outlet />
      </div>
    </div>
  );
}
