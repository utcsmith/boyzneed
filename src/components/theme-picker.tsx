import { useEffect, useState } from "react";
import { Check, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const themes = [
  { id: "bgmi", name: "BGMI · Squad HUD", mood: "Carbon · field map · supply drop" },
  { id: "garba", name: "Garba · Raas night", mood: "Mirror-work · textile · festive" },
] as const;
type Theme = typeof themes[number]["id"];

export function ThemePicker() {
  const [theme, setTheme] = useState<Theme>("bgmi");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try {
      const stored = localStorage.getItem("nightshift-theme");
      const saved = themes.find((item) => item.id === stored);
      const initialTheme = saved?.id ?? "bgmi";
      setTheme(initialTheme);
      document.documentElement.dataset["theme"] = initialTheme;
      localStorage.setItem("nightshift-theme", initialTheme);
    } catch { /* Themes still work when storage is unavailable. */ }
  }, []);
  function selectTheme(next: Theme) {
    setTheme(next);
    document.documentElement.dataset["theme"] = next;
    try { localStorage.setItem("nightshift-theme", next); } catch { /* Keep the current-session choice. */ }
    setOpen(false);
  }
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><Button variant="outline" size="icon" className="theme-trigger" aria-label="Choose theme" title="Choose theme"><Palette size={18} /></Button></PopoverTrigger>
    <PopoverContent align="end" className="theme-menu">
      <div className="theme-menu-heading"><Palette size={16} /><strong>Choose your interface</strong><span>02</span></div>
      <div className="theme-options" role="group" aria-label="Interface style">{themes.map((item) => <Button key={item.id} variant="ghost" className="theme-option" aria-pressed={theme === item.id} onClick={() => selectTheme(item.id)}>
        <span className={`theme-swatch swatch-${item.id}`} aria-hidden="true"><i /><i /><i /></span>
        <span className="theme-option-copy"><strong>{item.name}</strong><small>{item.mood}</small></span>
        <span className="theme-check">{theme === item.id && <Check size={16} />}</span>
      </Button>)}</div>
    </PopoverContent>
  </Popover>;
}