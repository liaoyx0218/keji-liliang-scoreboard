import { useEffect, useRef, useState } from "react";
import type { PosterFields } from "@kl/shared";
import {
  ApiError,
  fetchPosterTemplate,
  generatePoster,
  isNeedRejoinError,
} from "../api";
import "./PosterEditor.css";

type Props = {
  sessionId: string;
  groupId: string;
  groupName: string;
  onNeedRejoin?: () => void;
};

export function PosterEditor({ sessionId, groupId, groupName, onNeedRejoin }: Props) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState("");
  const [roleLabel, setRoleLabel] = useState("");
  const [themeLabel, setThemeLabel] = useState("");
  const [fields, setFields] = useState<PosterFields>({
    title: "",
    subtitle: "",
    body: "",
    summary: "",
  });
  const [imageUrl, setImageUrl] = useState("");
  const [showResult, setShowResult] = useState(false);
  const previewRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let dead = false;
    void (async () => {
      setLoading(true);
      setHint("");
      try {
        const t = await fetchPosterTemplate(sessionId, groupId);
        if (dead) return;
        setFields(t.fields);
        setImageUrl(t.imageUrl ?? "");
        setShowResult(Boolean(t.imageUrl));
        setRoleLabel(t.roleLabel);
        setThemeLabel(t.themeLabel);
      } catch (e) {
        if (isNeedRejoinError(e)) {
          onNeedRejoin?.();
          return;
        }
        if (!dead) setHint("加载失败，请重试");
      } finally {
        if (!dead) setLoading(false);
      }
    })();
    return () => {
      dead = true;
    };
  }, [sessionId, groupId, onNeedRejoin]);

  useEffect(() => {
    if (!showResult || !imageUrl) return;
    previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [showResult, imageUrl]);

  function patch(key: keyof PosterFields, value: string) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  async function onGenerate() {
    setBusy(true);
    setHint("生成中…");
    setShowResult(false);
    try {
      const r = await generatePoster(sessionId, groupId, fields);
      const poster = (r as { poster?: { imageUrl?: string } }).poster;
      const url = poster?.imageUrl ?? "";
      if (!url) {
        setHint("没有返回图片，请再试");
        return;
      }
      setImageUrl(url);
      setShowResult(true);
      setHint("");
    } catch (e) {
      if (isNeedRejoinError(e)) {
        onNeedRejoin?.();
        return;
      }
      if (e instanceof ApiError) {
        if (e.code === "ARK_NOT_CONFIGURED") setHint("未配置生图服务");
        else if (e.code === "POSTER_COOLDOWN") setHint("稍后再试");
        else if (e.code === "POSTER_LIMIT") setHint("次数已用完");
        else if (e.code.startsWith("ARK_")) setHint("生图失败，请再试");
        else setHint("生成失败，请再试");
      } else {
        setHint("生成失败，请再试");
      }
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="poster-editor" role="status">
        <p className="poster-loading">加载中…</p>
      </div>
    );
  }

  if (showResult && imageUrl) {
    return (
      <div className="poster-editor poster-editor--result" ref={previewRef}>
        <div className="poster-head poster-head--compact">
          <h2>
            <span className="poster-theme">{themeLabel}</span>
            {groupName}
          </h2>
        </div>
        <figure className="poster-preview poster-preview--hero">
          <img src={imageUrl} alt={`${groupName}手抄报`} />
        </figure>
        <div className="poster-actions">
          <button
            type="button"
            className="poster-gen"
            disabled={busy}
            onClick={() => {
              setShowResult(false);
              setHint("");
            }}
          >
            重新生成
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="poster-editor">
      <div className="poster-head poster-head--compact">
        <h2>
          <span className="poster-theme">{themeLabel}</span>
          {roleLabel} · {groupName}
        </h2>
      </div>

      <label className="poster-field">
        <span>大标题</span>
        <input
          value={fields.title}
          maxLength={80}
          disabled={busy}
          onChange={(e) => patch("title", e.target.value)}
        />
      </label>
      <label className="poster-field">
        <span>副标题</span>
        <input
          value={fields.subtitle}
          maxLength={120}
          disabled={busy}
          onChange={(e) => patch("subtitle", e.target.value)}
        />
      </label>
      <label className="poster-field">
        <span>正文</span>
        <textarea
          rows={6}
          value={fields.body}
          maxLength={1200}
          disabled={busy}
          onChange={(e) => patch("body", e.target.value)}
        />
      </label>
      <label className="poster-field">
        <span>总结</span>
        <input
          value={fields.summary}
          maxLength={200}
          disabled={busy}
          onChange={(e) => patch("summary", e.target.value)}
        />
      </label>

      <div className="poster-actions">
        <button
          type="button"
          className="poster-gen"
          disabled={busy}
          onClick={() => void onGenerate()}
        >
          {busy ? "生成中…" : "生成"}
        </button>
      </div>

      {hint && (
        <p className="poster-status" role="status">
          {hint}
        </p>
      )}
    </div>
  );
}
