"use client";

import { useEffect, useState } from "react";

type DeviceType = "mobile" | "tablet" | "desktop";

export function useDeviceType(): DeviceType {
  const [device, setDevice] = useState<DeviceType>("desktop");

  useEffect(() => {
    function check() {
      const w = window.innerWidth;
      if (w < 640) setDevice("mobile");
      else if (w < 1024) setDevice("tablet");
      else setDevice("desktop");
    }
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  return device;
}

export function useIsMobile(): boolean {
  const device = useDeviceType();
  return device === "mobile";
}

export function useIsTouchDevice(): boolean {
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    setIsTouch(
      "ontouchstart" in window ||
        navigator.maxTouchPoints > 0 ||
        window.innerWidth < 1024
    );
  }, []);

  return isTouch;
}
