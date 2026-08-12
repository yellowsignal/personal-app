import { Navigate, Route, Routes } from "react-router-dom";
import RequireAuth from "./components/RequireAuth";
import AppLayout from "./layouts/AppLayout";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import AssetsPage from "./pages/AssetsPage";
import AssetStatementPage from "./pages/AssetStatementPage";
import DocumentsPage from "./pages/DocumentsPage";
import SubscriptionsPage from "./pages/SubscriptionsPage";
import CalendarPage from "./pages/CalendarPage";
import PhotosPage from "./pages/PhotosPage";
import ChecklistsPage from "./pages/ChecklistsPage";
import SettingsPage from "./pages/SettingsPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/assets" element={<AssetsPage />} />
          <Route path="/assets/:assetId/statement" element={<AssetStatementPage />} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/subscriptions" element={<SubscriptionsPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/photos" element={<PhotosPage />} />
          <Route path="/checklists" element={<ChecklistsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
