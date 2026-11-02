import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import Navbar from "./components/Navbar";
import ProjectFeed from "./pages/ProjectFeed";
import ProjectDetails from "./pages/ProjectDetails";
import ProjectForm from "./pages/ProjectForm";
import Login from "./pages/Login";
import Signup from "./pages/Signup";

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />

      <Routes>
        <Route path="/" element={<Navigate to="/projects" replace />} />

        <Route path="/login" element={<Login />} />

        <Route path="/signup" element={<Signup />} />

        <Route path="/projects" element={<ProjectFeed />} />

        <Route path="/projects/new" element={<ProjectForm />} />

        <Route path="/projects/:id" element={<ProjectDetails />} />

        <Route path="/projects/:id/edit" element={<ProjectForm />} />

        <Route path="*" element={<Navigate to="/projects" replace />} />
      </Routes>
    </BrowserRouter>
  );
}