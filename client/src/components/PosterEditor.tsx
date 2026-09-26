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
        if (!dead) setHint("加载模板失败，请重试");
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
    setHint("正在生成手抄报，大约需要十几秒…");
    setShowResult(false);
    try {
      const r = await generatePoster(sessionId, groupId, fields);
      const poster = (r as { poster?: { imageUrl?: string } }).poster;
      const url = poster?.imageUrl ?? "";
      if (!url) {
        setHint("生成成功但没有返回图片，请再试一次");
        return;
      }
      setImageUrl(url);
      setShowResult(true);
      setHint("生成成功！下面就是本组手抄报");
    } catch (e) {
      if (isNeedRejoinError(e)) {
        onNeedRejoin?.();
        return;
      }
      if (e instanceof ApiError) {
        if (e.code === "ARK_NOT_CONFIGURED") setHint("未配置生图服务，请老师检查后台");
        else if (e.code === "POSTER_COOLDOWN") setHint("生成太快了，稍等再试");
        else if (e.code === "POSTER_LIMIT") setHint("本组生成次数已用完");
        else if (e.code.startsWith("ARK_")) {
          const detail = (() => {
            try {
              const body = JSON.parse(e.message) as { detail?: string };
              return body.detail;
            } catch {
              return undefined;
            }
          })();
          setHint(detail ? `生图失败：${detail}` : "生图失败，请稍后再试");
        } else setHint("生成失败，再试一次");
      } else {
        setHint("生成失败，再试一次");
      }
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="poster-editor" role="status">
        <p className="poster-loading">正在加载本组手抄报模板…</p>
      </div>
    );
  }

  if (showResult && imageUrl) {
    return (
      <div className="poster-editor poster-editor--result" ref={previewRef}>
        <div className="poster-head">
          <h2>
            <span className="poster-theme">{themeLabel}</span>
            手抄报 · {roleLabel}
          </h2>
          <p className="poster-group">{groupName}</p>
          <p className="poster-hint-line">生成成功，可投屏展示</p>
        </div>
        {hint && (
          <p className="poster-status" role="status">
            {hint}
          </p>
        )}
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
              setHint("改好文字后再生成");
            }}
          >
            修改文案重新生成
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="poster-editor">
      <div className="poster-head">
        <h2>
          <span className="poster-theme">{themeLabel}</span>
          手抄报 · {roleLabel}
        </h2>
        <p className="poster-group">{groupName}</p>
        <p className="poster-hint-line">可改下面的文字，再点「生成手抄报」</p>
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
        <span>正文要点</span>
        <textarea
          rows={8}
          value={fields.body}
          maxLength={1200}
          disabled={busy}
          onChange={(e) => patch("body", e.target.value)}
        />
      </label>
      <label className="poster-field">
        <span>总结句</span>
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
          {busy ? "生成中…" : "生成手抄报"}
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
