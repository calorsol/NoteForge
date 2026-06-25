import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../api";

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    if (username.trim().length < 2) {
      setError("用户名至少 2 个字符");
      return;
    }
    if (password.length < 6) {
      setError("密码至少 6 位");
      return;
    }

    setBusy(true);
    try {
      await register(username.trim(), password);
      navigate("/materials");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "注册失败，请稍后再试");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>
          <span className="brand-dot" /> 注册 NoteForge
        </h1>
        <p className="auth-sub">只需账号和密码，注册即用。</p>

        {error && <div className="auth-error">{error}</div>}

        <div className="field">
          <label>账号</label>
          <input
            className="input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            placeholder="2-32 位，字母/数字/下划线/中文"
          />
        </div>
        <div className="field">
          <label>密码</label>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="至少 6 位"
          />
        </div>

        <button className="btn btn-primary" style={{ width: "100%" }} disabled={busy}>
          {busy ? "注册中…" : "注册并进入"}
        </button>

        <p className="auth-switch">
          已有账号？<Link to="/login">去登录</Link>
        </p>
      </form>
    </div>
  );
}
