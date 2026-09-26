import { useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { createSession } from "../api";
import { TechBackdrop } from "../components/TechBackdrop";

export function CreatePage() {
  const [info, setInfo] = useState<{ sessionId: string; studentUrl: string; teacherUrl: string } | null>(
    null
  );
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState("");
  const qrWrapRef = useRef<HTMLDivElement>(null);

  async function onCreate() {
    try {
      setErr("");
      setCopyFeedback("");
      setBusy(true);
      const data = await createSession();
      const origin = window.location.origin;
      setInfo({
        sessionId: data.sessionId,
        studentUrl: `${origin}${data.studentPath}`,
        teacherUrl: `${origin}${data.teacherPath}`,
      });
    } catch {
      setErr("创建失败");
    } finally {
      setBusy(false);
    }
  }

  function downloadQrPng(blob: Blob) {
    const a = document.createElement("a");
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = "学生端二维码.png";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copyQrCode() {
    setCopyFeedback("");
    const canvas = qrWrapRef.current?.querySelector("canvas");
    if (!canvas) {
      setCopyFeedback("请先创建本场");
      return;
    }

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/png")
    );
    if (!blob) {
      setCopyFeedback("生成失败");
      return;
    }

    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setCopyFeedback("已复制");
      return;
    } catch {
      /* HTTP / permission — fall through to download */
    }

    downloadQrPng(blob);
    setCopyFeedback("已下载二维码");
  }

  return (
    <main className="page create-page">
      <TechBackdrop />
      <span className="status-kicker">开赛准备</span>
      <h1>科技力量大</h1>
      <div className="create-actions">
        <button type="button" onClick={() => void onCreate()} disabled={busy} aria-busy={busy}>
          {busy ? "创建中…" : "创建本场"}
        </button>
      </div>
      {err && (
        <p className="error" role="alert">
          {err}
        </p>
      )}
      {info && (
        <section className="panel" aria-label="本场入口">
          <p className="panel-label">学生端</p>
          <code>{info.studentUrl}</code>
          <div className="qr-wrap" ref={qrWrapRef}>
            <QRCodeCanvas value={info.studentUrl} size={256} includeMargin />
          </div>
          <div className="panel-links">
            <button type="button" onClick={() => void copyQrCode()}>
              复制二维码
            </button>
            <a href={info.teacherUrl} target="_blank" rel="noreferrer">
              打开大屏
            </a>
          </div>
          {copyFeedback && (
            <p className="copy-feedback" role="status">
              {copyFeedback}
            </p>
          )}
        </section>
      )}
    </main>
  );
}
