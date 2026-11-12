# ReviewPulse PR demo

Copy this folder into the GitHub repo you connected to ReviewPulse, **on a
branch**, then open a pull request. ReviewPulse only reviews **lines the PR
changed**, so if this code is already on `main` the next PR will look empty.

These files look like a small shop API. They contain real defects Gemini should
reason about (IDOR, auth bypass, mass assignment) plus ones Bandit / the secret
scanner will confirm (SQL injection, hardcoded keys, `eval`).

The `sk_live_…` / `AKIA…` strings are **fake fixtures**, not real credentials.

## Push it

From your connected repo (the one with a single `.py` file is fine):

```bash
git checkout -b demo/reviewpulse
cp -R "/Users/agrapujyalashkari/Desktop/Agentic AI Projects/reviewPulse/samples/pr-demo/." .
# remove this README from the copy if you already have one, or keep it
git add app.py accounts.py payments.py admin.py requirements.txt AGENTS.md
git commit -m "Add shop API endpoints"
git push -u origin demo/reviewpulse
```

On GitHub: **Open a pull request** into `main`. Do not mark it as a draft.

## What you should see

1. **Dashboard** (`/dashboard`): a review appears as Queued → Running → Completed,
   with a risk score and a severity bar.
2. **Review page**: findings on the changed lines, some tagged as confirmed by
   Bandit / secret-scanner, some from Gemini only (auth bypass, IDOR).
3. **GitHub PR**: a ReviewPulse review summary plus inline comments on the diff.

If GitHub stays empty, the webhook URL must be
`https://<your-ngrok-host>/api/v1/github/webhook` (the `/api/v1/github/webhook`
path is required).
