// Edit this file to write office scenes (scripted dialogues).
// Speaker IDs must match cast.ts / agents.config.json IDs.

export interface DialogueLine {
  speaker: string;
  text: string;
}

export interface Scene {
  id: string;
  title: string;
  description: string;
  trigger: string;
  dialogue: DialogueLine[];
}

export const SCENES: Scene[] = [
  {
    id: 'incident',
    title: 'Incident in Production',
    description: 'A cron job failed silently overnight. The intern noticed first.',
    trigger: 'incident',
    dialogue: [
      { speaker: 'intern',     text: 'Um. Hi. The cron thing did not run. I have a sticky note.' },
      { speaker: 'ops',        text: "Which cron thing. We have fourteen cron things." },
      { speaker: 'intern',     text: "The important one. I wrote 'important one' on the sticky note." },
      { speaker: 'ops',        text: "Okay checking logs now. Give me two minutes." },
      { speaker: 'ceo',        text: 'Intern, pull the error logs. Ops, what does the output say?' },
      { speaker: 'ops',        text: "Exit code 1. Message is 'model rate limit exceeded.' Not the scheduler." },
      { speaker: 'analyst',    text: 'To clarify: the scheduler ran correctly. The model call hit a rate limit at 02:47 and produced no output.' },
      { speaker: 'intern',     text: "So the cron is fine?? I wrote 'cron broke' on seven sticky notes." },
      { speaker: 'qa',         text: "The job has no retry logic. It just fails silently. I filed this issue two months ago." },
      { speaker: 'engineer',   text: "I can add exponential backoff with a 3-retry cap. Should take about 40 minutes." },
      { speaker: 'qa',         text: "Make it configurable. Someone will want 5 retries next month." },
      { speaker: 'ceo',        text: "Engineer, implement it. QA, review it. Analyst, add this to the incident log." },
    ],
  },
  {
    id: 'standup',
    title: 'Morning Standup',
    description: 'Daily morning loop: intern opens the office, ops reviews overnight incidents, analyst posts digest.',
    trigger: 'standup',
    dialogue: [
      { speaker: 'intern',     text: "Good morning!! The lights are on. I turned them on. Coffee is also on." },
      { speaker: 'ops',        text: "Overnight incidents: one cron timeout, self-recovered. Nothing critical." },
      { speaker: 'analyst',    text: "Digest for today: API usage is 73% of weekly budget. No blockers reported." },
      { speaker: 'ceo',        text: "Good morning. Today: Researcher finishes the model comparison. Engineer wraps the retry PR. QA reviews." },
      { speaker: 'operator',   text: "Oh wait, can we also add a feature? I had an idea in the shower." },
      { speaker: 'ceo',        text: "Write it down. We'll triage it Friday." },
      { speaker: 'operator',   text: "What if it was Thursday." },
      { speaker: 'ceo',        text: "It won't be Thursday." },
      { speaker: 'intern',     text: "I wrote 'Thursday maybe' on a sticky note just in case." },
      { speaker: 'ops',        text: "Alright let's get to work." },
    ],
  },
  {
    id: 'overloaded',
    title: 'Researcher Is Overloaded',
    description: 'Three teams need research at the same time. Researcher is deep in a model comparison.',
    trigger: 'research',
    dialogue: [
      { speaker: 'researcher', text: "I am in the middle of something. The model comparison is not done." },
      { speaker: 'ceo',        text: "CTO needs a quick competitive landscape for the architecture call at 2." },
      { speaker: 'researcher', text: "Quick. CTO wants a quick competitive landscape. I have seven browser tabs open." },
      { speaker: 'cto',        text: "I only need the top-level inference efficiency comparison. 30 minutes." },
      { speaker: 'researcher', text: "It's never 30 minutes. Someone will ask a follow-up." },
      { speaker: 'engineer',   text: "I also had a research request queued. Model latency under load." },
      { speaker: 'intern',     text: "Also the operator asked about something. I can't find the sticky note." },
      { speaker: 'analyst',    text: "Prioritize: CTO first since it's time-boxed, then Engineer, then operator when Intern finds the note." },
      { speaker: 'ceo',        text: "Agreed. Researcher, CTO gets a hard 45 minutes. Timebox and ship rough findings." },
      { speaker: 'researcher', text: "Fine. But I'm noting this as an interruption and I want it counted." },
      { speaker: 'analyst',    text: "Already added to the log." },
    ],
  },
  {
    id: 'code_review',
    title: 'Engineer vs QA — Code Review',
    description: 'Engineer finished implementing a feature. QA is about to review it.',
    trigger: 'code',
    dialogue: [
      { speaker: 'engineer',   text: "PR is up. Retry logic with configurable backoff. I added tests." },
      { speaker: 'qa',         text: "Reading it now." },
      { speaker: 'qa',         text: "Why is `maxRetries` defaulting to 3?" },
      { speaker: 'engineer',   text: "The spec said 'a few retries.' 3 is a few." },
      { speaker: 'qa',         text: "I know it's configurable. I'm asking why the default is 3." },
      { speaker: 'engineer',   text: "Because 3 is reasonable for transient API errors." },
      { speaker: 'qa',         text: "Agreed. Comment it in the code." },
      { speaker: 'engineer',   text: "...okay." },
      { speaker: 'qa',         text: "The tests are good actually. Edge cases for max-retries and partial backoff are solid." },
      { speaker: 'engineer',   text: "Thank you." },
      { speaker: 'qa',         text: "Don't thank me yet. The jitter implementation is deterministic. Add real randomization." },
      { speaker: 'engineer',   text: "That's fair. Fixing now." },
      { speaker: 'cto',        text: "From the architecture side: this is a correct approach. Ship it after the jitter fix." },
      { speaker: 'ceo',        text: "Tag me when it's ready to merge." },
    ],
  },
  {
    id: 'budget_meeting',
    title: 'Budget Meeting',
    description: 'API costs spiked this week. CEO wants to know where the tokens went.',
    trigger: 'budget',
    dialogue: [
      { speaker: 'ceo',        text: "Token usage is 4x this week. I need to know what happened." },
      { speaker: 'analyst',    text: "Breakdown: Engineer 18%, QA 12%, Researcher 61%, others 9%." },
      { speaker: 'ceo',        text: "Researcher. Sixty-one percent." },
      { speaker: 'researcher', text: "I ran a deep research pass on model efficiency benchmarks. It was thorough." },
      { speaker: 'ceo',        text: "Thorough how." },
      { speaker: 'researcher', text: "I checked 14 primary sources, ran 6 synthesis passes, and generated an 8,000-token summary." },
      { speaker: 'qa',         text: "Did anyone ask for an 8,000-token summary." },
      { speaker: 'researcher', text: "Quality requires depth." },
      { speaker: 'ops',        text: "Researcher, we have a weekly budget. It's not a suggestion." },
      { speaker: 'ceo',        text: "Going forward: Researcher has a 50K token cap per task. More needs my sign-off." },
      { speaker: 'researcher', text: "50K tokens is barely a warm-up pass." },
      { speaker: 'ceo',        text: "Then warm up efficiently." },
      { speaker: 'intern',     text: "I used like twelve tokens this week. Just so everyone knows." },
    ],
  },
  {
    id: 'new_ticket',
    title: 'New Ticket Drops',
    description: "The operator has a new idea. It is vague. It is urgent. It affects everyone.",
    trigger: 'ticket',
    dialogue: [
      { speaker: 'operator',   text: "Okay I filed a ticket. It's called 'make it smarter.' Priority: urgent." },
      { speaker: 'ceo',        text: "Make what smarter." },
      { speaker: 'operator',   text: "The whole thing. All of it. Smarter." },
      { speaker: 'intern',     text: "I put it in the queue. It's at the top. I didn't know where else to put it." },
      { speaker: 'cto',        text: "I can work with this. What outcome would tell you it succeeded?" },
      { speaker: 'operator',   text: "You know. When you use it and you go — yeah, that's smart." },
      { speaker: 'qa',         text: "That's not an acceptance criterion." },
      { speaker: 'cto',        text: "It could be. Are we talking about output quality, decision speed, or context retention?" },
      { speaker: 'operator',   text: "Yes. All three. And maybe something with the routing." },
      { speaker: 'engineer',   text: "If we're touching routing, I need at least a day to scope it." },
      { speaker: 'ceo',        text: "Can you join a 20-minute call with CTO to spec this before we touch any code?" },
      { speaker: 'operator',   text: "Sure. Can we do it now?" },
      { speaker: 'cto',        text: "I will clear my afternoon. This shapes the next three sprints." },
      { speaker: 'analyst',    text: "I'll take notes." },
      { speaker: 'intern',     text: "I put 'smarter' on a sticky note. And then a question mark. And then two more." },
    ],
  },
];

export const SCENES_BY_ID: Record<string, Scene> = Object.fromEntries(
  SCENES.map((s) => [s.id, s])
);
