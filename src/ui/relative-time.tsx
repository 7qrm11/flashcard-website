"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/ui/i18n";

function formatRelative(msAgo: number, t: (key: string, vars?: Record<string, string | number>) => string) {
  if (msAgo < 15_000) {
    return t("relative.just_now");
  }

  const seconds = Math.round(msAgo / 1000);
  if (seconds < 60) {
    return t("relative.seconds_ago", { count: seconds });
  }

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return t("relative.minutes_ago", { count: minutes });
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return t("relative.hours_ago", { count: hours });
  }

  const days = Math.round(hours / 24);
  return t("relative.days_ago", { count: days });
}

export default function RelativeTime({
  isoDate,
}: Readonly<{
  isoDate: string;
}>) {
  const { t } = useI18n();
  const date = useMemo(() => new Date(isoDate), [isoDate]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }

  const msAgo = Math.max(0, now - date.getTime());
  return formatRelative(msAgo, t);
}
