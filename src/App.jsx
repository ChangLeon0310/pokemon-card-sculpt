import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Box,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Layers3,
  ListChecks,
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

const assetUrl = (url, quality = "low") => {
  if (!url) return "";
  if (/\.(webp|png|jpg)$/i.test(url)) return url;
  return `${url}/${quality}.webp`;
};

const seed = [
  { id: 1, name: "卡框與背景", visible: true, opacity: 1 },
  { id: 2, name: "場景／特效", visible: true, opacity: 0.96 },
  { id: 3, name: "寶可夢主體", visible: true, opacity: 1 },
  { id: 4, name: "前景高光", visible: true, opacity: 0.88 },
];

const Btn = ({ children, className = "", ...props }) => (
  <button className={`btn ${className}`} {...props}>
    {children}
  </button>
);

function CardImage({ src, name, className = "", style = {} }) {
  const [bad, setBad] = useState(false);

  if (bad || !src) {
    return (
      <div className={`fallback ${className}`} style={style}>
        <Layers3 />
        <b>{name}</b>
        <small>外部圖片無法載入</small>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      className={className}
      style={style}
      draggable="false"
      onError={() => setBad(true)}
    />
  );
}

export default function App() {
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

  const drag = useRef(null);

  const clamp = (value, min, max) =>
    Math.min(max, Math.max(min, value));

  const loadSets = async () => {
    setLoadingSets(true);
    setApiError("");
    try {
      const response = await fetch(`${API_BASE}/sets`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const available = data.filter((item) => item.cardCount?.total > 0);
      setSets(available);
      if (!setId && available.length) setSetId(available[0].id);
    } catch (error) {
      setApiError(`版本載入失敗：${error.message}`);
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
    () => cards.filter((item) => item.name.toLowerCase().includes(q.trim().toLowerCase())),
    [cards, q]
  );

  const visibleCards = filtered.slice(0, visibleCount);
  const selectedSet = sets.find((item) => item.id === setId);

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

  const add = () =>
    setLayers((current) => [
      ...current,
      {
        id: Date.now(),
        name: `新圖層 ${current.length + 1}`,
        visible: true,
        opacity: 1,
      },
    ]);

  const remove = (id) =>
    setLayers((current) => current.filter((layer) => layer.id !== id));

  const toggle = (id) =>
    setLayers((current) =>
      current.map((layer) =>
        layer.id === id
          ? { ...layer, visible: !layer.visible }
          : layer
      )
    );

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
      <em>{loadingSets || loadingCards ? "● API 載入中" : "● 繁中 API 已連線"}</em>
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
                  placeholder="搜尋卡牌名稱…"
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
                <span>正在載入繁體中文版本…</span>
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
              <small> {loadingCards ? "載入中…" : `共 ${filtered.length} 張`}</small>
            </h3>

            <div className="cards">
              {visibleCards.map((item) => (
                <button
                  className="card"
                  key={item.id}
                  onClick={() => {
                    setCard({ ...item, image: item.imageHigh || item.image });
                    setScreen("editor");
                  }}
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
                  <Btn
                    className={tool === "magic" ? "active" : ""}
                    onClick={() => setTool("magic")}
                  >
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
                </div>

                <p className="notice">
                  目前為互動原型。正式版可接入影像分割模型及遮罩筆刷。
                </p>
              </aside>

              <section className="canvas">
                <div className="cardstage">
                  <CardImage src={card.image} name={card.name} />
                  <div className="selection" />
                  <small>點擊主體建立遮罩</small>
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
                  <div className="layer" key={layer.id}>
                    <CardImage src={card.image} name={card.name} />
                    <b>
                      {layer.name}
                      <small>
                        透明度 {Math.round(layer.opacity * 100)}%
                      </small>
                    </b>
                    <button onClick={() => toggle(layer.id)}>
                      {layer.visible ? <Eye /> : <EyeOff />}
                    </button>
                    <button onClick={() => remove(layer.id)}>
                      <Trash2 />
                    </button>
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
                          style={{ opacity: layer.opacity }}
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
