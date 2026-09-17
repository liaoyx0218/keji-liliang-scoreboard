import { BrowserRouter, Route, Routes, useParams } from "react-router-dom";
import { CreatePage } from "./pages/CreatePage";
import { TeacherBoard } from "./pages/TeacherBoard";

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
        <Route path="/t/:sessionId" element={<TeacherBoard />} />
        <Route path="/s/:sessionId" element={<RoutePlaceholder label="学生端" />} />
      </Routes>
    </BrowserRouter>
  );
}
