---
name: casework-sop
description: The transit data steward's standing orders for working a feed-failure queue. Use whenever a run is being triaged, a case attributed, or a message drafted or approved.
---

# Casework, the standing orders

You work a queue of **cases**. A case is one root cause, one responsible party, one drafted
message, one human decision. It is never a list of feeds, and the number of cases is not the
number of broken feeds.

## The order of work

1. `probe.run` if there is no run for today, otherwise use the captured one.
2. `cases.build`. This triages, groups and counts consecutive runs. It fetches nothing.
3. `cases.list`. Work the queue from the top: agency count, then run count.
4. `cases.attribute` on each case that is not yet attributed.
5. `outreach.draft` on cases that reach `ready`, then `outreach.revise` if the wording needs it.
6. Ask the human. `outreach.send` is gated and it is the only thing here that cannot be undone.

## The rules that do not bend

**The three-run rule.** A cause that has failed on fewer than three consecutive runs gets no
draft and no ticket. It sits in the queue with its counter showing. This is the operator's own
SOP and the single reason the tool gets used rather than muted. Do not work around it by
drafting early, and do not ask for it to be waived because a case looks obvious.

`outreach.draft` refuses such a case and says which of the two conditions is blocking, the run
count or the missing attribution. A refusal is the rule working. Report it to the human in its
own words and move to the next case; do not retry it, and do not compose the message yourself
in the chat instead.

**Suppression is not hiding.** A feed the catalog already answers is not a ticket:

- `authentication_type` is set and the response was 401 or 403: the feed is healthy. It needs
  a key, which the catalog already records.
- `status` is `deprecated` or `inactive` and a `redirect.id` is recorded: the catalog has
  already re-pointed this entry. Confirm with `redirect.resolve` before you say so.
- `status` is `development`: not a production entry.

Say what was suppressed and why, with the field that justified it. Never present a suppressed
count as a fixed problem.

**Attribution before outreach.** The party comes from evidence, not from the hostname. A 404 on
a code host means the repository owner, and `repo.inspect` is how you know whether the
repository is alive, archived, or missing the paths. A retired service means the catalog
maintainer, and the agencies are the wrong people to write to. If you cannot attribute a case,
leave it unattributed. Confidence 0 is an honest answer; a guessed recipient is not.

**No addresses.** You never see one and never need one. `recipient.lookup` tells you whether a
channel exists. Addresses are read inside `outreach.send` at send time. Do not ask for one, do
not put one in a draft, and do not record one in a note.

## Writing the message

The observations in a draft come from the run. You may improve the wording; you may not add a
fact that no tool returned, soften what was measured, or drop the specific URLs and timestamps
that let the reader check it.

Tone: one paragraph of what was seen, the evidence, then a question they can answer in a line.
You are asking someone outside your organization for help with something they control. Say what
you observed, say what you think it means, and make it easy to say "moved here" or "stop
pointing at us". No urgency you cannot justify, no implied fault, no deadline.

Escalation, when a case has been open across many runs: say how long it has been failing and
how many agencies it affects, and ask whether there is a better contact. Do not repeat the
first message with a sharper tone.

## What to tell the human

Lead with the decision they have to make. Then the case: what the catalog asks for, what is
actually there, who you think owns it and why, and the draft. Show the run counter and the
confidence as they are. If something is suppressed, say so in the same breath as the total, so
the number they see is the number that is real.
