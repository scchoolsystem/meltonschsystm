import React from "react";

type Props = {
  existing?: any;
  onDone?: () => void;
};

export function StudentWizard({ existing, onDone }: Props) {
  return (
    <div className="p-4 max-w-xl">
      <h2 className="text-lg font-bold">Edit student</h2>
      <p className="text-sm text-muted-foreground">{existing ? `${existing.first_name} ${existing.last_name}` : "New student"}</p>

      <div className="mt-4 space-y-2">
        <div>
          <label className="text-xs text-muted-foreground">First name</label>
          <div className="mt-1">
            <input defaultValue={existing?.first_name ?? ""} className="w-full input" />
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Last name</label>
          <div className="mt-1">
            <input defaultValue={existing?.last_name ?? ""} className="w-full input" />
          </div>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          onClick={() => onDone?.()}
          className="inline-flex items-center px-3 py-1 rounded bg-blue-600 text-white"
        >
          Save
        </button>
        <button
          onClick={() => onDone?.()}
          className="inline-flex items-center px-3 py-1 rounded border"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default StudentWizard;
