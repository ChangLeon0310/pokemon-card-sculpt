import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDown,
  ArrowUp,
  Box,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Eraser,
  Layers3,
  ListChecks,
  MousePointer2,
  Minus,
  Plus,
  Rotate3D,
  Scissors,
  Search,
  Sparkles,
  Trash2,
  WandSparkles,
} from "lucide-react";

const API_BASE = "https://api.tcgdex.net/v2/zh-tw";
const PAGE_SIZE = 40;
const SET_CACHE_KEY = "card-sculpt-zh-tw-sets-v2";
const TODAY = new Date().toISOString().slice(0, 10);

const sortSetsNewestFirst = (items) =>
  [...items].sort((a, b) => {
    const dateA = a.releaseDate || "0000-00-00";
    const dateB = b.releaseDate || "0000-00-00";
    if (dateA !== dateB) return dateB.localeCompare(dateA);
    return String(a.name || "").localeCompare(String(b.name || ""), "zh-Hant");
  });

const formatReleaseDate = (date) => {
  if (!date) return "日期未提供";
  const [year, month, day] = date.split("-");
  return `${year}/${month}/${day}`;
};

const assetUrl = (url, quality = "low") => {
  if (!url) return "";
  if (/\.(webp|png|jpg)$/i.test(url)) return url;
  return `${url}/${quality}.webp`;
};

