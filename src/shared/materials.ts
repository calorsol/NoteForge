export function deriveMaterialTitle(content: string) {
  return content.replace(/\s+/g, " ").trim().slice(0, 8);
}

export function resolveMaterialTitle({
  currentTitle,
  nextTitle,
  nextContent,
}: {
  currentTitle: string;
  nextTitle?: string;
  nextContent?: string;
}) {
  if (nextTitle !== undefined) {
    const trimmedTitle = nextTitle.trim();
    if (trimmedTitle) {
      return { ok: true as const, title: trimmedTitle };
    }

    const derivedTitle = deriveMaterialTitle(nextContent ?? "");
    if (derivedTitle) {
      return { ok: true as const, title: derivedTitle };
    }

    return { ok: false as const, error: "标题和正文不能同时为空" };
  }

  if (nextContent === undefined) {
    return { ok: true as const, title: currentTitle };
  }

  const trimmedCurrent = currentTitle.trim();
  if (trimmedCurrent) {
    return { ok: true as const, title: trimmedCurrent };
  }

  const derivedTitle = deriveMaterialTitle(nextContent);
  if (derivedTitle) {
    return { ok: true as const, title: derivedTitle };
  }

  return { ok: false as const, error: "标题和正文不能同时为空" };
}
