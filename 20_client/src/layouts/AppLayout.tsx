import { Outlet } from "react-router-dom";
import BottomNav from "../components/BottomNav";

export default function AppLayout() {
  return (
    <div className="flex min-h-screen justify-center bg-neutral-200">
      <div className="relative flex min-h-screen w-full max-w-md flex-col bg-[#f2f2f7] shadow-2xl">
        <div className="flex-1 pb-24">
          <Outlet />
        </div>
        <BottomNav />
      </div>
    </div>
  );
}
