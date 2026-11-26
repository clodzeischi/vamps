// The one close button: an ✕ in the top right corner, as in the battle's inventory.
export function CloseX({ onClick, tip = "Close (Esc)" }: { onClick: () => void; tip?: string }) {
  return (
    <button className="mini close-x" onClick={onClick} data-tip={tip} aria-label="Close">
      ✕
    </button>
  );
}