const cutMaskStyle = (cuts = [], strokes = []) => {
  if (!cuts.length && !strokes.length) return {};

  const holes = cuts
    .map(
      (cut) =>
        `<polygon points="${cut
          .map((point) => `${point.x},${point.y}`)
          .join(" ")}" fill="black"/>`
    )
    .join("");

  const brushPaths = strokes
    .map((stroke) => {
      if (!stroke.points?.length) return "";
      const points = stroke.points;
      if (points.length === 1) {
        return `<circle cx="${points[0].x}" cy="${points[0].y}" r="${stroke.size / 2}" fill="${stroke.mode === "restore" ? "white" : "black"}"/>`;
      }
      const path = points
        .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
        .join(" ");
      return `<path d="${path}" fill="none" stroke="${stroke.mode === "restore" ? "white" : "black"}" stroke-width="${stroke.size}" stroke-linecap="round" stroke-linejoin="round"/>`;
    })
    .join("");

  // Create a real alpha mask. A plain black polygon is still opaque when the
  // browser uses alpha masking, so the previous version did not make holes.
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none">
      <defs>
        <mask id="cut-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
          <rect x="0" y="0" width="100" height="100" fill="white"/>
          ${holes}
          ${brushPaths}
        </mask>
      </defs>
      <rect x="0" y="0" width="100" height="100" fill="white" mask="url(#cut-mask)"/>
    </svg>`;

  const mask = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

  return {
    WebkitMaskImage: mask,
    maskImage: mask,
    WebkitMaskSize: "100% 100%",
    maskSize: "100% 100%",
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
  };
};

const seed = [
  { id: 1, name: "完整背景", visible: true, opacity: 1, cuts: [], strokes: [], locked: true },
  { id: 2, name: "切割層 1", visible: true, opacity: 1, cuts: [], strokes: [], locked: false },
];

const Btn = ({ children, className = "", ...props }) => (
  <button className={`btn ${className}`} {...props}>
    {children}
  </button>
);

function CardImage({ src, name, className = "", style = {} }) {
  const candidates = useMemo(() => {
    if (!src) return [];
    const urls = [src];
    if (src.includes("/high.webp")) urls.push(src.replace("/high.webp", "/low.webp"));
    if (src.includes("/low.webp")) urls.push(src.replace("/low.webp", "/high.webp"));
    urls.push(src.replace(/\.webp$/i, ".png"));
    return [...new Set(urls)];
  }, [src]);

  const [candidateIndex, setCandidateIndex] = useState(0);

  useEffect(() => {
    setCandidateIndex(0);
  }, [src]);

  const currentSrc = candidates[candidateIndex];

  if (!currentSrc) {
    return (
      <div className={`fallback ${className}`} style={style}>
        <Layers3 />
        <b>{name}</b>
        <small>此卡牌沒有圖片</small>
      </div>
    );
  }

  return (
    <img
      src={currentSrc}
      alt={name}
      className={className}
      style={style}
      draggable="false"
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => {
        if (candidateIndex < candidates.length - 1) {
          setCandidateIndex((index) => index + 1);
        }
      }}
    />
  );
}

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Card Sculpt runtime error", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="runtime-error">
          <Layers3 />
          <h2>頁面暫時無法顯示</h2>
          <p>{this.state.error.message || "發生未知錯誤"}</p>
          <button onClick={() => window.location.reload()}>重新載入</button>
        </div>
      );
    }
    return this.props.children;
  }
}

function CardSculptApp() {
  const [screen, setScreen] = useState("library");
  const [sets, setSets] = useState([]);
  const [setId, setSetId] = useState("");
  const [cards, setCards] = useState([]);
  const [q, setQ] = useState("");
  const [card, setCard] = useState(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loadingSets, setLoadingSets] = useState(true);
  const [loadingCards, setLoadingCards] = useState(false);
  const [apiError, setApiError] = useState("");
  const [layers, setLayers] = useState(seed);
  const [tool, setTool] = useState("magic");
  const [exploded, setExploded] = useState(true);
  const [gap, setGap] = useState(1);
  const [rot, setRot] = useState({ x: -8, y: -18 });
  const [guide, setGuide] = useState(false);
  const [step, setStep] = useState(0);
  const [sensitivity, setSensitivity] = useState(0.12);
  const [dragging, setDragging] = useState(false);
  const [polygonPoints, setPolygonPoints] = useState([]);
  const [layerName, setLayerName] = useState("切割層 1");
  const [activeLayerId, setActiveLayerId] = useState(2);
  const [draggingPoint, setDraggingPoint] = useState(null);
  const [brushSize, setBrushSize] = useState(5);
  const [brushStroke, setBrushStroke] = useState([]);
  const [brushing, setBrushing] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [brushCursor, setBrushCursor] = useState(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [spaceDown, setSpaceDown] = useState(false);
  const [panning, setPanning] = useState(false);
  const [stability, setStability] = useState(55);
  const [brushMode, setBrushMode] = useState("image");
  const [linePoints, setLinePoints] = useState([]);
  const [curvePoints, setCurvePoints] = useState([]);
  const [edgeSnap, setEdgeSnap] = useState(0);
  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);

  const drag = useRef(null);
  const panDrag = useRef(null);
  const cardStageRef = useRef(null);

  const clamp = (value, min, max) =>
    Math.min(max, Math.max(min, value));

  const loadSets = async () => {
    setLoadingSets(true);
    setApiError("");

    try {
      const cached = localStorage.getItem(SET_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Date.now() - parsed.savedAt < 24 * 60 * 60 * 1000 && parsed.items?.length) {
          const cachedSets = sortSetsNewestFirst(parsed.items);
          setSets(cachedSets);
          setSetId((current) => current || cachedSets[0]?.id || "");
          setLoadingSets(false);
          return;
        }
      }

      const response = await fetch(`${API_BASE}/sets`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const summaries = (await response.json()).filter(
        (item) => item.cardCount?.total > 0
      );

      const details = [];
      const concurrency = 8;

      for (let index = 0; index < summaries.length; index += concurrency) {
        const batch = summaries.slice(index, index + concurrency);
        const batchDetails = await Promise.all(
          batch.map(async (summary) => {
            if (summary.releaseDate) return summary;
            try {
              const detailResponse = await fetch(
                `${API_BASE}/sets/${encodeURIComponent(summary.id)}`
              );
              if (!detailResponse.ok) return summary;
              const detail = await detailResponse.json();
              return {
                ...summary,
                releaseDate: detail.releaseDate || null,
                serie: detail.serie || summary.serie,
              };
            } catch {
              return summary;
            }
          })
        );
        details.push(...batchDetails);
      }

      const sorted = sortSetsNewestFirst(details);

      localStorage.setItem(
        SET_CACHE_KEY,
        JSON.stringify({ savedAt: Date.now(), items: sorted })
      );

      setSets(sorted);
      setSetId((current) => current || sorted[0]?.id || "");
    } catch (error) {
      setApiError(`繁中擴充包載入失敗：${error.message}`);
    } finally {
      setLoadingSets(false);
    }
  };

  const loadCards = async (nextSetId) => {
    if (!nextSetId) return;
    setLoadingCards(true);
    setApiError("");
    setVisibleCount(PAGE_SIZE);
    try {
      const response = await fetch(`${API_BASE}/sets/${encodeURIComponent(nextSetId)}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setCards(
        (data.cards || []).map((item) => ({
          ...item,
          set: nextSetId,
          no: item.localId,
          rarity: "",
          image: assetUrl(item.image, "low"),
          imageHigh: assetUrl(item.image, "high"),
        }))
      );
    } catch (error) {
      setCards([]);
      setApiError(`卡牌載入失敗：${error.message}`);
    } finally {
      setLoadingCards(false);
    }
  };

  useEffect(() => {
    loadSets();
  }, []);

  useEffect(() => {
    loadCards(setId);
  }, [setId]);

  const beginRotate = (event) => {
    if (
      event.button !== 0 ||
      event.target.closest("button, input, .settings, .guide")
    ) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);

    drag.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      startX: rot.x,
      startY: rot.y,
    };

    setDragging(true);
  };

  const rotate = (event) => {
    if (!drag.current) return;

    const deltaX = event.clientX - drag.current.pointerX;
    const deltaY = event.clientY - drag.current.pointerY;

    setRot({
      x: clamp(
        drag.current.startX - deltaY * sensitivity,
        -55,
        55
      ),
      y: drag.current.startY + deltaX * sensitivity,
    });
  };

  const endRotate = (event) => {
    if (drag.current) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }

    drag.current = null;
    setDragging(false);
  };

  const filtered = useMemo(
    () =>
      cards.filter((item) =>
        String(item?.name || "")
          .toLowerCase()
          .includes(q.trim().toLowerCase())
      ),
    [cards, q]
  );

  const visibleCards = filtered.slice(0, visibleCount);
  const selectedSet = sets.find((item) => item.id === setId);
  const activeLayer = layers.find((layer) => layer.id === activeLayerId);

  const openCard = (item) => {
    if (!item?.id) return;
    setCard({
      ...item,
      name: item.name || "未命名卡牌",
      image: item.imageHigh || item.image || "",
    });
    setLayers(seed.map((layer) => ({ ...layer, cuts: [], strokes: [] })));
    setActiveLayerId(2);
    setLayerName("切割層 1");
    setPolygonPoints([]);
    setDraggingPoint(null);
    setGuide(false);
    setStep(0);
    setRot({ x: -8, y: -18 });
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setBrushCursor(null);
    setLinePoints([]);
    setCurvePoints([]);
    setScreen("editor");
  };

  const steps = useMemo(
    () => [
      {
        title: "準備所有零件",
        text: `確認 ${layers.length} 個圖層均已裁切完成。`,
        layer: -1,
      },
      ...layers.map((layer, index) => ({
        title: `安裝 ${layer.name}`,
        text: index
          ? `對準定位線，疊放於第 ${index} 層上方。`
          : "放置底層並對準工作區中心。",
        layer: index,
      })),
      {
        title: "完成並檢查",
        text: "從正面與側面檢查對位及間距。",
        layer: layers.length,
      },
    ],
    [layers]
  );

  const pointFromEvent = (event) => {
    const stage = cardStageRef.current;
    if (!stage) return null;
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100),
      y: clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100),
    };
  };

  const addPolygonPoint = (event) => {
    if (tool !== "poly" || draggingPoint !== null || activeLayer?.locked) return;
    const nextPoint = pointFromEvent(event);
    if (!nextPoint) return;
    setPolygonPoints((points) => [...points, nextPoint]);
  };

  const beginPointDrag = (event, index) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDraggingPoint(index);
  };

  const movePoint = (event, index) => {
    if (draggingPoint !== index) return;
    event.preventDefault();
    event.stopPropagation();
    const nextPoint = pointFromEvent(event);
    if (!nextPoint) return;
    setPolygonPoints((points) =>
      points.map((point, pointIndex) =>
        pointIndex === index ? nextPoint : point
      )
    );
  };

  const endPointDrag = (event) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      if (event.currentTarget?.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // The node may have been re-rendered before pointerup.
    }
    setDraggingPoint(null);
  };

  const commitLayers = (updater) => {
    setLayers((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      if (next === current) return current;
      setHistory((items) => [...items.slice(-39), current]);
      setFuture([]);
      return next;
    });
  };

  const undoEdit = () => {
    if (!history.length) return;
    const previous = history[history.length - 1];
    setFuture((items) => [layers, ...items].slice(0, 40));
    setHistory((items) => items.slice(0, -1));
    setLayers(previous);
  };

  const redoEdit = () => {
    if (!future.length) return;
    const next = future[0];
    setHistory((items) => [...items, layers].slice(-40));
    setFuture((items) => items.slice(1));
    setLayers(next);
  };

  const effectiveBrushSize = brushMode === "screen" ? brushSize / zoom : brushSize;

  const beginBrush = (event) => {
    if (!["brush", "restore"].includes(tool) || activeLayer?.locked) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const point = pointFromEvent(event);
    if (!point) return;
    setBrushStroke([point]);
    setBrushing(true);
  };

  const moveBrush = (event) => {
    if (!brushing || !["brush", "restore"].includes(tool)) return;
    event.preventDefault();
    const point = pointFromEvent(event);
    if (!point) return;
    setBrushStroke((points) => {
      const last = points[points.length - 1];
      if (!last) return [point];
      const distance = Math.hypot(point.x - last.x, point.y - last.y);
      if (distance < 0.12) return points;
      const follow = Math.max(0.08, 1 - stability / 105);
      const smoothPoint = {
        x: last.x + (point.x - last.x) * follow,
        y: last.y + (point.y - last.y) * follow,
      };
      return [...points, smoothPoint];
    });
  };

  const endBrush = (event) => {
    if (!brushing) return;
    event.preventDefault();
    try {
      if (event.currentTarget?.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {}
    if (brushStroke.length) {
      commitLayers((current) =>
        current.map((layer) =>
          layer.id === activeLayerId
            ? { ...layer, strokes: [...(layer.strokes || []), { points: brushStroke, size: effectiveBrushSize, mode: tool === "restore" ? "restore" : "cut" }] }
            : layer
        )
      );
    }
    setBrushStroke([]);
    setBrushing(false);
  };

  const handleEditorWheel = (event) => {
    event.preventDefault();
    const canvas = cardStageRef.current?.parentElement;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const nextZoom = clamp(Number((zoom + (event.deltaY < 0 ? 0.25 : -0.25)).toFixed(2)), 1, 6);
    const ratio = nextZoom / zoom;
    setPan((current) => ({
      x: pointer.x - rect.width / 2 - (pointer.x - rect.width / 2 - current.x) * ratio,
      y: pointer.y - rect.height / 2 - (pointer.y - rect.height / 2 - current.y) * ratio,
    }));
    setZoom(nextZoom);
  };

  const resetEditorView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const beginPan = (event) => {
    if (!(event.button === 1 || (event.button === 0 && spaceDown))) return false;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    panDrag.current = { x: event.clientX, y: event.clientY, start: pan };
    setPanning(true);
    return true;
  };

  const movePan = (event) => {
    if (!panDrag.current) return;
    setPan({
      x: panDrag.current.start.x + event.clientX - panDrag.current.x,
      y: panDrag.current.start.y + event.clientY - panDrag.current.y,
    });
  };

  const endPan = () => {
    panDrag.current = null;
    setPanning(false);
  };

  const updateBrushCursor = (event) => {
    if (!["brush", "restore"].includes(tool)) return;
    const point = pointFromEvent(event);
    if (point) setBrushCursor(point);
  };

  const snapLinePoint = (start, point, shiftKey) => {
    if (!start || !shiftKey) return point;
    const dx = point.x - start.x;
    const dy = point.y - start.y;
    const distance = Math.hypot(dx, dy);
    const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
    return { x: start.x + Math.cos(angle) * distance, y: start.y + Math.sin(angle) * distance };
  };

  const handlePrecisionClick = (event) => {
    if (activeLayer?.locked) return;
    const raw = pointFromEvent(event);
    if (!raw) return;
    if (tool === "line") {
      if (!linePoints.length) setLinePoints([raw]);
      else setLinePoints([linePoints[0], snapLinePoint(linePoints[0], raw, event.shiftKey)]);
    }
    if (tool === "pen") setCurvePoints((points) => [...points, raw]);
  };

  const applyLine = () => {
    if (linePoints.length !== 2) return;
    commitLayers((current) => current.map((layer) => layer.id === activeLayerId ? {
      ...layer,
      strokes: [...(layer.strokes || []), { points: linePoints, size: effectiveBrushSize, mode: "cut" }],
    } : layer));
    setLinePoints([]);
  };

  const sampleSmoothCurve = (points) => {
    if (points.length < 3) return points;
    const closed = [...points, points[0], points[1]];
    const sampled = [];
    for (let i = 0; i < points.length; i++) {
      const p0 = closed[(i - 1 + points.length) % points.length];
      const p1 = closed[i];
      const p2 = closed[i + 1];
      const p3 = closed[i + 2];
      for (let t = 0; t < 1; t += 0.08) {
        const t2 = t * t, t3 = t2 * t;
        sampled.push({
          x: 0.5 * ((2*p1.x) + (-p0.x+p2.x)*t + (2*p0.x-5*p1.x+4*p2.x-p3.x)*t2 + (-p0.x+3*p1.x-3*p2.x+p3.x)*t3),
          y: 0.5 * ((2*p1.y) + (-p0.y+p2.y)*t + (2*p0.y-5*p1.y+4*p2.y-p3.y)*t2 + (-p0.y+3*p1.y-3*p2.y+p3.y)*t3),
        });
      }
    }
    return sampled;
  };

  const applyCurve = () => {
    if (curvePoints.length < 3) return;
    const smooth = sampleSmoothCurve(curvePoints);
    commitLayers((current) => current.map((layer) => layer.id === activeLayerId ? {
      ...layer,
      cuts: [...(layer.cuts || []), smooth],
    } : layer));
    setCurvePoints([]);
  };

  const cancelPrecision = () => {
    setLinePoints([]);
    setCurvePoints([]);
    setPolygonPoints([]);
  };

  const undoBrushStroke = () => {
    setLayers((current) =>
      current.map((layer) =>
        layer.id === activeLayerId
          ? { ...layer, strokes: (layer.strokes || []).slice(0, -1) }
          : layer
      )
    );
  };

  const undoPolygonPoint = () =>
    setPolygonPoints((points) => points.slice(0, -1));

  const clearPolygon = () => setPolygonPoints([]);

  const finishPolygon = () => {
    if (polygonPoints.length < 3 || !activeLayerId || activeLayer?.locked) return;
    setLayers((current) =>
      current.map((layer) =>
        layer.id === activeLayerId
          ? { ...layer, cuts: [...(layer.cuts || []), polygonPoints] }
          : layer
      )
    );
    setPolygonPoints([]);
  };

  const undoLastCut = () => {
    setLayers((current) =>
      current.map((layer) =>
        layer.id === activeLayerId
          ? { ...layer, cuts: (layer.cuts || []).slice(0, -1) }
          : layer
      )
    );
  };

  const renameActiveLayer = (name) => {
    setLayerName(name);
    setLayers((current) =>
      current.map((layer) =>
        layer.id === activeLayerId ? { ...layer, name } : layer
      )
    );
  };

  const add = () => {
    const id = Date.now();
    const name = `切割層 ${layers.length}`;
    setLayers((current) => [
      ...current,
      { id, name, visible: true, opacity: 1, cuts: [], strokes: [], locked: false },
    ]);
    setActiveLayerId(id);
    setLayerName(name);
    setPolygonPoints([]);
  };

  const moveLayer = (id, direction) => {
    setLayers((current) => {
      const index = current.findIndex((layer) => layer.id === id);
      if (index < 0) return current;

      const targetIndex = direction === "up" ? index + 1 : index - 1;
      if (targetIndex < 0 || targetIndex >= current.length) return current;

      // Keep the fixed background at the bottom.
      if (current[index].locked || current[targetIndex].locked) return current;

      const next = [...current];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  };

  const selectLayer = (layer) => {
    setActiveLayerId(layer.id);
    setLayerName(layer.name);
    setPolygonPoints([]);
    setDraggingPoint(null);
    setBrushStroke([]);
    setBrushing(false);
  };

  const remove = (id) => {
    setLayers((current) => current.filter((layer) => layer.id !== id));
    if (activeLayerId === id) {
      setActiveLayerId(2);
      setLayerName("切割層 1");
    }
  };

  const toggle = (id) =>
    setLayers((current) =>
      current.map((layer) =>
        layer.id === id
          ? { ...layer, visible: !layer.visible }
          : layer
      )
    );

  useEffect(() => {
    const down = (event) => {
      if (event.code === "Space" && !event.repeat) {
        setSpaceDown(true);
        if (!/INPUT|TEXTAREA/.test(event.target.tagName)) event.preventDefault();
      }
      if (event.key === "Escape") cancelPrecision();
      if (event.key === "Enter") {
        if (tool === "line") applyLine();
        if (tool === "pen") applyCurve();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        event.shiftKey ? redoEdit() : undoEdit();
      }
    };
    const up = (event) => { if (event.code === "Space") setSpaceDown(false); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [tool, linePoints, curvePoints, history, future, layers]);

  const header = (
    <header>
      <button className="brand" onClick={() => setScreen("library")}>
        <span>
          <Layers3 />
        </span>
        <b>
          CARD SCULPT
          <small>3D Card Studio</small>
        </b>
      </button>
      <em>{loadingSets || loadingCards ? "● API 載入中" : "● TCGdex 繁中資料已連線"}</em>
    </header>
  );

  return (
    <div className="app">
      {header}

      <AnimatePresence mode="wait">
        {screen === "library" && (
          <motion.main
            key="lib"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="library"
          >
            <section className="hero">
              <div>
                <p>
                  <Sparkles /> 將平面收藏變成立體作品
                </p>
                <h1>
                  選一張卡，<strong>雕出它的深度。</strong>
                </h1>
                <span>
                  瀏覽卡牌、拆分圖層，再用自由視角觀看數位卡雕。
                </span>
              </div>

              <label className="search">
                <Search />
                <input
                  value={q}
                  onChange={(event) => setQ(event.target.value)}
                  placeholder="搜尋繁體中文卡牌名稱…"
                />
              </label>
            </section>

            <h3>卡牌版本</h3>

            {apiError && (
              <div className="notice">
                {apiError} <Btn onClick={() => (sets.length ? loadCards(setId) : loadSets())}>重新載入</Btn>
              </div>
            )}

            <div className="sets">
              {loadingSets ? (
                <span>正在載入繁體中文擴充包…</span>
              ) : (
                sets.map((item) => (
                  <Btn
                    key={item.id}
                    className={setId === item.id ? "active" : ""}
                    onClick={() => setSetId(item.id)}
                  >
                    {item.name}
                    <small>{item.cardCount?.total || 0} 張</small>
                  </Btn>
                ))
              )}
            </div>

            <h3>
              {selectedSet?.name || "卡牌"}
              <small>
                {loadingCards ? " 載入中…" : ` 共 ${filtered.length} 張`}
              </small>
            </h3>

            <div className="cards">
              {visibleCards.map((item) => (
                <button
                  className="card"
                  key={item.id}
                  onClick={() => openCard(item)}
                >
                  <CardImage src={item.image} name={item.name} />
                  <div>
                    <b>{item.name}</b>
                    <small>編號 {item.no}</small>
                  </div>
                </button>
              ))}
            </div>

            {visibleCount < filtered.length && (
              <div style={{ textAlign: "center", marginTop: 24 }}>
                <Btn className="primary" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>
                  載入更多（尚有 {filtered.length - visibleCount} 張）
                </Btn>
              </div>
            )}
          </motion.main>
        )}

        {screen === "editor" && card && (
          <motion.main
            key="edit"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="workspace"
          >
            <div className="toolbar">
              <Btn onClick={() => setScreen("library")}>
                <ChevronLeft />
              </Btn>

              <b>
                {card.name}
                <small>{layers.length} 個圖層</small>
              </b>

              <Btn
                className="primary"
                onClick={() => setScreen("preview")}
              >
                <Box />
                3D 預覽
              </Btn>
            </div>

            <div className="editor">
              <aside>
                <h4>分割工具</h4>
                <div className="tools">
                  <Btn disabled title="智慧選取將於下一階段加入">
                    <WandSparkles />
                    智慧選取
                  </Btn>

                  <Btn
                    className={tool === "poly" ? "active" : ""}
                    onClick={() => setTool("poly")}
                  >
                    <Scissors />
                    多邊形
                  </Btn>
                  <Btn className={tool === "line" ? "active" : ""} onClick={() => { setTool("line"); cancelPrecision(); }}>
                    <Minus />直線
                  </Btn>
                  <Btn className={tool === "pen" ? "active" : ""} onClick={() => { setTool("pen"); cancelPrecision(); }}>
                    <MousePointer2 />曲線鋼筆
                  </Btn>

                  <Btn
                    className={tool === "brush" ? "active" : ""}
                    onClick={() => {
                      setTool("brush");
                      setPolygonPoints([]);
                    }}
                  >
                    <Eraser />
                    自由裁切
                  </Btn>

                  <Btn
                    className={tool === "restore" ? "active" : ""}
                    onClick={() => {
                      setTool("restore");
                      setPolygonPoints([]);
                    }}
                  >
                    <WandSparkles />
                    還原筆刷
                  </Btn>
                </div>

                <div className="polygon-panel">
                  <label>
                    目前圖層名稱
                    <input value={layerName} onChange={(event) => renameActiveLayer(event.target.value)} />
                  </label>
                  <p>{activeLayer?.locked ? "完整背景為固定底圖，請選擇切割層後再裁切。" : tool === "brush" ? "自由裁切模式：塗抹不要的部分，放開後直接消失。" : tool === "restore" ? "還原筆刷：塗抹已裁掉的位置，放開後恢復影像。" : "多邊形模式：圈選不要的區域，拖曳黃色節點微調，再按裁掉。"}</p>
                  {["brush", "restore"].includes(tool) && (
                    <div className="brush-controls">
                      <label>{tool === "restore" ? "還原筆刷" : "裁切筆刷"}大小：{brushSize}</label>
                      <input type="range" min="1" max="20" step="1" value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} />
                      <label>穩定度：{stability}</label>
                      <input type="range" min="0" max="90" step="5" value={stability} onChange={(event) => setStability(Number(event.target.value))} />
                      <label>尺寸模式</label>
                      <select value={brushMode} onChange={(event) => setBrushMode(event.target.value)}><option value="image">跟隨圖片</option><option value="screen">固定畫面</option></select>
                      <label>邊緣吸附：{edgeSnap}</label>
                      <input type="range" min="0" max="100" step="10" value={edgeSnap} onChange={(event) => setEdgeSnap(Number(event.target.value))} />
                      <Btn onClick={undoBrushStroke} disabled={!(activeLayer?.strokes?.length)}>復原筆刷</Btn>
                    </div>
                  )}
                  {tool === "line" && (
                    <div className="precision-panel"><p>點起點與終點。按 Shift 吸附 0°／45°／90°。</p><Btn className="primary" disabled={linePoints.length !== 2} onClick={applyLine}>套用直線</Btn><Btn onClick={() => setLinePoints([])}>清除</Btn></div>
                  )}
                  {tool === "pen" && (
                    <div className="precision-panel"><p>沿輪廓放置節點，系統會產生平滑封閉曲線。</p><Btn className="primary" disabled={curvePoints.length < 3} onClick={applyCurve}>套用曲線</Btn><Btn onClick={() => setCurvePoints([])}>清除</Btn></div>
                  )}
                  {tool === "poly" && (
                    <>
                  <div className="polygon-actions">
                    <Btn onClick={undoPolygonPoint} disabled={!polygonPoints.length}>復原節點</Btn>
                    <Btn onClick={clearPolygon} disabled={!polygonPoints.length}>清除節點</Btn>
                    <Btn onClick={undoLastCut} disabled={!(layers.find((layer) => layer.id === activeLayerId)?.cuts?.length)}>復原裁切</Btn>
                  </div>
                  <Btn className="primary finish-polygon" onClick={finishPolygon} disabled={polygonPoints.length < 3 || !activeLayerId || activeLayer?.locked}>
                    裁掉圈選區域（{polygonPoints.length} 點）
                  </Btn>                    </>
                  )}
                </div>
              </aside>

              <section className="canvas">
                <div
                  ref={cardStageRef}
                  className={`cardstage polygon-stage ${["brush", "restore"].includes(tool) ? "brush-stage" : ""}`}
                  style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "center center" }}
                  onWheel={handleEditorWheel}
                  onPointerDown={(event) => {
                    if (beginPan(event)) return;
                    if (["brush", "restore"].includes(tool)) beginBrush(event);
                    else if (["line", "pen"].includes(tool)) handlePrecisionClick(event);
                    else addPolygonPoint(event);
                  }}
                  onPointerMove={(event) => {
                    if (panning) movePan(event);
                    updateBrushCursor(event);
                    moveBrush(event);
                  }}
                  onPointerLeave={() => setBrushCursor(null)}
                  onPointerUp={(event) => { endBrush(event); endPan(); }}
                  onPointerCancel={(event) => { endBrush(event); endPan(); }}
                  onDoubleClick={(event) => { if (event.button === 1 || spaceDown) resetEditorView(); }}
                >
                  <CardImage
                    src={card.image}
                    name={card.name}
                    style={cutMaskStyle(activeLayer?.cuts, activeLayer?.strokes)}
                  />
                  <svg className="polygon-overlay" viewBox="0 0 100 100" preserveAspectRatio="none">
                    {polygonPoints.length > 1 && (
                      <polyline
                        points={polygonPoints.map((point) => `${point.x},${point.y}`).join(" ")}
                        fill="rgba(248,113,113,.28)"
                        stroke="#fca5a5"
                        strokeWidth="0.7"
                        vectorEffect="non-scaling-stroke"
                      />
                    )}
                    {linePoints.length > 0 && <polyline points={linePoints.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke="#38bdf8" strokeWidth={effectiveBrushSize} strokeLinecap="round" />}
                    {curvePoints.length > 1 && <polyline points={sampleSmoothCurve(curvePoints).map((point) => `${point.x},${point.y}`).join(" ")} fill="rgba(56,189,248,.15)" stroke="#38bdf8" strokeWidth="0.7" />}
                    {[...linePoints, ...curvePoints].map((point, index) => <circle key={`precision-${index}`} cx={point.x} cy={point.y} r="1.4" fill="#38bdf8" stroke="#fff" strokeWidth=".35" />)}
                    {brushStroke.length > 0 && (
                      <polyline
                        points={brushStroke.map((point) => `${point.x},${point.y}`).join(" ")}
                        fill="none"
                        stroke={tool === "restore" ? "rgba(52,211,153,.9)" : "rgba(248,113,113,.82)"}
                        strokeWidth={effectiveBrushSize}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}
                    {brushCursor && ["brush", "restore"].includes(tool) && !brushing && (
                      <circle
                        cx={brushCursor.x}
                        cy={brushCursor.y}
                        r={effectiveBrushSize / 2}
                        fill={tool === "restore" ? "rgba(52,211,153,.18)" : "rgba(248,113,113,.18)"}
                        stroke={tool === "restore" ? "#34d399" : "#f87171"}
                        strokeWidth="0.45"
                      />
                    )}
                    {polygonPoints.map((point, index) => (
                      <g key={`${point.x}-${point.y}-${index}`}>
                        <circle
                          cx={point.x}
                          cy={point.y}
                          r="1.7"
                          fill="#fde047"
                          stroke="#111827"
                          strokeWidth="0.5"
                          className={`polygon-point ${draggingPoint === index ? "dragging" : ""}`}
                          onPointerDown={(event) => beginPointDrag(event, index)}
                          onPointerMove={(event) => movePoint(event, index)}
                          onPointerUp={endPointDrag}
                          onPointerCancel={endPointDrag}
                        />
                        <text x={point.x + 1.8} y={point.y - 1.8} fill="white" fontSize="3">{index + 1}</text>
                      </g>
                    ))}
                  </svg>
                  <small>{activeLayer?.locked ? "請先從右側選擇切割層" : tool === "brush" ? (brushing ? "正在自由裁切，放開後套用" : "滾輪縮放；按住並塗抹不要的細節") : tool === "restore" ? (brushing ? "正在還原，放開後套用" : "滾輪縮放；塗抹要恢復的區域") : polygonPoints.length ? `${polygonPoints.length} 個節點；可拖曳黃色節點調整，紅色區域將被裁掉` : "圈選不要的區域，保留其餘卡面"}</small>
                  <div className="zoom-indicator"><button onClick={() => setZoom((value) => clamp(value - .25, 1, 6))}>−</button><b>{Math.round(zoom * 100)}%</b><button onClick={() => setZoom((value) => clamp(value + .25, 1, 6))}>＋</button><button onClick={resetEditorView}>適合畫面</button></div>
                </div>
              </section>

              <aside>
                <div className="sidehead">
                  <h4>圖層</h4>
                  <Btn onClick={add}>
                    <Plus />
                  </Btn>
                </div>

                {[...layers].reverse().map((layer) => (
                  <div
                    className={`layer ${activeLayerId === layer.id ? "active-layer" : ""}`}
                    key={layer.id}
                    role="button"
                    tabIndex={0}
                    aria-pressed={activeLayerId === layer.id}
                    onClick={() => selectLayer(layer)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        selectLayer(layer);
                      }
                    }}
                  >
                    <CardImage src={card.image} name={card.name} style={cutMaskStyle(layer.cuts, layer.strokes)} />
                    <b>
                      {layer.name}
                      <small>
                        {layer.locked ? "固定底圖" : `已裁切 ${layer.cuts?.length || 0} 區`} · 透明度 {Math.round(layer.opacity * 100)}%
                      </small>
                    </b>
                    <div className="layer-controls">
                      {!layer.locked && (
                        <>
                          <button
                            title="往上一層"
                            onClick={(event) => {
                              event.stopPropagation();
                              moveLayer(layer.id, "up");
                            }}
                          >
                            <ArrowUp />
                          </button>
                          <button
                            title="往下一層"
                            onClick={(event) => {
                              event.stopPropagation();
                              moveLayer(layer.id, "down");
                            }}
                          >
                            <ArrowDown />
                          </button>
                        </>
                      )}
                      <button
                        title={layer.visible ? "隱藏圖層" : "顯示圖層"}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggle(layer.id);
                        }}
                      >
                        {layer.visible ? <Eye /> : <EyeOff />}
                      </button>
                      <button
                        title={layer.locked ? "固定背景不可刪除" : "刪除圖層"}
                        disabled={layer.locked}
                        onClick={(event) => {
                          event.stopPropagation();
                          remove(layer.id);
                        }}
                      >
                        <Trash2 />
                      </button>
                    </div>
                  </div>
                ))}
              </aside>
            </div>
          </motion.main>
        )}

        {screen === "preview" && card && (
          <motion.main
            key="prev"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="preview"
            onPointerDown={beginRotate}
            onPointerMove={rotate}
            onPointerUp={endRotate}
            onPointerCancel={endRotate}
          >
            <div className="previewActions">
              <Btn
                onClick={() => {
                  setGuide(false);
                  setScreen("editor");
                }}
              >
                <ChevronLeft />
                返回編輯
              </Btn>

              <Btn onClick={() => setRot({ x: -8, y: -18 })}>
                <Rotate3D />
                重設視角
              </Btn>

              <Btn
                className="yellow"
                onClick={() => {
                  setGuide(true);
                  setStep(0);
                  setExploded(true);
                }}
              >
                <ListChecks />
                組裝說明
              </Btn>
            </div>

            <div className="settings">
              <label>
                爆炸視圖
                <input
                  type="checkbox"
                  checked={exploded}
                  onChange={(event) =>
                    setExploded(event.target.checked)
                  }
                />
              </label>

              <span>圖層間距</span>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={gap}
                onChange={(event) => setGap(Number(event.target.value))}
              />

              <span>旋轉靈敏度：{Math.round(sensitivity * 100)}</span>
              <input
                type="range"
                min="0.05"
                max="0.25"
                step="0.01"
                value={sensitivity}
                onChange={(event) =>
                  setSensitivity(Number(event.target.value))
                }
              />

              <small>建議值 10～14，數值越低旋轉越細緻</small>
            </div>

            <div className="scene">
              <div
                className={`stack ${dragging ? "dragging" : ""}`}
                style={{
                  transform: `rotateX(${rot.x}deg) rotateY(${rot.y}deg)`,
                  transition: dragging
                    ? "none"
                    : "transform 0.18s ease-out",
                }}
              >
                {layers.map(
                  (layer, index) =>
                    layer.visible && (
                      <div
                        className="plane"
                        key={layer.id}
                        style={{
                          transform: `translateZ(${
                            guide
                              ? index <= steps[step].layer
                                ? index * 5
                                : 130 + index * 38
                              : exploded
                              ? index * 42 * gap
                              : index * 3
                          }px) scale(${
                            guide && index === steps[step].layer
                              ? 1.035
                              : 1
                          })`,
                        }}
                      >
                        <CardImage
                          src={card.image}
                          name={card.name}
                          style={{
                            opacity: layer.opacity,
                            ...cutMaskStyle(layer.cuts, layer.strokes),
                          }}
                        />
                      </div>
                    )
                )}
              </div>
            </div>

            {guide ? (
              <div className="guide">
                <div className="progress">
                  {steps.map((_, index) => (
                    <i
                      key={index}
                      className={index <= step ? "done" : ""}
                    />
                  ))}
                </div>

                <div className="guidebody">
                  <strong>{step + 1}</strong>
                  <div>
                    <small>
                      步驟 {step + 1} / {steps.length}
                    </small>
                    <h2>{steps[step].title}</h2>
                    <p>{steps[step].text}</p>
                  </div>
                  <div>
                    <Btn
                      disabled={!step}
                      onClick={() => setStep((current) => current - 1)}
                    >
                      <ChevronLeft />
                    </Btn>

                    {step === steps.length - 1 ? (
                      <Btn
                        className="success"
                        onClick={() => setGuide(false)}
                      >
                        <Check />
                        完成
                      </Btn>
                    ) : (
                      <Btn
                        className="yellow"
                        onClick={() =>
                          setStep((current) => current + 1)
                        }
                      >
                        下一步
                        <ChevronRight />
                      </Btn>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="caption">
                <b>{card.name} · 數位卡雕</b>
                <small>
                  {layers.length} 個圖層 · 拖曳可旋轉
                </small>
              </div>
            )}
          </motion.main>
        )}
      </AnimatePresence>
    </div>
  );
}


export default function App() {
  return (
    <AppErrorBoundary>
      <CardSculptApp />
    </AppErrorBoundary>
  );
}
