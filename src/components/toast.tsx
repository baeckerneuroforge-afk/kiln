"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastType = "success" | "error" | "info";

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  removing?: boolean;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

const TOAST_DURATION = 3000;

const icons = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
};

const styles = {
  success: "border-kiln-green/20 text-kiln-green",
  error: "border-red-500/20 text-red-400",
  info: "border-kiln-blue/20 text-kiln-blue",
};

const progressColors = {
  success: "bg-kiln-green",
  error: "bg-red-500",
  info: "bg-kiln-blue",
};

const iconGlow = {
  success: "drop-shadow-[0_0_6px_hsl(142_71%_45%/0.4)]",
  error: "drop-shadow-[0_0_6px_hsl(0_72%_51%/0.4)]",
  info: "drop-shadow-[0_0_6px_hsl(217_91%_60%/0.4)]",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: ToastType = "success") => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      // Markiere als "removing" für die Exit-Animation
      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, removing: true } : t))
      );
      // Entferne nach der Animation
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 200);
    }, TOAST_DURATION);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, removing: true } : t))
    );
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 200);
  }, []);

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      {/* Toast Container */}
      <div className="fixed top-6 right-6 z-[100] flex flex-col gap-3">
        {toasts.map((t) => {
          const Icon = icons[t.type];
          return (
            <div
              key={t.id}
              className={cn(
                "relative flex items-center gap-3 rounded-xl border px-4 py-3 min-w-[300px] max-w-[420px]",
                "bg-card/90 backdrop-blur-md",
                "shadow-xl shadow-black/20",
                "transition-all duration-200 ease-out",
                t.removing
                  ? "animate-out fade-out slide-out-to-right-5 duration-200"
                  : "animate-in fade-in slide-in-from-top-2 duration-200",
                "overflow-hidden",
                styles[t.type]
              )}
            >
              <Icon className={cn("h-4 w-4 shrink-0", iconGlow[t.type])} />
              <span className="text-sm font-medium text-foreground/90 flex-1">
                {t.message}
              </span>
              <button
                onClick={() => removeToast(t.id)}
                className="shrink-0 rounded-md p-0.5 opacity-40 hover:opacity-100 hover:bg-muted/60 transition-all duration-150"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              {/* Fortschrittsbalken */}
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-muted/60">
                <div
                  className={cn(
                    "h-full rounded-full opacity-60",
                    progressColors[t.type]
                  )}
                  style={{
                    animation: `toast-progress ${TOAST_DURATION}ms linear forwards`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
