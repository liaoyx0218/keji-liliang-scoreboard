import { useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { createSession } from "../api";

export function CreatePage() {
  const [info, setInfo] = useState<{ sessionId: string; studentUrl: string; teacherUrl: string } | null>(
    null
  );
  const [err, setErr] = useState("");
  const [copyFeedback, setCopyFeedback] = useState("");
  const linkRef = useRef<HTMLElement>(null);

  async function onCreate() {
    try {
      setErr("");
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

  async function copyStudentLink(url: string) {
    setCopyFeedback("");
    try {
      await navigator.clipboard.writeText(url);
      setCopyFeedback("已复制");
      return;
    } catch {
      /* secure context / permission — fall through */
    }

    const ta = document.createElement("textarea");
    ta.value = url;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } finally {
      document.body.removeChild(ta);
    }
    if (copied) {
      setCopyFeedback("已复制");
      return;
    }

    const el = linkRef.current;
    if (el) {
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      setCopyFeedback("已选中，请手动复制");
      return;
    }

    window.prompt("请复制链接", url);
    setCopyFeedback("复制失败，请手动复制");
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
          <code ref={linkRef}>{info.studentUrl}</code>
          <button type="button" onClick={() => void copyStudentLink(info.studentUrl)}>
            复制链接
          </button>
          {copyFeedback && <p className="copy-feedback">{copyFeedback}</p>}
          <div className="qr-wrap">
            <QRCodeSVG value={info.studentUrl} size={256} />
          </div>
          <a href={info.teacherUrl} target="_blank" rel="noreferrer">
            打开大屏
          </a>
        </section>
      )}
    </main>
  );
}
