import { useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { createSession } from "../api";

export function CreatePage() {
  const [info, setInfo] = useState<{ sessionId: string; studentUrl: string; teacherUrl: string } | null>(
    null
  );
  const [err, setErr] = useState("");
  const [copyFeedback, setCopyFeedback] = useState("");
  const qrWrapRef = useRef<HTMLDivElement>(null);

  async function onCreate() {
    try {
      setErr("");
      setCopyFeedback("");
      const data = await createSession();
      const origin = window.location.origin;
      setInfo({
        sessionId: data.sessionId,
        studentUrl: `${origin}${data.studentPath}`,
        teacherUrl: `${origin}${data.teacherPath}`,
      });
    } catch {
      setErr("创建失败，请重试");
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
      setCopyFeedback("还没有二维码，请先创建本场");
      return;
    }

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/png")
    );
    if (!blob) {
      setCopyFeedback("生成图片失败，请重试");
      return;
    }

    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setCopyFeedback("已复制二维码，可粘贴到课件");
      return;
    } catch {
      /* HTTP / permission — fall through to download */
    }

    downloadQrPng(blob);
    setCopyFeedback("浏览器不支持复制图片，已下载二维码");
  }

  return (
    <main className="page create-page">
      <h1>科技力量大 · 开赛准备</h1>
      <p>生成学生端二维码，放到课件里；大屏用旁边按钮打开。</p>
      <button type="button" onClick={onCreate}>
        创建本场
      </button>
      {err && <p className="error">{err}</p>}
      {info && (
        <section>
          <p>学生端链接（唯一）：</p>
          <code>{info.studentUrl}</code>
          <div className="qr-wrap" ref={qrWrapRef}>
            <QRCodeCanvas value={info.studentUrl} size={256} includeMargin />
          </div>
          <button type="button" onClick={() => void copyQrCode()}>
            复制二维码
          </button>
          {copyFeedback && <p className="copy-feedback">{copyFeedback}</p>}
          <a href={info.teacherUrl} target="_blank" rel="noreferrer">
            打开大屏
          </a>
        </section>
      )}
    </main>
  );
}
