# Open-Issues Ledger

- [OPEN] Live deployment to Vercel's servers cannot be executed locally without live Vercel credentials and remote deployment trigger (Round: implementer_1)
- [OPEN] Conflicting project-level override settings configured directly in the Vercel Web Dashboard UI (Build & Development Settings) that might override vercel.json (Round: implementer_1)
- [OPEN] Remote deployment execution on Vercel's edge network (requires remote push to connected Vercel repository and Vercel build trigger) (Round: reviewer_r1)
- [OPEN] Potential manual setting overrides in the Vercel Web Dashboard (e.g. if Build & Development Settings in the UI override vercel.json) (Round: reviewer_r1)
- [OPEN] Minor Robustness Risk: If Render spins down the free tier instance after 15 minutes of inactivity, initial cold start request through Vercel reverse proxy may experience a 30-50s latency delay (Round: reviewer_r1)
- [OPEN] Next step is pushing the branch to git to trigger the Vercel static deployment (Round: reviewer_r1)
- [OPEN] Local verification cannot simulate Vercel's remote edge proxy router without an active Vercel deployment token or git push to Vercel (Round: reviewer_r2)
- [OPEN] Render backend free-tier cold start delay (30-50s spin up) on first proxied request after 15 minutes of inactivity (Round: reviewer_r2)
- [OPEN] Potential initial cold-start latency on Neon DB resume during first test run (subsequent warm runs pass 33/33) (Round: reviewer_r3)
