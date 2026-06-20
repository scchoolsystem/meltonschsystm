import React from "react";

export function StudentWizard({
  existing,
  onDone,
}: {
  existing?: any;
  onDone?: () => void;
}) {
  return (
    <div className="p-4 max-w-2xl">
      <h2 className="text-lg font-semibold">Edit student</h2>
      <p className="text-sm text-muted-foreground">This is a lightweight placeholder for the StudentWizard component. Replace with the full implementation as needed.</p>
      <div className="mt-4">
        <button
          type="button"
          className="px-3 py-1 rounded bg-primary text-white"
          onClick={() => onDone?.()}
        >
          Done
        </button>
      </div>
    </div>
  );
}
