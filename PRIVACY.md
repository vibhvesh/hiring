# Privacy

Hiring keeps candidate data on the device that created it. There is no account and no application server.

## What is stored

On the recruiter's browser, IndexedDB holds:

- the role
- parsed CV text
- scores, reports, and transcripts
- video recordings, stored as blobs and loaded only when you watch or download them
- settings, including earlier score-rule versions

On the candidate's browser, the same kinds of records are saved if they open the link there. A result file (zip) is the way those records move to the recruiter.

## Consent

The interview does not start until the candidate checks the consent box. The title, explanation, and checkbox text come from `privacy.consentTitle`, `privacy.consentBody`, and `privacy.consentCheckbox` in `config/hiring.config.json`. Closing the page before that saves nothing.

The screen asks for the camera and microphone. If the camera is blocked, the candidate can continue without video when `recording.allowContinueWithoutCamera` is on. That choice is written on the report as "No video was recorded."

## Retention

`privacy.retentionDays` is how long a screen stays on that browser. The default is 30 days. When `privacy.autoPurge` is on, opening the app deletes older candidates, reports, and videos. **More options → Delete old screens now** does the same thing immediately.

If a candidate leaves and does not come back within `privacy.abandonMinutes` (default 10), the saved progress becomes a partial report.

## Delete and export

- **Delete** on a person removes their CV text, report, transcript, and video from this browser.
- **Delete selected** does that for everyone you have ticked.
- **Export backup** downloads a JSON file of settings, the role, candidates, and reports. Videos are not inside that JSON.
- **Download everything** on a report, and the candidate's **Download the result file**, include the PDF, the transcript, and the video.

## What leaves the device

Nothing is uploaded by default.

These are optional and only run when you fill them in under Settings → More options:

- **Mailto** opens an email draft. It does not send mail by itself and cannot attach the video.
- **EmailJS** (free tier) can send a short note. It does not send the video. You supply your own public key.
- **Webhook** receives the result JSON. The video is never included. The transcript is included only if you turn that on.
- **Google Drive** uploads the result file only after a person signs in with their own Google account, and only if you paste a free OAuth client id. The scope is `drive.file`, which can see files this upload created and not the rest of the Drive.

Speech recognition, the optional on-device model, and optional offline transcription download model files from the public internet (the browser's speech service, or Hugging Face / MLC for the optional models). Candidate answers are not sent to those services by this app. The browser's own speech recognition may use the browser vendor's speech service. That is called out in the README. Typing is always available.

## Fairness

Low confidence from speech recognition is stored on the transcript line and flagged for a person to read. It is not used in the communication score. A confidence of 0, which Chrome often reports when it has no value, is treated as unknown rather than poor.