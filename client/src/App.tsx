import { BrowserRouter, Route, Routes, useParams } from "react-router-dom";
import { CreatePage } from "./pages/CreatePage";

function RoutePlaceholder({ label }: { label: string }) {
  const { sessionId } = useParams();
  return (
    <main className="page">
      <p>{label}（占位，Task 8/9）</p>
      <code>{sessionId}</code>
    </main>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<CreatePage />} />
        <Route path="/t/:sessionId" element={<RoutePlaceholder label="教师大屏" />} />
        <Route path="/s/:sessionId" element={<RoutePlaceholder label="学生端" />} />
      </Routes>
    </BrowserRouter>
  );
}
