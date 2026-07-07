import { NavLink, useLocation } from "react-router-dom";
import useCurrentUser from "@/hooks/useCurrentUser";
import useNotebookSidebarCollapsed from "@/hooks/useNotebookSidebarCollapsed";
import usePrimaryNavLinks from "@/hooks/usePrimaryNavLinks";
import { cn } from "@/lib/utils";
import { Routes } from "@/router";
import { useTranslate } from "@/utils/i18n";
import { toggleNotebookSidebarCollapsed } from "@/utils/notebookSidebar";
import MemosLogo from "./MemosLogo";

const MobileNavBar = () => {
  const t = useTranslate();
  const currentUser = useCurrentUser();
  const location = useLocation();
  const isHome = location.pathname === Routes.HOME;
  const notebookSidebarCollapsed = useNotebookSidebarCollapsed();
  const { primaryNavLinks, inboxAriaLabel } = usePrimaryNavLinks("w-5 h-auto shrink-0", true);

  return (
    <div className="flex flex-row items-center gap-0.5 shrink-0">
      {isHome ? (
        <button
          type="button"
          className="rounded-lg flex items-center justify-center w-8 h-8 shrink-0 opacity-80"
          onClick={toggleNotebookSidebarCollapsed}
          title={t(notebookSidebarCollapsed ? "notebook.expand-sidebar" : "notebook.collapse-sidebar")}
        >
          <MemosLogo collapsed mini />
        </button>
      ) : (
        <NavLink
          className="rounded-lg flex items-center justify-center w-8 h-8 shrink-0 opacity-80"
          to={currentUser ? Routes.HOME : Routes.EXPLORE}
        >
          <MemosLogo collapsed mini />
        </NavLink>
      )}
      {primaryNavLinks.map((navLink) => (
        <NavLink
          className={({ isActive }) =>
            cn(
              "rounded-lg flex items-center justify-center w-8 h-8 shrink-0 text-sidebar-foreground transition-colors",
              isActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "opacity-80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )
          }
          key={navLink.id}
          to={navLink.path}
          end={navLink.path === Routes.HOME}
          id={navLink.id}
          aria-label={navLink.id === "header-inbox" ? inboxAriaLabel : navLink.title}
          viewTransition
        >
          {navLink.icon}
        </NavLink>
      ))}
    </div>
  );
};

export default MobileNavBar;
