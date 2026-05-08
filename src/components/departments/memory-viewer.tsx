export function MemoryViewer({ memory }: { memory: unknown }) {
  return (
    <pre className="max-h-[620px] overflow-auto rounded-lg border border-border bg-black/30 p-4 text-xs leading-relaxed text-slate-200">
      {JSON.stringify(memory || {}, null, 2)}
    </pre>
  );
}
