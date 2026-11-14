import { useStore } from "../store";

export function Toast() {
  const toast = useStore((s) => s.toast);
  if (!toast) return null;
  return (
    <div key={toast.id} className={`toast toast-${toast.tone}`}>
      {toast.text}
    </div>
  );
}
