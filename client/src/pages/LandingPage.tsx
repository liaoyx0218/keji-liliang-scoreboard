import { TechBackdrop } from "../components/TechBackdrop";

/** 首页仅提示扫码，不暴露开课入口 */
export function LandingPage() {
  return (
    <main className="page create-page">
      <TechBackdrop />
      <span className="status-kicker">课堂</span>
      <h1>科技力量大</h1>
      <p className="empty" style={{ marginTop: "1.25rem", textAlign: "center", opacity: 0.75 }}>
        请扫学生端二维码进入
      </p>
    </main>
  );
}
