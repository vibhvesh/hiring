# Hiring

A five-minute AI voice screen for IT candidates that runs entirely in the browser. No server, no accounts, no paid services.

**Live:** https://vibhvesh.github.io/hiring/

## How it works

1. **Recruiter:** pick an Interview Profile, choose how many links (default 5), press **Create links**, and copy them (one by one or **Copy all**).
2. **Candidate:** opens a link on any phone or laptop, taps **Start interview** (this lets the browser use the mic and camera), and talks to the AI recruiter. They can type if the mic doesn't work.
3. The interview starts with "Tell me about yourself…". The AI reads back what it heard (years, role, technologies), accepts corrections, asks for anything missing, then asks the profile's mandatory questions and technical questions matched to the candidate's stack, seniority and the profile's difficulty. Max 5 minutes.
4. At the end the candidate downloads a **results zip** (score, recommendation, transcript, PDF report, video) and sends it to the recruiter, who presses **Import results** to see it in the Candidates list.

## Interview profiles

Each profile has a role name, required technologies, at least 4 mandatory questions, and a difficulty (Easy / Medium / Hard / Tough), which sets question depth, how hard follow-ups push, and how strict scoring is. Four examples are included. Profiles are saved in your browser and can be exported/imported as a file. The link carries the profile, so it works anywhere.

Resume and job-description uploads are optional. Each has a **Use a sample** picker (samples live in `public/samples`).

## Good to know

- Scores are a guide, not a decision. Answers where speech recognition was unsure (for example strong accents or noise) are flagged for review and not counted against the candidate.
- If the candidate closes the tab early, a partial result is kept on their device. Reopening the link offers it for download (without video).
- Voice quality depends on the browser. Chrome and Edge work best for voice answers. Safari and Firefox may need typing.
- Wording and the time limit are in `src/config.ts`. An optional in-browser AI model (WebLLM) can be turned on there (`useWebLLM`). It is off by default.

## Develop

```
npm install
npm run dev        # http://localhost:43123
npm test           # unit tests
npm run test:e2e   # browser smoke test (Playwright)
npm run build
```

Pushing to `main` deploys to GitHub Pages.
