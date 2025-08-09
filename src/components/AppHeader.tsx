import { Link, NavLink } from "react-router-dom";
import { useLocation } from "react-router-dom";

const navItems = [
  { label: "Files", to: "/files" },
  { label: "Appointments", to: "/appointments" },
  { label: "Open Questions", to: "/questions" },
  { label: "Notes", to: "/notes" },
];

const AppHeader = () => {
  const location = useLocation();
  const isActive = (to: string) => location.pathname === to;

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <Link to="/" className="font-semibold text-foreground hover:opacity-80" aria-label="Go Home">
            Project MC
          </Link>
        </div>
        <nav className="flex items-center gap-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive: active }) =>
                `rounded-md px-3 py-1.5 text-sm transition-colors ${
                  active ? "bg-accent text-foreground" : "hover:bg-accent text-muted-foreground"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  );
};

export default AppHeader;
