import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError, type DayStat, type Material } from "../api";
import { renderMarkdown } from "../markdown";
import { ConfirmDialog } from "../components/ConfirmDialog";
import {
  CalendarIcon,
  ChevronsLeft,
  ChevronsRight,
  ClockIcon,
  SearchIcon,
  TrashIcon,
} from "../components/icons";
import {
  DAY_WIDTH_MAX,
  DAY_WIDTH_MIN,
  DEFAULT_MATERIALS_LAYOUT,
  LIST_WIDTH_MAX,
  LIST_WIDTH_MIN,
  clampPaneWidth,
  getInitialEditorMode,
  getPreferredMaterialId,
  readMaterialsViewState,
  type MaterialsLayout,
  type PaneKey,
  writeMaterialsViewState,
} from "./materialsState";

const COLLAPSED_PANE_WIDTH = 52;

function today(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const date = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${date}`;
}

const TODAY = today();
const CURRENT_YEAR = Number(TODAY.slice(0, 4));
const CURRENT_MONTH = Number(TODAY.slice(5, 7));

function dayParts(day: string) {
  return {
    year: Number(day.slice(0, 4)),
    month: Number(day.slice(5, 7)),
    date: Number(day.slice(8, 10)),
  };
}

function ResizeHandle({
  value,
  setValue,
  min,
  max,
  dir,
}: {
  value: number;
  setValue: (nextValue: number) => void;
  min: number;
  max: number;
  dir: 1 | -1;
}) {
  function onPointerDown(event: React.PointerEvent) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = value;

    function move(pointerEvent: PointerEvent) {
      const nextWidth = startWidth + dir * (pointerEvent.clientX - startX);
      setValue(clampPaneWidth(nextWidth, min, max));
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

function CollapsedPane({
  label,
  expandLabel,
  direction,
  onExpand,
}: {
  label: string;
  expandLabel: string;
  direction: "left" | "right";
  onExpand: () => void;
}) {
  const Icon = direction === "left" ? ChevronsRight : ChevronsLeft;

  return (
    <aside className="materials-pane-collapsed" style={{ width: COLLAPSED_PANE_WIDTH }}>
      <button className="materials-pane-toggle" title={expandLabel} onClick={onExpand}>
        <Icon size={16} />
        <span>{label}</span>
      </button>
    </aside>
  );
}

export function MaterialsPage() {
  const navigate = useNavigate();
  const savedView = useMemo(() => readMaterialsViewState(), []);
  const savedDay = savedView?.selectedDay ?? TODAY;
  const savedDayParts = dayParts(savedDay);

  const [stats, setStats] = useState<DayStat[]>([]);
  const [year, setYear] = useState(savedView?.year ?? savedDayParts.year);
  const [month, setMonth] = useState(savedView?.month ?? savedDayParts.month);
  const [selectedDay, setSelectedDay] = useState(savedDay);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(savedView?.selectedId ?? null);
  const [query, setQuery] = useState(savedView?.query ?? "");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [confirming, setConfirming] = useState<Material | null>(null);
  const [menu, setMenu] = useState<{ id: number; x: number; y: number } | null>(null);
  const [pendingEditId, setPendingEditId] = useState<number | null>(null);
  const [layout, setLayout] = useState<MaterialsLayout>(savedView?.layout ?? DEFAULT_MATERIALS_LAYOUT);

  const handleAuthError = useCallback(
    (error: unknown) => {
      if (error instanceof ApiError && error.status === 401) {
        navigate("/login");
      }
    },
    [navigate]
  );

  const loadStats = useCallback(async () => {
    try {
      const data = await api<{ days: DayStat[] }>("/materials/days");
      setStats(data.days);
    } catch (error) {
      handleAuthError(error);
    }
  }, [handleAuthError]);

  const loadMaterials = useCallback(
    async (day: string, preferredId?: number) => {
      try {
        const data = await api<{ day: string; materials: Material[] }>(`/materials?day=${day}`);
        setMaterials(data.materials);
        setSelectedId((currentId) => getPreferredMaterialId(data.materials, currentId, preferredId));
      } catch (error) {
        handleAuthError(error);
      }
    },
    [handleAuthError]
  );

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  useEffect(() => {
    void loadMaterials(selectedDay);
  }, [selectedDay, loadMaterials]);

  useEffect(() => {
    if (pendingEditId !== null && selectedId === pendingEditId) {
      setPendingEditId(null);
    }
  }, [pendingEditId, selectedId]);

  useEffect(() => {
    writeMaterialsViewState({
      year,
      month,
      selectedDay,
      selectedId,
      query,
      layout,
    });
  }, [year, month, selectedDay, selectedId, query, layout]);

  const years = useMemo(() => {
    const values = new Set<number>([CURRENT_YEAR]);
    stats.forEach((stat) => values.add(dayParts(stat.day).year));
    return Array.from(values).sort((left, right) => right - left);
  }, [stats]);

  const months = useMemo(() => {
    const values = new Set<number>();
    stats.forEach((stat) => {
      const parts = dayParts(stat.day);
      if (parts.year === year) {
        values.add(parts.month);
      }
    });
    if (year === CURRENT_YEAR) {
      values.add(CURRENT_MONTH);
    }
    return Array.from(values).sort((left, right) => right - left);
  }, [stats, year]);

  const days = useMemo(() => {
    const list = stats
      .filter((stat) => {
        const parts = dayParts(stat.day);
        return parts.year === year && parts.month === month;
      })
      .map((stat) => ({ ...stat }));

    if (year === CURRENT_YEAR && month === CURRENT_MONTH && !list.some((stat) => stat.day === TODAY)) {
      list.push({ day: TODAY, count: 0 });
    }

    return list.sort((left, right) => (left.day < right.day ? 1 : -1));
  }, [stats, year, month]);

  useEffect(() => {
    if (days.length === 0) return;
    if (!days.some((day) => day.day === selectedDay)) {
      setSelectedDay(days[0].day);
    }
  }, [days, selectedDay]);

  const filteredMaterials = useMemo(() => {
    const loweredQuery = query.trim().toLowerCase();
    if (!loweredQuery) return materials;
    return materials.filter((material) => {
      return (
        material.title.toLowerCase().includes(loweredQuery) ||
        material.content.toLowerCase().includes(loweredQuery)
      );
    });
  }, [materials, query]);

  const selectedMaterial = materials.find((material) => material.id === selectedId) ?? null;

  const setPaneWidth = useCallback(
    (pane: PaneKey, width: number) => {
      setLayout((current) => {
        if (pane === "day") {
          return { ...current, dayWidth: width };
        }
        if (pane === "list") {
          return { ...current, listWidth: width };
        }
        return { ...current, detailWidth: width };
      });
    },
    []
  );

  const togglePane = useCallback((pane: PaneKey) => {
    setLayout((current) => ({
      ...current,
      collapsed: {
        ...current.collapsed,
        [pane]: !current.collapsed[pane],
      },
    }));
  }, []);

  async function addMaterial() {
    try {
      const data = await api<{ material: Material }>("/materials", {
        method: "POST",
        body: { day: selectedDay, title: "新资料", content: "" },
      });
      setPendingEditId(data.material.id);
      await loadStats();
      await loadMaterials(selectedDay, data.material.id);
    } catch (error) {
      handleAuthError(error);
    }
  }

  async function saveMaterial(patch: Partial<Pick<Material, "title" | "content" | "day">>) {
    if (!selectedMaterial) return;
    setSaveState("saving");
    try {
      const data = await api<{ material: Material }>(`/materials/${selectedMaterial.id}`, {
        method: "PUT",
        body: patch,
      });
      setMaterials((current) =>
        current.map((material) => (material.id === data.material.id ? data.material : material))
      );
      if (patch.day && patch.day !== selectedDay) {
        await loadStats();
        await loadMaterials(selectedDay);
      }
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 1500);
    } catch (error) {
      setSaveState("idle");
      handleAuthError(error);
    }
  }

  async function deleteMaterialById(id: number) {
    try {
      await api(`/materials/${id}`, { method: "DELETE" });
      setSelectedId((currentId) => (currentId === id ? null : currentId));
      await loadStats();
      await loadMaterials(selectedDay);
    } catch (error) {
      handleAuthError(error);
    }
  }

  function reallyDelete() {
    const target = confirming;
    setConfirming(null);
    if (target) {
      void deleteMaterialById(target.id);
    }
  }

  const showDayListHandle = !layout.collapsed.day && !layout.collapsed.list;
  const showListDetailHandle = !layout.collapsed.list && !layout.collapsed.detail;

  return (
    <div className="materials">
      {layout.collapsed.day ? (
        <CollapsedPane
          label="日期"
          expandLabel="展开日期栏"
          direction="left"
          onExpand={() => togglePane("day")}
        />
      ) : (
        <aside className="day-rail" style={{ width: layout.dayWidth }}>
          <div className="pane-head">
            <div className="rail-head">日期</div>
            <button
              className="icon-btn pane-toggle-btn"
              title="收起日期栏"
              onClick={() => togglePane("day")}
            >
              <ChevronsLeft size={16} />
            </button>
          </div>
          <div className="ym-row">
            <select className="ym-select" value={year} onChange={(event) => setYear(Number(event.target.value))}>
              {years.map((value) => (
                <option key={value} value={value}>
                  {value} 年
                </option>
              ))}
            </select>
            <select className="ym-select" value={month} onChange={(event) => setMonth(Number(event.target.value))}>
              {months.map((value) => (
                <option key={value} value={value}>
                  {value} 月
                </option>
              ))}
            </select>
          </div>
          <div className="rail-subhead">{month} 月有资料的日期</div>
          <div className="pane-scroll">
            {days.map((day) => {
              const date = dayParts(day.day).date;
              const isToday = day.day === TODAY;
              return (
                <button
                  key={day.day}
                  className={`day-item ${day.day === selectedDay ? "active" : ""}`}
                  onClick={() => setSelectedDay(day.day)}
                >
                  <span>
                    {date} 日
                    {isToday ? " · 今天" : ""}
                  </span>
                  <span className="count">{day.count}</span>
                </button>
              );
            })}
            {days.length === 0 && <p className="rail-empty">这个月还没有资料</p>}
          </div>
        </aside>
      )}

      {showDayListHandle && (
        <ResizeHandle
          value={layout.dayWidth}
          setValue={(nextWidth) => setPaneWidth("day", nextWidth)}
          min={DAY_WIDTH_MIN}
          max={DAY_WIDTH_MAX}
          dir={1}
        />
      )}

      {layout.collapsed.list ? (
        <CollapsedPane
          label="列表"
          expandLabel="展开资料列表"
          direction="left"
          onExpand={() => togglePane("list")}
        />
      ) : (
        <section className="mat-list-col" style={{ width: layout.listWidth }}>
          <div className="mat-list-head">
            <div className="search-box">
              <SearchIcon className="search-icon" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索资料"
              />
            </div>
            <button className="btn btn-sm btn-primary" onClick={addMaterial}>
              + 新增
            </button>
            <button
              className="icon-btn pane-toggle-btn"
              title="收起资料列表"
              onClick={() => togglePane("list")}
            >
              <ChevronsLeft size={16} />
            </button>
          </div>
          <div className="mat-list pane-scroll">
            {filteredMaterials.map((material) => (
              <button
                key={material.id}
                className={`mat-list-item ${material.id === selectedId ? "active" : ""}`}
                onClick={() => setSelectedId(material.id)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setSelectedId(material.id);
                  setMenu({ id: material.id, x: event.clientX, y: event.clientY });
                }}
              >
                <div className="mli-title">{material.title || "无标题"}</div>
                <div className="mli-snippet">
                  {material.content.replace(/\s+/g, " ").slice(0, 40) || "（空）"}
                </div>
              </button>
            ))}
            {filteredMaterials.length === 0 && (
              <p className="rail-empty">{query ? "没有匹配的资料" : "这一天还没有资料"}</p>
            )}
          </div>
        </section>
      )}

      {showListDetailHandle && (
        <ResizeHandle
          value={layout.listWidth}
          setValue={(nextWidth) => setPaneWidth("list", nextWidth)}
          min={LIST_WIDTH_MIN}
          max={LIST_WIDTH_MAX}
          dir={1}
        />
      )}

      {layout.collapsed.detail ? (
        <CollapsedPane
          label="详情"
          expandLabel="展开资料详情"
          direction="right"
          onExpand={() => togglePane("detail")}
        />
      ) : (
        <section className="mat-detail" style={{ flexBasis: layout.detailWidth }}>
          {selectedMaterial ? (
            <MaterialEditor
              key={selectedMaterial.id}
              material={selectedMaterial}
              defaultMode={getInitialEditorMode(selectedMaterial.id, pendingEditId)}
              saveState={saveState}
              onSave={saveMaterial}
              onDelete={() => setConfirming(selectedMaterial)}
              onCollapse={() => togglePane("detail")}
            />
          ) : (
            <div className="mat-detail-empty">
              <div className="mat-detail-empty-tools">
                <button
                  className="icon-btn pane-toggle-btn"
                  title="收起资料详情"
                  onClick={() => togglePane("detail")}
                >
                  <ChevronsRight size={16} />
                </button>
              </div>
              <div className="empty">
                <h3>这一天还没有资料</h3>
                <p>把今天收集到的资料、数据加进来吧。</p>
                <button className="btn btn-primary" onClick={addMaterial}>
                  + 新增第一份资料
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {menu && (
        <>
          <div
            className="menu-backdrop"
            onClick={() => setMenu(null)}
            onContextMenu={(event) => {
              event.preventDefault();
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
  defaultMode,
  saveState,
  onSave,
  onDelete,
  onCollapse,
}: {
  material: Material;
  defaultMode: "read" | "edit";
  saveState: "idle" | "saving" | "saved";
  onSave: (patch: Partial<Pick<Material, "title" | "content" | "day">>) => void;
  onDelete: () => void;
  onCollapse: () => void;
}) {
  const [mode, setMode] = useState<"read" | "edit">(defaultMode);
  const [title, setTitle] = useState(material.title);
  const [content, setContent] = useState(material.content);
  const [day, setDay] = useState(material.day);

  useEffect(() => {
    setTitle(material.title);
    setContent(material.content);
    setDay(material.day);
  }, [material]);

  const dirty = title !== material.title || content !== material.content || day !== material.day;

  return (
    <div className="material-editor">
      <div className="mat-editor-titlebar">
        {mode === "edit" ? (
          <input
            className="title-input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="资料标题"
            autoFocus
          />
        ) : (
          <h1 className="mat-read-title">{material.title || "无标题"}</h1>
        )}
        <div className="mat-editor-tools">
          <div className="seg">
            <button className={mode === "read" ? "active" : ""} onClick={() => setMode("read")}>
              阅读
            </button>
            <button className={mode === "edit" ? "active" : ""} onClick={() => setMode("edit")}>
              编辑
            </button>
          </div>
          <button className="icon-btn pane-toggle-btn" title="收起资料详情" onClick={onCollapse}>
            <ChevronsRight size={16} />
          </button>
          <button className="icon-btn" title="删除资料" onClick={onDelete}>
            <TrashIcon size={18} />
          </button>
        </div>
      </div>

      <div className="material-meta">
        {mode === "edit" ? (
          <label className="meta-daypick">
            <CalendarIcon size={14} />
            采集日期：
            <input
              className="day-pick"
              type="date"
              value={day}
              onChange={(event) => setDay(event.target.value)}
            />
          </label>
        ) : (
          <span className="meta-pill">
            <CalendarIcon size={13} />
            采集于 {material.day}
          </span>
        )}
        <span className="meta-pill soft">
          <ClockIcon size={13} />
          更新于 {material.updated_at}
        </span>
      </div>

      {mode === "edit" ? (
        <>
          <textarea
            className="content-area"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="在这里粘贴资料、数据、链接摘要……（支持 Markdown）"
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
        </>
      ) : (
        <div
          className="mat-read prose"
          dangerouslySetInnerHTML={{
            __html: renderMarkdown(
              material.content || "_（这份资料还没有内容，点右上角「编辑」补充）_"
            ),
          }}
        />
      )}
    </div>
  );
}
