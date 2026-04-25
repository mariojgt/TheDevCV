// Comma-separated text input that emits a clean string[] to the parent.
//
// Without this, the naive controlled pattern
//   value={arr.join(', ')} onChange={split-trim-filter}
// drops the trailing partial entry while the user is mid-typing — so a comma
// followed by space (the natural separator) gets eaten before they can type
// the next word, making the input feel broken.
//
// We keep the raw string in local state and only emit the parsed array when
// it actually changes shape, so the user can freely type "React,  Type" and
// see exactly what they typed.

import { useEffect, useRef, useState } from 'react';

export default function TagsInput({
  value,
  onChange,
  placeholder,
  className = '',
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  className?: string;
}) {
  const [raw, setRaw] = useState(() => value.join(', '));
  // Tracks the last canonical-joined string the parent has — used to spot
  // external value changes without snapping the user's in-flight typing.
  const lastEmittedRef = useRef<string>(value.join(', '));

  useEffect(() => {
    const incoming = value.join(', ');
    if (incoming === lastEmittedRef.current) return;
    lastEmittedRef.current = incoming;
    setRaw(incoming);
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setRaw(next);
    const parsed = next.split(',').map((t) => t.trim()).filter(Boolean);
    const parsedKey = parsed.join(', ');
    if (parsedKey === lastEmittedRef.current) return;
    lastEmittedRef.current = parsedKey;
    onChange(parsed);
  };

  const handleBlur = () => {
    // Tidy stray whitespace / trailing commas on blur so the saved field
    // looks canonical without disrupting typing.
    if (raw !== lastEmittedRef.current) setRaw(lastEmittedRef.current);
  };

  return (
    <input
      type="text"
      value={raw}
      onChange={handleChange}
      onBlur={handleBlur}
      placeholder={placeholder}
      className={className}
    />
  );
}
