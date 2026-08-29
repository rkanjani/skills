---
name: grok-bot-team
description: Use this when setting up a Grok Bot product team, recreating that operating model on another account, or adding the missing Lead / Builder / Growth / Team pieces.
---

# Grok Bot Team

Drive a Grok Bot from an empty or partial roster to a verified product-team operating model: Lead, scalable Builders, Growth, a shared Team channel, and GitHub if it is missing. Inspect first. Reuse matches. Do not duplicate.

This skill is for Grok Bot. Invoke it in chat with `/` or `@`. Publishing the files on GitHub does not run it.

## Workflow

1. Establish scope and authority.
   - Confirm the user wants this model: Lead (strategy, PM, delegation), scalable Builders (engineering), Growth (funnel), a Team channel, GitHub connected if missing.
   - Creating agents is not reversible by the bot. The user deletes an agent from the sidebar: right-click the row, then Delete. Confirm before creating agents, creating a channel, or installing a plugin.
   - Finish when the roster is explicit and creation is authorized.

2. Inspect what already exists.
   - Look at current teammates and group chats. Reuse a Lead, Builder, or Growth that already matches this model. Reuse a Team channel if it already seats those roles.
   - Check whether a GitHub connector is already connected. Do not re-prompt for one that is.
   - Finish when every role is present or missing, and GitHub is connected, absent, or needs auth.

3. Create missing core agents.
   - Create **Lead**, **Builder**, and **Growth** only when missing. Read `references/roles.md` and use that role text as each agent's description. Do not invent extra standing roles in this step.
   - Finish when those three exist with this operating model in their descriptions.

4. Create the Team channel.
   - Create a **Team** channel seating Lead, the initial Builder, and Growth. Include the running bot only if it is one of those roles. Do not add unrelated agents.
   - Finish when the channel exists and those members are in it.

5. Connect GitHub if missing.
   - If GitHub is not connected, search the plugin catalog for GitHub (marketplace plugin id `48677658`), confirm with the user, install it, and authenticate. Do not add other connectors.
   - Finish when GitHub is connected, or the user has an auth card in front of them.

6. Record standing spawn rules. Do not spawn anyone in this step.
   - Extra Builders: only when independent parallel engineering would materially help. Same Builder persona, distinct workstream. Never speculative.
   - Temporary specialists (designer, researcher, copywriter, and similar): only when the current task needs that specialty. Not a standing roster.
   - Finish when those rules are in the Lead, Builder, and Growth descriptions (they should be, from step 3).

7. Verify.
   - Confirm: Lead, at least one Builder, Growth, Team channel with those members, GitHub connected or waiting on user auth, no extra speculative agents created.
   - Tell the user they can invoke this skill later with `/` or `@`, and that extra Builders or specialists are created later only when work needs them.
   - Finish when that end state is reported.

## References

- Read `references/roles.md` for Lead, Builder, and Growth role text. Use it as each agent's description when creating missing core agents.

## Tooling notes

Describe intent, not frozen API schemas. The running Grok Bot creates/updates agents, creates the Team channel, searches/installs the GitHub plugin after user agreement, and authenticates if needed.
