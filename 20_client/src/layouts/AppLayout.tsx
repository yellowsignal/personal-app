import { Outlet, useLocation } from "react-router-dom";
import BottomNav from "../components/BottomNav";

export default function AppLayout() {
  const { pathname } = useLocation();
  const hideBottomNav = /^\/assets\/\d+\/statement\/?$/.test(pathname);

  return (
    <div className="flex min-h-screen justify-center bg-neutral-200">
      <div className="relative flex min-h-screen w-full max-w-md flex-col bg-[#f2f2f7] shadow-2xl">
        <div className={hideBottomNav ? "flex-1" : "flex-1 pb-24"}>
          <Outlet />
        </div>
        {!hideBottomNav && <BottomNav />}
      </div>
    </div>
  );
}
