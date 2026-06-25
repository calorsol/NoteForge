import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError, type DayStat, type Material } from "../api";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { SearchIcon, TrashIcon } from "../components/icons";

function today(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const TODAY = today();
const CUR_YEAR = Number(TODAY.slice(0, 4));
const CUR_MONTH = Number(TODAY.slice(5, 7));

function dayParts(day: string) {
  return { year: Number(day.slice(0, 4)), month: Number(day.slice(5, 7)), date: Number(day.slice(8, 10)) };
}

export function MaterialsPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DayStat[]>([]);
  const [year, setYear] = useState(CUR_YEAR);
  const [month, setMonth] = useState(CUR_MONTH);
  const [selectedDay, setSelectedDay] = useState(TODAY);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [confirming, setConfirming] = useState<Material | null>(null);
  const [menu, setMenu] = useState<{ id: number; x: number; y: number } | null>(null);

  const handleAuthError = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) navigate("/login");
    },
    [navigate]
  );

  const loadStats = useCallback(async () => {
    try {
      const data = await api<{ days: DayStat[] }>("/materials/days");
      setStats(data.days);
    } catch (err) {
      handleAuthError(err);
    }
  }, [handleAuthError]);

  const loadMaterials = useCallback(
    async (day: string, preferId?: number) => {
      try {
        const data = await api<{ day: string; materials: Material[] }>(`/materials?day=${day}`);
        setMaterials(data.materials);
        setSelectedId((current) => {
          if (preferId && data.materials.some((m) => m.id === preferId)) return preferId;
          if (current && data.materials.some((m) => m.id === current)) return current;
          return data.materials[0]?.id ?? null;
        });
      } catch (err) {
        handleAuthError(err);
      }
    },
    [handleAuthError]
  );

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    loadMaterials(selectedDay);
  }, [selectedDay, loadMaterials]);

  // 年份下拉：有资料的年份 ∪ 今年
  const years = useMemo(() => {
    const set = new Set<number>([CUR_YEAR]);
    stats.forEach((s) => set.add(dayParts(s.day).year));
    return Array.from(set).sort((a, b) => b - a);
  }, [stats]);

  // 月份下拉：所选年份里有资料的月份 ∪（今年则含本月）
  const months = useMemo(() => {
    const set = new Set<number>();
    stats.forEach((s) => {
      const p = dayParts(s.day);
      if (p.year === year) set.add(p.month);
    });
    if (year === CUR_YEAR) set.add(CUR_MONTH);
    return Array.from(set).sort((a, b) => b - a);
  }, [stats, year]);

  // 该年月里有资料的日期（今年本月则始终含今天）
  const days = useMemo(() => {
    const list = stats
      .filter((s) => {
        const p = dayParts(s.day);
        return p.year === year && p.month === month;
      })
      .map((s) => ({ ...s }));
    if (year === CUR_YEAR && month === CUR_MONTH && !list.some((s) => s.day === TODAY)) {
      list.push({ day: TODAY, count: 0 });
    }
    return list.sort((a, b) => (a.day < b.day ? 1 : -1));
  }, [stats, year, month]);

  // 切换年/月后，确保选中的日期在当前列表里
  useEffect(() => {
    if (days.length === 0) return;
    if (!days.some((d) => d.day === selectedDay)) {
      setSelectedDay(days[0].day);
    }
  }, [days, selectedDay]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return materials;
    return materials.filter(
      (m) => m.title.toLowerCase().includes(q) || m.content.toLowerCase().includes(q)
    );
  }, [materials, query]);

  const selected = materials.find((m) => m.id === selectedId) ?? null;

  async function addMaterial() {
    try {
      const data = await api<{ material: Material }>("/materials", {
        method: "POST",
        body: { day: selectedDay, title: "新资料", content: "" },
      });
      await loadStats();
      await loadMaterials(selectedDay, data.material.id);
    } catch (err) {
      handleAuthError(err);
    }
  }

  async function saveMaterial(patch: Partial<Pick<Material, "title" | "content" | "day">>) {
    if (!selected) return;
    setSaveState("saving");
    try {
      const data = await api<{ material: Material }>(`/materials/${selected.id}`, {
        method: "PUT",
        body: patch,
      });
      setMaterials((prev) => prev.map((m) => (m.id === data.material.id ? data.material : m)));
      if (patch.day && patch.day !== selectedDay) {
        await loadStats();
        await loadMaterials(selectedDay);
      }
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 1500);
    } catch (err) {
      setSaveState("idle");
      handleAuthError(err);
    }
  }

  async function deleteMaterialById(id: number) {
    try {
      await api(`/materials/${id}`, { method: "DELETE" });
      setSelectedId((cur) => (cur === id ? null : cur));
      await loadStats();
      await loadMaterials(selectedDay);
    } catch (err) {
      handleAuthError(err);
    }
  }

  // 编辑区垃圾桶：走确认弹窗（安全入口）
  function reallyDelete() {
    const target = confirming;
    setConfirming(null);
    if (target) void deleteMaterialById(target.id);
  }

  return (
    <div className="materials">
      {/* 第一栏：年/月/日 */}
      <aside className="day-rail">
        <div className="rail-head">日期</div>
        <div className="ym-row">
          <select className="ym-select" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y} 年
              </option>
            ))}
          </select>
          <select className="ym-select" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {months.map((m) => (
              <option key={m} value={m}>
                {m} 月
              </option>
            ))}
          </select>
        </div>
        <div className="rail-subhead">{month} 月有资料的日期</div>
        {days.map((d) => {
          const date = dayParts(d.day).date;
          const isToday = d.day === TODAY;
          return (
            <button
              key={d.day}
              className={`day-item ${d.day === selectedDay ? "active" : ""}`}
              onClick={() => setSelectedDay(d.day)}
            >
              <span>
                {date} 日{isToday ? " · 今天" : ""}
              </span>
              <span className="count">{d.count}</span>
            </button>
          );
        })}
        {days.length === 0 && <p className="rail-empty">这个月还没有资料</p>}
      </aside>

      {/* 第二栏：资料列表 + 搜索 */}
      <section className="mat-list-col">
        <div className="mat-list-head">
          <div className="search-box">
            <SearchIcon className="search-icon" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索资料"
            />
          </div>
          <button className="btn btn-sm btn-primary" onClick={addMaterial}>
            + 新增
          </button>
        </div>
        <div className="mat-list">
          {filtered.map((m) => (
            <button
              key={m.id}
              className={`mat-list-item ${m.id === selectedId ? "active" : ""}`}
              onClick={() => setSelectedId(m.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                setSelectedId(m.id);
                setMenu({ id: m.id, x: e.clientX, y: e.clientY });
              }}
            >
              <div className="mli-title">{m.title || "无标题"}</div>
              <div className="mli-snippet">{m.content.replace(/\s+/g, " ").slice(0, 40) || "（空）"}</div>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="rail-empty">
              {query ? "没有匹配的资料" : "这一天还没有资料"}
            </p>
          )}
        </div>
      </section>

      {/* 第三栏：编辑区 */}
      <section className="mat-detail">
        {selected ? (
          <MaterialEditor
            key={selected.id}
            material={selected}
            saveState={saveState}
            onSave={saveMaterial}
            onDelete={() => setConfirming(selected)}
          />
        ) : (
          <div className="empty">
            <h3>这一天还没有资料</h3>
            <p>把今天收集到的资料、数据加进来吧。</p>
            <button className="btn btn-primary" onClick={addMaterial}>
              + 新增第一份资料
            </button>
          </div>
        )}
      </section>

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
                void deleteMaterialById(id);
              }}
            >
              <TrashIcon size={15} /> 删除
            </button>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirming !== null}
        title="删除资料"
        message={`确定删除「${confirming?.title || "无标题"}」？此操作不可撤销。`}
        confirmText="删除"
        onConfirm={reallyDelete}
        onCancel={() => setConfirming(null)}
      />
    </div>
  );
}

