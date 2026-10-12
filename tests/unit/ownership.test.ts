import { describe, expect, it } from "vitest";
import { MemoryStore } from "@/lib/data/memory";
import { NotFoundError } from "@/lib/data/repository";
import { prepareCoffeeChat } from "@/lib/services/contacts";
import { generateDraft, markDraftSent } from "@/lib/services/drafts";
import { completeFollowUp, dismissFollowUp } from "@/lib/services/followups";
import { saveMeetingNotes } from "@/lib/services/meetings";
import { editQuestion } from "@/lib/services/scripts";
import { getContactView, getMeetingView } from "@/lib/services/views";
import { makeCtx, SARAH_LINKEDIN, SARAH_NOTES, USER_A, USER_B } from "../support/fixtures";

/**
 * Application-level ownership checks. Two users share one store; neither may
 * read or modify the other's records through ANY service, even with the IDs.
 * (The database enforces the same rules again via RLS — see tests/db.)
 */
describe("data ownership", () => {
  async function setup() {
    const store = new MemoryStore();
    const alice = makeCtx({ store, userId: USER_A });
    const bob = makeCtx({ store, userId: USER_B });
    const prep = await prepareCoffeeChat(alice, { full_name: "Sarah Mitchell", linkedin_profile_text: SARAH_LINKEDIN });
    const notes = await saveMeetingNotes(alice, prep.meetingId, { body: SARAH_NOTES });
    const { draft } = await generateDraft(alice, { contact_id: prep.contactId, kind: "thank_you", tone: "brief" });
    const q = (await getMeetingView(alice, prep.meetingId)).questions[0];
    return { store, alice, bob, prep, task: notes.createdFollowUps[0], draft, question: q };
  }

  it("hides another user's contacts, meetings and history", async () => {
    const { bob, prep } = await setup();
    expect(await bob.repo.listContacts()).toEqual([]);
    expect(await bob.repo.getContact(prep.contactId)).toBeNull();
    expect(await bob.repo.getMeeting(prep.meetingId)).toBeNull();
    expect(await bob.repo.listNotes(prep.meetingId)).toEqual([]);
    expect(await bob.repo.listInsights()).toEqual([]);
    await expect(getContactView(bob, prep.contactId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getMeetingView(bob, prep.meetingId)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("prevents writing into another user's records", async () => {
    const { bob, prep, task, draft, question, alice } = await setup();
    await expect(saveMeetingNotes(bob, prep.meetingId, { body: "injected" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(bob.repo.createMeeting({ contact_id: prep.contactId, title: "x", scheduled_at: null, duration_minutes: 30, medium: "zoom" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(completeFollowUp(bob, task.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(dismissFollowUp(bob, task.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(markDraftSent(bob, draft.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(editQuestion(bob, question.id, { question: "hacked", priority: 1, section: "closing" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(generateDraft(bob, { contact_id: prep.contactId, kind: "thank_you", tone: "brief" })).rejects.toBeInstanceOf(NotFoundError);
    expect(await bob.repo.deleteContact(prep.contactId)).toBe(false);
    expect(await bob.repo.updateContact(prep.contactId, { full_name: "hacked" })).toBeNull();

    // Alice's data is untouched.
    const view = await getMeetingView(alice, prep.meetingId);
    expect(view.notes).toHaveLength(1);
    expect((await alice.repo.getContact(prep.contactId))?.full_name).toBe("Sarah Mitchell");
    expect((await alice.repo.getDraft(draft.id))?.sent_at).toBeNull();
  });

  it("ignores attempts to change ownership fields through updates", async () => {
    const { alice, bob, prep } = await setup();
    await alice.repo.updateContact(prep.contactId, { user_id: USER_B } as never);
    expect(await bob.repo.getContact(prep.contactId)).toBeNull();
    expect(await alice.repo.getContact(prep.contactId)).not.toBeNull();
  });
});
