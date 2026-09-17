import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { createSession } from "../api";

export function CreatePage() {
  const [info, setInfo] = useState<{ sessionId: string; studentUrl: string; teacherUrl: string } | null>(
    null
  );
  const [err, setErr] = useState("");

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
          <button type="button" onClick={() => navigator.clipboard.writeText(info.studentUrl)}>
            复制链接
          </button>
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
