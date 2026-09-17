import { BrowserRouter, Route, Routes } from "react-router-dom";
import { CreatePage } from "./pages/CreatePage";
import { StudentPage } from "./pages/StudentPage";
import { TeacherBoard } from "./pages/TeacherBoard";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<CreatePage />} />
        <Route path="/t/:sessionId" element={<TeacherBoard />} />
        <Route path="/s/:sessionId" element={<StudentPage />} />
      </Routes>
    </BrowserRouter>
  );
}
