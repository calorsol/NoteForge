import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api } from "../api";
import { isCsdnSkin, loadSkin, saveSkin, type StealthSkin } from "../appearance";
import { useAuth } from "../auth/AuthContext";

const DEFAULT_CONFIG = {
  "disguise.wiki_brand": "内部文档中心",
  "disguise.csdn_title": "技术笔记",
  "disguise.csdn_brand": "技术博客_CSDN",
} as const;

type ConfigKey = keyof typeof DEFAULT_CONFIG;
type DisguiseConfig = Record<string, string>;

type DisguiseState = {
  skin: StealthSkin;
  setSkin: (skin: StealthSkin) => void;
  config: DisguiseConfig;
  getConfig: (key: ConfigKey) => string;
  updateConfig: (key: ConfigKey, value: string) => void;
};

const DisguiseContext = createContext<DisguiseState | null>(null);

function resolveDocumentTitle(skin: StealthSkin, config: DisguiseConfig) {
  if (skin === "wiki") {
    return config["disguise.wiki_brand"] ?? DEFAULT_CONFIG["disguise.wiki_brand"];
  }
  if (isCsdnSkin(skin)) {
    return `${config["disguise.csdn_title"] ?? DEFAULT_CONFIG["disguise.csdn_title"]}_CSDN博客`;
  }
  return "NoteForge";
}

export function DisguiseProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [skin, setSkinState] = useState<StealthSkin>(loadSkin);
  const [config, setConfig] = useState<DisguiseConfig>(DEFAULT_CONFIG);
  const debounceTimers = useRef<Partial<Record<ConfigKey, number>>>({});

  useEffect(() => {
    if (!user) {
      setConfig(DEFAULT_CONFIG);
      return;
    }

    let alive = true;
    api<{ config: Record<string, string> }>("/config")
      .then((data) => {
        if (!alive) return;
        setConfig((current) => ({
          ...current,
          ...data.config,
        }));
      })
      .catch(() => {});

    return () => {
      alive = false;
    };
  }, [user]);

  useEffect(() => {
    if (skin === "off") {
      delete document.documentElement.dataset.stealthSkin;
    } else {
      document.documentElement.dataset.stealthSkin = skin;
    }
    document.title = resolveDocumentTitle(skin, config);

    return () => {
      delete document.documentElement.dataset.stealthSkin;
      document.title = "NoteForge";
    };
  }, [skin, config]);

  useEffect(() => {
    return () => {
      for (const timer of Object.values(debounceTimers.current)) {
        if (timer) {
          window.clearTimeout(timer);
        }
      }
    };
  }, []);

  const setSkin = useCallback((nextSkin: StealthSkin) => {
    setSkinState(nextSkin);
    saveSkin(nextSkin);
  }, []);

  const updateConfig = useCallback((key: ConfigKey, value: string) => {
    const nextValue = value.trim().slice(0, 64);
    if (!nextValue) return;

    setConfig((current) => ({
      ...current,
      [key]: nextValue,
    }));

    const previousTimer = debounceTimers.current[key];
    if (previousTimer) {
      window.clearTimeout(previousTimer);
    }

    debounceTimers.current[key] = window.setTimeout(() => {
      void api<{ key: string; value: string }>(`/config/${encodeURIComponent(key)}`, {
        method: "PUT",
        body: { value: nextValue },
      }).catch(() => {});
    }, 400);
  }, []);

  const value = useMemo<DisguiseState>(
    () => ({
      skin,
      setSkin,
      config,
      getConfig: (key) => config[key] ?? DEFAULT_CONFIG[key],
      updateConfig,
    }),
    [skin, config, setSkin, updateConfig]
  );

  return <DisguiseContext.Provider value={value}>{children}</DisguiseContext.Provider>;
}

export function useDisguise() {
  const context = useContext(DisguiseContext);
  if (!context) {
    throw new Error("useDisguise 必须在 DisguiseProvider 内使用");
  }
  return context;
}
