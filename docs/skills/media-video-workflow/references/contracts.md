# Runtime Contracts

## Run Layout

`prepare-subtitles` and `prepare-comments` create this layout under `--out`:

```text
<run-dir>/
  manifest.json
  input/
  tasks/
```

`manifest.json` owns the workflow state and the expected task IDs and hashes. Do not edit it by hand.

## Task Rows

Tasks are JSONL: one independent JSON object per line. Each row contains:

- `schemaVersion`: currently `1`
- `kind`: `subtitle`, `comment-title`, or `comment`
- `id`: immutable task ID
- `source`: immutable source data
- `sourceHash`: SHA-256 digest of `kind`, `id`, and `source`
- `targetLanguage`: requested target locale
- `translation`: agent-owned translated text
- `status`: set to `completed` when finished

Comment rows additionally require:

```json
{
  "moderation": {
    "decision": "allow",
    "categories": [],
    "confidence": "high",
    "reasonCode": "safe_relevant"
  }
}
```

Use `allow`, `exclude`, or `review` for `decision`; use `high`, `medium`, or `low` for `confidence`.

## State Transitions

```text
awaiting_agent -> validated -> materialized
```

`validate` rejects incomplete, duplicate, unexpected, stale, or source-mutated rows. `materialize-comments` writes only `allow` rows to `comments.safe.json`.

## External Commands

- `download` and `fetch-comments` use local `yt-dlp` and need an explicit URL. When a platform requires authentication, pass a user-exported cookie file with `--cookies <cookies.txt>`; the runtime never reads browser cookies implicitly. YouTube comment collection defaults to 100 records and accepts `--max-comments <positive-integer|all>`.
- `extract-audio` and `render-subtitles` use local `ffmpeg`.
- `asr` only runs when `MEDIAFLOW_ASR_API_URL` and `MEDIAFLOW_ASR_API_KEY` are configured, or an explicit `--api-url` is provided.
- `render-comments` uses the bundled Remotion project inside `runtime/remotion`.
