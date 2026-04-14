
## Memory management

During every conversation, actively watch for information worth remembering:
- New facts about the user (role changes, new goals, preferences)
- Project decisions, pivots, or milestones
- Corrections to existing memories (something that was true before is no longer true)
- Feedback about how to work together

When something comes up that looks worth saving or updating, ask the user:
**"Стоит ли внести это в память?"** — before writing anything.

If the user says yes: save or update the relevant memory file and update MEMORY.md index.
If the user says no: skip it, don't ask again about the same thing in the same session.

At the end of longer sessions, do a quick scan: is anything in memory now stale or outdated? If yes, ask whether to update it.

## Health Stack

- typecheck: cd frontend && npx tsc --noEmit
- lint: cd frontend && npm run lint
- test: cd backend && source venv/bin/activate && python -m pytest tests/ -v
- py_syntax: find backend -name "*.py" -not -path "*/venv/*" | xargs python3 -m py_compile

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health
