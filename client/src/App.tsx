import { BrowserRouter, Route, Routes } from "react-router-dom";
import { CreatePage } from "./pages/CreatePage";
import { LandingPage } from "./pages/LandingPage";
import { StudentPage } from "./pages/StudentPage";
import { TeacherBoard } from "./pages/TeacherBoard";

/** 开课台路径故意非公开；教师收藏此地址，勿写进学生课件 */
export const TEACHER_DESK_PATH = "/desk/kl-open-8f2c";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path={TEACHER_DESK_PATH} element={<CreatePage />} />
        <Route path="/host/:sessionId/:teacherKey" element={<TeacherBoard />} />
        <Route path="/s/:sessionId" element={<StudentPage />} />
      </Routes>
    </BrowserRouter>
  );
}
