import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  api,
  ApiError,
  type DocumentFull,
  type DocumentSummary,
  type Material,
} from "../api";
import { renderMarkdown, countWords } from "../markdown";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ChevronDown, ChevronUp, EditIcon, EyeIcon, PlusIcon, TrashIcon } from "../components/icons";
import {
  BGS,
  FONTS,
  SIZES,
  findBg,
  findFont,
  findSize,
  loadPref,
  savePref,
} from "../appearance";

type Mode = "markdown" | "text";

function today(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function ResizeHandle({
  value,
  setValue,
  min,
  max,
  dir,
}: {
  value: number;
  setValue: (n: number) => void;
  min: number;
  max: number;
  dir: 1 | -1;
}) {
  function onPointerDown(e: React.PointerEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startV = value;
    function move(ev: PointerEvent) {
      setValue(Math.min(max, Math.max(min, startV + dir * (ev.clientX - startX))));
    }
    function up() {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }
  return <div className="resize-handle" onPointerDown={onPointerDown} />;
}

export function WritePage() {
  const navigate = useNavigate();
  const [docs, setDocs] = useState<DocumentSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [mode, setMode] = useState<Mode>("markdown");
  const [previewOpen, setPreviewOpen] = useState(true);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [docMenuOpen, setDocMenuOpen] = useState(false);
  const [appearOpen, setAppearOpen] = useState(false);
  const [deletingDoc, setDeletingDoc] = useState<{ id: number; title: string } | null>(null);

  // 外观偏好
  const [fontKey, setFontKey] = useState(() => loadPref("font", "song"));
  const [sizeKey, setSizeKey] = useState(() => loadPref("size", "m"));
  const [bgKey, setBgKey] = useState(() => loadPref("bg", "paper"));
  useEffect(() => savePref("font", fontKey), [fontKey]);
  useEffect(() => savePref("size", sizeKey), [sizeKey]);
  useEffect(() => savePref("bg", bgKey), [bgKey]);

  // 可拖拽宽度
  const [drawerW, setDrawerW] = useState(() => Number(localStorage.getItem("nf_drawerW")) || 300);
  const [previewW, setPreviewW] = useState(() => Number(localStorage.getItem("nf_previewW")) || 460);
  useEffect(() => localStorage.setItem("nf_drawerW", String(drawerW)), [drawerW]);
  useEffect(() => localStorage.setItem("nf_previewW", String(previewW)), [previewW]);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedId = useRef<number | null>(null);

  const handleAuthError = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) navigate("/login");
    },
    [navigate]
  );

  const loadDocs = useCallback(async () => {
    try {
      const data = await api<{ documents: DocumentSummary[] }>("/documents");
      setDocs(data.documents);
      return data.documents;
    } catch (err) {
      handleAuthError(err);
      return [];
    }
  }, [handleAuthError]);

  const openDoc = useCallback(
    async (id: number) => {
      try {
        const data = await api<{ document: DocumentFull }>(`/documents/${id}`);
        loadedId.current = id;
        setSelectedId(id);
        setTitle(data.document.title);
        setContent(data.document.content);
        // 每个文档记住自己的模式
        setMode((localStorage.getItem("nf_mode_" + id) as Mode) || "markdown");
        setSaveState("idle");
        setDocMenuOpen(false);
      } catch (err) {
        handleAuthError(err);
      }
    },
    [handleAuthError]
  );

  useEffect(() => {
    loadDocs().then((list) => {
      if (list.length > 0) openDoc(list[0].id);
    });
  }, [loadDocs, openDoc]);

  useEffect(() => {
    if (selectedId === null || loadedId.current !== selectedId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void persist(selectedId, title, content);
    }, 1500);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, content, selectedId]);

  function setDocMode(m: Mode) {
    setMode(m);
    if (selectedId !== null) localStorage.setItem("nf_mode_" + selectedId, m);
  }

  async function persist(id: number, t: string, c: string) {
    setSaveState("saving");
    try {
      await api(`/documents/${id}`, { method: "PUT", body: { title: t, content: c } });
      setSaveState("saved");
      setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, title: t.trim() || "无标题文档" } : d)));
    } catch (err) {
      setSaveState("idle");
      handleAuthError(err);
    }
  }

  async function newDoc() {
    try {
      const data = await api<{ document: DocumentFull }>("/documents", { method: "POST", body: {} });
      await loadDocs();
      loadedId.current = data.document.id;
      setSelectedId(data.document.id);
      setTitle(data.document.title);
      setContent(data.document.content);
      setMode("markdown");
      setSaveState("idle");
      setDocMenuOpen(false);
    } catch (err) {
      handleAuthError(err);
    }
  }

  async function reallyDeleteDoc() {
    const target = deletingDoc;
    setDeletingDoc(null);
    if (!target) return;
    try {
      await api(`/documents/${target.id}`, { method: "DELETE" });
      localStorage.removeItem("nf_mode_" + target.id);
      const list = await loadDocs();
      if (selectedId === target.id) {
        if (list.length > 0) openDoc(list[0].id);
        else {
          setSelectedId(null);
          setTitle("");
          setContent("");
        }
      }
    } catch (err) {
      handleAuthError(err);
    }
  }

  const showPreview = mode === "markdown" && previewOpen;
  const currentTitle = title.trim() || "无标题文档";
  const font = findFont(fontKey);
  const size = findSize(sizeKey);
  const bg = findBg(bgKey);
  const surfaceStyle = { background: bg.bg, color: bg.text };

  return (
    <div className="write">
      <MaterialDrawer width={drawerW} onAuthError={handleAuthError} />
      <ResizeHandle value={drawerW} setValue={setDrawerW} min={210} max={620} dir={1} />

      {selectedId !== null ? (
        <>
          <section className="editor-pane">
            <div className="editor-toolbar">
              <div className="doc-switch">
                <button className="doc-switch-btn" onClick={() => setDocMenuOpen((v) => !v)}>
                  <span className="doc-switch-title">{currentTitle}</span>
                  <ChevronDown size={15} />
                </button>
                {docMenuOpen && (
                  <>
                    <div className="menu-backdrop" onClick={() => setDocMenuOpen(false)} />
                    <div className="doc-menu">
                      <button className="doc-menu-new" onClick={newDoc}>
                        <PlusIcon size={15} /> 新建文档
                      </button>
                      <div className="doc-menu-list">
                        {docs.map((d) => (
                          <button
                            key={d.id}
                            className={`doc-menu-item ${d.id === selectedId ? "active" : ""}`}
                            onClick={() => openDoc(d.id)}
                          >
                            <span className="dmi-title">{d.title}</span>
                            <span className="dmi-time">{d.updated_at}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="toolbar-meta">
                <span>{countWords(content)} 字</span>
                <span className={saveState === "saved" ? "save-ok" : ""}>
                  {saveState === "saving" ? "保存中…" : saveState === "saved" ? "已保存" : "自动保存"}
                </span>

                <div className="appear">
                  <button className="btn btn-sm" onClick={() => setAppearOpen((v) => !v)}>
                    Aa 外观
                  </button>
                  {appearOpen && (
                    <>
                      <div className="menu-backdrop" onClick={() => setAppearOpen(false)} />
                      <div className="appear-menu">
                        <div className="appear-label">字体</div>
                        <div className="appear-row">
                          {FONTS.map((f) => (
                            <button
                              key={f.key}
                              className={`chip ${f.key === fontKey ? "active" : ""}`}
                              style={{ fontFamily: f.stack }}
                              onClick={() => setFontKey(f.key)}
                            >
                              {f.label}
                            </button>
                          ))}
                        </div>
                        <div className="appear-label">字号</div>
                        <div className="appear-row">
                          {SIZES.map((s) => (
                            <button
                              key={s.key}
                              className={`chip ${s.key === sizeKey ? "active" : ""}`}
                              onClick={() => setSizeKey(s.key)}
                            >
                              {s.label}
                            </button>
                          ))}
                        </div>
                        <div className="appear-label">背景</div>
                        <div className="appear-row">
                          {BGS.map((b) => (
                            <button
                              key={b.key}
                              className={`swatch ${b.key === bgKey ? "active" : ""}`}
                              style={{ background: b.swatch }}
                              title={b.label}
                              onClick={() => setBgKey(b.key)}
                            />
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                <div className="seg">
                  <button className={mode === "markdown" ? "active" : ""} onClick={() => setDocMode("markdown")}>
                    Markdown
                  </button>
                  <button className={mode === "text" ? "active" : ""} onClick={() => setDocMode("text")}>
                    文本
                  </button>
                </div>
                {mode === "markdown" && (
                  <button
                    className={`btn btn-sm ${previewOpen ? "btn-soft" : ""}`}
                    onClick={() => setPreviewOpen((v) => !v)}
                  >
                    <EyeIcon size={14} /> 预览
                  </button>
                )}
                <button
                  className="icon-btn"
                  title="删除文档"
                  onClick={() => setDeletingDoc({ id: selectedId, title: currentTitle })}
                >
                  <TrashIcon size={16} />
                </button>
              </div>
            </div>

            <div className="write-body" style={surfaceStyle}>
              <input
                className="write-title"
                style={{ fontFamily: font.stack, color: bg.text }}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="无标题文档"
              />
              <textarea
                className="write-area"
                style={{ fontFamily: font.stack, fontSize: size.px, color: bg.text }}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={
                  mode === "markdown"
                    ? "开始写作…支持 Markdown：# 标题、**粗体**、- 列表、> 引用"
                    : "开始写作…（纯文本模式）"
                }
              />
            </div>
          </section>

          {showPreview && (
            <>
              <ResizeHandle value={previewW} setValue={setPreviewW} min={300} max={860} dir={-1} />
              <section className="preview" style={{ width: previewW, ...surfaceStyle }}>
                <div
                  className="prose"
                  style={{ fontFamily: font.stack, fontSize: size.px, color: bg.text }}
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
                />
              </section>
            </>
          )}
        </>
      ) : (
        <div className="empty">
          <h3>开始你的写作</h3>
          <p>新建一篇文档，灵感即刻落笔。</p>
          <button className="btn btn-primary" onClick={newDoc}>
            + 新建文档
          </button>
        </div>
      )}

      <ConfirmDialog
        open={deletingDoc !== null}
        title="删除文档"
        message={`确定删除「${deletingDoc?.title}」？此操作不可撤销。`}
        confirmText="删除"
        onConfirm={reallyDeleteDoc}
        onCancel={() => setDeletingDoc(null)}
      />
    </div>
  );
}

// ---------- 资料抽屉 ----------
function MaterialDrawer({
  width,
  onAuthError,
}: {
  width: number;
  onAuthError: (err: unknown) => void;
}) {
  const [day, setDay] = useState(today());
  const [materials, setMaterials] = useState<Material[]>([]);
  const [justAddedId, setJustAddedId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [menu, setMenu] = useState<{ id: number; x: number; y: number } | null>(null);

  const load = useCallback(
    async (d: string) => {
      try {
        const data = await api<{ materials: Material[] }>(`/materials?day=${d}`);
        setMaterials(data.materials);
      } catch (err) {
        onAuthError(err);
      }
    },
    [onAuthError]
  );

  useEffect(() => {
    load(day);
  }, [day, load]);

  function updateMaterial(updated: Material) {
    setMaterials((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
  }

  async function submitAdd() {
    if (!newTitle.trim() && !newContent.trim()) {
      setAdding(false);
      return;
    }
    try {
      const data = await api<{ material: Material }>("/materials", {
        method: "POST",
        body: { day, title: newTitle.trim() || "新资料", content: newContent },
      });
      setNewTitle("");
      setNewContent("");
      setAdding(false);
      await load(day);
      setJustAddedId(data.material.id);
    } catch (err) {
      onAuthError(err);
    }
  }

  // 右键直接删除（不弹确认），与资料库一致
  async function deleteMaterial(id: number) {
    try {
      await api(`/materials/${id}`, { method: "DELETE" });
      await load(day);
    } catch (err) {
      onAuthError(err);
    }
  }

  return (
    <>
    <aside className="mat-drawer" style={{ width }}>
      <div className="drawer-head">
        <span className="drawer-title">资料</span>
        <input
          className="drawer-date"
          type="date"
          value={day}
          onChange={(e) => setDay(e.target.value || today())}
        />
      </div>

      <div className="drawer-add">
        {adding ? (
          <div className="add-form">
            <div className="add-form-head">
              <PlusIcon size={14} /> 添加资料
            </div>
            <input
              className="add-title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="资料标题，如：今日 GDP 数据"
              autoFocus
            />
            <textarea
              className="add-content"
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="粘贴资料、数据、链接摘要…"
            />
            <div className="add-actions">
              <span className="add-day">{day.slice(5)}</span>
              <button className="btn btn-sm" onClick={() => setAdding(false)}>
                取消
              </button>
              <button className="btn btn-sm btn-primary" onClick={submitAdd}>
                保存
              </button>
            </div>
          </div>
        ) : (
          <button className="add-trigger" onClick={() => setAdding(true)}>
            <PlusIcon size={15} /> 添加资料
          </button>
        )}
      </div>

      <div className="drawer-scroll">
        {materials.map((m) => (
          <DrawerCard
            key={m.id}
            material={m}
            defaultOpen={m.id === justAddedId}
            onAuthError={onAuthError}
            onUpdated={updateMaterial}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ id: m.id, x: e.clientX, y: e.clientY });
            }}
          />
        ))}

        {materials.length === 0 && (
          <p className="drawer-empty">这一天还没有资料，点上面「添加资料」。</p>
        )}
      </div>
    </aside>

    {menu && (
      <>
        <div
          className="menu-backdrop"
          onClick={() => setMenu(null)}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu(null);
          }}
        />
        <div className="context-menu" style={{ left: menu.x, top: menu.y }}>
          <button
            className="danger"
            onClick={() => {
              const id = menu.id;
              setMenu(null);
              void deleteMaterial(id);
            }}
          >
            <TrashIcon size={15} /> 删除
          </button>
        </div>
      </>
    )}
    </>
  );
}

// ---------- 抽屉里的单张资料卡：单击展开预览 / 双击进入可编辑详情 ----------
function DrawerCard({
  material,
  defaultOpen,
  onAuthError,
  onUpdated,
  onContextMenu,
}: {
  material: Material;
  defaultOpen: boolean;
  onAuthError: (err: unknown) => void;
  onUpdated: (updated: Material) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(material.title);
  const [content, setContent] = useState(material.content);
  const [saving, setSaving] = useState(false);

  // 资料被外部更新（且当前没在编辑）时，同步本地输入
  useEffect(() => {
    if (!editing) {
      setTitle(material.title);
      setContent(material.content);
    }
  }, [material, editing]);

  function handleClick() {
    if (open) {
      setOpen(false);
      setEditing(false);
    } else {
      setOpen(true);
    }
  }

  function handleDoubleClick() {
    setOpen(true);
    setEditing(true);
  }

  function cancelEdit() {
    setTitle(material.title);
    setContent(material.content);
    setEditing(false);
  }

  async function save() {
    setSaving(true);
    try {
      const data = await api<{ material: Material }>(`/materials/${material.id}`, {
        method: "PUT",
        body: { title: title.trim() || "无标题", content },
      });
      onUpdated(data.material);
      setEditing(false);
    } catch (err) {
      onAuthError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`drawer-card ${open ? "open" : ""}`} onContextMenu={onContextMenu}>
      <div
        className="drawer-card-head"
        role="button"
        tabIndex={0}
        title="单击展开 · 双击编辑"
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
      >
        <span className="dch-title">{material.title || "无标题"}</span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </div>

      {open ? (
        editing ? (
          <div className="drawer-card-edit">
            <input
              className="dce-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="资料标题"
              autoFocus
            />
            <textarea
              className="dce-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="粘贴资料、数据、链接摘要…（支持 Markdown）"
            />
            <div className="dce-actions">
              <button className="btn btn-sm" onClick={cancelEdit} disabled={saving}>
                取消
              </button>
              <button className="btn btn-sm btn-primary" onClick={save} disabled={saving}>
                {saving ? "保存中…" : "保存"}
              </button>
            </div>
          </div>
        ) : (
          <div className="drawer-card-body">
            <div
              className="drawer-card-full prose"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(material.content || "（空）") }}
            />
            <div className="dcb-actions">
              <button className="btn btn-sm" onClick={() => setEditing(true)}>
                <EditIcon size={13} /> 编辑
              </button>
            </div>
          </div>
        )
      ) : (
        <div className="drawer-card-snippet" onClick={handleClick}>
          {material.content.replace(/\s+/g, " ").slice(0, 50) || "（空）"}
        </div>
      )}
    </div>
  );
}
