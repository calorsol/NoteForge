import { useCallback, useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { loadLastSkin, saveLastSkin, type StealthSkin } from "../appearance";
import { InlineEditable } from "./InlineEditable";
import { useDisguise } from "../disguise/DisguiseContext";

const NORMAL_TITLE = "NoteForge";

export function Layout() {
  const { user, logout } = useAuth();
  const { skin, setSkin, getConfig, updateConfig } = useDisguise();
  const navigate = useNavigate();
  const [lastSkin, setLastSkin] = useState<Exclude<StealthSkin, "off">>(loadLastSkin);

  const toggleStealth = useCallback(() => {
    const nextSkin = skin === "off" ? lastSkin : "off";
    setSkin(nextSkin);
  }, [skin, lastSkin, setSkin]);

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

  useEffect(() => {
    if (skin !== "off") {
      setLastSkin(skin);
      saveLastSkin(skin);
    }
  }, [skin]);

  function handleLogout() {
    logout();
    navigate("/login");
  }

  const stealthOn = skin !== "off";
  const brand =
    skin === "wiki"
      ? getConfig("disguise.wiki_brand")
      : skin === "csdn"
        ? getConfig("disguise.csdn_brand")
        : NORMAL_TITLE;

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">
          <span className="brand-dot" />
          {skin === "wiki" ? (
            <InlineEditable
              as="span"
              className="brand-editable"
              inputClassName="brand-editable-input"
              value={brand}
              onCommit={(nextValue) => updateConfig("disguise.wiki_brand", nextValue)}
            />
          ) : skin === "csdn" ? (
            <InlineEditable
              as="span"
              className="brand-editable"
              inputClassName="brand-editable-input"
              value={brand}
              onCommit={(nextValue) => updateConfig("disguise.csdn_brand", nextValue)}
            />
          ) : (
            NORMAL_TITLE
          )}
        </span>
        <nav className="nav">
          <NavLink to="/materials" className={({ isActive }) => (isActive ? "active" : "")}>
            {stealthOn ? "文档" : "资料库"}
          </NavLink>
          <NavLink to="/write" className={({ isActive }) => (isActive ? "active" : "")}>
            写作中心
          </NavLink>
        </nav>
        <div className="topbar-right">
          <label className="skin-select-wrap" title="Ctrl + ` 一键切换">
            <span className="skin-select-label">主题</span>
            <select
              className="skin-select"
              value={skin}
              onChange={(event) => setSkin(event.target.value as StealthSkin)}
            >
              <option value="off">关闭</option>
              <option value="wiki">内部文档</option>
              <option value="csdn">CSDN</option>
            </select>
          </label>
          {!stealthOn && (
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
