import {
  createElement,
  useEffect,
  useRef,
  useState,
  type ElementType,
  type KeyboardEvent,
} from "react";

type InlineEditableProps = {
  value: string;
  onCommit: (nextValue: string) => void;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  as?: ElementType;
};

export function InlineEditable({
  value,
  onCommit,
  className,
  inputClassName,
  placeholder,
  as = "span",
}: InlineEditableProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editing) {
      setDraft(value);
    }
  }, [value, editing]);

  useEffect(() => {
    if (!editing) return;
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, [editing]);

  function commit() {
    const nextValue = draft.trim();
    if (!nextValue) {
      setDraft(value);
      setEditing(false);
      return;
    }
    if (nextValue !== value) {
      onCommit(nextValue);
    }
    setEditing(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setDraft(value);
      setEditing(false);
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        className={inputClassName ?? className}
        value={draft}
        maxLength={64}
        placeholder={placeholder}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
      />
    );
  }

  return createElement(
    as,
    {
      className,
      role: "button",
      tabIndex: 0,
      onClick: () => setEditing(true),
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setEditing(true);
        }
      },
    },
    value || placeholder || "点击编辑"
  );
}
