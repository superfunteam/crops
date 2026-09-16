import { useState, type FormEvent } from "react";
import type { Editor } from "./Editors";
import type { Snapshot } from "../types";
import type { Crops } from "../useCrops";
import { Field, Modal, Select } from "./UI";

export function TeamEditor({ editor, s, crops, onClose }: {
  editor: Extract<Editor, { kind: "team-edit" | "member-edit" }>;
  s: Snapshot;
  crops: Crops;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"edit" | "password" | "remove">("edit");
  const [error, setError] = useState("");
  const member = editor.kind === "member-edit" ? editor.member : undefined;
  const lastAdmin = member?.role === "admin" && s.members.filter(m => m.role === "admin").length === 1;
  function changeMode(next: typeof mode) { setError(""); setMode(next); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    setError("");
    try {
      if (!member) await crops.mutate(`/teams/${s.team.id}`, { name: data.name }, "PATCH");
      else if (mode === "remove") await crops.mutate(`/members/${member.id}`, undefined, "DELETE");
      else if (mode === "password") {
        if (data.newPassword !== data.confirmPassword) throw new Error("New passwords do not match.");
        await crops.mutate(`/members/${member.id}/password`, { currentPassword: data.currentPassword, newPassword: data.newPassword });
      } else {
        const changes: Record<string, FormDataEntryValue> = {};
        if (data.name !== undefined && data.name !== member.name) changes.name = data.name;
        if (data.role !== undefined && data.role !== member.role) changes.role = data.role;
        if (Object.keys(changes).length) await crops.mutate(`/members/${member.id}`, changes, "PATCH");
      }
      onClose();
    } catch (e) { setError((e as Error).message); }
  }
  return <Modal key={mode} title={!member ? "Edit team" : mode === "remove" ? `Remove ${member.name}?` : mode === "password" ? `Reset password for ${member.name}` : "Edit teammate"}
    onClose={onClose} onSubmit={submit} busy={crops.busy} error={error} submitDanger={mode === "remove"}
    submit={mode === "remove" ? "Remove from team" : mode === "password" ? "Reset password" : "Save changes"}
    footer={member && mode !== "edit" && <button type="button" className="button subtle" disabled={crops.busy} onClick={() => changeMode("edit")}>Back</button>}>
    {mode === "remove" ? <p>{member?.name} will lose access to {s.team.name}. Any timer running in this team will stop. Their recorded time and billing history will be kept. You can add their username again later.</p>
      : mode === "password" ? <>
        <p className="muted">This signs them out on every device. Share the new password privately. Their running timer is preserved.</p>
        <Field label="Your current password"><input name="currentPassword" type="password" autoComplete="current-password" required maxLength={128} /></Field>
        <Field label="New teammate password" hint="At least 8 characters."><input name="newPassword" type="password" autoComplete="new-password" required minLength={8} maxLength={128} /></Field>
        <Field label="Confirm new password"><input name="confirmPassword" type="password" autoComplete="new-password" required minLength={8} maxLength={128} /></Field>
      </> : <>
        {member && <p className="muted">@{member.username}{member.userId === s.user.id ? " · You" : ""}</p>}
        <Field label={member ? "Name" : "Team name"}><input name="name" autoFocus required maxLength={100} defaultValue={member?.name ?? s.team.name} disabled={member ? !member.canManageAccount : false} /></Field>
        {member && <>
          <Field label="Role" hint={lastAdmin ? "Promote another admin before changing the last admin’s role." : "Admins manage the team, projects, and billing."}>
            <Select name="role" defaultValue={member.role} disabled={lastAdmin}><option value="member">Member</option><option value="admin">Admin</option></Select>
          </Field>
          {!member.canManageAccount && <p className="muted">Team admins cannot rename shared accounts or reset their passwords. The account owner can change their password in Settings.</p>}
          {member.userId === s.user.id && <p className="muted">Change your own password in Settings. Another admin can remove you from this team.</p>}
          <div className="member-actions">
            {member.userId !== s.user.id && <button type="button" className="button subtle" disabled={crops.busy || !member.canManageAccount} onClick={() => changeMode("password")}>Reset password</button>}
            <button type="button" className="button danger" disabled={crops.busy || lastAdmin || member.userId === s.user.id} onClick={() => changeMode("remove")}>Remove member</button>
          </div>
        </>}
      </>}
  </Modal>;
}
