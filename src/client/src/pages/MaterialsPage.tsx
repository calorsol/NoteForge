import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  api,
  ApiError,
  type DayStat,
  type Material,
  type MaterialAnnotation,
} from "../api";
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
import { InlineEditable } from "../components/InlineEditable";
import { useDisguise } from "../disguise/DisguiseContext";
import {
  DAY_WIDTH_MAX,
  DAY_WIDTH_MIN,
  DEFAULT_MATERIALS_LAYOUT,
  LIST_WIDTH_MAX,
  LIST_WIDTH_MIN,
  buildVisibleDays,
  clampPaneWidth,
  getInitialEditorMode,
  getPreferredMaterialId,
  readMaterialsViewState,
  type MaterialsLayout,
  type PaneKey,
  writeMaterialsViewState,
} from "./materialsState";
import {
  createPendingAnnotationSelection,
  findQuoteRange,
  getQuoteOccurrence,
  type PendingAnnotationSelection,
} from "./materialsAnnotations";

const COLLAPSED_PANE_WIDTH = 52;
const CSDN_STATS = {
  reads: "1,234",
  likes: "56",
  favorites: "23",
};
const CSDN_TAGS = ["技术随笔", "阅读整理", "效率工具"];

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

type SelectionDraft = {
  note: string;
  top: number;
  left: number;
} & PendingAnnotationSelection;

type DecoratedAnnotation = {
  annotation: MaterialAnnotation;
  resolved: boolean;
};

type TextNodeSegment = {
  node: Text;
  start: number;
  end: number;
};

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
  iconDirection,
  onExpand,
}: {
  label: string;
  expandLabel: string;
  iconDirection: "left" | "right";
  onExpand: () => void;
}) {
  const Icon = iconDirection === "left" ? ChevronsLeft : ChevronsRight;

  return (
    <aside className="materials-pane-collapsed" style={{ width: COLLAPSED_PANE_WIDTH }}>
      <button className="materials-pane-toggle" title={expandLabel} onClick={onExpand}>
        <Icon size={16} />
        <span>{label}</span>
      </button>
    </aside>
  );
}

function collectTextSegments(container: HTMLElement) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const segments: TextNodeSegment[] = [];
  let cursor = 0;
  let current = walker.nextNode();

  while (current) {
    const node = current as Text;
    const value = node.nodeValue ?? "";
    if (value.length > 0) {
      segments.push({ node, start: cursor, end: cursor + value.length });
      cursor += value.length;
    }
    current = walker.nextNode();
  }

  return segments;
}

function wrapSegmentText(
  node: Text,
  startOffset: number,
  endOffset: number,
  annotation: MaterialAnnotation,
  active: boolean
) {
  let target = node;
  if (startOffset > 0) {
    target = target.splitText(startOffset);
  }
  if (endOffset - startOffset < target.data.length) {
    target.splitText(endOffset - startOffset);
  }

  const span = document.createElement("span");
  span.className = `annotation-fragment${active ? " active" : ""}`;
  span.dataset.annotationId = String(annotation.id);
  span.title = annotation.note;
  span.textContent = target.data;
  target.parentNode?.replaceChild(span, target);
}

function decorateAnnotations(
  container: HTMLElement,
  html: string,
  annotations: MaterialAnnotation[],
  activeAnnotationId: number | null
) {
  container.innerHTML = html;

  const resolved: DecoratedAnnotation[] = [];
  for (const annotation of annotations) {
    const fullText = container.textContent ?? "";
    const match = findQuoteRange(fullText, annotation.quote, annotation.occurrence);
    if (!match) {
      resolved.push({ annotation, resolved: false });
      continue;
    }

    const segments = collectTextSegments(container)
      .filter((segment) => segment.end > match.start && segment.start < match.end)
      .sort((left, right) => right.start - left.start);

    for (const segment of segments) {
      const startOffset = Math.max(0, match.start - segment.start);
      const endOffset = Math.min(segment.end, match.end) - segment.start;
      if (endOffset > startOffset) {
        wrapSegmentText(
          segment.node,
          startOffset,
          endOffset,
          annotation,
          annotation.id === activeAnnotationId
        );
      }
    }

    resolved.push({ annotation, resolved: true });
  }

  return resolved;
}

