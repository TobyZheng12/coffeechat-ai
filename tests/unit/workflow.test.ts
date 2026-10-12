import { describe, expect, it } from "vitest";
import { prepareCoffeeChat } from "@/lib/services/contacts";
import { generateDraft, markDraftSent, saveDraftEdits } from "@/lib/services/drafts";
import { completeFollowUp, snoozeFollowUp } from "@/lib/services/followups";
import { saveMeetingNotes } from "@/lib/services/meetings";
import { saveProfile } from "@/lib/services/profile";
import { editQuestion, generateScript, setQuestionAsked } from "@/lib/services/scripts";
import { getContactView, getDashboard, getFollowUpBoard, getMeetingView } from "@/lib/services/views";
import { makeCtx, SARAH_EMAIL, SARAH_LINKEDIN, SARAH_NOTES, STUDENT_PROFILE } from "../support/fixtures";

/**
 * The complete core workflow, end to end, against the in-memory repository
 * and the offline AI:
 *   create contact → add profile → generate script → complete meeting →
 *   save notes → generate email → schedule follow-up → view contact history
 */
describe("core coffee chat workflow", () => {
  it("runs from contact creation to relationship history", async () => {
    const ctx = makeCtx();
    await saveProfile(ctx, STUDENT_PROFILE);

    // 1. Create contact + paste LinkedIn profile + email thread → AI prepares everything.
    const prep = await prepareCoffeeChat(ctx, {
      full_name: "Sarah Mitchell",
      linkedin_url: "https://www.linkedin.com/in/sarah-example",
      how_connected: "Westbrook alumni network on LinkedIn",
      linkedin_profile_text: SARAH_LINKEDIN,
      email_thread_text: SARAH_EMAIL,
      scheduled_at: "2026-10-22T16:00:00Z",
      duration_minutes: 30,
    });
    expect(prep.aiError).toBeNull();

    // 2. Contact analysis fills editable fields from the profile.
    const contactView = await getContactView(ctx, prep.contactId);
    expect(contactView.contact.current_company).toBe("Northwind Consulting");
    expect(contactView.contact.current_position).toBe("Senior Consultant");
    expect(contactView.experiences.map((e) => e.organization)).toEqual(
      expect.arrayContaining(["Northwind Consulting", "Granite Machinery", "Westbrook University"]),
    );
    expect(contactView.contact.analysis?.connections_to_me.length).toBeGreaterThan(0);

    // 3. A personalized script exists, with evidence grounded in the pasted profile.
    let meeting = await getMeetingView(ctx, prep.meetingId);
    expect(meeting.meeting.script?.objectives).toHaveLength(3);
    expect(meeting.meeting.script?.self_intro).toContain("Jordan");
    const main = meeting.questions.filter((q) => !q.is_alternate);
    expect(main.length).toBeGreaterThanOrEqual(5);
    expect(main.some((q) => q.question.includes("Granite Machinery"))).toBe(true);
    for (const q of meeting.questions) {
      for (const e of q.evidence) expect(SARAH_LINKEDIN + SARAH_EMAIL).toContain(e.quote.split(" ")[0]);
    }

    // 4. Editing a question survives regeneration.
    const edited = await editQuestion(ctx, main[0].id, {
      question: "My own question about her first year?",
      priority: 1,
      section: "career_journey",
    });
    await generateScript(ctx, prep.meetingId);
    meeting = await getMeetingView(ctx, prep.meetingId);
    expect(meeting.questions.find((q) => q.id === edited.id)?.question).toBe("My own question about her first year?");

    // 5. During the call: check questions off.
    await setQuestionAsked(ctx, edited.id, true);

    // 6. After the call: save rough notes → structured summary + follow-ups.
    const result = await saveMeetingNotes(ctx, prep.meetingId, { body: SARAH_NOTES });
    expect(result.summary?.advice.map((a) => a.advice).join(" ")).toMatch(/communication is important/i);
    expect(result.summary?.reconnect_signals[0]?.timeframe).toBe("after_mission");
    expect(result.summary?.relationship_insights.join(" ")).toMatch(/Westbrook/);

    meeting = await getMeetingView(ctx, prep.meetingId);
    expect(meeting.meeting.status).toBe("completed");

    const kinds = result.createdFollowUps.map((t) => t.kind).sort();
    expect(kinds).toEqual(["post_mission_reconnect", "pre_mission_update", "resource_followup", "thank_you"]);
    const thankYou = result.createdFollowUps.find((t) => t.kind === "thank_you")!;
    expect(thankYou.due_date).toBe("2026-10-23"); // within 24 hours of the Oct 22 call
    const postMission = result.createdFollowUps.find((t) => t.kind === "post_mission_reconnect")!;
    expect(postMission.due_date).toBeNull(); // mission end date unknown → never assumed
    expect(postMission.timing_note).toMatch(/return date/i);

    // 7. Generate a thank-you email from the notes (never auto-sent).
    const { draft } = await generateDraft(ctx, {
      contact_id: prep.contactId,
      meeting_id: prep.meetingId,
      kind: "thank_you",
      tone: "friendly",
    });
    expect(draft.sent_at).toBeNull();
    expect(draft.body).toMatch(/communication is important/i);
    expect(draft.body).toContain("Jordan");
    await saveDraftEdits(ctx, draft.id, { subject: "Thank you, Sarah", body: `${draft.body}\nP.S. edited` });

    // 8. Explicit "Mark as sent" → interaction logged + thank-you task completed.
    const sent = await markDraftSent(ctx, draft.id);
    expect(sent.sent_at).not.toBeNull();
    const board = await getFollowUpBoard(ctx);
    expect(board.buckets.completed.map((t) => t.kind)).toContain("thank_you");

    // 9. Manage a follow-up.
    const resource = result.createdFollowUps.find((t) => t.kind === "resource_followup")!;
    const snoozed = await snoozeFollowUp(ctx, resource.id, 7);
    expect(snoozed.status).toBe("snoozed");
    expect(snoozed.due_date! > resource.due_date!).toBe(true);
    await completeFollowUp(ctx, resource.id);

    // 10. Months later: the contact's history tells the whole story.
    const history = await getContactView(ctx, prep.contactId);
    const pastKinds = history.timeline.filter((e) => !e.future).map((e) => e.kind);
    expect(pastKinds).toEqual(
      expect.arrayContaining(["contact_created", "meeting_scheduled", "meeting_completed", "message_sent", "follow_up_completed"]),
    );
    expect(history.summaries).toHaveLength(1);
    expect(history.insights.length).toBeGreaterThanOrEqual(2);
    expect(history.drafts[0].subject).toBe("Thank you, Sarah");

    const dash = await getDashboard(ctx);
    expect(dash.recent[0].contact.full_name).toBe("Sarah Mitchell");
    expect(dash.progress.thankYousSent).toBe(1);
    expect(dash.progress.daysUntilMission).toBe(69);
  });

  it("never overwrites earlier notes when more notes or meetings are added", async () => {
    const ctx = makeCtx();
    await saveProfile(ctx, STUDENT_PROFILE);
    const prep = await prepareCoffeeChat(ctx, { full_name: "Sarah Mitchell", linkedin_profile_text: SARAH_LINKEDIN });
    await saveMeetingNotes(ctx, prep.meetingId, { body: "First notes. Said networking is important." });
    await saveMeetingNotes(ctx, prep.meetingId, { body: "Second notes. Recommended practicing case interviews." });
    const view = await getMeetingView(ctx, prep.meetingId);
    expect(view.notes.map((n) => n.body)).toEqual([
      "First notes. Said networking is important.",
      "Second notes. Recommended practicing case interviews.",
    ]);
    expect(view.summaryVersions).toBe(2);
    // The engine doesn't create duplicate thank-you tasks for the same meeting.
    expect(view.tasks.filter((t) => t.kind === "thank_you")).toHaveLength(1);
  });

  it("keeps saved data when AI generation fails", async () => {
    const failing = {
      label: "Failing",
      offline: false,
      run: async () => {
        const { AIError } = await import("@/lib/ai/provider");
        throw new AIError("unavailable", "The AI service is temporarily unavailable. Please try again.");
      },
    };
    const ctx = makeCtx({ ai: failing });
    const prep = await prepareCoffeeChat(ctx, { full_name: "Sarah Mitchell", linkedin_profile_text: SARAH_LINKEDIN });
    expect(prep.aiError).toMatch(/temporarily unavailable/);
    const contact = await ctx.repo.getContact(prep.contactId);
    expect(contact?.linkedin_profile_text).toBe(SARAH_LINKEDIN);
  });
});
