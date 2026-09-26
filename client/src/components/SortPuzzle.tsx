import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { SortTheme } from "@kl/shared";
import { getSortPuzzle, isSortCorrect } from "@kl/shared";
import "./SortPuzzle.css";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type DragPayload =
  | { from: "pool"; id: string }
  | { from: "slot"; index: number; id: string };

type GhostState = {
  payload: DragPayload;
  img: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

type Props = {
  theme: SortTheme;
  groupName: string;
};

const THEME_INDEX: Record<SortTheme, number> = { yi: 1, shi: 2, zhu: 3 };
const DRAG_THRESHOLD_PX = 8;

export function SortPuzzlePanel({ theme, groupName }: Props) {
  const puzzle = useMemo(() => getSortPuzzle(theme), [theme]);
  const slotCount = puzzle.order.length;
  const [pool, setPool] = useState(() => shuffle(puzzle.cards.map((c) => c.id)));
  const [slots, setSlots] = useState<(string | null)[]>(() => Array(slotCount).fill(null));
  const [picked, setPicked] = useState<DragPayload | null>(null);
  const [ghost, setGhost] = useState<GhostState | null>(null);
  const [hoverSlot, setHoverSlot] = useState<number | null>(null);
  const [hoverPool, setHoverPool] = useState(false);
  const [result, setResult] = useState<"ok" | "bad" | null>(null);

  const poolRef = useRef(pool);
  const slotsRef = useRef(slots);
  poolRef.current = pool;
  slotsRef.current = slots;

  const pressRef = useRef<{
    payload: DragPayload;
    img: string;
    label: string;
    startX: number;
    startY: number;
    w: number;
    h: number;
    pointerId: number;
    dragging: boolean;
  } | null>(null);

  const byId = useMemo(() => new Map(puzzle.cards.map((c) => [c.id, c])), [puzzle]);
  const filled = slots.every((id) => id !== null);
  const dragging = Boolean(ghost);

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const scrollY = window.scrollY;
    root.classList.add("sort-mode-active");
    body.classList.add("sort-mode-active");
    body.style.top = `-${scrollY}px`;

    // 平板浏览器：排序页全程禁止页面滚动手势（含下拉刷新、长按菜单）
    const blockTouchMove = (ev: TouchEvent) => {
      const t = ev.target;
      if (t instanceof Element && t.closest(".sort-panel.is-dragging")) {
        ev.preventDefault();
        return;
      }
      // 仅允许排序面板内部滚动；禁止整页/下拉刷新
      if (!(t instanceof Element) || !t.closest(".sort-panel")) {
        ev.preventDefault();
        return;
      }
    };
    const blockContextMenu = (ev: Event) => {
      ev.preventDefault();
    };
    const blockSelectStart = (ev: Event) => {
      ev.preventDefault();
    };

    document.addEventListener("touchmove", blockTouchMove, { passive: false });
    document.addEventListener("contextmenu", blockContextMenu, true);
    document.addEventListener("selectstart", blockSelectStart, true);

    return () => {
      root.classList.remove("sort-mode-active");
      body.classList.remove("sort-mode-active");
      body.style.top = "";
      window.scrollTo(0, scrollY);
      document.removeEventListener("touchmove", blockTouchMove);
      document.removeEventListener("contextmenu", blockContextMenu, true);
      document.removeEventListener("selectstart", blockSelectStart, true);
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    if (!dragging) {
      root.classList.remove("sort-dragging");
      body.classList.remove("sort-dragging");
      return;
    }
    root.classList.add("sort-dragging");
    body.classList.add("sort-dragging");
    const block = (ev: TouchEvent) => {
      ev.preventDefault();
    };
    document.addEventListener("touchmove", block, { passive: false });
    return () => {
      document.removeEventListener("touchmove", block);
      root.classList.remove("sort-dragging");
      body.classList.remove("sort-dragging");
    };
  }, [dragging]);

  function clearFeedback() {
    setResult(null);
  }

  function applyPlace(targetIndex: number, payload: DragPayload) {
    clearFeedback();
    const curSlots = slotsRef.current;
    const curPool = poolRef.current;
    const nextSlots = [...curSlots];
    const occupant = nextSlots[targetIndex];

    if (payload.from === "pool") {
      if (!curPool.includes(payload.id)) return;
      nextSlots[targetIndex] = payload.id;
      let nextPool = curPool.filter((id) => id !== payload.id);
      if (occupant) nextPool = [...nextPool, occupant];
      setSlots(nextSlots);
      setPool(nextPool);
      return;
    }

    if (payload.index === targetIndex) return;
    if (nextSlots[payload.index] !== payload.id) return;
    nextSlots[targetIndex] = payload.id;
    nextSlots[payload.index] = occupant;
    setSlots(nextSlots);
  }

  function applyReturn(payload: DragPayload) {
    if (payload.from !== "slot") return;
    if (slotsRef.current[payload.index] !== payload.id) return;
    clearFeedback();
    const nextSlots = [...slotsRef.current];
    nextSlots[payload.index] = null;
    setSlots(nextSlots);
    setPool((prev) => (prev.includes(payload.id) ? prev : [...prev, payload.id]));
  }

  function samePick(a: DragPayload, b: DragPayload) {
    if (a.from === "pool" && b.from === "pool") return a.id === b.id;
    if (a.from === "slot" && b.from === "slot") return a.index === b.index;
    return false;
  }

  function onPick(payload: DragPayload) {
    clearFeedback();
    if (picked && samePick(picked, payload)) {
      setPicked(null);
      return;
    }
    if (picked && payload.from === "slot") {
      applyPlace(payload.index, picked);
      setPicked(null);
      return;
    }
    setPicked(payload);
  }

  function hitTest(clientX: number, clientY: number): { kind: "slot"; index: number } | { kind: "pool" } | null {
    const stack = document.elementsFromPoint(clientX, clientY);
    for (const el of stack) {
      if (!(el instanceof HTMLElement)) continue;
      if (el.dataset.sortGhost != null) continue;
      const slot = el.closest("[data-sort-slot]") as HTMLElement | null;
      if (slot?.dataset.sortSlot != null) {
        return { kind: "slot", index: Number(slot.dataset.sortSlot) };
      }
      if (el.closest("[data-sort-pool]")) return { kind: "pool" };
    }
    return null;
  }

  function finishDrop(clientX: number, clientY: number, payload: DragPayload) {
    const hit = hitTest(clientX, clientY);
    if (hit?.kind === "slot") {
      applyPlace(hit.index, payload);
    } else if (hit?.kind === "pool") {
      applyReturn(payload);
    }
  }

  function onPointerDown(payload: DragPayload, e: ReactPointerEvent<HTMLElement>) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const card = byId.get(payload.id);
    if (!card) return;
    const rect = e.currentTarget.getBoundingClientRect();
    pressRef.current = {
      payload,
      img: card.image,
      label: card.label,
      startX: e.clientX,
      startY: e.clientY,
      w: rect.width,
      h: rect.height,
      pointerId: e.pointerId,
      dragging: false,
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  function onPointerMove(e: ReactPointerEvent<HTMLElement>) {
    const press = pressRef.current;
    if (!press || press.pointerId !== e.pointerId) return;

    const dx = e.clientX - press.startX;
    const dy = e.clientY - press.startY;
    if (!press.dragging) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      press.dragging = true;
      setPicked(null);
      clearFeedback();
      setGhost({
        payload: press.payload,
        img: press.img,
        label: press.label,
        x: e.clientX,
        y: e.clientY,
        w: press.w,
        h: press.h,
      });
    }

    e.preventDefault();
    setGhost((g) => (g ? { ...g, x: e.clientX, y: e.clientY } : g));
    const hit = hitTest(e.clientX, e.clientY);
    setHoverSlot(hit?.kind === "slot" ? hit.index : null);
    setHoverPool(hit?.kind === "pool" && press.payload.from === "slot");
  }

  function onPointerUp(e: ReactPointerEvent<HTMLElement>) {
    const press = pressRef.current;
    if (!press || press.pointerId !== e.pointerId) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }

    if (press.dragging) {
      e.preventDefault();
      finishDrop(e.clientX, e.clientY, press.payload);
    } else {
      // tap
      if (picked && press.payload.from === "slot") {
        applyPlace(press.payload.index, picked);
        setPicked(null);
      } else if (picked && press.payload.from === "pool" && samePick(picked, press.payload)) {
        setPicked(null);
      } else if (picked && press.payload.from === "pool") {
        setPicked(press.payload);
      } else {
        onPick(press.payload);
      }
    }

    pressRef.current = null;
    setGhost(null);
    setHoverSlot(null);
    setHoverPool(false);
  }

  function onPointerCancel(e: ReactPointerEvent<HTMLElement>) {
    const press = pressRef.current;
    if (!press || press.pointerId !== e.pointerId) return;
    pressRef.current = null;
    setGhost(null);
    setHoverSlot(null);
    setHoverPool(false);
  }

  function onSlotTap(index: number) {
    if (ghost || pressRef.current?.dragging) return;
    const id = slots[index];
    if (picked) {
      applyPlace(index, picked);
      setPicked(null);
      return;
    }
    if (id) applyReturn({ from: "slot", index, id });
  }

  function onPoolBackgroundTap() {
    if (ghost || pressRef.current?.dragging) return;
    if (picked?.from === "slot") {
      applyReturn(picked);
      setPicked(null);
    }
  }

  function submit() {
    if (!filled) return;
    setResult(isSortCorrect(theme, slots as string[]) ? "ok" : "bad");
  }

  const active = ghost?.payload ?? picked;
  const liftingId = ghost?.payload.id ?? null;

  return (
    <div
      className={dragging ? "sort-panel is-dragging" : "sort-panel"}
      onContextMenu={(e) => e.preventDefault()}
    >
      <header className="sort-head">
        <div className="sort-title-row">
          <h2>
            <span className="sort-theme-num">{THEME_INDEX[theme]}</span>
            {puzzle.themeLabel}的演变
          </h2>
        </div>
        <p className="sort-group">{groupName}</p>
      </header>

      <section
        className={hoverPool || (active?.from === "slot" && !ghost) ? "sort-pool is-drop-target" : "sort-pool"}
        data-sort-pool=""
        aria-label="待排序图片"
        onClick={onPoolBackgroundTap}
      >
        {pool.map((id) => {
          const card = byId.get(id)!;
          const isActive = active?.from === "pool" && active.id === id;
          const isLifted = liftingId === id;
          return (
            <button
              type="button"
              key={id}
              className={[
                "sort-pool-card",
                isActive ? "is-active" : "",
                isLifted ? "is-lifted" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onPointerDown={(e) => onPointerDown({ from: "pool", id }, e)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerCancel}
              onContextMenu={(e) => e.preventDefault()}
              onClick={(e) => e.stopPropagation()}
            >
              <img src={card.image} alt={card.label} draggable={false} />
            </button>
          );
        })}
        {pool.length === 0 && <p className="sort-pool-empty">拖回可调整</p>}
      </section>

      <section className="sort-train" aria-label="从古到今排序">
        <div className="sort-train-label">从古到今</div>
        <div className="sort-train-track">
          <span className="sort-axis-start" aria-hidden>
            古
          </span>
          <ol className="sort-slots" style={{ ["--slot-count" as string]: String(slotCount) }}>
            {slots.map((id, index) => {
              const card = id ? byId.get(id) : null;
              const isActive = active?.from === "slot" && active.index === index;
              const isHover = hoverSlot === index;
              const isLifted = Boolean(card && liftingId === card.id);
              return (
                <li key={index} className="sort-slot-wrap">
                  <div
                    className={[
                      "sort-slot",
                      id ? "is-filled" : "is-empty",
                      isActive ? "is-active" : "",
                      isHover ? "is-droppable" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    data-sort-slot={index}
                    onClick={() => onSlotTap(index)}
                  >
                    <span className="sort-slot-num">{index + 1}</span>
                    {card ? (
                      <button
                        type="button"
                        className={isLifted ? "sort-slot-card is-lifted" : "sort-slot-card"}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          onPointerDown({ from: "slot", index, id: card.id }, e);
                        }}
                        onPointerMove={onPointerMove}
                        onPointerUp={onPointerUp}
                        onPointerCancel={onPointerCancel}
                        onContextMenu={(e) => e.preventDefault()}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`${card.label}，第${index + 1}节`}
                      >
                        <img src={card.image} alt={card.label} draggable={false} />
                      </button>
                    ) : (
                      <span className="sort-slot-placeholder">拖入</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          <span className="sort-axis-end" aria-hidden>
            今
          </span>
        </div>
      </section>

      <div className="sort-actions">
        <button type="button" className="sort-submit" disabled={!filled} onClick={submit}>
          提交
        </button>
      </div>
      {result === "ok" && <p className="sort-ok">顺序正确</p>}
      {result === "bad" && <p className="sort-bad">顺序不对</p>}

      {ghost && (
        <div
          className="sort-ghost"
          data-sort-ghost=""
          style={{
            left: ghost.x,
            top: ghost.y,
            width: ghost.w,
            height: ghost.h,
          }}
          aria-hidden
        >
          <img src={ghost.img} alt="" draggable={false} />
        </div>
      )}
    </div>
  );
}