export function MaterialsPage() {
  const navigate = useNavigate();
  const savedView = useMemo(() => readMaterialsViewState(), []);
  const savedDay = savedView?.selectedDay ?? TODAY;
  const savedDayParts = dayParts(savedDay);
  const dayScrollRef = useRef<HTMLDivElement | null>(null);

  const [stats, setStats] = useState<DayStat[]>([]);
  const [year, setYear] = useState(savedView?.year ?? savedDayParts.year);
  const [month, setMonth] = useState(savedView?.month ?? savedDayParts.month);
  const [selectedDay, setSelectedDay] = useState(savedDay);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(savedView?.selectedId ?? null);
  const [query, setQuery] = useState(savedView?.query ?? "");
  const [dayScrollTop, setDayScrollTop] = useState(savedView?.dayScrollTop ?? 0);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
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
      dayScrollTop,
      layout,
    });
  }, [year, month, selectedDay, selectedId, query, dayScrollTop, layout]);

  useEffect(() => {
    const container = dayScrollRef.current;
    if (!container) return;

    const frame = window.requestAnimationFrame(() => {
      if (dayScrollTop > 0) {
        container.scrollTop = dayScrollTop;
      }
      const selectedButton = selectedDay
        ? container.querySelector<HTMLElement>(`[data-day="${selectedDay}"]`)
        : null;
      selectedButton?.scrollIntoView({ block: "nearest" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [selectedDay, dayScrollTop, stats, year, month]);

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

  const days = useMemo(
    () => buildVisibleDays(stats, year, month, selectedDay, TODAY),
    [stats, year, month, selectedDay]
  );

  useEffect(() => {
    if (days.length === 0 || !selectedDay) return;
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
  const menuMaterial = menu ? materials.find((material) => material.id === menu.id) ?? null : null;

  const setPaneWidth = useCallback((pane: PaneKey, width: number) => {
    setLayout((current) => {
      if (pane === "day") return { ...current, dayWidth: width };
      if (pane === "list") return { ...current, listWidth: width };
      return { ...current, detailWidth: width };
    });
  }, []);

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
        body: { day: selectedDay, title: "", content: "" },
      });
      setPendingEditId(data.material.id);
      setSaveError(null);
      await loadStats();
      await loadMaterials(selectedDay, data.material.id);
    } catch (error) {
      handleAuthError(error);
    }
  }

  async function saveMaterial(patch: Partial<Pick<Material, "title" | "content" | "day" | "is_read">>) {
    if (!selectedMaterial) return;
    setSaveState("saving");
    setSaveError(null);
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
      window.setTimeout(() => setSaveState("idle"), 1500);
    } catch (error) {
      setSaveState("idle");
      if (error instanceof ApiError) {
        setSaveError(error.message);
      }
      handleAuthError(error);
    }
  }

  async function deleteMaterialById(id: number) {
    try {
      await api(`/materials/${id}`, { method: "DELETE" });
      setSelectedId((currentId) => (currentId === id ? null : currentId));
      setSaveError(null);
      await loadStats();
      await loadMaterials(selectedDay);
    } catch (error) {
      handleAuthError(error);
    }
  }

  async function updateMaterialReadState(id: number, isRead: boolean) {
    try {
      const data = await api<{ material: Material }>(`/materials/${id}`, {
        method: "PUT",
        body: { is_read: isRead },
      });
      setMaterials((current) =>
        current.map((material) => (material.id === data.material.id ? data.material : material))
      );
      setSaveError(null);
    } catch (error) {
      handleAuthError(error);
    }
  }

  async function createAnnotation(materialId: number, payload: Pick<MaterialAnnotation, "quote" | "note" | "occurrence">) {
    try {
      const data = await api<{ annotation: MaterialAnnotation }>(`/materials/${materialId}/annotations`, {
        method: "POST",
        body: payload,
      });
      setMaterials((current) =>
        current.map((material) =>
          material.id === materialId
            ? { ...material, annotations: [...material.annotations, data.annotation] }
            : material
        )
      );
      return data.annotation;
    } catch (error) {
      handleAuthError(error);
      return null;
    }
  }

  async function updateAnnotation(
    materialId: number,
    annotationId: number,
    patch: Partial<Pick<MaterialAnnotation, "quote" | "note" | "occurrence">>
  ) {
    try {
      const data = await api<{ annotation: MaterialAnnotation }>(
        `/materials/${materialId}/annotations/${annotationId}`,
        {
          method: "PUT",
          body: patch,
        }
      );
      setMaterials((current) =>
        current.map((material) =>
          material.id === materialId
            ? {
                ...material,
                annotations: material.annotations.map((annotation) =>
                  annotation.id === annotationId ? data.annotation : annotation
                ),
              }
            : material
        )
      );
    } catch (error) {
      handleAuthError(error);
    }
  }

  async function deleteAnnotation(materialId: number, annotationId: number) {
    try {
      await api(`/materials/${materialId}/annotations/${annotationId}`, { method: "DELETE" });
      setMaterials((current) =>
        current.map((material) =>
          material.id === materialId
            ? {
                ...material,
                annotations: material.annotations.filter((annotation) => annotation.id !== annotationId),
              }
            : material
        )
      );
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
          iconDirection="right"
          onExpand={() => togglePane("day")}
        />
      ) : (
        <aside className="day-rail" style={{ width: layout.dayWidth }}>
          <div className="pane-head">
            <div className="rail-head">日期</div>
            <button className="icon-btn pane-toggle-btn" title="收起日期栏" onClick={() => togglePane("day")}>
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
          <div
            ref={dayScrollRef}
            className="pane-scroll"
            onScroll={(event) => setDayScrollTop(event.currentTarget.scrollTop)}
          >
            {days.map((day) => {
              const date = dayParts(day.day).date;
              const isToday = day.day === TODAY;
              return (
                <button
                  key={day.day}
                  data-day={day.day}
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
          iconDirection="right"
          onExpand={() => togglePane("list")}
        />
      ) : (
        <section className="mat-list-col" style={{ width: layout.listWidth }}>
          <div className="mat-list-head">
            <div className="search-box">
              <SearchIcon className="search-icon" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索资料" />
            </div>
            <button className="btn btn-sm btn-primary" onClick={addMaterial}>
              + 新增
            </button>
            <button className="icon-btn pane-toggle-btn" title="收起资料列表" onClick={() => togglePane("list")}>
              <ChevronsLeft size={16} />
            </button>
          </div>
          <div className="mat-list pane-scroll">
            {filteredMaterials.map((material) => (
              <button
                key={material.id}
                className={`mat-list-item ${material.id === selectedId ? "active" : ""}`}
                onClick={() => {
                  setSelectedId(material.id);
                  setSaveError(null);
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setSelectedId(material.id);
                  setMenu({ id: material.id, x: event.clientX, y: event.clientY });
                }}
              >
                <div className={`mli-title ${material.is_read ? "is-read" : ""}`}>
                  {material.title || "未命名资料"}
                </div>
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
          iconDirection="left"
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
              saveError={saveError}
              onSave={saveMaterial}
              onDelete={() => setConfirming(selectedMaterial)}
              onCollapse={() => togglePane("detail")}
              onCreateAnnotation={(payload) => createAnnotation(selectedMaterial.id, payload)}
              onUpdateAnnotation={(annotationId, patch) =>
                updateAnnotation(selectedMaterial.id, annotationId, patch)
              }
              onDeleteAnnotation={(annotationId) => deleteAnnotation(selectedMaterial.id, annotationId)}
            />
          ) : (
            <div className="mat-detail-empty">
              <div className="mat-detail-empty-tools">
                <button className="icon-btn pane-toggle-btn" title="收起资料详情" onClick={() => togglePane("detail")}>
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
              onClick={() => {
                const id = menu.id;
                setMenu(null);
                if (menuMaterial) {
                  void updateMaterialReadState(id, !menuMaterial.is_read);
                }
              }}
            >
              {menuMaterial?.is_read ? "取消已阅读" : "标记为已阅读"}
            </button>
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
        message={`确定删除「${confirming?.title || "未命名资料"}」？此操作不可撤销。`}
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
  saveError,
  onSave,
  onDelete,
  onCollapse,
  onCreateAnnotation,
  onUpdateAnnotation,
  onDeleteAnnotation,
}: {
  material: Material;
  defaultMode: "read" | "edit";
  saveState: "idle" | "saving" | "saved";
  saveError: string | null;
  onSave: (patch: Partial<Pick<Material, "title" | "content" | "day">>) => void;
  onDelete: () => void;
  onCollapse: () => void;
  onCreateAnnotation: (
    payload: Pick<MaterialAnnotation, "quote" | "note" | "occurrence">
  ) => Promise<MaterialAnnotation | null>;
  onUpdateAnnotation: (
    annotationId: number,
    patch: Partial<Pick<MaterialAnnotation, "quote" | "note" | "occurrence">>
  ) => void;
  onDeleteAnnotation: (annotationId: number) => void;
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
            placeholder="标题可留空，保存时会尝试用正文前 8 个字补齐"
            autoFocus
          />
        ) : (
          <h1 className="mat-read-title">{material.title || "未命名资料"}</h1>
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
            <input className="day-pick" type="date" value={day} onChange={(event) => setDay(event.target.value)} />
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
              onClick={() => onSave({ title, content, day })}
            >
              {saveState === "saving" ? "保存中…" : "保存"}
            </button>
            {saveState === "saved" && <span className="save-hint">已保存</span>}
            {dirty && saveState === "idle" && <span className="save-hint">有未保存的修改</span>}
            {saveError && <span className="save-hint save-error">{saveError}</span>}
          </div>
        </>
      ) : (
        <MaterialReadViewV2
          material={material}
          onCreateAnnotation={onCreateAnnotation}
          onUpdateAnnotation={onUpdateAnnotation}
          onDeleteAnnotation={onDeleteAnnotation}
        />
      )}
    </div>
  );
}

function MaterialReadViewV2({
  material,
  onCreateAnnotation,
  onUpdateAnnotation: _onUpdateAnnotation,
  onDeleteAnnotation,
}: {
  material: Material;
  onCreateAnnotation: (
    payload: Pick<MaterialAnnotation, "quote" | "note" | "occurrence">
  ) => Promise<MaterialAnnotation | null>;
  onUpdateAnnotation: (
    annotationId: number,
    patch: Partial<Pick<MaterialAnnotation, "quote" | "note" | "occurrence">>
  ) => void;
  onDeleteAnnotation: (annotationId: number) => void;
}) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const annotationMenuRef = useRef<HTMLDivElement | null>(null);
  const { skin, getConfig, updateConfig } = useDisguise();
  const renderedHtml = useMemo(
    () => renderMarkdown(material.content || "_（这份资料还没有内容，先切到编辑模式补充正文）_"),
    [material.content]
  );

  const [pendingSelection, setPendingSelection] = useState<PendingAnnotationSelection | null>(null);
  const [selectionDraft, setSelectionDraft] = useState<SelectionDraft | null>(null);
  const [annotationMenu, setAnnotationMenu] = useState<{ x: number; y: number } | null>(null);
  const [activeAnnotationId, setActiveAnnotationId] = useState<number | null>(null);
  const [decoratedAnnotations, setDecoratedAnnotations] = useState<DecoratedAnnotation[]>([]);
  const [annotationPaneOpen, setAnnotationPaneOpen] = useState(false);

  useEffect(() => {
    setPendingSelection(null);
    setSelectionDraft(null);
    setAnnotationMenu(null);
    setActiveAnnotationId(null);
    setAnnotationPaneOpen(false);
  }, [material.id]);

  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;
    setDecoratedAnnotations(
      decorateAnnotations(container, renderedHtml, material.annotations, activeAnnotationId)
    );
  }, [renderedHtml, material.annotations, activeAnnotationId]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (popoverRef.current?.contains(target ?? null)) {
        return;
      }
      if (annotationMenuRef.current?.contains(target ?? null)) {
        return;
      }
      if (contentRef.current?.contains(target ?? null)) {
        return;
      }
      setPendingSelection(null);
      setSelectionDraft(null);
      setAnnotationMenu(null);
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  function handleMouseUp() {
    const container = contentRef.current;
    const selection = window.getSelection();
    if (!container || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
      setPendingSelection(null);
      setAnnotationMenu(null);
      return;
    }

    const range = selection.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) {
      setPendingSelection(null);
      setAnnotationMenu(null);
      return;
    }

    const prefixRange = range.cloneRange();
    prefixRange.selectNodeContents(container);
    prefixRange.setEnd(range.startContainer, range.startOffset);
    const start = prefixRange.toString().length;
    const nextSelection = createPendingAnnotationSelection(
      container.textContent ?? "",
      selection.toString(),
      start
    );

    if (!nextSelection) {
      setPendingSelection(null);
      setAnnotationMenu(null);
      return;
    }

    setPendingSelection(nextSelection);
    setAnnotationMenu(null);
  }

  function openAnnotationDraft(x: number, y: number) {
    if (!pendingSelection) return;

    setSelectionDraft({
      ...pendingSelection,
      note: "",
      top: y + 8,
      left: x,
    });
    setAnnotationMenu(null);
    setAnnotationPaneOpen(true);
  }

  async function submitAnnotation() {
    if (!selectionDraft) return;

    const annotation = await onCreateAnnotation({
      quote: selectionDraft.quote,
      note: selectionDraft.note.trim(),
      occurrence: selectionDraft.occurrence,
    });

    if (annotation) {
      setPendingSelection(null);
      setSelectionDraft(null);
      setAnnotationMenu(null);
      setActiveAnnotationId(annotation.id);
      setAnnotationPaneOpen(true);
      window.getSelection()?.removeAllRanges();
    }
  }

  return (
    <div className="read-layout">
      <div className="read-article-wrap">
        {skin === "csdn" && (
          <div className="csdn-decoy-header">
            <InlineEditable
              as="h1"
              className="csdn-decoy-title"
              inputClassName="csdn-decoy-title-input"
              value={getConfig("disguise.csdn_title")}
              onCommit={(nextValue) => updateConfig("disguise.csdn_title", nextValue)}
            />
            <div className="csdn-author-bar">
              <div className="csdn-author-main">
                <span className="csdn-avatar-dot" />
                <span className="csdn-author-name">{getConfig("disguise.csdn_brand")}</span>
                <span className="csdn-author-time">于 {material.day} 发布</span>
              </div>
              <div className="csdn-author-stats">
                <span>阅读 {CSDN_STATS.reads}</span>
                <span>点赞 {CSDN_STATS.likes}</span>
                <span>收藏 {CSDN_STATS.favorites}</span>
              </div>
              <div className="csdn-tag-row">
                {CSDN_TAGS.map((tag) => (
                  <span key={tag} className="csdn-tag-chip">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
        <div
          ref={contentRef}
          className="mat-read prose annotation-prose"
          onMouseUp={handleMouseUp}
          onContextMenu={(event) => {
            if (!pendingSelection) {
              return;
            }
            event.preventDefault();
            setAnnotationMenu({ x: event.clientX, y: event.clientY });
          }}
          onClick={(event) => {
            const target = event.target as HTMLElement;
            const annotationId = target.closest<HTMLElement>("[data-annotation-id]")?.dataset.annotationId;
            if (annotationId) {
              setActiveAnnotationId(Number(annotationId));
              setAnnotationPaneOpen(true);
            }
          }}
        />

        {selectionDraft && (
          <div
            ref={popoverRef}
            className="annotation-popover"
            style={{ top: selectionDraft.top, left: selectionDraft.left }}
          >
            <div className="annotation-popover-title">添加标注</div>
            <div className="annotation-popover-quote">{selectionDraft.quote}</div>
            <textarea
              value={selectionDraft.note}
              onChange={(event) =>
                setSelectionDraft((current) => (current ? { ...current, note: event.target.value } : current))
              }
              placeholder="写下这段文字为什么重要"
            />
            <div className="annotation-popover-actions">
              <button className="btn btn-sm" onClick={() => setSelectionDraft(null)}>
                取消
              </button>
              <button
                className="btn btn-sm btn-primary"
                disabled={!selectionDraft.note.trim()}
                onClick={() => void submitAnnotation()}
              >
                保存标注
              </button>
            </div>
          </div>
        )}
      </div>

      {annotationPaneOpen ? (
        <aside className="annotation-pane">
          <div className="annotation-pane-head">
            <div>
              <div className="annotation-pane-title">标注</div>
              <div className="annotation-pane-subtitle">用于批量查看所有重点摘录</div>
            </div>
            <div className="annotation-pane-actions">
              <span className="annotation-count">{material.annotations.length}</span>
              <button
                className="icon-btn pane-toggle-btn"
                title="收起标注栏"
                onClick={() => setAnnotationPaneOpen(false)}
              >
                <ChevronsRight size={16} />
              </button>
            </div>
          </div>

          <div className="annotation-list">
            {decoratedAnnotations.length === 0 ? (
              <p className="annotation-empty">先选中文本，再右键添加标注。</p>
            ) : (
              decoratedAnnotations.map(({ annotation, resolved }) => (
                <div
                  key={annotation.id}
                  className={`annotation-card ${annotation.id === activeAnnotationId ? "active" : ""} ${
                    resolved ? "" : "unresolved"
                  }`}
                  role="button"
                  tabIndex={0}
                  onClick={() => setActiveAnnotationId(annotation.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setActiveAnnotationId(annotation.id);
                    }
                  }}
                >
                  <div className="annotation-card-top">
                    <span className="annotation-badge">{resolved ? "已定位" : "未匹配"}</span>
                    <span className="annotation-time">{annotation.updated_at}</span>
                  </div>
                  <div className="annotation-quote">{annotation.quote}</div>
                  <div className="annotation-note">{annotation.note}</div>
                  <div className="annotation-card-actions">
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDeleteAnnotation(annotation.id);
                      }}
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>
      ) : (
        <CollapsedPane
          label="标注"
          expandLabel="展开标注栏"
          iconDirection="left"
          onExpand={() => setAnnotationPaneOpen(true)}
        />
      )}

      {annotationMenu && (
        <>
          <div
            className="menu-backdrop"
            onClick={() => setAnnotationMenu(null)}
            onContextMenu={(event) => {
              event.preventDefault();
              setAnnotationMenu(null);
            }}
          />
          <div
            ref={annotationMenuRef}
            className="context-menu"
            style={{ left: annotationMenu.x, top: annotationMenu.y }}
          >
            <button onClick={() => openAnnotationDraft(annotationMenu.x, annotationMenu.y)}>
              添加标注
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function MaterialReadView({
  material,
  onCreateAnnotation,
  onUpdateAnnotation,
  onDeleteAnnotation,
}: {
  material: Material;
  onCreateAnnotation: (
    payload: Pick<MaterialAnnotation, "quote" | "note" | "occurrence">
  ) => Promise<MaterialAnnotation | null>;
  onUpdateAnnotation: (
    annotationId: number,
    patch: Partial<Pick<MaterialAnnotation, "quote" | "note" | "occurrence">>
  ) => void;
  onDeleteAnnotation: (annotationId: number) => void;
}) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const annotationMenuRef = useRef<HTMLDivElement | null>(null);
  const renderedHtml = useMemo(
    () => renderMarkdown(material.content || "_（这份资料还没有内容，先切到编辑模式补充正文）_"),
    [material.content]
  );

  const [pendingSelection, setPendingSelection] = useState<PendingAnnotationSelection | null>(null);
  const [selectionDraft, setSelectionDraft] = useState<SelectionDraft | null>(null);
  const [annotationMenu, setAnnotationMenu] = useState<{ x: number; y: number } | null>(null);
  const [activeAnnotationId, setActiveAnnotationId] = useState<number | null>(null);
  const [decoratedAnnotations, setDecoratedAnnotations] = useState<DecoratedAnnotation[]>([]);
  const [annotationPaneOpen, setAnnotationPaneOpen] = useState(false);

  useEffect(() => {
    setPendingSelection(null);
    setSelectionDraft(null);
    setAnnotationMenu(null);
    setActiveAnnotationId(null);
    setAnnotationPaneOpen(false);
  }, [material.id]);

  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;
    setDecoratedAnnotations(
      decorateAnnotations(container, renderedHtml, material.annotations, activeAnnotationId)
    );
  }, [renderedHtml, material.annotations, activeAnnotationId]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (popoverRef.current?.contains(target ?? null)) {
        return;
      }
      if (annotationMenuRef.current?.contains(target ?? null)) {
        return;
      }
      if (contentRef.current?.contains(target ?? null)) {
        return;
      }
      setPendingSelection(null);
      setSelectionDraft(null);
      setAnnotationMenu(null);
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  function handleMouseUp() {
    const container = contentRef.current;
    const selection = window.getSelection();
    if (!container || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
      setPendingSelection(null);
      setAnnotationMenu(null);
      return;
    }

    const range = selection.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) {
      setPendingSelection(null);
      setAnnotationMenu(null);
      return;
    }

    const prefixRange = range.cloneRange();
    prefixRange.selectNodeContents(container);
    prefixRange.setEnd(range.startContainer, range.startOffset);
    const start = prefixRange.toString().length;
    const nextSelection = createPendingAnnotationSelection(
      container.textContent ?? "",
      selection.toString(),
      start
    );
    if (!nextSelection) {
      setPendingSelection(null);
      setAnnotationMenu(null);
      return;
    }

    setPendingSelection(nextSelection);
    setAnnotationMenu(null);
  }

  function openAnnotationDraft(x: number, y: number) {
    if (!pendingSelection) return;

    setSelectionDraft({
      ...pendingSelection,
      note: "",
      top: y + 8,
      left: x,
    });
    setAnnotationMenu(null);
    setAnnotationPaneOpen(true);
  }

  async function submitAnnotation() {
    if (!selectionDraft) return;
    const annotation = await onCreateAnnotation({
      quote: selectionDraft.quote,
      note: selectionDraft.note.trim(),
      occurrence: selectionDraft.occurrence,
    });
    if (annotation) {
      setPendingSelection(null);
      setSelectionDraft(null);
      setAnnotationMenu(null);
      setActiveAnnotationId(annotation.id);
      setAnnotationPaneOpen(true);
      window.getSelection()?.removeAllRanges();
    }
  }

  return (
    <div className="read-layout">
      <div className="read-article-wrap">
        <div
          ref={contentRef}
          className="mat-read prose annotation-prose"
          onMouseUp={handleMouseUp}
          onClick={(event) => {
            const target = event.target as HTMLElement;
            const annotationId = target.closest<HTMLElement>("[data-annotation-id]")?.dataset.annotationId;
            if (annotationId) {
              setActiveAnnotationId(Number(annotationId));
            }
          }}
        />

        {selectionDraft && (
          <div
            ref={popoverRef}
            className="annotation-popover"
            style={{ top: selectionDraft.top, left: selectionDraft.left }}
          >
            <div className="annotation-popover-title">添加标注</div>
            <div className="annotation-popover-quote">{selectionDraft.quote}</div>
            <textarea
              value={selectionDraft.note}
              onChange={(event) =>
                setSelectionDraft((current) => (current ? { ...current, note: event.target.value } : current))
              }
              placeholder="写下这段文字为什么重要"
            />
            <div className="annotation-popover-actions">
              <button className="btn btn-sm" onClick={() => setSelectionDraft(null)}>
                取消
              </button>
              <button
                className="btn btn-sm btn-primary"
                disabled={!selectionDraft.note.trim()}
                onClick={() => void submitAnnotation()}
              >
                保存标注
              </button>
            </div>
          </div>
        )}
      </div>

      <aside className="annotation-pane">
        <div className="annotation-pane-head">
          <div>
            <div className="annotation-pane-title">标注</div>
            <div className="annotation-pane-subtitle">用于批量查看所有重点摘录</div>
          </div>
          <span className="annotation-count">{material.annotations.length}</span>
        </div>

        <div className="annotation-list">
          {decoratedAnnotations.length === 0 ? (
            <p className="annotation-empty">选中正文里的文字后，可以直接添加标注。</p>
          ) : (
            decoratedAnnotations.map(({ annotation, resolved }) => (
              <div
                key={annotation.id}
                className={`annotation-card ${annotation.id === activeAnnotationId ? "active" : ""} ${
                  resolved ? "" : "unresolved"
                }`}
                role="button"
                tabIndex={0}
                onClick={() => setActiveAnnotationId(annotation.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setActiveAnnotationId(annotation.id);
                  }
                }}
              >
                <div className="annotation-card-top">
                  <span className="annotation-badge">{resolved ? "已定位" : "未匹配"}</span>
                  <span className="annotation-time">{annotation.updated_at}</span>
                </div>
                <div className="annotation-quote">{annotation.quote}</div>
                <div className="annotation-note">{annotation.note}</div>
                <div className="annotation-card-actions">
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDeleteAnnotation(annotation.id);
                    }}
                  >
                    删除
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </aside>
    </div>
  );
}