function MaterialEditor({
  material,
  saveState,
  onSave,
  onDelete,
}: {
  material: Material;
  saveState: "idle" | "saving" | "saved";
  onSave: (patch: Partial<Pick<Material, "title" | "content" | "day">>) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(material.title);
  const [content, setContent] = useState(material.content);
  const [day, setDay] = useState(material.day);

  const dirty = title !== material.title || content !== material.content || day !== material.day;

  return (
    <div className="material-editor">
      <div className="mat-editor-titlebar">
        <input
          className="title-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="资料标题"
        />
        <button className="icon-btn" title="删除资料" onClick={onDelete}>
          <TrashIcon size={18} />
        </button>
      </div>
      <div className="material-meta">
        <label>
          采集日期：
          <input
            className="day-pick"
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
          />
        </label>
        <span>更新于 {material.updated_at}</span>
      </div>
      <textarea
        className="content-area"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="在这里粘贴资料、数据、链接摘要…（支持 Markdown）"
      />
      <div className="editor-actions">
        <button
          className="btn btn-primary"
          disabled={!dirty || saveState === "saving"}
          onClick={() => onSave({ title: title.trim() || "无标题", content, day })}
        >
          {saveState === "saving" ? "保存中…" : "保存"}
        </button>
        {saveState === "saved" && <span className="save-hint">已保存</span>}
        {dirty && saveState === "idle" && <span className="save-hint">有未保存的修改</span>}
      </div>
    </div>
  );
}
