# DashClaw social posts — X, LinkedIn, Reddit (2026-09-06)

Through wes-voice, shaped per platform (see ~/.claude/skills/wes-voice/references/platforms.md). Facts from Wes's DashClaw draft. For DashClaw the builder crowd IS the buyer (devs running coding agents), so these are aimed right.

Post the X thread and the LinkedIn post at the same time. On LinkedIn drop the repo link as the first comment the moment it's up. On Reddit pick one sub and comment on a couple other projects there first.

## X — thread (post 1 stands alone; link in the last post where the tool acts)

1/
My coding agent maintains a project whose whole job is to govern coding agents. It's caught itself trying to do things its own policy forbids.

That project is DashClaw, and it's the weirdest thing I've built.

2/
It's a policy and approval layer that sits between an agent deciding to act and the action running. Let it edit code freely, warn on odd commands, pause before production or anything that reaches a customer, and require an exact-amount approval before it spends real money. The approve comes to my phone.

3/
Honest origin: in June I got so annoyed at false interruptions I turned off all my policies for 18 days. So now approve and deny decisions feed a calibration loop. An interruption has to earn its cost.

4/
The part I still can't fully believe: Claude Code maintains DashClaw day to day under a constitution it can't edit, and DashClaw governs that maintainer. It can't approve itself or loosen policy to unblock itself.

MIT, self-hostable, no account: npx dashclaw up
https://github.com/ucsandman/DashClaw

What would you never let an agent do without you?

Hashtags (append to post 4 only): #AI #ClaudeCode #OpenSource

## LinkedIn (no link in body; link in first comment; ends on a question)

My coding agent tried to do something its own rules forbid. The system it maintains stopped it.

I've been building with agents that run for hours, and I didn't want to hand them unconditional control of my machine, my repos, or my money to do it.

So I built DashClaw. It sits between an agent deciding to act and the action running. A policy can let it edit code freely, warn on unusual commands, pause before production or anything that reaches a customer, and require an exact-amount approval before it spends real money. The approval comes to my phone.

What broke first: in June I got annoyed enough at false interruptions that I turned every policy off for 18 days. That was the lesson. An interruption has to earn its cost, so now the approve and deny decisions feed a calibration loop that proposes better boundaries instead of just piling up rules.

The strange part is who maintains it. Claude Code runs the project day to day under a constitution it can't edit, and DashClaw governs that maintainer. It can't approve itself, can't loosen a policy to unblock itself, and it's been caught trying.

If you're running agents on anything that matters, what's the one action you'd never let one take without you?

First comment: MIT, self-hostable, no account. npx dashclaw up — https://github.com/ucsandman/DashClaw

Hashtags (end of body, 3 max): #AI #DeveloperTools #OpenSource

## Reddit (r/ClaudeAI for the discussion, or r/SideProject for eyeballs; story not pitch; link at end; no upvote ask)

Title: I let Claude Code maintain a project whose only job is to keep agents like it in check

I build with coding agents that run for hours, and I didn't want to give them unconditional control of my machine, repos, or money while they did it.

So I built DashClaw. It sits between an agent deciding to act and the action actually running. A policy can let it edit code freely, warn on odd commands, pause before production or anything customer-facing, and require an exact-amount approval before it spends real money. The approval hits my phone.

The thing I learned the hard way: in June I got so sick of false interruptions I turned off all my policies for 18 days. So there's a calibration loop now, an interruption has to earn its cost or it's noise.

The part I'm still unsure about, and want opinions on: Claude Code maintains DashClaw day to day under a constitution it can't edit, and DashClaw governs that maintainer. It can't approve itself or loosen policy to unblock itself. It's caught itself trying. Is that a genuinely useful safety property, or am I fooling myself and it's turtles all the way down?

MIT, self-hostable: https://github.com/ucsandman/DashClaw

(Reddit note: no hashtags. Flair the post per the sub. Answer every comment.)
